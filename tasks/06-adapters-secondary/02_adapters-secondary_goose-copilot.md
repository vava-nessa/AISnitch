# 02 — Adapters Secondaires : Goose & Copilot CLI

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-adapters-secondary.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `02_adapters-secondary_goose-copilot_DONE.md`
> - **Recherche obligatoire Exa.ai** : Vérifier les APIs goosed et Copilot CLI hooks format.
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.

## Contexte

Goose (Block, open source Rust) a un daemon HTTP/WebSocket (`goosed`) avec OpenAPI spec. Copilot CLI (GitHub) a des hooks dans `.github/copilot-hooks.json`.

## Ressources

- **`CLAUDE_DATA.md`** section "Goose" : `goosed` API, SQLite `sessions.db`, stream-json
- **`CLAUDE_DATA.md`** section "GitHub Copilot CLI" : hooks `preToolUse`, session-state dir

## Sous-étapes

### Goose Adapter
- [ ] **Exa.ai** : rechercher "goosed WebSocket API OpenAPI spec"
- [ ] Créer `src/adapters/goose.ts` — `GooseAdapter extends BaseAdapter`
- [ ] Layer 1 — goosed API : connecter au WebSocket local de goosed (si running)
- [ ] Layer 2 — SQLite watcher : watcher sur `~/.config/goose/sessions.db` (read-only)
- [ ] Layer 3 — Process detection : scanner pour `goose` / `goosed` binary
- [ ] Mapping events Goose → AISnitch

### Copilot CLI Adapter
- [ ] **Exa.ai** : rechercher "GitHub Copilot CLI hooks copilot-hooks.json"
- [ ] Créer `src/adapters/copilot-cli.ts` — `CopilotCLIAdapter extends BaseAdapter`
- [ ] Layer 1 — Hooks : handler pour `preToolUse` events
- [ ] Layer 2 — File watching : watcher sur `~/.copilot/session-state/`
- [ ] Layer 3 — Process detection
- [ ] `aisnitch setup copilot-cli` dans le setup command

- [ ] Écrire tests
- [ ] Vérifier `pnpm build` + `pnpm test`

## Critères de complétion

- [ ] Goose adapter connecte au goosed API ou fallback SQLite
- [ ] Copilot adapter capture les hooks events
- [ ] Tests passent
- [ ] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**
