import { describe, expect, it } from 'vitest';

import {
  parseMockDurationOption,
  parseMockSpeedOption,
  parseMockToolSelection,
  runMockScenario,
} from '../commands/mock.js';

/**
 * @file src/cli/__tests__/mock.test.ts
 * @description Unit coverage for mock CLI parsing and replay timing behavior.
 * @functions
 *   → none
 * @exports none
 * @see ../commands/mock.ts
 */

describe('mock command helpers', () => {
  it('parses supported mock tool selections', () => {
    expect(parseMockToolSelection('claude-code')).toBe('claude-code');
    expect(parseMockToolSelection('opencode')).toBe('opencode');
    expect(parseMockToolSelection('all')).toBe('all');
  });

  it('parses speed and duration CLI options', () => {
    expect(parseMockSpeedOption('2')).toBe(2);
    expect(parseMockDurationOption('45')).toBe(45);
  });

  it('replays the selected scenario in order while honoring relative timings', async () => {
    const publishedTypes: string[] = [];
    const sleepCalls: number[] = [];
    let nowMs = 0;

    const result = await runMockScenario(
      {
        durationSeconds: 60,
        loop: false,
        publishEvent: (event) => {
          publishedTypes.push(event.type);
          return Promise.resolve(true);
        },
        selection: 'claude-code',
        speed: 2,
      },
      {
        now: () => nowMs,
        sleep: (ms) => {
          sleepCalls.push(ms);
          nowMs += ms;
          return Promise.resolve();
        },
      },
    );

    expect(result.loopCount).toBe(1);
    expect(result.publishedEvents).toBe(9);
    expect(publishedTypes).toEqual([
      'session.start',
      'task.start',
      'agent.thinking',
      'agent.tool_call',
      'agent.thinking',
      'agent.coding',
      'agent.tool_call',
      'task.complete',
      'agent.idle',
    ]);
    expect(sleepCalls.slice(0, 4)).toEqual([250, 1_000, 500, 500]);
  });

  it('stops gracefully at the duration boundary when looping', async () => {
    let nowMs = 0;
    let publishedEvents = 0;

    const result = await runMockScenario(
      {
        durationSeconds: 3,
        loop: true,
        publishEvent: () => {
          publishedEvents += 1;
          return Promise.resolve(true);
        },
        selection: 'opencode',
        speed: 1,
      },
      {
        now: () => nowMs,
        sleep: (ms) => {
          nowMs += ms;
          return Promise.resolve();
        },
      },
    );

    expect(result.loopCount).toBeGreaterThanOrEqual(1);
    expect(result.publishedEvents).toBe(publishedEvents);
    expect(result.publishedEvents).toBeLessThan(7);
  });
});
