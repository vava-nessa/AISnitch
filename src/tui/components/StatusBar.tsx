import React from 'react';
import { Box, Text } from 'ink';

import type { AISnitchEvent } from '../../core/index.js';
import type { FocusedPanel } from '../hooks/useKeyBinds.js';
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
  readonly activeFilterCount: number;
  readonly adapterCount: number;
  readonly columns: number;
  readonly connected: boolean;
  readonly consumerCount: number;
  readonly eventCount: number;
  readonly focusPanel: FocusedPanel;
  readonly latestEvent: AISnitchEvent | null;
  readonly pendingEventCount?: number;
  readonly streamFrozen: boolean;
  readonly uptimeMs: number;
}

/**
 * Renders the lower chrome with lightweight stats and keyboard hints.
 */
export function StatusBar({
  activeFilterCount,
  adapterCount,
  columns,
  connected,
  consumerCount,
  eventCount,
  focusPanel,
  latestEvent,
  pendingEventCount = 0,
  streamFrozen,
  uptimeMs,
}: StatusBarProps): React.JSX.Element {
  const streamState = streamFrozen
    ? `Frozen +${pendingEventCount}`
    : latestEvent?.type ?? 'Live';

  return (
    <Box
      borderColor={TUI_THEME.border}
      borderStyle="round"
      flexDirection="column"
      paddingX={1}
      paddingY={0}
    >
      <Text color={TUI_THEME.panelBody}>
        {`Events ${eventCount} | Adapters ${adapterCount} | Consumers ${consumerCount} | Filters ${activeFilterCount} | Focus ${focusPanel} | Up ${formatUptime(
          uptimeMs,
        )} | ${streamState} | Size ${columns}c`}
      </Text>
      <Text color={TUI_THEME.muted}>
        {connected
          ? streamFrozen
            ? '[space] resume  [q] quit  [?] help  [f/t//] filters  [c] clear'
            : '[space] freeze  [q] quit  [?] help  [f/t//] filters  [c] clear'
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
