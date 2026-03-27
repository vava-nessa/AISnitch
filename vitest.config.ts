import { defineConfig } from 'vitest/config';

/**
 * @file vitest.config.ts
 * @description Shared Vitest configuration for AISnitch unit and integration coverage running in the Node environment.
 * @functions
 *   → none
 * @exports default Vitest config
 * @see ./vitest.e2e.config.ts
 */

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        'dist/**',
        'src/__e2e__/**',
        'src/**/__tests__/**',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/test-utils/**',
      ],
      include: ['src/**/*.{ts,tsx}'],
      provider: 'v8',
      reporter: ['text', 'html'],
    },
    environment: 'node',
    exclude: ['src/__e2e__/**'],
    globals: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test-utils/setup.ts'],
  },
});
