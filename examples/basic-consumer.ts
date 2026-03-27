/**
 * @file examples/basic-consumer.ts
 * @description Minimal WebSocket consumer that prints AISnitch events and demonstrates simple client-side filtering by tool and type.
 * @functions
 *   → main
 *   → shouldKeepEvent
 * @exports none
 * @see ../README.md
 * @see ../src/core/events/types.ts
 */

import WebSocket from 'ws';

const socketUrl = process.env.AISNITCH_WS_URL ?? 'ws://127.0.0.1:4820';
const toolFilter = process.env.AISNITCH_TOOL?.trim();
const typeFilter = process.env.AISNITCH_TYPE?.trim();

/**
 * 📖 Consumers are expected to receive the welcome payload plus a live stream
 * of normalized CloudEvents. Filtering locally keeps the server side simple.
 */
function shouldKeepEvent(event: Record<string, unknown>): boolean {
  if (event.type === 'welcome') {
    return false;
  }

  if (toolFilter && event['aisnitch.tool'] !== toolFilter) {
    return false;
  }

  if (typeFilter && event.type !== typeFilter) {
    return false;
  }

  return true;
}

async function main(): Promise<void> {
  const socket = new WebSocket(socketUrl);

  socket.on('open', () => {
    process.stdout.write(`Connected to ${socketUrl}\n`);
  });

  socket.on('message', (buffer) => {
    const payload = JSON.parse(buffer.toString('utf8')) as Record<string, unknown>;

    if (!shouldKeepEvent(payload)) {
      return;
    }

    process.stdout.write(`${JSON.stringify(payload)}\n`);
  });

  socket.on('close', () => {
    process.stdout.write('AISnitch stream closed.\n');
  });

  socket.on('error', (error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}

void main();
