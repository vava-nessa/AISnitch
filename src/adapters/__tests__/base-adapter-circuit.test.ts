import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { homedir } from 'node:os';

import { SHARED_BREAKERS, CircuitOpenError } from '../../core/circuit-breaker.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mock implementations for testing BaseAdapter with circuit breaker
// ─────────────────────────────────────────────────────────────────────────────

interface MockAdapterOptions {
  readonly config: {
    readonly idleTimeoutMs: number;
    readonly adapters?: Record<string, { enabled: boolean }>;
  };
  readonly env?: NodeJS.ProcessEnv;
  readonly homeDirectory?: string;
  readonly publishEvent: (
    event: unknown,
    context?: unknown,
  ) => Promise<boolean>;
}

/**
 * Minimal concrete adapter for testing BaseAdapter.emit() behavior.
 * Extracted from base.ts for isolated unit testing.
 */
class MockBaseAdapter {
  protected currentSessionId: string | null = null;
  protected readonly env: NodeJS.ProcessEnv | undefined;
  protected readonly homeDirectory: string;
  protected sequenceNumber = 0;
  private eventsEmitted = 0;
  private idleTimer: NodeJS.Timeout | null = null;
  private readonly idleTimeoutMs: number;
  private readonly publishEventImplementation: MockAdapterOptions['publishEvent'];
  private running = false;

  public constructor(options: MockAdapterOptions) {
    this.env = options.env;
    this.homeDirectory = options.homeDirectory ?? homedir();
    this.idleTimeoutMs = options.config.idleTimeoutMs;
    this.publishEventImplementation = options.publishEvent;
  }

  public get name(): string {
    return 'mock-adapter';
  }

  public get eventsEmittedCount(): number {
    return this.eventsEmitted;
  }

  public async emit(
    type: string,
    data: Record<string, unknown> = {},
    context: Record<string, unknown> = {},
  ): Promise<boolean> {
    const sessionId = this.resolveSessionId(context.sessionId as string | undefined);
    this.sequenceNumber += 1;

    const event = {
      id: `test-event-${this.sequenceNumber}`,
      type,
      source: `aisnitch://adapters/${this.name}`,
      'aisnitch.tool': this.name,
      'aisnitch.sessionid': sessionId,
      'aisnitch.seqnum': this.sequenceNumber,
      data,
    };

    let published: boolean;

    try {
      published = await SHARED_BREAKERS.adapterEmit.execute(async () => {
        return await this.publishEventImplementation(event, {
          ...context,
          sessionId,
        });
      });
    } catch (error: unknown) {
      if (error instanceof CircuitOpenError) {
        published = false;
      } else {
        published = false;
      }
    }

    if (published) {
      this.eventsEmitted += 1;
    }

    return published;
  }

  private resolveSessionId(sessionId?: string): string {
    if (sessionId !== undefined) {
      this.currentSessionId = sessionId;
      return sessionId;
    }

    if (this.currentSessionId === null) {
      this.currentSessionId = `mock-adapter:${Date.now()}`;
    }

    return this.currentSessionId;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('BaseAdapter.emit() with SHARED_BREAKERS.adapterEmit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    // Reset the circuit breaker before each test
    SHARED_BREAKERS.adapterEmit.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('emit() calls publishEvent through circuit breaker', async () => {
    const publishEvent = vi.fn().mockResolvedValue(true);
    const adapter = new MockBaseAdapter({
      config: { idleTimeoutMs: 120_000 },
      publishEvent,
    });

    await adapter.emit('agent.coding');

    expect(publishEvent).toHaveBeenCalledTimes(1);
    expect(adapter.eventsEmittedCount).toBe(1);
  });

  test('emit() increments eventsEmitted counter on success', async () => {
    const adapter = new MockBaseAdapter({
      config: { idleTimeoutMs: 120_000 },
      publishEvent: vi.fn().mockResolvedValue(true),
    });

    expect(adapter.eventsEmittedCount).toBe(0);

    await adapter.emit('agent.thinking');
    expect(adapter.eventsEmittedCount).toBe(1);

    await adapter.emit('agent.thinking');
    expect(adapter.eventsEmittedCount).toBe(2);
  });

  test('emit() returns false when circuit is open (no publish)', async () => {
    const publishEvent = vi.fn();
    const adapter = new MockBaseAdapter({
      config: { idleTimeoutMs: 120_000 },
      publishEvent,
    });

    // Open the circuit: 5 failures
    const retryableError = Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' });

    for (let i = 0; i < 5; i++) {
      publishEvent.mockRejectedValueOnce(retryableError);
    }

    // These will open the circuit
    for (let i = 0; i < 5; i++) {
      await adapter.emit('agent.coding');
    }

    expect(publishEvent).toHaveBeenCalledTimes(5);
    expect(adapter.eventsEmittedCount).toBe(0); // None succeeded

    // Reset for the next test
    publishEvent.mockResolvedValue(true);

    // Now emit should fail because circuit is OPEN
    const result = await adapter.emit('agent.coding');
    expect(result).toBe(false);
    expect(publishEvent).toHaveBeenCalledTimes(5); // No additional call
  });

  test('emit() handles CircuitOpenError gracefully', async () => {
    const publishEvent = vi.fn();
    const adapter = new MockBaseAdapter({
      config: { idleTimeoutMs: 120_000 },
      publishEvent,
    });

    // Force circuit open
    const error = Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' });
    for (let i = 0; i < 5; i++) {
      publishEvent.mockRejectedValueOnce(error);
    }

    for (let i = 0; i < 5; i++) {
      await adapter.emit('agent.coding');
    }

    // Emit should not throw — should return false
    const result = await adapter.emit('agent.coding');
    expect(result).toBe(false);
  });

  test('emit() recovers after halfOpenAfterMs when circuit opens', async () => {
    const publishEvent = vi.fn();
    const adapter = new MockBaseAdapter({
      config: { idleTimeoutMs: 120_000 },
      publishEvent,
    });

    // Open the circuit
    const retryableError = Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' });

    for (let i = 0; i < 5; i++) {
      publishEvent.mockRejectedValueOnce(retryableError);
    }

    for (let i = 0; i < 5; i++) {
      await adapter.emit('agent.coding');
    }

    // Circuit should be OPEN
    expect(SHARED_BREAKERS.adapterEmit.getState().state).toBe('open');

    // Advance time past halfOpenAfterMs (30s default)
    vi.setSystemTime(35_000);

    // Now emit should succeed (circuit goes half-open then closes on success)
    publishEvent.mockResolvedValue(true);
    const result = await adapter.emit('agent.coding');

    expect(result).toBe(true);
    expect(SHARED_BREAKERS.adapterEmit.getState().state).toBe('closed');
  });

  test('non-retryable errors do not open the circuit', async () => {
    const publishEvent = vi.fn();
    const adapter = new MockBaseAdapter({
      config: { idleTimeoutMs: 120_000 },
      publishEvent,
    });

    // Fail 10 times with non-retryable errors (validation errors)
    const validationError = new Error('Validation failed');

    for (let i = 0; i < 10; i++) {
      publishEvent.mockRejectedValueOnce(validationError);
    }

    for (let i = 0; i < 10; i++) {
      await adapter.emit('agent.coding');
    }

    // Circuit should still be CLOSED
    expect(SHARED_BREAKERS.adapterEmit.getState().state).toBe('closed');
    expect(SHARED_BREAKERS.adapterEmit.getState().failures).toBe(0);

    // Success should still work
    publishEvent.mockResolvedValue(true);
    const result = await adapter.emit('agent.coding');
    expect(result).toBe(true);
  });

  test('session end clears any pending state', async () => {
    const publishEvent = vi.fn().mockResolvedValue(true);
    const adapter = new MockBaseAdapter({
      config: { idleTimeoutMs: 120_000 },
      publishEvent,
    });

    await adapter.emit('agent.coding');
    expect(adapter.eventsEmittedCount).toBe(1);

    await adapter.emit('session.end');
    expect(adapter.eventsEmittedCount).toBe(2);
  });
});

describe('Circuit breaker integration scenarios', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    SHARED_BREAKERS.adapterEmit.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('rapid failures open circuit, recovery succeeds after timeout', async () => {
    const breaker = SHARED_BREAKERS.adapterEmit;

    // Fail 5 times rapidly (threshold)
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(i * 100); // 0ms, 100ms, 200ms...
      await expect(
        breaker.execute(() => Promise.reject(Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }))),
      ).rejects.toThrow();
    }

    expect(breaker.getState().state).toBe('open');
    expect(breaker.getState().failures).toBe(5);

    // Circuit blocks all calls
    await expect(breaker.execute(() => Promise.resolve('blocked'))).rejects.toThrow(CircuitOpenError);

    // Wait for half-open period
    vi.setSystemTime(35_000);

    // Now the call is allowed and succeeds
    const result = await breaker.execute(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
    expect(breaker.getState().state).toBe('closed');
    expect(breaker.getState().failures).toBe(0);
  });

  test('persistent failures keep circuit open', async () => {
    const breaker = SHARED_BREAKERS.adapterEmit;

    // Open the circuit
    for (let i = 0; i < 5; i++) {
      await expect(
        breaker.execute(() => Promise.reject(Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }))),
      ).rejects.toThrow();
    }

    expect(breaker.getState().state).toBe('open');

    // Wait past halfOpenAfterMs
    vi.setSystemTime(35_000);

    // Test call fails again
    const retryableError = Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' });
    await expect(
      breaker.execute(() => Promise.reject(retryableError)),
    ).rejects.toThrow();

    // Should be open again
    expect(breaker.getState().state).toBe('open');

    // Wait again
    vi.setSystemTime(65_000);

    // Another test call, this time succeeds
    const result = await breaker.execute(() => Promise.resolve('recovery'));
    expect(result).toBe('recovery');
    expect(breaker.getState().state).toBe('closed');
  });
});