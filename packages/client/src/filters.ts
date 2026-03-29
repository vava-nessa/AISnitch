/**
 * @file src/filters.ts
 * @description Composable, typed filter functions for AISnitch events.
 *   Each filter returns a predicate `(event: AISnitchEvent) => boolean` that can
 *   be used with `Array.filter()`, `client.on()` callbacks, or composed together.
 *
 * @functions
 *   → filters.byTool — match events from a specific AI tool
 *   → filters.byType — match a single event type
 *   → filters.byTypes — match any of several event types
 *   → filters.byProject — match events from a specific project
 *   → filters.needsAttention — events requiring user input or indicating errors
 *   → filters.isCoding — events where the agent is actively writing/editing code
 *   → filters.isActive — events indicating the agent is doing something (not idle/ended)
 *
 * @exports filters
 * @see ./types.ts — AISnitchEvent, AISnitchEventType, ToolName
 */

import type { AISnitchEvent, AISnitchEventType, ToolName } from './types.js';

/** 📖 Event predicate type — used by all filter functions. */
export type EventFilter = (event: AISnitchEvent) => boolean;

/**
 * 📖 Ready-to-use composable filters for the AISnitch event stream.
 *
 * @example
 * ```ts
 * import { filters } from '@aisnitch/client';
 *
 * // Single filter
 * client.on('event', (e) => { ... });
 * const claudeEvents = allEvents.filter(filters.byTool('claude-code'));
 *
 * // Composed filters
 * const claudeCoding = allEvents
 *   .filter(filters.byTool('claude-code'))
 *   .filter(filters.isCoding);
 * ```
 */
export const filters = {
  /** 📖 Match events from a specific AI tool. */
  byTool: (tool: ToolName): EventFilter =>
    (e) => e['aisnitch.tool'] === tool,

  /** 📖 Match a single event type. */
  byType: (type: AISnitchEventType): EventFilter =>
    (e) => e.type === type,

  /** 📖 Match any of the given event types. */
  byTypes: (...types: AISnitchEventType[]): EventFilter =>
    (e) => types.includes(e.type),

  /** 📖 Match events from a specific project name. */
  byProject: (project: string): EventFilter =>
    (e) => e.data.project === project,

  /** 📖 Events requiring user attention — asking for input or reporting errors. */
  needsAttention: ((e: AISnitchEvent) =>
    e.type === 'agent.asking_user' || e.type === 'agent.error') as EventFilter,

  /** 📖 Events where the agent is actively coding — writing/editing files or calling tools. */
  isCoding: ((e: AISnitchEvent) =>
    e.type === 'agent.coding' || e.type === 'agent.tool_call') as EventFilter,

  /** 📖 Events indicating the agent is doing something (not idle, not ended). */
  isActive: ((e: AISnitchEvent) =>
    e.type !== 'agent.idle' && e.type !== 'session.end') as EventFilter,
} as const;
