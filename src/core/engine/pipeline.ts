import { join } from 'node:path';

import { z } from 'zod';

import { AdapterRegistry, createDefaultAdapters } from '../../adapters/index.js';
import {
  DEFAULT_CONFIG,
  type ConfigPathOptions,
  ensureConfigDir,
  getAISnitchHomePath,
  resolveAvailablePort,
} from '../config/index.js';
import {
  AISnitchEventSchema,
  AISnitchEventTypeSchema,
  EventDataSchema,
  ToolNameSchema,
  createEvent,
} from '../events/index.js';
import type { AISnitchConfig } from '../config/index.js';
import type { AISnitchEvent, ToolName } from '../events/index.js';
import { resolveSessionId } from '../session-identity.js';
import { ContextDetector, type ProcessContext } from './context-detector.js';
import { EventBus, type EventBusStats } from './event-bus.js';
import {
  HTTPReceiver,
  type HealthSnapshot,
  type HTTPReceiverStats,
} from './http-receiver.js';
import { logger } from './logger.js';
import { UDSServer, type UDSServerStats } from './uds-server.js';
import { WSServer, type WSServerStats } from './ws-server.js';

/**
 * @file src/core/engine/pipeline.ts
 * @description Orchestrates the in-memory AISnitch core pipeline and ingress/egress components.
 * @functions
 *   → getSocketPath
 * @exports HookHandler, PipelineStartOptions, PipelineStatus, Pipeline
 * @see ./event-bus.ts
 * @see ./ws-server.ts
 * @see ./http-receiver.ts
 * @see ./uds-server.ts
 * @see ./context-detector.ts
 */

const HookIngressPayloadSchema = z.strictObject({
  type: AISnitchEventTypeSchema,
  source: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  seqnum: z.number().int().min(1).optional(),
  data: EventDataSchema.partial().optional(),
  pid: z.number().int().positive().optional(),
  transcriptPath: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  env: z.record(z.string(), z.string()).optional(),
  hookPayload: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Hook handler signature for future adapter-specific hook processors.
 */
export type HookHandler = (payload: unknown) => Promise<void> | void;

/**
 * Startup options for the orchestrating pipeline.
 */
export interface PipelineStartOptions {
  readonly config?: AISnitchConfig;
  readonly configPath?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly homeDirectory?: string;
}

/**
 * Snapshot of the full runtime pipeline state.
 */
export interface PipelineStatus {
  readonly running: boolean;
  readonly uptimeMs: number;
  readonly wsPort: number | null;
  readonly httpPort: number | null;
  readonly socketPath: string | null;
  readonly eventBus: EventBusStats;
  readonly websocket: WSServerStats;
  readonly http: HTTPReceiverStats;
  readonly uds: UDSServerStats;
}

/**
 * Returns the platform-specific IPC socket path for the AISnitch daemon.
 */
export function getSocketPath(aisnitchHomePath: string): string {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\aisnitch.sock';
  }

  return join(aisnitchHomePath, 'aisnitch.sock');
}

/**
 * 📖 The pipeline is the real in-process backbone: one EventBus in the middle,
 * ingress on HTTP/UDS, egress on WS, and context enrichment before fan-out.
 */
export class Pipeline {
  private readonly eventBus = new EventBus();

  private readonly wsServer = new WSServer();

  private readonly httpReceiver = new HTTPReceiver();

  private readonly udsServer = new UDSServer();

  private readonly contextDetector = new ContextDetector();

  private adapterRegistry: AdapterRegistry | null = null;

  private enabledTools = new Set<ToolName>();

  private readonly hookHandlers = new Map<ToolName, HookHandler>();

  private startedAt: number | null = null;

  private wsPort: number | null = null;

  private httpPort: number | null = null;

  private socketPath: string | null = null;

  /**
   * Starts the full in-memory core pipeline.
   */
  public async start(options: PipelineStartOptions = {}): Promise<PipelineStatus> {
    if (this.startedAt !== null) {
      return this.getStatus();
    }

    const config = options.config ?? DEFAULT_CONFIG;
    const pathOptions: ConfigPathOptions = {
      configPath: options.configPath,
      env: options.env,
      homeDirectory: options.homeDirectory,
    };

    await ensureConfigDir(pathOptions);

    const resolvedWsPort = await resolveAvailablePort(config.wsPort, {
      logger: (message) => logger.info(message),
    });
    const resolvedHttpPort = await resolveAvailablePort(config.httpPort, {
      logger: (message) => logger.info(message),
    });
    const aisnitchHomePath = getAISnitchHomePath(pathOptions);
    const socketPath = getSocketPath(aisnitchHomePath);
    const activeTools = Object.entries(config.adapters)
      .filter((entry): entry is [ToolName, { enabled: boolean }] => {
        const [toolName, adapterConfig] = entry;
        return (
          ToolNameSchema.safeParse(toolName).success &&
          adapterConfig?.enabled === true
        );
      })
      .map(([toolName]) => toolName);
    const adapterRegistry = new AdapterRegistry();

    for (const adapter of createDefaultAdapters({
      config,
      env: options.env,
      homeDirectory: options.homeDirectory,
      publishEvent: async (event, context) => {
        return await this.publishEvent(event, context);
      },
    })) {
      adapterRegistry.register(adapter);
    }

    this.adapterRegistry = adapterRegistry;
    this.enabledTools = new Set(activeTools);
    this.hookHandlers.clear();

    for (const toolName of activeTools) {
      const adapter = this.adapterRegistry.get(toolName);

      if (!adapter) {
        continue;
      }

      this.registerHookHandler(toolName, async (payload) => {
        await adapter.handleHook(payload);
      });
    }

    this.startedAt = Date.now();

    this.wsPort = await this.wsServer.start({
      port: resolvedWsPort,
      eventBus: this.eventBus,
      activeTools,
    });
    this.httpPort = await this.httpReceiver.start({
      port: resolvedHttpPort,
      onHook: async (tool, payload) => {
        await this.handleHook(tool, payload);
      },
      getHealthSnapshot: () => this.getHealthSnapshot(),
    });
    this.socketPath = await this.udsServer.start({
      socketPath,
      onEvent: async (event) => {
        await this.publishEvent(event);
      },
    });
    await this.adapterRegistry.startAll(config);

    logger.info(this.getStatus(), 'Core pipeline started');

    return this.getStatus();
  }

  /**
   * Stops every pipeline component in reverse dependency order.
   */
  public async stop(): Promise<void> {
    await this.adapterRegistry?.stopAll();
    await this.httpReceiver.stop();
    await this.udsServer.stop();
    await this.wsServer.stop();

    this.eventBus.unsubscribeAll();
    this.adapterRegistry = null;
    this.enabledTools.clear();
    this.hookHandlers.clear();

    this.startedAt = null;
    this.wsPort = null;
    this.httpPort = null;
    this.socketPath = null;

    logger.info('Core pipeline stopped');
  }

  /**
   * Registers a future adapter-specific hook handler for one tool.
   */
  public registerHookHandler(tool: ToolName, handler: HookHandler): void {
    this.hookHandlers.set(tool, handler);
  }

  /**
   * Publishes an event after best-effort context enrichment.
   */
  public async publishEvent(
    event: AISnitchEvent,
    context: ProcessContext = {},
  ): Promise<boolean> {
    const enrichedEvent = await this.contextDetector.enrich(event, context);

    return this.eventBus.publish(enrichedEvent);
  }

  /**
   * Exposes current pipeline state for tests, health checks, and future status commands.
   */
  public getStatus(): PipelineStatus {
    return {
      running: this.startedAt !== null,
      uptimeMs: this.startedAt === null ? 0 : Date.now() - this.startedAt,
      wsPort: this.wsPort,
      httpPort: this.httpPort,
      socketPath: this.socketPath,
      eventBus: this.eventBus.getStats(),
      websocket: this.wsServer.getStats(),
      http: this.httpReceiver.getStats(),
      uds: this.udsServer.getStats(),
    };
  }

  /**
   * Returns the in-process event bus for direct wiring in tests or future TUI code.
   */
  public getEventBus(): EventBus {
    return this.eventBus;
  }

  private getHealthSnapshot(): HealthSnapshot {
    const status = this.getStatus();

    return {
      status: 'ok',
      uptime: status.uptimeMs,
      consumers: status.websocket.consumerCount,
      events: status.eventBus.publishedEvents,
      droppedEvents: status.websocket.droppedEvents,
    };
  }

  private async handleHook(tool: ToolName, payload: unknown): Promise<void> {
    if (!this.enabledTools.has(tool)) {
      logger.debug({ tool }, 'Ignoring hook for disabled tool');
      return;
    }

    const registeredHandler = this.hookHandlers.get(tool);

    if (registeredHandler) {
      await registeredHandler(payload);
      return;
    }

    const alreadyNormalizedEvent = AISnitchEventSchema.safeParse(payload);

    if (alreadyNormalizedEvent.success) {
      await this.publishEvent(alreadyNormalizedEvent.data);
      return;
    }

    const normalizedHook = HookIngressPayloadSchema.safeParse(payload);

    if (!normalizedHook.success) {
      logger.warn(
        {
          tool,
          issues: normalizedHook.error.issues,
        },
        'Unable to normalize hook payload',
      );
      return;
    }

    const resolvedSessionId = resolveSessionId({
      activeFile: normalizedHook.data.data?.activeFile,
      cwd: normalizedHook.data.data?.cwd ?? normalizedHook.data.cwd,
      pid: normalizedHook.data.pid,
      project: normalizedHook.data.data?.project,
      projectPath: normalizedHook.data.data?.projectPath,
      sessionId: normalizedHook.data.sessionId,
      tool,
      transcriptPath: normalizedHook.data.transcriptPath,
    });
    const event = createEvent({
      source: normalizedHook.data.source ?? `aisnitch://hooks/${tool}`,
      type: normalizedHook.data.type,
      'aisnitch.tool': tool,
      'aisnitch.sessionid': resolvedSessionId,
      'aisnitch.seqnum': normalizedHook.data.seqnum ?? 1,
      data: {
        ...normalizedHook.data.data,
        cwd:
          normalizedHook.data.data?.cwd ??
          normalizedHook.data.cwd,
      },
    });

    await this.publishEvent(event, {
      pid: normalizedHook.data.pid,
      env: normalizedHook.data.env,
      sessionId: resolvedSessionId,
      transcriptPath: normalizedHook.data.transcriptPath,
      hookPayload:
        normalizedHook.data.hookPayload ??
        (this.isPlainRecord(payload) ? payload : undefined),
    });
  }

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
