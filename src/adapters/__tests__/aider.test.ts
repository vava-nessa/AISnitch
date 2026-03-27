import { EventEmitter } from 'node:events';

import type { FSWatcher } from 'chokidar';
import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../../core/config/defaults.js';
import type { AISnitchEvent } from '../../core/events/types.js';
import { AiderAdapter, parseAiderHistoryMarkdown } from '../aider.js';

/**
 * @file src/adapters/__tests__/aider.test.ts
 * @description Unit coverage for Aider markdown parsing and process-driven session discovery.
 * @functions
 *   → createWatcherStub
 *   → createAiderAdapter
 * @exports none
 * @see ../aider.ts
 */

function createWatcherStub(): FSWatcher {
  const emitter = new EventEmitter() as EventEmitter & {
    close: () => Promise<void>;
  };

  emitter.close = () => Promise.resolve();

  return emitter as unknown as FSWatcher;
}

function createAiderAdapter(
  publishedEvents: AISnitchEvent[],
  processListCommand: () => Promise<string> = () => Promise.resolve(''),
) {
  return new AiderAdapter({
    config: DEFAULT_CONFIG,
    cwdResolver: () => Promise.resolve('/repo'),
    pollIntervalMs: 0,
    processListCommand,
    publishEvent: (event) => {
      publishedEvents.push(event);
      return Promise.resolve(true);
    },
    watcherFactory: () => createWatcherStub(),
  });
}

describe('parseAiderHistoryMarkdown', () => {
  it('extracts prompts, assistant streaming output, coding blocks, tokens, and errors', () => {
    const markdown = [
      '# aider chat started at 2026-03-27 10:00:00',
      '> Aider v0.82.0',
      '> Main model: claude-sonnet-4',
      '#### Please fix the build in src/index.ts',
      '',
      'I will inspect the error first.',
      '',
      'src/index.ts',
      '<<<<<<< SEARCH',
      'console.log("before")',
      '=======',
      'console.log("after")',
      '>>>>>>> REPLACE',
      '',
      '> Tokens: 7.4k sent, 4.5k received.',
      '> # 1 SEARCH/REPLACE block failed to match!',
      '',
    ].join('\n');

    const result = parseAiderHistoryMarkdown(markdown, {
      cwd: '/repo',
      historyPath: '/repo/.aider.chat.history.md',
    });

    expect(result.lastModel).toBe('claude-sonnet-4');
    expect(result.observations.map((observation) => observation.type)).toEqual([
      'task.start',
      'agent.streaming',
      'agent.coding',
      'agent.thinking',
      'agent.error',
    ]);
    expect(result.observations[2]).toMatchObject({
      data: {
        activeFile: 'src/index.ts',
        toolInput: {
          filePath: 'src/index.ts',
        },
      },
      type: 'agent.coding',
    });
    expect(result.observations[3]).toMatchObject({
      data: {
        tokensUsed: 11900,
      },
      type: 'agent.thinking',
    });
  });
});

describe('AiderAdapter', () => {
  it('emits session lifecycle events from process discovery', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    let processOutput = '999 aider --model sonnet\n';
    const adapter = createAiderAdapter(
      publishedEvents,
      () => Promise.resolve(processOutput),
    );

    await (
      adapter as unknown as {
        pollAiderProcesses: () => Promise<void>;
      }
    ).pollAiderProcesses();

    processOutput = '';

    await (
      adapter as unknown as {
        pollAiderProcesses: () => Promise<void>;
      }
    ).pollAiderProcesses();

    expect(publishedEvents.map((event) => event.type)).toEqual([
      'session.start',
      'agent.idle',
      'session.end',
    ]);
    expect(publishedEvents[0]).toMatchObject({
      data: {
        projectPath: '/repo',
      },
      type: 'session.start',
    });
  });
});
