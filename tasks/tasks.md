# Tasks — AISnitch

## ✅ Done

- **t-enhance-content**: Enhanced EventDataSchema + Claude Code + OpenCode adapters with thinking content, tool names, final messages
- **t-fullscreen-dashboard**: Fullscreen web dashboard (`examples/fullscreen-dashboard/`) showing live agent activity
- **t-new-adapters**: Added Zed and Pi adapters to AISnitch:
  - **Zed Adapter** (`src/adapters/zed.ts`): Detects Zed AI Agent via HTTP API (port 9876) and log file monitoring
  - **Pi Adapter** (`src/adapters/pi.ts`): Detects Pi/MiniMax agent via process detection, API polling, and log monitoring
  - Both adapters properly wired into `createDefaultAdapters()`
  - Both tool names (`zed`, `pi`) added to schema, TUI theme, and fullscreen dashboard

---

## 🟡 Todo

| # | Task | Priority | Notes |
|---|---|---|---|
| 1 | Remote streaming (forward WS) | P2 | Post-schema enhancement |
| 2 | Plugin system | P2 | Post-schema enhancement |
| 3 | Web Dashboard | P2 | Post-schema enhancement |

---

## ✅ Done

- t-enhance-content (in progress) — schema + adapter + TUI + SDK enhancement