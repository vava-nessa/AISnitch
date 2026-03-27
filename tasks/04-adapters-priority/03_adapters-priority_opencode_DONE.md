# 03 — Adapters Prioritaires : OpenCode

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-adapters-priority.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `03_adapters-priority_opencode_DONE.md`
> - **Recherche obligatoire Exa.ai** : Explorer le repo OpenCode (https://github.com/opencode-ai/opencode), comprendre le protocole ACP, le format SQLite, le système de plugins.
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.
> - **Tester avec un vrai OpenCode** : 👤 demander à l'utilisateur de lancer une session.

## Contexte

OpenCode est l'adapter **#2 prioritaire**. Open source (MIT), écrit en Go, il offre plusieurs points d'interception : protocole ACP (stdin/stdout NDJSON), base SQLite locale, plugins TypeScript, et OpenTelemetry. C'est aussi le candidat principal pour les tests E2E automatisés.

## Ressources

- **`CLAUDE_DATA.md`** section "OpenCode" :
  - Data : `~/.local/share/opencode/` (logs, SQLite DB `opencode.db` WAL, message JSON files)
  - Config : `~/.config/opencode/opencode.jsonc`
  - Plugins : `~/.config/opencode/plugins/`
  - ACP mode : `opencode acp` (stdin/stdout nd-JSON)
  - Stream JSON : `-f stream-json`
  - OpenTelemetry plugin pour metrics/traces
- Repo : https://github.com/opencode-ai/opencode
- **Recherche Exa.ai obligatoire** pour le format exact du protocole ACP et les events exposés

## Sous-étapes

### Recherche préalable
- [x] **Exa.ai** : Rechercher "OpenCode ACP protocol specification"
- [x] **Exa.ai** : Rechercher "OpenCode plugin development TypeScript"
- [x] Analyser le repo OpenCode : comprendre la structure des events, le schema SQLite, le format ACP
- [x] Documenter les findings dans un commentaire en haut du fichier adapter

### Layer 1 : SQLite DB Watcher (le plus fiable)
- [ ] Watcher sur `~/.local/share/opencode/opencode.db` :
  - [ ] Utiliser `chokidar` pour détecter les modifications du fichier DB
  - [ ] À chaque modification, lire les nouvelles entrées via `better-sqlite3` en **read-only**
  - [ ] ⚠️ **On ne stocke rien nous-mêmes** — on lit juste la DB d'OpenCode
  - [ ] Parser les messages pour extraire : session, model, tool calls, errors
  - [ ] Mapper vers AISnitch events

### Layer 2 : ACP Protocol (si viable)
- [ ] Si OpenCode supporte le mode ACP :
  - [ ] Spawn `opencode acp` et lire le stdout NDJSON
  - [ ] Parser les events ACP en temps réel
  - [ ] Mapper vers AISnitch events
  - [ ] Gérer la reconnexion si le process meurt

### Layer 3 : Plugin TypeScript (enrichissement)
- [x] Si le plugin system est suffisamment documenté :
  - [x] Créer un plugin AISnitch pour OpenCode (`aisnitch-opencode-plugin.ts`)
  - [x] Le plugin hook les events internes d'OpenCode
  - [x] Envoie les events à AISnitch via UDS ou HTTP
  - [x] `aisnitch setup opencode` installe ce plugin automatiquement

### Layer 4 : Process Detection (fallback)
- [x] Scanner pour `opencode` binary (comme Claude Code)
- [x] Détecter start/stop de sessions

### Mapping Events
- [x] Mapper les events OpenCode vers AISnitch :
  ```
  Session start        → session.start
  Session end          → session.end
  User message         → task.start
  Assistant thinking   → agent.thinking
  Tool call (Read/Write/Bash...) → agent.tool_call
  Assistant response complete → task.complete
  Error                → agent.error
  ```

- [x] Écrire tests unitaires :
  - [ ] Parse d'une entrée SQLite OpenCode
  - [x] Mapping correct des events
  - [x] Process detection
- [x] **Test E2E avec l'utilisateur** : 👤 lancer `opencode "hello"` et vérifier les events
- [x] Vérifier `pnpm build` + `pnpm test`

## Spécifications techniques

### Structure SQLite OpenCode (à confirmer via recherche)
```sql
-- 📖 Schema probable (à valider via Exa.ai / analyse du repo)
-- Table messages avec les conversations
-- Table sessions avec les metadata
-- Format WAL mode
```

### Plugin TypeScript OpenCode (si supporté)
```typescript
// 📖 Plugin AISnitch pour OpenCode — envoie les events au daemon
// À installer dans ~/.config/opencode/plugins/aisnitch.ts
export default {
  name: 'aisnitch',
  onEvent(event: OpenCodeEvent) {
    // POST vers http://localhost:4821/hooks/opencode
    fetch('http://localhost:4821/hooks/opencode', {
      method: 'POST',
      body: JSON.stringify(event),
    }).catch(() => {}); // fire & forget
  }
};
```

## Critères de complétion

- [x] Au moins 1 layer d'interception fonctionne (SQLite watcher OU ACP OU plugin)
- [x] Events OpenCode mappés correctement vers AISnitch
- [x] Process detection détecte les sessions OpenCode
- [x] **Testé avec une vraie session OpenCode** 👤
- [x] Tests unitaires passent
- [x] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**

- Recherche Exa faite sur les docs officielles OpenCode pour les plugins et ACP. Conclusion pratique : le plugin system est la surface passive stable pour AISnitch, alors que `opencode acp` est un transport JSON-RPC editor-facing, pas un tap passif sur une session TUI existante.
- `src/adapters/opencode.ts` consomme les events du plugin installé par `setup opencode`, les mappe vers AISnitch, et ajoute un fallback process detection.
- Le watcher SQLite n'est pas implémenté dans ce pass MVP parce que le contrat externe passif n'est pas assez documenté pour justifier du reverse engineering opaque dans une couche supposée fiable.
- Validation utilisateur faite sur une vraie session OpenCode branchée à AISnitch. Les events plugin/hook remontent bien, avec une dérivation de session plus lisible pour éviter les collisions entre runs.
