import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';

import { createEvent } from '../../events/index.js';
import { EventBus } from '../event-bus.js';
import { setLoggerLevel } from '../logger.js';

/**
 * @file src/core/engine/__tests__/event-bus.test.ts
 * @description Unit coverage for EventBus publish/subscribe behaviour and validation guards.
 * @functions
 *   → createTestEvent
 * @exports none
 * @see ../event-bus.ts
 */

function createTestEvent() {
  return createEvent({
    source: 'aisnitch://tests/event-bus',
    type: 'task.start',
    'aisnitch.tool': 'codex',
    'aisnitch.sessionid': 'event-bus-session',
    'aisnitch.seqnum': 1,
    data: {
      project: 'AutoSnitch',
    },
  });
}

beforeAll(() => {
  setLoggerLevel('silent');
});

afterAll(() => {
  setLoggerLevel('info');
});

describe('EventBus', () => {
  it('publishes an event to catch-all subscribers', () => {
    const eventBus = new EventBus();
    const receivedEvents: unknown[] = [];
    const testEvent = createTestEvent();

    eventBus.subscribe((event) => {
      receivedEvents.push(event);
    });

    const published = eventBus.publish(testEvent);

    expect(published).toBe(true);
    expect(receivedEvents).toEqual([testEvent]);
  });

  it('filters events with subscribeType', () => {
    const eventBus = new EventBus();
    const matchingHandler = vi.fn();
    const nonMatchingHandler = vi.fn();

    eventBus.subscribeType('task.complete', matchingHandler);
    eventBus.subscribeType('agent.error', nonMatchingHandler);

    eventBus.publish(
      createEvent({
        source: 'aisnitch://tests/event-bus',
        type: 'task.complete',
        'aisnitch.tool': 'codex',
        'aisnitch.sessionid': 'event-bus-session',
        'aisnitch.seqnum': 2,
      }),
    );

    expect(matchingHandler).toHaveBeenCalledTimes(1);
    expect(nonMatchingHandler).not.toHaveBeenCalled();
  });

  it('unsubscribes a catch-all handler', () => {
    const eventBus = new EventBus();
    const handler = vi.fn();

    eventBus.subscribe(handler);
    eventBus.unsubscribe(handler);
    eventBus.publish(createTestEvent());

    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects invalid events without crashing listeners', () => {
    const eventBus = new EventBus();
    const handler = vi.fn();

    eventBus.subscribe(handler);

    const published = eventBus.publish({
      nope: true,
    });

    expect(published).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(eventBus.getStats().rejectedEvents).toBe(1);
  });

  it('tracks published event and subscriber counters', () => {
    const eventBus = new EventBus();
    const unsubscribe = eventBus.subscribe(() => undefined);

    eventBus.subscribeType('task.start', () => undefined);
    eventBus.publish(createTestEvent());

    const statsBeforeCleanup = eventBus.getStats();
    unsubscribe();

    expect(statsBeforeCleanup.publishedEvents).toBe(1);
    expect(statsBeforeCleanup.subscriberCount).toBe(2);
  });
});
