# Testing

## Purpose

AISnitch now ships with a three-layer testing strategy:

- fast unit + integration tests under Vitest
- deterministic CLI demo coverage via `aisnitch mock`
- a real OpenCode smoke test under a dedicated E2E Vitest config

## Vitest structure

`vitest.config.ts` is the default config for repository-safe checks:

- environment: `node`
- include: `src/**/*.test.ts`
- exclude: `src/__e2e__/**`
- setup file: `src/test-utils/setup.ts`
- coverage provider: V8

`vitest.e2e.config.ts` is separate on purpose:

- include: `src/__e2e__/**/*.test.ts`
- timeout: 60s
- same shared setup file

That split keeps `pnpm test` deterministic for CI while still allowing `pnpm test:e2e` to exercise a real external tool.

## Shared test helpers

`src/test-utils/index.ts` centralizes the fixtures that multiple suites reuse:

- `createMockEvent()` for valid AISnitch CloudEvents
- `createMockAdapter()` for `BaseAdapter` lifecycle coverage
- `createTestEventBus()` for isolated pub/sub tests
- `waitForEvent()` for async event assertions

## Mock command

`src/cli/mock/scenarios.ts` and `src/cli/commands/mock.ts` power:

- `aisnitch mock claude-code`
- `aisnitch mock opencode`
- `aisnitch mock all`
- `aisnitch start --mock`

The important design choice is that mock events go through the exact same pipeline shape as real events. That makes demos, TUI development, and CI less fake than a bespoke fixture renderer would be.

## OpenCode smoke test

`src/__e2e__/smoke.test.ts` verifies the full path:

1. start a real in-process AISnitch pipeline
2. connect a real WebSocket client
3. install the generated OpenCode plugin into a temporary config directory
4. run `opencode run "Say hello in one word"`
5. assert that AISnitch receives valid OpenCode events

The smoke test is intentionally tolerant of model/provider failures. The plugin now infers `session.start` from `session.updated` and `task.start` from the first user `message.part.updated`, because `opencode run` can initialize plugins after `session.created` has already fired.

## Coverage notes

Current coverage is strongest in the core/runtime layers:

- `src/core/` is above the MVP target of 70%
- adapter coverage focuses on mapping logic and fallbacks
- TUI coverage stays selective, targeting stateful or formatting-heavy paths instead of snapshotting every Ink component
