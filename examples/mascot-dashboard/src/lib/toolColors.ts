import type { ToolName } from '@aisnitch/client';

const TOOL_COLORS: Record<ToolName, string> = {
  'claude-code': '#d97706',
  'opencode': '#22c55e',
  'gemini-cli': '#3b82f6',
  'codex': '#8b5cf6',
  'goose': '#f97316',
  'copilot-cli': '#6366f1',
  'aider': '#14b8a6',
  'openclaw': '#ec4899',
  'cursor': '#eab308',
  'amp': '#06b6d4',
  'cline': '#f43f5e',
  'continue': '#84cc16',
  'windsurf': '#0ea5e9',
  'qwen-code': '#a855f7',
  'openhands': '#10b981',
  'kilo': '#e11d48',
  'unknown': '#6b7280',
};

export function getToolColor(tool: ToolName): string {
  return TOOL_COLORS[tool] ?? TOOL_COLORS['unknown']!;
}

export { TOOL_COLORS };
