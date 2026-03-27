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
  - [ ] Démarre le Pipeline (EventBus + WS + HTTP + UDS)
  - [ ] Démarre tous les adapters activés
  - [ ] Affiche le TUI (ink) dans le terminal courant
  - [ ] SIGINT (Ctrl+C) = shutdown propre
  - [ ] SIGTERM = shutdown propre

### Mode Daemon
- [ ] `aisnitch start --daemon` :
  - [ ] Fork un child process détaché (`child_process.spawn` avec `detached: true`)
  - [ ] Écrit le PID dans `~/.aisnitch/aisnitch.pid`
  - [ ] Le parent affiche "AISnitch daemon started (PID: XXXX)" et exit
  - [ ] Le child démarre le Pipeline sans TUI (headless)
  - [ ] Logs stdout → `~/.aisnitch/daemon.log` (fichier rotatif simple, max 5MB, écrasé au restart)

### Attach
- [ ] `aisnitch attach` :
  - [ ] Vérifie qu'un daemon tourne (lit PID file + check process vivant)
  - [ ] Se connecte au WebSocket du daemon
  - [ ] Affiche le TUI en se branchant sur le flux WS existant
  - [ ] Ctrl+C sur attach = déconnecte le TUI, le daemon continue

### Install (launchd macOS)
- [ ] `aisnitch install` :
  - [ ] Génère `~/Library/LaunchAgents/com.aisnitch.daemon.plist`
  - [ ] `KeepAlive: true`, `RunAtLoad: true`, `ThrottleInterval: 5`
  - [ ] `launchctl load` le plist
  - [ ] Affiche un message de confirmation
- [ ] `aisnitch uninstall` :
  - [ ] `launchctl unload` + supprime le plist

### PID Management
- [ ] Créer `src/cli/pid.ts` :
  - [ ] `writePid()`, `readPid()`, `removePid()`, `isDaemonRunning()`
  - [ ] Gestion stale PID (process mort mais fichier existe)

- [ ] Écrire tests :
  - [ ] PID write/read/remove
  - [ ] Stale PID detection
- [ ] Mettre à jour le README

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

- [ ] Foreground : TUI s'affiche, Ctrl+C shutdown propre
- [ ] Daemon : process détaché, PID file écrit, parent exit
- [ ] Attach : TUI se connecte au daemon existant
- [ ] Install/Uninstall : plist généré et chargé/déchargé
- [ ] Stale PID géré correctement
- [ ] Tests passent
- [ ] README mis à jour
- [ ] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**
