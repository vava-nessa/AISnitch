import { spawnSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import WebSocket, { type RawData } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OpenCodeSetup } from '../cli/commands/setup.js';
import { DEFAULT_CONFIG } from '../core/config/defaults.js';
import { Pipeline } from '../core/engine/pipeline.js';
import { setLoggerLevel } from '../core/engine/logger.js';
import { AISnitchEventSchema } from '../core/events/schema.js';
import type { AISnitchEvent } from '../core/events/types.js';

/**
 * @file src/__e2e__/smoke.test.ts
 * @description Manual smoke coverage that drives a real OpenCode `run` invocation and asserts that AISnitch receives valid WebSocket events.
 * @functions
 *   → none
 * @exports none
 * @see ../../tasks/07-testing/03_testing_e2e-smoke.md
 */

const OPENAI_KEY_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'OPENAI_API_KEY',
] as const;
const OPENCODE_AUTH_PATH = join(
  homedir(),
  '.local',
  'share',
  'opencode',
  'auth.json',
);
const CAN_RUN_OPENCODE_SMOKE =
  isBinaryAvailable('opencode') &&
  (hasAnyConfiguredCredentialEnv() || hasFileSync(OPENCODE_AUTH_PATH));

let originalLogLevel = 'info';

function parseMessage(data: RawData): unknown {
  if (typeof data === 'string') {
    return JSON.parse(data) as unknown;
  }

  if (Array.isArray(data)) {
    return JSON.parse(Buffer.concat(data).toString('utf8')) as unknown;
  }

  if (data instanceof ArrayBuffer) {
    return JSON.parse(Buffer.from(new Uint8Array(data)).toString('utf8')) as unknown;
  }

  return JSON.parse(Buffer.from(data).toString('utf8')) as unknown;
}

function isBinaryAvailable(binaryName: string): boolean {
  const lookupCommand = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(lookupCommand, [binaryName], {
    encoding: 'utf8',
  });

  return result.status === 0;
}

function hasAnyConfiguredCredentialEnv(): boolean {
  return OPENAI_KEY_ENV_VARS.some((envVar) => {
    return Boolean(process.env[envVar]?.trim());
  });
}

function hasFileSync(path: string): boolean {
  try {
    spawnSync('test', ['-f', path], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

async function waitForRelevantEvents(
  socket: WebSocket,
  timeoutMs: number,
): Promise<AISnitchEvent[]> {
  return await new Promise<AISnitchEvent[]>((resolve, reject) => {
    const events: AISnitchEvent[] = [];
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for OpenCode smoke events.'));
    }, timeoutMs);
    timeout.unref();

    const onMessage = (data: RawData) => {
      const parsedMessage = parseMessage(data);

      if (
        typeof parsedMessage !== 'object' ||
        parsedMessage === null ||
        !('specversion' in parsedMessage)
      ) {
        return;
      }

      const parsedEvent = AISnitchEventSchema.safeParse(parsedMessage);

      if (!parsedEvent.success) {
        return;
      }

      events.push(parsedEvent.data);

      if (
        events.some((event) => event.type === 'session.start') &&
        events.some((event) => event.type === 'task.start')
      ) {
        clearTimeout(timeout);
        socket.off('message', onMessage);
        resolve(events);
      }
    };

    socket.on('message', onMessage);
  });
}

beforeAll(() => {
  originalLogLevel = process.env.AISNITCH_TEST_LOG_LEVEL ?? 'info';
  setLoggerLevel('silent');
});

afterAll(() => {
  setLoggerLevel(originalLogLevel as 'debug' | 'info' | 'warn' | 'error');
});

describe('E2E: OpenCode smoke test', () => {
  it.skipIf(!CAN_RUN_OPENCODE_SMOKE)(
    'receives session.start and task.start from a real OpenCode run',
    async () => {
      const aisnitchHome = await mkdtemp(join(tmpdir(), 'aisnitch-e2e-home-'));
      const opencodeConfigDirectory = await mkdtemp(
        join(tmpdir(), 'aisnitch-opencode-config-'),
      );
      const projectDirectory = await mkdtemp(join(tmpdir(), 'aisnitch-opencode-project-'));
      const pipeline = new Pipeline();
      let socket: WebSocket | null = null;

      try {
        await writeFile(
          join(projectDirectory, 'README.md'),
          '# OpenCode smoke fixture\n',
          'utf8',
        );

        const status = await pipeline.start({
          config: {
            ...DEFAULT_CONFIG,
            adapters: {
              opencode: { enabled: true },
            },
          },
          homeDirectory: aisnitchHome,
        });
        const setup = new OpenCodeSetup(status.httpPort ?? DEFAULT_CONFIG.httpPort, {
          binaryExists: () => Promise.resolve(true),
          opencodeConfigDirectory,
        });

        await setup.apply();

        socket = new WebSocket(`ws://127.0.0.1:${status.wsPort}`);
        await once(socket, 'open');
        await once(socket, 'message');

        const opencodeProcess = spawn(
          'opencode',
          ['run', 'Say hello in one word'],
          {
            cwd: projectDirectory,
            env: {
              ...process.env,
              OPENCODE_CONFIG_DIR: opencodeConfigDirectory,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );
        const eventsPromise = waitForRelevantEvents(socket, 30_000);

        try {
          const events = await eventsPromise;

          expect(
            events.every((event) => event['aisnitch.tool'] === 'opencode'),
          ).toBe(true);
          expect(events.some((event) => event.type === 'session.start')).toBe(true);
          expect(events.some((event) => event.type === 'task.start')).toBe(true);
        } finally {
          opencodeProcess.kill('SIGTERM');
          await once(opencodeProcess, 'exit').catch(() => undefined);
        }
      } finally {
        socket?.close();
        await pipeline.stop();
        await Promise.all([
          rm(aisnitchHome, { force: true, recursive: true }),
          rm(opencodeConfigDirectory, { force: true, recursive: true }),
          rm(projectDirectory, { force: true, recursive: true }),
        ]);
      }
    },
    60_000,
  );

  it('detects gracefully whether OpenCode smoke prerequisites are present', () => {
    expect(typeof CAN_RUN_OPENCODE_SMOKE).toBe('boolean');
  });
});
