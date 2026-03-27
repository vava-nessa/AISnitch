#!/usr/bin/env node

import { CommanderError } from 'commander';

import { createProgram } from './program.js';

/**
 * @file src/cli/index.ts
 * @description Executable AISnitch CLI entrypoint with centralized commander bootstrapping and error handling.
 * @functions
 *   → runCli
 *   → handleCliError
 * @exports runCli, createProgram
 * @see ./program.ts
 * @see ./runtime.ts
 */

/**
 * Runs the AISnitch CLI against the provided argv vector.
 */
export async function runCli(
  argv: readonly string[] = process.argv,
): Promise<void> {
  const program = createProgram();

  await program.parseAsync(argv, {
    from: 'node',
  });
}

/**
 * 📖 Commander already formats validation and help errors nicely, so this
 * wrapper only normalizes everything else into one stable stderr path.
 */
function handleCliError(error: unknown): void {
  if (error instanceof CommanderError && error.exitCode === 0) {
    process.exitCode = 0;
    return;
  }

  const message =
    error instanceof Error ? error.message : 'Unknown AISnitch CLI error';

  process.stderr.write(`AISnitch CLI failed: ${message}\n`);
  process.exitCode = 1;
}

async function main(): Promise<void> {
  try {
    await runCli();
  } catch (error: unknown) {
    handleCliError(error);
  }
}

void main();
