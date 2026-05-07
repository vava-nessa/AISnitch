# Kanban — AISnitch MVP

> ⚠️ **Avant toute exécution de tâche**, consulter **`CLAUDE_DATA.md`** (source technique inestimable du projet).
> Recherche complémentaire autorisée via **Brave Search**, **Context7**, **Exa.ai**.
>
> **Décisions structurantes validées :**
> - ❌ Aucun stockage persistant (pas de SQLite, pas de replay, pas de logs sauvegardés)
> - ❌ Aucun replay / historique / query passé
> - ✅ Transit mémoire vive uniquement — events émis et oubliés (in-process EventBus `eventemitter3`)
> - ✅ Un seul package npm `aisnitch` (pas de monorepo multi-packages)
> - ✅ Foreground par défaut, `--daemon` pour background
> - ✅ macOS-first, cross-platform ready (abstractions Node.js)
> - ✅ License Apache 2.0 (attribution : vava-nessa / Vanessa Depraute)
> - ✅ Full TUI charmbracelet-style (ink + React)
> - ✅ Priority adapters : Claude Code + OpenCode
> - ✅ Secondary adapters : Gemini CLI, Codex, Goose, Copilot CLI, Aider, **OpenClaw** (247k⭐)
> - ✅ Context enrichment : terminal, cwd, pid, instanceId, instanceIndex (via ContextDetector)
> - ✅ WS server port 4820, HTTP hooks port 4821 (localhost only)
> - ✅ Ring buffer par consumer (1 000 events, oldest-first drop)
> - ✅ 12 event types normalisés (CloudEvents v1.0 envelope)
> - ✅ Idle timeout configurable (défaut 120s)
> - ✅ Circuit breaker actif (SHARED_BREAKERS.adapterEmit) dans tous les adapters
> - ✅ Graceful shutdown avec timeouts par composant

---

## 🟡 Todo

_Nothing pending — all MVP tasks completed_

---

## 🔵 In Progress

_Nothing in progress_

---

## ✅ Done

| # | Task | Status | Notes |
|---|---|---|---|
| 01 | [Project Setup](./01-project-setup/task-project-setup.md) | ✅ Done | pnpm + TypeScript strict + ESLint flat + tsup + CloudEvents/CESP schema |
| 02 | [Core Pipeline](./02-core-pipeline/task-core-pipeline.md) | ✅ Done | EventBus + WS localhost + HTTP/UDS + context enrichment |
| 03 | [CLI & Daemon](./03-cli-daemon/task-cli-daemon.md) | ✅ Done | commander commands + daemon mode + setup Claude/OpenCode |
| 04 | [Priority Adapters](./04-adapters-priority/task-adapters-priority.md) | ✅ Done | Claude Code + OpenCode validés end-to-end |
| 05 | [TUI](./05-tui/task-tui.md) | ✅ Done | Ink dashboard + live stream + sessions + filtres + keybinds |
| 06 | [Secondary Adapters](./06-adapters-secondary/task-adapters-secondary.md) | ✅ Done | Gemini/Codex/Goose/Copilot/Aider/OpenClaw + PTY wrapper |
| 07 | [Testing & E2E](./07-testing/task-testing.md) | ✅ Done | Vitest + aisnitch mock + smoke OpenCode |
| 08 | [Distribution](./08-distribution/task-distribution.md) | ✅ Done | npm + Homebrew + CI/GitHub Actions |
| 09 | [Client SDK](./09-client-sdk/task-client-sdk.md) | ✅ Done | @aisnitch/client avec types, reconnect, sessions, filters |
| 10 | [Mascot Dashboard](./10-mascot-dashboard/task-mascot-dashboard.md) | ✅ Done | React + Vite + emoji grid + sound engine |
| t-quality-001 | [Quality Audit](./docs/improvement-plan.md) | ✅ Done | Circuit breaker wired + graceful shutdown + tests |

---

## 📋 Phase 1-5 Status (All Complete)

| Phase | Status | Modules |
|---|---|---|
| **Phase 1** — Error Handling | ✅ Done | errors.ts, result.ts, retry.ts, timeout.ts, graceful-shutdown.ts |
| **Phase 2** — Edge Cases | ✅ Done | safety.ts (20+ helpers), schema.max() limits |
| **Phase 3** — Circuit Breaker | ✅ Done | circuit-breaker.ts wired in BaseAdapter.emit() |
| **Phase 4** — Tests d'Erreurs | ✅ Done | event-bus-rejection.test.ts, timeout.test.ts, graceful-shutdown.test.ts |
| **Phase 5** — Documentation | ✅ Done | docs/errors.md, docs/resilience.md, docs/improvement-plan.md |

---

## 🚀 Post-MVP Backlog

| Feature | Description | Priority |
|---|---|---|
| Remote streaming | Forward WS flux vers endpoint distant | P2 |
| Plugin system | Adapter SDK + `~/.aisnitch/plugins/` | P2 |
| Web Dashboard | SPA Vite + React sur `:4822` | P2 |
| Windows daemon | Windows Service support | P3 |
| Linux daemon | systemd user unit | P3 |
| CESP bridge | PeonPing integration (160+ soundpacks) | P3 |
| Rust addon | `napi-rs` pour PTY/process monitor | P3 |

---

## 📐 Non-Functional Requirements

| Exigence | Cible | Status |
|---|---|---|
| **Latence** | p95 < 300ms | ✅ |
| **Fiabilité** | 0 crash sur parsing PTY | ✅ |
| **Sécurité** | localhost only, pas de PII persisté | ✅ |
| **Distribution** | `npm i -g aisnitch` sans node-gyp | ✅ |
| **Performance** | CPU idle < 1% | ✅ |
| **Throughput** | ~8,200 ops/s | ✅ |