import { describe, expect, test } from 'vitest';

import { TimeoutError } from '../errors.js';
import {
  DEFAULT_TIMEOUTS,
  withTimeout,
  getTimeout,
  isTimeoutError,
} from '../timeout.js';

describe('DEFAULT_TIMEOUTS', () => {
  test('has all expected timeout keys', () => {
    expect(DEFAULT_TIMEOUTS).toHaveProperty('fileOperation');
    expect(DEFAULT_TIMEOUTS).toHaveProperty('httpRequest');
    expect(DEFAULT_TIMEOUTS).toHaveProperty('processDetection');
    expect(DEFAULT_TIMEOUTS).toHaveProperty('adapterStartup');
    expect(DEFAULT_TIMEOUTS).toHaveProperty('adapterShutdown');
    expect(DEFAULT_TIMEOUTS).toHaveProperty('daemonShutdown');
    expect(DEFAULT_TIMEOUTS).toHaveProperty('wsConnection');
    expect(DEFAULT_TIMEOUTS).toHaveProperty('pipelineStartup');
  });

  test('all timeouts are positive numbers', () => {
    for (const [key, value] of Object.entries(DEFAULT_TIMEOUTS)) {
      expect(value, `${key} should be positive`).toBeGreaterThan(0);
      expect(typeof value, `${key} should be a number`).toBe('number');
    }
  });

  test('timeouts are frozen', () => {
    expect(Object.isFrozen(DEFAULT_TIMEOUTS)).toBe(true);
  });
});

describe('withTimeout()', () => {
  test('returns the promise value when it resolves before timeout', async () => {
    const promise = Promise.resolve('success');
    const result = await withTimeout(promise, 5000, 'test-operation');
    expect(result).toBe('success');
  });

  test('returns immediately if promise resolves before timer fires', async () => {
    const promise = Promise.resolve('fast');
    const result = await withTimeout(promise, 5000, 'fast-operation');
    expect(result).toBe('fast');
  });

  test('throws on invalid timeout value (0)', () => {
    const call = () => withTimeout(Promise.resolve('value'), 0, 'test');
    expect(call).toThrow(TimeoutError);
  });

  test('throws on invalid timeout value (negative)', () => {
    const call = () => withTimeout(Promise.resolve('value'), -100, 'test');
    expect(call).toThrow(TimeoutError);
  });
});

describe('getTimeout()', () => {
  test('returns the correct timeout for each name', () => {
    expect(getTimeout('fileOperation')).toBe(DEFAULT_TIMEOUTS.fileOperation);
    expect(getTimeout('httpRequest')).toBe(DEFAULT_TIMEOUTS.httpRequest);
    expect(getTimeout('processDetection')).toBe(DEFAULT_TIMEOUTS.processDetection);
    expect(getTimeout('adapterStartup')).toBe(DEFAULT_TIMEOUTS.adapterStartup);
    expect(getTimeout('adapterShutdown')).toBe(DEFAULT_TIMEOUTS.adapterShutdown);
    expect(getTimeout('daemonShutdown')).toBe(DEFAULT_TIMEOUTS.daemonShutdown);
    expect(getTimeout('wsConnection')).toBe(DEFAULT_TIMEOUTS.wsConnection);
    expect(getTimeout('pipelineStartup')).toBe(DEFAULT_TIMEOUTS.pipelineStartup);
  });
});

describe('isTimeoutError()', () => {
  test('returns true for TimeoutError instances', () => {
    const error = new TimeoutError('Test timeout', 'TIMEOUT_EXCEEDED', { context: 'test' });
    expect(isTimeoutError(error)).toBe(true);
  });

  test('returns false for generic Error', () => {
    const error = new Error('Not a timeout');
    expect(isTimeoutError(error)).toBe(false);
  });

  test('returns false for null', () => {
    expect(isTimeoutError(null)).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(isTimeoutError(undefined)).toBe(false);
  });

  test('returns false for primitive values', () => {
    expect(isTimeoutError('string')).toBe(false);
    expect(isTimeoutError(42)).toBe(false);
    expect(isTimeoutError(true)).toBe(false);
  });
});
