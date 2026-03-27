import { execFile as execFileCallback } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { watch, type FSWatcher } from 'chokidar';

import { logger } from '../core/engine/logger.js';
import { resolveSessionId } from '../core/session-identity.js';
import type { EventData } from '../core/events/types.js';
import {
  type AdapterPublishContext,
  type AdapterRuntimeOptions,
  BaseAdapter,
  type InterceptionStrategy,
} from './base.js';

/**
 * @file src/adapters/codex.ts
 * @description Codex adapter based on passive `codex-tui.log` parsing plus process fallback detection.
 * @functions
 *   → none
 * @exports CodexAdapter, CodexAdapterOptions
 * @see ./base.ts
 * @see ../../tasks/06-adapters-secondary/01_adapters-secondary_gemini-codex.md
 */

const execFile = promisify(execFileCallback);

/**
 * Codex documents `codex exec --json` for machine-readable automation, but the
 * passive observer path for AISnitch today is still the local TUI log file.
 */
export interface CodexAdapterOptions extends AdapterRuntimeOptions {
  readonly logPath?: string;
  readonly pollIntervalMs?: number;
  readonly processListCommand?: () => Promise<string>;
  readonly watcherFactory?: (
    paths: string,
    options: Parameters<typeof watch>[1],
  ) => FSWatcher;
}

interface CodexProcessInfo {
  readonly command: string;
  readonly pid: number;
}

/**
 * 📖 The Codex log watcher deliberately parses only high-signal lines:
 * command executions, patch targets, model selection, and shutdown markers.
 * Anything more ambitious would be fake precision over an unstable text log.
 */
export class CodexAdapter extends BaseAdapter {
  public override readonly displayName = 'Codex';

  public override readonly name = 'codex' as const;

  public override readonly strategies: readonly InterceptionStrategy[] = [
    'log-watch',
    'process-detect',
  ];

  private fallbackProcessSessionId: string | null = null;

  private lastKnownCwd: string | undefined;

  private lastKnownModel: string | undefined;

  private readonly logPath: string;

  private logOffset = 0;

  private logRemainder = '';

  private readonly pollIntervalMs: number;

  private processPoller: NodeJS.Timeout | null = null;

  private readonly processListCommand: () => Promise<string>;

  private watcher: FSWatcher | null = null;

  private readonly watcherFactory: (
    paths: string,
    options: Parameters<typeof watch>[1],
  ) => FSWatcher;

  public constructor(options: CodexAdapterOptions) {
    super(options);
    this.logPath =
      options.logPath ??
      join(this.getUserHomeDirectory(), '.codex', 'log', 'codex-tui.log');
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.processListCommand =
      options.processListCommand ??
      (async () =>
        await execFile('pgrep', ['-lf', 'codex']).then((result) => result.stdout));
    this.watcherFactory = options.watcherFactory ?? watch;
  }

  public override async start(): Promise<void> {
    if (this.getStatus().running) {
      return;
    }

    this.setRunning(true);
    await this.seedLogOffset();

    this.watcher = this.watcherFactory(this.logPath, {
      awaitWriteFinish: {
        stabilityThreshold: 200,
      },
      ignoreInitial: true,
    });

    this.watcher.on('add', (filePath) => {
      void this.processLogUpdate(filePath, true);
    });
    this.watcher.on('change', (filePath) => {
      void this.processLogUpdate(filePath, false);
    });
    this.watcher.on('error', (error) => {
      logger.warn({ error }, 'Codex log watcher error');
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
    this.lastKnownCwd = undefined;
    this.lastKnownModel = undefined;
    this.logOffset = 0;
    this.logRemainder = '';
    this.setRunning(false);
  }

  public override async handleHook(payload: unknown): Promise<void> {
    const normalizedPayload = this.parseNormalizedHookPayload(payload);

    if (normalizedPayload === null) {
      logger.debug({ payload }, 'Codex ignores non-normalized hook payloads');
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

  private async processLogUpdate(
    filePath: string,
    readFromStart: boolean,
  ): Promise<void> {
    let fileContent: Buffer;

    try {
      fileContent = await readFile(filePath);
    } catch (error) {
      logger.debug({ error, filePath }, 'Codex log read skipped');
      return;
    }

    const previousOffset = readFromStart ? 0 : this.logOffset;
    const safeOffset =
      previousOffset > fileContent.byteLength ? 0 : previousOffset;
    const newChunk = fileContent.subarray(safeOffset).toString('utf8');
    const bufferedChunk =
      (safeOffset === 0 ? '' : this.logRemainder) +
      newChunk;
    const lines = bufferedChunk.split(/\r?\n/u);
    const remainder =
      bufferedChunk.endsWith('\n') || bufferedChunk.endsWith('\r')
        ? ''
        : (lines.pop() ?? '');

    this.logOffset = fileContent.byteLength;
    this.logRemainder = remainder;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.length === 0) {
        continue;
      }

      await this.processLogLine(trimmedLine);
    }
  }

  private async processLogLine(line: string): Promise<void> {
    const modelMatch = line.match(/model:\s*([^,]+),\s*.*effort:\s*([^\s]+)$/u);

    if (modelMatch) {
      const parsedModel = modelMatch[1]?.trim();

      if (parsedModel) {
        this.lastKnownModel = parsedModel;

        const sessionId = this.resolveLogSessionId(this.lastKnownCwd);
        const context = this.createLogContext(sessionId, this.lastKnownCwd, line);

        await this.ensureObservedSession(
          sessionId,
          {
            cwd: this.lastKnownCwd,
            model: this.lastKnownModel,
            raw: {
              logLine: line,
            },
          },
          context,
        );
      }

      return;
    }

    const parsedCommand = parseCodexCommandLine(line);

    if (parsedCommand !== null) {
      this.lastKnownCwd = parsedCommand.workdir ?? this.lastKnownCwd;

      const sessionId = this.resolveLogSessionId(parsedCommand.workdir);
      const context = this.createLogContext(sessionId, parsedCommand.workdir, line);

      await this.ensureObservedSession(
        sessionId,
        {
          cwd: parsedCommand.workdir,
          model: this.lastKnownModel,
          raw: {
            command: parsedCommand,
            logLine: line,
          },
        },
        context,
      );
      await this.emitStateChange(
        'agent.tool_call',
        {
          cwd: parsedCommand.workdir,
          model: this.lastKnownModel,
          raw: {
            command: parsedCommand,
            logLine: line,
          },
          toolInput: {
            command: parsedCommand.command,
          },
          toolName: 'shell',
        },
        context,
      );
      return;
    }

    const patchFileMatch = line.match(/^\*\*\*\s+(?:Update|Add|Delete)\s+File:\s+(.+)$/u);

    if (patchFileMatch?.[1]) {
      const activeFile = patchFileMatch[1].trim();
      const sessionId = this.resolveLogSessionId(this.lastKnownCwd);
      const context = this.createLogContext(sessionId, this.lastKnownCwd, line);

      await this.ensureObservedSession(
        sessionId,
        {
          activeFile,
          cwd: this.lastKnownCwd,
          model: this.lastKnownModel,
          raw: {
            logLine: line,
          },
        },
        context,
      );
      await this.emitStateChange(
        'agent.coding',
        {
          activeFile,
          cwd: this.lastKnownCwd,
          model: this.lastKnownModel,
          raw: {
            logLine: line,
          },
        },
        context,
      );
      return;
    }

    if (/Shutting down Codex/iu.test(line) && this.currentSessionId !== null) {
      await this.emitStateChange(
        'session.end',
        {
          cwd: this.lastKnownCwd,
          model: this.lastKnownModel,
          raw: {
            logLine: line,
          },
        },
        this.createLogContext(this.currentSessionId, this.lastKnownCwd, line),
      );
    }
  }

  private createLogContext(
    sessionId: string,
    cwd: string | undefined,
    line: string,
  ): AdapterPublishContext {
    return {
      cwd,
      hookPayload: {
        logLine: line,
      },
      sessionId,
      source: 'aisnitch://adapters/codex/log-watch',
    };
  }

  private resolveLogSessionId(cwd: string | undefined): string {
    return resolveSessionId({
      cwd,
      projectPath: cwd,
      sessionId: `${this.name}:session`,
      tool: this.name,
    });
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

  private async seedLogOffset(): Promise<void> {
    try {
      const fileStats = await stat(this.logPath);

      this.logOffset = fileStats.size;
    } catch {
      this.logOffset = 0;
    }
  }

  private startProcessPolling(): void {
    if (this.pollIntervalMs <= 0) {
      return;
    }

    this.processPoller = setInterval(() => {
      void this.pollCodexProcesses();
    }, this.pollIntervalMs);
    this.processPoller.unref();

    void this.pollCodexProcesses();
  }

  private async pollCodexProcesses(): Promise<void> {
    const processes = await listProcesses(this.processListCommand);

    if (processes.length > 0 && this.getStatus().activeSessions === 0) {
      const processInfo = processes[0];

      if (!processInfo) {
        return;
      }

      const sessionId = `codex-process-${processInfo.pid}`;

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
          source: 'aisnitch://adapters/codex/process-detect',
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
          source: 'aisnitch://adapters/codex/process-detect',
        },
      );
    }
  }
}

interface ParsedCodexCommand {
  readonly command: string;
  readonly workdir?: string;
}

function parseCodexCommandLine(line: string): ParsedCodexCommand | null {
  const jsonStart = line.indexOf('{');
  const jsonEnd = line.lastIndexOf('}');

  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    return null;
  }

  try {
    const parsedJson = JSON.parse(line.slice(jsonStart, jsonEnd + 1)) as unknown;

    if (!isRecord(parsedJson)) {
      return null;
    }

    const command = getString(parsedJson, 'command');

    if (!command) {
      return null;
    }

    return {
      command,
      workdir: getString(parsedJson, 'workdir'),
    };
  } catch {
    return null;
  }
}

async function listProcesses(
  listCommand: () => Promise<string>,
): Promise<CodexProcessInfo[]> {
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
      .filter((processInfo): processInfo is CodexProcessInfo => processInfo !== null);
  } catch (error) {
    const errorCode = isErrnoException(error) ? String(error.code) : '';

    if (isErrnoException(error) && (errorCode === 'ENOENT' || errorCode === '1')) {
      return [];
    }

    logger.debug({ error }, 'Codex process detection failed');
    return [];
  }
}

function parseProcessLine(line: string): CodexProcessInfo | null {
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
