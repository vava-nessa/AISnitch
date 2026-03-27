import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../../core/config/defaults.js';
import type { AISnitchEvent } from '../../core/events/types.js';
import { CodexAdapter } from '../codex.js';

/**
 * @file src/adapters/__tests__/codex.test.ts
 * @description Unit coverage for Codex log parsing and process fallback handling.
 * @functions
 *   → createCodexAdapter
 * @exports none
 * @see ../codex.ts
 */

function createCodexAdapter(
  publishedEvents: AISnitchEvent[],
  processListCommand: () => Promise<string> = () => Promise.resolve(''),
) {
  return new CodexAdapter({
    config: DEFAULT_CONFIG,
    pollIntervalMs: 0,
    processListCommand,
    publishEvent: (event) => {
      publishedEvents.push(event);
      return Promise.resolve(true);
    },
  });
}

describe('CodexAdapter', () => {
  it('parses command executions from codex-tui.log into tool-call events', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const adapter = createCodexAdapter(publishedEvents);

    await (
      adapter as unknown as {
        processLogLine: (line: string) => Promise<void>;
      }
    ).processLogLine(
      '2026-03-27T14:50:00.000Z INFO codex {"command":"ls app","workdir":"/repo"}',
    );

    expect(publishedEvents.map((event) => event.type)).toEqual([
      'session.start',
      'agent.idle',
      'agent.tool_call',
    ]);
    expect(publishedEvents[2]).toMatchObject({
      data: {
        cwd: '/repo',
        toolInput: {
          command: 'ls app',
        },
        toolName: 'shell',
      },
    });
  });

  it('parses patch targets from codex-tui.log into coding events', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const adapter = createCodexAdapter(publishedEvents);

    await (
      adapter as unknown as {
        processLogLine: (line: string) => Promise<void>;
      }
    ).processLogLine(
      '2026-03-27T14:50:00.000Z INFO codex {"command":"ls app","workdir":"/repo"}',
    );
    await (
      adapter as unknown as {
        processLogLine: (line: string) => Promise<void>;
      }
    ).processLogLine('*** Update File: app/page.tsx');

    expect(publishedEvents.at(-1)).toMatchObject({
      data: {
        activeFile: 'app/page.tsx',
      },
      type: 'agent.coding',
    });
  });

  it('emits process fallback session transitions', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    let currentProcessOutput = '999 codex\n';
    const adapter = createCodexAdapter(
      publishedEvents,
      () => Promise.resolve(currentProcessOutput),
    );

    await (
      adapter as unknown as {
        pollCodexProcesses: () => Promise<void>;
      }
    ).pollCodexProcesses();
    currentProcessOutput = '';
    await (
      adapter as unknown as {
        pollCodexProcesses: () => Promise<void>;
      }
    ).pollCodexProcesses();

    expect(publishedEvents[0]?.type).toBe('session.start');
    expect(publishedEvents[1]?.type).toBe('session.end');
  });
});
