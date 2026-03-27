import type { AISnitchEventType, ToolName } from '../core/index.js';

/**
 * @file src/tui/types.ts
 * @description Shared TUI runtime types reused by the renderer entrypoints, app shell, and CLI integration layer.
 * @functions
 *   → none
 * @exports TuiInitialFilters, TuiStatusSnapshot
 * @see ./App.tsx
 * @see ./index.tsx
 */

/**
 * CLI or runtime-provided filters applied when the TUI opens.
 */
export interface TuiInitialFilters {
  readonly query?: string;
  readonly tool?: ToolName;
  readonly type?: AISnitchEventType;
}

/**
 * Lightweight runtime snapshot consumed by the TUI shell.
 */
export interface TuiStatusSnapshot {
  readonly connected: boolean;
  readonly connectionLabel: string;
  readonly consumerCount: number;
  readonly eventCount: number;
  readonly uptimeMs: number;
}
