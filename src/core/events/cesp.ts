import type { AISnitchEvent, AISnitchEventType, CESPCategory } from './types.js';

/**
 * @file src/core/events/cesp.ts
 * @description CESP compatibility helpers for mapping normalized AISnitch events into legacy categories.
 * @functions
 *   → getCESPCategory
 * @exports CESP_MAP, getCESPCategory
 * @see ./types.ts
 */

/**
 * 📖 Some normalized states have no direct CESP equivalent. Returning `null`
 * makes that gap explicit instead of inventing fake sound-pack categories.
 */
export const CESP_MAP: Record<AISnitchEventType, CESPCategory | null> = {
  'session.start': 'session.start',
  'session.end': 'session.end',
  'task.start': 'task.acknowledge',
  'task.complete': 'task.complete',
  'agent.thinking': null,
  'agent.coding': null,
  'agent.tool_call': null,
  'agent.streaming': null,
  'agent.asking_user': 'input.required',
  'agent.idle': null,
  'agent.error': 'task.error',
  'agent.compact': 'resource.limit',
};

/**
 * Resolves the CESP category for either a full event object or an event type.
 */
export function getCESPCategory(
  eventOrType: AISnitchEvent | AISnitchEventType,
): CESPCategory | null {
  const eventType =
    typeof eventOrType === 'string' ? eventOrType : eventOrType.type;

  return CESP_MAP[eventType];
}
