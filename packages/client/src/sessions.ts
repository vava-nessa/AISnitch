/**
 * @file src/sessions.ts
 * @description Session state tracker for the @aisnitch/client SDK.
 *   Maintains a live map of active AI tool sessions, updated from the event stream.
 *   Sessions are auto-created on first event and removed on `session.end`.
 *
 * @functions
 *   → SessionTracker.update — process an event and update the session map
 *   → SessionTracker.get — get a single session by ID
 *   → SessionTracker.getAll — get all active sessions
 *   → SessionTracker.getByTool — filter sessions by tool name
 *
 * @exports SessionTracker, SessionState
 * @see ./client.ts — the client wires this tracker into the event stream automatically
 */

import { describeEvent } from './describe.js';
import type { AISnitchEvent, ToolName } from './types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** 📖 Snapshot of a tracked AI tool session. */
export interface SessionState {
  /** 📖 Which AI tool this session belongs to */
  readonly tool: ToolName;
  /** 📖 Unique session identifier from the event stream */
  readonly sessionId: string;
  /** 📖 Project name, if known */
  readonly project?: string;
  /** 📖 Working directory, if known */
  readonly cwd?: string;
  /** 📖 The most recent event in this session */
  readonly lastEvent: AISnitchEvent;
  /** 📖 Human-readable description of the last activity */
  readonly lastActivity: string;
  /** 📖 Total number of events received for this session */
  readonly eventCount: number;
  /** 📖 ISO timestamp of the first event that created this session */
  readonly startedAt: string;
}

// 📖 Mutable internal state — the public interface is readonly
interface MutableSessionState {
  tool: ToolName;
  sessionId: string;
  project?: string;
  cwd?: string;
  lastEvent: AISnitchEvent;
  lastActivity: string;
  eventCount: number;
  startedAt: string;
}

// ─── Tracker ─────────────────────────────────────────────────────────────────

/**
 * 📖 Tracks active AI tool sessions from the AISnitch event stream.
 *
 * When wired into an AISnitchClient (default), it automatically updates
 * on every received event. Sessions are created on first event and removed
 * on `session.end`.
 *
 * @example
 * ```ts
 * const client = createAISnitchClient(); // sessions enabled by default
 * client.sessions.getAll(); // → SessionState[]
 * client.sessions.getByTool('claude-code'); // → SessionState[]
 * ```
 */
export class SessionTracker {
  private readonly _sessions = new Map<string, MutableSessionState>();

  /** 📖 Number of currently tracked sessions. */
  get count(): number {
    return this._sessions.size;
  }

  /**
   * 📖 Process an event and update the session map.
   * Called automatically by AISnitchClient when trackSessions is enabled.
   */
  update(event: AISnitchEvent): void {
    const sessionId = event['aisnitch.sessionid'];

    // 📖 On session.end, remove the session entirely
    if (event.type === 'session.end') {
      this._sessions.delete(sessionId);
      return;
    }

    const existing = this._sessions.get(sessionId);

    if (existing) {
      // 📖 Update existing session with latest event data
      existing.lastEvent = event;
      existing.lastActivity = describeEvent(event);
      existing.eventCount += 1;
      if (event.data.project) existing.project = event.data.project;
      if (event.data.cwd) existing.cwd = event.data.cwd;
    } else {
      // 📖 Create new session entry
      this._sessions.set(sessionId, {
        tool: event['aisnitch.tool'],
        sessionId,
        project: event.data.project,
        cwd: event.data.cwd,
        lastEvent: event,
        lastActivity: describeEvent(event),
        eventCount: 1,
        startedAt: event.time,
      });
    }
  }

  /** 📖 Get a single session by its ID. */
  get(sessionId: string): SessionState | undefined {
    return this._sessions.get(sessionId);
  }

  /** 📖 Get all currently active sessions. */
  getAll(): SessionState[] {
    return [...this._sessions.values()];
  }

  /** 📖 Get sessions filtered by tool name. */
  getByTool(tool: ToolName): SessionState[] {
    return this.getAll().filter((s) => s.tool === tool);
  }

  /** 📖 Clear all tracked sessions. */
  clear(): void {
    this._sessions.clear();
  }
}
