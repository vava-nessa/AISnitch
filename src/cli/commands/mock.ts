import type { AISnitchEvent } from '../../core/events/types.js';
import {
  MOCK_TOOL_SELECTIONS,
  buildMockScenario,
  type MockToolSelection,
} from '../mock/scenarios.js';

export type { MockToolSelection } from '../mock/scenarios.js';

/**
 * @file src/cli/commands/mock.ts
 * @description Mock scenario parsing and execution helpers used by `aisnitch mock` and `aisnitch start --mock`.
 * @functions
 *   → parseMockToolSelection
 *   → parseMockDurationOption
 *   → parseMockSpeedOption
 *   → runMockScenario
 * @exports MockCommandOptions, MockRunnerResult, MockRunnerDependencies, MockRunnerOptions, parseMockToolSelection, parseMockDurationOption, parseMockSpeedOption, runMockScenario
 * @see ../mock/scenarios.ts
 * @see ../runtime.ts
 */

export interface MockCommandOptions {
  readonly duration?: number;
  readonly loop?: boolean;
  readonly speed?: number;
}

export interface MockRunnerOptions {
  readonly durationSeconds: number;
  readonly loop: boolean;
  readonly publishEvent: (event: AISnitchEvent) => Promise<boolean>;
  readonly selection: MockToolSelection;
  readonly speed: number;
}

export interface MockRunnerDependencies {
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface MockRunnerResult {
  readonly loopCount: number;
  readonly publishedEvents: number;
}

/**
 * Parses one supported mock tool/scenario selection from CLI input.
 */
export function parseMockToolSelection(rawValue: string): MockToolSelection {
  if ((MOCK_TOOL_SELECTIONS as readonly string[]).includes(rawValue)) {
    return rawValue as MockToolSelection;
  }

  throw new Error(
    `Unsupported mock tool: ${rawValue}. Supported tools: ${MOCK_TOOL_SELECTIONS.join(', ')}`,
  );
}

/**
 * Parses one positive mock speed factor from the CLI.
 */
export function parseMockSpeedOption(rawValue: string): number {
  const parsedValue = Number.parseFloat(rawValue);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new Error('Mock speed must be a positive number.');
  }

  return parsedValue;
}

/**
 * Parses one positive mock duration in seconds from the CLI.
 */
export function parseMockDurationOption(rawValue: string): number {
  const parsedValue = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error('Mock duration must be a positive integer of seconds.');
  }

  return parsedValue;
}

/**
 * 📖 The runner replays one deterministic event timeline at configurable speed.
 * It deliberately uses the same publish callback shape as the real pipeline so
 * demos, tests, and `start --mock` all exercise the normal event path.
 */
export async function runMockScenario(
  options: MockRunnerOptions,
  dependencies: MockRunnerDependencies = {},
): Promise<MockRunnerResult> {
  const now = dependencies.now ?? Date.now;
  const sleep =
    dependencies.sleep ??
    (async (ms: number) => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, ms).unref();
      });
    });
  const deadline = now() + options.durationSeconds * 1_000;
  let loopCount = 0;
  let publishedEvents = 0;

  do {
    const scenario = buildMockScenario(options.selection);
    let previousAtMs = 0;

    loopCount += 1;

    for (const timelineEvent of scenario.timeline) {
      const waitMs = Math.max(
        0,
        (timelineEvent.atMs - previousAtMs) / options.speed,
      );
      previousAtMs = timelineEvent.atMs;

      if (waitMs > 0) {
        if (now() + waitMs > deadline) {
          return {
            loopCount,
            publishedEvents,
          };
        }

        await sleep(waitMs);
      }

      if (now() > deadline) {
        return {
          loopCount,
          publishedEvents,
        };
      }

      await options.publishEvent(timelineEvent.event);
      publishedEvents += 1;
    }
  } while (options.loop && now() < deadline);

  return {
    loopCount,
    publishedEvents,
  };
}
