import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import type { FSWatcher } from 'chokidar';

import { DEFAULT_CONFIG } from '../../core/config/defaults.js';
import type { AISnitchEvent } from '../../core/events/types.js';
import { CopilotCLIAdapter } from '../copilot-cli.js';

/**
 * @file src/adapters/__tests__/copilot-cli.test.ts
 * @description Unit coverage for Copilot CLI hook mapping, session-state parsing, and process detection.
 * @functions
 *   → createWatcherStub
 *   → createCopilotAdapter
 * @exports none
 * @see ../copilot-cli.ts
 */

function createWatcherStub(): FSWatcher {
  const emitter = new EventEmitter() as EventEmitter & {
    close: () => Promise<void>;
  };

  emitter.close = () => Promise.resolve();

  return emitter as unknown as FSWatcher;
}

function createCopilotAdapter(
  publishedEvents: AISnitchEvent[],
  options: {
    readonly processListCommand?: () => Promise<string>;
    readonly sessionStateDirectory?: string;
  } = {},
) {
  return new CopilotCLIAdapter({
    config: DEFAULT_CONFIG,
    pollIntervalMs: 0,
    processListCommand: options.processListCommand ?? (() => Promise.resolve('')),
    publishEvent: (event) => {
      publishedEvents.push(event);
      return Promise.resolve(true);
    },
    sessionStateDirectory: options.sessionStateDirectory,
    watcherFactory: () => createWatcherStub(),
  });
}

afterEach(async () => {
  await rm(join(tmpdir(), 'aisnitch-copilot-tests'), {
    force: true,
    recursive: true,
  });
});

describe('CopilotCLIAdapter', () => {
  it('maps preToolUse hooks into coding events', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const adapter = createCopilotAdapter(publishedEvents);

    await adapter.handleHook({
      cwd: '/repo',
      hook_event_name: 'preToolUse',
      sessionId: 'copilot-session',
      toolArgs: '{"filePath":"/repo/src/App.tsx"}',
      toolName: 'edit',
    });

    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0]).toMatchObject({
      data: {
        activeFile: '/repo/src/App.tsx',
        toolInput: {
          filePath: '/repo/src/App.tsx',
        },
        toolName: 'edit',
      },
      type: 'agent.coding',
    });
  });

  it('maps postToolUse failures into agent.error events', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const adapter = createCopilotAdapter(publishedEvents);

    await adapter.handleHook({
      cwd: '/repo',
      hook_event_name: 'postToolUse',
      sessionId: 'copilot-session',
      toolArgs: '{"command":"pnpm test"}',
      toolName: 'bash',
      toolResult: {
        resultType: 'failure',
        textResultForLlm: 'Tests failed with exit code 1.',
      },
    });

    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0]).toMatchObject({
      data: {
        errorMessage: 'Tests failed with exit code 1.',
        errorType: 'api_error',
        toolInput: {
          command: 'pnpm test',
        },
        toolName: 'bash',
      },
      type: 'agent.error',
    });
  });

  it('parses assistant session-state messages into thinking and streaming events', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const homeDirectory = await mkdtemp(join(tmpdir(), 'aisnitch-copilot-tests'));
    const sessionDirectory = join(homeDirectory, 'session-1');
    const transcriptPath = join(sessionDirectory, 'events.jsonl');

    await mkdir(sessionDirectory, { recursive: true });
    await writeFile(
      join(sessionDirectory, 'workspace.yaml'),
      ['repository: AutoSnitch', 'git_root: /repo', 'cwd: /repo'].join('\n'),
      'utf8',
    );

    const adapter = createCopilotAdapter(publishedEvents, {
      sessionStateDirectory: homeDirectory,
    });

    await (
      adapter as unknown as {
        processTranscriptLine: (line: string, filePath: string) => Promise<void>;
      }
    ).processTranscriptLine(
      JSON.stringify({
        data: {
          content: 'Applying the fix now.',
          reasoningText: 'Need to inspect the failing test first.',
          sessionId: 'session-1',
        },
        id: 'evt-1',
        type: 'assistant.message',
      }),
      transcriptPath,
    );

    expect(publishedEvents.map((event) => event.type)).toEqual([
      'agent.thinking',
      'agent.streaming',
    ]);
    expect(publishedEvents[0]).toMatchObject({
      data: {
        project: 'AutoSnitch',
        projectPath: '/repo',
      },
      type: 'agent.thinking',
    });
    expect(publishedEvents[1]?.data.raw).toMatchObject({
      content: 'Applying the fix now.',
    });
  });

  it('emits process fallback session transitions', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    let currentProcessOutput = '999 copilot\n';
    const adapter = createCopilotAdapter(publishedEvents, {
      processListCommand: () => Promise.resolve(currentProcessOutput),
    });

    await (
      adapter as unknown as {
        pollCopilotProcesses: () => Promise<void>;
      }
    ).pollCopilotProcesses();
    currentProcessOutput = '';
    await (
      adapter as unknown as {
        pollCopilotProcesses: () => Promise<void>;
      }
    ).pollCopilotProcesses();

    expect(publishedEvents[0]?.type).toBe('session.start');
    expect(publishedEvents[1]?.type).toBe('session.end');
  });
});
