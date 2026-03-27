/**
 * @file src/tui/index.ts
 * @description Placeholder entrypoint for the future Ink-based terminal UI.
 * @functions
 *   → none
 * @exports TUI_MODULE_PLACEHOLDER, TuiModulePlaceholder
 * @see ../../tasks/05-tui/task-tui.md
 */

/**
 * Describes the TUI module state before the live monitor is implemented.
 */
export interface TuiModulePlaceholder {
  readonly area: 'tui';
  readonly status: 'pending';
  readonly nextTask: 'tui-foundation-layout';
}

/**
 * 📖 The TUI module is part of the public surface already because the MVP is
 * meant to ship with a live terminal monitor as the main consumer.
 */
export const TUI_MODULE_PLACEHOLDER: TuiModulePlaceholder = {
  area: 'tui',
  status: 'pending',
  nextTask: 'tui-foundation-layout',
};
