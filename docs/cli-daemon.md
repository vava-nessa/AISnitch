# CLI & Daemon

## Purpose

The CLI is now the operational entrypoint for AISnitch. It turns the in-memory core pipeline into something you can actually start, stop, inspect, re-attach to, and even temporarily inject around a wrapped tool without writing ad hoc scripts around the library API.

## Implemented command surface

The current commander-based CLI exposes:

- `start` as the default PM2-style dashboard command
- `start --daemon` for detached background execution
- `stop` to terminate the detached daemon through its PID file
- `status` to inspect persisted daemon metadata plus live `/health` data
- `adapters` to list currently configured adapter toggles
- `setup <tool>` to configure supported external tools for AISnitch ingestion
- `attach` to open the same dashboard and connect to the daemon stream when it is active
- `fs` / `fullscreen` to serve the fullscreen web dashboard and open it in a browser
- `logger` to stream exhaustive live event output without the TUI
- `wrap <command> [args...]` to observe an arbitrary interactive tool through the generic PTY fallback
- `install` and `uninstall` for macOS LaunchAgent management

There is also one internal command used by the Aider setup flow:

- `aider-notify`, which is called by Aider's `notifications-command` and forwards a normalized idle hint back into AISnitch

The shared `--config <path>` option is supported across the runtime commands. When it is used, AISnitch derives its home directory from that config file location so `config.json`, `aisnitch.pid`, `daemon-state.json`, `daemon.log`, and `aisnitch.sock` all stay in the same area. Without `--config`, the same commands now consistently honor `AISNITCH_HOME`, which is useful for tests, demos, and isolated local sandboxes.

## Runtime files

The CLI persists a small amount of daemon state alongside the config directory:

- `aisnitch.pid` stores the detached daemon PID
- `daemon-state.json` stores the effective ports and socket path after startup
- `daemon.log` receives daemon stdout/stderr
- `auto-update.json` stores the last silent self-update check metadata
- `auto-update.log` stores the last detached self-update worker output

This is not event persistence. It is only bootstrap state for process supervision and re-attachment.

## Dashboard vs daemon mode

Interactive `start` now behaves like an operator dashboard instead of a fragile foreground bootstrap. The Ink TUI always opens, even when the daemon is stopped. The header shows whether the daemon is active, the current PID when it exists, and the exact `ws://127.0.0.1:<port>` URL ready to copy into another consumer.

Right before that dashboard opens, AISnitch now performs a silent background self-update check on every launch for supported global installs. The updater resolves the install source automatically and then delegates to `npm`, `pnpm`, `bun`, or `brew` in a detached worker without blocking the TUI.

Inside that dashboard:

- `d` toggles the daemon on or off
- `r` refreshes daemon state immediately
- the event stream stays mounted even while the daemon is offline

Detached `start --daemon` still exists for scripts, launchd, and explicit headless startup. It re-executes the CLI in a hidden headless mode, writes PID/state files after the pipeline is healthy, and redirects logs to `daemon.log`.

If startup fails before the daemon becomes healthy, the CLI now reads back the last daemon log line and surfaces that precise error to the caller. This avoids the old behavior where a real boot failure such as port exhaustion was masked by a vague readiness timeout. Port probing also searches a wider fallback range now, so stale local AISnitch listeners are less likely to brick a fresh daemon start immediately.

`wrap` is different: it launches a child tool inside a PTY. If a daemon is already running, wrapped events go to that daemon over UDS. If not, AISnitch starts a temporary isolated local pipeline for that wrapped process only.

## Fullscreen dashboard server

`aisnitch fs` starts a small child Node process that imports Vite and serves the built dashboard from `examples/fullscreen-dashboard/dist`. The runtime first checks the daemon state, optionally starts it with `--daemon`, waits for the HTTP health endpoint, then opens `http://127.0.0.1:<dashboard-port>` unless `--no-browser` is used.

The child process deliberately resolves the Node executable defensively. When package managers such as Homebrew upgrade Node, a long-lived global CLI can still have `process.execPath` pointing at an old Cellar path that has already been removed. In that case AISnitch falls back to `node` from `PATH` and always listens for the child process `error` event, so spawn failures become actionable CLI errors instead of hard unhandled crashes.

## Raw logger mode

`logger` is the operator path when the dashboard is too compact and you want every field the pipeline emits. It attaches to the running daemon over WebSocket and prints one event block at a time with every nested field flattened onto its own line, including `data.raw.*`.

Example:

```bash
aisnitch logger
aisnitch logger --tool claude-code
aisnitch logger --type agent.streaming
```

This mode is deliberately non-interactive and non-truncating. It is designed for tailing, `grep`, shell pipes, and debugging payload richness without touching the TUI.

## Tool setup flow

`setup <tool>` is interactive and intentionally conservative:

1. Detect the target tool from PATH and/or its config directory.
2. Load the current tool configuration or plugin file.
3. Render a colored before/after diff.
4. Ask for confirmation.
5. Write the change and keep a `.bak` backup when an original file existed.

For Claude Code, AISnitch merges HTTP hooks into `~/.claude/settings.json` without deleting unrelated user hooks. For OpenCode, AISnitch installs a local plugin at `~/.config/opencode/plugins/aisnitch.ts`, which is the officially supported auto-loaded extension path according to the current OpenCode docs.

These setup flows now feed concrete built-in adapters in the runtime, not placeholder endpoints. Claude Code, OpenCode, Gemini, Copilot CLI, and Aider all forward into dedicated adapters before reaching the shared event pipeline, while Goose and Codex are armed as passive sources from config.

## macOS LaunchAgent integration

`install` writes `~/Library/LaunchAgents/com.aisnitch.daemon.plist` and uses `launchctl bootstrap` / `bootout`, which are the recommended modern replacements for the older `load` / `unload` workflow on current macOS systems. The plist runs the CLI through the current Node executable with `start --daemon` and reuses the same log file path as manual daemon launches.

## Current limitation

`wrap` is intentionally best-effort. It captures useful live states from terminal heuristics, but unlike dedicated adapters it does not have a stable tool-native protocol to rely on.
