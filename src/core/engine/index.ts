/**
 * @file src/core/engine/index.ts
 * @description Placeholder for the in-memory event bus and pipeline engine module.
 * @functions
 *   → none
 * @exports ENGINE_MODULE_PLACEHOLDER, EngineModulePlaceholder
 * @see ../../tasks/02-core-pipeline/01_core-pipeline_event-bus.md
 */

/**
 * Describes the current state of the core engine module before implementation.
 */
export interface EngineModulePlaceholder {
  readonly area: 'engine';
  readonly status: 'pending';
  readonly nextTask: 'core-pipeline-event-bus';
}

/**
 * 📖 This placeholder gives the root export a stable shape while the engine
 * task has not been implemented yet.
 */
export const ENGINE_MODULE_PLACEHOLDER: EngineModulePlaceholder = {
  area: 'engine',
  status: 'pending',
  nextTask: 'core-pipeline-event-bus',
};
