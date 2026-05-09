# 🤖 AISnitch

> **See everything your AI coding tools are doing — in one place, in real time.**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Claude Code    OpenCode    Gemini CLI    Aider    Codex       │
│       │              │           │          │         │        │
│       └──────────────┴───────────┴──────────┴─────────┘        │
│                             │                                   │
│                    ┌────────▼────────┐                          │
│                    │   AISnitch      │                          │
│                    │   ┌─────────┐   │                          │
│                    │   │  TUI    │   │  ← Dashboard (real-time) │
│                    │   └─────────┘   │                          │
│                    │   ┌─────────┐   │                          │
│                    │   │ Webhook │   │  ← Build anything        │
│                    │   └─────────┘   │                          │
│                    └─────────────────┘                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**One command. Every agent. Every project. Live.**

---

## ⭐ Why AISnitch?

You have **multiple AI coding assistants** running at the same time:

```
🔵 Claude Code   → working on your main project
🟡 OpenCode      → reviewing a PR
🟣 Codex         → writing tests
🟢 Aider         → refactoring legacy code
```

**The problem?** You have 4 terminals open, tabbing between them, missing things, context-switching like crazy.

**The solution?**

```bash
aisnitch start
```

Now you see **everything in one dashboard**:

```
┌─────────────────────────────────────────────────────────────┐
│  🤖 AISnitch                              [q] quit  [?] help │
├─────────────────────────────────────────────────────────────┤
│  🔵 Claude Code  ● thinking...      │ 📝 src/app.ts           │
│  🟡 OpenCode     ✓ idle            │ 📁 /projects/api        │
│  🟣 Codex        ⏳ coding...      │ 📄 tests/users.test.ts  │
│  🟢 Aider        ● task: "cleanup" │ 📁 /legacy/db          │
├─────────────────────────────────────────────────────────────┤
│  Events (42)                     [Space] freeze  [c] clear   │
│  ──────────────────────────────────────────────────────────── │
│  🔵 14:30:01  agent.thinking   "Implementing user auth..."   │
│  🔵 14:29:58  agent.coding      Edit → src/auth/login.ts      │
│  🟡 14:29:55  agent.idle        waiting for prompt...          │
│  🟣 14:29:52  tool_call         Bash → git status             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start (30 seconds)

### 1. Install

```bash
# npm (recommended)
npm i -g aisnitch

# or Homebrew
brew install aisnitch
```

### 2. Run

```bash
aisnitch start
```

That's it! The dashboard opens with live events from all configured tools.

**No AI tools yet?** Try the demo mode:

```bash
aisnitch start --mock all
```

### 3. Connect your tools

```bash
# Pick your tools
aisnitch setup claude-code   # hooks into Claude Code
aisnitch setup opencode      # hooks into OpenCode
aisnitch setup aider         # hooks into Aider

# Verify everything
aisnitch adapters
```

---

## 🎯 Common Use Cases

### "I want to see all my AI agents in real time"

```bash
aisnitch start
```

Opens the TUI dashboard. Live events stream in as your tools work.

### "I want to build something on top of AISnitch"

```bash
# Start the daemon (runs in background)
aisnitch start --daemon

# Now connect your app to ws://127.0.0.1:4820
```

```typescript
import { createAISnitchClient } from '@aisnitch/client';
import WebSocket from 'ws';

const client = createAISnitchClient({ WebSocketClass: WebSocket as any });

client.on('event', (e) => {
  console.log(`${e['aisnitch.tool']}: ${e.type}`);
});
```

### "I want a fancy web dashboard on another computer"

```bash
aisnitch fs --daemon
# → Opens http://127.0.0.1:5174 in browser
# → Connects to daemon automatically
```

### "I want sound notifications when agents finish"

```typescript
const client = createAISnitchClient();

client.on('event', (e) => {
  if (e.type === 'task.complete') playSound('success.mp3');
  if (e.type === 'agent.error')  playSound('error.mp3');
  if (e.type === 'agent.asking_user') playSound('ping.mp3');
});
```

---

## 📦 Installation Options

### npm (Recommended)

```bash
npm i -g aisnitch
```

### Homebrew (macOS/Linux)

```bash
brew install aisnitch
```

### From Source

```bash
git clone https://github.com/vava-nessa/AISnitch.git
cd AISnitch
pnpm install && pnpm build
node dist/cli/index.js start
```

### Upgrade

```bash
# npm
npm update -g aisnitch

# Homebrew
brew upgrade aisnitch
```

---

## 🛠️ Supported Tools

| Tool | Status | Setup Command |
|:---|:---:|:---|
| **Claude Code** | ✅ Active | `aisnitch setup claude-code` |
| **OpenCode** | ✅ Active | `aisnitch setup opencode` |
| **Gemini CLI** | ✅ Active | `aisnitch setup gemini-cli` |
| **Aider** | ✅ Active | `aisnitch setup aider` |
| **Codex** | ✅ Active | `aisnitch setup codex` |
| **Goose** | ✅ Active | `aisnitch setup goose` |
| **Copilot CLI** | ✅ Active | `aisnitch setup copilot-cli` |
| **OpenClaw** | ✅ Active | `aisnitch setup openclaw` |
| **Cursor** | ✅ Active | `aisnitch setup cursor` |
| **Zed** | ✅ Active | `aisnitch setup zed` |
| **Devin** | ✅ Active | `aisnitch setup devin` |
| **Kilo** | ✅ Active | `aisnitch setup kilo` |
| **Pi (zealncer)** | ✅ Active | `aisnitch setup pi` |
| **Any CLI** | 🔧 Fallback | `aisnitch wrap <command>` |

> 💡 Run `aisnitch adapters` to see which tools are currently connected.

---

## 🔌 Web Dashboard

Open a beautiful real-time dashboard in your browser:

```bash
aisnitch fs                    # Open dashboard (auto-starts daemon if needed)
aisnitch fs --daemon           # Start daemon + open dashboard
aisnitch fs --dashboard-port 8080  # Custom port
aisnitch fs --no-browser       # Just start the server
```

**From another computer?** Make sure the host machine has the daemon running:

```bash
aisnitch start --daemon        # Start on host machine first
aisnitch fs                    # Connect from any browser
```

---

## 📡 WebSocket API (Build Anything)

AISnitch exposes a WebSocket stream at `ws://127.0.0.1:4820`. Connect with the SDK:

### Install the SDK

```bash
pnpm add @aisnitch/client zod
```

### Basic Usage

```typescript
import { createAISnitchClient, describeEvent } from '@aisnitch/client';
import WebSocket from 'ws';

const client = createAISnitchClient({ WebSocketClass: WebSocket as any });

// Get notified when connected
client.on('connected', (info) => {
  console.log(`Connected to AISnitch ${info.version}`);
  console.log(`Tools: ${info.activeTools.join(', ')}`);
});

// Receive all events
client.on('event', (event) => {
  console.log(describeEvent(event));
  // → "claude-code is thinking... → user auth module"
  // → "opencode is coding... → src/api/users.ts"
});

// Track sessions
setInterval(() => {
  const sessions = client.sessions?.getAll() ?? [];
  console.log(`${sessions.length} active sessions`);
}, 5000);
```

### Sound Notifications

```typescript
import { createAISnitchClient } from '@aisnitch/client';

const SOUNDS = {
  'session.start':     'sounds/boot.mp3',
  'task.complete':     'sounds/done.mp3',
  'agent.asking_user': 'sounds/ping.mp3',
  'agent.error':       'sounds/error.mp3',
  'agent.coding':      'sounds/keyboard.mp3',
};

const client = createAISnitchClient();
client.on('event', (e) => {
  if (SOUNDS[e.type]) playSound(SOUNDS[e.type]);
});
```

### Slack/Discord Bot

```typescript
import { createAISnitchClient, formatStatusLine } from '@aisnitch/client';

const client = createAISnitchClient();

client.on('event', (e) => {
  // Notify on important events
  if (e.type === 'agent.error') {
    postToSlack(`🔴 Error: ${formatStatusLine(e)}`);
  }
  if (e.type === 'task.complete') {
    postToDiscord(`✅ Done: ${formatStatusLine(e)}`);
  }
});
```

### Direct WebSocket (No SDK)

```bash
# See raw events in one line
node -e "
  const WebSocket = require('ws');
  const ws = new WebSocket('ws://127.0.0.1:4820');
  ws.on('message', m => console.log(JSON.parse(m.toString()).type));
"
```

---

## ⌨️ CLI Reference

### Dashboard & TUI

```bash
aisnitch start                     # Open TUI dashboard
aisnitch start --tool claude-code  # Filter by tool
aisnitch start --type agent.coding # Filter by event type
aisnitch start --view full-data    # Show full JSON
```

### Web Dashboard

```bash
aisnitch fs                        # Open web dashboard
aisnitch fs --daemon               # Start daemon + open
aisnitch fs --dashboard-port 8080 # Custom port
aisnitch fs --no-browser           # Server only
```

### Daemon Management

```bash
aisnitch start --daemon            # Start daemon in background
aisnitch status                    # Check daemon status
aisnitch attach                    # Attach TUI to running daemon
aisnitch stop                      # Stop daemon
```

### Tool Setup

```bash
aisnitch setup claude-code         # Configure tool
aisnitch setup opencode
aisnitch setup aider
aisnitch setup claude-code --revert  # Remove configuration
```

### Utilities

```bash
aisnitch adapters                  # Show enabled tools
aisnitch logger                    # Stream raw events (no TUI)
aisnitch mock claude-code          # Simulate events
aisnitch mock all --speed 2        # Demo mode (2x speed)
aisnitch wrap aider --model sonnet  # Wrap any CLI
aisnitch setup claude-code          # Run setup wizard
aisnitch self-update               # Update AISnitch
```

---

## 🖥️ TUI Controls

| Key | Action |
|:---:|:---|
| `q` / `Ctrl+C` | Quit |
| `d` | Toggle daemon |
| `r` | Refresh |
| `v` | Toggle JSON inspector |
| `f` | Filter by tool |
| `t` | Filter by event type |
| `/` | Search |
| `Esc` | Clear filters |
| `Space` | Freeze/resume |
| `c` | Clear buffer |
| `?` | Help |
| `Tab` | Switch panel |
| `↑↓` / `jk` | Navigate |
| `[]` | Page inspector |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     External AI Tools                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ Claude   │ │ OpenCode │ │ Gemini   │ │ Aider    │  ...     │
│  │  Code    │ │          │ │  CLI     │ │          │          │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘          │
│       │            │            │            │                  │
│       └────────────┴────────────┴────────────┘                  │
│                        │                                        │
│                        ▼                                        │
│              ┌───────────────────┐                              │
│              │   HTTP Receiver   │                              │
│              │   :4821           │                              │
│              └─────────┬─────────┘                              │
│                        │                                        │
│                        ▼                                        │
│              ┌───────────────────┐                              │
│              │   EventBus        │                              │
│              │   (validation +  │                              │
│              │    normalization) │                              │
│              └─────────┬─────────┘                              │
│                        │                                        │
│          ┌─────────────┼─────────────┐                          │
│          ▼             │             ▼                          │
│   ┌─────────────┐      │      ┌─────────────┐                  │
│   │  WebSocket  │      │      │    TUI      │                  │
│   │  :4820      │      │      │  Dashboard  │                  │
│   └──────┬──────┘      │      └─────────────┘                  │
│          │              │                                       │
│          ▼              ▼                                       │
│   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │
│   │   Client    │ │   Sound     │ │   Mascot    │              │
│   │  Dashboard  │ │  Engine     │ │  Companion  │              │
│   └─────────────┘ └─────────────┘ └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### Key Points

- **Zero storage**: Events live in memory only, never written to disk
- **Privacy-first**: No data leaves your machine
- **Multi-instance tracking**: Handles multiple sessions of the same tool
- **Auto-reconnect**: SDK handles reconnection automatically
- **Zod validation**: All events validated before processing

---

## 📊 Event Model

Every event follows [CloudEvents v1.0](https://cloudevents.io/) format:

```json
{
  "specversion": "1.0",
  "id": "019713a4-beef-7000-8000-deadbeef0042",
  "source": "aisnitch://claude-code/myproject",
  "type": "agent.coding",
  "time": "2026-03-28T14:30:00.000Z",

  "aisnitch.tool": "claude-code",
  "aisnitch.sessionid": "claude-code:myproject:p12345",
  "aisnitch.seqnum": 42,

  "data": {
    "state": "agent.coding",
    "project": "myproject",
    "projectPath": "/home/user/myproject",
    "activeFile": "src/index.ts",
    "toolName": "Edit",
    "model": "claude-sonnet-4-20250514",
    "tokensUsed": 1500,
    "inputTokens": 450,
    "outputTokens": 1050,
    "terminal": "iTerm2",
    "cwd": "/home/user/myproject"
  }
}
```

### Event Types

| Type | Description |
|:---|:---|
| `session.start` | Tool started |
| `session.end` | Tool closed |
| `task.start` | User submitted prompt |
| `task.complete` | Task finished |
| `agent.thinking` | Model reasoning |
| `agent.streaming` | Output being generated |
| `agent.coding` | Editing files |
| `agent.tool_call` | Using Bash, Grep, etc. |
| `agent.asking_user` | Waiting for input |
| `agent.idle` | No activity (2+ min) |
| `agent.error` | Error occurred |
| `agent.compact` | Context cleanup |

---

## 📁 File Structure

```
~/.aisnitch/
├── config.json          # Your configuration
├── aisnitch.pid         # Daemon PID
├── daemon-state.json    # Connection info
├── daemon.log          # Daemon logs (5MB max)
└── aisnitch.sock       # Unix socket (IPC)
```

### Ports

| Port | Purpose |
|:---:|:---|
| `4820` | WebSocket (connect here) |
| `4821` | HTTP webhook receiver + health |

### Health Check

```bash
curl http://127.0.0.1:4821/health
```

---

## 🧪 Development

```bash
# Setup
git clone https://github.com/vava-nessa/AISnitch.git
cd AISnitch
pnpm install

# Build
pnpm build              # ESM + CJS + TypeScript types

# Quality
pnpm lint               # ESLint
pnpm typecheck          # TypeScript
pnpm test               # 300+ tests
pnpm test:coverage      # Coverage report
```

### Project Structure

```
aisnitch/
├── src/
│   ├── adapters/       # 13 tool adapters
│   ├── cli/           # Commander CLI
│   ├── core/          # Events, pipeline, config
│   └── tui/           # Ink terminal dashboard
├── packages/
│   └── client/        # @aisnitch/client SDK
├── docs/              # Technical docs
└── tasks/             # Task board
```

---

## 📚 Resources

- [Documentation](./docs/index.md) — Technical details
- [Client SDK](./packages/client/README.md) — Build on top
- [Tasks](./tasks/tasks.md) — What's being worked on
- [Contributing](./CONTRIBUTING.md) — How to contribute

---

## ❓ FAQ

**Q: Does AISnitch store my data?**

No. Events transit through memory only and are never written to disk. Nothing leaves your machine.

**Q: Which tools are supported?**

13 tools out of the box: Claude Code, OpenCode, Gemini CLI, Aider, Codex, Goose, Copilot CLI, OpenClaw, Cursor, Zed, Devin, Kilo, Pi. Plus any CLI via the `wrap` command.

**Q: Can I build my own dashboard?**

Yes! Use the `@aisnitch/client` SDK or connect directly to `ws://127.0.0.1:4820`.

**Q: How do I update AISnitch?**

```bash
npm update -g aisnitch   # npm
brew upgrade aisnitch    # Homebrew
```

**Q: Why "Snitch"?**

Because it snitches on your AI agents — tells you what they're doing! 🎭

---

## 📜 License

Apache-2.0 — [Vanessa Depraute](https://github.com/vava-nessa)

[![CI](https://github.com/vava-nessa/AISnitch/actions/workflows/ci.yml/badge.svg)](https://github.com/vava-nessa/AISnitch/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/aisnitch?logo=npm)](https://www.npmjs.com/package/aisnitch)
[![Node >=20](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js)](https://nodejs.org/)