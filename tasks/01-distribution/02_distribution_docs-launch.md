# 02 — Distribution : Docs, Community & Launch

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-distribution.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `02_distribution_docs-launch_DONE.md`
> - 👤 **Le lancement nécessite validation de l'utilisateur sur le messaging et les canaux.**

## Contexte

Préparer le projet pour le lancement open-source : README final avec GIF démo, guides de setup par tool, event schema reference, et plan de communication.

## Sous-étapes

### Documentation
- [x] **README.md** final et complet :
  - [x] Hero section : logo/titre + one-liner + badges (npm, license, CI)
  - [x] **GIF démo** : enregistrer un screencast du TUI avec VHS (terminal recorder) ou asciinema
  - [x] Quick start : install + start en 3 lignes
  - [x] Features list avec screenshots
  - [x] Supported tools : tableau avec ✅/🔄/❌ par tool
  - [x] Architecture diagram (ASCII ou mermaid)
  - [x] CLI reference (toutes les commandes)
  - [x] TUI keybinds
  - [x] Configuration reference
  - [x] API reference (WebSocket event schema)
  - [x] Section "Build a consumer" : exemple client WebSocket
  - [x] Contributing section
  - [x] License + attribution (Vanessa Depraute)
- [x] `CONTRIBUTING.md` :
  - [x] Setup dev local
  - [x] Comment ajouter un adapter
  - [x] Convention de code
  - [x] Process de PR
- [x] `CODE_OF_CONDUCT.md` (Contributor Covenant)
- [ ] `CHANGELOG.md` initial (v0.1.0)

### Consumer example
- [x] Créer `examples/basic-consumer.ts` :
  - [x] Se connecte au WebSocket
  - [x] Log les events
  - [x] Montre comment filtrer par tool/type
- [x] Créer `examples/mascot-consumer.ts` :
  - [x] Exemple de mascotte basique (mapping events → actions)
  - [x] Code snippet pour une app Swift (macOS)

### GitHub Setup
- [x] Issue templates : bug report, feature request, new adapter request
- [x] PR template
- [ ] GitHub Discussions activé
- [ ] Topics/tags : `ai-tools`, `developer-tools`, `cli`, `monitoring`, `typescript`

### Launch Plan
- [ ] 👤 Valider le messaging avec l'utilisateur
- [x] Préparer un post HackerNews
- [x] Préparer un post Reddit (r/programming, r/LocalLLaMA, r/MachineLearning)
- [x] Préparer un thread Twitter/X
- [x] Préparer un article Dev.to

## Critères de complétion

- [x] README complet avec GIF démo
- [x] CONTRIBUTING + CODE_OF_CONDUCT en place
- [ ] CHANGELOG v0.1.0
- [x] Examples fonctionnels
- [x] Issue/PR templates
- [ ] 👤 Launch plan validé par l'utilisateur

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**

- README refondu avec architecture, table support tools, CLI/TUI reference, config, API schema, examples, et vrai GIF VHS.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, examples, templates GitHub, et `docs/launch-plan.md` sont en place.
- Les derniers points non clos sont externes au codebase : validation du messaging par la mainteneuse, activation Discussions/topics côté GitHub, et finalisation du changelog release.
