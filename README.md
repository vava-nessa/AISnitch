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
- Best-effort context enrichment for terminal, cwd, pid, and multi-instance metadata
- Commander-based CLI with `start`, `stop`, `status`, `adapters`, `attach`, `install`, and `uninstall`
- Detached daemon mode with PID/state files and a temporary live monitor until the full Ink TUI ships
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
# Foreground mode with an inline live monitor
node dist/cli/index.js start

# Detached daemon mode
node dist/cli/index.js start --daemon

# Inspect or attach to the daemon
node dist/cli/index.js status
node dist/cli/index.js attach

# Stop the detached daemon
node dist/cli/index.js stop

# Configure supported tools
node dist/cli/index.js setup claude-code
node dist/cli/index.js setup opencode
node dist/cli/index.js setup claude-code --revert
```

`attach` currently uses a lightweight text monitor over WebSocket. The richer Ink-based TUI is still tracked separately in `05-tui`.

`setup` is interactive by design: AISnitch prints the proposed diff, asks for confirmation, then writes a `.bak` backup before applying changes. Claude Code is configured through `~/.claude/settings.json`, while OpenCode uses a local plugin file under `~/.config/opencode/plugins/`.

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
