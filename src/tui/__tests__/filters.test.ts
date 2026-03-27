import { describe, expect, it } from 'vitest';

import {
  createEvent,
  type AISnitchEvent,
  type AISnitchEventType,
} from '../../core/index.js';
import {
  applyEventFilters,
  applySessionFilters,
  type SessionFilterTarget,
} from '../filters.js';

/**
 * @file src/tui/__tests__/filters.test.ts
 * @description Coverage for the pure TUI filter helpers used by the event stream and session panel.
 * @functions
 *   → createTestEvent
 * @exports none
 * @see ../filters.ts
 * @see ../App.tsx
 */

describe('applyEventFilters', () => {
  it('filters buffered events by tool, event type, and free-text query', () => {
    const events = [
      createTestEvent('agent.coding', 'claude-code', {
        data: {
          activeFile: 'src/tui/App.tsx',
          toolName: 'Write',
        },
      }),
      createTestEvent('agent.tool_call', 'opencode', {
        data: {
          toolInput: {
            command: 'pnpm test',
          },
        },
      }),
      createTestEvent('agent.thinking', 'claude-code', {
        data: {
          raw: {
            message: {
              content: [
                {
                  thinking: 'Need to inspect the project config first.',
                  type: 'thinking',
                },
              ],
            },
          },
        },
      }),
    ];

    expect(
      applyEventFilters(events, {
        eventType: 'agent.coding',
        query: 'app.tsx',
        tool: 'claude-code',
      }),
    ).toEqual([events[0]]);
    expect(
      applyEventFilters(events, {
        eventType: null,
        query: 'pnpm test',
        tool: null,
      }),
    ).toEqual([events[1]]);
    expect(
      applyEventFilters(events, {
        eventType: null,
        query: 'project config first',
        tool: null,
      }),
    ).toEqual([events[2]]);
  });
});

describe('applySessionFilters', () => {
  it('filters derived sessions using the shared global filter state', () => {
    const sessions: readonly SessionFilterTarget[] = [
      {
        activeFile: 'src/tui/App.tsx',
        currentState: 'agent.coding',
        project: 'AutoSnitch',
        projectPath: '/Users/vava/Documents/GitHub/AutoSnitch',
        sessionId: 'session-claude',
        tool: 'claude-code',
      },
      {
        activeFile: 'README.md',
        currentState: 'agent.asking_user',
        project: 'Playground',
        projectPath: '/tmp/playground',
        sessionId: 'session-open',
        tool: 'opencode',
      },
    ];

    expect(
      applySessionFilters(sessions, {
        eventType: 'agent.asking_user',
        query: 'playground',
        tool: 'opencode',
      }),
    ).toEqual([sessions[1]]);
  });
});

function createTestEvent(
  type: AISnitchEventType,
  tool: AISnitchEvent['aisnitch.tool'],
  overrides: {
    readonly data?: Partial<AISnitchEvent['data']>;
    readonly sessionId?: string;
  } = {},
): AISnitchEvent {
  return createEvent({
    source: 'aisnitch://tests/tui-filters',
    type,
    'aisnitch.tool': tool,
    'aisnitch.sessionid': overrides.sessionId ?? `${tool}-session`,
    'aisnitch.seqnum': 1,
    data: {
      state: type,
      toolName: 'Read',
      ...overrides.data,
    },
  });
}
