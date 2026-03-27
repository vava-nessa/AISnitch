# Core Pipeline

## Purpose

AISnitch is explicitly memory-only in the MVP, so the runtime core is a transit pipeline rather than a storage layer. Events come in through hooks or IPC, get normalized and enriched in-process, then fan out immediately to connected consumers.

## Modules

The current engine lives under [`src/core/engine/`](../src/core/engine/):

- [`event-bus.ts`](../src/core/engine/event-bus.ts) validates every published payload with Zod before emitting it to catch-all and type-specific subscribers
- [`ws-server.ts`](../src/core/engine/ws-server.ts) exposes the live localhost WebSocket stream and sends a welcome message describing currently enabled tools
- [`ring-buffer.ts`](../src/core/engine/ring-buffer.ts) absorbs per-consumer backpressure with oldest-first dropping so one slow client cannot stall the daemon
- [`http-receiver.ts`](../src/core/engine/http-receiver.ts) accepts `POST /hooks/:tool` and exposes `GET /health`
- [`uds-server.ts`](../src/core/engine/uds-server.ts) ingests out-of-process events over NDJSON Unix domain sockets
- [`context-detector.ts`](../src/core/engine/context-detector.ts) enriches events with terminal, cwd, pid, and instance metadata
- [`pipeline.ts`](../src/core/engine/pipeline.ts) wires all of the above together and provides one status surface for future CLI and TUI commands

## Runtime Flow

1. A hook request or UDS message enters the process.
2. The payload is normalized into the shared AISnitch event envelope when needed.
3. `Pipeline.publishEvent()` runs best-effort context enrichment before fan-out.
4. `EventBus` validates and emits the final event in-process.
5. `WSServer` broadcasts the serialized event to all connected localhost consumers.

This central publish path is the current equivalent of the future `BaseAdapter.emit()` hook mentioned in the task specs. That abstraction does not exist yet, so enrichment is applied at the shared pipeline boundary instead of inside adapter code that is not there yet.

## Resilience Rules

- WebSocket, HTTP, and UDS listeners bind to localhost only
- Invalid hook bodies return `400` instead of crashing the process
- Unknown tools return `404`
- UDS socket startup probes and removes stale socket files before binding
- Context lookups use short timeouts and degrade gracefully when PID inspection fails
- Slow WebSocket consumers drop old buffered messages instead of growing memory usage unbounded

## Verification

The engine is covered by focused Vitest suites for the bus, ring buffer, WebSocket server, context detector, and full pipeline orchestration. At this stage the core pipeline passes `pnpm check`, which runs linting, type-checking, tests, and the production build from the repository root.
