import type { infer as ZodInfer } from 'zod';

import type {
  AISnitchEventSchema,
  AISnitchEventTypeSchema,
  CESPCategorySchema,
  ErrorTypeSchema,
  EventDataSchema,
  ToolInputSchema,
  ToolNameSchema,
} from './schema.js';

/**
 * @file src/core/events/types.ts
 * @description Inferred TypeScript types derived from the AISnitch event Zod schemas.
 * @functions
 *   → none
 * @exports ToolInput, EventData, AISnitchEvent, AISnitchEventType, ToolName, ErrorType, CESPCategory, CreateEventInput
 * @see ./schema.ts
 * @see ./factory.ts
 */

/**
 * TypeScript view of tool-call input metadata.
 */
export type ToolInput = ZodInfer<typeof ToolInputSchema>;

/**
 * TypeScript view of the normalized AISnitch event payload.
 */
export type EventData = ZodInfer<typeof EventDataSchema>;

/**
 * TypeScript view of the normalized AISnitch event envelope.
 */
export type AISnitchEvent = ZodInfer<typeof AISnitchEventSchema>;

/**
 * Union of the 12 normalized AISnitch event type strings.
 */
export type AISnitchEventType = ZodInfer<typeof AISnitchEventTypeSchema>;

/**
 * Union of supported AI tool identifiers.
 */
export type ToolName = ZodInfer<typeof ToolNameSchema>;

/**
 * Union of normalized error categories for `agent.error`.
 */
export type ErrorType = ZodInfer<typeof ErrorTypeSchema>;

/**
 * Union of CESP-compatible category strings returned by the mapping layer.
 */
export type CESPCategory = ZodInfer<typeof CESPCategorySchema>;

/**
 * Input accepted by the event factory before generated CloudEvents fields are attached.
 */
export type CreateEventInput = Omit<
  AISnitchEvent,
  'id' | 'specversion' | 'time' | 'data'
> & {
  readonly data?: Omit<EventData, 'state'> & {
    readonly state?: AISnitchEventType;
  };
};
