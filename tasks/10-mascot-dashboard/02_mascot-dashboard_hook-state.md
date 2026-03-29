# 02 — Mascot Dashboard : AISnitch Hook & State Management

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-mascot-dashboard.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `02_mascot-dashboard_hook-state_DONE.md`
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.

## Contexte

Le hook `useAISnitch` est le cœur de l'app. Il encapsule la connexion WebSocket au daemon, le session tracking, et expose un état React réactif que les composants peuvent consommer. Il gère aussi le "kill tracking" (sessions terminées) et le son optionnel.

## Sous-étapes

- [ ] Hook `useAISnitch.ts` :
  - [ ] Créer le client via `createAISnitchClient()` (WebSocket natif browser — pas de `ws`)
  - [ ] URL configurable (default `ws://127.0.0.1:4820`) via props ou env
  - [ ] Exposer l'état de connexion : `'connected' | 'reconnecting' | 'offline'`
  - [ ] Maintenir un `Map<sessionId, AgentCardState>` réactif via `useState` + `useRef`
  - [ ] Sur chaque event → mettre à jour la carte correspondante avec :
    - `tool`, `project`, `projectPath`, `terminal`, `cwd`
    - `mascotState` via `eventToMascotState(event)` (mood, animation, color, label, detail)
    - `lastDescription` via `describeEvent(event)`
    - `eventCount` (increment)
    - `startedAt` (ISO timestamp de création)
  - [ ] Sur `agent.idle` → passer la carte en état `sleeping` (booléen `isSleeping: true`)
  - [ ] Sur `session.end` :
    - Passer la carte en état `killed` avec timestamp `killedAt: Date.now()`
    - Incrémenter le kill counter global
    - Déclencher le sound effect de mort si le son est activé
    - Après 5 secondes, retirer la carte du Map (cleanup)
  - [ ] Exposer les derniers N events (20?) pour l'EventTicker
  - [ ] Exposer le kill counter total (`totalKills: number`)
  - [ ] Gestion du cycle de vie React : `useEffect` pour connect/disconnect sur mount/unmount

- [ ] Types `types.ts` :
  ```typescript
  interface AgentCardState {
    sessionId: string;
    tool: ToolName;
    project?: string;
    projectPath?: string;
    terminal?: string;
    cwd?: string;
    mascotState: MascotState;       // from SDK
    lastDescription: string;        // describeEvent()
    eventCount: number;
    startedAt: string;              // ISO
    isSleeping: boolean;
    isKilled: boolean;
    killedAt?: number;              // Date.now()
  }

  type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';
  ```

- [ ] `lib/toolColors.ts` :
  - [ ] Map `Record<ToolName, string>` avec une couleur identitaire par tool :
    - `claude-code` → `#d97706` (amber/orange)
    - `opencode` → `#22c55e` (green)
    - `gemini-cli` → `#3b82f6` (blue)
    - `codex` → `#8b5cf6` (purple)
    - `goose` → `#f97316` (orange)
    - `copilot-cli` → `#6366f1` (indigo)
    - `aider` → `#14b8a6` (teal)
    - `openclaw` → `#ec4899` (pink)
    - `unknown` → `#6b7280` (gray)

- [ ] `lib/soundEngine.ts` (optionnel, off by default) :
  - [ ] Petit système de sons via `AudioContext` Web API
  - [ ] Sons synthétisés (pas de fichiers audio) — bips/boops générés en JS
  - [ ] `playStateChange(state)` — son différent selon le mood
  - [ ] `playKill()` — son de mort
  - [ ] Toggle on/off exposé dans le hook
  - [ ] Volume control

- [ ] `lib/killCounter.ts` :
  - [ ] Simple counter `Map<ToolName, number>` pour tracker les morts par tool
  - [ ] `totalKills` : somme totale
  - [ ] Texte affichable : `"X agents have fallen"`

## Critères de complétion

- [ ] `useAISnitch()` retourne `{ agents, connectionStatus, recentEvents, totalKills, killText, soundEnabled, toggleSound }`
- [ ] L'état est réactif — un `console.log` dans un composant montre les changements en temps réel
- [ ] Les agents tués restent 5 secondes puis disparaissent automatiquement
- [ ] Le son est off par défaut et toggleable
- [ ] Types stricts, pas de `any`
