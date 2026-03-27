# 01 — Adapters Prioritaires : BaseAdapter & Registry

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-adapters-priority.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `01_adapters-priority_base_DONE.md`
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.

## Contexte

Le système d'adapters est le cœur de l'extensibilité d'AISnitch. Chaque AI tool a son propre adapter qui implémente une classe abstraite `BaseAdapter`. L'`AdapterRegistry` gère le cycle de vie de tous les adapters (start/stop/status).

## Ressources

- **`CLAUDE_DATA.md`** section "Adapter implementation patterns" — code complet de `BaseAdapter`
- **`CLAUDE_DATA.md`** section "InterceptionStrategy" — les 7 stratégies d'interception
- Patterns à implémenter : hooks, jsonl-watch, sqlite-watch, stream-json, process-detect, pty-wrap, api-client

## Sous-étapes

- [x] Créer `src/adapters/base.ts` — Classe abstraite `BaseAdapter` :
  - [x] Props abstraites : `name: ToolName`, `displayName: string`, `strategies: InterceptionStrategy[]`
  - [x] Méthodes abstraites : `start()`, `stop()`, `getStatus()`
  - [x] Méthode `handleHook(payload: unknown)` — pour les adapters hook-based (override par les sous-classes)
  - [x] Méthode protégée `emit(partial)` — crée un AISnitchEvent complet (factory) et publie sur le pipeline
  - [x] Méthode protégée `emitStateChange(type, data?)` — raccourci pour émettre un changement d'état
  - [x] Gestion du session tracking : `currentSessionId`, `sequenceNumber` (auto-incrémenté)
  - [x] Idle detection : timer configurable, émet `agent.idle` après X ms sans activité
- [x] Créer le type `InterceptionStrategy` :
  ```typescript
  type InterceptionStrategy =
    | 'hooks'           // Native hook API (HTTP POST receiver)
    | 'jsonl-watch'     // Watch JSONL/JSON log files
    | 'sqlite-watch'    // Watch SQLite database changes
    | 'stream-json'     // Parse NDJSON from tool stdout
    | 'process-detect'  // Scan process tree for known binaries
    | 'pty-wrap'        // Wrap tool in PTY for I/O capture
    | 'api-client';     // Connect to tool's HTTP/WebSocket API
  ```
- [x] Créer `src/adapters/registry.ts` — Classe `AdapterRegistry` :
  - [x] `register(adapter: BaseAdapter)` — enregistre un adapter
  - [x] `get(toolName: string)` — retourne l'adapter par nom
  - [x] `startAll()` — démarre tous les adapters activés (selon config)
  - [x] `stopAll()` — arrête tous les adapters
  - [x] `getStatus()` — retourne l'état de chaque adapter
  - [x] `list()` — liste tous les adapters enregistrés
- [x] Créer `src/adapters/index.ts` — barrel export + fonction `createDefaultAdapters()` qui instancie tous les adapters built-in
- [x] Écrire tests unitaires :
  - [x] Adapter mock qui extend BaseAdapter → emit fonctionne
  - [x] Registry register/get/list
  - [x] startAll/stopAll lifecycle
  - [x] Idle detection émet agent.idle après timeout
  - [x] Sequence number s'incrémente
- [x] Vérifier `pnpm build` + `pnpm test`

## Spécifications techniques

### BaseAdapter
```typescript
// 📖 Classe abstraite — chaque AI tool implémente son propre adapter
abstract class BaseAdapter {
  abstract readonly name: ToolName;
  abstract readonly displayName: string;
  abstract readonly strategies: InterceptionStrategy[];

  protected eventBus: EventBus;
  protected currentSessionId: string | null = null;
  protected sequenceNumber = 0;
  private idleTimer: NodeJS.Timeout | null = null;
  private idleTimeoutMs: number;

  constructor(eventBus: EventBus, config: AISnitchConfig) {
    this.eventBus = eventBus;
    this.idleTimeoutMs = config.idleTimeoutMs;
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract getStatus(): AdapterStatus;

  // 📖 Override dans les adapters hook-based pour parser le payload
  handleHook(payload: unknown): void {
    throw new Error(`${this.name} does not support hooks`);
  }

  // 📖 Émet un event complet sur le bus — gère id, time, session, seqnum
  protected emit(type: AISnitchEventType, data?: Partial<AISnitchEvent['data']>): void {
    this.resetIdleTimer();
    this.sequenceNumber++;

    const event = createEvent({
      source: `aisnitch://adapters/${this.name}`,
      type,
      'aisnitch.tool': this.name,
      'aisnitch.sessionid': this.currentSessionId ?? 'unknown',
      'aisnitch.seqnum': this.sequenceNumber,
      data: { state: type, ...data },
    });

    this.eventBus.publish(event);
  }

  // 📖 Reset le timer idle — tout event reçu repousse le idle
  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.emit('agent.idle');
    }, this.idleTimeoutMs);
  }
}
```

### AdapterStatus
```typescript
interface AdapterStatus {
  name: ToolName;
  displayName: string;
  running: boolean;
  strategies: InterceptionStrategy[];
  activeSessions: number;
  eventsEmitted: number;
}
```

## Critères de complétion

- [x] BaseAdapter fournit emit, idle detection, session tracking
- [x] AdapterRegistry gère le lifecycle de tous les adapters
- [x] Types stricts, pas de `any`
- [x] Tests passent (min 5 tests)
- [x] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**

- `BaseAdapter` et `AdapterRegistry` sont implémentés dans `src/adapters/base.ts` et `src/adapters/registry.ts`, avec émission d'events validés, session tracking, idle detection, lifecycle, et factory `createDefaultAdapters()`.
- Le `Pipeline` crée désormais les adapters built-in, ne route les hooks que pour les tools activés, et conserve l'enrichissement contexte via `publishEvent()` au lieu de bypass l'étape `ContextDetector`.
- Couverture ajoutée dans `src/adapters/__tests__/base-registry.test.ts` pour l'émission, les seqnums, l'idle timer, et le lifecycle registry.
