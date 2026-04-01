import { readFileSync } from 'node:fs';

import { defineConfig } from 'vitest/config';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

/**
 * @file vitest.config.ts
 * @description Shared Vitest configuration for AISnitch unit and integration coverage running in the Node environment.
 * @functions
 *   → none
 * @exports default Vitest config
 * @see ./vitest.e2e.config.ts
 */

export default defineConfig({
  define: {
    // 📖 Mirror of tsup define — keeps AISNITCH_VERSION correct during vitest runs
    __AISNITCH_VERSION__: JSON.stringify(version),
  },
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
