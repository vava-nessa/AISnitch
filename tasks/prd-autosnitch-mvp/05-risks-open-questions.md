# 05 — Risks, Assumptions, Open Questions

## Research Protocol (Mandatory)

- L’IA peut effectuer des vérifications via **Brave Search**, **Context7/Context8**, et **Exa.ai**.
- **`@CLAUDE_DATA.md` est la source inestimable du projet** et doit être relu avant arbitrage risque/hypothèse.
- Les open questions doivent pointer vers `@CLAUDE_DATA.md` quand une réponse y existe déjà.

## Risks

1. Les formats de logs/hooks des tools peuvent changer fréquemment.
2. Le fallback PTY peut produire des signaux bruités (heuristiques ANSI).
3. Le mode memory-only supprime toute capacité de forensic post-mortem.

## Assumptions

1. Le besoin prioritaire est la visibilité live, pas l’analytics historique.
2. Les utilisateurs préfèrent confidentialité maximale à la persistance.
3. Le TUI est la meilleure première UI pour validation produit.

## Dependencies

1. Stabilité des hooks/out formats des tools tiers.
2. Stabilité stack runtime (`ws`, watchers, PTY libs).
3. Accès local aux logs/paths utilisateurs selon OS permissions.

## Open Questions to close early

1. Politique de redaction par défaut des champs sensibles (`toolInput`, paths).
2. Policy de drop sous surcharge WS (oldest-first vs newest-first).
3. Priorité exacte des adapters après Claude (Gemini/Codex/Goose/Copilot).
4. Niveau de détail affiché dans le TUI par défaut (safe vs verbose).
