# AISnitch Adapter Analysis — Full Content Extraction

**Date:** 2026-05-08  
**Status:** Phase 2 - Research Complete  
**Goal:** Extract meaningful content (thinking, tool calls, messages, results) from ALL supported AI coding tools

---

## Executive Summary

The fullscreen dashboard shows "output" instead of actual content because:
1. The OpenCode plugin doesn't capture TUI-specific event formats
2. Other adapters have incomplete content extraction
3. Each tool uses different event schemas

### Key Discovery
- **Claude Code**: No thinking/reasoning exposed via hooks (hidden internally)
- **OpenCode**: TUI uses different events than CLI
- **Gemini CLI**: Has `onThinking` hooks for reasoning capture
- **Zed**: HTTP API on port 9876 with state-based events

---

## Research Findings by Tool

### 1. OpenCode (✅ Primary Focus)

#### Plugin System
- **Location:** `~/.config/opencode/plugins/aisnitch.ts`
- **Endpoint:** `http://localhost:4821/hooks/opencode`

#### Event Types Supported
| Event Type | Status | Content Available |
|------------|--------|------------------|
| `session.created` | ✅ | project, cwd, model |
| `session.deleted` | ✅ | result (final message) |
| `session.idle` | ✅ | - |
| `session.error` | ✅ | error message |
| `tool.execute.before` | ✅ | tool.name, args |
| `tool.execute.after` | ❌ | NOT HANDLED |
| `message.updated` | ❌ | NOT HANDLED |
| `message.part.updated` | ⚠️ | PARTIALLY (role=assistant → streaming) |
| `thinking` | ❌ | NOT HANDLED |

#### Content Extraction Status
| Field | CLI | TUI | Plugin |
|--------|-----|-----|--------|
| `toolCallName` | ✅ | ❌ | ✅ |
| `toolResult` | ✅ | ❌ | ❌ |
| `messageContent` | ✅ | ❌ | ❌ |
| `thinkingContent` | ❌ | ❌ | ❌ |
| `finalMessage` | ✅ | ❌ | ❌ |

#### Root Cause - TUI vs CLI
```
CLI (opencode run):
  ACP Protocol → Full event stream → Plugin captures ✓
  
TUI (interactive):
  Internal events → Different format → Plugin misses ✗
```

#### TUI Event Format (Hypothesized)
```typescript
interface OpenCodeTUIEvent {
  type: string;
  sessionId?: string;
  cwd?: string;
  properties?: {
    project?: string;
    modelID?: string;
    info?: {
      role?: string;        // "user" | "assistant"
      part?: {
        type?: string;
        text?: string;
      };
    };
  };
  tool?: { name: string };
  args?: { filePath?: string; command?: string };
  result?: string;
}
```

#### Action Items for OpenCode
- [x] Add `message.updated` handler (PARTIAL - only for role=assistant)
- [ ] Add `message.part.updated` with full content extraction
- [ ] Add `thinking` event type
- [ ] Add `tool.execute.after` for result capture
- [ ] Extract `part.text`, `info.role`, `result` fields

---

### 2. Claude Code (✅ Good Shape)

#### Hook System
- **Config Location:** `.claude/hooks/`
- **Docs:** https://code.claude.com/docs/en/hooks

#### Event Types
| Event | When | Can Block | Content |
|-------|------|-----------|---------|
| `PreToolUse` | Before tool | Yes | `tool_name`, `tool_input` |
| `PostToolUse` | After tool | No | `tool_name`, `tool_input`, `output` |
| `SessionEnd` | Session terminates | No | `transcript_path` |
| `Stop` | Claude finishes | Yes | - |

#### Input Schema
```json
{
  "session_id": "...",
  "transcript_path": "...",
  "cwd": "...",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "rm -rf /tmp/build"
  }
}
```

#### PostToolUse Output
```json
{
  "session_id": "...",
  "tool_name": "Bash",
  "tool_input": { "command": "ls -la" },
  "output": "total 24\ndrwxr-xr-x 6 user staff 192 May  8 00:00 .",
  "tool_use_id": "..."
}
```

#### ❌ Critical Finding - NO Thinking/Reasoning
Claude Code does NOT expose internal thinking/reasoning via hooks. It's processed internally and never exposed to hooks.

#### Content Extraction Status
| Field | Source | Status |
|-------|--------|--------|
| `toolCallName` | `tool_name` | ✅ |
| `toolResult` | `output` (PostToolUse) | ✅ |
| `messageContent` | `transcript.jsonl` (via path) | ⚠️ |
| `thinkingContent` | NOT AVAILABLE | ❌ |
| `finalMessage` | Need SessionEnd | ⚠️ |

#### Current Adapter Issues
1. Need to read `transcript.jsonl` for messages
2. Need to handle `PostToolUse` for tool results
3. Need to handle `SessionEnd` for summary

---

### 3. Gemini CLI (✅ Good Shape)

#### Hook System
- **Docs:** https://geminicli.com/docs/hooks/reference/

#### Event Types
| Event | Description |
|-------|-------------|
| `onToolCall` | Tool execution |
| `onThinking` | **Reasoning/Thinking (unique!)** |
| `onMessage` | Message sent/received |
| `onError` | Error occurred |
| `onExit` | Session ended |

#### Event Payload (from docs)
```typescript
interface GeminiHookEvent {
  model: string;
  messages: Array<{
    role: "user" | "model" | "system";
    content: string;  // Non-text parts filtered
  }>;
  config: object;
  toolConfig: {
    mode: string;
    allowedFunctionNames: string[];
  };
}

interface onToolCall {
  arguments?: object;  // Tool arguments
  name?: string;       // Tool name
}

interface onThinking {
  content: string;  // **REASONING CONTENT AVAILABLE!**
}
```

#### ✅ Key Finding - Thinking Available!
Gemini CLI exposes `onThinking` hook with `content` field!

#### Content Extraction Status
| Field | Source | Status |
|-------|--------|--------|
| `toolCallName` | `name` | ✅ |
| `toolResult` | `result` | ✅ |
| `messageContent` | `messages[].content` | ✅ |
| `thinkingContent` | `onThinking.content` | ✅ |
| `finalMessage` | `onExit` | ⚠️ |

---

### 4. Cursor (⚠️ Research Needed)

#### Hook System
- **Docs:** https://cursor.com/docs/hooks
- **Events:** PreToolUse, AfterToolUse

#### Content Extraction Status
| Field | Source | Status |
|-------|--------|--------|
| `toolCallName` | hook payload | ⚠️ |
| `toolResult` | AfterToolUse output | ⚠️ |
| `messageContent` | NOT via hooks | ❌ |
| `thinkingContent` | NOT AVAILABLE | ❌ |

---

### 5. Zed (⚠️ Research Needed)

#### API System
- **Port:** 9876
- **Docs:** https://zed.dev/agent-metrics

#### Hypothesized Event Format
```typescript
interface ZedAgentEvent {
  sessionId: string;
  state: "idle" | "thinking" | "tool" | "output";
  thinking?: string;
  toolName?: string;
  toolInput?: { filePath?: string; command?: string };
  filePath?: string;
  message?: string;
}
```

#### Content Extraction Status
| Field | Source | Status |
|-------|--------|--------|
| `toolCallName` | `toolName` | ⚠️ |
| `toolResult` | NOT AVAILABLE | ❌ |
| `messageContent` | `message` | ⚠️ |
| `thinkingContent` | `thinking` | ⚠️ |

---

### 6. Goose (⚠️ Research Needed)

#### Event System
- **Docs:** https://goose-docs.ai/docs/guides/goose-cli-commands/
- **Based on:** MCP protocol

#### Content Extraction Status
| Field | Status |
|-------|--------|
| `toolCallName` | ⚠️ |
| `toolResult` | ⚠️ |
| `messageContent` | ⚠️ |
| `thinkingContent` | ⚠️ |

---

### 7. Aider (⚠️ Research Needed)

#### Protocol
- **Chat Protocol:** JSON over stdin/stdout

#### Content Extraction Status
| Field | Status |
|-------|--------|
| `toolCallName` | ⚠️ |
| `toolResult` | ⚠️ |
| `messageContent` | ⚠️ |
| `thinkingContent` | ⚠️ |

---

### 8. Other Tools (Secondary Priority)

| Tool | Status | Notes |
|------|--------|-------|
| Codex | ⚠️ | MCP-based |
| Copilot CLI | ⚠️ | Hooks system |
| Cline | ⚠️ | VS Code extension |
| Continue | ⚠️ | MCP-based |
| OpenClaw | ⚠️ | Hook-based |
| Kilo | ⚠️ | CLI tool |
| Devin | ⚠️ | CLI agent |
| Windsurf | ⚠️ | IDE extension |
| Qwen Code | ⚠️ | CLI tool |
| OpenHands | ⚠️ | Docker-based |
| Augment Code | ⚠️ | IDE extension |
| Mistral | ⚠️ | CLI tool |

---

## Priority Matrix

| Priority | Tool | Issue | Fix Complexity | Content Available |
|----------|------|-------|---------------|------------------|
| P0 | OpenCode Plugin | Missing TUI events | Medium | PARTIAL |
| P1 | OpenCode Adapter | Content extraction | Low | PARTIAL |
| P2 | Claude Code | Verify/enhance | Low | MOST |
| P3 | Gemini CLI | Research + fix | Low | **FULL** |
| P4 | Zed | Research + fix | Medium | PARTIAL |
| P5 | Cursor | Research + fix | Medium | PARTIAL |
| P6 | Goose | Research + fix | Medium | ? |
| P7 | Others | Research + fix | High | ? |

---

## Content Availability by Tool

| Tool | Thinking | Tool Name | Tool Result | Message | Final |
|------|----------|-----------|-------------|---------|--------|
| OpenCode | ❌ | ✅ | ❌ | ❌ | ✅ |
| Claude Code | ❌ | ✅ | ✅ | ⚠️ | ⚠️ |
| Gemini CLI | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Cursor | ❌ | ⚠️ | ⚠️ | ❌ | ? |
| Zed | ⚠️ | ⚠️ | ❌ | ⚠️ | ? |
| Goose | ? | ? | ? | ? | ? |
| Aider | ? | ? | ? | ? | ? |

---

## Validation Checklist

### Before Fixing
- [x] Document Claude Code hook format ✅
- [x] Document Gemini CLI hook format ✅
- [x] Document OpenCode plugin limitations ✅
- [ ] Verify OpenCode TUI event format (needs debugging)
- [ ] Research Zed API format
- [ ] Research Cursor hooks format
- [ ] Research Goose event format

### During Fix
- [ ] Test each field extraction individually
- [ ] Verify WebSocket delivery with content
- [ ] Test dashboard rendering

### After Fix
- [ ] End-to-end test with real tool usage
- [ ] Verify no regression on CLI mode
- [ ] Document new field mappings

---

## Next Steps

### Phase 1: OpenCode Plugin Fix (P0)
1. Add `message.updated` handler
2. Add `message.part.updated` handler
3. Add `thinking` event type
4. Add `tool.execute.after` handler
5. Extract `part.text`, `info.role`, `result` fields

### Phase 2: OpenCode Adapter Enhancement (P1)
1. Improve `extractOpenCodeMessageContent()`
2. Improve `extractOpenCodeThinkingContent()`
3. Verify all field paths

### Phase 3: Other Tools (P2-P7)
1. Research each tool's event format
2. Update adapters accordingly
3. Add content extraction

### Phase 4: Dashboard Enhancement
1. Add scrolling event history
2. Improve empty state handling
3. Add event type filtering
4. Show "No content available" states

---

## Open Questions

1. ❌ Does Claude Code expose thinking/reasoning via hooks? **NO - Internal only**
2. ⚠️ What exact payload does Gemini CLI send? **Known: model, messages, config**
3. ⚠️ Does Zed expose tool results? **Unknown**
4. ⚠️ How does Cursor handle message content? **Unknown**
5. ⚠️ What's the difference between TUI and CLI event formats for OpenCode? **TUI sends fewer/different events**

---

## Appendix A: Claude Code Hook Reference

### PreToolUse Input
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/project",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "ls -la"
  }
}
```

### PostToolUse Input
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/project",
  "hook_event_name": "PostToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "ls -la"
  },
  "output": "total 24\ndrwxr-xr-x 6 user staff 192 May 8 project/",
  "tool_use_id": "tool_123"
}
```

### SessionEnd Input
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "hook_event_name": "SessionEnd"
}
```

---

## Appendix B: Gemini CLI Hook Reference

### onToolCall
```json
{
  "model": "gemini-2.0-flash",
  "messages": [...],
  "config": {...},
  "toolConfig": {...},
  "arguments": { "command": "ls" },
  "name": "Bash"
}
```

### onThinking
```json
{
  "content": "The user wants me to list files. I should use ls command..."
}
```

---

## Appendix C: Current AISnitch EventData Schema

```typescript
interface EventData {
  state: AISnitchEventType;
  project?: string;
  projectPath?: string;
  duration?: number;
  toolName?: string;
  toolInput?: { filePath?: string; command?: string };
  activeFile?: string;
  model?: string;
  tokensUsed?: number;
  errorMessage?: string;
  errorType?: string;
  raw?: Record<string, unknown>;
  terminal?: string;
  cwd?: string;
  pid?: number;
  instanceId?: string;
  instanceIndex?: number;
  instanceTotal?: number;
  thinkingContent?: string;
  toolCallName?: string;
  finalMessage?: string;
  toolResult?: string;
  messageContent?: string;
}
```
