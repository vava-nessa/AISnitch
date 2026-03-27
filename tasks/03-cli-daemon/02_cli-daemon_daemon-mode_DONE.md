# 02 — CLI & Daemon : Daemon Mode

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-cli-daemon.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `02_cli-daemon_daemon-mode_DONE.md`
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.
> - **Mettre à jour le README**.

## Contexte

Par défaut, `aisnitch start` tourne en **foreground** et affiche le TUI. Avec `--daemon`, le process se détache et tourne en background. `aisnitch attach` permet de se reconnecter au daemon en cours pour voir le TUI.

**Analogie : c'est comme `pm2` — on peut démarrer en background et revenir dessus.**

## Ressources

- **`CLAUDE_DATA.md`** section "Recommended daemon deployment (macOS)"
- macOS : `~/Library/LaunchAgents/com.aisnitch.daemon.plist` avec `KeepAlive: true`
- Node.js : `child_process.spawn()` avec `detached: true` + `stdio: 'ignore'` pour fork daemon

## Sous-étapes

### Mode Foreground (default)
- [ ] `aisnitch start` (sans `--daemon`) :
  - [x] Démarre le Pipeline (EventBus + WS + HTTP + UDS)
  - [x] Prépare le slot des adapters activés ; aucun runtime adapter concret n’existe encore dans le repo
  - [x] Affiche un moniteur live minimal dans le terminal courant en attendant la vraie TUI Ink
  - [x] SIGINT (Ctrl+C) = shutdown propre
  - [x] SIGTERM = shutdown propre

### Mode Daemon
- [ ] `aisnitch start --daemon` :
  - [x] Fork un child process détaché (`child_process.spawn` avec `detached: true`)
  - [x] Écrit le PID dans `~/.aisnitch/aisnitch.pid`
  - [x] Le parent affiche "AISnitch daemon started (PID: XXXX)" et exit
  - [x] Le child démarre le Pipeline sans TUI (headless)
  - [x] Logs stdout → `~/.aisnitch/daemon.log` (fichier rotatif simple, max 5MB, écrasé au restart)

### Attach
- [ ] `aisnitch attach` :
  - [x] Vérifie qu'un daemon tourne (lit PID file + check process vivant)
  - [x] Se connecte au WebSocket du daemon
  - [x] Affiche un moniteur live en se branchant sur le flux WS existant
  - [x] Ctrl+C sur attach = déconnecte le moniteur, le daemon continue

### Install (launchd macOS)
- [ ] `aisnitch install` :
  - [x] Génère `~/Library/LaunchAgents/com.aisnitch.daemon.plist`
  - [x] `KeepAlive: true`, `RunAtLoad: true`, `ThrottleInterval: 5`
  - [x] `launchctl` charge le plist (via `bootstrap`, remplaçant moderne de `load`)
  - [x] Affiche un message de confirmation
- [ ] `aisnitch uninstall` :
  - [x] `launchctl` décharge le plist + supprime le fichier (via `bootout`, remplaçant moderne de `unload`)

### PID Management
- [ ] Créer `src/cli/pid.ts` :
  - [x] `writePid()`, `readPid()`, `removePid()`, `isDaemonRunning()`
  - [x] Gestion stale PID (process mort mais fichier existe)

- [ ] Écrire tests :
  - [x] PID write/read/remove
  - [x] Stale PID detection
- [x] Mettre à jour le README

## Spécifications techniques

### LaunchAgent plist
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "...">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.aisnitch.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/aisnitch</string>
    <string>start</string>
    <string>--daemon</string>
  </array>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>~/.aisnitch/daemon.log</string>
  <key>StandardErrorPath</key>
  <string>~/.aisnitch/daemon.log</string>
</dict>
</plist>
```

### Fork daemon pattern
```typescript
import { spawn } from 'node:child_process';

// 📖 Fork un daemon détaché — le parent exit, le child continue
function forkDaemon(): void {
  const child = spawn(process.execPath, [__filename, 'start', '--headless'], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, AISNITCH_DAEMON: '1' },
  });
  child.unref();
  writePid(child.pid!);
  console.log(`AISnitch daemon started (PID: ${child.pid})`);
  process.exit(0);
}
```

## Critères de complétion

- [x] Foreground : moniteur live s'affiche, Ctrl+C shutdown propre
- [x] Daemon : process détaché, PID file écrit, parent exit
- [x] Attach : moniteur live se connecte au daemon existant
- [x] Install/Uninstall : plist généré et chargé/déchargé
- [x] Stale PID géré correctement
- [x] Tests passent
- [x] README mis à jour
- [x] Code documenté

---

## 📝 RAPPORT FINAL
> Réalisé :
> - Ajout du mode daemon détaché avec PID/state/log files dans le home AISnitch
> - Ajout de `attach` sur le flux WebSocket du daemon avec moniteur live minimal
> - Ajout de l’installation/désinstallation LaunchAgent macOS via `launchctl bootstrap/bootout`
> - Ajout de helpers PID dédiés et tests pour le stale state
> - Validation smoke réelle sur le binaire buildé: start daemon isolé dans `/tmp`, `status`, puis arrêt
>
> Note :
> - La vraie TUI Ink reste la tâche `05-tui`; ici on expose volontairement un moniteur live transitoire mais opérationnel
>
> Vérifications :
> - `pnpm check`
> - smoke manuel sur `node dist/cli/index.js start --daemon --config /tmp/...`
> - smoke manuel sur `node dist/cli/index.js status --config /tmp/...`
> - smoke manuel sur `node dist/cli/index.js stop --config /tmp/...`
