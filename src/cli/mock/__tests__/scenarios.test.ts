import { describe, expect, it } from 'vitest';

import { AISnitchEventSchema } from '../../../core/events/schema.js';
import { buildMockScenario } from '../scenarios.js';

/**
 * @file src/cli/mock/__tests__/scenarios.test.ts
 * @description Unit coverage for deterministic mock scenarios used by the CLI demo/testing flows.
 * @functions
 *   → none
 * @exports none
 * @see ../scenarios.ts
 */

describe('buildMockScenario', () => {
  it('builds a realistic Claude Code timeline in the expected order', () => {
    const scenario = buildMockScenario('claude-code');

    expect(scenario.timeline.map((entry) => entry.event.type)).toEqual([
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
    expect(scenario.timeline[3]?.event.data.toolName).toBe('Read');
    expect(scenario.timeline[6]?.event.data.toolName).toBe('Write');
  });

  it('builds a realistic OpenCode timeline in the expected order', () => {
    const scenario = buildMockScenario('opencode');

    expect(scenario.timeline.map((entry) => entry.event.type)).toEqual([
      'session.start',
      'task.start',
      'agent.thinking',
      'agent.coding',
      'agent.tool_call',
      'task.complete',
      'agent.idle',
    ]);
    expect(scenario.timeline[4]?.event.data.toolInput).toEqual({
      command: 'pnpm test -- src/core/engine/__tests__/ws-server.test.ts',
    });
  });

  it('builds the all-tools timeline with at least three distinct tools interleaved', () => {
    const scenario = buildMockScenario('all');
    const tools = new Set(
      scenario.timeline.map((entry) => entry.event['aisnitch.tool']),
    );

    expect(tools.size).toBeGreaterThanOrEqual(3);
    expect(scenario.timeline[0]?.atMs).toBe(0);
    expect(
      scenario.timeline.every((entry, index, timeline) => {
        if (index === 0) {
          return true;
        }

        return entry.atMs >= timeline[index - 1]!.atMs;
      }),
    ).toBe(true);
  });

  it('emits only valid AISnitch CloudEvents across all built scenarios', () => {
    for (const selection of ['claude-code', 'opencode', 'all'] as const) {
      const scenario = buildMockScenario(selection);

      for (const timelineEvent of scenario.timeline) {
        expect(AISnitchEventSchema.safeParse(timelineEvent.event).success).toBe(
          true,
        );
      }
    }
  });
});
