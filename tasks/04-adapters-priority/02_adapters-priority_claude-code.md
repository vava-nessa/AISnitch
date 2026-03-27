# 02 — Adapters Prioritaires : Claude Code

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-adapters-priority.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `02_adapters-priority_claude-code_DONE.md`
> - **Recherche obligatoire Exa.ai** : Vérifier le format actuel des hook events Claude Code et le format JSONL des transcripts.
> - **Regarder le code de PeonPing** (https://github.com/PeonPing/peon-ping) pour comprendre comment ils parsent les events Claude Code.
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.
> - **Tester avec un vrai Claude Code** : demander à l'utilisateur de lancer une session Claude pour valider le flux end-to-end.

## Contexte

Claude Code est l'adapter **#1 prioritaire**. C'est le plus riche en données : 21 lifecycle events via hooks HTTP, transcripts JSONL en local, et terminal title updates. L'adapter utilise 3 couches d'interception simultanées pour une couverture maximale.

## Ressources

- **`CLAUDE_DATA.md`** section "Claude Code" (très détaillée) :
  - Config dir : `~/.claude/`
  - Transcripts : `~/.claude/projects/<encoded-path>/<session-id>.jsonl`
  - Hook events : SessionStart, Stop, PreToolUse, PostToolUse, Notification, UserPromptSubmit, SubagentStart, SubagentStop, PreCompact...
  - Handler types : command, http, prompt, agent
  - Terminal title : ◇ (Ready), ✋ (Action Required), ✦ (Working)
- **PeonPing** : https://github.com/PeonPing/peon-ping — regarder comment ils parsent les events
- Lib : `chokidar` v5 pour le file watching

## Sous-étapes

### Layer 1 : HTTP Hook Receiver (prioritaire)
- [x] Créer `src/adapters/claude-code.ts` — Classe `ClaudeCodeAdapter extends BaseAdapter`
- [x] Implémenter `handleHook(payload)` — parser le JSON reçu via POST `/hooks/claude-code`
- [x] Mapping des hook events vers AISnitch events :
  ```
  SessionStart     → session.start (+ créer sessionId)
  Stop             → session.end
  UserPromptSubmit → task.start
  PreToolUse       → agent.tool_call (extraire toolName: Read/Write/Bash/Edit...)
  PostToolUse      → agent.coding (si tool = Write/Edit) ou agent.tool_call
  Notification     → agent.asking_user (si type permission/idle)
  SubagentStart    → task.start (subagent)
  SubagentStop     → task.complete (subagent)
  PreCompact       → agent.compact
  ```
- [x] Extraire les données riches de chaque event :
  - [x] `toolName` depuis PreToolUse/PostToolUse
  - [x] `toolInput` (filePath, command) depuis le payload
  - [x] `activeFile` depuis l'event context
  - [x] Conserver le `raw` payload complet dans `data.raw`

### Layer 2 : JSONL File Watcher (backup/enrichissement)
- [x] Installer `chokidar` v5
- [x] Watcher sur `~/.claude/projects/**/*.jsonl` :
  - [x] Ignorer les fichiers existants au démarrage (`ignoreInitial: true`)
  - [x] Tracker l'offset de lecture par fichier (lire uniquement les nouvelles lignes)
  - [x] Parser chaque nouvelle ligne JSONL
  - [x] Détecter les thinking blocks → `agent.thinking`
  - [x] Détecter les assistant messages → `agent.streaming`
  - [x] Compléter les données manquantes des hooks (tokens, model)
  - [x] `awaitWriteFinish: { stabilityThreshold: 200 }` pour éviter les lectures partielles

### Layer 3 : Process Detection
- [x] Scanner les processes pour `claude` binary :
  - [x] `pgrep -lf claude` (implémenté en `execFile` async plutôt qu'en `execSync`)
  - [x] Détecter start/stop de sessions Claude Code
  - [x] Polling léger toutes les 5 secondes (configurable en test)
  - [x] Si un process claude apparait sans SessionStart hook → émettre session.start de fallback

### State Machine
- [x] Implémenter la state machine interne de l'adapter :
  ```
  session.start → agent.idle
  agent.idle → task.start (on UserPromptSubmit)
  task.start → agent.thinking
  agent.thinking → agent.coding (on Write/Edit tool)
  agent.thinking → agent.tool_call (on other tool)
  agent.coding ↔ agent.tool_call
  * → agent.asking_user (on Notification/permission)
  * → task.complete (on Stop)
  task.complete → agent.idle
  agent.idle (120s) → agent.idle (persist)
  ```

- [x] Écrire tests unitaires :
  - [x] handleHook parse un SessionStart correctement
  - [x] handleHook parse un PreToolUse avec toolName
  - [x] Mapping vers les bons AISnitch event types
  - [x] JSONL parser extrait les thinking blocks
  - [x] State machine transitions correctes
  - [x] Idle detection fonctionne (couvert au niveau `BaseAdapter`)
- [ ] **Test E2E avec l'utilisateur** : 👤 lancer une vraie session Claude Code et vérifier que les events arrivent dans le WS
- [x] Vérifier `pnpm build` + `pnpm test`

## Spécifications techniques

### Hook payload Claude Code (exemple SessionStart)
```json
{
  "hook_type": "SessionStart",
  "session_id": "abc123",
  "project_path": "/Users/dev/myproject",
  "model": "claude-sonnet-4-20250514",
  "cwd": "/Users/dev/myproject"
}
```

### Hook payload Claude Code (exemple PreToolUse)
```json
{
  "hook_type": "PreToolUse",
  "session_id": "abc123",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/Users/dev/myproject/src/index.ts",
    "content": "..."
  }
}
```

### JSONL transcript line (exemple)
```json
{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"..."},{"type":"text","text":"..."}]},"model":"claude-sonnet-4-20250514","tokens":1234}
```

## Critères de complétion

- [x] Hook receiver parse les 9+ event types Claude Code
- [x] JSONL watcher détecte les nouvelles lignes et enrichit les données
- [x] Process detection détecte les sessions Claude Code
- [x] State machine transitions fonctionnent
- [x] Events arrivent dans le WebSocket en temps réel
- [ ] **Testé avec une vraie session Claude Code** 👤
- [x] Tests unitaires passent (min 8 tests)
- [x] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**

- Recherche Exa effectuée sur les docs officielles Claude Code (`hooks`) et revue ciblée de PeonPing pour confirmer le pattern de parsing hook-first + transcript fallback.
- Les docs Claude Code actuelles exposent 25 hook events, pas seulement 21. L'adapter mappe le sous-ensemble utile au monitoring passif (`SessionStart`, `SessionEnd`, `UserPromptSubmit`, `Pre/PostToolUse`, `Notification`, `PermissionRequest`, `Task*`, `Subagent*`, `Compact`, `Stop*`, `TeammateIdle`).
- `src/adapters/claude-code.ts` couvre hooks HTTP, JSONL watcher avec offsets/remainders, et fallback process detection. La diffusion WS brute est couverte via `src/core/engine/__tests__/pipeline.test.ts`.
- Il reste la validation end-to-end sur une vraie session Claude Code utilisateur avant de renommer ce fichier en `_DONE`.
