import { describe, expect, it } from 'vitest';

import { formatLoggerEventBlock, formatLoggerWelcomeLine } from '../live-logger.js';
import type { AISnitchEvent } from '../../core/index.js';

/**
 * @file src/cli/__tests__/live-logger.test.ts
 * @description Coverage for the exhaustive non-TUI logger formatter.
 * @functions
 *   → none
 * @exports none
 * @see ../live-logger.ts
 */

function createTestEvent(): AISnitchEvent {
  return {
    'aisnitch.seqnum': 47,
    'aisnitch.sessionid': 'claude-code:test:p123',
    'aisnitch.tool': 'claude-code',
    data: {
      activeFile: 'src/index.ts',
      cwd: '/tmp/demo',
      model: 'claude-sonnet-4.5',
      project: 'demo',
      raw: {
        message: {
          content: [
            {
              text: 'hello world',
              type: 'text',
            },
          ],
        },
      },
      state: 'agent.streaming',
      tokensUsed: 123,
    },
    id: '01999999-9999-7999-8999-999999999999',
    source: 'aisnitch://claude-code/demo',
    specversion: '1.0',
    time: '2026-03-28T12:00:00.000Z',
    type: 'agent.streaming',
  };
}

describe('live logger formatting', () => {
  it('prints a readable exhaustive block with flattened raw payload fields', () => {
    const output = formatLoggerEventBlock(createTestEvent());

    expect(output).toContain('agent.streaming');
    expect(output).toContain('data.raw.message.content[0].text');
    expect(output).toContain('"hello world"');
    expect(output).toContain('data.tokensUsed');
    expect(output).toContain('123');
  });

  it('formats the welcome banner', () => {
    expect(
      formatLoggerWelcomeLine({
        tools: ['claude-code', 'opencode'],
        type: 'welcome',
        version: '0.2.2',
      }),
    ).toContain('AISnitch logger attached');
  });
});
