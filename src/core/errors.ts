/**
 * @file src/core/errors.ts
 * @description Centralized error hierarchy for AISnitch with typed error codes and context.
 *
 * This module provides a consistent error taxonomy across the entire application:
 * - `AISnitchError` — base class for all AISnitch-specific errors
 * - `AdapterError` — adapter lifecycle, parsing, or emission failures
 * - `PipelineError` — pipeline orchestration, component startup, or shutdown failures
 * - `ValidationError` — Zod parsing failures and schema violations
 * - `NetworkError` — HTTP, WebSocket, or Unix Domain Socket failures
 * - `TimeoutError` — async operations that exceed their deadline
 *
 * Each error carries a machine-readable `code` field for programmatic handling
 * and an optional `context` bag for debugging. Errors serialize cleanly to JSON
 * so they can be logged via pino without losing structure.
 *
 * @functions
 *   → none
 * @exports AISnitchError, AdapterError, PipelineError, ValidationError, NetworkError, TimeoutError, isAISnitchError, isRetryableError
 * @see ./result.ts
 * @see ./retry.ts
 * @see ./timeout.ts
 */

/**
 * Base class for all AISnitch-specific errors.
 *
 * @example
 * ```typescript
 * throw new AISnitchError(
 *   'Event validation failed',
 *   'EVENT_VALIDATION_ERROR',
 *   { eventId: event.id, issues: parseResult.error.issues }
 * );
 * ```
 */
export class AISnitchError extends Error {
  /**
   * Machine-readable error code for programmatic handling.
   * Format: `SUBCATEGORY_SPECIFIC_DETAIL` (uppercase with underscores).
   */
  public readonly code: string;

  /**
   * Arbitrary context bag forwarded to the logger for structured debugging.
   */
  public readonly context?: Readonly<Record<string, unknown>>;

  public constructor(
    message: string,
    code: string,
    context?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'AISnitchError';
    this.code = code;
    this.context = context;

    // Maintains proper stack trace in V8 engines (Node.js, Chrome, Edge)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AISnitchError);
    }
  }

  /**
   * Full error chain for logging: `[name] code — message`.
   */
  public override toString(): string {
    return `${this.name} [${this.code}] — ${this.message}`;
  }

  /**
   * JSON serialization friendly to pino serializers.
   */
  public toJSON(): object {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Errors originating from adapter lifecycle, payload parsing, or event emission.
 *
 * @example
 * ```typescript
 * throw new AdapterError(
 *   'Claude Code transcript read failed',
 *   'ADAPTER_CLAUDE_CODE_FILE_ERROR',
 *   { filePath: transcriptPath, cause: error }
 * );
 * ```
 */
export class AdapterError extends AISnitchError {
  public constructor(
    message: string,
    code: string,
    context?: Readonly<Record<string, unknown>>,
  ) {
    super(message, code, context);
    this.name = 'AdapterError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AdapterError);
    }
  }

  /**
   * Factory for adapter-specific errors with auto-generated codes.
   */
  public static withAutoCode(
    message: string,
    tool: string,
    context?: Readonly<Record<string, unknown>>,
  ): AdapterError {
    const sanitizedTool = tool.replace(/[^a-z0-9]/gi, '_').toUpperCase();
    const code = `ADAPTER_${sanitizedTool}_ERROR`;

    return new AdapterError(message, code, { tool, ...context });
  }
}

/**
 * Errors originating from pipeline orchestration, component startup, or shutdown.
 *
 * @example
 * ```typescript
 * throw new PipelineError(
 *   'Failed to start WebSocket server',
 *   'PIPELINE_WS_START_FAILED',
 *   { port: configuredPort, cause: error }
 * );
 * ```
 */
export class PipelineError extends AISnitchError {
  public constructor(
    message: string,
    code: string,
    context?: Readonly<Record<string, unknown>>,
  ) {
    super(message, code, context);
    this.name = 'PipelineError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PipelineError);
    }
  }
}

/**
 * Errors from Zod schema parsing failures and data validation violations.
 *
 * @example
 * ```typescript
 * const result = EventDataSchema.safeParse(rawPayload);
 * if (!result.success) {
 *   throw new ValidationError(
 *     'Invalid event data payload',
 *     'VALIDATION_EVENT_DATA_INVALID',
 *     { issues: result.error.issues }
 *   );
 * }
 * ```
 */
export class ValidationError extends AISnitchError {
  public constructor(
    message: string,
    code: string,
    context?: Readonly<Record<string, unknown>>,
  ) {
    super(message, code, context);
    this.name = 'ValidationError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }
}

/**
 * Errors from network operations: HTTP requests, WebSocket connections, UDS.
 *
 * @example
 * ```typescript
 * throw new NetworkError(
 *   'Health endpoint unreachable',
 *   'NETWORK_HTTP_CONNECT_FAILED',
 *   { host: '127.0.0.1', port: 4821, cause: error }
 * );
 * ```
 */
export class NetworkError extends AISnitchError {
  public constructor(
    message: string,
    code: string,
    context?: Readonly<Record<string, unknown>>,
  ) {
    super(message, code, context);
    this.name = 'NetworkError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NetworkError);
    }
  }
}

/**
 * Errors from async operations that exceed their configured deadline.
 *
 * @example
 * ```typescript
 * throw new TimeoutError(
 *   'Adapter stop timed out after 5 seconds',
 *   'TIMEOUT_SHUTDOWN',
 *   { component: 'ClaudeCodeAdapter', timeoutMs: 5_000 }
 * );
 * ```
 */
export class TimeoutError extends AISnitchError {
  public constructor(
    message: string,
    code: string,
    context?: Readonly<Record<string, unknown>>,
  ) {
    super(message, code, context);
    this.name = 'TimeoutError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TimeoutError);
    }
  }
}

/**
 * Type guard to narrow any `unknown` error to an AISnitch error.
 *
 * @example
 * ```typescript
 * } catch (error: unknown) {
 *   if (isAISnitchError(error)) {
 *     console.error(`AISnitch error ${error.code}: ${error.message}`);
 *   } else {
 *     console.error('Unexpected error', error);
 *   }
 * }
 * ```
 */
export function isAISnitchError(error: unknown): error is AISnitchError {
  return error instanceof AISnitchError;
}

/**
 * Determines whether an error is safe to retry (transient vs. permanent).
 *
 * Returns `true` for network timeouts, connection reset, and rate-limit errors.
 * Returns `false` for validation errors, authentication failures, and programming bugs.
 *
 * @example
 * ```typescript
 * try {
 *   return await operation();
 * } catch (error: unknown) {
 *   if (isRetryableError(error)) {
 *     throw error; // let retry logic handle it
 *   }
 *   throw error; // propagate as-is (non-retryable)
 * }
 * ```
 */
export function isRetryableError(error: unknown): boolean {
  if (!isAISnitchError(error)) {
    // Native JS errors: network failures, ECONNREFUSED, ETIMEDOUT are retryable
    if (error instanceof Error) {
      const code = (error as NodeJS.ErrnoException).code;
      const retryableCodes = new Set([
        'ECONNREFUSED',
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND',
        'EHOSTUNREACH',
        'EPIPE',
        'EPERM', // sometimes transient on macOS file locks
      ]);

      if (typeof code === 'string' && retryableCodes.has(code)) {
        return true;
      }
    }

    return false;
  }

  // AISnitch errors: timeout and network errors are retryable
  const retryableCategories = new Set(['TIMEOUT', 'NETWORK']);

  for (const category of retryableCategories) {
    if (error.code.startsWith(category)) {
      return true;
    }
  }

  // Adapter errors with specific patterns
  const retryablePatterns = [
    /^ADAPTER_.*_(FILE_IO|NETWORK|PROCESS_DETECT)_ERROR$/,
    /^PIPELINE_.*_(RETRY|RECONNECT)_ERROR$/,
  ];

  for (const pattern of retryablePatterns) {
    if (pattern.test(error.code)) {
      return true;
    }
  }

  return false;
}
