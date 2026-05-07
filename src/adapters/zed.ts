/**
 * @file src/adapters/zed.ts
 * @description Zed AI Agent adapter using log file monitoring and IPC detection.
 * @functions
 *   → extractZedEventFromLog
 * @exports ZedAdapter
 * @see ./base.ts
 * @see ../core/events/types.ts
 */

import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { logger } from '../core/engine/logger.js';
import type { AISnitchEventType, EventData, ToolInput } from '../core/events/types.js';
import {
  type AdapterPublishContext,
  type AdapterRuntimeOptions,
  BaseAdapter,
  type InterceptionStrategy,
} from './base.js';

/**
 * 📖 Zed Agent (zed.dev) exposes a local HTTP API on port 9876 for its agent.
 * This adapter polls that endpoint and watches Zed's log file for activity.
 */
export class ZedAdapter extends BaseAdapter {
  public override readonly displayName = 'Zed AI';

  public override readonly name = 'zed' as const;

  public override readonly strategies: readonly InterceptionStrategy[] = [
    'process-detect',
    'api-client',
  ];

  private readonly logPaths: readonly string[];

  private readonly apiPort = 9876;

  private readonly pollIntervalMs: number;

  private poller: NodeJS.Timeout | null = null;

  private lastEventTime: number = 0;

  private activeZedSessions: Map<string, string> = new Map();

  public constructor(options: AdapterRuntimeOptions) {
    super(options);

    this.pollIntervalMs = 2_000;
    this.logPaths = [
      join(options.homeDirectory ?? process.env.HOME ?? '', '.config', 'zed', 'logs', 'agent.log'),
      '/tmp/zed-agent.log',
    ];
  }

  public override start(): Promise<void> {
    if (this.getStatus().running) {
      return Promise.resolve();
    }

    this.setRunning(true);
    this.startPolling();

    logger.info({ adapter: this.name }, 'Zed adapter started');

    return Promise.resolve();
  }

  public override stop(): Promise<void> {
    if (this.poller !== null) {
      clearInterval(this.poller);
      this.poller = null;
    }

    this.setRunning(false);
    logger.info({ adapter: this.name }, 'Zed adapter stopped');

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
      source: 'zed-hook',
    };

    const eventType = this.mapEventType(normalized.type ?? '');
    const eventData = this.buildEventData(eventType, normalized);

    await this.emit(eventType, eventData, context);
  }

  private startPolling(): void {
    this.poller = setInterval(() => {
      void this.pollZedStatus();
    }, this.pollIntervalMs);
  }

  private async pollZedStatus(): Promise<void> {
    try {
      // Try Zed's agent API
      const response = await fetch(`http://127.0.0.1:${this.apiPort}/api/agent/status`, {
        signal: AbortSignal.timeout(1_000),
      });

      if (response.ok) {
        const data = (await response.json()) as Record<string, unknown>;

        if (data.sessionId && typeof data.sessionId === 'string') {
          const sessionId = `zed:${data.sessionId}`;

          if (!this.activeZedSessions.has(sessionId)) {
            this.activeZedSessions.set(sessionId, sessionId);
            await this.emitSessionStart(sessionId, data);
          }

          if (data.state === 'thinking' && this.lastEventTime < Date.now() - 5_000) {
            const rawThinking = data.thinking as string | undefined;
            if (rawThinking) {
              await this.emitThinking(sessionId, rawThinking);
            }
          } else if (data.state === 'tool' && data.toolName) {
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
          } else if (data.state === 'idle') {
            await this.emitIdle(sessionId);
          }
        }
      }
    } catch {
      // Zed agent not running or API not available - fall through to log parsing
      await this.checkLogFiles();
    }
  }

  private async checkLogFiles(): Promise<void> {
    for (const logPath of this.logPaths) {
      try {
        const content = await readFile(logPath, 'utf8');
        await this.parseLogContent(content);
      } catch {
        // Log file doesn't exist yet
      }
    }
  }

  private async parseLogContent(content: string): Promise<void> {
    const lines = content.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      if (this.lastEventTime > 0 && this.lastEventTime >= Date.now() - 2_000) {
        continue;
      }

      const event = this.extractZedEventFromLog(line);
      if (event) {
        await this.handleHook(event);
        this.lastEventTime = Date.now();
      }
    }
  }

  private extractZedEventFromLog(
    line: string,
  ): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;

      if (!parsed.type || typeof parsed.type !== 'string') {
        return null;
      }

      const rawSessionId = parsed.sessionId as string | undefined;
      const rawWorkspace = parsed.workspace as string | undefined;
      const sessionId = rawSessionId
        ? rawSessionId
        : rawWorkspace
          ? `zed:${basename(rawWorkspace)}`
          : `zed:${Date.now()}`;

      const rawCwd = (parsed.cwd ?? rawWorkspace) as string | undefined;

      return {
        type: parsed.type,
        sessionId,
        cwd: rawCwd,
        data: {
          project: parsed.project ?? rawWorkspace ? basename(String(rawWorkspace)) : undefined,
          model: parsed.model,
          state: parsed.type,
          thinkingContent: parsed.thinking,
          toolCallName: parsed.toolName,
          toolInput: parsed.toolInput,
          messageContent: parsed.message ?? parsed.output,
          errorMessage: parsed.error,
          raw: parsed,
        },
      };
    } catch {
      // Not JSON - try pattern matching for plain text logs
      if (line.includes('[zed:agent]')) {
        const cleaned = line.replace(/^\[.*?\] \[.*?\] /, '');

        if (cleaned.includes('Thinking:')) {
          return { type: 'thinking', thinkingContent: cleaned.replace('Thinking:', '').trim() };
        }
        if (cleaned.includes('Executing tool:')) {
          return { type: 'tool', toolCallName: cleaned.replace('Executing tool:', '').trim() };
        }
        if (cleaned.includes('Error:')) {
          return { type: 'error', errorMessage: cleaned.replace('Error:', '').trim() };
        }
      }

      return null;
    }
  }

  private async emitSessionStart(sessionId: string, _data: Record<string, unknown>): Promise<void> {
    const eventData: EventData = {
      state: 'session.start',
      project: sessionId.split(':')[1] ?? 'unknown',
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
    this.lastEventTime = Date.now();
  }

  private async emitToolCall(sessionId: string, toolInput: ToolInput, toolName: string): Promise<void> {
    const eventData: EventData = {
      state: 'agent.tool_call',
      toolCallName: toolName,
      toolInput,
      activeFile: toolInput.filePath,
    };

    await this.emit('agent.tool_call', eventData, { sessionId });
    this.lastEventTime = Date.now();
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
