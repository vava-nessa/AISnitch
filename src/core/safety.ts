/**
 * @file src/core/safety.ts
 * @description Type-safe extraction helpers for working with untyped record data.
 *
 * AISnitch often deals with loosely-typed payloads:
 * - Hook payloads from third-party tools (Claude Code, OpenCode, etc.)
 * - JSONL transcript observations parsed from raw JSON
 * - Config files loaded from disk
 * - Event data fields that may be undefined
 *
 * This module provides:
 * - `getString()` / `getNumber()` / `getBoolean()` — safe extractors with type narrowing
 * - `getStringOrDefault()` / `getNumberOrDefault()` — with fallback defaults
 * - `getArray()` / `getObject()` — structural validation
 * - `getSafeInteger()` — integer with bounds checking
 * - `getPositiveNumber()` — positive values only
 * - `isValidPort()` — network port validation (1-65535)
 * - `isValidPathLength()` — POSIX path limit check (4096 chars)
 * - `isValidStringLength()` — max string length check
 *
 * ## Why not just use optional chaining?
 *
 * Optional chaining (`?.`) protects against null/undefined access chains, but it:
 * - Does NOT validate the type of the value (e.g., `obj.key` could be `string | number | null`)
 * - Does NOT enforce constraints (e.g., port range, string max length)
 * - Does NOT normalize values (e.g., trimming strings, clamping numbers)
 *
 * These helpers do all of the above in one call.
 *
 * @functions
 *   → getString
 *   → getNumber
 *   → getBoolean
 *   → getSafeInteger
 *   → getPositiveNumber
 *   → isValidPort
 *   → isValidPathLength
 *   → isValidStringLength
 *   → getArray
 *   → getObject
 * @exports getString, getNumber, getBoolean, getSafeInteger, getPositiveNumber, isValidPort, isValidPathLength, isValidStringLength, getArray, getObject
 * @see ./errors.ts
 * @see ./result.ts
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maximum valid TCP/UDP port number.
 * Ports below 1024 require root privileges on Unix.
 */
export const MAX_PORT = 65_535;

/**
 * Minimum valid TCP/UDP port number.
 */
export const MIN_PORT = 1;

/**
 * Maximum path length per POSIX (NAME_MAX).
 * Most filesystems support 255 bytes per path component, but the total path
 * can grow much longer. 4096 is a safe upper bound for in-memory validation.
 */
export const MAX_PATH_LENGTH = 4_096;

/**
 * Maximum string length for most AISnitch fields (file paths, model names, etc.).
 * Beyond this, truncation or rejection is safer than silent truncation.
 */
export const MAX_GENERIC_STRING_LENGTH = 10_000;

/**
 * Maximum length for short labels (tool names, session IDs, event types).
 * These should always be kept short for display.
 */
export const MAX_LABEL_LENGTH = 255;

// ─────────────────────────────────────────────────────────────────────────────
// String extractors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts a non-empty trimmed string from a record field.
 *
 * @example
 * ```typescript
 * const model = getString(payload, 'model');
 * // → 'claude-sonnet-4-20250514' | undefined
 * ```
 */
export function getString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Extracts a string and enforces a maximum length.
 * If the string exceeds `maxLength`, it is truncated to that length.
 *
 * @example
 * ```typescript
 * const truncated = getStringWithMaxLength(payload, 'errorMessage', 10_000);
 * ```
 */
export function getStringWithMaxLength(
  record: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | undefined {
  const value = getString(record, key);

  if (value === undefined) {
    return undefined;
  }

  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Number extractors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts a finite number from a record field.
 *
 * Filters out `NaN`, `Infinity`, `-Infinity`.
 *
 * @example
 * ```typescript
 * const pid = getNumber(payload, 'pid');
 * // → 12345 | undefined
 * ```
 */
export function getNumber(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

/**
 * Extracts a finite integer within a range.
 *
 * @example
 * ```typescript
 * const seqnum = getSafeInteger(payload, 'seqnum', { min: 1 });
 * // → 42 | undefined
 * ```
 */
export function getSafeInteger(
  record: Record<string, unknown>,
  key: string,
  options: { min?: number; max?: number } = {},
): number | undefined {
  const value = getNumber(record, key);

  if (value === undefined) {
    return undefined;
  }

  // Must be an integer (Math.floor === self for whole numbers)
  if (!Number.isInteger(value)) {
    return undefined;
  }

  if (options.min !== undefined && value < options.min) {
    return undefined;
  }

  if (options.max !== undefined && value > options.max) {
    return undefined;
  }

  return value;
}

/**
 * Extracts a positive number ( > 0).
 *
 * @example
 * ```typescript
 * const tokens = getPositiveNumber(payload, 'tokensUsed');
 * // → 1500 | undefined (rejects 0, negative)
 * ```
 */
export function getPositiveNumber(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = getNumber(record, key);

  return value !== undefined && value > 0 ? value : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Boolean extractor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts a boolean from a record field.
 *
 * Handles the common "stringified boolean" pattern where config files
 * or query parameters store booleans as strings ('true', 'false').
 *
 * @example
 * ```typescript
 * const enabled = getBoolean(record, 'enabled');
 * // → true | false | undefined
 * ```
 */
export function getBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = record[key];

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const lower = value.toLowerCase();

    if (lower === 'true' || lower === '1') {
      return true;
    }

    if (lower === 'false' || lower === '0') {
      return false;
    }
  }

  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Structural validators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts an array from a record field.
 *
 * @example
 * ```typescript
 * const parts = getArray(payload, 'content');
 * // → unknown[] | undefined
 * ```
 */
export function getArray<T = unknown>(
  record: Record<string, unknown>,
  key: string,
): T[] | undefined {
  const value = record[key];

  return Array.isArray(value) ? (value as T[]) : undefined;
}

/**
 * Extracts a plain object from a record field.
 *
 * Returns `undefined` for arrays, class instances, `null`, primitives.
 *
 * @example
 * ```typescript
 * const toolInput = getObject(payload, 'tool_input');
 * // → Record<string, unknown> | undefined
 * ```
 */
export function getObject(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = record[key];

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Common constraint validators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates whether a port number is within the valid TCP/UDP range (1-65535).
 *
 * @example
 * ```typescript
 * const port = getSafeInteger(payload, 'port', { min: 1, max: 65535 });
 * if (isValidPort(port)) {
 *   server.listen(port);
 * }
 * ```
 */
export function isValidPort(port: number | undefined): port is number {
  return (
    port !== undefined &&
    Number.isInteger(port) &&
    port >= MIN_PORT &&
    port <= MAX_PORT
  );
}

/**
 * Validates whether a path string is within the POSIX NAME_MAX limit.
 *
 * Uses the conservative 4096-character limit (actual NAME_MAX varies by FS).
 * This check is useful for in-memory validation before file system operations.
 *
 * @example
 * ```typescript
 * const filePath = getString(payload, 'filePath');
 * if (filePath && isValidPathLength(filePath)) {
 *   readFile(filePath);
 * }
 * ```
 */
export function isValidPathLength(path: string | undefined): path is string {
  return path !== undefined && path.length > 0 && path.length <= MAX_PATH_LENGTH;
}

/**
 * Validates whether a string does not exceed a maximum length.
 *
 * @example
 * ```typescript
 * const message = getString(payload, 'errorMessage');
 * if (message && isValidStringLength(message, 10_000)) {
 *   log(message);
 * }
 * ```
 */
export function isValidStringLength(
  value: string | undefined,
  maxLength: number,
): value is string {
  return value !== undefined && value.length <= maxLength;
}

// ─────────────────────────────────────────────────────────────────────────────
// Record predicate helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks whether a value is a plain object (not null, not array, not class instance).
 *
 * Uses `Object.prototype.toString` to detect class instances:
 * - Plain objects return `'[object Object]'`
 * - Class instances return `'[object ClassName]'`
 *
 * @example
 * ```typescript
 * if (isRecord(payload)) {
 *   const value = payload[key]; // TypeScript narrows to Record<string, unknown>
 * }
 * ```
 */
export function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  // Exclude class instances (Date, Map, Set, etc.)
  const proto = Object.prototype.toString.call(value);
  return proto === '[object Object]';
}

/**
 * Type guard to narrow any `unknown` to a non-null value.
 *
 * @example
 * ```typescript
 * const cleaned = value != null ? value : defaultValue;
 * // or using the guard:
 * if (isNotNull(value)) { ... }
 * ```
 */
export function isNotNull<T>(value: T): value is T & NonNullable<unknown> {
  return value != null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bounded value extractors (shortcuts for common patterns)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts a port number with full validation (in range, integer, finite).
 *
 * @example
 * ```typescript
 * const port = getPort(record, 'httpPort');
 * // → 4821 | undefined
 * ```
 */
export function getPort(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = getSafeInteger(record, key, { min: MIN_PORT, max: MAX_PORT });

  return value;
}

/**
 * Extracts a sequence number (positive integer >= 1).
 *
 * @example
 * ```typescript
 * const seqnum = getSeqnum(record, 'seqnum');
 * // → 42 | undefined
 * ```
 */
export function getSeqnum(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  return getSafeInteger(record, key, { min: 1 });
}
