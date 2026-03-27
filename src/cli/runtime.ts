import { execFile as execFileCallback, spawn as spawnChildProcess } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { rename, rm, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { promisify } from 'node:util';

import { ToolNameSchema, type AISnitchConfig, type ToolName } from '../core/index.js';
import {
  ConfigSchema,
  LOG_LEVELS,
  Pipeline,
  setLoggerLevel,
  type ConfigPathOptions,
  type HealthSnapshot,
} from '../core/index.js';
import {
  attachWebSocketMonitor,
  renderForegroundTui,
  type MonitorOutput,
} from '../tui/index.js';
import {
  cleanupStaleDaemonFiles,
  ensureLaunchAgentDir,
  getDaemonLogPath,
  getDaemonLogSize,
  getEffectiveCliConfigPath,
  getLaunchAgentPath,
  isDaemonRunning,
  isProcessRunning,
  readDaemonState,
  readPid,
  removeDaemonState,
  removePid,
  writeDaemonState,
  writePid,
  type DaemonPathOptions,
} from './pid.js';
import {
  ensureConfigDir,
  getAISnitchHomePath,
  loadConfig,
} from '../core/config/index.js';
import {
  runSetupCommand,
  type SetupCliOptions,
  type SetupOutput,
  type SetupToolName,
} from './commands/setup.js';

/**
 * @file src/cli/runtime.ts
 * @description Runtime command implementations for foreground mode, daemon mode, status inspection, and launchd integration.
 * @functions
 *   → createCliRuntime
 *   → parsePortOption
 *   → parseLogLevelOption
 *   → buildLaunchAgentPlist
 * @exports CliOutput, CommonCliOptions, StartCliOptions, createCliRuntime, parsePortOption, parseLogLevelOption, buildLaunchAgentPlist
 * @see ./pid.ts
 * @see ../tui/live-monitor.ts
 * @see ../core/engine/pipeline.ts
 */

const execFile = promisify(execFileCallback);

const DAEMON_READY_TIMEOUT_MS = 4_000;
const DAEMON_READY_POLL_INTERVAL_MS = 100;
const DAEMON_STOP_TIMEOUT_MS = 4_000;
const DAEMON_LOG_MAX_BYTES = 5 * 1024 * 1024;
const LAUNCH_AGENT_LABEL = 'com.aisnitch.daemon';

/**
 * Shared CLI output abstraction for commands and monitor rendering.
 */
export type CliOutput = MonitorOutput;

/**
 * Shared config override supported by all runtime commands.
 */
export interface CommonCliOptions {
  readonly config?: string;
}

/**
 * Options accepted by `aisnitch start`.
 */
export interface StartCliOptions extends CommonCliOptions {
  readonly daemon?: boolean;
  readonly httpPort?: number;
  readonly logLevel?: AISnitchConfig['logLevel'];
  readonly wsPort?: number;
}

/**
 * Stable runtime command interface consumed by the commander program wiring.
 */
export interface CliRuntime {
  readonly adapters: (options: CommonCliOptions) => Promise<void>;
  readonly attach: (options: CommonCliOptions) => Promise<void>;
  readonly install: (options: CommonCliOptions) => Promise<void>;
  readonly runDaemonProcess: (options: StartCliOptions) => Promise<void>;
  readonly setup: (
    toolName: SetupToolName,
    options: SetupCliOptions,
  ) => Promise<void>;
  readonly start: (options: StartCliOptions) => Promise<void>;
  readonly status: (options: CommonCliOptions) => Promise<void>;
  readonly stop: (options: CommonCliOptions) => Promise<void>;
  readonly uninstall: (options: CommonCliOptions) => Promise<void>;
}

/**
 * LaunchAgent plist generation inputs.
 */
export interface LaunchAgentPlistOptions {
  readonly cliEntryPath: string;
  readonly configPath?: string;
  readonly logFilePath: string;
  readonly nodeExecutablePath: string;
}

interface CliRuntimeDependencies {
  readonly execFile?: (
    file: string,
    args: readonly string[],
  ) => Promise<{ readonly stdout: string; readonly stderr: string }>;
  readonly fetch?: typeof globalThis.fetch;
  readonly output?: CliOutput;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly spawn?: typeof spawnChildProcess;
}

interface StatusSnapshot {
  readonly configuredAdapters: readonly ToolName[];
  readonly daemonPid: number | null;
  readonly health: HealthSnapshot | null;
  readonly httpPort: number;
  readonly logFilePath: string;
  readonly running: boolean;
  readonly socketPath: string | null;
  readonly wsPort: number;
}

/**
 * 📖 The CLI runtime keeps command-side orchestration separate from commander
 * parsing so tests can exercise the logic without shelling out to a subprocess.
 */
export function createCliRuntime(
  dependencies: CliRuntimeDependencies = {},
): CliRuntime {
  const output = dependencies.output ?? createProcessOutput();
  const fetchImplementation = dependencies.fetch ?? globalThis.fetch;
  const spawnImplementation = dependencies.spawn ?? spawnChildProcess;
  const execFileImplementation =
    dependencies.execFile ??
    (async (file, args) => {
      return await execFile(file, [...args], {
        encoding: 'utf8',
      });
    });
  const sleep =
    dependencies.sleep ??
    (async (ms) => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, ms).unref();
      });
    });

  async function loadEffectiveConfig(
    options: StartCliOptions | CommonCliOptions,
  ): Promise<{
    readonly config: AISnitchConfig;
    readonly pathOptions: ConfigPathOptions;
  }> {
    const pathOptions = toPathOptions(options);
    const baseConfig = await loadConfig(pathOptions);
    const config = ConfigSchema.parse({
      ...baseConfig,
      ...(isStartCliOptions(options)
        ? {
            httpPort: options.httpPort ?? baseConfig.httpPort,
            logLevel: options.logLevel ?? baseConfig.logLevel,
            wsPort: options.wsPort ?? baseConfig.wsPort,
          }
        : {}),
    });

    return {
      config,
      pathOptions,
    };
  }

  async function fetchHealth(
    httpPort: number,
  ): Promise<HealthSnapshot | null> {
    try {
      const response = await fetchImplementation(
        `http://127.0.0.1:${httpPort}/health`,
      );

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as HealthSnapshot;
    } catch {
      return null;
    }
  }

  async function ensureDaemonNotRunning(
    options: CommonCliOptions,
  ): Promise<void> {
    const pathOptions = toPathOptions(options);

    await cleanupStaleDaemonFiles(pathOptions);

    if (await isDaemonRunning(pathOptions)) {
      throw new Error(
        'AISnitch daemon is already running. Use `aisnitch attach` or `aisnitch stop` first.',
      );
    }
  }

  async function rotateDaemonLogIfNeeded(
    pathOptions: DaemonPathOptions,
  ): Promise<void> {
    const logFilePath = getDaemonLogPath(pathOptions);
    const backupPath = `${logFilePath}.1`;
    const logSize = await getDaemonLogSize(pathOptions);

    if (logSize < DAEMON_LOG_MAX_BYTES) {
      return;
    }

    await rm(backupPath, { force: true });
    await rename(logFilePath, backupPath);
  }

  async function waitForDaemonReady(
    pathOptions: DaemonPathOptions,
  ): Promise<StatusSnapshot> {
    const deadline = Date.now() + DAEMON_READY_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const daemonState = await readDaemonState(pathOptions);

      if (daemonState && isProcessRunning(daemonState.pid)) {
        const health = await fetchHealth(daemonState.httpPort);

        if (health !== null) {
          return {
            configuredAdapters: [],
            daemonPid: daemonState.pid,
            health,
            httpPort: daemonState.httpPort,
            logFilePath: daemonState.logFilePath,
            running: true,
            socketPath: daemonState.socketPath,
            wsPort: daemonState.wsPort,
          };
        }
      }

      await sleep(DAEMON_READY_POLL_INTERVAL_MS);
    }

    throw new Error(
      `AISnitch daemon did not become ready in time. Check ${getDaemonLogPath(
        pathOptions,
      )}.`,
    );
  }

  async function waitForProcessExit(pid: number): Promise<boolean> {
    const deadline = Date.now() + DAEMON_STOP_TIMEOUT_MS;

    while (Date.now() < deadline) {
      if (!isProcessRunning(pid)) {
        return true;
      }

      await sleep(DAEMON_READY_POLL_INTERVAL_MS);
    }

    return !isProcessRunning(pid);
  }

  async function runPipelineHeadless(
    options: StartCliOptions,
    daemonMode: boolean,
  ): Promise<never> {
    const { config, pathOptions } = await loadEffectiveConfig(options);

    setLoggerLevel(getForegroundSafeLogLevel(config.logLevel, daemonMode));

    const pipeline = new Pipeline();
    const status = await pipeline.start({
      config,
      ...pathOptions,
    });

    if (daemonMode) {
      const daemonPathOptions = toPathOptions(options);

      await writePid(process.pid, daemonPathOptions);
      await writeDaemonState(
        {
          configPath: getEffectiveCliConfigPath(daemonPathOptions),
          httpPort: status.httpPort ?? config.httpPort,
          logFilePath: getDaemonLogPath(daemonPathOptions),
          pid: process.pid,
          socketPath: status.socketPath,
          startedAt: new Date().toISOString(),
          wsPort: status.wsPort ?? config.wsPort,
        },
        daemonPathOptions,
      );
    }

    let shuttingDown = false;

    const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;

      try {
        await pipeline.stop();
      } finally {
        if (daemonMode) {
          const daemonPathOptions = toPathOptions(options);

          await Promise.all([
            removePid(daemonPathOptions),
            removeDaemonState(daemonPathOptions),
          ]);
        }
      }

      if (!daemonMode) {
        output.stdout(`AISnitch stopped after ${signal}.\n`);
      }

      process.exit(exitCode);
    };

    if (daemonMode) {
      process.once('SIGTERM', () => {
        void shutdown('SIGTERM');
      });
      process.once('SIGINT', () => {
        void shutdown('SIGINT');
      });
      process.once('uncaughtException', (error) => {
        output.stderr(
          `AISnitch daemon crashed: ${
            error instanceof Error ? error.message : 'unknown exception'
          }\n`,
        );
        void shutdown('uncaughtException', 1);
      });
      process.once('unhandledRejection', (reason) => {
        output.stderr(
          `AISnitch daemon rejected a promise: ${
            reason instanceof Error ? reason.message : 'unknown rejection'
          }\n`,
        );
        void shutdown('unhandledRejection', 1);
      });

      return await new Promise<never>(() => undefined);
    }

    process.once('SIGTERM', () => {
      void shutdown('SIGTERM');
    });
    process.once('SIGINT', () => {
      void shutdown('SIGINT');
    });

    await renderForegroundTui({
      configuredAdapters: getEnabledAdapters(config),
      eventBus: pipeline.getEventBus(),
      onQuit: () => {
        void shutdown('tui-exit');
      },
      status,
    });

    return await new Promise<never>(() => undefined);
  }

  async function start(options: StartCliOptions): Promise<void> {
    if (options.daemon) {
      await ensureDaemonNotRunning(options);

      const daemonPathOptions = toPathOptions(options);

      await ensureConfigDir(daemonPathOptions);
      await rotateDaemonLogIfNeeded(daemonPathOptions);

      const daemonLogPath = getDaemonLogPath(daemonPathOptions);
      const stdoutFd = openSync(daemonLogPath, 'w');
      const stderrFd = openSync(daemonLogPath, 'a');
      const cliEntryPath = resolveCliEntryPath();
      const daemonArgs = [cliEntryPath, 'daemon-run', ...toDaemonArgv(options)];
      const child = spawnImplementation(process.execPath, daemonArgs, {
        detached: true,
        env: {
          ...process.env,
          AISNITCH_DAEMON: '1',
        },
        stdio: ['ignore', stdoutFd, stderrFd],
      });

      child.unref();
      closeSync(stdoutFd);
      closeSync(stderrFd);

      if (child.pid === undefined) {
        throw new Error('Failed to obtain the AISnitch daemon PID.');
      }

      const snapshot = await waitForDaemonReady(daemonPathOptions);

      output.stdout(
        `AISnitch daemon started (PID: ${child.pid}) on ws://${'127.0.0.1'}:${snapshot.wsPort}\n`,
      );

      return;
    }

    await ensureDaemonNotRunning(options);
    await runPipelineHeadless(options, false);
  }

  async function runDaemonProcess(options: StartCliOptions): Promise<void> {
    await ensureDaemonNotRunning(options);
    await runPipelineHeadless(options, true);
  }

  async function stop(options: CommonCliOptions): Promise<void> {
    const pathOptions = toPathOptions(options);

    const pid = await readPid(pathOptions);

    if (pid === null) {
      output.stdout('AISnitch daemon is not running.\n');
      return;
    }

    if (!isProcessRunning(pid)) {
      await cleanupStaleDaemonFiles(pathOptions);
      output.stdout('Removed stale AISnitch daemon state.\n');
      return;
    }

    process.kill(pid, 'SIGTERM');

    if (!(await waitForProcessExit(pid))) {
      throw new Error(`AISnitch daemon PID ${pid} did not stop in time.`);
    }

    await Promise.all([
      removePid(pathOptions),
      removeDaemonState(pathOptions),
    ]);

    output.stdout(`AISnitch daemon stopped (PID: ${pid}).\n`);
  }

  async function status(options: CommonCliOptions): Promise<void> {
    const snapshot = await getStatusSnapshot(options);
    const enabledAdapters =
      snapshot.configuredAdapters.length > 0
        ? snapshot.configuredAdapters.join(', ')
        : 'none';

    output.stdout(`AISnitch daemon: ${snapshot.running ? 'running' : 'stopped'}\n`);
    output.stdout(`PID: ${snapshot.daemonPid ?? 'none'}\n`);
    output.stdout(`WebSocket port: ${snapshot.wsPort}\n`);
    output.stdout(`HTTP port: ${snapshot.httpPort}\n`);
    output.stdout(`Socket path: ${snapshot.socketPath ?? 'none'}\n`);
    output.stdout(`Configured adapters: ${enabledAdapters}\n`);
    output.stdout(`Daemon log: ${snapshot.logFilePath}\n`);

    if (snapshot.health) {
      output.stdout(`Consumers: ${snapshot.health.consumers}\n`);
      output.stdout(`Events: ${snapshot.health.events}\n`);
      output.stdout(`Dropped events: ${snapshot.health.droppedEvents}\n`);
      output.stdout(`Uptime: ${snapshot.health.uptime}ms\n`);
    } else {
      output.stdout('Health endpoint: unavailable\n');
    }
  }

  async function adapters(options: CommonCliOptions): Promise<void> {
    const { config } = await loadEffectiveConfig(options);
    const tools = ToolNameSchema.options.filter(
      (toolName): toolName is ToolName => toolName !== 'unknown',
    );

    for (const toolName of tools) {
      const enabled = config.adapters[toolName]?.enabled === true;

      output.stdout(
        `${toolName}: ${enabled ? 'enabled' : 'disabled'} | runtime=stopped\n`,
      );
    }
  }

  async function attach(options: CommonCliOptions): Promise<void> {
    const snapshot = await getStatusSnapshot(options);

    if (!snapshot.running || snapshot.daemonPid === null) {
      throw new Error('AISnitch daemon is not running. Start it with `aisnitch start --daemon` first.');
    }

    output.stdout(
      `Attaching to ws://127.0.0.1:${snapshot.wsPort}. Press Ctrl+C to detach.\n`,
    );

    const closeMonitor = await attachWebSocketMonitor(
      `ws://127.0.0.1:${snapshot.wsPort}`,
      output,
    );

    await new Promise<void>((resolve) => {
      const detach = (): void => {
        process.removeListener('SIGINT', onSignal);
        process.removeListener('SIGTERM', onSignal);
        void Promise.resolve(closeMonitor()).finally(resolve);
      };
      const onSignal = (): void => {
        detach();
      };

      process.once('SIGINT', onSignal);
      process.once('SIGTERM', onSignal);
    });
  }

  async function install(options: CommonCliOptions): Promise<void> {
    if (process.platform !== 'darwin') {
      throw new Error('LaunchAgent install is currently supported on macOS only.');
    }

    const daemonPathOptions = toPathOptions(options);
    const launchAgentPath = getLaunchAgentPath(daemonPathOptions);
    const domainTarget = `gui/${getCurrentUid()}`;
    const plistContents = buildLaunchAgentPlist({
      cliEntryPath: resolveCliEntryPath(),
      configPath: options.config,
      logFilePath: getDaemonLogPath(daemonPathOptions),
      nodeExecutablePath: process.execPath,
    });

    await ensureConfigDir(daemonPathOptions);
    await ensureLaunchAgentDir(daemonPathOptions);

    try {
      await execFileImplementation('launchctl', ['bootout', domainTarget, launchAgentPath]);
    } catch {
      // Ignore bootout errors when the service is not loaded yet.
    }

    await writeFile(launchAgentPath, plistContents, 'utf8');
    await execFileImplementation('launchctl', ['bootstrap', domainTarget, launchAgentPath]);

    output.stdout(`AISnitch LaunchAgent installed at ${launchAgentPath}\n`);
  }

  async function uninstall(options: CommonCliOptions): Promise<void> {
    if (process.platform !== 'darwin') {
      throw new Error('LaunchAgent uninstall is currently supported on macOS only.');
    }

    const daemonPathOptions = toPathOptions(options);
    const launchAgentPath = getLaunchAgentPath(daemonPathOptions);
    const domainTarget = `gui/${getCurrentUid()}`;

    try {
      await execFileImplementation('launchctl', ['bootout', domainTarget, launchAgentPath]);
    } catch {
      // Ignore bootout errors when the agent was not loaded.
    }

    await rm(launchAgentPath, { force: true });

    output.stdout(`AISnitch LaunchAgent removed from ${launchAgentPath}\n`);
  }

  async function getStatusSnapshot(
    options: CommonCliOptions,
  ): Promise<StatusSnapshot> {
    const { config, pathOptions } = await loadEffectiveConfig(options);
    const daemonState = await readDaemonState(pathOptions);
    const daemonPid = await readPid(pathOptions);
    const running =
      daemonPid !== null &&
      isProcessRunning(daemonPid) &&
      daemonState !== null;
    const health =
      running && daemonState !== null
        ? await fetchHealth(daemonState.httpPort)
        : null;

    return {
      configuredAdapters: getEnabledAdapters(config),
      daemonPid,
      health,
      httpPort: daemonState?.httpPort ?? config.httpPort,
      logFilePath: getDaemonLogPath(pathOptions),
      running,
      socketPath: daemonState?.socketPath ?? joinSocketPath(pathOptions),
      wsPort: daemonState?.wsPort ?? config.wsPort,
    };
  }

  async function setup(
    toolName: SetupToolName,
    options: SetupCliOptions,
  ): Promise<void> {
    await runSetupCommand(toolName, options, {
      output: output as SetupOutput,
    });
  }

  return {
    adapters,
    attach,
    install,
    runDaemonProcess,
    setup,
    start,
    status,
    stop,
    uninstall,
  };
}

/**
 * Parses and validates a port option.
 */
export function parsePortOption(rawValue: string): number {
  const parsedPort = Number.parseInt(rawValue, 10);

  if (
    !Number.isInteger(parsedPort) ||
    parsedPort < 1024 ||
    parsedPort > 65535
  ) {
    throw new Error(`Invalid port: ${rawValue}`);
  }

  return parsedPort;
}

/**
 * Parses and validates a log level option.
 */
export function parseLogLevelOption(
  rawValue: string,
): AISnitchConfig['logLevel'] {
  if (!LOG_LEVELS.includes(rawValue as AISnitchConfig['logLevel'])) {
    throw new Error(`Invalid log level: ${rawValue}`);
  }

  return rawValue as AISnitchConfig['logLevel'];
}

/**
 * Builds the LaunchAgent plist used by `aisnitch install`.
 */
export function buildLaunchAgentPlist(
  options: LaunchAgentPlistOptions,
): string {
  const configArgs =
    options.configPath && options.configPath.length > 0
      ? `<string>--config</string>\n    <string>${escapeXml(options.configPath)}</string>\n    `
      : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(options.nodeExecutablePath)}</string>
    <string>${escapeXml(options.cliEntryPath)}</string>
    <string>start</string>
    <string>--daemon</string>
    ${configArgs.trimEnd()}
  </array>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>${escapeXml(options.logFilePath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(options.logFilePath)}</string>
</dict>
</plist>
`;
}

function createProcessOutput(): CliOutput {
  return {
    stderr: (text) => {
      process.stderr.write(text);
    },
    stdout: (text) => {
      process.stdout.write(text);
    },
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function getEnabledAdapters(config: AISnitchConfig): ToolName[] {
  return Object.entries(config.adapters)
    .filter((entry): entry is [ToolName, { enabled: boolean }] => {
      const [toolName, adapterConfig] = entry;

      return (
        ToolNameSchema.safeParse(toolName).success &&
        adapterConfig?.enabled === true
      );
    })
    .map(([toolName]) => toolName);
}

function isStartCliOptions(
  options: StartCliOptions | CommonCliOptions,
): options is StartCliOptions {
  return (
    'daemon' in options ||
    'httpPort' in options ||
    'logLevel' in options ||
    'wsPort' in options
  );
}

function joinSocketPath(pathOptions: ConfigPathOptions): string {
  return `${getAISnitchHomePath(pathOptions)}/aisnitch.sock`;
}

function resolveCliEntryPath(): string {
  const cliEntryPath = process.argv[1];

  if (!cliEntryPath || basename(cliEntryPath).length === 0) {
    throw new Error('Unable to resolve the AISnitch CLI entry path.');
  }

  return cliEntryPath;
}

function getForegroundSafeLogLevel(
  configuredLevel: AISnitchConfig['logLevel'],
  daemonMode: boolean,
): AISnitchConfig['logLevel'] {
  if (daemonMode || configuredLevel !== 'info') {
    return configuredLevel;
  }

  /**
   * 📖 The Ink UI is the primary foreground surface now, so the default
   * info-level startup chatter only makes the screen dirtier without helping
   * the operator. Warnings and errors still pass through.
   */
  return 'warn';
}

function getCurrentUid(): number {
  if (typeof process.getuid !== 'function') {
    throw new Error('Unable to resolve the current user id for LaunchAgent installation.');
  }

  return process.getuid();
}

function toDaemonArgv(options: StartCliOptions): string[] {
  const args: string[] = [];

  if (options.config) {
    args.push('--config', options.config);
  }

  if (options.wsPort !== undefined) {
    args.push('--ws-port', String(options.wsPort));
  }

  if (options.httpPort !== undefined) {
    args.push('--http-port', String(options.httpPort));
  }

  if (options.logLevel !== undefined) {
    args.push('--log-level', options.logLevel);
  }

  return args;
}

function toPathOptions(options: CommonCliOptions): ConfigPathOptions {
  return options.config ? { configPath: options.config } : {};
}
