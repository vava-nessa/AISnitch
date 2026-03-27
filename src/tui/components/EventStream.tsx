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
  readonly events: readonly AISnitchEvent[];
  readonly frozen: boolean;
  readonly pendingEventCount: number;
}

/**
 * Renders the current visible portion of the live event stream.
 */
export function EventStream({
  events,
  frozen,
  pendingEventCount,
}: EventStreamProps): React.JSX.Element {
  if (events.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color={TUI_THEME.panelTitle}>
          No events yet. Start with Claude Code or OpenCode and the foreground bus
          will light up here.
        </Text>
        <Text color={TUI_THEME.muted}>
          Detailed live stream controls land in 05/03. Freeze already works with
          the space bar.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {events.map((event) => (
        <EventLine key={event.id} event={event} />
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
