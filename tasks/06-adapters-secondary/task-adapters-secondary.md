# 🔌 Adapters Secondaires — Sommaire des sous-tâches

> ⚠️ **Instruction** : Mettre à jour les checkboxes, les liens (_DONE) et la progression dans `tasks.md` après chaque sous-tâche complétée.

## Objectif

Étendre la couverture multi-outils au-delà de Claude Code et OpenCode. Chaque adapter est implémenté en best-effort — s'il marche, parfait ; sinon on itère plus tard. Inclut le fallback PTY générique pour les tools sans API.

## Sous-tâches

- [ ] [01 — Gemini CLI & Codex](./01_adapters-secondary_gemini-codex.md) — Hooks + stream-json + file watching
- [ ] [02 — Goose & Copilot CLI](./02_adapters-secondary_goose-copilot.md) — goosed API + hooks copilot
- [ ] [03 — Aider & Generic PTY](./03_adapters-secondary_aider-pty.md) — File watching + PTY fallback universel
- [ ] [04 — OpenClaw](./04_adapters-secondary_openclaw.md) — Gateway TypeScript hooks + workspace memory watcher (247k⭐ GitHub)

## Dépendances

- Requiert : **04-adapters-priority** (BaseAdapter, patterns validés)
- Requiert : **02-core-pipeline/04** (ContextDetector intégré dans BaseAdapter)

## Ordre d'exécution

Parallélisable : 01, 02, 03, 04 sont indépendants entre eux
