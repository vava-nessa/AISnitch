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

- [ ] Configurer vitest dans `vitest.config.ts` :
  - [ ] Environment : node
  - [ ] Coverage : v8
  - [ ] Glob pattern : `src/**/*.test.ts`
  - [ ] Setup file pour les helpers de test
- [ ] Ajouter scripts dans `package.json` :
  - [ ] `"test": "vitest run"`
  - [ ] `"test:watch": "vitest"`
  - [ ] `"test:coverage": "vitest run --coverage"`
- [ ] Créer `src/test-utils/` — helpers partagés :
  - [ ] `createMockEvent(overrides?)` — factory d'events de test
  - [ ] `createMockAdapter()` — adapter mock pour tests
  - [ ] `createTestEventBus()` — event bus isolé pour tests
  - [ ] `waitForEvent(bus, type)` — promise qui resolve au prochain event
- [ ] S'assurer que tous les tests écrits dans les tâches précédentes sont implémentés :
  - [ ] `src/core/events/__tests__/schema.test.ts` (tâche 01-02)
  - [ ] `src/core/config/__tests__/loader.test.ts` (tâche 01-03)
  - [ ] `src/core/engine/__tests__/event-bus.test.ts` (tâche 02-01)
  - [ ] `src/core/engine/__tests__/ws-server.test.ts` (tâche 02-02)
  - [ ] `src/core/engine/__tests__/ring-buffer.test.ts` (tâche 02-02)
  - [ ] `src/core/engine/__tests__/http-receiver.test.ts` (tâche 02-03)
  - [ ] `src/adapters/__tests__/base.test.ts` (tâche 04-01)
  - [ ] `src/adapters/__tests__/claude-code.test.ts` (tâche 04-02)
  - [ ] `src/adapters/__tests__/opencode.test.ts` (tâche 04-03)
- [ ] Tests d'intégration :
  - [ ] **Full pipeline** : start pipeline → POST event sur HTTP → reçu sur WS
  - [ ] **Multi-adapter** : 2 adapters émettent en parallèle → WS reçoit les 2 streams
  - [ ] **Backpressure** : flood d'events → ring buffer drop sans crash
- [ ] Vérifier coverage > 70% sur les modules core
- [ ] `pnpm test` passe en CI (pas de flaky tests)

## Critères de complétion

- [ ] vitest configuré et fonctionnel
- [ ] Test helpers créés et réutilisables
- [ ] Tous les tests des tâches précédentes implémentés
- [ ] Tests d'intégration pipeline passent
- [ ] Coverage > 70% sur core
- [ ] `pnpm test` stable (pas de flaky)

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**
