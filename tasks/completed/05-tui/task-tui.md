# 🎨 TUI — Sommaire des sous-tâches

> ⚠️ **Instruction** : Mettre à jour les checkboxes, les liens (_DONE) et la progression dans `tasks.md` après chaque sous-tâche complétée.

## Objectif

Construire un TUI riche, coloré et élégant façon charmbracelet avec `ink` (React pour le terminal). C'est le **consumer principal du MVP** — il se connecte au WebSocket et affiche l'activité AI en temps réel.

## Sous-tâches

- [x] [01 — Ink Foundation & Layout](./01_tui_foundation-layout_DONE.md) — Layout Ink validé en TTY, branché au CLI, et réutilisé en foreground/attach
- [x] [02 — Live Event Stream](./02_tui_live-stream_DONE.md) — Panel de flux d'events en direct avec buffer borné, rendu formaté, et freeze
- [x] [03 — Sessions, Filtres & Controls](./03_tui_sessions-filters_DONE.md) — Sessions groupées, badge global, filtres, overlay d'aide, et CLI pre-filters

## Dépendances

- Requiert : **01-project-setup**, **02-core-pipeline** (WebSocket client interne)

## Ordre d'exécution

Séquentiel : 01 → 02 → 03
