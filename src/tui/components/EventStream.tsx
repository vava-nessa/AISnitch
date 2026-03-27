import React from 'react';
import { Box, Text } from 'ink';

import type { AISnitchEvent } from '../../core/index.js';
import { TUI_THEME } from '../theme.js';
import { EventLine } from './EventLine.js';

/**
 * @file src/tui/components/EventStream.tsx
 * @description Live event stream panel content for the Ink TUI, rendering the visible event window and frozen-state hints.
 * @functions
 *   → EventStream
 * @exports EventStream, type EventStreamProps
 * @see ./EventLine.tsx
 * @see ../hooks/useEventStream.ts
 */

/**
 * Props accepted by the live event stream component.
 */
export interface EventStreamProps {
  readonly emptyState?: 'no-events' | 'no-match';
  readonly events: readonly AISnitchEvent[];
  readonly frozen: boolean;
  readonly pendingEventCount: number;
  readonly selectedEventId?: string | null;
}

/**
 * Renders the current visible portion of the live event stream.
 */
export function EventStream({
  emptyState = 'no-events',
  events,
  frozen,
  pendingEventCount,
  selectedEventId = null,
}: EventStreamProps): React.JSX.Element {
  if (events.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color={TUI_THEME.panelTitle}>
          {emptyState === 'no-events'
            ? 'No events yet. Start with Claude Code or OpenCode and the foreground bus will light up here.'
            : 'No buffered events match the current filters.'}
        </Text>
        <Text color={TUI_THEME.muted}>
          {emptyState === 'no-events'
            ? 'Use [f], [t], [/], and [?] to shape the live view once events start flowing.'
            : 'Change the active filters or clear them with Esc.'}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {events.map((event) => (
        <EventLine
          key={event.id}
          event={event}
          selected={selectedEventId === event.id}
        />
      ))}
      <Text color={TUI_THEME.muted}>
        {frozen
          ? `Frozen tail: ${pendingEventCount} newer ${
              pendingEventCount === 1 ? 'event is' : 'events are'
            } buffered.`
          : 'Live tail: newest events stay in view automatically.'}
      </Text>
    </Box>
  );
}
