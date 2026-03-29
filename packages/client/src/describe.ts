/**
 * @file src/describe.ts
 * @description Human-readable helpers for transforming AISnitch events into
 *   display text, status lines, and mascot/companion animation states.
 *
 * @functions
 *   → describeEvent — short human-readable description of what the agent is doing
 *   → formatStatusLine — numbered status line with project path (for dashboards/TUIs)
 *   → eventToMascotState — map an event to a mood/animation/color state (for animated companions)
 *
 * @exports describeEvent, formatStatusLine, eventToMascotState, MascotState
 * @see ./types.ts — AISnitchEvent
 */

import type { AISnitchEvent, AISnitchEventType } from './types.js';

// ─── Mascot State ────────────────────────────────────────────────────────────

/** 📖 State descriptor for animated mascots/companions driven by the event stream. */
export interface MascotState {
  /** 📖 Emotional state of the mascot */
  readonly mood: 'idle' | 'thinking' | 'working' | 'waiting' | 'celebrating' | 'panicking';
  /** 📖 Suggested animation name (consumer decides how to render) */
  readonly animation: string;
  /** 📖 Suggested accent color (hex) */
  readonly color: string;
  /** 📖 Short label for the current state */
  readonly label: string;
  /** 📖 Optional extra detail (tool name, file, etc.) */
  readonly detail?: string;
}

// ─── Description maps ────────────────────────────────────────────────────────

// 📖 Maps each of the 12 event types to a human-readable verb phrase
const EVENT_DESCRIPTIONS: Record<AISnitchEventType, string> = {
  'session.start': 'started a new session',
  'session.end': 'ended the session',
  'task.start': 'started a new task',
  'task.complete': 'completed the task',
  'agent.thinking': 'is thinking...',
  'agent.coding': 'is editing code',
  'agent.tool_call': 'is calling a tool',
  'agent.streaming': 'is streaming a response',
  'agent.asking_user': 'is waiting for user input',
  'agent.idle': 'is idle',
  'agent.error': 'encountered an error',
  'agent.compact': 'is compacting context',
};

// 📖 Mascot mood mapping for each event type
const MASCOT_MAP: Record<AISnitchEventType, Omit<MascotState, 'detail'>> = {
  'session.start':    { mood: 'celebrating', animation: 'wave',     color: '#22c55e', label: 'New session!' },
  'session.end':      { mood: 'idle',        animation: 'sleep',    color: '#6b7280', label: 'Session ended' },
  'task.start':       { mood: 'working',     animation: 'stretch',  color: '#3b82f6', label: 'New task' },
  'task.complete':    { mood: 'celebrating', animation: 'dance',    color: '#22c55e', label: 'Task done!' },
  'agent.thinking':   { mood: 'thinking',    animation: 'ponder',   color: '#a855f7', label: 'Thinking...' },
  'agent.coding':     { mood: 'working',     animation: 'type',     color: '#f59e0b', label: 'Coding' },
  'agent.tool_call':  { mood: 'working',     animation: 'hammer',   color: '#f59e0b', label: 'Tool call' },
  'agent.streaming':  { mood: 'working',     animation: 'talk',     color: '#3b82f6', label: 'Streaming' },
  'agent.asking_user':{ mood: 'waiting',     animation: 'tap',      color: '#ef4444', label: 'Needs input' },
  'agent.idle':       { mood: 'idle',        animation: 'yawn',     color: '#6b7280', label: 'Idle' },
  'agent.error':      { mood: 'panicking',   animation: 'shake',    color: '#ef4444', label: 'Error!' },
  'agent.compact':    { mood: 'thinking',    animation: 'compress', color: '#a855f7', label: 'Compacting' },
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * 📖 Generate a short human-readable description of an AISnitch event.
 *
 * @example
 * ```ts
 * describeEvent(event);
 * // → "claude-code is editing code → src/index.ts [myproject]"
 * ```
 */
export function describeEvent(event: AISnitchEvent): string {
  const tool = event['aisnitch.tool'];
  const verb = EVENT_DESCRIPTIONS[event.type] ?? event.type;
  const parts = [`${tool} ${verb}`];

  // 📖 Append contextual details when available
  if (event.type === 'agent.tool_call' && event.data.toolName) {
    parts.push(`→ ${event.data.toolName}`);
    if (event.data.toolInput?.filePath) {
      parts.push(event.data.toolInput.filePath);
    }
  } else if (event.type === 'agent.coding' && event.data.activeFile) {
    parts.push(`→ ${event.data.activeFile}`);
  } else if (event.type === 'agent.error' && event.data.errorMessage) {
    parts.push(`— ${event.data.errorMessage}`);
  }

  if (event.data.project) {
    parts.push(`[${event.data.project}]`);
  }

  return parts.join(' ');
}

/**
 * 📖 Generate a numbered status line suitable for dashboards and TUIs.
 *
 * @param event - The AISnitch event to format
 * @param sessionNumber - Optional session number prefix (e.g. 1 → "#1")
 *
 * @example
 * ```ts
 * formatStatusLine(event, 3);
 * // → "#3 ~/projects/myapp — claude-code is thinking..."
 * ```
 */
export function formatStatusLine(event: AISnitchEvent, sessionNumber?: number): string {
  const parts: string[] = [];

  if (sessionNumber !== undefined) {
    parts.push(`#${sessionNumber}`);
  }

  // 📖 Show cwd or project path for context
  const location = event.data.cwd ?? event.data.projectPath;
  if (location) {
    parts.push(location);
    parts.push('—');
  }

  parts.push(describeEvent(event));

  return parts.join(' ');
}

/**
 * 📖 Map an AISnitch event to a mascot/companion state for animated UIs.
 *
 * Returns a mood, animation name, accent color, label, and optional detail
 * that companion apps can use to drive their character's behavior.
 *
 * @example
 * ```ts
 * const state = eventToMascotState(event);
 * updateSprite(state.mood, state.animation, state.color);
 * ```
 */
export function eventToMascotState(event: AISnitchEvent): MascotState {
  const base = MASCOT_MAP[event.type] ?? MASCOT_MAP['agent.idle'];

  // 📖 Add contextual detail when available
  let detail: string | undefined;
  if (event.data.toolName) {
    detail = event.data.toolName;
  } else if (event.data.activeFile) {
    detail = event.data.activeFile;
  } else if (event.data.errorMessage) {
    detail = event.data.errorMessage;
  }

  return detail ? { ...base, detail } : { ...base };
}
