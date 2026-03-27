import { createEvent } from '../../core/events/factory.js';
import type {
  AISnitchEvent,
  AISnitchEventType,
  ToolName,
} from '../../core/events/types.js';

/**
 * @file src/cli/mock/scenarios.ts
 * @description Deterministic mock event timelines used by the CLI demo/testing flows to simulate realistic multi-tool activity.
 * @functions
 *   → buildMockScenario
 * @exports MOCK_TOOL_SELECTIONS, MockToolSelection, MockScenario, MockScenarioEvent, buildMockScenario
 * @see ../commands/mock.ts
 * @see ../../test-utils/index.ts
 */

export const MOCK_TOOL_SELECTIONS = [
  'claude-code',
  'opencode',
  'all',
] as const;

export type MockToolSelection = (typeof MOCK_TOOL_SELECTIONS)[number];

export interface MockScenarioEvent {
  readonly atMs: number;
  readonly event: AISnitchEvent;
}

export interface MockScenario {
  readonly label: string;
  readonly selection: MockToolSelection;
  readonly timeline: readonly MockScenarioEvent[];
}

const DEMO_PROJECT_ROOT = '/Users/demo/Projects/AutoSnitch';

/**
 * 📖 Mock scenarios are intentionally opinionated and slightly theatrical. They
 * are for demos, CI, and TUI development, so the output should feel plausible
 * and informative rather than perfectly mirroring one exact provider transcript.
 */
export function buildMockScenario(selection: MockToolSelection): MockScenario {
  if (selection === 'claude-code') {
    return {
      label: 'Claude Code',
      selection,
      timeline: buildClaudeCodeTimeline(0),
    };
  }

  if (selection === 'opencode') {
    return {
      label: 'OpenCode',
      selection,
      timeline: buildOpenCodeTimeline(0),
    };
  }

  return {
    label: 'All Tools',
    selection: 'all',
    timeline: [
      ...buildClaudeCodeTimeline(0),
      ...buildOpenCodeTimeline(900),
      ...buildGeminiTimeline(1_700),
    ].sort((left, right) => left.atMs - right.atMs),
  };
}

function buildClaudeCodeTimeline(offsetMs: number): MockScenarioEvent[] {
  const sessionId = 'mock:claude-code:auto-snitch';
  let sequenceNumber = 0;
  const nextSequenceNumber = () => {
    sequenceNumber += 1;
    return sequenceNumber;
  };

  return [
    createMockTimelineEvent(
      'claude-code',
      sessionId,
      nextSequenceNumber(),
      offsetMs + 0,
      'session.start',
      {
        model: 'claude-sonnet-4-20250514',
      },
    ),
    createMockTimelineEvent(
      'claude-code',
      sessionId,
      nextSequenceNumber(),
      offsetMs + 500,
      'task.start',
      {
        raw: {
          prompt: 'Trace why the config loader fails in CI.',
        },
      },
    ),
    createMockTimelineEvent(
      'claude-code',
      sessionId,
      nextSequenceNumber(),
      offsetMs + 2_500,
      'agent.thinking',
      {
        raw: {
          thinking: 'Inspecting the config loader and the failing test fixture.',
        },
        tokensUsed: 960,
      },
    ),
    createMockTimelineEvent(
      'claude-code',
      sessionId,
      nextSequenceNumber(),
      offsetMs + 3_500,
      'agent.tool_call',
      {
        toolInput: {
          filePath: 'src/core/config/loader.ts',
        },
        toolName: 'Read',
      },
    ),
    createMockTimelineEvent(
      'claude-code',
      sessionId,
      nextSequenceNumber(),
      offsetMs + 4_500,
      'agent.thinking',
      {
        raw: {
          thinking: 'The path resolution fallback is using the wrong base directory.',
        },
        tokensUsed: 1_580,
      },
    ),
    createMockTimelineEvent(
      'claude-code',
      sessionId,
      nextSequenceNumber(),
      offsetMs + 7_500,
      'agent.coding',
      {
        activeFile: 'src/core/config/loader.ts',
        toolInput: {
          filePath: 'src/core/config/loader.ts',
        },
        toolName: 'Edit',
      },
    ),
    createMockTimelineEvent(
      'claude-code',
      sessionId,
      nextSequenceNumber(),
      offsetMs + 9_500,
      'agent.tool_call',
      {
        toolInput: {
          filePath: 'src/core/config/loader.ts',
        },
        toolName: 'Write',
      },
    ),
    createMockTimelineEvent(
      'claude-code',
      sessionId,
      nextSequenceNumber(),
      offsetMs + 10_250,
      'task.complete',
      {
        tokensUsed: 3_420,
      },
    ),
    createMockTimelineEvent(
      'claude-code',
      sessionId,
      nextSequenceNumber(),
      offsetMs + 14_500,
      'agent.idle',
      {},
    ),
  ];
}

function buildOpenCodeTimeline(offsetMs: number): MockScenarioEvent[] {
  const sessionId = 'mock:opencode:auto-snitch';
  let sequenceNumber = 0;
  const nextSequenceNumber = () => {
    sequenceNumber += 1;
    return sequenceNumber;
  };

  return [
    createMockTimelineEvent(
      'opencode',
      sessionId,
      nextSequenceNumber(),
      offsetMs + 0,
      'session.start',
      {
        model: 'openai/gpt-4.1',
      },
    ),
    createMockTimelineEvent(
      'opencode',
      sessionId,
      nextSequenceNumber(),
      offsetMs + 600,
      'task.start',
      {
        raw: {
          prompt: 'Summarize the websocket reconnect path.',
        },
      },
    ),
    createMockTimelineEvent(
      'opencode',
      sessionId,
      nextSequenceNumber(),
      offsetMs + 1_600,
      'agent.thinking',
      {
        raw: {
          thinking: 'Checking the reconnect loop and exponential backoff.',
        },
        tokensUsed: 760,
      },
    ),
    createMockTimelineEvent(
      'opencode',
      sessionId,
      nextSequenceNumber(),
      offsetMs + 3_600,
      'agent.coding',
      {
        activeFile: 'src/core/engine/ws-server.ts',
        toolInput: {
          filePath: 'src/core/engine/ws-server.ts',
        },
        toolName: 'Edit',
      },
    ),
    createMockTimelineEvent(
      'opencode',
      sessionId,
      nextSequenceNumber(),
      offsetMs + 5_800,
      'agent.tool_call',
      {
        toolInput: {
          command: 'pnpm test -- src/core/engine/__tests__/ws-server.test.ts',
        },
        toolName: 'Bash',
      },
    ),
    createMockTimelineEvent(
      'opencode',
      sessionId,
      nextSequenceNumber(),
      offsetMs + 6_400,
      'task.complete',
      {
        tokensUsed: 2_180,
      },
    ),
    createMockTimelineEvent(
      'opencode',
      sessionId,
      nextSequenceNumber(),
      offsetMs + 10_000,
      'agent.idle',
      {},
    ),
  ];
}

function buildGeminiTimeline(offsetMs: number): MockScenarioEvent[] {
  const sessionId = 'mock:gemini-cli:auto-snitch';
  let sequenceNumber = 0;
  const nextSequenceNumber = () => {
    sequenceNumber += 1;
    return sequenceNumber;
  };

  return [
    createMockTimelineEvent(
      'gemini-cli',
      sessionId,
      nextSequenceNumber(),
      offsetMs + 0,
      'session.start',
      {
        model: 'gemini-2.5-pro',
      },
    ),
    createMockTimelineEvent(
      'gemini-cli',
      sessionId,
      nextSequenceNumber(),
      offsetMs + 450,
      'task.start',
      {
        raw: {
          prompt: 'Check whether our package tarball includes dist/ only.',
        },
      },
    ),
    createMockTimelineEvent(
      'gemini-cli',
      sessionId,
      nextSequenceNumber(),
      offsetMs + 1_300,
      'agent.tool_call',
      {
        toolInput: {
          filePath: 'package.json',
        },
        toolName: 'Read',
      },
    ),
    createMockTimelineEvent(
      'gemini-cli',
      sessionId,
      nextSequenceNumber(),
      offsetMs + 2_200,
      'agent.thinking',
      {
        raw: {
          thinking: 'Tarball config looks mostly right; verifying scripts and engines.',
        },
        tokensUsed: 1_120,
      },
    ),
    createMockTimelineEvent(
      'gemini-cli',
      sessionId,
      nextSequenceNumber(),
      offsetMs + 4_100,
      'task.complete',
      {
        tokensUsed: 1_880,
      },
    ),
    createMockTimelineEvent(
      'gemini-cli',
      sessionId,
      nextSequenceNumber(),
      offsetMs + 6_500,
      'agent.idle',
      {},
    ),
  ];
}

function createMockTimelineEvent(
  tool: ToolName,
  sessionId: string,
  sequenceNumber: number,
  atMs: number,
  type: AISnitchEventType,
  data: Partial<AISnitchEvent['data']>,
): MockScenarioEvent {
  return {
    atMs,
    event: createEvent({
      source: `aisnitch://mock/${tool}`,
      type,
      'aisnitch.tool': tool,
      'aisnitch.sessionid': sessionId,
      'aisnitch.seqnum': sequenceNumber,
      data: {
        cwd: DEMO_PROJECT_ROOT,
        project: 'AutoSnitch',
        projectPath: DEMO_PROJECT_ROOT,
        raw: {
          mock: true,
          scenario: tool,
          type,
        },
        ...data,
      },
    }),
  };
}
