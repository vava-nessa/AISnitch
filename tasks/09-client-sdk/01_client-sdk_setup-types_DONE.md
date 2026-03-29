# 01 — Client SDK : Package Setup & Shared Types

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-client-sdk.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `01_client-sdk_setup-types_DONE.md`
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.

## Contexte

Le SDK client est un package séparé qui doit partager les types d'events avec le serveur AISnitch sans dépendre du code serveur. Il faut extraire les types/schemas dans un espace partagé ou les dupliquer intelligemment dans le SDK.

**Décision structurante** : On crée un dossier `packages/client/` dans le même repo (pas un monorepo pnpm workspace — juste un dossier avec son propre `package.json` et `tsconfig.json`). Les types sont copiés/extraits depuis `src/core/events/` au moment du build.

## Sous-étapes

- [ ] Créer `packages/client/` avec structure :
  ```
  packages/client/
  ├── package.json          # @aisnitch/client, version 0.1.0
  ├── tsconfig.json         # strict, ESM + CJS output
  ├── tsup.config.ts        # dual build ESM + CJS + .d.ts
  ├── src/
  │   ├── index.ts          # barrel export
  │   ├── types.ts          # AISnitchEvent, EventData, ToolName, EventType — extracted from server
  │   └── schema.ts         # Zod schemas for event validation (peer dep on zod)
  ├── README.md             # Consumer-facing docs (placeholder)
  └── LICENSE               # Apache 2.0 (same as main)
  ```
- [ ] Extraire dans `packages/client/src/types.ts` :
  - [x] `AISnitchEvent` — CloudEvents envelope + AISnitch extensions
  - [x] `AISnitchEventData` — normalized payload
  - [x] `AISnitchEventType` — union des 12 types
  - [x] `ToolName` — union des tool names reconnus
  - [x] `WelcomeMessage` — le message welcome envoyé à la connexion
- [ ] Extraire dans `packages/client/src/schema.ts` :
  - [ ] Schemas Zod pour valider les events reçus (parsing safe, pas de crash sur payload invalide)
  - [ ] Export `parseEvent(raw: unknown): AISnitchEvent | null` — parse safe avec fallback null
- [ ] Configurer `tsup` pour dual ESM + CJS :
  - [ ] `dist/index.js` (ESM) + `dist/index.cjs` (CJS)
  - [ ] `dist/index.d.ts` (types)
  - [ ] `dist/index.d.cts` (CJS types)
- [ ] `package.json` avec :
  - [ ] `"name": "@aisnitch/client"`
  - [ ] `"peerDependencies": { "zod": "^4.0.0" }`
  - [ ] `"exports"` map ESM/CJS
  - [ ] `"types"` field
  - [ ] `"files": ["dist"]`
- [ ] Vérifier build : `cd packages/client && pnpm build`

## Spécifications techniques

### Types extraits (from `src/core/events/`)

```typescript
// 📖 Les 12 event types normalisés CloudEvents
export type AISnitchEventType =
  | 'session.start' | 'session.end'
  | 'task.start' | 'task.complete'
  | 'agent.thinking' | 'agent.streaming' | 'agent.coding'
  | 'agent.tool_call' | 'agent.asking_user' | 'agent.idle'
  | 'agent.error' | 'agent.compact';

// 📖 Tool names reconnus par AISnitch
export type ToolName =
  | 'claude-code' | 'opencode' | 'gemini-cli' | 'codex'
  | 'goose' | 'copilot-cli' | 'cursor' | 'aider' | 'amp'
  | 'cline' | 'continue' | 'windsurf' | 'qwen-code'
  | 'openclaw' | 'openhands' | 'kilo' | 'unknown';

// 📖 Payload normalisé dans data.*
export interface AISnitchEventData {
  state: AISnitchEventType;
  project?: string;
  projectPath?: string;
  activeFile?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  model?: string;
  tokensUsed?: number;
  terminal?: string;
  cwd?: string;
  pid?: number;
  instanceIndex?: number;
  instanceTotal?: number;
  errorMessage?: string;
  errorType?: 'rate_limit' | 'context_overflow' | 'tool_failure' | 'api_error';
  raw?: Record<string, unknown>;
}

// 📖 CloudEvents v1.0 envelope + AISnitch extensions
export interface AISnitchEvent {
  specversion: '1.0';
  id: string;
  source: string;
  type: AISnitchEventType;
  time: string;
  'aisnitch.tool': ToolName;
  'aisnitch.sessionid': string;
  'aisnitch.seqnum': number;
  data: AISnitchEventData;
}

// 📖 Message de bienvenue envoyé à la connexion WS
export interface WelcomeMessage {
  type: 'welcome';
  version: string;
  activeTools: ToolName[];
  uptime: number;
}
```

## Critères de complétion

- [ ] Package buildable standalone (`pnpm build` dans `packages/client/`)
- [ ] Types 100% alignés avec le serveur (pas de drift)
- [ ] Zod schemas valident correctement un event réel
- [ ] `parseEvent()` retourne null sur payload invalide (pas de throw)
- [ ] Dual ESM + CJS fonctionne
- [ ] Zero prod dependency sauf `zod` (peer dep)
