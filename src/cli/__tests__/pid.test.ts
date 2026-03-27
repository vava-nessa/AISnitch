import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  cleanupStaleDaemonFiles,
  getDaemonStatePath,
  readDaemonState,
  readPid,
  removePid,
  writeDaemonState,
  writePid,
} from '../pid.js';

/**
 * @file src/cli/__tests__/pid.test.ts
 * @description Unit coverage for PID and daemon state helpers used by the CLI runtime.
 * @functions
 *   → createTempHome
 * @exports none
 * @see ../pid.ts
 */

async function createTempHome(): Promise<string> {
  return await mkdtemp(join(tmpdir(), 'aisnitch-cli-'));
}

describe('cli pid helpers', () => {
  it('writes, reads, and removes the daemon pid file', async () => {
    const homeDirectory = await createTempHome();

    try {
      await writePid(4242, { homeDirectory });

      expect(await readPid({ homeDirectory })).toBe(4242);

      await removePid({ homeDirectory });

      expect(await readPid({ homeDirectory })).toBeNull();
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('cleans stale daemon files when the pid is no longer running', async () => {
    const homeDirectory = await createTempHome();

    try {
      await writePid(999_999, { homeDirectory });
      await writeDaemonState(
        {
          configPath: join(homeDirectory, '.aisnitch', 'config.json'),
          httpPort: 4821,
          logFilePath: join(homeDirectory, '.aisnitch', 'daemon.log'),
          pid: 999_999,
          socketPath: join(homeDirectory, '.aisnitch', 'aisnitch.sock'),
          startedAt: new Date().toISOString(),
          wsPort: 4820,
        },
        { homeDirectory },
      );

      expect(await cleanupStaleDaemonFiles({ homeDirectory })).toBe(true);
      expect(await readPid({ homeDirectory })).toBeNull();
      expect(await readDaemonState({ homeDirectory })).toBeNull();
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('stores daemon state metadata as JSON next to the pid file', async () => {
    const homeDirectory = await createTempHome();

    try {
      await writeDaemonState(
        {
          configPath: join(homeDirectory, '.aisnitch', 'config.json'),
          httpPort: 5001,
          logFilePath: join(homeDirectory, '.aisnitch', 'daemon.log'),
          pid: 1234,
          socketPath: join(homeDirectory, '.aisnitch', 'aisnitch.sock'),
          startedAt: new Date().toISOString(),
          wsPort: 5000,
        },
        { homeDirectory },
      );

      const daemonState = await readDaemonState({ homeDirectory });

      expect(daemonState?.pid).toBe(1234);
      expect(daemonState?.wsPort).toBe(5000);
      expect(getDaemonStatePath({ homeDirectory })).toContain('daemon-state.json');
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });
});
