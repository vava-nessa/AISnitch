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
- [ ] Créer `src/tui/components/SessionPanel.tsx` :
  - [ ] Liste des sessions actives groupées par tool
  - [ ] Pour chaque session :
    - [ ] Dot coloré du tool
    - [ ] Nom du tool
    - [ ] Session ID (tronqué)
    - [ ] État courant (`thinking`, `coding`, `idle`...)
    - [ ] Nombre d'events
    - [ ] Durée active
  - [ ] État visuel distinctif :
    - [ ] `coding` → animation ou highlight vert
    - [ ] `thinking` → animation ou highlight jaune
    - [ ] `asking_user` → highlight rouge clignotant
    - [ ] `idle` → grisé
    - [ ] `error` → rouge
- [ ] Créer `src/tui/hooks/useSessions.ts` — hook qui track les sessions :
  - [ ] Maintient une Map<sessionId, SessionState>
  - [ ] Met à jour l'état à chaque event reçu
  - [ ] Détecte les sessions terminées (session.end ou timeout)

### Badge d'état global
- [ ] Créer `src/tui/components/GlobalBadge.tsx` :
  - [ ] Icône de synthèse de l'activité globale :
    - [ ] ◇ Ready (toutes les sessions idle)
    - [ ] ✦ Working (au moins une session en coding/thinking/tool_call)
    - [ ] ✋ Action Required (au moins une session en asking_user)
  - [ ] Affiché dans le header

### Filtres
- [ ] Créer `src/tui/components/FilterBar.tsx` :
  - [ ] Filtre par tool : `f` → menu de sélection du tool
  - [ ] Filtre par event type : `t` → menu de sélection du type
  - [ ] Filtre texte libre : `/` → recherche dans les events (toolName, filePath, etc.)
  - [ ] Indicateur visuel quand un filtre est actif
  - [ ] `Esc` → clear tous les filtres

### Keybinds & Controls
- [ ] Implémenter les keybinds globaux :
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
- [ ] Créer `src/tui/components/HelpOverlay.tsx` — overlay modal avec tous les keybinds
- [ ] Créer `src/tui/hooks/useKeyBinds.ts` — hook central pour la gestion des touches

### CLI Integration
- [ ] Les filtres peuvent aussi être passés en CLI args :
  - [ ] `aisnitch start --tool=claude-code` → filtre pré-appliqué
  - [ ] `aisnitch start --type=agent.coding` → filtre pré-appliqué
  - [ ] `aisnitch attach --tool=opencode` → filtre sur le TUI attaché

- [ ] Écrire tests :
  - [ ] SessionPanel rend les sessions correctement
  - [ ] Filtres filtrent les events
  - [ ] Global badge reflète le bon état
- [ ] Mettre à jour le README avec la section "TUI Usage & Keybinds"
- [ ] Vérifier `pnpm build`

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

- [ ] Panel sessions affiche les sessions actives avec état visuel
- [ ] Badge global reflète l'état d'activité
- [ ] Filtres par tool, type, et texte fonctionnent
- [ ] Tous les keybinds fonctionnent
- [ ] Help overlay accessible via `?`
- [ ] CLI args `--tool` et `--type` appliquent les filtres
- [ ] README mis à jour
- [ ] Tests passent
- [ ] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**
