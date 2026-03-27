# 01 — Distribution : npm & Homebrew

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-distribution.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `01_distribution_npm-homebrew_DONE.md`
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.
> - 👤 **Nécessite les credentials npm de l'utilisateur pour publier.**

## Contexte

Publier AISnitch sur npm (`aisnitch`) et Homebrew pour que n'importe qui puisse installer en une commande. L'objectif : `npm i -g aisnitch && aisnitch start` fonctionne en < 2 minutes sans erreur de compilation.

## Sous-étapes

### npm
- [ ] Vérifier que `package.json` est complet :
  - [ ] `name`, `version`, `description`, `license`, `author`, `repository`, `keywords`
  - [ ] `bin` pointe vers le bon entry point compilé
  - [ ] `files` liste les fichiers à inclure (dist/, README, LICENSE)
  - [ ] `engines.node` >= 20
  - [ ] `optionalDependencies` pour `@lydell/node-pty` (platform-specific)
- [ ] `.npmignore` exclut : src/, tests, .github/, tsconfig, etc.
- [ ] `prepublishOnly` script : `pnpm build && pnpm test`
- [ ] Tester l'install locale : `npm pack` → `npm install -g ./aisnitch-0.1.0.tgz`
- [ ] Vérifier que `aisnitch --version` fonctionne après install globale
- [ ] 👤 Publier : `npm publish` (nécessite login npm de l'utilisateur)

### Homebrew
- [ ] Créer un repo `homebrew-aisnitch` sur GitHub
- [ ] Créer la formula Homebrew :
  ```ruby
  class Aisnitch < Formula
    desc "Universal bridge for AI coding tool activity"
    homepage "https://github.com/vava-nessa/aisnitch"
    url "https://registry.npmjs.org/aisnitch/-/aisnitch-0.1.0.tgz"
    sha256 "..."
    license "Apache-2.0"
    depends_on "node@20"

    def install
      system "npm", "install", "--production", *std_npm_args
      bin.install_symlink libexec/"bin/aisnitch"
    end
  end
  ```
- [ ] Tester : `brew tap vava-nessa/aisnitch && brew install aisnitch`

### GitHub Actions CI
- [ ] Créer `.github/workflows/ci.yml` :
  - [ ] Trigger : push on main, PR
  - [ ] Steps : install deps, lint, build, test
  - [ ] Matrix : Node 20, 22
- [ ] Créer `.github/workflows/release.yml` :
  - [ ] Trigger : tag push (`v*`)
  - [ ] Steps : build, test, npm publish, GitHub Release
  - [ ] Update Homebrew formula SHA

## Critères de complétion

- [ ] `npm i -g aisnitch` fonctionne
- [ ] `aisnitch --version` OK après install
- [ ] `brew install aisnitch` fonctionne (via tap)
- [ ] CI passe sur GitHub Actions
- [ ] Release workflow publie automatiquement
- [ ] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**
