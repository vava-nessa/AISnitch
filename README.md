# AISnitch

[![Node >=20](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)
[![Status: Scaffold](https://img.shields.io/badge/status-scaffold-orange)](./tasks/tasks.md)

Universal AI coding activity bridge for capturing, normalizing, and streaming tool events in real time.

AISnitch is a single-package Node.js project that will expose a live event stream for AI coding tools such as Claude Code, Codex, Gemini CLI, OpenCode, Goose, and others. The MVP is memory-only by design: events are ingested, normalized, streamed, and dropped without persistence.

## Project Docs

- **Kanban & tâches MVP**: [`tasks/tasks.md`](./tasks/tasks.md)
- **Research source**: [`CLAUDE_DATA.md`](./CLAUDE_DATA.md)
- **Technical docs index**: [`docs/index.md`](./docs/index.md)

## Current Scope

- Single npm package named `aisnitch`
- TypeScript strict mode with ESM-first source
- `tsup` build output for both ESM and CJS consumers
- Placeholder module layout for `core`, `adapters`, `cli`, and `tui`
- `pnpm` workflow with lint, typecheck, test, and build scripts

## Install

Installation instructions will be added once the CLI bootstrap and first runnable commands are in place.

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
