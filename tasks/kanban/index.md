# Kanban — AutoSnitch

## Research Reminder

- Avant toute exécution de tâche PRD/produit, consulter **`@CLAUDE_DATA.md`** (source inestimable projet).
- Recherche complémentaire autorisée via **Brave Search**, **Context7/Context8**, et **Exa.ai**.

## Backlog

- [ ] **Phase 1 — Core live pipeline**
  - Setup Monorepo pnpm + Turborepo + Zod schemas
  - Event bus `eventemitter3` + SQLite WAL
  - WebSocket Server sur port 4820
  - CLI `commander`
  Priority: P0 | Links: [Roadmap phase 1](../prd-autosnitch-mvp/04-roadmap-milestones.md)

- [ ] **Phase 2 — Claude Code reference adapter**
  - Adapter hooks HTTP + JSONL Watcher `chokidar`
  - Mapping événements AutoSnitch
  Priority: P0 | Links: [Roadmap phase 2](../prd-autosnitch-mvp/04-roadmap-milestones.md)

- [ ] **Phase 3 — Multi-tool adapters & Rust Native Addon**
  - Adapters pour Gemini, Codex, Goose, Copilot
  - Fallback PTY via `@lydell/node-pty` ou `napi-rs`
  - Build Rust `napi-rs` (`nix:pty`, fsevents)
  Priority: P1 | Links: [Roadmap phase 3](../prd-autosnitch-mvp/04-roadmap-milestones.md)

- [ ] **Phase 4 — Client SDK & TUI polish**
  - TUI complet (filtres, live update)
  - SDK TypeScript WebSocket Client
  - Unit Tests Vitest
  Priority: P1 | Links: [Roadmap phase 4](../prd-autosnitch-mvp/04-roadmap-milestones.md)

- [ ] **Phase 5 — Packaging & launch**
  - Github Actions + `npm publish`
  - Homebrew tap
  - Guides
  Priority: P2 | Links: [Roadmap phase 5](../prd-autosnitch-mvp/04-roadmap-milestones.md)

---

## In Progress

- (empty)

---

## Done

- (empty)
