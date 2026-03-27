import { describe, expect, it } from 'vitest';

import { analyzeTerminalOutputChunk } from '../generic-pty.js';

/**
 * @file src/adapters/__tests__/generic-pty.test.ts
 * @description Unit coverage for the generic PTY ANSI/output heuristics used by `aisnitch wrap`.
 * @functions
 *   → none
 * @exports none
 * @see ../generic-pty.ts
 */

describe('analyzeTerminalOutputChunk', () => {
  it('detects spinner and thinking-like terminal output', () => {
    const observation = analyzeTerminalOutputChunk({
      chunk: '\r⠋ thinking about the refactor',
      commandLine: 'aider --model sonnet',
      tool: 'aider',
    });

    expect(observation).toMatchObject({
      type: 'agent.thinking',
    });
  });

  it('detects coding-oriented output and extracts active files', () => {
    const observation = analyzeTerminalOutputChunk({
      chunk: 'Applying patch to src/core/index.ts\n',
      commandLine: 'codex',
      tool: 'codex',
    });

    expect(observation).toMatchObject({
      data: {
        activeFile: 'src/core/index.ts',
      },
      type: 'agent.coding',
    });
  });

  it('detects red ANSI error output', () => {
    const observation = analyzeTerminalOutputChunk({
      chunk: '\u001B[31mError: write failed for src/index.ts\u001B[0m',
      commandLine: 'goose',
      tool: 'goose',
    });

    expect(observation).toMatchObject({
      data: {
        errorMessage: 'Error: write failed for src/index.ts',
        errorType: 'tool_failure',
      },
      type: 'agent.error',
    });
  });
});
