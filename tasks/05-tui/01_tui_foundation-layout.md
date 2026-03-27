# 01 — TUI : Ink Foundation & Layout

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-tui.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `01_tui_foundation-layout_DONE.md`
> - **Recherche Exa.ai** : Chercher "ink react terminal examples charmbracelet style", regarder des TUI modernes pour s'inspirer (lazygit, bottom, etc.)
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.

## Contexte

Le TUI est le **consumer principal du MVP**. C'est une app terminal riche construite avec `ink` (React pour le terminal). Elle doit être belle, colorée, bien organisée — façon charmbracelet (Bubbletea Go). C'est la vitrine du projet : si le TUI est beau, les gens adoptent.

## Ressources

- **`CLAUDE_DATA.md`** section "TUI live" — specs fonctionnelles
- Lib : `ink` v5.x (React pour terminal) — [npm](https://www.npmjs.com/package/ink)
- Composants ink : `ink-text-input`, `ink-select-input`, `ink-spinner`, `ink-table`, `ink-gradient`
- Inspiration : lazygit, bottom (btm), k9s, charmbracelet/bubbletea examples
- **Exa.ai** : chercher des repos ink avec de beaux layouts

## Sous-étapes

- [ ] Installer `ink`, `react`, `@types/react`, `ink-gradient`, `ink-spinner`, `ink-big-text` (ou équivalent)
- [ ] Créer `src/tui/App.tsx` — Composant racine :
  - [ ] Layout principal avec header, body (panels), footer (status bar)
  - [ ] Gestion du responsive (s'adapte à la taille du terminal)
- [ ] Créer `src/tui/components/Header.tsx` :
  - [ ] Logo/titre "AISnitch" en ASCII art ou gradient
  - [ ] Version
  - [ ] Indicateur de connexion WebSocket (🟢 Connected / 🔴 Disconnected)
- [ ] Créer `src/tui/components/StatusBar.tsx` :
  - [ ] Nombre d'events reçus
  - [ ] Adapters actifs
  - [ ] Consumers WebSocket connectés
  - [ ] Uptime
  - [ ] Keybinds hints (q: quit, f: filter, etc.)
- [ ] Créer `src/tui/components/Layout.tsx` :
  - [ ] Gestion des panels côte à côte (flex row/column)
  - [ ] Bordures colorées par panel
  - [ ] Scrollable areas
- [ ] Définir le **thème couleurs** :
  - [ ] Couleur par tool (claude=violet, opencode=vert, gemini=bleu, codex=orange...)
  - [ ] Couleur par event type (thinking=jaune, coding=vert, error=rouge, idle=gris...)
  - [ ] Palette cohérente et accessible
- [ ] Créer `src/tui/theme.ts` — constantes couleurs exportées
- [ ] Créer `src/tui/index.tsx` — Entry point qui rend `<App />` via `ink.render()`
- [ ] Intégrer avec le CLI : `aisnitch start` rend le TUI
- [ ] Tester le rendu dans un terminal (iTerm2, Terminal.app, kitty)
- [ ] 👤 Validation utilisateur : le layout est clean ?
- [ ] Vérifier `pnpm build`

## Spécifications techniques

### Layout cible
```
┌─────────────────────────────────────────────────────────┐
│  🕵️ AISnitch v0.1.0                    🟢 WS Connected  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─ Event Stream ──────────────┐ ┌─ Sessions ─────────┐ │
│  │ 14:32:01 [claude] coding    │ │ 🟣 claude-code     │ │
│  │ 14:32:03 [claude] tool_call │ │   Session: abc123   │ │
│  │   └─ Write: src/index.ts   │ │   State: coding     │ │
│  │ 14:32:05 [opencode] idle   │ │   Events: 42        │ │
│  │ 14:32:08 [claude] thinking │ │                     │ │
│  │ ...                        │ │ 🟢 opencode         │ │
│  │                            │ │   Session: def456   │ │
│  │                            │ │   State: idle       │ │
│  └────────────────────────────┘ └─────────────────────┘ │
│                                                          │
├─────────────────────────────────────────────────────────┤
│  Events: 156 | Adapters: 2/2 | Consumers: 1 | Up: 12m  │
│  [q]uit [f]ilter [c]lear [?]help                        │
└─────────────────────────────────────────────────────────┘
```

### Thème couleurs
```typescript
// 📖 Palette couleurs par tool — chaque tool a sa couleur distincte
export const TOOL_COLORS: Record<ToolName, string> = {
  'claude-code': '#7C3AED',  // violet
  'opencode':    '#10B981',  // vert emerald
  'gemini-cli':  '#3B82F6',  // bleu
  'codex':       '#F59E0B',  // orange/amber
  'goose':       '#EC4899',  // pink
  'copilot-cli': '#6366F1',  // indigo
  'aider':       '#14B8A6',  // teal
  'cursor':      '#8B5CF6',  // purple
  // ...
};

// 📖 Palette couleurs par event type
export const EVENT_COLORS: Record<AISnitchEventType, string> = {
  'session.start':     '#10B981',  // vert
  'session.end':       '#6B7280',  // gris
  'task.start':        '#3B82F6',  // bleu
  'task.complete':     '#10B981',  // vert
  'agent.thinking':    '#F59E0B',  // jaune/amber
  'agent.coding':      '#10B981',  // vert
  'agent.tool_call':   '#8B5CF6',  // violet
  'agent.streaming':   '#06B6D4',  // cyan
  'agent.asking_user': '#EF4444',  // rouge (attention!)
  'agent.idle':        '#6B7280',  // gris
  'agent.error':       '#EF4444',  // rouge
  'agent.compact':     '#F97316',  // orange
};
```

## Critères de complétion

- [ ] Layout principal rend correctement dans le terminal
- [ ] Header avec titre, version, indicateur connexion
- [ ] Status bar avec stats live
- [ ] Thème couleurs cohérent et beau
- [ ] Responsive (s'adapte à la taille du terminal)
- [ ] Intégré avec `aisnitch start`
- [ ] 👤 Look validé par l'utilisateur
- [ ] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**
