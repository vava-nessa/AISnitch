import React from 'react';
import { Box, Text } from 'ink';

import type { AISnitchEvent } from '../../core/index.js';
import type { FocusedPanel } from '../hooks/useKeyBinds.js';
import { TUI_THEME } from '../theme.js';
import type { TuiDaemonSnapshot, TuiViewMode } from '../types.js';

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
  readonly daemon?: TuiDaemonSnapshot;
  readonly eventCount: number;
  readonly focusPanel: FocusedPanel;
  readonly latestEvent: AISnitchEvent | null;
  readonly pendingEventCount?: number;
  readonly streamFrozen: boolean;
  readonly uptimeMs: number;
  readonly viewMode: TuiViewMode;
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
  daemon,
  eventCount,
  focusPanel,
  latestEvent,
  pendingEventCount = 0,
  streamFrozen,
  uptimeMs,
  viewMode,
}: StatusBarProps): React.JSX.Element {
  const streamState = streamFrozen
    ? `Frozen +${pendingEventCount}`
    : latestEvent?.type ?? 'Live';
  const focusLabel =
    focusPanel === 'events'
      ? 'events'
      : viewMode === 'full-data'
        ? 'inspector'
        : 'sessions';
  const daemonLabel =
    daemon === undefined
      ? null
      : daemon.busyAction
        ? `Daemon ${daemon.busyAction}`
        : daemon.active
          ? `Daemon active · Web ${daemon.dashboardUrl}`
          : `Daemon not active · Web ${daemon.dashboardUrl}`;

  return (
    <Box
      borderColor={TUI_THEME.border}
      borderStyle="round"
      flexDirection="column"
      paddingX={1}
      paddingY={0}
    >
      <Text color={TUI_THEME.panelBody}>
        {`Events ${eventCount} | Adapters ${adapterCount} | Consumers ${consumerCount} | Filters ${activeFilterCount} | Focus ${focusLabel} | View ${viewMode} | Up ${formatUptime(
          uptimeMs,
        )} | ${streamState}${daemonLabel ? ` | ${daemonLabel}` : ''} | Size ${columns}c`}
      </Text>
      <Text color={TUI_THEME.muted}>
        {daemon
          ? connected
            ? `${
                daemon.active ? '[d] stop daemon' : '[d] start daemon'
              }  [r] refresh  ${
                streamFrozen
                  ? '[space] resume  [v] full-data  [q] quit  [?] help  [f/t//] filters  [c] clear'
                  : '[space] freeze  [v] full-data  [q] quit  [?] help  [f/t//] filters  [c] clear'
              }`
            : `${daemon.active ? '[d] stop daemon' : '[d] start daemon'}  [r] refresh  [v] full-data  [q] quit  [?] help`
          : connected
          ? streamFrozen
            ? '[space] resume  [v] full-data  [q] quit  [?] help  [f/t//] filters  [c] clear'
            : '[space] freeze  [v] full-data  [q] quit  [?] help  [f/t//] filters  [c] clear'
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
