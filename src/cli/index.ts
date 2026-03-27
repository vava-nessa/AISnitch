#!/usr/bin/env node

import { getPackageScaffoldInfo } from '../index.js';

/**
 * @file src/cli/index.ts
 * @description Minimal CLI entrypoint for the project scaffold.
 * @functions
 *   → formatCliWelcome
 *   → runCli
 *   → handleCliError
 * @exports CliRunResult, formatCliWelcome, runCli
 * @see ../index.ts
 */

/**
 * Represents the result of a CLI execution.
 */
export interface CliRunResult {
  readonly exitCode: number;
  readonly output: string;
}

/**
 * 📖 This formatter keeps the placeholder user-facing text isolated so the
 * real CLI command routing can replace it cleanly in the next task group.
 */
export function formatCliWelcome(): string {
  const scaffoldInfo = getPackageScaffoldInfo();

  return `${scaffoldInfo.name} scaffold ready. ${scaffoldInfo.description}`;
}

/**
 * Executes the temporary CLI behaviour for the initial scaffold. The command
 * stays intentionally small so task 03 can replace it without undoing work.
 */
export function runCli(
  argv: readonly string[] = process.argv.slice(2),
): CliRunResult {
  if (argv.includes('--version')) {
    return {
      exitCode: 0,
      output: '0.1.0',
    };
  }

  return {
    exitCode: 0,
    output: formatCliWelcome(),
  };
}

/**
 * Converts unknown runtime failures into a stable CLI error path so the
 * scaffold does not crash noisily during early manual checks.
 */
function handleCliError(error: unknown): void {
  const message =
    error instanceof Error ? error.message : 'Unknown CLI bootstrap error';

  process.stderr.write(`AISnitch CLI bootstrap failed: ${message}\n`);
  process.exitCode = 1;
}

try {
  const result = runCli();

  process.stdout.write(`${result.output}\n`);
  process.exitCode = result.exitCode;
} catch (error: unknown) {
  handleCliError(error);
}
