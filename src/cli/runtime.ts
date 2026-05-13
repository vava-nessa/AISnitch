import { execFile as execFileCallback, spawn as spawnChildProcess } from 'node:child_process';
import { closeSync, constants as fsConstants, openSync } from 'node:fs';
import { access, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
 
 
const openPromise = import('open');

import { GenericPTYSession } from '../adapters/generic-pty.js';
import {
  AISnitchEventTypeSchema,
  ToolNameSchema,
  type AISnitchEvent,
  type AISnitchConfig,
  type AISnitchEventType,
  type ToolName,
} from '../core/index.js';
import {
  ConfigSchema,
  LOG_LEVELS,
  Pipeline,
  setLoggerLevel,
  shutdownInOrder,
  DEFAULT_TIMEOUTS,
  type ConfigPathOptions,
  type HealthSnapshot,
} from '../core/index.js';
import {
  attachEventBusMonitor,
  renderForegroundTui,
  renderManagedTui,
  type MonitorCloseHandler,
  type MonitorOutput,
} from '../tui/index.js';
import {
  TUI_VIEW_MODES,
  type ManagedTuiSnapshot,
  type TuiInitialFilters,
  type TuiViewMode,
} from '../tui/types.js';
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
import {
  createAutoUpdateController,
  type AutoUpdateManager,
} from './auto-update.js';
import { attachWebSocketLogger } from './live-logger.js';
import {
  runMockScenario,
  type MockCommandOptions,
  type MockToolSelection,
} from './commands/mock.js';

/**
 * @file src/cli/runtime.ts
 * @description Runtime command implementations for foreground mode, daemon mode, status inspection, and launchd integration.
 * @functions
 *   → createCliRuntime
 *   → parsePortOption
 *   → parseLogLevelOption
 *   → buildLaunchAgentPlist
 * @exports CliOutput, CommonCliOptions, AttachCliOptions, StartCliOptions, MockCliOptions, createCliRuntime, parsePortOption, parseLogLevelOption, parseToolFilterOption, parseEventTypeFilterOption, parseTuiViewModeOption, buildLaunchAgentPlist
 * @see ./pid.ts
 * @see ../tui/live-monitor.ts
 * @see ../core/engine/pipeline.ts
 */

const execFile = promisify(execFileCallback);

const DAEMON_READY_TIMEOUT_MS = 4_000;
const DAEMON_READY_POLL_INTERVAL_MS = 100;
const DAEMON_STOP_TIMEOUT_MS = 4_000;
const DAEMON_LOG_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_DASHBOARD_PORT = 5174;
const LAUNCH_AGENT_LABEL = 'com.aisnitch.daemon';

async function resolveNodeExecutable(): Promise<string> {
  try {
    await access(process.execPath, fsConstants.X_OK);
    return process.execPath;
  } catch {
    // 📖 Homebrew upgrades can remove the exact Cellar path that launched AISnitch.
    // Falling back to PATH keeps `aisnitch fs` usable when `node` is still installed.
    return 'node';
  }
}

function formatSpawnError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveDashboardDistPath(): Promise<string> {
  if (process.env.AISNITCH_DASHBOARD_DIST) {
    const overridePath = process.env.AISNITCH_DASHBOARD_DIST;
    if (await pathExists(join(overridePath, 'index.html'))) {
      return overridePath;
    }

    throw new Error(
      `Fullscreen dashboard assets are missing at ${overridePath}. Reinstall AISnitch or run \`pnpm --filter aisnitch-fullscreen-dashboard build\` from the repository checkout.`,
    );
  }

  const cliEntryPath = process.argv[1]
    ? await realpath(process.argv[1]).catch(() => process.argv[1] ?? '')
    : '';
  const moduleDirectory = dirname(cliEntryPath);
  const packageRoot = dirname(dirname(moduleDirectory));
  const candidates = [
    join(packageRoot, 'examples', 'fullscreen-dashboard', 'dist'),
    join(process.cwd(), 'examples', 'fullscreen-dashboard', 'dist'),
  ];

  for (const candidate of candidates) {
    if (await pathExists(join(candidate, 'index.html'))) {
      return candidate;
    }
  }

  throw new Error(
    'Fullscreen dashboard assets are missing. Reinstall AISnitch or run `pnpm --filter aisnitch-fullscreen-dashboard build` from the repository checkout.',
  );
}

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
 * TUI filter options accepted by foreground and attach commands.
 */
export interface AttachCliOptions extends CommonCliOptions {
  readonly tool?: ToolName;
  readonly type?: AISnitchEventType;
  readonly view?: TuiViewMode;
}

/**
 * Options accepted by `aisnitch fullscreen`.
 */
export interface FullscreenCliOptions extends CommonCliOptions {
  readonly dashboardPort?: number;
  readonly daemon?: boolean;
  readonly noBrowser?: boolean;
}

/**
 * Options accepted by `aisnitch start`.
 */
export interface StartCliOptions extends AttachCliOptions {
  readonly dashboardPort?: number;
  readonly daemon?: boolean;
  readonly httpPort?: number;
  readonly logLevel?: AISnitchConfig['logLevel'];
  readonly mock?: MockToolSelection;
  readonly mockDuration?: number;
  readonly mockLoop?: boolean;
  readonly mockSpeed?: number;
  readonly wsPort?: number;
}

/**
 * Options accepted by `aisnitch mock`.
 */
export interface MockCliOptions extends CommonCliOptions, MockCommandOptions {}

/**
 * Options accepted by `aisnitch wrap`.
 */
export interface WrapCliOptions extends CommonCliOptions {
  readonly cwd?: string;
}

/**
 * Options accepted by the internal self-update worker command.
 */
export interface SelfUpdateCliOptions extends CommonCliOptions {
  readonly manager: AutoUpdateManager;
  readonly targetVersion: string;
}

/**
 * Stable runtime command interface consumed by the commander program wiring.
 */
export interface CliRuntime {
  readonly adapters: (options: CommonCliOptions) => Promise<void>;
  readonly aiderNotify: (options: CommonCliOptions) => Promise<void>;
  readonly attach: (options: AttachCliOptions) => Promise<void>;
  readonly fullscreen: (options: FullscreenCliOptions) => Promise<void>;
  readonly install: (options: CommonCliOptions) => Promise<void>;
  readonly logger: (options: AttachCliOptions) => Promise<void>;
  readonly mock: (
    selection: MockToolSelection,
    options: MockCliOptions,
  ) => Promise<void>;
  readonly runDaemonProcess: (options: StartCliOptions) => Promise<void>;
  readonly selfUpdateRun: (options: SelfUpdateCliOptions) => Promise<void>;
  readonly setup: (
    toolName: SetupToolName,
    options: SetupCliOptions,
  ) => Promise<void>;
  readonly start: (options: StartCliOptions) => Promise<void>;
  readonly status: (options: CommonCliOptions) => Promise<void>;
  readonly stop: (options: CommonCliOptions) => Promise<void>;
  readonly uninstall: (options: CommonCliOptions) => Promise<void>;
  readonly wrap: (
    command: string,
    args: readonly string[],
    options: WrapCliOptions,
  ) => Promise<void>;
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
  readonly renderManagedTui?: typeof renderManagedTui;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly spawn?: typeof spawnChildProcess;
}

interface StatusSnapshot {
  readonly configuredAdapters: readonly ToolName[];
  readonly dashboardPort: number;
  readonly daemonPid: number | null;
  readonly health: HealthSnapshot | null;
  readonly httpPort: number;
  readonly logFilePath: string;
  readonly running: boolean;
  readonly socketPath: string | null;
  readonly wsPort: number;
}

interface SocketEventPublisher {
  readonly close: () => Promise<void>;
  readonly publish: (event: AISnitchEvent) => Promise<boolean>;
}

interface DashboardServerProcess {
  readonly kill: () => void;
  readonly pid: number | undefined;
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
  const renderManagedTuiImplementation =
    dependencies.renderManagedTui ?? renderManagedTui;
  const spawnImplementation = dependencies.spawn ?? spawnChildProcess;
  const autoUpdateController = createAutoUpdateController({
    fetch: fetchImplementation,
    spawn: spawnImplementation,
  });
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
            dashboardPort: options.dashboardPort ?? baseConfig.dashboardPort,
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

  async function fetchOk(url: string): Promise<boolean> {
    try {
      const response = await fetchImplementation(url);
      return response.ok;
    } catch {
      return false;
    }
  }

  async function waitForDashboardReady(port: number): Promise<boolean> {
    const dashboardUrl = `http://127.0.0.1:${port}`;

    for (let i = 0; i < 100; i++) {
      if (await fetchOk(dashboardUrl)) {
        return true;
      }

      await sleep(100);
    }

    return false;
  }

  async function startDashboardServerProcess(
    port: number,
  ): Promise<DashboardServerProcess> {
    const dashboardUrl = `http://127.0.0.1:${port}`;

    if (await fetchOk(dashboardUrl)) {
      return {
        kill: () => undefined,
        pid: undefined,
      };
    }

    const distPath = await resolveDashboardDistPath();
    const nodeExecutable = await resolveNodeExecutable();
    const serverProcess = spawnImplementation(nodeExecutable, [
      '-e',
      buildDashboardServerScript(distPath, port),
    ], {
      cwd: distPath,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let serverOutput = '';
    let serverSpawnError: Error | undefined;

    serverProcess.on('error', (error: Error) => {
      serverSpawnError = error;
      serverOutput += `Dashboard server process failed: ${formatSpawnError(error)}\n`;
    });

    serverProcess.stdout?.on('data', (data: { toString: () => string }) => {
      serverOutput += data.toString();
    });

    serverProcess.stderr?.on('data', (data: { toString: () => string }) => {
      serverOutput += data.toString();
    });

    for (let i = 0; i < 100; i++) {
      if (await fetchOk(dashboardUrl)) {
        return {
          kill: () => {
            if (serverProcess.pid !== undefined) {
              try {
                process.kill(serverProcess.pid, 'SIGTERM');
              } catch {
                // Process may already be dead.
              }
            }
          },
          pid: serverProcess.pid,
        };
      }

      if (serverSpawnError !== undefined) {
        throw new Error(
          `Failed to start dashboard server process with ${nodeExecutable}: ${formatSpawnError(serverSpawnError)}`,
        );
      }

      await sleep(100);
    }

    throw new Error(
      `Failed to start dashboard server at ${dashboardUrl}. Server output: ${serverOutput}`,
    );
  }

  function buildDashboardServerScript(distPath: string, port: number): string {
    return `
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const distPath = ${JSON.stringify(distPath)};
const port = ${port};
const root = resolve(distPath);
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);

function safePath(url) {
  const parsed = new URL(url ?? '/', 'http://127.0.0.1');
  const pathname = parsed.pathname === '/' ? '/index.html' : parsed.pathname;
  const decoded = decodeURIComponent(pathname);
  const normalized = normalize(decoded).replace(/^[/\\]+/, '');
  const absolute = resolve(join(root, normalized));

  if (absolute !== root && !absolute.startsWith(root + '/')) {
    return null;
  }

  return absolute;
}

await stat(join(root, 'index.html'));

const server = createServer(async (request, response) => {
  const requestedPath = safePath(request.url);

  if (requestedPath === null) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }

  try {
    const fileStat = await stat(requestedPath);
    const filePath = fileStat.isFile() ? requestedPath : join(root, 'index.html');
    const contentType = contentTypes.get(extname(filePath)) ?? 'application/octet-stream';

    response.writeHead(200, { 'content-type': contentType });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    createReadStream(join(root, 'index.html')).pipe(response);
  }
});

server.on('error', (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen);
  server.listen(port, '127.0.0.1', resolveListen);
});

process.stdin.resume();
`;
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

  async function startDetachedDaemon(
    options: StartCliOptions,
  ): Promise<StatusSnapshot> {
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

    return await waitForDaemonReady(
      daemonPathOptions,
      options.dashboardPort ?? DEFAULT_DASHBOARD_PORT,
    );
  }

  async function stopDetachedDaemon(options: CommonCliOptions): Promise<void> {
    const pathOptions = toPathOptions(options);
    const pid = await readPid(pathOptions);

    if (pid === null) {
      await cleanupStaleDaemonFiles(pathOptions);
      return;
    }

    if (!isProcessRunning(pid)) {
      await cleanupStaleDaemonFiles(pathOptions);
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
  }

  function toManagedTuiSnapshot(snapshot: StatusSnapshot): ManagedTuiSnapshot {
    return {
      configuredAdapters: snapshot.configuredAdapters,
      status: {
        connected: snapshot.running && snapshot.health !== null,
        connectionLabel:
          snapshot.running && snapshot.health !== null
            ? 'Live Daemon Stream'
            : 'Daemon Stream Offline',
        consumerCount: snapshot.health?.consumers ?? 0,
        daemon: {
          active: snapshot.running,
          dashboardUrl: `http://127.0.0.1:${snapshot.dashboardPort}`,
          httpUrl: `http://127.0.0.1:${snapshot.httpPort}/health`,
          pid: snapshot.daemonPid,
          socketPath: snapshot.socketPath,
          wsUrl: `ws://127.0.0.1:${snapshot.wsPort}`,
        },
        eventCount: snapshot.health?.events ?? 0,
        uptimeMs: snapshot.health?.uptime ?? 0,
      },
    };
  }

  async function runMockAgainstRunningDaemon(
    selection: MockToolSelection,
    options: {
      readonly config?: string;
      readonly duration?: number;
      readonly loop?: boolean;
      readonly speed?: number;
    },
  ): Promise<void> {
    const snapshot = await getStatusSnapshot(options);

    if (!snapshot.running || snapshot.socketPath === null) {
      throw new Error('Cannot inject mock events because the AISnitch daemon is not running.');
    }

    const socketPublisher = await createSocketEventPublisher(snapshot.socketPath);

    try {
      await runMockScenario({
        durationSeconds: options.duration ?? 60,
        loop: options.loop ?? false,
        publishEvent: async (event) => {
          return await socketPublisher.publish(event);
        },
        selection,
        speed: options.speed ?? 1,
      });
    } finally {
      await socketPublisher.close();
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
    dashboardPort = DEFAULT_DASHBOARD_PORT,
  ): Promise<StatusSnapshot> {
    const deadline = Date.now() + DAEMON_READY_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const daemonState = await readDaemonState(pathOptions);

      if (daemonState && isProcessRunning(daemonState.pid)) {
        const health = await fetchHealth(daemonState.httpPort);

        if (health !== null) {
          return {
            configuredAdapters: [],
            dashboardPort,
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

      const loggedFailure = await readDaemonStartupFailure(pathOptions);

      if (loggedFailure !== null) {
        throw new Error(loggedFailure);
      }

      await sleep(DAEMON_READY_POLL_INTERVAL_MS);
    }

    throw new Error(
      `AISnitch daemon did not become ready in time. Check ${getDaemonLogPath(
        pathOptions,
      )}.`,
    );
  }

  async function readDaemonStartupFailure(
    pathOptions: DaemonPathOptions,
  ): Promise<string | null> {
    try {
      const daemonLog = await readFile(getDaemonLogPath(pathOptions), 'utf8');
      const logLines = daemonLog
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const lastLine = logLines.at(-1);

      if (!lastLine) {
        return null;
      }

      /**
       * 📖 When daemon startup dies before the health endpoint appears, the log
       * already contains the precise root cause. Bubble that up immediately so
       * the TUI shows the real failure instead of a useless timeout wrapper.
       */
      if (lastLine.startsWith('AISnitch CLI failed:')) {
        return lastLine;
      }

      const structuredFailure = parseStructuredDaemonFailure(lastLine);

      return structuredFailure === null
        ? null
        : `AISnitch daemon startup failed: ${structuredFailure}`;
    } catch {
      return null;
    }
  }

  /**
   * 📖 Daemon stdout is structured pino JSON, so startup polling must ignore
   * normal info lines like "UDS server started" and only surface actual error
   * or fatal records.
   */
  function parseStructuredDaemonFailure(logLine: string): string | null {
    try {
      const parsedLog = JSON.parse(logLine) as {
        readonly level?: unknown;
        readonly msg?: unknown;
      };

      if (typeof parsedLog.level !== 'number' || parsedLog.level < 50) {
        return null;
      }

      return typeof parsedLog.msg === 'string' && parsedLog.msg.length > 0
        ? parsedLog.msg
        : logLine;
    } catch {
      return null;
    }
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

  function startMockEmitter(
    pipeline: Pipeline,
    options: StartCliOptions,
  ): void {
    if (!options.mock) {
      return;
    }

    const speed = options.mockSpeed ?? 1;
    const durationSeconds = options.mockDuration ?? 60;
    const loop = options.mockLoop ?? false;

    output.stdout(
      `Starting mock scenario ${options.mock} (${speed}x, ${durationSeconds}s${loop ? ', loop' : ''}).\n`,
    );

    void runMockScenario({
      durationSeconds,
      loop,
      publishEvent: async (event) => {
        return await pipeline.publishEvent(event);
      },
      selection: options.mock,
      speed,
    }).then((result) => {
      output.stdout(
        `Mock scenario ${options.mock} published ${result.publishedEvents} events across ${result.loopCount} loop(s).\n`,
      );
    }).catch((error: unknown) => {
      output.stderr(
        `Mock scenario failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
      );
    });
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

    startMockEmitter(pipeline, options);

    const dashboardServer = daemonMode
      ? await startDashboardServerProcess(config.dashboardPort)
      : null;

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

    /**
     * Graceful shutdown with per-component timeout using withShutdownTimeout.
     * Prevents any single component from blocking daemon exit indefinitely.
     */
    const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;

      // Use per-component timeouts to prevent any single component from blocking shutdown
      const shutdownTimeouts = {
        adapterRegistry: DEFAULT_TIMEOUTS.adapterShutdown,
        httpReceiver: DEFAULT_TIMEOUTS.httpRequest,
        udsServer: DEFAULT_TIMEOUTS.fileOperation,
        wsServer: DEFAULT_TIMEOUTS.wsConnection,
        cleanupFns: 1_000,
      };

      const components = {
        adapterRegistry: pipeline.getAdapterRegistry(),
        httpReceiver: pipeline.getHttpReceiver(),
        udsServer: pipeline.getUdsServer(),
        wsServer: pipeline.getWsServer(),
        eventBus: pipeline.getEventBus(),
        cleanupFns: daemonMode ? [async () => {
          dashboardServer?.kill();
          await Promise.all([
            removePid(toPathOptions(options)),
            removeDaemonState(toPathOptions(options)),
          ]);
        }] : [],
      };

      try {
        await shutdownInOrder(components, shutdownTimeouts, 'pipeline');
      } finally {
        if (!daemonMode) {
          output.stdout(`AISnitch stopped after ${signal}.\n`);
        }

        process.exit(exitCode);
      }
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
    process.once('uncaughtException', (error) => {
      output.stderr(
        `AISnitch crashed: ${
          error instanceof Error ? error.message : 'unknown exception'
        }\n`,
      );
      void shutdown('uncaughtException', 1);
    });
    process.once('unhandledRejection', (reason) => {
      output.stderr(
        `AISnitch rejected a promise: ${
          reason instanceof Error ? reason.message : 'unknown rejection'
        }\n`,
      );
      void shutdown('unhandledRejection', 1);
    });

    await renderForegroundTui({
      configuredAdapters: getEnabledAdapters(config),
      eventBus: pipeline.getEventBus(),
      initialFilters: toInitialTuiFilters(options),
      onQuit: () => {
        void shutdown('tui-exit');
      },
      status,
    });

    return await new Promise<never>(() => undefined);
  }

  async function start(options: StartCliOptions): Promise<void> {
    void autoUpdateController.scheduleForInteractiveLaunch(toPathOptions(options));

    if (options.daemon) {
      const snapshot = await startDetachedDaemon(options);

      output.stdout(
        `AISnitch daemon started (PID: ${snapshot.daemonPid ?? 'unknown'}) on ws://${'127.0.0.1'}:${snapshot.wsPort}\nDashboard: http://127.0.0.1:${snapshot.dashboardPort}\n`,
      );

      return;
    }

    let initialSnapshot = await getStatusSnapshot(options);

    if (!initialSnapshot.running) {
      initialSnapshot = await startDetachedDaemon(options);
    }

    if (options.mock) {
      output.stdout(
        `Starting mock scenario ${options.mock} (${options.mockSpeed ?? 1}x, ${options.mockDuration ?? 60}s${options.mockLoop ? ', loop' : ''}).\n`,
      );

      void runMockAgainstRunningDaemon(options.mock, {
        config: options.config,
        duration: options.mockDuration,
        loop: options.mockLoop,
        speed: options.mockSpeed,
      }).catch((error: unknown) => {
        output.stderr(
          `Mock scenario failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
        );
      });
    }

    await renderManagedTuiImplementation({
      initialFilters: toInitialTuiFilters(options),
      initialSnapshot: toManagedTuiSnapshot(initialSnapshot),
      onQuit: () => undefined,
      refreshSnapshot: async () => {
        return toManagedTuiSnapshot(await getStatusSnapshot(options));
      },
      toggleDaemon: async () => {
        const currentSnapshot = await getStatusSnapshot(options);

        if (currentSnapshot.running) {
          await stopDetachedDaemon(options);
        } else {
          await startDetachedDaemon(options);
        }

        return toManagedTuiSnapshot(await getStatusSnapshot(options));
      },
    });
  }

  async function runDaemonProcess(options: StartCliOptions): Promise<void> {
    await ensureDaemonNotRunning(options);
    await runPipelineHeadless(options, true);
  }

  async function stop(options: CommonCliOptions): Promise<void> {
    const snapshot = await getStatusSnapshot(options);

    if (!snapshot.running || snapshot.daemonPid === null) {
      await cleanupStaleDaemonFiles(toPathOptions(options));
      output.stdout('AISnitch daemon is not running.\n');
      return;
    }

    await stopDetachedDaemon(options);
    output.stdout(`AISnitch daemon stopped (PID: ${snapshot.daemonPid}).\n`);
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
    output.stdout(`Dashboard: http://127.0.0.1:${snapshot.dashboardPort}\n`);
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
    const snapshot = await getStatusSnapshot(options);
    const tools = ToolNameSchema.options.filter(
      (toolName): toolName is ToolName => toolName !== 'unknown',
    );

    for (const toolName of tools) {
      const enabled = config.adapters[toolName]?.enabled === true;

      output.stdout(
        `${toolName}: ${enabled ? 'enabled' : 'disabled'} | runtime=${enabled && snapshot.running ? 'running' : 'stopped'}\n`,
      );
    }
  }

  async function attach(options: AttachCliOptions): Promise<void> {
    void autoUpdateController.scheduleForInteractiveLaunch(toPathOptions(options));

    const snapshot = await getStatusSnapshot(options);

    await renderManagedTuiImplementation({
      initialFilters: toInitialTuiFilters(options),
      initialSnapshot: toManagedTuiSnapshot(snapshot),
      onQuit: () => undefined,
      refreshSnapshot: async () => {
        return toManagedTuiSnapshot(await getStatusSnapshot(options));
      },
      toggleDaemon: async () => {
        const currentSnapshot = await getStatusSnapshot(options);

        if (currentSnapshot.running) {
          await stopDetachedDaemon(options);
        } else {
          await startDetachedDaemon(options);
        }

        return toManagedTuiSnapshot(await getStatusSnapshot(options));
      },
    });
  }

  /**
   * 📖 Default `aisnitch` entrypoint: ensures the daemon is up, makes sure the
   * fullscreen dashboard server is reachable (spawning a standalone one if
   * needed), then opens the user's browser. Designed to be self-healing when an
   * older daemon is still running without the dashboard child process.
   *
   * Flow:
   * 1. Check daemon state, start a detached daemon if missing.
   * 2. Probe the dashboard URL; if unreachable, spawn a standalone server.
   * 3. Open the browser unless `--no-browser` was passed.
   */
  async function fullscreen(options: FullscreenCliOptions): Promise<void> {
    let snapshot = await getStatusSnapshot(options);

    if (!snapshot.running) {
      output.stdout('Starting daemon...\n');
      snapshot = await startDetachedDaemon({
        ...options,
        dashboardPort: options.dashboardPort,
      });
    }

    const dashboardPort = options.dashboardPort ?? snapshot.dashboardPort;
    const dashboardUrl = `http://127.0.0.1:${dashboardPort}`;

    if (!(await waitForDashboardReady(dashboardPort))) {
      output.stdout(
        `Dashboard not reachable at ${dashboardUrl}, starting a standalone server...\n`,
      );

      try {
        await startDashboardServerProcess(dashboardPort);
      } catch (error: unknown) {
        throw new Error(
          `Dashboard did not become reachable at ${dashboardUrl}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
          { cause: error },
        );
      }

      if (!(await waitForDashboardReady(dashboardPort))) {
        throw new Error(
          `Dashboard did not become reachable at ${dashboardUrl}.`,
        );
      }
    }

    output.stdout(`Dashboard ready at ${dashboardUrl}\n`);

    if (!options.noBrowser) {
      output.stdout('Opening browser...\n');
      try {
        const openModule = await openPromise;
        await (openModule as { default: (url: string) => Promise<unknown> }).default(dashboardUrl);
      } catch (error: unknown) {
        output.stderr(
          `Failed to open browser automatically (${error instanceof Error ? error.message : 'unknown error'}). Open ${dashboardUrl} manually.\n`,
        );
      }
    }
  }

  async function logger(options: AttachCliOptions): Promise<void> {
    const snapshot = await getStatusSnapshot(options);

    if (!snapshot.running) {
      throw new Error(
        'AISnitch logger requires a running daemon. Start one with `aisnitch start --daemon` or use `aisnitch start` first.',
      );
    }

    const closeLogger = await attachWebSocketLogger(
      `ws://127.0.0.1:${snapshot.wsPort}`,
      output,
      {
        tool: options.tool,
        type: options.type,
      },
    );

    await new Promise<void>((resolve) => {
      let closed = false;

      const shutdown = async () => {
        if (closed) {
          return;
        }

        closed = true;
        process.off('SIGINT', handleSigint);
        process.off('SIGTERM', handleSigterm);
        await Promise.resolve(closeLogger());
        resolve();
      };
      const handleSigint = () => {
        void shutdown();
      };
      const handleSigterm = () => {
        void shutdown();
      };

      process.once('SIGINT', handleSigint);
      process.once('SIGTERM', handleSigterm);
    });
  }

  async function mock(
    selection: MockToolSelection,
    options: MockCliOptions,
  ): Promise<void> {
    const pathOptions = toPathOptions(options);
    const daemonState = await readDaemonState(pathOptions);
    const daemonPid = await readPid(pathOptions);
    const daemonAvailable =
      daemonState !== null &&
      daemonPid !== null &&
      isProcessRunning(daemonPid) &&
      daemonState.socketPath !== null;

    if (daemonAvailable) {
      const socketPublisher = await createSocketEventPublisher(
        daemonState.socketPath ?? joinSocketPath(pathOptions),
      );

      try {
        output.stdout(
          `Streaming mock scenario ${selection} into the running AISnitch daemon.\n`,
        );

        const result = await runMockScenario({
          durationSeconds: options.duration ?? 60,
          loop: options.loop ?? false,
          publishEvent: async (event) => {
            return await socketPublisher.publish(event);
          },
          selection,
          speed: options.speed ?? 1,
        });

        output.stdout(
          `Published ${result.publishedEvents} mock events across ${result.loopCount} loop(s).\n`,
        );
      } finally {
        await socketPublisher.close();
      }

      return;
    }

    const { config } = await loadEffectiveConfig(options);

    setLoggerLevel(getForegroundSafeLogLevel(config.logLevel, false));

    const ephemeralHomeDirectory = await mkdtemp(join(tmpdir(), 'aisnitch-mock-'));
    const ephemeralPipeline = new Pipeline();
    const status = await ephemeralPipeline.start({
      config: {
        ...config,
        adapters: {},
      },
      homeDirectory: ephemeralHomeDirectory,
      ...pathOptions,
    });
    const monitorClose = attachEventBusMonitor(ephemeralPipeline.getEventBus(), {
      stderr: (text) => {
        output.stderr(prefixMonitorText(text));
      },
      stdout: (text) => {
        output.stderr(prefixMonitorText(text));
      },
    });

    output.stdout(
      `AISnitch mock started an ephemeral local pipeline on ws://127.0.0.1:${status.wsPort}\n`,
    );

    try {
      const result = await runMockScenario({
        durationSeconds: options.duration ?? 60,
        loop: options.loop ?? false,
        publishEvent: async (event) => {
          return await ephemeralPipeline.publishEvent(event);
        },
        selection,
        speed: options.speed ?? 1,
      });

      output.stdout(
        `Published ${result.publishedEvents} mock events across ${result.loopCount} loop(s).\n`,
      );
    } finally {
      await Promise.resolve(monitorClose());
      await ephemeralPipeline.stop();
      await rm(ephemeralHomeDirectory, { force: true, recursive: true });
    }
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

  async function wrap(
    command: string,
    args: readonly string[],
    options: WrapCliOptions,
  ): Promise<void> {
    const executionCwd = options.cwd ?? process.cwd();
    const pathOptions = toPathOptions(options);
    const daemonState = await readDaemonState(pathOptions);
    const daemonPid = await readPid(pathOptions);
    const daemonAvailable =
      daemonState !== null &&
      daemonPid !== null &&
      isProcessRunning(daemonPid) &&
      daemonState.socketPath !== null;
    let ephemeralPipeline: Pipeline | null = null;
    let ephemeralHomeDirectory: string | null = null;
    let monitorClose: MonitorCloseHandler | null = null;
    let socketPublisher: SocketEventPublisher | null = null;
    let wrappedExitCode!: number;

    if (daemonAvailable) {
      socketPublisher = await createSocketEventPublisher(
        daemonState.socketPath ?? joinSocketPath(pathOptions),
      );
    } else {
      const { config } = await loadEffectiveConfig(options);

      setLoggerLevel(getForegroundSafeLogLevel(config.logLevel, false));
      ephemeralHomeDirectory = await mkdtemp(join(tmpdir(), 'aisnitch-wrap-'));
      ephemeralPipeline = new Pipeline();
      await ephemeralPipeline.start({
        config: {
          ...config,
          adapters: {},
        },
        homeDirectory: ephemeralHomeDirectory,
        ...pathOptions,
      });
      monitorClose = attachEventBusMonitor(ephemeralPipeline.getEventBus(), {
        stderr: (text) => {
          output.stderr(prefixMonitorText(text));
        },
        stdout: (text) => {
          output.stderr(prefixMonitorText(text));
        },
      });

      output.stderr(
        'AISnitch wrap is using an ephemeral local monitor because no daemon is running.\n',
      );
    }

    try {
      const ptySession = new GenericPTYSession({
        args,
        command,
        cwd: executionCwd,
        env: process.env,
        publishEvent: async (event, context) => {
          if (socketPublisher !== null) {
            return await socketPublisher.publish(event);
          }

          if (ephemeralPipeline !== null) {
            return await ephemeralPipeline.publishEvent(event, context);
          }

          return false;
        },
        stdin: process.stdin,
        stdout: process.stdout,
      });
      wrappedExitCode = await ptySession.run();

      if (wrappedExitCode !== 0) {
        process.exitCode = wrappedExitCode;
      }
    } finally {
      if (monitorClose !== null) {
        await Promise.resolve(monitorClose());
      }

      if (socketPublisher !== null) {
        await socketPublisher.close();
      }

      if (ephemeralPipeline !== null) {
        await ephemeralPipeline.stop();
      }

      if (ephemeralHomeDirectory !== null) {
        await rm(ephemeralHomeDirectory, { force: true, recursive: true });
      }
    }

    process.exit(wrappedExitCode);
  }

  async function aiderNotify(options: CommonCliOptions): Promise<void> {
    const { config } = await loadEffectiveConfig(options);

    try {
      await fetchImplementation(`http://127.0.0.1:${config.httpPort}/hooks/aider`, {
        body: JSON.stringify({
          cwd: process.cwd(),
          data: {
            cwd: process.cwd(),
            raw: {
              argv: process.argv.slice(2),
              source: 'notifications-command',
            },
          },
          pid: process.ppid > 1 ? process.ppid : undefined,
          source: 'aisnitch://adapters/aider/notifications-command',
          transcriptPath: join(process.cwd(), '.aider.chat.history.md'),
          type: 'agent.idle',
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });
    } catch {
      // Aider notifications must stay fire-and-forget, even when AISnitch is offline.
    }
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
    await cleanupStaleDaemonFiles(pathOptions);
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
      dashboardPort: config.dashboardPort ?? DEFAULT_DASHBOARD_PORT,
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

  async function selfUpdateRun(options: SelfUpdateCliOptions): Promise<void> {
    await autoUpdateController.runDetachedUpdate({
      configPath: options.config,
      env: process.env,
      latestVersion: options.targetVersion,
      manager: options.manager,
    });
  }

  return {
    adapters,
    aiderNotify,
    attach,
    fullscreen,
    install,
    logger,
    mock,
    runDaemonProcess,
    selfUpdateRun,
    setup,
    start,
    status,
    stop,
    uninstall,
    wrap,
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
 * Parses and validates a CLI tool filter.
 */
export function parseToolFilterOption(rawValue: string): ToolName {
  const parsedTool = ToolNameSchema.safeParse(rawValue);

  if (!parsedTool.success || parsedTool.data === 'unknown') {
    throw new Error(`Invalid tool filter: ${rawValue}`);
  }

  return parsedTool.data;
}

/**
 * Parses and validates a CLI event-type filter.
 */
export function parseEventTypeFilterOption(
  rawValue: string,
): AISnitchEventType {
  const parsedEventType = AISnitchEventTypeSchema.safeParse(rawValue);

  if (!parsedEventType.success) {
    throw new Error(`Invalid event type filter: ${rawValue}`);
  }

  return parsedEventType.data;
}

/**
 * Parses and validates the initial TUI body view.
 */
export function parseTuiViewModeOption(rawValue: string): TuiViewMode {
  if (
    TUI_VIEW_MODES.includes(rawValue as TuiViewMode)
  ) {
    return rawValue as TuiViewMode;
  }

  throw new Error(`Invalid TUI view: ${rawValue}`);
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

async function createSocketEventPublisher(
  socketPath: string,
): Promise<SocketEventPublisher> {
  const socket = createConnection(socketPath);

  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => {
      resolve();
    });
    socket.once('error', reject);
  });

  return {
    close: async () => {
      if (socket.destroyed) {
        return;
      }

      await new Promise<void>((resolve) => {
        socket.end(() => {
          resolve();
        });
      });
    },
    publish: async (event) => {
      if (socket.destroyed) {
        return false;
      }

      return await new Promise<boolean>((resolve) => {
        socket.write(`${JSON.stringify(event)}\n`, (error) => {
          resolve(error === undefined || error === null);
        });
      });
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

function prefixMonitorText(text: string): string {
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? `[aisnitch] ${line}` : line))
    .join('\n');
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

  if (options.mock !== undefined) {
    args.push('--mock', options.mock);
  }

  if (options.mockSpeed !== undefined) {
    args.push('--mock-speed', String(options.mockSpeed));
  }

  if (options.mockLoop) {
    args.push('--mock-loop');
  }

  if (options.mockDuration !== undefined) {
    args.push('--mock-duration', String(options.mockDuration));
  }

  return args;
}

function toInitialTuiFilters(
  options: AttachCliOptions,
): TuiInitialFilters | undefined {
  if (
    options.tool === undefined &&
    options.type === undefined &&
    options.view === undefined
  ) {
    return undefined;
  }

  return {
    tool: options.tool,
    type: options.type,
    view: options.view,
  };
}

function toPathOptions(options: CommonCliOptions): ConfigPathOptions {
  return options.config
    ? { configPath: options.config, env: process.env }
    : { env: process.env };
}
