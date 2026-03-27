import { EventEmitter } from 'eventemitter3';

import { AISnitchEventSchema } from '../events/schema.js';
import type { AISnitchEvent, AISnitchEventType } from '../events/types.js';
import { logger } from './logger.js';

/**
 * @file src/core/engine/event-bus.ts
 * @description Typed in-memory pub/sub bus used by the AISnitch runtime pipeline.
 * @functions
 *   → none
 * @exports EventHandler, EventBusStats, EventBus
 * @see ./logger.ts
 * @see ../events/schema.ts
 */

/**
 * Listener signature used by the EventBus.
 */
export type EventHandler = (event: AISnitchEvent) => void;

type EventBusChannels = {
  event: (event: AISnitchEvent) => void;
} & {
  [K in AISnitchEventType as `event:${K}`]: (event: AISnitchEvent) => void;
};

/**
 * Metrics exposed by the in-memory event bus.
 */
export interface EventBusStats {
  readonly publishedEvents: number;
  readonly rejectedEvents: number;
  readonly subscriberCount: number;
}

/**
 * 📖 The EventBus is the single fan-out point inside the process. Adapters,
 * hook receivers, and IPC ingress all publish here before anything reaches WS.
 */
export class EventBus {
  private readonly emitter: EventEmitter<EventBusChannels> =
    new EventEmitter<EventBusChannels>();

  private readonly globalHandlers = new Set<EventHandler>();

  private readonly typedHandlers = new Map<AISnitchEventType, Set<EventHandler>>();

  private publishedEvents = 0;

  private rejectedEvents = 0;

  /**
   * Validates and publishes an event to all generic and type-specific listeners.
   */
  publish(event: unknown): event is AISnitchEvent {
    const parsedEvent = AISnitchEventSchema.safeParse(event);

    if (!parsedEvent.success) {
      this.rejectedEvents += 1;
      logger.warn(
        {
          issues: parsedEvent.error.issues,
        },
        'Rejected invalid event',
      );
      return false;
    }

    this.publishedEvents += 1;

    logger.debug(
      {
        eventId: parsedEvent.data.id,
        eventType: parsedEvent.data.type,
        tool: parsedEvent.data['aisnitch.tool'],
      },
      'Published event',
    );

    this.emitter.emit('event', parsedEvent.data);
    this.emitter.emit(`event:${parsedEvent.data.type}`, parsedEvent.data);

    return true;
  }

  /**
   * Subscribes to all valid events emitted on the bus.
   */
  subscribe(handler: EventHandler): () => void {
    this.globalHandlers.add(handler);
    this.emitter.on('event', handler);

    return () => {
      this.unsubscribe(handler);
    };
  }

  /**
   * Subscribes to only one normalized event type.
   */
  subscribeType(type: AISnitchEventType, handler: EventHandler): () => void {
    const channel = `event:${type}` as const;
    const handlersForType = this.typedHandlers.get(type) ?? new Set<EventHandler>();

    handlersForType.add(handler);
    this.typedHandlers.set(type, handlersForType);
    this.emitter.on(channel, handler);

    return () => {
      this.unsubscribeType(type, handler);
    };
  }

  /**
   * Removes a previously subscribed catch-all handler.
   */
  unsubscribe(handler: EventHandler): void {
    this.globalHandlers.delete(handler);
    this.emitter.off('event', handler);
  }

  /**
   * Removes all listeners and clears internal handler tracking.
   */
  unsubscribeAll(): void {
    this.globalHandlers.clear();
    this.typedHandlers.clear();
    this.emitter.removeAllListeners();
  }

  /**
   * Returns current in-memory bus statistics.
   */
  getStats(): EventBusStats {
    const typedSubscriberCount = [...this.typedHandlers.values()].reduce(
      (count, handlers) => count + handlers.size,
      0,
    );

    return {
      publishedEvents: this.publishedEvents,
      rejectedEvents: this.rejectedEvents,
      subscriberCount: this.globalHandlers.size + typedSubscriberCount,
    };
  }

  private unsubscribeType(type: AISnitchEventType, handler: EventHandler): void {
    const channel = `event:${type}` as const;
    const handlersForType = this.typedHandlers.get(type);

    if (!handlersForType) {
      return;
    }

    handlersForType.delete(handler);

    if (handlersForType.size === 0) {
      this.typedHandlers.delete(type);
    }

    this.emitter.off(channel, handler);
  }
}
