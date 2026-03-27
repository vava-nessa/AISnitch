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
- [ ] **README.md** final et complet :
  - [ ] Hero section : logo/titre + one-liner + badges (npm, license, CI)
  - [ ] **GIF démo** : enregistrer un screencast du TUI avec VHS (terminal recorder) ou asciinema
  - [ ] Quick start : install + start en 3 lignes
  - [ ] Features list avec screenshots
  - [ ] Supported tools : tableau avec ✅/🔄/❌ par tool
  - [ ] Architecture diagram (ASCII ou mermaid)
  - [ ] CLI reference (toutes les commandes)
  - [ ] TUI keybinds
  - [ ] Configuration reference
  - [ ] API reference (WebSocket event schema)
  - [ ] Section "Build a consumer" : exemple client WebSocket
  - [ ] Contributing section
  - [ ] License + attribution (Vanessa Depraute)
- [ ] `CONTRIBUTING.md` :
  - [ ] Setup dev local
  - [ ] Comment ajouter un adapter
  - [ ] Convention de code
  - [ ] Process de PR
- [ ] `CODE_OF_CONDUCT.md` (Contributor Covenant)
- [ ] `CHANGELOG.md` initial (v0.1.0)

### Consumer example
- [ ] Créer `examples/basic-consumer.ts` :
  - [ ] Se connecte au WebSocket
  - [ ] Log les events
  - [ ] Montre comment filtrer par tool/type
- [ ] Créer `examples/mascot-consumer.ts` :
  - [ ] Exemple de mascotte basique (mapping events → actions)
  - [ ] Code snippet pour une app Swift (macOS)

### GitHub Setup
- [ ] Issue templates : bug report, feature request, new adapter request
- [ ] PR template
- [ ] GitHub Discussions activé
- [ ] Topics/tags : `ai-tools`, `developer-tools`, `cli`, `monitoring`, `typescript`

### Launch Plan
- [ ] 👤 Valider le messaging avec l'utilisateur
- [ ] Préparer un post HackerNews
- [ ] Préparer un post Reddit (r/programming, r/LocalLLaMA, r/MachineLearning)
- [ ] Préparer un thread Twitter/X
- [ ] Préparer un article Dev.to

## Critères de complétion

- [ ] README complet avec GIF démo
- [ ] CONTRIBUTING + CODE_OF_CONDUCT en place
- [ ] CHANGELOG v0.1.0
- [ ] Examples fonctionnels
- [ ] Issue/PR templates
- [ ] 👤 Launch plan validé par l'utilisateur

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**
