# ⚡ Core Pipeline — Sommaire des sous-tâches

> ⚠️ **Instruction** : Mettre à jour les checkboxes, les liens (_DONE) et la progression dans `tasks.md` après chaque sous-tâche complétée.

## Objectif

Construire le pipeline d'événements temps réel : Event Bus in-memory → WebSocket server → HTTP hook receiver → UDS server. Aucune persistence. Les events transitent en RAM et sont diffusés aux consumers connectés.

## Sous-tâches

- [x] [01 — Event Bus](./01_core-pipeline_event-bus_DONE.md) — EventBus typed avec eventemitter3
- [x] [02 — WebSocket Server](./02_core-pipeline_ws-server_DONE.md) — Serveur WS sur port configurable + ring buffer
- [x] [03 — HTTP Hooks & UDS](./03_core-pipeline_http-hooks-uds_DONE.md) — Endpoint HTTP pour hooks tools + Unix Domain Socket
- [x] [04 — Context Detector](./04_core-pipeline_context-detector_DONE.md) — Terminal, CWD, PID, instance detection & enrichment

## Dépendances

- Requiert : **01-project-setup** (schemas Zod, types, config)

## Ordre d'exécution

Séquentiel : 01 → 02 → 03 → 04 (Context Detector après les autres, intégré aujourd’hui au point d’émission partagé `Pipeline.publishEvent()`, futur `BaseAdapter.emit()` le cas échéant)
