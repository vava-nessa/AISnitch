# Dashboard Content Display

This document describes how AISnitch's fullscreen dashboard displays agent activity content in real-time.

## Overview

The fullscreen dashboard (`examples/fullscreen-dashboard/`) connects via WebSocket to the AISnitch daemon and displays live activity from AI coding agents. It features a sophisticated content display system inspired by AI observability platforms like LangSmith, Helicone, and Langfuse.

## Content Priority System

The dashboard uses a priority-based content system to determine what to display when multiple content fields are available:

| Priority | Content Type | Example |
|----------|-------------|---------|
| 1 (highest) | Thinking/Reasoning | AI internal reasoning chain |
| 2 | Tool calls | Tool name + input + result |
| 3 | Message content | Streaming AI output |
| 4 | Final message | Session summary |
| 5 (lowest) | Metadata | Project, file, model info |

## Content Block Types

### Prose (`style: 'prose'`)
Used for thinking content and message output.
- Serif font (Georgia)
- Large line height (1.9)
- Subtle background with left border accent
- Used for: 🧠 Reasoning Chain, 💬 AI Response

### Code (`style: 'code'`)
Used for tool input/output and raw data.
- Monospace font (JetBrains Mono)
- GitHub dark theme colors
- Fixed-width scrolling
- Used for: 📥 Input, 📤 Output, Raw Data

### Summary (`style: 'summary'`)
Used for final session messages.
- Larger font size (18px)
- Gradient background
- Prominent border
- Used for: ✨ Session Summary

### Minimal (`style: 'minimal'`)
Used for tool names and metadata.
- Simple text display
- No background
- Used for: 🔧 Tool Name

## Event Type Display

Each event type has associated metadata:

### Session Events
- **session.start**: Project name, working directory
- **session.end**: Duration, summary message

### Agent Events
- **agent.thinking**: Reasoning content (if available)
- **agent.streaming**: Message content (if available)
- **agent.tool_call**: Tool name, input, result
- **agent.coding**: Coding tool activity
- **agent.error**: Error message, error type
- **agent.compact**: Context compaction notice
- **agent.asking_user**: Permission requests

### Task Events
- **task.start**: Task prompt
- **task.complete**: Completion message

## Metadata Badges

The dashboard header displays relevant badges:
- 📁 Project name
- 📄 Active file (truncated)
- 🤖 Model name
- ⏱️ Duration
- ⚠️ Error indicator

## Empty Content Handling

When no content is available, the dashboard gracefully falls back to:

1. **Metadata display**: Shows project, file, model, CWD from event data
2. **Event-specific info**: Custom messages based on event type
3. **Raw data section**: Collapsible JSON view of raw event data

Example fallback for `session.start`:
```
📊 Session Start
Project: my-project
CWD: /Users/me/project
```

## Event Queue

The dashboard maintains a queue of 50 recent events:
- New events are prepended to the queue
- Display updates are debounced (200ms)
- Most "significant" event is shown (has content fields)

## Visual Design

### Color Scheme
- Base colors from event type mapping (see `types.ts`)
- Dark theme: `#0d1117` to `#161b22` gradient
- Content-specific gradients for thinking/tool/message

### Typography
- IBM Plex Sans for prose
- JetBrains Mono for code
- System fonts for minimal text

### Animations
- Fade-in with slide: `fadeSlideIn` keyframe
- Staggered content blocks: `0.05s` delay between blocks


## Token Tracking

The dashboard tracks cumulative tokens per session in real-time with a breakdown by type:

| Type | Icon | Color | Description |
|------|------|-------|-------------|
| **Total** | 🪙 | Green | Sum of all tokens |
| **Input** | 📥 | Blue | Prompt/input tokens |
| **Output** | 📤 | Pink | Response/completion tokens |
| **Cached** | 🧊 | Purple | Cached/reasoning tokens (provider-specific) |

### Visual Display

Tokens are displayed in the agent sidebar with a beautiful breakdown:

```
┌──────────────────────────────────────┐
│ 🪙 12.4k tokens                      │
│   📥 3.7k  │  📤 8.7k               │
└──────────────────────────────────────┘
```

Or with cached tokens (reasoning):

```
┌──────────────────────────────────────┐
│ 🪙 45.2k tokens                      │
│   📥 12k  │  📤 15k  │  🧊 18k      │
└──────────────────────────────────────┘
```

### Data Flow

1. Event arrives with `inputTokens`, `outputTokens`, `cachedTokens`
2. Hook accumulates each type separately in `AgentDisplay`
3. `TokenDisplay` component renders with color-coded breakdown
4. Numbers auto-format: `1,234` → `1.2k` → `1.2M`

### Adapter Implementation

| Adapter | Token Source | Fields |
|---------|-------------|--------|
| OpenCode | `properties.info.tokens` | input, output, reasoning (=cached) |
| Claude Code | `usage` | total_tokens, input_tokens, output_tokens, cached_tokens |
| Aider | stdout parsing | total only |
| Gemini CLI | `usageMetadata` | total_tokens |
| Goose | `token_state` | accumulated_total_tokens |
| OpenClaw | `tokens` | total only |
| Others | `usage` | total (derives input/output split) |

### Schema Changes

Added to `EventData`:
```typescript
inputTokens?: number;   // Input/prompt tokens
outputTokens?: number;  // Output/completion tokens
cachedTokens?: number;   // Cached (reasoning) tokens
```

## Related Documentation

- [`./adapter-analysis.md`](./adapter-analysis.md) — Research on each adapter's event format
- [`./events-schema.md`](./events-schema.md) — EventData schema with content fields
- [`../examples/fullscreen-dashboard/README.md`](../examples/fullscreen-dashboard/README.md) — Dashboard setup guide
