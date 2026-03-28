import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { DEFAULT_CONFIG } from './defaults.js';
import { ConfigSchema } from './schema.js';
import type { AISnitchConfig } from './schema.js';

/**
 * @file src/core/config/loader.ts
 * @description File-system backed helpers for reading, writing, and resolving AISnitch config paths and ports.
 * @functions
 *   → getAISnitchHomePath
 *   → getConfigPath
 *   → ensureConfigDir
 *   → loadConfig
 *   → saveConfig
 *   → resolveAvailablePort
 * @exports ConfigPathOptions, PortResolutionOptions, getAISnitchHomePath, getConfigPath, ensureConfigDir, loadConfig, saveConfig, resolveAvailablePort
 * @see ./schema.ts
 * @see ./defaults.ts
 */

/**
 * Common options for redirecting config path resolution during tests.
 */
export interface ConfigPathOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly homeDirectory?: string;
  readonly configPath?: string;
}

/**
 * Options for port selection and lightweight logging during bootstrap.
 */
export interface PortResolutionOptions {
  readonly host?: string;
  readonly maxAttempts?: number;
  readonly logger?: (message: string) => void;
}

/**
 * Returns the root directory used by AISnitch to store config and daemon state.
 */
export function getAISnitchHomePath(options: ConfigPathOptions = {}): string {
  if (options.configPath && options.configPath.trim().length > 0) {
    return dirname(resolve(options.configPath));
  }

  const configuredHome = options.env?.AISNITCH_HOME;

  if (configuredHome && configuredHome.trim().length > 0) {
    return resolve(configuredHome);
  }

  return join(options.homeDirectory ?? homedir(), '.aisnitch');
}

/**
 * Resolves the absolute path of `config.json`, honoring `AISNITCH_HOME`.
 */
export function getConfigPath(options: ConfigPathOptions = {}): string {
  if (options.configPath && options.configPath.trim().length > 0) {
    return resolve(options.configPath);
  }

  return join(getAISnitchHomePath(options), 'config.json');
}

/**
 * Ensures the AISnitch home directory exists before reading or writing config.
 */
export async function ensureConfigDir(
  options: ConfigPathOptions = {},
): Promise<string> {
  const directoryPath = getAISnitchHomePath(options);

  await mkdir(directoryPath, { recursive: true });

  return directoryPath;
}

/**
 * Loads, validates, and default-fills the AISnitch config from disk.
 */
export async function loadConfig(
  options: ConfigPathOptions = {},
): Promise<AISnitchConfig> {
  const configPath = getConfigPath(options);

  try {
    const rawConfig = await readFile(configPath, 'utf8');
    const parsedJson: unknown = JSON.parse(rawConfig);

    return ConfigSchema.parse(parsedJson);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return ConfigSchema.parse(DEFAULT_CONFIG);
    }

    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in AISnitch config at ${configPath}`, {
        cause: error,
      });
    }

    throw error;
  }
}

/**
 * Writes a validated AISnitch config back to disk using stable pretty JSON.
 */
export async function saveConfig(
  config: AISnitchConfig,
  options: ConfigPathOptions = {},
): Promise<string> {
  const validatedConfig = ConfigSchema.parse(config);
  const configPath = getConfigPath(options);

  await ensureConfigDir(options);
  await writeFile(
    configPath,
    `${JSON.stringify(validatedConfig, null, 2)}\n`,
    'utf8',
  );

  return configPath;
}

async function canBindPort(port: number, host: string): Promise<boolean> {
  return await new Promise<boolean>((resolveAvailability, reject) => {
    const server = createServer();

    server.once('error', (error: NodeJS.ErrnoException) => {
      server.close();

      if (error.code === 'EADDRINUSE') {
        resolveAvailability(false);
        return;
      }

      reject(error);
    });

    server.once('listening', () => {
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }

        resolveAvailability(true);
      });
    });

    server.listen(port, host);
  });
}

/**
 * Resolves a usable port by trying the requested port first and then the next
 * sequential ports up to a bounded retry count.
 */
export async function resolveAvailablePort(
  requestedPort: number,
  options: PortResolutionOptions = {},
): Promise<number> {
  const host = options.host ?? '127.0.0.1';
  /**
   * 📖 AISnitch can spawn foreground demos, ephemeral wrap pipelines, and a
   * managed daemon on the same machine. Keeping the default search window too
   * narrow makes one stale process enough to brick startup, so we probe a
   * wider local range before giving up.
   */
  const maxAttempts = options.maxAttempts ?? 100;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidatePort = requestedPort + attempt;
    const available = await canBindPort(candidatePort, host);

    if (!available) {
      continue;
    }

    if (candidatePort === requestedPort) {
      options.logger?.(`AISnitch will use requested port ${candidatePort}.`);
    } else {
      options.logger?.(
        `AISnitch port ${requestedPort} is busy, using ${candidatePort} instead.`,
      );
    }

    return candidatePort;
  }

  throw new Error(
    `Unable to find an available port from ${requestedPort} to ${
      requestedPort + maxAttempts - 1
    }.`,
  );
}
