# Kanban — AISnitch

> ⚠️ **Avant toute exécution de tâche**, consulter **`CLAUDE_DATA.md`** (source technique inestimable du projet).
> Recherche complémentaire autorisée via **Brave Search**, **Context7**, **Exa.ai**.
>
> **Décisions structurantes validées :**
> - ❌ Aucun stockage persistant (pas de SQLite, pas de replay, pas de logs sauvegardés)
> - ❌ Aucun replay / historique / query passé
> - ✅ Transit mémoire vive uniquement — events émis et oubliés
> - ✅ Un seul package npm `aisnitch` (pas de monorepo multi-packages)
> - ✅ Foreground par défaut, `--daemon` pour background
> - ✅ macOS-first, cross-platform ready (abstractions Node.js)
> - ✅ License Apache 2.0 (attribution obligatoire)
> - ✅ Full TUI charmbracelet-style (ink + React)
> - ✅ Priority adapters : Claude Code + OpenCode

---

## 🟡 Todo

| # | Tâche | Progression | Priorité |
|---|-------|-------------|----------|
| 1 | [🏗️ Project Setup](./01-project-setup/task-project-setup.md) | 0/3 | P0 |
| 2 | [⚡ Core Pipeline](./02-core-pipeline/task-core-pipeline.md) | 0/3 | P0 |
| 3 | [🖥️ CLI & Daemon](./03-cli-daemon/task-cli-daemon.md) | 0/3 | P0 |
| 4 | [🔌 Adapters Prioritaires](./04-adapters-priority/task-adapters-priority.md) | 0/3 | P0 |
| 5 | [🎨 TUI](./05-tui/task-tui.md) | 0/3 | P0 |
| 6 | [🔌 Adapters Secondaires](./06-adapters-secondary/task-adapters-secondary.md) | 0/3 | P1 |
| 7 | [🧪 Testing & E2E](./07-testing/task-testing.md) | 0/3 | P1 |
| 8 | [📦 Distribution & Launch](./08-distribution/task-distribution.md) | 0/2 | P2 |

---

## 🔵 In Progress

- (vide)

---

## ✅ Done

- (vide)

---

## 📋 Backlog V2 (post-MVP)

- [ ] Remote streaming — option pour forward le flux WS vers un endpoint WebSocket distant
- [ ] Rust native addon (`napi-rs`) pour PTY, process monitor, FS watch (remplacer les libs Node)
- [ ] Dashboard web (consumer alternatif au TUI)
- [ ] Plugin système pour adapters communautaires (`create-aisnitch-adapter`)
- [ ] Windows daemon support (Windows Service / Startup Task)
- [ ] Linux daemon support (systemd user unit)
- [ ] Analytics / statistiques d'utilisation (opt-in)
