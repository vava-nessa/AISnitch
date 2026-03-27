/**
 * @file src/index.ts
 * @description Public entrypoint for the AISnitch package scaffold.
 * @functions
 *   → getPackageScaffoldInfo
 * @exports AISNITCH_PACKAGE_NAME, AISNITCH_DESCRIPTION, AISnitchScaffoldInfo, getPackageScaffoldInfo
 * @see ./core/index.ts
 * @see ./cli/index.ts
 */

export * from './adapters/index.js';
export * from './core/index.js';
export * from './tui/index.js';

/**
 * 📖 This constant keeps the published package identity in one place so the
 * CLI and future docs can reuse a single source of truth.
 */
export const AISNITCH_PACKAGE_NAME = 'aisnitch';

/**
 * 📖 This description matches the npm metadata and is reused by the placeholder
 * CLI so the initial scaffold already behaves consistently.
 */
export const AISNITCH_DESCRIPTION =
  'Universal bridge for AI coding tool activity — capture, normalize, stream.';

/**
 * Represents the stable scaffold metadata exposed by the package root.
 */
export interface AISnitchScaffoldInfo {
  readonly name: string;
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
    description: AISNITCH_DESCRIPTION,
    supportedNodeRange: '>=20.0.0',
  };
}
