import { execFile as execFileCallback } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';

import { watch, type FSWatcher } from 'chokidar';

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
 * @file src/adapters/copilot-cli.ts
 * @description Copilot CLI adapter covering repository hooks, passive session-state JSONL watching, workspace metadata enrichment, and process fallback detection.
 * @functions
 *   → none
 * @exports CopilotCLIAdapter, CopilotCLIAdapterOptions
 * @see ./base.ts
 * @see ../cli/commands/setup.ts
 * @see ../../tasks/06-adapters-secondary/02_adapters-secondary_goose-copilot_DONE.md
 */

const execFile = promisify(execFileCallback);
const COPILOT_CODING_TOOL_HINT =
  /apply|create|delete|edit|insert|move|patch|rename|replace|write/iu;

export interface CopilotCLIAdapterOptions extends AdapterRuntimeOptions {
  readonly pollIntervalMs?: number;
  readonly processListCommand?: () => Promise<string>;
  readonly sessionStateDirectory?: string;
  readonly watcherFactory?: (
    paths: string,
    options: Parameters<typeof watch>[1],
  ) => FSWatcher;
}

interface CopilotProcessInfo {
  readonly command: string;
  readonly pid: number;
}

interface CopilotSessionMetadata {
  readonly branch?: string;
  readonly cwd?: string;
  readonly gitRoot?: string;
  readonly model?: string;
  readonly repository?: string;
  readonly sessionId: string;
}

/**
 * 📖 Copilot's local session-state files are rich enough that hooks become a
 * precision upgrade rather than the only usable signal. The adapter therefore
 * merges both paths instead of trusting just one.
 */
export class CopilotCLIAdapter extends BaseAdapter {
  public override readonly displayName = 'Copilot CLI';

  public override readonly name = 'copilot-cli' as const;

  public override readonly strategies: readonly InterceptionStrategy[] = [
    'hooks',
    'jsonl-watch',
    'process-detect',
  ];

  private fallbackProcessSessionId: string | null = null;

  private readonly observedEventIds = new Set<string>();

  private readonly pollIntervalMs: number;

  private processPoller: NodeJS.Timeout | null = null;

  private readonly processListCommand: () => Promise<string>;

  private readonly sessionMetadata = new Map<string, CopilotSessionMetadata>();

  private readonly sessionStateDirectory: string;

  private readonly transcriptOffsets = new Map<string, number>();

  private readonly transcriptRemainders = new Map<string, string>();

  private watcher: FSWatcher | null = null;

  private readonly watcherFactory: (
    paths: string,
    options: Parameters<typeof watch>[1],
  ) => FSWatcher;

  public constructor(options: CopilotCLIAdapterOptions) {
    super(options);
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.processListCommand =
      options.processListCommand ??
      (async () =>
        await execFile('pgrep', ['-lf', 'copilot']).then(
          (result) => result.stdout,
        ));
    this.sessionStateDirectory =
      options.sessionStateDirectory ??
      join(this.getUserHomeDirectory(), '.copilot', 'session-state');
    this.watcherFactory = options.watcherFactory ?? watch;
  }

  public override async start(): Promise<void> {
    if (this.getStatus().running) {
      return;
    }

    this.setRunning(true);
    await this.seedTranscriptOffsets();

    const transcriptGlob = join(this.sessionStateDirectory, '**', '*.jsonl');
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
      logger.warn({ error }, 'Copilot session-state watcher error');
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
    this.observedEventIds.clear();
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
      logger.warn({ payload }, 'Copilot hook payload must be an object');
      return;
    }

    const hookEventName =
      getString(payload, 'hook_event_name') ??
      getString(payload, 'hookEventName');

    if (!hookEventName) {
      logger.warn({ payload }, 'Copilot hook payload is missing its event name');
      return;
    }

    const sessionMetadata = await this.resolveSessionMetadata(
      this.resolveRawSessionId(payload) ?? 'copilot-hook-session',
    );
    const sessionId = resolveSessionId({
      cwd: getString(payload, 'cwd') ?? sessionMetadata.cwd,
      project: sessionMetadata.repository,
      projectPath: sessionMetadata.gitRoot ?? sessionMetadata.cwd,
      sessionId: this.resolveRawSessionId(payload),
      tool: this.name,
    });
    const context: AdapterPublishContext = {
      cwd: getString(payload, 'cwd') ?? sessionMetadata.cwd,
      hookPayload: payload,
      sessionId,
      source: 'aisnitch://adapters/copilot-cli',
    };
    const toolInput = extractCopilotHookToolInput(payload);
    const toolName =
      getString(payload, 'toolName') ?? getString(payload, 'tool_name');
    const toolResult =
      getRecord(payload.toolResult) ?? getRecord(payload.tool_result);
    const sharedData = {
      activeFile: toolInput?.filePath,
      cwd: context.cwd,
      model: sessionMetadata.model,
      project: sessionMetadata.repository,
      projectPath: sessionMetadata.gitRoot ?? sessionMetadata.cwd,
      raw: payload,
      toolInput,
      toolName,
    } satisfies Omit<EventData, 'state'>;

    switch (hookEventName) {
      case 'sessionStart': {
        await this.emitStateChange('session.start', sharedData, context);
        await this.emitStateChange('agent.idle', sharedData, context);
        return;
      }
      case 'userPromptSubmitted': {
        await this.emitStateChange(
          'task.start',
          {
            ...sharedData,
            raw: {
              ...payload,
              prompt: getString(payload, 'prompt'),
            },
          },
          context,
        );
        return;
      }
      case 'preToolUse': {
        const emittedType = isCopilotCodingTool(toolName, toolInput)
          ? 'agent.coding'
          : 'agent.tool_call';

        await this.emitStateChange(emittedType, sharedData, context);
        return;
      }
      case 'postToolUse': {
        const emittedType = isCopilotCodingTool(toolName, toolInput)
          ? 'agent.coding'
          : 'agent.tool_call';
        const resultType =
          getString(toolResult, 'resultType') ??
          getString(toolResult, 'result_type');
        const resultText =
          getString(toolResult, 'textResultForLlm') ??
          getString(toolResult, 'text_result_for_llm') ??
          getString(toolResult, 'message');

        if (resultType === 'failure' || resultType === 'denied') {
          await this.emitStateChange(
            'agent.error',
            {
              ...sharedData,
              errorMessage:
                resultText ??
                `Copilot tool ${toolName ?? 'unknown'} finished with ${resultType}.`,
              errorType: inferCopilotErrorType(resultText) ?? 'tool_failure',
              raw: payload,
            },
            context,
          );
          return;
        }

        await this.emitStateChange(emittedType, sharedData, context);
        return;
      }
      case 'sessionEnd': {
        await this.emitStateChange('session.end', sharedData, context);
        return;
      }
      case 'errorOccurred': {
        const errorPayload = getRecord(payload.error);
        const errorMessage =
          getString(errorPayload, 'message') ??
          getString(payload, 'message');

        await this.emitStateChange(
          'agent.error',
          {
            ...sharedData,
            errorMessage,
            errorType: inferCopilotErrorType(errorMessage),
            raw: payload,
          },
          context,
        );
        return;
      }
      default:
        logger.debug({ hookEventName }, 'Copilot hook event ignored by adapter');
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
      logger.debug({ error, filePath }, 'Copilot transcript read skipped');
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
    filePath: string,
  ): Promise<void> {
    let parsedLine: unknown;

    try {
      parsedLine = JSON.parse(line) as unknown;
    } catch (error) {
      logger.warn({ error, filePath }, 'Copilot transcript line is not valid JSON');
      return;
    }

    if (!isRecord(parsedLine)) {
      return;
    }

    const rawSessionId = this.resolveRawSessionId(parsedLine) ?? inferSessionIdFromPath(filePath);

    if (!rawSessionId) {
      return;
    }

    const metadata = await this.resolveSessionMetadata(rawSessionId, parsedLine, filePath);
    const sessionId = resolveSessionId({
      cwd: metadata.cwd,
      project: metadata.repository,
      projectPath: metadata.gitRoot ?? metadata.cwd,
      sessionId: rawSessionId,
      tool: this.name,
    });
    const eventId = getString(parsedLine, 'id');
    const dedupeKey = eventId ? `${sessionId}:${eventId}` : undefined;

    if (dedupeKey) {
      if (this.observedEventIds.has(dedupeKey)) {
        return;
      }

      if (this.observedEventIds.size >= 4096) {
        this.observedEventIds.clear();
      }

      this.observedEventIds.add(dedupeKey);
    }

    const context: AdapterPublishContext = {
      cwd: metadata.cwd,
      sessionId,
      source: 'aisnitch://adapters/copilot-cli/session-state',
      transcriptPath: filePath,
    };
    const eventType = getString(parsedLine, 'type');
    const eventData = getRecord(parsedLine.data);

    switch (eventType) {
      case 'session.start': {
        await this.emitStateChange(
          'session.start',
          buildCopilotEventData(metadata, {
            raw: parsedLine,
          }),
          context,
        );
        await this.emitStateChange(
          'agent.idle',
          buildCopilotEventData(metadata, {
            raw: parsedLine,
          }),
          context,
        );
        return;
      }
      case 'user.message': {
        await this.emitStateChange(
          'task.start',
          buildCopilotEventData(metadata, {
            raw: {
              ...parsedLine,
              prompt: getString(eventData, 'content'),
            },
          }),
          context,
        );
        return;
      }
      case 'assistant.message': {
        await this.processAssistantMessage(parsedLine, metadata, context);
        return;
      }
      case 'tool.execution_start': {
        const toolName = getString(eventData, 'toolName');
        const toolInput = extractCopilotToolInput(eventData);
        const emittedType = isCopilotCodingTool(toolName, toolInput)
          ? 'agent.coding'
          : 'agent.tool_call';

        await this.emitStateChange(
          emittedType,
          buildCopilotEventData(metadata, {
            activeFile: toolInput?.filePath,
            raw: parsedLine,
            toolInput,
            toolName,
          }),
          context,
        );
        return;
      }
      case 'tool.execution_complete': {
        if (getBoolean(eventData, 'success') !== false) {
          return;
        }

        await this.emitStateChange(
          'agent.error',
          buildCopilotEventData(metadata, {
            errorMessage:
              extractLooseString(getRecord(eventData?.result), ['content']) ??
              'Tool execution failed',
            errorType: 'tool_failure',
            raw: parsedLine,
          }),
          context,
        );
        return;
      }
      case 'session.task_complete': {
        await this.emitStateChange(
          'task.complete',
          buildCopilotEventData(metadata, {
            raw: parsedLine,
          }),
          context,
        );
        return;
      }
      case 'session.error': {
        const errorMessage = getString(eventData, 'message');

        await this.emitStateChange(
          'agent.error',
          buildCopilotEventData(metadata, {
            errorMessage,
            errorType: inferCopilotErrorType(errorMessage),
            raw: parsedLine,
          }),
          context,
        );
        return;
      }
      case 'session.warning': {
        await this.emitStateChange(
          'agent.asking_user',
          buildCopilotEventData(metadata, {
            errorMessage: getString(eventData, 'message'),
            raw: parsedLine,
          }),
          context,
        );
        return;
      }
      case 'abort': {
        await this.emitStateChange(
          'agent.error',
          buildCopilotEventData(metadata, {
            errorMessage: 'Session aborted',
            errorType: 'api_error',
            raw: parsedLine,
          }),
          context,
        );
        return;
      }
      case 'session.model_change': {
        const model = getString(eventData, 'newModel');

        this.sessionMetadata.set(rawSessionId, {
          ...metadata,
          model: model ?? metadata.model,
        });
        return;
      }
      default:
        return;
    }
  }

  private async processAssistantMessage(
    payload: Record<string, unknown>,
    metadata: CopilotSessionMetadata,
    context: AdapterPublishContext,
  ): Promise<void> {
    const data = getRecord(payload.data);

    if (!data) {
      return;
    }

    const reasoningText = getString(data, 'reasoningText');
    const content = getString(data, 'content');

    if (reasoningText) {
      await this.emitStateChange(
        'agent.thinking',
        buildCopilotEventData(metadata, {
          raw: {
            message: {
              content: [
                {
                  thinking: reasoningText,
                  type: 'thinking',
                },
              ],
              role: 'assistant',
            },
            source: payload,
          },
        }),
        context,
      );
    }

    if (content) {
      await this.emitStateChange(
        'agent.streaming',
        buildCopilotEventData(metadata, {
          raw: {
            content,
            message: {
              content: [
                {
                  text: content,
                  type: 'text',
                },
              ],
              role: 'assistant',
            },
            source: payload,
          },
        }),
        context,
      );
    }
  }

  private async seedTranscriptOffsets(): Promise<void> {
    const files = await collectFilesRecursively(
      this.sessionStateDirectory,
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
  }

  private startProcessPolling(): void {
    if (this.pollIntervalMs <= 0) {
      return;
    }

    this.processPoller = setInterval(() => {
      void this.pollCopilotProcesses();
    }, this.pollIntervalMs);
    this.processPoller.unref();

    void this.pollCopilotProcesses();
  }

  private async pollCopilotProcesses(): Promise<void> {
    const processes = await listProcesses(this.processListCommand);

    if (processes.length > 0 && this.getStatus().activeSessions === 0) {
      const processInfo = processes[0];

      if (!processInfo) {
        return;
      }

      const sessionId = `copilot-cli-process-${processInfo.pid}`;

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
          source: 'aisnitch://adapters/copilot-cli/process-detect',
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
          source: 'aisnitch://adapters/copilot-cli/process-detect',
        },
      );
    }
  }

  private resolveRawSessionId(payload: Record<string, unknown>): string | undefined {
    return (
      getString(payload, 'sessionId') ??
      getString(payload, 'session_id') ??
      getString(getRecord(payload.data), 'sessionId') ??
      getString(getRecord(payload.data), 'session_id')
    );
  }

  private async resolveSessionMetadata(
    rawSessionId: string,
    payload?: Record<string, unknown>,
    filePath?: string,
  ): Promise<CopilotSessionMetadata> {
    const cachedMetadata = this.sessionMetadata.get(rawSessionId);
    const payloadMetadata = extractCopilotSessionMetadata(payload);

    if (payloadMetadata.cwd) {
      const mergedMetadata = {
        ...cachedMetadata,
        ...payloadMetadata,
        sessionId: rawSessionId,
      } satisfies CopilotSessionMetadata;

      this.sessionMetadata.set(rawSessionId, mergedMetadata);
      return mergedMetadata;
    }

    const fileMetadata = await readCopilotWorkspaceMetadata(
      this.sessionStateDirectory,
      rawSessionId,
      filePath,
    );
    const mergedMetadata = {
      ...cachedMetadata,
      ...fileMetadata,
      sessionId: rawSessionId,
    } satisfies CopilotSessionMetadata;

    this.sessionMetadata.set(rawSessionId, mergedMetadata);
    return mergedMetadata;
  }
}

function buildCopilotEventData(
  metadata: CopilotSessionMetadata,
  overrides: Partial<Omit<EventData, 'state'>> = {},
): Omit<EventData, 'state'> {
  return {
    cwd: overrides.cwd ?? metadata.cwd,
    model: overrides.model ?? metadata.model,
    project: overrides.project ?? metadata.repository,
    projectPath: overrides.projectPath ?? metadata.gitRoot ?? metadata.cwd,
    raw: overrides.raw,
    ...overrides,
  };
}

function extractCopilotHookToolInput(
  payload: Record<string, unknown>,
): ToolInput | undefined {
  const toolArgsValue =
    getString(payload, 'toolArgs') ?? getString(payload, 'tool_args');
  const directArguments =
    getRecord(payload.arguments) ?? getRecord(payload.toolArgs);
  const parsedArguments =
    directArguments ?? parseJsonRecord(toolArgsValue);

  return extractCopilotToolInput(parsedArguments);
}

function extractCopilotToolInput(
  payload: Record<string, unknown> | undefined,
): ToolInput | undefined {
  if (!payload) {
    return undefined;
  }

  const filePath = extractFirstString(payload, [
    'file',
    'file_path',
    'filePath',
    'path',
    'target',
    'target_path',
    'targetPath',
  ]);
  const command = extractFirstString(payload, [
    'cmd',
    'command',
    'script',
  ]);

  if (!filePath && !command) {
    return undefined;
  }

  return {
    command,
    filePath,
  };
}

function isCopilotCodingTool(
  toolName: string | undefined,
  toolInput: ToolInput | undefined,
): boolean {
  if (toolName && COPILOT_CODING_TOOL_HINT.test(toolName)) {
    return true;
  }

  const filePath = toolInput?.filePath;

  if (!filePath) {
    return false;
  }

  return !/glob|grep|list|read|search|view/iu.test(toolName ?? '');
}

function inferCopilotErrorType(
  errorMessage: string | undefined,
): ErrorType | undefined {
  if (!errorMessage) {
    return undefined;
  }

  if (/quota|credit|rate limit|too many requests/iu.test(errorMessage)) {
    return 'rate_limit';
  }

  if (/context|token limit|too long/iu.test(errorMessage)) {
    return 'context_overflow';
  }

  if (/tool/iu.test(errorMessage)) {
    return 'tool_failure';
  }

  return 'api_error';
}

function extractCopilotSessionMetadata(
  payload: Record<string, unknown> | undefined,
): Partial<CopilotSessionMetadata> {
  const data = getRecord(payload?.data);
  const context = getRecord(data?.context);

  return {
    branch:
      getString(context, 'branch') ??
      getString(payload, 'branch'),
    cwd:
      getString(context, 'cwd') ??
      getString(payload, 'cwd'),
    gitRoot:
      getString(context, 'gitRoot') ??
      getString(payload, 'gitRoot'),
    repository:
      getString(context, 'repository') ??
      getString(payload, 'repository'),
  };
}

async function readCopilotWorkspaceMetadata(
  sessionStateDirectory: string,
  rawSessionId: string,
  filePath?: string,
): Promise<Partial<CopilotSessionMetadata>> {
  const sessionDirectory = inferSessionDirectory(
    sessionStateDirectory,
    rawSessionId,
    filePath,
  );
  const workspacePath = join(sessionDirectory, 'workspace.yaml');

  try {
    const fileContent = await readFile(workspacePath, 'utf8');

    return parseCopilotWorkspaceYaml(fileContent);
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return {};
    }

    logger.debug({ error, rawSessionId }, 'Copilot workspace metadata read skipped');
    return {};
  }
}

function parseCopilotWorkspaceYaml(
  fileContent: string,
): Partial<CopilotSessionMetadata> {
  const metadata: {
    branch?: string;
    cwd?: string;
    gitRoot?: string;
    repository?: string;
  } = {};

  for (const line of fileContent.split(/\r?\n/u)) {
    const match = line.match(/^([a-z_]+):\s*(.+)$/u);

    if (!match) {
      continue;
    }

    const key = match[1];
    const value = match[2]?.trim();

    if (!value) {
      continue;
    }

    switch (key) {
      case 'branch':
        metadata.branch = value;
        break;
      case 'cwd':
        metadata.cwd = value;
        break;
      case 'git_root':
        metadata.gitRoot = value;
        break;
      case 'repository':
        metadata.repository = value;
        break;
      default:
        break;
    }
  }

  return metadata;
}

function inferSessionDirectory(
  sessionStateDirectory: string,
  rawSessionId: string,
  filePath?: string,
): string {
  if (filePath && basename(filePath) === 'events.jsonl') {
    return dirname(filePath);
  }

  return join(sessionStateDirectory, rawSessionId);
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

async function listProcesses(
  processListCommand: () => Promise<string>,
): Promise<CopilotProcessInfo[]> {
  try {
    const commandOutput = await processListCommand();

    return commandOutput
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [pidPart, ...commandParts] = line.split(/\s+/u);
        const pid = pidPart ? Number.parseInt(pidPart, 10) : Number.NaN;

        return {
          command: commandParts.join(' '),
          pid,
        } satisfies CopilotProcessInfo;
      })
      .filter((processInfo) => Number.isInteger(processInfo.pid));
  } catch (error) {
    logger.debug({ error }, 'Copilot process listing skipped');
    return [];
  }
}

function inferSessionIdFromPath(filePath: string): string | undefined {
  const fileName = basename(filePath);

  if (fileName === 'events.jsonl') {
    return basename(dirname(filePath));
  }

  return fileName.endsWith('.jsonl') ? basename(fileName, '.jsonl') : undefined;
}

function parseJsonRecord(
  value: string | undefined,
): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsedValue = JSON.parse(value) as unknown;

    return getRecord(parsedValue);
  } catch {
    return undefined;
  }
}

function extractLooseString(
  payload: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | undefined {
  if (!payload) {
    return undefined;
  }

  for (const key of keys) {
    const directValue = getString(payload, key);

    if (directValue) {
      return directValue;
    }

    const nestedValue = getString(getRecord(payload[key]), 'content');

    if (nestedValue) {
      return nestedValue;
    }
  }

  return undefined;
}

function extractFirstString(
  payload: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | undefined {
  if (!payload) {
    return undefined;
  }

  for (const key of keys) {
    const directValue = getString(payload, key);

    if (directValue) {
      return directValue;
    }
  }

  return undefined;
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(
  payload: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (!payload) {
    return undefined;
  }

  const value = payload[key];

  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function getBoolean(
  payload: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined {
  if (!payload) {
    return undefined;
  }

  const value = payload[key];

  return typeof value === 'boolean' ? value : undefined;
}

function isErrnoException(
  error: unknown,
): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
