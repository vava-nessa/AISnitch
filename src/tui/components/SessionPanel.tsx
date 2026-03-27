import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

import type { SessionState } from '../hooks/useSessions.js';
import { TOOL_COLORS, TUI_THEME } from '../theme.js';

/**
 * @file src/tui/components/SessionPanel.tsx
 * @description Grouped active-session renderer for the AISnitch TUI, including state-specific visual cues and durations.
 * @functions
 *   → SessionPanel
 * @exports SessionPanel, type SessionPanelProps
 * @see ../hooks/useSessions.ts
 * @see ../App.tsx
 */

/**
 * Props accepted by the session panel renderer.
 */
export interface SessionPanelProps {
  readonly sessions: readonly SessionState[];
}

/**
 * 📖 Session grouping stays intentionally compact so operators can tell "who
 * is doing what" without the panel becoming wider than the event stream.
 */
export function SessionPanel({
  sessions,
}: SessionPanelProps): React.JSX.Element {
  if (sessions.length === 0) {
    return (
      <Text color={TUI_THEME.muted}>
        No active sessions match the current view.
      </Text>
    );
  }

  const groupedSessions = groupSessionsByTool(sessions);

  return (
    <Box flexDirection="column">
      {groupedSessions.map(([toolName, toolSessions]) => (
        <Box key={toolName} flexDirection="column" marginBottom={1}>
          <Text bold color={TOOL_COLORS[toolName]}>
            {toolName} ({toolSessions.length})
          </Text>
          {toolSessions.map((session) => (
            <Box key={session.sessionId} flexDirection="column" marginLeft={1}>
              <Text color={TOOL_COLORS[session.tool]}>
                ● {truncateSessionId(session.sessionId)}
              </Text>
              <Box marginLeft={2}>
                {renderStateLabel(session)}
                <Text color={TUI_THEME.muted}>
                  {` · ${session.eventCount} events · ${formatDuration(session.durationMs)}`}
                </Text>
              </Box>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}

function renderStateLabel(session: SessionState): React.JSX.Element {
  switch (session.currentState) {
    case 'agent.coding':
      return (
        <Text color={TUI_THEME.success}>
          <Spinner type="runner" /> coding
        </Text>
      );
    case 'agent.thinking':
      return (
        <Text color={TUI_THEME.warning}>
          <Spinner type="dots" /> thinking
        </Text>
      );
    case 'agent.asking_user':
      return (
        <Text bold color={TUI_THEME.danger}>
          ✋ asking_user
        </Text>
      );
    case 'agent.error':
      return (
        <Text bold color={TUI_THEME.danger}>
          ❌ error
        </Text>
      );
    case 'agent.idle':
      return <Text color={TUI_THEME.muted}>idle</Text>;
    default:
      return (
        <Text color={TUI_THEME.panelBody}>{session.currentState}</Text>
      );
  }
}

function groupSessionsByTool(
  sessions: readonly SessionState[],
): readonly [SessionState['tool'], readonly SessionState[]][] {
  const groupedSessions = new Map<SessionState['tool'], SessionState[]>();

  for (const session of sessions) {
    const toolSessions = groupedSessions.get(session.tool) ?? [];

    toolSessions.push(session);
    groupedSessions.set(session.tool, toolSessions);
  }

  return [...groupedSessions.entries()];
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function truncateSessionId(sessionId: string): string {
  return sessionId.length <= 18
    ? sessionId
    : `${sessionId.slice(0, 8)}…${sessionId.slice(-6)}`;
}
