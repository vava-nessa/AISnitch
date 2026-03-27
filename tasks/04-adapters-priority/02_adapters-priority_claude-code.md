# 02 — Adapters Prioritaires : Claude Code

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-adapters-priority.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `02_adapters-priority_claude-code_DONE.md`
> - **Recherche obligatoire Exa.ai** : Vérifier le format actuel des 21 hook events Claude Code et le format JSONL des transcripts.
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
- [ ] Créer `src/adapters/claude-code.ts` — Classe `ClaudeCodeAdapter extends BaseAdapter`
- [ ] Implémenter `handleHook(payload)` — parser le JSON reçu via POST `/hooks/claude-code`
- [ ] Mapping des hook events vers AISnitch events :
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
- [ ] Extraire les données riches de chaque event :
  - [ ] `toolName` depuis PreToolUse/PostToolUse
  - [ ] `toolInput` (filePath, command) depuis le payload
  - [ ] `activeFile` depuis l'event context
  - [ ] Conserver le `raw` payload complet dans `data.raw`

### Layer 2 : JSONL File Watcher (backup/enrichissement)
- [ ] Installer `chokidar` v5
- [ ] Watcher sur `~/.claude/projects/**/*.jsonl` :
  - [ ] Ignorer les fichiers existants au démarrage (`ignoreInitial: true`)
  - [ ] Tracker l'offset de lecture par fichier (lire uniquement les nouvelles lignes)
  - [ ] Parser chaque nouvelle ligne JSONL
  - [ ] Détecter les thinking blocks → `agent.thinking`
  - [ ] Détecter les assistant messages → `agent.streaming`
  - [ ] Compléter les données manquantes des hooks (tokens, model)
  - [ ] `awaitWriteFinish: { stabilityThreshold: 200 }` pour éviter les lectures partielles

### Layer 3 : Process Detection
- [ ] Scanner les processes pour `claude` binary :
  - [ ] `child_process.execSync('pgrep -lf claude')` (macOS)
  - [ ] Détecter start/stop de sessions Claude Code
  - [ ] Polling léger toutes les 5 secondes (en attendant kqueue natif en Rust)
  - [ ] Si un process claude apparait sans SessionStart hook → émettre session.start de fallback

### State Machine
- [ ] Implémenter la state machine interne de l'adapter :
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

- [ ] Écrire tests unitaires :
  - [ ] handleHook parse un SessionStart correctement
  - [ ] handleHook parse un PreToolUse avec toolName
  - [ ] Mapping vers les bons AISnitch event types
  - [ ] JSONL parser extrait les thinking blocks
  - [ ] State machine transitions correctes
  - [ ] Idle detection fonctionne
- [ ] **Test E2E avec l'utilisateur** : 👤 lancer une vraie session Claude Code et vérifier que les events arrivent dans le WS
- [ ] Vérifier `pnpm build` + `pnpm test`

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

- [ ] Hook receiver parse les 9+ event types Claude Code
- [ ] JSONL watcher détecte les nouvelles lignes et enrichit les données
- [ ] Process detection détecte les sessions Claude Code
- [ ] State machine transitions fonctionnent
- [ ] Events arrivent dans le WebSocket en temps réel
- [ ] **Testé avec une vraie session Claude Code** 👤
- [ ] Tests unitaires passent (min 8 tests)
- [ ] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**
