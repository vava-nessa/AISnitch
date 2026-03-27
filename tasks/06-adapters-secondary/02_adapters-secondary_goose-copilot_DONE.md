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
- [x] **Exa.ai** : rechercher "goosed WebSocket API OpenAPI spec"
- [x] Créer `src/adapters/goose.ts` — `GooseAdapter extends BaseAdapter`
- [x] Layer 1 — goosed API : connecter au flux live de goosed (SSE réel sur `/sessions/{id}/events`, après vérification Exa/OpenAPI)
- [x] Layer 2 — SQLite watcher : watcher sur `~/.config/goose/sessions.db` (read-only)
- [x] Layer 3 — Process detection : scanner pour `goose` / `goosed` binary
- [x] Mapping events Goose → AISnitch

### Copilot CLI Adapter
- [x] **Exa.ai** : rechercher "GitHub Copilot CLI hooks copilot-hooks.json"
- [x] Créer `src/adapters/copilot-cli.ts` — `CopilotCLIAdapter extends BaseAdapter`
- [x] Layer 1 — Hooks : handler pour `preToolUse` events
- [x] Layer 2 — File watching : watcher sur `~/.copilot/session-state/`
- [x] Layer 3 — Process detection
- [x] `aisnitch setup copilot-cli` dans le setup command

- [x] Écrire tests
- [x] Vérifier `pnpm build` + `pnpm test`

## Critères de complétion

- [x] Goose adapter connecte au goosed API ou fallback SQLite
- [x] Copilot adapter capture les hooks events
- [x] Tests passent
- [x] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**

- Recherche Exa faite avant finalisation :
  - Goose server docs confirment `http://localhost:8080`, auth par header Bearer sur la majorité des endpoints, OpenAPI sur `/openapi.json`, et streaming live en SSE.
  - GitHub Docs Copilot CLI confirment les hooks `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, `errorOccurred`, avec payloads JSON sur stdin.
- `src/adapters/goose.ts` livre les 3 couches prévues : polling API `goosed`, streaming SSE par session, fallback SQLite `sessions.db`, plus process detection `goose|goosed`.
- `src/adapters/copilot-cli.ts` combine hooks repo-local, lecture de `~/.copilot/session-state/`, enrichissement `workspace.yaml`, et process detection.
- `src/cli/commands/setup.ts` expose désormais un setup passif Goose et un setup Copilot CLI repo-local via `.github/hooks/aisnitch.json` + `scripts/aisnitch-forward.mjs`.
- Couverture ajoutée :
  - `src/adapters/__tests__/goose.test.ts`
  - `src/adapters/__tests__/copilot-cli.test.ts`
  - `src/cli/__tests__/setup.test.ts`
- Vérification locale validée avec `pnpm check`.
