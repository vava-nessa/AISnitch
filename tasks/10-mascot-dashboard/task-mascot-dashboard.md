# 🎭 Mascot Dashboard (`examples/mascot-dashboard`) — Sommaire des sous-tâches

> ⚠️ **Instruction** : Mettre à jour les checkboxes, les liens (_DONE) et la progression dans `tasks.md` après chaque sous-tâche complétée.

## Objectif

Créer une app web React + Vite dans `examples/mascot-dashboard/` qui se connecte au daemon AISnitch via `@aisnitch/client` (WebSocket natif browser) et affiche en temps réel les sessions d'agents AI sous forme de **cartes mascotte** dans une grille.

Chaque carte représente un agent actif avec :
- **En-tête** : nom du tool (ex: `claude-code`), nom du terminal, chemin du projet
- **Corps** : un cercle coloré au centre affichant le nom de l'état courant (placeholder de la future mascotte animée)
- **Pied** : état actuel détaillé en petit texte (fichier actif, tool call, message d'erreur...)

Comportements spéciaux :
- Un agent qui passe en `idle` affiche un état "sleeping" (animation future : mascotte qui dort)
- Un agent qui se termine (`session.end`) affiche un état "killed" pendant 5 secondes avec une animation de disparition (fade-out CSS), puis est retiré de la grille

**Pourquoi :** C'est le premier exemple visuel concret de l'écosystème AISnitch. Ça démontre le SDK `@aisnitch/client` dans un vrai projet React, et ça pose les fondations pour le futur companion PWA avec de vraies mascottes animées (sprites, Lottie, etc.).

**Contraintes :**
- App Vite + React en TypeScript strict, dans `examples/mascot-dashboard/`
- Utilise `@aisnitch/client` directement (lien workspace `workspace:*`)
- WebSocket natif browser — pas de lib `ws` (c'est une app web)
- Zero backend — la page se connecte directement à `ws://127.0.0.1:4820`
- CSS Modules ou inline styles — pas de framework CSS externe (garder le bundle petit)
- Responsive grid (CSS Grid auto-fill)
- États dérivés du SDK : `eventToMascotState()`, `describeEvent()`, `SessionTracker`

## Sous-tâches

- [x] [01 — Vite + React Scaffold](./01_mascot-dashboard_scaffold_DONE.md) — Bootstrap Vite React TS, config workspace, structure des fichiers
- [x] [02 — AISnitch Hook & State Management](./02_mascot-dashboard_hook-state_DONE.md) — Hook React `useAISnitch()`, gestion des sessions, états dérivés
- [x] [03 — MascotCard UI Component](./03_mascot-dashboard_mascot-card_DONE.md) — Composant carte mascotte avec cercle d'état, header, footer, animations CSS
- [x] [04 — Dashboard Grid & Polish](./04_mascot-dashboard_grid-polish_DONE.md) — Grille responsive, header global, connection status, empty state, styles finaux

## Dépendances

- Requiert : **09-client-sdk** (`@aisnitch/client` publié et fonctionnel) ✅
- Requiert : Le daemon AISnitch qui tourne (`aisnitch start` ou `aisnitch start --mock all`)

## Ordre d'exécution

Séquentiel : 01 → 02 → 03 → 04
