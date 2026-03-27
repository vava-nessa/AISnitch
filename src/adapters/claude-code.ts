import { execFile as execFileCallback } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';

import { watch, type FSWatcher } from 'chokidar';

import { logger } from '../core/engine/logger.js';
import { resolveSessionId } from '../core/session-identity.js';
import type {
  AISnitchEventType,
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
 * @file src/adapters/claude-code.ts
 * @description Claude Code adapter covering official hooks, transcript JSONL enrichment, and process fallback detection.
 * @functions
 *   → none
 * @exports ClaudeCodeAdapter, ClaudeCodeAdapterOptions
 * @see ./base.ts
 * @see ../cli/commands/setup.ts
 * @see ../../tasks/04-adapters-priority/02_adapters-priority_claude-code.md
 */

const execFile = promisify(execFileCallback);

const CLAUDE_CODE_CODING_TOOLS = new Set([
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'Write',
]);

const ASKING_USER_NOTIFICATION_TYPES = new Set([
  'elicitation_dialog',
  'idle_prompt',
  'permission_prompt',
]);

/**
 * The official Claude hooks reference currently documents 25 lifecycle events,
 * including newer events such as SessionEnd, PostCompact, and ElicitationResult.
 * AISnitch only maps the subset that materially improves live activity tracking.
 */
export interface ClaudeCodeAdapterOptions extends AdapterRuntimeOptions {
  readonly pollIntervalMs?: number;
  readonly processListCommand?: () => Promise<string>;
  readonly projectsDirectory?: string;
  readonly watcherFactory?: (
    paths: string,
    options: Parameters<typeof watch>[1],
  ) => FSWatcher;
}

interface ClaudeProcessInfo {
  readonly command: string;
  readonly pid: number;
}

interface ClaudeTranscriptObservation {
  readonly context: AdapterPublishContext;
  readonly data: Omit<EventData, 'state'>;
  readonly type: AISnitchEventType;
}

/**
 * 📖 Claude Code is AISnitch's richest adapter: hooks give precise state
 * transitions, JSONL fills in thinking/streaming detail, and process polling
 * covers the ugly "hooks were never installed" case.
 */
export class ClaudeCodeAdapter extends BaseAdapter {
  public override readonly displayName = 'Claude Code';

  public override readonly name = 'claude-code' as const;

  public override readonly strategies: readonly InterceptionStrategy[] = [
    'hooks',
    'jsonl-watch',
    'process-detect',
  ];

  private fallbackProcessSessionId: string | null = null;

  private readonly pollIntervalMs: number;

  private processPoller: NodeJS.Timeout | null = null;

  private readonly processListCommand: () => Promise<string>;

  private readonly projectsDirectory: string;

  private readonly transcriptOffsets = new Map<string, number>();

  private readonly transcriptRemainders = new Map<string, string>();

  private watcher: FSWatcher | null = null;

  private readonly watcherFactory: (
    paths: string,
    options: Parameters<typeof watch>[1],
  ) => FSWatcher;

  public constructor(options: ClaudeCodeAdapterOptions) {
    super(options);
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.processListCommand =
      options.processListCommand ?? (async () => await execFile('pgrep', ['-lf', 'claude']).then((result) => result.stdout));
    this.projectsDirectory =
      options.projectsDirectory ??
      join(this.getUserHomeDirectory(), '.claude', 'projects');
    this.watcherFactory = options.watcherFactory ?? watch;
  }

  public override async start(): Promise<void> {
    if (this.getStatus().running) {
      return;
    }

    this.setRunning(true);
    await this.seedTranscriptOffsets();

    const transcriptGlob = join(this.projectsDirectory, '**', '*.jsonl');
    this.watcher = this.watcherFactory(transcriptGlob, {
      awaitWriteFinish: {
        stabilityThreshold: 200,
      },
      ignoreInitial: true,
    });

    this.watcher.on('add', (filePath) => {
      void this.processTranscriptUpdate(filePath, true);
    });
    this.watcher.on('change', (filePath) => {
      void this.processTranscriptUpdate(filePath, false);
    });
    this.watcher.on('error', (error) => {
      logger.warn({ error }, 'Claude transcript watcher error');
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
      logger.warn({ payload }, 'Claude hook payload must be an object');
      return;
    }

    const hookEventName =
      getString(payload, 'hook_event_name') ??
      getString(payload, 'hook_type');

    if (!hookEventName) {
      logger.warn({ payload }, 'Claude hook payload is missing its event name');
      return;
    }

    const sessionId = resolveSessionId({
      activeFile: extractActiveFile(payload),
      cwd: getString(payload, 'cwd'),
      pid: getNumber(payload, 'pid'),
      projectPath:
        getString(payload, 'project_path') ??
        getString(payload, 'projectPath'),
      sessionId:
        getString(payload, 'session_id') ??
        getString(payload, 'sessionId'),
      tool: this.name,
      transcriptPath:
        getString(payload, 'transcript_path') ??
        getString(payload, 'transcriptPath'),
    });
    const context: AdapterPublishContext = {
      cwd: getString(payload, 'cwd'),
      hookPayload: payload,
      pid: getNumber(payload, 'pid'),
      sessionId,
      source: 'aisnitch://adapters/claude-code',
      transcriptPath:
        getString(payload, 'transcript_path') ??
        getString(payload, 'transcriptPath'),
    };
    const sharedData = {
      activeFile: extractActiveFile(payload),
      cwd: context.cwd,
      model: getString(payload, 'model'),
      projectPath:
        getString(payload, 'project_path') ??
        getString(payload, 'projectPath'),
      raw: payload,
      toolInput: extractClaudeToolInput(payload),
      toolName:
        getString(payload, 'tool_name') ??
        getString(payload, 'toolName'),
    } satisfies Omit<EventData, 'state'>;

    switch (hookEventName) {
      case 'SessionStart': {
        this.fallbackProcessSessionId = null;
        await this.emitStateChange('session.start', sharedData, context);
        await this.emitStateChange('agent.idle', sharedData, context);
        return;
      }
      case 'SessionEnd': {
        await this.emitStateChange('session.end', sharedData, context);
        return;
      }
      case 'UserPromptSubmit':
      case 'TaskCreated':
      case 'SubagentStart': {
        await this.emitStateChange('task.start', sharedData, context);
        return;
      }
      case 'Stop':
      case 'TaskCompleted':
      case 'SubagentStop': {
        await this.emitStateChange('task.complete', sharedData, context);
        await this.emitStateChange('agent.idle', sharedData, context);
        return;
      }
      case 'PreToolUse': {
        await this.emitStateChange('agent.tool_call', sharedData, context);
        return;
      }
      case 'PostToolUse': {
        const emittedType = isClaudeCodingTool(sharedData.toolName)
          ? 'agent.coding'
          : 'agent.tool_call';
        await this.emitStateChange(emittedType, sharedData, context);
        return;
      }
      case 'PostToolUseFailure':
      case 'StopFailure': {
        await this.emitStateChange(
          'agent.error',
          {
            ...sharedData,
            errorMessage:
              getString(payload, 'error') ??
              getString(payload, 'message') ??
              'Claude Code hook failure',
            errorType:
              getClaudeErrorType(payload) ??
              'tool_failure',
          },
          context,
        );
        return;
      }
      case 'PermissionRequest': {
        await this.emitStateChange('agent.asking_user', sharedData, context);
        return;
      }
      case 'Notification': {
        const notificationType =
          getString(payload, 'notification_type') ??
          getString(payload, 'type');

        if (notificationType && ASKING_USER_NOTIFICATION_TYPES.has(notificationType)) {
          await this.emitStateChange('agent.asking_user', sharedData, context);
        }

        return;
      }
      case 'PreCompact':
      case 'PostCompact': {
        await this.emitStateChange('agent.compact', sharedData, context);
        return;
      }
      case 'TeammateIdle': {
        await this.emitStateChange('agent.idle', sharedData, context);
        return;
      }
      default: {
        logger.debug({ hookEventName }, 'Claude hook event ignored by adapter');
      }
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
      logger.debug({ error, filePath }, 'Claude transcript read skipped');
      return;
    }

    const knownOffset = this.transcriptOffsets.get(filePath);
    const previousOffset =
      knownOffset ??
      (readFromStart ? 0 : fileContent.byteLength);
    const safeOffset =
      previousOffset > fileContent.byteLength ? 0 : previousOffset;
    const newChunk = fileContent.subarray(safeOffset).toString('utf8');
    const bufferedChunk =
      (safeOffset === 0 ? '' : this.transcriptRemainders.get(filePath) ?? '') +
      newChunk;
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
      logger.warn({ error, transcriptPath }, 'Claude transcript line is not valid JSON');
      return;
    }

    const observations = extractClaudeTranscriptObservations(
      parsedLine,
      transcriptPath,
    );

    for (const observation of observations) {
      await this.emitStateChange(
        observation.type,
        observation.data,
        observation.context,
      );
    }
  }

  private async seedTranscriptOffsets(): Promise<void> {
    const files = await collectFilesRecursively(this.projectsDirectory, '.jsonl');

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
  }

  private startProcessPolling(): void {
    if (this.pollIntervalMs <= 0) {
      return;
    }

    this.processPoller = setInterval(() => {
      void this.pollClaudeProcesses();
    }, this.pollIntervalMs);
    this.processPoller.unref();

    void this.pollClaudeProcesses();
  }

  private async pollClaudeProcesses(): Promise<void> {
    const processes = await listProcesses(this.processListCommand);

    if (processes.length > 0 && this.getStatus().activeSessions === 0) {
      const processInfo = processes[0];

      if (!processInfo) {
        return;
      }

      const sessionId = `claude-process-${processInfo.pid}`;

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
          source: 'aisnitch://adapters/claude-code/process-detect',
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
          source: 'aisnitch://adapters/claude-code/process-detect',
        },
      );
    }
  }
}

async function collectFilesRecursively(
  directoryPath: string,
  extension: string,
): Promise<string[]> {
  try {
    const entries = await readdir(directoryPath, {
      withFileTypes: true,
    });
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

function extractClaudeTranscriptObservations(
  payload: unknown,
  transcriptPath: string,
): ClaudeTranscriptObservation[] {
  if (!isRecord(payload)) {
    return [];
  }

  const sessionId = resolveSessionId({
    sessionId:
      getString(payload, 'session_id') ??
      basename(transcriptPath, '.jsonl'),
    tool: 'claude-code',
    transcriptPath,
  });
  const contentParts = extractClaudeContentParts(payload);
  const model =
    getString(payload, 'model') ??
    getString(getRecord(payload.message), 'model');
  const tokensUsed = extractTokenUsage(payload);
  const rawPayload = payload;
  const sharedContext: AdapterPublishContext = {
    hookPayload: rawPayload,
    sessionId,
    source: 'aisnitch://adapters/claude-code/transcript',
    transcriptPath,
  };
  const sharedData = {
    model,
    raw: rawPayload,
    tokensUsed,
  } satisfies Omit<EventData, 'state'>;
  const observations: ClaudeTranscriptObservation[] = [];

  if (contentParts.some((part) => part.type === 'thinking')) {
    observations.push({
      context: sharedContext,
      data: sharedData,
      type: 'agent.thinking',
    });
  }

  if (
    contentParts.some(
      (part) =>
        part.type === 'text' &&
        typeof part.text === 'string' &&
        part.text.trim().length > 0,
    )
  ) {
    observations.push({
      context: sharedContext,
      data: sharedData,
      type: 'agent.streaming',
    });
  }

  return observations;
}

function extractClaudeContentParts(
  payload: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const message = getRecord(payload.message);
  const content = message?.content ?? payload.content;

  if (!Array.isArray(content)) {
    return [];
  }

  return content.filter(isRecord);
}

function extractTokenUsage(payload: Record<string, unknown>): number | undefined {
  const tokens = getNumber(payload, 'tokens');

  if (tokens !== undefined) {
    return tokens;
  }

  const usage = getRecord(payload.usage);

  if (!usage) {
    return undefined;
  }

  const totalTokens = getNumber(usage, 'total_tokens');

  if (totalTokens !== undefined) {
    return totalTokens;
  }

  const inputTokens = getNumber(usage, 'input_tokens') ?? 0;
  const outputTokens = getNumber(usage, 'output_tokens') ?? 0;
  const usageSum = inputTokens + outputTokens;

  return usageSum > 0 ? usageSum : undefined;
}

function extractClaudeToolInput(
  payload: Record<string, unknown>,
): ToolInput | undefined {
  const toolInput = getRecord(payload.tool_input) ?? getRecord(payload.toolInput);

  if (!toolInput) {
    return undefined;
  }

  const filePath =
    getString(toolInput, 'file_path') ??
    getString(toolInput, 'filePath') ??
    getString(toolInput, 'path');
  const command =
    getString(toolInput, 'command') ??
    getString(toolInput, 'cmd');

  if (!filePath && !command) {
    return undefined;
  }

  return {
    command,
    filePath,
  };
}

function extractActiveFile(payload: Record<string, unknown>): string | undefined {
  const toolInput = extractClaudeToolInput(payload);

  if (toolInput?.filePath) {
    return toolInput.filePath;
  }

  return (
    getString(payload, 'active_file') ??
    getString(payload, 'activeFile') ??
    getString(payload, 'file_path')
  );
}

function getClaudeErrorType(payload: Record<string, unknown>): ErrorType | undefined {
  const rawErrorType =
    getString(payload, 'error_type') ??
    getString(payload, 'errorType') ??
    getString(payload, 'stop_reason');

  switch (rawErrorType) {
    case 'rate_limit':
      return 'rate_limit';
    case 'max_output_tokens':
    case 'context_overflow':
      return 'context_overflow';
    case 'api_error':
    case 'server_error':
    case 'authentication_failed':
    case 'billing_error':
    case 'invalid_request':
      return 'api_error';
    default:
      return undefined;
  }
}

function isClaudeCodingTool(toolName?: string): boolean {
  return toolName !== undefined && CLAUDE_CODE_CODING_TOOLS.has(toolName);
}

async function listProcesses(
  listCommand: () => Promise<string>,
): Promise<ClaudeProcessInfo[]> {
  if (process.platform === 'win32') {
    return [];
  }

  try {
    const stdout = await listCommand();

    return stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map(parseProcessLine)
      .filter((processInfo): processInfo is ClaudeProcessInfo => processInfo !== null);
  } catch (error) {
    const errorCode = isErrnoException(error) ? String(error.code) : '';

    if (isErrnoException(error) && (errorCode === 'ENOENT' || errorCode === '1')) {
      return [];
    }

    logger.debug({ error }, 'Claude process detection failed');
    return [];
  }
}

function parseProcessLine(line: string): ClaudeProcessInfo | null {
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
): error is NodeJS.ErrnoException & { code?: string | number } {
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
