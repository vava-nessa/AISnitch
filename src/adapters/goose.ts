import { execFile as execFileCallback } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
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
 * @file src/adapters/goose.ts
 * @description Goose adapter combining goosed session discovery, SSE event streaming, SQLite session watching, and process fallback detection.
 * @functions
 *   → none
 * @exports GooseAdapter, GooseAdapterOptions
 * @see ./base.ts
 * @see ../../tasks/06-adapters-secondary/02_adapters-secondary_goose-copilot_DONE.md
 */

const execFile = promisify(execFileCallback);
const DEFAULT_GOOSED_BASE_URL = 'http://127.0.0.1:8080';
const DEFAULT_SQLITE_QUERY = [
  'SELECT',
  '  id,',
  '  name,',
  '  working_dir,',
  '  updated_at,',
  '  message_count,',
  '  provider_name,',
  '  accumulated_total_tokens,',
  '  total_tokens,',
  '  model_config',
  'FROM sessions',
  'ORDER BY updated_at DESC',
  'LIMIT 24;',
].join('\n');
const MAX_STREAMED_SESSIONS = 6;
const GOOSE_CODING_TOOL_HINT = /apply|create|delete|edit|move|patch|rename|replace|write/iu;
const GOOSE_RATE_LIMIT_HINT = /credit|quota|rate limit|exhausted/iu;

export interface GooseAdapterOptions extends AdapterRuntimeOptions {
  readonly apiBaseUrl?: string;
  readonly apiKey?: string;
  readonly databasePath?: string;
  readonly fetchImplementation?: typeof fetch;
  readonly pollIntervalMs?: number;
  readonly processListCommand?: () => Promise<string>;
  readonly sqliteQueryCommand?: (
    databasePath: string,
    query: string,
  ) => Promise<string>;
  readonly watcherFactory?: (
    paths: string,
    options: Parameters<typeof watch>[1],
  ) => FSWatcher;
}

interface GooseProcessInfo {
  readonly command: string;
  readonly pid: number;
}

interface GooseSessionSnapshot {
  readonly gooseSessionId: string;
  readonly sessionId: string;
  readonly messageCount?: number;
  readonly model?: string;
  readonly name?: string;
  readonly providerName?: string;
  readonly totalTokens?: number;
  readonly updatedAt?: string;
  readonly workingDir?: string;
}

interface GooseStreamHandle {
  readonly abortController: AbortController;
  readonly promise: Promise<void>;
}

interface GooseSessionsResponse {
  readonly sessions?: unknown;
}

/**
 * 📖 Goose is the first adapter that mixes three genuinely different sources:
 * HTTP session discovery, SSE streaming, and a coarse SQLite fallback. Each
 * layer is best-effort and intentionally conservative about what it claims.
 */
export class GooseAdapter extends BaseAdapter {
  public override readonly displayName = 'Goose';

  public override readonly name = 'goose' as const;

  public override readonly strategies: readonly InterceptionStrategy[] = [
    'api-client',
    'sqlite-watch',
    'process-detect',
  ];

  private apiPoller: NodeJS.Timeout | null = null;

  private readonly apiBaseUrl: string;

  private readonly apiKey: string | undefined;

  private readonly databasePath: string;

  private databaseWatcher: FSWatcher | null = null;

  private fallbackProcessSessionId: string | null = null;

  private readonly fetchImplementation: typeof fetch;

  private apiDiscoverySeeded = false;

  private readonly observedSessions = new Set<string>();

  private readonly pollIntervalMs: number;

  private processPoller: NodeJS.Timeout | null = null;

  private readonly processListCommand: () => Promise<string>;

  private readonly sessionEventFingerprints = new Map<string, Set<string>>();

  private readonly sessionSnapshots = new Map<string, GooseSessionSnapshot>();

  private readonly sessionStreams = new Map<string, GooseStreamHandle>();

  private readonly sqliteQueryCommand: (
    databasePath: string,
    query: string,
  ) => Promise<string>;

  private readonly watcherFactory: (
    paths: string,
    options: Parameters<typeof watch>[1],
  ) => FSWatcher;

  public constructor(options: GooseAdapterOptions) {
    super(options);
    this.apiBaseUrl =
      options.apiBaseUrl ??
      options.env?.AISNITCH_GOOSE_API_BASE_URL ??
      DEFAULT_GOOSED_BASE_URL;
    this.apiKey =
      options.apiKey ??
      options.env?.AISNITCH_GOOSE_API_KEY ??
      options.env?.GOOSE_API_KEY;
    this.databasePath =
      options.databasePath ??
      join(this.getUserHomeDirectory(), '.config', 'goose', 'sessions.db');
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.processListCommand =
      options.processListCommand ??
      (async () =>
        await execFile('pgrep', ['-lf', 'goose|goosed']).then(
          (result) => result.stdout,
        ));
    this.sqliteQueryCommand =
      options.sqliteQueryCommand ??
      (async (databasePath, query) =>
        await execFile('sqlite3', ['-json', databasePath, query]).then(
          (result) => result.stdout,
        ));
    this.watcherFactory = options.watcherFactory ?? watch;
  }

  public override async start(): Promise<void> {
    if (this.getStatus().running) {
      return;
    }

    this.setRunning(true);
    await this.seedSqliteSessions();

    this.databaseWatcher = this.watcherFactory(this.databasePath, {
      awaitWriteFinish: {
        stabilityThreshold: 200,
      },
      ignoreInitial: true,
    });

    this.databaseWatcher.on('add', () => {
      void this.pollSqliteSessions(true);
    });
    this.databaseWatcher.on('change', () => {
      void this.pollSqliteSessions(true);
    });
    this.databaseWatcher.on('error', (error) => {
      logger.warn({ error }, 'Goose SQLite watcher error');
    });

    this.startApiPolling();
    this.startProcessPolling();
  }

  public override async stop(): Promise<void> {
    if (this.databaseWatcher !== null) {
      await this.databaseWatcher.close();
      this.databaseWatcher = null;
    }

    if (this.apiPoller !== null) {
      clearInterval(this.apiPoller);
      this.apiPoller = null;
    }

    if (this.processPoller !== null) {
      clearInterval(this.processPoller);
      this.processPoller = null;
    }

    for (const streamHandle of this.sessionStreams.values()) {
      streamHandle.abortController.abort();
      void streamHandle.promise.catch(() => undefined);
    }

    this.apiDiscoverySeeded = false;
    this.fallbackProcessSessionId = null;
    this.observedSessions.clear();
    this.sessionEventFingerprints.clear();
    this.sessionSnapshots.clear();
    this.sessionStreams.clear();
    this.setRunning(false);
  }

  public override async handleHook(payload: unknown): Promise<void> {
    const normalizedPayload = this.parseNormalizedHookPayload(payload);

    if (normalizedPayload === null) {
      logger.debug({ payload }, 'Goose ignores non-normalized hook payloads');
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

  private startApiPolling(): void {
    if (this.pollIntervalMs <= 0) {
      return;
    }

    this.apiPoller = setInterval(() => {
      void this.pollGooseApi(true);
    }, this.pollIntervalMs);
    this.apiPoller.unref();

    void this.pollGooseApi(false);
  }

  private startProcessPolling(): void {
    if (this.pollIntervalMs <= 0) {
      return;
    }

    this.processPoller = setInterval(() => {
      void this.pollGooseProcesses();
    }, this.pollIntervalMs);
    this.processPoller.unref();

    void this.pollGooseProcesses();
  }

  private async seedSqliteSessions(): Promise<void> {
    try {
      await stat(this.databasePath);
    } catch {
      return;
    }

    const sessions = await this.readSqliteSessions();

    this.syncSessionSnapshots(sessions, false, 'sqlite-seed');
  }

  private async pollSqliteSessions(emitChanges: boolean): Promise<void> {
    const sessions = await this.readSqliteSessions();

    this.syncSessionSnapshots(sessions, emitChanges, 'sqlite');
  }

  private async readSqliteSessions(): Promise<GooseSessionSnapshot[]> {
    let rawOutput: string;

    try {
      rawOutput = await this.sqliteQueryCommand(
        this.databasePath,
        DEFAULT_SQLITE_QUERY,
      );
    } catch (error) {
      logger.debug({ error }, 'Goose SQLite session query skipped');
      return [];
    }

    let parsedOutput: unknown;

    try {
      parsedOutput = JSON.parse(rawOutput) as unknown;
    } catch (error) {
      logger.warn({ error }, 'Goose SQLite JSON output is invalid');
      return [];
    }

    if (!Array.isArray(parsedOutput)) {
      return [];
    }

    return parsedOutput
      .map((entry) => normalizeGooseSession(entry))
      .filter((entry): entry is GooseSessionSnapshot => entry !== null);
  }

  private async pollGooseApi(emitChanges: boolean): Promise<void> {
    let statusResponse: Response;

    try {
      statusResponse = await this.fetchImplementation(
        new URL('/status', this.apiBaseUrl),
      );
    } catch (error) {
      logger.debug({ error }, 'Goosed status endpoint is unavailable');
      return;
    }

    if (!statusResponse.ok) {
      return;
    }

    let sessionsResponse: Response;

    try {
      sessionsResponse = await this.fetchImplementation(
        new URL('/sessions', this.apiBaseUrl),
        {
          headers: this.createApiHeaders(),
        },
      );
    } catch (error) {
      logger.debug({ error }, 'Goosed sessions endpoint request failed');
      return;
    }

    if (!sessionsResponse.ok) {
      logger.debug(
        { status: sessionsResponse.status },
        'Goosed sessions endpoint rejected the request',
      );
      return;
    }

    let parsedPayload: unknown;

    try {
      parsedPayload = await sessionsResponse.json();
    } catch (error) {
      logger.warn({ error }, 'Goosed sessions payload is not valid JSON');
      return;
    }

    const responsePayload = parsedPayload as GooseSessionsResponse;
    const rawSessions = Array.isArray(responsePayload.sessions)
      ? responsePayload.sessions
      : [];
    const sessions = rawSessions
      .map((entry) => normalizeGooseSession(entry))
      .filter((entry): entry is GooseSessionSnapshot => entry !== null);

    this.syncSessionSnapshots(
      sessions,
      emitChanges && this.apiDiscoverySeeded,
      'api',
    );
    this.apiDiscoverySeeded = true;
  }

  private syncSessionSnapshots(
    nextSnapshots: readonly GooseSessionSnapshot[],
    emitChanges: boolean,
    source: string,
  ): void {
    for (const snapshot of nextSnapshots) {
      const previousSnapshot = this.sessionSnapshots.get(snapshot.sessionId);

      this.sessionSnapshots.set(snapshot.sessionId, snapshot);
      this.ensureTrackedSessionStream(snapshot);

      if (!emitChanges) {
        continue;
      }

      if (previousSnapshot === undefined) {
        void this.ensureObservedSession(snapshot, source);
        continue;
      }

      if (!didGooseSessionAdvance(previousSnapshot, snapshot)) {
        continue;
      }

      void this.ensureObservedSession(snapshot, source).then(async () => {
        await this.emitStateChange(
          'agent.streaming',
          buildGooseSessionData(snapshot, {
            raw: {
              snapshot,
              source,
            },
          }),
          this.createSessionContext(snapshot, `aisnitch://adapters/goose/${source}`),
        );
      });
    }

    this.trimTrackedSessionStreams(nextSnapshots);
  }

  private ensureTrackedSessionStream(snapshot: GooseSessionSnapshot): void {
    if (this.sessionStreams.has(snapshot.sessionId)) {
      return;
    }

    const abortController = new AbortController();
    const streamPromise = this.consumeSessionEvents(snapshot, abortController).finally(
      () => {
        const activeStream = this.sessionStreams.get(snapshot.sessionId);

        if (activeStream?.abortController === abortController) {
          this.sessionStreams.delete(snapshot.sessionId);
        }
      },
    );

    this.sessionStreams.set(snapshot.sessionId, {
      abortController,
      promise: streamPromise,
    });
  }

  private trimTrackedSessionStreams(
    nextSnapshots: readonly GooseSessionSnapshot[],
  ): void {
    const keepSessionIds = new Set(
      [...nextSnapshots]
        .sort(compareGooseSessionsByRecency)
        .slice(0, MAX_STREAMED_SESSIONS)
        .map((snapshot) => snapshot.sessionId),
    );

    for (const [sessionId, streamHandle] of this.sessionStreams) {
      if (keepSessionIds.has(sessionId)) {
        continue;
      }

      streamHandle.abortController.abort();
      this.sessionStreams.delete(sessionId);
    }
  }

  private async consumeSessionEvents(
    snapshot: GooseSessionSnapshot,
    abortController: AbortController,
  ): Promise<void> {
    let response: Response;

    try {
      response = await this.fetchImplementation(
        new URL(
          `/sessions/${encodeURIComponent(snapshot.gooseSessionId)}/events`,
          this.apiBaseUrl,
        ),
        {
          headers: {
            ...this.createApiHeaders(),
            Accept: 'text/event-stream',
          },
          signal: abortController.signal,
        },
      );
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }

      logger.debug({ error, sessionId: snapshot.sessionId }, 'Goose SSE request failed');
      return;
    }

    if (!response.ok || response.body === null) {
      logger.debug(
        { sessionId: snapshot.sessionId, status: response.status },
        'Goose SSE stream is unavailable',
      );
      return;
    }

    const reader: ReadableStreamDefaultReader<Uint8Array> =
      response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const readResult = await reader.read();

        if (readResult.done) {
          break;
        }

        buffer += decoder.decode(readResult.value, { stream: true });

        while (true) {
          const delimiterIndex = buffer.indexOf('\n\n');

          if (delimiterIndex === -1) {
            break;
          }

          const frame = buffer.slice(0, delimiterIndex);

          buffer = buffer.slice(delimiterIndex + 2);
          await this.processSSEFrame(snapshot, frame);
        }
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        logger.debug(
          { error, sessionId: snapshot.sessionId },
          'Goose SSE stream closed unexpectedly',
        );
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async processSSEFrame(
    snapshot: GooseSessionSnapshot,
    frame: string,
  ): Promise<void> {
    const payloadText = frame
      .split(/\r?\n/u)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');

    if (payloadText.length === 0) {
      return;
    }

    let parsedPayload: unknown;

    try {
      parsedPayload = JSON.parse(payloadText) as unknown;
    } catch (error) {
      logger.warn({ error }, 'Goose SSE frame is not valid JSON');
      return;
    }

    await this.processSessionEvent(snapshot, parsedPayload);
  }

  private async processSessionEvent(
    snapshot: GooseSessionSnapshot,
    payload: unknown,
  ): Promise<void> {
    if (!isRecord(payload)) {
      return;
    }

    const fingerprint = createGooseFingerprint(payload);

    if (fingerprint && !this.markSessionEventSeen(snapshot.sessionId, fingerprint)) {
      return;
    }

    const eventType = getString(payload, 'type');

    switch (eventType) {
      case 'Message': {
        await this.processGooseMessage(snapshot, payload);
        return;
      }
      case 'Finish': {
        await this.ensureObservedSession(snapshot, 'sse');
        await this.emitStateChange(
          'task.complete',
          buildGooseSessionData(snapshot, {
            raw: payload,
            tokensUsed: extractGooseTokenCount(getRecord(payload.token_state)),
          }),
          this.createSessionContext(snapshot, 'aisnitch://adapters/goose/sse'),
        );
        return;
      }
      case 'Error': {
        const errorMessage = getString(payload, 'error');

        await this.ensureObservedSession(snapshot, 'sse');
        await this.emitStateChange(
          'agent.error',
          buildGooseSessionData(snapshot, {
            errorMessage,
            errorType: inferGooseErrorType(errorMessage),
            raw: payload,
          }),
          this.createSessionContext(snapshot, 'aisnitch://adapters/goose/sse'),
        );
        return;
      }
      case 'Notification': {
        await this.ensureObservedSession(snapshot, 'sse');
        await this.emitStateChange(
          'agent.asking_user',
          buildGooseSessionData(snapshot, {
            errorMessage: extractLooseString(payload, ['message']),
            raw: payload,
          }),
          this.createSessionContext(snapshot, 'aisnitch://adapters/goose/sse'),
        );
        return;
      }
      default:
        return;
    }
  }

  private async processGooseMessage(
    snapshot: GooseSessionSnapshot,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const message = getRecord(payload.message);

    if (!message) {
      return;
    }

    const role = getString(message, 'role');
    const content = getRecordArray(message.content);
    const tokenState = getRecord(payload.token_state);
    const tokensUsed = extractGooseTokenCount(tokenState);

    await this.ensureObservedSession(snapshot, 'sse');

    if (role === 'user') {
      const promptText = content
        .filter((part) => getString(part, 'type') === 'text')
        .map((part) => getString(part, 'text'))
        .filter((part): part is string => typeof part === 'string')
        .join('\n')
        .trim();

      await this.emitStateChange(
        'task.start',
        buildGooseSessionData(snapshot, {
          raw: {
            message,
            prompt: promptText,
            tokenState,
          },
          tokensUsed,
        }),
        this.createSessionContext(snapshot, 'aisnitch://adapters/goose/sse'),
      );

      return;
    }

    if (role !== 'assistant') {
      return;
    }

    for (const part of content) {
      const partType = getString(part, 'type');

      switch (partType) {
        case 'thinking': {
          await this.emitStateChange(
            'agent.thinking',
            buildGooseSessionData(snapshot, {
              raw: {
                message: {
                  content: [part],
                  role,
                },
                tokenState,
              },
              tokensUsed,
            }),
            this.createSessionContext(snapshot, 'aisnitch://adapters/goose/sse'),
          );
          break;
        }
        case 'redactedThinking': {
          await this.emitStateChange(
            'agent.thinking',
            buildGooseSessionData(snapshot, {
              raw: {
                message: {
                  content: [
                    {
                      thinking: getString(part, 'data'),
                      type: 'thinking',
                    },
                  ],
                  role,
                },
                tokenState,
              },
              tokensUsed,
            }),
            this.createSessionContext(snapshot, 'aisnitch://adapters/goose/sse'),
          );
          break;
        }
        case 'text': {
          await this.emitStateChange(
            'agent.streaming',
            buildGooseSessionData(snapshot, {
              raw: {
                message: {
                  content: [part],
                  role,
                },
                tokenState,
              },
              tokensUsed,
            }),
            this.createSessionContext(snapshot, 'aisnitch://adapters/goose/sse'),
          );
          break;
        }
        case 'toolRequest': {
          const toolName = extractGooseToolName(part);
          const toolInput = extractGooseToolInput(part);
          const activeFile = toolInput?.filePath;
          const emittedType = isGooseCodingTool(toolName, toolInput)
            ? 'agent.coding'
            : 'agent.tool_call';

          await this.emitStateChange(
            emittedType,
            buildGooseSessionData(snapshot, {
              activeFile,
              raw: {
                message: {
                  content: [part],
                  role,
                },
                tokenState,
              },
              toolInput,
              toolName,
              tokensUsed,
            }),
            this.createSessionContext(snapshot, 'aisnitch://adapters/goose/sse'),
          );
          break;
        }
        case 'toolConfirmationRequest':
        case 'actionRequired': {
          await this.emitStateChange(
            'agent.asking_user',
            buildGooseSessionData(snapshot, {
              errorMessage:
                getString(part, 'prompt') ??
                extractLooseString(getRecord(part.data), ['message']),
              raw: {
                message: {
                  content: [part],
                  role,
                },
                tokenState,
              },
              toolInput: extractGooseToolInput(part),
              toolName: extractGooseToolName(part),
              tokensUsed,
            }),
            this.createSessionContext(snapshot, 'aisnitch://adapters/goose/sse'),
          );
          break;
        }
        case 'systemNotification': {
          const notificationType = getString(part, 'notificationType');
          const eventTypeToEmit =
            notificationType === 'thinkingMessage'
              ? 'agent.thinking'
              : 'agent.asking_user';

          await this.emitStateChange(
            eventTypeToEmit,
            buildGooseSessionData(snapshot, {
              errorMessage: getString(part, 'msg'),
              errorType:
                notificationType === 'creditsExhausted'
                  ? 'rate_limit'
                  : undefined,
              raw: {
                message:
                  notificationType === 'thinkingMessage'
                    ? {
                        content: [
                          {
                            thinking: getString(part, 'msg'),
                            type: 'thinking',
                          },
                        ],
                        role,
                      }
                    : {
                        content: [part],
                        role,
                      },
                tokenState,
              },
              tokensUsed,
            }),
            this.createSessionContext(snapshot, 'aisnitch://adapters/goose/sse'),
          );
          break;
        }
        default:
          break;
      }
    }
  }

  private async ensureObservedSession(
    snapshot: GooseSessionSnapshot,
    source: string,
  ): Promise<void> {
    if (this.observedSessions.has(snapshot.sessionId)) {
      return;
    }

    this.observedSessions.add(snapshot.sessionId);

    const context = this.createSessionContext(
      snapshot,
      `aisnitch://adapters/goose/${source}`,
    );
    const eventData = buildGooseSessionData(snapshot, {
      raw: {
        snapshot,
        source,
      },
    });

    await this.emitStateChange('session.start', eventData, context);
    await this.emitStateChange('agent.idle', eventData, context);
  }

  private createSessionContext(
    snapshot: GooseSessionSnapshot,
    source: string,
  ): AdapterPublishContext {
    return {
      cwd: snapshot.workingDir,
      sessionId: snapshot.sessionId,
      source,
    };
  }

  private markSessionEventSeen(sessionId: string, fingerprint: string): boolean {
    const knownFingerprints =
      this.sessionEventFingerprints.get(sessionId) ?? new Set<string>();

    if (knownFingerprints.has(fingerprint)) {
      return false;
    }

    if (knownFingerprints.size >= 256) {
      knownFingerprints.clear();
    }

    knownFingerprints.add(fingerprint);
    this.sessionEventFingerprints.set(sessionId, knownFingerprints);

    return true;
  }

  private createApiHeaders(): Record<string, string> | undefined {
    if (!this.apiKey) {
      return undefined;
    }

    return {
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  private async pollGooseProcesses(): Promise<void> {
    const processes = await listProcesses(this.processListCommand);

    if (processes.length > 0 && this.getStatus().activeSessions === 0) {
      const processInfo = processes[0];

      if (!processInfo) {
        return;
      }

      const sessionId = `goose-process-${processInfo.pid}`;

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
          source: 'aisnitch://adapters/goose/process-detect',
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
          source: 'aisnitch://adapters/goose/process-detect',
        },
      );
    }
  }
}

function normalizeGooseSession(payload: unknown): GooseSessionSnapshot | null {
  if (!isRecord(payload)) {
    return null;
  }

  const gooseSessionId = getString(payload, 'id');

  if (!gooseSessionId) {
    return null;
  }

  const workingDir =
    getString(payload, 'working_dir') ?? getString(payload, 'workingDir');
  const name = getString(payload, 'name');
  const providerName =
    getString(payload, 'provider_name') ?? getString(payload, 'providerName');
  const updatedAt =
    getString(payload, 'updated_at') ?? getString(payload, 'updatedAt');
  const messageCount =
    getNumber(payload, 'message_count') ?? getNumber(payload, 'messageCount');
  const totalTokens =
    getNumber(payload, 'accumulated_total_tokens') ??
    getNumber(payload, 'total_tokens') ??
    getNumber(payload, 'accumulatedTotalTokens') ??
    getNumber(payload, 'totalTokens');
  const modelConfig = getRecord(payload.model_config) ?? getRecord(payload.modelConfig);
  const rawModelConfig = getString(payload, 'model_config');
  const parsedModelConfig =
    modelConfig ?? parseJsonRecord(rawModelConfig);
  const model = getString(parsedModelConfig, 'model_name') ?? getString(parsedModelConfig, 'modelName');
  const sessionId = resolveSessionId({
    cwd: workingDir,
    projectPath: workingDir,
    sessionId: gooseSessionId,
    tool: 'goose',
  });

  return {
    gooseSessionId,
    messageCount,
    model,
    name,
    providerName,
    sessionId,
    totalTokens,
    updatedAt,
    workingDir,
  };
}

function buildGooseSessionData(
  snapshot: GooseSessionSnapshot,
  overrides: Partial<Omit<EventData, 'state'>> = {},
): Omit<EventData, 'state'> {
  return {
    cwd: overrides.cwd ?? snapshot.workingDir,
    model: overrides.model ?? snapshot.model,
    project: overrides.project ?? snapshot.name,
    projectPath: overrides.projectPath ?? snapshot.workingDir,
    raw: overrides.raw,
    tokensUsed: overrides.tokensUsed ?? snapshot.totalTokens,
    ...overrides,
  };
}

function compareGooseSessionsByRecency(
  left: GooseSessionSnapshot,
  right: GooseSessionSnapshot,
): number {
  return Date.parse(right.updatedAt ?? '') - Date.parse(left.updatedAt ?? '');
}

function didGooseSessionAdvance(
  previousSnapshot: GooseSessionSnapshot,
  nextSnapshot: GooseSessionSnapshot,
): boolean {
  return (
    previousSnapshot.updatedAt !== nextSnapshot.updatedAt ||
    previousSnapshot.messageCount !== nextSnapshot.messageCount ||
    previousSnapshot.totalTokens !== nextSnapshot.totalTokens
  );
}

function createGooseFingerprint(payload: Record<string, unknown>): string | null {
  const eventType = getString(payload, 'type');

  if (!eventType) {
    return null;
  }

  if (eventType === 'Message') {
    const message = getRecord(payload.message);
    const messageId = getString(message, 'id');
    const created = getNumber(message, 'created');
    const role = getString(message, 'role');

    return [eventType, messageId, created, role]
      .filter((value): value is string | number => value !== undefined)
      .join(':');
  }

  if (eventType === 'Finish') {
    return `${eventType}:${getString(payload, 'reason') ?? 'unknown'}`;
  }

  if (eventType === 'Error') {
    return `${eventType}:${getString(payload, 'error') ?? 'unknown'}`;
  }

  return eventType;
}

function extractGooseTokenCount(
  tokenState: Record<string, unknown> | undefined,
): number | undefined {
  return (
    getNumber(tokenState, 'accumulatedTotalTokens') ??
    getNumber(tokenState, 'totalTokens')
  );
}

function extractGooseToolName(
  payload: Record<string, unknown>,
): string | undefined {
  const toolCall = getRecord(payload.toolCall);

  return (
    getString(toolCall, 'name') ??
    getString(toolCall, 'toolName') ??
    getString(payload, 'toolName')
  );
}

function extractGooseToolInput(
  payload: Record<string, unknown>,
): ToolInput | undefined {
  const toolCall = getRecord(payload.toolCall);
  const argumentsRecord =
    getRecord(toolCall?.arguments) ??
    getRecord(toolCall?.args) ??
    getRecord(toolCall?.input) ??
    getRecord(payload.arguments);
  const filePath = extractFirstString(argumentsRecord, [
    'file',
    'file_path',
    'filePath',
    'path',
    'target',
    'target_path',
    'targetPath',
  ]);
  const command = extractFirstString(argumentsRecord, [
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

function isGooseCodingTool(
  toolName: string | undefined,
  toolInput: ToolInput | undefined,
): boolean {
  if (toolName && GOOSE_CODING_TOOL_HINT.test(toolName)) {
    return true;
  }

  const filePath = toolInput?.filePath;

  if (!filePath) {
    return false;
  }

  return !/read|view|glob|grep|list|search/iu.test(toolName ?? '');
}

function inferGooseErrorType(
  errorMessage: string | undefined,
): ErrorType | undefined {
  if (!errorMessage) {
    return undefined;
  }

  if (GOOSE_RATE_LIMIT_HINT.test(errorMessage)) {
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

async function listProcesses(
  processListCommand: () => Promise<string>,
): Promise<GooseProcessInfo[]> {
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
        } satisfies GooseProcessInfo;
      })
      .filter((processInfo) => Number.isInteger(processInfo.pid));
  } catch (error) {
    logger.debug({ error }, 'Goose process listing skipped');
    return [];
  }
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

    const nestedValue = getString(getRecord(payload[key]), 'message');

    if (nestedValue) {
      return nestedValue;
    }
  }

  return undefined;
}

function getRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is Record<string, unknown> => isRecord(entry));
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
