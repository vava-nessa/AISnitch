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

- [ ] Installer `commander`
- [ ] Créer `src/cli/index.ts` — Entry point CLI :
  - [ ] Setup commander program avec nom `aisnitch`, version, description
  - [ ] Configurer le bin entry dans `package.json`
- [ ] Implémenter commande `aisnitch start` (alias par défaut si pas de commande) :
  - [ ] Démarre le pipeline en mode **foreground** par défaut
  - [ ] Affiche le TUI directement
  - [ ] Flag `--ws-port <port>` override le port WS
  - [ ] Flag `--http-port <port>` override le port HTTP
  - [ ] Flag `--log-level <level>` override le log level
  - [ ] Flag `--daemon` → voir tâche 02 (daemon mode)
- [ ] Implémenter commande `aisnitch stop` :
  - [ ] Envoie SIGTERM au daemon si en mode background
  - [ ] Lit le PID depuis `~/.aisnitch/aisnitch.pid`
  - [ ] Confirme l'arrêt
- [ ] Implémenter commande `aisnitch status` :
  - [ ] Affiche : daemon running/stopped, PID, port WS, port HTTP, consumers connectés, adapters actifs, events count
  - [ ] Hit le `/health` endpoint pour récupérer les stats live
- [ ] Implémenter commande `aisnitch adapters` :
  - [ ] Liste tous les adapters disponibles avec leur état (enabled/disabled, running/stopped)
- [ ] Ajouter flag global `--config <path>` pour override le chemin config
- [ ] Ajouter `--help` bien formaté avec exemples
- [ ] Écrire un test de smoke : `aisnitch --version` retourne la version
- [ ] Mettre à jour le README avec la section "CLI Usage"
- [ ] Vérifier `pnpm build` + le binaire fonctionne

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

- [ ] `aisnitch --version` affiche la version
- [ ] `aisnitch --help` affiche l'aide formatée
- [ ] `aisnitch start` lance le pipeline en foreground
- [ ] `aisnitch status` affiche les stats
- [ ] `aisnitch adapters` liste les adapters
- [ ] README mis à jour avec CLI docs
- [ ] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**
