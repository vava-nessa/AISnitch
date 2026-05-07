import type { AISnitchEventType, ToolName } from '../core/index.js';

/**
 * @file src/tui/theme.ts
 * @description Shared color palette and presentation constants for the Ink-based AISnitch terminal UI.
 * @functions
 *   → none
 * @exports TOOL_COLORS, EVENT_COLORS, TUI_THEME, type TuiThemeColor
 * @see ./App.tsx
 * @see ./components/Header.tsx
 * @see ./components/StatusBar.tsx
 */

/**
 * Hex color string used across the terminal UI theme.
 */
export type TuiThemeColor = `#${string}`;

/**
 * 📖 Tools keep distinct colors so operators can scan mixed activity without
 * having to read every label in a busy stream.
 */
export const TOOL_COLORS: Record<ToolName, TuiThemeColor> = {
  'aider': '#14b8a6',
  'amp': '#fb7185',
  'augment-code': '#c084fc',
  'claude-code': '#f59e0b',
  'cline': '#f43f5e',
  'codex': '#f97316',
  'continue': '#06b6d4',
  'copilot-cli': '#60a5fa',
  'cursor': '#8b5cf6',
  'devin': '#f59e0b',
  'gemini-cli': '#38bdf8',
  'goose': '#ec4899',
  'kilo': '#84cc16',
  'kiro': '#06b6d4',
  'mistral': '#fb923c',
  'openhands': '#facc15',
  'openclaw': '#ef4444',
  'opencode': '#10b981',
  'pi': '#1db954',
  'qwen-code': '#22c55e',
  'unknown': '#94a3b8',
  'windsurf': '#a855f7',
  'zed': '#e85d04',
};

/**
 * Event types get their own accents so state changes read as a visual rhythm.
 */
export const EVENT_COLORS: Record<AISnitchEventType, TuiThemeColor> = {
  'agent.asking_user': '#ef4444',
  'agent.coding': '#22c55e',
  'agent.compact': '#f97316',
  'agent.error': '#ef4444',
  'agent.idle': '#64748b',
  'agent.streaming': '#22d3ee',
  'agent.thinking': '#facc15',
  'agent.tool_call': '#fb7185',
  'session.end': '#94a3b8',
  'session.start': '#10b981',
  'task.complete': '#34d399',
  'task.start': '#60a5fa',
};

/**
 * Global palette used for layout chrome and section accents.
 */
export const TUI_THEME = {
  background: '#111827',
  border: '#1f2937',
  danger: '#ef4444',
  footer: '#0f172a',
  frame: '#334155',
  headerGradient: ['#f59e0b', '#fb7185', '#22d3ee'] as const,
  muted: '#94a3b8',
  panelBody: '#e2e8f0',
  panelTitle: '#f8fafc',
  success: '#22c55e',
  warning: '#facc15',
} as const;
