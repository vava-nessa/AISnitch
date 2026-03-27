import type { AISnitchEvent } from '../core/events/types.js';

/**
 * @file src/tui/event-details.ts
 * @description Shared event-detail extraction for the Ink stream and plain-text monitor output.
 * @functions
 *   → formatEventDetail
 *   → getEventDetailSegments
 * @exports formatEventDetail, getEventDetailSegments
 * @see ./components/EventLine.tsx
 * @see ./live-monitor.ts
 */

const DETAIL_SEGMENT_LIMIT = 120;

/**
 * 📖 The adapters already stash richer source-native payloads in `data.raw`.
 * This helper squeezes the high-signal parts back out into short human-readable
 * fragments so operators can see prompts, thinking, tool targets, and streamed
 * assistant text without opening raw JSON.
 */
export function formatEventDetail(event: AISnitchEvent): string | null {
  const segments = getEventDetailSegments(event);

  return segments.length > 0 ? segments.join(' | ') : null;
}

/**
 * Returns stable, truncated detail segments for one event.
 */
export function getEventDetailSegments(event: AISnitchEvent): string[] {
  const raw = getRecord(event.data.raw);
  const segments: Array<string | undefined> = [];

  switch (event.type) {
    case 'agent.tool_call':
    case 'agent.coding':
      segments.push(formatToolSegment(event));
      segments.push(formatModelSegment(event.data.model));
      segments.push(formatTokenSegment(event.data.tokensUsed));
      break;

    case 'agent.thinking':
      segments.push(formatThinkingSegment(raw));
      segments.push(formatModelSegment(event.data.model));
      segments.push(formatTokenSegment(event.data.tokensUsed));
      segments.push(event.data.activeFile ?? event.data.cwd);
      break;

    case 'agent.streaming':
      segments.push(formatStreamingSegment(raw));
      segments.push(formatModelSegment(event.data.model));
      segments.push(formatTokenSegment(event.data.tokensUsed));
      segments.push(event.data.activeFile ?? event.data.cwd);
      break;

    case 'task.start':
      segments.push(formatPromptSegment(raw));
      segments.push(event.data.projectPath ?? event.data.project ?? event.data.cwd);
      break;

    case 'task.complete':
      segments.push(
        event.data.duration !== undefined
          ? `duration ${event.data.duration}ms`
          : undefined,
      );
      segments.push(formatTokenSegment(event.data.tokensUsed));
      segments.push(event.data.activeFile ?? event.data.projectPath ?? event.data.cwd);
      break;

    case 'agent.error':
      segments.push(event.data.errorType);
      segments.push(event.data.errorMessage);
      break;

    case 'agent.compact':
      segments.push('context compaction');
      segments.push(event.data.projectPath ?? event.data.cwd);
      break;

    case 'agent.asking_user':
      segments.push(
        getString(raw, 'notification_type') ??
          getString(raw, 'notificationType') ??
          getString(raw, 'type'),
      );
      segments.push(event.data.errorMessage ?? extractLooseString(raw, [
        'message',
        'reason',
      ]));
      break;

    case 'agent.idle':
      segments.push(event.data.activeFile ?? event.data.projectPath ?? event.data.cwd);
      break;

    case 'session.start':
    case 'session.end':
      segments.push(event.data.projectPath ?? event.data.project ?? event.data.cwd);
      segments.push(formatModelSegment(event.data.model));
      break;

    default:
      break;
  }

  return segments
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((value) => truncateSegment(value));
}

function formatToolSegment(event: AISnitchEvent): string | undefined {
  const toolName = event.data.toolName;
  const filePath = event.data.toolInput?.filePath ?? event.data.activeFile;
  const command = event.data.toolInput?.command;

  if (!toolName && !filePath && !command) {
    return undefined;
  }

  const label = toolName ?? 'tool';

  if (filePath && command) {
    return `${label}: ${filePath} | cmd ${command}`;
  }

  if (filePath) {
    return `${label}: ${filePath}`;
  }

  if (command) {
    return `${label}: ${command}`;
  }

  return label;
}

function formatThinkingSegment(
  raw: Record<string, unknown> | undefined,
): string | undefined {
  const snippet =
    extractContentPart(raw, 'thinking', 'thinking') ??
    extractLooseString(raw, ['thinking', 'message']);

  return snippet ? `thinking: ${snippet}` : undefined;
}

function formatStreamingSegment(
  raw: Record<string, unknown> | undefined,
): string | undefined {
  const snippet =
    extractContentPart(raw, 'text', 'text') ??
    extractLooseString(raw, ['message', 'text', 'content']);

  return snippet ? `reply: ${snippet}` : undefined;
}

function formatPromptSegment(
  raw: Record<string, unknown> | undefined,
): string | undefined {
  const snippet = extractLooseString(raw, [
    'prompt',
    'query',
    'message',
    'text',
    'content',
  ]);

  return snippet ? `prompt: ${snippet}` : undefined;
}

function formatModelSegment(model: string | undefined): string | undefined {
  return model ? `model ${model}` : undefined;
}

function formatTokenSegment(tokensUsed: number | undefined): string | undefined {
  return tokensUsed !== undefined ? `${tokensUsed.toLocaleString('en-US')} tok` : undefined;
}

function extractContentPart(
  raw: Record<string, unknown> | undefined,
  partType: string,
  valueKey: string,
): string | undefined {
  if (!raw) {
    return undefined;
  }

  const message = getRecord(raw.message);
  const content = message?.content ?? raw.content;

  if (!Array.isArray(content)) {
    return undefined;
  }

  for (const part of content) {
    const record = getRecord(part);

    if (!record || getString(record, 'type') !== partType) {
      continue;
    }

    const value = getString(record, valueKey);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function extractLooseString(
  raw: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | undefined {
  if (!raw) {
    return undefined;
  }

  for (const key of keys) {
    const directValue = getString(raw, key);

    if (directValue) {
      return directValue;
    }

    const nestedRecord = getRecord(raw[key]);
    const nestedValue =
      getString(nestedRecord, 'text') ??
      getString(nestedRecord, 'message') ??
      getString(nestedRecord, 'content');

    if (nestedValue) {
      return nestedValue;
    }
  }

  return undefined;
}

function truncateSegment(value: string): string {
  const normalized = value.replace(/\s+/gu, ' ').trim();

  if (normalized.length <= DETAIL_SEGMENT_LIMIT) {
    return normalized;
  }

  return `${normalized.slice(0, DETAIL_SEGMENT_LIMIT - 1)}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function getString(
  payload: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (!payload) {
    return undefined;
  }

  const value = payload[key];

  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
