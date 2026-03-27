import { basename } from 'node:path';

import { spawn as spawnPty, type IPty } from '@lydell/node-pty';
import stripAnsi from 'strip-ansi';

import { createEvent } from '../core/events/factory.js';
import type {
  AISnitchEvent,
  AISnitchEventType,
  ErrorType,
  EventData,
  ToolName,
} from '../core/events/types.js';
import { ContextDetector } from '../core/engine/context-detector.js';
import { resolveSessionId } from '../core/session-identity.js';

/**
 * @file src/adapters/generic-pty.ts
 * @description Generic PTY wrapper used by `aisnitch wrap` to observe interactive tools without first-class adapters.
 * @functions
 *   → analyzeTerminalOutputChunk
 * @exports GenericPTYSession, GenericPTYSessionOptions, GenericPTYObservation, analyzeTerminalOutputChunk
 * @see ../cli/runtime.ts
 * @see ../../tasks/06-adapters-secondary/03_adapters-secondary_aider-pty_DONE.md
 */

const PTY_ERROR_HINT = /error|exception|failed|traceback|refused|denied/iu;
const PTY_ASKING_USER_HINT =
  /\b\(Y(?:es)?\/N(?:o)?\)|\bPress Enter\b|\bcontinue\?\b|\bselect\b|\bchoose\b|\bapprove\b/iu;
const PTY_THINKING_HINT =
  /thinking|analyzing|planning|reasoning|reflecting|compacting|summarizing/iu;
const PTY_CODING_HINT =
  /apply_patch|creating|deleting|editing|patch|renaming|replacing|search\/replace|updating|writing|<<<<<<<|>>>>>>>|diff --git/iu;
const PTY_SPINNER_FRAME_HINT = /[|/\\-]|[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u;

export interface GenericPTYSessionOptions {
  readonly args: readonly string[];
  readonly command: string;
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly publishEvent: (
    event: AISnitchEvent,
    context?: {
      readonly cwd?: string;
      readonly env?: NodeJS.ProcessEnv;
      readonly pid?: number;
    },
  ) => Promise<boolean>;
  readonly rows?: number;
  readonly cols?: number;
  readonly stdin?: NodeJS.ReadStream;
  readonly stdout?: NodeJS.WriteStream;
}

export interface GenericPTYObservation {
  readonly fingerprint: string;
  readonly type: AISnitchEventType;
  readonly data: Omit<EventData, 'state'>;
}

/**
 * 📖 The wrapper deliberately uses heuristics instead of pretending it has a
 * stable protocol. Its job is to recover useful live signals from messy ANSI.
 */
export class GenericPTYSession {
  private readonly args: readonly string[];

  private readonly cols: number;

  private readonly command: string;

  private readonly commandLine: string;

  private readonly contextDetector = new ContextDetector();

  private readonly cwd: string;

  private readonly env: NodeJS.ProcessEnv;

  private lastObservationFingerprint: string | null = null;

  private readonly publishEvent: GenericPTYSessionOptions['publishEvent'];

  private readonly rows: number;

  private sequenceNumber = 0;

  private readonly stdin: NodeJS.ReadStream;

  private readonly stdout: NodeJS.WriteStream;

  private readonly tool: ToolName;

  private userInputBuffer = '';

  public constructor(options: GenericPTYSessionOptions) {
    this.args = options.args;
    this.command = options.command;
    this.commandLine = [options.command, ...options.args].join(' ').trim();
    this.cols = options.cols ?? process.stdout.columns ?? 120;
    this.cwd = options.cwd;
    this.env = {
      ...process.env,
      ...options.env,
    };
    this.publishEvent = options.publishEvent;
    this.rows = options.rows ?? process.stdout.rows ?? 32;
    this.stdin = options.stdin ?? process.stdin;
    this.stdout = options.stdout ?? process.stdout;
    this.tool = inferWrappedToolName(options.command, options.args);
  }

  /**
   * Launches the wrapped PTY session and resolves with the wrapped exit code.
   */
  public async run(): Promise<number> {
    const pty = spawnPty(this.command, [...this.args], {
      cols: this.cols,
      cwd: this.cwd,
      env: normalizePtyEnvironment(this.env),
      rows: this.rows,
    });
    const sessionId = resolveSessionId({
      cwd: this.cwd,
      pid: pty.pid,
      tool: this.tool,
    });
    const terminal = this.contextDetector.detectTerminal(this.env);

    await this.emitEvent(
      pty.pid,
      sessionId,
      'session.start',
      {
        cwd: this.cwd,
        pid: pty.pid,
        project: basename(this.cwd) || this.cwd,
        projectPath: this.cwd,
        raw: {
          args: this.args,
          command: this.command,
          source: 'pty-wrap',
        },
        terminal,
        toolInput: {
          command: this.commandLine,
        },
        toolName: basename(this.command) || this.command,
      },
    );
    await this.emitEvent(
      pty.pid,
      sessionId,
      'task.start',
      {
        cwd: this.cwd,
        pid: pty.pid,
        project: basename(this.cwd) || this.cwd,
        projectPath: this.cwd,
        raw: {
          args: this.args,
          command: this.command,
          source: 'pty-wrap',
        },
        terminal,
        toolInput: {
          command: this.commandLine,
        },
      },
    );

    return await new Promise<number>((resolve) => {
      let settled = false;
      let exitPoller: NodeJS.Timeout | null = null;
      const finalize = (exitCode: number, signal?: number) => {
        if (settled) {
          return;
        }

        settled = true;
        if (exitPoller !== null) {
          clearInterval(exitPoller);
        }
        void this.handleExit(pty, sessionId, terminal, exitCode, signal).finally(() => {
          inputCleanup();
          resizeCleanup();
          signalCleanup();
          dataDisposable.dispose();
          exitDisposable.dispose();
          resolve(exitCode);
        });
      };
      const dataDisposable = pty.onData((chunk: string) => {
        this.stdout.write(chunk);
        void this.handleOutputChunk(pty, sessionId, terminal, chunk);
      });
      const exitDisposable = pty.onExit(
        ({ exitCode, signal }: { exitCode: number; signal?: number }) => {
          finalize(exitCode, signal);
        },
      );
      exitPoller = setInterval(() => {
        if (!isPidRunning(pty.pid)) {
          finalize(0);
        }
      }, 200);
      exitPoller.unref();
      const inputCleanup = this.attachStdin(pty, sessionId, terminal);
      const resizeCleanup = this.attachResize(pty);
      const signalCleanup = this.attachParentSignals(pty);
    });
  }

  private attachParentSignals(pty: IPty): () => void {
    const handleSigterm = () => {
      pty.kill('SIGTERM');
    };
    const handleSigint = () => {
      pty.kill('SIGINT');
    };

    process.on('SIGTERM', handleSigterm);
    process.on('SIGINT', handleSigint);

    return () => {
      process.off('SIGTERM', handleSigterm);
      process.off('SIGINT', handleSigint);
    };
  }

  private attachResize(pty: IPty): () => void {
    if (!this.stdout.isTTY) {
      return () => undefined;
    }

    const handleResize = () => {
      pty.resize(process.stdout.columns ?? this.cols, process.stdout.rows ?? this.rows);
    };

    this.stdout.on('resize', handleResize);

    return () => {
      this.stdout.off('resize', handleResize);
    };
  }

  private attachStdin(
    pty: IPty,
    sessionId: string,
    terminal: string,
  ): () => void {
    const input = this.stdin;

    if (!input.isTTY) {
      return () => undefined;
    }

    const handleInput = (chunk: Buffer) => {
      pty.write(chunk);
      void this.captureUserInput(pty, sessionId, terminal, chunk.toString('utf8'));
    };

    input.resume();
    input.setRawMode?.(true);
    input.on('data', handleInput);

    return () => {
      input.off('data', handleInput);
      input.setRawMode?.(false);
      void this.flushUserInput(sessionId, pty.pid, terminal);
    };
  }

  private async captureUserInput(
    pty: IPty,
    sessionId: string,
    terminal: string,
    chunk: string,
  ): Promise<void> {
    const sanitizedChunk = stripTerminalControlCharacters(chunk);

    if (sanitizedChunk.includes('\r') || sanitizedChunk.includes('\n')) {
      await this.flushUserInput(sessionId, pty.pid, terminal);
      return;
    }

    const printableChunk = sanitizedChunk.trim();

    if (printableChunk.length === 0) {
      return;
    }

    this.userInputBuffer = `${this.userInputBuffer}${printableChunk}`;

    if (this.userInputBuffer.length >= 120) {
      await this.flushUserInput(sessionId, pty.pid, terminal);
    }
  }

  private async flushUserInput(
    sessionId: string,
    pid: number,
    terminal: string,
  ): Promise<void> {
    const input = this.userInputBuffer.trim();

    if (input.length === 0) {
      this.userInputBuffer = '';
      return;
    }

    this.userInputBuffer = '';

    await this.emitEvent(
      pid,
      sessionId,
      'agent.asking_user',
      {
        cwd: this.cwd,
        pid,
        raw: {
          input,
          source: 'pty-stdin',
        },
        terminal,
      },
    );
  }

  private async handleOutputChunk(
    pty: IPty,
    sessionId: string,
    terminal: string,
    chunk: string,
  ): Promise<void> {
    const observation = analyzeTerminalOutputChunk({
      chunk,
      commandLine: this.commandLine,
      tool: this.tool,
    });

    if (!observation) {
      return;
    }

    if (this.lastObservationFingerprint === observation.fingerprint) {
      return;
    }

    this.lastObservationFingerprint = observation.fingerprint;
    await this.emitEvent(pty.pid, sessionId, observation.type, {
      cwd: this.cwd,
      pid: pty.pid,
      project: basename(this.cwd) || this.cwd,
      projectPath: this.cwd,
      terminal,
      ...observation.data,
    });
  }

  private async handleExit(
    pty: IPty,
    sessionId: string,
    terminal: string,
    exitCode: number,
    signal: number | undefined,
  ): Promise<void> {
    await this.flushUserInput(sessionId, pty.pid, terminal);

    if (exitCode !== 0) {
      await this.emitEvent(
        pty.pid,
        sessionId,
        'agent.error',
        {
          cwd: this.cwd,
          errorMessage: `Wrapped process exited with code ${exitCode}.`,
          errorType: 'tool_failure',
          pid: pty.pid,
          raw: {
            exitCode,
            signal,
            source: 'pty-wrap',
          },
          terminal,
        },
      );
    }

    await this.emitEvent(
      pty.pid,
      sessionId,
      'session.end',
      {
        cwd: this.cwd,
        pid: pty.pid,
        raw: {
          exitCode,
          signal,
          source: 'pty-wrap',
        },
        terminal,
      },
    );
  }

  private async emitEvent(
    pid: number,
    sessionId: string,
    type: AISnitchEventType,
    data: Omit<EventData, 'state'>,
  ): Promise<void> {
    this.sequenceNumber += 1;

    await this.publishEvent(
      createEvent({
        source: `aisnitch://adapters/${this.tool}/pty-wrap`,
        type,
        'aisnitch.tool': this.tool,
        'aisnitch.sessionid': sessionId,
        'aisnitch.seqnum': this.sequenceNumber,
        data,
      }),
      {
        cwd: this.cwd,
        env: this.env,
        pid,
      },
    );
  }
}

/**
 * Interprets one PTY chunk into the best-effort AISnitch activity state.
 */
export function analyzeTerminalOutputChunk(input: {
  readonly chunk: string;
  readonly commandLine: string;
  readonly tool: ToolName;
}): GenericPTYObservation | null {
  const strippedText = stripAnsi(input.chunk)
    .replaceAll('\u0007', '');
  const normalizedText = stripTerminalControlCharacters(strippedText)
    .replaceAll('\r', '\n')
    .trim();

  if (normalizedText.length === 0) {
    return null;
  }

  const activeFile = extractPathReference(normalizedText);
  const raw = {
    chunk: input.chunk,
    output: normalizedText,
    source: 'pty-wrap',
  } satisfies Record<string, unknown>;

  if (containsRedAnsi(input.chunk) || PTY_ERROR_HINT.test(normalizedText)) {
    return {
      data: {
        activeFile,
        errorMessage: normalizedText,
        errorType: classifyPtyErrorType(normalizedText),
        raw,
      },
      fingerprint: createPtyFingerprint('agent.error', normalizedText, activeFile),
      type: 'agent.error',
    };
  }

  if (PTY_ASKING_USER_HINT.test(normalizedText)) {
    return {
      data: {
        activeFile,
        raw,
      },
      fingerprint: createPtyFingerprint(
        'agent.asking_user',
        normalizedText,
        activeFile,
      ),
      type: 'agent.asking_user',
    };
  }

  if (
    PTY_CODING_HINT.test(normalizedText) ||
    (activeFile !== undefined && /\.(?:[cm]?[jt]sx?|json|md|py|rb|rs|sh|ya?ml)$/u.test(activeFile))
  ) {
    return {
      data: {
        activeFile,
        raw,
        toolInput: activeFile
          ? {
              filePath: activeFile,
            }
          : {
              command: input.commandLine,
            },
        toolName: activeFile ? 'file-edit' : basename(input.commandLine) || 'shell',
      },
      fingerprint: createPtyFingerprint('agent.coding', normalizedText, activeFile),
      type: 'agent.coding',
    };
  }

  if (containsSpinnerHint(input.chunk) || PTY_THINKING_HINT.test(normalizedText)) {
    return {
      data: {
        raw,
      },
      fingerprint: createPtyFingerprint('agent.thinking', normalizedText, activeFile),
      type: 'agent.thinking',
    };
  }

  return {
    data: {
      activeFile,
      raw,
    },
    fingerprint: createPtyFingerprint('agent.streaming', normalizedText, activeFile),
    type: 'agent.streaming',
  };
}

function normalizePtyEnvironment(
  env: NodeJS.ProcessEnv,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, value]),
  );
}

function inferWrappedToolName(
  command: string,
  args: readonly string[],
): ToolName {
  const commandBaseName = basename(command).toLowerCase();
  const fullCommandLine = [commandBaseName, ...args].join(' ').toLowerCase();
  const toolMatchers: readonly [ToolName, RegExp][] = [
    ['aider', /\baider\b/u],
    ['amp', /\bamp\b/u],
    ['claude-code', /\bclaude\b/u],
    ['copilot-cli', /\bcopilot\b/u],
    ['codex', /\bcodex\b/u],
    ['continue', /\bcontinue\b/u],
    ['cursor', /\bcursor\b/u],
    ['gemini-cli', /\bgemini\b/u],
    ['goose', /\bgoose\b/u],
    ['kilo', /\bkilo\b/u],
    ['openclaw', /\bopenclaw\b/u],
    ['opencode', /\bopencode\b/u],
    ['openhands', /\bopenhands\b/u],
    ['qwen-code', /\bqwen\b/u],
    ['windsurf', /\bwindsurf\b/u],
  ];

  for (const [toolName, matcher] of toolMatchers) {
    if (matcher.test(fullCommandLine)) {
      return toolName;
    }
  }

  return 'unknown';
}

function extractPathReference(text: string): string | undefined {
  const pathMatch = text.match(
    /(?:^|[\s'"])((?:\.{0,2}\/|\/)?[A-Za-z0-9._/-]+\.[A-Za-z0-9._-]+)(?=$|[\s'":,)])/u,
  );

  return pathMatch?.[1];
}

function classifyPtyErrorType(message: string): ErrorType {
  if (/rate limit|quota|too many requests/iu.test(message)) {
    return 'rate_limit';
  }

  if (/context|token limit|context window/iu.test(message)) {
    return 'context_overflow';
  }

  if (/write|edit|patch|apply|command failed|exit code/iu.test(message)) {
    return 'tool_failure';
  }

  return 'api_error';
}

function createPtyFingerprint(
  type: AISnitchEventType,
  text: string,
  activeFile?: string,
): string {
  return [type, activeFile ?? '', text.replace(/\s+/gu, ' ').slice(0, 240)].join(
    '::',
  );
}

function stripTerminalControlCharacters(value: string): string {
  return [...value]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;

      return !(
        (codePoint >= 0x00 && codePoint <= 0x08) ||
        (codePoint >= 0x0b && codePoint <= 0x1a) ||
        (codePoint >= 0x1c && codePoint <= 0x1f) ||
        codePoint === 0x7f
      );
    })
    .join('');
}

function containsRedAnsi(value: string): boolean {
  return (
    value.includes('\u001B[31m') ||
    value.includes('\u001B[0;31m') ||
    value.includes('\u001B[91m')
  );
}

function containsSpinnerHint(value: string): boolean {
  return (
    (value.includes('\r') || value.includes('\u0008')) &&
    PTY_SPINNER_FRAME_HINT.test(value)
  );
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === 'ESRCH' || error.code === 'ENOENT')
    ) {
      return false;
    }

    return true;
  }
}
