import { once } from 'node:events';

import WebSocket, { type RawData } from 'ws';

import { AISnitchEventSchema } from '../core/events/index.js';
import type {
  AISnitchEvent,
  EventBus,
  WelcomeMessage,
} from '../core/index.js';
import { formatSessionLabelFromEvent } from '../core/index.js';
import { formatEventDetail } from './event-details.js';

/**
 * @file src/tui/live-monitor.ts
 * @description Lightweight plain-text live event monitor formatter retained for tests and fallback console output.
 * @functions
 *   → formatEventLine
 *   → formatWelcomeLine
 *   → attachEventBusMonitor
 *   → attachWebSocketMonitor
 * @exports MonitorOutput, MonitorCloseHandler, formatEventLine, formatWelcomeLine, attachEventBusMonitor, attachWebSocketMonitor
 * @see ../core/engine/ws-server.ts
 * @see ../core/events/schema.ts
 */

/**
 * Minimal output contract shared by CLI monitor renderers.
 */
export interface MonitorOutput {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

/**
 * Async close callback returned by monitor attach helpers.
 */
export type MonitorCloseHandler = () => Promise<void> | void;

/**
 * 📖 The Ink TUI is now the primary operator surface, but these formatters are
 * still useful for tests and any future low-friction text fallbacks.
 */
export function formatEventLine(event: AISnitchEvent): string {
  const detail = formatEventDetail(event);
  const summary = detail ? ` :: ${detail}` : '';

  return [
    `[${event.time}]`,
    event['aisnitch.tool'],
    event.type,
    `session=${formatSessionLabelFromEvent(event)}`,
    `sid=${event['aisnitch.sessionid']}`,
    event.data.cwd ? `cwd=${event.data.cwd}` : undefined,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ') + summary;
}

/**
 * Formats the WebSocket welcome payload for human-readable output.
 */
export function formatWelcomeLine(message: WelcomeMessage): string {
  const tools =
    message.tools.length > 0 ? message.tools.join(', ') : 'none configured';

  return `Connected to AISnitch ${message.version} (tools: ${tools})`;
}

/**
 * Attaches a live writer to the in-process EventBus.
 */
export function attachEventBusMonitor(
  eventBus: EventBus,
  output: MonitorOutput,
): MonitorCloseHandler {
  output.stdout('AISnitch live monitor attached (foreground mode).\n');

  return eventBus.subscribe((event) => {
    output.stdout(`${formatEventLine(event)}\n`);
  });
}

/**
 * Attaches to an existing daemon over WebSocket and streams monitor lines.
 */
export async function attachWebSocketMonitor(
  url: string,
  output: MonitorOutput,
): Promise<MonitorCloseHandler> {
  const socket = new WebSocket(url);

  socket.on('message', (data) => {
    const parsedPayload = parseSocketMessage(data);

    if (isWelcomeMessage(parsedPayload)) {
      output.stdout(`${formatWelcomeLine(parsedPayload)}\n`);
      return;
    }

    const parsedEvent = AISnitchEventSchema.safeParse(parsedPayload);

    if (parsedEvent.success) {
      output.stdout(`${formatEventLine(parsedEvent.data)}\n`);
      return;
    }

    output.stderr('Received an unrecognized monitor payload.\n');
  });

  socket.on('error', (error) => {
    output.stderr(
      `AISnitch attach socket error: ${
        error instanceof Error ? error.message : 'unknown error'
      }\n`,
    );
  });

  await once(socket, 'open');

  return async () => {
    if (
      socket.readyState === WebSocket.CLOSING ||
      socket.readyState === WebSocket.CLOSED
    ) {
      return;
    }

    socket.close();
    await once(socket, 'close');
  };
}

function parseSocketMessage(data: RawData): unknown {
  if (typeof data === 'string') {
    return JSON.parse(data) as unknown;
  }

  if (Array.isArray(data)) {
    return JSON.parse(Buffer.concat(data).toString('utf8')) as unknown;
  }

  if (data instanceof ArrayBuffer) {
    return JSON.parse(
      Buffer.from(new Uint8Array(data)).toString('utf8'),
    ) as unknown;
  }

  return JSON.parse(Buffer.from(data).toString('utf8')) as unknown;
}

function isWelcomeMessage(payload: unknown): payload is WelcomeMessage {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const candidate = payload as Record<string, unknown>;

  return (
    candidate.type === 'welcome' &&
    typeof candidate.version === 'string' &&
    Array.isArray(candidate.tools)
  );
}
