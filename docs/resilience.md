# Resilience Patterns — AISnitch

> Technical reference for AISnitch's resilience primitives: circuit breakers, retry logic, timeouts, and graceful shutdown.

---

## Table of Contents

1. [Circuit Breaker](#circuit-breaker)
2. [Retry with Backoff](#retry-with-backoff)
3. [Timeouts](#timeouts)
4. [Graceful Shutdown](#graceful-shutdown)
5. [Shared Instances](#shared-instances)
6. [Usage Examples](#usage-examples)

---

## Circuit Breaker

Prevents cascading failures when an operation repeatedly fails.

### State Machine

```
CLOSED ──[N failures]──→ OPEN (rejecting calls)
  ↑                           │
  │                    [halfOpenAfterMs elapsed]
  │                           ↓
  │                      HALF-OPEN (1 test call)
  │                           │
  │                 [test call succeeds]
  │                           ↓
  └────────[reset]────────────┘
```

### States

| State | Behavior |
|-------|----------|
| **CLOSED** | Normal operation, requests pass through |
| **OPEN** | Failing fast, requests rejected immediately with `CircuitOpenError` |
| **HALF-OPEN** | One test call allowed to check recovery |

### Basic Usage

```typescript
import { CircuitBreaker } from './core/circuit-breaker.js';

const breaker = new CircuitBreaker({
  id: 'claude-code.emit',
  failureThreshold: 5,
  halfOpenAfterMs: 30_000,
  windowMs: 60_000,
});

async function safeEmit(event: AISnitchEvent) {
  try {
    return await breaker.execute(() => adapter.emit(event));
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      console.warn('Adapter circuit is OPEN, skipping emit');
      return false;
    }
    throw error;
  }
}
```

### Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `failureThreshold` | 5 | Failures before opening |
| `halfOpenAfterMs` | 30,000 | Time before half-open |
| `windowMs` | 60,000 | Time window for failure counting |
| `resetOnSuccess` | true | Reset counter on any success |
| `shouldCountAsFailure` | `isRetryableError` | Which errors count |

---

## Retry with Backoff

Exponential backoff for transient failures.

### Basic Usage

```typescript
import { withRetry, DefaultRetryOptions } from './core/retry.js';

const result = await withRetry(
  () => fetchHealth(daemonPort),
  {
    ...DefaultRetryOptions,
    context: 'daemon-health-check',
    attempts: 3,
    delayMs: 500,
    backoff: 2,
  },
);
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `attempts` | 3 | Max retry attempts |
| `delayMs` | 500 | Initial delay |
| `backoff` | 2 | Multiplicative factor |
| `maxTotalDelayMs` | 30,000 | Max total wait time |
| `jitter` | true | Add ±25% random jitter |
| `shouldRetry` | `isRetryableError` | Which errors trigger retry |
| `context` | — | Log label for tracing |

### Exponential Backoff

```
Attempt 1: wait 500ms
Attempt 2: wait 1000ms (500 × 2)
Attempt 3: wait 2000ms (1000 × 2)
```

With jitter (±25%):
```
Attempt 1: 375-625ms
Attempt 2: 750-1250ms
Attempt 3: 1500-2500ms
```

### Fire-and-Forget Retry

Non-critical background tasks:

```typescript
import { fireAndForgetRetry } from './core/retry.js';

fireAndForgetRetry(
  () => sendMetrics(metrics),
  { context: 'metrics-report', attempts: 2 },
);
// Doesn't fail the main flow
```

---

## Timeouts

Prevents indefinite blocking on slow operations.

### Named Timeouts

```typescript
import { DEFAULT_TIMEOUTS, withTimeout } from './core/timeout.js';

// Use named timeout
const content = await withTimeout(
  readFile(transcriptPath, 'utf8'),
  DEFAULT_TIMEOUTS.fileOperation,
  'claude-transcript-read',
);

// Custom timeout
const result = await withTimeout(
  someAsyncOperation(),
  5_000,
  'my-operation',
);
```

### Default Timeouts

| Name | Value | Use Case |
|------|-------|----------|
| `fileOperation` | 5s | File reads/writes |
| `httpRequest` | 30s | HTTP requests |
| `processDetection` | 3s | Process polling |
| `adapterStartup` | 10s | Adapter initialization |
| `adapterShutdown` | 5s | Adapter cleanup |
| `daemonShutdown` | 30s | Full shutdown |
| `wsConnection` | 10s | WebSocket connect |
| `pipelineStartup` | 15s | Pipeline start |

### TimeoutWarning

Best-effort without throwing:

```typescript
import { timeoutWarning, DEFAULT_TIMEOUTS } from './core/timeout.js';

await timeoutWarning(
  listProcesses(processListCommand),
  DEFAULT_TIMEOUTS.processDetection,
  'claude-process-detection',
);
// Logs warning if timed out, but continues
```

---

## Graceful Shutdown

Coordinated shutdown with per-component timeouts.

### Shutdown Order

Components stop in reverse dependency order:

```
1. cleanupFns      — PID/state file cleanup
2. eventBus       — Unsubscribe all listeners
3. wsServer       — Close WebSocket (disconnect consumers)
4. udsServer      — Close Unix Domain Socket
5. httpReceiver   — Close HTTP server
6. adapterRegistry — Stop all adapters
```

### Basic Usage

```typescript
import { shutdownInOrder, DEFAULT_TIMEOUTS } from './core/graceful-shutdown.js';

await shutdownInOrder(
  {
    eventBus: pipeline.getEventBus(),
    wsServer: pipeline.getWSServer(),
    httpReceiver: pipeline.getHTTPReceiver(),
    adapterRegistry: pipeline.getAdapterRegistry(),
  },
  {
    eventBus: 1_000,
    wsServer: 3_000,
    httpReceiver: 2_000,
    adapterRegistry: 5_000,
  },
  'AISnitch pipeline',
);
```

### GracefulShutdownManager

Signal coordination with idempotent handlers:

```typescript
import { GracefulShutdownManager } from './core/graceful-shutdown.js';

const manager = new GracefulShutdownManager({
  onShutdown: async (signal) => {
    logger.info({ signal }, 'Initiating graceful shutdown');
    await pipeline.stop();
    await cleanupFiles();
  },
  exitCode: 0,
  exitDelayMs: 100,
});

process.on('SIGTERM', manager.handler);
process.on('SIGINT', manager.handler);
```

---

## Shared Instances

Pre-configured singletons for common operations:

```typescript
import { SHARED_BREAKERS, DEFAULT_TIMEOUTS } from './core/index.js';

// Use shared circuit breakers
await SHARED_BREAKERS.adapterEmit.execute(() => adapter.emit(event));
await SHARED_BREAKERS.fileSystem.execute(() => readFile(path));
await SHARED_BREAKERS.httpRequest.execute(() => fetch(url));

// Use named timeouts
const timeout = DEFAULT_TIMEOUTS.fileOperation;
```

### Shared Circuit Breakers

| Instance | Threshold | Window | Half-Open | Use Case |
|----------|-----------|--------|-----------|----------|
| `adapterEmit` | 5 failures | 60s | 30s | Adapter emit calls |
| `fileSystem` | 10 failures | 60s | 30s | File operations |
| `httpRequest` | 3 failures | 30s | 15s | HTTP requests |
| `processDetection` | 20 failures | 60s | 10s | Process polling |

---

## Usage Examples

### Adapter Emit with All Primitives

```typescript
import { withRetry } from './core/retry.js';
import { withTimeout, DEFAULT_TIMEOUTS } from './core/timeout.js';
import { SHARED_BREAKERS } from './core/circuit-breaker.js';

async function resilientEmit(event: AISnitchEvent): Promise<boolean> {
  return await withRetry(
    () =>
      withTimeout(
        SHARED_BREAKERS.adapterEmit.execute(() => adapter.emit(event)),
        DEFAULT_TIMEOUTS.adapterStartup,
        'adapter.emit',
      ),
    {
      ...DefaultRetryOptions,
      context: 'adapter.emit',
      attempts: 3,
      shouldRetry: isRetryableError,
    },
  );
}
```

### Process Detection with Circuit Breaker

```typescript
import { SHARED_BREAKERS } from './core/circuit-breaker.js';

async function detectClaudeProcesses(): Promise<ClaudeProcessInfo[]> {
  return SHARED_BREAKERS.processDetection.execute(() =>
    listProcesses(processListCommand),
  );
}
```

### Config Loading with Timeout

```typescript
import { withTimeout, DEFAULT_TIMEOUTS } from './core/timeout.js';
import { fromPromise } from './core/result.js';
import { NetworkError } from './core/errors.js';

const configResult = await withTimeout(
  fromPromise(
    fetch('http://127.0.0.1:4821/config'),
    (reason) => new NetworkError('Config fetch failed', 'NETWORK_HTTP_CONNECT_FAILED'),
  ),
  DEFAULT_TIMEOUTS.httpRequest,
  'config-fetch',
);
```

---

## Error Flow Decision Tree

```
Error occurred
    │
    ├── isRetryableError(error)?
    │       ├── YES → withRetry() + Circuit Breaker
    │       └── NO  → Propagate or handle specially
    │
    ├── CircuitOpenError?
    │       └── Log warning, skip operation, continue
    │
    ├── TimeoutError?
    │       └── Log warning, use fallback/default
    │
    └── ValidationError?
            └── Log error, fix input, retry with valid data
```
