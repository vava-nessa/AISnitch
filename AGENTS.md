Please run lints and tests before considering something finished, to check errors and fix them.

Add some well organized error handlers, to avoid any hard crash.

Comment code with full explanations, in english, and create/update documentation in ./docs/index.md <-- documentation index, linking to other markdown files with explanations of how it works, etc... To give a lot of technical details about it. 

Tasks are managed in ./tasks/tasks.md <-- kanban board, with tasks organized by status (todo, in-progress, done, etc...) 

When i say "work" please check the current state of what is done, pick a task, ask me if it is ok, and continue with it. When you fibnish it, please update the ./tasks/ files accordingly, check done things, update and add remarks etc...

When publishing work (commit/push), the commit message must explicitly reference the current task from the markdown task files (task number and/or task slug/title). This is now the standard for future commits.

For this repository, stay on `main` by default. Do not create dedicated branches unless the user explicitly asks for one.

## Versioning & Release

`aisnitch` and `@aisnitch/client` share the **same version number** and are always released together. This guarantees the daemon and client SDK are compatible at any given release.

### How to bump

**Always use the bump script** — it handles everything atomically:

```bash
pnpm bump <X.Y.Z>
```

The script (`scripts/bump.mjs`) does the following in order:
1. Updates `package.json` and `packages/client/package.json` to the new version
2. Adds a CHANGELOG entry under `## [Unreleased]`
3. Runs `pnpm build` (which injects the version at build time via tsup — see below)
4. Runs `pnpm test` to verify nothing broke
5. Commits the 3 changed files, tags `vX.Y.Z`, pushes main + tag

**IMPORTANT**: commit all code changes BEFORE running `pnpm bump`. The bump script only stages and commits `package.json`, `packages/client/package.json`, and `CHANGELOG.md`. Any uncommitted code changes will NOT be included in the tagged release.

### How the version flows

The version number lives in ONE place: `package.json`. Everything else reads from it:

- **`src/package-info.ts`** — exports `AISNITCH_VERSION` which is injected at build time via `__AISNITCH_VERSION__` (defined in `tsup.config.ts` and `vitest.config.ts`). **Never edit this file manually.**
- **TUI, CLI, WebSocket welcome** — all consume `AISNITCH_VERSION` from `package-info.ts`
- **Tests** — import `AISNITCH_VERSION` from `package-info.ts` (no hardcoded version strings)

### CI & Release

- **CI** (`.github/workflows/ci.yml`): 2 jobs — `aisnitch` and `client`, both on Node 22. Runs lint, typecheck, test, build, coverage. The `aisnitch` job also runs a release preflight (`npm publish --dry-run`).
- **Release** (`.github/workflows/release.yml`): triggered by `v*` tags. Builds and publishes both packages to npm with provenance, creates a GitHub release with tarball + Homebrew formula.
- After bumping, verify a few minutes later that npm really exposes the new version for both packages, and report the result clearly.
