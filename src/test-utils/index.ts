import { DEFAULT_CONFIG } from '../core/config/defaults.js';
import { EventBus } from '../core/engine/event-bus.js';
import { createEvent } from '../core/events/factory.js';
import type {
  AISnitchEvent,
  AISnitchEventType,
  CreateEventInput,
  ToolName,
} from '../core/events/types.js';
import {
  BaseAdapter,
  type AdapterRuntimeOptions,
} from '../adapters/base.js';

/**
 * @file src/test-utils/index.ts
 * @description Shared test helpers for deterministic event, adapter, and EventBus fixtures used across AISnitch unit and integration coverage.
 * @functions
 *   → createMockEvent
 *   → createMockAdapter
 *   → createTestEventBus
 *   → waitForEvent
 * @exports TestMockAdapter, createMockEvent, createMockAdapter, createTestEventBus, waitForEvent
 * @see ../core/events/factory.ts
 * @see ../core/engine/event-bus.ts
 * @see ../adapters/base.ts
 */

/**
 * Minimal concrete adapter used in tests that need BaseAdapter behavior without
 * a real tool integration behind it.
 */
export class TestMockAdapter extends BaseAdapter {
  public override readonly displayName = 'Test Mock Adapter';

  public override readonly name: ToolName;

  public override readonly strategies = ['hooks'] as const;

  public constructor(
    options: AdapterRuntimeOptions,
    toolName: ToolName = 'claude-code',
  ) {
    super(options);
    this.name = toolName;
  }

  public override start(): Promise<void> {
    this.setRunning(true);
    return Promise.resolve();
  }

  public override stop(): Promise<void> {
    this.setRunning(false);
    return Promise.resolve();
  }

  /**
   * 📖 Tests can use this small escape hatch to exercise the BaseAdapter event
   * lifecycle without depending on a specific real adapter implementation.
   */
  public async emitTestEvent(
    type: AISnitchEventType,
    sessionId = 'mock-session',
  ): Promise<boolean> {
    return await this.emitStateChange(type, {}, { sessionId });
  }
}

/**
 * Builds one valid AISnitch event with sensible defaults plus optional overrides.
 */
export function createMockEvent(
  overrides: Partial<CreateEventInput> = {},
): AISnitchEvent {
  return createEvent({
    source: 'aisnitch://tests/mock',
    type: 'agent.idle',
    'aisnitch.tool': 'claude-code',
    'aisnitch.sessionid': 'mock-session',
    'aisnitch.seqnum': 1,
    data: {},
    ...overrides,
  });
}

/**
 * Creates a concrete mock adapter plus the event sink array it publishes into.
 */
export function createMockAdapter(
  toolName: ToolName = 'claude-code',
): {
  readonly adapter: TestMockAdapter;
  readonly publishedEvents: AISnitchEvent[];
} {
  const publishedEvents: AISnitchEvent[] = [];
  const adapter = new TestMockAdapter(
    {
      config: DEFAULT_CONFIG,
      publishEvent: (event) => {
        publishedEvents.push(event);
        return Promise.resolve(true);
      },
    },
    toolName,
  );

  return {
    adapter,
    publishedEvents,
  };
}

/**
 * Returns a fresh isolated EventBus for tests that need pub/sub behavior.
 */
export function createTestEventBus(): EventBus {
  return new EventBus();
}

/**
 * Resolves with the next event of one normalized type published on the bus.
 */
export function waitForEvent(
  eventBus: EventBus,
  type: AISnitchEventType,
): Promise<AISnitchEvent> {
  return new Promise((resolve) => {
    const unsubscribe = eventBus.subscribeType(type, (event) => {
      unsubscribe();
      resolve(event);
    });
  });
}
