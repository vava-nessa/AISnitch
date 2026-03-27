import React from 'react';
import { Box, Text } from 'ink';

import { countActiveFilters, type TuiFilters } from '../filters.js';
import type {
  FocusedPanel,
  TuiInteractionMode,
} from '../hooks/useKeyBinds.js';
import { TUI_THEME } from '../theme.js';
import type { TuiViewMode } from '../types.js';

/**
 * @file src/tui/components/FilterBar.tsx
 * @description Filter and command prompt bar for the AISnitch TUI, showing active filters, focus, and current interaction mode.
 * @functions
 *   → FilterBar
 * @exports FilterBar, type FilterBarProps
 * @see ../hooks/useKeyBinds.ts
 * @see ../filters.ts
 * @see ../App.tsx
 */

/**
 * Props accepted by the TUI filter bar.
 */
export interface FilterBarProps {
  readonly filters: TuiFilters;
  readonly focusPanel: FocusedPanel;
  readonly interaction: TuiInteractionMode;
  readonly viewMode: TuiViewMode;
}

/**
 * Renders the currently active filters and the inline prompt state.
 */
export function FilterBar({
  filters,
  focusPanel,
  interaction,
  viewMode,
}: FilterBarProps): React.JSX.Element {
  const activeFilterCount = countActiveFilters(filters);
  const focusLabel =
    focusPanel === 'events'
      ? 'events'
      : viewMode === 'full-data'
        ? 'inspector'
        : 'sessions';

  return (
    <Box
      borderColor={TUI_THEME.border}
      borderStyle="round"
      flexDirection="column"
      marginTop={1}
      paddingX={1}
    >
      <Text color={TUI_THEME.panelBody}>
        {`Focus ${focusLabel} | View ${viewMode} | Active filters ${activeFilterCount} | ${formatFilterSummary(
          filters,
        )}`}
      </Text>
      <Text color={TUI_THEME.muted}>
        {formatInteractionHint(interaction, focusPanel, viewMode)}
      </Text>
    </Box>
  );
}

function formatFilterSummary(filters: TuiFilters): string {
  const parts = [
    filters.tool ? `tool=${filters.tool}` : null,
    filters.eventType ? `type=${filters.eventType}` : null,
    filters.query.trim().length > 0 ? `search="${filters.query}"` : null,
  ].filter((value): value is string => value !== null);

  return parts.length > 0 ? parts.join(' | ') : 'no filters active';
}

function formatInteractionHint(
  interaction: TuiInteractionMode,
  focusPanel: FocusedPanel,
  viewMode: TuiViewMode,
): string {
  switch (interaction.kind) {
    case 'tool-filter':
      return `Tool filter > ${
        interaction.options[interaction.selectedIndex]?.label ?? 'All tools'
      }  (↑/↓ select, Enter apply, Esc clear)`;
    case 'type-filter':
      return `Type filter > ${
        interaction.options[interaction.selectedIndex]?.label ?? 'All event types'
      }  (↑/↓ select, Enter apply, Esc clear)`;
    case 'search':
      return `Search > ${interaction.draft}`;
    case 'help':
      return 'Help open  (? or Esc to close)';
    default:
      if (viewMode === 'full-data') {
        return focusPanel === 'events'
          ? 'Commands: [v] summary  [↑/↓ or j/k] select event  [Tab] inspector  [f/t//] filters'
          : 'Commands: [v] summary  [↑/↓ or j/k] scroll  [[/]] page  [Tab] events';
      }

      return 'Commands: [v] full-data  [f] tool  [t] type  [/] search  [Esc] clear filters  [Tab] focus';
  }
}
