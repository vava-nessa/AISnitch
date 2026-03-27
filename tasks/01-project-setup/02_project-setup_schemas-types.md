# 02 — Project Setup : Schemas & Types

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-project-setup.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `02_project-setup_schemas-types_DONE.md`
> - **Recherche obligatoire** : Utilise Exa.ai pour vérifier la spec CloudEvents v1.0 actuelle et les derniers patterns Zod.
> - Documente le code avec des commentaires `📖`, ajoute JSDoc sur chaque type/interface exporté.

## Contexte

Définir le schéma d'événements universel AISnitch basé sur **CloudEvents v1.0** avec compatibilité **CESP** (PeonPing). C'est le contrat de données central — tout le projet en dépend. Les schemas Zod servent à la fois de validation runtime ET de typage TypeScript inféré.

## Ressources

- **`CLAUDE_DATA.md`** section "Universal event schema: CloudEvents envelope with CESP compatibility" — contient le schéma TypeScript complet
- **`CLAUDE_DATA.md`** section "Event types and their CESP mappings" — table des 12 event types
- Spec CloudEvents : https://cloudevents.io/
- Lib : `zod` v3.x pour validation + inférence TS

## Sous-étapes

- [ ] Installer `zod` et `nanoid` (ou package UUIDv7)
- [ ] Créer `src/core/events/schema.ts` — Zod schemas pour :
  - [ ] `AISnitchEventSchema` — enveloppe CloudEvents complète
  - [ ] `AISnitchEventTypeSchema` — enum des 12 types d'events
  - [ ] `ToolNameSchema` — enum des tools supportés
  - [ ] `EventDataSchema` — bloc `data` avec tous les champs optionnels
- [ ] Créer `src/core/events/types.ts` — Types TypeScript inférés depuis Zod :
  - [ ] `type AISnitchEvent = z.infer<typeof AISnitchEventSchema>`
  - [ ] `type AISnitchEventType = z.infer<typeof AISnitchEventTypeSchema>`
  - [ ] `type ToolName = z.infer<typeof ToolNameSchema>`
- [ ] Créer `src/core/events/cesp.ts` — Mapping CESP PeonPing :
  - [ ] `getCESPCategory(event)` → retourne la catégorie CESP correspondante
  - [ ] Table de mapping des 12 types vers les 6 catégories CESP
- [ ] Créer `src/core/events/factory.ts` — Factory function :
  - [ ] `createEvent(partial)` → génère id (UUIDv7), time (ISO 8601), specversion, valide avec Zod
- [ ] Créer `src/core/events/index.ts` — barrel export
- [ ] Écrire tests unitaires (`src/core/events/__tests__/schema.test.ts`) :
  - [ ] Validation d'un event valide
  - [ ] Rejet d'un event invalide (champ manquant, type inconnu)
  - [ ] CESP mapping correct pour chaque type
  - [ ] Factory crée un event valide
- [ ] Vérifier `pnpm build` + `pnpm test`

## Spécifications techniques

### Les 12 types d'événements AISnitch
```typescript
const AISnitchEventTypes = [
  'session.start',      // Tool session begins
  'session.end',        // Tool session closes
  'task.start',         // User submits prompt
  'task.complete',      // Agent finishes response
  'agent.thinking',     // Agent reasoning/planning
  'agent.coding',       // Agent writing/editing code
  'agent.tool_call',    // Agent invoked a tool (Read, Write, Bash...)
  'agent.streaming',    // Agent streaming text output
  'agent.asking_user',  // Waiting for user input
  'agent.idle',         // No activity (timeout)
  'agent.error',        // Error occurred
  'agent.compact',      // Context compaction / overflow
] as const;
```

### CESP Mapping (compatibilité PeonPing)
```typescript
const CESP_MAP: Record<AISnitchEventType, CESPCategory | null> = {
  'session.start':      'session.start',
  'session.end':        'session.end',
  'task.start':         'task.acknowledge',
  'task.complete':      'task.complete',
  'agent.thinking':     null,              // pas de CESP equiv
  'agent.coding':       null,
  'agent.tool_call':    null,
  'agent.streaming':    null,
  'agent.asking_user':  'input.required',
  'agent.idle':         null,
  'agent.error':        'task.error',
  'agent.compact':      'resource.limit',
};
```

### Tools supportés (enum)
```typescript
const ToolNames = [
  'claude-code', 'opencode', 'gemini-cli', 'codex',
  'goose', 'copilot-cli', 'cursor', 'aider', 'amp',
  'cline', 'continue', 'windsurf', 'qwen-code',
  'openhands', 'kilo', 'unknown',
] as const;
```

### Structure event complète (référence CLAUDE_DATA.md)
```typescript
// 📖 Voir CLAUDE_DATA.md section "Universal event schema" pour le détail complet
interface AISnitchEvent {
  specversion: '1.0';
  id: string;                         // UUIDv7 (time-sortable)
  source: string;                     // "aisnitch://adapters/claude-code"
  type: AISnitchEventType;
  time: string;                       // ISO 8601
  'aisnitch.tool': ToolName;
  'aisnitch.sessionid': string;
  'aisnitch.seqnum': number;
  data: {
    state: AISnitchEventType;
    project?: string;
    projectPath?: string;
    duration?: number;                // ms
    toolName?: string;                // "Read", "Write", "Bash"...
    toolInput?: { filePath?: string; command?: string };
    activeFile?: string;
    model?: string;
    tokensUsed?: number;
    errorMessage?: string;
    errorType?: 'rate_limit' | 'context_overflow' | 'tool_failure' | 'api_error';
    raw?: Record<string, unknown>;    // Original event passthrough
  };
}
```

## Critères de complétion

- [ ] Tous les schemas Zod compilent et valident correctement
- [ ] Types TypeScript inférés automatiquement (aucun `any`)
- [ ] CESP mapping couvre les 12 types
- [ ] Factory produit des events valides avec UUIDv7 + ISO timestamp
- [ ] Tests unitaires passent (min 8 tests)
- [ ] Code documenté avec `📖` et JSDoc
- [ ] `pnpm build` + `pnpm test` OK

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**
