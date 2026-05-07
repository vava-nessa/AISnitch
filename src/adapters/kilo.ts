import { execFile as execFileCallback } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';

import { watch, type FSWatcher } from 'chokidar';

import { logger } from '../core/engine/logger.js';
import { resolveSessionId } from '../core/session-identity.js';
import type {
  ErrorType,
  EventData,
  ToolInput,
} from '../core/events/types.js';
import {
  type AdapterPublishContext,
  type AdapterRuntimeOptions,
  BaseAdapter,
  type InterceptionStrategy,
} from './base.js';

/**
 * @file src/adapters/kilo.ts
 * @description Kilo CLI adapter covering process detection, ACP protocol integration,
 * and local data directory watching for the open-source Kilo Code agent.
 * @functions
 *   → none
 * @exports KiloAdapter, KiloAdapterOptions
 * @see ./base.ts
 * @see ../../docs/priority-adapters.md
 *
 * 📖 Kilo is an open-source AI coding agent (10k+ stars on GitHub) that works with
 * VS Code, JetBrains, and as a standalone CLI. It ships an ACP (Agent Communication
 * Protocol) similar to OpenCode's, plus writes logs to ~/.config/kilo/ and
 * ~/.local/share/kilo/. Interception: process-detect primary, ACP plugin fallback.
 */

const execFile = promisify(execFileCallback);

const KILO_CODING_TOOLS = new Set([
  'Edit',
  'Write',
  'MultiEdit',
  'Create',
  'Delete',
  'Move',
  'ApplyDiff',
]);

export interface KiloAdapterOptions extends AdapterRuntimeOptions {
  readonly pollIntervalMs?: number;
  readonly processListCommand?: () => Promise<string>;
  readonly configDirectory?: string;
  readonly dataDirectory?: string;
  readonly watcherFactory?: (
    paths: string,
    options: Parameters<typeof watch>[1],
  ) => FSWatcher;
}

interface KiloProcessInfo {
  readonly command: string;
  readonly pid: number;
}

interface KiloSessionMetadata {
  readonly cwd?: string;
  readonly model?: string;
  readonly sessionId: string;
}

/**
 * 📖 Kilo uses an ACP protocol with JSON-RPC messages over stdin/stdout. The adapter
 * detects running processes and watches for session data files. When hooks are
 * available via the Kilo config, they are parsed as structured events.
 */
export class KiloAdapter extends BaseAdapter {
  public override readonly displayName = 'Kilo CLI';

  public override readonly name = 'kilo' as const;

  public override readonly strategies: readonly InterceptionStrategy[] = [
    'process-detect',
    'jsonl-watch',
    'hooks',
  ];

  private fallbackProcessSessionId: string | null = null;

  private readonly configDirectory: string;

  private readonly dataDirectory: string;

  private readonly pollIntervalMs: number;

  private processPoller: NodeJS.Timeout | null = null;

  private readonly processListCommand: () => Promise<string>;

  private readonly sessionMetadata = new Map<string, KiloSessionMetadata>();

  private readonly transcriptOffsets = new Map<string, number>();

  private readonly transcriptRemainders = new Map<string, string>();

  private watcher: FSWatcher | null = null;

  private readonly watcherFactory: (
    paths: string,
    options: Parameters<typeof watch>[1],
  ) => FSWatcher;

  public constructor(options: KiloAdapterOptions) {
    super(options);
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.processListCommand =
      options.processListCommand ??
      (async () => {
        const results = await Promise.all([
          execFile('pgrep', ['-lf', 'kilo']).catch(() => ({ stdout: '' })),
          execFile('pgrep', ['-lf', 'kilocode']).catch(() => ({ stdout: '' })),
          execFile('pgrep', ['-lf', 'kilocode']).catch(() => ({ stdout: '' })),
        ]);
        return results.map((r) => r.stdout).join('\n');
      });
    this.configDirectory =
      options.configDirectory ?? join(this.getUserHomeDirectory(), '.config', 'kilo');
    this.dataDirectory =
      options.dataDirectory ?? join(this.getUserHomeDirectory(), '.local', 'share', 'kilo');
    this.watcherFactory = options.watcherFactory ?? watch;
  }

  public override async start(): Promise<void> {
    if (this.getStatus().running) {
      return;
    }

    this.setRunning(true);
    await this.seedTranscriptOffsets();

    // Watch for Kilo session logs (additional patterns available for future expansion)
    const _logPatterns = [
      join(this.dataDirectory, '**', '*.jsonl'),
      join(this.configDirectory, 'logs', '**', '*.jsonl'),
    ];

    // Watch primary log directory
    this.watcher = this.watcherFactory(join(this.dataDirectory, '**', '*.jsonl'), {
      awaitWriteFinish: { stabilityThreshold: 200 },
      ignoreInitial: true,
    });

    this.watcher.on('add', (filePath) => void this.processTranscriptUpdate(filePath, true));
    this.watcher.on('change', (filePath) => void this.processTranscriptUpdate(filePath, false));
    this.watcher.on('error', (error) => {
      logger.warn({ error }, 'Kilo log watcher error');
    });

    this.startProcessPolling();
  }

  public override async stop(): Promise<void> {
    if (this.watcher !== null) {
      await this.watcher.close();
      this.watcher = null;
    }

    if (this.processPoller !== null) {
      clearInterval(this.processPoller);
      this.processPoller = null;
    }

    this.fallbackProcessSessionId = null;
    this.sessionMetadata.clear();
    this.transcriptOffsets.clear();
    this.transcriptRemainders.clear();
    this.setRunning(false);
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
          transcriptPath: normalizedPayload.transcriptPath,
        }),
      });
      return;
    }

    if (!isRecord(payload)) {
      logger.warn({ payload }, 'Kilo hook payload must be an object');
      return;
    }

    const sessionId = resolveSessionId({
      cwd: getString(payload, 'cwd'),
      pid: getNumber(payload, 'pid'),
      projectPath: getString(payload, 'projectPath'),
      sessionId:
        getString(payload, 'sessionId') ??
        getString(payload, 'session_id') ??
        getString(getRecord(payload.data), 'sessionId'),
      tool: this.name,
    });
    const context: AdapterPublishContext = {
      cwd: getString(payload, 'cwd'),
      env: this.env ?? process.env,
      hookPayload: payload,
      pid: getNumber(payload, 'pid'),
      sessionId,
      source: 'aisnitch://adapters/kilo',
    };
    const eventType = getString(payload, 'event') ?? getString(payload, 'type') ?? getString(payload, 'method');
    const data = getRecord(payload.data) ?? payload;
    const toolName = getString(data, 'tool') ?? getString(data, 'toolName') ?? getString(data, 'name');
    const toolInput = extractToolInput(data);
    const sharedData = {
      activeFile: toolInput?.filePath,
      cwd: context.cwd,
      model: getString(data, 'model') ?? getString(payload, 'model'),
      projectPath: getString(data, 'projectPath') ?? getString(payload, 'projectPath'),
      raw: payload,
      toolInput,
      toolName,
    } satisfies Omit<EventData, 'state'>;

    switch (eventType) {
      case 'session.start':
      case 'sessionStart':
      case 'SessionStart': {
        await this.emitStateChange('session.start', sharedData, context);
        await this.emitStateChange('agent.idle', sharedData, context);
        return;
      }
      case 'session.end':
      case 'sessionEnd':
      case 'SessionEnd': {
        await this.emitStateChange('session.end', sharedData, context);
        return;
      }
      case 'task.start':
      case 'taskStart':
      case 'UserPrompt':
      case 'user_message': {
        await this.emitStateChange('task.start', sharedData, context);
        return;
      }
      case 'task.complete':
      case 'taskComplete':
      case 'TaskComplete': {
        await this.emitStateChange('task.complete', sharedData, context);
        await this.emitStateChange('agent.idle', sharedData, context);
        return;
      }
      case 'tool.call':
      case 'toolCall':
      case 'PreToolUse': {
        await this.emitStateChange('agent.tool_call', sharedData, context);
        return;
      }
      case 'tool.result':
      case 'toolResult':
      case 'PostToolUse': {
        const emittedType = isKiloCodingTool(toolName) ? 'agent.coding' : 'agent.tool_call';
        await this.emitStateChange(emittedType, sharedData, context);
        return;
      }
      case 'thinking':
      case 'Thinking':
      case 'reasoning': {
        await this.emitStateChange('agent.thinking', sharedData, context);
        return;
      }
      case 'streaming':
      case 'Streaming':
      case 'assistant_message': {
        await this.emitStateChange('agent.streaming', sharedData, context);
        return;
      }
      case 'error':
      case 'Error': {
        await this.emitStateChange('agent.error', {
          ...sharedData,
          errorMessage: getString(data, 'error') ?? getString(payload, 'error') ?? 'Kilo error',
          errorType: inferKiloErrorType(data),
        }, context);
        return;
      }
      case 'asking_user':
      case 'PermissionRequest':
      case 'input_required': {
        await this.emitStateChange('agent.asking_user', sharedData, context);
        return;
      }
      default:
        logger.debug({ eventType }, 'Kilo hook event ignored by adapter');
    }
  }

  private async processTranscriptUpdate(
    filePath: string,
    readFromStart: boolean,
  ): Promise<void> {
    let fileContent: Buffer;

    try {
      fileContent = await readFile(filePath);
    } catch (error) {
      logger.debug({ error, filePath }, 'Kilo transcript read skipped');
      return;
    }

    const knownOffset = this.transcriptOffsets.get(filePath);
    const previousOffset =
      knownOffset ?? (readFromStart ? 0 : fileContent.byteLength);
    const safeOffset =
      previousOffset > fileContent.byteLength ? 0 : previousOffset;
    const newChunk = fileContent.subarray(safeOffset).toString('utf8');
    const bufferedChunk =
      (safeOffset === 0 ? '' : this.transcriptRemainders.get(filePath) ?? '') + newChunk;
    const lines = bufferedChunk.split(/\r?\n/u);
    const remainder =
      bufferedChunk.endsWith('\n') || bufferedChunk.endsWith('\r')
        ? ''
        : (lines.pop() ?? '');

    this.transcriptOffsets.set(filePath, fileContent.byteLength);
    this.transcriptRemainders.set(filePath, remainder);

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.length === 0) {
        continue;
      }

      await this.processTranscriptLine(trimmedLine, filePath);
    }
  }

  private async processTranscriptLine(
    line: string,
    transcriptPath: string,
  ): Promise<void> {
    let parsedLine: unknown;

    try {
      parsedLine = JSON.parse(line) as unknown;
    } catch (error) {
      logger.warn({ error, transcriptPath }, 'Kilo transcript line is not valid JSON');
      return;
    }

    if (!isRecord(parsedLine)) {
      return;
    }

    // ACP protocol format: messages have type, id, session, data fields
    const acpType = getString(parsedLine, 'type') ?? getString(parsedLine, 'method');
    const sessionId = resolveSessionId({
      sessionId:
        getString(parsedLine, 'sessionId') ??
        getString(parsedLine, 'session_id') ??
        getString(parsedLine, 'id') ??
        basename(transcriptPath, '.jsonl'),
      tool: this.name,
      transcriptPath,
    });
    const context: AdapterPublishContext = {
      env: process.env,
      hookPayload: parsedLine,
      sessionId,
      source: 'aisnitch://adapters/kilo/log',
      transcriptPath,
    };
    const data = getRecord(parsedLine.data) ?? parsedLine;
    const toolName = getString(data, 'tool') ?? getString(data, 'toolName');
    const toolInput = extractToolInput(data);
    const sharedData = {
      activeFile: toolInput?.filePath,
      cwd: getString(data, 'cwd'),
      model: getString(data, 'model'),
      raw: parsedLine,
      toolInput,
      toolName,
    } satisfies Omit<EventData, 'state'>;

    // Map Kilo/ACP message types to AISnitch events
    switch (acpType) {
      case 'session.start':
      case 'SessionStart': {
        await this.emitStateChange('session.start', sharedData, context);
        await this.emitStateChange('agent.idle', sharedData, context);
        return;
      }
      case 'session.end':
      case 'SessionEnd': {
        await this.emitStateChange('session.end', sharedData, context);
        return;
      }
      case 'task.start':
      case 'TaskStart':
      case 'user_message': {
        await this.emitStateChange('task.start', sharedData, context);
        return;
      }
      case 'task.complete':
      case 'TaskComplete': {
        await this.emitStateChange('task.complete', sharedData, context);
        await this.emitStateChange('agent.idle', sharedData, context);
        return;
      }
      case 'thinking':
      case 'Thinking':
      case 'reasoning': {
        await this.emitStateChange('agent.thinking', sharedData, context);
        return;
      }
      case 'streaming':
      case 'assistant_message': {
        await this.emitStateChange('agent.streaming', sharedData, context);
        return;
      }
      case 'tool_call':
      case 'tool_use': {
        const emittedType = isKiloCodingTool(toolName) ? 'agent.coding' : 'agent.tool_call';
        await this.emitStateChange(emittedType, sharedData, context);
        return;
      }
      case 'error':
      case 'Error': {
        await this.emitStateChange('agent.error', {
          ...sharedData,
          errorMessage: getString(data, 'error') ?? getString(data, 'message'),
          errorType: inferKiloErrorType(data),
        }, context);
        return;
      }
      case 'permission_request':
      case 'asking_user': {
        await this.emitStateChange('agent.asking_user', sharedData, context);
        return;
      }
      default:
        // ACP also sends heartbeat/ping messages — ignore gracefully
        if (acpType === 'ping' || acpType === 'pong' || acpType === 'heartbeat') {
          return;
        }
        return;
    }
  }

  private async seedTranscriptOffsets(): Promise<void> {
    try {
      const files = await collectFilesRecursively(this.dataDirectory, '.jsonl');
      await Promise.all(
        files.map(async (filePath) => {
          try {
            const fileStats = await stat(filePath);
            this.transcriptOffsets.set(filePath, fileStats.size);
          } catch {
            // Ignore files that disappear between discovery and stat.
          }
        }),
      );
    } catch {
      // Data directory may not exist yet on first run.
    }
  }

  private startProcessPolling(): void {
    if (this.pollIntervalMs <= 0) {
      return;
    }

    this.processPoller = setInterval(() => {
      void this.pollKiloProcesses();
    }, this.pollIntervalMs);
    this.processPoller.unref();

    void this.pollKiloProcesses();
  }

  private async pollKiloProcesses(): Promise<void> {
    const processes = await listProcesses(this.processListCommand);

    if (processes.length > 0 && this.getStatus().activeSessions === 0) {
      const processInfo = processes[0];

      if (!processInfo) {
        return;
      }

      const sessionId = `kilo-process-${processInfo.pid}`;

      this.fallbackProcessSessionId = sessionId;
      await this.emitStateChange(
        'session.start',
        { raw: { process: processInfo, source: 'process-detect' } },
        {
          pid: processInfo.pid,
          sessionId,
          source: 'aisnitch://adapters/kilo/process-detect',
        },
      );
      return;
    }

    if (processes.length === 0 && this.fallbackProcessSessionId !== null) {
      const sessionId = this.fallbackProcessSessionId;

      this.fallbackProcessSessionId = null;
      await this.emitStateChange(
        'session.end',
        { raw: { reason: 'process-exit', source: 'process-detect' } },
        {
          sessionId,
          source: 'aisnitch://adapters/kilo/process-detect',
        },
      );
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function collectFilesRecursively(
  directoryPath: string,
  extension: string,
): Promise<string[]> {
  try {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const nestedResults = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = join(directoryPath, entry.name);

        if (entry.isDirectory()) {
          return await collectFilesRecursively(entryPath, extension);
        }

        return entry.name.endsWith(extension) ? [entryPath] : [];
      }),
    );

    return nestedResults.flat();
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

function extractToolInput(
  payload: Record<string, unknown> | undefined,
): ToolInput | undefined {
  if (!payload) {
    return undefined;
  }

  const toolInput = getRecord(payload.tool_input) ?? getRecord(payload.toolInput) ?? getRecord(payload.arguments) ?? getRecord(payload.params);
  const filePath =
    getString(toolInput, 'filePath') ??
    getString(toolInput, 'file_path') ??
    getString(toolInput, 'path') ??
    getString(toolInput, 'target');
  const command =
    getString(toolInput, 'command') ??
    getString(toolInput, 'cmd') ??
    getString(toolInput, 'script');

  if (!filePath && !command) {
    return undefined;
  }

  return { command, filePath };
}

function isKiloCodingTool(toolName?: string): boolean {
  return toolName !== undefined && KILO_CODING_TOOLS.has(toolName);
}

function inferKiloErrorType(
  payload: Record<string, unknown> | undefined,
): ErrorType {
  const message =
    getString(payload, 'error') ??
    getString(payload, 'message') ??
    '';

  if (/rate.?limit|quota|credit/i.test(message)) {
    return 'rate_limit';
  }

  if (/context|token.?limit|too.?long/i.test(message)) {
    return 'context_overflow';
  }

  if (/tool|permission|denied/i.test(message)) {
    return 'tool_failure';
  }

  return 'api_error';
}

async function listProcesses(
  listCommand: () => Promise<string>,
): Promise<KiloProcessInfo[]> {
  if (process.platform === 'win32') {
    return [];
  }

  try {
    const stdout = await listCommand();

    return stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => line.includes('kilo') || line.includes('kilocode'))
      .map(parseProcessLine)
      .filter((processInfo): processInfo is KiloProcessInfo => processInfo !== null);
  } catch (error) {
    logger.debug({ error }, 'Kilo process detection failed');
    return [];
  }
}

function parseProcessLine(line: string): KiloProcessInfo | null {
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
  };
}

function isErrnoException(
  error: unknown,
): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
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