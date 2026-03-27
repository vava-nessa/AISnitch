import { useEffect, useState } from 'react';

import type {
  AISnitchEvent,
  AISnitchEventType,
  ToolName,
} from '../../core/index.js';

/**
 * @file src/tui/hooks/useSessions.ts
 * @description Session aggregation helpers for the TUI, including active-session derivation and high-level activity status.
 * @functions
 *   → useSessions
 *   → deriveSessions
 *   → deriveGlobalActivityStatus
 * @exports SESSION_STALE_AFTER_MS, SessionState, GlobalActivityStatus, useSessions, deriveSessions, deriveGlobalActivityStatus
 * @see ../components/SessionPanel.tsx
 * @see ../components/GlobalBadge.tsx
 * @see ../App.tsx
 */

/**
 * Default timeout used to evict stale sessions that never emitted `session.end`.
 */
export const SESSION_STALE_AFTER_MS = 120_000;

/**
 * Derived session model rendered by the TUI.
 */
export interface SessionState {
  readonly activeFile?: string;
  readonly currentState: AISnitchEventType;
  readonly durationMs: number;
  readonly eventCount: number;
  readonly lastEventAt: string;
  readonly project?: string;
  readonly projectPath?: string;
  readonly sessionId: string;
  readonly startedAt: string;
  readonly tool: ToolName;
}

/**
 * High-level activity summary used by the header badge.
 */
export type GlobalActivityStatus = 'action-required' | 'ready' | 'working';

/**
 * 📖 Sessions are derived from normalized events instead of being tracked as a
 * second independent runtime channel. That keeps the TUI honest: if the event
 * contract says one thing and the session panel says another, the bug is local
 * and debuggable.
 */
export function useSessions(
  events: readonly AISnitchEvent[],
  options: {
    readonly staleAfterMs?: number;
  } = {},
): readonly SessionState[] {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1_000);
    timer.unref();

    return () => {
      clearInterval(timer);
    };
  }, []);

  return deriveSessions(events, {
    now,
    staleAfterMs: options.staleAfterMs,
  });
}

/**
 * Builds the active-session list from the normalized event buffer.
 */
export function deriveSessions(
  events: readonly AISnitchEvent[],
  options: {
    readonly now?: number;
    readonly staleAfterMs?: number;
  } = {},
): readonly SessionState[] {
  const now = options.now ?? Date.now();
  const staleAfterMs = options.staleAfterMs ?? SESSION_STALE_AFTER_MS;
  const sessionMap = new Map<string, SessionState>();

  for (const event of events) {
    const existingSession = sessionMap.get(event['aisnitch.sessionid']);
    const startedAt =
      existingSession?.startedAt ??
      (event.type === 'session.start' ? event.time : event.time);
    const nextSession: SessionState = {
      activeFile: event.data.activeFile ?? existingSession?.activeFile,
      currentState: event.type,
      durationMs: Math.max(0, now - Date.parse(startedAt)),
      eventCount: (existingSession?.eventCount ?? 0) + 1,
      lastEventAt: event.time,
      project: event.data.project ?? existingSession?.project,
      projectPath: event.data.projectPath ?? existingSession?.projectPath,
      sessionId: event['aisnitch.sessionid'],
      startedAt,
      tool: event['aisnitch.tool'],
    };

    sessionMap.set(event['aisnitch.sessionid'], nextSession);
  }

  return [...sessionMap.values()]
    .filter((session) => {
      if (session.currentState === 'session.end') {
        return false;
      }

      return now - Date.parse(session.lastEventAt) <= staleAfterMs;
    })
    .sort((left, right) => {
      return Date.parse(right.lastEventAt) - Date.parse(left.lastEventAt);
    });
}

/**
 * Derives the global activity badge state from the active sessions list.
 */
export function deriveGlobalActivityStatus(
  sessions: readonly SessionState[],
): GlobalActivityStatus {
  if (
    sessions.some((session) =>
      session.currentState === 'agent.asking_user' ||
      session.currentState === 'agent.error',
    )
  ) {
    return 'action-required';
  }

  if (
    sessions.some((session) =>
      session.currentState === 'agent.coding' ||
      session.currentState === 'agent.thinking' ||
      session.currentState === 'agent.tool_call' ||
      session.currentState === 'agent.streaming' ||
      session.currentState === 'task.start',
    )
  ) {
    return 'working';
  }

  return 'ready';
}
