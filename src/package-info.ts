/**
 * @file src/package-info.ts
 * @description Shared package metadata constants consumed by the public index, CLI, and TUI without creating import cycles.
 * @functions
 *   → getPackageScaffoldInfo
 * @exports AISNITCH_PACKAGE_NAME, AISNITCH_VERSION, AISNITCH_DESCRIPTION, AISnitchScaffoldInfo, getPackageScaffoldInfo
 * @see ./index.ts
 * @see ./cli/program.ts
 * @see ./tui/index.tsx
 */

/**
 * 📖 This constant keeps the published package identity in one place so the
 * CLI and TUI can reuse a single source of truth without reaching through the
 * package root export barrel.
 */
export const AISNITCH_PACKAGE_NAME = 'aisnitch';

/**
 * 📖 Injected at build time by tsup (and at test time by vitest) from package.json
 * via the __AISNITCH_VERSION__ define constant — never edit this manually.
 * Bumping package.json is the only step required to update the displayed version.
 */
declare const __AISNITCH_VERSION__: string;
export const AISNITCH_VERSION: string = __AISNITCH_VERSION__;

/**
 * 📖 The shared description stays close to the package identity so commander
 * help output and future docs surfaces stay aligned.
 */
export const AISNITCH_DESCRIPTION =
  'Universal bridge for AI coding tool activity — capture, normalize, stream.';

/**
 * Represents the stable scaffold metadata exposed by the package root.
 */
export interface AISnitchScaffoldInfo {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly supportedNodeRange: string;
}

/**
 * Builds a small metadata snapshot that other modules can consume without
 * reading package.json at runtime.
 */
export function getPackageScaffoldInfo(): AISnitchScaffoldInfo {
  return {
    name: AISNITCH_PACKAGE_NAME,
    version: AISNITCH_VERSION,
    description: AISNITCH_DESCRIPTION,
    supportedNodeRange: '>=20.0.0',
  };
}
