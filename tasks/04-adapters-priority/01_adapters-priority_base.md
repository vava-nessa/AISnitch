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

- [ ] Créer `src/adapters/base.ts` — Classe abstraite `BaseAdapter` :
  - [ ] Props abstraites : `name: ToolName`, `displayName: string`, `strategies: InterceptionStrategy[]`
  - [ ] Méthodes abstraites : `start()`, `stop()`, `getStatus()`
  - [ ] Méthode `handleHook(payload: unknown)` — pour les adapters hook-based (override par les sous-classes)
  - [ ] Méthode protégée `emit(partial)` — crée un AISnitchEvent complet (factory) et publie sur l'EventBus
  - [ ] Méthode protégée `emitStateChange(type, data?)` — raccourci pour émettre un changement d'état
  - [ ] Gestion du session tracking : `currentSessionId`, `sequenceNumber` (auto-incrémenté)
  - [ ] Idle detection : timer configurable, émet `agent.idle` après X ms sans activité
- [ ] Créer le type `InterceptionStrategy` :
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
- [ ] Créer `src/adapters/registry.ts` — Classe `AdapterRegistry` :
  - [ ] `register(adapter: BaseAdapter)` — enregistre un adapter
  - [ ] `get(toolName: string)` — retourne l'adapter par nom
  - [ ] `startAll()` — démarre tous les adapters activés (selon config)
  - [ ] `stopAll()` — arrête tous les adapters
  - [ ] `getStatus()` — retourne l'état de chaque adapter
  - [ ] `list()` — liste tous les adapters enregistrés
- [ ] Créer `src/adapters/index.ts` — barrel export + fonction `createDefaultAdapters()` qui instancie tous les adapters built-in
- [ ] Écrire tests unitaires :
  - [ ] Adapter mock qui extend BaseAdapter → emit fonctionne
  - [ ] Registry register/get/list
  - [ ] startAll/stopAll lifecycle
  - [ ] Idle detection émet agent.idle après timeout
  - [ ] Sequence number s'incrémente
- [ ] Vérifier `pnpm build` + `pnpm test`

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

- [ ] BaseAdapter fournit emit, idle detection, session tracking
- [ ] AdapterRegistry gère le lifecycle de tous les adapters
- [ ] Types stricts, pas de `any`
- [ ] Tests passent (min 5 tests)
- [ ] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**
