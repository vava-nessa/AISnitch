# TUI

## Purpose

The Ink TUI is now the primary live operator surface for AISnitch in both dashboard and daemon-connected mode. Instead of dumping raw logs, AISnitch renders a structured terminal application with a strong header, active-session awareness, and global controls that stay aligned with the normalized event contract.

## What shipped

- `src/tui/index.tsx` now exposes `renderManagedTui()` in addition to the lower-level foreground and attached renderers, so `start` and `attach` both land in the same PM2-style dashboard.
- `src/tui/ManagedDaemonApp.tsx` keeps the TUI mounted while the daemon starts, stops, reconnects, or stays offline, and mirrors the daemon WebSocket stream into a local in-process `EventBus`.
- `src/tui/App.tsx` composes the full shell: header, filter bar, help overlay, event stream panel, sessions panel, and footer status bar.
- `src/tui/components/Header.tsx` renders the title treatment, connection label, and the global activity badge from `src/tui/components/GlobalBadge.tsx`.
- `src/tui/components/EventStream.tsx` and `src/tui/components/EventLine.tsx` render the formatted live stream with frozen-tail messaging and compact event detail rows.
- `src/tui/event-inspector.ts` and `src/tui/components/EventInspector.tsx` add a dedicated full-data mode with a spotlight summary, envelope metadata, syntax-colored normalized JSON, and the raw adapter payload.
- `src/tui/event-details.ts` extracts richer operator-facing detail from normalized fields plus `event.data.raw`, then feeds both the Ink stream and the plain-text monitor.
- `src/tui/components/SessionPanel.tsx` groups active sessions by tool and applies state-specific visual treatment for coding, thinking, asking-user, idle, and error states.
- `src/core/session-identity.ts` derives stable fallback session ids plus readable labels so the UI can distinguish concurrent sessions from the same tool without showing only opaque ids.
- `src/tui/components/FilterBar.tsx` and `src/tui/components/HelpOverlay.tsx` expose the current filter state, inline prompts, and discoverable keybind help.
- `src/tui/hooks/useEventStream.ts` keeps the live buffer bounded to 500 events, supports either the in-process `EventBus` or a WebSocket source, and owns freeze/clear behavior.
- `src/tui/hooks/useSessions.ts` derives active sessions directly from normalized buffered events, including stale-session eviction after timeout.
- `src/tui/hooks/useKeyBinds.ts` centralizes keyboard interaction so the App shell does not devolve into scattered `useInput()` branches.
- `src/tui/filters.ts` provides pure helpers shared by the event stream, sessions panel, and CLI pre-filtering.

## Interaction model

The TUI currently supports:

- `q` / `Ctrl+C` to quit cleanly
- `v` to toggle the full-data inspector
- `f` to pick a tool filter
- `t` to pick an event-type filter
- `/` to run a free-text search across event/session metadata
- `Esc` to clear all active filters
- `Space` to freeze or resume the live tail
- `c` to clear the local buffered event list
- `d` to start or stop the daemon from inside the dashboard
- `r` to refresh daemon state immediately
- `?` to toggle the help overlay
- `Tab` to cycle focus between the events and sessions panels
- `↑` / `↓` or `j` / `k` to select events or scroll the inspector in full-data mode
- `[` / `]` to page the inspector up or down in full-data mode

The event stream stays privacy-first and memory-only: only the latest 500 events are kept in the local TUI buffer. When frozen, new events continue to accumulate in the background while the visible tail stays pinned.

Session labels now prefer project/workspace scope, then append instance index, PID, or a short session-id fragment when needed. That makes side-by-side Claude/OpenCode runs much easier to tell apart in both the event stream and the sessions panel.

Event rows now try to show the useful payload, not just the state transition. When the adapter supplies it, the operator sees prompt snippets, transcript thinking text, streamed assistant replies, tool/file targets, shell commands, model names, and token counts directly in the stream.

The new full-data inspector is the answer when the summary row is not enough. It keeps the left panel as the event selector, highlights the currently inspected row, recenters the visible event window around that selection, and turns the right panel into a scrollable payload reader. The panel deliberately starts with a compact "spotlight" block, because dumping raw JSON first is fast to implement but slow to operate.

## Runtime integration

`aisnitch start` and `aisnitch attach` now both open the managed dashboard. When the daemon is active, the dashboard mirrors the WebSocket stream into the normal event panels. When the daemon is inactive, the TUI stays open and turns into an operator console instead of crashing out with a socket error.

Headless `aisnitch start --daemon` still boots the full pipeline in the background. The dashboard can start or stop that process with `d` and refresh its metadata with `r`.

The dashboard and daemon-connected views can both start with CLI pre-filters:

- `aisnitch start --tool claude-code`
- `aisnitch start --type agent.coding`
- `aisnitch start --view full-data`
- `aisnitch attach --tool opencode`
- `aisnitch attach --view full-data`

That symmetry matters because the operator does not need to mentally switch between two monitoring surfaces anymore.

## Testing notes

Coverage now includes:

- pure filter helper tests in `src/tui/__tests__/filters.test.ts`
- session derivation and badge tests in `src/tui/__tests__/sessions.test.tsx`
- stream rendering, event selection, anchored windows, and inspector formatting tests in `src/tui/__tests__/event-stream.test.tsx`

Manual smoke validation was also run against the built CLI:

- managed dashboard render with daemon offline
- managed dashboard render with daemon online
- CLI pre-filter propagation
- live hook ingestion displayed in the dashboard stream
