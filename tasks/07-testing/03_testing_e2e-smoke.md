# 03 — Testing : E2E Smoke avec OpenCode

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-testing.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `03_testing_e2e-smoke_DONE.md`
> - **Recherche Exa.ai** : Vérifier comment lancer OpenCode en mode non-interactif pour des tests automatisés.
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.
> - 👤 **Ce test nécessite que l'utilisateur ait OpenCode installé et une API key configurée.**

## Contexte

Test end-to-end qui lance un **vrai** AI tool (OpenCode) avec un prompt simple, et vérifie que les events arrivent dans le WebSocket d'AISnitch. C'est le test ultime de validation du pipeline. Il n'est pas run en CI par défaut (nécessite API key) mais est run manuellement avant chaque release.

## Ressources

- OpenCode : https://github.com/opencode-ai/opencode
- **`CLAUDE_DATA.md`** section "OpenCode" — modes d'exécution
- L'adapter OpenCode de la tâche 04-03

## Sous-étapes

- [ ] **Exa.ai** : Rechercher comment lancer OpenCode en mode non-interactif / one-shot
  - [ ] Ex: `opencode --message "say hello"` ou `echo "hello" | opencode`
  - [ ] Ou via le SDK TypeScript si disponible
- [ ] Créer `src/__e2e__/smoke.test.ts` :
  - [ ] **Setup** :
    1. Démarrer AISnitch pipeline (in-process, pas de fork)
    2. Connecter un client WebSocket de test
    3. S'assurer que l'adapter OpenCode est actif
  - [ ] **Test** :
    1. Lancer OpenCode avec un prompt simple (`"Say hello in one word"`)
    2. Attendre les events sur le WebSocket (timeout 30s)
    3. Asserter : au minimum `session.start` et `task.start` reçus
    4. Asserter : `aisnitch.tool` === `'opencode'` sur les events
    5. Asserter : events sont des CloudEvents valides (Zod)
  - [ ] **Teardown** :
    1. Kill le process OpenCode
    2. Arrêter le pipeline AISnitch
    3. Fermer le WebSocket
- [ ] Créer un script `test:e2e` dans `package.json` :
  ```json
  "test:e2e": "vitest run --config vitest.e2e.config.ts"
  ```
- [ ] Créer `vitest.e2e.config.ts` — config séparée pour les E2E (timeout plus long, pas de watch)
- [ ] Ajouter un check pré-test : vérifier que `opencode` est installé, sinon skip gracieusement
- [ ] Ajouter un check pré-test : vérifier qu'une API key est configurée, sinon skip
- [ ] Optionnel : même test avec Claude Code si disponible
  - [ ] Utiliser `@anthropic-ai/claude-code` SDK (npm) pour lancer une session programmatiquement

- [ ] Documenter dans le README : "Comment lancer les E2E tests"
  ```bash
  # Prérequis : OpenCode installé + API key configurée
  pnpm test:e2e
  ```

## Spécifications techniques

### Smoke test (esquisse)
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { Pipeline } from '../core/engine/pipeline';
import { execSync, spawn } from 'node:child_process';

describe('E2E: OpenCode smoke test', () => {
  let pipeline: Pipeline;
  let ws: WebSocket;
  const events: AISnitchEvent[] = [];

  beforeAll(async () => {
    // 📖 Skip si OpenCode pas installé
    try { execSync('which opencode'); } catch { return; }

    // 📖 Démarrer AISnitch pipeline
    pipeline = new Pipeline();
    await pipeline.start({ wsPort: 14820, httpPort: 14821 }); // ports de test

    // 📖 Connecter un client WebSocket de test
    ws = new WebSocket('ws://localhost:14820');
    ws.on('message', (data) => {
      const event = JSON.parse(data.toString());
      if (event.type !== 'welcome') events.push(event);
    });
  });

  it('should receive events from a real OpenCode session', async () => {
    // 📖 Lancer OpenCode avec un prompt simple
    const oc = spawn('opencode', ['--message', 'Say hello in one word']);

    // 📖 Attendre des events (timeout 30s)
    await waitFor(() => events.length >= 2, 30_000);

    expect(events.some(e => e.type === 'session.start' || e.type === 'task.start')).toBe(true);
    expect(events.every(e => e['aisnitch.tool'] === 'opencode')).toBe(true);

    oc.kill();
  }, 60_000); // timeout 60s

  afterAll(async () => {
    ws?.close();
    await pipeline?.stop();
  });
});
```

## Critères de complétion

- [ ] E2E test lance OpenCode et reçoit des events
- [ ] Skip gracieux si OpenCode pas installé ou pas d'API key
- [ ] Script `pnpm test:e2e` fonctionne
- [ ] Config vitest séparée pour E2E
- [ ] 👤 Testé avec l'utilisateur au moins une fois
- [ ] README documenté
- [ ] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**
