import type { infer as ZodInfer } from 'zod';
import { z } from 'zod';

import { ToolNameSchema } from '../events/schema.js';

/**
 * @file src/core/config/schema.ts
 * @description Zod schemas and inferred types for the persistent AISnitch configuration file.
 * @functions
 *   → none
 * @exports LOG_LEVELS, AdapterConfigSchema, ConfigSchema, AISnitchConfig, AdapterConfig
 * @see ./loader.ts
 */

/**
 * Supported log levels for the daemon runtime.
 */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

/**
 * Per-adapter toggle stored inside the config file.
 */
export const AdapterConfigSchema = z.strictObject({
  enabled: z.boolean().default(true),
});

/**
 * Runtime schema for the full persisted configuration contract.
 */
export const ConfigSchema = z.strictObject({
  wsPort: z.number().int().min(1024).max(65535).default(4820),
  httpPort: z.number().int().min(1024).max(65535).default(4821),
  /**
   * 📖 This is intentionally a partial record because most users will only
   * override a couple of adapters instead of all supported tools at once.
   */
  adapters: z.partialRecord(ToolNameSchema, AdapterConfigSchema).default({}),
  idleTimeoutMs: z.number().int().min(10_000).default(120_000),
  logLevel: z.enum(LOG_LEVELS).default('info'),
});

/**
 * Inferred TypeScript view of a single adapter config entry.
 */
export type AdapterConfig = ZodInfer<typeof AdapterConfigSchema>;

/**
 * Inferred TypeScript view of the persisted AISnitch config.
 */
export type AISnitchConfig = ZodInfer<typeof ConfigSchema>;
