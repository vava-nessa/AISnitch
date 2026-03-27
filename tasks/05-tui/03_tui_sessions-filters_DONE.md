# 03 — TUI : Sessions, Filtres & Controls

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-tui.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `03_tui_sessions-filters_DONE.md`
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.
> - **Mettre à jour le README** avec la doc TUI (keybinds, features).

## Contexte

Le panel "Sessions" montre les sessions actives par tool avec leur état courant. Les filtres permettent de cibler un tool ou un type d'event spécifique. Les keybinds rendent le TUI navigable et interactif.

## Ressources

- Layout défini en tâche 01
- State machine des events : `CLAUDE_DATA.md` section "State machine transitions"

## Sous-étapes

### Panel Sessions
- [x] Créer `src/tui/components/SessionPanel.tsx` :
  - [x] Liste des sessions actives groupées par tool
  - [x] Pour chaque session :
    - [x] Dot coloré du tool
    - [x] Nom du tool
    - [x] Session ID (tronqué)
    - [x] État courant (`thinking`, `coding`, `idle`...)
    - [x] Nombre d'events
    - [x] Durée active
  - [x] État visuel distinctif :
    - [x] `coding` → animation ou highlight vert
    - [x] `thinking` → animation ou highlight jaune
    - [x] `asking_user` → highlight rouge clignotant
    - [x] `idle` → grisé
    - [x] `error` → rouge
- [x] Créer `src/tui/hooks/useSessions.ts` — hook qui track les sessions :
  - [x] Maintient une Map<sessionId, SessionState>
  - [x] Met à jour l'état à chaque event reçu
  - [x] Détecte les sessions terminées (session.end ou timeout)

### Badge d'état global
- [x] Créer `src/tui/components/GlobalBadge.tsx` :
  - [x] Icône de synthèse de l'activité globale :
    - [x] ◇ Ready (toutes les sessions idle)
    - [x] ✦ Working (au moins une session en coding/thinking/tool_call)
    - [x] ✋ Action Required (au moins une session en asking_user)
  - [x] Affiché dans le header

### Filtres
- [x] Créer `src/tui/components/FilterBar.tsx` :
  - [x] Filtre par tool : `f` → menu de sélection du tool
  - [x] Filtre par event type : `t` → menu de sélection du type
  - [x] Filtre texte libre : `/` → recherche dans les events (toolName, filePath, etc.)
  - [x] Indicateur visuel quand un filtre est actif
  - [x] `Esc` → clear tous les filtres

### Keybinds & Controls
- [x] Implémenter les keybinds globaux :
  ```
  q / Ctrl+C  → Quit (shutdown propre)
  f           → Filter par tool
  t           → Filter par type d'event
  /           → Recherche texte
  Esc         → Clear filtres
  Space       → Freeze/unfreeze auto-scroll
  c           → Clear l'event stream
  ?           → Aide (affiche tous les keybinds)
  Tab         → Cycle entre les panels (focus)
  ```
- [x] Créer `src/tui/components/HelpOverlay.tsx` — overlay modal avec tous les keybinds
- [x] Créer `src/tui/hooks/useKeyBinds.ts` — hook central pour la gestion des touches

### CLI Integration
- [x] Les filtres peuvent aussi être passés en CLI args :
  - [x] `aisnitch start --tool=claude-code` → filtre pré-appliqué
  - [x] `aisnitch start --type=agent.coding` → filtre pré-appliqué
  - [x] `aisnitch attach --tool=opencode` → filtre sur le TUI attaché

- [x] Écrire tests :
  - [x] SessionPanel rend les sessions correctement
  - [x] Filtres filtrent les events
  - [x] Global badge reflète le bon état
- [x] Mettre à jour le README avec la section "TUI Usage & Keybinds"
- [x] Vérifier `pnpm build`

## Spécifications techniques

### SessionState
```typescript
interface SessionState {
  id: string;
  tool: ToolName;
  currentState: AISnitchEventType;
  startedAt: Date;
  eventCount: number;
  lastEventAt: Date;
  project?: string;
}
```

## Critères de complétion

- [x] Panel sessions affiche les sessions actives avec état visuel
- [x] Badge global reflète l'état d'activité
- [x] Filtres par tool, type, et texte fonctionnent
- [x] Tous les keybinds fonctionnent
- [x] Help overlay accessible via `?`
- [x] CLI args `--tool` et `--type` appliquent les filtres
- [x] README mis à jour
- [x] Tests passent
- [x] Code documenté

---

## 📝 RAPPORT FINAL

### État final

Le TUI couvre maintenant les sessions actives, les filtres globaux, les keybinds, et le rendu partagé entre `start` et `attach`.

### Livré

- `src/tui/components/SessionPanel.tsx` pour grouper les sessions par tool avec état, durée, et volume d'events
- `src/tui/components/GlobalBadge.tsx` pour la synthèse `Ready / Working / Action Required`
- `src/tui/components/FilterBar.tsx` et `src/tui/components/HelpOverlay.tsx` pour rendre les contrôles visibles
- `src/tui/hooks/useSessions.ts`, `src/tui/hooks/useKeyBinds.ts`, et `src/tui/filters.ts` pour isoler la logique dérivée et les interactions clavier
- Intégration CLI `--tool` / `--type` dans `start` et `attach`
- Remplacement du vieux monitor attach par le même renderer Ink que le foreground

### Validation réalisée

- `pnpm check` vert
- Tests unitaires TUI/CLI étendus pour les filtres, les sessions, le badge, et le parsing des options CLI
- Smoke tests réels du build sur :
  - `start --daemon --config <temp-config>`
  - `attach --config <temp-config> --tool claude-code`
  - ingestion live d'un hook Claude affiché dans le TUI attaché
