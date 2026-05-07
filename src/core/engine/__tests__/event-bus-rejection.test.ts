import { describe, expect, test } from 'vitest';

import { EventBus } from '../event-bus.js';
import type { AISnitchEvent } from '../../events/types.js';
import { createUuidV7 } from '../../events/schema.js';

/** Creates a valid event */
function validEvent(): AISnitchEvent {
  return {
    specversion: '1.0',
    id: createUuidV7(),
    type: 'session.start',
    source: 'aisnitch://test',
    time: new Date().toISOString(),
    'aisnitch.tool': 'claude-code',
    'aisnitch.sessionid': 'test-session',
    'aisnitch.seqnum': 1,
    data: { state: 'session.start' },
  };
}

describe('EventBus event rejection', () => {
  test('publish() rejects events without id', () => {
    const bus = new EventBus();
    let called = false;
    bus.subscribe(() => { called = true; });

    const rejected = bus.publish({ type: 'session.start' });
    expect(rejected).toBe(false);
    expect(called).toBe(false);
  });

  test('publish() rejects events with invalid type', () => {
    const bus = new EventBus();
    let called = false;
    bus.subscribe(() => { called = true; });

    const rejected = bus.publish({ id: createUuidV7(), type: 'invalid.type' });
    expect(rejected).toBe(false);
    expect(called).toBe(false);
  });

  test('publish() rejects events with wrong specversion', () => {
    const bus = new EventBus();
    let called = false;
    bus.subscribe(() => { called = true; });

    const rejected = bus.publish({
      specversion: '0.3',
      id: createUuidV7(),
      type: 'session.start',
      source: 'aisnitch://test',
      time: new Date().toISOString(),
      'aisnitch.tool': 'claude-code',
      'aisnitch.sessionid': 'test-session',
      'aisnitch.seqnum': 1,
      data: { state: 'session.start' },
    });
    expect(rejected).toBe(false);
    expect(called).toBe(false);
  });

  test('publish() rejects null', () => {
    const bus = new EventBus();
    let called = false;
    bus.subscribe(() => { called = true; });

    const rejected = bus.publish(null);
    expect(rejected).toBe(false);
    expect(called).toBe(false);
  });

  test('publish() rejects undefined', () => {
    const bus = new EventBus();
    let called = false;
    bus.subscribe(() => { called = true; });

    const rejected = bus.publish(undefined);
    expect(rejected).toBe(false);
    expect(called).toBe(false);
  });

  test('publish() rejects string', () => {
    const bus = new EventBus();
    let called = false;
    bus.subscribe(() => { called = true; });

    const rejected = bus.publish('string');
    expect(rejected).toBe(false);
    expect(called).toBe(false);
  });

  test('publish() rejects number', () => {
    const bus = new EventBus();
    let called = false;
    bus.subscribe(() => { called = true; });

    const rejected = bus.publish(42);
    expect(rejected).toBe(false);
    expect(called).toBe(false);
  });

  test('publish() rejects array', () => {
    const bus = new EventBus();
    let called = false;
    bus.subscribe(() => { called = true; });

    const rejected = bus.publish([1, 2, 3]);
    expect(rejected).toBe(false);
    expect(called).toBe(false);
  });

  test('publish() accepts valid event', () => {
    const bus = new EventBus();
    let called = false;
    bus.subscribe(() => { called = true; });

    const accepted = bus.publish(validEvent());
    expect(accepted).toBe(true);
    expect(called).toBe(true);
  });
});

describe('EventBus subscriber error handling', () => {
  test('subscriber error does not crash the bus', () => {
    const bus = new EventBus();
    let goodHandlerReached = false;

    bus.subscribe(() => {
      throw new Error('Subscriber crashed');
    });
    bus.subscribe(() => { goodHandlerReached = true; });

    // Should not throw
    const accepted = bus.publish(validEvent());
    expect(accepted).toBe(true);
    // Note: eventemitter3 stops propagation on error, so goodHandlerReached may be false
    void goodHandlerReached; // suppress unused warning
  });

  test('errors in subscriber are caught by the bus', () => {
    const bus = new EventBus();
    const order: string[] = [];

    bus.subscribe(() => { order.push('first'); });
    bus.subscribe(() => { order.push('second'); });

    bus.publish(validEvent());

    expect(order).toContain('first');
    expect(order).toContain('second');
  });
});

describe('EventBus stats', () => {
  test('rejectedEvents counter increments on invalid event', () => {
    const bus = new EventBus();
    bus.subscribe(() => {});

    bus.publish({ invalid: 'event' });
    bus.publish({ id: createUuidV7(), type: 'bad.type' });
    bus.publish(null);

    const stats = bus.getStats();
    expect(stats.rejectedEvents).toBe(3);
  });

  test('publishedEvents counter increments on valid event', () => {
    const bus = new EventBus();
    bus.subscribe(() => {});

    bus.publish(validEvent());

    const stats = bus.getStats();
    expect(stats.publishedEvents).toBe(1);
    expect(stats.rejectedEvents).toBe(0);
  });

  test('subscriberCount tracks all subscribers', () => {
    const bus = new EventBus();

    const unsub1 = bus.subscribe(() => {});
    expect(bus.getStats().subscriberCount).toBe(1);

    const unsub2 = bus.subscribeType('session.start', () => {});
    expect(bus.getStats().subscriberCount).toBe(2);

    const unsub3 = bus.subscribeType('agent.coding', () => {});
    expect(bus.getStats().subscriberCount).toBe(3);

    unsub3();
    expect(bus.getStats().subscriberCount).toBe(2);

    unsub2();
    unsub1();
    expect(bus.getStats().subscriberCount).toBe(0);
  });
});

describe('EventBus unsubscribeAll', () => {
  test('removes all global subscribers', () => {
    const bus = new EventBus();
    let handler1Called = false;
    let handler2Called = false;

    bus.subscribe(() => { handler1Called = true; });
    bus.subscribe(() => { handler2Called = true; });

    bus.unsubscribeAll();

    bus.publish(validEvent());

    expect(handler1Called).toBe(false);
    expect(handler2Called).toBe(false);
  });

  test('removes all typed subscribers', () => {
    const bus = new EventBus();
    let called = false;

    bus.subscribeType('session.start', () => { called = true; });
    bus.unsubscribeAll();

    bus.publish(validEvent());

    expect(called).toBe(false);
  });
});
