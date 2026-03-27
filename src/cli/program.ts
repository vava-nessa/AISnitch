import { Command, InvalidArgumentError } from 'commander';

import {
  AISNITCH_DESCRIPTION,
  AISNITCH_PACKAGE_NAME,
  AISNITCH_VERSION,
} from '../index.js';
import {
  createCliRuntime,
  parseLogLevelOption,
  parsePortOption,
  type CliRuntime,
  type CommonCliOptions,
  type StartCliOptions,
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
  aisnitch status
  aisnitch attach
  aisnitch install
`,
    );

  addStartCommand(program, runtime);
  addStopCommand(program, runtime);
  addStatusCommand(program, runtime);
  addAdaptersCommand(program, runtime);
  addAttachCommand(program, runtime);
  addInstallCommand(program, runtime);
  addUninstallCommand(program, runtime);
  addDaemonRunCommand(program, runtime);

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

function addAttachCommand(program: Command, runtime: CliRuntime): void {
  addCommonOptions(
    program.command('attach').description('Attach a live monitor to the running daemon'),
  ).action(async (options: CommonCliOptions) => {
    await runtime.attach(options);
  });
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
