import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  saveConfig,
} from '../../core/config/index.js';
import {
  writeDaemonState,
  writePid,
} from '../pid.js';
import {
  buildLaunchAgentPlist,
  createCliRuntime,
} from '../runtime.js';

interface ManagedDashboardCall {
  readonly initialSnapshot: {
    readonly status: {
      readonly connected: boolean;
      readonly daemon?: {
        readonly active: boolean;
        readonly wsUrl: string;
      };
    };
  };
}

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

describe('managed dashboard runtime', () => {
  const previousAISnitchHome = process.env.AISNITCH_HOME;

  afterEach(() => {
    if (previousAISnitchHome === undefined) {
      delete process.env.AISNITCH_HOME;
      return;
    }

    process.env.AISNITCH_HOME = previousAISnitchHome;
  });

  it('opens the managed dashboard even when the daemon is offline', async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), 'aisnitch-runtime-'));
    const renderManagedTui = vi.fn(() => Promise.resolve());

    process.env.AISNITCH_HOME = homeDirectory;

    try {
      const runtime = createCliRuntime({
        renderManagedTui,
      });

      await runtime.start({});

      expect(renderManagedTui).toHaveBeenCalledTimes(1);
      const firstCall = renderManagedTui.mock.calls[0];

      expect(firstCall).toBeDefined();

      if (!firstCall) {
        throw new Error('Expected managed dashboard to be rendered.');
      }

      const firstArgument = firstCall.at(0) as unknown as ManagedDashboardCall;

      expect(firstArgument.initialSnapshot.status.daemon?.active).toBe(false);
      expect(firstArgument.initialSnapshot.status.daemon?.wsUrl).toBe(
        'ws://127.0.0.1:4820',
      );
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('attach also opens the managed dashboard when the daemon is offline', async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), 'aisnitch-runtime-'));
    const renderManagedTui = vi.fn(() => Promise.resolve());

    process.env.AISNITCH_HOME = homeDirectory;

    try {
      const runtime = createCliRuntime({
        renderManagedTui,
      });

      await runtime.attach({});

      expect(renderManagedTui).toHaveBeenCalledTimes(1);
      const firstCall = renderManagedTui.mock.calls[0];

      expect(firstCall).toBeDefined();

      if (!firstCall) {
        throw new Error('Expected managed dashboard to be rendered.');
      }

      const firstArgument = firstCall.at(0) as unknown as ManagedDashboardCall;

      expect(firstArgument.initialSnapshot.status.connected).toBe(false);
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('reports enabled adapters as running when the daemon is healthy', async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), 'aisnitch-runtime-'));
    const stdout = vi.fn();

    process.env.AISNITCH_HOME = homeDirectory;

    try {
      await writePid(process.pid, { env: process.env });
      await writeDaemonState(
        {
          configPath: join(homeDirectory, 'config.json'),
          httpPort: 4821,
          logFilePath: join(homeDirectory, 'daemon.log'),
          pid: process.pid,
          socketPath: join(homeDirectory, 'aisnitch.sock'),
          startedAt: new Date().toISOString(),
          wsPort: 4820,
        },
        { env: process.env },
      );
      await saveConfig(
        {
          adapters: {
            'claude-code': {
              enabled: true,
            },
          },
          autoUpdate: {
            enabled: true,
            intervalMs: 0,
            manager: 'auto',
          },
          httpPort: 4821,
          idleTimeoutMs: 120000,
          logLevel: 'info',
          wsPort: 4820,
        },
        { env: process.env },
      );

      const runtime = createCliRuntime({
        fetch: vi.fn(() =>
          Promise.resolve(
            new Response(
            JSON.stringify({
              consumers: 0,
              droppedEvents: 0,
              events: 0,
              uptime: 1234,
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
              },
            },
            ),
          ),
        ),
        output: {
          stderr: vi.fn(),
          stdout,
        },
      });

      await runtime.adapters({});

      expect(stdout).toHaveBeenCalledWith(
        'claude-code: enabled | runtime=running\n',
      );
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });
});
