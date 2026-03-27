import React from 'react';
import { Box, Text } from 'ink';

import { TUI_THEME, type TuiThemeColor } from '../theme.js';

/**
 * @file src/tui/components/Layout.tsx
 * @description Reusable layout primitives for bordered panels and responsive panel stacks in the AISnitch TUI.
 * @functions
 *   → Panel
 *   → PanelStack
 * @exports Panel, PanelStack, type PanelProps, type PanelStackProps
 * @see ../App.tsx
 * @see ./Header.tsx
 * @see ./StatusBar.tsx
 */

/**
 * Props for a single framed panel.
 */
export interface PanelProps {
  readonly accentColor: TuiThemeColor;
  readonly children: React.ReactNode;
  readonly flexGrow?: number;
  readonly title: string;
}

/**
 * Props for a responsive panel stack.
 */
export interface PanelStackProps {
  readonly children: React.ReactNode;
  readonly compact?: boolean;
}

/**
 * 📖 A thin panel primitive keeps the TUI consistent without hiding Ink's
 * flexbox model behind too much framework glue.
 */
export function Panel({
  accentColor,
  children,
  flexGrow = 1,
  title,
}: PanelProps): React.JSX.Element {
  return (
    <Box
      borderColor={TUI_THEME.frame}
      borderStyle="round"
      flexDirection="column"
      flexGrow={flexGrow}
      minHeight={8}
      paddingX={1}
      paddingY={0}
    >
      <Box marginBottom={1}>
        <Text bold color={accentColor}>
          {title}
        </Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {children}
      </Box>
    </Box>
  );
}

/**
 * Renders the main body panels side by side on wide terminals and stacked on narrow ones.
 */
export function PanelStack({
  children,
  compact = false,
}: PanelStackProps): React.JSX.Element {
  return (
    <Box
      columnGap={1}
      flexDirection={compact ? 'column' : 'row'}
      flexGrow={1}
      rowGap={1}
    >
      {children}
    </Box>
  );
}
