import { validate as isUuid, v7 as uuidv7, version as uuidVersion } from 'uuid';
import { z } from 'zod';

/**
 * @file src/core/events/schema.ts
 * @description Runtime Zod schemas and constants for the AISnitch CloudEvents-based event contract.
 * @functions
 *   → createUuidV7
 * @exports AISNITCH_EVENT_TYPES, TOOL_NAMES, ERROR_TYPES, CESP_CATEGORIES, ToolInputSchema, EventDataSchema, AISnitchEventTypeSchema, ToolNameSchema, ErrorTypeSchema, CESPCategorySchema, AISnitchEventSchema, createUuidV7
 * @see ./types.ts
 * @see ./cesp.ts
 * @see ./factory.ts
 */

/**
 * 📖 AISnitch keeps the event-type list as a constant tuple so every schema,
 * inferred type, and mapping table stays aligned from one source of truth.
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
 * Supported AI tool identifiers recognized by AISnitch.
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
 * Normalized error categories attached to `agent.error` events.
 */
export const ERROR_TYPES = [
  'rate_limit',
  'context_overflow',
  'tool_failure',
  'api_error',
] as const;

/**
 * CESP-compatible categories used by the current mapping layer.
 */
export const CESP_CATEGORIES = [
  'session.start',
  'session.end',
  'task.acknowledge',
  'task.complete',
  'input.required',
  'task.error',
  'resource.limit',
] as const;

const ISO_TIMESTAMP_SCHEMA = z.string().datetime({ offset: true });

function isUuidV7(value: string): boolean {
  return isUuid(value) && uuidVersion(value) === 7;
}

function isValidUriReference(value: string): boolean {
  if (value.trim().length === 0 || /\s/u.test(value)) {
    return false;
  }

  try {
    new URL(value);
    return true;
  } catch {
    try {
      new URL(value, 'https://aisnitch.local');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Generates a UUIDv7 value that matches the event schema contract.
 */
export function createUuidV7(): string {
  return uuidv7();
}

/**
 * Tool input metadata attached when an agent runs a concrete tool.
 */
export const ToolInputSchema = z
  .strictObject({
    filePath: z.string().min(1).optional(),
    command: z.string().min(1).optional(),
  })
  .refine(
    (value) => value.filePath !== undefined || value.command !== undefined,
    'toolInput must include filePath or command',
  );

/**
 * Runtime schema for the supported tool names.
 */
export const ToolNameSchema = z.enum(TOOL_NAMES);

/**
 * Runtime schema for AISnitch event types.
 */
export const AISnitchEventTypeSchema = z.enum(AISNITCH_EVENT_TYPES);

/**
 * Runtime schema for normalized AISnitch error categories.
 */
export const ErrorTypeSchema = z.enum(ERROR_TYPES);

/**
 * Runtime schema for CESP categories.
 */
export const CESPCategorySchema = z.enum(CESP_CATEGORIES);

/**
 * 📖 `raw` remains intentionally permissive because adapters need a safe place
 * to stash source-native payload fragments without forcing them into the
 * normalized contract too early.
 */
export const EventDataSchema = z.strictObject({
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
 * Runtime schema for the full normalized AISnitch event envelope.
 */
export const AISnitchEventSchema = z.strictObject({
  specversion: z.literal('1.0'),
  id: z.string().refine(isUuidV7, 'id must be a valid UUIDv7 string'),
  source: z
    .string()
    .refine(
      isValidUriReference,
      'source must be a valid non-empty CloudEvents URI-reference',
    ),
  type: AISnitchEventTypeSchema,
  time: ISO_TIMESTAMP_SCHEMA,
  'aisnitch.tool': ToolNameSchema,
  'aisnitch.sessionid': z.string().min(1),
  'aisnitch.seqnum': z.number().int().min(1),
  data: EventDataSchema,
});
