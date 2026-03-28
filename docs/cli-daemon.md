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

This is not event persistence. It is only bootstrap state for process supervision and re-attachment.

## Dashboard vs daemon mode

Interactive `start` now behaves like an operator dashboard instead of a fragile foreground bootstrap. The Ink TUI always opens, even when the daemon is stopped. The header shows whether the daemon is active, the current PID when it exists, and the exact `ws://127.0.0.1:<port>` URL ready to copy into another consumer.

Inside that dashboard:

- `d` toggles the daemon on or off
- `r` refreshes daemon state immediately
- the event stream stays mounted even while the daemon is offline

Detached `start --daemon` still exists for scripts, launchd, and explicit headless startup. It re-executes the CLI in a hidden headless mode, writes PID/state files after the pipeline is healthy, and redirects logs to `daemon.log`.

`wrap` is different: it launches a child tool inside a PTY. If a daemon is already running, wrapped events go to that daemon over UDS. If not, AISnitch starts a temporary isolated local pipeline for that wrapped process only.

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
