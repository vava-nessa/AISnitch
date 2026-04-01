# 03 — Adapters Secondaires : Aider & Generic PTY

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-adapters-secondary.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `03_adapters-secondary_aider-pty_DONE.md`
> - **Recherche Exa.ai** : Chercher "aider chat history format" et "@lydell/node-pty usage examples".
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.

## Contexte

Aider est un outil populaire (Python) qui n'a pas de hooks mais écrit un fichier `.aider.chat.history.md` par projet. Le Generic PTY adapter est le **fallback universel** pour tout tool non-supporté — il wrappe le process dans un pseudo-terminal et parse la sortie ANSI.

## Ressources

- **`CLAUDE_DATA.md`** section "Aider" : `.aider.chat.history.md`, `--notifications-command`
- **`CLAUDE_DATA.md`** section "PTY wrapping for universal I/O capture"
- **`CLAUDE_DATA.md`** section "ANSI escape code parsing" : `strip-ansi`, patterns de détection
- Lib : `@lydell/node-pty` v1.2.x (prebuilt binaries, <1MB)
- Lib : `strip-ansi` pour le nettoyage ANSI

## Sous-étapes

### Aider Adapter
- [x] Créer `src/adapters/aider.ts` — `AiderAdapter extends BaseAdapter`
- [x] File watching : `.aider.chat.history.md` dans les projets actifs
  - [x] Problème : Aider crée ce fichier dans chaque project dir, pas dans un dir central
  - [x] Solution : utiliser process detection pour trouver les process `aider`, extraire le CWD, watcher le fichier
- [x] `--notifications-command` : configurer Aider pour appeler `aisnitch` quand un event se produit
- [x] Parser le markdown chat history pour extraire les events
- [x] Mapping :
  ```
  New user message  → task.start
  Assistant reply   → agent.coding
  Code block        → agent.coding
  End of reply      → task.complete
  ```

### Generic PTY Adapter
- [x] Installer `@lydell/node-pty` et `strip-ansi`
- [x] Créer `src/adapters/generic-pty.ts` — session PTY dédiée pour `aisnitch wrap`
- [x] `wrapCommand(command, args)` : spawn le process dans un PTY
  - [x] `pty.spawn(command, args, { cols: 120, rows: 40 })`
  - [x] Capturer stdout via `onData(callback)`
  - [x] Forwarder stdin depuis le terminal parent
  - [x] Gérer SIGWINCH (resize)
- [x] Heuristiques de parsing ANSI :
  - [x] Spinner détection : `\r` répété avec caractères braille/pipe → `agent.thinking`
  - [x] Progress/file patch hints → `agent.coding`
  - [x] Prompt waiting / confirmation patterns → `agent.asking_user`
  - [x] Error : ANSI rouge + "Error:"/"FAILED" → `agent.error`
  - [x] Output burst / texte utile → `agent.streaming`
- [x] Commande CLI : `aisnitch wrap <command>` lance un tool wrappé dans le PTY
  - [x] Ex: `aisnitch wrap goose "help me fix this bug"`
  - [x] Le tool s'exécute normalement, l'utilisateur voit tout, mais AISnitch capture les events

- [x] Écrire tests :
  - [x] Aider parser extrait les events du markdown
  - [x] PTY heuristiques détectent les bons patterns
  - [x] `wrap` passe bien les args arbitraires au runtime
- [x] Vérifier `pnpm build` + `pnpm test`

## Spécifications techniques

### PTY wrap pattern
```typescript
import { spawn } from '@lydell/node-pty';
import stripAnsi from 'strip-ansi';

// 📖 PTY wrapper — capture universelle d'I/O pour tout AI tool
class GenericPTYAdapter extends BaseAdapter {
  wrapCommand(command: string, args: string[]): void {
    const ptyProcess = spawn(command, args, {
      name: 'xterm-256color',
      cols: process.stdout.columns ?? 120,
      rows: process.stdout.rows ?? 40,
      cwd: process.cwd(),
      env: process.env,
    });

    ptyProcess.onData((data) => {
      // 📖 Forward au terminal parent pour que l'user voit tout
      process.stdout.write(data);

      // 📖 Analyser la sortie pour détecter les états
      const clean = stripAnsi(data);
      this.analyzeOutput(clean);
    });

    // 📖 Forward stdin vers le PTY
    process.stdin.on('data', (data) => ptyProcess.write(data.toString()));
  }
}
```

### ANSI heuristics
```typescript
// 📖 Patterns heuristiques pour détecter l'état d'un AI tool via sa sortie terminal
const SPINNER_PATTERN = /[\|\/\-\\⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/;
const ERROR_PATTERN = /\b(error|failed|exception|panic)\b/i;
const PROMPT_PATTERN = /[>$?:]\s*$/;
const PROGRESS_PATTERN = /\d+%/;
```

## Critères de complétion

- [x] Aider adapter détecte et capture les events depuis le chat history
- [x] Generic PTY wrapper fonctionne avec n'importe quelle commande
- [x] Heuristiques ANSI détectent les patterns principaux
- [x] `aisnitch wrap <cmd>` fonctionne
- [x] Tests passent
- [x] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**

- Adapter Aider ajouté avec découverte de process, watcher `.aider.chat.history.md`, parsing markdown, et support `notifications-command`.
- Fallback PTY ajouté avec `aisnitch wrap <command>`, passthrough terminal complet, et mapping heuristique vers les états AISnitch.
- Setup Aider, docs, changelog, tests unitaires, et board mis à jour.
