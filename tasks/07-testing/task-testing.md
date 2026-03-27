# 🧪 Testing & E2E — Sommaire des sous-tâches

> ⚠️ **Instruction** : Mettre à jour les checkboxes, les liens (_DONE) et la progression dans `tasks.md` après chaque sous-tâche complétée.

## Objectif

Mettre en place une stratégie de test en 3 niveaux : unit tests vitest, commande `aisnitch mock` pour tests déterministes, et smoke tests E2E avec un vrai outil AI (OpenCode) pour valider le pipeline end-to-end avant chaque release.

## Sous-tâches

- [ ] [01 — Unit & Integration Tests](./01_testing_unit-integration.md) — Vitest pour adapters, event bus, WS
- [ ] [02 — Mock Command](./02_testing_mock-command.md) — `aisnitch mock <tool>` générateur d'events fake
- [ ] [03 — E2E Smoke avec OpenCode](./03_testing_e2e-smoke.md) — Test réel avec OpenCode + assertion WS

## Dépendances

- Requiert : **02-core-pipeline**, **04-adapters-priority**, **05-tui**

## Ordre d'exécution

Séquentiel : 01 → 02 → 03
