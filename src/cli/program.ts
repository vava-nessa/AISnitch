import { Command, InvalidArgumentError } from 'commander';

import {
  AISNITCH_DESCRIPTION,
  AISNITCH_PACKAGE_NAME,
  AISNITCH_VERSION,
} from '../package-info.js';
import {
  parseMockDurationOption,
  parseMockSpeedOption,
  parseMockToolSelection,
} from './commands/mock.js';
import {
  parseSetupToolName,
  type SetupCliOptions,
  type SetupToolName,
} from './commands/setup.js';
import {
  createCliRuntime,
  parseEventTypeFilterOption,
  parseLogLevelOption,
  parsePortOption,
  parseTuiViewModeOption,
  parseToolFilterOption,
  type CliRuntime,
  type AttachCliOptions,
  type CommonCliOptions,
  type MockCliOptions,
  type SelfUpdateCliOptions,
  type StartCliOptions,
  type WrapCliOptions,
} from './runtime.js';
import type { AutoUpdateManager } from './auto-update.js';

/**
 * @file src/cli/program.ts
 * @description Commander-based CLI definition for AISnitch commands and shared options.
 * @functions
 *   → createProgram
 * @exports createProgram
 * @see ./runtime.ts
 * @see ./pid.ts
 */

interface ProgramDependencies {
  readonly runtime?: CliRuntime;
}

/**
 * 📖 Commander wiring stays isolated here so the entrypoint can stay tiny and
 * the runtime logic remains testable without shelling out to the real binary.
 */
export function createProgram(
  dependencies: ProgramDependencies = {},
): Command {
  const runtime = dependencies.runtime ?? createCliRuntime();
  const program = new Command();

  program
    .name(AISNITCH_PACKAGE_NAME)
    .description(AISNITCH_DESCRIPTION)
    .version(AISNITCH_VERSION)
    .showHelpAfterError()
    .showSuggestionAfterError()
    .addHelpText(
      'after',
      `
Examples:
  aisnitch start
  aisnitch start --daemon
  aisnitch start --view full-data
  aisnitch start --mock
  aisnitch status
  aisnitch attach
  aisnitch attach --view full-data
  aisnitch setup claude-code
  aisnitch setup aider
  aisnitch setup gemini-cli
  aisnitch setup goose
  aisnitch setup codex
  aisnitch setup copilot-cli
  aisnitch setup openclaw
  aisnitch mock all --speed 2 --duration 20
  aisnitch wrap aider --model sonnet
  aisnitch install
`,
    );

  addStartCommand(program, runtime);
  addStopCommand(program, runtime);
  addStatusCommand(program, runtime);
  addAdaptersCommand(program, runtime);
  addSetupCommand(program, runtime);
  addAttachCommand(program, runtime);
  addMockCommand(program, runtime);
  addWrapCommand(program, runtime);
  addInstallCommand(program, runtime);
  addUninstallCommand(program, runtime);
  addDaemonRunCommand(program, runtime);
  addAiderNotifyCommand(program, runtime);
  addSelfUpdateRunCommand(program, runtime);

  return program;
}

function addCommonOptions(command: Command): Command {
  return command.option(
    '--config <path>',
    'Override the config.json path used by AISnitch',
  );
}

function addStartCommand(program: Command, runtime: CliRuntime): void {
  addCommonOptions(
    program
      .command('start', { isDefault: true })
      .description('Open the AISnitch dashboard and manage the daemon')
      .option('--daemon', 'Run AISnitch as a detached daemon')
      .option(
        '--mock [tool]',
        'Inject deterministic mock events (defaults to "all" when no tool is specified)',
        wrapOptionParser(parseMockToolSelection),
      )
      .option(
        '--mock-speed <factor>',
        'Speed factor for mock replay',
        wrapOptionParser(parseMockSpeedOption),
      )
      .option('--mock-loop', 'Loop the mock scenario until stopped')
      .option(
        '--mock-duration <seconds>',
        'Duration of mock replay in seconds',
        wrapOptionParser(parseMockDurationOption),
      )
      .option(
        '--tool <tool>',
        'Pre-filter the foreground TUI by tool',
        wrapOptionParser(parseToolFilterOption),
      )
      .option(
        '--type <type>',
        'Pre-filter the foreground TUI by event type',
        wrapOptionParser(parseEventTypeFilterOption),
      )
      .option(
        '--view <view>',
        'Open the foreground TUI in summary or full-data mode',
        wrapOptionParser(parseTuiViewModeOption),
      )
      .option(
        '--ws-port <port>',
        'Override the WebSocket port',
        wrapOptionParser(parsePortOption),
      )
      .option(
        '--http-port <port>',
        'Override the HTTP hook port',
        wrapOptionParser(parsePortOption),
      )
      .option(
        '--log-level <level>',
        'Override the runtime log level',
        wrapOptionParser(parseLogLevelOption),
      ),
  ).action(async (options: StartCliOptions & { mock?: unknown }) => {
    await runtime.start({
      ...options,
      mock: normalizeMockSelection(options.mock),
    });
  });
}

function addStopCommand(program: Command, runtime: CliRuntime): void {
  addCommonOptions(
    program.command('stop').description('Stop the detached AISnitch daemon'),
  ).action(async (options: CommonCliOptions) => {
    await runtime.stop(options);
  });
}

function addStatusCommand(program: Command, runtime: CliRuntime): void {
  addCommonOptions(
    program.command('status').description('Show current AISnitch daemon status'),
  ).action(async (options: CommonCliOptions) => {
    await runtime.status(options);
  });
}

function addAdaptersCommand(program: Command, runtime: CliRuntime): void {
  addCommonOptions(
    program.command('adapters').description('List configured AISnitch adapters'),
  ).action(async (options: CommonCliOptions) => {
    await runtime.adapters(options);
  });
}

function addSetupCommand(program: Command, runtime: CliRuntime): void {
  addCommonOptions(
    program
      .command('setup')
      .description('Configure supported AI tools to forward events into AISnitch')
      .argument(
        '<tool>',
        'Tool to configure (claude-code, opencode, gemini-cli, aider, codex, goose, copilot-cli, openclaw)',
        parseSetupToolName,
      )
      .option('--revert', 'Restore the previous tool configuration from backup'),
  ).action(async (toolName: SetupToolName, options: SetupCliOptions) => {
    await runtime.setup(toolName, options);
  });
}

function addMockCommand(program: Command, runtime: CliRuntime): void {
  addCommonOptions(
    program
      .command('mock')
      .description('Replay deterministic mock event scenarios through the normal AISnitch pipeline')
      .argument(
        '<tool>',
        'Mock tool or scenario to replay (claude-code, opencode, all)',
        parseMockToolSelection,
      )
      .option(
        '--speed <factor>',
        'Speed factor for mock replay',
        wrapOptionParser(parseMockSpeedOption),
      )
      .option('--loop', 'Loop the selected scenario until the duration budget is reached')
      .option(
        '--duration <seconds>',
        'Duration of mock replay in seconds',
        wrapOptionParser(parseMockDurationOption),
      ),
  ).action(async (toolName: Parameters<CliRuntime['mock']>[0], options: MockCliOptions) => {
    await runtime.mock(toolName, options);
  });
}

function addAttachCommand(program: Command, runtime: CliRuntime): void {
  addCommonOptions(
    program
      .command('attach')
      .description('Open the AISnitch dashboard and attach to the daemon when active')
      .option(
        '--tool <tool>',
        'Pre-filter the attached TUI by tool',
        wrapOptionParser(parseToolFilterOption),
      )
      .option(
        '--type <type>',
        'Pre-filter the attached TUI by event type',
        wrapOptionParser(parseEventTypeFilterOption),
      )
      .option(
        '--view <view>',
        'Open the attached TUI in summary or full-data mode',
        wrapOptionParser(parseTuiViewModeOption),
      ),
  ).action(async (options: AttachCliOptions) => {
    await runtime.attach(options);
  });
}

function addWrapCommand(program: Command, runtime: CliRuntime): void {
  addCommonOptions(
    program
      .command('wrap')
      .description('Run a command inside a PTY while AISnitch observes its terminal activity')
      .allowUnknownOption(true)
      .argument('<command>', 'Command to wrap')
      .argument('[args...]', 'Arguments forwarded to the wrapped command')
      .option('--cwd <path>', 'Run the wrapped command from a specific working directory'),
  ).action(
    async (command: string, args: string[], options: WrapCliOptions) => {
      await runtime.wrap(command, args, options);
    },
  );
}

function addInstallCommand(program: Command, runtime: CliRuntime): void {
  addCommonOptions(
    program.command('install').description('Install a macOS LaunchAgent for AISnitch'),
  ).action(async (options: CommonCliOptions) => {
    await runtime.install(options);
  });
}

function addUninstallCommand(program: Command, runtime: CliRuntime): void {
  addCommonOptions(
    program.command('uninstall').description('Remove the AISnitch macOS LaunchAgent'),
  ).action(async (options: CommonCliOptions) => {
    await runtime.uninstall(options);
  });
}

function addDaemonRunCommand(program: Command, runtime: CliRuntime): void {
  addCommonOptions(
    program
      .command('daemon-run')
      .description('Internal headless daemon bootstrap command')
      .option(
        '--ws-port <port>',
        'Override the WebSocket port',
        wrapOptionParser(parsePortOption),
      )
      .option(
        '--http-port <port>',
        'Override the HTTP hook port',
        wrapOptionParser(parsePortOption),
      )
      .option(
        '--log-level <level>',
        'Override the runtime log level',
        wrapOptionParser(parseLogLevelOption),
      ),
  ).action(async (options: StartCliOptions) => {
    await runtime.runDaemonProcess(options);
  });
}

function addAiderNotifyCommand(program: Command, runtime: CliRuntime): void {
  addCommonOptions(
    program
      .command('aider-notify')
      .description('Internal aider notifications-command bridge'),
  ).action(async (options: CommonCliOptions) => {
    await runtime.aiderNotify(options);
  });
}

function addSelfUpdateRunCommand(program: Command, runtime: CliRuntime): void {
  const command = addCommonOptions(
    program
      .command('self-update-run')
      .description('Internal detached self-update worker')
      .requiredOption(
        '--manager <manager>',
        'Resolved package manager used for the silent self-update',
        wrapOptionParser(parseAutoUpdateManagerOption),
      )
      .requiredOption(
        '--target-version <version>',
        'Latest version detected on the registry',
      ),
  );

  command.action(async (options: SelfUpdateCliOptions) => {
    await runtime.selfUpdateRun(options);
  });
}

function parseAutoUpdateManagerOption(rawValue: string): AutoUpdateManager {
  if (
    rawValue === 'npm' ||
    rawValue === 'pnpm' ||
    rawValue === 'bun' ||
    rawValue === 'brew'
  ) {
    return rawValue;
  }

  throw new Error(`Unsupported auto-update manager: ${rawValue}`);
}

function wrapOptionParser<T>(
  parser: (value: string) => T,
): (value: string) => T {
  return (value) => {
    try {
      return parser(value);
    } catch (error: unknown) {
      throw new InvalidArgumentError(
        error instanceof Error ? error.message : 'Invalid option value.',
      );
    }
  };
}

function normalizeMockSelection(value: unknown): StartCliOptions['mock'] {
  if (value === undefined) {
    return undefined;
  }

  if (value === true) {
    return 'all';
  }

  if (value === 'all' || value === 'claude-code' || value === 'opencode') {
    return value;
  }

  throw new InvalidArgumentError('Unsupported mock scenario selection.');
}
