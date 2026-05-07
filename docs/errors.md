# Error Handling — AISnitch

> Complete reference for AISnitch's error taxonomy, how to handle errors, and recovery patterns.

## Error Hierarchy

All AISnitch errors inherit from `AISnitchError`:

```
Error
└── AISnitchError
    ├── AdapterError        — Adapter lifecycle & parsing errors
    ├── PipelineError       — Pipeline orchestration errors
    ├── ValidationError      — Zod schema validation failures
    ├── NetworkError        — HTTP/WebSocket/UDS errors
    ├── TimeoutError         — Async operation timeouts
    └── CircuitOpenError    — Circuit breaker blocking
```

## Error Codes

Each error carries a machine-readable `code` field:

### Adapter Errors

| Code | Meaning |
|------|---------|
| `ADAPTER_*_ERROR` | Generic adapter error |
| `ADAPTER_*_FILE_IO_ERROR` | File system error (retryable) |
| `ADAPTER_*_NETWORK_ERROR` | Network error (retryable) |
| `ADAPTER_*_PROCESS_DETECT_ERROR` | Process detection failed (retryable) |

### Pipeline Errors

| Code | Meaning |
|------|---------|
| `PIPELINE_ERROR` | Generic pipeline error |
| `PIPELINE_WS_START_FAILED` | WebSocket server failed to start |
| `PIPELINE_HTTP_START_FAILED` | HTTP receiver failed to start |
| `PIPELINE_UDS_START_FAILED` | UDS server failed to start |

### Validation Errors

| Code | Meaning |
|------|---------|
| `VALIDATION_ERROR` | Generic validation failure |
| `VALIDATION_JSON_PARSE` | JSON parsing failed |
| `VALIDATION_CONFIG_INVALID` | Config file invalid |
| `VALIDATION_EVENT_DATA_INVALID` | Event data failed schema validation |

### Network Errors

| Code | Meaning |
|------|---------|
| `NETWORK_ERROR` | Generic network error |
| `NETWORK_HTTP_CONNECT_FAILED` | HTTP connection failed (retryable) |
| `NETWORK_WS_CONNECT_FAILED` | WebSocket connection failed (retryable) |
| `NETWORK_TIMEOUT` | Network timeout (retryable) |

### Timeout Errors

| Code | Meaning |
|------|---------|
| `TIMEOUT_EXCEEDED` | Operation exceeded deadline |
| `TIMEOUT_INVALID_VALUE` | Timeout value was invalid (<= 0) |
| `TIMEOUT_SHUTDOWN` | Graceful shutdown exceeded deadline |

## Handling Errors

### Basic try/catch

```typescript
import { AISnitchError, isRetryableError } from './core/errors.js';

try {
  await pipeline.start();
} catch (error) {
  if (isAISnitchError(error)) {
    console.error(`AISnitch error ${error.code}: ${error.message}`);
    console.error('Context:', error.context);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### Retryable vs Non-Retryable

```typescript
import { isRetryableError } from './core/errors.js';

try {
  await operation();
} catch (error) {
  if (isRetryableError(error)) {
    // Safe to retry — network timeout, file locked, etc.
    console.warn('Transient error, will retry...');
    await withRetry(() => operation(), { context: 'operation' });
  } else {
    // Don't retry — validation error, auth failure, etc.
    throw error;
  }
}
```

### Result Type Pattern

For explicit error handling without exceptions:

```typescript
import { fromPromise, isOk } from './core/result.js';

const result = await fromPromise(
  fetch('http://127.0.0.1:4821/health'),
  (reason) => new NetworkError(
    'Health check failed',
    'NETWORK_HTTP_CONNECT_FAILED',
    { cause: reason },
  ),
);

if (isOk(result)) {
  const health = await result.value.json();
  console.log('Daemon healthy:', health);
} else {
  console.error('Health check failed:', result.error.message);
}
```

## Global Error Handlers

AISnitch registers global handlers to prevent crashes:

```typescript
// Uncaught exceptions
process.on('uncaughtException', (error, origin) => {
  logger.error({ error, origin }, 'Uncaught exception — initiating shutdown');
  // Graceful shutdown attempt
  process.exit(1);
});

// Unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.warn({ reason }, 'Unhandled promise rejection');
  // Track but don't crash
});
```

## Custom Error Creation

```typescript
import { AdapterError, ValidationError, NetworkError } from './core/errors.js';

// Adapter-specific error
throw new AdapterError(
  'Claude Code transcript read failed',
  'ADAPTER_CLAUDE_CODE_FILE_IO_ERROR',
  { filePath: transcriptPath, cause: error },
);

// Validation error
const result = ConfigSchema.safeParse(raw);
if (!result.success) {
  throw new ValidationError(
    'Invalid config format',
    'VALIDATION_CONFIG_INVALID',
    { issues: result.error.issues },
  );
}

// Network error
throw new NetworkError(
  'Health endpoint unreachable',
  'NETWORK_HTTP_CONNECT_FAILED',
  { host: '127.0.0.1', port: 4821 },
);
```

## Logging Errors

All errors serialize cleanly to pino:

```typescript
logger.error(
  { error: myError },
  'Operation failed',
);
// Output: {"error":{"name":"AdapterError","code":"ADAPTER_CLAUDE_CODE_FILE_IO_ERROR","message":"...","context":{...},"stack":"..."}}
```

## Error Context

The `context` bag contains debugging information:

```typescript
const error = new AdapterError(
  'Transcript read failed',
  'ADAPTER_CLAUDE_CODE_FILE_IO_ERROR',
  { filePath: '/path/to/transcript.jsonl', errno: 'ENOENT' },
);

console.log(error.context.filePath); // '/path/to/transcript.jsonl'
console.log(error.context.errno);   // 'ENOENT'
```
