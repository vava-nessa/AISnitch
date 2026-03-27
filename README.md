# AISnitch

[![Node >=20](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)
[![Status: Foundation](https://img.shields.io/badge/status-foundation-orange)](./tasks/tasks.md)

Universal AI coding activity bridge for capturing, normalizing, and streaming tool events in real time.

AISnitch is a single-package Node.js project that will expose a live event stream for AI coding tools such as Claude Code, Codex, Gemini CLI, OpenCode, Goose, and others. The MVP is memory-only by design: events are ingested, normalized, streamed, and dropped without persistence.

## Project Docs

- **Kanban & tâches MVP**: [`tasks/tasks.md`](./tasks/tasks.md)
- **Research source**: [`CLAUDE_DATA.md`](./CLAUDE_DATA.md)
- **Technical docs index**: [`docs/index.md`](./docs/index.md)
- **Core pipeline internals**: [`docs/core-pipeline.md`](./docs/core-pipeline.md)
- **CLI & daemon internals**: [`docs/cli-daemon.md`](./docs/cli-daemon.md)
- **Tool setup internals**: [`docs/tool-setup.md`](./docs/tool-setup.md)
- **Priority adapters internals**: [`docs/priority-adapters.md`](./docs/priority-adapters.md)
- **Secondary adapters internals**: [`docs/secondary-adapters.md`](./docs/secondary-adapters.md)
- **TUI internals**: [`docs/tui.md`](./docs/tui.md)

## Current Scope

- Single npm package named `aisnitch`
- TypeScript strict mode with ESM-first source
- `tsup` build output for both ESM and CJS consumers
- CloudEvents-based event schema with UUIDv7 factory and CESP compatibility mapping
- Persistent config system for `~/.aisnitch/config.json` with port fallback helpers
- Typed in-memory `EventBus` powered by `eventemitter3` and structured `pino` logging
- Localhost-only WebSocket stream with welcome payloads, per-consumer ring buffers, and heartbeat checks
- Localhost-only HTTP hook receiver and NDJSON Unix domain socket ingress orchestrated by a central `Pipeline`
- Built-in adapter layer with `BaseAdapter`, `AdapterRegistry`, and pipeline-managed lifecycle
- Priority adapters for Claude Code (hooks + JSONL + process fallback) and OpenCode (plugin hooks + process fallback)
- Secondary adapters for Gemini CLI, Codex, Goose, Copilot CLI, and Aider with hook, API/SSE, file-watch, transcript, or process-detection fallbacks depending on the tool
- Generic PTY wrapping for tools without a dedicated adapter via `aisnitch wrap <command>`
- Best-effort context enrichment for terminal, cwd, pid, and multi-instance metadata
- Commander-based CLI with `start`, `stop`, `status`, `adapters`, `attach`, `install`, and `uninstall`
- Detached daemon mode with PID/state files and a shared Ink attach/foreground monitoring surface
- Ink-based TUI with responsive header, live event stream, session panel, filters, help overlay, and CLI pre-filters
- `pnpm` workflow with lint, typecheck, test, and build scripts

## Install

The package is not published yet, but the CLI is runnable locally after a build:

```bash
pnpm install
pnpm build
node dist/cli/index.js --help
```

When the package is installed globally, the same commands will be available through `aisnitch`.

## CLI Usage

```bash
# Foreground mode with the Ink TUI
node dist/cli/index.js start
node dist/cli/index.js start --tool claude-code
node dist/cli/index.js start --type agent.coding
node dist/cli/index.js start --view full-data

# Detached daemon mode
node dist/cli/index.js start --daemon

# Inspect or attach to the daemon
node dist/cli/index.js adapters
node dist/cli/index.js status
node dist/cli/index.js attach
node dist/cli/index.js attach --tool opencode
node dist/cli/index.js attach --view full-data

# Stop the detached daemon
node dist/cli/index.js stop

# Configure supported tools
node dist/cli/index.js setup claude-code
node dist/cli/index.js setup opencode
node dist/cli/index.js setup gemini-cli
node dist/cli/index.js setup aider
node dist/cli/index.js setup codex
node dist/cli/index.js setup goose
node dist/cli/index.js setup copilot-cli
node dist/cli/index.js setup claude-code --revert

# Wrap an arbitrary interactive tool inside AISnitch's PTY fallback
node dist/cli/index.js wrap aider --model sonnet
node dist/cli/index.js wrap goose session
```

Both foreground `start` and daemon `attach` now render the same Ink TUI shell. `--tool` and `--type` can pre-apply filters when the TUI opens.
`--view full-data` opens directly into the event inspector, which is useful when you want the complete normalized payload plus the raw adapter payload without toggling manually.

`setup` is interactive by design: AISnitch prints the proposed diff, asks for confirmation, then writes a `.bak` backup before applying changes. Claude Code is configured through `~/.claude/settings.json`, OpenCode uses a local plugin file under `~/.config/opencode/plugins/`, Gemini CLI extends `~/.gemini/settings.json`, Aider updates `~/.aider.conf.yml` with a `notifications-command`, Goose and Codex are armed as passive sources, and Copilot CLI installs a repository-local hook bridge under `.github/hooks/`.

Adapters are disabled by default until a setup flow enables them in `~/.aisnitch/config.json`. Use `node dist/cli/index.js adapters` to confirm the armed tools before expecting Claude Code or OpenCode activity to appear in the TUI.

`wrap` is the fallback path when a tool has no first-class adapter yet. AISnitch runs the target command inside a pseudo-terminal, forwards the full terminal I/O unchanged, and emits best-effort `thinking`, `coding`, `asking_user`, `error`, and `streaming` events from ANSI/text heuristics. When a daemon is already running, `wrap` forwards into it; otherwise it spins up an ephemeral local monitor for the wrapped session only.

## TUI Usage & Keybinds

The TUI is now the main live operator surface for both foreground and attach mode. It shows a formatted event stream on the left, active sessions on the right, a global activity badge in the header, and a filter bar above the panels.

Session labels are now derived from the best available context instead of showing only a raw opaque id. AISnitch combines project/workspace hints, instance counts, PID fallback, and short session fragments so concurrent runs from the same tool stay distinguishable in both the TUI and text monitor output.

The live stream is detail-aware too: when adapters expose enough signal, AISnitch surfaces prompt snippets, transcript thinking text, streamed assistant replies, tool/file targets, shell commands, model names, and token counts directly in the event rows and plain-text logs.

When you need the full payload, press `v` to switch the right-hand panel into a full-data inspector. It shows a curated spotlight summary first, then the normalized event JSON, then the raw source payload with syntax-style coloring. You can also boot straight into this mode with `--view full-data`.

- `q` / `Ctrl+C` quit cleanly
- `v` toggles the full-data inspector
- `f` opens the tool filter selector
- `t` opens the event-type filter selector
- `/` starts free-text search over buffered events and sessions
- `Esc` clears all active filters
- `Space` freezes or resumes the live tail
- `c` clears the local buffered event view
- `?` toggles the help overlay
- `Tab` cycles focus between the event and session panels
- `↑` / `↓` or `j` / `k` select events or scroll the inspector in full-data mode
- `[` / `]` page the inspector up or down in full-data mode

## Development

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Repository Layout

```text
src/
├── adapters/
├── cli/
├── core/
│   ├── config/
│   ├── engine/
│   └── events/
├── tui/
└── index.ts
```
