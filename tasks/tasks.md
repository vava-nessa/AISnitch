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

---

## 🟡 Todo

| # | Tâche | Progression | Priorité |
|---|-------|-------------|----------|
| 1 | [🔌 Adapters Secondaires](./06-adapters-secondary/task-adapters-secondary.md) | 0/4 | P1 |
| 2 | [🧪 Testing & E2E](./07-testing/task-testing.md) | 0/3 | P1 |
| 3 | [📦 Distribution & Launch](./08-distribution/task-distribution.md) | 0/2 | P2 |

---

## 🔵 In Progress

- [🔌 Adapters Prioritaires](./04-adapters-priority/task-adapters-priority.md) — 1/3 — BaseAdapter + registry + pipeline wiring livrés, Claude/OpenCode en attente de validation sur vraies sessions
- [🎨 TUI](./05-tui/task-tui.md) — 1/3 — live stream TUI livré; 01 reste en attente de validation visuelle utilisateur, 03 encore à faire

---

## ✅ Done

- [🏗️ Project Setup](./01-project-setup/task-project-setup.md) — 3/3 — package `pnpm` + schéma CloudEvents/CESP + config system
- [01 — Init & Structure](./01-project-setup/01_project-setup_init-structure_DONE.md) — bootstrap `pnpm` + TypeScript strict + ESLint flat + `tsup` + docs initiales
- [02 — Schemas & Types](./01-project-setup/02_project-setup_schemas-types_DONE.md) — contrat d’events Zod + types inférés + UUIDv7 + mapping CESP
- [03 — Config System](./01-project-setup/03_project-setup_config-system_DONE.md) — config persistée + defaults + loader + fallback ports
- [⚡ Core Pipeline](./02-core-pipeline/task-core-pipeline.md) — 4/4 — EventBus + WS localhost + hooks HTTP/UDS + context enrichment
- [01 — Event Bus](./02-core-pipeline/01_core-pipeline_event-bus_DONE.md) — bus typed `eventemitter3` + logger `pino` + stats
- [02 — WebSocket Server](./02-core-pipeline/02_core-pipeline_ws-server_DONE.md) — stream WS localhost + welcome + heartbeat + ring buffer
- [03 — HTTP Hooks & UDS](./02-core-pipeline/03_core-pipeline_http-hooks-uds_DONE.md) — ingest HTTP/UDS + health + orchestration pipeline
- [04 — Context Detector](./02-core-pipeline/04_core-pipeline_context-detector_DONE.md) — enrichissement terminal/cwd/pid/instances
- [01 — Commander CLI](./03-cli-daemon/01_cli-daemon_commands_DONE.md) — surface `commander` + start/stop/status/adapters + `--config`
- [02 — Daemon Mode](./03-cli-daemon/02_cli-daemon_daemon-mode_DONE.md) — daemon détaché + attach + PID/state/log + LaunchAgent
- [🖥️ CLI & Daemon](./03-cli-daemon/task-cli-daemon.md) — 3/3 — CLI complète + daemon + setup interactif Claude/OpenCode
- [03 — Setup Tools](./03-cli-daemon/03_cli-daemon_setup-tools_DONE.md) — diff interactif + backup/revert + Claude hooks + plugin OpenCode
- [01 — BaseAdapter & Registry](./04-adapters-priority/01_adapters-priority_base_DONE.md) — couche adapter commune + lifecycle registry + wiring dans le pipeline

---

## 📋 Backlog V2 (post-MVP)

- [ ] Remote streaming — option pour forward le flux WS vers un endpoint WebSocket distant
- [ ] Rust native addon (`napi-rs`) pour PTY, process monitor, FS watch (remplacer les libs Node)
- [ ] Dashboard web (consumer alternatif au TUI)
- [ ] Plugin système pour adapters communautaires (`create-aisnitch-adapter`)
- [ ] Windows daemon support (Windows Service / Startup Task)
- [ ] Linux daemon support (systemd user unit)
- [ ] Analytics / statistiques d'utilisation (opt-in)
- [ ] `@aisnitch/client` — SDK client TypeScript (auto-reconnect WS + parsing Zod)
- [ ] CESP bridge complet pour PeonPing (160+ soundpacks)

---

## ✅ Critères d'Acceptance MVP (exit conditions)

> Ces 5 conditions doivent être validées pour considérer le MVP livrable.

1. `aisnitch start` lance le daemon silencieusement avec auto-restart, PIDs gérés correctement
2. Hook factice Claude Code (POST sur `localhost:4821/hooks/claude-code`) → event visible instantanément dans un client WS connecté sur `ws://localhost:4820`
3. Intégrations opérationnelles sur au moins : **Claude Code** (Tier 1 via Hook + JSONL), **Goose ou Codex** (Tier 2), **1 process Tier 3/4** (file watching)
4. Mode privacy : aucune donnée brute persistée sur disque au-delà du transit en mémoire
5. Fermer le TUI ne coupe pas la capture du daemon background (headless stable)

---

## ⚠️ Risques Identifiés

| # | Risque | Probabilité | Impact | Mitigation |
|---|--------|-------------|--------|------------|
| 1 | **Fragmentation APIs** — formats hooks/logs changent fréquemment (Claude Code, Cursor, Gemini) | Haute | Moyen | Adapter pattern isolé, tests sur formats connus, veille active |
| 2 | **PTY fallback fragile** — heuristiques ANSI (`\r`, spinners, prompts) peu fiables | Moyenne | Moyen | Best-effort uniquement pour Tier 4, fallback process detection |
| 3 | **Aucun audit post-crash** — mode memory-only supprime toute capacité de replay | Faible | Faible | Accepté par design (privacy-first), documenté clairement |
| 4 | **SQLite lock** (si WAL activé) — accès concurrents daemon + child processes | Faible | Élevé | Pas de SQLite dans le MVP (in-memory only). SQLite = Backlog V2 si besoin |
| 5 | **Event drop silencieux** — ring buffer plein → oldest-first drop sans alerte | Moyenne | Moyen | Compteur `droppedEvents` dans `aisnitch status`, log warning à chaque drop |

---

## 📐 Non-Functional Requirements

| Exigence | Cible |
|----------|-------|
| **Latence** | p95 ingest → event diffusé < 300ms en local |
| **Fiabilité** | 0 crash du daemon sur parsing PTY malformé |
| **Sécurité** | WS + HTTP bind localhost uniquement, aucun PII persisté |
| **Distribution** | `npm i -g aisnitch` sans node-gyp (prebuilds via `@lydell/node-pty`) |
| **Performance** | CPU idle < 1%, file watch asynchrone (FSEvents natif via chokidar v5) |
| **Throughput** | WS server testé à ~8 200 ops/s (lib `ws`) — suffisant pour ~100 events/min |
