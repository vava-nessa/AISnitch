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

### Changed
- Migrated the project license from MIT to Apache 2.0.
- Reworked the root README around the current single-package AISnitch scope and development workflow.
- Replaced the initial `events` and `config` placeholders with production-ready modules and test coverage.
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
