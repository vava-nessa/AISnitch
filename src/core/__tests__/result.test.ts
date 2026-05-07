import { describe, expect, test } from 'vitest';

import {
  type Result,
  ok,
  err,
  isOk,
  isErr,
  mapOk,
  mapErr,
  flatMap,
  fromPromise,
  fromSync,
} from '../result.js';
import { ValidationError } from '../errors.js';

describe('Result type', () => {
  test('ok() creates a successful result', () => {
    const result = ok({ value: 42 });

    expect(result.success).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({ value: 42 });
    }
  });

  test('err() creates a failed result', () => {
    const error = new Error('test error');
    const result = err(error);
    expect(result.success).toBe(false);
    if (isErr(result)) {
      expect(result.error).toBe(error);
    }
  });

  test('ok() freezes the result object', () => {
    const result = ok(42);
    expect(Object.isFrozen(result)).toBe(true);
  });

  test('err() freezes the result object', () => {
    const result = err(new Error('test'));
    expect(Object.isFrozen(result)).toBe(true);
  });
});

describe('isOk() type guard', () => {
  test('returns true for successful result', () => {
    const result = ok(42);
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
  });

  test('returns false for failed result', () => {
    const result = err(new Error('test'));
    expect(isOk(result)).toBe(false);
    expect(isErr(result)).toBe(true);
  });

  test('correctly narrows the type', () => {
    const result: Result<number, Error> = Math.random() > 0.5
      ? ok(42)
      : err(new Error('test'));

    if (isOk(result)) {
      expect(typeof result.value).toBe('number');
    }
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });
});

describe('mapOk()', () => {
  test('transforms the value when success', () => {
    const result = ok({ userId: 1, name: 'Alice' });
    const mapped = mapOk(result, (user) => user.name.toUpperCase());
    expect(isOk(mapped)).toBe(true);
    if (isOk(mapped)) {
      expect(mapped.value).toBe('ALICE');
    }
  });

  test('passes through error unchanged', () => {
    const result: Result<string, Error> = err(new Error('original'));
    const mapped = mapErr(result, (error) => {
      return new ValidationError(`Mapped: ${error.message}`, 'MAPPED_ERROR');
    });
    expect(isErr(mapped)).toBe(true);
    if (isErr(mapped)) {
      expect(mapped.error).toBeInstanceOf(ValidationError);
      expect(mapped.error.message).toBe('Mapped: original');
    }
  });

  test('transforms value type when success', () => {
    const result = ok({ id: 1 });
    const mapped = mapOk(result, (obj) => Object.keys(obj).length);
    expect(isOk(mapped)).toBe(true);
    if (isOk(mapped)) {
      expect(mapped.value).toBe(1);
    }
  });
});

describe('mapErr()', () => {
  test('transforms the error when failure', () => {
    const result: Result<string, Error> = err(new Error('original'));
    const mapped = mapErr(result, (error) => {
      return new ValidationError(`Transformed: ${error.message}`, 'TRANSFORMED_ERROR');
    });
    expect(isErr(mapped)).toBe(true);
    if (isErr(mapped)) {
      expect(mapped.error).toBeInstanceOf(ValidationError);
      expect(mapped.error.message).toBe('Transformed: original');
    }
  });

  test('passes through value unchanged when success', () => {
    const result = ok('hello');
    const mapped = mapErr(result, (_error) => new Error('never used'));
    expect(isOk(mapped)).toBe(true);
    if (isOk(mapped)) {
      expect(mapped.value).toBe('hello');
    }
  });
});

describe('flatMap()', () => {
  test('chains successful results', async () => {
    const first = ok(5);
    const second = await flatMap(first, (value) => ok(value * 2));
    expect(isOk(second)).toBe(true);
    if (isOk(second)) {
      expect(second.value).toBe(10);
    }
  });

  test('propagates first error without calling fn', async () => {
    const firstError = new Error('first error');
    const first: Result<number, Error> = err(firstError);
    const second = await flatMap(first, (value) => ok(value * 2));
    expect(isErr(second)).toBe(true);
    if (isErr(second)) {
      expect(second.error).toBe(firstError);
    }
  });

  test('propagates second error when fn fails', async () => {
    const first = ok(5);
    const secondError = new Error('second error');
    const second = await flatMap(first, () => err(secondError));
    expect(isErr(second)).toBe(true);
    if (isErr(second)) {
      expect(second.error).toBe(secondError);
    }
  });

  test('works with async fn returning Result', async () => {
    const first = ok('hello');
    const second = await flatMap(first, async (value) => {
      await Promise.resolve();
      return ok(value.length);
    });
    expect(isOk(second)).toBe(true);
    if (isOk(second)) {
      expect(second.value).toBe(5);
    }
  });
});

describe('fromPromise()', () => {
  test('converts resolved promise to ok result', async () => {
    const promise = Promise.resolve({ data: 'success' });
    const result = await fromPromise(
      promise,
      (reason: unknown) => new Error(`Failed: ${String(reason)}`),
    );
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({ data: 'success' });
    }
  });

  test('converts rejected promise to err result', async () => {
    const originalError = new Error('API failed');
    const promise = Promise.reject(originalError);
    const result = await fromPromise(
      promise,
      (reason: unknown) => new ValidationError(
        reason instanceof Error ? reason.message : String(reason),
        'API_ERROR',
      ),
    );
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(ValidationError);
      expect(result.error.message).toBe('API failed');
    }
  });

  test('works with async operations', async () => {
    const promise = (async () => {
      await Promise.resolve();
      return 'delayed';
    })();
    const result = await fromPromise(
      promise,
      (reason: unknown) => new Error(String(reason)),
    );
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe('delayed');
    }
  });
});

describe('fromSync()', () => {
  test('converts successful sync function to ok result', () => {
    const result = fromSync(
      () => ({ parsed: true, value: 42 }),
      (reason: unknown) => new Error(String(reason)),
    );
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({ parsed: true, value: 42 });
    }
  });

  test('converts throwing sync function to err result', () => {
    const originalError = new SyntaxError('Invalid JSON');
    const result = fromSync(
      () => {
        throw originalError;
      },
      (reason: unknown) => new ValidationError(
        reason instanceof Error ? reason.message : String(reason),
        'PARSE_ERROR',
      ),
    );
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(ValidationError);
    }
  });

  test('handles JSON.parse success', () => {
    const result = fromSync(
      (): boolean => {
        const parsed = JSON.parse('{"valid": true}') as { valid: boolean };
        return parsed.valid;
      },
      (_reason: unknown) => new ValidationError('Invalid JSON', 'INVALID_JSON'),
    );
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(true);
    }
  });

  test('handles JSON.parse failure', () => {
    const result = fromSync(
      () => {
        JSON.parse('not json');
        return true;
      },
      (_reason: unknown) => new ValidationError('Invalid JSON', 'INVALID_JSON'),
    );
    expect(isErr(result)).toBe(true);
  });
});
