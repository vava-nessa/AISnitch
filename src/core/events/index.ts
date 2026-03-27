/**
 * @file src/core/events/index.ts
 * @description Placeholder for the future CloudEvents and AISnitch event schema module.
 * @functions
 *   → none
 * @exports EVENTS_MODULE_PLACEHOLDER, EventsModulePlaceholder
 * @see ../../tasks/01-project-setup/02_project-setup_schemas-types.md
 */

/**
 * Describes the current state of the events module before real schemas land.
 */
export interface EventsModulePlaceholder {
  readonly area: 'events';
  readonly status: 'pending';
  readonly nextTask: 'project-setup-schemas-types';
}

/**
 * 📖 A typed placeholder is better than an empty file because it keeps the
 * public package graph valid while clearly pointing to the next task.
 */
export const EVENTS_MODULE_PLACEHOLDER: EventsModulePlaceholder = {
  area: 'events',
  status: 'pending',
  nextTask: 'project-setup-schemas-types',
};
