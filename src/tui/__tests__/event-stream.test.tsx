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
import {
  buildEventInspectorLines,
  getVisibleInspectorWindow,
} from '../event-inspector.js';
import { formatEventLine } from '../live-monitor.js';

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

  it('renders richer thinking details when transcript data exists', () => {
    const output = renderToString(
      <EventLine
        event={createTestEvent('agent.thinking', {
          data: {
            model: 'claude-sonnet-4',
            tokensUsed: 1234,
            raw: {
              message: {
                content: [
                  {
                    thinking: 'Need to inspect README before editing.',
                    type: 'thinking',
                  },
                ],
              },
            },
          },
        })}
      />,
    );

    expect(output).toContain('thinking: Need to inspect README before editing.');
    expect(output).toContain('model claude-sonnet-4');
    expect(output).toContain('1,234 tok');
  });

  it('renders a visible selection marker for the focused event', () => {
    const output = renderToString(
      <EventLine
        event={createTestEvent('agent.streaming')}
        selected
      />,
    );

    expect(output).toContain('›');
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

  it('anchors the visible window around the selected event in full-data mode', () => {
    const bufferedEvents = Array.from({ length: 7 }, (_, index) =>
      createTestEvent('agent.coding', {
        'aisnitch.seqnum': index + 1,
      }),
    );

    const anchoredWindow = getVisibleEventWindow(bufferedEvents, {
      anchorIndex: 1,
      totalEvents: 7,
      visibleCount: 3,
    });

    expect(anchoredWindow.map((event) => event['aisnitch.seqnum'])).toEqual([1, 2, 3]);
  });
});

describe('live monitor formatting', () => {
  it('reuses the richer event detail formatter in text mode', () => {
    const line = formatEventLine(
      createTestEvent('agent.streaming', {
        data: {
          raw: {
            message: {
              content: [
                {
                  text: 'Applying the fix now.',
                  type: 'text',
                },
              ],
            },
          },
        },
      }),
    );

    expect(line).toContain(':: reply: Applying the fix now.');
  });
});

describe('event inspector formatting', () => {
  it('builds a colorful inspector payload with spotlight, normalized, and raw sections', () => {
    const lines = buildEventInspectorLines(
      createTestEvent('agent.tool_call', {
        data: {
          cwd: '/tmp/demo',
          model: 'claude-sonnet-4',
          raw: {
            hook_event_name: 'PostToolUse',
            transcript_path: '/tmp/transcript.jsonl',
          },
          tokensUsed: 42,
          toolInput: {
            filePath: 'src/tui/App.tsx',
          },
          toolName: 'Write',
        },
      }),
    );
    const renderedText = lines
      .map((line) => line.map((segment) => segment.text).join(''))
      .join('\n');

    expect(renderedText).toContain('Spotlight');
    expect(renderedText).toContain('summary: Write: src/tui/App.tsx');
    expect(renderedText).toContain('Normalized Data');
    expect(renderedText).toContain('Raw Source Payload');
    expect(renderedText).toContain('"hook_event_name"');
  });

  it('returns a scroll window for inspector lines', () => {
    const lines = buildEventInspectorLines(createTestEvent('agent.streaming'));
    const visibleWindow = getVisibleInspectorWindow(lines, {
      lineOffset: 2,
      visibleLineCount: 4,
    });

    expect(visibleWindow).toHaveLength(4);
    expect(visibleWindow[0]).toEqual(lines[2]);
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
