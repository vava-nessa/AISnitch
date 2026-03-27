# Project Setup

## Why this scaffold exists

The project starts as a single npm package on purpose. The current MVP decisions in [`tasks/tasks.md`](../tasks/tasks.md) explicitly reject a multi-package monorepo and a persisted event store, so this setup keeps the repo small, fast to iterate on, and aligned with the current scope.

## Tooling choices

- `pnpm` is the package manager and lockfile owner
- TypeScript runs in strict `NodeNext` mode to support modern ESM-first authoring
- `tsup` builds dual outputs so future consumers can import `aisnitch` from either ESM or CommonJS
- ESLint uses flat config with `@typescript-eslint` rules and an explicit ban on `any`
- Vitest provides the initial fast test runner without introducing extra framework wiring

## Source layout

```text
src/
├── adapters/        # Tool integrations and adapter contracts
├── cli/             # CLI entry points and command dispatch
├── core/            # Shared schemas, engine pieces, config, state
│   ├── config/
│   ├── engine/
│   └── events/
├── tui/             # Ink-driven terminal UI modules
└── index.ts         # Public package entrypoint
```

## Build and verification flow

Use the repository from the root with the following commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm build` emits `dist/` with ESM, CJS, and declaration files. The CLI binary target is `dist/cli/index.js`, which is already wired in `package.json` even though the real command set will arrive in the next task group.
