/**
 * @file src/adapters/index.ts
 * @description Barrel exports for the built-in AISnitch adapter system and factory.
 * @functions
 *   → createDefaultAdapters
 * @exports all adapter primitives plus createDefaultAdapters
 * @see ./base.ts
 * @see ./registry.ts
 * @see ./claude-code.ts
 * @see ./opencode.ts
 */

import type { AdapterRuntimeOptions } from './base.js';
import { ClaudeCodeAdapter } from './claude-code.js';
import { OpenCodeAdapter } from './opencode.js';

export * from './base.js';
export * from './registry.js';
export * from './claude-code.js';
export * from './opencode.js';

/**
 * Instantiates the built-in adapters that ship with AISnitch.
 */
export function createDefaultAdapters(options: AdapterRuntimeOptions) {
  return [
    new ClaudeCodeAdapter(options),
    new OpenCodeAdapter(options),
  ] as const;
}
