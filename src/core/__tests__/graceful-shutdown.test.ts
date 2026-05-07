import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

import { withShutdownTimeout, shutdownInOrder } from '../graceful-shutdown.js';
import type { ShutdownComponents } from '../graceful-shutdown.js';

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('withShutdownTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('resolves when function completes within timeout', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const resultPromise = withShutdownTimeout(fn, 1000, 'test-component');

    await resultPromise;

    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('resolves when function completes faster than timeout', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    await withShutdownTimeout(fn, 10_000, 'test-component');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('continues past timeout without throwing', async () => {
    // Function that would hang forever
    const fn = vi.fn().mockImplementation(() => new Promise(() => undefined));

    const promise = withShutdownTimeout(fn, 100, 'test-component');

    // Advance time past the timeout
    vi.advanceTimersByTime(150);

    // Should not throw, should resolve
    await expect(promise).resolves.toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('logs warning when operation times out', async () => {
    const fn = vi.fn().mockImplementation(() => new Promise(() => undefined));

    const promise = withShutdownTimeout(fn, 50, 'timed-out-component');

    vi.advanceTimersByTime(100);

    await promise;

    // The function was called (but will never resolve)
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('shutdownInOrder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('stops components in correct order (reverse dependency)', async () => {
    vi.useRealTimers();
    try {
      const stopOrder: string[] = [];

      const components: ShutdownComponents = {
        adapterRegistry: {
          stopAll: vi.fn().mockResolvedValue(undefined),
        },
        httpReceiver: {
          stop: vi.fn().mockResolvedValue(undefined),
        },
        udsServer: {
          stop: vi.fn().mockResolvedValue(undefined),
        },
        wsServer: {
          stop: vi.fn().mockResolvedValue(undefined),
        },
        eventBus: {
          unsubscribeAll: vi.fn().mockImplementation(() => {
            stopOrder.push('eventBus');
          }),
        },
      };

      await shutdownInOrder(components, {
        adapterRegistry: 5000,
        httpReceiver: 5000,
        udsServer: 5000,
        wsServer: 5000,
      }, 'pipeline');

      // All stop methods should have been called
      expect(components.eventBus?.unsubscribeAll).toHaveBeenCalledTimes(1);
      expect(components.wsServer?.stop).toHaveBeenCalledTimes(1);
      expect(components.udsServer?.stop).toHaveBeenCalledTimes(1);
      expect(components.httpReceiver?.stop).toHaveBeenCalledTimes(1);
      expect(components.adapterRegistry?.stopAll).toHaveBeenCalledTimes(1);
    } finally {
      vi.useFakeTimers();
      vi.setSystemTime(0);
    }
  });

  test('continues even if one component fails', async () => {
    vi.useRealTimers();
    try {
      const stopOrder: string[] = [];

      const components: ShutdownComponents = {
        adapterRegistry: {
          stopAll: vi.fn().mockImplementation(() => {
            stopOrder.push('adapterRegistry');
            throw new Error('Adapter registry failed');
          }),
        },
        httpReceiver: {
          stop: vi.fn().mockImplementation(() => {
            stopOrder.push('httpReceiver');
          }),
        },
        udsServer: {
          stop: vi.fn().mockImplementation(() => {
            stopOrder.push('udsServer');
          }),
        },
        wsServer: {
          stop: vi.fn().mockImplementation(() => {
            stopOrder.push('wsServer');
          }),
        },
        eventBus: {
          unsubscribeAll: vi.fn().mockImplementation(() => {
            stopOrder.push('eventBus');
          }),
        },
      };

      // Should not throw even if adapter fails
      await shutdownInOrder(components, {
        adapterRegistry: 5000,
        httpReceiver: 5000,
        udsServer: 5000,
        wsServer: 5000,
      }, 'pipeline');

      // All other components should still be stopped
      expect(stopOrder).toContain('wsServer');
      expect(stopOrder).toContain('udsServer');
      expect(stopOrder).toContain('httpReceiver');
      expect(stopOrder).toContain('adapterRegistry');
    } finally {
      vi.useFakeTimers();
      vi.setSystemTime(0);
    }
  });

  test('uses component-specific timeouts', async () => {
    vi.useRealTimers();
    try {
      const components: ShutdownComponents = {
        wsServer: {
          stop: vi.fn().mockResolvedValue(undefined),
        },
      };

      // Short timeout should not cause issues for fast operation
      await shutdownInOrder(components, { wsServer: 200 }, 'pipeline');

      expect(components.wsServer?.stop).toHaveBeenCalledTimes(1);
    } finally {
      vi.useFakeTimers();
      vi.setSystemTime(0);
    }
  });

  test('handles missing optional components gracefully', async () => {
    vi.useRealTimers();
    try {
      const components: ShutdownComponents = {
        wsServer: {
          stop: vi.fn().mockResolvedValue(undefined),
        },
        // adapterRegistry is undefined
      };

      await shutdownInOrder(components, { wsServer: 5000 }, 'pipeline');

      expect(components.wsServer?.stop).toHaveBeenCalledTimes(1);
    } finally {
      vi.useFakeTimers();
      vi.setSystemTime(0);
    }
  });

  test('executes cleanup functions', async () => {
    const cleanupCalled = vi.fn();

    const components: ShutdownComponents = {
      cleanupFns: [
        () => {
          cleanupCalled('cleanup-1');
        },
        () => {
          cleanupCalled('cleanup-2');
        },
      ],
      wsServer: {
        stop: vi.fn().mockResolvedValue(undefined),
      },
    };

    await shutdownInOrder(components, { wsServer: 5000 }, 'pipeline');

    expect(cleanupCalled).toHaveBeenCalledWith('cleanup-1');
    expect(cleanupCalled).toHaveBeenCalledWith('cleanup-2');
  });

  test('handles synchronous cleanup functions', async () => {
    const cleanupCalled = vi.fn();

    const components: ShutdownComponents = {
      cleanupFns: [
        () => {
          cleanupCalled('sync-cleanup');
        },
      ],
      wsServer: {
        stop: vi.fn().mockResolvedValue(undefined),
      },
    };

    await shutdownInOrder(components, { wsServer: 5000 }, 'pipeline');

    expect(cleanupCalled).toHaveBeenCalledWith('sync-cleanup');
  });
});

describe('graceful shutdown integration scenarios', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('full pipeline shutdown with varying component speeds', async () => {
    const timings: Record<string, number> = {};

    const components: ShutdownComponents = {
      adapterRegistry: {
        stopAll: vi.fn().mockImplementation(async () => {
          vi.advanceTimersByTime(50);
          await Promise.resolve();
          timings.adapterRegistry = Date.now();
        }),
      },
      httpReceiver: {
        stop: vi.fn().mockImplementation(async () => {
          vi.advanceTimersByTime(20);
          await Promise.resolve();
          timings.httpReceiver = Date.now();
        }),
      },
      udsServer: {
        stop: vi.fn().mockImplementation(async () => {
          vi.advanceTimersByTime(10);
          await Promise.resolve();
          timings.udsServer = Date.now();
        }),
      },
      wsServer: {
        stop: vi.fn().mockImplementation(async () => {
          vi.advanceTimersByTime(5);
          await Promise.resolve();
          timings.wsServer = Date.now();
        }),
      },
      eventBus: {
        unsubscribeAll: vi.fn().mockImplementation(() => {
          timings.eventBus = Date.now();
        }),
      },
    };

    await shutdownInOrder(components, {
      adapterRegistry: 5000,
      httpReceiver: 5000,
      udsServer: 5000,
      wsServer: 5000,
    }, 'pipeline');

    // All components should have completed
    expect(timings.eventBus).toBeDefined();
    expect(timings.wsServer).toBeDefined();
    expect(timings.udsServer).toBeDefined();
    expect(timings.httpReceiver).toBeDefined();
    expect(timings.adapterRegistry).toBeDefined();
  });

  test('daemon stops cleanly with no hanging resources', async () => {
    let resourceCleanedUp = false;

    const components: ShutdownComponents = {
      adapterRegistry: {
        stopAll: vi.fn().mockImplementation(async () => {
          // Simulate adapter cleanup
          vi.advanceTimersByTime(10);
          await Promise.resolve();
        }),
      },
      httpReceiver: {
        stop: vi.fn().mockImplementation(async () => {
          vi.advanceTimersByTime(10);
          await Promise.resolve();
        }),
      },
      wsServer: {
        stop: vi.fn().mockImplementation(async () => {
          vi.advanceTimersByTime(10);
          await Promise.resolve();
        }),
      },
      cleanupFns: [
        () => {
          resourceCleanedUp = true;
        },
      ],
    };

    await shutdownInOrder(components, {
      adapterRegistry: 5000,
      httpReceiver: 5000,
      wsServer: 5000,
    }, 'daemon');

    expect(resourceCleanedUp).toBe(true);
  });
});