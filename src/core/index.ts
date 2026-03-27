/**
 * @file src/core/index.ts
 * @description Barrel export for the core modules that will power schemas, engine logic, and config.
 * @functions
 *   → none
 * @exports EVENTS_MODULE_PLACEHOLDER, ENGINE_MODULE_PLACEHOLDER, CONFIG_MODULE_PLACEHOLDER
 * @see ./events/index.ts
 * @see ./engine/index.ts
 * @see ./config/index.ts
 */

export * from './config/index.js';
export * from './engine/index.js';
export * from './events/index.js';
