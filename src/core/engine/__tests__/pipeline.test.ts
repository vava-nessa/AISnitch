import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import WebSocket, { type RawData } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../../config/index.js';
import { createEvent } from '../../events/index.js';
import { Pipeline } from '../pipeline.js';
import { setLoggerLevel } from '../logger.js';

/**
 * @file src/core/engine/__tests__/pipeline.test.ts
 * @description Integration coverage for the orchestrated core pipeline (HTTP + WS + UDS).
 * @functions
 *   → findFreePort
 *   → parseMessage
 *   → waitForJsonMessage
 * @exports none
 * @see ../pipeline.ts
 */

async function findFreePort(): Promise<number> {
  const server = createServer();

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Expected an AddressInfo result for free-port detection');
  }

  const port = address.port;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  return port;
}

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

async function waitForJsonMessage(socket: WebSocket): Promise<unknown> {
  const data = await new Promise<RawData>((resolve) => {
    socket.once('message', (message) => {
      resolve(message);
    });
  });

  return parseMessage(data);
}

beforeAll(() => {
  setLoggerLevel('silent');
});

afterAll(() => {
  setLoggerLevel('info');
});

describe('Pipeline', () => {
  it('routes POST hook payloads into the WebSocket stream', async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), 'aisnitch-pipeline-'));
    const pipeline = new Pipeline();
    const wsPort = await findFreePort();
    const httpPort = await findFreePort();

    try {
      await pipeline.start({
        homeDirectory,
        config: {
          ...DEFAULT_CONFIG,
          wsPort,
          httpPort,
          adapters: {
            'claude-code': { enabled: true },
          },
        },
      });

      const client = new WebSocket(`ws://127.0.0.1:${pipeline.getStatus().wsPort}`);
      const welcomePromise = waitForJsonMessage(client);

      await once(client, 'open');
      await welcomePromise;

      const hookEventPromise = waitForJsonMessage(client);
      const response = await fetch(
        `http://127.0.0.1:${pipeline.getStatus().httpPort}/hooks/claude-code`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            cwd: '/repo',
            hook_event_name: 'SessionStart',
            model: 'claude-sonnet',
            project_path: '/repo',
            session_id: 'hook-session',
          }),
        },
      );

      expect(response.status).toBe(202);

      const hookEvent = await hookEventPromise;

      expect(hookEvent).toMatchObject({
        type: 'session.start',
        'aisnitch.tool': 'claude-code',
        'aisnitch.sessionid': 'hook-session',
      });

      client.close();
    } finally {
      await pipeline.stop();
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('returns 400 for malformed POST bodies without crashing', async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), 'aisnitch-pipeline-'));
    const pipeline = new Pipeline();
    const wsPort = await findFreePort();
    const httpPort = await findFreePort();

    try {
      await pipeline.start({
        homeDirectory,
        config: {
          ...DEFAULT_CONFIG,
          wsPort,
          httpPort,
        },
      });

      const response = await fetch(
        `http://127.0.0.1:${pipeline.getStatus().httpPort}/hooks/claude-code`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: '{"broken"',
        },
      );

      expect(response.status).toBe(400);
      expect(pipeline.getStatus().http.invalidRequestCount).toBeGreaterThanOrEqual(1);
    } finally {
      await pipeline.stop();
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('accepts UDS NDJSON events and rebroadcasts them to WebSocket consumers', async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), 'aisnitch-pipeline-'));
    const pipeline = new Pipeline();
    const wsPort = await findFreePort();
    const httpPort = await findFreePort();

    try {
      await pipeline.start({
        homeDirectory,
        config: {
          ...DEFAULT_CONFIG,
          wsPort,
          httpPort,
        },
      });

      const client = new WebSocket(`ws://127.0.0.1:${pipeline.getStatus().wsPort}`);
      const welcomePromise = waitForJsonMessage(client);

      await once(client, 'open');
      await welcomePromise;

      const udsEvent = createEvent({
        source: 'aisnitch://tests/uds',
        type: 'task.complete',
        'aisnitch.tool': 'codex',
        'aisnitch.sessionid': 'uds-session',
        'aisnitch.seqnum': 2,
      });
      const socket = createConnection(pipeline.getStatus().socketPath ?? '');

      await once(socket, 'connect');
      const udsEventPromise = waitForJsonMessage(client);
      socket.write(`${JSON.stringify(udsEvent)}\n`);

      expect(await udsEventPromise).toEqual(udsEvent);

      socket.end();
      client.close();
    } finally {
      await pipeline.stop();
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('exposes health stats from the HTTP receiver', async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), 'aisnitch-pipeline-'));
    const pipeline = new Pipeline();
    const wsPort = await findFreePort();
    const httpPort = await findFreePort();

    try {
      await pipeline.start({
        homeDirectory,
        config: {
          ...DEFAULT_CONFIG,
          wsPort,
          httpPort,
        },
      });

      await pipeline.publishEvent(
        createEvent({
          source: 'aisnitch://tests/health',
          type: 'agent.streaming',
          'aisnitch.tool': 'codex',
          'aisnitch.sessionid': 'health-session',
          'aisnitch.seqnum': 4,
        }),
      );

      const response = await fetch(
        `http://127.0.0.1:${pipeline.getStatus().httpPort}/health`,
      );
      const payload = (await response.json()) as {
        status: string;
        uptime: number;
        consumers: number;
        events: number;
      };

      expect(response.status).toBe(200);
      expect(payload.status).toBe('ok');
      expect(payload.events).toBeGreaterThanOrEqual(1);
    } finally {
      await pipeline.stop();
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('starts and stops cleanly', async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), 'aisnitch-pipeline-'));
    const pipeline = new Pipeline();
    const wsPort = await findFreePort();
    const httpPort = await findFreePort();

    try {
      const startedStatus = await pipeline.start({
        homeDirectory,
        config: {
          ...DEFAULT_CONFIG,
          wsPort,
          httpPort,
        },
      });

      expect(startedStatus.running).toBe(true);
      expect(startedStatus.wsPort).toBe(wsPort);

      await pipeline.stop();

      expect(pipeline.getStatus().running).toBe(false);
    } finally {
      await pipeline.stop();
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });
});
