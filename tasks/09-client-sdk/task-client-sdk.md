# 📦 Client SDK (`@aisnitch/client`) — Sommaire des sous-tâches

> ⚠️ **Instruction** : Mettre à jour les checkboxes, les liens (_DONE) et la progression dans `tasks.md` après chaque sous-tâche complétée.

## Objectif

Créer un package npm `@aisnitch/client` — SDK TypeScript léger pour consommer le flux WebSocket AISnitch. Auto-reconnect, parsing Zod, typed events, session tracking, filtrage — tout ce qu'un consommateur doit écrire à la main aujourd'hui, packagé en 2 lignes d'import.

**Pourquoi :** Le README montre 40+ lignes de boilerplate pour se connecter. Chaque consumer (dashboard, companion app, sound engine, menu bar widget) les ré-écrit. Un SDK officiel = adoption x10, écosystème unifié, moins de bugs côté consommateurs.

**Contraintes :**
- Package séparé (`@aisnitch/client`), pas dans le package principal `aisnitch`
- Zero dependency runtime (sauf `zod` pour le parsing — peer dep)
- Fonctionne en Node.js ET browser (WebSocket natif côté browser, `ws` optionnel côté Node)
- ESM + CJS dual build
- Pas de dépendance sur le code serveur AISnitch (types partagés uniquement)

## Sous-tâches

- [ ] [01 — Package Setup & Shared Types](./01_client-sdk_setup-types.md) — Scaffold du package, extraction des types partagés, build config
- [ ] [02 — Core Client & Reconnect](./02_client-sdk_core-reconnect.md) — Classe `AISnitchClient` avec auto-reconnect, welcome handling, event parsing
- [ ] [03 — Session Tracking, Filters & Helpers](./03_client-sdk_sessions-filters.md) — Session map, filtrage typed, helpers `describeEvent()` / `formatStatusLine()`
- [ ] [04 — Tests, Docs & Publish](./04_client-sdk_tests-docs.md) — Tests unitaires, README consumer-facing, npm publish dry-run

## Dépendances

- Requiert : **01-project-setup** (schemas Zod, types events) — extraction des types partagés
- Indépendant du daemon/TUI/adapters

## Ordre d'exécution

Séquentiel : 01 → 02 → 03 → 04
