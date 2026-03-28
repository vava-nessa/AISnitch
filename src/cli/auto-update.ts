import { spawn as spawnChildProcess } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';

import {
  AISNITCH_PACKAGE_NAME,
  AISNITCH_VERSION,
} from '../package-info.js';
import {
  getAISnitchHomePath,
  loadConfig,
  type AutoUpdateConfig,
  type ConfigPathOptions,
} from '../core/config/index.js';

/**
 * @file src/cli/auto-update.ts
 * @description Silent background updater for globally installed AISnitch binaries across npm, pnpm, bun, and Homebrew.
 * @functions
 *   → createAutoUpdateController
 *   → compareSemanticVersions
 *   → detectInstallManager
 * @exports AutoUpdateManager, AutoUpdateState, AutoUpdateRunOptions, AutoUpdateController, createAutoUpdateController, compareSemanticVersions, detectInstallManager
 * @see ./runtime.ts
 * @see ./program.ts
 */

const AUTO_UPDATE_STATE_FILE = 'auto-update.json';
const AUTO_UPDATE_LOG_FILE = 'auto-update.log';

/**
 * Supported install managers for background upgrades.
 */
export type AutoUpdateManager = Exclude<AutoUpdateConfig['manager'], 'auto'>;

/**
 * Serialized updater state kept in the AISnitch home directory.
 */
export interface AutoUpdateState {
  readonly attemptedVersion?: string;
  readonly completedAt?: string;
  readonly currentVersion?: string;
  readonly lastCheckedAt?: string;
  readonly lastKnownLatestVersion?: string;
  readonly lastManager?: AutoUpdateManager;
}

/**
 * Internal execution arguments for the detached updater worker.
 */
export interface AutoUpdateRunOptions extends ConfigPathOptions {
  readonly latestVersion: string;
  readonly manager: AutoUpdateManager;
}

interface AutoUpdateControllerDependencies {
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => Date;
  readonly spawn?: typeof spawnChildProcess;
}

/**
 * Public updater controller used by the CLI runtime.
 */
export interface AutoUpdateController {
  runDetachedUpdate: (options: AutoUpdateRunOptions) => Promise<void>;
  scheduleForInteractiveLaunch: (options?: ConfigPathOptions) => Promise<void>;
}

interface LatestPackagePayload {
  readonly version: string;
}

/**
 * 📖 Updates are intentionally delegated to a detached worker so the TUI can
 * open immediately while package-manager mutations happen quietly in the background.
 */
export function createAutoUpdateController(
  dependencies: AutoUpdateControllerDependencies = {},
): AutoUpdateController {
  const fetchImplementation = dependencies.fetch ?? globalThis.fetch;
  const now = dependencies.now ?? (() => new Date());
  const spawnImplementation = dependencies.spawn ?? spawnChildProcess;

  return {
    runDetachedUpdate: async (options) => {
      const pathOptions = toPathOptions(options);
      const state = await readAutoUpdateState(pathOptions);
      const command = resolveUpdateCommand(options.manager);
      const args = resolveUpdateArgs(options.manager);
      const aisnitchHomePath = getAISnitchHomePath(pathOptions);

      await mkdir(aisnitchHomePath, { recursive: true });

      const logFilePath = join(aisnitchHomePath, AUTO_UPDATE_LOG_FILE);
      const startedAt = now().toISOString();

      await writeAutoUpdateState(
        {
          ...state,
          attemptedVersion: options.latestVersion,
          lastCheckedAt: startedAt,
          lastKnownLatestVersion: options.latestVersion,
          lastManager: options.manager,
        },
        pathOptions,
      );

      const child = spawnImplementation(command, args, {
        detached: false,
        env: process.env,
        stdio: 'pipe',
      });

      let combinedLog = `[${startedAt}] starting silent update via ${options.manager}: ${command} ${args.join(' ')}\n`;

      child.stdout?.on('data', (chunk: Buffer | string) => {
        combinedLog += chunk.toString();
      });
      child.stderr?.on('data', (chunk: Buffer | string) => {
        combinedLog += chunk.toString();
      });

      const exitCode = await new Promise<number>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code) => {
          resolve(code ?? 1);
        });
      });

      combinedLog += `[${now().toISOString()}] finished with code ${exitCode}\n`;
      await writeFile(logFilePath, combinedLog, 'utf8');

      await writeAutoUpdateState(
        {
          attemptedVersion: options.latestVersion,
          completedAt: now().toISOString(),
          currentVersion: exitCode === 0 ? options.latestVersion : AISNITCH_VERSION,
          lastCheckedAt: startedAt,
          lastKnownLatestVersion: options.latestVersion,
          lastManager: options.manager,
        },
        pathOptions,
      );
    },
    scheduleForInteractiveLaunch: async (options = {}) => {
      const pathOptions = toPathOptions(options);
      const config = await loadConfig(pathOptions);

      if (!config.autoUpdate.enabled) {
        return;
      }

      const installManager = await detectInstallManager({
        cliEntryPath: process.argv[1] ?? '',
        configuredManager: config.autoUpdate.manager,
      });

      if (installManager === null) {
        return;
      }

      const state = await readAutoUpdateState(pathOptions);
      const checkedAt =
        state.lastCheckedAt === undefined
          ? null
          : Date.parse(state.lastCheckedAt);

      if (
        checkedAt !== null &&
        Number.isFinite(checkedAt) &&
        now().getTime() - checkedAt < config.autoUpdate.intervalMs
      ) {
        return;
      }

      const latestVersion = await fetchLatestVersion(fetchImplementation);

      await writeAutoUpdateState(
        {
          ...state,
          lastCheckedAt: now().toISOString(),
          lastKnownLatestVersion: latestVersion,
          lastManager: installManager,
        },
        pathOptions,
      );

      if (compareSemanticVersions(latestVersion, AISNITCH_VERSION) <= 0) {
        return;
      }

      const cliEntryPath = process.argv[1];

      if (!cliEntryPath) {
        return;
      }

      const child = spawnImplementation(
        process.execPath,
        [
          cliEntryPath,
          'self-update-run',
          '--manager',
          installManager,
          '--target-version',
          latestVersion,
          ...toConfigArgv(options),
        ],
        {
          detached: true,
          env: process.env,
          stdio: 'ignore',
        },
      );

      child.unref();
    },
  };
}

/**
 * Compares semantic versions using numeric segments only.
 */
export function compareSemanticVersions(left: string, right: string): number {
  const leftSegments = left.split('.').map((segment) => Number.parseInt(segment, 10));
  const rightSegments = right.split('.').map((segment) => Number.parseInt(segment, 10));
  const maxLength = Math.max(leftSegments.length, rightSegments.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftSegments[index] ?? 0;
    const rightValue = rightSegments[index] ?? 0;

    if (leftValue > rightValue) {
      return 1;
    }

    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

/**
 * Detects how the current binary was installed so the updater can pick the right command.
 */
export async function detectInstallManager(options: {
  readonly cliEntryPath: string;
  readonly configuredManager: AutoUpdateConfig['manager'];
}): Promise<AutoUpdateManager | null> {
  if (options.configuredManager !== 'auto') {
    return options.configuredManager;
  }

  let resolvedCliPath = options.cliEntryPath;

  try {
    resolvedCliPath = await realpath(options.cliEntryPath);
  } catch {
    // Keep the original path when realpath fails.
  }

  if (resolvedCliPath.includes('/Cellar/aisnitch/')) {
    return 'brew';
  }

  if (
    resolvedCliPath.includes('/.bun/install/global/') ||
    resolvedCliPath.includes('/.bun/bin/')
  ) {
    return 'bun';
  }

  if (
    resolvedCliPath.includes('/node_modules/.pnpm/aisnitch@') ||
    resolvedCliPath.includes('/Library/pnpm/') ||
    resolvedCliPath.includes('/.local/share/pnpm/')
  ) {
    return 'pnpm';
  }

  if (resolvedCliPath.includes(`/lib/node_modules/${AISNITCH_PACKAGE_NAME}/`)) {
    return 'npm';
  }

  return null;
}

async function fetchLatestVersion(
  fetchImplementation: typeof globalThis.fetch,
): Promise<string> {
  const response = await fetchImplementation(
    `https://registry.npmjs.org/${AISNITCH_PACKAGE_NAME}/latest`,
    {
      headers: {
        accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `AISnitch auto-update could not query npm (HTTP ${response.status}).`,
    );
  }

  const payload = (await response.json()) as LatestPackagePayload;

  if (typeof payload.version !== 'string' || payload.version.length === 0) {
    throw new Error('AISnitch auto-update received an invalid npm version payload.');
  }

  return payload.version;
}

function resolveUpdateCommand(manager: AutoUpdateManager): string {
  switch (manager) {
    case 'brew':
      return 'brew';
    case 'bun':
      return 'bun';
    case 'pnpm':
      return 'pnpm';
    case 'npm':
      return 'npm';
  }
}

function resolveUpdateArgs(manager: AutoUpdateManager): string[] {
  switch (manager) {
    case 'brew':
      return ['upgrade', AISNITCH_PACKAGE_NAME];
    case 'bun':
      return ['add', '-g', `${AISNITCH_PACKAGE_NAME}@latest`];
    case 'pnpm':
      return ['add', '-g', `${AISNITCH_PACKAGE_NAME}@latest`];
    case 'npm':
      return ['install', '-g', `${AISNITCH_PACKAGE_NAME}@latest`];
  }
}

async function readAutoUpdateState(
  options: ConfigPathOptions,
): Promise<AutoUpdateState> {
  const statePath = getAutoUpdateStatePath(options);

  try {
    const rawJson = await readFile(statePath, 'utf8');
    return JSON.parse(rawJson) as AutoUpdateState;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return {};
    }

    throw error;
  }
}

async function writeAutoUpdateState(
  state: AutoUpdateState,
  options: ConfigPathOptions,
): Promise<void> {
  const aisnitchHomePath = getAISnitchHomePath(options);

  await mkdir(aisnitchHomePath, { recursive: true });
  await writeFile(
    getAutoUpdateStatePath(options),
    `${JSON.stringify(state, null, 2)}\n`,
    'utf8',
  );
}

function getAutoUpdateStatePath(options: ConfigPathOptions): string {
  return join(getAISnitchHomePath(options), AUTO_UPDATE_STATE_FILE);
}

function toPathOptions(options: ConfigPathOptions): ConfigPathOptions {
  return {
    configPath: options.configPath,
    env: options.env ?? process.env,
    homeDirectory: options.homeDirectory,
  };
}

function toConfigArgv(options: ConfigPathOptions): string[] {
  return options.configPath ? ['--config', options.configPath] : [];
}
