import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

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

async function createStaleSocketPath(socketPath: string): Promise<void> {
  const child = spawn(
    process.execPath,
    [
      '-e',
      `
        const { mkdirSync } = require('node:fs');
        const { createServer } = require('node:net');
        const { dirname } = require('node:path');

        const socketPath = process.argv[1];
        mkdirSync(dirname(socketPath), { recursive: true });

        const server = createServer();
        server.listen(socketPath, () => {
          process.stdout.write('ready\\n');
        });

        setInterval(() => {}, 1_000);
      `,
      socketPath,
    ],
    {
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );

  if (child.stdout === null || child.pid === undefined) {
    throw new Error('Failed to create a temporary socket child process.');
  }

  await once(child.stdout, 'data');
  process.kill(child.pid, 'SIGKILL');
  await once(child, 'exit');
  await access(socketPath);
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

  it.skipIf(process.platform === 'win32')(
    'cleans stale daemon files when the pid is no longer running',
    async () => {
    const homeDirectory = await createTempHome();
    const socketPath = join(homeDirectory, '.aisnitch', 'aisnitch.sock');

    try {
      await createStaleSocketPath(socketPath);
      await writePid(999_999, { homeDirectory });
      await writeDaemonState(
        {
          configPath: join(homeDirectory, '.aisnitch', 'config.json'),
          httpPort: 4821,
          logFilePath: join(homeDirectory, '.aisnitch', 'daemon.log'),
          pid: 999_999,
          socketPath,
          startedAt: new Date().toISOString(),
          wsPort: 4820,
        },
        { homeDirectory },
      );

      expect(await cleanupStaleDaemonFiles({ homeDirectory })).toBe(true);
      expect(await readPid({ homeDirectory })).toBeNull();
      expect(await readDaemonState({ homeDirectory })).toBeNull();
      await expect(access(socketPath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
    },
  );

  it.skipIf(process.platform === 'win32')(
    'cleans an orphan socket even when the pid file is already gone',
    async () => {
    const homeDirectory = await createTempHome();
    const socketPath = join(homeDirectory, '.aisnitch', 'aisnitch.sock');

    try {
      await createStaleSocketPath(socketPath);

      expect(await cleanupStaleDaemonFiles({ homeDirectory })).toBe(true);
      await expect(access(socketPath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
    },
  );

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
