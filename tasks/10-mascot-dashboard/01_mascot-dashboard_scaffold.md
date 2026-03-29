# 01 — Mascot Dashboard : Vite + React Scaffold

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-mascot-dashboard.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `01_mascot-dashboard_scaffold_DONE.md`
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.

## Contexte

Bootstrapper une app Vite + React + TypeScript dans `examples/mascot-dashboard/`. C'est un example autonome mais qui référence `@aisnitch/client` via le workspace pnpm. Dark theme par défaut, ambiance dev tool.

## Sous-étapes

- [ ] Créer le dossier `examples/mascot-dashboard/`
- [ ] Initialiser avec Vite (`pnpm create vite` template react-ts) :
  - [ ] `package.json` avec :
    - `name`: `"aisnitch-mascot-dashboard"`
    - `@aisnitch/client` en dépendance workspace : `"@aisnitch/client": "workspace:*"`
    - Scripts : `dev`, `build`, `preview`
    - `"type": "module"`, TypeScript strict
  - [ ] `tsconfig.json` — strict, `jsx: "react-jsx"`, paths si nécessaire
  - [ ] `vite.config.ts` — config minimale
- [ ] Structure de fichiers :
  ```
  examples/mascot-dashboard/
  ├── index.html
  ├── package.json
  ├── tsconfig.json
  ├── vite.config.ts
  └── src/
      ├── main.tsx              # entry point
      ├── App.tsx               # layout principal
      ├── theme.css             # 🌑 Dark theme global + CSS variables
      ├── hooks/
      │   └── useAISnitch.ts    # (placeholder, sera implémenté en 02)
      ├── components/
      │   ├── MascotCard.tsx    # (placeholder, sera implémenté en 03)
      │   ├── MascotCard.css    # (placeholder)
      │   ├── Dashboard.tsx     # (placeholder, sera implémenté en 04)
      │   ├── Dashboard.css     # (placeholder)
      │   ├── StatusBar.tsx     # 📡 Connection heartbeat + stats globales
      │   ├── StatusBar.css
      │   ├── EventTicker.tsx   # 📜 Défilement des derniers events
      │   ├── EventTicker.css
      │   ├── Particles.tsx     # ✨ Mini particules CSS par état
      │   └── Particles.css
      ├── lib/
      │   ├── toolColors.ts     # 🎨 Couleur identitaire par tool
      │   ├── soundEngine.ts    # 🔊 Sound effects toggle (optionnel)
      │   └── killCounter.ts    # 🏆 Compteur de sessions terminées
      └── types.ts              # Types locaux
  ```
- [ ] Ajouter le projet au workspace pnpm (`pnpm-workspace.yaml` si pas déjà inclus)
- [ ] `pnpm install` depuis la racine pour résoudre le lien workspace
- [ ] Vérifier : `pnpm --filter aisnitch-mascot-dashboard dev` lance un serveur Vite
- [ ] Vérifier : `pnpm --filter aisnitch-mascot-dashboard build` compile sans erreur

## Critères de complétion

- [ ] `pnpm dev` démarre l'app sur `http://localhost:5173`
- [ ] `pnpm build` compile sans erreur TypeScript
- [ ] `@aisnitch/client` est résolu via le workspace (pas de npm fetch)
- [ ] Structure de fichiers en place avec placeholders pour 02/03/04
- [ ] Dark theme CSS variables définies (background, text, accent colors)
