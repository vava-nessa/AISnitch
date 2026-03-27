# 03 — Functional Requirements + NFR

## Research Protocol (Mandatory)

- L’IA peut utiliser la recherche via **Brave Search**, **Context7/Context8**, et **Exa.ai**.
- **`@CLAUDE_DATA.md` est obligatoire à consulter** avant d’ajouter/modifier des requirements.
- Les exigences doivent rester compatibles avec les conseils consolidés de `@CLAUDE_DATA.md`.

## Functional Requirements

### A. Daemon & Operations
1. Le système doit démarrer/stopper un daemon user-level cross-platform.
2. Le daemon doit exposer des commandes CLI: `start`, `stop`, `status`, `install`.
3. Le daemon doit redémarrer automatiquement selon l’OS:
   - macOS: LaunchAgent
   - Linux: systemd user service
   - Windows: Startup task / service wrapper

### B. Live ingestion
4. Le système doit ingérer via hooks HTTP (`localhost:4821`).
5. Le système doit ingérer via file watching (JSONL/logs) selon les tools.
6. Le système doit ingérer via process detection (fallback).
7. Le système doit supporter un fallback PTY wrap pour outils non supportés.

### C. Normalization
8. Tous les signaux doivent être normalisés sous un schéma unique.
9. Les 12 types d’événements cibles doivent être émis de façon cohérente:
   - `session.start`, `session.end`, `task.start`, `task.complete`
   - `agent.thinking`, `agent.coding`, `agent.tool_call`, `agent.streaming`
   - `agent.asking_user`, `agent.idle`, `agent.error`, `agent.compact`

### D. Streaming API
10. Le daemon doit diffuser en WebSocket sur `ws://localhost:4820`.
11. Le daemon doit envoyer les events uniquement aux clients connectés.
12. Le daemon doit gérer la backpressure en mémoire (drop policy contrôlée).

### E. Privacy-first constraints (hard requirements)
13. Le système ne doit pas écrire les événements sur disque.
14. Le système ne doit pas stocker de transcript brut persistant.
15. Le système ne doit pas offrir de replay historique.
16. Le système doit opérer en mémoire volatile uniquement.

### F. TUI (consumer principal MVP)
17. Le système doit fournir un TUI affichant les événements live.
18. Le TUI doit permettre des filtres tool/type et vue sessions actives.
19. Le TUI doit afficher les transitions d’état de manière lisible.

## Non-Functional Requirements

1. **Latency:** p95 ingest→display < 300ms en local.
2. **Reliability:** daemon stable, pas de crash sur payload invalide.
3. **Security:** bind localhost uniquement, zéro endpoint public par défaut.
4. **Privacy:** memory-only runtime, effacement naturel à l’arrêt process.
5. **Performance:** overhead faible en idle et sous charge multi-tools.
6. **Compatibility:** macOS, Linux, Windows (arm64 + x64 quand applicable).

## Acceptance Criteria (MVP exit)

1. `autosnitch start` lance le daemon, `status` confirme qu’il est vivant.
2. Un event hook est reçu et affiché live dans le TUI.
3. 3 tools minimum sont monitorés correctement (dont Claude Code).
4. Aucun event payload n’est écrit sur disque par AutoSnitch.
5. L’arrêt du daemon efface l’état runtime (pas de replay après restart).
