import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import type { FSWatcher } from 'chokidar';

import { DEFAULT_CONFIG } from '../../core/config/defaults.js';
import type { AISnitchEvent } from '../../core/events/types.js';
import { GeminiCLIAdapter } from '../gemini-cli.js';

/**
 * @file src/adapters/__tests__/gemini-cli.test.ts
 * @description Unit coverage for Gemini CLI hook mapping, local log watching fallback, and process detection.
 * @functions
 *   → createWatcherStub
 *   → createGeminiAdapter
 * @exports none
 * @see ../gemini-cli.ts
 */

function createWatcherStub(): FSWatcher {
  const emitter = new EventEmitter() as EventEmitter & {
    close: () => Promise<void>;
  };

  emitter.close = () => Promise.resolve();

  return emitter as unknown as FSWatcher;
}

function createGeminiAdapter(
  publishedEvents: AISnitchEvent[],
  processListCommand: () => Promise<string> = () => Promise.resolve(''),
  homeDirectory?: string,
) {
  return new GeminiCLIAdapter({
    config: DEFAULT_CONFIG,
    homeDirectory,
    pollIntervalMs: 0,
    processListCommand,
    publishEvent: (event) => {
      publishedEvents.push(event);
      return Promise.resolve(true);
    },
    watcherFactory: () => createWatcherStub(),
  });
}

afterEach(async () => {
  await rm(join(tmpdir(), 'aisnitch-gemini-tests'), {
    force: true,
    recursive: true,
  });
});

describe('GeminiCLIAdapter', () => {
  it('maps BeforeTool hooks into agent.tool_call events', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const adapter = createGeminiAdapter(publishedEvents);

    await adapter.handleHook({
      cwd: '/repo',
      hook_event_name: 'BeforeTool',
      session_id: 'gemini-session',
      tool_input: {
        file_path: '/repo/src/index.ts',
      },
      tool_name: 'write_file',
    });

    expect(publishedEvents[0]).toMatchObject({
      'aisnitch.sessionid': 'gemini-session',
      data: {
        activeFile: '/repo/src/index.ts',
        toolInput: {
          filePath: '/repo/src/index.ts',
        },
        toolName: 'write_file',
      },
      type: 'agent.tool_call',
    });
  });

  it('maps AfterTool hooks for coding tools into agent.coding', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const adapter = createGeminiAdapter(publishedEvents);

    await adapter.handleHook({
      cwd: '/repo',
      hook_event_name: 'AfterTool',
      session_id: 'gemini-session',
      tool_input: {
        file_path: '/repo/src/index.ts',
      },
      tool_name: 'write_file',
    });

    expect(publishedEvents[0]?.type).toBe('agent.coding');
  });

  it('reads new prompt entries from Gemini logs.json as fallback task.start events', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const homeDirectory = await mkdtemp(join(tmpdir(), 'aisnitch-gemini-tests'));
    const sessionDirectory = join(homeDirectory, '.gemini', 'tmp', 'project');
    const logsPath = join(sessionDirectory, 'logs.json');

    await mkdir(sessionDirectory, { recursive: true });
    await writeFile(join(sessionDirectory, '.project_root'), '/repo\n', 'utf8');
    await writeFile(
      logsPath,
      JSON.stringify([
        {
          message: 'Explain this module.',
          messageId: 'msg-1',
          sessionId: 'gemini-session',
          timestamp: '2026-03-27T10:00:00.000Z',
          type: 'user',
        },
      ]),
      'utf8',
    );

    const adapter = createGeminiAdapter(publishedEvents, () => Promise.resolve(''), homeDirectory);

    await (
      adapter as unknown as {
        processLogsFile: (filePath: string) => Promise<void>;
      }
    ).processLogsFile(logsPath);

    expect(publishedEvents.map((event) => event.type)).toEqual([
      'session.start',
      'agent.idle',
      'task.start',
    ]);
    expect(publishedEvents[2]?.data.projectPath).toBe('/repo');
  });

  it('emits process fallback session transitions', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    let currentProcessOutput = '321 gemini\n';
    const adapter = createGeminiAdapter(
      publishedEvents,
      () => Promise.resolve(currentProcessOutput),
    );

    await (
      adapter as unknown as {
        pollGeminiProcesses: () => Promise<void>;
      }
    ).pollGeminiProcesses();
    currentProcessOutput = '';
    await (
      adapter as unknown as {
        pollGeminiProcesses: () => Promise<void>;
      }
    ).pollGeminiProcesses();

    expect(publishedEvents[0]?.type).toBe('session.start');
    expect(publishedEvents[1]?.type).toBe('session.end');
  });
});
