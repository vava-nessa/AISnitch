# 03 — CLI & Daemon : Setup Tools

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-cli-daemon.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `03_cli-daemon_setup-tools_DONE.md`
> - **Recherche Exa.ai** : Vérifier les formats actuels des config files de chaque tool (Claude Code settings.json, OpenCode config).
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.
> - **Mettre à jour le README** avec la doc setup.

## Contexte

`aisnitch setup <tool>` est la commande qui configure automatiquement les hooks d'un AI tool pour envoyer ses events à AISnitch. C'est **interactif** : on montre à l'utilisateur exactement ce qu'on va modifier et on demande confirmation avant de toucher au fichier.

PeonPing fait la même chose (injecte des hooks dans `~/.claude/settings.json`) mais de façon plus opaque. Nous, on fait ça proprement.

## Ressources

- **`CLAUDE_DATA.md`** section "Claude Code — Hook system: 21 lifecycle events configured in ~/.claude/settings.json"
- **`CLAUDE_DATA.md`** section "OpenCode — Config: ~/.config/opencode/opencode.jsonc"
- **`CLAUDE_DATA.md`** section "Gemini CLI — Settings: ~/.gemini/settings.json"

## Sous-étapes

- [ ] Créer `src/cli/commands/setup.ts` — Commande `aisnitch setup <tool>` :
  - [ ] Détecte si le tool est installé (cherche le binaire dans PATH + config dir)
  - [ ] Lit la config actuelle du tool
  - [ ] Calcule le diff (ce qui sera ajouté/modifié)
  - [ ] **Affiche le diff coloré** à l'utilisateur
  - [ ] Demande confirmation (Y/n)
  - [ ] Applique les modifications
  - [ ] Crée un backup du fichier original (`.bak`)
  - [ ] Confirme le succès

### Setup Claude Code
- [ ] `aisnitch setup claude-code` :
  - [ ] Cible : `~/.claude/settings.json`
  - [ ] Injecte les hooks HTTP pointant vers `http://localhost:4821/hooks/claude-code`
  - [ ] Events à hook : tous les 21 lifecycle events disponibles
  - [ ] Format hook : `{ "type": "http", "url": "http://localhost:4821/hooks/claude-code", "async": true }`
  - [ ] Vérifie que les hooks existants ne sont pas écrasés (merge intelligent)

### Setup OpenCode
- [ ] `aisnitch setup opencode` :
  - [ ] Cible : `~/.config/opencode/opencode.jsonc` (ou plugins dir)
  - [ ] **Recherche Exa.ai** : vérifier le mécanisme exact de hooks/plugins OpenCode
  - [ ] Possibilité 1 : Plugin TypeScript dans `~/.config/opencode/plugins/`
  - [ ] Possibilité 2 : ACP protocol configuration
  - [ ] Adapter selon ce que la recherche révèle

### Setup générique (future-proof)
- [ ] Créer une interface `ToolSetup` :
  ```typescript
  interface ToolSetup {
    toolName: ToolName;
    detect(): Promise<boolean>;      // tool installé ?
    getConfigPath(): string;         // chemin config
    computeDiff(): Promise<string>;  // diff à appliquer
    apply(): Promise<void>;          // appliquer
    revert(): Promise<void>;         // rollback (depuis .bak)
  }
  ```
- [ ] Implémenter `ClaudeCodeSetup` et `OpenCodeSetup`

### Commande revert
- [ ] `aisnitch setup <tool> --revert` — restaure le fichier `.bak`

- [ ] Écrire tests :
  - [ ] Setup détecte un tool installé
  - [ ] Setup génère le bon diff pour Claude Code
  - [ ] Setup crée un backup
  - [ ] Revert restaure le backup
- [ ] Mettre à jour le README

## Spécifications techniques

### Claude Code hooks injection
```json
// 📖 Ce qui est injecté dans ~/.claude/settings.json
{
  "hooks": {
    "SessionStart": [
      { "type": "http", "url": "http://localhost:4821/hooks/claude-code", "async": true }
    ],
    "Stop": [
      { "type": "http", "url": "http://localhost:4821/hooks/claude-code", "async": true }
    ],
    "PreToolUse": [
      { "type": "http", "url": "http://localhost:4821/hooks/claude-code", "async": true }
    ],
    "PostToolUse": [
      { "type": "http", "url": "http://localhost:4821/hooks/claude-code", "async": true }
    ],
    "Notification": [
      { "type": "http", "url": "http://localhost:4821/hooks/claude-code", "async": true }
    ],
    "UserPromptSubmit": [
      { "type": "http", "url": "http://localhost:4821/hooks/claude-code", "async": true }
    ],
    "SubagentStart": [
      { "type": "http", "url": "http://localhost:4821/hooks/claude-code", "async": true }
    ],
    "SubagentStop": [
      { "type": "http", "url": "http://localhost:4821/hooks/claude-code", "async": true }
    ],
    "PreCompact": [
      { "type": "http", "url": "http://localhost:4821/hooks/claude-code", "async": true }
    ]
  }
}
```

## Critères de complétion

- [ ] `aisnitch setup claude-code` détecte, affiche le diff, demande confirmation, applique
- [ ] `aisnitch setup opencode` fonctionne (après recherche du mécanisme)
- [ ] Backup `.bak` créé automatiquement
- [ ] Revert fonctionne
- [ ] Merge intelligent (pas d'écrasement des hooks existants)
- [ ] Tests passent
- [ ] README mis à jour avec guide setup
- [ ] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**
