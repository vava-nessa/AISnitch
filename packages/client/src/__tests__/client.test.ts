import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AISnitchClient, createAISnitchClient } from '../client.js';
import type { AISnitchEvent, WelcomeMessage } from '../types.js';
import { MockWebSocket, makeEvent, makeWelcome } from './helpers.js';

// 📖 Use fake timers for reconnect backoff tests
beforeEach(() => {
  vi.useFakeTimers();
  MockWebSocket.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AISnitchClient', () => {
  it('connects and receives welcome message', () => {
    const client = new AISnitchClient({
      WebSocketClass: MockWebSocket as never,
    });

    let receivedWelcome: WelcomeMessage | null = null;
    client.on('connected', (w: any) => { receivedWelcome = w; });

    client.connect();
    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage(makeWelcome());

    expect(receivedWelcome).not.toBeNull();
    expect(receivedWelcome?.version).toBe('0.2.9');
    expect(client.welcome).not.toBeNull();
    client.destroy();
  });

  it('emits parsed events', () => {
    const client = new AISnitchClient({
      WebSocketClass: MockWebSocket as never,
    });

    const events: AISnitchEvent[] = [];
    client.on('event', (e) => events.push(e));

    client.connect();
    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage(makeEvent({ type: 'agent.coding' }));
    ws.simulateMessage(makeEvent({ type: 'task.complete' }));

    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe('agent.coding');
    expect(events[1]?.type).toBe('task.complete');
    client.destroy();
  });

  it('silently ignores invalid messages', () => {
    const client = new AISnitchClient({
      WebSocketClass: MockWebSocket as never,
    });

    const events: AISnitchEvent[] = [];
    client.on('event', (e) => events.push(e));

    client.connect();
    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage('not json at all');
    ws.simulateMessage({ garbage: true });
    ws.simulateMessage(makeEvent({ type: 'agent.thinking' }));

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('agent.thinking');
    client.destroy();
  });

  it('does not emit welcome as a regular event', () => {
    const client = new AISnitchClient({
      WebSocketClass: MockWebSocket as never,
    });

    const events: AISnitchEvent[] = [];
    client.on('event', (e) => events.push(e));

    client.connect();
    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage(makeWelcome());
    ws.simulateMessage(makeEvent({ type: 'session.start' }));

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('session.start');
    client.destroy();
  });

  it('emits disconnected on close', () => {
    const client = new AISnitchClient({
      WebSocketClass: MockWebSocket as never,
      autoReconnect: false,
    });

    let disconnected = false;
    client.on('disconnected', () => { disconnected = true; });

    client.connect();
    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateClose();

    expect(disconnected).toBe(true);
    client.destroy();
  });

  it('auto-reconnects with exponential backoff when connection fails', () => {
    const client = new AISnitchClient({
      WebSocketClass: MockWebSocket as never,
      reconnectIntervalMs: 1000,
      maxReconnectIntervalMs: 8000,
    });

    client.connect();
    // 📖 Connection fails immediately (no simulateOpen) — backoff kicks in
    MockWebSocket.instances[0]!.simulateClose();

    // 📖 1st reconnect at 1000ms
    expect(MockWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(MockWebSocket.instances).toHaveLength(2);

    // 📖 2nd fail → wait 2000ms (doubled)
    MockWebSocket.instances[1]!.simulateClose();
    vi.advanceTimersByTime(1999);
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(3);

    // 📖 3rd fail → wait 4000ms (doubled again)
    MockWebSocket.instances[2]!.simulateClose();
    vi.advanceTimersByTime(3999);
    expect(MockWebSocket.instances).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(4);

    // 📖 4th fail → capped at 8000ms
    MockWebSocket.instances[3]!.simulateClose();
    vi.advanceTimersByTime(7999);
    expect(MockWebSocket.instances).toHaveLength(4);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(5);

    client.destroy();
  });

  it('resets backoff on successful connection', () => {
    const client = new AISnitchClient({
      WebSocketClass: MockWebSocket as never,
      reconnectIntervalMs: 1000,
      maxReconnectIntervalMs: 8000,
    });

    client.connect();

    // 📖 Disconnect twice to escalate backoff
    MockWebSocket.instances[0]!.simulateOpen();
    MockWebSocket.instances[0]!.simulateClose();
    vi.advanceTimersByTime(1000); // reconnect at 1s

    // 📖 This connection succeeds → backoff should reset
    MockWebSocket.instances[1]!.simulateOpen();
    MockWebSocket.instances[1]!.simulateClose();

    // 📖 Next reconnect should be at base interval (1000ms), not 2000ms
    vi.advanceTimersByTime(1000);
    expect(MockWebSocket.instances).toHaveLength(3);

    client.destroy();
  });

  it('disconnect() stops reconnect', () => {
    const client = new AISnitchClient({
      WebSocketClass: MockWebSocket as never,
      reconnectIntervalMs: 1000,
    });

    client.connect();
    MockWebSocket.instances[0]!.simulateOpen();
    client.disconnect();

    // 📖 No reconnect should happen even after waiting
    vi.advanceTimersByTime(60_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('destroy() cleans up all listeners', () => {
    const client = new AISnitchClient({
      WebSocketClass: MockWebSocket as never,
    });

    let eventCount = 0;
    client.on('event', () => { eventCount += 1; });

    client.connect();
    MockWebSocket.instances[0]!.simulateOpen();
    MockWebSocket.instances[0]!.simulateMessage(makeEvent());
    expect(eventCount).toBe(1);

    client.destroy();

    // 📖 After destroy, client is fully disconnected and cannot reconnect
    expect(client.connected).toBe(false);
  });

  it('on() returns an unsubscribe function', () => {
    const client = new AISnitchClient({
      WebSocketClass: MockWebSocket as never,
    });

    let count = 0;
    const unsub = client.on('event', () => { count += 1; });

    client.connect();
    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage(makeEvent());
    expect(count).toBe(1);

    unsub();
    ws.simulateMessage(makeEvent());
    expect(count).toBe(1); // no increment after unsub

    client.destroy();
  });

  it('emits error when no WebSocket class available', () => {
    // 📖 Simulate an environment with no native WebSocket
    const originalWS = globalThis.WebSocket;
    // @ts-expect-error — intentionally removing for test
    delete globalThis.WebSocket;

    const client = new AISnitchClient();
    const errors: Error[] = [];
    client.on('error', (e) => errors.push(e));

    client.connect();

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('No WebSocket implementation');

    // Restore
    if (originalWS) {
      globalThis.WebSocket = originalWS;
    }
    client.destroy();
  });
});

describe('createAISnitchClient', () => {
  it('creates a client and connects immediately', () => {
    const client = createAISnitchClient({
      WebSocketClass: MockWebSocket as never,
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    client.destroy();
  });
});
