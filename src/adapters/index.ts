/**
 * @file src/adapters/index.ts
 * @description Barrel exports for the built-in AISnitch adapter system and factory.
 * @functions
 *   → createDefaultAdapters
 * @exports all adapter primitives plus createDefaultAdapters
 * @see ./base.ts
 * @see ./registry.ts
 * @see ./aider.ts
 * @see ./claude-code.ts
 * @see ./copilot-cli.ts
 * @see ./gemini-cli.ts
 * @see ./generic-pty.ts
 * @see ./goose.ts
 * @see ./codex.ts
 * @see ./opencode.ts
 */

import type { AdapterRuntimeOptions } from './base.js';
import { AiderAdapter } from './aider.js';
import { ClaudeCodeAdapter } from './claude-code.js';
import { CopilotCLIAdapter } from './copilot-cli.js';
import { CodexAdapter } from './codex.js';
import { GeminiCLIAdapter } from './gemini-cli.js';
import { GooseAdapter } from './goose.js';
import { OpenCodeAdapter } from './opencode.js';

export * from './base.js';
export * from './registry.js';
export * from './aider.js';
export * from './claude-code.js';
export * from './copilot-cli.js';
export * from './codex.js';
export * from './gemini-cli.js';
export * from './generic-pty.js';
export * from './goose.js';
export * from './opencode.js';

/**
 * Instantiates the built-in adapters that ship with AISnitch.
 */
export function createDefaultAdapters(options: AdapterRuntimeOptions) {
  return [
    new AiderAdapter(options),
    new ClaudeCodeAdapter(options),
    new CopilotCLIAdapter(options),
    new GeminiCLIAdapter(options),
    new GooseAdapter(options),
    new CodexAdapter(options),
    new OpenCodeAdapter(options),
  ] as const;
}
