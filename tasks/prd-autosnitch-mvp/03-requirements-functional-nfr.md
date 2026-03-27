# 03 — Functional Requirements + NFR

## Research Protocol (Mandatory)

- L’IA peut utiliser la recherche via **Brave Search**, **Context7/Context8**, et **Exa.ai**.
- **`@CLAUDE_DATA.md` est obligatoire à consulter** avant d’ajouter/modifier des requirements.
- Les exigences doivent rester compatibles avec les conseils consolidés de `@CLAUDE_DATA.md`.

## Functional Requirements

### A. Daemon & Operations
1. Le système doit démarrer/stopper un daemon user-level cross-platform (idéalement implémenté via commander CLI + détachement).
2. Le daemon doit exposer des commandes CLI: `start`, `stop`, `status`, `install`, et potentiellement `setup <tool>` pour injecter les hooks.
3. Le daemon doit redémarrer automatiquement selon l’OS via un mécanisme natif au niveau de l'utilisateur (zéro root access requis) :
   - macOS: `~/Library/LaunchAgents/com.autosnitch.daemon.plist` avec `KeepAlive: true`
   - Linux: systemd user service (`systemctl --user`)
   - Windows: Startup task / service wrapper

### B. Live Ingestion & Tiers d'Interception
4. **Tier 1 (Hook-native)** : Le système doit ingérer via hooks HTTP (`localhost:4821/hooks/:tool`). Particulièrement crucial pour Claude Code (21 lifecycle events reçus via HTTP POST en mode fire & forget).
5. **Tier 2 (Structured Output & PTY)** : Le système doit pouvoir encapsuler les exécutables dans des processus attachés avec NDJSON `stream-json` (ex: Codex, Gemini, Goose) ou un fallback PTY Wrap générique (`@lydell/node-pty` ou `nix::pty` en Rust) incluant une heuristique de décodage des codes ANSI pour détecter les animations.
6. **Tier 3 (Log-only Tools)** : File watching avancé et natif. Doit ingérer via l'API FSEvents sur macOS (Chokidar v5 en Node ou le crate rust `notify`) ; ex: écoute de `~/.claude/projects/*.jsonl` ou SQLite en WAL.
7. **Tier 4 (Process Detection)** : Énumération et de tracking des PIDs légers via `kqueue` avec `EVFILT_PROC` / `libproc` en natif, sans polling couteux.

### C. Normalization & State Machine
8. Tous les signaux extraits doivent être traduits en une enveloppe CloudEvents v1.0.
9. Les 12 types d’événements finaux gérés par la State Machine incluent:
   - Synchronisation: `session.start`, `session.end`
   - Utilisateur et Objectif: `task.start`, `task.complete`, `agent.asking_user` (interrompt tout autre état actif jusqu'à réponse de l'utilisateur)
   - Activité: `agent.thinking` (ex: planning LLM), `agent.coding` (édition concrète), `agent.tool_call` (appel externe explicite)
   - Contraintes systèmes: `agent.idle` (après 1-2 min d'inactivité), `agent.error`, `agent.compact` (overflow de contexte LLM).
   - *Rétrocompatibilité*: Une méthode `getCESPCategory()` mappera ces événements avec l'API PeonPing pré-existante (ex: `agent.asking_user` → `input.required`).

### D. Streaming API (WebSocket & IPC)
10. La couche UDS (Unix Domain Sockets) permet le routage interne à faible latence (NDJSON) depuis les adapters forkés vers l'event bus in-process principal de l'orchestrateur.
11. Le hub de diffusion WebSocket expose `ws://localhost:4820` (testée pour max >8 000 ops/s).
12. La gestion anti-OOM avec backpressure inclut un **ring buffer par consommateur** limité à ~1 000 événements. Les evénements les plus anciens sont droppés si le buffer déborde.

### E. Privacy-first constraints (Hard Requirements)
13. Le système ne doit consigner AUCUN PII brut.
14. Storage temporaire toléré uniquement via `better-sqlite3` en configuration VIVE : mode WAL (`journal_mode=WAL`), PRAGMA cache configurables pour un in-memory complet `synchronous=NORMAL`, avec rétention max glissante < 7 jours purgée fréquemment.
15. Le système ne doit pas offrir d'API de replay historique complet.
16. Les événements sensibles (nommage des fichiers locaux de l'utilisateur contenus dans les ToolCalls LLM) doivent pouvoir être caviardés (Redaction API).

### F. TUI (Consumer Principal MVP)
17. Application terminal riche construite avec du layout flex (ex: react-blessed, bubbletea ou ink).
18. Doit refléter *en direct* la state machine de chaque outil sans surcoût.
19. Transitions animées ou icônes spécifiques de terminal.

## Non-Functional Requirements

1. **Latency:** p95 ingest → event diffusé < 300ms en local (optimisation IPC avec événement émis via `eventemitter3`).
2. **Reliability:** L'absence stricte de crash du daemon principal sur parsing incomplet de chunk PTY malformé.
3. **Security:** bind localhost *uniquement*.
4. **Distribution:** Paquet npm `@autosnitch` facilement distribuable sans dépendance de compilation lourde chez l'utilisateur (node-gyp banni, utilisation exclusive de prebuilds Rust via napi-rs sous la forme de paquets `optionalDependencies`).
5. **Performance:** Idle CPU minimal (<1%) et tracking asynchrone pour les file watch, pas de polling intensif.

## Acceptance Criteria (MVP exit)

1. `autosnitch start` lance la daemon silencieusement avec auto-restart, PIDs gérés correctement en RAM.
2. Hook émis d'un événement factice Claude Code envoyé à l'endpoint HTTP POST : :4821 provoque l'affichage instantané dans un client WS TUI connecté sur `ws://localhost:4820`. 
3. Intégrations opérationnelles validées sur au moins: `Claude Code` (Tier 1 via Hook/JSONL), `Goose` ou `Codex` (Tier 2 CLI Stream-json ou db local), et au moins 1 processus (Tier 3/4 File watching).
4. Mode privacy strictement testé (sqlite purgé complètement sans traces résiduelles sur disque permanent local).
5. Fin du process `node` de TUI ne coupe pas la capture du Daemon background (Headless).
