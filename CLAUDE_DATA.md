# AutoSnitch: universal bridge for AI coding tool activity

**AutoSnitch is a cross-platform (macOS, Windows, Linux) background daemon that captures activity from every AI CLI coding tool — Claude Code, Codex, Gemini CLI, Aider, Goose, and 10+ others — and normalizes it into a single, subscribable event stream.** It is developed macOS-first but designed for full cross-platform parity. It fills a gap no existing tool addresses: universal, passive, real-time monitoring across the entire AI coding tool ecosystem. The closest precedent, PeonPing (2.7k stars), proves the adapter-per-tool pattern works but limits itself to audio notifications. AutoSnitch exposes a structured WebSocket event stream that any consumer — animated mascots, dashboards, menu bar apps, or WakaTime-style trackers — can subscribe to with zero coupling to any specific AI tool.

This PRD provides the complete technical specification for building AutoSnitch as an open-source npm package.

---

## The landscape today: Claude Code-centric and fragmented

Research across **18 existing monitoring projects** reveals a fragmented ecosystem. Roughly 80% of tools — ccboard (Rust TUI), claude-esp (Go file watcher), Aspy (Rust API proxy), Claude-Code-Agent-Monitor (Node.js hooks dashboard) — target Claude Code exclusively. Multi-tool managers like Agent Deck (Go, 1.6k stars) and Claude Squad (Go, 6k+ stars) require you to launch agents *through them*. No tool acts as a passive, universal observer that works with however you already launch your AI tools.

The three dominant interception patterns found in the wild are:

- **Hook-based event capture** (used by ccboard, Claude-Code-Agent-Monitor, wez-sidebar): Registers shell commands or HTTP endpoints in tool configuration files. Claude Code exposes **21 lifecycle events** (SessionStart, PreToolUse, PostToolUse, Stop, Notification, etc.). Cursor added hooks in v1.7 (October 2025). GitHub Copilot CLI supports hooks in `.github/copilot-hooks.json`. This is the richest data source.
- **JSONL file watching** (used by claude-esp, ccusage, VibeCodingTracker): Reads local transcript files that tools write anyway — Claude Code stores JSONL in `~/.claude/projects/`, Goose uses SQLite at `~/.config/goose/sessions.db`, OpenCode stores structured data at `~/.local/share/opencode/`. Zero intrusion, but limited to tools with parseable local storage.
- **Process tree detection + PTY wrapping** (used by asciinema, tmux-based tools): Discovers running AI tool processes via `libproc`/`sysctl`, optionally wraps them in pseudo-terminals for full I/O capture. Works with *any* CLI tool but produces raw terminal output requiring ANSI parsing.

AutoSnitch combines all three into a tiered architecture that maximizes data richness while gracefully degrading for tools without hook APIs.

## PeonPing deep-dive reveals the adapter pattern at scale

PeonPing's codebase is primarily **bash + embedded Python**, deployed into `~/.claude/hooks/peon-ping/`. Despite its shell-heavy architecture, it demonstrates a proven adapter pattern across **15+ tool integrations**: Claude Code, Codex, GitHub Copilot, Cursor, Gemini CLI, Amp, Kiro, Windsurf, OpenCode, Kilo, OpenClaw, Rovo Dev, and others.

PeonPing uses three interception strategies that map directly to AutoSnitch's tiered approach:

**Strategy 1 — Native hooks** (primary): For Claude Code and tools with hook APIs, PeonPing registers `peon.sh` in `~/.claude/settings.json`. The IDE invokes the script with JSON event data piped to stdin. The embedded Python block parses the JSON, maps the IDE event to a **CESP category** (Coding Event Sound Pack Specification — 6 core categories: `session.start`, `task.acknowledge`, `task.complete`, `task.error`, `input.required`, `resource.limit`), selects a sound, and plays it asynchronously.

**Strategy 2 — Filesystem watching** (fallback): For Amp, Antigravity, and Kimi Code, adapter scripts use `fswatch` to watch data directories. The Amp adapter monitors `~/.local/share/amp/threads/` for JSON file changes, detects when a thread file stops updating for **1 second** (configurable via `AMP_IDLE_SECONDS`), and emits a `Stop` event if the last message was from the assistant.

**Strategy 3 — Native plugins**: For OpenCode and Kilo, PeonPing ships a TypeScript plugin (`peon-ping.ts`) that hooks directly into the IDE's event lifecycle, running within the IDE's runtime.

The key limitations AutoSnitch addresses: PeonPing spawns a **new bash process per event** (no persistent daemon), has **no structured event stream** (events are consumed and discarded after playing a sound), and performs **no actual activity monitoring** — it reacts only to discrete hook events without knowing whether an agent has been thinking for 2 minutes or is actively generating code.

## Per-tool integration specifications

Research across every major AI CLI tool reveals that **5 tools support `stream-json` NDJSON output** (Claude Code, Codex, Gemini CLI, Goose, Amp), **4 tools support lifecycle hooks** (Claude Code, Cursor, GitHub Copilot, Gemini CLI), and **all tools** write some form of local log or session data. The table below specifies the interception strategy, log paths, and detectable states for each tool.

### Tier 1: Hook-native tools (richest data, real-time events)

**Claude Code** — Config dir: `~/.claude/`. Session transcripts: `~/.claude/projects/<encoded-path>/<session-id>.jsonl`. Hook system: 21 lifecycle events configured in `~/.claude/settings.json` under `hooks` key. Handler types: `command` (shell, JSON via stdin), `http` (POST to endpoint), `prompt` (LLM evaluation), `agent` (spawn subagent). Key events for monitoring: `SessionStart`, `Stop`, `PreToolUse`/`PostToolUse` (includes tool_name like Bash/Read/Write/Edit and full tool_input/output), `Notification` (permission prompts, idle prompts), `UserPromptSubmit`, `SubagentStart`/`SubagentStop`, `PreCompact` (context overflow). SDK modes: `--output-format stream-json` produces NDJSON. TypeScript SDK: `@anthropic-ai/claude-code`. Terminal title shows status icons: ◇ (Ready), ✋ (Action Required), ✦ (Working). **Integration: HTTP hooks → daemon endpoint + JSONL file watching as backup.**

**Gemini CLI** — Config dir: `~/.gemini/`. Settings: `~/.gemini/settings.json`. Hooks system: `BeforeAgent`, `AfterAgent`, before/after tool selection. Stream JSON: `--output-format stream-json` for event-by-event NDJSON. MCP: Full support, configured in settings.json. Terminal title updates. Open source TypeScript, 99k+ GitHub stars. **Integration: Hooks + stream-json + file watching.**

**GitHub Copilot CLI** — Config dir: `~/.copilot/` (overridable via `COPILOT_HOME`). Session data: `~/.copilot/session-state/`. Hooks: `preToolUse` for policy enforcement in `.github/copilot-hooks.json`. Ships with GitHub's native MCP server. Supports autopilot mode, `/fleet` multi-agent orchestration. Closed source. **Integration: Hooks + session file watching.**

**Cursor CLI** — Shares rules system with IDE (`.cursor/rules`). Logs: `~/Library/Application Support/Cursor/`. Supports `--output-format json` in print mode. MCP via `.cursor/mcp.json`. Background execution support. Closed source. **Integration: Output format JSON + process detection + file watching.**

### Tier 2: Structured output tools (parseable, but require wrapping)

**Codex CLI (OpenAI)** — Config dir: `~/.codex/`. Logs: `~/.codex/log/codex-tui.log`. Key feature: `codex exec --json` outputs NDJSON state change events. MCP server mode: `codex mcp`. Open source Rust (Apache 2.0). **Integration: Wrap with `--json` flag or watch log directory.**

**Goose (Block)** — Config dir: `~/.config/goose/`. Sessions: SQLite database (`sessions.db`). `goosed` HTTP/WebSocket API server with OpenAPI spec at `localhost:8080/api-docs`. Stream JSON: `--output-format stream-json`. Core architecture built on MCP. Open source Rust. **Integration: Connect to goosed WebSocket API or watch SQLite DB.**

**Amp (Sourcegraph)** — Config dir: `~/.config/amp/`. Threads stored server-side (cloud-synced to ampcode.com, not local). Stream JSON: `--stream-json` outputs SystemMessage, AssistantMessage, ToolResult events. Closed source TypeScript. **Integration: Stream JSON capture or filesystem watching of `~/.local/share/amp/threads/` (per PeonPing pattern).**

**OpenCode** — Data: `~/.local/share/opencode/` (logs, SQLite DB `opencode.db` with WAL mode, message JSON files). Config: `~/.config/opencode/opencode.jsonc`. Plugins: `~/.config/opencode/plugins/`. ACP server mode: `opencode acp` (stdin/stdout nd-JSON). OpenTelemetry plugin exports metrics/traces. Stream JSON: `-f stream-json`. Open source (MIT). **Integration: ACP protocol, SQLite DB watching, or plugin system.**

**Cline CLI** — JSON streaming: `--json` flag. ACP mode: `--acp` for editor integration. Pipe stdin/stdout support. VS Code extension data: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/`. Open source (Apache 2.0). **Integration: JSON streaming or ACP protocol.**

### Tier 3: Log-only tools (file watching required)

**Aider** — Per-project logs: `.aider.chat.history.md` (markdown chat log), `.aider.input.history`, optional `--llm-history-file`. No centralized config directory. Python-based with programmatic API (`Coder.create()`). No hooks, no MCP, no structured output. `--notifications-command` can trigger external commands. **Integration: Watch `.aider.chat.history.md` per project + `--notifications-command` hook.**

**Continue.dev CLI** — Logs: `~/.continue/logs/cn.log` (with `--verbose`). Config: `~/.continue/config.yaml`. Data pipeline: configurable event destinations (file or HTTP). Recently added hooks system. MCP support. **Integration: Data pipeline → file destination + hooks.**

### Tier 4: Process detection only (minimal data)

**Windsurf/Codeium** — IDE-only (no standalone CLI agent). Logs: `~/Library/Application Support/Windsurf/`. No external API. **Integration: Process detection only; low priority.**

**Qwen Code** — Fork of Gemini CLI, inherits its architecture. Config: `~/.qwen/settings.json`. **Integration: Same as Gemini CLI.**

**OpenHands** — Event stream architecture with typed events. REST API + WebSocket. Python SDK. Docker-sandboxed. **Integration: REST/WebSocket API if running locally.**

## Interception techniques: a layered cross-platform approach (macOS-first)

### PTY wrapping for universal I/O capture

Pseudo-terminals provide the most universal interception mechanism. The `forkpty()` system call creates a master/slave pair; the child process runs in the slave PTY with stdin/stdout/stderr connected, while the parent reads all output from the master fd. This is how `script`, `expect`, and `asciinema` work.

**`node-pty`** (npm, by Microsoft, powers VS Code's terminal) is the primary Node.js library. Use **`@lydell/node-pty`** instead — it ships platform-split prebuilt binaries via `optionalDependencies` (<1MB vs 60MB), eliminating node-gyp compilation. Key API: `pty.spawn(command, args, options)` returns an object with `onData(callback)` for output interception and `write(data)` for input injection. Handles `SIGWINCH` resize. Not thread-safe.

For Rust, the `nix` crate provides safe wrappers for `openpty()` and `forkpty()` via `nix::pty`, plus the `portable-pty` crate for cross-platform PTY handling including Windows ConPTY.

**Performance is negligible** — data passes through the kernel's tty layer, adding only one extra buffer copy. The main engineering challenge is **ANSI escape code parsing**. Use `strip-ansi` (npm, 10k+ dependents) for stripping or `node-ansiparser` for full DEC ANSI state machine parsing. Key patterns to detect: spinner animations (repeated `\r` with changing braille/pipe characters), progress bars (`\d+%`), prompt waiting (no output + prompt characters like `$>?:`), and errors (ANSI red `\x1b[31m` + "Error:"/"FAILED").

### Process monitoring via kqueue

macOS's `kqueue` with `EVFILT_PROC` provides kernel-level process lifecycle notifications without polling:

```c
EV_SET(&kev, target_pid, EVFILT_PROC, EV_ADD, NOTE_EXIT | NOTE_FORK | NOTE_EXEC, 0, NULL);
```

This fires instantly on process creation (`NOTE_EXEC`), fork (`NOTE_FORK`), and termination (`NOTE_EXIT`). No special permissions needed for monitoring your own processes. For process enumeration, `libproc.h` provides `proc_listpids()`, `proc_pidpath()`, and `proc_pidinfo()` — these power `ps` and `lsof` under the hood.

The `sysinfo` Rust crate wraps these APIs cross-platform. In Node.js, use `child_process.execSync('ps aux')` as a quick-and-dirty fallback, or build a Rust native addon via napi-rs for proper `libproc` bindings.

### File system watching via FSEvents

FSEvents is macOS's native directory-level change notification API. **Chokidar v5** (November 2025, ESM-only, Node 20+) wraps FSEvents on macOS with a high-level API. For Rust, the `notify` crate (v7) uses FSEvents as its macOS backend.

For watching log files (tail -f equivalent): use `kqueue` `EVFILT_VNODE` with `NOTE_WRITE` on the log file fd for instant notification, then seek to new data. Handle log rotation by watching for `NOTE_DELETE`/`NOTE_RENAME` and re-opening.

### Terminal integration

**tmux `pipe-pane`** streams pane output to external commands in real-time: `tmux pipe-pane -o 'cat >> ~/session.log'`. Only one pipe per pane. **iTerm2's Python API** provides `session.get_screen_streamer()` for real-time content monitoring and `PromptMonitor` for command lifecycle tracking. **Kitty** exposes a JSON-based remote control protocol over Unix sockets (`kitten @ get-text --match id:N`).

### Recommended daemon deployment (macOS, Windows, Linux)

On macOS, deploy as a **user-level LaunchAgent** at `~/Library/LaunchAgents/com.autosnitch.daemon.plist` with `KeepAlive: true` (auto-restart on crash), `RunAtLoad: true` (start on login), and `ThrottleInterval: 5` (prevent restart storms). On Windows, use a Windows Service or Startup Task. On Linux, use a `systemd` user unit. User-level deployments require no root access and run in user context with access to all tool configuration files.

## Architecture: the three-layer event pipeline

AutoSnitch uses a hybrid IPC architecture optimized for different communication patterns:

```
┌────────────────────────────────────────────────────────────────┐
│                    AutoSnitch Daemon Process                    │
│                                                                │
│  ┌─────────────────┐      ┌────────────────────────────────┐  │
│  │ In-Process       │      │      Core Event Bus            │  │
│  │ Adapters         │─────▶│      (eventemitter3)            │  │
│  │ • claude-code    │      │      typed events, pub/sub     │  │
│  │ • codex          │      └──────┬──────────┬─────────────┘  │
│  │ • gemini-cli     │             │          │                │
│  │ • aider          │      ┌──────▼──────┐ ┌─▼─────────────┐ │
│  │ • goose          │      │ SQLite Store │ │ WebSocket     │ │
│  │ • copilot-cli    │      │ (WAL mode)   │ │ Server (ws)   │ │
│  └─────────────────┘      │ 7-day buffer │ │ localhost:4820 │ │
│                            └─────────────┘ └───────┬────────┘ │
│  ┌─────────────────┐                               │          │
│  │ UDS Server       │◀── Out-of-process adapters    │          │
│  │ (net module)     │    (community/3rd party)      │          │
│  └─────────────────┘                               │          │
│                                                     │          │
│  ┌─────────────────┐                               │          │
│  │ HTTP Endpoint    │◀── Tool hooks POST here       │          │
│  │ localhost:4821   │    (Claude Code http hooks)    │          │
│  └─────────────────┘                               │          │
└─────────────────────────────────────────────────────┼──────────┘
                                                      │
                                           ┌──────────▼──────────┐
                                           │ External Consumers   │
                                           │ • Animated mascot    │
                                           │ • Menu bar app       │
                                           │ • TUI dashboard      │
                                           │ • PeonPing (CESP)    │
                                           └─────────────────────┘
```

**Layer 1 — In-process EventEmitter** (`eventemitter3`): All adapters running inside the daemon publish typed events to the core event bus. EventEmitter3 benchmarks faster than Node.js's built-in EventEmitter, has zero dependencies at ~4KB, and supports typed events via generics. This handles Claude Code file watchers, process monitors, and hook HTTP receivers.

**Layer 2 — Unix Domain Socket server** (Node.js `net` module): For out-of-process or community-contributed adapters. UDS delivers **50% lower latency** than TCP loopback with zero port conflicts. Socket at `~/.autosnitch/autosnitch.sock`. Protocol: newline-delimited JSON (NDJSON) since UDS is stream-oriented.

**Layer 3 — WebSocket server** (`ws` npm): The external consumer API at `ws://localhost:4820`. Any browser, Electron app, or CLI tool connects trivially. Per benchmarks, `ws` handles ~8,200 ops/sec for complex JSON — more than sufficient for expected load of ~100 events/minute. `uWebSockets.js` (17k ops/sec) is a future upgrade path. Implements a **per-consumer ring buffer** (1,000 events) with backpressure detection via `ws.bufferedAmount`.

**HTTP endpoint** (lightweight Express/Fastify): Receives POST requests from tool hooks. Claude Code's `http` hook type can fire-and-forget POST JSON to `http://localhost:4821/hooks/claude-code`. This eliminates the need for shell script hooks entirely.

### SQLite event store

**`better-sqlite3`** with WAL mode enables concurrent readers during writes — critical when adapters write while consumers query. Configuration: `journal_mode = WAL`, `synchronous = NORMAL` (corruption-safe in WAL, significantly faster than FULL), `cache_size = -32768` (32MB), `mmap_size = 268435456` (256MB).

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,          -- UUIDv7 (time-sortable)
  type TEXT NOT NULL,           -- 'agent.coding', 'task.complete', etc.
  tool TEXT NOT NULL,           -- 'claude-code', 'codex', etc.
  session_id TEXT NOT NULL,
  seq_num INTEGER NOT NULL,
  timestamp_unix REAL NOT NULL,
  data JSON NOT NULL,
  cesp_category TEXT
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  project_path TEXT,
  started_at TEXT NOT NULL,
  state TEXT DEFAULT 'active'   -- 'active' | 'idle' | 'ended'
);
```

Cleanup: `DELETE FROM events WHERE timestamp_unix < unixepoch() - 604800` (7-day retention) every 6 hours. WAL checkpoint (`PRAGMA wal_checkpoint(PASSIVE)`) every 5 minutes, `TRUNCATE` on graceful shutdown.

## Universal event schema: CloudEvents envelope with CESP compatibility

The event schema uses a **CloudEvents v1.0 envelope** for interoperability while maintaining backward compatibility with PeonPing's CESP categories. Every event from every tool maps to one of **12 normalized event types**:

```typescript
interface AutoSnitchEvent {
  // CloudEvents core
  specversion: '1.0';
  id: string;                         // UUIDv7
  source: string;                     // "autosnitch://adapters/claude-code"
  type: AutoSnitchEventType;
  time: string;                       // ISO 8601
  
  // AutoSnitch extensions
  'autosnitch.tool': ToolName;
  'autosnitch.sessionid': string;
  'autosnitch.seqnum': number;
  
  data: {
    state: AutoSnitchEventType;
    project?: string;
    projectPath?: string;
    duration?: number;                // ms
    toolName?: string;                // "Read", "Write", "Bash", etc.
    toolInput?: { filePath?: string; command?: string; };
    activeFile?: string;
    model?: string;
    tokensUsed?: number;
    errorMessage?: string;
    errorType?: 'rate_limit' | 'context_overflow' | 'tool_failure' | 'api_error';
    raw?: Record<string, unknown>;    // Original event passthrough
  };
}
```

**Event types and their CESP mappings:**

| AutoSnitch Event | Description | CESP Category | Mascot Behavior |
|---|---|---|---|
| `session.start` | Tool session begins | `session.start` | Wake up, stretch |
| `session.end` | Tool session closes | `session.end` | Wave goodbye |
| `task.start` | User submits prompt | `task.acknowledge` | Nod, get ready |
| `task.complete` | Agent finishes response | `task.complete` | Celebrate |
| `agent.thinking` | Agent reasoning/planning | — | Scratch head |
| `agent.coding` | Agent writing/editing code | — | Type furiously |
| `agent.tool_call` | Agent invoked a tool | — | Use specific tool |
| `agent.streaming` | Agent streaming text | — | Talk/gesture |
| `agent.asking_user` | Waiting for user input | `input.required` | Tap shoulder |
| `agent.idle` | No activity | — | Sleep/doze |
| `agent.error` | Error occurred | `task.error` | Facepalm |
| `agent.compact` | Context compaction | `resource.limit` | Squeeze brain |

The state machine transitions: `session.start → agent.idle → task.start → agent.thinking → agent.coding ↔ agent.tool_call → task.complete → agent.idle`. Any state can transition to `agent.error` or `session.end`. `agent.asking_user` interrupts any active state and resumes on user response.

## Recommended tech stack: TypeScript + Rust hybrid

### Why hybrid over pure Node.js or pure Rust

The analysis of 18 competing projects shows **Go dominates** (Agent Deck, Claude Squad, claude-esp use Bubbletea), **Rust is gaining** (Aspy, ccboard, Codex CLI, Goose), and **TypeScript remains the ecosystem standard** for npm packages. The hybrid approach optimizes for the developer's existing macOS-first expertise while ensuring full compatibility with Windows (ConPTY) and Linux, leveraging Rust for system-level operations:

- **TypeScript** (~70% of code): CLI interface, adapter logic, event schema/validation (Zod), WebSocket server, SQLite store, daemon lifecycle. Matches the developer's primary expertise. npm distribution is trivial.
- **Rust native addon via napi-rs** (~30%): PTY management (replaces node-pty's C++ with safer Rust), process monitoring (wraps `libproc`), and optionally file watching (wraps FSEvents via `notify` crate). Ships as platform-specific prebuilt binaries — **no node-gyp for end users**.

The napi-rs distribution pattern generates platform packages (`@autosnitch/native-darwin-arm64`, `@autosnitch/native-win32-x64`, etc.) as `optionalDependencies`, so npm downloads only the relevant ~2MB binary.

### Core libraries

| Library | Version | Purpose |
|---|---|---|
| `commander` | 13.x | CLI framework (18ms startup, zero deps, 500M+/week downloads) |
| `ws` | 8.x | WebSocket server (zero deps, battle-tested) |
| `better-sqlite3` | 12.x | SQLite with WAL mode (synchronous API, 2000+ queries/sec) |
| `eventemitter3` | 5.x | In-process event bus (fastest Node.js EventEmitter) |
| `chokidar` | 5.x | File watching (ESM-only, uses FSEvents on macOS) |
| `zod` | 3.x | Runtime schema validation with TypeScript inference |
| `pino` | 9.x | Structured JSON logging |
| `tsup` | 8.x | Build/bundle (esbuild-powered, outputs CJS+ESM+DTS) |
| `vitest` | 4.x | Testing (fast, native TypeScript support) |
| `@lydell/node-pty` | 1.2.x | PTY wrapping (prebuilt binaries, <1MB; replaced by Rust addon in Phase 3) |

### Monorepo structure with pnpm + Turborepo

```
autosnitch/
├── pnpm-workspace.yaml
├── turbo.json
├── packages/
│   ├── core/                    # @autosnitch/core
│   │   └── src/
│   │       ├── events/          # Zod schemas, TypeScript types
│   │       ├── engine/          # EventBus, pipeline, state machine
│   │       └── store/           # SQLite persistence layer
│   ├── adapters/                # @autosnitch/adapters
│   │   └── src/
│   │       ├── base.ts          # BaseAdapter abstract class
│   │       ├── claude-code.ts   # Hook receiver + JSONL watcher
│   │       ├── codex.ts         # Log watcher + process detection
│   │       ├── gemini-cli.ts    # Hook receiver + file watcher
│   │       ├── aider.ts         # Chat history file watcher
│   │       ├── goose.ts         # goosed API client + SQLite watcher
│   │       ├── copilot-cli.ts   # Hook handler + session file watcher
│   │       ├── opencode.ts      # ACP protocol + SQLite watcher
│   │       └── generic-pty.ts   # PTY wrapper fallback for any tool
│   ├── native/                  # @autosnitch/native (Rust napi-rs)
│   │   ├── src/lib.rs           # PTY, process monitor, FS watch
│   │   ├── Cargo.toml
│   │   └── npm/                 # Platform-specific binary packages
│   │       ├── darwin-arm64/
│   │       └── darwin-x64/
│   ├── client/                  # @autosnitch/client
│   │   └── src/                 # WebSocket client SDK for consumers
│   └── cli/                     # autosnitch (main npm package)
│       └── src/
│           ├── commands/        # start, stop, status, install, config
│           ├── daemon.ts        # Daemon process entry point
│           └── index.ts         # CLI entry (commander)
└── docs/
```

## Five-phase development plan

### Phase 1: Core foundation (weeks 1–2)

Build the event schema, event bus, SQLite store, and daemon lifecycle. This phase produces a runnable daemon that accepts manually pushed events and streams them via WebSocket.

**Tasks:**
1. Initialize pnpm + Turborepo monorepo with packages/core, packages/cli
2. Define all Zod event schemas in `@autosnitch/core` with full TypeScript types
3. Implement `EventBus` class wrapping eventemitter3 with typed publish/subscribe
4. Implement `EventStore` with better-sqlite3 (WAL mode, 7-day retention, cleanup timer)
5. Build daemon entry point: PID file management, signal handling (SIGTERM/SIGINT), health endpoint
6. Implement WebSocket server on `ws://localhost:4820` with per-consumer ring buffer (1,000 events), backpressure detection, and replay-on-connect
7. Build CLI commands: `autosnitch start`, `stop`, `status`, `install` (generates and loads launchd plist)
8. Add HTTP hook endpoint at `localhost:4821` for receiving tool hook POST requests

**Validation:** `autosnitch start` launches daemon; manually POST a JSON event to `:4821`; connect via WebSocket and receive it; `autosnitch status` shows daemon running with 1 consumer connected.

### Phase 2: Claude Code adapter — the reference implementation (weeks 3–4)

Claude Code is the highest-priority integration: richest hook API (21 events), largest user base, most community tooling. This adapter serves as the template for all others.

**Tasks:**
1. Implement `BaseAdapter` abstract class with lifecycle methods: `start()`, `stop()`, `getStatus()`, typed `emit(event)`
2. Build `ClaudeCodeAdapter` with three detection layers:
   - **Hook receiver:** Parse incoming HTTP POST at `/hooks/claude-code` for all 21 hook event types. Map each to AutoSnitch event types (SessionStart→session.start, PostToolUse→agent.tool_call with toolName extraction, Stop→task.complete, Notification→agent.asking_user, PreCompact→agent.compact)
   - **JSONL file watcher:** Watch `~/.claude/projects/` via chokidar for new/modified `.jsonl` files. Parse appended lines for session transcript data. Extract thinking blocks, tool calls, assistant messages
   - **Process detection:** Scan process tree for `claude` processes, track PIDs, detect start/stop via kqueue EVFILT_PROC
3. Implement `autosnitch adapters list` and `autosnitch adapters enable/disable` commands
4. Build auto-configuration: `autosnitch setup claude-code` injects HTTP hooks into `~/.claude/settings.json` (POST to `http://localhost:4821/hooks/claude-code`, async: true)
5. Implement idle detection: if no events from a session for configurable timeout (default 120s), emit `agent.idle`

**Validation:** Start Claude Code, run a coding task. AutoSnitch captures session start, user prompt, thinking, tool calls (with file names), task completion, and idle transition. WebSocket consumer receives all events in real-time.

### Phase 3: Multi-tool adapters + Rust native addon (weeks 5–7)

Extend to the remaining Tier 1–3 tools. Build the Rust native addon for performance-critical operations.

**Tasks:**
1. **Gemini CLI adapter:** Hook receiver (AfterAgent→task.complete, AfterTool→agent.tool_call) + JSONL file watcher on `~/.gemini/projects/`
2. **Codex adapter:** Watch `~/.codex/log/codex-tui.log` + process detection for `codex` binary
3. **Goose adapter:** Connect to `goosed` WebSocket API if running, fall back to SQLite DB watching (`~/.config/goose/sessions.db`)
4. **Copilot CLI adapter:** Hook handler for `.github/copilot-hooks.json` events + `~/.copilot/session-state/` file watching
5. **Aider adapter:** Watch `.aider.chat.history.md` files across active projects (requires project registry or home directory scan) + leverage `--notifications-command` for hook-like behavior
6. **OpenCode adapter:** ACP protocol connection (stdin/stdout nd-JSON) or SQLite watcher on `~/.local/share/opencode/opencode.db`
7. **Generic PTY adapter:** For any unrecognized tool — wraps the process in a PTY, captures I/O, applies ANSI parsing heuristics to detect states
8. **Rust napi-rs addon (`@autosnitch/native`):** Implement `processMonitor` (wraps libproc for efficient process enumeration), `ptyManager` (wraps nix::pty for PTY fork/management), `fsWatcher` (wraps notify crate as alternative to chokidar). Set up GitHub Actions CI for cross-platform prebuild.

**Validation:** Run 3+ AI tools simultaneously. AutoSnitch correctly identifies each, emits tool-specific events, and the WebSocket stream shows interleaved events with correct tool attribution.

### Phase 4: Client SDK + CESP bridge + polish (weeks 8–9)

**Tasks:**
1. Build `@autosnitch/client` — TypeScript WebSocket client SDK with typed events, auto-reconnect, event filtering
2. Implement CESP compatibility layer: map all AutoSnitch events to CESP categories, expose `getCESPCategory(event)` utility
3. Build PeonPing bridge: optional adapter that translates AutoSnitch events → PeonPing CESP hook calls (enabling all 160+ sound packs to work with AutoSnitch)
4. Add event query API: `autosnitch events --tool=claude --type=agent.coding --last=50` queries SQLite
5. Implement session analytics: `autosnitch stats` shows per-tool activity time, event counts, daily breakdown
6. Log rotation for daemon logs (5 files × 10MB via pino-roll)
7. Comprehensive test suite: unit tests for every adapter parser, integration tests for WebSocket flow, E2E test for daemon lifecycle

### Phase 5: Distribution + community (weeks 10–11)

**Tasks:**
1. Publish to npm: `autosnitch` (CLI), `@autosnitch/core`, `@autosnitch/adapters`, `@autosnitch/client`, `@autosnitch/native` + platform packages
2. Create Homebrew tap: `brew tap autosnitch/autosnitch && brew install autosnitch`
3. Build `create-autosnitch-adapter` scaffold for community adapter development
4. Write comprehensive documentation: README with demo GIF (via VHS terminal recorder), per-tool setup guides, event schema reference, consumer API docs
5. Set up community infrastructure: GitHub Discussions, issue templates, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`
6. Launch: HN post, Reddit r/programming + r/LocalLLaMA, Twitter/X thread, Dev.to article

## Adapter implementation patterns

Each adapter implements the `BaseAdapter` interface and uses one or more interception strategies:

```typescript
abstract class BaseAdapter {
  abstract readonly name: ToolName;
  abstract readonly displayName: string;
  abstract readonly strategies: InterceptionStrategy[];
  
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract getStatus(): AdapterStatus;
  
  protected emit(event: Omit<AutoSnitchEvent, 'id' | 'time' | 'specversion'>): void {
    this.eventBus.publish({
      ...event,
      id: uuidv7(),
      time: new Date().toISOString(),
      specversion: '1.0',
    });
  }
}

type InterceptionStrategy = 
  | 'hooks'           // Native hook API (HTTP POST receiver)
  | 'jsonl-watch'     // Watch JSONL/JSON log files
  | 'sqlite-watch'    // Watch SQLite database changes
  | 'stream-json'     // Parse NDJSON from tool's stdout
  | 'process-detect'  // Scan process tree for known binaries
  | 'pty-wrap'        // Wrap tool in PTY for I/O capture
  | 'api-client';     // Connect to tool's HTTP/WebSocket API
```

**Hook receiver pattern** (Claude Code, Gemini CLI, Copilot CLI):
```typescript
// fastify route handler
fastify.post('/hooks/:tool', async (req) => {
  const { tool } = req.params;
  const adapter = this.adapters.get(tool);
  adapter.handleHook(req.body); // Parses JSON, maps to AutoSnitchEvent, emits
});
```

**JSONL watcher pattern** (Claude Code, Codex, Gemini CLI):
```typescript
const watcher = chokidar.watch('~/.claude/projects/**/*.jsonl', {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 200 }
});
watcher.on('change', (path) => {
  const newLines = readNewLines(path, this.fileOffsets.get(path) ?? 0);
  newLines.forEach(line => this.parseAndEmit(JSON.parse(line)));
});
```

**Process detection pattern** (universal fallback):
```typescript
// Poll every 5 seconds (or use kqueue for instant notification)
const KNOWN_BINARIES = ['claude', 'codex', 'gemini', 'aider', 'goose', 'amp'];
const processes = await nativeAddon.listProcesses(); // Rust libproc wrapper
const aiProcesses = processes.filter(p => 
  KNOWN_BINARIES.some(bin => p.name.includes(bin))
);
```

## How the mascot consumer connects

The animated mascot (the primary consumer) connects via WebSocket and filters for state-change events:

```typescript
import { AutoSnitchClient } from '@autosnitch/client';

const client = new AutoSnitchClient('ws://localhost:4820');

client.on('event', (event) => {
  switch (event.type) {
    case 'agent.thinking':  mascot.scratchHead(); break;
    case 'agent.coding':    mascot.typeKeyboard(); break;
    case 'agent.tool_call': mascot.useTool(event.data.toolName); break;
    case 'agent.asking_user': mascot.tapShoulder(); break;
    case 'agent.idle':      mascot.sleep(); break;
    case 'agent.error':     mascot.facepalm(); break;
    case 'task.complete':   mascot.celebrate(); break;
  }
});
```

## Open-source strategy and differentiation

**License: MIT** — maximizes adoption, matches the npm ecosystem norm (commander, ws, chokidar, better-sqlite3 all use MIT).

**Key differentiator:** No existing tool provides (1) universal multi-tool monitoring (most focus on Claude Code only), (2) a unified event stream across different AI CLI tools, (3) a passive background bridge that normalizes events from all tools into one format, and (4) a subscribable "activity feed" concept analogous to a GitHub activity feed but for local AI coding sessions.

The closest competitors are **session orchestrators** (Agent Deck, Claude Squad, Superset) that require launching agents through them. AutoSnitch's strategic position is as a **passive observer** that works with however you already launch your tools — in any terminal, tmux session, or IDE terminal.

**CESP compatibility** enables AutoSnitch to integrate with PeonPing's ecosystem of 160+ community sound packs across 14 languages, providing immediate value to an existing community while extending far beyond audio notifications.

## Conclusion: bridging the tool fragmentation gap

AutoSnitch addresses a structural gap in the AI coding tool ecosystem. As the number of AI CLI tools proliferates — our research identified **15+ distinct tools** with active user bases — developers increasingly run multiple tools simultaneously across projects. The absence of a unified monitoring layer forces every consumer app (dashboards, cost trackers, notification systems, animated mascots) to independently implement tool-specific integrations.

The tiered interception architecture (hooks → file watching → process detection → PTY wrapping) ensures coverage across tools at every level of API maturity, from Claude Code's rich 21-event hook system down to tools that expose nothing but a running process. The CloudEvents-compatible event schema with CESP category mapping creates a bridge between standardized event processing and the existing PeonPing sound pack ecosystem.

The hybrid TypeScript + Rust stack, pnpm monorepo, and cross-platform daemon deployment optimize for development speed while shipping a native-feeling experience on all systems. Phase 1 through Phase 3 (approximately 7 weeks) produces a functional multi-tool monitor; Phase 4 and 5 add the client SDK, community infrastructure, and distribution that transform it into a sustainable open-source project.