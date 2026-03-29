# 02 — Client SDK : Core Client & Auto-Reconnect

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-client-sdk.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `02_client-sdk_core-reconnect_DONE.md`
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.

## Contexte

Le cœur du SDK : une classe `AISnitchClient` qui gère la connexion WebSocket, le parsing des events, l'auto-reconnect avec exponential backoff, et le welcome message. Doit fonctionner en Node.js (via `ws`) et en browser (via `WebSocket` natif) sans forcer une dépendance.

## Sous-étapes

- [ ] Créer `packages/client/src/client.ts` — Classe `AISnitchClient` :
  - [ ] Constructor avec options :
    ```typescript
    interface AISnitchClientOptions {
      url?: string;                    // défaut: 'ws://127.0.0.1:4820'
      autoReconnect?: boolean;         // défaut: true
      reconnectIntervalMs?: number;    // défaut: 3000
      maxReconnectIntervalMs?: number; // défaut: 30000 (exponential backoff cap)
      WebSocketClass?: typeof WebSocket; // injection pour Node.js (ws) ou custom
    }
    ```
  - [ ] Méthode `connect(): void` — ouvre la connexion WS
  - [ ] Méthode `disconnect(): void` — ferme proprement (pas de reconnect)
  - [ ] Méthode `destroy(): void` — cleanup total (disconnect + remove all listeners)
  - [ ] Auto-reconnect avec exponential backoff (3s → 6s → 12s → ... cap 30s)
  - [ ] Reset du backoff dès qu'une connexion réussit
  - [ ] Propriétés readonly : `connected: boolean`, `welcome: WelcomeMessage | null`
- [ ] Event emitter pattern (typed) :
  ```typescript
  client.on('event', (event: AISnitchEvent) => { ... });       // tous les events
  client.on('connected', (welcome: WelcomeMessage) => { ... }); // connexion + welcome reçu
  client.on('disconnected', () => { ... });                      // déconnexion
  client.on('error', (err: Error) => { ... });                   // erreur WS
  ```
  - [ ] Utiliser un simple EventTarget/EventEmitter pattern (pas de dep externe)
  - [ ] Chaque event reçu est Zod-parsé via `parseEvent()` — les invalides sont silencieusement ignorés
  - [ ] Le welcome message est intercepté et stocké, pas émis comme un event normal
- [ ] Créer `packages/client/src/create.ts` — Factory function :
  ```typescript
  // 📖 Point d'entrée principal — crée un client et connecte immédiatement
  export function createAISnitchClient(options?: AISnitchClientOptions): AISnitchClient {
    const client = new AISnitchClient(options);
    client.connect();
    return client;
  }
  ```
- [ ] Gestion browser vs Node :
  - [ ] En browser : utilise `globalThis.WebSocket` automatiquement
  - [ ] En Node : l'utilisateur passe `ws` via `WebSocketClass` option, ou on tente un `import('ws')` dynamique
  - [ ] Pas de hard dependency sur `ws` — c'est un optional peer dep
- [ ] Vérifier build : `cd packages/client && pnpm build`

## Spécifications techniques

### Usage cible (Node.js)
```typescript
import { createAISnitchClient } from '@aisnitch/client';
import WebSocket from 'ws';

const client = createAISnitchClient({ WebSocketClass: WebSocket as any });

client.on('event', (e) => {
  console.log(`${e['aisnitch.tool']} — ${e.type}`);
});

client.on('connected', (welcome) => {
  console.log('AISnitch v' + welcome.version, welcome.activeTools);
});
```

### Usage cible (Browser)
```typescript
import { createAISnitchClient } from '@aisnitch/client';

// 📖 En browser, WebSocket natif est détecté automatiquement
const client = createAISnitchClient();

client.on('event', (e) => {
  document.getElementById('status')!.textContent =
    `${e['aisnitch.tool']} — ${e.type}`;
});
```

### Exponential Backoff

```
Tentative 1 → wait 3s
Tentative 2 → wait 6s
Tentative 3 → wait 12s
Tentative 4 → wait 24s
Tentative 5+ → wait 30s (cap)
```

Reset à 3s dès qu'une connexion est établie et le welcome reçu.

## Critères de complétion

- [ ] Client se connecte, reçoit le welcome, émet les events parsés
- [ ] Auto-reconnect fonctionne avec exponential backoff
- [ ] `disconnect()` coupe proprement sans reconnect
- [ ] `destroy()` cleanup total
- [ ] Fonctionne en browser (WebSocket natif) et Node.js (ws injecté)
- [ ] Events invalides ignorés silencieusement (pas de crash)
- [ ] Zero prod dependency
