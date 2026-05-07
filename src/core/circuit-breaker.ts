/**
 * @file src/core/circuit-breaker.ts
 * @description Circuit breaker pattern implementation for resilient adapter operation.
 *
 * The circuit breaker prevents cascading failures when an adapter repeatedly fails:
 *
 * ```
 *  CLOSED (normal) ──[N failures]──→ OPEN (failing fast)
 *       ↑                              │
 *       │                         [half-open after timeout]
 *       │                              ↓
 *       └──────[success]──── HALF-OPEN (testing recovery)
 * ```
 *
 * When an adapter fails `threshold` times within `windowMs`, the breaker opens:
 * - Subsequent calls fail immediately with `CircuitOpenError` (no network round-trips)
 * - After `halfOpenAfterMs`, one test call is allowed to check recovery
 * - If it succeeds → close the circuit (back to normal operation)
 * - If it fails → reopen and wait again
 *
 * ## When to use this
 *
 * - Adapter `emit()` calls that can fail repeatedly (file system errors, hook timeouts)
 * - Network operations with unreliable backends
 * - Any operation where persistent failure is worse than temporary unavailability
 *
 * ## When NOT to use this
 *
 * - One-off errors that are unlikely to repeat
 * - Validation failures (these indicate a programming bug, not a transient fault)
 * - Operations that are already idempotent with built-in retry (prefer `withRetry`)
 *
 * @functions
 *   → none
 * @exports CircuitState, CircuitOpenError, CircuitBreaker
 * @see ./errors.ts
 * @see ./retry.ts
 * @see ./timeout.ts
 */

import { AISnitchError, isRetryableError } from './errors.js';
import { logger } from './engine/logger.js';

/**
 * Observable state of a circuit breaker.
 */
export interface CircuitState {
  /**
   * Number of consecutive failures since last success.
   */
  readonly failures: number;
  /**
   * Timestamp of the last failure (ms since epoch), or null if never failed.
   */
  readonly lastFailureAt: number | null;
  /**
   * Current state of the circuit.
   * - `closed`: Normal operation, requests pass through
   * - `open`: Failing fast, requests are rejected immediately
   * - `half-open`: Testing recovery, one request is allowed through
   */
  readonly state: 'closed' | 'open' | 'half-open';
}

/**
 * Error thrown when a circuit is open and the operation is rejected.
 */
export class CircuitOpenError extends AISnitchError {
  public constructor(
    public readonly circuitId: string,
    public readonly state: CircuitState,
  ) {
    super(
      `Circuit "${circuitId}" is OPEN — operation rejected`,
      'CIRCUIT_OPEN',
      { circuitId, failures: state.failures, lastFailureAt: state.lastFailureAt },
    );
    this.name = 'CircuitOpenError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CircuitOpenError);
    }
  }

  public override toString(): string {
    return `${this.name} [${this.code}] "${this.circuitId}" — failures=${this.state.failures}`;
  }
}

/**
 * Configuration for a circuit breaker instance.
 */
export interface CircuitBreakerOptions {
  /**
   * Number of consecutive failures before opening the circuit.
   * @default 5
   */
  readonly failureThreshold?: number;
  /**
   * Time window in milliseconds to count failures within.
   * @default 60_000 (1 minute)
   */
  readonly windowMs?: number;
  /**
   * Time to wait before transitioning from OPEN to HALF-OPEN.
   * @default 30_000 (30 seconds)
   */
  readonly halfOpenAfterMs?: number;
  /**
   * Human-readable identifier for this circuit (shown in logs).
   * @default 'unnamed'
   */
  readonly id?: string;
  /**
   * Optional predicate to decide which errors count toward the threshold.
   * Return `true` to count as a failure, `false` to ignore (success-like failure).
   * @default isRetryableError
   */
  readonly shouldCountAsFailure?: (error: unknown) => boolean;
  /**
   * Set to `true` to reset the failure counter after any success in CLOSED state.
   * Set to `false` to only reset after `failureThreshold` successes.
   * @default true
   */
  readonly resetOnSuccess?: boolean;
}

const DEFAULT_OPTIONS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  halfOpenAfterMs: 30_000,
  id: 'unnamed',
  resetOnSuccess: true,
  shouldCountAsFailure: isRetryableError,
  windowMs: 60_000,
};

/**
 * Circuit breaker state machine.
 *
 * ## State transitions
 *
 * ```
 * CLOSED ──[failure + threshold reached]──→ OPEN
 *   ▲                                      │
 *   │                                [halfOpenAfterMs elapsed]
 *   │                                      ↓
 *   │                                HALF-OPEN
 *   │                                      │
 *   │                         [test call succeeds]
 *   │                                      ↓
 *   └────────────[reset]───────────────────┘
 * ```
 *
 * ## Usage
 *
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   id: 'claude-code.emit',
 *   failureThreshold: 3,
 *   windowMs: 60_000,
 * });
 *
 * async function safeEmit(event: AISnitchEvent) {
 *   return breaker.execute(() => adapter.emit(event));
 * }
 * ```
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureAt: number | null = null;
  private state: CircuitState['state'] = 'closed';
  private halfOpenTestStartedAt: number | null = null;

  private readonly options: Required<CircuitBreakerOptions>;

  public constructor(options: CircuitBreakerOptions = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      // Re-spread to ensure all fields have defaults
      failureThreshold: options.failureThreshold ?? DEFAULT_OPTIONS.failureThreshold,
      halfOpenAfterMs: options.halfOpenAfterMs ?? DEFAULT_OPTIONS.halfOpenAfterMs,
      id: options.id ?? DEFAULT_OPTIONS.id,
      resetOnSuccess: options.resetOnSuccess ?? DEFAULT_OPTIONS.resetOnSuccess,
      shouldCountAsFailure: options.shouldCountAsFailure ?? DEFAULT_OPTIONS.shouldCountAsFailure,
      windowMs: options.windowMs ?? DEFAULT_OPTIONS.windowMs,
    };
  }

  /**
   * Executes an async operation through the circuit breaker.
   *
   * - If the circuit is CLOSED → runs `fn` and updates state based on result
   * - If the circuit is HALF-OPEN → runs `fn` once to test recovery
   * - If the circuit is OPEN → throws `CircuitOpenError` immediately (no call)
   *
   * @param fn - The async operation to protect
   * @returns The result of `fn` if successful
   * @throws CircuitOpenError if the circuit is OPEN
   * @throws The error from `fn` if it throws (and `shouldCountAsFailure` returns true)
   */
  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    switch (this.state) {
      case 'closed':
        return this.executeClosed(fn);
      case 'half-open':
        return this.executeHalfOpen(fn);
      case 'open':
        if (this.shouldTransitionToHalfOpen()) {
          this.transitionToHalfOpen();
          return this.executeHalfOpen(fn);
        }
        throw new CircuitOpenError(this.options.id, this.getState());
      // no default
    }
  }

  /**
   * Returns the current observable circuit state.
   */
  public getState(): CircuitState {
    return {
      failures: this.failures,
      lastFailureAt: this.lastFailureAt,
      state: this.state,
    };
  }

  /**
   * Forces the circuit to CLOSED (resets failure count and state).
   * Useful for manual recovery after a known-fix or after a maintenance window.
   */
  public reset(): void {
    this.failures = 0;
    this.lastFailureAt = null;
    this.state = 'closed';
    this.halfOpenTestStartedAt = null;

    logger.debug({ circuitId: this.options.id }, 'Circuit breaker manually reset');
  }

  /**
   * Pre-warms the circuit by performing one test call in HALF-OPEN state.
   * If the circuit is already HALF-OPEN, this does nothing.
   * If the circuit is CLOSED, this does nothing.
   */
  public async preWarm(fn: () => Promise<void>): Promise<void> {
    if (this.state !== 'open') {
      return;
    }

    this.transitionToHalfOpen();

    try {
      await fn();
      this.transitionToClosed();
    } catch {
      this.transitionToOpen();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private methods
  // ─────────────────────────────────────────────────────────────────────────

  private async executeClosed<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private async executeHalfOpen<T>(fn: () => Promise<T>): Promise<T> {
    this.halfOpenTestStartedAt = Date.now();

    try {
      const result = await fn();

      this.transitionToClosed();
      return result;
    } catch (error) {
      this.transitionToOpen();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.options.resetOnSuccess) {
      // Immediately reset failure count on any success
      this.failures = 0;
      this.lastFailureAt = null;
    } else {
      // Decrement counter but don't go below zero
      this.failures = Math.max(0, this.failures - 1);

      if (this.failures === 0) {
        this.lastFailureAt = null;
      }
    }

    logger.debug(
      {
        circuitId: this.options.id,
        failures: this.failures,
      },
      'Circuit breaker operation succeeded',
    );
  }

  private onFailure(error: unknown): void {
    if (!this.options.shouldCountAsFailure(error)) {
      // Error is not counted as a failure (e.g., validation error)
      logger.debug(
        { circuitId: this.options.id, error },
        'Circuit breaker operation failed but error is not counted as failure',
      );
      return;
    }

    this.failures += 1;
    this.lastFailureAt = Date.now();

    // Check if we've exceeded the threshold
    if (this.failures >= this.options.failureThreshold) {
      this.transitionToOpen();
    } else {
      logger.debug(
        {
          circuitId: this.options.id,
          failures: this.failures,
          threshold: this.options.failureThreshold,
        },
        'Circuit breaker recorded failure',
      );
    }
  }

  private transitionToOpen(): void {
    if (this.state === 'open') {
      return; // Already open, no transition needed
    }

    this.state = 'open';
    this.halfOpenTestStartedAt = null;

    logger.warn(
      {
        circuitId: this.options.id,
        failures: this.failures,
        windowMs: this.options.windowMs,
      },
      '🔴 Circuit breaker OPEN — blocking operations',
    );
  }

  private transitionToHalfOpen(): void {
    this.state = 'half-open';
    this.halfOpenTestStartedAt = Date.now();

    logger.info(
      { circuitId: this.options.id },
      '🟡 Circuit breaker HALF-OPEN — testing recovery',
    );
  }

  private transitionToClosed(): void {
    this.state = 'closed';
    this.failures = 0;
    this.lastFailureAt = null;
    this.halfOpenTestStartedAt = null;

    logger.info(
      { circuitId: this.options.id },
      '🟢 Circuit breaker CLOSED — recovery successful',
    );
  }

  private shouldTransitionToHalfOpen(): boolean {
    if (this.lastFailureAt === null) {
      // Never failed, should open immediately for testing
      return true;
    }

    const elapsed = Date.now() - this.lastFailureAt;
    return elapsed >= this.options.halfOpenAfterMs;
  }
}

/**
 * Shared circuit breaker instances for common AISnitch operations.
 * These are module-level singletons to avoid creating new breakers on every call.
 *
 * Usage:
 * ```typescript
 * import { SHARED_BREAKERS } from './circuit-breaker.js';
 *
 * // Wrap an adapter emit call
 * await SHARED_BREAKERS.adapterEmit.execute(() => adapter.emit(event));
 * ```
 */
export const SHARED_BREAKERS = Object.freeze({
  /**
   * Breaker for adapter event emission.
   * Threshold: 5 failures in 60s → open for 30s → half-open test.
   */
  adapterEmit: new CircuitBreaker({
    id: 'adapter.emit',
    failureThreshold: 5,
    halfOpenAfterMs: 30_000,
    shouldCountAsFailure: isRetryableError,
    windowMs: 60_000,
  }),

  /**
   * Breaker for file system operations (transcript reading, config loading).
   * More tolerant: 10 failures in 60s → open for 30s.
   */
  fileSystem: new CircuitBreaker({
    id: 'filesystem',
    failureThreshold: 10,
    halfOpenAfterMs: 30_000,
    windowMs: 60_000,
  }),

  /**
   * Breaker for HTTP/HTTPS requests.
   * Stricter: 3 failures in 30s → open for 15s.
   */
  httpRequest: new CircuitBreaker({
    id: 'http-request',
    failureThreshold: 3,
    halfOpenAfterMs: 15_000,
    windowMs: 30_000,
  }),

  /**
   * Breaker for process detection operations.
   * Most tolerant: 20 failures in 60s → open for 10s.
   */
  processDetection: new CircuitBreaker({
    id: 'process-detection',
    failureThreshold: 20,
    halfOpenAfterMs: 10_000,
    windowMs: 60_000,
  }),
});
