# AutoSnitch

Universal AI coding activity bridge (cross-platform).

AutoSnitch is a background daemon that captures activity from multiple AI coding tools (Claude Code, Codex, Gemini CLI, Aider, Goose, Copilot CLI, etc.), normalizes events into a single schema, and exposes a real-time stream that consumers can subscribe to.

## Current project docs

- Product Requirements Document (MVP): `tasks/prd-autosnitch-mvp/index.md`
- Research source used for PRD: `CLAUDE_DATA.md`

## Research sources for AI contributors

- Allowed external research: **Brave Search**, **Context7/Context8**, **Exa.ai**
- Mandatory internal source: **`@CLAUDE_DATA.md`** (primary, inestimable)
- Rule: consult `@CLAUDE_DATA.md` first, then use external search to validate or update details.

## Planned output shape

- **Core output:** normalized event stream over WebSocket (`ws://localhost:4820`)
- **Data handling:** live in-memory transit only (no persistence)
- **Operations:** CLI commands (`start`, `stop`, `status`, `install`, adapter setup)
- **Primary MVP consumer:** live TUI monitor
