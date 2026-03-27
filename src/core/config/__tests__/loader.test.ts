import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ConfigSchema,
  DEFAULT_CONFIG,
  ensureConfigDir,
  getAISnitchHomePath,
  getConfigPath,
  loadConfig,
  resolveAvailablePort,
  saveConfig,
} from '../index.js';

/**
 * @file src/core/config/__tests__/loader.test.ts
 * @description Unit coverage for config loading, persistence, and port fallback behaviour.
 * @functions
 *   → createTempHome
 *   → withOccupiedPort
 * @exports none
 * @see ../loader.ts
 */

async function createTempHome(): Promise<string> {
  return await mkdtemp(join(tmpdir(), 'aisnitch-config-'));
}

async function withOccupiedPort<T>(
  run: (occupiedPort: number) => Promise<T>,
): Promise<T> {
  const server = createServer();

  await new Promise<void>((resolveServer) => {
    server.listen(0, '127.0.0.1', () => resolveServer());
  });

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Expected an object address from the temporary server');
  }

  try {
    return await run(address.port);
  } finally {
    await new Promise<void>((resolveServer, rejectServer) => {
      server.close((error) => {
        if (error) {
          rejectServer(error);
          return;
        }

        resolveServer();
      });
    });
  }
}

describe('config loader', () => {
  it('returns defaults when the config file does not exist', async () => {
    const homeDirectory = await createTempHome();

    try {
      const config = await loadConfig({ homeDirectory });

      expect(config).toEqual(DEFAULT_CONFIG);
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('resolves the aisnitch home under the provided home directory', async () => {
    const homeDirectory = await createTempHome();

    try {
      expect(getAISnitchHomePath({ homeDirectory })).toBe(
        join(homeDirectory, '.aisnitch'),
      );
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('merges partial config values with schema defaults', async () => {
    const homeDirectory = await createTempHome();

    try {
      const configPath = getConfigPath({ homeDirectory });

      await ensureConfigDir({ homeDirectory });
      await writeFile(
        configPath,
        JSON.stringify({
          httpPort: 4900,
          adapters: {
            codex: {},
          },
        }),
        'utf8',
      );

      const config = await loadConfig({ homeDirectory });

      expect(config.wsPort).toBe(DEFAULT_CONFIG.wsPort);
      expect(config.httpPort).toBe(4900);
      expect(config.adapters.codex).toEqual({ enabled: true });
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('rejects invalid persisted config values', async () => {
    const homeDirectory = await createTempHome();

    try {
      const configPath = getConfigPath({ homeDirectory });

      await ensureConfigDir({ homeDirectory });
      await writeFile(
        configPath,
        JSON.stringify({
          wsPort: -1,
        }),
        'utf8',
      );

      await expect(loadConfig({ homeDirectory })).rejects.toThrow();
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('creates the config directory automatically', async () => {
    const homeDirectory = await createTempHome();

    try {
      const configDirectory = await ensureConfigDir({ homeDirectory });

      expect(configDirectory).toContain('.aisnitch');
      expect(configDirectory).toBe(join(homeDirectory, '.aisnitch'));
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('persists validated config back to disk', async () => {
    const homeDirectory = await createTempHome();

    try {
      const persistedPath = await saveConfig(
        {
          ...DEFAULT_CONFIG,
          logLevel: 'debug',
        },
        { homeDirectory },
      );
      const persistedJson = await readFile(persistedPath, 'utf8');
      const parsedConfig = ConfigSchema.parse(JSON.parse(persistedJson));

      expect(parsedConfig.logLevel).toBe('debug');
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('falls back to the next available port when the requested one is busy', async () => {
    await withOccupiedPort(async (occupiedPort) => {
      const logMessages: string[] = [];
      const resolvedPort = await resolveAvailablePort(occupiedPort, {
        host: '127.0.0.1',
        maxAttempts: 10,
        logger: (message) => logMessages.push(message),
      });

      expect(resolvedPort).not.toBe(occupiedPort);
      expect(resolvedPort).toBeGreaterThan(occupiedPort);
      expect(resolvedPort).toBeLessThanOrEqual(occupiedPort + 9);
      expect(logMessages.at(0)).toMatch(/using/i);
    });
  });
});
