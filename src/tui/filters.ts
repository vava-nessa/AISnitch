import type {
  AISnitchEvent,
  AISnitchEventType,
  ToolName,
} from '../core/index.js';

/**
 * @file src/tui/filters.ts
 * @description Pure filtering helpers shared by the TUI event stream, session panel, and CLI pre-filter handling.
 * @functions
 *   → applyEventFilters
 *   → applySessionFilters
 *   → countActiveFilters
 * @exports TuiFilters, SessionFilterTarget, DEFAULT_TUI_FILTERS, applyEventFilters, applySessionFilters, countActiveFilters
 * @see ./App.tsx
 * @see ./hooks/useKeyBinds.ts
 * @see ./hooks/useSessions.ts
 */

/**
 * Global filter state applied across the TUI.
 */
export interface TuiFilters {
  readonly eventType: AISnitchEventType | null;
  readonly query: string;
  readonly tool: ToolName | null;
}

/**
 * Structural session shape accepted by the generic session filter helper.
 */
export interface SessionFilterTarget {
  readonly activeFile?: string;
  readonly currentState: AISnitchEventType;
  readonly project?: string;
  readonly projectPath?: string;
  readonly sessionId: string;
  readonly tool: ToolName;
}

/**
 * Default empty filter state used by the TUI.
 */
export const DEFAULT_TUI_FILTERS: TuiFilters = {
  eventType: null,
  query: '',
  tool: null,
};

/**
 * Filters buffered events by tool, event type, and free-text search.
 */
export function applyEventFilters(
  events: readonly AISnitchEvent[],
  filters: TuiFilters,
): readonly AISnitchEvent[] {
  return events.filter((event) => {
    if (filters.tool !== null && event['aisnitch.tool'] !== filters.tool) {
      return false;
    }

    if (filters.eventType !== null && event.type !== filters.eventType) {
      return false;
    }

    if (!matchesTextQuery(getEventSearchFields(event), filters.query)) {
      return false;
    }

    return true;
  });
}

/**
 * Filters active sessions using the same global TUI filter state.
 */
export function applySessionFilters<T extends SessionFilterTarget>(
  sessions: readonly T[],
  filters: TuiFilters,
): readonly T[] {
  return sessions.filter((session) => {
    if (filters.tool !== null && session.tool !== filters.tool) {
      return false;
    }

    if (filters.eventType !== null && session.currentState !== filters.eventType) {
      return false;
    }

    if (
      !matchesTextQuery(
        [
          session.sessionId,
          session.tool,
          session.currentState,
          session.project,
          session.projectPath,
          session.activeFile,
        ],
        filters.query,
      )
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Counts how many filter categories are currently active.
 */
export function countActiveFilters(filters: TuiFilters): number {
  let count = 0;

  if (filters.tool !== null) {
    count += 1;
  }

  if (filters.eventType !== null) {
    count += 1;
  }

  if (filters.query.trim().length > 0) {
    count += 1;
  }

  return count;
}

function getEventSearchFields(event: AISnitchEvent): readonly (string | undefined)[] {
  return [
    event['aisnitch.tool'],
    event.type,
    event['aisnitch.sessionid'],
    event.data.toolName,
    event.data.toolInput?.filePath,
    event.data.toolInput?.command,
    event.data.activeFile,
    event.data.errorMessage,
    event.data.cwd,
    event.data.project,
    event.data.projectPath,
  ];
}

function matchesTextQuery(
  values: readonly (string | undefined)[],
  query: string,
): boolean {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return true;
  }

  return values.some((value) => value?.toLowerCase().includes(normalizedQuery));
}
