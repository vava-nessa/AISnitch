import { execFile as execFileCallback } from 'node:child_process';
import { basename } from 'node:path';
import { promisify } from 'node:util';

import pidCwd from 'pid-cwd';

import type { AISnitchEvent, ToolName } from '../events/types.js';
import { logger } from './logger.js';

const execFile = promisify(execFileCallback);

/**
 * @file src/core/engine/context-detector.ts
 * @description Best-effort runtime context enrichment for terminal, cwd, pid, and instance metadata.
 * @functions
 *   → none
 * @exports ProcessInfo, ProcessContext, EnrichedContextFields, ContextDetector
 * @see ../events/schema.ts
 */

/**
 * Lightweight process metadata used during instance enumeration.
 */
export interface ProcessInfo {
  readonly pid: number;
  readonly cwd?: string;
}

/**
 * Context captured from a tool process, transcript path, or hook payload.
 */
export interface ProcessContext {
  readonly pid?: number;
  readonly env?: NodeJS.ProcessEnv;
  readonly sessionId?: string;
  readonly transcriptPath?: string;
  readonly hookPayload?: Record<string, unknown>;
}

/**
 * Context fields that AISnitch attaches into `event.data`.
 */
export interface EnrichedContextFields {
  readonly terminal?: string;
  readonly cwd?: string;
  readonly pid?: number;
  readonly instanceId?: string;
  readonly instanceIndex?: number;
  readonly instanceTotal?: number;
}

interface CachedProcessContext {
  readonly terminal?: string;
  readonly cwd?: string;
  readonly instanceIndex?: number;
  readonly instanceTotal?: number;
  readonly expiresAt: number;
}

interface CommandExecutionOptions {
  readonly timeoutMs?: number;
}

interface ContextDetectorOptions {
  readonly cacheTtlMs?: number;
  readonly commandTimeoutMs?: number;
  readonly cwdResolver?: (pid: number) => Promise<string | undefined>;
  readonly execCommand?: (
    command: string,
    args: readonly string[],
    options?: CommandExecutionOptions,
  ) => Promise<string>;
  readonly now?: () => number;
}

const TERM_PROGRAM_MAP: Record<string, string> = {
  Apple_Terminal: 'Terminal.app',
  Hyper: 'Hyper',
  'iTerm.app': 'iTerm2',
  WezTerm: 'WezTerm',
  ghostty: 'Ghostty',
  tmux: 'tmux',
  vscode: 'VS Code',
  zed: 'Zed',
};

const PROCESS_NAME_MAP: Record<string, string> = {
  Alacritty: 'Alacritty',
  Hyper: 'Hyper',
  Terminal: 'Terminal.app',
  Warp: 'Warp',
  WezTerm: 'WezTerm',
  ghostty: 'Ghostty',
  iTerm2: 'iTerm2',
  kitty: 'kitty',
  screen: 'screen',
  tmux: 'tmux',
  'tmux: server': 'tmux',
};

const TOOL_BINARY_MAP: Record<ToolName, string> = {
  'aider': 'aider',
  'amp': 'amp',
  'augment-code': 'auggie',
  'claude-code': 'claude',
  'cline': 'cline',
  'codex': 'codex',
  'continue': 'continue',
  'copilot-cli': 'copilot',
  'cursor': 'cursor',
  'devin': 'devin',
  'gemini-cli': 'gemini',
  'goose': 'goose',
  'kilo': 'kilo',
  'kiro': 'kiro',
  'mistral': 'mistral',
  'openhands': 'openhands',
  'openclaw': 'openclaw',
  'opencode': 'opencode',
  'pi': 'pi',
  'qwen-code': 'qwen',
  'unknown': 'unknown',
  'windsurf': 'windsurf',
  'zed': 'zed',
};

/**
 * 📖 Context enrichment is always best-effort. Failing to detect a terminal or
 * cwd must never break the event stream itself.
 */
export class ContextDetector {
  private readonly cache = new Map<number, CachedProcessContext>();

  private readonly cacheTtlMs: number;

  private readonly commandTimeoutMs: number;

  private readonly cwdResolver: (pid: number) => Promise<string | undefined>;

  private readonly execCommand: (
    command: string,
    args: readonly string[],
    options?: CommandExecutionOptions,
  ) => Promise<string>;

  private readonly now: () => number;

  public constructor(options: ContextDetectorOptions = {}) {
    this.cacheTtlMs = options.cacheTtlMs ?? 30_000;
    this.commandTimeoutMs = options.commandTimeoutMs ?? 500;
    this.cwdResolver =
      options.cwdResolver ?? ((pid) => this.resolveCwdWithPidCwd(pid));
    this.execCommand =
      options.execCommand ??
      ((command, args, commandOptions) =>
        this.defaultExecCommand(command, args, commandOptions));
    this.now = options.now ?? Date.now;
  }

  /**
   * Detects the terminal display name from environment variables.
   */
  public detectTerminal(env: NodeJS.ProcessEnv = {}): string {
    if (env.ITERM_SESSION_ID) {
      return 'iTerm2';
    }

    if (env.KITTY_WINDOW_ID) {
      return 'kitty';
    }

    if (env.WEZTERM_EXECUTABLE) {
      return 'WezTerm';
    }

    if (env.TERM_PROGRAM) {
      return TERM_PROGRAM_MAP[env.TERM_PROGRAM] ?? env.TERM_PROGRAM;
    }

    if (env.TERM === 'alacritty' || env.TERM?.includes('alacritty')) {
      return 'Alacritty';
    }

    if (env.TERM?.includes('ghostty')) {
      return 'Ghostty';
    }

    if (env.TMUX) {
      return 'tmux';
    }

    return 'unknown';
  }

  /**
   * Walks the parent-process chain looking for a known terminal emulator.
   */
  public async getTerminalFromPPIDChain(pid: number): Promise<string> {
    let currentPid = pid;

    for (let depth = 0; depth < 4 && currentPid > 0; depth += 1) {
      try {
        const stdout = await this.execCommand(
          'ps',
          ['-p', String(currentPid), '-o', 'ppid=,comm='],
          { timeoutMs: this.commandTimeoutMs },
        );
        const line = stdout.trim();
        const match = line.match(/^(\d+)\s+(.+)$/u);

        if (!match) {
          return 'unknown';
        }

        const parentPidToken = match[1];
        const commandText = match[2];

        if (!parentPidToken || !commandText) {
          return 'unknown';
        }

        const nextPid = Number.parseInt(parentPidToken, 10);
        const normalizedProcessName = basename(commandText).replace(/\.app$/u, '');
        const mappedTerminal =
          PROCESS_NAME_MAP[normalizedProcessName] ??
          PROCESS_NAME_MAP[commandText.trim()];

        if (mappedTerminal) {
          return mappedTerminal;
        }

        currentPid = nextPid;
      } catch (error: unknown) {
        logger.debug({ error, pid }, 'Terminal PPID chain lookup failed');
        return 'unknown';
      }
    }

    return 'unknown';
  }

  /**
   * Resolves the working directory for a running process with a fast timeout.
   */
  public async getCWDForPID(pid: number): Promise<string | undefined> {
    try {
      return await this.withTimeout(this.cwdResolver(pid));
    } catch (error: unknown) {
      logger.warn({ error, pid }, 'Primary PID cwd lookup failed');
    }

    if (process.platform !== 'darwin') {
      return undefined;
    }

    try {
      const stdout = await this.execCommand(
        'lsof',
        ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'],
        { timeoutMs: this.commandTimeoutMs },
      );
      const cwdLine = stdout
        .split('\n')
        .find((line) => line.startsWith('n') && line.length > 1);

      return cwdLine?.slice(1) || undefined;
    } catch (error: unknown) {
      logger.warn({ error, pid }, 'Fallback PID cwd lookup failed');
      return undefined;
    }
  }

  /**
   * Decodes a Claude transcript path into its original project cwd when possible.
   */
  public decodeCWDFromTranscriptPath(
    transcriptPath: string,
  ): string | undefined {
    const match = transcriptPath.match(/\.claude\/projects\/([^/]+)\//u);

    if (!match?.[1] || !match[1].startsWith('-')) {
      return undefined;
    }

    return match[1].replace(/-/gu, '/');
  }

  /**
   * Enumerates active instances for a given tool binary using `pgrep`.
   */
  public async enumerateInstances(toolBinary: string): Promise<ProcessInfo[]> {
    if (process.platform === 'win32' || toolBinary === 'unknown') {
      return [];
    }

    try {
      const stdout = await this.execCommand(
        'pgrep',
        ['-fl', toolBinary],
        { timeoutMs: this.commandTimeoutMs },
      );
      const lines = stdout
        .trim()
        .split('\n')
        .filter((line) => line.trim().length > 0);

      const processRows: ProcessInfo[] = [];

      for (const line of lines) {
        const [pidToken] = line.trim().split(/\s+/u, 1);
        const parsedPid = Number.parseInt(pidToken ?? '', 10);

        if (!Number.isFinite(parsedPid)) {
          continue;
        }

        processRows.push({
          pid: parsedPid,
          cwd: await this.getCWDForPID(parsedPid),
        });
      }

      return processRows.sort((left, right) => left.pid - right.pid);
    } catch (error: unknown) {
      logger.debug({ error, toolBinary }, 'Instance enumeration failed');
      return [];
    }
  }

  /**
   * Returns the 1-based position of the PID among active tool instances.
   */
  public async getInstanceIndex(
    pid: number,
    toolBinary: string,
  ): Promise<{ readonly index: number; readonly total: number }> {
    const instances = await this.enumerateInstances(toolBinary);
    const index = instances.findIndex((instance) => instance.pid === pid);

    return {
      index: index >= 0 ? index + 1 : 1,
      total: Math.max(instances.length, 1),
    };
  }

  /**
   * Builds a stable identifier for one tool instance.
   */
  public buildInstanceId(
    toolName: ToolName,
    pid: number,
    sessionId?: string,
  ): string {
    return `${toolName}:${sessionId ?? pid}`;
  }

  /**
   * Enriches an AISnitch event with best-effort runtime context.
   */
  public async enrich(
    event: AISnitchEvent,
    context: ProcessContext = {},
  ): Promise<AISnitchEvent> {
    const pid = context.pid ?? event.data.pid;
    const toolName = event['aisnitch.tool'];
    const toolBinary = TOOL_BINARY_MAP[toolName];
    const hookPayloadCwd = this.getHookPayloadCwd(context.hookPayload);
    const explicitTerminal =
      event.data.terminal ??
      (context.env ? this.detectTerminal(context.env) : 'unknown');
    const explicitCwd =
      event.data.cwd ??
      hookPayloadCwd ??
      (context.transcriptPath
        ? this.decodeCWDFromTranscriptPath(context.transcriptPath)
        : undefined);

    if (!pid || pid <= 0) {
      return {
        ...event,
        data: {
          ...event.data,
          terminal:
            explicitTerminal !== 'unknown' ? explicitTerminal : event.data.terminal,
          cwd: explicitCwd ?? event.data.cwd,
          instanceId: context.sessionId
            ? this.buildInstanceId(toolName, 0, context.sessionId)
            : event.data.instanceId,
        },
      };
    }

    const cachedContext = this.getCachedContext(pid);
    const detectedContext =
      cachedContext ?? (await this.detectContext(pid, toolBinary, explicitTerminal));

    if (!cachedContext) {
      this.cache.set(pid, {
        ...detectedContext,
        expiresAt: this.now() + this.cacheTtlMs,
      });
    }

    const instanceId = this.buildInstanceId(
      toolName,
      pid,
      context.sessionId ?? event['aisnitch.sessionid'],
    );

    return {
      ...event,
      data: {
        ...event.data,
        terminal:
          explicitTerminal !== 'unknown'
            ? explicitTerminal
            : detectedContext.terminal ?? event.data.terminal,
        cwd:
          explicitCwd ??
          detectedContext.cwd ??
          event.data.cwd,
        pid,
        instanceId,
        instanceIndex:
          event.data.instanceIndex ?? detectedContext.instanceIndex,
        instanceTotal:
          event.data.instanceTotal ?? detectedContext.instanceTotal,
      },
    };
  }

  private async detectContext(
    pid: number,
    toolBinary: string,
    explicitTerminal: string,
  ): Promise<Omit<CachedProcessContext, 'expiresAt'>> {
    const cwdPromise = this.getCWDForPID(pid);
    const instancePromise = this.getInstanceIndex(pid, toolBinary);
    const terminalPromise =
      explicitTerminal !== 'unknown'
        ? Promise.resolve(explicitTerminal)
        : this.getTerminalFromPPIDChain(pid);

    const [cwd, instanceInfo, terminal] = await Promise.all([
      cwdPromise.catch(() => undefined),
      instancePromise.catch(() => ({ index: 1, total: 1 })),
      terminalPromise.catch(() => 'unknown'),
    ]);

    return {
      cwd,
      terminal: terminal !== 'unknown' ? terminal : undefined,
      instanceIndex: instanceInfo.index,
      instanceTotal: instanceInfo.total,
    };
  }

  private getCachedContext(pid: number): Omit<CachedProcessContext, 'expiresAt'> | undefined {
    const cachedContext = this.cache.get(pid);

    if (!cachedContext) {
      return undefined;
    }

    if (cachedContext.expiresAt <= this.now()) {
      this.cache.delete(pid);
      return undefined;
    }

    const { expiresAt: _expiresAt, ...context } = cachedContext;
    return context;
  }

  private getHookPayloadCwd(
    hookPayload: Record<string, unknown> | undefined,
  ): string | undefined {
    if (!hookPayload) {
      return undefined;
    }

    const rawCwd = hookPayload.cwd;

    return typeof rawCwd === 'string' && rawCwd.length > 0 ? rawCwd : undefined;
  }

  private async resolveCwdWithPidCwd(pid: number): Promise<string | undefined> {
    const cwd = (await pidCwd(pid)) as string | null | undefined;

    return cwd ?? undefined;
  }

  private async defaultExecCommand(
    command: string,
    args: readonly string[],
    options: CommandExecutionOptions = {},
  ): Promise<string> {
    const result = await execFile(command, [...args], {
      encoding: 'utf8',
      timeout: options.timeoutMs ?? this.commandTimeoutMs,
      maxBuffer: 1024 * 1024,
    });

    return result.stdout;
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error('Context detection timed out.'));
        }, this.commandTimeoutMs).unref();
      }),
    ]);
  }
}
