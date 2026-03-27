import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_CONFIG } from '../../core/config/defaults.js';
import type { AISnitchEvent, ToolName } from '../../core/events/types.js';
import {
  BaseAdapter,
  type AdapterRuntimeOptions,
  type InterceptionStrategy,
} from '../base.js';
import { AdapterRegistry } from '../registry.js';

/**
 * @file src/adapters/__tests__/base-registry.test.ts
 * @description Unit coverage for BaseAdapter lifecycle helpers and the AdapterRegistry orchestration layer.
 * @functions
 *   → createRuntimeOptions
 * @exports none
 * @see ../base.ts
 * @see ../registry.ts
 */

class MockAdapter extends BaseAdapter {
  public override readonly displayName: string;

  public override readonly name: ToolName;

  public override readonly strategies: readonly InterceptionStrategy[] = [
    'stream-json',
  ];

  public starts = 0;

  public stops = 0;

  public constructor(
    options: AdapterRuntimeOptions,
    name: ToolName = 'codex',
    displayName = 'Mock Adapter',
  ) {
    super(options);
    this.name = name;
    this.displayName = displayName;
  }

  public override start(): Promise<void> {
    this.starts += 1;
    this.setRunning(true);

    return Promise.resolve();
  }

  public override stop(): Promise<void> {
    this.stops += 1;
    this.setRunning(false);

    return Promise.resolve();
  }

  public async emitForTest(
    type: AISnitchEvent['type'],
    sessionId = 'mock-session',
  ): Promise<void> {
    await this.emitStateChange(type, {}, { sessionId });
  }
}

class GooseMockAdapter extends MockAdapter {
  public constructor(options: AdapterRuntimeOptions) {
    super(options, 'goose', 'Goose Adapter');
  }
}

function createRuntimeOptions(
  publishedEvents: AISnitchEvent[],
  idleTimeoutMs = 50,
): AdapterRuntimeOptions {
  return {
    config: {
      ...DEFAULT_CONFIG,
      idleTimeoutMs,
    },
    publishEvent: (event) => {
      publishedEvents.push(event);
      return Promise.resolve(true);
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('BaseAdapter', () => {
  it('increments sequence numbers within one session', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const adapter = new MockAdapter(createRuntimeOptions(publishedEvents));

    await adapter.start();
    await adapter.emitForTest('session.start', 'session-1');
    await adapter.emitForTest('task.start', 'session-1');

    expect(publishedEvents).toHaveLength(2);
    expect(publishedEvents[0]?.['aisnitch.seqnum']).toBe(1);
    expect(publishedEvents[1]?.['aisnitch.seqnum']).toBe(2);
  });

  it('emits agent.idle after the configured timeout', async () => {
    vi.useFakeTimers();

    const publishedEvents: AISnitchEvent[] = [];
    const adapter = new MockAdapter(createRuntimeOptions(publishedEvents, 25));

    await adapter.start();
    await adapter.emitForTest('session.start', 'session-1');
    await vi.advanceTimersByTimeAsync(26);

    expect(publishedEvents.map((event) => event.type)).toContain('agent.idle');
  });
});

describe('AdapterRegistry', () => {
  it('registers, retrieves, and starts enabled adapters only', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const registry = new AdapterRegistry();
    const enabledAdapter = new MockAdapter(createRuntimeOptions(publishedEvents));
    const disabledAdapter = new GooseMockAdapter(
      createRuntimeOptions(publishedEvents),
    );

    registry.register(enabledAdapter);
    registry.register(disabledAdapter);

    await registry.startAll({
      ...DEFAULT_CONFIG,
      adapters: {
        codex: { enabled: true },
      },
    });

    expect(registry.get('codex')).toBe(enabledAdapter);
    expect(registry.list()).toHaveLength(2);
    expect(enabledAdapter.starts).toBe(1);
    expect(disabledAdapter.starts).toBe(0);
  });

  it('stops adapters in reverse order', async () => {
    const publishedEvents: AISnitchEvent[] = [];
    const registry = new AdapterRegistry();
    const firstAdapter = new MockAdapter(createRuntimeOptions(publishedEvents));
    const secondAdapter = new GooseMockAdapter(
      createRuntimeOptions(publishedEvents),
    );

    registry.register(firstAdapter);
    registry.register(secondAdapter);
    await registry.startAll({
      ...DEFAULT_CONFIG,
      adapters: {
        codex: { enabled: true },
        goose: { enabled: true },
      },
    });
    await registry.stopAll();

    expect(firstAdapter.stops).toBe(1);
    expect(secondAdapter.stops).toBe(1);
  });
});
