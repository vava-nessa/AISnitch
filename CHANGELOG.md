# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.2.19] / [@aisnitch/client 0.2.19] - 2026-05-07

### Changed
- Bump to 0.2.19.

## [0.2.18] / [@aisnitch/client 0.2.18] - 2026-05-07

### Changed
- Bump to 0.2.18.

## [0.2.17] / [@aisnitch/client 0.2.17] - 2026-05-07

### Changed
- Bump to 0.2.17.

## [0.2.16] / [@aisnitch/client 0.2.16] - 2026-04-01

### Changed
- Bump to 0.2.16.

## [0.2.15] / [@aisnitch/client 0.2.15] - 2026-04-01

### Changed
- Bump to 0.2.15.

## [0.2.14] / [@aisnitch/client 0.2.14] - 2026-04-01

### Fixed
- Sync `AISNITCH_VERSION` constant in `src/package-info.ts` with published package version — was stuck at 0.2.12 causing the TUI, CLI, and WebSocket welcome message to display the wrong version number.
- Add mandatory bump checklist item to `AGENTS.md` to prevent this from happening again.

## [0.2.13] / [@aisnitch/client 0.2.13] - 2026-04-01

### Fixed
- Remove invalid Claude Code hook event names (`TaskCreated`, `CwdChanged`, `FileChanged`) from `aisnitch setup claude-code` — these events do not exist in the Claude Code hook schema and caused the entire `settings.json` to be skipped.
- Clean up dead code in `ensureClaudeAISnitchHook`: removed `CLAUDE_FILE_CHANGED_MATCHER` constant and simplified the group creation logic.

## [0.2.12] / [@aisnitch/client 0.2.12] - 2026-04-01

### Fixed
- Fix lint error in `fullscreen-ink.d.ts` (`any` → `unknown`) that was blocking all CI/Release workflows since 0.2.6.
- Add `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` env var to CI workflow.

## [0.2.11] / [@aisnitch/client 0.2.11] - 2026-04-01

### Changed
- Bump version after fixing CI and npm token issues.
- No functional changes.

## [0.2.10] / [@aisnitch/client 0.2.10] - 2026-04-01

### Changed
- Fullscreen TUI integration via `fullscreen-ink`.
- CI workflow pnpm version aligned to 10.33.0.
- Minor documentation updates.

## [0.2.9] / [@aisnitch/client 0.2.9] - 2026-04-01

### Changed
- Bumped package version to 0.2.9 and aligned AISNITCH_VERSION constant.
- Updated tests and documentation to reflect new version.
- No functional changes.


## [0.2.8] / [@aisnitch/client 0.2.8] - 2026-03-31

### Fixed
- **Release verification failed on `v0.2.7` during `pnpm check`** — `ClaudeCodeSetup` introduced override/signature mismatches that `tsc --noEmit` correctly rejected in CI. The setup overrides are now declared correctly and the extra backup helper no longer collides with the base class API.
- **Release workflow failed before install on `v0.2.6`** — `.github/workflows/release.yml` pinned `pnpm/action-setup` to `10.24.0` while the repository now declares `packageManager: pnpm@10.33.0`. The workflow now uses `10.33.0`, so tag-based releases boot cleanly again.
- **Claude Code hook bridge could throw `PreToolUse` / `PostToolUse` errors for tools like `Read` and `Grep`** — AISnitch setup was still installing legacy Claude hooks as `type: "http"`, while current Claude Code expects command hooks fed via stdin JSON. `aisnitch setup claude-code` now installs a local `~/.claude/aisnitch-forward.mjs` bridge, forwards stdin payloads to the AISnitch HTTP receiver, and replaces stale AISnitch HTTP hook entries automatically.

## [0.2.7] / [@aisnitch/client 0.2.7] - 2026-03-31

### Fixed
- **Release workflow failed before install on `v0.2.6`** — `.github/workflows/release.yml` pinned `pnpm/action-setup` to `10.24.0` while the repository now declares `packageManager: pnpm@10.33.0`. The workflow now uses `10.33.0`, so tag-based releases boot cleanly again.
- **Claude Code hook bridge could throw `PreToolUse` / `PostToolUse` errors for tools like `Read` and `Grep`** — AISnitch setup was still installing legacy Claude hooks as `type: "http"`, while current Claude Code expects command hooks fed via stdin JSON. `aisnitch setup claude-code` now installs a local `~/.claude/aisnitch-forward.mjs` bridge, forwards stdin payloads to the AISnitch HTTP receiver, and replaces stale AISnitch HTTP hook entries automatically.

## [0.2.6] / [@aisnitch/client 0.2.6] - 2026-03-31

### Fixed
- **Claude Code hook bridge could throw `PreToolUse` / `PostToolUse` errors for tools like `Read` and `Grep`** — AISnitch setup was still installing legacy Claude hooks as `type: "http"`, while current Claude Code expects command hooks fed via stdin JSON. `aisnitch setup claude-code` now installs a local `~/.claude/aisnitch-forward.mjs` bridge, forwards stdin payloads to the AISnitch HTTP receiver, and replaces stale AISnitch HTTP hook entries automatically.
## [0.2.5] / [@aisnitch/client 0.2.5] - 2026-03-30

### Fixed
- **Terminal never detected in mascot dashboard** — Claude Code and OpenCode adapters were not passing `process.env` in their `AdapterPublishContext`, so the context detector couldn't detect the terminal from `TERM_PROGRAM`, `ITERM_SESSION_ID`, etc. Both adapters now forward env vars.
- **LLM model never displayed in mascot dashboard** — the `model` field from `event.data.model` was never stored in `AgentCardState`. Now stored and displayed as a purple pill in the card header.
- **OpenCode adapter missing model extraction** — added `model` extraction from payload (`model` or `properties.model`).

### Added
- **Model pill** in mascot dashboard card header — shows the active LLM model (e.g. `claude-opus-4-6`) next to the terminal pill.
- **Header pills layout** — terminal and model pills now wrap gracefully on narrow cards.

## [0.2.4] / [@aisnitch/client 0.2.4] - 2026-03-30

### Fixed
- **No `uncaughtException` / `unhandledRejection` handlers in foreground TUI mode** — a single unhandled promise rejection would silently kill the process. Both handlers are now registered identically to the existing daemon-mode handlers.
- **`BaseAdapter.emit()` had no try/catch** — the single publishing path used by ALL adapters could crash the entire daemon. Publishing failures are now caught, logged, and swallowed.
- **`Pipeline.start()` left orphaned servers on partial failure** — if any component (WS, HTTP, UDS, adapters) failed to start, previously started components were never torn down. `start()` now wraps the full startup sequence in try/catch with `rollbackPartialStart()`.
- **`Pipeline.stop()` failed fast** — one component failure prevented all subsequent components from shutting down. Each component is now stopped independently with its own try/catch.
- **`AdapterRegistry.startAll()` / `stopAll()` lacked per-adapter isolation** — one failing adapter blocked the rest. Each adapter now starts/stops independently with individual error logging.
- **`EventBus.publish()` subscriber errors crashed the daemon** — `emitter.emit()` does not catch listener exceptions. Both global and typed emits are now wrapped in try/catch.
- **Unguarded `JSON.parse` in 4 WebSocket message parsers** — a single corrupted WebSocket frame could crash the app. All four parsers (`ManagedDaemonApp.tsx`, `useEventStream.ts`, `live-monitor.ts`, `live-logger.ts`) now wrap `JSON.parse` in try/catch.
- **`HTTPReceiver.handleRequest()` — `new URL()` could throw on malformed request URLs** — now returns 400 instead of crashing via an unhandled rejection.
- **WebSocket server leaked dead consumers** — socket `error` events were logged but the consumer was never removed from the map, accumulating stale state. `consumers.delete(socket)` is now called on error.
- **`Pipeline.publishEvent()` enrichment failure crashed the event stream** — if context enrichment failed (e.g. `ps`, `pgrep` errors), the entire event was dropped. The original un-enriched event is now published as fallback.
- **`Pipeline.handleHook()` had no top-level error boundary** — any uncaught error in a hook handler would propagate and crash. A try/catch wrapper now logs and swallows hook handler errors.
- **Client SDK: auto-reconnect permanently broken after `disconnect()`** — `_autoReconnectDisabled` flag was never reset on subsequent `connect()` calls, making the client silently drop events after any intentional disconnect/reconnect cycle.
- **Client SDK: stale welcome data** — `_welcome` is now cleared on `disconnect()` to prevent serving outdated daemon metadata after a reconnect.
- **Client SDK: invalid numeric options could cause tight reconnect loops** — constructor now validates `reconnectIntervalMs` and `maxReconnectIntervalMs`, rejecting `0`, `NaN`, and negative values at construction time with a clear error message.

### Changed
- **Version alignment**: `aisnitch` and `@aisnitch/client` now share the same version number (0.2.4). Both packages are always released together to guarantee compatibility.
- **Release workflow** now publishes both `aisnitch` and `@aisnitch/client` from the same tag push, with `continue-on-error` on the main package to tolerate re-published versions.

## [@aisnitch/client 0.1.1] - 2026-03-29

### Fixed
- Updated README with comprehensive docs (5 use cases, React/Vue hooks, full API reference, troubleshooting) so the npm package page has proper documentation.

## [@aisnitch/client 0.1.0] - 2026-03-29

### Added
- **`@aisnitch/client` SDK** — new `packages/client/` package providing a lightweight TypeScript SDK for consuming the AISnitch WebSocket event stream. Features: `AISnitchClient` with auto-reconnect (exponential backoff), Zod-validated event parsing, `SessionTracker` for live session state, composable typed `filters`, human-readable `describeEvent()` / `formatStatusLine()`, and `eventToMascotState()` for animated companions. Dual ESM + CJS build, zero prod deps (zod as peer dep), works in both Node.js and browser.
- pnpm workspace setup (`pnpm-workspace.yaml`) to support the new `packages/client/` package alongside the main `aisnitch` package.

### Changed
- Complete README rewrite with comprehensive consumer integration guide (React hook, Vue composable, vanilla JS, Node.js examples, human-readable status builder, session tracking, sound/notification triggers, mascot/companion state mapping).
- README now recommends `@aisnitch/client` SDK instead of raw WebSocket boilerplate for consuming events.

## [0.2.3] - 2026-03-28

### Added
- New `aisnitch logger` command that streams exhaustive live event output without the TUI, flattening nested fields like `data.raw.*` into one readable line per path.

## [0.2.2] - 2026-03-28

### Fixed
- Daemon readiness polling now ignores normal structured `info` log lines, so successful boot messages like `UDS server started` no longer get misclassified as fatal startup failures.

## [0.2.1] - 2026-03-28

### Fixed
- GitHub release publishing now grants `id-token: write` so `npm publish --provenance` can complete instead of failing after tag push.
- npm package metadata now uses a clean `bin.aisnitch` path without the publish-time auto-correction warning.
- CI now blocks merges when the release workflow loses required npm publish permissions or when `npm publish --dry-run` stops packaging cleanly.
- Trusted publishing release jobs now run on Node 22 and no longer depend on a repository `NPM_TOKEN` secret.
- The npm release workflow now falls back to a fresh automation token because npm's trusted publisher path kept returning registry `404` errors for this package despite a valid OIDC configuration.
- Daemon startup now probes a wider local port range and bubbles the actual daemon log failure instead of hiding startup crashes behind a generic readiness timeout.

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
