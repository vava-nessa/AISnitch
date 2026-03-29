# @aisnitch/client

**The official TypeScript SDK for the AISnitch event stream.**

[![npm](https://img.shields.io/npm/v/@aisnitch/client?logo=npm)](https://www.npmjs.com/package/@aisnitch/client)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../../LICENSE)

Connect to AISnitch and consume live AI tool activity in 3 lines. Auto-reconnect, Zod-validated parsing, session tracking, composable filters, human-readable descriptions, and mascot state mapping — everything a consumer needs, zero boilerplate.

---

## Before / After

**Without the SDK** — 40+ lines of manual WebSocket handling, JSON parsing, reconnect logic, type definitions, welcome message filtering:

```typescript
const ws = new WebSocket('ws://127.0.0.1:4820');
ws.onmessage = (msg) => {
  const raw = JSON.parse(msg.data);
  if (raw.type === 'welcome') { /* store welcome... */ return; }
  // manual validation...
  // manual session tracking...
  // manual reconnect on close...
  // manual type definitions...
};
```

**With the SDK** — 3 lines:

```typescript
import { createAISnitchClient, describeEvent } from '@aisnitch/client';

const client = createAISnitchClient({ WebSocketClass: WebSocket as any });
client.on('event', (e) => console.log(describeEvent(e)));
// → "claude-code is editing code → src/index.ts [myproject]"
```

You get auto-reconnect (exponential backoff), Zod validation (invalid messages silently dropped), full TypeScript types, session tracking, and the event emitter — all handled for you.

---

## Table of Contents

- [Install](#install)
- [Quick Start](#quick-start)
- [Use Cases](#use-cases)
  - [Live Dashboard / Status Monitor](#1-live-dashboard--status-monitor)
  - [Sound Notifications (PeonPing-style)](#2-sound-notifications-peonping-style)
  - [Animated Mascot / Companion App](#3-animated-mascot--companion-app)
  - [Menu Bar Widget (Electron / Tauri)](#4-menu-bar-widget-electron--tauri)
  - [CI / Slack / Discord Bot](#5-ci--slack--discord-bot)
- [Framework Integration](#framework-integration)
  - [React](#react)
  - [Vue 3](#vue-3)
- [API Reference](#api-reference)
  - [createAISnitchClient()](#createaisnitchclientoptions)
  - [AISnitchClient](#aisnitchclient)
  - [SessionTracker](#sessiontracker)
  - [Filters](#filters)
  - [describeEvent()](#describeeventevent)
  - [formatStatusLine()](#formatstatuslineevent-sessionnumber)
  - [eventToMascotState()](#eventtomascotstateevent)
  - [parseEvent() / parseWelcome()](#parseeventraw--parsewelcomeraw)
- [TypeScript Integration](#typescript-integration)
- [Troubleshooting](#troubleshooting)
- [Event Types Reference](#event-types-reference)
- [License](#license)

---

## Install

```bash
pnpm add @aisnitch/client zod
```

**Node.js** consumers also need:

```bash
pnpm add ws
pnpm add -D @types/ws    # for TypeScript
```

**Browser** consumers don't need `ws` — the native `WebSocket` is auto-detected.

| Dependency | Role | Required? |
|---|---|---|
| `zod` | Event validation (peer dep) | Yes |
| `ws` | WebSocket for Node.js | Node.js only |

---

## Quick Start

### Node.js

```typescript
import { createAISnitchClient, describeEvent } from '@aisnitch/client';
import WebSocket from 'ws';

const client = createAISnitchClient({
  WebSocketClass: WebSocket as any,
});

client.on('connected', (welcome) => {
  console.log(`AISnitch v${welcome.version}`);
  console.log(`Active tools: ${welcome.activeTools.join(', ')}`);
});

client.on('event', (e) => {
  console.log(describeEvent(e));
});

client.on('disconnected', () => {
  console.log('Disconnected — will auto-reconnect...');
});
```

### Browser

```typescript
import { createAISnitchClient, describeEvent } from '@aisnitch/client';

// No WebSocketClass needed — native WebSocket auto-detected
const client = createAISnitchClient();

client.on('event', (e) => {
  document.getElementById('status')!.textContent = describeEvent(e);
});
```

---

## Use Cases

### 1. Live Dashboard / Status Monitor

Display all AI agent activity in a single terminal or web page. Track sessions, see what each agent is doing, how many events each has processed.

```typescript
import {
  createAISnitchClient,
  describeEvent,
  formatStatusLine,
} from '@aisnitch/client';
import WebSocket from 'ws';

const client = createAISnitchClient({ WebSocketClass: WebSocket as any });

// 📖 The SDK tracks sessions automatically — no manual bookkeeping
client.on('connected', (welcome) => {
  console.log(`\n🟢 Connected to AISnitch v${welcome.version}`);
  console.log(`   Active tools: ${welcome.activeTools.join(', ')}\n`);
});

// 📖 Every event gets a human-readable description out of the box
let sessionCounter = 0;
const sessionNumbers = new Map<string, number>();

client.on('event', (e) => {
  // Assign session numbers for display
  if (!sessionNumbers.has(e['aisnitch.sessionid'])) {
    sessionNumbers.set(e['aisnitch.sessionid'], ++sessionCounter);
  }
  const num = sessionNumbers.get(e['aisnitch.sessionid'])!;

  // formatStatusLine produces lines like:
  // "#1 /home/user/myproject — claude-code is thinking..."
  // "#2 /home/user/api — codex is editing code → src/db.ts"
  console.log(formatStatusLine(e, num));
});

// 📖 Periodic session summary
setInterval(() => {
  const sessions = client.sessions?.getAll() ?? [];
  if (sessions.length === 0) return;

  console.log(`\n--- ${sessions.length} active session(s) ---`);
  for (const s of sessions) {
    console.log(`  [${s.tool}] ${s.lastActivity} (${s.eventCount} events since ${s.startedAt})`);
  }
  console.log('');
}, 10_000);
```

**What `describeEvent()` produces for each event type:**

| Event | Output |
|---|---|
| `session.start` | `claude-code started a new session [myproject]` |
| `agent.thinking` | `claude-code is thinking...` |
| `agent.coding` | `claude-code is editing code → src/index.ts [myproject]` |
| `agent.tool_call` | `claude-code is calling a tool → Bash [myproject]` |
| `agent.asking_user` | `claude-code is waiting for user input` |
| `agent.error` | `claude-code encountered an error — Rate limit exceeded` |
| `task.complete` | `claude-code completed the task [myproject]` |

---

### 2. Sound Notifications (PeonPing-style)

Play sounds when your agents do things — a keyboard clatter when they code, a bell when they need input, a fanfare when a task completes. This is the pattern that [PeonPing](https://github.com/nichochar/peon-ping) popularized.

```typescript
import { createAISnitchClient, filters, type AISnitchEventType } from '@aisnitch/client';
import WebSocket from 'ws';

const client = createAISnitchClient({ WebSocketClass: WebSocket as any });

// 📖 Map each event type to a sound file
const SOUND_MAP: Partial<Record<AISnitchEventType, string>> = {
  'session.start':     './sounds/boot.wav',
  'session.end':       './sounds/shutdown.wav',
  'task.start':        './sounds/ping.wav',
  'task.complete':     './sounds/fanfare.wav',
  'agent.thinking':    './sounds/hum.wav',
  'agent.coding':      './sounds/keyboard.wav',
  'agent.tool_call':   './sounds/tool.wav',
  'agent.asking_user': './sounds/bell.wav',
  'agent.error':       './sounds/error.wav',
  'agent.idle':        './sounds/crickets.wav',
};

client.on('event', (e) => {
  const soundFile = SOUND_MAP[e.type];
  if (soundFile) {
    playSound(soundFile);  // your audio playback function
  }
});

// 📖 Want sounds only for Claude Code? Use a filter:
// client.on('event', (e) => {
//   if (filters.byTool('claude-code')(e)) playSound(SOUND_MAP[e.type]);
// });
```

**Browser variant with Web Audio:**

```typescript
import { createAISnitchClient, type AISnitchEventType } from '@aisnitch/client';

const client = createAISnitchClient(); // browser — native WS

const audioCache = new Map<string, HTMLAudioElement>();

function playSound(file: string): void {
  let audio = audioCache.get(file);
  if (!audio) {
    audio = new Audio(file);
    audioCache.set(file, audio);
  }
  audio.currentTime = 0;
  audio.play();
}
```

---

### 3. Animated Mascot / Companion App

Build a desktop pet, overlay widget, or animated character that reacts to your AI agents. The SDK maps every event to a `MascotState` with mood, animation name, color, and label.

```typescript
import { createAISnitchClient, eventToMascotState, type MascotState } from '@aisnitch/client';

const client = createAISnitchClient();

client.on('event', (e) => {
  const state: MascotState = eventToMascotState(e);

  // state.mood      → 'idle' | 'thinking' | 'working' | 'waiting' | 'celebrating' | 'panicking'
  // state.animation → 'ponder' | 'type' | 'hammer' | 'tap' | 'dance' | 'shake' | ...
  // state.color     → '#a855f7' (hex accent color)
  // state.label     → 'Thinking...' | 'Coding' | 'Needs input' | ...
  // state.detail    → 'src/index.ts' | 'Bash' | 'Rate limit exceeded' (optional)

  updateSprite(state.mood, state.animation);
  updateColorScheme(state.color);
  updateLabel(state.label);
  if (state.detail) updateTooltip(state.detail);
});
```

**Complete mood mapping:**

| Event Type | Mood | Animation | Color | Label |
|---|---|---|---|---|
| `session.start` | `celebrating` | `wave` | `#22c55e` | New session! |
| `session.end` | `idle` | `sleep` | `#6b7280` | Session ended |
| `task.start` | `working` | `stretch` | `#3b82f6` | New task |
| `task.complete` | `celebrating` | `dance` | `#22c55e` | Task done! |
| `agent.thinking` | `thinking` | `ponder` | `#a855f7` | Thinking... |
| `agent.coding` | `working` | `type` | `#f59e0b` | Coding |
| `agent.tool_call` | `working` | `hammer` | `#f59e0b` | Tool call |
| `agent.streaming` | `working` | `talk` | `#3b82f6` | Streaming |
| `agent.asking_user` | `waiting` | `tap` | `#ef4444` | Needs input |
| `agent.idle` | `idle` | `yawn` | `#6b7280` | Idle |
| `agent.error` | `panicking` | `shake` | `#ef4444` | Error! |
| `agent.compact` | `thinking` | `compress` | `#a855f7` | Compacting |

You supply the sprites/CSS/canvas rendering — the SDK handles the state machine.

---

### 4. Menu Bar Widget (Electron / Tauri)

Show the current agent activity in your system tray. Update the tray title and tooltip on every event.

```typescript
import { createAISnitchClient, formatStatusLine, describeEvent } from '@aisnitch/client';
import WebSocket from 'ws';

const client = createAISnitchClient({ WebSocketClass: WebSocket as any });

let sessionCounter = 0;
const sessionMap = new Map<string, number>();

client.on('event', (e) => {
  // 📖 Assign numbered sessions: #1, #2, #3...
  if (!sessionMap.has(e['aisnitch.sessionid'])) {
    sessionMap.set(e['aisnitch.sessionid'], ++sessionCounter);
  }
  const num = sessionMap.get(e['aisnitch.sessionid'])!;

  // 📖 Update tray icon and text
  tray.setTitle(formatStatusLine(e, num));
  // → "#1 ~/myproject — claude-code is thinking..."

  tray.setToolTip(
    `AISnitch — ${client.sessions?.count ?? 0} active session(s)`,
  );

  // 📖 Show native notification on events that need attention
  if (e.type === 'agent.asking_user') {
    new Notification({
      title: `${e['aisnitch.tool']} needs input`,
      body: describeEvent(e),
    }).show();
  }
});

client.on('disconnected', () => {
  tray.setTitle('AISnitch — offline');
});
```

---

### 5. CI / Slack / Discord Bot

Post activity summaries to team channels. Notify when an agent finishes, errors out, or needs attention.

```typescript
import { createAISnitchClient, filters, describeEvent } from '@aisnitch/client';
import WebSocket from 'ws';

const client = createAISnitchClient({ WebSocketClass: WebSocket as any });

// 📖 Post to Slack when agents need human input or hit errors
client.on('event', (e) => {
  if (filters.needsAttention(e)) {
    postToSlack({
      channel: '#ai-agents',
      text: `⚠️ ${describeEvent(e)}`,
      emoji: e.type === 'agent.error' ? ':rotating_light:' : ':wave:',
    });
  }
});

// 📖 Daily summary: post session stats every hour
setInterval(() => {
  const sessions = client.sessions?.getAll() ?? [];
  if (sessions.length === 0) return;

  const summary = sessions
    .map((s) => `• *${s.tool}* — ${s.lastActivity} (${s.eventCount} events)`)
    .join('\n');

  postToSlack({
    channel: '#ai-agents',
    text: `📊 *Active AI sessions:*\n${summary}`,
  });
}, 3_600_000);

// 📖 Alert on rate limits across any tool
client.on('event', (e) => {
  if (e.type === 'agent.error' && e.data.errorType === 'rate_limit') {
    postToSlack({
      channel: '#ai-agents',
      text: `🚨 Rate limit hit on *${e['aisnitch.tool']}*: ${e.data.errorMessage ?? 'unknown'}`,
    });
  }
});
```

---

## Framework Integration

### React

A complete, production-ready React hook with TypeScript support:

```tsx
import { useEffect, useRef, useState } from 'react';
import {
  createAISnitchClient,
  type AISnitchClient,
  type AISnitchClientOptions,
  type AISnitchEvent,
  type SessionState,
  type WelcomeMessage,
} from '@aisnitch/client';

/**
 * 📖 Core hook — connects to AISnitch and returns live events, sessions, and connection state.
 * Handles connect/disconnect/cleanup automatically.
 */
export function useAISnitch(options?: AISnitchClientOptions) {
  const [events, setEvents] = useState<AISnitchEvent[]>([]);
  const [latestEvent, setLatestEvent] = useState<AISnitchEvent | null>(null);
  const [sessions, setSessions] = useState<SessionState[]>([]);
  const [connected, setConnected] = useState(false);
  const [welcome, setWelcome] = useState<WelcomeMessage | null>(null);
  const clientRef = useRef<AISnitchClient | null>(null);

  useEffect(() => {
    const client = createAISnitchClient(options);
    clientRef.current = client;

    client.on('connected', (w) => {
      setConnected(true);
      setWelcome(w);
    });

    client.on('disconnected', () => setConnected(false));

    client.on('event', (e) => {
      setLatestEvent(e);
      setEvents((prev) => [...prev.slice(-499), e]);
      // 📖 Refresh sessions from the built-in tracker
      setSessions(client.sessions?.getAll() ?? []);
    });

    return () => client.destroy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = () => {
    setEvents([]);
    setLatestEvent(null);
  };

  return { events, latestEvent, sessions, connected, welcome, clear };
}
```

**Usage in a component:**

```tsx
function AIActivityPanel() {
  const { events, sessions, connected, welcome } = useAISnitch();

  return (
    <div>
      <header>
        {connected
          ? `🟢 AISnitch v${welcome?.version} — ${sessions.length} session(s)`
          : '🔴 Disconnected — reconnecting...'}
      </header>

      {sessions.map((s) => (
        <div key={s.sessionId}>
          <strong>[{s.tool}]</strong> {s.lastActivity}
          <span> ({s.eventCount} events)</span>
        </div>
      ))}

      <ul>
        {events.map((e) => (
          <li key={e.id}>
            <code>{e['aisnitch.tool']}</code> — {e.type}
            {e.data.activeFile && ` → ${e.data.activeFile}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**Filtered hook — only get events you care about:**

```tsx
import { filters, type EventFilter } from '@aisnitch/client';

export function useAISnitchFiltered(filter: EventFilter) {
  const { events, ...rest } = useAISnitch();
  const filtered = events.filter(filter);
  return { events: filtered, ...rest };
}

// Usage:
const { events } = useAISnitchFiltered(filters.byTool('claude-code'));
const { events } = useAISnitchFiltered(filters.isCoding);
const { events } = useAISnitchFiltered(filters.needsAttention);
```

---

### Vue 3

```typescript
import { onMounted, onUnmounted, ref, type Ref } from 'vue';
import {
  createAISnitchClient,
  type AISnitchClient,
  type AISnitchEvent,
  type SessionState,
  type WelcomeMessage,
} from '@aisnitch/client';

export function useAISnitch(url?: string) {
  const events: Ref<AISnitchEvent[]> = ref([]);
  const latestEvent: Ref<AISnitchEvent | null> = ref(null);
  const sessions: Ref<SessionState[]> = ref([]);
  const connected = ref(false);
  const welcome: Ref<WelcomeMessage | null> = ref(null);
  let client: AISnitchClient | null = null;

  onMounted(() => {
    client = createAISnitchClient(url ? { url } : undefined);

    client.on('connected', (w) => {
      connected.value = true;
      welcome.value = w;
    });

    client.on('disconnected', () => {
      connected.value = false;
    });

    client.on('event', (e) => {
      latestEvent.value = e;
      events.value = [...events.value.slice(-499), e];
      sessions.value = client?.sessions?.getAll() ?? [];
    });
  });

  onUnmounted(() => {
    client?.destroy();
  });

  function clear() {
    events.value = [];
    latestEvent.value = null;
  }

  return { events, latestEvent, sessions, connected, welcome, clear };
}
```

**Usage in a component:**

```vue
<script setup lang="ts">
import { useAISnitch } from './composables/useAISnitch';
import { describeEvent } from '@aisnitch/client';

const { events, sessions, connected, welcome } = useAISnitch();
</script>

<template>
  <div>
    <p v-if="connected">
      🟢 AISnitch v{{ welcome?.version }} — {{ sessions.length }} session(s)
    </p>
    <p v-else>🔴 Disconnected — reconnecting...</p>

    <div v-for="s in sessions" :key="s.sessionId">
      <strong>[{{ s.tool }}]</strong> {{ s.lastActivity }}
    </div>

    <ul>
      <li v-for="e in events" :key="e.id">
        {{ describeEvent(e) }}
      </li>
    </ul>
  </div>
</template>
```

---

## API Reference

### `createAISnitchClient(options?)`

Factory function — creates a client and connects immediately. **This is the recommended entry point.**

```typescript
import { createAISnitchClient } from '@aisnitch/client';

const client = createAISnitchClient({
  url: 'ws://127.0.0.1:4820',       // default
  autoReconnect: true,                // default
  reconnectIntervalMs: 3000,          // initial delay — default: 3s
  maxReconnectIntervalMs: 30000,      // backoff cap — default: 30s
  WebSocketClass: WebSocket,          // required in Node.js (pass `ws`)
  trackSessions: true,                // default — enables client.sessions
});
```

Returns an `AISnitchClient` instance.

---

### `AISnitchClient`

The core class. Manages the WebSocket connection, event parsing, reconnection, and session tracking.

#### Methods

| Method | Description |
|---|---|
| `connect()` | Open the WebSocket connection. Safe to call multiple times. |
| `disconnect()` | Close cleanly. Suppresses auto-reconnect. |
| `destroy()` | Full teardown — disconnect + remove all listeners. Permanent. |
| `on(event, callback)` | Subscribe to an event. Returns an unsubscribe function. |
| `off(event, callback)` | Remove a specific listener. |

#### Properties

| Property | Type | Description |
|---|---|---|
| `connected` | `boolean` | Whether the WebSocket is currently open |
| `welcome` | `WelcomeMessage \| null` | Last welcome message received |
| `sessions` | `SessionTracker \| null` | Built-in session tracker (if `trackSessions` is true) |

#### Events

```typescript
// 📖 All validated AISnitch events (CloudEvents envelope)
client.on('event', (e: AISnitchEvent) => { ... });

// 📖 Fires when WebSocket opens AND welcome message is received
client.on('connected', (welcome: WelcomeMessage) => { ... });

// 📖 Fires on WebSocket close
client.on('disconnected', () => { ... });

// 📖 Fires on WebSocket errors (connection refused, etc.)
client.on('error', (err: Error) => { ... });
```

#### Auto-Reconnect Behavior

When the connection drops and `autoReconnect` is `true` (default), the client retries with exponential backoff:

```
Attempt 1 → wait 3s
Attempt 2 → wait 6s
Attempt 3 → wait 12s
Attempt 4 → wait 24s
Attempt 5+ → wait 30s (cap)
```

The timer resets to 3s as soon as a connection succeeds. Calling `disconnect()` or `destroy()` stops all reconnection attempts.

#### Unsubscribe Pattern

```typescript
// on() returns an unsubscribe function
const unsub = client.on('event', handler);

// Later:
unsub(); // removes the listener

// Or use off() directly:
client.off('event', handler);
```

---

### `SessionTracker`

Tracks active AI tool sessions in real-time. Available via `client.sessions` when `trackSessions` is enabled (default).

Sessions are created on the first event for a given `aisnitch.sessionid` and removed on `session.end`.

#### Methods

| Method | Returns | Description |
|---|---|---|
| `get(sessionId)` | `SessionState \| undefined` | Get a single session by ID |
| `getAll()` | `SessionState[]` | All currently active sessions |
| `getByTool(tool)` | `SessionState[]` | Filter sessions by tool name |
| `clear()` | `void` | Remove all tracked sessions |

#### Properties

| Property | Type | Description |
|---|---|---|
| `count` | `number` | Number of active sessions |

#### `SessionState`

```typescript
interface SessionState {
  tool: ToolName;            // 'claude-code', 'opencode', etc.
  sessionId: string;         // unique session identifier
  project?: string;          // project name (if known)
  cwd?: string;              // working directory (if known)
  lastEvent: AISnitchEvent;  // most recent event
  lastActivity: string;      // human-readable description of last activity
  eventCount: number;        // total events received in this session
  startedAt: string;         // ISO timestamp of first event
}
```

#### Example

```typescript
const client = createAISnitchClient({ WebSocketClass: WebSocket as any });

// Wait for some events, then query sessions:
const all = client.sessions.getAll();
// → [{ tool: 'claude-code', project: 'myapp', eventCount: 42, ... }]

const claude = client.sessions.getByTool('claude-code');
// → only Claude Code sessions

const single = client.sessions.get('claude-code:myapp:p12345');
// → one specific session or undefined
```

---

### Filters

Composable, typed predicate functions. Each returns `(event: AISnitchEvent) => boolean`.

```typescript
import { filters } from '@aisnitch/client';
```

| Filter | Signature | Matches |
|---|---|---|
| `filters.byTool(tool)` | `(ToolName) => EventFilter` | Events from a specific AI tool |
| `filters.byType(type)` | `(AISnitchEventType) => EventFilter` | A single event type |
| `filters.byTypes(...types)` | `(...AISnitchEventType[]) => EventFilter` | Any of several event types |
| `filters.byProject(name)` | `(string) => EventFilter` | Events from a specific project |
| `filters.needsAttention` | `EventFilter` | `agent.asking_user` or `agent.error` |
| `filters.isCoding` | `EventFilter` | `agent.coding` or `agent.tool_call` |
| `filters.isActive` | `EventFilter` | Everything except `agent.idle` and `session.end` |

#### Composing Filters

Filters are standard predicates — compose them with `Array.filter`, `&&`, or any pattern you prefer:

```typescript
// Chain with Array.filter
const claudeCoding = allEvents
  .filter(filters.byTool('claude-code'))
  .filter(filters.isCoding);

// Combine in a callback
client.on('event', (e) => {
  if (filters.byTool('claude-code')(e) && filters.isCoding(e)) {
    console.log('Claude is coding:', e.data.activeFile);
  }
});

// Create composite filters
const urgentClaude = (e: AISnitchEvent) =>
  filters.byTool('claude-code')(e) && filters.needsAttention(e);
```

---

### `describeEvent(event)`

Generate a short human-readable description of any AISnitch event.

```typescript
import { describeEvent } from '@aisnitch/client';

describeEvent(event);
// → "claude-code is editing code → src/index.ts [myproject]"
// → "codex is calling a tool → Bash"
// → "opencode encountered an error — Rate limit exceeded"
// → "claude-code completed the task [myapp]"
```

Includes contextual details when available: active file, tool name, tool input, error message, project name.

---

### `formatStatusLine(event, sessionNumber?)`

Generate a numbered status line for dashboards and TUIs.

```typescript
import { formatStatusLine } from '@aisnitch/client';

formatStatusLine(event, 3);
// → "#3 /home/user/myproject — claude-code is thinking..."

formatStatusLine(event);
// → "/home/user/myproject — claude-code is thinking..."
```

---

### `eventToMascotState(event)`

Map an event to a mood/animation/color state for animated companions.

```typescript
import { eventToMascotState, type MascotState } from '@aisnitch/client';

const state: MascotState = eventToMascotState(event);
```

```typescript
interface MascotState {
  mood: 'idle' | 'thinking' | 'working' | 'waiting' | 'celebrating' | 'panicking';
  animation: string;  // suggested animation name (e.g. 'type', 'ponder', 'shake')
  color: string;      // hex accent color (e.g. '#f59e0b')
  label: string;      // short label (e.g. 'Coding', 'Thinking...')
  detail?: string;    // optional context (tool name, file path, error message)
}
```

See [Use Case #3](#3-animated-mascot--companion-app) for the complete mood mapping table.

---

### `parseEvent(raw)` / `parseWelcome(raw)`

Low-level Zod-powered parsers. These are what the client uses internally — exposed for advanced use cases.

```typescript
import { parseEvent, parseWelcome } from '@aisnitch/client';

const event = parseEvent(someUnknownData);
// → AISnitchEvent | null (never throws)

const welcome = parseWelcome(someUnknownData);
// → WelcomeMessage | null (never throws)
```

Both return `null` on invalid input — they never throw. Useful if you're building a custom WebSocket handler or parsing events from a different source.

---

## TypeScript Integration

The SDK is written in TypeScript with strict types throughout. Every type is exported and ready for use.

### Type Imports

```typescript
import type {
  AISnitchEvent,       // full event envelope (CloudEvents + AISnitch extensions)
  AISnitchEventData,   // normalized payload (data.*)
  AISnitchEventType,   // 'session.start' | 'agent.thinking' | ... (12 types)
  ToolName,            // 'claude-code' | 'opencode' | ... (17 tools)
  ErrorType,           // 'rate_limit' | 'context_overflow' | 'tool_failure' | 'api_error'
  ToolInput,           // { filePath?: string; command?: string }
  WelcomeMessage,      // welcome payload on connection
  MascotState,         // mood/animation/color for companions
  SessionState,        // tracked session snapshot
  AISnitchClientOptions,
} from '@aisnitch/client';
```

### Constant Arrays

```typescript
import {
  AISNITCH_EVENT_TYPES,  // readonly ['session.start', 'session.end', ...] (12 items)
  TOOL_NAMES,            // readonly ['claude-code', 'opencode', ...] (17 items)
  ERROR_TYPES,           // readonly ['rate_limit', 'context_overflow', ...] (4 items)
} from '@aisnitch/client';

// Use in type guards, switch statements, UI dropdowns, etc.
for (const type of AISNITCH_EVENT_TYPES) {
  console.log(type); // fully typed as AISnitchEventType
}
```

### Full Autocompletion

The event types and tool names are string literal unions, so your editor gives you full autocompletion:

```typescript
// ✅ Autocompletes all 12 types
filters.byType('agent.'); // → agent.thinking, agent.coding, agent.tool_call, ...

// ✅ Autocompletes all 17 tools
filters.byTool('c'); // → claude-code, codex, copilot-cli, cline, continue, cursor

// ✅ Event fields are fully typed
client.on('event', (e) => {
  e.type;                  // AISnitchEventType
  e['aisnitch.tool'];     // ToolName
  e.data.errorType;       // 'rate_limit' | 'context_overflow' | ... | undefined
  e.data.toolInput?.filePath; // string | undefined
});
```

---

## Troubleshooting

### "Connection refused" / client never connects

AISnitch daemon must be running. Start it first:

```bash
aisnitch start --daemon   # background daemon
# or
aisnitch start            # foreground with TUI
```

Then verify:

```bash
curl http://127.0.0.1:4821/health
# → { "status": "ok", ... }
```

### "No events received"

1. Check that at least one adapter is set up: `aisnitch adapters`
2. Try mock mode: `aisnitch start --mock all` (generates fake events)
3. Verify your consumer is connected: check the `consumers` count in `/health`

### Node.js: "Cannot find module 'ws'"

`ws` is not bundled with the SDK — install it separately:

```bash
pnpm add ws
pnpm add -D @types/ws
```

Then pass it to the client:

```typescript
import WebSocket from 'ws';
const client = createAISnitchClient({ WebSocketClass: WebSocket as any });
```

### "No WebSocket implementation found"

This means you're in Node.js and didn't pass `WebSocketClass`. Browsers have `WebSocket` natively, Node.js doesn't. See above.

### Events arrive but fail validation (silently dropped)

The SDK uses Zod to validate every incoming message. If events are being dropped:

1. Check AISnitch daemon version matches the SDK version
2. Use `parseEvent()` directly to debug: `const result = parseEvent(raw); if (!result) console.log('Invalid:', raw);`

### Auto-reconnect isn't working

- `disconnect()` intentionally disables reconnect. Use `connect()` to resume.
- `destroy()` is permanent — the client cannot be reused after destroy.
- Check your `autoReconnect` option (default: `true`).

---

## Event Types Reference

| Type | Description | Example trigger |
|---|---|---|
| `session.start` | A tool session began | Tool launched, first hook received |
| `session.end` | Session closed | Tool exited, process disappeared |
| `task.start` | User submitted a prompt | New user message |
| `task.complete` | Task finished | Response complete |
| `agent.thinking` | Model is reasoning | Thinking block, reflection |
| `agent.streaming` | Model is generating output | Text streaming |
| `agent.coding` | Model is editing files | Write, Edit, MultiEdit |
| `agent.tool_call` | Model used a tool | Bash, Grep, web search |
| `agent.asking_user` | Waiting for human input | Permission prompt |
| `agent.idle` | No activity (timeout) | 120s silence (configurable) |
| `agent.error` | Something went wrong | Rate limit, API error |
| `agent.compact` | Context compaction | Memory cleanup |

### Recognized Tool Names

`claude-code` `opencode` `gemini-cli` `codex` `goose` `copilot-cli` `cursor` `aider` `amp` `cline` `continue` `windsurf` `qwen-code` `openclaw` `openhands` `kilo` `unknown`

---

## License

Apache-2.0, © [Vanessa Depraute / vava-nessa](https://github.com/vava-nessa).
