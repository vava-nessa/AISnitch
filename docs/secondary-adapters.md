# Secondary Adapters

## Purpose

AISnitch now covers the first secondary-adapter block beyond Claude Code and OpenCode. The current pass adds Gemini CLI and Codex with the same best-effort mindset as the rest of the MVP: use the most stable passive signal first, then fall back to weaker signals when needed.

## Gemini CLI

`src/adapters/gemini-cli.ts` uses three layers:

- command hooks forwarded from `~/.gemini/settings.json`
- best-effort local `logs.json` watching under `~/.gemini/tmp/`
- lightweight `pgrep -lf gemini` process detection

The hook path is the primary signal. AISnitch maps:

- `SessionStart` / `SessionEnd` to session lifecycle
- `BeforeAgent` / `AfterAgent` to task lifecycle
- `BeforeTool` / `AfterTool` to tool or coding activity
- `Notification` to `agent.asking_user`
- `PreCompress` to `agent.compact`
- `AfterModel` to `agent.streaming` when it is available

The local `logs.json` fallback is intentionally narrow. In local inspection, those files consistently exposed prompt-like user messages with `sessionId`, `messageId`, `message`, `type`, and `timestamp`, but not the full tool loop. AISnitch therefore uses them only for session/task start hints instead of pretending they carry full-fidelity runtime telemetry.

`aisnitch setup gemini-cli` now merges one wildcard `command` hook per supported Gemini event into `~/.gemini/settings.json`. The generated hook simply forwards raw stdin JSON to `http://localhost:<port>/hooks/gemini-cli` with `curl`, preserving the existing AISnitch ingestion path.

## Codex

`src/adapters/codex.ts` currently focuses on the passive path that is already available on a normal local install:

- watch `~/.codex/log/codex-tui.log`
- detect running `codex` processes

The Codex adapter only parses high-signal log lines:

- model selection lines to establish a session/model hint
- embedded JSON command payloads to emit `agent.tool_call`
- patch target lines such as `*** Update File:` to emit `agent.coding`
- shutdown markers to best-effort close the session when possible

This is intentionally conservative. Codex also documents `codex exec --json`, but that is a wrapper/non-interactive mode rather than a passive observer of an already running TUI session. For the MVP, log watching is the pragmatic choice.

`aisnitch setup codex` now exists as a passive-arm setup flow. It does not modify Codex files; it only documents the watched log path and enables the adapter in AISnitch config so operators do not have to hand-edit `~/.aisnitch/config.json`.

## Validation Notes

This pass adds automated coverage for:

- Gemini hook mapping
- Gemini `logs.json` fallback parsing
- Gemini process detection
- Codex command log parsing
- Codex patch-target parsing
- Codex process detection
- Gemini/Codex setup command support

What remains for later task groups is broader secondary-tool coverage, not deeper Gemini/Codex infrastructure in this pass.
