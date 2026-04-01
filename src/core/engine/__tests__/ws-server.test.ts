import { once } from 'node:events';

import WebSocket, { type RawData } from 'ws';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createEvent } from '../../events/index.js';
import { EventBus } from '../event-bus.js';
import { setLoggerLevel } from '../logger.js';
import { WSServer } from '../ws-server.js';

/**
 * @file src/core/engine/__tests__/ws-server.test.ts
 * @description Integration coverage for the localhost WebSocket event stream server.
 * @functions
 *   → parseMessage
 *   → waitForJsonMessage
 * @exports none
 * @see ../ws-server.ts
 */

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

describe('WSServer', () => {
  it('starts, accepts connections, and sends a welcome payload', async () => {
    const eventBus = new EventBus();
    const wsServer = new WSServer();

    const port = await wsServer.start({
      port: 0,
      eventBus,
      activeTools: ['claude-code'],
    });
    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    const welcomePromise = waitForJsonMessage(client);

    await once(client, 'open');
    const welcomeMessage = await welcomePromise;

    expect(welcomeMessage).toEqual({
      type: 'welcome',
      version: '0.2.9',
      tools: ['claude-code'],
    });

    client.close();
    await wsServer.stop();
  });

  it('broadcasts EventBus events to connected clients', async () => {
    const eventBus = new EventBus();
    const wsServer = new WSServer();

    const port = await wsServer.start({
      port: 0,
      eventBus,
    });
    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    const welcomePromise = waitForJsonMessage(client);

    await once(client, 'open');
    await welcomePromise;

    const testEvent = createEvent({
      source: 'aisnitch://tests/ws',
      type: 'task.complete',
      'aisnitch.tool': 'codex',
      'aisnitch.sessionid': 'ws-session',
      'aisnitch.seqnum': 3,
    });

    const eventPromise = waitForJsonMessage(client);

    eventBus.publish(testEvent);

    expect(await eventPromise).toEqual(testEvent);

    client.close();
    await wsServer.stop();
  });

  it('supports multiple simultaneous clients', async () => {
    const eventBus = new EventBus();
    const wsServer = new WSServer();

    const port = await wsServer.start({
      port: 0,
      eventBus,
    });
    const firstClient = new WebSocket(`ws://127.0.0.1:${port}`);
    const secondClient = new WebSocket(`ws://127.0.0.1:${port}`);
    const firstWelcomePromise = waitForJsonMessage(firstClient);
    const secondWelcomePromise = waitForJsonMessage(secondClient);

    await Promise.all([once(firstClient, 'open'), once(secondClient, 'open')]);
    await Promise.all([firstWelcomePromise, secondWelcomePromise]);

    const testEvent = createEvent({
      source: 'aisnitch://tests/ws',
      type: 'agent.streaming',
      'aisnitch.tool': 'codex',
      'aisnitch.sessionid': 'ws-session',
      'aisnitch.seqnum': 4,
    });

    const firstMessagePromise = waitForJsonMessage(firstClient);
    const secondMessagePromise = waitForJsonMessage(secondClient);
    eventBus.publish(testEvent);
    const [firstMessage, secondMessage] = await Promise.all([
      firstMessagePromise,
      secondMessagePromise,
    ]);

    expect(firstMessage).toEqual(testEvent);
    expect(secondMessage).toEqual(testEvent);

    firstClient.close();
    secondClient.close();
    await wsServer.stop();
  });

  it('updates consumer stats after disconnects', async () => {
    const eventBus = new EventBus();
    const wsServer = new WSServer();

    const port = await wsServer.start({
      port: 0,
      eventBus,
    });
    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    const welcomePromise = waitForJsonMessage(client);

    await once(client, 'open');
    await welcomePromise;

    expect(wsServer.getStats().consumerCount).toBe(1);

    client.close();
    await once(client, 'close');

    await vi.waitFor(() => {
      expect(wsServer.getStats().consumerCount).toBe(0);
    });

    await wsServer.stop();
  });
});
