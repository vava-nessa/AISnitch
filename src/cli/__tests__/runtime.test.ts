import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
  const previousDashboardDist = process.env.AISNITCH_DASHBOARD_DIST;

  afterEach(() => {
    if (previousAISnitchHome === undefined) {
      delete process.env.AISNITCH_HOME;
    } else {
      process.env.AISNITCH_HOME = previousAISnitchHome;
    }

    if (previousDashboardDist === undefined) {
      delete process.env.AISNITCH_DASHBOARD_DIST;
    } else {
      process.env.AISNITCH_DASHBOARD_DIST = previousDashboardDist;
    }
  });

  it('starts the daemon automatically before opening the managed dashboard', async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), 'aisnitch-runtime-'));
    const renderManagedTui = vi.fn(() => Promise.resolve());
    let pollCount = 0;

    process.env.AISNITCH_HOME = homeDirectory;

    try {
      const runtime = createCliRuntime({
        fetch: vi.fn(() =>
          Promise.resolve(
            new Response(JSON.stringify({
              consumers: 0,
              droppedEvents: 0,
              events: 0,
              uptime: 10,
            }), { status: 200 }),
          ),
        ),
        renderManagedTui,
        sleep: async () => {
          pollCount += 1;

          if (pollCount === 1) {
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
          }
        },
        spawn: vi.fn(() => {
          return {
            pid: 1234,
            unref: () => undefined,
          } as never;
        }),
      });

      await runtime.start({});

      expect(renderManagedTui).toHaveBeenCalledTimes(1);
      const firstCall = renderManagedTui.mock.calls[0];

      expect(firstCall).toBeDefined();

      if (!firstCall) {
        throw new Error('Expected managed dashboard to be rendered.');
      }

      const firstArgument = firstCall.at(0) as unknown as ManagedDashboardCall;

      expect(firstArgument.initialSnapshot.status.daemon?.active).toBe(true);
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
          dashboardPort: 5174,
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

  it('surfaces the daemon log failure instead of a generic startup timeout', async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), 'aisnitch-runtime-'));
    let pollCount = 0;
    const renderManagedTui = vi.fn(() => Promise.resolve());

    process.env.AISNITCH_HOME = homeDirectory;

    try {
      const runtime = createCliRuntime({
        renderManagedTui,
        sleep: async () => {
          pollCount += 1;

          if (pollCount === 1) {
            await writeFile(
              join(homeDirectory, 'daemon.log'),
              'AISnitch CLI failed: Unable to find an available port from 4820 to 4919.\n',
              'utf8',
            );
          }
        },
        spawn: vi.fn(() => {
          return {
            pid: 1234,
            unref: () => undefined,
          } as never;
        }),
      });

      await expect(runtime.start({})).rejects.toThrow(
        'AISnitch CLI failed: Unable to find an available port from 4820 to 4919.',
      );
      expect(renderManagedTui).not.toHaveBeenCalled();
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('ignores daemon info logs while waiting for a healthy daemon', async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), 'aisnitch-runtime-'));
    let pollCount = 0;
    const renderManagedTui = vi.fn(() => Promise.resolve());

    process.env.AISNITCH_HOME = homeDirectory;

    try {
      const runtime = createCliRuntime({
        fetch: vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                consumers: 0,
                droppedEvents: 0,
                events: 2,
                uptime: 250,
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
        renderManagedTui,
        sleep: async () => {
          pollCount += 1;

          if (pollCount === 1) {
            await writeFile(
              join(homeDirectory, 'daemon.log'),
              '{"level":30,"time":"2026-03-28T01:36:14.152Z","service":"aisnitch","name":"aisnitch","socketPath":"/Users/vava/.aisnitch/aisnitch.sock","msg":"UDS server started"}\n',
              'utf8',
            );
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
          }
        },
        spawn: vi.fn(() => {
          return {
            pid: 1234,
            unref: () => undefined,
          } as never;
        }),
      });

      await runtime.start({});

      expect(renderManagedTui).toHaveBeenCalledTimes(1);
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('fullscreen starts the daemon and returns after the dashboard is reachable', async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), 'aisnitch-runtime-'));
    const stdout = vi.fn();
    let pollCount = 0;

    process.env.AISNITCH_HOME = homeDirectory;

    try {
      const runtime = createCliRuntime({
        fetch: vi.fn((url: Parameters<typeof globalThis.fetch>[0]) => {
          const value = typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.href
              : url.url;

          if (value.includes(':4821') || value.includes(':5174')) {
            return Promise.resolve(new Response(JSON.stringify({ uptime: 1 }), { status: 200 }));
          }

          return Promise.reject(new Error('unavailable'));
        }),
        output: {
          stderr: vi.fn(),
          stdout,
        },
        sleep: async () => {
          pollCount += 1;

          if (pollCount === 1) {
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
          }
        },
        spawn: vi.fn(() => {
          return {
            pid: 1234,
            unref: () => undefined,
          } as never;
        }),
      });

      await runtime.fullscreen({ noBrowser: true });
      expect(stdout).toHaveBeenCalledWith(
        expect.stringContaining('Dashboard ready at http://127.0.0.1:5174'),
      );
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });
});
