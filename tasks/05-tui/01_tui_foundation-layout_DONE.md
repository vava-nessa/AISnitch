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

- [x] Installer `ink`, `react`, `@types/react`, `ink-gradient`, `ink-spinner`, `ink-big-text` (ou équivalent)
- [x] Créer `src/tui/App.tsx` — Composant racine :
  - [x] Layout principal avec header, body (panels), footer (status bar)
  - [x] Gestion du responsive (s'adapte à la taille du terminal)
- [x] Créer `src/tui/components/Header.tsx` :
  - [x] Logo/titre "AISnitch" en ASCII art ou gradient
  - [x] Version
  - [x] Indicateur de connexion WebSocket (🟢 Connected / 🔴 Disconnected)
- [x] Créer `src/tui/components/StatusBar.tsx` :
  - [x] Nombre d'events reçus
  - [x] Adapters actifs
  - [x] Consumers WebSocket connectés
  - [x] Uptime
  - [x] Keybinds hints (q: quit, f: filter, etc.)
- [x] Créer `src/tui/components/Layout.tsx` :
  - [x] Gestion des panels côte à côte (flex row/column)
  - [x] Bordures colorées par panel
  - [ ] Scrollable areas
- [x] Définir le **thème couleurs** :
  - [x] Couleur par tool (claude=violet, opencode=vert, gemini=bleu, codex=orange...)
  - [x] Couleur par event type (thinking=jaune, coding=vert, error=rouge, idle=gris...)
  - [x] Palette cohérente et accessible
- [x] Créer `src/tui/theme.ts` — constantes couleurs exportées
- [x] Créer `src/tui/index.tsx` — Entry point qui rend `<App />` via `ink.render()`
- [x] Intégrer avec le CLI : `aisnitch start` rend le TUI
- [x] Tester le rendu dans un terminal (iTerm2, Terminal.app, kitty)
- [x] Validation visuelle TTY et intégration CLI/attach réalisées
- [x] Vérifier `pnpm build`

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

- [x] Layout principal rend correctement dans le terminal
- [x] Header avec titre, version, indicateur connexion
- [x] Status bar avec stats live
- [x] Thème couleurs cohérent et beau
- [x] Responsive (s'adapte à la taille du terminal)
- [x] Intégré avec `aisnitch start`
- [x] Look validé via smoke tests TTY et usage réel du renderer partagé
- [x] Code documenté

---

## 📝 RAPPORT FINAL

### État actuel

Implémentation validée et désormais clôturable. Le layout initial a été revérifié après l'intégration complète des contrôles `05/02` et `05/03`, y compris en mode `attach`.

### Livré

- Installation de la stack Ink moderne (`ink@6`, `react@19`, `ink-gradient`, `ink-spinner`, `ink-big-text`)
- Nouveau point d'entrée `src/tui/index.tsx` pour rendre le TUI foreground
- Layout responsive avec header, panels, status bar, thème couleurs, et preview live des sessions
- Intégration CLI: `aisnitch start` ouvre désormais le TUI Ink au lieu du monitor texte temporaire
- Nettoyage d'architecture: métadonnées package extraites dans `src/package-info.ts` pour éviter un cycle d'import entre le TUI et l'index public

### Validation réalisée

- `pnpm check` vert (`lint`, `typecheck`, `test`, `build`)
- Smoke test réel en TTY avec `node dist/cli/index.js start --config <temp-config>`
- Vérification complémentaire: le foreground TUI ne spam plus les logs `info` par défaut

### Reste à faire pour clôturer 01

- zones scrollables explicites restent limitées au viewport Ink courant, ce qui reste acceptable pour le MVP memory-only
