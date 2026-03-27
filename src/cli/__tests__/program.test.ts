import { CommanderError } from 'commander';
import { describe, expect, it } from 'vitest';

import { createProgram } from '../program.js';

/**
 * @file src/cli/__tests__/program.test.ts
 * @description Smoke coverage for the commander program surface.
 * @functions
 *   → createNoopRuntime
 * @exports none
 * @see ../program.ts
 */

function createNoopRuntime() {
  return {
    adapters: () => Promise.resolve(),
    attach: () => Promise.resolve(),
    install: () => Promise.resolve(),
    runDaemonProcess: () => Promise.resolve(),
    setup: () => Promise.resolve(),
    start: () => Promise.resolve(),
    status: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    uninstall: () => Promise.resolve(),
  };
}

describe('createProgram', () => {
  it('prints the CLI version', async () => {
    let stdout = '';
    const program = createProgram({
      runtime: createNoopRuntime(),
    });

    program.configureOutput({
      writeErr: () => undefined,
      writeOut: (text) => {
        stdout += text;
      },
    });
    program.exitOverride();

    await expect(
      program.parseAsync(['node', 'aisnitch', '--version'], { from: 'node' }),
    ).rejects.toBeInstanceOf(CommanderError);

    expect(stdout.trim()).toBe('0.1.0');
  });
});
