/**
 * @file src/schema.ts
 * @description Zod schemas for validating AISnitch events received over WebSocket.
 *   Provides `parseEvent()` for safe parsing — returns null on invalid payloads, never throws.
 *
 * @functions
 *   → parseEvent — safe-parse a raw unknown value into an AISnitchEvent or null
 *   → parseWelcome — safe-parse a raw unknown value into a WelcomeMessage or null
 *
 * @exports EventDataSchema, AISnitchEventSchema, WelcomeMessageSchema, parseEvent, parseWelcome
 * @see ./types.ts
 */

import { z } from 'zod';

import {
  AISNITCH_EVENT_TYPES,
  ERROR_TYPES,
  TOOL_NAMES,
  type AISnitchEvent,
  type WelcomeMessage,
} from './types.js';

// ─── Atomic schemas ──────────────────────────────────────────────────────────

const AISnitchEventTypeSchema = z.enum(AISNITCH_EVENT_TYPES);
const ToolNameSchema = z.enum(TOOL_NAMES);
const ErrorTypeSchema = z.enum(ERROR_TYPES);

const ToolInputSchema = z.object({
  filePath: z.string().min(1).optional(),
  command: z.string().min(1).optional(),
});

// ─── Composite schemas ──────────────────────────────────────────────────────

/** 📖 Schema for the normalized event payload (`data.*`). */
export const EventDataSchema = z.object({
  state: AISnitchEventTypeSchema,
  project: z.string().min(1).optional(),
  projectPath: z.string().min(1).optional(),
  duration: z.number().int().min(0).optional(),
  toolName: z.string().min(1).optional(),
  toolInput: ToolInputSchema.optional(),
  activeFile: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  tokensUsed: z.number().int().min(0).optional(),
  errorMessage: z.string().min(1).optional(),
  errorType: ErrorTypeSchema.optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
  terminal: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  pid: z.number().int().positive().optional(),
  instanceId: z.string().min(1).optional(),
  instanceIndex: z.number().int().min(1).optional(),
  instanceTotal: z.number().int().min(1).optional(),
});

/**
 * 📖 Schema for the full AISnitch event envelope.
 * Intentionally looser than the server schema (no UUIDv7 validation, no URI-reference check)
 * because the client should accept events even if the server relaxes those constraints.
 */
export const AISnitchEventSchema = z.object({
  specversion: z.literal('1.0'),
  id: z.string().min(1),
  source: z.string().min(1),
  type: AISnitchEventTypeSchema,
  time: z.string().min(1),
  'aisnitch.tool': ToolNameSchema,
  'aisnitch.sessionid': z.string().min(1),
  'aisnitch.seqnum': z.number().int().min(1),
  data: EventDataSchema,
});

/** 📖 Schema for the welcome message sent on WS connection. */
export const WelcomeMessageSchema = z.object({
  type: z.literal('welcome'),
  version: z.string().min(1),
  activeTools: z.array(ToolNameSchema),
  uptime: z.number().min(0),
});

// ─── Safe parsers ────────────────────────────────────────────────────────────

/**
 * 📖 Parse a raw unknown value into a validated AISnitchEvent.
 * Returns null on invalid payloads — never throws.
 * Use this to safely handle every WS message without try/catch.
 */
export function parseEvent(raw: unknown): AISnitchEvent | null {
  const result = AISnitchEventSchema.safeParse(raw);
  return result.success ? (result.data as AISnitchEvent) : null;
}

/**
 * 📖 Parse a raw unknown value into a validated WelcomeMessage.
 * Returns null on invalid payloads — never throws.
 */
export function parseWelcome(raw: unknown): WelcomeMessage | null {
  const result = WelcomeMessageSchema.safeParse(raw);
  return result.success ? (result.data as WelcomeMessage) : null;
}
