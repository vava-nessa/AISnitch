/**
 * @file src/core/result.ts
 * @description Simple Result type for explicit error handling without relying on try/catch.
 *
 * This is a lightweight alternative to fp-ts Either for cases where you want to force
 * callers to handle the error case explicitly but don't need the full fp-ts ecosystem.
 *
 * The `Result<T, E>` type has two states:
 * - `{ success: true, value: T }` — operation succeeded with a value
 * - `{ success: false, error: E }` — operation failed with an error
 *
 * Usage pattern:
 * ```typescript
 * function parseConfig(raw: unknown): Result<AISnitchConfig, ValidationError> {
 *   const result = ConfigSchema.safeParse(raw);
 *   if (!result.success) {
 *     return err(new ValidationError(
 *       'Invalid config', 'VALIDATION_CONFIG_INVALID',
 *       { issues: result.error.issues }
 *     ));
 *   }
 *   return ok(result.data);
 * }
 *
 * // Caller must handle both cases
 * const result = parseConfig(raw);
 * if (isErr(result)) {
 *   logger.error({ error: result.error }, 'Config parsing failed');
 *   return;
 * }
 * // result.value is guaranteed to exist here
 * useConfig(result.value);
 * ```
 *
 * @functions
 *   → ok
 *   → err
 *   → isOk
 *   → isErr
 *   → mapOk
 *   → mapErr
 *   → flatMap
 *   → fromPromise
 * @exports Result, ok, err, isOk, isErr, mapOk, mapErr, flatMap, fromPromise
 * @see ./errors.ts
 * @see ./retry.ts
 */

/**
 * Discriminated union representing either a successful value or a failure error.
 *
 * @typeParam T - The success value type
 * @typeParam E - The error type (defaults to `Error`)
 */
export type Result<T, E = Error> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: E };

/**
 * Narrowing type guard for the success case.
 *
 * @example
 * ```typescript
 * const result = maybeDoSomething();
 * if (isOk(result)) {
 *   console.log(result.value); // TypeScript knows result.value exists
 * }
 * ```
 */
export function isOk<T, E>(result: Result<T, E>): result is { success: true; value: T } {
  return result.success === true;
}

/**
 * Narrowing type guard for the error case.
 *
 * @example
 * ```typescript
 * const result = maybeDoSomething();
 * if (isErr(result)) {
 *   console.error(result.error); // TypeScript knows result.error exists
 * }
 * ```
 */
export function isErr<T, E>(result: Result<T, E>): result is { success: false; error: E } {
  return result.success === false;
}

/**
 * Constructs a successful result with a value.
 *
 * @example
 * ```typescript
 * const result = ok({ userId: 42, name: 'Alice' });
 * // { success: true, value: { userId: 42, name: 'Alice' } }
 * ```
 */
export function ok<T>(value: T): Result<T, never> {
  return Object.freeze({ success: true, value });
}

/**
 * Constructs a failed result with an error.
 *
 * @example
 * ```typescript
 * const result = err(new Error('Not found'));
 * // { success: false, error: Error('Not found') }
 * ```
 */
export function err<E extends Error = Error>(error: E): Result<never, E> {
  return Object.freeze({ success: false, error });
}

/**
 * Maps the success value through a transformation function.
 * Errors pass through unchanged.
 *
 * @example
 * ```typescript
 * const result: Result<User, Error> = ok({ id: 1, name: 'Alice' });
 * const mapped = mapOk(result, (user) => user.name.toUpperCase());
 * // { success: true, value: 'ALICE' }
 * ```
 */
export function mapOk<T, E, U>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> {
  if (!result.success) {
    // TypeScript needs this cast because it can't narrow both union branches at once
    return result as unknown as Result<U, E>;
  }

  return ok(fn(result.value));
}

/**
 * Maps the error value through a transformation function.
 * Success values pass through unchanged.
 *
 * @example
 * ```typescript
 * const result: Result<User, Error> = err(new Error('original'));
 * const mapped = mapErr(result, (error) => new CustomError(error.message));
 * // { success: false, error: CustomError('original') }
 * ```
 */
export function mapErr<T, E, F extends Error>(
  result: Result<T, E>,
  fn: (error: E) => F,
): Result<T, F> {
  if (result.success) {
    return result as unknown as Result<T, F>;
  }

  return err(fn(result.error));
}

/**
 * Chains Result operations: if the first Result succeeds, apply `fn` to its value.
 * If it fails, propagate the error without calling `fn`.
 *
 * @example
 * ```typescript
 * const result = await flatMap(
 *   await parseConfig(raw),
 *   (config) => validateAdapters(config.adapters)
 * );
 * // Either returns parseConfig's error, or the error from validateAdapters
 * ```
 */
export async function flatMap<T, E, U, F extends Error>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, F> | Promise<Result<U, F>>,
): Promise<Result<U, E | F>> {
  if (!result.success) {
    return result as unknown as Result<U, E | F>;
  }

  const mapped = await fn(result.value);

  if (!mapped.success) {
    return mapped as unknown as Result<U, E | F>;
  }

  return ok(mapped.value);
}

/**
 * Converts a Promise to a Result, catching errors automatically.
 * Rejections become `{ success: false, error: E }`.
 *
 * @example
 * ```typescript
 * const result = await fromPromise(
 *   fetch('http://127.0.0.1:4821/health'),
 *   (error) => new NetworkError(
 *     'Health check failed',
 *     'NETWORK_HTTP_CONNECT_FAILED',
 *     { cause: error }
 *   )
 * );
 * if (isErr(result)) {
 *   logger.warn({ error: result.error }, 'Daemon health check failed');
 *   return null;
 * }
 * const health = await result.value.json();
 * ```
 */
export async function fromPromise<T, E extends Error>(
  promise: Promise<T>,
  mapError: (reason: unknown) => E,
): Promise<Result<T, E>> {
  try {
    const value = await promise;
    return ok(value);
  } catch (reason) {
    return err(mapError(reason));
  }
}

/**
 * Synchronous version of `fromPromise` for non-async functions.
 *
 * @example
 * ```typescript
 * const result = fromSync(() => JSON.parse(rawJson), (e) =>
 *   new ValidationError('Invalid JSON', 'VALIDATION_JSON_PARSE', { cause: e })
 * );
 * ```
 */
export function fromSync<T, E extends Error>(
  fn: () => T,
  mapError: (reason: unknown) => E,
): Result<T, E> {
  try {
    return ok(fn());
  } catch (reason) {
    return err(mapError(reason));
  }
}
