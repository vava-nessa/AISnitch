/**
 * @file src/index.ts
 * @description Barrel export for @aisnitch/client — the official SDK for consuming the AISnitch WebSocket event stream.
 *
 * 🎯 Provides: typed client with auto-reconnect, Zod-validated event parsing,
 * session tracking, composable filters, and human-readable helpers.
 *
 * @exports AISnitchClient, createAISnitchClient, SessionTracker, filters,
 *          describeEvent, formatStatusLine, eventToMascotState, parseEvent, parseWelcome
 * @see ./client.ts — core WS client
 * @see ./sessions.ts — session state tracker
 * @see ./filters.ts — composable event filters
 * @see ./describe.ts — human-readable event descriptions
 */

// 📖 Core client
export { AISnitchClient, createAISnitchClient } from './client.js';
export type { AISnitchClientOptions } from './client.js';

// 📖 Session tracking
export { SessionTracker } from './sessions.js';
export type { SessionState } from './sessions.js';

// 📖 Filters
export { filters } from './filters.js';

// 📖 Human-readable helpers
export { describeEvent, eventToMascotState, formatStatusLine } from './describe.js';
export type { MascotState } from './describe.js';

// 📖 Types & constants
export type {
  AISnitchEvent,
  AISnitchEventData,
  AISnitchEventType,
  ErrorType,
  ToolInput,
  ToolName,
  WelcomeMessage,
} from './types.js';
export { AISNITCH_EVENT_TYPES, ERROR_TYPES, TOOL_NAMES } from './types.js';

// 📖 Schema & parsing
export { parseEvent, parseWelcome } from './schema.js';
