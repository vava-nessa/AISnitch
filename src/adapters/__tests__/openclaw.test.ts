import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_CONFIG } from '../../core/config/defaults.js';
import type { AISnitchEvent } from '../../core/events/types.js';
import { OpenClawAdapter } from '../openclaw.js';

/**
 * @file src/adapters/__tests__/openclaw.test.ts
 * @description Unit coverage for OpenClaw hook mapping, Plugin SDK events, transcript fallbacks, delayed thinking transitions, and process detection.
 * @functions
 *   → createOpenClawAdapter
 * @exports none
 * @see ../openclaw.ts
 */

function createOpenClawAdapter(
  publishedEvents: AISnitchEvent[],
  processListCommand: () => Promise<string> = () => Promise.resolve(''),
) {
  return new OpenClawAdapter({
    config: DEFAULT_CONFIG,
    cwdResolver: () => Promise.resolve('/Users/vava/.openclaw/workspace'),
    pollIntervalMs: 0,
    processListCommand,
    publishEvent: (event) => {
      publishedEvents.push(event);
      return Promise.resolve(true);
    },
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('OpenClawAdapter', () => {
  it('maps gateway startup hooks to session.start and agent.idle', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const adapter = createOpenClawAdapter(publishedEvents);

    await adapter.start();
    await adapter.handleHook({
      context: {
        workspaceDir: '/Users/vava/.openclaw/workspace',
      },
      event: 'gateway:startup',
      sessionKey: 'agent:main:main',
    });

    expect(publishedEvents.map((event) => event.type)).toEqual([
      'session.start',
      'agent.idle',
    ]);
    expect(publishedEvents[0]).toMatchObject({
      data: {
        cwd: '/Users/vava/.openclaw/workspace',
        project: 'workspace',
      },
      type: 'session.start',
    });
  });

  it('maps command:new hooks to task.start then delayed agent.thinking', async () => {
    vi.useFakeTimers();

    const publishedEvents: AISnitchEvent[] = [];
    const adapter = createOpenClawAdapter(publishedEvents);

    await adapter.start();
    await adapter.handleHook({
      context: {
        content: 'hello from OpenClaw',
        workspaceDir: '/Users/vava/.openclaw/workspace',
      },
      event: 'command:new',
      sessionKey: 'agent:main:main',
    });

    expect(publishedEvents.map((event) => event.type)).toEqual([
      'session.start',
      'agent.idle',
      'task.start',
    ]);

    await vi.advanceTimersByTimeAsync(2_000);

    expect(publishedEvents.map((event) => event.type)).toEqual([
      'session.start',
      'agent.idle',
      'task.start',
      'agent.thinking',
    ]);
    expect(publishedEvents[2]?.type).toBe('task.start');
    expect(publishedEvents[2]?.data.raw).toMatchObject({
      context: {
        content: 'hello from OpenClaw',
      },
    });
  });

  it('maps tool_result_persist hooks to agent.tool_call then delayed thinking', async () => {
    vi.useFakeTimers();

    const publishedEvents: AISnitchEvent[] = [];
    const adapter = createOpenClawAdapter(publishedEvents);

    await adapter.start();
    await adapter.handleHook({
      context: {
        workspaceDir: '/Users/vava/.openclaw/workspace',
      },
      event: 'tool_result_persist',
      sessionKey: 'agent:main:main',
      tool: {
        name: 'write_file',
        params: {
          filePath: 'README.md',
        },
      },
      toolName: 'write_file',
    });

    expect(publishedEvents.map((event) => event.type)).toEqual([
      'session.start',
      'agent.idle',
      'agent.coding',
    ]);

    await vi.advanceTimersByTimeAsync(500);

    expect(publishedEvents.map((event) => event.type)).toEqual([
      'session.start',
      'agent.idle',
      'agent.coding',
      'agent.thinking',
    ]);
    expect(publishedEvents[2]).toMatchObject({
      data: {
        activeFile: 'README.md',
        toolInput: {
          filePath: 'README.md',
        },
        toolName: 'write_file',
      },
    });
  });

  it('maps transcript compaction entries to agent.compact', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const adapter = createOpenClawAdapter(publishedEvents);

    await adapter.start();
    await (
      adapter as unknown as {
        processTranscriptLine: (
          payload: Record<string, unknown>,
          filePath: string,
        ) => Promise<void>;
      }
    ).processTranscriptLine(
      {
        id: 'entry-1',
        type: 'compaction',
      },
      '/Users/vava/.openclaw/agents/main/sessions/agent-main-main.jsonl',
    );

    expect(publishedEvents.map((event) => event.type)).toEqual([
      'session.start',
      'agent.idle',
      'agent.compact',
    ]);
  });

  it('emits session lifecycle events from process detection', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    let processOutput = '999 /Applications/OpenClaw.app/Contents/MacOS/OpenClaw\n';
    const adapter = createOpenClawAdapter(
      publishedEvents,
      () => Promise.resolve(processOutput),
    );

    await adapter.start();
    await (
      adapter as unknown as {
        pollOpenClawProcesses: () => Promise<void>;
      }
    ).pollOpenClawProcesses();

    processOutput = '';

    await (
      adapter as unknown as {
        pollOpenClawProcesses: () => Promise<void>;
      }
    ).pollOpenClawProcesses();

    expect(publishedEvents.map((event) => event.type)).toEqual([
      'session.start',
      'agent.idle',
      'session.end',
    ]);
  });

  it('maps model_call_started plugin events to agent.thinking', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const adapter = createOpenClawAdapter(publishedEvents);

    await adapter.start();
    await adapter.handleHook({
      context: {
        workspaceDir: '/Users/vava/.openclaw/workspace',
      },
      event: 'model_call_started',
      model: 'claude-sonnet-4-20250514',
      provider: 'anthropic',
      sessionKey: 'agent:main:main',
    });

    expect(publishedEvents.map((event) => event.type)).toEqual([
      'session.start',
      'agent.idle',
      'agent.thinking',
    ]);
    expect(publishedEvents[2]).toMatchObject({
      data: {
        model: 'claude-sonnet-4-20250514',
      },
      type: 'agent.thinking',
    });
  });

  it('maps model_call_ended plugin events to agent.streaming with duration', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const adapter = createOpenClawAdapter(publishedEvents);

    await adapter.start();
    await adapter.handleHook({
      context: {
        workspaceDir: '/Users/vava/.openclaw/workspace',
      },
      event: 'model_call_ended',
      durationMs: 1234,
      model: 'claude-sonnet-4-20250514',
      outcome: 'success',
      sessionKey: 'agent:main:main',
    });

    expect(publishedEvents.map((event) => event.type)).toEqual([
      'session.start',
      'agent.idle',
      'agent.streaming',
    ]);
    expect(publishedEvents[2]).toMatchObject({
      data: {
        duration: 1234,
        model: 'claude-sonnet-4-20250514',
      },
    });
  });

  it('maps before_tool_call plugin events to agent.tool_call for non-coding tools', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const adapter = createOpenClawAdapter(publishedEvents);

    await adapter.start();
    await adapter.handleHook({
      context: {
        workspaceDir: '/Users/vava/.openclaw/workspace',
      },
      event: 'before_tool_call',
      params: {
        query: 'search term',
      },
      sessionKey: 'agent:main:main',
      toolName: 'web_search',
    });

    expect(publishedEvents.map((event) => event.type)).toEqual([
      'session.start',
      'agent.idle',
      'agent.tool_call',
    ]);
    expect(publishedEvents[2]).toMatchObject({
      data: {
        toolName: 'web_search',
      },
    });
  });

  it('maps after_tool_call plugin events with error to agent.tool_call', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const adapter = createOpenClawAdapter(publishedEvents);

    await adapter.start();
    await adapter.handleHook({
      context: {
        workspaceDir: '/Users/vava/.openclaw/workspace',
      },
      duration: 500,
      error: 'Permission denied',
      event: 'tool_result_persist',
      sessionKey: 'agent:main:main',
      toolName: 'grep',
    });

    expect(publishedEvents.map((event) => event.type)).toEqual([
      'session.start',
      'agent.idle',
      'agent.tool_call',
    ]);
    expect(publishedEvents[2]).toMatchObject({
      data: {
        duration: 500,
        errorMessage: 'Permission denied',
        errorType: 'tool_failure',
        toolName: 'grep',
      },
    });
  });
});
