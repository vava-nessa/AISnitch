import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';

import { watch, type FSWatcher } from 'chokidar';
import pidCwd from 'pid-cwd';

import { logger } from '../core/engine/logger.js';
import { resolveSessionId } from '../core/session-identity.js';
import type {
  AISnitchEventType,
  ErrorType,
  EventData,
} from '../core/events/types.js';
import {
  type AdapterPublishContext,
  type AdapterRuntimeOptions,
  BaseAdapter,
  type InterceptionStrategy,
} from './base.js';

/**
 * @file src/adapters/aider.ts
 * @description Aider adapter combining passive markdown history parsing, notifications-command hooks, and active process discovery.
 * @functions
 *   → parseAiderHistoryMarkdown
 * @exports AiderAdapter, AiderAdapterOptions, AiderHistoryObservation, AiderHistoryParseResult, parseAiderHistoryMarkdown
 * @see ./base.ts
 * @see ../cli/commands/setup.ts
 * @see ../../tasks/06-adapters-secondary/03_adapters-secondary_aider-pty_DONE.md
 */

const execFile = promisify(execFileCallback);

const DEFAULT_AIDER_HISTORY_FILE = '.aider.chat.history.md';
const AIDER_ERROR_HINT =
  /failed|error|exception|keyboardinterrupt|did not conform|traceback/iu;
const AIDER_ASKING_USER_HINT =
  /\b\(Y(?:es)?\/N(?:o)?\)|\bPress Enter\b|\bcontinue\?\b|\bcontinue to exit\b/iu;
const AIDER_FILE_COMMAND_HINT = /^\/(?:add|drop|read-only)\b/iu;
const AIDER_STARTUP_STATUS_HINT =
  /^(?:\/.+\/aider|Aider v|Main model:|Model:|Weak model:|Git repo:|Repo-map:)/u;

export interface AiderAdapterOptions extends AdapterRuntimeOptions {
  readonly cwdResolver?: (pid: number) => Promise<string | undefined>;
  readonly historyFileName?: string;
  readonly pollIntervalMs?: number;
  readonly processListCommand?: () => Promise<string>;
  readonly watcherFactory?: (
    paths: string,
    options: Parameters<typeof watch>[1],
  ) => FSWatcher;
}

interface AiderProcessInfo {
  readonly command: string;
  readonly pid: number;
}

interface AiderSessionRuntime {
  readonly cwd: string;
  readonly historyPath: string;
  readonly pids: readonly number[];
  readonly sessionId: string;
  readonly model?: string;
}

interface AiderHistoryWatcher {
  readonly fingerprints: Set<string>;
  readonly watcher: FSWatcher;
}

interface AiderHistoryParseOptions {
  readonly cwd: string;
  readonly historyPath: string;
  readonly initialModel?: string;
}

export interface AiderHistoryObservation {
  readonly fingerprint: string;
  readonly type: AISnitchEventType;
  readonly data: Omit<EventData, 'state'>;
}

export interface AiderHistoryParseResult {
  readonly lastModel?: string;
  readonly observations: readonly AiderHistoryObservation[];
}

/**
 * 📖 Aider's transcript is markdown, not a stable machine API. The parser
 * therefore sticks to high-signal structures: prompts, quoted status lines,
 * assistant prose, and SEARCH/REPLACE file blocks.
 */
export class AiderAdapter extends BaseAdapter {
  public override readonly displayName = 'Aider';

  public override readonly name = 'aider' as const;

  public override readonly strategies: readonly InterceptionStrategy[] = [
    'hooks',
    'log-watch',
    'process-detect',
  ];

  private readonly cwdResolver: (pid: number) => Promise<string | undefined>;

  private readonly historyFileName: string;

  private readonly historySessions = new Map<string, AiderSessionRuntime>();

  private readonly historyWatchers = new Map<string, AiderHistoryWatcher>();

  private readonly pollIntervalMs: number;

  private processPoller: NodeJS.Timeout | null = null;

  private readonly processListCommand: () => Promise<string>;

  private readonly watcherFactory: (
    paths: string,
    options: Parameters<typeof watch>[1],
  ) => FSWatcher;

  public constructor(options: AiderAdapterOptions) {
    super(options);
    this.cwdResolver =
      options.cwdResolver ??
      (async (pid) => {
        return await pidCwd(pid);
      });
    this.historyFileName = options.historyFileName ?? DEFAULT_AIDER_HISTORY_FILE;
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.processListCommand =
      options.processListCommand ??
      (async () =>
        await execFile('pgrep', ['-lf', '(^|[ /])aider([ ]|$)']).then(
          (result) => result.stdout,
        ));
    this.watcherFactory = options.watcherFactory ?? watch;
  }

  public override start(): Promise<void> {
    if (this.getStatus().running) {
      return Promise.resolve();
    }

    this.setRunning(true);
    this.startProcessPolling();

    return Promise.resolve();
  }

  public override async stop(): Promise<void> {
    if (this.processPoller !== null) {
      clearInterval(this.processPoller);
      this.processPoller = null;
    }

    for (const watcherHandle of this.historyWatchers.values()) {
      await watcherHandle.watcher.close();
    }

    this.historySessions.clear();
    this.historyWatchers.clear();
    this.setRunning(false);
  }

  public override async handleHook(payload: unknown): Promise<void> {
    const normalizedPayload = this.parseNormalizedHookPayload(payload);

    if (normalizedPayload === null) {
      logger.debug({ payload }, 'Aider ignores non-normalized hook payloads');
      return;
    }

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
  }

  private startProcessPolling(): void {
    if (this.pollIntervalMs > 0) {
      this.processPoller = setInterval(() => {
        void this.pollAiderProcesses();
      }, this.pollIntervalMs);
      this.processPoller.unref();
    }

    void this.pollAiderProcesses();
  }

  private async pollAiderProcesses(): Promise<void> {
    const processes = await listAiderProcesses(this.processListCommand);
    const nextSessions = new Map<string, AiderSessionRuntime>();

    for (const processInfo of processes) {
      const cwd = await this.cwdResolver(processInfo.pid);

      if (!cwd) {
        continue;
      }

      const historyPath = resolveAiderHistoryPath(
        cwd,
        processInfo.command,
        this.historyFileName,
      );
      const existingSession = nextSessions.get(historyPath);

      if (existingSession) {
        nextSessions.set(historyPath, {
          ...existingSession,
          pids: [...existingSession.pids, processInfo.pid],
        });
        continue;
      }

      const previousSession = this.historySessions.get(historyPath);
      const sessionId =
        previousSession?.sessionId ??
        resolveSessionId({
          cwd,
          tool: this.name,
          transcriptPath: historyPath,
        });

      nextSessions.set(historyPath, {
        cwd,
        historyPath,
        model: previousSession?.model,
        pids: [processInfo.pid],
        sessionId,
      });
    }

    for (const [historyPath, session] of nextSessions) {
      if (this.historySessions.has(historyPath)) {
        this.historySessions.set(historyPath, session);
        continue;
      }

      this.historySessions.set(historyPath, session);
      await this.ensureHistoryWatcher(session);
      await this.emitHistoryEvent(
        session,
        'session.start',
        {
          project: basename(session.cwd) || session.cwd,
          projectPath: session.cwd,
          raw: {
            historyPath,
            pids: session.pids,
            source: 'process-detect',
          },
        },
        {
          pid: session.pids[0],
          source: 'aisnitch://adapters/aider/process-detect',
        },
      );
      await this.emitHistoryEvent(
        session,
        'agent.idle',
        {
          model: session.model,
          project: basename(session.cwd) || session.cwd,
          projectPath: session.cwd,
          raw: {
            historyPath,
            source: 'process-detect',
          },
        },
        {
          pid: session.pids[0],
          source: 'aisnitch://adapters/aider/process-detect',
        },
      );
    }

    for (const [historyPath, previousSession] of this.historySessions) {
      if (nextSessions.has(historyPath)) {
        continue;
      }

      await this.emitHistoryEvent(
        previousSession,
        'session.end',
        {
          model: previousSession.model,
          project: basename(previousSession.cwd) || previousSession.cwd,
          projectPath: previousSession.cwd,
          raw: {
            historyPath,
            reason: 'process-exit',
            source: 'process-detect',
          },
        },
        {
          pid: previousSession.pids[0],
          source: 'aisnitch://adapters/aider/process-detect',
        },
      );
      await this.releaseHistoryWatcher(historyPath);
      this.historySessions.delete(historyPath);
    }
  }

  private async ensureHistoryWatcher(
    session: AiderSessionRuntime,
  ): Promise<void> {
    if (this.historyWatchers.has(session.historyPath)) {
      return;
    }

    const fingerprintSet = new Set<string>();
    const seedResult = await readOptionalAiderHistory(session);

    if (seedResult !== null) {
      for (const observation of seedResult.observations) {
        fingerprintSet.add(observation.fingerprint);
      }

      if (seedResult.lastModel) {
        this.historySessions.set(session.historyPath, {
          ...session,
          model: seedResult.lastModel,
        });
      }
    }

    const watcher = this.watcherFactory(session.historyPath, {
      awaitWriteFinish: {
        stabilityThreshold: 200,
      },
      ignoreInitial: true,
    });

    watcher.on('add', () => {
      void this.processHistoryUpdate(session.historyPath);
    });
    watcher.on('change', () => {
      void this.processHistoryUpdate(session.historyPath);
    });
    watcher.on('error', (error) => {
      logger.warn(
        {
          error,
          historyPath: session.historyPath,
        },
        'Aider history watcher error',
      );
    });

    this.historyWatchers.set(session.historyPath, {
      fingerprints: fingerprintSet,
      watcher,
    });
  }

  private async processHistoryUpdate(historyPath: string): Promise<void> {
    const session = this.historySessions.get(historyPath);
    const watcherHandle = this.historyWatchers.get(historyPath);

    if (!session || !watcherHandle) {
      return;
    }

    const parseResult = await readOptionalAiderHistory(session);

    if (parseResult === null) {
      return;
    }

    if (parseResult.lastModel !== session.model) {
      this.historySessions.set(historyPath, {
        ...session,
        model: parseResult.lastModel,
      });
    }

    for (const observation of parseResult.observations) {
      if (watcherHandle.fingerprints.has(observation.fingerprint)) {
        continue;
      }

      watcherHandle.fingerprints.add(observation.fingerprint);
      await this.emitHistoryEvent(
        this.historySessions.get(historyPath) ?? session,
        observation.type,
        observation.data,
        {
          pid: session.pids[0],
          source: 'aisnitch://adapters/aider/history',
        },
      );
    }
  }

  private async emitHistoryEvent(
    session: AiderSessionRuntime,
    type: AISnitchEventType,
    data: Omit<EventData, 'state'>,
    context: Omit<AdapterPublishContext, 'sessionId' | 'cwd' | 'transcriptPath'>,
  ): Promise<void> {
    await this.emitStateChange(
      type,
      {
        cwd: session.cwd,
        model: data.model ?? session.model,
        project: data.project ?? (basename(session.cwd) || session.cwd),
        projectPath: data.projectPath ?? session.cwd,
        ...data,
      },
      {
        ...context,
        cwd: session.cwd,
        sessionId: session.sessionId,
        transcriptPath: session.historyPath,
      },
    );
  }

  private async releaseHistoryWatcher(historyPath: string): Promise<void> {
    const watcherHandle = this.historyWatchers.get(historyPath);

    if (!watcherHandle) {
      return;
    }

    await watcherHandle.watcher.close();
    this.historyWatchers.delete(historyPath);
  }
}

/**
 * Parses an aider markdown history file into normalized AISnitch observations.
 */
export function parseAiderHistoryMarkdown(
  markdown: string,
  options: AiderHistoryParseOptions,
): AiderHistoryParseResult {
  const observations: AiderHistoryObservation[] = [];
  const lines = markdown.split(/\r?\n/u);
  let model = options.initialModel;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';

    if (line.startsWith('# aider chat started at ')) {
      continue;
    }

    if (line.startsWith('#### ')) {
      const prompt = line.slice(5).trim();

      if (prompt.length === 0) {
        continue;
      }

      observations.push(createPromptObservation(prompt, index, {
        cwd: options.cwd,
        historyPath: options.historyPath,
        model,
      }));
      continue;
    }

    if (line.startsWith('>')) {
      const block = collectQuotedBlock(lines, index);
      const parsedBlock = parseQuotedOutputBlock(block.lines, {
        cwd: options.cwd,
        historyPath: options.historyPath,
        lineIndex: index,
        model,
      });

      observations.push(...parsedBlock.observations);
      model = parsedBlock.lastModel ?? model;
      index = block.nextIndex - 1;
      continue;
    }

    if (isAiderPatchBlockStart(lines, index)) {
      const patchBlock = collectPatchBlock(lines, index);
      observations.push(
        createCodingObservation(
          patchBlock.activeFile,
          patchBlock.body,
          index,
          {
            cwd: options.cwd,
            historyPath: options.historyPath,
            model,
          },
        ),
      );
      index = patchBlock.nextIndex - 1;
      continue;
    }

    if (line.trim().length === 0) {
      continue;
    }

    const proseBlock = collectProseBlock(lines, index);

    if (proseBlock.body.length > 0) {
      observations.push(
        createStreamingObservation(proseBlock.body, index, {
          cwd: options.cwd,
          historyPath: options.historyPath,
          model,
        }),
      );
    }

    index = proseBlock.nextIndex - 1;
  }

  return {
    lastModel: model,
    observations,
  };
}

async function readOptionalAiderHistory(
  session: AiderSessionRuntime,
): Promise<AiderHistoryParseResult | null> {
  try {
    const content = await readFile(session.historyPath, 'utf8');

    return parseAiderHistoryMarkdown(content, {
      cwd: session.cwd,
      historyPath: session.historyPath,
      initialModel: session.model,
    });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null;
    }

    throw error;
  }
}

function createPromptObservation(
  prompt: string,
  lineIndex: number,
  context: {
    readonly cwd: string;
    readonly historyPath: string;
    readonly model?: string;
  },
): AiderHistoryObservation {
  if (prompt.startsWith('/')) {
    const slashCommand = parseAiderSlashCommand(prompt);

    return {
      data: {
        activeFile: slashCommand.filePath,
        model: context.model,
        raw: {
          historyPath: context.historyPath,
          prompt,
          source: 'history-markdown',
        },
        toolInput: slashCommand.filePath
          ? {
              filePath: slashCommand.filePath,
            }
          : {
              command: prompt,
            },
        toolName: `aider:${slashCommand.name}`,
      },
      fingerprint: createHistoryFingerprint(
        'agent.tool_call',
        lineIndex,
        prompt,
        slashCommand.filePath,
      ),
      type: 'agent.tool_call',
    };
  }

  return {
    data: {
      model: context.model,
      raw: {
        historyPath: context.historyPath,
        prompt,
        source: 'history-markdown',
      },
    },
    fingerprint: createHistoryFingerprint('task.start', lineIndex, prompt),
    type: 'task.start',
  };
}

function parseQuotedOutputBlock(
  quotedLines: readonly string[],
  context: {
    readonly cwd: string;
    readonly historyPath: string;
    readonly lineIndex: number;
    readonly model?: string;
  },
): AiderHistoryParseResult {
  const observations: AiderHistoryObservation[] = [];
  let lastModel = context.model;
  const leftoverLines: string[] = [];

  for (let offset = 0; offset < quotedLines.length; offset += 1) {
    const rawLine = quotedLines[offset] ?? '';
    const line = rawLine.trim();

    if (line.length === 0) {
      continue;
    }

    const parsedModel = parseAiderModelLine(line);

    if (parsedModel) {
      lastModel = parsedModel;
      continue;
    }

    if (AIDER_STARTUP_STATUS_HINT.test(line)) {
      continue;
    }

    const tokenCount = parseAiderTokenUsage(line);

    if (tokenCount !== undefined) {
      observations.push({
        data: {
          model: lastModel,
          raw: {
            historyPath: context.historyPath,
            output: line,
            source: 'history-markdown',
          },
          tokensUsed: tokenCount,
        },
        fingerprint: createHistoryFingerprint(
          'agent.thinking',
          context.lineIndex + offset,
          line,
        ),
        type: 'agent.thinking',
      });
      continue;
    }

    const addedFileMatch = line.match(/^Added\s+(.+?)\s+to the chat$/u);

    if (addedFileMatch) {
      const addedFile = addedFileMatch[1]?.trim();

      if (addedFile) {
        observations.push({
          data: {
            activeFile: addedFile,
            model: lastModel,
            raw: {
              historyPath: context.historyPath,
              output: line,
              source: 'history-markdown',
            },
            toolInput: {
              filePath: addedFile,
            },
            toolName: 'aider:/add',
          },
          fingerprint: createHistoryFingerprint(
            'agent.tool_call',
            context.lineIndex + offset,
            line,
            addedFile,
          ),
          type: 'agent.tool_call',
        });
        continue;
      }
    }

    const appliedEditMatch = line.match(
      /^(?:Applied|Updated|Edited|Created|Wrote)\s+(.+?)$/u,
    );

    if (appliedEditMatch) {
      const activeFile = appliedEditMatch[1]?.trim();

      if (activeFile) {
        observations.push(createCodingObservation(activeFile, line, context.lineIndex + offset, {
          cwd: context.cwd,
          historyPath: context.historyPath,
          model: lastModel,
        }));
        continue;
      }
    }

    if (AIDER_ASKING_USER_HINT.test(line)) {
      observations.push({
        data: {
          model: lastModel,
          raw: {
            historyPath: context.historyPath,
            output: line,
            source: 'history-markdown',
          },
        },
        fingerprint: createHistoryFingerprint(
          'agent.asking_user',
          context.lineIndex + offset,
          line,
        ),
        type: 'agent.asking_user',
      });
      continue;
    }

    if (AIDER_ERROR_HINT.test(line)) {
      observations.push({
        data: {
          errorMessage: line,
          errorType: classifyAiderErrorType(line),
          model: lastModel,
          raw: {
            historyPath: context.historyPath,
            output: line,
            source: 'history-markdown',
          },
        },
        fingerprint: createHistoryFingerprint(
          'agent.error',
          context.lineIndex + offset,
          line,
        ),
        type: 'agent.error',
      });
      continue;
    }

    leftoverLines.push(line);
  }

  if (leftoverLines.length > 0) {
    const body = leftoverLines.join('\n').trim();

    observations.push({
      data: {
        model: lastModel,
        raw: {
          historyPath: context.historyPath,
          output: body,
          source: 'history-markdown',
        },
      },
      fingerprint: createHistoryFingerprint(
        'agent.thinking',
        context.lineIndex,
        body,
      ),
      type: 'agent.thinking',
    });
  }

  return {
    lastModel,
    observations,
  };
}

function createStreamingObservation(
  body: string,
  lineIndex: number,
  context: {
    readonly cwd: string;
    readonly historyPath: string;
    readonly model?: string;
  },
): AiderHistoryObservation {
  return {
    data: {
      model: context.model,
      raw: {
        historyPath: context.historyPath,
        output: body,
        source: 'history-markdown',
      },
    },
    fingerprint: createHistoryFingerprint('agent.streaming', lineIndex, body),
    type: 'agent.streaming',
  };
}

function createCodingObservation(
  activeFile: string,
  body: string,
  lineIndex: number,
  context: {
    readonly cwd: string;
    readonly historyPath: string;
    readonly model?: string;
  },
): AiderHistoryObservation {
  return {
    data: {
      activeFile,
      model: context.model,
      raw: {
        historyPath: context.historyPath,
        output: body,
        source: 'history-markdown',
      },
      toolInput: {
        filePath: activeFile,
      },
      toolName: 'search-replace',
    },
    fingerprint: createHistoryFingerprint(
      'agent.coding',
      lineIndex,
      body,
      activeFile,
    ),
    type: 'agent.coding',
  };
}

function collectQuotedBlock(
  lines: readonly string[],
  startIndex: number,
): {
  readonly lines: readonly string[];
  readonly nextIndex: number;
} {
  const blockLines: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const currentLine = lines[index];

    if (!currentLine?.startsWith('>')) {
      break;
    }

    blockLines.push(currentLine.replace(/^>\s?/u, ''));
    index += 1;
  }

  return {
    lines: blockLines,
    nextIndex: index,
  };
}

function collectProseBlock(
  lines: readonly string[],
  startIndex: number,
): {
  readonly body: string;
  readonly nextIndex: number;
} {
  const proseLines: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const currentLine = lines[index] ?? '';

    if (
      currentLine.trim().length === 0 ||
      currentLine.startsWith('# aider chat started at ') ||
      currentLine.startsWith('#### ') ||
      currentLine.startsWith('>') ||
      isAiderPatchBlockStart(lines, index)
    ) {
      break;
    }

    proseLines.push(currentLine);
    index += 1;
  }

  return {
    body: proseLines.join('\n').trim(),
    nextIndex: index,
  };
}

function collectPatchBlock(
  lines: readonly string[],
  startIndex: number,
): {
  readonly activeFile: string;
  readonly body: string;
  readonly nextIndex: number;
} {
  const activeFile = (lines[startIndex] ?? '').trim();
  const blockLines = [activeFile];
  let index = startIndex + 1;

  while (index < lines.length) {
    const currentLine = lines[index] ?? '';

    if (
      currentLine.startsWith('#### ') ||
      currentLine.startsWith('# aider chat started at ') ||
      currentLine.startsWith('> ')
    ) {
      break;
    }

    if (
      currentLine.trim().length === 0 &&
      !looksLikePatchMarker(lines[index + 1] ?? '')
    ) {
      blockLines.push(currentLine);
      index += 1;
      break;
    }

    blockLines.push(currentLine);
    index += 1;
  }

  return {
    activeFile,
    body: blockLines.join('\n').trim(),
    nextIndex: index,
  };
}

function isAiderPatchBlockStart(
  lines: readonly string[],
  index: number,
): boolean {
  const currentLine = (lines[index] ?? '').trim();
  const nextLine = lines[index + 1] ?? '';

  if (
    currentLine.length === 0 ||
    currentLine.startsWith('#') ||
    currentLine.startsWith('>') ||
    currentLine.startsWith('#### ')
  ) {
    return false;
  }

  return looksLikePatchMarker(nextLine);
}

function looksLikePatchMarker(line: string): boolean {
  const trimmedLine = line.trim();

  return (
    trimmedLine.startsWith('<<<<<<< ') ||
    trimmedLine.startsWith('=======') ||
    trimmedLine.startsWith('>>>>>>> ')
  );
}

function parseAiderModelLine(line: string): string | undefined {
  const modelMatch = line.match(/^(?:Main model|Model):\s*(.+?)(?:\s+with\s+|$)/u);

  return modelMatch?.[1]?.trim() || undefined;
}

function parseAiderTokenUsage(line: string): number | undefined {
  const tokenMatch = line.match(
    /Tokens:\s+([0-9.]+[kKmM]?)\s+sent,\s+([0-9.]+[kKmM]?)\s+received/u,
  );

  if (!tokenMatch) {
    return undefined;
  }

  const sentTokens = parseHumanTokenCount(tokenMatch[1]);
  const receivedTokens = parseHumanTokenCount(tokenMatch[2]);

  if (sentTokens === undefined || receivedTokens === undefined) {
    return undefined;
  }

  return sentTokens + receivedTokens;
}

function parseHumanTokenCount(rawValue: string | undefined): number | undefined {
  if (!rawValue) {
    return undefined;
  }

  const match = rawValue.trim().match(/^([0-9]+(?:\.[0-9]+)?)([kKmM])?$/u);

  if (!match) {
    return undefined;
  }

  const numericValue = Number.parseFloat(match[1] ?? '');

  if (!Number.isFinite(numericValue)) {
    return undefined;
  }

  const suffix = match[2]?.toLowerCase();

  if (suffix === 'k') {
    return Math.round(numericValue * 1_000);
  }

  if (suffix === 'm') {
    return Math.round(numericValue * 1_000_000);
  }

  return Math.round(numericValue);
}

function parseAiderSlashCommand(prompt: string): {
  readonly filePath?: string;
  readonly name: string;
} {
  const normalizedPrompt = prompt.trim();
  const commandName = normalizedPrompt
    .slice(1)
    .split(/\s+/u)[0]
    ?.toLowerCase();
  const filePath = AIDER_FILE_COMMAND_HINT.test(normalizedPrompt)
    ? normalizedPrompt.split(/\s+/u).slice(1).join(' ').trim() || undefined
    : undefined;

  return {
    filePath,
    name: commandName ?? 'command',
  };
}

function createHistoryFingerprint(
  type: AISnitchEventType,
  lineIndex: number,
  text: string,
  activeFile?: string,
): string {
  return [
    type,
    String(lineIndex),
    activeFile ?? '',
    text.trim().replace(/\s+/gu, ' ').slice(0, 240),
  ].join('::');
}

function classifyAiderErrorType(message: string): ErrorType {
  if (/rate limit|quota|too many requests/iu.test(message)) {
    return 'rate_limit';
  }

  if (/context|token limit|context window/iu.test(message)) {
    return 'context_overflow';
  }

  if (/search\/replace|edit format|apply|patch|write/iu.test(message)) {
    return 'tool_failure';
  }

  return 'api_error';
}

function resolveAiderHistoryPath(
  cwd: string,
  command: string,
  fallbackHistoryFileName: string,
): string {
  const configuredHistoryPath =
    extractCommandOptionValue(command, 'chat-history-file') ??
    extractCommandOptionValue(command, 'chat_history_file');

  if (!configuredHistoryPath) {
    return join(cwd, fallbackHistoryFileName);
  }

  return configuredHistoryPath.startsWith('/')
    ? configuredHistoryPath
    : join(cwd, configuredHistoryPath);
}

function extractCommandOptionValue(
  command: string,
  optionName: string,
): string | undefined {
  const matcher = new RegExp(
    `(?:^|\\s)--${escapeForRegExp(optionName)}(?:=|\\s+)("([^"]+)"|'([^']+)'|(\\S+))`,
    'u',
  );
  const match = command.match(matcher);

  return match?.[2] ?? match?.[3] ?? match?.[4] ?? undefined;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

async function listAiderProcesses(
  processListCommand: () => Promise<string>,
): Promise<readonly AiderProcessInfo[]> {
  try {
    const output = await processListCommand();

    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const match = line.match(/^(\d+)\s+(.+)$/u);

        if (!match) {
          return null;
        }

        const pid = Number.parseInt(match[1] ?? '', 10);
        const command = match[2]?.trim();

        if (!Number.isInteger(pid) || pid <= 0 || !command) {
          return null;
        }

        return {
          command,
          pid,
        } satisfies AiderProcessInfo;
      })
      .filter((processInfo): processInfo is AiderProcessInfo => processInfo !== null);
  } catch (error: unknown) {
    logger.debug({ error }, 'Aider process discovery returned no matches');
    return [];
  }
}
