import { describe, expect, it } from 'vitest';

import {
  compareSemanticVersions,
  detectInstallManager,
} from '../auto-update.js';

/**
 * @file src/cli/__tests__/auto-update.test.ts
 * @description Focused coverage for silent self-update version comparison and install-manager detection heuristics.
 * @functions
 *   → none
 * @exports none
 * @see ../auto-update.ts
 */

describe('auto-update helpers', () => {
  it('compares semantic versions correctly', () => {
    expect(compareSemanticVersions('0.1.0', '0.1.0')).toBe(0);
    expect(compareSemanticVersions('0.2.0', '0.1.9')).toBe(1);
    expect(compareSemanticVersions('1.0.0', '1.0.1')).toBe(-1);
  });

  it('detects npm global installs from node_modules paths', async () => {
    await expect(
      detectInstallManager({
        cliEntryPath: '/opt/homebrew/lib/node_modules/aisnitch/dist/cli/index.js',
        configuredManager: 'auto',
      }),
    ).resolves.toBe('npm');
  });

  it('detects pnpm installs from pnpm store paths', async () => {
    await expect(
      detectInstallManager({
        cliEntryPath:
          '/Users/test/Library/pnpm/global/5/node_modules/.pnpm/aisnitch@0.1.0/node_modules/aisnitch/dist/cli/index.js',
        configuredManager: 'auto',
      }),
    ).resolves.toBe('pnpm');
  });

  it('detects bun installs from bun global paths', async () => {
    await expect(
      detectInstallManager({
        cliEntryPath:
          '/Users/test/.bun/install/global/node_modules/aisnitch/dist/cli/index.js',
        configuredManager: 'auto',
      }),
    ).resolves.toBe('bun');
  });

  it('detects brew installs from Cellar paths', async () => {
    await expect(
      detectInstallManager({
        cliEntryPath:
          '/opt/homebrew/Cellar/aisnitch/0.1.0/libexec/lib/node_modules/aisnitch/dist/cli/index.js',
        configuredManager: 'auto',
      }),
    ).resolves.toBe('brew');
  });

  it('respects an explicit configured manager override', async () => {
    await expect(
      detectInstallManager({
        cliEntryPath: '/tmp/local/dev/dist/cli/index.js',
        configuredManager: 'bun',
      }),
    ).resolves.toBe('bun');
  });
});
