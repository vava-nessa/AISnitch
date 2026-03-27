/**
 * @file src/core/index.ts
 * @description Barrel export for the core modules that will power schemas, engine logic, and config.
 * @functions
 *   → none
 * @exports all core config, engine, and events modules
 * @see ./events/index.ts
 * @see ./engine/index.ts
 * @see ./config/index.ts
 * @see ./session-identity.ts
 */

export * from './config/index.js';
export * from './engine/index.js';
export * from './events/index.js';
export * from './session-identity.js';
