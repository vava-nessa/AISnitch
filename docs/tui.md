# TUI

## Purpose

The Ink TUI is now the primary live operator surface for AISnitch in both foreground and daemon-attach mode. Instead of dumping raw logs, AISnitch renders a structured terminal application with a strong header, active-session awareness, and global controls that stay aligned with the normalized event contract.

## What shipped

- `src/tui/index.tsx` now exposes both `renderForegroundTui()` and `renderAttachedTui()`, so `start` and `attach` use the same Ink app instead of divergent monitor implementations.
- `src/tui/App.tsx` composes the full shell: header, filter bar, help overlay, event stream panel, sessions panel, and footer status bar.
- `src/tui/components/Header.tsx` renders the title treatment, connection label, and the global activity badge from `src/tui/components/GlobalBadge.tsx`.
- `src/tui/components/EventStream.tsx` and `src/tui/components/EventLine.tsx` render the formatted live stream with frozen-tail messaging and compact event detail rows.
- `src/tui/components/SessionPanel.tsx` groups active sessions by tool and applies state-specific visual treatment for coding, thinking, asking-user, idle, and error states.
- `src/tui/components/FilterBar.tsx` and `src/tui/components/HelpOverlay.tsx` expose the current filter state, inline prompts, and discoverable keybind help.
- `src/tui/hooks/useEventStream.ts` keeps the live buffer bounded to 500 events, supports either the in-process `EventBus` or a WebSocket source, and owns freeze/clear behavior.
- `src/tui/hooks/useSessions.ts` derives active sessions directly from normalized buffered events, including stale-session eviction after timeout.
- `src/tui/hooks/useKeyBinds.ts` centralizes keyboard interaction so the App shell does not devolve into scattered `useInput()` branches.
- `src/tui/filters.ts` provides pure helpers shared by the event stream, sessions panel, and CLI pre-filtering.

## Interaction model

The TUI currently supports:

- `q` / `Ctrl+C` to quit cleanly
- `f` to pick a tool filter
- `t` to pick an event-type filter
- `/` to run a free-text search across event/session metadata
- `Esc` to clear all active filters
- `Space` to freeze or resume the live tail
- `c` to clear the local buffered event list
- `?` to toggle the help overlay
- `Tab` to cycle focus between the events and sessions panels

The event stream stays privacy-first and memory-only: only the latest 500 events are kept in the local TUI buffer. When frozen, new events continue to accumulate in the background while the visible tail stays pinned.

## Runtime integration

Foreground `aisnitch start` boots the full pipeline and mounts the TUI against the in-process `EventBus`. Daemon `aisnitch attach` connects the same UI to the WebSocket stream and can start with CLI pre-filters:

- `aisnitch start --tool claude-code`
- `aisnitch start --type agent.coding`
- `aisnitch attach --tool opencode`

That symmetry matters because the operator does not need to mentally switch between two monitoring surfaces anymore.

## Testing notes

Coverage now includes:

- pure filter helper tests in `src/tui/__tests__/filters.test.ts`
- session derivation and badge tests in `src/tui/__tests__/sessions.test.tsx`
- stream rendering and frozen-window tests in `src/tui/__tests__/event-stream.test.tsx`

Manual smoke validation was also run against the built CLI:

- foreground TUI render
- daemon attach render
- CLI pre-filter propagation
- live hook ingestion displayed in the attached TUI
