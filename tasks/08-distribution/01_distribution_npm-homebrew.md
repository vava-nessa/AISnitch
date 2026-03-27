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
- [x] Vérifier que `package.json` est complet :
  - [x] `name`, `version`, `description`, `license`, `author`, `repository`, `keywords`
  - [x] `bin` pointe vers le bon entry point compilé
  - [x] `files` liste les fichiers à inclure (dist/, README, LICENSE)
  - [x] `engines.node` >= 20
  - [ ] `optionalDependencies` pour `@lydell/node-pty` (platform-specific)
- [x] `.npmignore` exclut : src/, tests, .github/, tsconfig, etc.
- [x] `prepublishOnly` script : `pnpm build && pnpm test`
- [x] Tester l'install locale : `npm pack` → `npm install -g ./aisnitch-0.1.0.tgz`
- [x] Vérifier que `aisnitch --version` fonctionne après install globale
- [ ] 👤 Publier : `npm publish` (nécessite login npm de l'utilisateur)

### Homebrew
- [ ] Créer un repo `homebrew-aisnitch` sur GitHub
- [x] Créer la formula Homebrew :
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
- [x] Tester : `brew tap vava-nessa/aisnitch && brew install aisnitch`

### GitHub Actions CI
- [x] Créer `.github/workflows/ci.yml` :
  - [x] Trigger : push on main, PR
  - [x] Steps : install deps, lint, build, test
  - [x] Matrix : Node 20, 22
- [x] Créer `.github/workflows/release.yml` :
  - [x] Trigger : tag push (`v*`)
  - [x] Steps : build, test, npm publish, GitHub Release
  - [x] Update Homebrew formula SHA

## Critères de complétion

- [x] `npm i -g aisnitch` fonctionne
- [x] `aisnitch --version` OK après install
- [x] `brew install aisnitch` fonctionne (via tap)
- [ ] CI passe sur GitHub Actions
- [ ] Release workflow publie automatiquement
- [x] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**

- Packaging local validé : `npm pack` puis install globale sur prefix temporaire, `aisnitch --version` → `0.1.0`.
- Formula Homebrew générée et resynchronisée par `scripts/update-homebrew-formula.mjs`, puis testée dans un tap local temporaire avec install réelle.
- Déviation assumée : `@lydell/node-pty` reste en dépendance normale. Le passer en `optionalDependencies` casserait le bootstrap global du CLI tant que la couche PTY n'est pas chargée de façon lazy.
- Il reste les validations externes réelles : `npm publish`, repo/tap GitHub public, et exécution des workflows sur GitHub.
