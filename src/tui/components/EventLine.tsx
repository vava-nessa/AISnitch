import React from 'react';
import { Box, Text } from 'ink';

import {
  formatSessionLabelFromEvent,
  type AISnitchEvent,
  type AISnitchEventType,
} from '../../core/index.js';
import { EVENT_COLORS, TOOL_COLORS, TUI_THEME } from '../theme.js';

/**
 * @file src/tui/components/EventLine.tsx
 * @description Single formatted event row for the Ink live stream, including icon mapping, timestamp formatting, and optional detail output.
 * @functions
 *   → EventLine
 *   → formatEventTime
 *   → formatEventDetail
 * @exports EVENT_ICONS, EventLine, formatEventTime, formatEventDetail
 * @see ./EventStream.tsx
 * @see ../hooks/useEventStream.ts
 */

/**
 * 📖 The stream gets much easier to scan when each normalized state has a
 * stable visual marker instead of relying on color alone.
 */
export const EVENT_ICONS: Record<AISnitchEventType, string> = {
  'session.start': '🚀',
  'session.end': '👋',
  'task.start': '📝',
  'task.complete': '✅',
  'agent.thinking': '🤔',
  'agent.coding': '⌨️',
  'agent.tool_call': '🔧',
  'agent.streaming': '💬',
  'agent.asking_user': '✋',
  'agent.idle': '💤',
  'agent.error': '❌',
  'agent.compact': '🧠',
};

/**
 * Props required to render one formatted event row.
 */
export interface EventLineProps {
  readonly event: AISnitchEvent;
}

/**
 * Renders a single event row plus its optional detail line.
 */
export function EventLine({ event }: EventLineProps): React.JSX.Element {
  const detail = formatEventDetail(event);
  const sessionLabel = formatSessionLabelFromEvent(event);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={TUI_THEME.muted}>{formatEventTime(event.time)}</Text>
        <Text> </Text>
        <Text>{EVENT_ICONS[event.type]}</Text>
        <Text> </Text>
        <Text color={TOOL_COLORS[event['aisnitch.tool']]}>
          [{event['aisnitch.tool']}]
        </Text>
        <Text> </Text>
        <Text bold color={EVENT_COLORS[event.type]}>
          {event.type}
        </Text>
        {sessionLabel !== event['aisnitch.tool'] ? (
          <>
            <Text color={TUI_THEME.muted}> · </Text>
            <Text color={TUI_THEME.muted}>{sessionLabel}</Text>
          </>
        ) : null}
      </Box>
      {detail ? (
        <Box marginLeft={2}>
          <Text color={TUI_THEME.muted}>└─ {detail}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * Converts an ISO timestamp into a compact wall-clock string.
 */
export function formatEventTime(timestamp: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

/**
 * 📖 Detail lines stay short on purpose: the main row should remain scannable,
 * while the second row gives just enough context to understand why the event
 * matters without turning the stream into paragraph soup.
 */
export function formatEventDetail(event: AISnitchEvent): string | null {
  switch (event.type) {
    case 'agent.tool_call': {
      const toolTarget =
        event.data.toolInput?.filePath ??
        event.data.toolInput?.command ??
        event.data.activeFile ??
        'no input detail yet';

      return `${event.data.toolName ?? 'tool'}: ${toolTarget}`;
    }

    case 'agent.error':
      return [
        event.data.errorType ?? 'error',
        event.data.errorMessage ?? 'Unknown runtime error',
      ].join(': ');

    case 'task.start':
      return event.data.project
        ? `Prompt submitted for ${event.data.project}`
        : 'Prompt submitted';

    case 'task.complete':
      return event.data.duration
        ? `Completed in ${event.data.duration}ms`
        : 'Task completed';

    case 'agent.compact':
      return 'Context compaction triggered';

    case 'agent.asking_user':
      return event.data.errorMessage ?? 'User input required';

    case 'agent.streaming':
      return event.data.activeFile ?? event.data.cwd ?? 'Assistant response streaming';

    case 'agent.coding':
    case 'agent.thinking':
    case 'agent.idle':
      return event.data.activeFile ?? event.data.cwd ?? null;

    case 'session.start':
    case 'session.end':
      return event.data.projectPath ?? event.data.cwd ?? null;

    default:
      return null;
  }
}
