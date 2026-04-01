# 04 — Mascot Dashboard : Dashboard Grid & Polish

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-mascot-dashboard.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `04_mascot-dashboard_grid-polish_DONE.md`
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.

## Contexte

Assembler tous les composants dans le layout final. Grille responsive, barre de statut connectivité, ticker d'événements, empty state, et polish visuel final.

## Layout global

```
┌──────────────────────────────────────────────────────────┐
│  🐸 AISnitch Mascot Dashboard         🟢 Connected  🔊  │  ← StatusBar
│                                         3 agents · 12 kills│
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ 🤔 Card  │  │ ⚡ Card  │  │ 😴 Card  │              │  ← Grid auto-fill
│  │ claude   │  │ opencode │  │ gemini   │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│                                                          │
│  No agents yet? Start one and watch it appear!           │  ← Empty state
│                                                          │
├──────────────────────────────────────────────────────────┤
│  ▸ claude-code is thinking... │ opencode completed task  │  ← EventTicker
└──────────────────────────────────────────────────────────┘
```

## Sous-étapes

- [ ] **Composant `StatusBar.tsx`** :
  - [ ] Gauche : logo/titre "🐸 AISnitch Mascot Dashboard"
  - [ ] Centre : stats — "X agents active · Y agents have fallen"
  - [ ] Droite :
    - Indicateur de connexion :
      - 🟢 `Connected` (vert) quand `connectionStatus === 'connected'`
      - 🟡 `Reconnecting...` (jaune, pulsant) quand `connectionStatus === 'reconnecting'`
      - 🔴 `Offline` (rouge) quand `connectionStatus === 'offline'`
      - Afficher la version du daemon si dispo (`welcome.version`)
    - Bouton 🔊/🔇 pour toggle le son
  - [ ] Style : barre fixe en haut, dark bg + border-bottom subtil

- [ ] **Composant `Dashboard.tsx`** — Layout principal :
  - [ ] Utilise `useAISnitch()` pour récupérer tout l'état
  - [ ] CSS Grid responsive :
    - `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`
    - Gap de 16-20px entre les cartes
    - Padding autour
  - [ ] Rendre les cartes triées : actives d'abord, sleeping ensuite, killed en dernier
  - [ ] Empty state quand `agents.size === 0` :
    - Message : "No agents yet. Start an AI tool and watch it appear! 👀"
    - Sous-texte : "Make sure `aisnitch start` is running"
    - Petite animation subtile (un 🐸 qui cligne de yeux par ex)
  - [ ] Passer les props aux `MascotCard` (AgentCardState + toolColor)

- [ ] **Composant `EventTicker.tsx`** :
  - [ ] Barre horizontale fixe en bas de l'écran
  - [ ] Affiche les 10-20 derniers events sous forme de petites pills
  - [ ] Chaque pill : `[tool] description courte` avec couleur tool
  - [ ] Scroll horizontal automatique (les nouveaux events push les anciens vers la gauche)
  - [ ] Animation : les nouvelles pills slide-in depuis la droite
  - [ ] Semi-transparent pour ne pas masquer le contenu

- [ ] **`App.tsx`** — Assemblage final :
  - [ ] `StatusBar` en haut (sticky)
  - [ ] `Dashboard` au centre (flex-grow, scrollable)
  - [ ] `EventTicker` en bas (sticky)
  - [ ] Provider/wrapper si nécessaire

- [ ] **`theme.css`** — Variables CSS globales :
  - [ ] Palette dark theme complète :
    - `--bg-primary: #0f0f1a` (fond très sombre, presque noir bleuté)
    - `--bg-card: #1a1a2e` (fond des cartes)
    - `--bg-card-hover: #22223a` (hover cards)
    - `--text-primary: #e2e8f0` (texte principal)
    - `--text-secondary: #94a3b8` (texte secondaire)
    - `--text-muted: #64748b` (texte discret)
    - `--border: #2d2d44` (borders subtils)
  - [ ] Font : system-ui ou monospace pour le côté dev tool
  - [ ] Reset CSS minimal
  - [ ] Scrollbar custom (dark, fine)

- [ ] **Polish final** :
  - [ ] Responsive : 1 colonne sur mobile, auto-fill sur desktop
  - [ ] Vérifier que les animations ne laguent pas (max ~20 cartes simultanées)
  - [ ] Tester avec `aisnitch start --mock all` pour voir le dashboard en action
  - [ ] S'assurer que le son est bien off by default et se toggle proprement
  - [ ] Ajouter un petit README dans `examples/mascot-dashboard/README.md` :
    - Comment lancer (`pnpm dev`)
    - Prérequis (`aisnitch start` ou `--mock all`)
    - Screenshots/GIF si possible
  - [ ] Mettre à jour le `docs/index.md` avec une section sur l'example

## Critères de complétion

- [ ] La grille s'adapte automatiquement (1 col mobile → N cols desktop)
- [ ] Le statut de connexion est visible et reflète l'état réel du WS
- [ ] L'EventTicker montre les derniers events en temps réel
- [ ] L'empty state s'affiche quand aucun agent n'est actif
- [ ] Le dashboard fonctionne de bout en bout avec `aisnitch start --mock all`
- [ ] Le son est toggleable et off par défaut
- [ ] Toutes les animations sont fluides (pas de jank visible)
- [ ] `pnpm build` compile sans erreur
- [ ] README de l'example complet
- [ ] Dark theme cohérent et joli
