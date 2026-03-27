import { constants } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile, access } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { z } from 'zod';

import {
  ensureConfigDir,
  getAISnitchHomePath,
  getConfigPath,
  type ConfigPathOptions,
} from '../core/config/index.js';

/**
 * @file src/cli/pid.ts
 * @description PID, daemon state, and filesystem path helpers for the AISnitch CLI runtime.
 * @functions
 *   → getPidFilePath
 *   → getDaemonStatePath
 *   → getDaemonLogPath
 *   → getLaunchAgentPath
 *   → writePid
 *   → readPid
 *   → removePid
 *   → writeDaemonState
 *   → readDaemonState
 *   → removeDaemonState
 *   → isProcessRunning
 *   → isDaemonRunning
 *   → cleanupStaleDaemonFiles
 * @exports DaemonState, DaemonPathOptions, getPidFilePath, getDaemonStatePath, getDaemonLogPath, getLaunchAgentPath, writePid, readPid, removePid, writeDaemonState, readDaemonState, removeDaemonState, isProcessRunning, isDaemonRunning, cleanupStaleDaemonFiles
 * @see ../core/config/loader.ts
 */

const DaemonStateSchema = z.strictObject({
  pid: z.number().int().positive(),
  wsPort: z.number().int().min(1024).max(65535),
  httpPort: z.number().int().min(1024).max(65535),
  socketPath: z.string().min(1).nullable(),
  startedAt: z.string().min(1),
  configPath: z.string().min(1),
  logFilePath: z.string().min(1),
});

/**
 * Shared path options used by CLI state files.
 */
export interface DaemonPathOptions extends ConfigPathOptions {
  readonly launchAgentHomeDirectory?: string;
}

/**
 * Serialized daemon runtime metadata persisted next to the PID file.
 */
export type DaemonState = z.infer<typeof DaemonStateSchema>;

function getDefaultSocketPath(options: DaemonPathOptions): string {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\aisnitch.sock';
  }

  return join(getAISnitchHomePath(options), 'aisnitch.sock');
}

/**
 * 📖 CLI startup can be reached after crashes or forced exits, so stale UDS
 * paths must be scrubbed before we decide the daemon state is truly clean.
 */
async function cleanupSocketPathIfStale(socketPath: string): Promise<boolean> {
  if (process.platform === 'win32') {
    return false;
  }

  try {
    await access(socketPath, constants.F_OK);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return false;
    }

    throw error;
  }

  const staleSocket = await new Promise<boolean>((resolve, reject) => {
    const probe = createConnection(socketPath);

    probe.once('connect', () => {
      probe.end();
      resolve(false);
    });

    probe.once('error', (error: NodeJS.ErrnoException) => {
      if (
        error.code === 'ECONNREFUSED' ||
        error.code === 'ENOENT' ||
        error.code === 'EINVAL' ||
        error.code === 'ENOTSOCK'
      ) {
        resolve(true);
        return;
      }

      reject(error);
    });
  });

  if (!staleSocket) {
    return false;
  }

  await rm(socketPath, { force: true });

  return true;
}

/**
 * 📖 PID and daemon metadata live next to the config by design so overrides via
 * `--config` keep all runtime state inside one predictable directory.
 */
export function getPidFilePath(options: DaemonPathOptions = {}): string {
  return join(getAISnitchHomePath(options), 'aisnitch.pid');
}

/**
 * Returns the daemon metadata JSON path.
 */
export function getDaemonStatePath(options: DaemonPathOptions = {}): string {
  return join(getAISnitchHomePath(options), 'daemon-state.json');
}

/**
 * Returns the rotating daemon log path.
 */
export function getDaemonLogPath(options: DaemonPathOptions = {}): string {
  return join(getAISnitchHomePath(options), 'daemon.log');
}

/**
 * Returns the per-user LaunchAgent plist path.
 */
export function getLaunchAgentPath(options: DaemonPathOptions = {}): string {
  return join(
    options.launchAgentHomeDirectory ?? homedir(),
    'Library',
    'LaunchAgents',
    'com.aisnitch.daemon.plist',
  );
}

/**
 * Persists the daemon PID.
 */
export async function writePid(
  pid: number,
  options: DaemonPathOptions = {},
): Promise<string> {
  await ensureConfigDir(options);

  const pidFilePath = getPidFilePath(options);
  await writeFile(pidFilePath, `${pid}\n`, 'utf8');

  return pidFilePath;
}

/**
 * Reads the daemon PID if present.
 */
export async function readPid(
  options: DaemonPathOptions = {},
): Promise<number | null> {
  try {
    const rawPid = await readFile(getPidFilePath(options), 'utf8');
    const parsedPid = Number.parseInt(rawPid.trim(), 10);

    if (!Number.isInteger(parsedPid) || parsedPid <= 0) {
      throw new Error('Invalid PID file contents.');
    }

    return parsedPid;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null;
    }

    throw error;
  }
}

/**
 * Removes the PID file if it exists.
 */
export async function removePid(
  options: DaemonPathOptions = {},
): Promise<void> {
  await rm(getPidFilePath(options), { force: true });
}

/**
 * Persists daemon runtime metadata after a successful startup.
 */
export async function writeDaemonState(
  state: DaemonState,
  options: DaemonPathOptions = {},
): Promise<string> {
  await ensureConfigDir(options);

  const daemonStatePath = getDaemonStatePath(options);
  const validatedState = DaemonStateSchema.parse(state);

  await writeFile(
    daemonStatePath,
    `${JSON.stringify(validatedState, null, 2)}\n`,
    'utf8',
  );

  return daemonStatePath;
}

/**
 * Reads the daemon metadata JSON if present.
 */
export async function readDaemonState(
  options: DaemonPathOptions = {},
): Promise<DaemonState | null> {
  try {
    const rawJson = await readFile(getDaemonStatePath(options), 'utf8');
    const parsedJson: unknown = JSON.parse(rawJson);

    return DaemonStateSchema.parse(parsedJson);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null;
    }

    throw error;
  }
}

/**
 * Removes the daemon metadata file if it exists.
 */
export async function removeDaemonState(
  options: DaemonPathOptions = {},
): Promise<void> {
  await rm(getDaemonStatePath(options), { force: true });
}

/**
 * Returns whether the PID currently exists for the same user.
 */
export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === 'ESRCH' || error.code === 'ENOENT')
    ) {
      return false;
    }

    return true;
  }
}

/**
 * Returns whether the persisted daemon PID still points to a live process.
 */
export async function isDaemonRunning(
  options: DaemonPathOptions = {},
): Promise<boolean> {
  const pid = await readPid(options);

  return pid !== null && isProcessRunning(pid);
}

/**
 * Removes stale PID and daemon metadata when the recorded process no longer exists.
 */
export async function cleanupStaleDaemonFiles(
  options: DaemonPathOptions = {},
): Promise<boolean> {
  const pid = await readPid(options);
  const daemonState = await readDaemonState(options);
  const socketPath = daemonState?.socketPath ?? getDefaultSocketPath(options);

  if (pid === null) {
    return await cleanupSocketPathIfStale(socketPath);
  }

  if (isProcessRunning(pid)) {
    return false;
  }

  await cleanupSocketPathIfStale(socketPath);

  await Promise.all([
    removePid(options),
    removeDaemonState(options),
  ]);

  return true;
}

/**
 * Ensures the parent directory of the LaunchAgent plist exists.
 */
export async function ensureLaunchAgentDir(
  options: DaemonPathOptions = {},
): Promise<string> {
  const launchAgentPath = getLaunchAgentPath(options);
  const directoryPath = dirname(launchAgentPath);

  await mkdir(directoryPath, { recursive: true });

  return directoryPath;
}

/**
 * Checks whether the daemon log file already exceeds the rotation threshold.
 */
export async function getDaemonLogSize(
  options: DaemonPathOptions = {},
): Promise<number> {
  try {
    const logStats = await stat(getDaemonLogPath(options));

    return logStats.size;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return 0;
    }

    throw error;
  }
}

/**
 * Returns the effective config path used by the CLI runtime.
 */
export function getEffectiveCliConfigPath(
  options: DaemonPathOptions = {},
): string {
  return getConfigPath(options);
}
