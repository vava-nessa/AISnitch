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

- [x] Init `package.json` avec `pnpm init` — nom: `aisnitch`, license: Apache-2.0
- [x] Créer `tsconfig.json` — strict mode, ES2022 target, NodeNext module
- [x] Configurer ESLint flat config (`eslint.config.js`) — TypeScript strict, no `any`
- [x] Configurer `tsup.config.ts` — entry `src/index.ts`, format CJS+ESM, DTS
- [x] Créer la structure de dossiers :
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
- [x] Installer les deps de base : `typescript`, `tsup`, `eslint`, `@typescript-eslint/parser`, `vitest`
- [x] Configurer `.gitignore`, `.npmignore`, `.editorconfig`
- [x] Ajouter le fichier `LICENSE` (Apache 2.0 avec attribution : vava-nessa / Vanessa Depraute / vanessadepraute.dev)
- [x] Créer un `README.md` initial avec : nom, description one-liner, badges, section install vide
- [x] Vérifier que `pnpm build` fonctionne (produit un output dans `dist/`)
- [x] 👤 Validation utilisateur : structure OK ?

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

- [x] `pnpm build` compile sans erreur
- [x] `pnpm lint` passe sans erreur
- [x] Structure dossiers créée et cohérente
- [x] LICENSE Apache 2.0 présente avec attribution correcte
- [x] README initial en place
- [x] Validé par l'utilisateur

---

## 📝 RAPPORT FINAL
> Statut : tâche validée et prête à être archivée en `_DONE`.
>
> Réalisé :
> - Bootstrap `pnpm` du package unique `aisnitch`
> - Configuration TypeScript stricte (`NodeNext`) + ESLint flat config + `tsup`
> - Création de la structure `src/core`, `src/adapters`, `src/cli`, `src/tui`
> - Ajout de placeholders typés et documentés (`📖`) pour stabiliser la surface publique
> - Ajout de la doc technique dans `docs/index.md` et `docs/project-setup.md`
> - Migration de la licence vers Apache 2.0
>
> Vérifications passées :
> - `pnpm lint`
> - `pnpm typecheck`
> - `pnpm test`
> - `pnpm build`
>
> Validation :
> - structure validée par l'utilisateur, renommage `_DONE` autorisé
