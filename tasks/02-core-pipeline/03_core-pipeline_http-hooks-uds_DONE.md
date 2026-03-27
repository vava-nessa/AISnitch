# 03 — Core Pipeline : HTTP Hooks & UDS

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-core-pipeline.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `03_core-pipeline_http-hooks-uds_DONE.md`
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.

## Contexte

Deux canaux d'ingestion supplémentaires :

1. **HTTP Hook Receiver** (port 4821) — Les AI tools comme Claude Code peuvent envoyer des events via POST HTTP fire-and-forget. C'est le canal le plus riche pour les tools qui supportent les hooks natifs.

2. **Unix Domain Socket** (UDS) — Canal IPC à faible latence pour les adapters out-of-process ou communautaires. 50% plus rapide que TCP loopback, zéro conflit de port. Protocol: NDJSON.

## Ressources

- **`CLAUDE_DATA.md`** section "Layer 2 — Unix Domain Socket server" + "HTTP endpoint"
- **`CLAUDE_DATA.md`** section "Hook receiver pattern" — exemple Fastify route
- HTTP : Node.js `http` natif (pas besoin de Fastify pour un seul endpoint)
- UDS : Node.js `net` module natif

## Sous-étapes

### HTTP Hook Receiver
- [x] Créer `src/core/engine/http-receiver.ts` :
  - [x] Serveur HTTP léger (module `http` natif, pas de framework)
  - [x] Route `POST /hooks/:tool` — reçoit le JSON body, identifie le tool, passe à l'adapter
  - [x] Route `GET /health` — retourne `{ status: "ok", uptime, consumers, events }`
  - [x] Bind `127.0.0.1` uniquement
  - [x] Port configurable (défaut 4821)
  - [x] Gestion erreur : body malformé → 400, tool inconnu → 404, pas de crash
  - [x] Response rapide (< 10ms) — fire & forget, pas de processing synchrone

### Unix Domain Socket
- [x] Créer `src/core/engine/uds-server.ts` :
  - [x] Serveur UDS via `net.createServer()` sur `~/.aisnitch/aisnitch.sock`
  - [x] Protocol : NDJSON (une ligne JSON = un event)
  - [x] Chaque connexion UDS est parsée ligne par ligne
  - [x] Events validés avec Zod puis publiés sur l'EventBus
  - [x] Cleanup du socket file au shutdown (`fs.unlinkSync`)
  - [x] Gestion du cas "socket file existe déjà" (stale PID check)

### Intégration
- [x] Créer `src/core/engine/pipeline.ts` — Classe `Pipeline` qui orchestre tout :
  - [x] `start(config)` — démarre EventBus + WSServer + HTTPReceiver + UDSServer
  - [x] `stop()` — shutdown propre de tous les composants
  - [x] `getStatus()` — retourne l'état de chaque composant
- [x] Écrire tests unitaires :
  - [x] POST sur `/hooks/claude-code` → event reçu sur WS
  - [x] POST body malformé → 400 sans crash
  - [x] Connexion UDS + envoi NDJSON → event reçu sur WS
  - [x] Health endpoint retourne les bonnes stats
  - [x] Pipeline start/stop lifecycle propre
- [x] Vérifier `pnpm build` + `pnpm test`

## Spécifications techniques

### HTTP Receiver (esquisse)
```typescript
import { createServer } from 'node:http';

// 📖 HTTP hook receiver — reçoit les events POST des AI tools (Claude Code, etc.)
class HTTPReceiver {
  async start(port: number, eventBus: EventBus, adapters: AdapterRegistry): Promise<void> {
    const server = createServer(async (req, res) => {
      // 📖 Route: POST /hooks/:tool — fire & forget
      const match = req.url?.match(/^\/hooks\/(.+)$/);
      if (req.method === 'POST' && match) {
        const toolName = match[1];
        const body = await readBody(req);
        const adapter = adapters.get(toolName);
        if (adapter) {
          adapter.handleHook(JSON.parse(body));
          res.writeHead(200).end('ok');
        } else {
          res.writeHead(404).end('unknown tool');
        }
        return;
      }

      // 📖 Route: GET /health
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
        return;
      }

      res.writeHead(404).end();
    });

    server.listen(port, '127.0.0.1');
  }
}
```

### UDS Server (esquisse)
```typescript
import { createServer } from 'node:net';
import { createInterface } from 'node:readline';

// 📖 UDS server — canal IPC NDJSON pour adapters out-of-process
class UDSServer {
  async start(socketPath: string, eventBus: EventBus): Promise<void> {
    const server = createServer((socket) => {
      const rl = createInterface({ input: socket });
      rl.on('line', (line) => {
        try {
          const event = AISnitchEventSchema.parse(JSON.parse(line));
          eventBus.publish(event);
        } catch (err) {
          logger.warn({ err, line }, 'Invalid NDJSON on UDS');
        }
      });
    });

    // 📖 Cleanup stale socket avant bind
    if (existsSync(socketPath)) unlinkSync(socketPath);
    server.listen(socketPath);
  }
}
```

## Critères de complétion

- [x] HTTP receiver accepte des POST JSON et les route vers les adapters
- [x] Health endpoint retourne les stats
- [x] UDS server accepte des connexions NDJSON
- [x] Pipeline orchestre tous les composants
- [x] Tout bind sur localhost uniquement
- [x] Tests passent (min 5 tests)
- [x] Code documenté

---

## 📝 RAPPORT FINAL
> Réalisé :
> - Ajout du `HTTPReceiver` avec `POST /hooks/:tool`, `GET /health`, réponses rapides et gestion d’erreurs sans crash
> - Ajout du `UDSServer` NDJSON avec nettoyage de socket stale et suppression propre au shutdown
> - Ajout du `Pipeline` pour orchestrer EventBus, WebSocket, HTTP et UDS dans un seul cycle de vie
> - Ajout de 5 tests d’intégration couvrant hook HTTP, invalid body, UDS, health et lifecycle
>
> Vérifications :
> - `pnpm test`
> - `pnpm build`
> - `pnpm check`
