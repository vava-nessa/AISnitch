import { access, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createConnection, createServer, type Server, type Socket } from 'node:net';
import { createInterface } from 'node:readline';
import { once } from 'node:events';

import { AISnitchEventSchema } from '../events/schema.js';
import type { AISnitchEvent } from '../events/types.js';
import { logger } from './logger.js';

/**
 * @file src/core/engine/uds-server.ts
 * @description NDJSON Unix domain socket ingress for out-of-process AISnitch adapters.
 * @functions
 *   → none
 * @exports UDSServerStartOptions, UDSServerStats, UDSServer
 * @see ./pipeline.ts
 */

/**
 * Startup configuration for the UDS server.
 */
export interface UDSServerStartOptions {
  readonly socketPath: string;
  readonly onEvent: (event: AISnitchEvent) => Promise<void> | void;
}

/**
 * Observable runtime stats for the UDS server.
 */
export interface UDSServerStats {
  readonly listening: boolean;
  readonly socketPath: string | null;
  readonly activeConnections: number;
  readonly acceptedConnections: number;
  readonly receivedEvents: number;
  readonly rejectedMessages: number;
}

/**
 * 📖 UDS is the low-friction IPC path for community adapters. NDJSON keeps the
 * protocol debuggable with shell tools and trivial to implement elsewhere.
 */
export class UDSServer {
  private server: Server | undefined;

  private socketPath: string | null = null;

  private readonly sockets = new Set<Socket>();

  private acceptedConnections = 0;

  private receivedEvents = 0;

  private rejectedMessages = 0;

  /**
   * Starts listening on the provided socket path.
   */
  public async start(options: UDSServerStartOptions): Promise<string> {
    if (this.server) {
      return this.socketPath ?? options.socketPath;
    }

    await this.ensureSocketPathAvailable(options.socketPath);

    this.server = createServer((socket) => {
      this.handleSocket(socket, options.onEvent);
    });

    this.server.on('error', (error) => {
      logger.error({ error }, 'UDS server error');
    });

    this.server.listen(options.socketPath);
    await once(this.server, 'listening');

    this.socketPath = options.socketPath;

    logger.info(
      {
        socketPath: this.socketPath,
      },
      'UDS server started',
    );

    return this.socketPath;
  }

  /**
   * Stops the UDS server and removes the socket file.
   */
  public async stop(): Promise<void> {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();

    if (this.server) {
      const server = this.server;
      this.server = undefined;

      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }

    if (this.socketPath && process.platform !== 'win32') {
      await rm(this.socketPath, { force: true });
    }

    this.socketPath = null;

    logger.info('UDS server stopped');
  }

  /**
   * Returns current runtime metrics for the UDS ingress channel.
   */
  public getStats(): UDSServerStats {
    return {
      listening: this.server !== undefined,
      socketPath: this.socketPath,
      activeConnections: this.sockets.size,
      acceptedConnections: this.acceptedConnections,
      receivedEvents: this.receivedEvents,
      rejectedMessages: this.rejectedMessages,
    };
  }

  private handleSocket(
    socket: Socket,
    onEvent: (event: AISnitchEvent) => Promise<void> | void,
  ): void {
    this.sockets.add(socket);
    this.acceptedConnections += 1;

    socket.on('close', () => {
      this.sockets.delete(socket);
    });

    socket.on('error', (error) => {
      logger.warn({ error }, 'UDS client socket error');
    });

    const lineReader = createInterface({
      input: socket,
      crlfDelay: Infinity,
    });

    lineReader.on('line', (line) => {
      if (line.trim().length === 0) {
        return;
      }

      let parsedPayload: unknown;

      try {
        parsedPayload = JSON.parse(line) as unknown;
      } catch (error: unknown) {
        this.rejectedMessages += 1;
        logger.warn({ error, line }, 'Rejected malformed UDS NDJSON payload');
        return;
      }

      const parsedEvent = AISnitchEventSchema.safeParse(parsedPayload);

      if (!parsedEvent.success) {
        this.rejectedMessages += 1;
        logger.warn(
          {
            issues: parsedEvent.error.issues,
          },
          'Rejected invalid UDS event payload',
        );
        return;
      }

      this.receivedEvents += 1;

      queueMicrotask(() => {
        void Promise.resolve(onEvent(parsedEvent.data)).catch((error) => {
          logger.error({ error }, 'UDS event handler failed');
        });
      });
    });
  }

  private async ensureSocketPathAvailable(socketPath: string): Promise<void> {
    if (process.platform === 'win32') {
      return;
    }

    try {
      await access(socketPath, constants.F_OK);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return;
      }

      throw error;
    }

    const staleSocket = await new Promise<boolean>((resolve, reject) => {
      const probe = createConnection(socketPath);

      probe.once('connect', () => {
        probe.destroy();
        resolve(false);
      });

      probe.once('error', (error: NodeJS.ErrnoException) => {
        if (
          error.code === 'ECONNREFUSED' ||
          error.code === 'ENOENT' ||
          error.code === 'EINVAL'
        ) {
          resolve(true);
          return;
        }

        reject(error);
      });
    });

    if (!staleSocket) {
      throw new Error(`Socket path is already in use: ${socketPath}`);
    }

    await rm(socketPath, { force: true });
  }
}
