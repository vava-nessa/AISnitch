import { describe, expect, it } from 'vitest';

import { buildLaunchAgentPlist } from '../runtime.js';

/**
 * @file src/cli/__tests__/runtime.test.ts
 * @description Unit coverage for pure CLI runtime helpers.
 * @functions
 *   → none
 * @exports none
 * @see ../runtime.ts
 */

describe('buildLaunchAgentPlist', () => {
  it('embeds the node path, cli entry, config override, and log path', () => {
    const plist = buildLaunchAgentPlist({
      cliEntryPath: '/opt/aisnitch/dist/cli/index.js',
      configPath: '/tmp/aisnitch/config.json',
      logFilePath: '/tmp/aisnitch/daemon.log',
      nodeExecutablePath: '/usr/local/bin/node',
    });

    expect(plist).toContain('<string>/usr/local/bin/node</string>');
    expect(plist).toContain('<string>/opt/aisnitch/dist/cli/index.js</string>');
    expect(plist).toContain('<string>--config</string>');
    expect(plist).toContain('<string>/tmp/aisnitch/config.json</string>');
    expect(plist).toContain('<string>/tmp/aisnitch/daemon.log</string>');
  });
});
