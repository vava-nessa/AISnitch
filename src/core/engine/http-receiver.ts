import { once } from 'node:events';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import { ToolNameSchema } from '../events/schema.js';
import type { ToolName } from '../events/types.js';
import { logger } from './logger.js';

/**
 * @file src/core/engine/http-receiver.ts
 * @description Lightweight localhost-only HTTP receiver for tool hooks and daemon health checks.
 * @functions
 *   → none
 * @exports HealthSnapshot, HTTPReceiverStartOptions, HTTPReceiverStats, HTTPReceiver
 * @see ./pipeline.ts
 */

/**
 * Health payload returned by the HTTP receiver.
 */
export interface HealthSnapshot {
  readonly status: 'ok';
  readonly uptime: number;
  readonly consumers: number;
  readonly events: number;
  readonly droppedEvents: number;
}

/**
 * Startup configuration for the HTTP hook receiver.
 */
export interface HTTPReceiverStartOptions {
  readonly port: number;
  readonly host?: string;
  readonly onHook: (tool: ToolName, payload: unknown) => Promise<void> | void;
  readonly getHealthSnapshot: () => HealthSnapshot;
}

/**
 * Observable runtime stats for the HTTP receiver.
 */
export interface HTTPReceiverStats {
  readonly listening: boolean;
  readonly host: string;
  readonly port: number | null;
  readonly requestCount: number;
  readonly invalidRequestCount: number;
  readonly acceptedHooks: number;
}

/**
 * 📖 The hook receiver keeps zero framework magic on purpose. One endpoint plus
 * one health route do not justify hauling a whole server framework into core.
 */
export class HTTPReceiver {
  private server: Server | undefined;

  private host = '127.0.0.1';

  private port: number | null = null;

  private requestCount = 0;

  private invalidRequestCount = 0;

  private acceptedHooks = 0;

  /**
   * Starts the HTTP receiver on localhost and exposes hook and health routes.
   */
  public async start(options: HTTPReceiverStartOptions): Promise<number> {
    if (this.server) {
      return this.port ?? options.port;
    }

    this.host = options.host ?? '127.0.0.1';

    this.server = createServer((request, response) => {
      void this.handleRequest(request, response, options);
    });

    this.server.on('error', (error) => {
      logger.error({ error }, 'HTTP receiver error');
    });

    this.server.listen(options.port, this.host);
    await once(this.server, 'listening');

    const address = this.server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Unable to resolve HTTP receiver address.');
    }

    this.port = address.port;

    logger.info(
      {
        host: this.host,
        port: this.port,
      },
      'HTTP receiver started',
    );

    return this.port;
  }

  /**
   * Stops the receiver and closes the listening socket.
   */
  public async stop(): Promise<void> {
    if (!this.server) {
      this.port = null;
      return;
    }

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

    this.port = null;

    logger.info('HTTP receiver stopped');
  }

  /**
   * Returns live HTTP receiver stats for health/status endpoints.
   */
  public getStats(): HTTPReceiverStats {
    return {
      listening: this.server !== undefined,
      host: this.host,
      port: this.port,
      requestCount: this.requestCount,
      invalidRequestCount: this.invalidRequestCount,
      acceptedHooks: this.acceptedHooks,
    };
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
    options: HTTPReceiverStartOptions,
  ): Promise<void> {
    this.requestCount += 1;

    const requestUrl = new URL(
      request.url ?? '/',
      `http://${this.host}:${this.port ?? options.port}`,
    );

    if (request.method === 'GET' && requestUrl.pathname === '/health') {
      this.sendJson(response, 200, options.getHealthSnapshot());
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname.startsWith('/hooks/')) {
      const toolSegment = decodeURIComponent(
        requestUrl.pathname.slice('/hooks/'.length),
      );
      const parsedTool = ToolNameSchema.safeParse(toolSegment);

      if (!parsedTool.success || parsedTool.data === 'unknown') {
        this.invalidRequestCount += 1;
        this.sendJson(response, 404, {
          error: 'unknown tool',
        });
        return;
      }

      let payload: unknown;

      try {
        payload = await this.readJsonBody(request);
      } catch (error: unknown) {
        this.invalidRequestCount += 1;
        this.sendJson(response, 400, {
          error: error instanceof Error ? error.message : 'invalid json body',
        });
        return;
      }

      this.acceptedHooks += 1;
      this.sendJson(response, 202, {
        status: 'accepted',
      });

      queueMicrotask(() => {
        void Promise.resolve(options.onHook(parsedTool.data, payload)).catch((error) => {
          logger.error(
            {
              error,
              tool: parsedTool.data,
            },
            'Hook handler failed',
          );
        });
      });
      return;
    }

    this.invalidRequestCount += 1;
    this.sendJson(response, 404, {
      error: 'not found',
    });
  }

  private async readJsonBody(request: IncomingMessage): Promise<unknown> {
    let rawBody = '';
    let bodyLength = 0;

    for await (const chunk of request) {
      const chunkText =
        typeof chunk === 'string'
          ? chunk
          : Buffer.from(chunk).toString('utf8');

      bodyLength += Buffer.byteLength(chunkText);

      if (bodyLength > 1_000_000) {
        throw new Error('request body too large');
      }

      rawBody += chunkText;
    }

    if (rawBody.length === 0) {
      throw new Error('missing json body');
    }

    try {
      return JSON.parse(rawBody) as unknown;
    } catch (error: unknown) {
      throw new Error('malformed json body', {
        cause: error,
      });
    }
  }

  private sendJson(
    response: ServerResponse,
    statusCode: number,
    payload: unknown,
  ): void {
    response.writeHead(statusCode, {
      'content-type': 'application/json; charset=utf-8',
    });
    response.end(`${JSON.stringify(payload)}\n`);
  }
}
