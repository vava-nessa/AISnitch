# Tool Setup

## Purpose

`aisnitch setup <tool>` exists to bridge the gap between a running AISnitch daemon and the external tools that need to emit events into it. The command is intentionally interactive because it edits user-owned config files outside this repository.

## Supported tools

The current setup command supports:

- `claude-code`
- `opencode`

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

## Revert behavior

`aisnitch setup <tool> --revert` restores the `.bak` file when one exists. If the setup created a brand-new file without an original backup, revert removes that generated file instead.

## Current limitation

The OpenCode plugin currently performs best-effort event mapping into the shared AISnitch event envelope. Richer per-event normalization still belongs to the dedicated adapter work in `04-adapters-priority`.
