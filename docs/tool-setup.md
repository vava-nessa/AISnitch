# Tool Setup

## Purpose

`aisnitch setup <tool>` exists to bridge the gap between a running AISnitch daemon and the external tools that need to emit events into it. The command is intentionally interactive because it edits user-owned config files outside this repository.

## Supported tools

The current setup command supports:

- `claude-code`
- `opencode`
- `gemini-cli`
- `aider`
- `codex`
- `goose`
- `copilot-cli`
- `openclaw`

The command also updates the AISnitch config so the selected adapter is marked `enabled` in `config.json`.

## Claude Code strategy

Research against the current Claude Code hooks reference confirms that hooks live in `~/.claude/settings.json` and support HTTP handlers where the hook payload is delivered as the POST body.

AISnitch writes one HTTP hook group per supported Claude Code event and points each one at:

`http://localhost:<httpPort>/hooks/claude-code`

The implementation keeps existing user hooks in place and only appends the AISnitch HTTP handler when it is missing. It also upgrades the matching AISnitch hook to `async: true` if the URL already exists with a non-async form.

## OpenCode strategy

Research against the current OpenCode docs shows that local plugins placed in `~/.config/opencode/plugins/` are auto-loaded at startup. That is the cleanest setup path for AISnitch because it avoids inventing unsupported config fields in `opencode.jsonc`.

AISnitch therefore installs a local plugin file:

- `~/.config/opencode/plugins/aisnitch.ts`

The generated plugin forwards a curated subset of OpenCode events to:

`http://localhost:<httpPort>/hooks/opencode`

The plugin is dependency-free and relies on the built-in plugin runtime plus `fetch`.

## Gemini CLI strategy

AISnitch augments `~/.gemini/settings.json` with wildcard command hooks for the supported Gemini lifecycle events. Each generated hook forwards the raw stdin payload to `http://localhost:<httpPort>/hooks/gemini-cli` with `curl`, which keeps Gemini setup simple and makes the adapter mapping logic live entirely inside AISnitch.

## Aider strategy

Aider does not expose a native hook system comparable to Claude Code or Gemini, but it does support `notifications-command`. AISnitch uses that instead of trying to patch Aider internals.

`aisnitch setup aider` updates:

- `~/.aider.conf.yml`

It ensures:

- `notifications: true`
- `notifications-command: "<node> <aisnitch-cli> aider-notify ..."`

The generated command is intentionally tiny. It posts a normalized `agent.idle` hint back into AISnitch whenever Aider announces that it is waiting for the operator again, while the dedicated Aider adapter continues to parse `.aider.chat.history.md` for richer transcript activity.

## Passive-arm setup flows

Some tools do not need file mutation for the MVP:

- `aisnitch setup codex` enables passive `codex-tui.log` watching
- `aisnitch setup goose` enables passive `goosed` / SQLite discovery

These setup flows still matter because they flip the adapter toggle in `~/.aisnitch/config.json`, which keeps the runtime consistent with the rest of the command surface.

## Copilot CLI strategy

Copilot CLI is repository-scoped rather than machine-global. AISnitch therefore installs:

- `.github/hooks/aisnitch.json`
- `.github/hooks/scripts/aisnitch-forward.mjs`

That bridge forwards the documented Copilot CLI hook payloads to `http://localhost:<httpPort>/hooks/copilot-cli` and leaves unrelated repository automation intact.

## OpenClaw strategy

OpenClaw's current docs and live behavior do not expose the outbound webhook block that older community notes referenced. AISnitch therefore uses the supported path that exists today:

- enable `hooks.internal.enabled` in `~/.openclaw/openclaw.json`
- enable the built-in `command-logger` and `session-memory` entries
- install one managed hook directory at `~/.openclaw/hooks/aisnitch-forward/`

That managed hook forwards OpenClaw hook payloads to:

`http://localhost:<httpPort>/hooks/openclaw`

The resulting runtime mix is stronger than a single webhook path because AISnitch can then combine:

- managed hook events
- `~/.openclaw/logs/commands.log`
- transcript JSONL under `~/.openclaw/agents/*/sessions/*.jsonl`
- workspace memory files under `~/.openclaw/workspace*/memory/`

## Revert behavior

`aisnitch setup <tool> --revert` restores the `.bak` file when one exists. If the setup created a brand-new file without an original backup, revert removes that generated file instead.

## Current limitation

The setup layer only handles arming and bridge installation. Richer behavior such as transcript parsing, SSE/session polling, or PTY heuristics still lives in the dedicated adapters and runtime.
