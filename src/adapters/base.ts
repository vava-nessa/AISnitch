import { homedir } from 'node:os';

import { z } from 'zod';

import type { AISnitchConfig } from '../core/config/schema.js';
import { createEvent } from '../core/events/factory.js';
import { EventDataSchema, createUuidV7 } from '../core/events/schema.js';
import type {
  AISnitchEvent,
  AISnitchEventType,
  EventData,
  ToolName,
} from '../core/events/types.js';

/**
 * @file src/adapters/base.ts
 * @description Shared adapter primitives for lifecycle management, normalized event emission, and idle/session tracking.
 * @functions
 *   → none
 * @exports InterceptionStrategy, AdapterPublishContext, AdapterRuntimeOptions, AdapterStatus, NormalizedAdapterHookPayload, BaseAdapter
 * @see ./registry.ts
 * @see ./claude-code.ts
 * @see ./opencode.ts
 */

const NormalizedAdapterHookPayloadSchema = z.strictObject({
  type: z.string().min(1),
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
 * Capture strategies supported by built-in and future community adapters.
 */
export type InterceptionStrategy =
  | 'hooks'
  | 'jsonl-watch'
  | 'log-watch'
  | 'sqlite-watch'
  | 'stream-json'
  | 'process-detect'
  | 'pty-wrap'
  | 'api-client';

/**
 * Extra context that adapters can provide alongside emitted events.
 */
export interface AdapterPublishContext {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly hookPayload?: Record<string, unknown>;
  readonly pid?: number;
  readonly sessionId?: string;
  readonly source?: string;
  readonly transcriptPath?: string;
}

/**
 * Dependency injection contract shared by all adapters.
 */
export interface AdapterRuntimeOptions {
  readonly config: AISnitchConfig;
  readonly env?: NodeJS.ProcessEnv;
  readonly homeDirectory?: string;
  readonly publishEvent: (
    event: AISnitchEvent,
    context?: AdapterPublishContext,
  ) => Promise<boolean>;
}

/**
 * Observable adapter runtime state exposed to the registry and CLI.
 */
export interface AdapterStatus {
  readonly activeSessions: number;
  readonly displayName: string;
  readonly eventsEmitted: number;
  readonly name: ToolName;
  readonly running: boolean;
  readonly strategies: readonly InterceptionStrategy[];
}

/**
 * Best-effort normalized payload shape accepted from hook/plugin bridges.
 */
export type NormalizedAdapterHookPayload = z.infer<
  typeof NormalizedAdapterHookPayloadSchema
>;

/**
 * 📖 Every concrete adapter gets the same boring-but-essential plumbing here:
 * session ids, sequence numbers, idle timers, and validated event emission.
 */
export abstract class BaseAdapter {
  public abstract readonly displayName: string;

  public abstract readonly name: ToolName;

  public abstract readonly strategies: readonly InterceptionStrategy[];

  protected currentSessionId: string | null = null;

  protected readonly env: NodeJS.ProcessEnv | undefined;

  protected readonly homeDirectory: string;

  protected sequenceNumber = 0;

  private readonly activeSessions = new Set<string>();

  private eventsEmitted = 0;

  private idleTimer: NodeJS.Timeout | null = null;

  private readonly idleTimeoutMs: number;

  private readonly publishEventImplementation: AdapterRuntimeOptions['publishEvent'];

  private running = false;

  protected constructor(options: AdapterRuntimeOptions) {
    this.env = options.env;
    this.homeDirectory = options.homeDirectory ?? homedir();
    this.idleTimeoutMs = options.config.idleTimeoutMs;
    this.publishEventImplementation = options.publishEvent;
  }

  /**
   * Starts the adapter-specific watchers, pollers, or hook bridges.
   */
  public abstract start(): Promise<void>;

  /**
   * Stops adapter-specific resources and clears runtime state.
   */
  public abstract stop(): Promise<void>;

  /**
   * Hook-based adapters override this to transform tool-native payloads.
   */
  public handleHook(_payload: unknown): Promise<void> {
    return Promise.reject(
      new Error(`${this.name} does not support hook payloads.`),
    );
  }

  /**
   * Returns the current observable adapter status snapshot.
   */
  public getStatus(): AdapterStatus {
    return {
      activeSessions: this.activeSessions.size,
      displayName: this.displayName,
      eventsEmitted: this.eventsEmitted,
      name: this.name,
      running: this.running,
      strategies: this.strategies,
    };
  }

  /**
   * Accepts the normalized hook payload shape used by setup-installed bridges.
   */
  protected parseNormalizedHookPayload(
    payload: unknown,
  ): NormalizedAdapterHookPayload | null {
    const parsedPayload = NormalizedAdapterHookPayloadSchema.safeParse(payload);

    if (!parsedPayload.success) {
      return null;
    }

    return parsedPayload.data;
  }

  /**
   * Emits one already-normalized payload through the common adapter lifecycle.
   */
  protected async emitNormalizedPayload(
    payload: NormalizedAdapterHookPayload,
  ): Promise<boolean> {
    return await this.emit(payload.type as AISnitchEventType, payload.data, {
      cwd: payload.cwd,
      env: payload.env,
      hookPayload: payload.hookPayload,
      pid: payload.pid,
      sessionId: payload.sessionId,
      source: payload.source,
      transcriptPath: payload.transcriptPath,
    });
  }

  /**
   * Emits a fully normalized AISnitch event and updates idle/session tracking.
   */
  protected async emit(
    type: AISnitchEventType,
    data: Omit<EventData, 'state'> = {},
    context: AdapterPublishContext = {},
  ): Promise<boolean> {
    const sessionId = this.resolveSessionId(context.sessionId);

    this.sequenceNumber += 1;

    const event = createEvent({
      source: context.source ?? `aisnitch://adapters/${this.name}`,
      type,
      'aisnitch.tool': this.name,
      'aisnitch.sessionid': sessionId,
      'aisnitch.seqnum': this.sequenceNumber,
      data: {
        ...data,
        cwd: data.cwd ?? context.cwd,
      },
    });

    const published = await this.publishEventImplementation(event, {
      cwd: context.cwd,
      env: context.env,
      hookPayload: context.hookPayload,
      pid: context.pid,
      sessionId,
      source: context.source,
      transcriptPath: context.transcriptPath,
    });

    if (published) {
      this.eventsEmitted += 1;
    }

    if (type === 'session.end') {
      this.activeSessions.delete(sessionId);

      if (this.currentSessionId === sessionId) {
        this.currentSessionId = null;
      }

      this.clearIdleTimer();

      return published;
    }

    if (type !== 'agent.idle') {
      this.resetIdleTimer();
    }

    return published;
  }

  /**
   * Shortcut for emitting a plain state transition without extra boilerplate.
   */
  protected async emitStateChange(
    type: AISnitchEventType,
    data: Omit<EventData, 'state'> = {},
    context: AdapterPublishContext = {},
  ): Promise<boolean> {
    return await this.emit(type, data, context);
  }

  /**
   * Updates the active session id while keeping sequence numbers monotonic per session.
   */
  protected setSessionId(sessionId: string | null): void {
    if (sessionId === null) {
      this.currentSessionId = null;
      this.clearIdleTimer();
      return;
    }

    if (this.currentSessionId !== sessionId) {
      this.sequenceNumber = 0;
    }

    this.currentSessionId = sessionId;
    this.activeSessions.add(sessionId);
  }

  /**
   * Marks the adapter runtime as active or stopped.
   */
  protected setRunning(running: boolean): void {
    this.running = running;

    if (!running) {
      this.clearIdleTimer();
      this.currentSessionId = null;
      this.sequenceNumber = 0;
      this.activeSessions.clear();
    }
  }

  /**
   * Shared helper for adapters that need a stable testable home directory.
   */
  protected getUserHomeDirectory(): string {
    return this.homeDirectory;
  }

  private clearIdleTimer(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private resetIdleTimer(): void {
    if (!this.running || this.currentSessionId === null) {
      return;
    }

    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      if (this.currentSessionId === null) {
        return;
      }

      void this.emitStateChange('agent.idle');
    }, this.idleTimeoutMs);
    this.idleTimer.unref();
  }

  private resolveSessionId(sessionId?: string): string {
    if (sessionId !== undefined) {
      this.setSessionId(sessionId);

      return sessionId;
    }

    if (this.currentSessionId === null) {
      this.setSessionId(`${this.name}:${createUuidV7()}`);
    }

    if (this.currentSessionId === null) {
      throw new Error(`Adapter "${this.name}" failed to resolve a session id.`);
    }

    return this.currentSessionId;
  }
}
