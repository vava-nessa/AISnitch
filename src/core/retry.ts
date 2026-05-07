/**
 * @file src/core/retry.ts
 * @description Exponential backoff retry utilities for transient operations.
 *
 * Retry logic is essential for resilience against:
 * - Network flakiness (connection refused, timeouts, DNS failures)
 * - Transient file-system contention (file locked, directory not ready)
 * - External API rate limits (backoff on 429 Too Many Requests)
 *
 * This module provides:
 * - `withRetry()` — async function with exponential backoff
 * - `RetryOptions` — configurable retry parameters
 * - `DefaultRetryOptions` — sensible defaults for AISnitch workloads
 *
 * Usage:
 * ```typescript
 * const result = await withRetry(
 *   () => fetchHealth(daemonPort),
 *   {
 *     attempts: 3,
 *     delayMs: 500,
 *     backoff: 2,
 *     context: 'daemon-health-check',
 *   }
 * );
 * ```
 *
 * @functions
 *   → withRetry
 *   → sleep
 *   → DefaultRetryOptions
 * @exports RetryOptions, DefaultRetryOptions, withRetry, sleep
 * @see ./errors.ts
 * @see ./result.ts
 */

import { logger } from './engine/logger.js';
import { isRetryableError } from './errors.js';

/**
 * Configuration for retry behaviour.
 */
export interface RetryOptions {
  /**
   * Maximum number of attempts before giving up.
   * @default 3
   */
  readonly attempts: number;

  /**
   * Initial delay in milliseconds between retries.
   * @default 500
   */
  readonly delayMs: number;

  /**
   * Multiplicative factor for delay after each attempt.
   * @default 2
   */
  readonly backoff: number;

  /**
   * Maximum total time in milliseconds across all retries.
   * @default 30_000
   */
  readonly maxTotalDelayMs: number;

  /**
   * Human-readable label used in log messages for traceability.
   */
  readonly context: string;

  /**
   * Optional predicate to filter which errors trigger a retry.
   * By default, `isRetryableError()` is used.
   * Return `true` to retry, `false` to give up immediately.
   */
  readonly shouldRetry?: (error: unknown) => boolean;

  /**
   * Set to `true` to jitter the delay slightly (±25%) to avoid thundering herd.
   * @default true
   */
  readonly jitter?: boolean;
}

/**
 * Sensible defaults tuned for AISnitch workloads:
 * - Quick first retry (500ms) for responsiveness
 * - Exponential backoff to back off gracefully
 * - 3 attempts to avoid long stalls
 * - Jitter enabled to spread load
 */
export const DefaultRetryOptions: Readonly<RetryOptions> = {
  attempts: 3,
  backoff: 2,
  context: 'unknown',
  delayMs: 500,
  jitter: true,
  maxTotalDelayMs: 30_000,
  shouldRetry: isRetryableError,
};

/**
 * Blocks the current async execution for the given number of milliseconds.
 *
 * @example
 * ```typescript
 * await sleep(1000); // wait 1 second
 * ```
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });
}

/**
 * Calculates the actual delay for a given attempt, applying jitter when enabled.
 */
function computeDelay(
  attempt: number,
  baseDelayMs: number,
  backoff: number,
  jitter: boolean,
): number {
  // Exponential backoff: baseDelay * backoff^(attempt-1)
  const exponentialDelay = baseDelayMs * Math.pow(backoff, attempt - 1);

  if (!jitter) {
    return exponentialDelay;
  }

  // Jitter: ±25% of the delay to avoid thundering herd
  const jitterFactor = 0.75 + Math.random() * 0.5;
  return Math.round(exponentialDelay * jitterFactor);
}

/**
 * Wraps an async operation with exponential-backoff retry logic.
 *
 * ## How it works
 *
 * 1. Executes `fn` immediately (no initial delay)
 * 2. If it succeeds → returns the result
 * 3. If it throws and `shouldRetry(error)` returns `true` and attempts remain:
 *    - Logs a warning at attempt level (warn) and at failure level (error)
 *    - Waits `delayMs * backoff^attempt` milliseconds (with optional jitter)
 *    - Repeats from step 1
 * 4. If it throws and `shouldRetry(error)` returns `false` → throws immediately
 * 5. If all attempts are exhausted → throws the last error
 *
 * ## When NOT to use this
 *
 * - **Permanent failures** (e.g., validation errors, missing required files)
 *   → Use `isRetryableError()` to filter these out automatically
 * - **Operations that are not idempotent** → only retry if `fn` is safe to re-execute
 * - **User-facing latency-sensitive paths** → use a shorter `delayMs` and fewer `attempts`
 *
 * @example
 * ```typescript
 * // Retry a flaky health check up to 3 times
 * const health = await withRetry(
 *   () => fetch('http://127.0.0.1:4821/health').then(r => r.json()),
 *   {
 *     ...DefaultRetryOptions,
 *     context: 'daemon-health-check',
 *   }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> & { context: string },
): Promise<T> {
  const {
    attempts = DefaultRetryOptions.attempts,
    backoff = DefaultRetryOptions.backoff,
    delayMs = DefaultRetryOptions.delayMs,
    maxTotalDelayMs = DefaultRetryOptions.maxTotalDelayMs,
    jitter = DefaultRetryOptions.jitter,
    shouldRetry = DefaultRetryOptions.shouldRetry,
  } = options;

  let lastError: unknown;
  let totalDelayMs = 0;
  const shouldRetryWithDefault = shouldRetry ?? DefaultRetryOptions.shouldRetry!;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const retryable = shouldRetryWithDefault(error);
      const attemptsRemaining = attempt < attempts;

      if (!retryable || !attemptsRemaining) {
        // Non-retryable error or last attempt → propagate
        if (!retryable) {
          logger.debug(
            { attempt, context: options.context, error },
            'Non-retryable error — giving up immediately',
          );
        } else {
          logger.error(
            { attempt, attempts, context: options.context, error },
            'All retry attempts exhausted',
          );
        }

        throw error;
      }

      const delay = computeDelay(attempt, delayMs, backoff, jitter ?? false);
      totalDelayMs += delay;

      if (totalDelayMs > maxTotalDelayMs) {
        logger.warn(
          { attempt, delay, totalDelayMs, maxTotalDelayMs, context: options.context },
          'Retry max total delay exceeded — giving up',
        );
        throw lastError;
      }

      logger.debug(
        { attempt, attempts, delay, nextDelayMs: delay, context: options.context },
        `Operation failed — retrying in ${delay}ms`,
      );

      await sleep(delay);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError;
}

/**
 * Convenience wrapper for fire-and-forget retries (no return value needed).
 * Logs failures but never throws — useful for non-critical background tasks.
 *
 * @example
 * ```typescript
 * // Best-effort metric reporting — don't fail the main flow
 * fireAndForgetRetry(
 *   () => sendMetrics(metrics),
 *   { context: 'metrics-report', attempts: 2 }
 * );
 * ```
 */
export function fireAndForgetRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> & { context: string },
): void {
  void withRetry(fn, {
    ...options,
    attempts: options.attempts ?? 2,
  }).catch((error) => {
    logger.warn(
      { error, context: options.context },
      'Fire-and-forget retry also failed — giving up silently',
    );
  });
}

/**
 * Builds a retry-enabled version of any async function.
 * The returned function will automatically retry on retryable errors.
 *
 * @example
 * ```typescript
 * const safeReadFile = withRetryOn(
 *   (path: string) => readFile(path, 'utf8'),
 *   { attempts: 3, delayMs: 200, context: 'file-read' }
 * );
 *
 * const content = await safeReadFile('/path/to/file.txt');
 * ```
 */
export function withRetryOn<T extends (...args: never[]) => Promise<unknown>>(
  fn: T,
  options: Partial<RetryOptions> & { context: string },
): T {
  return ((...args: Parameters<T>) => withRetry(() => fn(...args), options)) as T;
}
