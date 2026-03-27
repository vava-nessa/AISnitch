import React from 'react';
import { Box, Text } from 'ink';

import { TUI_THEME } from '../theme.js';

/**
 * @file src/tui/components/StatusBar.tsx
 * @description Footer status bar for runtime counts, uptime, and keybind hints in the AISnitch TUI.
 * @functions
 *   → StatusBar
 * @exports StatusBar, type StatusBarProps
 * @see ../App.tsx
 */

/**
 * Props accepted by the status bar component.
 */
export interface StatusBarProps {
  readonly adapterCount: number;
  readonly columns: number;
  readonly connected: boolean;
  readonly consumerCount: number;
  readonly eventCount: number;
  readonly uptimeMs: number;
}

/**
 * Renders the lower chrome with lightweight stats and keyboard hints.
 */
export function StatusBar({
  adapterCount,
  columns,
  connected,
  consumerCount,
  eventCount,
  uptimeMs,
}: StatusBarProps): React.JSX.Element {
  return (
    <Box
      borderColor={TUI_THEME.border}
      borderStyle="round"
      flexDirection="column"
      paddingX={1}
      paddingY={0}
    >
      <Text color={TUI_THEME.panelBody}>
        {`Events ${eventCount} | Adapters ${adapterCount} | Consumers ${consumerCount} | Up ${formatUptime(
          uptimeMs,
        )} | Size ${columns}c`}
      </Text>
      <Text color={TUI_THEME.muted}>
        {connected
          ? '[q] quit  [?] help  [f] filters soon  [space] stream controls soon'
          : '[q] quit  waiting for foreground bus'}
      </Text>
    </Box>
  );
}

function formatUptime(uptimeMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(uptimeMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}
