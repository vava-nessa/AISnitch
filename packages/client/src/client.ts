/**
 * @file src/client.ts
 * @description Core AISnitchClient class — manages the WebSocket connection to the AISnitch daemon.
 *   Handles auto-reconnect with exponential backoff, Zod-validated event parsing, and typed event emission.
 *
 *   📖 The client is environment-agnostic: in browsers it uses the native WebSocket,
 *   in Node.js the consumer passes the `ws` library via the `WebSocketClass` option.
 *
 * @functions
 *   → AISnitchClient.connect — open the WebSocket connection
 *   → AISnitchClient.disconnect — close cleanly without reconnecting
 *   → AISnitchClient.destroy — full teardown (disconnect + remove all listeners)
 *   → createAISnitchClient — factory that creates a client and connects immediately
 *
 * @exports AISnitchClient, AISnitchClientOptions, createAISnitchClient
 * @see ./schema.ts — parseEvent / parseWelcome used for message validation
 * @see ./sessions.ts — optional SessionTracker wired into the client
 */

import { parseEvent, parseWelcome } from './schema.js';
import { SessionTracker } from './sessions.js';
import type { AISnitchEvent, WelcomeMessage } from './types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** 📖 Configuration options for the AISnitchClient. */
export interface AISnitchClientOptions {
  /** 📖 WebSocket URL — defaults to 'ws://127.0.0.1:4820' */
  readonly url?: string;
  /** 📖 Enable auto-reconnect on disconnect — defaults to true */
  readonly autoReconnect?: boolean;
  /** 📖 Initial reconnect delay in ms — defaults to 3000 (3s) */
  readonly reconnectIntervalMs?: number;
  /** 📖 Maximum reconnect delay in ms (exponential backoff cap) — defaults to 30000 (30s) */
  readonly maxReconnectIntervalMs?: number;
  /**
   * 📖 WebSocket constructor to use.
   * In browsers, `globalThis.WebSocket` is detected automatically.
   * In Node.js, pass the `ws` library: `{ WebSocketClass: WebSocket }` after `import WebSocket from 'ws'`.
   */
  readonly WebSocketClass?: WebSocketConstructor;
  /** 📖 Enable built-in session tracking — defaults to true */
  readonly trackSessions?: boolean;
}

/** 📖 Typed event map for the client's event emitter. */
interface ClientEventMap {
  event: AISnitchEvent;
  connected: WelcomeMessage;
  disconnected: void;
  error: Error;
}

type EventCallback<K extends keyof ClientEventMap> = (
  payload: ClientEventMap[K],
) => void;

// 📖 Minimal WebSocket interface — works with both native browser WebSocket and `ws`
interface MinimalWebSocket {
  readonly readyState: number;
  close(): void;
  send(data: string): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

type WebSocketConstructor = new (url: string) => MinimalWebSocket;

// 📖 Standard WebSocket readyState values
const WS_OPEN = 1;

// ─── Client ──────────────────────────────────────────────────────────────────

/**
 * 📖 Core client for consuming the AISnitch WebSocket event stream.
 *
 * Features:
 * - Auto-reconnect with exponential backoff (3s → 6s → 12s → 24s → 30s cap)
 * - Zod-validated event parsing (invalid messages silently ignored)
 * - Welcome message interception and storage
 * - Typed event emitter (event, connected, disconnected, error)
 * - Optional built-in session tracking via SessionTracker
 *
 * Usage (Node.js):
 * ```ts
 * import { createAISnitchClient } from '@aisnitch/client';
 * import WebSocket from 'ws';
 * const client = createAISnitchClient({ WebSocketClass: WebSocket as any });
 * client.on('event', (e) => console.log(e.type));
 * ```
 *
 * Usage (Browser):
 * ```ts
 * import { createAISnitchClient } from '@aisnitch/client';
 * const client = createAISnitchClient(); // native WebSocket auto-detected
 * ```
 */
export class AISnitchClient {
  // ── Config ──
  private readonly _url: string;
  private readonly _autoReconnect: boolean;
  private readonly _baseInterval: number;
  private readonly _maxInterval: number;
  private readonly _WSClass: WebSocketConstructor | undefined;

  // ── State ──
  private _ws: MinimalWebSocket | null = null;
  private _welcome: WelcomeMessage | null = null;
  private _destroyed = false;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _currentInterval: number;

  // ── Event listeners ──
  private readonly _listeners: {
    [K in keyof ClientEventMap]: Set<EventCallback<K>>;
  } = {
    event: new Set(),
    connected: new Set(),
    disconnected: new Set(),
    error: new Set(),
  };

  // ── Session tracker ──
  /** 📖 Built-in session tracker — available when `trackSessions` is true (default). */
  public readonly sessions: SessionTracker | null;

  constructor(options?: AISnitchClientOptions) {
    this._url = options?.url ?? 'ws://127.0.0.1:4820';
    this._autoReconnect = options?.autoReconnect ?? true;

    // 📖 Validate numeric options to prevent tight reconnect loops or undefined behavior
    const baseInterval = options?.reconnectIntervalMs ?? 3_000;
    const maxInterval = options?.maxReconnectIntervalMs ?? 30_000;

    if (!Number.isFinite(baseInterval) || baseInterval <= 0) {
      throw new Error(
        `@aisnitch/client: reconnectIntervalMs must be a positive finite number, got ${baseInterval}`,
      );
    }
    if (!Number.isFinite(maxInterval) || maxInterval <= 0) {
      throw new Error(
        `@aisnitch/client: maxReconnectIntervalMs must be a positive finite number, got ${maxInterval}`,
      );
    }

    this._baseInterval = baseInterval;
    this._maxInterval = maxInterval;
    this._currentInterval = this._baseInterval;
    this._WSClass = options?.WebSocketClass;

    // 📖 Session tracking is on by default — set trackSessions: false to disable
    const trackSessions = options?.trackSessions ?? true;
    this.sessions = trackSessions ? new SessionTracker() : null;

    // 📖 Wire session tracker into the event stream
    if (this.sessions) {
      const tracker = this.sessions;
      this.on('event', (event) => tracker.update(event));
    }
  }

  /** 📖 Whether the WebSocket is currently open and connected. */
  get connected(): boolean {
    return this._ws?.readyState === WS_OPEN;
  }

  /** 📖 The last welcome message received, or null if not yet connected. */
  get welcome(): WelcomeMessage | null {
    return this._welcome;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** 📖 Open the WebSocket connection. Safe to call multiple times. */
  connect(): void {
    if (this._destroyed) return;
    if (this._ws) return;

    // 📖 Re-enable auto-reconnect on explicit connect() after a disconnect()
    this._autoReconnectDisabled = false;

    const WSClass = this._resolveWebSocketClass();
    if (!WSClass) {
      this._emit('error', new Error(
        '@aisnitch/client: No WebSocket implementation found. ' +
        'In Node.js, pass { WebSocketClass: WebSocket } from the "ws" package.',
      ));
      return;
    }

    try {
      this._ws = new WSClass(this._url);
    } catch (err) {
      this._emit('error', err instanceof Error ? err : new Error(String(err)));
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = () => {
      // 📖 Reset backoff on successful connection
      this._currentInterval = this._baseInterval;
    };

    this._ws.onmessage = (ev: { data: unknown }) => {
      this._handleMessage(ev.data);
    };

    this._ws.onclose = () => {
      this._ws = null;
      this._emit('disconnected', undefined as never);
      this._scheduleReconnect();
    };

    this._ws.onerror = () => {
      // 📖 The error event is always followed by a close event,
      // so we just emit our error and let onclose handle reconnect.
      this._emit('error', new Error(`WebSocket error on ${this._url}`));
    };
  }

  /** 📖 Close the connection cleanly. Auto-reconnect is suppressed. */
  disconnect(): void {
    this._clearReconnectTimer();
    this._autoReconnectDisabled = true;
    this._welcome = null; // 📖 Clear stale welcome data to avoid confusion on reconnect
    if (this._ws) {
      this._ws.onclose = null;
      this._ws.onmessage = null;
      this._ws.onerror = null;
      this._ws.onopen = null;
      this._ws.close();
      this._ws = null;
      this._emit('disconnected', undefined as never);
    }
  }

  /**
   * 📖 Full teardown — disconnect + remove all listeners.
   * After calling destroy(), the client cannot be reconnected.
   */
  destroy(): void {
    this._destroyed = true;
    this.disconnect();
    this._listeners.event.clear();
    this._listeners.connected.clear();
    this._listeners.disconnected.clear();
    this._listeners.error.clear();
  }

  // ── Event emitter ──────────────────────────────────────────────────────────

  /** 📖 Subscribe to client events. Returns an unsubscribe function. */
  on<K extends keyof ClientEventMap>(
    eventName: K,
    callback: EventCallback<K>,
  ): () => void {
    (this._listeners[eventName] as Set<EventCallback<K>>).add(callback);
    return () => {
      (this._listeners[eventName] as Set<EventCallback<K>>).delete(callback);
    };
  }

  /** 📖 Remove a specific listener. */
  off<K extends keyof ClientEventMap>(
    eventName: K,
    callback: EventCallback<K>,
  ): void {
    (this._listeners[eventName] as Set<EventCallback<K>>).delete(callback);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  // 📖 Flag set by disconnect() to suppress auto-reconnect for intentional disconnects
  private _autoReconnectDisabled = false;

  private _resolveWebSocketClass(): WebSocketConstructor | undefined {
    if (this._WSClass) return this._WSClass;
    // 📖 In browsers, globalThis.WebSocket is available natively
    if (typeof globalThis !== 'undefined' && 'WebSocket' in globalThis) {
      return globalThis.WebSocket as unknown as WebSocketConstructor;
    }
    return undefined;
  }

  private _handleMessage(raw: unknown): void {
    let parsed: unknown;
    try {
      const text = typeof raw === 'string' ? raw : String(raw);
      parsed = JSON.parse(text);
    } catch {
      // 📖 Silently ignore non-JSON messages
      return;
    }

    // 📖 Check for welcome message first — it's intercepted and not emitted as an event
    if (typeof parsed === 'object' && parsed !== null && 'type' in parsed) {
      const obj = parsed as Record<string, unknown>;
      if (obj['type'] === 'welcome') {
        const welcome = parseWelcome(parsed);
        if (welcome) {
          this._welcome = welcome;
          this._emit('connected', welcome);
        }
        return;
      }
    }

    // 📖 Parse as a regular AISnitch event — invalid payloads are silently ignored
    const event = parseEvent(parsed);
    if (event) {
      this._emit('event', event);
    }
  }

  private _emit<K extends keyof ClientEventMap>(
    eventName: K,
    payload: ClientEventMap[K],
  ): void {
    for (const cb of this._listeners[eventName]) {
      try {
        (cb as EventCallback<K>)(payload);
      } catch {
        // 📖 Swallow listener errors to prevent one bad listener from breaking others
      }
    }
  }

  private _scheduleReconnect(): void {
    if (this._destroyed || !this._autoReconnect || this._autoReconnectDisabled) return;

    this._clearReconnectTimer();
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, this._currentInterval);

    // 📖 Exponential backoff: double the interval each attempt, capped at max
    this._currentInterval = Math.min(this._currentInterval * 2, this._maxInterval);
  }

  private _clearReconnectTimer(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * 📖 Convenience factory — creates a client and connects immediately.
 * This is the recommended entry point for most consumers.
 *
 * @example
 * ```ts
 * import { createAISnitchClient } from '@aisnitch/client';
 * const client = createAISnitchClient();
 * client.on('event', (e) => console.log(e.type));
 * ```
 */
export function createAISnitchClient(options?: AISnitchClientOptions): AISnitchClient {
  const client = new AISnitchClient(options);
  client.connect();
  return client;
}
