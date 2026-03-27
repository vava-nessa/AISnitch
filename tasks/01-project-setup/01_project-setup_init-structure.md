# 01 — Project Setup : Init & Structure

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-project-setup.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `01_project-setup_init-structure_DONE.md`
> - N'hésite **jamais** à solliciter l'utilisateur pour tester, valider, ou répondre à une question.
> - Documente le code avec des commentaires `📖`, tiens le README à jour.

## Contexte

Initialiser le projet AISnitch comme un **seul package npm** avec une architecture interne propre en dossiers. TypeScript strict, ESLint, pas de monorepo multi-packages. Le projet doit être prêt pour le développement immédiat des modules suivants.

## Ressources

- **`CLAUDE_DATA.md`** section "Monorepo structure" (adapter pour single package)
- Libs de build : `tsup` (esbuild-powered, CJS+ESM+DTS)
- Runtime : Node 20+ (pour chokidar v5 ESM-only)

## Sous-étapes

- [ ] Init `package.json` avec `pnpm init` — nom: `aisnitch`, license: Apache-2.0
- [ ] Créer `tsconfig.json` — strict mode, ES2022 target, NodeNext module
- [ ] Configurer ESLint flat config (`eslint.config.js`) — TypeScript strict, no `any`
- [ ] Configurer `tsup.config.ts` — entry `src/index.ts`, format CJS+ESM, DTS
- [ ] Créer la structure de dossiers :
  ```
  src/
  ├── core/           # Event bus, schemas, types, state machine
  │   ├── events/     # Zod schemas, CloudEvents types
  │   ├── engine/     # EventBus, pipeline, state machine
  │   └── config/     # Config loader
  ├── adapters/       # BaseAdapter + tous les adapters
  ├── cli/            # Commander commands
  ├── tui/            # Ink components
  └── index.ts        # Entry point
  ```
- [ ] Installer les deps de base : `typescript`, `tsup`, `eslint`, `@typescript-eslint/parser`, `vitest`
- [ ] Configurer `.gitignore`, `.npmignore`, `.editorconfig`
- [ ] Ajouter le fichier `LICENSE` (Apache 2.0 avec attribution : vava-nessa / Vanessa Depraute / vanessadepraute.dev)
- [ ] Créer un `README.md` initial avec : nom, description one-liner, badges, section install vide
- [ ] Vérifier que `pnpm build` fonctionne (produit un output dans `dist/`)
- [ ] 👤 Validation utilisateur : structure OK ?

## Spécifications techniques

### package.json (esquisse)
```json
{
  "name": "aisnitch",
  "version": "0.1.0",
  "description": "Universal bridge for AI coding tool activity — capture, normalize, stream.",
  "license": "Apache-2.0",
  "author": "Vanessa Depraute <vanessadepraute.dev> (https://github.com/vava-nessa)",
  "type": "module",
  "bin": {
    "aisnitch": "./dist/cli/index.js"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### tsconfig.json (esquisse)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

## Critères de complétion

- [ ] `pnpm build` compile sans erreur
- [ ] `pnpm lint` passe sans erreur
- [ ] Structure dossiers créée et cohérente
- [ ] LICENSE Apache 2.0 présente avec attribution correcte
- [ ] README initial en place
- [ ] Validé par l'utilisateur

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**
