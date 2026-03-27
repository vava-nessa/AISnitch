import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import type { FSWatcher } from 'chokidar';

import { DEFAULT_CONFIG } from '../../core/config/defaults.js';
import type { AISnitchEvent } from '../../core/events/types.js';
import { ClaudeCodeAdapter } from '../claude-code.js';

/**
 * @file src/adapters/__tests__/claude-code.test.ts
 * @description Unit coverage for Claude Code hook mapping, transcript enrichment, and process fallback detection.
 * @functions
 *   → createWatcherStub
 *   → createClaudeAdapter
 * @exports none
 * @see ../claude-code.ts
 */

function createWatcherStub(): FSWatcher {
  const emitter = new EventEmitter() as EventEmitter & {
    close: () => Promise<void>;
  };

  emitter.close = () => Promise.resolve();

  return emitter as unknown as FSWatcher;
}

function createClaudeAdapter(publishedEvents: AISnitchEvent[]) {
  return new ClaudeCodeAdapter({
    config: DEFAULT_CONFIG,
    pollIntervalMs: 0,
    processListCommand: () => Promise.resolve(''),
    publishEvent: (event) => {
      publishedEvents.push(event);
      return Promise.resolve(true);
    },
    watcherFactory: () => createWatcherStub(),
  });
}

afterEach(async () => {
  await rm(join(tmpdir(), 'aisnitch-claude-tests'), {
    force: true,
    recursive: true,
  });
});

describe('ClaudeCodeAdapter', () => {
  it('maps SessionStart hooks to session.start and agent.idle', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const adapter = createClaudeAdapter(publishedEvents);

    await adapter.handleHook({
      cwd: '/repo',
      hook_event_name: 'SessionStart',
      model: 'claude-sonnet',
      project_path: '/repo',
      session_id: 'claude-session',
    });

    expect(publishedEvents.map((event) => event.type)).toEqual([
      'session.start',
      'agent.idle',
    ]);
    expect(publishedEvents[0]?.['aisnitch.sessionid']).toBe('claude-session');
  });

  it('maps PreToolUse and PostToolUse hooks with tool metadata', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const adapter = createClaudeAdapter(publishedEvents);

    await adapter.handleHook({
      hook_event_name: 'SessionStart',
      session_id: 'claude-session',
    });
    await adapter.handleHook({
      hook_event_name: 'PreToolUse',
      session_id: 'claude-session',
      tool_input: {
        file_path: '/repo/src/index.ts',
      },
      tool_name: 'Write',
    });
    await adapter.handleHook({
      hook_event_name: 'PostToolUse',
      session_id: 'claude-session',
      tool_input: {
        file_path: '/repo/src/index.ts',
      },
      tool_name: 'Write',
    });

    expect(publishedEvents[2]).toMatchObject({
      data: {
        activeFile: '/repo/src/index.ts',
        toolInput: {
          filePath: '/repo/src/index.ts',
        },
        toolName: 'Write',
      },
      type: 'agent.tool_call',
    });
    expect(publishedEvents[3]?.type).toBe('agent.coding');
  });

  it('extracts thinking and streaming states from transcript lines', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const adapter = createClaudeAdapter(publishedEvents);
    const homeDirectory = await mkdtemp(join(tmpdir(), 'aisnitch-claude-tests'));
    const transcriptDirectory = join(homeDirectory, '.claude', 'projects', 'repo');
    const transcriptPath = join(transcriptDirectory, 'session-1.jsonl');

    await mkdir(transcriptDirectory, { recursive: true });
    await writeFile(
      transcriptPath,
      `${JSON.stringify({
        message: {
          content: [
            {
              thinking: 'Need to inspect the file first.',
              type: 'thinking',
            },
            {
              text: 'Applying the fix now.',
              type: 'text',
            },
          ],
        },
        model: 'claude-sonnet',
        type: 'assistant',
      })}\n`,
      'utf8',
    );

    await (
      adapter as unknown as {
        processTranscriptUpdate: (
          filePath: string,
          readFromStart: boolean,
        ) => Promise<void>;
      }
    ).processTranscriptUpdate(transcriptPath, true);

    expect(publishedEvents.map((event) => event.type)).toEqual([
      'agent.thinking',
      'agent.streaming',
    ]);
    expect(publishedEvents[0]?.data.model).toBe('claude-sonnet');
  });

  it('emits process fallback session transitions when hooks are unavailable', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    let currentProcessOutput = '123 claude\n';
    const adapter = new ClaudeCodeAdapter({
      config: DEFAULT_CONFIG,
      pollIntervalMs: 0,
      processListCommand: () => Promise.resolve(currentProcessOutput),
      publishEvent: (event) => {
        publishedEvents.push(event);
        return Promise.resolve(true);
      },
      watcherFactory: () => createWatcherStub(),
    });

    await (
      adapter as unknown as {
        pollClaudeProcesses: () => Promise<void>;
      }
    ).pollClaudeProcesses();
    currentProcessOutput = '';
    await (
      adapter as unknown as {
        pollClaudeProcesses: () => Promise<void>;
      }
    ).pollClaudeProcesses();

    expect(publishedEvents[0]?.type).toBe('session.start');
    expect(publishedEvents[1]?.type).toBe('session.end');
  });
});
