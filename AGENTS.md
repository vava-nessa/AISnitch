Please run lints and tests before considering something finished, to check errors and fix them.

Add some well organized error handlers, to avoid any hard crash.

Comment code with full explanations, in english, and create/update documentation in ./docs/index.md <-- documentation index, linking to other markdown files with explanations of how it works, etc... To give a lot of technical details about it. 

Tasks are managed in ./tasks/tasks.md <-- kanban board, with tasks organized by status (todo, in-progress, done, etc...) 

When i say "work" please check the current state of what is done, pick a task, ask me if it is ok, and continue with it. When you fibnish it, please update the ./tasks/ files accordingly, check done things, update and add remarks etc...

When publishing work (commit/push), the commit message must explicitly reference the current task from the markdown task files (task number and/or task slug/title). This is now the standard for future commits.

For this repository, stay on `main` by default. Do not create dedicated branches unless the user explicitly asks for one.

## Versioning & Release

`aisnitch` and `@aisnitch/client` share the **same version number** and are always released together. This guarantees the daemon and client SDK are compatible at any given release.

When i say "bump", treat it as a real release flow, not only a local version change:
- bump the version in **both** `package.json` and `packages/client/package.json` to the same `X.Y.Z`
- **MANDATORY**: also update `AISNITCH_VERSION` constant in `src/package-info.ts` to the same `X.Y.Z` — this is what the TUI, CLI, and WebSocket welcome message display at runtime. Forgetting this causes the displayed version to be wrong even after publish.
- update any hardcoded version strings in tests (e.g. `src/core/engine/__tests__/ws-server.test.ts`) to match
- update the changelog with a single `[X.Y.Z] / [@aisnitch/client X.Y.Z]` entry covering both packages
- commit and push on `main`
- create and push the matching git tag release (`vX.Y.Z`) so npm/github release automation can run
- the release workflow (`.github/workflows/release.yml`) is triggered by `v*` tags and publishes **both** packages to npm automatically
- verify a few minutes later that npm really exposes the new version for both packages, and report the result clearly
