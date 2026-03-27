# 04 — Core Pipeline : Context Detector

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-core-pipeline.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `04_core-pipeline_context-detector_DONE.md`
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.
> - **Tester sur une vraie session** : 👤 valider que terminal, cwd, pid et instanceIndex sont corrects en live.

## Contexte

Le **Context Detector** est un module core qui enrichit automatiquement chaque événement AISnitch avec des métadonnées de contexte système :

- **Terminal** — quel émulateur de terminal héberge le tool (iTerm2, Ghostty, WezTerm, kitty, etc.)
- **CWD** — le dossier de travail courant du process AI tool (le projet en cours)
- **PID** — le process ID du tool
- **Instance ID** — identifiant unique de cette instance parmi toutes les instances actives
- **Instance Index** — numéro de l'instance si plusieurs du même tool tournent en parallèle (ex: claude #2/3)

Ces données sont essentielles pour différencier des agents parallèles travaillant sur des projets différents, et pour afficher des infos riches dans le TUI.

## Ressources

- **`CLAUDE_DATA.md`** section "Process monitoring via kqueue", "Recommended daemon deployment"
- npm `pid-cwd` v1.2.0 — [GitHub](https://github.com/NeekSandhu/pid-cwd) — cross-platform CWD par PID
- `process.ppid` — PID du parent process Node.js
- macOS : `lsof -p <PID> | grep cwd` — CWD d'un process par PID (fallback)
- macOS : `pgrep -lf <binary>` — énumération des instances
- Env vars de détection terminal : `TERM_PROGRAM`, `KITTY_WINDOW_ID`, `ITERM_SESSION_ID`, `COLORTERM`
- **claude-control** pattern : chaque process écrit `<pid>.json` avec session_id + cwd + transcript_path

## Sous-étapes

### Module ContextDetector

- [ ] Créer `src/core/engine/context-detector.ts` — classe `ContextDetector`

#### Terminal Detection
- [ ] Implémenter `detectTerminal(env: NodeJS.ProcessEnv): string` :
  ```
  1. TERM_PROGRAM === "iTerm.app"      → "iTerm2"
  2. TERM_PROGRAM === "Apple_Terminal" → "Terminal.app"
  3. TERM_PROGRAM === "WezTerm"        → "WezTerm"
  4. TERM_PROGRAM === "ghostty"        → "Ghostty"
  5. TERM_PROGRAM === "vscode"         → "VSCode"
  6. TERM_PROGRAM === "tmux"           → "tmux"
  7. KITTY_WINDOW_ID présent          → "kitty"
  8. ITERM_SESSION_ID présent         → "iTerm2"
  9. TERM_PROGRAM présent             → TERM_PROGRAM (raw, inconnu mais lisible)
  10. Fallback walk PPID chain        → lire le nom du process parent
  11. "unknown"
  ```
- [ ] Implémenter `getTerminalFromPPIDChain(pid: number): Promise<string>` :
  - Lire le nom du process via `ps -p <ppid> -o comm=` (macOS)
  - Mapper les process names connus : "iTerm2", "ghostty", "WezTerm.app", "kitty", "Terminal", "Alacritty", "tmux", "screen"
  - Remonter jusqu'à 3 niveaux de PPID si besoin

#### CWD Detection par PID
- [ ] Installer `pid-cwd` (npm) — `pnpm add pid-cwd`
- [ ] Implémenter `getCWDForPID(pid: number): Promise<string | undefined>` :
  - Tenter `pid-cwd(pid)` en priorité (cross-platform)
  - Fallback macOS : `lsof -a -p ${pid} -d cwd -Fn | tail -1 | sed 's/^n//'` via child_process
  - Logger un warning si non disponible
  - Timeout 500ms max (ne pas bloquer le pipeline)
- [ ] Implémenter `decodeCWDFromTranscriptPath(transcriptPath: string): string | undefined` :
  - Pattern : `~/.claude/projects/-Users-foo-bar-myproject/<uuid>.jsonl`
  - Extraire le segment encodé → remplacer `-` par `/` (sauf premier)
  - Retourner le chemin décodé : `/Users/foo/bar/myproject`

#### Instance Detection
- [ ] Implémenter `enumerateInstances(toolBinary: string): Promise<ProcessInfo[]>` :
  - `pgrep -lf ${toolBinary}` (macOS/Linux) pour lister les PIDs
  - Retourner `Array<{ pid: number; cwd?: string; startTime?: number }>`
  - Trier par PID (stable, reproductible)
- [ ] Implémenter `getInstanceIndex(pid: number, toolBinary: string): Promise<number>` :
  - Énumérer toutes les instances du tool
  - Retourner la position 1-based du PID dans la liste triée
  - Si seule instance → 1 (pas de suffix dans le TUI)
- [ ] Implémenter `buildInstanceId(toolName: string, pid: number, sessionId?: string): string` :
  - Format : `${toolName}:${sessionId ?? pid}`
  - Stable pour la durée de la session

#### API Principale
- [ ] Méthode publique `enrich(event: AISnitchEvent, context: ProcessContext): AISnitchEvent` :
  - Ajoute `terminal`, `cwd`, `pid`, `instanceId`, `instanceIndex` si non déjà présents
  - Non-bloquant : si la détection échoue → champs omis, pas de crash
- [ ] Interface `ProcessContext` :
  ```typescript
  interface ProcessContext {
    pid: number;
    env?: NodeJS.ProcessEnv;  // env du process tool (si disponible via hook ou /proc)
    sessionId?: string;
    transcriptPath?: string;
    hookPayload?: Record<string, unknown>;
  }
  ```
- [ ] Cache interne : `Map<pid, EnrichedContext>` avec TTL 30s (éviter les appels répétés à lsof)
- [ ] Créer `src/core/engine/context-detector.test.ts` :
  - [ ] `detectTerminal` reconnaît TERM_PROGRAM connus
  - [ ] `detectTerminal` fallback sur KITTY_WINDOW_ID
  - [ ] `decodeCWDFromTranscriptPath` décode correctement le path Claude
  - [ ] `buildInstanceId` retourne format correct
  - [ ] `enrich` ne crashe pas si détection échoue

### Intégration dans BaseAdapter
- [ ] Appeler `contextDetector.enrich(event, { pid, sessionId, transcriptPath })` dans la méthode `emit()` de BaseAdapter
- [ ] Les hooks de Claude Code fournissent `cwd` directement dans le payload → l'utiliser en priorité
- [ ] Vérifier `pnpm build` + `pnpm test`

## Spécifications techniques

### Interface ProcessContext et champs schema
```typescript
// 📖 Champs enrichis dans AISnitchEvent.data (ajout au schema Zod)
// Ces champs sont optionnels — renseignés par le ContextDetector
interface AISnitchContextFields {
  terminal?: string;        // "iTerm2" | "Ghostty" | "WezTerm" | "Terminal.app" | "kitty" | "Alacritty" | "tmux" | "unknown"
  cwd?: string;             // "/Users/vava/projects/myapp" — projet en cours
  pid?: number;             // 12345 — PID du process AI tool
  instanceId?: string;      // "claude-code:abc123session" — identifiant unique de l'instance
  instanceIndex?: number;   // 2 — "claude #2" parmi 3 instances actives
  instanceTotal?: number;   // 3 — nombre total d'instances du même tool actives
}
```

### Terminal Detection — Table complète des env vars (source de vérité)

```
Terminal        | TERM_PROGRAM       | Autres variables fiables
----------------|--------------------|-------------------------------------------------
Apple Terminal  | Apple_Terminal     | TERM_PROGRAM_VERSION
iTerm2          | iTerm.app          | ITERM_SESSION_ID ✅, ITERM_PROFILE, LC_TERMINAL
WezTerm         | WezTerm            | WEZTERM_EXECUTABLE, WEZTERM_PANE, WEZTERM_UNIX_SOCKET
Ghostty         | ghostty            | TERM=xterm-ghostty
Hyper           | Hyper              | —
VS Code         | vscode             | TERM_PROGRAM_VERSION
Zed             | zed (issue #4571)  | —
kitty           | ❌ jamais set      | KITTY_WINDOW_ID ✅, KITTY_PID, TERM=xterm-kitty
Alacritty       | ❌ issue #4793     | TERM=alacritty (versions récentes)
tmux            | tmux               | TMUX, TMUX_PANE
```

> ⚠️ **Ordre de priorité validé** (même que Claude Code, issue #27868) :
> `ITERM_SESSION_ID → KITTY_WINDOW_ID → WEZTERM_EXECUTABLE → TERM_PROGRAM → TERM=alacritty → TMUX → PPID chain`

```typescript
// 📖 Map env var TERM_PROGRAM → nom display propre
const TERM_PROGRAM_MAP: Record<string, string> = {
  'Apple_Terminal': 'Terminal.app',
  'iTerm.app':      'iTerm2',
  'WezTerm':        'WezTerm',
  'ghostty':        'Ghostty',
  'vscode':         'VS Code',
  'zed':            'Zed',
  'tmux':           'tmux',
  'Hyper':          'Hyper',
};

// 📖 Map nom process parent → terminal (fallback PPID chain, macOS)
// ps -p <ppid> -o comm= retourne le basename du binary
const PROCESS_NAME_MAP: Record<string, string> = {
  'iTerm2':       'iTerm2',
  'ghostty':      'Ghostty',
  'WezTerm':      'WezTerm',
  'Alacritty':    'Alacritty',
  'Terminal':     'Terminal.app',
  'kitty':        'kitty',
  'Hyper':        'Hyper',
  'Warp':         'Warp',
  'tmux: server': 'tmux',
  'screen':       'screen',
};
```

### Lire les env vars d'un process externe (pour détecter son terminal)
```typescript
// 📖 Sur macOS, ps -Ep <PID> expose les variables d'env d'un process (même user)
// Utile quand AISnitch tourne en daemon : lire l'env de l'AI tool pour voir son TERM_PROGRAM
async function getProcessEnv(pid: number): Promise<Record<string, string>> {
  const { execFile, promisify } = await import('child_process');
  const execFileAsync = promisify(execFile);
  try {
    const { stdout } = await execFileAsync('ps', ['-Ep', String(pid)]);
    const env: Record<string, string> = {};
    // Les env vars sont dans la 2ème ligne de sortie, séparées par des espaces/null
    for (const pair of stdout.split(/[\0 ]/).filter(s => s.includes('='))) {
      const idx = pair.indexOf('=');
      env[pair.slice(0, idx)] = pair.slice(idx + 1);
    }
    return env;
  } catch {
    return {}; // pas d'accès ou process mort → graceful
  }
}
// Usage : detectTerminal(await getProcessEnv(toolPid))
```

### Decode transcript path Claude Code
```typescript
// 📖 Décode le chemin de projet encodé dans les paths JSONL Claude Code
// Claude encode en remplaçant "/" par "-", avec un "-" initial (représente la racine)
//
// Exemple :
//   transcript = "~/.claude/projects/-Users-vava-Documents-myapp/abc123.jsonl"
//   encoded    = "-Users-vava-Documents-myapp"
//   decoded    = "/Users/vava/Documents/myapp"
//
// ⚠️ Limitation connue : tirets dans les noms de dossiers sont ambigus
//    → Toujours préférer le champ "cwd" du hook payload (fourni par Claude Code, exact)
//    → N'utiliser ce décodage qu'en fallback si pas de hook
function decodeClaudeProjectPath(dirName: string): string {
  return dirName.replace(/-/g, '/'); // "-Users-vava-myapp" → "/Users/vava/myapp"
}

function getCWDFromTranscriptPath(transcriptPath: string): string | undefined {
  const match = transcriptPath.match(/\.claude\/projects\/([^/]+)\//);
  return match?.[1] ? decodeClaudeProjectPath(match[1]) : undefined;
}
```

### CWD par PID (macOS, Node.js)
```typescript
import pidCwd from 'pid-cwd';

// 📖 Récupère le CWD d'un process par PID — cross-platform
async function getCWDForPID(pid: number): Promise<string | undefined> {
  try {
    // pid-cwd utilise proc_pidinfo PROC_PIDVNODEPATHINFO sur macOS
    const cwd = await Promise.race([
      pidCwd(pid),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 500))
    ]);
    return cwd;
  } catch {
    // Fallback macOS : lsof
    try {
      const { execSync } = await import('child_process');
      const output = execSync(`lsof -a -p ${pid} -d cwd -Fn 2>/dev/null | tail -1`, { encoding: 'utf8' });
      return output.trim().replace(/^n/, '') || undefined;
    } catch {
      return undefined;
    }
  }
}
```

### Instance enumeration + Unique Instance ID
```typescript
// 📖 Énumère toutes les instances actives d'un tool CLI par son binary name
// Utilise pgrep -fl (macOS/Linux) — plus fiable que ps aux | grep
async function enumerateInstances(toolBinary: string): Promise<Array<{ pid: number; args: string }>> {
  const { execFile, promisify } = await import('child_process');
  const execFileAsync = promisify(execFile);
  try {
    const { stdout } = await execFileAsync('pgrep', ['-fl', toolBinary]);
    return stdout.trim().split('\n')
      .filter(Boolean)
      .map(line => {
        const [pidStr, ...rest] = line.split(' ');
        return { pid: parseInt(pidStr), args: rest.join(' ') };
      })
      .filter(p => !isNaN(p.pid))
      .sort((a, b) => a.pid - b.pid); // tri stable par PID
  } catch {
    return [];
  }
}

// 📖 Construit un instanceId stable et unique pour une session AI tool
// Format : "${toolName}:${sessionId}" si disponible, sinon "${toolName}:${pid}"
// Note : pour Claude Code, les subagents partagent le même session_id (limitation connue)
// → utiliser SHA256(tool+pid+sessionId) si on a besoin d'une clé de hash unique
function buildInstanceId(toolName: string, pid: number, sessionId?: string): string {
  return sessionId ? `${toolName}:${sessionId}` : `${toolName}:${pid}`;
}

// 📖 Retourne la position 1-based de ce PID parmi toutes les instances du même tool
// Exemple : 3 instances claude → PIDs [1234, 5678, 9012]
//           pid=5678 → instanceIndex=2, instanceTotal=3 → affichage "claude #2"
async function getInstanceIndex(
  pid: number,
  toolBinary: string
): Promise<{ index: number; total: number }> {
  const instances = await enumerateInstances(toolBinary);
  const index = instances.findIndex(i => i.pid === pid);
  return {
    index: index >= 0 ? index + 1 : 1, // 1-based
    total: instances.length,
  };
}
```

> 📌 **Note sur les subagents Claude Code** : les subagents (spawned via `Task` tool) partagent le même `session_id` que leur parent (limitation confirmée issue #14859). Ils spawnnent comme : `claude --resume <id> --output-format stream-json`. Pour les distinguer, utiliser le **PID** comme discriminant, pas le session_id.

## Critères de complétion

- [ ] `detectTerminal` reconnaît les 8+ terminaux courants
- [ ] `getCWDForPID` fonctionne sur macOS avec pid-cwd + fallback lsof
- [ ] `decodeCWDFromTranscriptPath` décode correctement les paths Claude
- [ ] Instance enumeration + index fonctionnent avec plusieurs instances
- [ ] `enrich()` non-bloquant — timeout 500ms max
- [ ] Zéro crash si détection échoue (graceful degradation)
- [ ] Tests unitaires passent (min 6 tests)
- [ ] Code documenté avec `📖` et JSDoc
- [ ] Intégré dans BaseAdapter

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**
