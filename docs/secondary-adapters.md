# Secondary Adapters

## Purpose

AISnitch now covers the first three secondary-adapter passes beyond Claude Code and OpenCode. The guiding rule stays the same across all of them: use the strongest stable signal available for a tool, then fall back to weaker local signals only when necessary.

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

## Goose

`src/adapters/goose.ts` is intentionally layered because Goose exposes multiple passive and semi-active surfaces:

- Goose daemon API polling on `http://127.0.0.1:8080`
- per-session SSE event streams from `goosed`
- SQLite session snapshots from `~/.config/goose/sessions.db`
- lightweight `pgrep -lf goose|goosed` process detection

Research for this task was verified with Exa against Goose server docs. The practical result is important: the live session path is SSE, not a durable WebSocket feed. AISnitch therefore polls `/status` and `/sessions`, then opens `/sessions/{id}/events` as an SSE stream for the hottest sessions.

The adapter maps Goose activity like this:

- new or newly discovered sessions -> `session.start` + `agent.idle`
- advancing session snapshots -> `agent.streaming`
- user `Message` entries -> `task.start`
- assistant `thinking` / `redactedThinking` parts -> `agent.thinking`
- assistant `text` parts -> `agent.streaming`
- assistant `toolRequest` parts -> `agent.tool_call` or `agent.coding`
- `Finish` -> `task.complete`
- `Notification` / `actionRequired` / confirmations -> `agent.asking_user`
- `Error` -> `agent.error`

The SQLite path stays intentionally conservative. It does not pretend to reconstruct the entire agent loop. It gives AISnitch enough metadata to discover or refresh sessions when the live daemon stream is not reachable.

`aisnitch setup goose` is passive by design. It does not edit Goose config files; it simply documents the expected local sources and enables the adapter in AISnitch config.

## Copilot CLI

`src/adapters/copilot-cli.ts` combines repository hooks with the local session-state files that Copilot CLI already writes:

- repository-scoped hooks under `.github/hooks/*.json`
- session-state JSONL watching under `~/.copilot/session-state/`
- workspace metadata enrichment from adjacent `workspace.yaml`
- lightweight `pgrep -lf copilot` process detection

Exa verification against GitHub Docs confirmed the currently supported hook triggers: `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, and `errorOccurred`. AISnitch now installs a tiny Node bridge script that tags each stdin payload with its hook name and forwards it to `http://localhost:<port>/hooks/copilot-cli`.

The hook layer covers fast, low-latency signals:

- `sessionStart` -> `session.start` + `agent.idle`
- `sessionEnd` -> `session.end`
- `userPromptSubmitted` -> `task.start`
- `preToolUse` -> `agent.tool_call` or `agent.coding`
- `postToolUse` -> replay the tool/coding state on success, or `agent.error` on failure
- `errorOccurred` -> `agent.error`

The session-state watcher fills in richer passive details such as:

- assistant reasoning text -> `agent.thinking`
- assistant reply text -> `agent.streaming`
- `tool.execution_start` -> `agent.tool_call` or `agent.coding`
- `tool.execution_complete` failures -> `agent.error`
- `session.task_complete` -> `task.complete`
- `session.warning` -> `agent.asking_user`
- `session.model_change` -> metadata refresh

`aisnitch setup copilot-cli` now writes two repository-local files:

- `.github/hooks/aisnitch.json` with the configured hook entries
- `.github/hooks/scripts/aisnitch-forward.mjs` as the shared Bash/PowerShell bridge

That choice matches the current GitHub Docs model for Copilot CLI hooks and avoids any global machine mutation for repository policy.

## Aider

`src/adapters/aider.ts` mixes three signals that complement each other well:

- active `aider` process discovery to find the current project directory
- per-project `.aider.chat.history.md` watching inside those active directories
- `notifications-command` hooks that nudge AISnitch when Aider returns to an idle/waiting state

The project-scoped history file is the key constraint. Aider does not keep one centralized session log, so AISnitch first finds active `aider` processes, resolves their CWD, then watches:

- `<cwd>/.aider.chat.history.md`

The markdown parser is intentionally conservative. It extracts only high-signal structures:

- `#### ...` user headings -> `task.start` or `agent.tool_call` for slash commands
- assistant prose blocks -> `agent.streaming`
- SEARCH/REPLACE file blocks -> `agent.coding`
- quoted `Tokens: ...` status lines -> `agent.thinking`
- quoted failures/warnings -> `agent.error`
- quoted confirmation prompts -> `agent.asking_user`

`aisnitch setup aider` now updates `~/.aider.conf.yml` with a `notifications-command` that runs the AISnitch internal `aider-notify` bridge. That bridge is intentionally fire-and-forget so Aider never blocks on local observability.

## Generic PTY fallback

`src/adapters/generic-pty.ts` is not a background adapter registered in config. It is a runtime wrapper used by:

- `aisnitch wrap <command>`

The PTY wrapper does four things:

1. spawn the target command inside `@lydell/node-pty`
2. forward the terminal output unchanged so the user sees the normal tool UX
3. forward parent stdin plus terminal resizes back into the PTY
4. emit best-effort AISnitch events from ANSI/text heuristics

The heuristics intentionally stay explainable:

- spinner frames and "thinking"/"planning" text -> `agent.thinking`
- patch/apply/write/update text and file-path hits -> `agent.coding`
- confirmation/prompt patterns -> `agent.asking_user`
- red ANSI or explicit error text -> `agent.error`
- everything else with meaningful output -> `agent.streaming`

When a daemon is already running, `wrap` forwards events into that daemon over the local UDS ingress. When no daemon is running, AISnitch spins up a temporary in-process pipeline with a local text monitor so the wrapped session is still observable without background setup.

## OpenClaw

`src/adapters/openclaw.ts` closes the secondary-adapter pass with a layered OpenClaw integration built around the signals that currently exist in the real product:

- **Plugin SDK** (`aisnitch setup openclaw` installs `~/.openclaw/plugins/aisnitch-monitor/`): highest-fidelity strategy using Plugin SDK hooks (`before_tool_call`, `after_tool_call`, `agent_end`, `model_call_started`, `model_call_ended`, etc.) for real-time tool names, parameters, results, errors, durations, and model telemetry
- managed global hooks under `~/.openclaw/hooks/aisnitch-forward/`
- built-in `command-logger` output in `~/.openclaw/logs/commands.log`
- transcript JSONL files under `~/.openclaw/agents/*/sessions/*.jsonl`
- workspace memory markdown under `~/.openclaw/workspace*/memory/`
- `pgrep -ifl openclaw` process fallback

That stack matters because OpenClaw's current public docs expose rich hooks and workspace state, but not a stable native outbound AISnitch-style webhook section. AISnitch therefore installs one managed hook plus a Plugin SDK plugin instead of pretending a nonexistent config block is available.

The adapter maps OpenClaw activity like this:

- `gateway:startup` / `agent:bootstrap` -> `session.start` + `agent.idle`
- `command:new` / `/new` -> `task.start`
- `model_call_started` -> `agent.thinking` (with model/provider info)
- `model_call_ended` -> `agent.streaming` (with duration/outcome)
- `before_tool_call` -> `agent.tool_call` or `agent.coding` (early detection)
- `tool_result_persist` -> `agent.tool_call` or `agent.coding` (with results, errors, duration)
- `before_compaction` / `session:compact:before` -> `agent.compact`
- `/stop` -> `task.complete`
- `/reset` / `gateway:shutdown` -> `session.end`
- memory file mutations -> `agent.compact` hints
- transcript assistant text -> `agent.streaming`
- transcript thinking-like entries -> `agent.thinking`

The OpenCode and OpenClaw adapters now share one useful product lesson: tools do not always emit clean lifecycle events at the exact moment an observer wants them. AISnitch therefore infers the missing edges conservatively instead of waiting forever for a theoretically perfect hook.

## Validation Notes

This pass adds automated coverage for:

- Gemini hook mapping
- Gemini `logs.json` fallback parsing
- Gemini process detection
- Codex command log parsing
- Codex patch-target parsing
- Codex process detection
- Goose API polling and SQLite fallback parsing
- Goose SSE tool-request mapping
- Goose process detection
- Copilot hook mapping, session-state parsing, and process detection
- Goose/Copilot setup command support
- Aider markdown parsing and process-driven session discovery
- Aider setup command support for `notifications-command`
- Generic PTY heuristics plus CLI `wrap` argument passthrough
- OpenClaw hook mapping, command-log parsing, transcript watching, memory watching, and process fallback detection

What remains for later task groups is the rest of the secondary-adapter backlog, not missing core infrastructure for Goose or Copilot CLI.
