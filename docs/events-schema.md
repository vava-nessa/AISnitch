# Event Schema

## Purpose

AISnitch normalizes every adapter-specific signal into one shared event envelope. The contract is based on CloudEvents 1.0 core attributes plus a small set of AISnitch-specific extensions:

- `specversion`
- `id`
- `source`
- `type`
- `time`
- `aisnitch.tool`
- `aisnitch.sessionid`
- `aisnitch.seqnum`
- `data`

## Why this shape

The project needs a transport-friendly envelope that stays understandable outside the codebase. CloudEvents gives that baseline, while the AISnitch fields carry the session and tool metadata the TUI and future consumers actually need.

## Current implementation

The runtime schema lives in [`src/core/events/schema.ts`](../src/core/events/schema.ts). It currently enforces:

- UUIDv7 IDs
- a non-empty CloudEvents `source`
- one of the 12 normalized AISnitch event types
- an RFC3339/ISO timestamp
- strict payload validation for known normalized fields

The factory in [`src/core/events/factory.ts`](../src/core/events/factory.ts) generates `specversion`, `id`, and `time`, then validates the full payload before returning it.

## CESP compatibility

The compatibility layer in [`src/core/events/cesp.ts`](../src/core/events/cesp.ts) maps normalized AISnitch events into CESP-style categories for future integrations such as PeonPing-like consumers. Not every normalized event has a direct CESP equivalent, so some mappings intentionally return `null`.
