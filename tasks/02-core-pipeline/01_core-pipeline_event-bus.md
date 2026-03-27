# 01 — Core Pipeline : Event Bus

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-core-pipeline.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `01_core-pipeline_event-bus_DONE.md`
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.

## Contexte

L'Event Bus est le cœur du pipeline AISnitch. C'est un pub/sub in-memory typé qui reçoit les events des adapters et les redistribue aux consumers (WebSocket, TUI). Il utilise `eventemitter3` pour la performance (plus rapide que le EventEmitter natif Node, ~4KB, zero deps).

**Architecture : Adapter → EventBus → WebSocket/TUI (pas de persistence)**

## Ressources

- **`CLAUDE_DATA.md`** section "Layer 1 — In-process EventEmitter"
- Lib : `eventemitter3` v5.x — [npm](https://www.npmjs.com/package/eventemitter3)
- Les schemas Zod de la tâche 01-project-setup/02

## Sous-étapes

- [ ] Installer `eventemitter3`
- [ ] Créer `src/core/engine/event-bus.ts` :
  - [ ] Classe `EventBus` wrappant eventemitter3 avec typage strict
  - [ ] Méthode `publish(event: AISnitchEvent)` — valide avec Zod, émet sur le bus
  - [ ] Méthode `subscribe(handler: (event: AISnitchEvent) => void)` — écoute tous les events
  - [ ] Méthode `subscribeType(type: AISnitchEventType, handler)` — écoute un type spécifique
  - [ ] Méthode `unsubscribe(handler)` / `unsubscribeAll()`
  - [ ] Compteur interne : nombre d'events publiés (pour `aisnitch status`)
  - [ ] Log via `pino` en mode debug : chaque event publié
- [ ] Installer `pino` pour le logging structuré
- [ ] Créer `src/core/engine/logger.ts` — instance pino partagée (stdout only, **aucun fichier**)
- [ ] Créer `src/core/engine/index.ts` — barrel export
- [ ] Écrire tests unitaires (`src/core/engine/__tests__/event-bus.test.ts`) :
  - [ ] Publish + subscribe reçoit l'event
  - [ ] subscribeType filtre correctement
  - [ ] Unsubscribe fonctionne
  - [ ] Event invalide (Zod) est rejeté gracieusement (log error, pas crash)
  - [ ] Compteur incrémente
- [ ] Vérifier `pnpm build` + `pnpm test`

## Spécifications techniques

### EventBus API
```typescript
import EventEmitter from 'eventemitter3';

// 📖 Event Bus central — reçoit les events des adapters, redistribue aux consumers
class EventBus {
  private emitter = new EventEmitter();
  private eventCount = 0;

  publish(event: AISnitchEvent): void {
    // 📖 Valide l'event avec Zod avant diffusion
    const parsed = AISnitchEventSchema.safeParse(event);
    if (!parsed.success) {
      logger.warn({ error: parsed.error }, 'Invalid event rejected');
      return;
    }
    this.eventCount++;
    this.emitter.emit('event', parsed.data);
    this.emitter.emit(`event:${parsed.data.type}`, parsed.data);
  }

  subscribe(handler: (event: AISnitchEvent) => void): void {
    this.emitter.on('event', handler);
  }

  getStats(): { eventCount: number } {
    return { eventCount: this.eventCount };
  }
}
```

### Logger (pino, stdout only)
```typescript
import pino from 'pino';

// 📖 Logger global — stdout uniquement, AUCUN fichier de log persistant
export const logger = pino({
  level: config.logLevel ?? 'info',
  transport: {
    target: 'pino-pretty',  // dev mode pretty print
    options: { colorize: true }
  }
});
```

## Critères de complétion

- [ ] EventBus publie et distribue les events correctement
- [ ] Typage strict sans `any`
- [ ] Events invalides rejetés gracieusement (pas de crash)
- [ ] Logger pino fonctionne (stdout only)
- [ ] Tests unitaires passent (min 5 tests)
- [ ] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**
