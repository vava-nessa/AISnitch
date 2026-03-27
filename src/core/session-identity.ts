import { basename, dirname, extname } from 'node:path';

import type { AISnitchEvent, ToolName } from './events/types.js';

/**
 * @file src/core/session-identity.ts
 * @description Shared helpers for deriving stable session ids and readable session labels from partial runtime metadata.
 * @functions
 *   → isGenericSessionId
 *   → resolveSessionId
 *   → formatSessionLabel
 *   → formatSessionShortId
 *   → formatSessionLabelFromEvent
 * @exports SessionIdentityInput, isGenericSessionId, resolveSessionId, formatSessionLabel, formatSessionShortId, formatSessionLabelFromEvent
 * @see ./engine/pipeline.ts
 * @see ../adapters/base.ts
 * @see ../tui/components/SessionPanel.tsx
 */

/**
 * Shared metadata used to derive or display one session identity.
 */
export interface SessionIdentityInput {
  readonly activeFile?: string;
  readonly cwd?: string;
  readonly instanceIndex?: number;
  readonly instanceTotal?: number;
  readonly pid?: number;
  readonly project?: string;
  readonly projectPath?: string;
  readonly sessionId?: string;
  readonly tool: ToolName;
  readonly transcriptPath?: string;
}

const GENERIC_SESSION_SUFFIXES = new Set([
  'default',
  'hook',
  'hook-session',
  'process',
  'session',
  'unknown',
]);

/**
 * 📖 Some tool hooks only expose a placeholder session id such as
 * `opencode-session` or `codex:hook-session`. Treating those as canonical
 * collapses unrelated runs together, so AISnitch upgrades them when richer
 * metadata exists.
 */
export function isGenericSessionId(
  tool: ToolName,
  sessionId: string,
): boolean {
  const normalizedSessionId = sessionId.trim().toLowerCase();
  const normalizedTool = tool.toLowerCase();

  if (normalizedSessionId.length === 0) {
    return true;
  }

  if (
    normalizedSessionId === 'hook-session' ||
    normalizedSessionId === 'session'
  ) {
    return true;
  }

  for (const suffix of GENERIC_SESSION_SUFFIXES) {
    if (
      normalizedSessionId === `${normalizedTool}:${suffix}` ||
      normalizedSessionId === `${normalizedTool}-${suffix}`
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Returns the best-effort stable session id for one event source.
 */
export function resolveSessionId(input: SessionIdentityInput): string {
  if (input.sessionId && !isGenericSessionId(input.tool, input.sessionId)) {
    return input.sessionId;
  }

  const scopeToken = sanitizeToken(
    input.project ??
      getPathTail(input.projectPath) ??
      getPathTail(input.cwd) ??
      getPathTail(input.activeFile) ??
      getPathTail(input.transcriptPath ? dirname(input.transcriptPath) : undefined),
  );
  const transcriptToken = sanitizeToken(
    input.transcriptPath
      ? basename(input.transcriptPath, extname(input.transcriptPath))
      : undefined,
  );
  const pidToken = input.pid ? `p${input.pid}` : undefined;
  const parts = [
    input.tool,
    scopeToken,
    transcriptToken && transcriptToken !== scopeToken ? transcriptToken : undefined,
    pidToken,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  if (parts.length > 1) {
    return parts.join(':');
  }

  return input.sessionId ?? `${input.tool}:session`;
}

/**
 * Formats a compact human-readable label for logs and the TUI.
 */
export function formatSessionLabel(input: SessionIdentityInput): string {
  const scopeLabel =
    input.project ??
    getPathTail(input.projectPath) ??
    getPathTail(input.cwd) ??
    getPathTail(input.activeFile);
  const parts = [
    scopeLabel,
    input.instanceTotal && input.instanceTotal > 1
      ? `#${input.instanceIndex ?? 1}/${input.instanceTotal}`
      : undefined,
    input.pid ? `pid ${input.pid}` : formatSessionShortId(input.tool, input.sessionId),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  return parts.length > 0 ? parts.join(' · ') : input.tool;
}

/**
 * Formats a short session-id fragment for UI display without losing all entropy.
 */
export function formatSessionShortId(
  tool: ToolName,
  sessionId: string | undefined,
): string | undefined {
  if (!sessionId || isGenericSessionId(tool, sessionId)) {
    return undefined;
  }

  const withoutToolPrefix = sessionId.startsWith(`${tool}:`)
    ? sessionId.slice(tool.length + 1)
    : sessionId;

  if (withoutToolPrefix.length <= 16) {
    return withoutToolPrefix;
  }

  return `${withoutToolPrefix.slice(0, 6)}…${withoutToolPrefix.slice(-4)}`;
}

/**
 * Builds a display label directly from a normalized AISnitch event.
 */
export function formatSessionLabelFromEvent(event: AISnitchEvent): string {
  return formatSessionLabel({
    activeFile: event.data.activeFile,
    cwd: event.data.cwd,
    instanceIndex: event.data.instanceIndex,
    instanceTotal: event.data.instanceTotal,
    pid: event.data.pid,
    project: event.data.project,
    projectPath: event.data.projectPath,
    sessionId: event['aisnitch.sessionid'],
    tool: event['aisnitch.tool'],
  });
}

function getPathTail(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const pathParts = value.split(/[\\/]+/u).filter((part) => part.length > 0);

  return pathParts.at(-1);
}

function sanitizeToken(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalizedToken = value
    .trim()
    .replace(/[\\/]+/gu, '-')
    .replace(/[^A-Za-z0-9._-]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^[-_.]+|[-_.]+$/gu, '');

  return normalizedToken.length > 0 ? normalizedToken : undefined;
}
