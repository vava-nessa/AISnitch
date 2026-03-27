# CLI & Daemon

## Purpose

The CLI is now the operational entrypoint for AISnitch. It turns the in-memory core pipeline into something you can actually start, stop, inspect, and re-attach to without having to write ad hoc scripts around the library API.

## Implemented command surface

The current commander-based CLI exposes:

- `start` as the default command
- `start --daemon` for detached background execution
- `stop` to terminate the detached daemon through its PID file
- `status` to inspect persisted daemon metadata plus live `/health` data
- `adapters` to list currently configured adapter toggles
- `setup <tool>` to configure supported external tools for AISnitch ingestion
- `attach` to connect to the daemon WebSocket stream with a lightweight text monitor
- `install` and `uninstall` for macOS LaunchAgent management

The shared `--config <path>` option is supported across the runtime commands. When it is used, AISnitch derives its home directory from that config file location so `config.json`, `aisnitch.pid`, `daemon-state.json`, `daemon.log`, and `aisnitch.sock` all stay in the same area.

## Runtime files

The CLI persists a small amount of daemon state alongside the config directory:

- `aisnitch.pid` stores the detached daemon PID
- `daemon-state.json` stores the effective ports and socket path after startup
- `daemon.log` receives daemon stdout/stderr

This is not event persistence. It is only bootstrap state for process supervision and re-attachment.

## Foreground vs daemon mode

Foreground `start` launches the core pipeline in-process and attaches a temporary live monitor directly to the `EventBus`. This gives a usable operator workflow now without blocking on the future Ink TUI task.

Detached `start --daemon` re-executes the CLI in a hidden headless mode, writes PID/state files after the pipeline is healthy, and redirects logs to `daemon.log`. `attach` then connects through the daemon WebSocket endpoint and renders incoming events line by line.

## Tool setup flow

`setup <tool>` is interactive and intentionally conservative:

1. Detect the target tool from PATH and/or its config directory.
2. Load the current tool configuration or plugin file.
3. Render a colored before/after diff.
4. Ask for confirmation.
5. Write the change and keep a `.bak` backup when an original file existed.

For Claude Code, AISnitch merges HTTP hooks into `~/.claude/settings.json` without deleting unrelated user hooks. For OpenCode, AISnitch installs a local plugin at `~/.config/opencode/plugins/aisnitch.ts`, which is the officially supported auto-loaded extension path according to the current OpenCode docs.

## macOS LaunchAgent integration

`install` writes `~/Library/LaunchAgents/com.aisnitch.daemon.plist` and uses `launchctl bootstrap` / `bootout`, which are the recommended modern replacements for the older `load` / `unload` workflow on current macOS systems. The plist runs the CLI through the current Node executable with `start --daemon` and reuses the same log file path as manual daemon launches.

## Current limitation

The full Ink-based terminal UI is still pending in `05-tui`. For now, `start` and `attach` intentionally expose a simpler monitor so the daemon workflow is operational before the UI layer lands.
