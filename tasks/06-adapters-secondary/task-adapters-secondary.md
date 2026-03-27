# 🔌 Adapters Secondaires — Sommaire des sous-tâches

> ⚠️ **Instruction** : Mettre à jour les checkboxes, les liens (_DONE) et la progression dans `tasks.md` après chaque sous-tâche complétée.

## Objectif

Étendre la couverture multi-outils au-delà de Claude Code et OpenCode. Chaque adapter est implémenté en best-effort — s'il marche, parfait ; sinon on itère plus tard. Inclut le fallback PTY générique pour les tools sans API.

## Sous-tâches

- [x] [01 — Gemini CLI & Codex](./01_adapters-secondary_gemini-codex_DONE.md) — Hooks + stream-json/log watching + passive setup
- [x] [02 — Goose & Copilot CLI](./02_adapters-secondary_goose-copilot_DONE.md) — API/SSE goosed + SQLite fallback + hooks/session-state Copilot
- [x] [03 — Aider & Generic PTY](./03_adapters-secondary_aider-pty_DONE.md) — File watching + `notifications-command` + PTY fallback universel
- [ ] [04 — OpenClaw](./04_adapters-secondary_openclaw.md) — Gateway TypeScript hooks + workspace memory watcher (247k⭐ GitHub)

## Dépendances

- Requiert : **04-adapters-priority** (BaseAdapter, patterns validés)
- Requiert : **02-core-pipeline/04** (ContextDetector intégré dans BaseAdapter)

## Ordre d'exécution

Parallélisable : 01, 02, 03, 04 sont indépendants entre eux
