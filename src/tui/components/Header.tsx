import React from 'react';
import { Box, Text } from 'ink';
import BigText from 'ink-big-text';
import Gradient from 'ink-gradient';
import Spinner from 'ink-spinner';

import type { GlobalActivityStatus } from '../hooks/useSessions.js';
import { TUI_THEME } from '../theme.js';
import { GlobalBadge } from './GlobalBadge.js';

/**
 * @file src/tui/components/Header.tsx
 * @description Header chrome for the AISnitch TUI, including title treatment and connection status badge.
 * @functions
 *   → Header
 * @exports Header, type HeaderProps
 * @see ../App.tsx
 * @see ./StatusBar.tsx
 */

/**
 * Props accepted by the header component.
 */
export interface HeaderProps {
  readonly adapterCount: number;
  readonly columns: number;
  readonly connectionLabel: string;
  readonly connected: boolean;
  readonly globalStatus: GlobalActivityStatus;
  readonly version: string;
}

/**
 * 📖 The header does the "vitrine" job from the spec: bold title treatment,
 * a little theater, and the essential runtime badges in one glance.
 */
export function Header({
  adapterCount,
  columns,
  connectionLabel,
  connected,
  globalStatus,
  version,
}: HeaderProps): React.JSX.Element {
  const showBigTitle = columns >= 88;

  return (
    <Box
      borderColor={TUI_THEME.border}
      borderStyle="round"
      flexDirection="column"
      paddingX={1}
      paddingY={0}
    >
      <Box justifyContent="space-between">
        <Text color={TUI_THEME.muted}>memory-only live bridge</Text>
        <Text color={TUI_THEME.muted}>v{version}</Text>
      </Box>
      <Box justifyContent="space-between">
        <Box flexDirection="column" flexGrow={1}>
          {showBigTitle ? (
            <Gradient colors={[...TUI_THEME.headerGradient]}>
              <BigText font="tiny" text="AISnitch" />
            </Gradient>
          ) : (
            <Gradient colors={[...TUI_THEME.headerGradient]}>
              <Text bold> AISnitch </Text>
            </Gradient>
          )}
          <Text color={TUI_THEME.muted}>
            live AI tool telemetry with adapter-driven normalization
          </Text>
        </Box>
        <Box
          alignItems="flex-end"
          flexDirection="column"
          marginLeft={2}
          minWidth={26}
        >
          <Box>
            {connected ? (
              <Text bold color={TUI_THEME.success}>
                ● Connected · {connectionLabel}
              </Text>
            ) : (
              <>
                <Text bold color={TUI_THEME.warning}>
                  <Spinner type="dots" />
                </Text>
                <Text color={TUI_THEME.warning}> reconnecting</Text>
              </>
            )}
          </Box>
          <GlobalBadge status={globalStatus} />
          <Text color={TUI_THEME.muted}>{adapterCount} adapters armed</Text>
        </Box>
      </Box>
    </Box>
  );
}
