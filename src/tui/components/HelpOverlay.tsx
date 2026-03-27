import React from 'react';
import { Box, Text } from 'ink';

import { TUI_THEME } from '../theme.js';

/**
 * @file src/tui/components/HelpOverlay.tsx
 * @description Compact help overlay listing the current AISnitch TUI keybinds.
 * @functions
 *   → HelpOverlay
 * @exports HelpOverlay
 * @see ../hooks/useKeyBinds.ts
 * @see ../App.tsx
 */

const HELP_LINES = [
  'q / Ctrl+C  quit cleanly',
  'f           filter by tool',
  't           filter by event type',
  '/           free-text search',
  'Esc         clear filters',
  'Space       freeze or resume stream',
  'c           clear buffered stream',
  '?           toggle help',
  'Tab         cycle focused panel',
];

/**
 * Renders the help box shown above the main panels.
 */
export function HelpOverlay(): React.JSX.Element {
  return (
    <Box
      borderColor={TUI_THEME.warning}
      borderStyle="round"
      flexDirection="column"
      marginTop={1}
      paddingX={1}
    >
      <Text bold color={TUI_THEME.panelTitle}>
        Keybinds
      </Text>
      {HELP_LINES.map((line) => (
        <Text key={line} color={TUI_THEME.panelBody}>
          {line}
        </Text>
      ))}
    </Box>
  );
}
