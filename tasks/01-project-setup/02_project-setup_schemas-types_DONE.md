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

- [x] Installer `zod` et `nanoid` (ou package UUIDv7)
- [x] Créer `src/core/events/schema.ts` — Zod schemas pour :
  - [x] `AISnitchEventSchema` — enveloppe CloudEvents complète
  - [x] `AISnitchEventTypeSchema` — enum des 12 types d'events
  - [x] `ToolNameSchema` — enum des tools supportés
  - [x] `EventDataSchema` — bloc `data` avec tous les champs optionnels
- [x] Créer `src/core/events/types.ts` — Types TypeScript inférés depuis Zod :
  - [x] `type AISnitchEvent = z.infer<typeof AISnitchEventSchema>`
  - [x] `type AISnitchEventType = z.infer<typeof AISnitchEventTypeSchema>`
  - [x] `type ToolName = z.infer<typeof ToolNameSchema>`
- [x] Créer `src/core/events/cesp.ts` — Mapping CESP PeonPing :
  - [x] `getCESPCategory(event)` → retourne la catégorie CESP correspondante
  - [x] Table de mapping des 12 types vers les 6 catégories CESP
- [x] Créer `src/core/events/factory.ts` — Factory function :
  - [x] `createEvent(partial)` → génère id (UUIDv7), time (ISO 8601), specversion, valide avec Zod
- [x] Créer `src/core/events/index.ts` — barrel export
- [x] Écrire tests unitaires (`src/core/events/__tests__/schema.test.ts`) :
  - [x] Validation d'un event valide
  - [x] Rejet d'un event invalide (champ manquant, type inconnu)
  - [x] CESP mapping correct pour chaque type
  - [x] Factory crée un event valide
- [x] Vérifier `pnpm build` + `pnpm test`

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
// 📖 Ajouter "openclaw" à l'enum — 247k stars GitHub, racheté par OpenAI (mars 2026)
const ToolNames = [
  'claude-code', 'opencode', 'gemini-cli', 'codex',
  'goose', 'copilot-cli', 'cursor', 'aider', 'amp',
  'cline', 'continue', 'windsurf', 'qwen-code',
  'openclaw',   // ← nouveau — voir tâche 06-adapters-secondary/04
  'openhands', 'kilo', 'unknown',
] as const;
```

### Structure event complète avec Context Enrichment
```typescript
// 📖 Voir CLAUDE_DATA.md section "Universal event schema" pour le détail complet
// 📖 Les champs terminal/cwd/pid/instanceId sont renseignés par le ContextDetector
//    (tâche 02-core-pipeline/04_core-pipeline_context-detector.md)
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

    // 📖 Context enrichment — renseignés par ContextDetector (02-core-pipeline/04)
    terminal?: string;                // "iTerm2" | "Ghostty" | "WezTerm" | "Terminal.app" | "kitty" | "tmux" | "unknown"
    cwd?: string;                     // "/Users/vava/projects/myapp" — dossier projet en cours
    pid?: number;                     // PID du process AI tool (ex: 12345)
    instanceId?: string;              // "claude-code:abc123" — ID unique de l'instance
    instanceIndex?: number;           // 2 — position parmi instances actives (ex: claude #2)
    instanceTotal?: number;           // 3 — nb total d'instances du même tool actives
  };
}
```

### Zod Schema additions (context enrichment)
```typescript
// 📖 Ajouter ces champs au EventDataSchema Zod existant
const EventDataSchema = z.object({
  // ... champs existants ...

  // Context enrichment (tous optionnels)
  terminal:      z.string().optional(),
  cwd:           z.string().optional(),
  pid:           z.number().int().positive().optional(),
  instanceId:    z.string().optional(),
  instanceIndex: z.number().int().min(1).optional(),
  instanceTotal: z.number().int().min(1).optional(),
});
```

## Critères de complétion

- [x] Tous les schemas Zod compilent et valident correctement
- [x] Types TypeScript inférés automatiquement (aucun `any`)
- [x] CESP mapping couvre les 12 types
- [x] Factory produit des events valides avec UUIDv7 + ISO timestamp
- [x] Tests unitaires passent (min 8 tests)
- [x] Code documenté avec `📖` et JSDoc
- [x] `pnpm build` + `pnpm test` OK

---

## 📝 RAPPORT FINAL
> Réalisé :
> - Recherche Exa sur la spec CloudEvents 1.0 et les patterns Zod actuels
> - Implémentation du contrat d’event complet dans `src/core/events/`
> - Ajout du factory UUIDv7 avec validation stricte via Zod
> - Ajout du mapping CESP et des types inférés TypeScript
> - Ajout de tests unitaires ciblés sur validation, mapping et factory
>
> Note d’implémentation :
> - Zod **4** a été utilisé au lieu de Zod 3, car c’est la version stable actuelle vérifiée pendant la recherche
> - `uuid` a été retenu pour générer des UUIDv7 standardisés
>
> Vérifications :
> - `pnpm test`
> - `pnpm build`
