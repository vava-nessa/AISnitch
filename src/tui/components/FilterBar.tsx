import React from 'react';
import { Box, Text } from 'ink';

import { countActiveFilters, type TuiFilters } from '../filters.js';
import type {
  FocusedPanel,
  TuiInteractionMode,
} from '../hooks/useKeyBinds.js';
import { TUI_THEME } from '../theme.js';

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
}

/**
 * Renders the currently active filters and the inline prompt state.
 */
export function FilterBar({
  filters,
  focusPanel,
  interaction,
}: FilterBarProps): React.JSX.Element {
  const activeFilterCount = countActiveFilters(filters);

  return (
    <Box
      borderColor={TUI_THEME.border}
      borderStyle="round"
      flexDirection="column"
      marginTop={1}
      paddingX={1}
    >
      <Text color={TUI_THEME.panelBody}>
        {`Focus ${focusPanel} | Active filters ${activeFilterCount} | ${formatFilterSummary(
          filters,
        )}`}
      </Text>
      <Text color={TUI_THEME.muted}>{formatInteractionHint(interaction)}</Text>
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

function formatInteractionHint(interaction: TuiInteractionMode): string {
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
      return 'Commands: [f] tool  [t] type  [/] search  [Esc] clear filters  [Tab] focus';
  }
}
