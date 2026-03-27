# Priority Adapters

## Purpose

AISnitch now has a real adapter layer instead of placeholder exports. The runtime starts a shared `AdapterRegistry`, wires enabled adapters into the HTTP hook ingress, and lets each tool-specific adapter own its own watchers, process polling, and event mapping.

## Base architecture

The adapter subsystem is built around three files:

- `src/adapters/base.ts` defines `BaseAdapter`, `InterceptionStrategy`, normalized hook parsing, session tracking, sequence numbers, and idle detection.
- `src/adapters/registry.ts` owns adapter registration plus `startAll()` / `stopAll()` orchestration based on the persisted AISnitch config.
- `src/adapters/index.ts` exports the primitives and `createDefaultAdapters()`, which currently instantiates Claude Code and OpenCode.

Adapters do not publish straight to the raw `EventBus`. They emit normalized AISnitch events through the pipeline publish function, so the existing `ContextDetector` enrichment still runs before events fan out to WebSocket consumers.

## Claude Code adapter

`src/adapters/claude-code.ts` currently uses three layers:

- Official hook payload mapping from `/hooks/claude-code`
- JSONL transcript watching under `~/.claude/projects/**/*.jsonl`
- Lightweight `pgrep -lf claude` polling as a fallback when hooks were never installed

The adapter accepts both raw Claude hook payloads and the normalized bridge payload shape used by AISnitch setup flows. It maps the most useful lifecycle events into AISnitch state changes:

- `SessionStart` and `SessionEnd` become session lifecycle events
- `UserPromptSubmit`, `TaskCreated`, and `SubagentStart` become `task.start`
- `Stop`, `TaskCompleted`, and `SubagentStop` become `task.complete`
- `PreToolUse` / `PostToolUse` become `agent.tool_call` or `agent.coding`
- `PermissionRequest` and actionable `Notification` payloads become `agent.asking_user`
- `PreCompact` / `PostCompact` become `agent.compact`

Transcript enrichment is intentionally narrow and practical: it reads only appended lines, keeps per-file offsets, extracts thinking blocks as `agent.thinking`, and extracts assistant text blocks as `agent.streaming`. This avoids pretending Claude transcripts are a stable public API while still giving AISnitch richer live state than hooks alone.

One important live-doc nuance: the current Claude Code docs list 25 hook events, not the older 21-event view captured in earlier project research. AISnitch maps the subset that materially improves passive monitoring and ignores the rest for now.

## OpenCode adapter

`src/adapters/opencode.ts` is centered on the OpenCode plugin system that AISnitch already installs through `setup opencode`.

The current MVP path is:

- local OpenCode plugin forwards runtime events over HTTP to `/hooks/opencode`
- the adapter maps those events into AISnitch events
- `pgrep -lf opencode` fills the fallback gap when the plugin is not active

This is the cleanest passive integration available from current official docs. OpenCode's ACP mode is documented as an editor-facing JSON-RPC subprocess transport, which makes it useful for interactive editor integrations but not a passive observer of whatever the user is already running in a terminal session.

SQLite watching is deliberately not shipped in this pass. The docs clearly expose plugins and ACP, but they do not provide a stable passive database contract good enough for a privacy-first MVP without hand-wavy reverse engineering. That tradeoff is explicit rather than hidden.

## Validation coverage

Automated coverage now includes:

- Base adapter emission, sequence numbers, idle detection, and registry lifecycle
- Claude hook mapping, transcript parsing, and process fallback
- OpenCode plugin-event mapping and process fallback
- Pipeline integration from a raw Claude hook POST to the WebSocket stream

What is still pending is the final human validation step with a real Claude Code session and a real OpenCode session on the user's machine.
