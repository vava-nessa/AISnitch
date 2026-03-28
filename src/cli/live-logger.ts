import { once } from 'node:events';

import WebSocket, { type RawData } from 'ws';

import {
  AISnitchEventSchema,
  formatSessionLabelFromEvent,
  type AISnitchEvent,
  type AISnitchEventType,
  type ToolName,
  type WelcomeMessage,
} from '../core/index.js';
import { EVENT_COLORS, TOOL_COLORS, TUI_THEME } from '../tui/theme.js';
import type { MonitorCloseHandler, MonitorOutput } from '../tui/live-monitor.js';

/**
 * @file src/cli/live-logger.ts
 * @description Exhaustive raw-event logger for operators who want the full live payload stream without the Ink TUI.
 * @functions
 *   → formatLoggerWelcomeLine
 *   → formatLoggerEventBlock
 *   → attachWebSocketLogger
 * @exports LoggerFilters, formatLoggerWelcomeLine, formatLoggerEventBlock, attachWebSocketLogger
 * @see ./runtime.ts
 * @see ../tui/live-monitor.ts
 * @see ../core/events/schema.ts
 */

/**
 * Client-side filters accepted by the plain logger command.
 */
export interface LoggerFilters {
  readonly tool?: ToolName;
  readonly type?: AISnitchEventType;
}

/**
 * 📖 The logger intentionally emits every field on its own line so operators can
 * tail it, grep it, or pipe it into other tools without fighting TUI truncation.
 */
export function formatLoggerEventBlock(event: AISnitchEvent): string {
  const headerSegments = [
    colorize(`#${event['aisnitch.seqnum']}`, EVENT_COLORS[event.type]),
    colorize(event['aisnitch.tool'], TOOL_COLORS[event['aisnitch.tool']]),
    colorize(event.type, EVENT_COLORS[event.type]),
    colorize(formatSessionLabelFromEvent(event), TUI_THEME.warning),
    colorize(event.time, TUI_THEME.muted),
  ];
  const flattenedLines = flattenEventRecord(event);

  return [
    `${colorize('╭─', TUI_THEME.frame)} ${headerSegments.join(colorize('  ', TUI_THEME.muted))}`,
    ...flattenedLines.map((line) => `${colorize('│', TUI_THEME.frame)} ${line}`),
    colorize('╰────────────────────────────────────────────────────────', TUI_THEME.frame),
  ].join('\n');
}

/**
 * Formats the connection handshake line for logger mode.
 */
export function formatLoggerWelcomeLine(message: WelcomeMessage): string {
  const tools =
    message.tools.length > 0 ? message.tools.join(', ') : 'none configured';

  return `${colorize('AISnitch logger attached', TUI_THEME.success)} ${colorize(`v${message.version}`, TUI_THEME.warning)} ${colorize(`tools=${tools}`, TUI_THEME.muted)}`;
}

/**
 * Attaches to an existing daemon over WebSocket and prints exhaustive event blocks.
 */
export async function attachWebSocketLogger(
  url: string,
  output: MonitorOutput,
  filters: LoggerFilters = {},
): Promise<MonitorCloseHandler> {
  const socket = new WebSocket(url);

  socket.on('message', (data) => {
    const parsedPayload = parseSocketMessage(data);

    if (isWelcomeMessage(parsedPayload)) {
      output.stdout(`${formatLoggerWelcomeLine(parsedPayload)}\n`);
      return;
    }

    const parsedEvent = AISnitchEventSchema.safeParse(parsedPayload);

    if (!parsedEvent.success) {
      output.stderr(
        `${colorize('logger:', TUI_THEME.danger)} received an unrecognized event payload.\n`,
      );
      return;
    }

    if (!matchesFilters(parsedEvent.data, filters)) {
      return;
    }

    output.stdout(`${formatLoggerEventBlock(parsedEvent.data)}\n`);
  });

  socket.on('error', (error) => {
    output.stderr(
      `${colorize('logger:', TUI_THEME.danger)} ${
        error instanceof Error ? error.message : 'unknown socket error'
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

function matchesFilters(event: AISnitchEvent, filters: LoggerFilters): boolean {
  if (filters.tool && event['aisnitch.tool'] !== filters.tool) {
    return false;
  }

  if (filters.type && event.type !== filters.type) {
    return false;
  }

  return true;
}

function flattenEventRecord(event: AISnitchEvent): string[] {
  const lines: string[] = [];
  flattenValue(lines, '', event);
  return lines;
}

function flattenValue(
  lines: string[],
  currentPath: string,
  value: unknown,
): void {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push(formatLoggerField(currentPath, '[]', 'empty'));
      return;
    }

    value.forEach((entry, index) => {
      flattenValue(lines, `${currentPath}[${index}]`, entry);
    });
    return;
  }

  if (isRecord(value)) {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right),
    );

    if (entries.length === 0) {
      lines.push(formatLoggerField(currentPath, '{}', 'empty'));
      return;
    }

    for (const [key, entry] of entries) {
      const nextPath = currentPath.length === 0 ? key : `${currentPath}.${key}`;
      flattenValue(lines, nextPath, entry);
    }
    return;
  }

  lines.push(formatLoggerField(currentPath, value, inferValueKind(value)));
}

function formatLoggerField(
  path: string,
  value: unknown,
  kind: 'string' | 'number' | 'boolean' | 'null' | 'empty' | 'other',
): string {
  const renderedValue =
    typeof value === 'string'
      ? JSON.stringify(value)
      : value === null
        ? 'null'
        : typeof value === 'undefined'
          ? 'undefined'
          : JSON.stringify(value);

  return `${colorize(path, TUI_THEME.warning)} ${colorize('=', TUI_THEME.muted)} ${colorize(
    renderedValue,
    getValueColor(kind),
  )}`;
}

function inferValueKind(
  value: unknown,
): 'string' | 'number' | 'boolean' | 'null' | 'empty' | 'other' {
  if (value === null) {
    return 'null';
  }

  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'other';
  }
}

function getValueColor(kind: ReturnType<typeof inferValueKind>): `#${string}` {
  switch (kind) {
    case 'string':
      return TUI_THEME.panelBody;
    case 'number':
      return TUI_THEME.success;
    case 'boolean':
      return TUI_THEME.warning;
    case 'null':
      return TUI_THEME.danger;
    case 'empty':
      return TUI_THEME.muted;
    default:
      return TUI_THEME.panelBody;
  }
}

function colorize(value: string, color: `#${string}`): string {
  const [red, green, blue] = hexToRgb(color);
  return `\u001B[38;2;${red};${green};${blue}m${value}\u001B[39m`;
}

function hexToRgb(hexColor: `#${string}`): [number, number, number] {
  const sanitized = hexColor.slice(1);
  return [
    Number.parseInt(sanitized.slice(0, 2), 16),
    Number.parseInt(sanitized.slice(2, 4), 16),
    Number.parseInt(sanitized.slice(4, 6), 16),
  ];
}

function parseSocketMessage(data: RawData): unknown {
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

function isWelcomeMessage(payload: unknown): payload is WelcomeMessage {
  if (!isRecord(payload)) {
    return false;
  }

  return (
    payload.type === 'welcome' &&
    typeof payload.version === 'string' &&
    Array.isArray(payload.tools)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
