/**
 * @file src/core/engine/index.ts
 * @description Barrel export for the AISnitch in-memory pipeline engine.
 * @functions
 *   → none
 * @exports all engine modules, runtime helpers, and pipeline orchestration types
 * @see ./logger.ts
 * @see ./event-bus.ts
 * @see ./ring-buffer.ts
 * @see ./ws-server.ts
 * @see ./http-receiver.ts
 * @see ./uds-server.ts
 * @see ./context-detector.ts
 * @see ./pipeline.ts
 */

export * from './logger.js';
export * from './event-bus.js';
export * from './ring-buffer.js';
export * from './ws-server.js';
export * from './http-receiver.js';
export * from './uds-server.js';
export * from './context-detector.js';
export * from './pipeline.js';
