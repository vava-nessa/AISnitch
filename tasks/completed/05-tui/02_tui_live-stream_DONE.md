# 02 — TUI : Live Event Stream

> ⚠️ **Instruction IA** :
> - Après avoir complété cette tâche ou une sous-étape, mets à jour les checkboxes ci-dessous.
> - Mets à jour le sommaire (`task-tui.md`) et le kanban (`tasks.md`).
> - **Quand la tâche est terminée et validée** : renomme ce fichier → `02_tui_live-stream_DONE.md`
> - Documente le code avec des commentaires `📖`, ajoute JSDoc.

## Contexte

Le panel "Event Stream" est la pièce centrale du TUI. C'est un flux en direct de tous les events AISnitch, formatés de façon lisible et colorée. Chaque ligne montre le timestamp, le tool, le type d'event, et les détails pertinents.

## Ressources

- Thème couleurs défini dans tâche 01
- Les schemas/types de la tâche 01-project-setup/02
- **`CLAUDE_DATA.md`** section "State machine transitions"

## Sous-étapes

- [x] Créer `src/tui/components/EventStream.tsx` :
  - [x] Liste scrollable d'events (max 500 en mémoire, drop les anciens)
  - [x] Chaque event = une ligne formatée :
    ```
    14:32:01 🟣 [claude-code] agent.coding
      └─ Write: src/components/Header.tsx
    ```
  - [x] Couleur du tool (dot coloré + nom)
  - [x] Couleur du type d'event
  - [x] Détails indentés en sous-ligne (toolName, filePath, command, errorMessage...)
  - [x] Auto-scroll vers le bas (nouveau event = scroll)
  - [x] Possibilité de "freeze" le scroll (touche `space`) pour lire
- [x] Créer `src/tui/components/EventLine.tsx` — composant pour une seule ligne d'event :
  - [x] Timestamp formaté `HH:mm:ss`
  - [x] Icône par event type :
    ```
    session.start    → 🚀
    session.end      → 👋
    task.start       → 📝
    task.complete    → ✅
    agent.thinking   → 🤔
    agent.coding     → ⌨️
    agent.tool_call  → 🔧
    agent.streaming  → 💬
    agent.asking_user→ ✋
    agent.idle       → 💤
    agent.error      → ❌
    agent.compact    → 🧠
    ```
  - [x] Nom du tool entre crochets avec sa couleur
  - [x] Type d'event avec sa couleur
  - [x] Ligne de détail optionnelle (si tool_call → afficher le tool name + input)
- [x] Créer `src/tui/hooks/useEventStream.ts` — React hook :
  - [x] Se connecte à l'EventBus (en mode foreground) ou au WebSocket (en mode attach)
  - [x] Maintient un array d'events en state React
  - [x] Gère le max size (500 events)
- [x] Implémenter le formatage des détails par type :
  - [x] `agent.tool_call` → "🔧 {toolName}: {filePath ou command}"
  - [x] `agent.error` → "❌ {errorType}: {errorMessage}"
  - [x] `task.start` → "📝 Prompt submitted"
  - [x] `agent.compact` → "🧠 Context compaction triggered"
- [x] Écrire tests :
  - [x] EventLine rend correctement pour chaque type
  - [x] EventStream gère le max size
  - [x] Auto-scroll et freeze fonctionnent
- [x] Vérifier `pnpm build`

## Spécifications techniques

### EventLine rendering (esquisse)
```tsx
// 📖 Composant d'une ligne d'event dans le stream
const EventLine: FC<{ event: AISnitchEvent }> = ({ event }) => {
  const toolColor = TOOL_COLORS[event['aisnitch.tool']];
  const eventColor = EVENT_COLORS[event.type];
  const icon = EVENT_ICONS[event.type];
  const time = new Date(event.time).toLocaleTimeString('en-GB');

  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>{time}</Text>
        <Text> </Text>
        <Text>{icon}</Text>
        <Text> </Text>
        <Text color={toolColor}>[{event['aisnitch.tool']}]</Text>
        <Text> </Text>
        <Text color={eventColor} bold>{event.type}</Text>
      </Box>
      {event.data.toolName && (
        <Box marginLeft={2}>
          <Text dimColor>└─ {event.data.toolName}: {event.data.toolInput?.filePath ?? event.data.toolInput?.command ?? ''}</Text>
        </Box>
      )}
    </Box>
  );
};
```

### useEventStream hook
```typescript
// 📖 Hook React — connecte le TUI au flux d'events (EventBus ou WebSocket)
function useEventStream(source: EventBus | WebSocket): AISnitchEvent[] {
  const [events, setEvents] = useState<AISnitchEvent[]>([]);

  useEffect(() => {
    const handler = (event: AISnitchEvent) => {
      setEvents(prev => {
        const next = [...prev, event];
        return next.length > 500 ? next.slice(-500) : next;
      });
    };
    // Subscribe...
    return () => { /* Cleanup */ };
  }, [source]);

  return events;
}
```

## Critères de complétion

- [x] Event stream affiche les events en temps réel
- [x] Chaque type d'event a son icône et sa couleur
- [x] Détails des tool calls affichés en sous-ligne
- [x] Auto-scroll fonctionne
- [x] Freeze/unfreeze du scroll
- [x] Max 500 events en mémoire
- [x] Tests passent
- [x] Code documenté

---

## 📝 RAPPORT FINAL

### Livré

- `EventLine` pour afficher un event normalisé avec icône, couleurs, timestamp, et détail compact
- `EventStream` pour rendre la fenêtre visible du flux live
- `useEventStream` pour gérer le buffer borné à 500 events, le tail live, et le mode frozen
- Intégration dans `App.tsx` avec `space` pour freeze/resume et statut visible dans la status bar

### Validation réalisée

- `pnpm check` vert
- Smoke TTY foreground avec adapter `claude-code` activé
- Injection d'un hook HTTP normalisé vers `/hooks/claude-code` et observation du rendu live dans le panel TUI
- Vérification manuelle du mode `freeze`: le flux reste figé et la status bar affiche bien `Frozen +1` quand un nouvel event arrive

### Notes

- Le hook supporte déjà une source `EventBus` ou `WebSocket`, ce qui évite de recoder la logique lors du futur TUI attach-mode
- Le panel Sessions reste encore un preview léger jusqu'à `05/03`
