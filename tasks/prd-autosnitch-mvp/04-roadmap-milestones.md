# 04 — Roadmap & Milestones

## Research Protocol (Mandatory)

- L’IA peut s’appuyer sur **Brave Search**, **Context7/Context8**, et **Exa.ai** pour actualiser le plan.
- **`@CLAUDE_DATA.md` est la source stratégique principale** et doit guider les priorités roadmap.
- Si une nouvelle source contredit `@CLAUDE_DATA.md`, documenter l’écart explicitement avant décision.

## Phase 1 — Core live pipeline (Weeks 1–2)

1. Monorepo pnpm + Turborepo (`packages/core`, `packages/cli`, `packages/client`).
2. Définition des schémas Zod (Validation Runtime + Typage TS inféré) unifiés dans `@autosnitch/core`.
3. Event bus in-memory (`eventemitter3` type-safe).
4. Stockage d'état passif via `better-sqlite3` avec WAL mode temporisé.
5. WS server live sur `ws://localhost:4820` (gestion backpressure + Ring buffer de 1.000 events) + HTTP hook endpoint (`localhost:4821/hooks`).
6. Commandes CLI `commander` (start/stop/status/install) avec `chokidar`/`pino`.

**Done when:** event injecté manuellement via une requête POST sur `localhost:4821` est visible en live dans le WS TUI.

## Phase 2 — Claude Code reference adapter (Weeks 3–4)

1. Construction de la classe abstraite `BaseAdapter`.
2. Implémenter le Receiver HTTP Hooks (`/hooks/claude-code`) pour les 21 events Claude.
3. Implémenter le JSONL watcher Claude (`~/.claude/projects/`) avec l'API `chokidar`.
4. Feature: Process detection process Claude (libproc/kqueue).
5. Setup auto de hooks Claude (Modification automatique de `~/.claude/settings.json`).
6. Mapping des événements `PreToolUse`, `Notification`, `PreCompact` vers schéma AutoSnitch.

**Done when:** session réelle Claude visible end-to-end dans TUI (y compris transitions Thinking → Tool call → Idle).

## Phase 3 — Multi-tool adapters & Rust Native Addon (Weeks 5–7)

1. Gemini CLI adapter (JSON Settings hooks + file watcher chokidar sur les outputs).
2. Codex adapter (TUI logs `~/.codex/log` watcher + Process discovery).
3. Goose adapter (Connexion via WebSocket local OpenAPI de goosed ou fallback SQLite dbs).
4. Copilot CLI & OpenCode adapters.
5. Implémentation du module Rust napi-rs (`@autosnitch/native`) remplaçant les appels process couteux (wrapping nix:pty pour PTY générique complet, fsevent rust bind via notify, sysinfo kqueue binds). 

**Done when:** 3+ tools simultanés monitorés correctement en live et différenciés dans le flux CloudEvents.

## Phase 4 — Client SDK SDK, CESP bridge & TUI polish (Weeks 8–9)

1. Finition du TUI avec filtres avancés (ex: CLI args `--tool=claude --type=agent.coding`) et UX stable.
2. `@autosnitch/client` - SDK client TypeScript natif pour consommateurs externes, gérant l'auto-reconnect WS et le parsing Zod.
3. Compatibilité avec l'écosystème PeonPing (Utility CESP map vers les soundpacks existants).
4. Pipeline CI/CD Tests: Vitest intégré, log rotation avec `pino-roll`, mock E2E WS.

**Done when:** TUI intégrable en usage quasi-quotidien "always-on" et SDK Client validé via tests.

## Phase 5 — Packaging & launch (Weeks 10–11)

1. Publication GitHub Actions (création prebuilds native-darwin-arm64, etc.) et publication npm (`autosnitch`).
2. Création et publication du gestionnaire `Homebrew tap: brew tap autosnitch/autosnitch`.
3. Scaffold formel pour dev d'adapters communautaires (`create-autosnitch-adapter`).
4. Guides public architecture privacy & security posture.

**Done when:** un utilisateur externe peut installer avec `npm i -g autosnitch` et monitorer en <2 min sans node-gyp build error.
