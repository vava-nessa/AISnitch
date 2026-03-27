# 01 — CLI & Daemon : Commander Setup

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-cli-daemon.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `01_cli-daemon_commands_DONE.md`
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.
> - **Mettre à jour le README** avec les commandes CLI disponibles.

## Contexte

L'interface CLI est le point d'entrée principal d'AISnitch. L'utilisateur tape `aisnitch` pour démarrer. Les commandes sont construites avec `commander` (13.x, 18ms startup, zero deps).

## Ressources

- Lib : `commander` v13.x — [npm](https://www.npmjs.com/package/commander)
- **`CLAUDE_DATA.md`** section "CLI commands: start, stop, status, install"

## Sous-étapes

- [x] Installer `commander`
- [ ] Créer `src/cli/index.ts` — Entry point CLI :
  - [x] Setup commander program avec nom `aisnitch`, version, description
  - [x] Configurer le bin entry dans `package.json`
- [ ] Implémenter commande `aisnitch start` (alias par défaut si pas de commande) :
  - [x] Démarre le pipeline en mode **foreground** par défaut
  - [x] Affiche un moniteur live minimal en attendant la vraie TUI Ink
  - [x] Flag `--ws-port <port>` override le port WS
  - [x] Flag `--http-port <port>` override le port HTTP
  - [x] Flag `--log-level <level>` override le log level
  - [x] Flag `--daemon` → voir tâche 02 (daemon mode)
- [ ] Implémenter commande `aisnitch stop` :
  - [x] Envoie SIGTERM au daemon si en mode background
  - [x] Lit le PID depuis `~/.aisnitch/aisnitch.pid`
  - [x] Confirme l'arrêt
- [ ] Implémenter commande `aisnitch status` :
  - [x] Affiche : daemon running/stopped, PID, port WS, port HTTP, consumers connectés, adapters actifs, events count
  - [x] Hit le `/health` endpoint pour récupérer les stats live
- [ ] Implémenter commande `aisnitch adapters` :
  - [x] Liste tous les adapters disponibles avec leur état (enabled/disabled, running/stopped)
- [x] Ajouter flag global `--config <path>` pour override le chemin config
- [x] Ajouter `--help` bien formaté avec exemples
- [x] Écrire un test de smoke : `aisnitch --version` retourne la version
- [x] Mettre à jour le README avec la section "CLI Usage"
- [x] Vérifier `pnpm build` + le binaire fonctionne

## Spécifications techniques

### CLI Entry
```typescript
import { program } from 'commander';

// 📖 CLI entry point — toutes les commandes AISnitch
program
  .name('aisnitch')
  .version('0.1.0')
  .description('Universal bridge for AI coding tool activity');

program
  .command('start', { isDefault: true })
  .description('Start AISnitch (foreground by default)')
  .option('--daemon', 'Run as background daemon')
  .option('--ws-port <port>', 'WebSocket port', '4820')
  .option('--http-port <port>', 'HTTP hooks port', '4821')
  .option('--log-level <level>', 'Log level', 'info')
  .action(startCommand);

program
  .command('stop')
  .description('Stop the background daemon')
  .action(stopCommand);

program
  .command('status')
  .description('Show AISnitch status')
  .action(statusCommand);

program
  .command('adapters')
  .description('List available adapters')
  .action(adaptersCommand);
```

## Critères de complétion

- [x] `aisnitch --version` affiche la version
- [x] `aisnitch --help` affiche l'aide formatée
- [x] `aisnitch start` lance le pipeline en foreground
- [x] `aisnitch status` affiche les stats
- [x] `aisnitch adapters` liste les adapters
- [x] README mis à jour avec CLI docs
- [x] Code documenté

---

## 📝 RAPPORT FINAL
> Réalisé :
> - Remplacement du bootstrap CLI par une vraie surface `commander` avec `start`, `stop`, `status`, `adapters`, `attach`, `install`, `uninstall`
> - Ajout du flag partagé `--config <path>` avec dérivation cohérente du home AISnitch depuis ce chemin
> - Ajout d’un moniteur live minimal en foreground pour rendre `start` utilisable avant `05-tui`
> - Ajout d’un smoke test sur `--version` et validation du binaire buildé
>
> Vérifications :
> - `pnpm check`
> - smoke manuel sur `node dist/cli/index.js --version`
