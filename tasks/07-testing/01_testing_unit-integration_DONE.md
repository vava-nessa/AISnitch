# 01 — Testing : Unit & Integration Tests

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-testing.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `01_testing_unit-integration_DONE.md`
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.

## Contexte

Suite de tests complète avec vitest. Chaque module doit avoir ses tests : schemas, event bus, WS server, adapters, TUI components. Les tests doivent être rapides, déterministes, sans dépendance externe (pas d'API key, pas de réseau).

## Ressources

- Lib : `vitest` v4.x — [npm](https://www.npmjs.com/package/vitest)
- Chaque tâche précédente a déjà listé des tests spécifiques à écrire

## Sous-étapes

- [x] Configurer vitest dans `vitest.config.ts` :
  - [x] Environment : node
  - [x] Coverage : v8
  - [x] Glob pattern : `src/**/*.test.ts`
  - [x] Setup file pour les helpers de test
- [x] Ajouter scripts dans `package.json` :
  - [x] `"test": "vitest run"`
  - [x] `"test:watch": "vitest"`
  - [x] `"test:coverage": "vitest run --coverage"`
- [x] Créer `src/test-utils/` — helpers partagés :
  - [x] `createMockEvent(overrides?)` — factory d'events de test
  - [x] `createMockAdapter()` — adapter mock pour tests
  - [x] `createTestEventBus()` — event bus isolé pour tests
  - [x] `waitForEvent(bus, type)` — promise qui resolve au prochain event
- [x] S'assurer que tous les tests écrits dans les tâches précédentes sont implémentés :
  - [x] `src/core/events/__tests__/schema.test.ts` (tâche 01-02)
  - [x] `src/core/config/__tests__/loader.test.ts` (tâche 01-03)
  - [x] `src/core/engine/__tests__/event-bus.test.ts` (tâche 02-01)
  - [x] `src/core/engine/__tests__/ws-server.test.ts` (tâche 02-02)
  - [x] `src/core/engine/__tests__/ring-buffer.test.ts` (tâche 02-02)
  - [x] `src/core/engine/__tests__/http-receiver.test.ts` (tâche 02-03)
  - [x] `src/adapters/__tests__/base.test.ts` (tâche 04-01)
  - [x] `src/adapters/__tests__/claude-code.test.ts` (tâche 04-02)
  - [x] `src/adapters/__tests__/opencode.test.ts` (tâche 04-03)
- [x] Tests d'intégration :
  - [x] **Full pipeline** : start pipeline → POST event sur HTTP → reçu sur WS
  - [x] **Multi-adapter** : 2 adapters émettent en parallèle → WS reçoit les 2 streams
  - [x] **Backpressure** : flood d'events → ring buffer drop sans crash
- [x] Vérifier coverage > 70% sur les modules core
- [x] `pnpm test` passe en CI (pas de flaky tests)

## Critères de complétion

- [x] vitest configuré et fonctionnel
- [x] Test helpers créés et réutilisables
- [x] Tous les tests des tâches précédentes implémentés
- [x] Tests d'intégration pipeline passent
- [x] Coverage > 70% sur core
- [x] `pnpm test` stable (pas de flaky)

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**

- `vitest.config.ts` et `src/test-utils/` sont en place pour la couverture unit/integration.
- `pnpm test` est stable et les suites existantes des tâches précédentes sont toutes intégrées.
- `pnpm test:coverage` confirme que `src/core/` dépasse l'objectif >70% (actuellement ~75.86% en lines).
- La config E2E a été séparée pour éviter de rendre `pnpm test` flaky ou lent.
