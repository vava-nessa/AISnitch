# TUI

## Purpose

The Ink TUI is becoming the primary operator surface for AISnitch. Instead of dumping raw logs to the terminal, foreground `aisnitch start` now renders a structured terminal app with a strong header, framed panels, and a live runtime status bar.

## Foundation shipped in 05/01

The first TUI pass focuses on layout and runtime integration rather than deep controls:

- `src/tui/index.tsx` renders the Ink application for foreground mode.
- `src/tui/App.tsx` subscribes directly to the in-process `EventBus` and keeps lightweight live state for counts, latest event details, uptime, and a short recent-session preview.
- `src/tui/components/Header.tsx` provides the visual identity, version tag, and foreground connection badge.
- `src/tui/components/Layout.tsx` defines the reusable panel framing and the responsive row/column stack.
- `src/tui/components/StatusBar.tsx` exposes counts plus keybind hints.
- `src/tui/theme.ts` centralizes tool colors, event-type colors, and layout chrome colors.

The layout collapses from a side-by-side panel view to a stacked view when the terminal gets narrow. This keeps the foreground UX usable on smaller windows without maintaining two separate component trees.

## Live stream shipped in 05/02

The next pass turns the placeholder event panel into a real live stream:

- `src/tui/hooks/useEventStream.ts` owns the bounded event buffer, live/frozen tail logic, and future-ready source abstraction for either the in-process `EventBus` or a WebSocket stream.
- `src/tui/components/EventLine.tsx` formats one normalized AISnitch event with a stable icon, tool color, event-type color, and a compact detail line.
- `src/tui/components/EventStream.tsx` renders the current visible event window and shows whether the stream is live or frozen.

The stream intentionally keeps only the latest 500 events in memory. This matches the overall privacy-first, memory-only design while still giving the operator enough live context for an active session.

Foreground controls now include:

- `space` to freeze or resume the live tail
- `q` to quit cleanly
- `Ctrl+C` as a second clean-exit path

When frozen, new events keep accumulating in the buffer but the viewport stays pinned to the same visible tail. This gives the operator a chance to read a burst of activity without the stream constantly jumping downward.

## Runtime integration

Foreground `aisnitch start` now boots the core pipeline, then mounts the Ink TUI instead of the earlier raw EventBus text monitor. The current exit path is intentionally conservative:

- `q` quits the foreground app and performs the existing clean pipeline shutdown
- `Ctrl+C` still exits cleanly through the same shutdown path

`attach` still uses the lightweight WebSocket monitor for now. That split is intentional: the richer attach-mode TUI, filters, and session-focused controls are tracked in the remaining `05-tui` tasks.

## Current limitations

This foundation is intentionally not the whole TUI spec yet:

- the sessions panel is currently a lightweight preview, not the full grouped session model
- filters, help overlay, clear stream, and focus management are still pending
- final visual approval from the user is still pending before `05/01` can be renamed `_DONE`

The foundation is good enough to support the next two TUI tasks without reworking the runtime entrypoint again.
