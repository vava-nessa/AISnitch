/**
 * @file src/types.ts
 * @description Core TypeScript types for the @aisnitch/client SDK.
 *   These types mirror the server's CloudEvents-based event contract,
 *   extracted as standalone definitions so the SDK has zero dependency on server code.
 *
 * @exports AISnitchEventType, ToolName, ErrorType, ToolInput, AISnitchEventData,
 *          AISnitchEvent, WelcomeMessage, AISNITCH_EVENT_TYPES, TOOL_NAMES, ERROR_TYPES
 *
 * @see ../../src/core/events/schema.ts — server-side source of truth
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * 📖 The 12 normalized AISnitch event types — kept as a const tuple so
 * union types, schemas, and runtime checks all derive from one source.
 */
export const AISNITCH_EVENT_TYPES = [
  'session.start',
  'session.end',
  'task.start',
  'task.complete',
  'agent.thinking',
  'agent.coding',
  'agent.tool_call',
  'agent.streaming',
  'agent.asking_user',
  'agent.idle',
  'agent.error',
  'agent.compact',
] as const;

/**
 * 📖 Supported AI tool identifiers recognized by AISnitch.
 */
export const TOOL_NAMES = [
  'claude-code',
  'opencode',
  'gemini-cli',
  'codex',
  'goose',
  'copilot-cli',
  'cursor',
  'aider',
  'amp',
  'cline',
  'continue',
  'windsurf',
  'qwen-code',
  'openclaw',
  'openhands',
  'kilo',
  'unknown',
] as const;

/**
 * 📖 Normalized error categories attached to `agent.error` events.
 */
export const ERROR_TYPES = [
  'rate_limit',
  'context_overflow',
  'tool_failure',
  'api_error',
] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

/** 📖 Union of the 12 normalized AISnitch event type strings. */
export type AISnitchEventType = (typeof AISNITCH_EVENT_TYPES)[number];

/** 📖 Union of supported AI tool identifiers. */
export type ToolName = (typeof TOOL_NAMES)[number];

/** 📖 Union of normalized error categories for `agent.error`. */
export type ErrorType = (typeof ERROR_TYPES)[number];

/** 📖 Tool call input metadata — at least one of filePath/command is present. */
export interface ToolInput {
  readonly filePath?: string;
  readonly command?: string;
}

/**
 * 📖 Normalized event payload carried inside `data.*`.
 * Matches the server's `EventDataSchema` — all fields except `state` are optional.
 */
export interface AISnitchEventData {
  readonly state: AISnitchEventType;
  readonly project?: string;
  readonly projectPath?: string;
  readonly duration?: number;
  readonly toolName?: string;
  readonly toolInput?: ToolInput;
  readonly activeFile?: string;
  readonly model?: string;
  readonly tokensUsed?: number;
  readonly errorMessage?: string;
  readonly errorType?: ErrorType;
  readonly raw?: Record<string, unknown>;
  readonly terminal?: string;
  readonly cwd?: string;
  readonly pid?: number;
  readonly instanceId?: string;
  readonly instanceIndex?: number;
  readonly instanceTotal?: number;
}

/**
 * 📖 Full AISnitch event envelope — CloudEvents v1.0 with AISnitch extensions.
 * This is the shape of every message received over the WebSocket (except welcome).
 */
export interface AISnitchEvent {
  readonly specversion: '1.0';
  readonly id: string;
  readonly source: string;
  readonly type: AISnitchEventType;
  readonly time: string;
  readonly 'aisnitch.tool': ToolName;
  readonly 'aisnitch.sessionid': string;
  readonly 'aisnitch.seqnum': number;
  readonly data: AISnitchEventData;
}

/**
 * 📖 Welcome message sent by the AISnitch WS server upon connection.
 * This is NOT an event — it's intercepted by the client and stored separately.
 */
export interface WelcomeMessage {
  readonly type: 'welcome';
  readonly version: string;
  readonly activeTools: ToolName[];
  readonly uptime: number;
}
