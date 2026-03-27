# 🔌 Adapters Prioritaires — Sommaire des sous-tâches

> ⚠️ **Instruction** : Mettre à jour les checkboxes, les liens (_DONE) et la progression dans `tasks.md` après chaque sous-tâche complétée.

## Objectif

Implémenter le système d'adapters avec la classe abstraite `BaseAdapter`, puis les deux adapters prioritaires : **Claude Code** (21 lifecycle events via hooks HTTP + JSONL watcher) et **OpenCode** (ACP protocol + SQLite watcher + plugins).

## Sous-tâches

- [ ] [01 — BaseAdapter & Registry](./01_adapters-priority_base.md) — Classe abstraite + adapter registry + lifecycle
- [ ] [02 — Claude Code Adapter](./02_adapters-priority_claude-code.md) — HTTP hooks + JSONL watcher + process detection
- [ ] [03 — OpenCode Adapter](./03_adapters-priority_opencode.md) — ACP protocol + SQLite watcher + plugin

## Dépendances

- Requiert : **01-project-setup**, **02-core-pipeline**, **03-cli-daemon** (pour `setup`)

## Ordre d'exécution

Séquentiel : 01 → 02 → 03 (mais 02 et 03 peuvent être parallélisés après 01)
