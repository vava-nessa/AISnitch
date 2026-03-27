# 🖥️ CLI & Daemon — Sommaire des sous-tâches

> ⚠️ **Instruction** : Mettre à jour les checkboxes, les liens (_DONE) et la progression dans `tasks.md` après chaque sous-tâche complétée.

## Objectif

Construire l'interface CLI (`aisnitch` commande) avec mode foreground par défaut, mode daemon optionnel (`--daemon`), et commande `setup` pour configurer automatiquement les hooks des AI tools.

## Sous-tâches

- [x] [01 — Commander CLI](./01_cli-daemon_commands_DONE.md) — Setup commander + commandes start/stop/status
- [x] [02 — Daemon Mode](./02_cli-daemon_daemon-mode_DONE.md) — Foreground default + `--daemon` + `attach`
- [ ] [03 — Setup Tools](./03_cli-daemon_setup-tools.md) — `aisnitch setup <tool>` (injection hooks)

## Dépendances

- Requiert : **01-project-setup**, **02-core-pipeline**

## Ordre d'exécution

Séquentiel : 01 → 02 → 03
