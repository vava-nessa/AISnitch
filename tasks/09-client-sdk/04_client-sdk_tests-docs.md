# 04 — Client SDK : Tests, Docs & Publish

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-client-sdk.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `04_client-sdk_tests-docs_DONE.md`
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.

## Contexte

Le SDK doit être solide avant publication. Tests unitaires complets, README consumer-facing qui remplace les exemples du README principal, et dry-run npm publish pour valider le package.

## Sous-étapes

- [ ] Configurer Vitest dans `packages/client/` :
  - [ ] `vitest.config.ts` avec resolve alias
  - [ ] Mock WebSocket pour tests (pas de vrai serveur)
- [ ] Tests unitaires — `packages/client/src/__tests__/` :
  - [ ] `schema.test.ts` :
    - [ ] `parseEvent()` parse un event valide
    - [ ] `parseEvent()` retourne null sur payload invalide
    - [ ] `parseEvent()` retourne null sur JSON mal formé
    - [ ] Validation des 12 types d'events
  - [ ] `client.test.ts` :
    - [ ] Connect + receive welcome
    - [ ] Events parsés et émis
    - [ ] Auto-reconnect on close (mock timers)
    - [ ] Exponential backoff (3s → 6s → 12s → 30s cap)
    - [ ] `disconnect()` stops reconnect
    - [ ] `destroy()` cleans up
    - [ ] Invalid messages silently ignored
  - [ ] `sessions.test.ts` :
    - [ ] Session created on first event
    - [ ] Session updated on subsequent events
    - [ ] Session removed on `session.end`
    - [ ] `getByTool()` filters correctly
    - [ ] Event count increments
  - [ ] `filters.test.ts` :
    - [ ] Each filter function tested
    - [ ] Composability (multiple filters)
  - [ ] `describe.test.ts` :
    - [ ] `describeEvent()` tested for all 12 event types
    - [ ] `formatStatusLine()` includes session number and cwd
    - [ ] `eventToMascotState()` returns correct mood/animation for each type
- [ ] Écrire `packages/client/README.md` :
  - [ ] Installation (`pnpm add @aisnitch/client`)
  - [ ] Quick start (3 lignes)
  - [ ] Node.js usage (avec `ws`)
  - [ ] Browser usage (natif)
  - [ ] React hook example
  - [ ] Session tracking
  - [ ] Filtering
  - [ ] Human-readable descriptions
  - [ ] Mascot/companion integration
  - [ ] API reference (toutes les exports)
- [ ] Dry-run publish :
  - [ ] `npm publish --dry-run` dans `packages/client/`
  - [ ] Vérifier le contenu du tarball (pas de fichiers superflus)
  - [ ] Vérifier les exports ESM + CJS
- [ ] Mettre à jour le README principal (`README.md`) :
  - [ ] Ajouter une section "Client SDK" pointant vers `@aisnitch/client`
  - [ ] Simplifier les exemples existants : "use the SDK" au lieu de boilerplate
- [ ] Vérifier : `pnpm test` + `pnpm build` dans `packages/client/`

## Critères de complétion

- [ ] Tous les tests passent (min 25 tests)
- [ ] Coverage > 80% sur le code du SDK
- [ ] README consumer-facing complet et clair
- [ ] `npm publish --dry-run` produit un tarball propre
- [ ] ESM + CJS imports vérifiés
- [ ] README principal mis à jour avec lien vers le SDK
- [ ] Pas de `any`, types stricts partout
