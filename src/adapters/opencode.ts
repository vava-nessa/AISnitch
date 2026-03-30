import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import { logger } from '../core/engine/logger.js';
import { resolveSessionId } from '../core/session-identity.js';
import type { ErrorType, EventData, ToolInput } from '../core/events/types.js';
import {
  type AdapterPublishContext,
  type AdapterRuntimeOptions,
  BaseAdapter,
  type InterceptionStrategy,
} from './base.js';

/**
 * @file src/adapters/opencode.ts
 * @description OpenCode adapter centered on the official plugin system plus process fallback detection.
 * @functions
 *   → none
 * @exports OpenCodeAdapter, OpenCodeAdapterOptions
 * @see ./base.ts
 * @see ../cli/commands/setup.ts
 * @see ../../tasks/04-adapters-priority/03_adapters-priority_opencode.md
 */

const execFile = promisify(execFileCallback);

const OPENCODE_CODING_TOOLS = new Set(['edit', 'multi_edit', 'write']);

/**
 * OpenCode officially documents plugin hooks and ACP subprocess support.
 * The plugin path is the stable passive-observer option for AISnitch today;
 * ACP is interactive editor transport, not a passive tap into a running TUI.
 */
export interface OpenCodeAdapterOptions extends AdapterRuntimeOptions {
  readonly pollIntervalMs?: number;
  readonly processListCommand?: () => Promise<string>;
}

interface ProcessInfo {
  readonly command: string;
  readonly pid: number;
}

/**
 * 📖 The setup command already installs an OpenCode plugin that forwards
 * events over HTTP, so this adapter mostly focuses on mapping that stream
 * cleanly and falling back to process detection when setup was skipped.
 */
export class OpenCodeAdapter extends BaseAdapter {
  public override readonly displayName = 'OpenCode';

  public override readonly name = 'opencode' as const;

  public override readonly strategies: readonly InterceptionStrategy[] = [
    'hooks',
    'process-detect',
  ];

  private fallbackProcessSessionId: string | null = null;

  private readonly pollIntervalMs: number;

  private processPoller: NodeJS.Timeout | null = null;

  private readonly processListCommand: () => Promise<string>;

  public constructor(options: OpenCodeAdapterOptions) {
    super(options);
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.processListCommand =
      options.processListCommand ?? (async () => await execFile('pgrep', ['-lf', 'opencode']).then((result) => result.stdout));
  }

  public override start(): Promise<void> {
    if (this.getStatus().running) {
      return Promise.resolve();
    }

    this.setRunning(true);
    this.startProcessPolling();

    return Promise.resolve();
  }

  public override stop(): Promise<void> {
    if (this.processPoller !== null) {
      clearInterval(this.processPoller);
      this.processPoller = null;
    }

    this.fallbackProcessSessionId = null;
    this.setRunning(false);

    return Promise.resolve();
  }

  public override async handleHook(payload: unknown): Promise<void> {
    const normalizedPayload = this.parseNormalizedHookPayload(payload);

    if (normalizedPayload !== null) {
      await this.emitNormalizedPayload({
        ...normalizedPayload,
        sessionId: resolveSessionId({
          activeFile: normalizedPayload.data?.activeFile,
          cwd: normalizedPayload.data?.cwd ?? normalizedPayload.cwd,
          pid: normalizedPayload.pid,
          project: normalizedPayload.data?.project,
          projectPath: normalizedPayload.data?.projectPath,
          sessionId: normalizedPayload.sessionId,
          tool: this.name,
        }),
      });
      return;
    }

    if (!isRecord(payload)) {
      logger.warn({ payload }, 'OpenCode payload must be an object');
      return;
    }

    const eventType = getString(payload, 'type');

    if (!eventType) {
      logger.warn({ payload }, 'OpenCode payload is missing its event type');
      return;
    }

    const sessionId = resolveSessionId({
      activeFile: extractOpenCodeActiveFile(payload),
      cwd: extractOpenCodeCwd(payload),
      pid: getNumber(payload, 'pid'),
      project: extractOpenCodeProject(payload),
      sessionId: extractOpenCodeSessionId(payload),
      tool: this.name,
    });
    const context: AdapterPublishContext = {
      cwd: extractOpenCodeCwd(payload),
      // 📖 Pass process.env so the context detector can detect the terminal
      env: this.env ?? process.env,
      hookPayload: payload,
      pid: getNumber(payload, 'pid'),
      sessionId,
      source: 'aisnitch://adapters/opencode',
    };
    const sharedData = {
      activeFile: extractOpenCodeActiveFile(payload),
      cwd: context.cwd,
      errorMessage: extractOpenCodeErrorMessage(payload),
      errorType: extractOpenCodeErrorType(payload),
      // 📖 Extract model from payload — OpenCode may send it as "model" or nested in properties
      model: getString(payload, 'model') ?? getString(getRecord(payload.properties), 'model'),
      project: extractOpenCodeProject(payload),
      raw: payload,
      toolInput: extractOpenCodeToolInput(payload),
      toolName: extractOpenCodeToolName(payload),
    } satisfies Omit<EventData, 'state'>;

    switch (eventType) {
      case 'session.created': {
        this.fallbackProcessSessionId = null;
        await this.emitStateChange('session.start', sharedData, context);
        await this.emitStateChange('agent.idle', sharedData, context);
        return;
      }
      case 'session.deleted': {
        await this.emitStateChange('session.end', sharedData, context);
        return;
      }
      case 'session.error': {
        await this.emitStateChange('agent.error', sharedData, context);
        return;
      }
      case 'session.idle': {
        await this.emitStateChange('agent.idle', sharedData, context);
        return;
      }
      case 'session.compacted': {
        await this.emitStateChange('agent.compact', sharedData, context);
        return;
      }
      case 'message.updated':
      case 'message.part.updated': {
        await this.emitStateChange('agent.streaming', sharedData, context);
        return;
      }
      case 'permission.asked': {
        await this.emitStateChange('agent.asking_user', sharedData, context);
        return;
      }
      case 'tool.execute.before': {
        await this.emitStateChange('agent.tool_call', sharedData, context);
        return;
      }
      case 'tool.execute.after': {
        const emittedType = isOpenCodeCodingTool(sharedData.toolName)
          ? 'agent.coding'
          : 'agent.tool_call';
        await this.emitStateChange(emittedType, sharedData, context);
        return;
      }
      default: {
        logger.debug({ eventType }, 'OpenCode event ignored by adapter');
      }
    }
  }

  private startProcessPolling(): void {
    if (this.pollIntervalMs <= 0) {
      return;
    }

    this.processPoller = setInterval(() => {
      void this.pollOpenCodeProcesses();
    }, this.pollIntervalMs);
    this.processPoller.unref();

    void this.pollOpenCodeProcesses();
  }

  private async pollOpenCodeProcesses(): Promise<void> {
    const processes = await listProcesses(this.processListCommand);

    if (processes.length > 0 && this.getStatus().activeSessions === 0) {
      const processInfo = processes[0];

      if (!processInfo) {
        return;
      }

      const sessionId = `opencode-process-${processInfo.pid}`;

      this.fallbackProcessSessionId = sessionId;
      await this.emitStateChange(
        'session.start',
        {
          raw: {
            process: processInfo,
            source: 'process-detect',
          },
        },
        {
          pid: processInfo.pid,
          sessionId,
          source: 'aisnitch://adapters/opencode/process-detect',
        },
      );
      return;
    }

    if (processes.length === 0 && this.fallbackProcessSessionId !== null) {
      const sessionId = this.fallbackProcessSessionId;

      this.fallbackProcessSessionId = null;
      await this.emitStateChange(
        'session.end',
        {
          raw: {
            reason: 'process-exit',
            source: 'process-detect',
          },
        },
        {
          sessionId,
          source: 'aisnitch://adapters/opencode/process-detect',
        },
      );
    }
  }
}

async function listProcesses(
  listCommand: () => Promise<string>,
): Promise<ProcessInfo[]> {
  if (process.platform === 'win32') {
    return [];
  }

  try {
    const stdout = await listCommand();

    return stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const match = line.match(/^(\d+)\s+(.+)$/u);

        if (!match) {
          return null;
        }

        const pidText = match[1];
        const command = match[2];

        if (!pidText || !command) {
          return null;
        }

        return {
          command,
          pid: Number.parseInt(pidText, 10),
        } satisfies ProcessInfo;
      })
      .filter((processInfo): processInfo is ProcessInfo => processInfo !== null);
  } catch (error) {
    const errorCode =
      error instanceof Error && 'code' in error ? String(error.code) : '';

    if (
      error instanceof Error &&
      'code' in error &&
      (errorCode === 'ENOENT' || errorCode === '1')
    ) {
      return [];
    }

    logger.debug({ error }, 'OpenCode process detection failed');
    return [];
  }
}

function extractOpenCodeSessionId(
  payload: Record<string, unknown>,
): string | undefined {
  const directSessionId =
    getString(payload, 'sessionID') ??
    getString(payload, 'sessionId');

  if (directSessionId) {
    return directSessionId;
  }

  const properties = getRecord(payload.properties);

  return getString(properties, 'sessionID') ?? getString(properties, 'sessionId');
}

function extractOpenCodeCwd(
  payload: Record<string, unknown>,
): string | undefined {
  return (
    getString(payload, 'cwd') ??
    getString(getRecord(payload.properties), 'cwd')
  );
}

function extractOpenCodeProject(
  payload: Record<string, unknown>,
): string | undefined {
  return (
    getString(payload, 'project') ??
    getString(getRecord(payload.properties), 'project')
  );
}

function extractOpenCodeToolName(
  payload: Record<string, unknown>,
): string | undefined {
  const tool = getRecord(payload.tool);

  return getString(tool, 'name') ?? getString(payload, 'tool');
}

function extractOpenCodeActiveFile(
  payload: Record<string, unknown>,
): string | undefined {
  return (
    getString(payload, 'file') ??
    getString(getRecord(payload.properties), 'file') ??
    extractOpenCodeToolInput(payload)?.filePath
  );
}

function extractOpenCodeToolInput(
  payload: Record<string, unknown>,
): ToolInput | undefined {
  const args =
    getRecord(payload.args) ??
    getRecord(getRecord(payload.output)?.args) ??
    getRecord(getRecord(payload.properties)?.args);

  if (!args) {
    return undefined;
  }

  const command =
    getString(args, 'command') ??
    getString(args, 'cmd');
  const filePath =
    getString(args, 'filePath') ??
    getString(args, 'file_path') ??
    getString(args, 'path');

  if (!command && !filePath) {
    return undefined;
  }

  return {
    command,
    filePath,
  };
}

function extractOpenCodeErrorMessage(
  payload: Record<string, unknown>,
): string | undefined {
  return (
    getString(getRecord(payload.error), 'message') ??
    getString(payload, 'message')
  );
}

function extractOpenCodeErrorType(
  payload: Record<string, unknown>,
): ErrorType | undefined {
  const rawType =
    getString(payload, 'errorType') ??
    getString(getRecord(payload.error), 'type');

  switch (rawType) {
    case 'rate_limit':
      return 'rate_limit';
    case 'context_overflow':
      return 'context_overflow';
    case 'tool_failure':
      return 'tool_failure';
    case 'api_error':
    case 'provider_error':
      return 'api_error';
    default:
      return undefined;
  }
}

function isOpenCodeCodingTool(toolName?: string): boolean {
  return toolName !== undefined && OPENCODE_CODING_TOOLS.has(toolName);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function getNumber(
  payload: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = payload[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getString(
  payload: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (!payload) {
    return undefined;
  }

  const value = payload[key];

  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
