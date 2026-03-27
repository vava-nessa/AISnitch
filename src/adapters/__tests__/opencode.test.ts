import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../../core/config/defaults.js';
import type { AISnitchEvent } from '../../core/events/types.js';
import { OpenCodeAdapter } from '../opencode.js';

/**
 * @file src/adapters/__tests__/opencode.test.ts
 * @description Unit coverage for OpenCode plugin-event mapping and process fallback handling.
 * @functions
 *   → createOpenCodeAdapter
 * @exports none
 * @see ../opencode.ts
 */

function createOpenCodeAdapter(
  publishedEvents: AISnitchEvent[],
  processListCommand: () => Promise<string> = () => Promise.resolve(''),
) {
  return new OpenCodeAdapter({
    config: DEFAULT_CONFIG,
    pollIntervalMs: 0,
    processListCommand,
    publishEvent: (event) => {
      publishedEvents.push(event);
      return Promise.resolve(true);
    },
  });
}

describe('OpenCodeAdapter', () => {
  it('accepts normalized plugin payloads from aisnitch setup', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const adapter = createOpenCodeAdapter(publishedEvents);

    await adapter.handleHook({
      data: {
        raw: {
          opencodeEvent: {
            type: 'session.created',
          },
        },
      },
      sessionId: 'open-session',
      source: 'aisnitch://plugins/opencode',
      type: 'session.start',
    });

    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0]).toMatchObject({
      'aisnitch.sessionid': 'open-session',
      type: 'session.start',
    });
  });

  it('upgrades generic normalized session ids into richer scoped ids', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const adapter = createOpenCodeAdapter(publishedEvents);

    await adapter.handleHook({
      cwd: '/Users/vava/Documents/GitHub/AutoSnitch',
      data: {
        cwd: '/Users/vava/Documents/GitHub/AutoSnitch',
        project: 'AutoSnitch',
      },
      pid: 31337,
      sessionId: 'opencode-session',
      source: 'aisnitch://plugins/opencode',
      type: 'session.start',
    });

    expect(publishedEvents[0]?.['aisnitch.sessionid']).toBe(
      'opencode:AutoSnitch:p31337',
    );
  });

  it('maps raw OpenCode tool events to agent.tool_call', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const adapter = createOpenCodeAdapter(publishedEvents);

    await adapter.handleHook({
      args: {
        command: 'pnpm test',
      },
      sessionID: 'open-session',
      tool: {
        name: 'bash',
      },
      type: 'tool.execute.before',
    });

    expect(publishedEvents[0]).toMatchObject({
      data: {
        toolInput: {
          command: 'pnpm test',
        },
        toolName: 'bash',
      },
      type: 'agent.tool_call',
    });
  });

  it('emits process fallback session transitions', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    let currentProcessOutput = '999 opencode\n';
    const adapter = createOpenCodeAdapter(
      publishedEvents,
      () => Promise.resolve(currentProcessOutput),
    );

    await (
      adapter as unknown as {
        pollOpenCodeProcesses: () => Promise<void>;
      }
    ).pollOpenCodeProcesses();
    currentProcessOutput = '';
    await (
      adapter as unknown as {
        pollOpenCodeProcesses: () => Promise<void>;
      }
    ).pollOpenCodeProcesses();

    expect(publishedEvents[0]?.type).toBe('session.start');
    expect(publishedEvents[1]?.type).toBe('session.end');
  });
});
