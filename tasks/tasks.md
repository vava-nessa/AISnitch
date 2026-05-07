# Kanban — AISnitch

> ⚠️ **Avant toute exécution de tâche**, consulter **`CLAUDE_DATA.md`** (source technique inestimable du projet).

---

## 🚀 Post-MVP Backlog

| # | Feature | Description | Priority |
|---|---|---|---|
| 1 | Remote streaming | Forward WS flux vers endpoint WebSocket distant | P2 |
| 2 | Plugin system | Adapter SDK + `~/.aisnitch/plugins/` | P2 |
| 3 | Web Dashboard | SPA Vite + React sur `:4822` | P2 |
| 4 | Windows daemon | Windows Service support | P3 |
| 5 | Linux daemon | systemd user unit | P3 |
| 6 | CESP bridge | PeonPing integration (160+ soundpacks) | P3 |
| 7 | Rust addon | `napi-rs` pour PTY/process monitor | P3 |

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

---

## 📚 Documentation

- [`docs/index.md`](./docs/index.md) — Index documentation technique
- [`docs/improvement-plan.md`](./docs/improvement-plan.md) — Historique qualité phases 1-5
- [`README.md`](../README.md) — Overview projet