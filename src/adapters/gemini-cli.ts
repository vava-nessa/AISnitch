import { execFile as execFileCallback } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
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
 * @file src/adapters/gemini-cli.ts
 * @description Gemini CLI adapter covering command hooks, best-effort local `logs.json` watching, and process fallback detection.
 * @functions
 *   → none
 * @exports GeminiCLIAdapter, GeminiCLIAdapterOptions
 * @see ./base.ts
 * @see ../cli/commands/setup.ts
 * @see ../../tasks/06-adapters-secondary/01_adapters-secondary_gemini-codex.md
 */

const execFile = promisify(execFileCallback);

const GEMINI_CODING_TOOLS = new Set([
  'edit',
  'replace',
  'write',
  'write_file',
]);

/**
 * Gemini CLI now documents synchronous lifecycle hooks in settings.json. The
 * passive fallback here reads the per-session `logs.json` files under
 * `~/.gemini/tmp/`, which appear to contain prompt history even when hooks
 * were never installed.
 */
export interface GeminiCLIAdapterOptions extends AdapterRuntimeOptions {
  readonly logsDirectory?: string;
  readonly pollIntervalMs?: number;
  readonly processListCommand?: () => Promise<string>;
  readonly watcherFactory?: (
    paths: string,
    options: Parameters<typeof watch>[1],
  ) => FSWatcher;
}

interface GeminiProcessInfo {
  readonly command: string;
  readonly pid: number;
}

/**
 * 📖 Gemini gets the same three-layer treatment as Claude/OpenCode, but the
 * file fallback is intentionally narrower: it only emits what local logs can
 * prove, instead of pretending those logs expose the full agent loop.
 */
export class GeminiCLIAdapter extends BaseAdapter {
  public override readonly displayName = 'Gemini CLI';

  public override readonly name = 'gemini-cli' as const;

  public override readonly strategies: readonly InterceptionStrategy[] = [
    'hooks',
    'log-watch',
    'process-detect',
  ];

  private fallbackProcessSessionId: string | null = null;

  private readonly logsDirectory: string;

  private readonly observedLogMessageIds = new Map<string, Set<string>>();

  private readonly projectRootCache = new Map<string, string | undefined>();

  private readonly pollIntervalMs: number;

  private processPoller: NodeJS.Timeout | null = null;

  private readonly processListCommand: () => Promise<string>;

  private watcher: FSWatcher | null = null;

  private readonly watcherFactory: (
    paths: string,
    options: Parameters<typeof watch>[1],
  ) => FSWatcher;

  public constructor(options: GeminiCLIAdapterOptions) {
    super(options);
    this.logsDirectory =
      options.logsDirectory ??
      join(this.getUserHomeDirectory(), '.gemini', 'tmp');
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.processListCommand =
      options.processListCommand ??
      (async () =>
        await execFile('pgrep', ['-lf', 'gemini']).then((result) => result.stdout));
    this.watcherFactory = options.watcherFactory ?? watch;
  }

  public override async start(): Promise<void> {
    if (this.getStatus().running) {
      return;
    }

    this.setRunning(true);
    await this.seedObservedLogState();

    const logsGlob = join(this.logsDirectory, '**', 'logs.json');
    this.watcher = this.watcherFactory(logsGlob, {
      awaitWriteFinish: {
        stabilityThreshold: 200,
      },
      ignoreInitial: true,
    });

    this.watcher.on('add', (filePath) => {
      void this.processLogsFile(filePath);
    });
    this.watcher.on('change', (filePath) => {
      void this.processLogsFile(filePath);
    });
    this.watcher.on('error', (error) => {
      logger.warn({ error }, 'Gemini logs watcher error');
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
    this.observedLogMessageIds.clear();
    this.projectRootCache.clear();
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
          projectPath: normalizedPayload.data?.projectPath,
          sessionId: normalizedPayload.sessionId,
          tool: this.name,
          transcriptPath: normalizedPayload.transcriptPath,
        }),
      });
      return;
    }

    if (!isRecord(payload)) {
      logger.warn({ payload }, 'Gemini hook payload must be an object');
      return;
    }

    const hookEventName =
      getString(payload, 'hook_event_name') ??
      getString(payload, 'hookEventName');

    if (!hookEventName) {
      logger.warn({ payload }, 'Gemini hook payload is missing its event name');
      return;
    }

    const cwd = getString(payload, 'cwd');
    const transcriptPath =
      getString(payload, 'transcript_path') ??
      getString(payload, 'transcriptPath');
    const sessionId = resolveSessionId({
      activeFile: extractGeminiActiveFile(payload),
      cwd,
      projectPath: cwd,
      sessionId:
        getString(payload, 'session_id') ??
        getString(payload, 'sessionId'),
      tool: this.name,
      transcriptPath,
    });
    const context: AdapterPublishContext = {
      cwd,
      hookPayload: payload,
      pid: getNumber(payload, 'pid'),
      sessionId,
      source: 'aisnitch://adapters/gemini-cli',
      transcriptPath,
    };
    const sharedData = {
      activeFile: extractGeminiActiveFile(payload),
      cwd,
      errorMessage: extractGeminiErrorMessage(payload),
      errorType: extractGeminiErrorType(payload),
      model: extractGeminiModel(payload),
      projectPath: cwd,
      raw: payload,
      tokensUsed: extractGeminiTokens(payload),
      toolInput: extractGeminiToolInput(payload),
      toolName: extractGeminiToolName(payload),
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
      case 'BeforeAgent': {
        await this.emitStateChange('task.start', sharedData, context);
        return;
      }
      case 'AfterAgent': {
        if (sharedData.errorMessage) {
          await this.emitStateChange('agent.error', sharedData, context);
          return;
        }

        await this.emitStateChange('task.complete', sharedData, context);
        await this.emitStateChange('agent.idle', sharedData, context);
        return;
      }
      case 'BeforeTool': {
        await this.emitStateChange('agent.tool_call', sharedData, context);
        return;
      }
      case 'AfterTool': {
        if (sharedData.errorMessage) {
          await this.emitStateChange('agent.error', sharedData, context);
          return;
        }

        const emittedType = isGeminiCodingTool(sharedData.toolName)
          ? 'agent.coding'
          : 'agent.tool_call';
        await this.emitStateChange(emittedType, sharedData, context);
        return;
      }
      case 'AfterModel': {
        await this.emitStateChange('agent.streaming', sharedData, context);
        return;
      }
      case 'Notification': {
        await this.emitStateChange('agent.asking_user', sharedData, context);
        return;
      }
      case 'PreCompress': {
        await this.emitStateChange('agent.compact', sharedData, context);
        return;
      }
      default: {
        logger.debug({ hookEventName }, 'Gemini hook event ignored by adapter');
      }
    }
  }

  private async processLogsFile(filePath: string): Promise<void> {
    let fileContent: string;

    try {
      fileContent = await readFile(filePath, 'utf8');
    } catch (error) {
      logger.debug({ error, filePath }, 'Gemini logs read skipped');
      return;
    }

    let parsedContent: unknown;

    try {
      parsedContent = JSON.parse(fileContent) as unknown;
    } catch (error) {
      logger.warn({ error, filePath }, 'Gemini logs file is not valid JSON');
      return;
    }

    if (!Array.isArray(parsedContent)) {
      logger.warn({ filePath }, 'Gemini logs file does not contain an array');
      return;
    }

    const knownMessageIds = this.observedLogMessageIds.get(filePath) ?? new Set<string>();
    this.observedLogMessageIds.set(filePath, knownMessageIds);

    for (const entry of parsedContent) {
      if (!isRecord(entry)) {
        continue;
      }

      const messageId =
        getString(entry, 'messageId') ??
        getString(entry, 'message_id');

      if (!messageId || knownMessageIds.has(messageId)) {
        continue;
      }

      knownMessageIds.add(messageId);
      await this.processLogEntry(entry, filePath);
    }
  }

  private async processLogEntry(
    entry: Record<string, unknown>,
    filePath: string,
  ): Promise<void> {
    const messageType = getString(entry, 'type');
    const sessionId = resolveSessionId({
      cwd: await this.readProjectRoot(filePath),
      projectPath: await this.readProjectRoot(filePath),
      sessionId: getString(entry, 'sessionId') ?? `${this.name}:session`,
      tool: this.name,
    });
    const projectPath = await this.readProjectRoot(filePath);
    const context: AdapterPublishContext = {
      cwd: projectPath,
      hookPayload: entry,
      sessionId,
      source: 'aisnitch://adapters/gemini-cli/log-watch',
    };
    const sharedData = {
      cwd: projectPath,
      projectPath,
      raw: entry,
    } satisfies Omit<EventData, 'state'>;

    await this.ensureObservedSession(sessionId, sharedData, context);

    switch (messageType) {
      case 'user': {
        await this.emitStateChange('task.start', sharedData, context);
        return;
      }
      case 'model':
      case 'assistant': {
        await this.emitStateChange('agent.streaming', sharedData, context);
        return;
      }
      case 'thinking': {
        await this.emitStateChange('agent.thinking', sharedData, context);
        return;
      }
      default: {
        logger.debug({ filePath, messageType }, 'Gemini log entry ignored by adapter');
      }
    }
  }

  private async ensureObservedSession(
    sessionId: string,
    data: Omit<EventData, 'state'>,
    context: AdapterPublishContext,
  ): Promise<void> {
    if (this.currentSessionId === sessionId) {
      return;
    }

    await this.emitStateChange('session.start', data, context);
    await this.emitStateChange('agent.idle', data, context);
  }

  private async readProjectRoot(filePath: string): Promise<string | undefined> {
    if (this.projectRootCache.has(filePath)) {
      return this.projectRootCache.get(filePath);
    }

    const rootPath = join(dirname(filePath), '.project_root');

    try {
      const projectRoot = (await readFile(rootPath, 'utf8')).trim();
      const normalizedRoot = projectRoot.length > 0 ? projectRoot : undefined;

      this.projectRootCache.set(filePath, normalizedRoot);
      return normalizedRoot;
    } catch {
      this.projectRootCache.set(filePath, undefined);
      return undefined;
    }
  }

  private async seedObservedLogState(): Promise<void> {
    const files = await collectFilesRecursively(this.logsDirectory, 'logs.json');

    await Promise.all(
      files.map(async (filePath) => {
        try {
          const fileStats = await stat(filePath);

          if (!fileStats.isFile()) {
            return;
          }

          const fileContent = await readFile(filePath, 'utf8');
          const parsedContent = JSON.parse(fileContent) as unknown;
          const messageIds = new Set<string>();

          if (Array.isArray(parsedContent)) {
            for (const entry of parsedContent) {
              if (!isRecord(entry)) {
                continue;
              }

              const messageId =
                getString(entry, 'messageId') ??
                getString(entry, 'message_id');

              if (messageId) {
                messageIds.add(messageId);
              }
            }
          }

          this.observedLogMessageIds.set(filePath, messageIds);
        } catch {
          // Ignore files that disappear or fail while seeding.
        }
      }),
    );
  }

  private startProcessPolling(): void {
    if (this.pollIntervalMs <= 0) {
      return;
    }

    this.processPoller = setInterval(() => {
      void this.pollGeminiProcesses();
    }, this.pollIntervalMs);
    this.processPoller.unref();

    void this.pollGeminiProcesses();
  }

  private async pollGeminiProcesses(): Promise<void> {
    const processes = await listProcesses(this.processListCommand);

    if (processes.length > 0 && this.getStatus().activeSessions === 0) {
      const processInfo = processes[0];

      if (!processInfo) {
        return;
      }

      const sessionId = `gemini-cli-process-${processInfo.pid}`;

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
          source: 'aisnitch://adapters/gemini-cli/process-detect',
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
          source: 'aisnitch://adapters/gemini-cli/process-detect',
        },
      );
    }
  }
}

async function collectFilesRecursively(
  directoryPath: string,
  fileName: string,
): Promise<string[]> {
  try {
    const entries = await readdir(directoryPath, {
      withFileTypes: true,
    });
    const nestedResults = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = join(directoryPath, entry.name);

        if (entry.isDirectory()) {
          return await collectFilesRecursively(entryPath, fileName);
        }

        return entry.name === fileName ? [entryPath] : [];
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

function extractGeminiToolName(
  payload: Record<string, unknown>,
): string | undefined {
  return (
    getString(payload, 'tool_name') ??
    getString(payload, 'toolName')
  );
}

function extractGeminiToolInput(
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

function extractGeminiActiveFile(
  payload: Record<string, unknown>,
): string | undefined {
  const toolInput = extractGeminiToolInput(payload);

  if (toolInput?.filePath) {
    return toolInput.filePath;
  }

  return (
    getString(payload, 'active_file') ??
    getString(payload, 'activeFile') ??
    getString(payload, 'file_path')
  );
}

function extractGeminiErrorMessage(
  payload: Record<string, unknown>,
): string | undefined {
  const toolResponse = getRecord(payload.tool_response) ?? getRecord(payload.toolResponse);
  const llmResponse = getRecord(payload.llm_response) ?? getRecord(payload.llmResponse);

  return (
    getString(getRecord(toolResponse?.error), 'message') ??
    getString(payload, 'reason') ??
    getString(payload, 'message') ??
    getString(llmResponse, 'error')
  );
}

function extractGeminiErrorType(
  payload: Record<string, unknown>,
): ErrorType | undefined {
  const rawType =
    getString(payload, 'error_type') ??
    getString(payload, 'errorType') ??
    getString(payload, 'stopReason');

  switch (rawType) {
    case 'rate_limit':
      return 'rate_limit';
    case 'max_output_tokens':
    case 'context_overflow':
      return 'context_overflow';
    case 'api_error':
    case 'provider_error':
    case 'invalid_request':
      return 'api_error';
    case 'tool_failure':
      return 'tool_failure';
    default:
      return undefined;
  }
}

function extractGeminiModel(
  payload: Record<string, unknown>,
): string | undefined {
  return (
    getString(getRecord(payload.llm_request), 'model') ??
    getString(payload, 'model')
  );
}

function extractGeminiTokens(
  payload: Record<string, unknown>,
): number | undefined {
  const llmResponse = getRecord(payload.llm_response) ?? getRecord(payload.llmResponse);
  const usageMetadata = getRecord(llmResponse?.usageMetadata);
  const totalTokens =
    getNumber(usageMetadata, 'totalTokenCount') ??
    getNumber(usageMetadata, 'total_tokens');

  return totalTokens;
}

function isGeminiCodingTool(toolName?: string): boolean {
  return toolName !== undefined && GEMINI_CODING_TOOLS.has(toolName);
}

async function listProcesses(
  listCommand: () => Promise<string>,
): Promise<GeminiProcessInfo[]> {
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
      .filter((processInfo): processInfo is GeminiProcessInfo => processInfo !== null);
  } catch (error) {
    const errorCode = isErrnoException(error) ? String(error.code) : '';

    if (isErrnoException(error) && (errorCode === 'ENOENT' || errorCode === '1')) {
      return [];
    }

    logger.debug({ error }, 'Gemini process detection failed');
    return [];
  }
}

function parseProcessLine(line: string): GeminiProcessInfo | null {
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
  payload: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  if (!payload) {
    return undefined;
  }

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
