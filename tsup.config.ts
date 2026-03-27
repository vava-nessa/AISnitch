import { defineConfig } from 'tsup';

/**
 * @file tsup.config.ts
 * @description Build configuration for the initial AISnitch single-package scaffold.
 * @functions
 *   → default
 * @exports default
 */
export default defineConfig({
  entry: ['src/index.ts', 'src/cli/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  platform: 'node',
  target: 'node20',
  splitting: false,
  shims: false,
});
