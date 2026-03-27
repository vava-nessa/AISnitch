# 04 — Roadmap & Milestones

## Research Protocol (Mandatory)

- L’IA peut s’appuyer sur **Brave Search**, **Context7/Context8**, et **Exa.ai** pour actualiser le plan.
- **`@CLAUDE_DATA.md` est la source stratégique principale** et doit guider les priorités roadmap.
- Si une nouvelle source contredit `@CLAUDE_DATA.md`, documenter l’écart explicitement avant décision.

## Phase 1 — Core live pipeline (Weeks 1–2)

1. Monorepo pnpm + packages core/cli/tui
2. Event schema unifié + validation
3. Event bus in-memory
4. WS server live + HTTP hook endpoint
5. Commandes CLI start/stop/status/install

**Done when:** event injecté manuellement visible en live dans TUI.

## Phase 2 — Claude Code reference adapter (Weeks 3–4)

1. Adapter hooks HTTP Claude
2. JSONL watcher Claude
3. Process detection Claude
4. Setup auto de hooks Claude
5. Mapping des événements vers schéma commun

**Done when:** session réelle Claude visible end-to-end dans TUI.

## Phase 3 — Multi-tool adapters (Weeks 5–7)

1. Gemini adapter
2. Codex adapter
3. Goose ou Copilot adapter
4. Fallback PTY générique
5. Stabilisation parsing + états

**Done when:** 3+ tools simultanés monitorés correctement en live.

## Phase 4 — TUI polish + SDK client live (Weeks 8–9)

1. TUI filtres avancés et UX stable
2. SDK client typed pour consommateurs externes
3. CESP mapping utilitaire (optionnel)
4. Tests intégration live flow

**Done when:** TUI utilisable comme outil de monitoring quotidien.

## Phase 5 — Packaging & launch (Weeks 10–11)

1. Publication npm + docs setup
2. Guide adapters communautaires
3. Guides privacy & security posture

**Done when:** un utilisateur externe peut installer et monitorer en <10 min.
