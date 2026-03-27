# Contributing

Thanks for contributing to AISnitch.

## Local setup

```bash
pnpm install
pnpm check
```

Node `>=20` is required. `pnpm` is the canonical package manager for this repository.

## Development workflow

1. Stay on `main` unless a maintainer explicitly asks for another branch.
2. Read [`AGENTS.md`](./AGENTS.md), [`README.md`](./README.md), and the relevant task files in [`tasks/`](./tasks/).
3. Keep documentation in sync when behavior changes:
   - [`README.md`](./README.md)
   - [`CHANGELOG.md`](./CHANGELOG.md)
   - [`docs/index.md`](./docs/index.md)
4. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before considering work done.

## Adding or updating an adapter

1. Start from [`src/adapters/base.ts`](./src/adapters/base.ts) and [`src/adapters/index.ts`](./src/adapters/index.ts).
2. Prefer the strongest passive signal the tool offers:
   - hooks / webhooks first
   - structured logs / transcripts second
   - process detection last
3. Keep raw source payloads in `event.data.raw`.
4. Add focused unit tests under [`src/adapters/__tests__`](./src/adapters/__tests__).
5. Update the relevant docs file under [`docs/`](./docs/).

## Coding conventions

- TypeScript strict mode only. Do not add `any`.
- Keep error handling explicit. AISnitch should degrade instead of hard-crashing.
- Add concise English comments with the `📖` prefix when the code benefits from explanation.
- Add or update JSDoc headers on new public or architectural files.

## Pull requests

- Keep PRs/task chunks coherent.
- Reference the task markdown slug in the commit message.
- Include verification commands and any manual validation notes.
