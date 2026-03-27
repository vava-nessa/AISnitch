# 02 — Product Shape & Final Output

## Research Protocol (Mandatory)

- L’IA peut s’informer via **Brave Search**, **Context7/Context8**, et **Exa.ai**.
- **`@CLAUDE_DATA.md` doit être consulté en priorité** : c’est la base de connaissance centrale du projet.
- Toute proposition de forme produit doit être vérifiée contre `@CLAUDE_DATA.md`.

## Décision produit

AutoSnitch MVP = **daemon headless en tâche de fond + pipeline IPC hybride mémoirisé + TUI live monitor**.
La stack recommandée est hybride :
- ~70% de TypeScript pour le framework CLI (Commander), WebSocket Server (ws), le magasin SQLite WAL (better-sqlite3) et l'Event Bus (eventemitter3).
- ~30% de natif en Rust (via `napi-rs`) pour la capture système bas niveau : wrapper PTY cross-platform, process monitoring performant via libproc/kqueue (macOS), et file watching FSEvents/notify.

## Final Output attendu

### 1) Pipeline IPC multicouches
L’architecture repose sur un mix d’IPC optimisées :
- **Layer 1 (In-process)** : Un `eventemitter3` type-safe pour toutes les routines tournant nativement dans le daemon (File Watcher, Process Monitor, etc.).
- **Layer 2 (Unix Domain Sockets)** : Un serveur socket (module `net`) sur `~/.autosnitch/autosnitch.sock` pour capturer les streams d'adapters externes en évitant les collisions de ports TCP. Protocol: NDJSON (Newline-Delimited JSON).
- **Layer 3 (HTTP Hook Receiver)** : Endpoint Fastify/Express allégé (ex: `localhost:4821/hooks/:tool`) servant les intégrations HTTP push comme celles de Claude Code.

### 2) Output principal (Streaming API)
Le produit expose un Flux d’événements normalisés en temps réel via un **serveur WebSocket `ws://localhost:4820`**.
- La structure utilise une enveloppe **CloudEvents v1.0** (assurant l'interopérabilité multiclient) :
  - Identifiants de base : `id` (UUIDv7 temporel), `time` (ISO 8601), `source`, `type`.
  - Extensions AutoSnitch : `autosnitch.tool`, `autosnitch.sessionid`, `autosnitch.seqnum`.
  - Bloc `data` riche comprenant : l'état courant (`state`), durée (`duration`), nom d'action ou fichier (`toolName`, `activeFile`, `toolInput`), compteurs tokens (`tokensUsed`).
- L'API gère la backpressure en utilisant un buffer circulaire par souscription (1 000 événements) en lisant la valeur tamponnée du TCP.

### 3) Output visible utilisateur (MVP)
- **TUI live** affichant l’activité des tools en cours :
  - **session start/end** (Ex: CESP `session.start`/`session.end`)
  - **task start/complete** (Ex: CESP `task.acknowledge`/`task.complete`)
  - **thinking/coding/tool_call/streaming** (Transitions granulaires détaillées)
  - **asking_user/error/idle/compact** (Alertes, interrupts passifs et CESP `resource.limit`)

### 4) Ce qui est explicitement exclu
- stockage local des payloads à des fins analytiques permanentes.
- API REST historique et historique des prompts rejouable.
- base de données SQL persistée sans rotation continue (tout SQLite utilisé est en WAL purement tampon/transitoire "cache" de max 7 jours rotatif).

## UX cible du TUI (MVP)

Le TUI est l’interface de monitor principale avant toute app produit plus poussée (mascotte animée, app menu bar).

Fonctions minimales :
1. Timeline live des events (NDJSON parsé de websocket).
2. Filtres par tool (`--tool=claude`) et type d’event.
3. Vue “sessions actives” gérée par une state machine (état actif/idle).
4. Badge d’état global qui retranscrit instantanément l’UI de CLI : ◇ (Ready), ✋ (Action Required), ✦ (Working).
5. Redaction optionnelle des champs sensibles à l’affichage (`toolInput`, `paths`).

## Positionnement

Le TUI n’est pas un simple debug panel dans ce MVP : c’est le **consumer principal** pour valider la valeur produit “watch activity live”. Il doit gérer nativement et de façon visuelle les transitions de la state machine interne : 
`session.start → agent.idle → task.start → agent.thinking → agent.coding ↔ agent.tool_call → task.complete → agent.idle`.
