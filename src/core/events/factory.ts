import { AISnitchEventSchema, createUuidV7 } from './schema.js';
import type { AISnitchEvent, CreateEventInput } from './types.js';

/**
 * @file src/core/events/factory.ts
 * @description Factory helpers for producing validated AISnitch events with generated CloudEvents fields.
 * @functions
 *   → createEvent
 * @exports createEvent
 * @see ./schema.ts
 */

/**
 * Builds a fully valid AISnitch event by attaching CloudEvents metadata and
 * validating the final payload before it leaves the factory.
 */
export function createEvent(input: CreateEventInput): AISnitchEvent {
  const eventCandidate = {
    ...input,
    specversion: '1.0' as const,
    id: createUuidV7(),
    time: new Date().toISOString(),
    data: {
      state: input.data?.state ?? input.type,
      ...input.data,
    },
  };

  /**
   * 📖 Parsing at the factory boundary gives every future adapter the same
   * guardrail: if it emits junk, it fails immediately and loudly.
   */
  return AISnitchEventSchema.parse(eventCandidate);
}
