/**
 * @file src/adapters/index.ts
 * @description Placeholder entrypoint for future tool adapters.
 * @functions
 *   → none
 * @exports ADAPTERS_MODULE_PLACEHOLDER, AdaptersModulePlaceholder
 * @see ../../tasks/04-adapters-priority/task-adapters-priority.md
 */

/**
 * Describes the adapter module state before concrete tool integrations are added.
 */
export interface AdaptersModulePlaceholder {
  readonly area: 'adapters';
  readonly status: 'pending';
  readonly nextTask: 'adapters-priority-base';
}

/**
 * 📖 Keeping this module exported now lets the package shape settle early,
 * which avoids pointless import churn once real adapters arrive.
 */
export const ADAPTERS_MODULE_PLACEHOLDER: AdaptersModulePlaceholder = {
  area: 'adapters',
  status: 'pending',
  nextTask: 'adapters-priority-base',
};
