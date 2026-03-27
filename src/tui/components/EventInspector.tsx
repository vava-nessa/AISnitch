import React from 'react';
import { Box, Text } from 'ink';

import type { AISnitchEvent } from '../../core/index.js';
import {
  buildEventInspectorLines,
  getVisibleInspectorWindow,
} from '../event-inspector.js';
import { TUI_THEME } from '../theme.js';

/**
 * @file src/tui/components/EventInspector.tsx
 * @description Scrollable full-data event inspector for the Ink TUI, rendering colorful metadata and the complete selected payload.
 * @functions
 *   → EventInspector
 * @exports EventInspector, type EventInspectorProps
 * @see ../event-inspector.ts
 * @see ../App.tsx
 */

/**
 * Props required by the full-data inspector panel.
 */
export interface EventInspectorProps {
  readonly event: AISnitchEvent | null;
  readonly lineOffset: number;
  readonly selectedEventIndex: number | null;
  readonly totalEventCount: number;
  readonly visibleLineCount: number;
}

/**
 * Renders the currently selected event with a colorful, scrollable full-data view.
 */
export function EventInspector({
  event,
  lineOffset,
  selectedEventIndex,
  totalEventCount,
  visibleLineCount,
}: EventInspectorProps): React.JSX.Element {
  if (event === null || selectedEventIndex === null) {
    return (
      <Box flexDirection="column">
        <Text color={TUI_THEME.panelTitle}>
          No event selected yet.
        </Text>
        <Text color={TUI_THEME.muted}>
          Press [v] to open full-data mode, then use [↑/↓] on the event panel to pick one event.
        </Text>
      </Box>
    );
  }

  const inspectorLines = buildEventInspectorLines(event);
  const visibleLines = getVisibleInspectorWindow(inspectorLines, {
    lineOffset,
    visibleLineCount,
  });
  const hiddenAbove = Math.max(0, lineOffset);
  const hiddenBelow = Math.max(
    0,
    inspectorLines.length - (lineOffset + visibleLines.length),
  );

  return (
    <Box flexDirection="column">
      <Text color={TUI_THEME.panelBody}>
        {`Selected ${selectedEventIndex + 1}/${totalEventCount} • ${inspectorLines.length} lines • [v] close • [↑/↓] scroll • [[/]] page`}
      </Text>
      {hiddenAbove > 0 ? (
        <Text color={TUI_THEME.muted}>
          {`↑ ${hiddenAbove} line${hiddenAbove === 1 ? '' : 's'} above`}
        </Text>
      ) : null}
      {visibleLines.map((line, lineIndex) => (
        <Text key={`${event.id}:${lineOffset + lineIndex}`}>
          {line.length === 0 || line.every((segment) => segment.text.length === 0)
            ? ' '
            : line.map((segment, segmentIndex) => (
                <Text
                  key={`${event.id}:${lineOffset + lineIndex}:${segmentIndex}`}
                  bold={segment.bold}
                  color={segment.color}
                >
                  {segment.text}
                </Text>
              ))}
        </Text>
      ))}
      {hiddenBelow > 0 ? (
        <Text color={TUI_THEME.muted}>
          {`↓ ${hiddenBelow} line${hiddenBelow === 1 ? '' : 's'} below`}
        </Text>
      ) : null}
    </Box>
  );
}
