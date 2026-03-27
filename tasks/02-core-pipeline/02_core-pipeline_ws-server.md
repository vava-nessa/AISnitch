# 02 — Core Pipeline : WebSocket Server

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-core-pipeline.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `02_core-pipeline_ws-server_DONE.md`
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.

## Contexte

Le WebSocket server est l'**API principale** d'AISnitch. C'est par là que tous les consumers (TUI, app Swift mascotte, dashboards...) se connectent pour recevoir le flux d'events en temps réel. Chaque consumer connecté reçoit les events via un **ring buffer** avec backpressure.

**Port par défaut : 4820** (configurable via config)

## Ressources

- **`CLAUDE_DATA.md`** section "Layer 3 — WebSocket server" — benchmarks `ws` (~8,200 ops/sec)
- **`CLAUDE_DATA.md`** section "per-consumer ring buffer"
- Lib : `ws` v8.x — zero deps, battle-tested, [npm](https://www.npmjs.com/package/ws)

## Sous-étapes

- [ ] Installer `ws` et `@types/ws`
- [ ] Créer `src/core/engine/ws-server.ts` :
  - [ ] Classe `WSServer` encapsulant le serveur WebSocket
  - [ ] `start(port, eventBus)` — lance le serveur, s'abonne à l'EventBus
  - [ ] `stop()` — ferme proprement toutes les connexions
  - [ ] Gestion des connexions : chaque client reçoit les events en JSON
  - [ ] **Ring buffer par consumer** : max 1,000 events en attente. Si le buffer déborde, les plus anciens sont droppés (oldest-first)
  - [ ] **Backpressure** : vérifier `ws.bufferedAmount` avant d'envoyer. Si > seuil, skip l'event pour ce consumer
  - [ ] Compteurs : nombre de consumers connectés, events envoyés, events droppés
  - [ ] Bind `localhost` uniquement (sécurité)
- [ ] Créer `src/core/engine/ring-buffer.ts` :
  - [ ] Classe `RingBuffer<T>` générique avec taille configurable
  - [ ] `push(item)`, `drain()`, `size`, `isFull`
- [ ] Gestion heartbeat/ping : ping toutes les 30s, déconnexion si pas de pong en 10s
- [ ] Message de bienvenue à la connexion : `{ type: "welcome", version: "0.1.0", tools: [...activeAdapters] }`
- [ ] Écrire tests unitaires :
  - [ ] Serveur démarre et accepte connexions
  - [ ] Event publié sur EventBus → reçu par client WS
  - [ ] Ring buffer : overflow drop oldest
  - [ ] Déconnexion propre
  - [ ] Multiple clients simultanés
- [ ] Vérifier `pnpm build` + `pnpm test`

## Spécifications techniques

### WSServer (esquisse)
```typescript
import { WebSocketServer, WebSocket } from 'ws';

// 📖 WebSocket server — API de diffusion temps réel des events vers les consumers
class WSServer {
  private wss: WebSocketServer | null = null;
  private consumers = new Map<WebSocket, RingBuffer<AISnitchEvent>>();

  async start(port: number, eventBus: EventBus): Promise<void> {
    this.wss = new WebSocketServer({ port, host: '127.0.0.1' });

    this.wss.on('connection', (ws) => {
      // 📖 Chaque consumer a son propre ring buffer de 1000 events
      this.consumers.set(ws, new RingBuffer(1000));
      ws.send(JSON.stringify({ type: 'welcome', version: '0.1.0' }));

      ws.on('close', () => this.consumers.delete(ws));
    });

    // 📖 Chaque event publié sur le bus est diffusé à tous les consumers connectés
    eventBus.subscribe((event) => {
      for (const [ws, buffer] of this.consumers) {
        if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 1024 * 64) {
          ws.send(JSON.stringify(event));
        }
        // Si backpressure détectée, buffer dans le ring buffer
      }
    });
  }
}
```

### RingBuffer
```typescript
// 📖 Buffer circulaire — drop les plus anciens si plein (oldest-first)
class RingBuffer<T> {
  private buffer: T[];
  private head = 0;
  private count = 0;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(item: T): void { /* ... */ }
  drain(): T[] { /* retourne et vide tous les items */ }
  get size(): number { return this.count; }
}
```

## Critères de complétion

- [ ] Serveur WS écoute sur le port configuré (localhost only)
- [ ] Events de l'EventBus diffusés en temps réel à tous les consumers
- [ ] Ring buffer fonctionne (oldest-first drop)
- [ ] Backpressure détectée et gérée (pas de OOM)
- [ ] Heartbeat ping/pong actif
- [ ] Message de bienvenue envoyé à la connexion
- [ ] Tests passent (min 5 tests)
- [ ] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**
