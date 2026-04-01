# 01 — Adapters Secondaires : Gemini CLI & Codex

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-adapters-secondary.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `01_adapters-secondary_gemini-codex_DONE.md`
> - **Recherche obligatoire Exa.ai** : Vérifier les dernières docs Gemini CLI (hooks, stream-json) et Codex CLI (log format, --json output).
> - **Analyser PeonPing** : regarder leurs adapters Gemini et Codex pour comprendre les patterns.
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.

## Contexte

Gemini CLI (99k+ GitHub stars) et Codex CLI (OpenAI, open source Rust) sont deux tools majeurs. Gemini a des hooks natifs + stream-json. Codex a un mode `--json` et des logs locaux.

**Best-effort** : si ça marche, parfait. Si un format de logs change, on itère.

## Ressources

- **`CLAUDE_DATA.md`** section "Gemini CLI" : hooks BeforeAgent/AfterAgent, stream-json, `~/.gemini/settings.json`
- **`CLAUDE_DATA.md`** section "Codex CLI" : `~/.codex/log/codex-tui.log`, `codex exec --json`, MCP mode
- PeonPing : adapters Gemini et Codex dans leur repo

## Sous-étapes

### Gemini CLI Adapter
- [x] **Exa.ai** : rechercher "Gemini CLI hooks documentation 2025"
- [x] Créer `src/adapters/gemini-cli.ts` — `GeminiCLIAdapter extends BaseAdapter`
- [x] Layer 1 — Hooks : handler pour BeforeAgent, AfterAgent, BeforeTool, AfterTool
- [x] Layer 2 — File watching : watcher sur `~/.gemini/` pour les outputs/logs
- [x] Layer 3 — Process detection : scanner pour `gemini` binary
- [x] Mapping events Gemini → AISnitch :
  ```
  BeforeAgent → task.start
  AfterAgent  → task.complete
  BeforeTool  → agent.tool_call
  AfterTool   → agent.coding (si Write) ou agent.tool_call
  ```
- [x] `aisnitch setup gemini-cli` dans le setup command

### Codex CLI Adapter
- [x] **Exa.ai** : rechercher "Codex CLI json output format OpenAI"
- [x] Créer `src/adapters/codex.ts` — `CodexAdapter extends BaseAdapter`
- [x] Layer 1 — Log watching : watcher sur `~/.codex/log/codex-tui.log` via chokidar
- [x] Layer 2 — Process detection : scanner pour `codex` binary
- [x] Parser les logs pour extraire les events (format à déterminer via recherche)
- [x] Mapping events Codex → AISnitch
- [x] `aisnitch setup codex` pour armer l'adapter passif sans modifier la config Codex

- [x] Écrire tests :
  - [x] Parse d'un event Gemini hook
  - [x] Parse d'un log Codex
  - [x] Mapping correct
- [x] Vérifier `pnpm build` + `pnpm test`

## Critères de complétion

- [x] Gemini adapter détecte et capture les events
- [x] Codex adapter détecte et capture les events
- [x] Mapping correct vers AISnitch events
- [x] Tests passent
- [x] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**

- Recherche Exa faite sur les docs hooks Gemini CLI et la doc OpenAI Codex `codex exec --json`, avec vérification locale des artefacts réels `~/.gemini/tmp/**/logs.json` et `~/.codex/log/codex-tui.log`.
- `src/adapters/gemini-cli.ts` implémente la voie principale via hooks Gemini, puis un fallback best-effort sur `logs.json` pour capter au moins les prompts utilisateur, plus le process detection.
- `src/adapters/codex.ts` choisit volontairement le chemin passif réaliste pour le MVP: parser `codex-tui.log` (commandes + cibles de patch + modèle + shutdown) plutôt que dépendre d'un wrapping systématique `codex exec --json`.
- `aisnitch setup gemini-cli` merge des hooks `command` dans `~/.gemini/settings.json`, et `aisnitch setup codex` arme proprement l'adapter passif dans la config AISnitch sans toucher à la config Codex.
