/**
 * @file src/__tests__/helpers.ts
 * @description Shared test helpers — mock WebSocket, event factories, and welcome message builders.
 */

import type { AISnitchEvent, AISnitchEventType, ToolName, WelcomeMessage } from '../types.js';

// ─── Mock WebSocket ──────────────────────────────────────────────────────────

/**
 * 📖 Minimal mock WebSocket for testing — simulates open/close/message lifecycle
 * without any real network connection. Tests control it via static methods.
 */
export class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  // 📖 Track all created instances for test assertions
  static instances: MockWebSocket[] = [];
  static reset(): void {
    MockWebSocket.instances = [];
  }

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;

  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  // 📖 Test helpers — simulate server behavior
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({});
  }

  simulateMessage(data: unknown): void {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    this.onmessage?.({ data: payload });
  }

  simulateClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({});
  }

  simulateError(): void {
    this.onerror?.({});
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  send(_data: string): void {
    // 📖 No-op — client SDK is read-only, never sends
  }
}

// ─── Event factory ───────────────────────────────────────────────────────────

let seqCounter = 0;

/** 📖 Create a valid AISnitchEvent for testing — all fields are overridable. */
export function makeEvent(overrides?: Partial<AISnitchEvent> & {
  data?: Partial<AISnitchEvent['data']>;
}): AISnitchEvent {
  seqCounter += 1;
  const type: AISnitchEventType = overrides?.type ?? 'agent.thinking';
  return {
    specversion: '1.0',
    id: `00000000-0000-7000-8000-${String(seqCounter).padStart(12, '0')}`,
    source: '/test',
    type,
    time: new Date().toISOString(),
    'aisnitch.tool': overrides?.['aisnitch.tool'] ?? 'claude-code',
    'aisnitch.sessionid': overrides?.['aisnitch.sessionid'] ?? 'test-session-1',
    'aisnitch.seqnum': overrides?.['aisnitch.seqnum'] ?? seqCounter,
    data: {
      state: type,
      ...overrides?.data,
    },
  };
}

/** 📖 Create a valid WelcomeMessage for testing. */
export function makeWelcome(overrides?: Partial<WelcomeMessage>): WelcomeMessage {
  return {
    type: 'welcome',
    version: '0.2.3',
    activeTools: ['claude-code', 'opencode'] as ToolName[],
    uptime: 42,
    ...overrides,
  };
}
