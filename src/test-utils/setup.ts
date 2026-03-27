import { afterEach, vi } from 'vitest';

/**
 * @file src/test-utils/setup.ts
 * @description Global Vitest setup that keeps AISnitch tests deterministic and resets mocks between files.
 * @functions
 *   → none
 * @exports none
 */

process.env.TZ = 'UTC';

/**
 * 📖 Most AISnitch tests stub globals or environment variables. Reset them
 * centrally so one suite cannot leak state into another.
 */
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
