# 03 — Mascot Dashboard : MascotCard UI Component

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-mascot-dashboard.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `03_mascot-dashboard_mascot-card_DONE.md`
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.

## Contexte

Le composant `MascotCard` est la pièce maîtresse visuelle. Chaque carte représente un agent AI actif avec un **emoji comme mascotte** dans un cercle coloré, entouré d'informations contextuelles. Le tout doit être vivant, avec des animations CSS fluides.

## Design de la carte

```
┌─────────────────────────────────┐
│  🟠 claude-code    iTerm2       │  ← header : tool color dot + tool name + terminal
│  ~/projects/myapp               │  ← project path
├─────────────────────────────────┤
│                                 │
│         ┌───────────┐           │
│         │           │           │
│         │     🤔    │           │  ← cercle coloré avec emoji mascotte
│         │  Thinking │           │  ← label de l'état sous l'emoji
│         └───────────┘           │
│                                 │
├─────────────────────────────────┤
│  editing code → src/index.ts    │  ← description détaillée
│  42 events · 3m 27s            │  ← event count + durée session
└─────────────────────────────────┘
```

## Sous-étapes

- [ ] **Emoji mascotte par mood** — `lib/mascotEmojis.ts` :
  - [ ] Map `MascotMood → { emoji: string, label: string }` :
    - `idle` → `{ 🧊, "Idle" }`
    - `thinking` → `{ 🤔, "Thinking..." }`
    - `working` → `{ ⚡, "Working" }`
    - `waiting` → `{ 🙋, "Needs you!" }`
    - `celebrating` → `{ 🎉, "Done!" }`
    - `panicking` → `{ 💥, "Error!" }`
  - [ ] Overlays spéciaux (prioritaires sur le mood) :
    - `sleeping` → `{ 😴, "Zzz..." }` avec animation breathing
    - `killed` → `{ 💀, "Killed" }` avec animation tremblement + fade-out

- [ ] **Composant `MascotCard.tsx`** :
  - [ ] Props : `AgentCardState` (du hook), `toolColor` (de toolColors)
  - [ ] Header :
    - Petit cercle coloré (tool color) + nom du tool en gras
    - Nom du terminal à droite (ex: "iTerm2", "Terminal", "Warp")
    - Path du projet en dessous (tronqué si trop long, avec tooltip full path)
  - [ ] Corps — Le cercle mascotte :
    - Cercle de ~100px de diamètre, `border-radius: 50%`
    - Background : dégradé subtil dérivé de `toolColor` (plus clair au centre)
    - **Glow pulsant** : `box-shadow` animé avec la couleur du mood (violet pour thinking, amber pour coding...)
    - Emoji mascotte au centre (taille ~40px), grossi avec `font-size`
    - Label de l'état en dessous de l'emoji (petit texte)
    - **Idle breathing** : quand `isSleeping`, le cercle pulse doucement (`scale(1) → scale(1.05)` en boucle, lent)
    - **Mini-particules CSS** (composant `Particles`) autour du cercle selon le mood
  - [ ] Footer :
    - Description détaillée (`lastDescription`) en petit texte, tronqué si trop long
    - `eventCount` events · durée formatée (ex: "3m 27s" depuis `startedAt`)
  - [ ] Animations CSS :
    - **Slide-in** : la carte apparaît avec un `translateX(-20px) → 0` + `opacity 0 → 1` (200ms ease-out)
    - **State transition** : la couleur du cercle cross-fade doucement (`transition: all 300ms`)
    - **Kill animation** (5 secondes) :
      - Phase 1 (0-1s) : tremblement (`shake` keyframe), le cercle tourne rouge
      - Phase 2 (1-3s) : l'emoji passe 💀, le cercle rétrécit doucement
      - Phase 3 (3-5s) : fade-out complet (`opacity 1 → 0`), la carte glisse vers le haut
    - **Sleeping** : `😴` avec une animation de "respiration" lente

- [ ] **Composant `Particles.tsx`** :
  - [ ] Petits éléments CSS absolument positionnés autour du cercle
  - [ ] Particules différentes selon le mood :
    - `thinking` → petites étoiles ✨ qui orbitent lentement
    - `working` → étincelles ⚡ qui apparaissent/disparaissent
    - `celebrating` → confetti 🎊 mini
    - `error` → petits éclairs rouges
    - `sleeping` → bulles Zzz qui montent
  - [ ] CSS-only (pas de JS animation), keyframes + `animation-delay` décalés
  - [ ] 3-5 particules max par état (garder léger)

- [ ] **Styles `MascotCard.css` + `Particles.css`** :
  - [ ] Dark theme cards (bg: `#1a1a2e` ou similaire, border subtil)
  - [ ] Border-radius arrondi (12-16px)
  - [ ] Hover : légère élévation (`transform: translateY(-2px)`)
  - [ ] Toutes les keyframes d'animation : `slideIn`, `shake`, `breathe`, `fadeOut`, `slideUp`
  - [ ] Variables CSS pour les couleurs dynamiques (injectées via inline style depuis `toolColor`)

- [ ] **Timer de durée** — formatage human-readable :
  - [ ] `startedAt` ISO → calculer la différence avec `Date.now()`
  - [ ] Format : "42s", "3m 27s", "1h 12m", "2d 5h"
  - [ ] Se met à jour toutes les secondes (interval)

## Critères de complétion

- [ ] La carte affiche l'emoji mascotte correct pour chaque état
- [ ] Le glow pulsant change de couleur selon le mood
- [ ] L'animation de kill fonctionne (tremblement → 💀 → fade-out → disparition en 5s)
- [ ] L'animation sleeping (breathing) est fluide
- [ ] Les particules CSS apparaissent autour du cercle selon l'état
- [ ] La carte slide-in proprement quand un nouvel agent apparaît
- [ ] Les transitions entre états sont douces (pas de snap)
- [ ] Timer de durée visible et à jour
