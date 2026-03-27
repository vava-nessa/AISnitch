import React from 'react';
import { renderToString } from 'ink';
import { describe, expect, it } from 'vitest';

import {
  createEvent,
  type AISnitchEvent,
  type AISnitchEventType,
} from '../../core/index.js';
import { EventLine, EVENT_ICONS } from '../components/EventLine.js';
import { EventStream } from '../components/EventStream.js';
import {
  appendEventToStream,
  getPendingFrozenEventCount,
  getVisibleEventWindow,
} from '../hooks/useEventStream.js';

/**
 * @file src/tui/__tests__/event-stream.test.tsx
 * @description Coverage for TUI event formatting, bounded stream storage, and frozen-tail visibility behavior.
 * @functions
 *   → none
 * @exports none
 * @see ../components/EventLine.tsx
 * @see ../components/EventStream.tsx
 * @see ../hooks/useEventStream.ts
 */

describe('EventLine', () => {
  it.each(Object.entries(EVENT_ICONS))(
    'renders the icon and event type for %s',
    (eventType, icon) => {
      const output = renderToString(
        <EventLine event={createTestEvent(eventType as AISnitchEventType)} />,
      );

      expect(output).toContain(icon);
      expect(output).toContain(eventType);
      expect(output).toContain('[claude-code]');
    },
  );

  it('renders a formatted detail line for tool calls', () => {
    const output = renderToString(
      <EventLine
        event={createTestEvent('agent.tool_call', {
          data: {
            toolName: 'Write',
            toolInput: {
              filePath: 'src/tui/App.tsx',
            },
          },
        })}
      />,
    );

    expect(output).toContain('Write: src/tui/App.tsx');
  });
});

describe('EventStream', () => {
  it('shows the frozen-tail hint when the stream is paused', () => {
    const output = renderToString(
      <EventStream
        events={[
          createTestEvent('agent.coding', {
            'aisnitch.seqnum': 1,
          }),
        ]}
        frozen
        pendingEventCount={3}
      />,
    );

    expect(output).toContain('Frozen tail: 3 newer events are buffered.');
  });
});

describe('useEventStream helpers', () => {
  it('keeps the live stream buffer capped at 500 events', () => {
    let bufferedEvents: readonly AISnitchEvent[] = [];

    for (let index = 1; index <= 505; index += 1) {
      bufferedEvents = appendEventToStream(bufferedEvents, createTestEvent('agent.streaming', {
        'aisnitch.seqnum': index,
      }));
    }

    expect(bufferedEvents).toHaveLength(500);
    expect(bufferedEvents[0]?.['aisnitch.seqnum']).toBe(6);
    expect(bufferedEvents.at(-1)?.['aisnitch.seqnum']).toBe(505);
  });

  it('returns the latest visible events while live and keeps a stable frozen window', () => {
    const bufferedEvents = Array.from({ length: 6 }, (_, index) =>
      createTestEvent('agent.coding', {
        'aisnitch.seqnum': index + 1,
      }),
    );

    const liveWindow = getVisibleEventWindow(bufferedEvents, {
      totalEvents: 6,
      visibleCount: 3,
    });
    const frozenWindow = getVisibleEventWindow(bufferedEvents, {
      frozenAtTotalEvents: 4,
      totalEvents: 6,
      visibleCount: 3,
    });

    expect(liveWindow.map((event) => event['aisnitch.seqnum'])).toEqual([4, 5, 6]);
    expect(frozenWindow.map((event) => event['aisnitch.seqnum'])).toEqual([2, 3, 4]);
    expect(getPendingFrozenEventCount(6, 4)).toBe(2);
  });
});

function createTestEvent(
  type: AISnitchEventType,
  overrides: {
    readonly 'aisnitch.seqnum'?: number;
    readonly data?: Partial<AISnitchEvent['data']>;
  } = {},
): AISnitchEvent {
  return createEvent({
    source: 'aisnitch://tests/tui',
    type,
    'aisnitch.tool': 'claude-code',
    'aisnitch.sessionid': 'session-123',
    'aisnitch.seqnum': overrides['aisnitch.seqnum'] ?? 1,
    data: {
      state: type,
      toolName: 'Read',
      toolInput: {
        filePath: 'README.md',
      },
      ...overrides.data,
    },
    ...overrides,
  });
}
