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

- [ ] Créer `src/tui/components/EventStream.tsx` :
  - [ ] Liste scrollable d'events (max 500 en mémoire, drop les anciens)
  - [ ] Chaque event = une ligne formatée :
    ```
    14:32:01 🟣 [claude-code] agent.coding
      └─ Write: src/components/Header.tsx
    ```
  - [ ] Couleur du tool (dot coloré + nom)
  - [ ] Couleur du type d'event
  - [ ] Détails indentés en sous-ligne (toolName, filePath, command, errorMessage...)
  - [ ] Auto-scroll vers le bas (nouveau event = scroll)
  - [ ] Possibilité de "freeze" le scroll (touche `space`) pour lire
- [ ] Créer `src/tui/components/EventLine.tsx` — composant pour une seule ligne d'event :
  - [ ] Timestamp formaté `HH:mm:ss`
  - [ ] Icône par event type :
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
  - [ ] Nom du tool entre crochets avec sa couleur
  - [ ] Type d'event avec sa couleur
  - [ ] Ligne de détail optionnelle (si tool_call → afficher le tool name + input)
- [ ] Créer `src/tui/hooks/useEventStream.ts` — React hook :
  - [ ] Se connecte à l'EventBus (en mode foreground) ou au WebSocket (en mode attach)
  - [ ] Maintient un array d'events en state React
  - [ ] Gère le max size (500 events)
- [ ] Implémenter le formatage des détails par type :
  - [ ] `agent.tool_call` → "🔧 {toolName}: {filePath ou command}"
  - [ ] `agent.error` → "❌ {errorType}: {errorMessage}"
  - [ ] `task.start` → "📝 Prompt submitted"
  - [ ] `agent.compact` → "🧠 Context compaction triggered"
- [ ] Écrire tests :
  - [ ] EventLine rend correctement pour chaque type
  - [ ] EventStream gère le max size
  - [ ] Auto-scroll et freeze fonctionnent
- [ ] Vérifier `pnpm build`

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

- [ ] Event stream affiche les events en temps réel
- [ ] Chaque type d'event a son icône et sa couleur
- [ ] Détails des tool calls affichés en sous-ligne
- [ ] Auto-scroll fonctionne
- [ ] Freeze/unfreeze du scroll
- [ ] Max 500 events en mémoire
- [ ] Tests passent
- [ ] Code documenté

---

## 📝 RAPPORT FINAL
> ⚠️ **À remplir par l'IA quand la tâche est terminée et validée.**
