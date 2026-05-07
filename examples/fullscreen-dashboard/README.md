# AISnitch Fullscreen Dashboard

Fullscreen web dashboard showing live AI agent activity with large, centered displays of:
- **Thinking content** — reasoning/thinking chains from AI models
- **Tool calls** — the tool being invoked (Edit, Bash, Grep, etc.) with results
- **Messages** — AI output and user-facing text
- **Final messages** — session summary text

## Features

- **Header** — Tool name + model + connection status (color-coded per tool)
- **Agent Selector** — Switch between active agents in sidebar
- **Fullscreen Event Display** — Large centered content that auto-updates
- **Event Ticker** — Recent events at bottom with quick navigation
- **Auto-switching** — Automatically shows new significant events
- **Color-coded backgrounds** — Each event type has a unique background color

## Running

```bash
cd examples/fullscreen-dashboard
pnpm dev
```

Opens on `http://localhost:5174`

## Prerequisites

- AISnitch daemon running (`aisnitch start`)
- WebSocket server on `ws://127.0.0.1:4820`

## Event Types Displayed

| Type | Content |
|------|---------|
| `agent.thinking` | Reasoning/thinking chain content |
| `agent.tool_call` | Tool name + result |
| `agent.coding` | Coding tool name + file + result |
| `agent.streaming` | AI message content |
| `session.end` | Final/summary message |

## Tool Colors

Each AI tool has a unique color in the header and sidebar:
- Claude Code: `#d4a574` (golden)
- OpenCode: `#7c3aed` (purple)
- Gemini CLI: `#10b981` (emerald)
- Codex: `#6366f1` (indigo)
- Goose: `#f59e0b` (amber)
- etc.

## Architecture

```
src/
├── App.tsx              # Main app component
├── types.ts              # TypeScript types + color constants
├── hooks/
│   └── useAISnitch.ts   # WebSocket hook with auto-reconnect
└── components/
    ├── Header.tsx        # Tool name + model + status
    ├── EventDisplay.tsx  # Fullscreen content display
    ├── AgentSelector.tsx # Sidebar agent list
    └── EventTicker.tsx   # Bottom event ticker
```