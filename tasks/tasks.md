# Tasks — AISnitch

---

## 🟡 Todo

| # | Task | Priority | Notes |
|---|---|---|---|
| 1 | Remote streaming (forward WS) | P2 | Post-schema enhancement |
| 2 | Plugin system | P2 | Post-schema enhancement |
| 3 | Web Dashboard | P2 | Post-schema enhancement |
| 4 | Dashboard content display improvement | P1 | ✅ Done |
| 5 | OpenCode TUI content capture | P0 | Debug TUI events, capture content for TUI mode |
| 6 | Claude Code thinking capture | P2 | Read transcript for thinking content |
| 7 | Gemini CLI onThinking integration | P2 | Hook into thinking content |
| 8 | Token tracking (input/output/cached) | P1 | ✅ Done |
| 9 | `aisnitch fs` CLI command | P1 | ✅ Done |

---

## 🚧 In Progress

### t-dashboard-content-display (P1)
**Goal**: Improve fullscreen dashboard to handle all content types gracefully

**Status**: ✅ Done

**Changes Made**:
- Rewrote `EventDisplay.tsx` with content block system
- Added priority-based content display: thinking > tool > message > final > metadata
- Added `ContentBlock` interface with styles: prose, code, summary, minimal
- Created `extractContentBlocks()` function for content prioritization
- Added `getEventSpecificInfo()` for event-type specific metadata
- Added `RawDataSection` collapsible section for raw data
- Added `MetadataBadge` component for project/model/duration display
- Added `formatDuration()` helper for human-readable duration
- Handles empty content gracefully with metadata fallback
- Added waiting state with helpful message

**Borrowed Patterns From**:
- LangSmith: trace display with spans
- Helicone: session-based tool tracking  
- Langfuse: generation and tool call display

---

## ✅ Done

### t-openclaw-plugin-sdk
**Added OpenClaw Plugin SDK strategy** with:
- `'plugin'` strategy in `InterceptionStrategy` type
- Plugin SDK plugin at `~/.openclaw/plugins/aisnitch-monitor/index.ts` via `aisnitch setup openclaw`
- 11 hooked events: gateway_start/stop, before_agent_run, agent_end, model_call_started/ended, before_tool_call, after_tool_call, before/after_compaction, message_received
- New event handlers: `model_call_started` → agent.thinking, `model_call_ended` → agent.streaming, `before_tool_call` → agent.coding/tool_call
- Duration, error, and model extraction from plugin payloads
- Full test coverage (9 tests) + setup test verifies plugin installation and revert
- Updated fullscreen dashboard EventDisplay for generic raw data from any tool

### t-enhance-content
**Enhanced EventDataSchema + Claude Code + OpenCode adapters** with:
- `thinkingContent` field for AI reasoning chains
- `toolCallName` field for tool names
- `finalMessage` field for session summaries
- `toolResult` field for tool outputs
- `messageContent` field for streaming messages

### t-fullscreen-dashboard
**Fullscreen web dashboard** (`examples/fullscreen-dashboard/`) showing live agent activity:
- React + Vite app
- WebSocket connection to AISnitch daemon
- Color-coded backgrounds by event type
- Header with agent selector
- Event ticker for recent activity
- Responsive design
- Fixed `aisnitch fs` dashboard server spawn handling so stale Homebrew Node paths report a clean CLI error instead of crashing on an unhandled child-process `error` event
- Fixed packaged `aisnitch fs` serving so the dashboard assets are built, included in npm, resolved from the installed package, and served without requiring Vite at runtime

### t-new-adapters
**Added Zed and Pi adapters** to AISnitch:
- **Zed Adapter** (`src/adapters/zed.ts`): HTTP API (port 9876) + log monitoring
- **Pi Adapter** (`src/adapters/pi.ts`): Process detection + API polling + log monitoring
- Both tool names in schema, TUI theme, and dashboard

### t-dashboard-content-display
**Dashboard content display improvement** (see In Progress section above)

---

## 🔴 Blocked

| # | Task | Blocked By | Notes |
|---|---|---|---|
| 5 | OpenCode TUI content capture | Need to debug TUI event format | TUI sends different events than CLI |

---

## 📋 Task Details

### t-enhance-content
- **File**: `src/core/events/schema.ts` (schema)
- **Files**: `src/adapters/claude-code.ts`, `src/adapters/opencode.ts` (adapters)
- **File**: `src/tui/live-monitor.tsx` (TUI)
- **File**: `packages/client/src/index.ts` (SDK)
- **Version**: v0.2.21

### t-fullscreen-dashboard
- **Location**: `examples/fullscreen-dashboard/`
- **Port**: 5174/5175/5176
- **Stack**: React + Vite + TypeScript

### t-new-adapters
- **Zed**: `src/adapters/zed.ts`
- **Pi**: `src/adapters/pi.ts`
- **Config**: `src/adapters/index.ts`
