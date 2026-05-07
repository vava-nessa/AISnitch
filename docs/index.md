# Documentation Index

This folder tracks the technical documentation that complements the task board and the source tree.

## Available docs

- [`project-setup.md`](./project-setup.md) — package scaffold, tooling choices, and folder structure
- [`events-schema.md`](./events-schema.md) — normalized CloudEvents contract and CESP mapping layer
- [`config-system.md`](./config-system.md) — persisted config shape, loader rules, and port fallback logic
- [`core-pipeline.md`](./core-pipeline.md) — in-memory EventBus, WS/HTTP/UDS ingress-egress, and context enrichment flow
- [`cli-daemon.md`](./cli-daemon.md) — commander command surface, PM2-style dashboard flow, daemon supervision files, LaunchAgent flow, and the raw `logger` mode
- [`tool-setup.md`](./tool-setup.md) — interactive configuration of Claude Code, OpenCode, Gemini, Aider, Codex, Goose, and Copilot CLI forwarding into AISnitch
- [`priority-adapters.md`](./priority-adapters.md) — BaseAdapter lifecycle, Claude Code mapping, and OpenCode plugin integration
- [`secondary-adapters.md`](./secondary-adapters.md) — Gemini/Codex, Goose/Copilot, Aider/PTY, and OpenClaw hook-log-memory integration
- [`tui.md`](./tui.md) — Ink dashboard rendering, daemon controls, filters, and the full-data event inspector
- [`testing.md`](./testing.md) — Vitest layout, mock scenarios, and the OpenCode smoke test split
- [`improvement-plan.md`](./improvement-plan.md) — plan d'amélioration pour qualité, gestion d'erreurs, et edge cases (5 phases)
- [`errors.md`](./errors.md) — taxonomy des erreurs AISnitch, codes, patterns de handling
- [`resilience.md`](./resilience.md) — circuit breaker, retry, timeouts, graceful shutdown
- [`distribution.md`](./distribution.md) — npm packaging, Homebrew formula automation, workflows, and community scaffolding
- [`launch-plan.md`](./launch-plan.md) — release messaging and launch-copy drafts
- [`../packages/client/README.md`](../packages/client/README.md) — `@aisnitch/client` SDK documentation (install, API reference, React hook, filters, mascot state)
- [`../examples/fullscreen-dashboard/README.md`](../examples/fullscreen-dashboard/README.md) — fullscreen web dashboard with live agent activity display

## Related project sources

- [`../README.md`](../README.md) — public-facing project overview
- [`../tasks/tasks.md`](../tasks/tasks.md) — current kanban state
- [`../CLAUDE_DATA.md`](../CLAUDE_DATA.md) — primary technical research source
