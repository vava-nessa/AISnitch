import { defineConfig } from 'tsup';

/**
 * @file tsup.config.ts
 * @description Build configuration for @aisnitch/client — dual ESM + CJS output with type declarations.
 * @exports default
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  // 📖 Platform 'neutral' allows the SDK to work in both Node.js and browser environments
  platform: 'neutral',
  target: 'es2022',
  splitting: false,
  shims: false,
  // 📖 zod is a peer dep — don't bundle it
  external: ['zod'],
});
