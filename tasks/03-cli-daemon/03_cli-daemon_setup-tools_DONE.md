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

- [x] Créer `src/cli/commands/setup.ts` — Commande `aisnitch setup <tool>` :
  - [x] Détecte si le tool est installé (cherche le binaire dans PATH + config dir)
  - [x] Lit la config actuelle du tool
  - [x] Calcule le diff (ce qui sera ajouté/modifié)
  - [x] **Affiche le diff coloré** à l'utilisateur
  - [x] Demande confirmation (Y/n)
  - [x] Applique les modifications
  - [x] Crée un backup du fichier original (`.bak`)
  - [x] Confirme le succès

### Setup Claude Code
- [x] `aisnitch setup claude-code` :
  - [x] Cible : `~/.claude/settings.json`
  - [x] Injecte les hooks HTTP pointant vers `http://localhost:4821/hooks/claude-code`
  - [x] Events à hook : la liste officielle actuelle des événements Claude Code, vérifiée via Exa
  - [x] Format hook : `{ "type": "http", "url": "http://localhost:4821/hooks/claude-code", "async": true }`
  - [x] Vérifie que les hooks existants ne sont pas écrasés (merge intelligent)

### Setup OpenCode
- [x] `aisnitch setup opencode` :
  - [x] Cible : `~/.config/opencode/opencode.jsonc` (ou plugins dir)
  - [x] **Recherche Exa.ai** : vérifier le mécanisme exact de hooks/plugins OpenCode
  - [x] Possibilité 1 : Plugin TypeScript dans `~/.config/opencode/plugins/`
  - [x] Possibilité 2 : ACP protocol configuration
  - [x] Adapter selon ce que la recherche révèle

### Setup générique (future-proof)
- [x] Créer une interface `ToolSetup` :
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
- [x] Implémenter `ClaudeCodeSetup` et `OpenCodeSetup`

### Commande revert
- [x] `aisnitch setup <tool> --revert` — restaure le fichier `.bak`

- [x] Écrire tests :
  - [x] Setup détecte un tool installé
  - [x] Setup génère le bon diff pour Claude Code
  - [x] Setup crée un backup
  - [x] Revert restaure le backup
- [x] Mettre à jour le README

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

- [x] `aisnitch setup claude-code` détecte, affiche le diff, demande confirmation, applique
- [x] `aisnitch setup opencode` fonctionne (après recherche du mécanisme)
- [x] Backup `.bak` créé automatiquement
- [x] Revert fonctionne
- [x] Merge intelligent (pas d'écrasement des hooks existants)
- [x] Tests passent
- [x] README mis à jour avec guide setup
- [x] Code documenté

---

## 📝 RAPPORT FINAL
> Réalisé :
> - Recherche Exa sur la doc officielle Claude Code hooks et OpenCode config/plugins
> - Ajout de `aisnitch setup <tool>` avec diff coloré, confirmation interactive, backup, apply et revert
> - Implémentation `ClaudeCodeSetup` avec merge non destructif dans `~/.claude/settings.json`
> - Implémentation `OpenCodeSetup` via plugin local auto-loadé dans `~/.config/opencode/plugins/aisnitch.ts`
> - Activation automatique de l’adapter correspondant dans la config AISnitch
> - Ajout de tests ciblés et smoke réel de `setup claude-code` sur un HOME temporaire
>
> Notes de recherche :
> - La doc officielle Claude Code consultée via Exa liste désormais plus d’événements qu’au moment du task design initial ; l’implémentation suit la liste actuelle documentée
> - Pour OpenCode, la doc officielle valide le chargement automatique des plugins locaux ; ACP existe mais n’est pas le bon mécanisme de setup pour ce besoin
>
> Vérifications :
> - `pnpm check`
> - smoke réel : `HOME=/tmp/... node dist/cli/index.js setup claude-code --config /tmp/.../config.json`
