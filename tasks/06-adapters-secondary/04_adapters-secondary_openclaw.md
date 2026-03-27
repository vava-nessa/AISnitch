# 04 — Adapters Secondaires : OpenClaw

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-adapters-secondary.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `04_adapters-secondary_openclaw_DONE.md`
> - **Recherche obligatoire Exa.ai** : Vérifier la structure actuelle de `~/.openclaw/`, les event types des hooks, et le format des sessions.
> - **Tester avec un vrai OpenClaw** : 👤 lancer une vraie session et valider les events dans le WS.
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.

## Contexte

**OpenClaw** est un agent IA autonome open-source qui a explosé en popularité depuis fin 2025 :
- **247,000 étoiles GitHub** (mars 2026) — project GitHub #1 mondial à son pic
- **Racheté par OpenAI** (mars 2026)
- Initialement "Clawdbot" (nov 2025) → "Moltbot" (jan 2026) → **"OpenClaw"** (jan 2026)
- Créé par Peter Steinberger (Autrichien), code sous licence ouverte
- Architecture : **Gateway TypeScript** + messaging platforms en UI principale

OpenClaw a un système de hooks TypeScript natif très riche, ce qui en fait un candidat idéal pour une intégration propre de Tier 1 via hooks + file watching.

**GitHub** : https://github.com/openclaw/openclaw

## Ressources

- **`CLAUDE_DATA.md`** section "Per-tool integration specifications" → OpenClaw
- **OpenClaw Hooks docs** : https://docs.openclaw.ai/automation/hooks
- **OpenClaw Workspace docs** : https://docs.openclaw.ai/concepts/agent-workspace
- **OpenClaw Gateway docs** : https://docs.openclaw.ai/cli/gateway
- **Hook event types confirmés** : `command:new`, `command`, `gateway:startup`, `tool_result_persist`, `/new`, `/reset`, `/stop`, `agent:bootstrap`, `message:received`, `message:preprocessed`, `before_compaction`, `after_compaction`
- **Hook events en développement** (pas encore shippés) : `preToolExecution`, `postToolExecution` (issues #1733, #12311)
- **Feature request** stream API temps réel : https://github.com/openclaw/openclaw/issues/6467 (pas encore dispo)
- **Paths clés** :
  - `~/.openclaw/openclaw.json` — config principale (JSON5 format, override via `OPENCLAW_CONFIG_PATH`)
  - `~/.openclaw/` — config, credentials, sessions
  - `~/.openclaw/workspace/` — workspace par défaut (ou `~/.openclaw/workspace-<profile>/` avec `OPENCLAW_PROFILE`)
  - `~/.openclaw/workspace/memory/` — logs journaliers `YYYY-MM-DD.md` + `MEMORY.md`
  - `~/.openclaw/hooks/` — hooks TypeScript globaux
  - `~/.openclaw/logs/openclaw.json` — logs JSON line-delimited
  - `/tmp/openclaw/openclaw-YYYY-MM-DD.log` — rolling daily gateway log (configurable via `logging.file` dans config)
  - `~/.openclaw/logs/commands.log` — écrit par le hook natif `command-logger` (disponible out-of-the-box)
- **Gateway WebSocket** : port **18789** (interne, pas le même que AISnitch)
- **Exa.ai** : chercher "openclaw webhook configuration outbound HTTP 2026" pour vérifier le format webhook payload

## Sous-étapes

### Layer 1 : Outbound Webhook (stratégie principale — natif OpenClaw)

> 📌 **OpenClaw supporte les webhooks outbound natifs.** C'est la voie d'intégration la plus propre : configurer OpenClaw pour qu'il POSTe ses events vers l'endpoint HTTP d'AISnitch. Pas besoin d'écrire un hook TypeScript custom.

- [x] **Exa.ai** : rechercher "openclaw webhook outbound HTTP configuration 2026" pour vérifier le format exact du payload
- [x] Créer `src/adapters/openclaw.ts` — `OpenClawAdapter extends BaseAdapter`
- [x] Implémenter `handleWebhook(payload: OpenClawWebhookPayload)` :
  - [x] Mapper les event types OpenClaw → AISnitch events :
    ```
    gateway:startup      → session.start
    command:new          → task.start  (nouvelle commande utilisateur)
    /new                 → task.start
    /stop                → task.complete
    /reset               → session.end (reset complet)
    before_compaction    → agent.compact
    tool_result_persist  → agent.tool_call (outil invoqué et résultat persisté)
    agent:bootstrap      → session.start (alt si gateway:startup manqué)
    ```
  - [x] Extraire depuis le payload : sessionId, cwd, toolName, message, agentId
  - [x] Conserver le `raw` payload dans `data.raw`
- [x] Implémenter `aisnitch setup openclaw` (tâche 03-cli-daemon/03) :
  - Modifier `~/.openclaw/openclaw.json` pour ajouter le webhook AISnitch :
    ```json
    {
      "webhooks": {
        "aisnitch": {
          "url": "http://localhost:4821/hooks/openclaw",
          "events": ["command:new", "gateway:startup", "tool_result_persist", "/stop", "/reset", "before_compaction"]
        }
      }
    }
    ```
  - Vérifier que le gateway OpenClaw est running avant d'écrire la config

### Layer 1b : `command-logger` Log Watching (fallback immédiat, zéro config)

> 📌 OpenClaw a un hook natif `command-logger` qui écrit **tous les commands** dans `~/.openclaw/logs/commands.log`. Ce fichier est disponible out-of-the-box sans aucune configuration. Parfait comme fallback si le webhook n'est pas configuré.

- [x] Watcher sur `~/.openclaw/logs/commands.log` :
  - [x] `chokidar` avec `ignoreInitial: true`, `awaitWriteFinish: { stabilityThreshold: 200 }`
  - [x] Tracker l'offset de lecture (nouvelles lignes seulement)
  - [x] Parser chaque ligne JSON : `{ event, sessionId, timestamp, message, ... }`
  - [x] Mapper vers AISnitch events (même mapping que webhook)

### Layer 2 : File Watching (Workspace Memory)

- [x] Watcher sur `~/.openclaw/workspace/memory/` :
  - [x] `chokidar` sur `*.md` dans le dossier memory
  - [x] Détecter les nouvelles lignes dans les logs journaliers (`YYYY-MM-DD.md`)
  - [x] Parser les entrées pour enrichir les events : timestamp, activité type
  - [x] Détecter les changements dans `MEMORY.md` → `agent.compact` (mémoire compactée)
  - [x] `ignoreInitial: true`, `awaitWriteFinish: { stabilityThreshold: 300 }`

### Layer 3 : Process Detection

- [x] Scanner les processes pour le binary `openclaw` :
  - [x] `pgrep -lf openclaw` pour détecter les instances actives
  - [x] Tracker les PIDs par session
  - [x] Polling toutes les 5 secondes
  - [x] Si process apparaît sans `gateway:startup` hook → émettre `session.start` de fallback

### State Machine OpenClaw
- [x] Implémenter la state machine :
  ```
  session.start → agent.idle
  agent.idle → task.start (on command:new)
  task.start → agent.thinking (no tool activity for 2s)
  task.start → agent.tool_call (on tool_result_persist)
  agent.tool_call → agent.thinking
  agent.thinking → task.complete (on /stop)
  * → session.end (on /reset)
  agent.idle (120s inactif) → persist agent.idle
  ```

### Tests
- [x] Test : parse hook `gateway:startup` → `session.start`
- [x] Test : parse hook `command:new` → `task.start` avec extraction message
- [x] Test : parse hook `tool_result_persist` → `agent.tool_call` avec toolName
- [x] Test : mapping state machine transitions
- [ ] 👤 **Test E2E** : lancer une session OpenClaw et valider les events dans le WS

## Spécifications techniques

### Structure `~/.openclaw/` (référence complète)
```
~/.openclaw/
├── openclaw.json             # Config principale (JSON5 — apiKey, model, webhooks, logging)
├── sessions/                 # Données de sessions
├── hooks/                    # Hooks TypeScript globaux (workspace-scoped override possible)
├── skills/                   # Skills locaux (override par nom)
├── logs/
│   ├── openclaw.json         # Logs JSON line-delimited (application logs)
│   └── commands.log          # ← Écrit par le hook natif "command-logger" 🎯
└── workspace/                # Workspace par défaut
    ├── AGENTS.md             # Instructions opérationnelles + memory rules
    ├── SOUL.md               # Persona, ton, boundaries
    ├── IDENTITY.md           # Nom de l'agent + vibe
    ├── TOOLS.md              # Config des tools locaux
    ├── MEMORY.md             # Mémoire long-terme curatée
    ├── memory/               # Logs journaliers session
    │   └── YYYY-MM-DD.md
    └── skills/               # Skills workspace (surpassent global)
```

> `/tmp/openclaw/openclaw-YYYY-MM-DD.log` — rolling daily gateway log (path configurable via `logging.file`)

### Config webhook dans `~/.openclaw/openclaw.json` (à injecter via `aisnitch setup openclaw`)
```json5
// 📖 OpenClaw config JSON5 — aisnitch setup openclaw injecte le bloc "webhooks"
{
  // ... config existante de l'utilisateur ...
  "webhooks": {
    "aisnitch": {
      "url": "http://localhost:4821/hooks/openclaw",
      "events": [
        "command:new",
        "gateway:startup",
        "tool_result_persist",
        "/stop",
        "/reset",
        "before_compaction",
        "agent:bootstrap"
      ],
      "enabled": true
    }
  }
}
```

### Mapping event types → AISnitch
```typescript
// 📖 Mapping OpenClaw webhook/log events → AISnitch event types
const OPENCLAW_EVENT_MAP: Record<string, AISnitchEventType | null> = {
  'gateway:startup':      'session.start',
  'agent:bootstrap':      'session.start',   // fallback si gateway:startup manqué
  'command:new':          'task.start',
  '/new':                 'task.start',
  '/stop':                'task.complete',
  '/reset':               'session.end',
  'gateway:shutdown':     'session.end',
  'tool_result_persist':  'agent.tool_call',
  'before_compaction':    'agent.compact',
  'after_compaction':     null,              // ignoré
  'message:received':     null,              // trop bas niveau
};
```

### Adapter HTTP receiver endpoint
```typescript
// 📖 Endpoint POST /hooks/openclaw — reçu depuis le webhook natif OpenClaw
// ou depuis le log watcher commands.log
router.post('/hooks/openclaw', (req, res) => {
  const { event, sessionId, cwd, message, toolName, agentId, payload } = req.body;

  const eventType = OPENCLAW_EVENT_MAP[event];
  if (!eventType) {
    logger.debug({ event }, 'OpenClaw event inconnu ou ignoré');
    return res.status(200).send(); // toujours 200 pour éviter retry OpenClaw
  }

  openClawAdapter.handleWebhook({
    type:      eventType,
    sessionId: sessionId ?? `openclaw:${agentId ?? 'default'}`,
    cwd,
    toolName,
    raw:       payload,
  });

  res.status(200).send();
});
```

### Session ID format OpenClaw
```typescript
// 📖 Format session ID OpenClaw : "agent:<agentId>:<mainKey>"
// Exemples :
//   "agent:abc123:main"           — session DM principale
//   "agent:abc123:slack:dm:user@" — session DM Slack
//   "agent:abc123:slack:group:42" — groupe Slack
//
// Pour AISnitch, utiliser sessionId du payload webhook si dispo,
// sinon construire : `openclaw:${agentId}` pour identifier l'agent
```

## Critères de complétion

- [x] Hook TypeScript OpenClaw créé et installable via `aisnitch setup openclaw`
- [x] Adapter parse les 6 event types OpenClaw
- [x] File watcher sur `~/.openclaw/workspace/memory/` actif
- [x] Process detection détecte les sessions OpenClaw
- [x] State machine transitions correctes
- [x] Events arrivent dans le WebSocket en temps réel
- [ ] **Testé avec une vraie session OpenClaw** 👤
- [x] Tests unitaires passent (min 5 tests)
- [x] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**

- Implémentation livrée dans `src/adapters/openclaw.ts` avec hooks managés, `commands.log`, transcripts JSONL, memory watchers, et fallback process detection.
- `aisnitch setup openclaw` active maintenant les hooks internes supportés par la version courante d'OpenClaw au lieu de supposer un bloc webhook outbound inexistant dans les docs actuelles.
- Recherche Exa effectuée et documentée : la stratégie correcte en 2026 est `hooks.internal` + `command-logger` + `session-memory`, pas un simple bloc `webhooks.aisnitch`.
- Couverture unitaire ajoutée dans `src/adapters/__tests__/openclaw.test.ts`.
- Validation réelle OpenClaw encore en attente : le binaire `openclaw` n'est pas installé sur cette machine, donc le dernier check "vraie session" reste volontairement ouvert.
