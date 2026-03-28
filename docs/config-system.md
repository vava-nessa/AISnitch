# Config System

## Purpose

AISnitch stores user preferences and daemon bootstrap values in `~/.aisnitch/config.json` by default. The path can be overridden with `AISNITCH_HOME`, which is useful for tests and isolated environments.

## Current implementation

The config stack is split across:

- [`src/core/config/schema.ts`](../src/core/config/schema.ts) for runtime validation
- [`src/core/config/defaults.ts`](../src/core/config/defaults.ts) for canonical defaults
- [`src/core/config/loader.ts`](../src/core/config/loader.ts) for file I/O and port resolution

## Stored values

The current config contract supports:

- `wsPort`
- `httpPort`
- `adapters`
- `autoUpdate`
- `idleTimeoutMs`
- `logLevel`

`autoUpdate` currently defaults to enabled with `manager: "auto"` and a zero interval, which means AISnitch checks for updates on every dashboard launch. The runtime then resolves the live install manager from the current binary layout (`npm`, `pnpm`, `bun`, or `brew`) before spawning a silent background upgrade worker.

Adapter overrides are intentionally partial. Users should be able to override one adapter without being forced to enumerate every supported tool.

## Port resolution

The loader includes `resolveAvailablePort()`, which probes the requested port first and then tries the next sequential ports up to a bounded retry count. This keeps local startup resilient when another process already owns the default port.
