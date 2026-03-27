import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';
import type { FSWatcher } from 'chokidar';

import { DEFAULT_CONFIG } from '../../core/config/defaults.js';
import type { AISnitchEvent } from '../../core/events/types.js';
import { GooseAdapter } from '../goose.js';

/**
 * @file src/adapters/__tests__/goose.test.ts
 * @description Unit coverage for Goose API polling, SQLite fallback parsing, SSE mapping, and process detection.
 * @functions
 *   → createWatcherStub
 *   → createGooseAdapter
 *   → flushAsyncWork
 * @exports none
 * @see ../goose.ts
 */

function createWatcherStub(): FSWatcher {
  const emitter = new EventEmitter() as EventEmitter & {
    close: () => Promise<void>;
  };

  emitter.close = () => Promise.resolve();

  return emitter as unknown as FSWatcher;
}

function createGooseAdapter(
  publishedEvents: AISnitchEvent[],
  options: {
    readonly fetchImplementation?: typeof fetch;
    readonly processListCommand?: () => Promise<string>;
    readonly sqliteQueryCommand?: (
      databasePath: string,
      query: string,
    ) => Promise<string>;
  } = {},
) {
  return new GooseAdapter({
    config: DEFAULT_CONFIG,
    fetchImplementation:
      options.fetchImplementation ??
      ((input) => Promise.resolve(createEmptyResponse(resolveUrl(input)))),
    pollIntervalMs: 0,
    processListCommand: options.processListCommand ?? (() => Promise.resolve('')),
    publishEvent: (event) => {
      publishedEvents.push(event);
      return Promise.resolve(true);
    },
    sqliteQueryCommand:
      options.sqliteQueryCommand ?? (() => Promise.resolve('[]')),
    watcherFactory: () => createWatcherStub(),
  });
}

describe('GooseAdapter', () => {
  it('polls the Goose API and emits streaming activity when a session advances', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    let sessionPollCount = 0;
    const adapter = createGooseAdapter(publishedEvents, {
      fetchImplementation: (input) => {
        const url = resolveUrl(input);

        if (url.pathname === '/status') {
          return Promise.resolve(new Response('{}', {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          }));
        }

        if (url.pathname === '/sessions') {
          sessionPollCount += 1;

          return Promise.resolve(new Response(
            JSON.stringify({
              sessions: [
                {
                  id: 'goose-session-1',
                  message_count: sessionPollCount,
                  model_config: {
                    model_name: 'claude-sonnet-4',
                  },
                  name: 'AutoSnitch',
                  total_tokens: 120 + sessionPollCount,
                  updated_at: `2026-03-27T10:00:0${sessionPollCount}.000Z`,
                  working_dir: '/repo',
                },
              ],
            }),
            {
              headers: {
                'content-type': 'application/json',
              },
              status: 200,
            },
          ));
        }

        return Promise.resolve(createEmptyResponse(url));
      },
    });

    await (
      adapter as unknown as {
        pollGooseApi: (emitChanges: boolean) => Promise<void>;
      }
    ).pollGooseApi(true);
    await flushAsyncWork();
    expect(publishedEvents).toHaveLength(0);

    await (
      adapter as unknown as {
        pollGooseApi: (emitChanges: boolean) => Promise<void>;
      }
    ).pollGooseApi(true);
    await flushAsyncWork();

    expect(publishedEvents.map((event) => event.type)).toEqual([
      'session.start',
      'agent.idle',
      'agent.streaming',
    ]);
    expect(publishedEvents.at(-1)).toMatchObject({
      data: {
        model: 'claude-sonnet-4',
        projectPath: '/repo',
      },
      type: 'agent.streaming',
    });
  });

  it('falls back to SQLite session snapshots when goosed is unavailable', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const adapter = createGooseAdapter(publishedEvents, {
      sqliteQueryCommand: () =>
        Promise.resolve(
          JSON.stringify([
            {
              id: 'goose-sqlite-session',
              message_count: 3,
              model_config: '{"model_name":"gpt-4.1"}',
              name: 'SQLite Workspace',
              total_tokens: 88,
              updated_at: '2026-03-27T11:00:00.000Z',
              working_dir: '/repo/sqlite',
            },
          ]),
        ),
    });

    await (
      adapter as unknown as {
        pollSqliteSessions: (emitChanges: boolean) => Promise<void>;
      }
    ).pollSqliteSessions(true);
    await flushAsyncWork();

    expect(publishedEvents.map((event) => event.type)).toEqual([
      'session.start',
      'agent.idle',
    ]);
    expect(publishedEvents[0]).toMatchObject({
      data: {
        model: 'gpt-4.1',
        project: 'SQLite Workspace',
        projectPath: '/repo/sqlite',
      },
      type: 'session.start',
    });
  });

  it('maps Goose SSE tool requests into coding events', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const adapter = createGooseAdapter(publishedEvents);

    await (
      adapter as unknown as {
        processSessionEvent: (snapshot: unknown, payload: unknown) => Promise<void>;
      }
    ).processSessionEvent(
      {
        gooseSessionId: 'goose-session-2',
        model: 'claude-sonnet-4',
        name: 'AutoSnitch',
        sessionId: 'goose:AutoSnitch',
        totalTokens: 42,
        updatedAt: '2026-03-27T12:00:00.000Z',
        workingDir: '/repo',
      },
      {
        message: {
          content: [
            {
              toolCall: {
                arguments: {
                  filePath: '/repo/src/index.ts',
                },
                name: 'write_file',
              },
              type: 'toolRequest',
            },
          ],
          id: 'message-1',
          role: 'assistant',
        },
        token_state: {
          accumulatedTotalTokens: 99,
        },
        type: 'Message',
      },
    );

    expect(publishedEvents.map((event) => event.type)).toEqual([
      'session.start',
      'agent.idle',
      'agent.coding',
    ]);
    expect(publishedEvents.at(-1)).toMatchObject({
      data: {
        activeFile: '/repo/src/index.ts',
        toolInput: {
          filePath: '/repo/src/index.ts',
        },
        toolName: 'write_file',
        tokensUsed: 99,
      },
      type: 'agent.coding',
    });
  });

  it('emits process fallback session transitions', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    let currentProcessOutput = '999 goose\n';
    const adapter = createGooseAdapter(publishedEvents, {
      processListCommand: () => Promise.resolve(currentProcessOutput),
    });

    await (
      adapter as unknown as {
        pollGooseProcesses: () => Promise<void>;
      }
    ).pollGooseProcesses();
    currentProcessOutput = '';
    await (
      adapter as unknown as {
        pollGooseProcesses: () => Promise<void>;
      }
    ).pollGooseProcesses();

    expect(publishedEvents[0]?.type).toBe('session.start');
    expect(publishedEvents[1]?.type).toBe('session.end');
  });
});

function createEmptyResponse(url: URL): Response {
  if (url.pathname.endsWith('/events')) {
    return new Response('', { status: 404 });
  }

  return new Response('{}', {
    headers: {
      'content-type': 'application/json',
    },
    status: 404,
  });
}

async function flushAsyncWork(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function resolveUrl(input: string | URL | Request): URL {
  if (typeof input === 'string') {
    return new URL(input);
  }

  if (input instanceof URL) {
    return input;
  }

  return new URL(input.url);
}
