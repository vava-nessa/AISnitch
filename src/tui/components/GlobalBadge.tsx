import React from 'react';
import { Text } from 'ink';

import type { GlobalActivityStatus } from '../hooks/useSessions.js';
import { TUI_THEME } from '../theme.js';

/**
 * @file src/tui/components/GlobalBadge.tsx
 * @description Compact activity badge for the TUI header, summarizing whether the system is idle, busy, or waiting on the user.
 * @functions
 *   → GlobalBadge
 * @exports GlobalBadge, type GlobalBadgeProps
 * @see ./Header.tsx
 * @see ../hooks/useSessions.ts
 */

/**
 * Props accepted by the global activity badge.
 */
export interface GlobalBadgeProps {
  readonly status: GlobalActivityStatus;
}

/**
 * Renders the high-level activity badge displayed in the TUI header.
 */
export function GlobalBadge({
  status,
}: GlobalBadgeProps): React.JSX.Element {
  switch (status) {
    case 'action-required':
      return (
        <Text bold color={TUI_THEME.danger}>
          ✋ Action Required
        </Text>
      );
    case 'working':
      return (
        <Text bold color={TUI_THEME.warning}>
          ✦ Working
        </Text>
      );
    default:
      return (
        <Text bold color={TUI_THEME.success}>
          ◇ Ready
        </Text>
      );
  }
}
