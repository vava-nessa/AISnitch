# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed
- Complete README rewrite with comprehensive consumer integration guide (React hook, Vue composable, vanilla JS, Node.js examples, human-readable status builder, session tracking, sound/notification triggers, mascot/companion state mapping).

### Fixed
- GitHub release publishing now grants `id-token: write` so `npm publish --provenance` can complete instead of failing after tag push.
- npm package metadata now uses a clean `bin.aisnitch` path without the publish-time auto-correction warning.
- CI now blocks merges when the release workflow loses required npm publish permissions or when `npm publish --dry-run` stops packaging cleanly.
- Trusted publishing release jobs now run on Node 22 and no longer depend on a repository `NPM_TOKEN` secret.

## [0.2.0] - 2026-03-28

### Added
- Managed daemon dashboard TUI that always opens, shows daemon state live, exposes the WebSocket URL, and can start or stop the daemon from inside the UI.
- Silent background self-updater on every dashboard launch with automatic install-manager detection for `npm`, `pnpm`, `bun`, and `brew`.

### Fixed
- `aisnitch start` now scrubs orphaned Unix socket paths before boot so stale `aisnitch.sock` files no longer block foreground or daemon startup after a crash.
- The CLI runtime now propagates `AISNITCH_HOME` path overrides consistently instead of silently falling back to `~/.aisnitch`.
- `aisnitch start` and `aisnitch attach` now open a daemon dashboard instead of failing when the daemon is offline or already active, and the TUI exposes daemon toggle/status metadata plus the live WebSocket URL.

## [0.1.0] - 2026-03-28

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
- Gemini CLI adapter with command-hook mapping, local `logs.json` fallback parsing, and process detection.
- Codex adapter with passive `codex-tui.log` parsing and process detection.
- Goose adapter with goosed API polling, SSE event streaming, SQLite session fallback, and process detection.
- Copilot CLI adapter with repository hook forwarding, session-state JSONL parsing, workspace metadata enrichment, and process detection.
- Aider adapter with active-project `.aider.chat.history.md` watching, markdown parsing, process detection, and `notifications-command` support.
- Generic PTY wrapper with `aisnitch wrap <command>`, terminal I/O forwarding, and ANSI/text heuristics for best-effort live activity capture.
- Priority adapter technical documentation in `docs/priority-adapters.md`.
- Secondary adapter technical documentation in `docs/secondary-adapters.md`.
- Ink-based foreground TUI foundation with responsive layout primitives, shared theme tokens, and a live status shell.
- Dedicated TUI technical documentation in `docs/tui.md`.
- Live event stream UI for the foreground TUI with formatted event rows, bounded buffering, and freeze/resume controls.
- TUI event-stream tests covering icon rendering, 500-event retention, and frozen-tail behavior.
- Session-aware TUI controls with grouped active sessions, a global activity badge, tool/type/query filters, help overlay, and shared foreground/attach Ink rendering.
- TUI tests for filters, session derivation, session-panel rendering, and CLI pre-filter parsing.
- Best-effort session-identity helpers that derive richer fallback session ids and more readable session labels for logs, hooks, and the TUI.
- Richer event-detail formatting in the TUI and text monitor, surfacing prompts, transcript snippets, tool/file targets, commands, model names, and token counts when adapters provide them.
- Toggleable full-data TUI inspector with a colorful spotlight summary, syntax-colored JSON payload rendering, event selection, inspector scrolling, and `--view full-data` CLI entrypoints.
- OpenClaw adapter with managed hooks, command-log watching, transcript JSONL parsing, workspace-memory watching, and process fallback detection.
- Shared Vitest config, dedicated E2E config, and reusable test helpers under `src/test-utils/`.
- Deterministic `aisnitch mock` scenarios plus `start --mock` support for demos and CI-friendly smoke paths.
- Real `pnpm test:e2e` OpenCode smoke coverage using `opencode run` and a temporary generated plugin.
- npm/Homebrew release assets: formula, formula SHA update script, CI workflow, and release workflow.
- Repository community scaffolding with `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue templates, PR template, and example WebSocket consumers.
- Release-facing docs for testing, distribution, launch planning, and a VHS-generated TUI demo GIF in `docs/assets/`.

### Changed
- Migrated the project license from MIT to Apache 2.0.
- Reworked the root README around the current single-package AISnitch scope and development workflow.
- Replaced the initial `events` and `config` placeholders with production-ready modules and test coverage.
- Extended the README and docs index to reflect the now-implemented runtime pipeline.
- Replaced the CLI scaffold placeholder with a real commander-driven command surface and daemon lifecycle.
- Reworked the CLI docs to include tool setup flows and current OpenCode plugin-based integration.
- Reworked the runtime so enabled tool hooks are handled by built-in adapters before entering the shared event pipeline.
- Extended the interactive setup flow to cover passive Goose arming and repository-scoped Copilot CLI hook installation.
- Replaced the foreground and attach text monitors with one shared Ink TUI flow, including CLI-applied `--tool` / `--type` filters.
- Extended the CLI/tooling surface with `setup aider`, the internal `aider-notify` bridge, and the new `wrap` runtime mode.
- Fixed pipeline fallback port selection so the HTTP and WebSocket servers no longer pick the same replacement port before binding.
- Isolated ephemeral `wrap` pipelines into a temporary home directory so they do not collide with the main daemon socket path.
- Reworked the generated OpenCode plugin so `opencode run` reliably emits `session.start` and `task.start` even when plugin initialization happens after `session.created`.
- Expanded the public README from a dev scaffold into a release-facing guide with architecture, supported tools, consumer examples, testing instructions, and contributing links.
- Tightened packaging metadata and local install validation so the packed artifact and Homebrew formula are derived from the same tarball.
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

### Fixed
- `aisnitch start` now scrubs orphaned Unix socket paths before boot so stale `aisnitch.sock` files no longer block foreground or daemon startup after a crash.
- The CLI runtime now propagates `AISNITCH_HOME` path overrides consistently instead of silently falling back to `~/.aisnitch`.
- `aisnitch start` and `aisnitch attach` now open a daemon dashboard instead of failing when the daemon is offline or already active, and the TUI exposes daemon toggle/status metadata plus the live WebSocket URL.

### Added
- Silent background self-update checks on every dashboard launch, with automatic install-manager detection for `npm`, `pnpm`, `bun`, and `brew`.
