# 05 — Risks, Assumptions, Open Questions

## Research Protocol (Mandatory)

- L’IA peut effectuer des vérifications via **Brave Search**, **Context7/Context8**, et **Exa.ai**.
- **`@CLAUDE_DATA.md` est la source inestimable du projet** et doit être relu avant arbitrage risque/hypothèse.
- Les open questions doivent pointer vers `@CLAUDE_DATA.md` quand une réponse y existe déjà.

## Risks

1. **Fragmentation & Instabilité des APIs** : Les formats de logs/hooks des tools changent fréquemment (ex: Cursor CLI JSON, Claude Code http hooks). Risque d'entretien constant.
2. **Qualité du fallback PTY** : Le fallback PTY Node (`@lydell/node-pty`) ou natif Rust (`nix::pty`) peut produire des signaux bruités reposant sur des heuristiques (regexp de Parsing d'ANSI comme Spinner `\r` ou Prompts) fragiles.
3. **Forensic et état OOM** : Le mode memory-only / WAL-only temporisé supprime toute capacité d'audit en cas de crash ("où en était l'agent ?").
4. **Lock de SQLite** : Bien qu'en `WAL` mode et `synchronous=NORMAL`, des accès concurrents intenses par le démon et de multiples child-process pourraient lock la db ou la corrompre.
5. **Event Drop** : Un afflux massif côté WebSockets (ex: stream d'un PTY non filtré) ou un client TUI local congestionné causera un "drop" silenciaire par les 1 000 max du `ring buffer` de l'API WS, perdant potentiellement des events finaux cruciaux.

## Assumptions

1. Le besoin prioritaire des users est la **visibilité live de l'activité** (Dashboard MASCOTTE, TUI), pas l’analytics historique conservée sur plus de 7 jours.
2. Les utilisateurs préfèrent une **confidentialité absolue et locale** par rapport à la persistance, donc l'absence de replay intégral rassurera l'adoption.
3. Le **TUI basé sur le terminal natif** est la meilleure première itération et le client de test e2e robuste parfait pour prouver l'enveloppe CloudEvents.
4. Les développeurs tolèreront `@lydell/node-pty` ou un build Rust pre-build via `napi-rs` évitant l'horreur des contraintes `node-gyp`.

## Dependencies

1. Stabilité à l'usage des `hooks` / `stream-json` des principaux tiers (Anthropic, OpenAI, Block).
2. Viabilité de la stack runtime et de son overhead: `ws` (Node websocket natif validé à ~8 000 msg/s, suffisante face à `uWebSockets.js`), `chokidar` v5 (FSEvents bind pur macOS), EventBus `eventemitter3`.
3. Droits d'Acesso OS : Par défaut `launchd` en userspace permet d'écouter les config dirs (`~/.claude/` ou `~/.config/opencode/`) sans `sudo`.

## Open Questions to close early

1. **Politique de redaction par défaut des champs sensibles** (`toolInput`, paths). *RÉPONSE CLAUDE_DATA:* Une option locale (redaction API) doit exister bien que le transit soit 100% memory-only et local.
2. **Policy de drop sous surcharge WS** (oldest-first vs newest-first). *RÉPONSE CLAUDE_DATA:* Un mécanisme de ring buffer (backpressure sur le socket TCP local) per-consumer qui drop au dessus de 1000 items (oldest-first forcé).
3. **Priorité exacte des adapters après Claude Code**. *RÉPONSE CLAUDE_DATA:* Claude est le Tier 1 (21 events), suivi de près par Gemini CLI & GitHub Copilot CLI, puis Codex / Goose en Tier 2 (`stream-json`).
4. **Retro-compat PING** : Comment maintenir / mapper le CESP PeonPing (160+ soundpacks) ? *RÉPONSE CLAUDE_DATA:* Une utility function de "bridge" map les 12 Event types natifs CloudEvent vers les 6 catégories basiques CESP pour les triggers sonores compatibles.
