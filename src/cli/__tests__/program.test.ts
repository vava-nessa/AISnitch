import { CommanderError } from 'commander';
import { describe, expect, it, vi } from 'vitest';

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
    adapters: vi.fn(() => Promise.resolve()),
    attach: vi.fn(() => Promise.resolve()),
    install: vi.fn(() => Promise.resolve()),
    runDaemonProcess: vi.fn(() => Promise.resolve()),
    setup: vi.fn(() => Promise.resolve()),
    start: vi.fn(() => Promise.resolve()),
    status: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    uninstall: vi.fn(() => Promise.resolve()),
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

  it('parses foreground TUI filter options for start', async () => {
    const runtime = createNoopRuntime();
    const program = createProgram({ runtime });

    await program.parseAsync(
      [
        'node',
        'aisnitch',
        'start',
        '--tool',
        'claude-code',
        '--type',
        'agent.coding',
      ],
      { from: 'node' },
    );

    expect(runtime.start).toHaveBeenCalledWith({
      daemon: undefined,
      tool: 'claude-code',
      type: 'agent.coding',
    });
  });

  it('parses attach TUI filter options', async () => {
    const runtime = createNoopRuntime();
    const program = createProgram({ runtime });

    await program.parseAsync(
      [
        'node',
        'aisnitch',
        'attach',
        '--tool',
        'opencode',
        '--type',
        'agent.tool_call',
      ],
      { from: 'node' },
    );

    expect(runtime.attach).toHaveBeenCalledWith({
      tool: 'opencode',
      type: 'agent.tool_call',
    });
  });
});
