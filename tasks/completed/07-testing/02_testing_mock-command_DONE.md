# 02 — Testing : Mock Command

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-testing.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `02_testing_mock-command_DONE.md`
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.
> - **Mettre à jour le README** avec la doc mock.

## Contexte

`aisnitch mock <tool>` génère des séquences d'events **fake mais réalistes** pour un tool donné. C'est utile pour :
1. **Tester le pipeline** sans avoir le tool installé
2. **Démontrer** AISnitch lors d'une démo/screencast
3. **CI** — tests déterministes sans API key
4. **Développer le TUI** sans besoin d'un vrai AI tool

## Sous-étapes

- [x] Créer `src/cli/commands/mock.ts` — Commande `aisnitch mock <tool>` :
  - [x] Argument : tool name (claude-code, opencode, all)
  - [x] Flag `--speed <factor>` : vitesse de simulation (défaut 1x, 2x = rapide, 0.5x = lent)
  - [x] Flag `--loop` : boucle indéfiniment
  - [x] Flag `--duration <seconds>` : durée de la simulation (défaut 60s)
- [x] Créer `src/cli/mock/scenarios.ts` — Scénarios de simulation par tool :
  - [x] **Claude Code scenario** : session.start → task.start → agent.thinking (2s) → agent.tool_call (Read file) → agent.thinking (1s) → agent.coding (3s) → agent.tool_call (Write file) → task.complete → agent.idle
  - [x] **OpenCode scenario** : session.start → task.start → agent.thinking (1s) → agent.coding (2s) → agent.tool_call (Bash) → task.complete → agent.idle
  - [x] **All tools scenario** : simule 3+ tools en parallèle avec des timings décalés
- [x] Les events mock utilisent des données réalistes :
  - [x] toolName : Read, Write, Bash, Edit (pour les tool_calls)
  - [x] filePath : des chemins crédibles (`src/index.ts`, `package.json`)
  - [x] model : modèles réels (`claude-sonnet-4-20250514`, `gpt-4`)
  - [x] tokensUsed : valeurs réalistes (500-5000)
- [x] Les events mock passent par le même pipeline que les vrais events (EventBus → WS)
- [x] Ajouter une commande combinée : `aisnitch start --mock` → démarre avec des mock events pour la démo

- [x] Écrire tests :
  - [x] Chaque scénario génère les bons events dans le bon ordre
  - [x] Les timings sont respectés (avec tolérance)
  - [x] Les events sont valides (passent la validation Zod)
- [x] Mettre à jour le README avec exemples

## Spécifications techniques

### Scénario mock (esquisse)
```typescript
// 📖 Scénario de simulation Claude Code — séquence réaliste d'events
const claudeCodeScenario: MockScenario = {
  tool: 'claude-code',
  steps: [
    { delay: 0,    type: 'session.start', data: { project: 'my-project' } },
    { delay: 1000, type: 'task.start', data: {} },
    { delay: 500,  type: 'agent.thinking', data: {} },
    { delay: 2000, type: 'agent.tool_call', data: { toolName: 'Read', toolInput: { filePath: 'src/index.ts' } } },
    { delay: 1000, type: 'agent.thinking', data: {} },
    { delay: 3000, type: 'agent.coding', data: { activeFile: 'src/index.ts' } },
    { delay: 2000, type: 'agent.tool_call', data: { toolName: 'Write', toolInput: { filePath: 'src/index.ts' } } },
    { delay: 500,  type: 'task.complete', data: { tokensUsed: 3400 } },
    { delay: 5000, type: 'agent.idle', data: {} },
  ],
};
```

## Critères de complétion

- [x] `aisnitch mock claude-code` génère des events réalistes
- [x] `aisnitch mock opencode` génère des events réalistes
- [x] `aisnitch mock all` simule plusieurs tools
- [x] `--speed`, `--loop`, `--duration` fonctionnent
- [x] Events mock valides et passent par le pipeline normal
- [x] `aisnitch start --mock` fonctionne pour les démos
- [x] Tests passent
- [x] README mis à jour
- [x] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**

- `aisnitch mock` et `aisnitch start --mock` sont câblés sur le pipeline réel, pas sur un mode démo parallèle.
- Les scénarios couvrent `claude-code`, `opencode`, et `all` avec données réalistes (models, tool names, file paths, tokens).
- Les tests couvrent l'ordre, la validité Zod, et les options `--speed`, `--loop`, `--duration`.
