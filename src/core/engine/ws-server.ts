import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { WebSocket, WebSocketServer } from 'ws';

import { AISNITCH_VERSION } from '../../package-info.js';
import type { AISnitchEvent, ToolName } from '../events/types.js';
import type { EventBus } from './event-bus.js';
import { logger } from './logger.js';
import { RingBuffer } from './ring-buffer.js';

/**
 * @file src/core/engine/ws-server.ts
 * @description Localhost-only WebSocket event stream server with per-consumer buffering and heartbeat handling.
 * @functions
 *   → none
 * @exports WelcomeMessage, WSServerStartOptions, WSServerStats, WSServer
 * @see ./ring-buffer.ts
 * @see ./event-bus.ts
 */

/**
 * Message sent immediately after a new consumer connects.
 */
export interface WelcomeMessage {
  readonly type: 'welcome';
  readonly version: string;
  readonly tools: readonly ToolName[];
}

/**
 * Startup configuration for the WebSocket server.
 */
export interface WSServerStartOptions {
  readonly port: number;
  readonly eventBus: EventBus;
  readonly activeTools?: readonly ToolName[];
  readonly host?: string;
  readonly bufferCapacity?: number;
  readonly backpressureThresholdBytes?: number;
  readonly heartbeatIntervalMs?: number;
  readonly pongTimeoutMs?: number;
}

/**
 * Observable runtime stats for the WebSocket server.
 */
export interface WSServerStats {
  readonly listening: boolean;
  readonly host: string;
  readonly port: number | null;
  readonly consumerCount: number;
  readonly eventsSent: number;
  readonly droppedEvents: number;
}

interface ConsumerState {
  readonly buffer: RingBuffer<string>;
  lastPingAt: number;
  awaitingPongSince: number | null;
}

/**
 * 📖 Every consumer gets its own ring buffer so one slow UI cannot block the
 * others or force the daemon to keep unbounded queued output in memory.
 */
export class WSServer {
  private wss: WebSocketServer | undefined;

  private host = '127.0.0.1';

  private port: number | null = null;

  private readonly consumers = new Map<WebSocket, ConsumerState>();

  private unsubscribeFromBus: (() => void) | undefined;

  private maintenanceTimer: NodeJS.Timeout | undefined;

  private eventsSent = 0;

  private droppedEvents = 0;

  /**
   * Starts the localhost WebSocket server and subscribes it to the event bus.
   */
  public async start(options: WSServerStartOptions): Promise<number> {
    if (this.wss) {
      return this.port ?? options.port;
    }

    this.host = options.host ?? '127.0.0.1';

    const bufferCapacity = options.bufferCapacity ?? 1_000;
    const backpressureThresholdBytes =
      options.backpressureThresholdBytes ?? 64 * 1024;
    const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30_000;
    const pongTimeoutMs = options.pongTimeoutMs ?? 10_000;
    const activeTools = options.activeTools ?? [];

    this.wss = new WebSocketServer({
      host: this.host,
      port: options.port,
    });

    this.wss.on('connection', (socket) => {
      this.handleConnection(
        socket,
        {
          activeTools,
          bufferCapacity,
          backpressureThresholdBytes,
        },
      );
    });

    this.wss.on('error', (error) => {
      logger.error({ error }, 'WebSocket server error');
    });

    await once(this.wss, 'listening');

    const address = this.wss.address();

    if (!address || typeof address === 'string') {
      throw new Error('Unable to resolve WebSocket server address.');
    }

    this.port = (address as AddressInfo).port;

    this.unsubscribeFromBus = options.eventBus.subscribe((event) => {
      this.broadcastEvent(event, backpressureThresholdBytes);
    });

    this.maintenanceTimer = setInterval(() => {
      this.runMaintenance(backpressureThresholdBytes, heartbeatIntervalMs, pongTimeoutMs);
    }, 1_000);
    this.maintenanceTimer.unref();

    logger.info(
      {
        host: this.host,
        port: this.port,
      },
      'WebSocket server started',
    );

    return this.port;
  }

  /**
   * Stops the server and closes all consumer connections.
   */
  public async stop(): Promise<void> {
    this.unsubscribeFromBus?.();
    this.unsubscribeFromBus = undefined;

    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = undefined;
    }

    for (const socket of this.consumers.keys()) {
      socket.terminate();
    }
    this.consumers.clear();

    if (!this.wss) {
      this.port = null;
      return;
    }

    const wss = this.wss;
    this.wss = undefined;

    await new Promise<void>((resolve, reject) => {
      wss.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    this.port = null;

    logger.info('WebSocket server stopped');
  }

  /**
   * Returns live server metrics used by health and status reporting.
   */
  public getStats(): WSServerStats {
    return {
      listening: this.wss !== undefined,
      host: this.host,
      port: this.port,
      consumerCount: this.consumers.size,
      eventsSent: this.eventsSent,
      droppedEvents: this.droppedEvents,
    };
  }

  private handleConnection(
    socket: WebSocket,
    options: {
      readonly activeTools: readonly ToolName[];
      readonly bufferCapacity: number;
      readonly backpressureThresholdBytes: number;
    },
  ): void {
    const state: ConsumerState = {
      buffer: new RingBuffer<string>(options.bufferCapacity),
      lastPingAt: Date.now(),
      awaitingPongSince: null,
    };

    this.consumers.set(socket, state);

    socket.on('pong', () => {
      state.awaitingPongSince = null;
      this.flushConsumer(socket, state, options.backpressureThresholdBytes);
    });

    socket.on('close', () => {
      this.consumers.delete(socket);
    });

    socket.on('error', (error) => {
      logger.warn({ error }, 'WebSocket consumer error');
      // 📖 Remove the consumer from the map so dead sockets don't accumulate
      this.consumers.delete(socket);
    });

    const welcomeMessage: WelcomeMessage = {
      type: 'welcome',
      version: AISNITCH_VERSION,
      tools: options.activeTools,
    };

    this.trySendOrQueue(
      socket,
      state,
      JSON.stringify(welcomeMessage),
      options.backpressureThresholdBytes,
    );
  }

  private broadcastEvent(
    event: AISnitchEvent,
    backpressureThresholdBytes: number,
  ): void {
    const serializedEvent = JSON.stringify(event);

    for (const [socket, state] of this.consumers) {
      this.trySendOrQueue(
        socket,
        state,
        serializedEvent,
        backpressureThresholdBytes,
      );
    }
  }

  private trySendOrQueue(
    socket: WebSocket,
    state: ConsumerState,
    serializedPayload: string,
    backpressureThresholdBytes: number,
  ): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    if (state.buffer.size === 0 && socket.bufferedAmount < backpressureThresholdBytes) {
      socket.send(serializedPayload, (error) => {
        if (error) {
          logger.warn({ error }, 'Failed to send WebSocket payload');
        }
      });
      this.eventsSent += 1;
      return;
    }

    const droppedPayload = state.buffer.push(serializedPayload);

    if (droppedPayload !== undefined) {
      this.droppedEvents += 1;
    }
  }

  private flushConsumer(
    socket: WebSocket,
    state: ConsumerState,
    backpressureThresholdBytes: number,
  ): void {
    while (
      socket.readyState === WebSocket.OPEN &&
      state.buffer.size > 0 &&
      socket.bufferedAmount < backpressureThresholdBytes
    ) {
      const nextPayload = state.buffer.shift();

      if (nextPayload === undefined) {
        break;
      }

      socket.send(nextPayload, (error) => {
        if (error) {
          logger.warn({ error }, 'Failed to flush buffered WebSocket payload');
        }
      });

      this.eventsSent += 1;
    }
  }

  private runMaintenance(
    backpressureThresholdBytes: number,
    heartbeatIntervalMs: number,
    pongTimeoutMs: number,
  ): void {
    const now = Date.now();

    for (const [socket, state] of this.consumers) {
      this.flushConsumer(socket, state, backpressureThresholdBytes);

      if (state.awaitingPongSince !== null) {
        if (now - state.awaitingPongSince > pongTimeoutMs) {
          socket.terminate();
        }
        continue;
      }

      if (now - state.lastPingAt >= heartbeatIntervalMs) {
        state.lastPingAt = now;
        state.awaitingPongSince = now;

        if (socket.readyState === WebSocket.OPEN) {
          socket.ping();
        }
      }
    }
  }
}
