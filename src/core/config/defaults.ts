import type { AISnitchConfig } from './schema.js';

/**
 * @file src/core/config/defaults.ts
 * @description Central default values for the AISnitch runtime configuration.
 * @functions
 *   → none
 * @exports DEFAULT_CONFIG
 * @see ./schema.ts
 */

/**
 * 📖 Keeping defaults in plain data makes them reusable for docs, tests,
 * config bootstrapping, and eventual `aisnitch config` CLI commands.
 */
export const DEFAULT_CONFIG: AISnitchConfig = {
  wsPort: 4820,
  httpPort: 4821,
  adapters: {},
  idleTimeoutMs: 120_000,
  logLevel: 'info',
};
