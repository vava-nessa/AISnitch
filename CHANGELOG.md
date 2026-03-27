# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Structured MVP task files under `tasks/` (8 task groups, 23 subtasks, Kanban in `tasks/tasks.md`).

### Changed
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
