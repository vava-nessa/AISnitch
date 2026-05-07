/**
 * @file src/core/timeout.ts
 * @description Async operation timeout wrappers to prevent indefinite blocking.
 *
 * AISnitch processes many async operations (file reads, HTTP requests, process
 * detection, file watchers, adapter startup/shutdown). Without explicit timeouts,
 * any of these can block the entire daemon indefinitely if the underlying resource
 * becomes unresponsive (e.g., NFS mount stuck, disk I/O stalled, external API hanging).
 *
 * This module provides:
 * - `withTimeout()` — race a promise against a deadline
 * - `TimeoutError` — typed error thrown on timeout
 * - `DEFAULT_TIMEOUTS` — sane defaults per operation type
 *
 * Usage:
 * ```typescript
 * // Fail-fast: don't wait more than 3s for a file read
 * const content = await withTimeout(
 *   readFile('/path/to/transcript.jsonl', 'utf8'),
 *   3_000,
 *   'claude-transcript-read'
 * );
 * ```
 *
 * @functions
 *   → withTimeout
 *   → DEFAULT_TIMEOUTS
 * @exports DEFAULT_TIMEOUTS, withTimeout
 * @see ./errors.ts (TimeoutError)
 * @see ./graceful-shutdown.ts
 */

import { TimeoutError } from './errors.js';
import { logger } from './engine/logger.js';

/**
 * Named timeout windows for common AISnitch operations.
 *
 * These defaults are conservative but reasonable for local development:
 * - File operations: fast on local SSDs, need headroom for larger logs
 * - HTTP requests: generous (30s) because AI tool hooks can be slow
 * - Process detection: frequent polling, keep each poll short
 * - Adapter lifecycle: moderate (10s) for graceful shutdowns
 *
 * Override per-call via the `withTimeout()` `timeoutMs` parameter.
 */
export const DEFAULT_TIMEOUTS = Object.freeze({
  /**
   * File read/write operations (JSONL transcripts, config files).
   * Default: 5 seconds
   */
  fileOperation: 5_000,

  /**
   * HTTP requests to health endpoint or external APIs.
   * Default: 30 seconds
   */
  httpRequest: 30_000,

  /**
   * Process detection commands (`pgrep`, `ps aux`).
   * Default: 3 seconds
   */
  processDetection: 3_000,

  /**
   * Adapter startup (file watchers, hook bridges, pollers).
   * Default: 10 seconds
   */
  adapterStartup: 10_000,

  /**
   * Adapter shutdown (graceful cleanup, watcher close).
   * Default: 5 seconds — after this, resources are force-closed
   */
  adapterShutdown: 5_000,

  /**
   * Daemon graceful shutdown (stop all components in order).
   * Default: 30 seconds
   */
  daemonShutdown: 30_000,

  /**
   * WebSocket connection establishment.
   * Default: 10 seconds
   */
  wsConnection: 10_000,

  /**
   * Overall pipeline start (all components).
   * Default: 15 seconds
   */
  pipelineStartup: 15_000,
} as const);

/**
 * Type representing the keys of `DEFAULT_TIMEOUTS`.
 */
export type TimeoutName = keyof typeof DEFAULT_TIMEOUTS;

/**
 * Races a promise against a deadline.
 *
 * If the promise resolves first, returns the resolved value.
 * If the timeout fires first, throws a `TimeoutError`.
 *
 * The timeout is implemented via `Promise.race()` so it does not
 * forcefully abort the underlying promise — the promise continues
 * running in the background. For truly cancellable operations,
 * consider `AbortController` in addition to this utility.
 *
 * @example
 * ```typescript
 * try {
 *   const result = await withTimeout(
 *     fetch('http://example.com/slow-endpoint'),
 *     5_000,
 *     'external-api-call'
 *   );
 *   return await result.json();
 * } catch (error) {
 *   if (error instanceof TimeoutError) {
 *     logger.warn({ context: error.context }, 'Operation timed out');
 *     return null;
 *   }
 *   throw error;
 * }
 * ```
 *
 * @param promise - The async operation to race
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @param context - Human-readable label for logging and error context
 * @returns The resolved value if `promise` wins the race
 * @throws TimeoutError if the timeout fires first
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  context: string,
): Promise<T> {
  if (timeoutMs <= 0) {
    // Immediately reject invalid timeouts rather than silently hanging
    throw new TimeoutError(
      `Invalid timeout value: ${timeoutMs}ms (must be > 0)`,
      'TIMEOUT_INVALID_VALUE',
      { context, timeoutMs },
    );
  }

  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(
          new TimeoutError(
            `Operation exceeded ${timeoutMs}ms deadline`,
            'TIMEOUT_EXCEEDED',
            { context, timeoutMs },
          ),
        );
      }, timeoutMs);

      // Allow the timeout to be garbage-collected if the promise resolves
      timeoutId.unref();
    }),
  ]);
}

/**
 * Wraps a promise with a timeout and logs a warning if it times out.
 * Unlike `withTimeout()`, this never throws — it falls through to the
 * original promise's result (or error) if the timeout fires first.
 *
 * Best-effort: useful for non-critical background operations where a
 * timeout should log a warning but not crash the flow.
 *
 * @example
 * ```typescript
 * // Log a warning but don't fail if process detection hangs
 * await timeoutWarning(
 *   listProcesses(processListCommand),
 *   DEFAULT_TIMEOUTS.processDetection,
 *   'claude-process-detection'
 * );
 * ```
 */
export async function timeoutWarning<T>(
  promise: Promise<T>,
  timeoutMs: number,
  context: string,
): Promise<T> {
  try {
    return await withTimeout(promise, timeoutMs, context);
  } catch (error) {
    if (error instanceof TimeoutError) {
      logger.warn(
        { context: error.context, timeoutMs: error.context },
        `Best-effort operation timed out after ${timeoutMs}ms`,
      );
      // Fall through: the original promise may still resolve (fire-and-forget)
      // Return a rejected promise so the caller can handle it if needed
      return await promise;
    }

    throw error;
  }
}

/**
 * Gets the timeout value for a named operation.
 *
 * @example
 * ```typescript
 * const timeoutMs = getTimeout('adapterShutdown');
 * // → 5_000
 * ```
 */
export function getTimeout(name: TimeoutName): number {
  return DEFAULT_TIMEOUTS[name];
}

/**
 * Checks whether an error is a TimeoutError.
 * Shorthand for `error instanceof TimeoutError` with explicit return type.
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}
