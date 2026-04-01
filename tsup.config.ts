import { readFileSync } from 'node:fs';

import { defineConfig } from 'tsup';

/**
 * @file tsup.config.ts
 * @description Build configuration for the AISnitch main package.
 * @functions
 *   → default
 * @exports default
 *
 * 📖 We read the version from package.json here and inject it as a build-time
 * constant (__AISNITCH_VERSION__) via esbuild's define mechanism. This means
 * src/package-info.ts never needs to be edited manually — bumping package.json
 * is the only step required.
 */

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

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
  define: {
    // 📖 Injected at build time — consumed by src/package-info.ts
    __AISNITCH_VERSION__: JSON.stringify(version),
  },
});
