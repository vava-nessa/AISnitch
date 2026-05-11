import { execFile as execFileCallback } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { promisify } from 'node:util';

import { watch, type FSWatcher } from 'chokidar';
import pidCwd from 'pid-cwd';

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
 * @file src/adapters/openclaw.ts
 * @description OpenClaw adapter combining managed hook ingestion, Plugin SDK events, bundled command logs, transcript watching, workspace-memory watching, and process fallback detection.
 * @functions
 *   → none
 * @exports OpenClawAdapter, OpenClawAdapterOptions
 * @see ./base.ts
 * @see ../cli/commands/setup.ts
 * @see ../../tasks/tasks.md
 */

const execFile = promisify(execFileCallback);

const COMMAND_START_THINKING_DELAY_MS = 2_000;
const POST_TOOL_THINKING_DELAY_MS = 500;
const OPENCLAW_CODING_TOOL_HINT =
  /apply|bash|create|delete|edit|exec|file|patch|replace|shell|write/iu;
const OPENCLAW_ERROR_HINT =
  /denied|error|exception|failed|quota|rate limit|refused|timeout/iu;

export interface OpenClawAdapterOptions extends AdapterRuntimeOptions {
  readonly agentsDirectory?: string;
  readonly commandsLogPath?: string;
  readonly cwdResolver?: (pid: number) => Promise<string | undefined>;
  readonly pollIntervalMs?: number;
  readonly processListCommand?: () => Promise<string>;
  readonly watcherFactory?: (
    paths: Parameters<typeof watch>[0],
    options: Parameters<typeof watch>[1],
  ) => FSWatcher;
}

interface OpenClawProcessInfo {
  readonly command: string;
  readonly pid: number;
}

interface OpenClawSessionSnapshot {
  readonly cwd?: string;
  readonly project?: string;
  readonly sessionId: string;
  readonly sessionKey?: string;
  readonly transcriptPath?: string;
}

interface PendingThinkingState {
  readonly context: AdapterPublishContext;
  readonly data: Omit<EventData, 'state'>;
}

/**
 * 📖 OpenClaw has several passive surfaces, but none of them is perfect alone.
 * AISnitch therefore merges the real managed hook path with a Plugin SDK
 * integration, filesystem watchers, and process fallbacks so operators still
 * get signal when setup is partial.
 *
 * The Plugin strategy (via `aisnitch setup openclaw`) installs a managed
 * OpenClaw plugin at `~/.openclaw/plugins/aisnitch-monitor/` that uses the
 * Plugin SDK hooks (`before_tool_call`, `after_tool_call`, `agent_end`,
 * `model_call_started`, `model_call_ended`, etc.) to forward rich real-time
 * payloads to the AISnitch HTTP receiver. This gives the highest-fidelity
 * signal — tool names, parameters, results, errors, durations, model info —
 * without any filesystem polling.
 */
export class OpenClawAdapter extends BaseAdapter {
  public override readonly displayName = 'OpenClaw';

  public override readonly name = 'openclaw' as const;

  public override readonly strategies: readonly InterceptionStrategy[] = [
    'plugin',
    'hooks',
    'log-watch',
    'jsonl-watch',
    'process-detect',
  ];

  private readonly agentsDirectory: string;

  private readonly commandsLogPath: string;

  private commandsLogWatcher: FSWatcher | null = null;

  private readonly cwdResolver: (pid: number) => Promise<string | undefined>;

  private readonly fallbackProcessSessions = new Map<number, string>();

  private readonly observedTranscriptEntries = new Set<string>();

  private readonly pendingThinking = new Map<string, NodeJS.Timeout>();

  private readonly pendingThinkingState = new Map<string, PendingThinkingState>();

  private readonly pollIntervalMs: number;

  private processPoller: NodeJS.Timeout | null = null;

  private readonly processListCommand: () => Promise<string>;

  private readonly sessionSnapshots = new Map<string, OpenClawSessionSnapshot>();

  private readonly startedSessions = new Set<string>();

  private transcriptWatcher: FSWatcher | null = null;

  private readonly watcherFactory: (
    paths: Parameters<typeof watch>[0],
    options: Parameters<typeof watch>[1],
  ) => FSWatcher;

  private readonly memoryRootGlobs: readonly string[];

  private memoryWatcher: FSWatcher | null = null;

  private readonly fileOffsets = new Map<string, number>();

  private readonly fileRemainders = new Map<string, string>();

  public constructor(options: OpenClawAdapterOptions) {
    super(options);

    const openclawHome = join(this.getUserHomeDirectory(), '.openclaw');

    this.agentsDirectory = options.agentsDirectory ?? join(openclawHome, 'agents');
    this.commandsLogPath =
      options.commandsLogPath ?? join(openclawHome, 'logs', 'commands.log');
    this.cwdResolver =
      options.cwdResolver ??
      (async (pid) => {
        return await pidCwd(pid);
      });
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.processListCommand =
      options.processListCommand ??
      (async () =>
        await execFile('pgrep', ['-ifl', 'openclaw']).then(
          (result) => result.stdout,
        ));
    this.watcherFactory = options.watcherFactory ?? watch;
    this.memoryRootGlobs = [
      join(openclawHome, 'workspace', 'MEMORY.md'),
      join(openclawHome, 'workspace', 'memory', '*.md'),
      join(openclawHome, 'workspace-*', 'MEMORY.md'),
      join(openclawHome, 'workspace-*', 'memory', '*.md'),
    ];
  }

  public override async start(): Promise<void> {
    if (this.getStatus().running) {
      return;
    }

    this.setRunning(true);
    await Promise.all([
      this.seedCommandsLogOffset(),
      this.seedMemoryOffsets(),
      this.seedTranscriptOffsets(),
    ]);

    this.commandsLogWatcher = this.watcherFactory(this.commandsLogPath, {
      awaitWriteFinish: {
        stabilityThreshold: 200,
      },
      ignoreInitial: true,
    });
    this.commandsLogWatcher.on('add', (filePath) => {
      void this.processCommandsLogUpdate(filePath, true);
    });
    this.commandsLogWatcher.on('change', (filePath) => {
      void this.processCommandsLogUpdate(filePath, false);
    });
    this.commandsLogWatcher.on('error', (error) => {
      logger.warn({ error }, 'OpenClaw commands.log watcher error');
    });

    this.transcriptWatcher = this.watcherFactory(
      join(this.agentsDirectory, '*', 'sessions', '*.jsonl'),
      {
        awaitWriteFinish: {
          stabilityThreshold: 200,
        },
        ignoreInitial: true,
      },
    );
    this.transcriptWatcher.on('add', (filePath) => {
      void this.processTranscriptUpdate(filePath, true);
    });
    this.transcriptWatcher.on('change', (filePath) => {
      void this.processTranscriptUpdate(filePath, false);
    });
    this.transcriptWatcher.on('error', (error) => {
      logger.warn({ error }, 'OpenClaw transcript watcher error');
    });

    this.memoryWatcher = this.watcherFactory([...this.memoryRootGlobs], {
      awaitWriteFinish: {
        stabilityThreshold: 300,
      },
      ignoreInitial: true,
    });
    this.memoryWatcher.on('add', (filePath) => {
      void this.processMemoryUpdate(filePath, true);
    });
    this.memoryWatcher.on('change', (filePath) => {
      void this.processMemoryUpdate(filePath, false);
    });
    this.memoryWatcher.on('error', (error) => {
      logger.warn({ error }, 'OpenClaw memory watcher error');
    });

    this.startProcessPolling();
  }

  public override async stop(): Promise<void> {
    if (this.commandsLogWatcher !== null) {
      await this.commandsLogWatcher.close();
      this.commandsLogWatcher = null;
    }

    if (this.transcriptWatcher !== null) {
      await this.transcriptWatcher.close();
      this.transcriptWatcher = null;
    }

    if (this.memoryWatcher !== null) {
      await this.memoryWatcher.close();
      this.memoryWatcher = null;
    }

    if (this.processPoller !== null) {
      clearInterval(this.processPoller);
      this.processPoller = null;
    }

    for (const timer of this.pendingThinking.values()) {
      clearTimeout(timer);
    }

    this.fileOffsets.clear();
    this.fileRemainders.clear();
    this.fallbackProcessSessions.clear();
    this.observedTranscriptEntries.clear();
    this.pendingThinking.clear();
    this.pendingThinkingState.clear();
    this.sessionSnapshots.clear();
    this.startedSessions.clear();
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
      logger.warn({ payload }, 'OpenClaw payload must be an object');
      return;
    }

    await this.processNativePayload(
      payload,
      'aisnitch://adapters/openclaw/hooks',
      extractOpenClawEventName(payload),
    );
  }

  private async processNativePayload(
    payload: Record<string, unknown>,
    source: string,
    eventName: string | undefined,
    transcriptPath?: string,
  ): Promise<void> {
    if (!eventName) {
      logger.debug({ payload, source }, 'OpenClaw payload missing event name');
      return;
    }

    const sessionId = resolveSessionId({
      activeFile: extractOpenClawActiveFile(payload),
      cwd: extractOpenClawCwd(payload),
      pid: getNumber(payload, 'pid'),
      project: extractOpenClawProject(payload),
      projectPath: extractOpenClawCwd(payload),
      sessionId: extractOpenClawSessionKey(payload),
      tool: this.name,
      transcriptPath,
    });
    const context: AdapterPublishContext = {
      cwd: extractOpenClawCwd(payload),
      hookPayload: payload,
      pid: getNumber(payload, 'pid'),
      sessionId,
      source,
      transcriptPath,
    };
    const sharedData = buildOpenClawEventData(payload);

    this.sessionSnapshots.set(sessionId, {
      cwd: sharedData.cwd,
      project: sharedData.project,
      sessionId,
      sessionKey: extractOpenClawSessionKey(payload),
      transcriptPath,
    });

    switch (eventName) {
      case 'gateway:startup':
      case 'agent:bootstrap': {
        await this.emitOpenClawSessionStart(sharedData, context);
        return;
      }
      case 'command:new':
      case '/new': {
        await this.ensureSessionStarted(sharedData, context);
        await this.emitStateChange('task.start', sharedData, context);
        this.scheduleThinking(sessionId, sharedData, context, COMMAND_START_THINKING_DELAY_MS);
        return;
      }
      case 'command:stop':
      case '/stop': {
        this.clearThinking(sessionId);
        await this.emitStateChange('task.complete', sharedData, context);
        await this.emitStateChange('agent.idle', sharedData, context);
        return;
      }
      case 'command:reset':
      case '/reset':
      case 'gateway:shutdown': {
        await this.emitOpenClawSessionEnd(sharedData, context);
        return;
      }
      case 'model_call_started': {
        await this.ensureSessionStarted(sharedData, context);
        this.clearThinking(sessionId);
        await this.emitStateChange('agent.thinking', sharedData, context);
        return;
      }
      case 'model_call_ended': {
        await this.ensureSessionStarted(sharedData, context);
        await this.emitStateChange('agent.streaming', {
          ...sharedData,
          raw: {
            ...(sharedData.raw as Record<string, unknown> ?? {}),
            durationMs: getNumber(payload, 'durationMs'),
            outcome: getString(payload, 'outcome'),
            source: 'plugin',
          },
        }, context);
        return;
      }
      case 'before_tool_call': {
        await this.ensureSessionStarted(sharedData, context);
        await this.emitStateChange(
          isOpenClawCodingTool(sharedData.toolName, sharedData.toolInput)
            ? 'agent.coding'
            : 'agent.tool_call',
          sharedData,
          context,
        );
        return;
      }
      case 'tool_result_persist': {
        await this.ensureSessionStarted(sharedData, context);
        await this.emitStateChange(
          isOpenClawCodingTool(sharedData.toolName, sharedData.toolInput)
            ? 'agent.coding'
            : 'agent.tool_call',
          sharedData,
          context,
        );
        this.scheduleThinking(sessionId, sharedData, context, POST_TOOL_THINKING_DELAY_MS);
        return;
      }
      case 'session:compact:before':
      case 'before_compaction': {
        await this.ensureSessionStarted(sharedData, context);
        this.clearThinking(sessionId);
        await this.emitStateChange('agent.compact', sharedData, context);
        return;
      }
      case 'message:received':
      case 'message:preprocessed':
      case 'session:compact:after':
      case 'after_compaction': {
        logger.debug({ eventName }, 'OpenClaw event intentionally ignored');
        return;
      }
      default: {
        logger.debug({ eventName }, 'OpenClaw event ignored by adapter');
      }
    }
  }

  private async emitOpenClawSessionStart(
    data: Omit<EventData, 'state'>,
    context: AdapterPublishContext,
  ): Promise<void> {
    const sessionId = context.sessionId;

    if (!sessionId) {
      return;
    }

    if (this.startedSessions.has(sessionId)) {
      await this.emitStateChange('agent.idle', data, context);
      return;
    }

    this.startedSessions.add(sessionId);
    await this.emitStateChange('session.start', data, context);
    await this.emitStateChange('agent.idle', data, context);
  }

  private async emitOpenClawSessionEnd(
    data: Omit<EventData, 'state'>,
    context: AdapterPublishContext,
  ): Promise<void> {
    const sessionId = context.sessionId;

    if (sessionId) {
      this.clearThinking(sessionId);
      this.startedSessions.delete(sessionId);
      this.sessionSnapshots.delete(sessionId);
    }

    await this.emitStateChange('session.end', data, context);
  }

  private async ensureSessionStarted(
    data: Omit<EventData, 'state'>,
    context: AdapterPublishContext,
  ): Promise<void> {
    const sessionId = context.sessionId;

    if (!sessionId || this.startedSessions.has(sessionId)) {
      return;
    }

    await this.emitOpenClawSessionStart(
      {
        ...data,
        raw: {
          reason: 'implicit-start',
          source: context.source,
          ...(data.raw ?? {}),
        },
      },
      context,
    );
  }

  private scheduleThinking(
    sessionId: string,
    data: Omit<EventData, 'state'>,
    context: AdapterPublishContext,
    delayMs: number,
  ): void {
    this.clearThinking(sessionId);
    this.pendingThinkingState.set(sessionId, { context, data });

    const timer = setTimeout(() => {
      const thinkingState = this.pendingThinkingState.get(sessionId);

      if (!thinkingState) {
        return;
      }

      this.pendingThinking.delete(sessionId);
      this.pendingThinkingState.delete(sessionId);
      void this.emitStateChange(
        'agent.thinking',
        thinkingState.data,
        thinkingState.context,
      );
    }, delayMs);
    timer.unref();

    this.pendingThinking.set(sessionId, timer);
  }

  private clearThinking(sessionId: string): void {
    const timer = this.pendingThinking.get(sessionId);

    if (timer) {
      clearTimeout(timer);
    }

    this.pendingThinking.delete(sessionId);
    this.pendingThinkingState.delete(sessionId);
  }

  private async seedCommandsLogOffset(): Promise<void> {
    await this.seedFileOffset(this.commandsLogPath);
  }

  private async seedTranscriptOffsets(): Promise<void> {
    const files = await collectFilesRecursively(this.agentsDirectory, '.jsonl');

    await Promise.all(files.map(async (filePath) => await this.seedFileOffset(filePath)));
  }

  private async seedMemoryOffsets(): Promise<void> {
    for (const root of [join(this.getUserHomeDirectory(), '.openclaw', 'workspace')]) {
      await Promise.all([
        this.seedDirectoryFileOffsets(join(root, 'memory'), '.md'),
        this.seedFileOffset(join(root, 'MEMORY.md')),
      ]);
    }
  }

  private async seedDirectoryFileOffsets(
    directory: string,
    extension: string,
  ): Promise<void> {
    const files = await collectFilesRecursively(directory, extension);

    await Promise.all(files.map(async (filePath) => await this.seedFileOffset(filePath)));
  }

  private async seedFileOffset(filePath: string): Promise<void> {
    try {
      const fileStats = await stat(filePath);

      this.fileOffsets.set(filePath, fileStats.size);
    } catch {
      // Ignore missing files while the source is still dormant.
    }
  }

  private async processCommandsLogUpdate(
    filePath: string,
    readFromStart: boolean,
  ): Promise<void> {
    const lines = await this.readIncrementalLines(filePath, readFromStart);

    for (const line of lines) {
      const payload = parseJsonRecord(line);

      if (!payload) {
        logger.debug({ filePath, line }, 'OpenClaw commands.log line ignored');
        continue;
      }

      await this.processNativePayload(
        payload,
        'aisnitch://adapters/openclaw/commands-log',
        extractOpenClawEventName(payload),
      );
    }
  }

  private async processTranscriptUpdate(
    filePath: string,
    readFromStart: boolean,
  ): Promise<void> {
    const lines = await this.readIncrementalLines(filePath, readFromStart);

    for (const line of lines) {
      const parsedLine = parseJsonRecord(line);

      if (!parsedLine) {
        continue;
      }

      await this.processTranscriptLine(parsedLine, filePath);
    }
  }

  private async processTranscriptLine(
    line: Record<string, unknown>,
    filePath: string,
  ): Promise<void> {
    const rawSessionId =
      extractOpenClawSessionKey(line) ??
      inferOpenClawSessionIdFromTranscriptPath(filePath);
    const cwd = extractOpenClawCwd(line) ?? dirname(dirname(filePath));
    const sessionId = resolveSessionId({
      cwd,
      projectPath: cwd,
      sessionId: rawSessionId,
      tool: this.name,
      transcriptPath: filePath,
    });
    const eventFingerprint =
      getString(line, 'id') ??
      `${filePath}:${getString(line, 'timestamp') ?? JSON.stringify(line).slice(0, 120)}`;
    const dedupeKey = `${sessionId}:${eventFingerprint}`;

    if (this.observedTranscriptEntries.has(dedupeKey)) {
      return;
    }

    if (this.observedTranscriptEntries.size >= 4096) {
      this.observedTranscriptEntries.clear();
    }

    this.observedTranscriptEntries.add(dedupeKey);

    const context: AdapterPublishContext = {
      cwd,
      sessionId,
      source: 'aisnitch://adapters/openclaw/transcript',
      transcriptPath: filePath,
    };
    const sharedData: Omit<EventData, 'state'> = {
      cwd,
      project: basename(cwd) || cwd,
      projectPath: cwd,
      raw: line,
    };

    this.sessionSnapshots.set(sessionId, {
      cwd,
      project: sharedData.project,
      sessionId,
      transcriptPath: filePath,
    });

    if (getString(line, 'type') === 'session') {
      await this.emitOpenClawSessionStart(sharedData, context);
      return;
    }

    if (getString(line, 'type') === 'compaction') {
      await this.ensureSessionStarted(sharedData, context);
      await this.emitStateChange('agent.compact', sharedData, context);
      return;
    }

    const transcriptToolObservation = extractOpenClawTranscriptToolObservation(line);

    if (transcriptToolObservation) {
      const toolData: Omit<EventData, 'state'> = {
        ...sharedData,
        activeFile: transcriptToolObservation.activeFile,
        toolInput: transcriptToolObservation.toolInput,
        toolName: transcriptToolObservation.toolName,
      };

      await this.ensureSessionStarted(toolData, context);
      await this.emitStateChange(
        transcriptToolObservation.type,
        toolData,
        context,
      );
      this.scheduleThinking(sessionId, toolData, context, POST_TOOL_THINKING_DELAY_MS);
      return;
    }

    const thinkingText = extractOpenClawTranscriptThinkingText(line);

    if (thinkingText) {
      await this.ensureSessionStarted(sharedData, context);
      await this.emitStateChange(
        'agent.thinking',
        {
          ...sharedData,
          raw: {
            source: line,
            thinking: thinkingText,
          },
        },
        context,
      );
      return;
    }

    const streamingText = extractOpenClawTranscriptStreamingText(line);

    if (streamingText) {
      await this.ensureSessionStarted(sharedData, context);
      await this.emitStateChange(
        'agent.streaming',
        {
          ...sharedData,
          raw: {
            content: streamingText,
            source: line,
          },
        },
        context,
      );
    }
  }

  private async processMemoryUpdate(
    filePath: string,
    readFromStart: boolean,
  ): Promise<void> {
    const baseName = basename(filePath);
    const resolvedSession = this.resolveMemorySession(filePath);

    if (!resolvedSession) {
      return;
    }

    const context: AdapterPublishContext = {
      cwd: resolvedSession.cwd,
      sessionId: resolvedSession.sessionId,
      source: 'aisnitch://adapters/openclaw/memory',
    };

    if (baseName === 'MEMORY.md') {
      await this.ensureSessionStarted(
        {
          cwd: resolvedSession.cwd,
          project: resolvedSession.project,
          projectPath: resolvedSession.cwd,
          raw: {
            filePath,
            source: 'memory-file',
          },
        },
        context,
      );
      await this.emitStateChange(
        'agent.compact',
        {
          cwd: resolvedSession.cwd,
          project: resolvedSession.project,
          projectPath: resolvedSession.cwd,
          raw: {
            filePath,
            source: 'memory-file',
          },
        },
        context,
      );
      return;
    }

    const lines = await this.readIncrementalLines(filePath, readFromStart);
    const snippet = lines.at(-1)?.trim();

    if (!snippet) {
      return;
    }

    await this.ensureSessionStarted(
      {
        cwd: resolvedSession.cwd,
        project: resolvedSession.project,
        projectPath: resolvedSession.cwd,
        raw: {
          filePath,
          source: 'memory-log',
        },
      },
      context,
    );
    await this.emitStateChange(
      'agent.thinking',
      {
        cwd: resolvedSession.cwd,
        project: resolvedSession.project,
        projectPath: resolvedSession.cwd,
        raw: {
          filePath,
          snippet,
          source: 'memory-log',
        },
      },
      context,
    );
  }

  private resolveMemorySession(
    filePath: string,
  ): OpenClawSessionSnapshot | undefined {
    const workspaceDirectory =
      basename(filePath) === 'MEMORY.md' ? dirname(filePath) : dirname(dirname(filePath));

    for (const snapshot of this.sessionSnapshots.values()) {
      if (snapshot.cwd === workspaceDirectory) {
        return snapshot;
      }
    }

    const sessionId = resolveSessionId({
      cwd: workspaceDirectory,
      projectPath: workspaceDirectory,
      sessionId: `openclaw:${basename(workspaceDirectory)}:memory`,
      tool: this.name,
    });

    return {
      cwd: workspaceDirectory,
      project: basename(workspaceDirectory) || workspaceDirectory,
      sessionId,
    };
  }

  private async readIncrementalLines(
    filePath: string,
    readFromStart: boolean,
  ): Promise<readonly string[]> {
    let fileContent: Buffer;

    try {
      fileContent = await readFile(filePath);
    } catch (error) {
      logger.debug({ error, filePath }, 'OpenClaw source read skipped');
      return [];
    }

    const knownOffset = this.fileOffsets.get(filePath);
    const previousOffset =
      knownOffset ??
      (readFromStart ? 0 : fileContent.byteLength);
    const safeOffset =
      previousOffset > fileContent.byteLength ? 0 : previousOffset;
    const newChunk = fileContent.subarray(safeOffset).toString('utf8');
    const bufferedChunk =
      (safeOffset === 0 ? '' : this.fileRemainders.get(filePath) ?? '') +
      newChunk;
    const lines = bufferedChunk.split(/\r?\n/u);
    const remainder =
      bufferedChunk.endsWith('\n') || bufferedChunk.endsWith('\r')
        ? ''
        : (lines.pop() ?? '');

    this.fileOffsets.set(filePath, fileContent.byteLength);
    this.fileRemainders.set(filePath, remainder);

    return lines
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0);
  }

  private startProcessPolling(): void {
    if (this.pollIntervalMs <= 0) {
      return;
    }

    this.processPoller = setInterval(() => {
      void this.pollOpenClawProcesses();
    }, this.pollIntervalMs);
    this.processPoller.unref();

    void this.pollOpenClawProcesses();
  }

  private async pollOpenClawProcesses(): Promise<void> {
    const processes = await listOpenClawProcesses(this.processListCommand);
    const observedPids = new Set<number>();

    for (const processInfo of processes) {
      observedPids.add(processInfo.pid);

      if (this.fallbackProcessSessions.has(processInfo.pid)) {
        continue;
      }

      const cwd = await this.cwdResolver(processInfo.pid);
      const sessionId = resolveSessionId({
        cwd,
        pid: processInfo.pid,
        projectPath: cwd,
        sessionId: `openclaw-process-${processInfo.pid}`,
        tool: this.name,
      });
      const data: Omit<EventData, 'state'> = {
        cwd,
        project: cwd ? basename(cwd) || cwd : undefined,
        projectPath: cwd,
        raw: {
          process: processInfo,
          source: 'process-detect',
        },
      };
      const context: AdapterPublishContext = {
        cwd,
        pid: processInfo.pid,
        sessionId,
        source: 'aisnitch://adapters/openclaw/process-detect',
      };

      this.fallbackProcessSessions.set(processInfo.pid, sessionId);
      this.sessionSnapshots.set(sessionId, {
        cwd,
        project: data.project,
        sessionId,
      });
      await this.emitOpenClawSessionStart(data, context);
    }

    for (const [pid, sessionId] of this.fallbackProcessSessions) {
      if (observedPids.has(pid)) {
        continue;
      }

      this.fallbackProcessSessions.delete(pid);
      await this.emitOpenClawSessionEnd(
        {
          raw: {
            pid,
            reason: 'process-exit',
            source: 'process-detect',
          },
        },
        {
          sessionId,
          source: 'aisnitch://adapters/openclaw/process-detect',
        },
      );
    }
  }
}

async function collectFilesRecursively(
  directory: string,
  extension: string,
): Promise<string[]> {
  try {
    const directoryEntries = await readdir(directory, {
      withFileTypes: true,
    });
    const nestedFiles = await Promise.all(
      directoryEntries.map(async (entry) => {
        const entryPath = join(directory, entry.name);

        if (entry.isDirectory()) {
          return await collectFilesRecursively(entryPath, extension);
        }

        return extname(entry.name) === extension ? [entryPath] : [];
      }),
    );

    return nestedFiles.flat();
  } catch {
    return [];
  }
}

async function listOpenClawProcesses(
  listCommand: () => Promise<string>,
): Promise<OpenClawProcessInfo[]> {
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
        } satisfies OpenClawProcessInfo;
      })
      .filter((value): value is OpenClawProcessInfo => value !== null);
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

    logger.debug({ error }, 'OpenClaw process detection failed');
    return [];
  }
}

function buildOpenClawEventData(
  payload: Record<string, unknown>,
): Omit<EventData, 'state'> {
  const cwd = extractOpenClawCwd(payload);
  const project = extractOpenClawProject(payload);
  const toolInput = extractOpenClawToolInput(payload);

  return {
    activeFile: extractOpenClawActiveFile(payload) ?? toolInput?.filePath,
    cwd,
    duration: getNumber(payload, 'duration') ?? getNumber(payload, 'durationMs'),
    errorMessage: extractOpenClawErrorMessage(payload),
    errorType: inferOpenClawErrorType(payload),
    model: extractOpenClawModel(payload),
    project,
    projectPath: cwd,
    raw: payload,
    toolInput,
    toolName: extractOpenClawToolName(payload),
    tokensUsed: extractOpenClawTokens(payload),
  };
}

function extractOpenClawEventName(
  payload: Record<string, unknown>,
): string | undefined {
  const explicitEvent =
    getString(payload, 'event') ??
    getString(payload, 'hook_event_name') ??
    getString(payload, 'hookEventName');

  if (explicitEvent) {
    return explicitEvent;
  }

  const type = getString(payload, 'type');
  const action = getString(payload, 'action');

  if (!type) {
    return undefined;
  }

  if (!action) {
    return type;
  }

  if (type === 'command' && !action.startsWith('/') && !action.includes(':')) {
    return `command:${action}`;
  }

  return `${type}:${action}`;
}

function extractOpenClawSessionKey(
  payload: Record<string, unknown>,
): string | undefined {
  return (
    getString(payload, 'sessionKey') ??
    getString(payload, 'sessionId') ??
    getString(payload, 'session_id') ??
    getString(getRecord(payload.context), 'sessionKey') ??
    getString(getRecord(payload.context), 'sessionId') ??
    getString(getRecord(payload.context), 'session_id') ??
    getString(getRecord(payload.context), 'sessionEntry')
  );
}

function extractOpenClawCwd(
  payload: Record<string, unknown>,
): string | undefined {
  const context = getRecord(payload.context);

  return (
    getString(payload, 'cwd') ??
    getString(payload, 'workspaceDir') ??
    getString(context, 'workspaceDir') ??
    getString(context, 'cwd')
  );
}

function extractOpenClawProject(
  payload: Record<string, unknown>,
): string | undefined {
  const cwd = extractOpenClawCwd(payload);

  if (cwd) {
    return basename(cwd) || cwd;
  }

  return (
    getString(payload, 'project') ??
    getString(getRecord(payload.context), 'project')
  );
}

function extractOpenClawActiveFile(
  payload: Record<string, unknown>,
): string | undefined {
  const toolInput = extractOpenClawToolInput(payload);

  return (
    getString(payload, 'activeFile') ??
    getString(payload, 'filePath') ??
    getString(getRecord(payload.context), 'filePath') ??
    toolInput?.filePath
  );
}

function extractOpenClawToolName(
  payload: Record<string, unknown>,
): string | undefined {
  return (
    getString(payload, 'toolName') ??
    getString(payload, 'tool_name') ??
    getString(getRecord(payload.tool), 'name') ??
    getString(getRecord(payload.data), 'toolName') ??
    getString(getRecord(payload.result), 'toolName')
  );
}

function extractOpenClawToolInput(
  payload: Record<string, unknown>,
): ToolInput | undefined {
  const context = getRecord(payload.context);
  const argsRecord =
    getRecord(payload.toolInput) ??
    getRecord(payload.tool_input) ??
    getRecord(payload.params) ??
    getRecord(payload.arguments) ??
    getRecord(getRecord(payload.tool)?.params) ??
    getRecord(getRecord(payload.tool)?.arguments) ??
    getRecord(context?.params) ??
    getRecord(context?.arguments);
  const filePath =
    getString(payload, 'filePath') ??
    getString(argsRecord, 'filePath') ??
    getString(argsRecord, 'path');
  const command =
    getString(payload, 'command') ??
    getString(argsRecord, 'command') ??
    getString(argsRecord, 'cmd');

  if (!filePath && !command) {
    return undefined;
  }

  return {
    ...(command ? { command } : {}),
    ...(filePath ? { filePath } : {}),
  };
}

function extractOpenClawErrorMessage(
  payload: Record<string, unknown>,
): string | undefined {
  return (
    getString(payload, 'error') ??
    getString(payload, 'errorMessage') ??
    getString(payload, 'message') ??
    getString(getRecord(payload.error), 'message') ??
    getString(getRecord(payload.result), 'error') ??
    getString(getRecord(payload.result), 'message')
  );
}

function inferOpenClawErrorType(
  payload: Record<string, unknown>,
): ErrorType | undefined {
  const errorMessage = extractOpenClawErrorMessage(payload);

  if (!errorMessage) {
    return undefined;
  }

  const normalizedMessage = errorMessage.toLowerCase();

  if (normalizedMessage.includes('rate limit') || normalizedMessage.includes('quota')) {
    return 'rate_limit';
  }

  if (
    normalizedMessage.includes('context window') ||
    normalizedMessage.includes('context length') ||
    normalizedMessage.includes('too many tokens')
  ) {
    return 'context_overflow';
  }

  return OPENCLAW_ERROR_HINT.test(errorMessage) ? 'tool_failure' : 'api_error';
}

function extractOpenClawModel(
  payload: Record<string, unknown>,
): string | undefined {
  return (
    getString(payload, 'model') ??
    getString(getRecord(payload.context), 'model') ??
    getString(getRecord(payload.sessionEntry), 'model')
  );
}

function extractOpenClawTokens(
  payload: Record<string, unknown>,
): number | undefined {
  const directTokens =
    getNumber(payload, 'totalTokens') ??
    getNumber(payload, 'tokensUsed') ??
    getNumber(getRecord(payload.sessionEntry), 'totalTokens') ??
    getNumber(getRecord(payload.stats), 'totalTokens');

  return directTokens === undefined ? undefined : Math.max(0, directTokens);
}

function isOpenClawCodingTool(
  toolName: string | undefined,
  toolInput: ToolInput | undefined,
): boolean {
  return Boolean(
    toolInput?.filePath ||
      (toolName && OPENCLAW_CODING_TOOL_HINT.test(toolName)),
  );
}

function inferOpenClawSessionIdFromTranscriptPath(
  filePath: string,
): string | undefined {
  const fileName = basename(filePath, extname(filePath));

  return fileName.length > 0 ? fileName : undefined;
}

function extractOpenClawTranscriptToolObservation(
  payload: Record<string, unknown>,
):
  | {
      readonly activeFile?: string;
      readonly toolInput?: ToolInput;
      readonly toolName?: string;
      readonly type: AISnitchEventType;
    }
  | null {
  const nestedMessage = getRecord(payload.message) ?? getRecord(payload.data);
  const role =
    getString(payload, 'role') ??
    getString(nestedMessage, 'role') ??
    getString(getRecord(payload.entry), 'role');
  const toolName =
    extractOpenClawToolName(payload) ??
    getString(nestedMessage, 'name') ??
    getString(getRecord(payload.tool), 'name');
  const toolInput = extractOpenClawToolInput(payload);
  const activeFile =
    extractOpenClawActiveFile(payload) ??
    getString(nestedMessage, 'filePath') ??
    toolInput?.filePath;
  const content = getString(nestedMessage, 'content');
  const looksLikeToolPayload = Boolean(
    role === 'tool' ||
      role === 'tool_result' ||
      toolName ||
      getString(payload, 'type') === 'tool_result' ||
      content?.includes('tool') ||
      Array.isArray(getRecord(nestedMessage)?.content),
  );

  if (!looksLikeToolPayload) {
    return null;
  }

  return {
    activeFile,
    toolInput,
    toolName,
    type: isOpenClawCodingTool(toolName, toolInput)
      ? 'agent.coding'
      : 'agent.tool_call',
  };
}

function extractOpenClawTranscriptThinkingText(
  payload: Record<string, unknown>,
): string | undefined {
  const directReasoning =
    getString(payload, 'reasoning') ??
    getString(getRecord(payload.message), 'reasoning') ??
    getString(getRecord(payload.data), 'reasoning');

  if (directReasoning) {
    return directReasoning;
  }

  const content = getRecord(payload.message)?.content;

  if (!Array.isArray(content)) {
    return undefined;
  }

  for (const item of content) {
    const itemRecord = getRecord(item);
    const itemType = getString(itemRecord, 'type');

    if (itemType === 'thinking' || itemType === 'reasoning') {
      return (
        getString(itemRecord, 'thinking') ??
        getString(itemRecord, 'text') ??
        getString(itemRecord, 'content')
      );
    }
  }

  return undefined;
}

function extractOpenClawTranscriptStreamingText(
  payload: Record<string, unknown>,
): string | undefined {
  const directText =
    getString(payload, 'text') ??
    getString(getRecord(payload.message), 'text') ??
    getString(getRecord(payload.data), 'text');

  if (directText) {
    return directText;
  }

  const content = getRecord(payload.message)?.content;

  if (!Array.isArray(content)) {
    return undefined;
  }

  for (const item of content) {
    const itemRecord = getRecord(item);
    const itemType = getString(itemRecord, 'type');

    if (itemType === 'text' || itemType === 'output_text') {
      return getString(itemRecord, 'text') ?? getString(itemRecord, 'content');
    }
  }

  return undefined;
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsedValue = JSON.parse(value) as unknown;

    return getRecord(parsedValue) ?? null;
  } catch {
    return null;
  }
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function getString(
  payload: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = payload?.[key];

  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function getNumber(
  payload: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = payload?.[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
