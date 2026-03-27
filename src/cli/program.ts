import { Command, InvalidArgumentError } from 'commander';

import {
  AISNITCH_DESCRIPTION,
  AISNITCH_PACKAGE_NAME,
  AISNITCH_VERSION,
} from '../package-info.js';
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
  type StartCliOptions,
  type WrapCliOptions,
} from './runtime.js';

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
  aisnitch status
  aisnitch attach
  aisnitch attach --view full-data
  aisnitch setup claude-code
  aisnitch setup aider
  aisnitch setup gemini-cli
  aisnitch setup goose
  aisnitch setup codex
  aisnitch setup copilot-cli
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
  addWrapCommand(program, runtime);
  addInstallCommand(program, runtime);
  addUninstallCommand(program, runtime);
  addDaemonRunCommand(program, runtime);
  addAiderNotifyCommand(program, runtime);

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
      .description('Start AISnitch in foreground mode by default')
      .option('--daemon', 'Run AISnitch as a detached daemon')
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
  ).action(async (options: StartCliOptions) => {
    await runtime.start(options);
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
        'Tool to configure (claude-code, opencode, gemini-cli, aider, codex, goose, copilot-cli)',
        parseSetupToolName,
      )
      .option('--revert', 'Restore the previous tool configuration from backup'),
  ).action(async (toolName: SetupToolName, options: SetupCliOptions) => {
    await runtime.setup(toolName, options);
  });
}

function addAttachCommand(program: Command, runtime: CliRuntime): void {
  addCommonOptions(
    program
      .command('attach')
      .description('Attach the Ink TUI to the running daemon')
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
