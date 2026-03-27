# ⚡ Core Pipeline — Sommaire des sous-tâches

> ⚠️ **Instruction** : Mettre à jour les checkboxes, les liens (_DONE) et la progression dans `tasks.md` après chaque sous-tâche complétée.

## Objectif

Construire le pipeline d'événements temps réel : Event Bus in-memory → WebSocket server → HTTP hook receiver → UDS server. Aucune persistence. Les events transitent en RAM et sont diffusés aux consumers connectés.

## Sous-tâches

- [ ] [01 — Event Bus](./01_core-pipeline_event-bus.md) — EventBus typed avec eventemitter3
- [ ] [02 — WebSocket Server](./02_core-pipeline_ws-server.md) — Serveur WS sur port configurable + ring buffer
- [ ] [03 — HTTP Hooks & UDS](./03_core-pipeline_http-hooks-uds.md) — Endpoint HTTP pour hooks tools + Unix Domain Socket
- [ ] [04 — Context Detector](./04_core-pipeline_context-detector.md) — Terminal, CWD, PID, instance detection & enrichment

## Dépendances

- Requiert : **01-project-setup** (schemas Zod, types, config)

## Ordre d'exécution

Séquentiel : 01 → 02 → 03 → 04 (Context Detector après les autres, il s'intègre dans BaseAdapter)
