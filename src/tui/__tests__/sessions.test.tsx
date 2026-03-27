import React from 'react';
import { renderToString } from 'ink';
import { describe, expect, it } from 'vitest';

import {
  createEvent,
  type AISnitchEvent,
  type AISnitchEventType,
} from '../../core/index.js';
import { GlobalBadge } from '../components/GlobalBadge.js';
import { SessionPanel } from '../components/SessionPanel.js';
import {
  deriveGlobalActivityStatus,
  deriveSessions,
} from '../hooks/useSessions.js';

/**
 * @file src/tui/__tests__/sessions.test.tsx
 * @description Coverage for derived session state, the global activity badge, and the rendered session panel.
 * @functions
 *   → createTestEvent
 * @exports none
 * @see ../hooks/useSessions.ts
 * @see ../components/SessionPanel.tsx
 * @see ../components/GlobalBadge.tsx
 */

describe('deriveSessions', () => {
  it('keeps active sessions, updates state, and drops completed ones', () => {
    const now = Date.parse('2026-03-27T12:00:10.000Z');
    const events = [
      createTestEvent('session.start', 'claude-code', {
        sessionId: 'claude-session',
        time: '2026-03-27T12:00:00.000Z',
      }),
      createTestEvent('agent.coding', 'claude-code', {
        sessionId: 'claude-session',
        time: '2026-03-27T12:00:05.000Z',
        data: {
          activeFile: 'src/tui/App.tsx',
        },
      }),
      createTestEvent('session.start', 'opencode', {
        sessionId: 'open-session',
        time: '2026-03-27T12:00:01.000Z',
      }),
      createTestEvent('session.end', 'opencode', {
        sessionId: 'open-session',
        time: '2026-03-27T12:00:04.000Z',
      }),
    ];

    const sessions = deriveSessions(events, {
      now,
      staleAfterMs: 60_000,
    });

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      activeFile: 'src/tui/App.tsx',
      currentState: 'agent.coding',
      eventCount: 2,
      sessionId: 'claude-session',
      tool: 'claude-code',
    });
    expect(sessions[0]?.durationMs).toBe(10_000);
  });

  it('marks stale sessions as inactive after the timeout', () => {
    const sessions = deriveSessions(
      [
        createTestEvent('agent.idle', 'claude-code', {
          sessionId: 'stale-session',
          time: '2026-03-27T12:00:00.000Z',
        }),
      ],
      {
        now: Date.parse('2026-03-27T12:03:00.000Z'),
        staleAfterMs: 30_000,
      },
    );

    expect(sessions).toHaveLength(0);
  });
});

describe('deriveGlobalActivityStatus', () => {
  it('prioritizes action-required above working and ready states', () => {
    expect(
      deriveGlobalActivityStatus([
        {
          currentState: 'agent.coding',
          durationMs: 1_000,
          eventCount: 2,
          lastEventAt: '2026-03-27T12:00:02.000Z',
          sessionId: 'coding-session',
          startedAt: '2026-03-27T12:00:00.000Z',
          tool: 'claude-code',
        },
        {
          currentState: 'agent.asking_user',
          durationMs: 500,
          eventCount: 1,
          lastEventAt: '2026-03-27T12:00:03.000Z',
          sessionId: 'blocked-session',
          startedAt: '2026-03-27T12:00:02.500Z',
          tool: 'opencode',
        },
      ]),
    ).toBe('action-required');
  });
});

describe('rendered session UI', () => {
  it('renders grouped sessions with state details', () => {
    const output = renderToString(
      <SessionPanel
        sessions={[
          {
            currentState: 'agent.thinking',
            durationMs: 65_000,
            eventCount: 4,
            lastEventAt: '2026-03-27T12:01:05.000Z',
            sessionId: 'session-abcdef1234567890',
            startedAt: '2026-03-27T12:00:00.000Z',
            tool: 'claude-code',
          },
        ]}
      />,
    );

    expect(output).toContain('claude-code (1)');
    expect(output).toContain('session-…567890');
    expect(output).toContain('thinking');
    expect(output).toContain('4 events');
    expect(output).toContain('1m 5s');
  });

  it('renders the global badge copy for each high-level state', () => {
    expect(
      renderToString(<GlobalBadge status="ready" />),
    ).toContain('Ready');
    expect(
      renderToString(<GlobalBadge status="working" />),
    ).toContain('Working');
    expect(
      renderToString(<GlobalBadge status="action-required" />),
    ).toContain('Action Required');
  });
});

function createTestEvent(
  type: AISnitchEventType,
  tool: AISnitchEvent['aisnitch.tool'],
  overrides: {
    readonly data?: Partial<AISnitchEvent['data']>;
    readonly sessionId?: string;
    readonly time?: string;
  } = {},
): AISnitchEvent {
  const time = overrides.time ?? '2026-03-27T12:00:00.000Z';

  return {
    ...createEvent({
      source: 'aisnitch://tests/tui-sessions',
      type,
      'aisnitch.tool': tool,
      'aisnitch.sessionid': overrides.sessionId ?? `${tool}-session`,
      'aisnitch.seqnum': 1,
      data: {
        state: type,
        ...overrides.data,
      },
    }),
    time,
  };
}
