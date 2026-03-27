import pino from 'pino';

/**
 * @file src/core/engine/logger.ts
 * @description Shared structured logger for the in-memory AISnitch runtime.
 * @functions
 *   → setLoggerLevel
 * @exports AISnitchLoggerLevel, logger, setLoggerLevel
 */

/**
 * Supported logger levels for internal runtime usage.
 */
export type AISnitchLoggerLevel =
  | 'debug'
  | 'info'
  | 'warn'
  | 'error'
  | 'silent';

/**
 * 📖 The logger writes to stdout only. The project is memory-only for runtime
 * data, so logging to files here would quietly violate that design.
 */
export const logger = pino({
  name: 'aisnitch',
  level: 'info',
  base: {
    service: 'aisnitch',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Updates the shared logger level at runtime.
 */
export function setLoggerLevel(level: AISnitchLoggerLevel): void {
  logger.level = level;
}
