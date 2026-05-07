/**
 * @file src/adapters/pi.ts
 * @description Pi AI Agent adapter using Pi's local API and log monitoring.
 * @functions
 *   → detectPiInstance
 * @exports PiAdapter
 * @see ./base.ts
 * @see ../core/events/types.ts
 */

import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { logger } from '../core/engine/logger.js';
import type { AISnitchEventType, EventData } from '../core/events/types.js';
import {
  type AdapterPublishContext,
  type AdapterRuntimeOptions,
  BaseAdapter,
  type InterceptionStrategy,
} from './base.js';

const execFileAsync = promisify(execFile);

interface PiActivity {
  sessionId: string;
  state: 'thinking' | 'tool' | 'idle' | 'output' | 'error';
  content?: string;
  toolName?: string;
  toolInput?: { filePath?: string; command?: string };
  model?: string;
}

/**
 * 📖 Pi is a coding agent by MiniMax. This adapter detects Pi activity through:
 * 1. Process detection (pgrep for pi processes)
 * 2. MiniMax API / local socket detection
 * 3. Log file monitoring
 */
export class PiAdapter extends BaseAdapter {
  public override readonly displayName = 'Pi (MiniMax)';

  public override readonly name = 'pi' as const;

  public override readonly strategies: readonly InterceptionStrategy[] = [
    'process-detect',
    'api-client',
    'log-watch',
  ];

  private readonly apiPort = 7890;

  private readonly logPath: string;

  private poller: NodeJS.Timeout | null = null;

  private activePiSessions: Map<string, PiActivity> = new Map();

  private lastCheckedTime: number = 0;

  public constructor(options: AdapterRuntimeOptions) {
    super(options);

    this.logPath = join(
      options.homeDirectory ?? process.env.HOME ?? '',
      '.pi',
      'agent.log',
    );
  }

  public override start(): Promise<void> {
    if (this.getStatus().running) {
      return Promise.resolve();
    }

    this.setRunning(true);
    this.startPolling();

    logger.info({ adapter: this.name }, 'Pi adapter started');

    return Promise.resolve();
  }

  public override stop(): Promise<void> {
    if (this.poller !== null) {
      clearInterval(this.poller);
      this.poller = null;
    }

    this.setRunning(false);
    logger.info({ adapter: this.name }, 'Pi adapter stopped');

    return Promise.resolve();
  }

  public override async handleHook(payload: unknown): Promise<void> {
    const normalized = this.parseNormalizedHookPayload(payload);

    if (normalized === null) {
      return;
    }

    const context: AdapterPublishContext = {
      cwd: normalized.cwd,
      pid: normalized.pid,
      sessionId: normalized.sessionId,
      source: 'pi-hook',
    };

    const eventType = this.mapEventType(normalized.type ?? '');
    const eventData = this.buildEventData(eventType, normalized);

    await this.emit(eventType, eventData, context);
  }

  private startPolling(): void {
    this.poller = setInterval(() => {
      void this.pollPiActivity();
    }, 2_000);
  }

  private async pollPiActivity(): Promise<void> {
    // Check for Pi processes
    const running = await this.detectPiInstance();

    if (!running) {
      // Pi not running, mark sessions as idle
      for (const [sessionId, activity] of this.activePiSessions) {
        if (activity.state !== 'idle') {
          activity.state = 'idle';
          await this.emitIdle(sessionId);
        }
      }
      return;
    }

    // Try Pi's local API
    try {
      const response = await fetch(
        `http://127.0.0.1:${this.apiPort}/api/status`,
        {
          signal: AbortSignal.timeout(500),
        },
      );

      if (response.ok) {
        const data = (await response.json()) as Record<string, unknown>;
        await this.processPiApiResponse(data);
      }
    } catch {
      // API not available, try MiniMax API
      await this.checkMiniMaxApi();
    }
  }

  private async detectPiInstance(): Promise<boolean> {
    try {
      // Check for Pi/MiniMax process
      const result = await execFileAsync('pgrep', ['-l', 'pi|minimax']);

      if (result.stdout.includes('pi') || result.stdout.includes('minimax')) {
        return true;
      }
    } catch {
      // No Pi process found
    }

    // Check for Pi socket or port
    try {
      const response = await fetch(
        `http://127.0.0.1:${this.apiPort}/health`,
        {
          signal: AbortSignal.timeout(200),
        },
      );

      if (response.ok) {
        return true;
      }
    } catch {
      // Pi not listening
    }

    return false;
  }

  private async checkMiniMaxApi(): Promise<void> {
    try {
      // Check MiniMax API for running sessions
      const response = await fetch('http://127.0.0.1:3000/api/agent/status', {
        signal: AbortSignal.timeout(500),
      });

      if (response.ok) {
        const data = (await response.json()) as Record<string, unknown>;
        await this.processPiApiResponse(data);
      }
    } catch {
      // MiniMax not running
    }
  }

  private async processPiApiResponse(
    data: Record<string, unknown>,
  ): Promise<void> {
    const rawSession = (data.sessionId ?? data.project ?? 'default') as string;
    const sessionId = `pi:${rawSession.replace(/[^a-zA-Z0-9-_]/g, '-')}`;

    let activity = this.activePiSessions.get(sessionId);

    if (!activity) {
      activity = { sessionId, state: 'idle' };
      this.activePiSessions.set(sessionId, activity);
      await this.emitSessionStart(sessionId, data);
    }

    const rawState = (data.state ?? 'idle') as string;
    const state = rawState as PiActivity['state'];

    if (state !== activity.state) {
      switch (state) {
        case 'thinking': {
          const rawThinking = data.thinking as string | undefined;
          if (rawThinking) {
            await this.emitThinking(sessionId, rawThinking);
          }
          break;
        }
        case 'tool': {
          const rawFilePath = data.filePath as string | undefined;
          const rawCommand = data.command as string | undefined;
          const rawToolName = (data.toolName as string | undefined) ?? 'unknown';
          await this.emitToolCall(
            sessionId,
            {
              filePath: rawFilePath ?? '',
              command: rawCommand ?? '',
            },
            rawToolName,
          );
          break;
        }
        case 'output': {
          const rawOutput = data.output as string | undefined;
          if (rawOutput) {
            await this.emitOutput(sessionId, rawOutput);
          }
          break;
        }
        case 'error': {
          const rawError = (data.error as string | undefined) ?? 'Unknown error';
          await this.emitError(sessionId, rawError);
          break;
        }
        case 'idle':
          await this.emitIdle(sessionId);
          break;
      }

      activity.state = state;
    }
  }

  private async emitSessionStart(
    sessionId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const rawProject = (data.project as string | undefined) ?? 'pi-project';
    const rawModel = (data.model as string | undefined) ?? 'minimax/moonshot';
    const eventData: EventData = {
      state: 'session.start',
      project: rawProject,
      model: rawModel,
      raw: data,
    };

    await this.emit('session.start', eventData, { sessionId });
  }

  private async emitThinking(sessionId: string, content: string): Promise<void> {
    if (!content) return;

    const eventData: EventData = {
      state: 'agent.thinking',
      thinkingContent: content,
    };

    await this.emit('agent.thinking', eventData, { sessionId });
  }

  private async emitToolCall(
    sessionId: string,
    toolInput: { filePath?: string; command?: string },
    toolName: string,
  ): Promise<void> {
    const eventData: EventData = {
      state: 'agent.tool_call',
      toolCallName: toolName,
      toolInput,
      activeFile: toolInput.filePath,
    };

    await this.emit('agent.tool_call', eventData, { sessionId });
  }

  private async emitOutput(sessionId: string, content: string): Promise<void> {
    if (!content) return;

    const eventData: EventData = {
      state: 'agent.streaming',
      messageContent: content,
    };

    await this.emit('agent.streaming', eventData, { sessionId });
  }

  private async emitError(sessionId: string, errorMessage: string): Promise<void> {
    const eventData: EventData = {
      state: 'agent.error',
      errorMessage,
      errorType: 'api_error',
    };

    await this.emit('agent.error', eventData, { sessionId });
  }

  private async emitIdle(sessionId: string): Promise<void> {
    const eventData: EventData = {
      state: 'agent.idle',
    };

    await this.emit('agent.idle', eventData, { sessionId });
  }

  private mapEventType(type: string): AISnitchEventType {
    const mapping: Record<string, AISnitchEventType> = {
      'session.start': 'session.start',
      'session.end': 'session.end',
      'task.start': 'task.start',
      'task.complete': 'task.complete',
      thinking: 'agent.thinking',
      tool: 'agent.tool_call',
      coding: 'agent.coding',
      output: 'agent.streaming',
      message: 'agent.streaming',
      ask: 'agent.asking_user',
      error: 'agent.error',
      idle: 'agent.idle',
      compact: 'agent.compact',
    };

    return mapping[type] ?? 'agent.streaming';
  }

  private buildEventData(
    eventType: AISnitchEventType,
    payload: Record<string, unknown>,
  ): EventData {
    const data = (payload.data ?? {}) as Partial<EventData>;

    return {
      state: eventType,
      project: data.project,
      activeFile: data.activeFile,
      model: data.model,
      toolInput: data.toolInput,
      toolCallName: data.toolCallName,
      thinkingContent: data.thinkingContent,
      messageContent: data.messageContent,
      finalMessage: data.finalMessage,
      toolResult: data.toolResult,
      errorMessage: data.errorMessage,
      errorType: data.errorType,
      raw: data.raw,
    };
  }
}
