/**
 * @file src/core/graceful-shutdown.ts
 * @description Graceful shutdown coordination to prevent orphaned resources and partial state.
 *
 * Graceful shutdown is critical for a long-running daemon like AISnitch:
 * - **No orphaned servers**: HTTP/WebSocket/UDS servers must be closed cleanly
 * - **No resource leaks**: file watchers, pollers, timers must be stopped
 * - **Clean PID files**: stale PID files confuse subsequent launches
 * - **Clean state files**: daemon-state.json must be removed on exit
 *
 * This module provides:
 * - `withShutdownTimeout()` — wrap a shutdown function with a deadline
 * - `shutdownInOrder()` — stop components in reverse dependency order
 * - `GracefulShutdownManager` — coordinates all shutdown signals (SIGTERM, SIGINT, SIGHUP)
 *
 * ## Shutdown order for AISnitch pipeline
 *
 * ```
 * 1. adapters.stopAll()       — stop watching files, kill pollers, close watchers
 * 2. httpReceiver.stop()      — close HTTP server
 * 3. udsServer.stop()         — close Unix Domain Socket
 * 4. wsServer.stop()          — close WebSocket server (consumers get disconnected)
 * 5. eventBus.unsubscribeAll() — remove all listeners
 * 6. cleanup PID/state files  — prevent stale state on next launch
 * ```
 *
 * @functions
 *   → withShutdownTimeout
 *   → shutdownInOrder
 * @exports GracefulShutdownManager, ShutdownComponents, withShutdownTimeout, shutdownInOrder
 * @see ./errors.ts (TimeoutError)
 * @see ./timeout.ts (DEFAULT_TIMEOUTS)
 * @see ../cli/runtime.ts (shutdown orchestration)
 */

import { isTimeoutError, withTimeout } from './timeout.js';
import { logger } from './engine/logger.js';
import { DEFAULT_TIMEOUTS } from './timeout.js';

/**
 * All AISnitch components that participate in graceful shutdown.
 * Stopped in reverse dependency order (last-started = first-stopped).
 */
export interface ShutdownComponents {
  readonly adapterRegistry?: {
    stopAll: () => Promise<void>;
  };
  readonly httpReceiver?: {
    stop: () => Promise<void>;
  };
  readonly udsServer?: {
    stop: () => Promise<void>;
  };
  readonly wsServer?: {
    stop: () => Promise<void>;
  };
  readonly eventBus?: {
    unsubscribeAll: () => void;
  };
  readonly cleanupFns?: ReadonlyArray<() => Promise<void> | void>;
}

/**
 * Wraps an async shutdown operation with a deadline.
 *
 * If the shutdown completes within `timeoutMs`, returns normally.
 * If the timeout fires first, logs a warning and continues (forces through).
 *
 * This ensures that a misbehaving component can never indefinitely block
 * daemon shutdown and leave the system in a half-dead state.
 *
 * @example
 * ```typescript
 * await withShutdownTimeout(
 *   () => adapter.stop(),
 *   DEFAULT_TIMEOUTS.adapterShutdown,
 *   'ClaudeCodeAdapter'
 * );
 * ```
 *
 * @param fn - Async shutdown function to execute
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @param component - Human-readable name for logging
 */
export async function withShutdownTimeout(
  fn: () => Promise<void>,
  timeoutMs: number,
  component: string,
): Promise<void> {
  if (timeoutMs <= 0) {
    // Execute without timeout if 0 or negative is passed (tests, forced shutdown)
    await fn();
    return;
  }

  const timeoutPromise = new Promise<'timed_out' | 'completed'>((resolve) => {
    setTimeout(() => {
      resolve('timed_out');
    }, timeoutMs).unref();
  });

  const result = await Promise.race([
    fn().then(() => 'completed' as const),
    timeoutPromise,
  ]);

  if (result === 'timed_out') {
    logger.warn(
      { component, timeoutMs },
      `Graceful shutdown exceeded ${timeoutMs}ms timeout — forcing through`,
    );
  }
}

/**
 * Stops AISnitch components in safe reverse-dependency order with individual timeouts.
 *
 * ## Why reverse order?
 *
 * The pipeline starts: adapters → HTTP → UDS → WS → eventBus
 * If we stop WS before HTTP, new connections keep arriving at HTTP.
 * If we stop eventBus before WS, consumers get events from the bus but can't send them.
 * Therefore, stop in reverse: eventBus → WS → UDS → HTTP → adapters.
 *
 * @example
 * ```typescript
 * await shutdownInOrder(
 *   {
 *     eventBus: pipeline.getEventBus(),
 *     wsServer: pipeline.getWSServer(),
 *     httpReceiver: pipeline.getHTTPReceiver(),
 *     udsServer: pipeline.getUDSServer(),
 *     adapterRegistry: pipeline.getAdapterRegistry(),
 *     cleanupFns: [
 *       () => removePid(pathOptions),
 *       () => removeDaemonState(pathOptions),
 *     ],
 *   },
 *   {
 *     eventBus: 1_000,
 *     wsServer: 3_000,
 *     httpReceiver: 2_000,
 *     udsServer: 2_000,
 *     adapterRegistry: 5_000,
 *   },
 *   'AISnitch pipeline'
 * );
 * ```
 *
 * @param components - Components to shut down
 * @param timeouts - Per-component timeout in milliseconds
 * @param label - Human-readable label for logging
 */
export async function shutdownInOrder(
  components: ShutdownComponents,
  timeouts: Partial<Record<keyof ShutdownComponents, number>>,
  label: string,
): Promise<void> {
  const getTimeout = (key: keyof ShutdownComponents): number => {
    return timeouts[key] ?? DEFAULT_TIMEOUTS.daemonShutdown;
  };

  const stopSafely = async (
    key: keyof ShutdownComponents,
    fn: () => Promise<void>,
  ): Promise<void> => {
    const timeoutMs = getTimeout(key);

    try {
      await withShutdownTimeout(fn, timeoutMs, `${label}.${key}`);
    } catch (error) {
      // Log but never re-throw — one broken component must not abort the rest
      logger.warn(
        { error, key, label },
        `Error during shutdown of ${key} — continuing with remaining components`,
      );
    }
  };

  // Shutdown in reverse dependency order
  if (components.cleanupFns) {
    for (const cleanupFn of components.cleanupFns) {
      try {
        await withShutdownTimeout(
          async () => {
            const result = cleanupFn();
            if (result instanceof Promise) {
              await result;
            }
          },
          1_000,
          `${label}.cleanup`,
        );
      } catch (error) {
        logger.warn({ error, label }, 'Cleanup function failed');
      }
    }
  }

  if (components.eventBus) {
    components.eventBus.unsubscribeAll();
  }

  await stopSafely('wsServer', () => components.wsServer!.stop());

  await stopSafely('udsServer', () => components.udsServer!.stop());

  await stopSafely('httpReceiver', () => components.httpReceiver!.stop());

  if (components.adapterRegistry) {
    await stopSafely('adapterRegistry', () => components.adapterRegistry!.stopAll());
  }
}

/**
 * Coordinates all shutdown signals (SIGTERM, SIGINT, SIGHUP) for a process.
 *
 * ## Why a manager class?
 *
 * - Multiple signals can arrive in quick succession (e.g., SIGTERM then SIGINT)
 * - Handlers must be idempotent (second call does nothing)
 * - The manager tracks whether shutdown is already in progress
 * - It ensures the main process exits with the correct exit code
 *
 * @example
 * ```typescript
 * const manager = new GracefulShutdownManager({
 *   onShutdown: async (signal) => {
 *     await shutdownInOrder(pipeline, timeouts, 'pipeline');
 *     await cleanupFiles(pathOptions);
 *   },
 *   signal: 'SIGTERM',
 * });
 *
 * process.on('SIGTERM', manager.handler);
 * process.on('SIGINT', manager.handler);
 *
 * // Call handler manually to trigger shutdown from anywhere
 * await manager.shutdown('manual-trigger');
 * ```
 */
export class GracefulShutdownManager {
  private shuttingDown = false;

  private readonly pendingHandlers = new Set<() => void>();

  /**
   * Creates a new shutdown manager.
   *
   * @param options - Configuration options
   * @param options.onShutdown - Async function called when shutdown is triggered
   * @param options.exitCode - Exit code to use (default: 0 for graceful, 1 for errors)
   * @param options.exitDelayMs - Delay before `process.exit()` (default: 100ms for flush)
   */
  public constructor(
    private readonly options: {
      readonly onShutdown: (signal: string) => Promise<void>;
      readonly exitCode?: number;
      readonly exitDelayMs?: number;
    },
  ) {}

  /**
   * Synchronous handler function suitable for `process.on()`.
   *
   * Multiple calls are safe — only the first call executes `onShutdown`.
   * Subsequent calls queue to the internal pending set and run after the
   * first shutdown completes.
   */
  public get handler(): (signal: string) => void {
    return (signal: string) => {
      if (!this.shuttingDown) {
        this.shuttingDown = true;
        void this.runShutdown(signal);
      } else {
        // Queue additional signals to run after current shutdown finishes
        this.pendingHandlers.add(() => {
          void this.runShutdown(signal);
        });
      }
    };
  }

  /**
   * Manually triggers shutdown from async code (e.g., TUI quit button).
   *
   * @param signal - Signal name (for logging)
   */
  public shutdown(signal = 'manual'): void {
    this.handler(signal);
  }

  /**
   * Returns whether shutdown is currently in progress.
   */
  public isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  private async runShutdown(signal: string): Promise<void> {
    const exitCode = this.options.exitCode ?? (signal === 'uncaughtException' || signal === 'unhandledRejection' ? 1 : 0);
    const exitDelayMs = this.options.exitDelayMs ?? 100;

    try {
      await this.options.onShutdown(signal);
    } catch (error) {
      logger.error(
        { error, signal },
        'Error during graceful shutdown — forcing exit',
      );
    } finally {
      // Allow buffered logs to flush before exiting
      await new Promise<void>((resolve) => {
        setTimeout(resolve, exitDelayMs).unref();
      });

      // Run any pending handlers from queued signals before we exit
      for (const pendingHandler of this.pendingHandlers) {
        pendingHandler();
      }

      process.exit(exitCode);
    }
  }
}

/**
 * Wraps a shutdown promise with an overall deadline.
 * If the overall shutdown exceeds the deadline, forces the process to exit.
 *
 * This is the last resort: no shutdown operation should ever take this long,
 * but a runaway deadlock could theoretically block forever without it.
 *
 * @example
 * ```typescript
 * const shutdownComplete = shutdownInOrder(components, timeouts, 'pipeline');
 * await withOverallShutdownTimeout(shutdownComplete, DEFAULT_TIMEOUTS.daemonShutdown, 'AISnitch');
 * ```
 */
export async function withOverallShutdownTimeout(
  shutdownPromise: Promise<void>,
  timeoutMs: number,
  label: string,
): Promise<void> {
  try {
    await withTimeout(shutdownPromise, timeoutMs, `${label}-overall-shutdown`);
  } catch (error) {
    if (isTimeoutError(error)) {
      logger.error(
        { timeoutMs, label },
        `Overall shutdown timeout exceeded — forcing process exit`,
      );
    }

    // Always exit after an overall timeout, regardless of error
    process.exit(1);
  }
}
