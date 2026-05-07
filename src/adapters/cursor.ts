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
 * @file src/adapters/cursor.ts
 * @description Cursor CLI adapter covering process detection, JSON output interception,
 * and log file watching for the Cursor agent terminal.
 * @functions
 *   → none
 * @exports CursorAdapter, CursorAdapterOptions
 * @see ./base.ts
 * @see ../../docs/priority-adapters.md
 *
 * 📖 Cursor CLI is the command-line interface to Cursor's AI agent. It supports
 * structured JSON output (`--output-format json`), process detection for running
 * instances, and writes session logs to Library/Application Support/Cursor/.
 * Interception strategy: process-detect primary, JSON line watching as fallback.
 */

const execFile = promisify(execFileCallback);

const CURSOR_CODING_TOOLS = new Set([
  'Edit',
  'Write',
  'MultiEdit',
  'NotebookEdit',
  'CreateFile',
  'DeleteFile',
  'MoveFile',
]);

export interface CursorAdapterOptions extends AdapterRuntimeOptions {
  readonly pollIntervalMs?: number;
  readonly processListCommand?: () => Promise<string>;
  readonly logDirectory?: string;
  readonly watcherFactory?: (
    paths: string,
    options: Parameters<typeof watch>[1],
  ) => FSWatcher;
}

interface CursorProcessInfo {
  readonly command: string;
  readonly pid: number;
}

/**
 * 📖 Cursor CLI lacks a formal hook system but emits structured logs via its
 * background process and supports JSON output mode. The adapter uses process
 * polling as the primary detection mechanism and log watching as secondary.
 */
export class CursorAdapter extends BaseAdapter {
  public override readonly displayName = 'Cursor CLI';

  public override readonly name = 'cursor' as const;

  public override readonly strategies: readonly InterceptionStrategy[] = [
    'process-detect',
    'jsonl-watch',
  ];

  private fallbackProcessSessionId: string | null = null;

  private readonly logDirectory: string;

  private readonly pollIntervalMs: number;

  private processPoller: NodeJS.Timeout | null = null;

  private readonly processListCommand: () => Promise<string>;

  private readonly transcriptOffsets = new Map<string, number>();

  private readonly transcriptRemainders = new Map<string, string>();

  private watcher: FSWatcher | null = null;

  private readonly watcherFactory: (
    paths: string,
    options: Parameters<typeof watch>[1],
  ) => FSWatcher;

  public constructor(options: CursorAdapterOptions) {
    super(options);
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.processListCommand =
      options.processListCommand ??
      (async () => {
        const results = await Promise.all([
          execFile('pgrep', ['-lf', 'cursor-agent']).catch(() => ({ stdout: '' })),
          execFile('pgrep', ['-lf', 'cursor']).catch(() => ({ stdout: '' })),
        ]);
        return results.map((r) => r.stdout).join('\n');
      });
    this.logDirectory =
      options.logDirectory ??
      join(this.getUserHomeDirectory(), 'Library', 'Application Support', 'Cursor');
    this.watcherFactory = options.watcherFactory ?? watch;
  }

  public override async start(): Promise<void> {
    if (this.getStatus().running) {
      return;
    }

    this.setRunning(true);
    await this.seedTranscriptOffsets();

    // Watch for Cursor log files in various locations
    const logPatterns = [
      join(this.logDirectory, 'logs', '**', '*.jsonl'),
      join(this.logDirectory, 'agent', '**', '*.jsonl'),
    ];

    this.watcher = this.watcherFactory(logPatterns[0]!, {
      awaitWriteFinish: { stabilityThreshold: 200 },
      ignoreInitial: true,
    });

    this.watcher.on('add', (filePath) => void this.processTranscriptUpdate(filePath, true));
    this.watcher.on('change', (filePath) => void this.processTranscriptUpdate(filePath, false));
    this.watcher.on('error', (error) => {
      logger.warn({ error }, 'Cursor log watcher error');
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
      logger.warn({ payload }, 'Cursor hook payload must be an object');
      return;
    }

    const sessionId = resolveSessionId({
      cwd: getString(payload, 'cwd'),
      pid: getNumber(payload, 'pid'),
      projectPath: getString(payload, 'projectPath'),
      sessionId: getString(payload, 'sessionId') ?? getString(payload, 'session_id'),
      tool: this.name,
    });
    const context: AdapterPublishContext = {
      cwd: getString(payload, 'cwd'),
      env: this.env ?? process.env,
      hookPayload: payload,
      pid: getNumber(payload, 'pid'),
      sessionId,
      source: 'aisnitch://adapters/cursor',
    };
    const eventType = getString(payload, 'event') ?? getString(payload, 'type');
    const toolName = getString(payload, 'tool') ?? getString(payload, 'toolName');
    const toolInput = extractToolInput(payload);
    const sharedData = {
      activeFile: toolInput?.filePath,
      cwd: context.cwd,
      model: getString(payload, 'model'),
      projectPath: getString(payload, 'projectPath'),
      raw: payload,
      toolInput,
      toolName,
    } satisfies Omit<EventData, 'state'>;

    switch (eventType) {
      case 'session_start':
      case 'SessionStart': {
        await this.emitStateChange('session.start', sharedData, context);
        await this.emitStateChange('agent.idle', sharedData, context);
        return;
      }
      case 'session_end':
      case 'SessionEnd': {
        await this.emitStateChange('session.end', sharedData, context);
        return;
      }
      case 'task_start':
      case 'TaskStart':
      case 'UserPromptSubmit': {
        await this.emitStateChange('task.start', sharedData, context);
        return;
      }
      case 'task_complete':
      case 'TaskComplete':
      case 'TaskCompleted': {
        await this.emitStateChange('task.complete', sharedData, context);
        await this.emitStateChange('agent.idle', sharedData, context);
        return;
      }
      case 'tool_call':
      case 'PreToolUse': {
        await this.emitStateChange('agent.tool_call', sharedData, context);
        return;
      }
      case 'tool_result':
      case 'PostToolUse': {
        const emittedType = isCursorCodingTool(toolName) ? 'agent.coding' : 'agent.tool_call';
        await this.emitStateChange(emittedType, sharedData, context);
        return;
      }
      case 'thinking':
      case 'Thinking': {
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
          errorMessage: getString(payload, 'error') ?? getString(payload, 'message') ?? 'Cursor error',
          errorType: inferCursorErrorType(payload),
        }, context);
        return;
      }
      case 'asking_user':
      case 'PermissionRequest':
      case 'Notification': {
        await this.emitStateChange('agent.asking_user', sharedData, context);
        return;
      }
      default:
        logger.debug({ eventType }, 'Cursor hook event ignored by adapter');
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
      logger.debug({ error, filePath }, 'Cursor transcript read skipped');
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
      logger.warn({ error, transcriptPath }, 'Cursor transcript line is not valid JSON');
      return;
    }

    if (!isRecord(parsedLine)) {
      return;
    }

    const sessionId = resolveSessionId({
      sessionId:
        getString(parsedLine, 'sessionId') ??
        getString(parsedLine, 'session_id') ??
        basename(transcriptPath, '.jsonl'),
      tool: this.name,
      transcriptPath,
    });
    const context: AdapterPublishContext = {
      env: process.env,
      hookPayload: parsedLine,
      sessionId,
      source: 'aisnitch://adapters/cursor/log',
      transcriptPath,
    };
    const eventType = getString(parsedLine, 'type') ?? getString(parsedLine, 'event');
    const data = getRecord(parsedLine.data) ?? parsedLine;
    const toolName = getString(data, 'toolName') ?? getString(data, 'tool');
    const toolInput = extractToolInput(data);
    const sharedData = {
      activeFile: toolInput?.filePath,
      model: getString(data, 'model'),
      raw: parsedLine,
      toolInput,
      toolName,
    } satisfies Omit<EventData, 'state'>;

    // Map Cursor log types to AISnitch event types
    switch (eventType) {
      case 'session.start':
      case 'session_start': {
        await this.emitStateChange('session.start', sharedData, context);
        await this.emitStateChange('agent.idle', sharedData, context);
        return;
      }
      case 'session.end':
      case 'session_end': {
        await this.emitStateChange('session.end', sharedData, context);
        return;
      }
      case 'task.start':
      case 'task_start': {
        await this.emitStateChange('task.start', sharedData, context);
        return;
      }
      case 'task.complete':
      case 'task_complete': {
        await this.emitStateChange('task.complete', sharedData, context);
        await this.emitStateChange('agent.idle', sharedData, context);
        return;
      }
      case 'agent.thinking':
      case 'thinking': {
        await this.emitStateChange('agent.thinking', sharedData, context);
        return;
      }
      case 'agent.streaming':
      case 'streaming':
      case 'assistant.message': {
        await this.emitStateChange('agent.streaming', sharedData, context);
        return;
      }
      case 'agent.tool_call':
      case 'tool_use': {
        const emittedType = isCursorCodingTool(toolName) ? 'agent.coding' : 'agent.tool_call';
        await this.emitStateChange(emittedType, sharedData, context);
        return;
      }
      case 'agent.error':
      case 'error': {
        await this.emitStateChange('agent.error', {
          ...sharedData,
          errorMessage: getString(data, 'error') ?? getString(data, 'message'),
          errorType: inferCursorErrorType(data),
        }, context);
        return;
      }
      case 'agent.asking_user':
      case 'permission_required': {
        await this.emitStateChange('agent.asking_user', sharedData, context);
        return;
      }
      default:
        return;
    }
  }

  private async seedTranscriptOffsets(): Promise<void> {
    try {
      const files = await collectFilesRecursively(
        join(this.logDirectory, 'logs'),
        '.jsonl',
      );
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
      // Logs directory may not exist yet on first run.
    }
  }

  private startProcessPolling(): void {
    if (this.pollIntervalMs <= 0) {
      return;
    }

    this.processPoller = setInterval(() => {
      void this.pollCursorProcesses();
    }, this.pollIntervalMs);
    this.processPoller.unref();

    void this.pollCursorProcesses();
  }

  private async pollCursorProcesses(): Promise<void> {
    const processes = await listProcesses(this.processListCommand);

    if (processes.length > 0 && this.getStatus().activeSessions === 0) {
      const processInfo = processes[0];

      if (!processInfo) {
        return;
      }

      const sessionId = `cursor-process-${processInfo.pid}`;

      this.fallbackProcessSessionId = sessionId;
      await this.emitStateChange(
        'session.start',
        { raw: { process: processInfo, source: 'process-detect' } },
        {
          pid: processInfo.pid,
          sessionId,
          source: 'aisnitch://adapters/cursor/process-detect',
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
          source: 'aisnitch://adapters/cursor/process-detect',
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

  const toolInput = getRecord(payload.tool_input) ?? getRecord(payload.toolInput) ?? getRecord(payload.arguments);
  const filePath =
    getString(toolInput, 'filePath') ??
    getString(toolInput, 'file_path') ??
    getString(toolInput, 'path');
  const command =
    getString(toolInput, 'command') ??
    getString(toolInput, 'cmd');

  if (!filePath && !command) {
    return undefined;
  }

  return { command, filePath };
}

function isCursorCodingTool(toolName?: string): boolean {
  return toolName !== undefined && CURSOR_CODING_TOOLS.has(toolName);
}

function inferCursorErrorType(
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
): Promise<CursorProcessInfo[]> {
  if (process.platform === 'win32') {
    return [];
  }

  try {
    const stdout = await listCommand();

    return stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line.includes('cursor'))
      .map(parseProcessLine)
      .filter((processInfo): processInfo is CursorProcessInfo => processInfo !== null);
  } catch (error) {
    logger.debug({ error }, 'Cursor process detection failed');
    return [];
  }
}

function parseProcessLine(line: string): CursorProcessInfo | null {
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