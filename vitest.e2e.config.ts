import { defineConfig } from 'vitest/config';

/**
 * @file vitest.e2e.config.ts
 * @description Dedicated Vitest configuration for long-running AISnitch smoke tests that exercise a real external tool.
 * @functions
 *   → none
 * @exports default Vitest config
 * @see ./vitest.config.ts
 */

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    hookTimeout: 60_000,
    include: ['src/__e2e__/**/*.test.ts'],
    setupFiles: ['./src/test-utils/setup.ts'],
    testTimeout: 60_000,
  },
});
