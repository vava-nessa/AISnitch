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
    aiderNotify: vi.fn(() => Promise.resolve()),
    attach: vi.fn(() => Promise.resolve()),
    install: vi.fn(() => Promise.resolve()),
    logger: vi.fn(() => Promise.resolve()),
    mock: vi.fn(() => Promise.resolve()),
    runDaemonProcess: vi.fn(() => Promise.resolve()),
    selfUpdateRun: vi.fn(() => Promise.resolve()),
    setup: vi.fn(() => Promise.resolve()),
    start: vi.fn(() => Promise.resolve()),
    status: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    uninstall: vi.fn(() => Promise.resolve()),
    wrap: vi.fn(() => Promise.resolve()),
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

    expect(stdout.trim()).toBe('0.2.9');
  });

  it('parses foreground TUI filter options for start', async () => {
    const runtime = createNoopRuntime();
    const program = createProgram({ runtime });

    await program.parseAsync(
      [
        'node',
        'aisnitch',
        'start',
        '--mock',
        '--tool',
        'claude-code',
        '--type',
        'agent.coding',
        '--view',
        'full-data',
        '--mock-speed',
        '2',
        '--mock-loop',
        '--mock-duration',
        '20',
      ],
      { from: 'node' },
    );

    expect(runtime.start).toHaveBeenCalledWith({
      daemon: undefined,
      mock: 'all',
      mockDuration: 20,
      mockLoop: true,
      mockSpeed: 2,
      tool: 'claude-code',
      type: 'agent.coding',
      view: 'full-data',
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
        '--view',
        'full-data',
      ],
      { from: 'node' },
    );

    expect(runtime.attach).toHaveBeenCalledWith({
      tool: 'opencode',
      type: 'agent.tool_call',
      view: 'full-data',
    });
  });

  it('parses raw logger filter options', async () => {
    const runtime = createNoopRuntime();
    const program = createProgram({ runtime });

    await program.parseAsync(
      ['node', 'aisnitch', 'logger', '--tool', 'claude-code', '--type', 'agent.streaming'],
      { from: 'node' },
    );

    expect(runtime.logger).toHaveBeenCalledWith({
      tool: 'claude-code',
      type: 'agent.streaming',
    });
  });

  it('passes arbitrary wrapped command arguments through to the runtime', async () => {
    const runtime = createNoopRuntime();
    const program = createProgram({ runtime });

    await program.parseAsync(
      ['node', 'aisnitch', 'wrap', 'aider', '--model', 'sonnet', '--yes'],
      { from: 'node' },
    );

    expect(runtime.wrap).toHaveBeenCalledWith(
      'aider',
      ['--model', 'sonnet', '--yes'],
      {
        config: undefined,
        cwd: undefined,
      },
    );
  });

  it('parses the dedicated mock command', async () => {
    const runtime = createNoopRuntime();
    const program = createProgram({ runtime });

    await program.parseAsync(
      ['node', 'aisnitch', 'mock', 'opencode', '--speed', '1.5', '--duration', '15'],
      { from: 'node' },
    );

    expect(runtime.mock).toHaveBeenCalledWith('opencode', {
      duration: 15,
      loop: undefined,
      speed: 1.5,
    });
  });
});
