import type { AISnitchEventType, ToolName } from '../core/index.js';

/**
 * @file src/tui/types.ts
 * @description Shared TUI runtime types reused by the renderer entrypoints, app shell, and CLI integration layer.
 * @functions
 *   → none
 * @exports TUI_VIEW_MODES, TuiViewMode, TuiInitialFilters, TuiDaemonSnapshot, TuiStatusSnapshot, ManagedTuiSnapshot
 * @see ./App.tsx
 * @see ./index.tsx
 */

/**
 * Supported body views for the interactive TUI.
 */
export const TUI_VIEW_MODES = ['summary', 'full-data'] as const;

/**
 * Union of the TUI body views accepted by CLI and renderer code.
 */
export type TuiViewMode = (typeof TUI_VIEW_MODES)[number];

/**
 * CLI or runtime-provided filters applied when the TUI opens.
 */
export interface TuiInitialFilters {
  readonly query?: string;
  readonly tool?: ToolName;
  readonly type?: AISnitchEventType;
  readonly view?: TuiViewMode;
}

/**
 * Optional daemon-management metadata displayed by the PM2-style dashboard.
 */
export interface TuiDaemonSnapshot {
  readonly active: boolean;
  readonly busyAction?: 'starting' | 'stopping' | null;
  readonly httpUrl: string;
  readonly pid: number | null;
  readonly socketPath: string | null;
  readonly wsUrl: string;
}

/**
 * Lightweight runtime snapshot consumed by the TUI shell.
 */
export interface TuiStatusSnapshot {
  readonly connected: boolean;
  readonly connectionLabel: string;
  readonly consumerCount: number;
  readonly daemon?: TuiDaemonSnapshot;
  readonly eventCount: number;
  readonly uptimeMs: number;
}

/**
 * Full renderer snapshot used by the managed dashboard mode.
 */
export interface ManagedTuiSnapshot {
  readonly configuredAdapters: readonly ToolName[];
  readonly status: TuiStatusSnapshot;
}
