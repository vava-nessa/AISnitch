/**
 * @file src/types.ts
 * @description Types for the fullscreen dashboard
 */

// Event types with enhanced content fields
export type AISnitchEventType =
  | 'session.start'
  | 'session.end'
  | 'task.start'
  | 'task.complete'
  | 'agent.thinking'
  | 'agent.coding'
  | 'agent.tool_call'
  | 'agent.streaming'
  | 'agent.asking_user'
  | 'agent.idle'
  | 'agent.error'
  | 'agent.compact';

export type ToolName =
  | 'claude-code'
  | 'opencode'
  | 'gemini-cli'
  | 'codex'
  | 'goose'
  | 'copilot-cli'
  | 'cursor'
  | 'aider'
  | 'amp'
  | 'cline'
  | 'continue'
  | 'windsurf'
  | 'qwen-code'
  | 'openclaw'
  | 'openhands'
  | 'kilo'
  | 'devin'
  | 'kiro'
  | 'augment-code'
  | 'mistral'
  | 'zed'
  | 'pi'
  | 'unknown';

export interface EventData {
  state: AISnitchEventType;
  project?: string;
  projectPath?: string;
  duration?: number;
  toolName?: string;
  toolInput?: { filePath?: string; command?: string };
  activeFile?: string;
  model?: string;
  tokensUsed?: number;
  errorMessage?: string;
  errorType?: string;
  raw?: Record<string, unknown>;
  terminal?: string;
  cwd?: string;
  pid?: number;
  instanceId?: string;
  instanceIndex?: number;
  instanceTotal?: number;
  // New enhanced fields
  thinkingContent?: string;
  toolCallName?: string;
  finalMessage?: string;
  toolResult?: string;
  messageContent?: string;
}

export interface AISnitchEvent {
  specversion: '1.0';
  id: string;
  source: string;
  type: AISnitchEventType;
  time: string;
  'aisnitch.tool': ToolName;
  'aisnitch.sessionid': string;
  'aisnitch.seqnum': number;
  data: EventData;
}

export interface AgentDisplay {
  sessionId: string;
  tool: ToolName;
  project?: string;
  model?: string;
  currentEvent: AISnitchEvent | null;
  lastEvents: AISnitchEvent[];
  connectedAt: number;
}

// Color schemes for each event type
export const EVENT_COLORS: Record<AISnitchEventType, string> = {
  'session.start': '#1a472a',
  'session.end': '#4a1942',
  'task.start': '#1e3a5f',
  'task.complete': '#2d4a3e',
  'agent.thinking': '#3d2b1f',
  'agent.coding': '#1a365d',
  'agent.tool_call': '#2d3748',
  'agent.streaming': '#1a202c',
  'agent.asking_user': '#744210',
  'agent.idle': '#2d3748',
  'agent.error': '#742a2a',
  'agent.compact': '#2d3748',
};

// Unique colors for each tool
export const TOOL_COLORS: Record<ToolName, string> = {
  'claude-code': '#d4a574',
  'opencode': '#7c3aed',
  'gemini-cli': '#10b981',
  'codex': '#6366f1',
  'goose': '#f59e0b',
  'copilot-cli': '#06b6d4',
  'cursor': '#22c55e',
  'aider': '#8b5cf6',
  'amp': '#ec4899',
  'cline': '#3b82f6',
  'continue': '#f97316',
  'windsurf': '#14b8a6',
  'qwen-code': '#eab308',
  'openclaw': '#a855f7',
  'openhands': '#64748b',
  'kilo': '#ef4444',
  'devin': '#84cc16',
  'kiro': '#06b6d4',
  'augment-code': '#f472b6',
  'mistral': '#0ea5e9',
  'zed': '#e85d04',
  'pi': '#1db954',
  'unknown': '#6b7280',
};

// Event type labels for display
export const EVENT_LABELS: Record<AISnitchEventType, string> = {
  'session.start': 'Session Started',
  'session.end': 'Session Ended',
  'task.start': 'Task Started',
  'task.complete': 'Task Complete',
  'agent.thinking': 'Thinking...',
  'agent.coding': 'Coding',
  'agent.tool_call': 'Tool Call',
  'agent.streaming': 'Output',
  'agent.asking_user': 'Waiting Input',
  'agent.idle': 'Idle',
  'agent.error': 'Error',
  'agent.compact': 'Memory Compact',
};

// Icons for each event type
export const EVENT_ICONS: Record<AISnitchEventType, string> = {
  'session.start': '🚀',
  'session.end': '✅',
  'task.start': '📝',
  'task.complete': '🏁',
  'agent.thinking': '💭',
  'agent.coding': '⌨️',
  'agent.tool_call': '🔧',
  'agent.streaming': '💬',
  'agent.asking_user': '❓',
  'agent.idle': '😴',
  'agent.error': '❌',
  'agent.compact': '🗜️',
};

// Tool icons
export const TOOL_ICONS: Record<ToolName, string> = {
  'claude-code': '🦄',
  'opencode': '🔮',
  'gemini-cli': '✨',
  'codex': '⚡',
  'goose': '🪰',
  'copilot-cli': '💜',
  'cursor': '💚',
  'aider': '🎗️',
  'amp': '⚡',
  'cline': '🔵',
  'continue': '🔄',
  'windsurf': '🌊',
  'qwen-code': '🐉',
  'openclaw': '🦞',
  'openhands': '👐',
  'kilo': '⚡',
  'devin': '🤖',
  'kiro': '🔷',
  'augment-code': '🔴',
  'mistral': '🌫️',
  'zed': '🟠',
  'pi': '🎵',
  'unknown': '❓',
};