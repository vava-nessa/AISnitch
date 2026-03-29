import type { AISnitchConfig } from '../core/config/schema.js';
import type { ToolName } from '../core/events/types.js';
import type { AdapterStatus, BaseAdapter } from './base.js';

import { logger } from '../core/engine/logger.js';

/**
 * @file src/adapters/registry.ts
 * @description Adapter registry that owns built-in adapter instances and orchestrates their lifecycle.
 * @functions
 *   → none
 * @exports AdapterRegistry
 * @see ./base.ts
 * @see ./index.ts
 */

/**
 * 📖 The registry is intentionally tiny: one place to register adapters, one
 * place to start/stop them, and one place to ask what is alive right now.
 */
export class AdapterRegistry {
  private readonly adapters = new Map<ToolName, BaseAdapter>();

  /**
   * Registers one built-in or community adapter instance.
   */
  public register(adapter: BaseAdapter): void {
    if (this.adapters.has(adapter.name)) {
      throw new Error(`Adapter "${adapter.name}" is already registered.`);
    }

    this.adapters.set(adapter.name, adapter);
  }

  /**
   * Returns one adapter instance by its tool name.
   */
  public get(toolName: ToolName): BaseAdapter | undefined {
    return this.adapters.get(toolName);
  }

  /**
   * Lists every registered adapter.
   */
  public list(): BaseAdapter[] {
    return [...this.adapters.values()];
  }

  /**
   * Returns one status snapshot per registered adapter.
   */
  public getStatus(): AdapterStatus[] {
    return this.list().map((adapter) => adapter.getStatus());
  }

  /**
   * Starts every adapter enabled in the current AISnitch config.
   * 📖 Each adapter is started independently — one failure does not prevent
   * the others from starting.
   */
  public async startAll(config: AISnitchConfig): Promise<void> {
    for (const adapter of this.list()) {
      if (config.adapters[adapter.name]?.enabled !== true) {
        continue;
      }

      try {
        await adapter.start();
      } catch (error: unknown) {
        logger.error(
          { error, adapter: adapter.name },
          `📖 Failed to start adapter "${adapter.name}" — skipping`,
        );
      }
    }
  }

  /**
   * Stops every adapter in reverse registration order.
   * 📖 Each adapter is stopped independently — one failure does not prevent
   * the others from being stopped.
   */
  public async stopAll(): Promise<void> {
    const adapters = this.list().reverse();

    for (const adapter of adapters) {
      try {
        await adapter.stop();
      } catch (error: unknown) {
        logger.warn(
          { error, adapter: adapter.name },
          `📖 Error stopping adapter "${adapter.name}" — continuing`,
        );
      }
    }
  }
}
