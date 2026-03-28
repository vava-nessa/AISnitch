# 03 — Client SDK : Session Tracking, Filters & Helpers

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-client-sdk.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `03_client-sdk_sessions-filters_DONE.md`
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.

## Contexte

Au-delà de la connexion brute, les consommateurs ont besoin de : tracker les sessions actives, filtrer par tool/type, et transformer les events en texte lisible. Ces helpers sont actuellement des exemples dans le README — on les package proprement.

## Sous-étapes

- [ ] Créer `packages/client/src/sessions.ts` — Session tracker :
  ```typescript
  interface SessionState {
    tool: ToolName;
    sessionId: string;
    project?: string;
    cwd?: string;
    lastEvent: AISnitchEvent;
    lastActivity: string;     // human-readable description
    eventCount: number;
    startedAt: string;        // ISO timestamp
  }
  ```
  - [ ] Classe `SessionTracker` :
    - [ ] `update(event: AISnitchEvent): void` — met à jour la session map
    - [ ] `get(sessionId: string): SessionState | undefined`
    - [ ] `getAll(): SessionState[]` — toutes les sessions actives
    - [ ] `getByTool(tool: ToolName): SessionState[]`
    - [ ] `count: number` — nombre de sessions actives
    - [ ] Auto-suppression sur `session.end`
  - [ ] Intégration dans `AISnitchClient` — optionnelle :
    ```typescript
    const client = createAISnitchClient({ trackSessions: true }); // défaut: true
    client.sessions.getAll(); // → SessionState[]
    ```
- [ ] Créer `packages/client/src/filters.ts` — Typed filter functions :
  ```typescript
  // 📖 Filters prêts à l'emploi — à passer dans client.on('event', filter(...))
  export const filters = {
    byTool: (tool: ToolName) => (e: AISnitchEvent) => e['aisnitch.tool'] === tool,
    byType: (type: AISnitchEventType) => (e: AISnitchEvent) => e.type === type,
    byTypes: (...types: AISnitchEventType[]) => (e: AISnitchEvent) => types.includes(e.type),
    byProject: (project: string) => (e: AISnitchEvent) => e.data.project === project,
    needsAttention: (e: AISnitchEvent) => e.type === 'agent.asking_user' || e.type === 'agent.error',
    isCoding: (e: AISnitchEvent) => e.type === 'agent.coding' || e.type === 'agent.tool_call',
    isActive: (e: AISnitchEvent) => !['agent.idle', 'session.end'].includes(e.type),
  };
  ```
  - [ ] Méthode `client.on('event', callback, filter?)` — filtre optionnel intégré
  - [ ] OU helper `client.filtered(filter).on('event', callback)` — chainable
- [ ] Créer `packages/client/src/describe.ts` — Human-readable helpers :
  - [ ] `describeEvent(event: AISnitchEvent): string` — description courte
    - Ex: `"claude-code is editing code → src/index.ts [myproject]"`
  - [ ] `formatStatusLine(event: AISnitchEvent, sessionNumber?: number): string` — status line numérotée
    - Ex: `"#1 /home/user/myproject — claude-code is thinking..."`
  - [ ] `eventToMascotState(event: AISnitchEvent): MascotState` — pour animated companions
    ```typescript
    interface MascotState {
      mood: 'idle' | 'thinking' | 'working' | 'waiting' | 'celebrating' | 'panicking';
      animation: string;
      color: string;
      label: string;
      detail?: string;
    }
    ```
- [ ] Mettre à jour `packages/client/src/index.ts` — barrel export de tout :
  ```typescript
  export { AISnitchClient, createAISnitchClient } from './client';
  export type { AISnitchClientOptions } from './client';
  export { SessionTracker } from './sessions';
  export type { SessionState } from './sessions';
  export { filters } from './filters';
  export { describeEvent, formatStatusLine, eventToMascotState } from './describe';
  export type { MascotState } from './describe';
  export * from './types';
  export { parseEvent } from './schema';
  ```
- [ ] Vérifier build : `cd packages/client && pnpm build`

## Usage cible

```typescript
import { createAISnitchClient, filters, describeEvent } from '@aisnitch/client';

const client = createAISnitchClient();

// 📖 Events filtrés — seulement Claude Code qui code
client.on('event', (e) => {
  console.log(describeEvent(e));
}, filters.byTool('claude-code'));

// 📖 Sessions actives
console.log(client.sessions.getAll());

// 📖 Companion/mascot state
import { eventToMascotState } from '@aisnitch/client';
client.on('event', (e) => {
  const state = eventToMascotState(e);
  updateSprite(state.mood, state.animation, state.color);
});
```

## Critères de complétion

- [ ] SessionTracker suit les sessions en temps réel
- [ ] Filtres typed fonctionnent et sont composables
- [ ] `describeEvent()` produit des descriptions humaines pour les 12 types
- [ ] `formatStatusLine()` produit des status lines numérotées
- [ ] `eventToMascotState()` mappe les 12 types vers des moods
- [ ] Tout est exporté depuis l'index barrel
- [ ] Types stricts, pas de `any`
