import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

import {
  CircuitOpenError,
  CircuitBreaker,
  SHARED_BREAKERS,
  type CircuitState,
} from '../circuit-breaker.js';

/** Creates an error with a retryable errno code */
function retryableError(message = 'ECONNREFUSED'): Error {
  return Object.assign(new Error(message), { code: 'ECONNREFUSED' });
}

/** Creates a non-retryable error (validation error) */
function nonRetryableError(message = 'Validation failed'): Error {
  return new Error(message);
}

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0); // Start at time 0
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    test('starts in CLOSED state', () => {
      const breaker = new CircuitBreaker();
      expect(breaker.getState().state).toBe('closed');
    });

    test('starts with zero failures', () => {
      const breaker = new CircuitBreaker();
      expect(breaker.getState().failures).toBe(0);
    });

    test('starts with null lastFailureAt', () => {
      const breaker = new CircuitBreaker();
      expect(breaker.getState().lastFailureAt).toBeNull();
    });
  });

  describe('execute() in CLOSED state', () => {
    test('passes through successful operations', async () => {
      const breaker = new CircuitBreaker();
      const result = await breaker.execute(() => Promise.resolve('success'));
      expect(result).toBe('success');
    });

    test('resets failure count on success (default resetOnSuccess: true)', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3 });

      // Make 2 retryable failures (below threshold)
      await expect(breaker.execute(() => Promise.reject(retryableError()))).rejects.toThrow();
      await expect(breaker.execute(() => Promise.reject(retryableError()))).rejects.toThrow();
      expect(breaker.getState().failures).toBe(2);

      // Succeed once → reset to 0
      await breaker.execute(() => Promise.resolve('ok'));
      expect(breaker.getState().failures).toBe(0);
    });

    test('opens circuit after reaching failure threshold', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3 });

      // Fail 3 times (threshold)
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(() => Promise.reject(retryableError()))).rejects.toThrow();
      }
      expect(breaker.getState().state).toBe('open');

      // Next call should throw CircuitOpenError
      await expect(breaker.execute(() => Promise.resolve('should-fail'))).rejects.toThrow(CircuitOpenError);
    });

    test('ignores non-retryable errors (default shouldCountAsFailure)', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3 });

      // Fail 10 times but none count (not retryable)
      for (let i = 0; i < 10; i++) {
        await expect(breaker.execute(() => Promise.reject(nonRetryableError()))).rejects.toThrow();
      }

      // Still CLOSED because no failures were counted
      expect(breaker.getState().state).toBe('closed');
      expect(breaker.getState().failures).toBe(0);

      // Should still pass
      const result = await breaker.execute(() => Promise.resolve('still-works'));
      expect(result).toBe('still-works');
    });
  });

  describe('execute() in OPEN state', () => {
    test('throws CircuitOpenError immediately without calling fn', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2 });

      // Open the circuit
      await expect(breaker.execute(() => Promise.reject(retryableError()))).rejects.toThrow();
      await expect(breaker.execute(() => Promise.reject(retryableError()))).rejects.toThrow();
      expect(breaker.getState().state).toBe('open');

      // fn should NOT be called — use a mock to verify
      const fn = vi.fn(() => Promise.resolve('should-not-run'));
      await expect(breaker.execute(fn)).rejects.toThrow(CircuitOpenError);
      expect(fn).not.toHaveBeenCalled();
    });

    test('includes circuit id in CircuitOpenError', async () => {
      const breaker = new CircuitBreaker({ id: 'test-circuit', failureThreshold: 1 });
      await expect(breaker.execute(() => Promise.reject(retryableError()))).rejects.toThrow();

      try {
        await breaker.execute(() => Promise.resolve('x'));
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        if (error instanceof CircuitOpenError) {
          expect(error.circuitId).toBe('test-circuit');
        }
      }
    });
  });

  describe('transition to HALF-OPEN', () => {
    test('transitions to HALF-OPEN after halfOpenAfterMs elapses', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2, halfOpenAfterMs: 10_000 });

      // Open the circuit at time 0
      await expect(breaker.execute(() => Promise.reject(retryableError()))).rejects.toThrow();
      await expect(breaker.execute(() => Promise.reject(retryableError()))).rejects.toThrow();
      expect(breaker.getState().state).toBe('open');

      // Advance time past halfOpenAfterMs
      vi.setSystemTime(15_000);

      // Call should transition to half-open (and then close on success)
      const fn = vi.fn(() => Promise.resolve('recovery-test'));
      await breaker.execute(fn);

      expect(fn).toHaveBeenCalledOnce();
      // After successful test call, circuit closes
      expect(breaker.getState().state).toBe('closed');
    });

    test('stays OPEN if not enough time has elapsed', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2, halfOpenAfterMs: 10_000 });

      // Open the circuit
      await expect(breaker.execute(() => Promise.reject(retryableError()))).rejects.toThrow();
      await expect(breaker.execute(() => Promise.reject(retryableError()))).rejects.toThrow();
      expect(breaker.getState().state).toBe('open');

      // Advance time but NOT past halfOpenAfterMs
      vi.setSystemTime(5_000);

      // Should still be blocked
      await expect(breaker.execute(() => Promise.resolve('should-fail'))).rejects.toThrow(CircuitOpenError);
      expect(breaker.getState().state).toBe('open');
    });
  });

  describe('execute() in HALF-OPEN state', () => {
    test('allows one test call', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1, halfOpenAfterMs: 0 });
      await expect(breaker.execute(() => Promise.reject(retryableError()))).rejects.toThrow();
      vi.setSystemTime(0);

      const fn = vi.fn(() => Promise.resolve('test-success'));
      await breaker.execute(fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    test('closes circuit on successful test call', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1, halfOpenAfterMs: 0 });
      await expect(breaker.execute(() => Promise.reject(retryableError()))).rejects.toThrow();
      vi.setSystemTime(0);

      await breaker.execute(() => Promise.resolve('recovery-success'));
      expect(breaker.getState().state).toBe('closed');
      expect(breaker.getState().failures).toBe(0);

      const result = await breaker.execute(() => Promise.resolve('normal-operation'));
      expect(result).toBe('normal-operation');
    });

    test('reopens circuit on failed test call', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1, halfOpenAfterMs: 0 });
      await expect(breaker.execute(() => Promise.reject(retryableError()))).rejects.toThrow();
      vi.setSystemTime(0);

      // Test fails → circuit should reopen
      await expect(breaker.execute(() => Promise.reject(retryableError()))).rejects.toThrow();
      expect(breaker.getState().state).toBe('open');
    });
  });

  describe('reset()', () => {
    test('forces circuit to CLOSED with zero failures', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2 });
      await expect(breaker.execute(() => Promise.reject(retryableError()))).rejects.toThrow();
      await expect(breaker.execute(() => Promise.reject(retryableError()))).rejects.toThrow();
      expect(breaker.getState().state).toBe('open');

      breaker.reset();

      expect(breaker.getState().state).toBe('closed');
      expect(breaker.getState().failures).toBe(0);
      expect(breaker.getState().lastFailureAt).toBeNull();

      const result = await breaker.execute(() => Promise.resolve('after-reset'));
      expect(result).toBe('after-reset');
    });
  });

  describe('resetOnSuccess option', () => {
    test('resetOnSuccess: true resets counter on any success (default)', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3, resetOnSuccess: true });

      await expect(breaker.execute(() => Promise.reject(retryableError()))).rejects.toThrow();
      await expect(breaker.execute(() => Promise.reject(retryableError()))).rejects.toThrow();
      expect(breaker.getState().failures).toBe(2);

      await breaker.execute(() => Promise.resolve('ok'));
      expect(breaker.getState().failures).toBe(0);
    });

    test('resetOnSuccess: false only decrements counter on success', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 5, resetOnSuccess: false });

      breaker.reset();

      await expect(breaker.execute(() => Promise.reject(retryableError()))).rejects.toThrow();
      await expect(breaker.execute(() => Promise.reject(retryableError()))).rejects.toThrow();
      expect(breaker.getState().failures).toBe(2);

      await breaker.execute(() => Promise.resolve('ok'));
      expect(breaker.getState().failures).toBe(1);

      await breaker.execute(() => Promise.resolve('ok2'));
      expect(breaker.getState().failures).toBe(0);
    });
  });

  describe('windowMs option', () => {
    test('successive failures within window trigger circuit open', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        windowMs: 10_000,
        shouldCountAsFailure: () => true,
      });

      // First failure at time 0
      await expect(breaker.execute(() => Promise.reject(retryableError()))).rejects.toThrow();
      expect(breaker.getState().failures).toBe(1);
      expect(breaker.getState().state).toBe('closed');

      // Second failure at time 0 → opens circuit
      await expect(breaker.execute(() => Promise.reject(retryableError()))).rejects.toThrow();
      expect(breaker.getState().state).toBe('open');
    });
  });
});

describe('CircuitOpenError', () => {
  test('has correct name and code', () => {
    const state: CircuitState = { failures: 5, lastFailureAt: Date.now(), state: 'open' };
    const error = new CircuitOpenError('test-circuit', state);
    expect(error.name).toBe('CircuitOpenError');
    expect(error.code).toBe('CIRCUIT_OPEN');
  });

  test('includes circuit id in context', () => {
    const state: CircuitState = { failures: 3, lastFailureAt: 1234567890, state: 'open' };
    const error = new CircuitOpenError('my-adapter', state);
    expect(error.circuitId).toBe('my-adapter');
    expect(error.context?.circuitId).toBe('my-adapter');
    expect(error.context?.failures).toBe(3);
  });

  test('toString includes circuit id and failure count', () => {
    const state: CircuitState = { failures: 7, lastFailureAt: null, state: 'open' };
    const error = new CircuitOpenError('adapter.emit', state);
    expect(error.toString()).toContain('adapter.emit');
    expect(error.toString()).toContain('7');
  });
});

describe('SHARED_BREAKERS', () => {
  test('adapterEmit starts in CLOSED state', () => {
    expect(SHARED_BREAKERS.adapterEmit.getState().state).toBe('closed');
  });

  test('fileSystem starts in CLOSED state', () => {
    expect(SHARED_BREAKERS.fileSystem.getState().state).toBe('closed');
  });

  test('httpRequest starts in CLOSED state', () => {
    expect(SHARED_BREAKERS.httpRequest.getState().state).toBe('closed');
  });

  test('processDetection starts in CLOSED state', () => {
    expect(SHARED_BREAKERS.processDetection.getState().state).toBe('closed');
  });

  test('SHARED_BREAKERS object is frozen', () => {
    expect(Object.isFrozen(SHARED_BREAKERS)).toBe(true);
  });
});
