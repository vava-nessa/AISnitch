# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Structured MVP task files under `tasks/` (8 task groups, 23 subtasks, Kanban in `tasks/tasks.md`).
- Initial `pnpm` project scaffold for `aisnitch` with strict TypeScript, ESLint flat config, `tsup`, and Vitest.
- CloudEvents-based event schema, type inference, UUIDv7 factory, and CESP mapping under `src/core/events/`.
- Persistent config schema, defaults, file loader, and port fallback helpers under `src/core/config/`.
- Technical docs bootstrap in `docs/index.md` and `docs/project-setup.md`.
- Additional technical docs for the event contract and config system in `docs/events-schema.md` and `docs/config-system.md`.
- In-memory core engine under `src/core/engine/` with a typed `eventemitter3` EventBus, shared `pino` logger, localhost WebSocket streaming, HTTP hook ingress, UDS NDJSON ingress, and pipeline orchestration.
- Best-effort runtime context enrichment for terminal, cwd, pid, and instance metadata via `ContextDetector`.
- Core pipeline technical documentation in `docs/core-pipeline.md`.
- Commander-based CLI runtime with `start`, `stop`, `status`, `adapters`, `attach`, `install`, and `uninstall`.
- Detached daemon supervision files (`aisnitch.pid`, `daemon-state.json`, `daemon.log`) and macOS LaunchAgent plist generation.
- Temporary live monitor for foreground mode and daemon attach while the full Ink TUI remains pending.
- CLI/daemon technical documentation in `docs/cli-daemon.md`.
- Interactive `setup <tool>` command for Claude Code and OpenCode, including diff preview, backups, and revert support.
- Dedicated tool setup documentation in `docs/tool-setup.md`.
- Built-in adapter subsystem with `BaseAdapter`, `AdapterRegistry`, and default adapter wiring inside the pipeline.
- Claude Code adapter with raw hook mapping, transcript JSONL enrichment, and process fallback detection.
- OpenCode adapter with plugin-event mapping and process fallback detection.
- Priority adapter technical documentation in `docs/priority-adapters.md`.
- Ink-based foreground TUI foundation with responsive layout primitives, shared theme tokens, and a live status shell.
- Dedicated TUI technical documentation in `docs/tui.md`.
- Live event stream UI for the foreground TUI with formatted event rows, bounded buffering, and freeze/resume controls.
- TUI event-stream tests covering icon rendering, 500-event retention, and frozen-tail behavior.
- Session-aware TUI controls with grouped active sessions, a global activity badge, tool/type/query filters, help overlay, and shared foreground/attach Ink rendering.
- TUI tests for filters, session derivation, session-panel rendering, and CLI pre-filter parsing.
- Best-effort session-identity helpers that derive richer fallback session ids and more readable session labels for logs, hooks, and the TUI.
- Richer event-detail formatting in the TUI and text monitor, surfacing prompts, transcript snippets, tool/file targets, commands, model names, and token counts when adapters provide them.

### Changed
- Migrated the project license from MIT to Apache 2.0.
- Reworked the root README around the current single-package AISnitch scope and development workflow.
- Replaced the initial `events` and `config` placeholders with production-ready modules and test coverage.
- Extended the README and docs index to reflect the now-implemented runtime pipeline.
- Replaced the CLI scaffold placeholder with a real commander-driven command surface and daemon lifecycle.
- Reworked the CLI docs to include tool setup flows and current OpenCode plugin-based integration.
- Reworked the runtime so enabled tool hooks are handled by built-in adapters before entering the shared event pipeline.
- Replaced the foreground and attach text monitors with one shared Ink TUI flow, including CLI-applied `--tool` / `--type` filters.
- Re-scoped product direction to **live-only memory pipeline** (no SQLite, no replay, no persisted stats).
- Repositioned MVP output to **TUI live monitoring** as primary consumer.
- Updated project positioning from macOS-only to **cross-platform**.
- Added mandatory research guidance across task files: AI may use Brave/Context7-Context8/Exa.ai, with `@CLAUDE_DATA.md` as primary source.
- Renamed project from AutoSnitch → **AISnitch** across all docs.
- Removed obsolete `tasks/prd-aisnitch-mvp/` and `tasks/kanban/` folders.
- Enriched `tasks/tasks.md` with NFR, Acceptance Criteria, and Risk register.
- Added **OpenClaw adapter** task (`06-adapters-secondary/04`) — 247k stars, TypeScript gateway hooks + workspace memory watcher.
- Added **Context Detector** task (`02-core-pipeline/04`) — terminal detection, CWD by PID, multi-instance tracking.
- Extended `AISnitchEvent` schema with context enrichment fields: `terminal`, `cwd`, `pid`, `instanceId`, `instanceIndex`, `instanceTotal`.
- Added `openclaw` to `ToolNames` enum.
