import { v4 as uuidv4 } from 'uuid';
import { describe, expect, it } from 'vitest';

import {
  AISNITCH_EVENT_TYPES,
  AISnitchEventSchema,
  CESP_MAP,
  createEvent,
  getCESPCategory,
} from '../index.js';
import type { AISnitchEventType, CESPCategory } from '../types.js';

/**
 * @file src/core/events/__tests__/schema.test.ts
 * @description Unit coverage for AISnitch event schemas, CESP mappings, and factory behaviour.
 * @functions
 *   → createBaseEvent
 * @exports none
 * @see ../schema.ts
 * @see ../factory.ts
 */

function createBaseEvent() {
  return createEvent({
    source: 'aisnitch://adapters/claude-code',
    type: 'task.start',
    'aisnitch.tool': 'claude-code',
    'aisnitch.sessionid': 'session-123',
    'aisnitch.seqnum': 1,
    data: {
      project: 'AutoSnitch',
    },
  });
}

describe('AISnitchEventSchema', () => {
  it('validates a factory-produced event', () => {
    const event = createBaseEvent();

    expect(AISnitchEventSchema.parse(event)).toEqual(event);
  });

  it('rejects events with an invalid UUID version', () => {
    const event = createBaseEvent();

    event.id = uuidv4();

    expect(() => AISnitchEventSchema.parse(event)).toThrow(/UUIDv7/i);
  });

  it('rejects events missing required CloudEvents fields', () => {
    const invalidEvent = {
      ...createBaseEvent(),
      source: '',
    };

    expect(() => AISnitchEventSchema.parse(invalidEvent)).toThrow();
  });

  it('rejects unknown event types', () => {
    const invalidEvent = {
      ...createBaseEvent(),
      type: 'agent.teleport',
      data: {
        state: 'task.start',
      },
    };

    expect(() => AISnitchEventSchema.parse(invalidEvent)).toThrow();
  });

  it('rejects unknown keys inside strict payload objects', () => {
    const invalidEvent = {
      ...createBaseEvent(),
      data: {
        state: 'task.start',
        extra: 'nope',
      },
    };

    expect(() => AISnitchEventSchema.parse(invalidEvent)).toThrow();
  });
});

describe('CESP mapping', () => {
  it('covers all normalized event types with the expected category map', () => {
    const expectedMap: Record<AISnitchEventType, CESPCategory | null> = {
      'session.start': 'session.start',
      'session.end': 'session.end',
      'task.start': 'task.acknowledge',
      'task.complete': 'task.complete',
      'agent.thinking': null,
      'agent.coding': null,
      'agent.tool_call': null,
      'agent.streaming': null,
      'agent.asking_user': 'input.required',
      'agent.idle': null,
      'agent.error': 'task.error',
      'agent.compact': 'resource.limit',
    };

    expect(CESP_MAP).toEqual(expectedMap);
    expect(Object.keys(CESP_MAP)).toHaveLength(AISNITCH_EVENT_TYPES.length);
  });

  it('resolves categories from either a full event or a type string', () => {
    const event = createBaseEvent();
    event.type = 'agent.asking_user';
    event.data.state = 'agent.asking_user';

    expect(getCESPCategory(event)).toBe('input.required');
    expect(getCESPCategory('agent.compact')).toBe('resource.limit');
  });
});

describe('createEvent', () => {
  it('fills generated CloudEvents metadata and defaults data.state to type', () => {
    const event = createEvent({
      source: 'aisnitch://adapters/codex',
      type: 'agent.coding',
      'aisnitch.tool': 'codex',
      'aisnitch.sessionid': 'session-xyz',
      'aisnitch.seqnum': 7,
      data: {
        cwd: '/tmp/project',
      },
    });

    expect(event.specversion).toBe('1.0');
    expect(event.type).toBe('agent.coding');
    expect(event.data.state).toBe('agent.coding');
    expect(typeof event.time).toBe('string');
  });

  it('allows explicit data.state overrides when needed by adapters', () => {
    const event = createEvent({
      source: 'aisnitch://adapters/opencode',
      type: 'task.complete',
      'aisnitch.tool': 'opencode',
      'aisnitch.sessionid': 'session-opencode',
      'aisnitch.seqnum': 2,
      data: {
        state: 'agent.streaming',
      },
    });

    expect(event.type).toBe('task.complete');
    expect(event.data.state).toBe('agent.streaming');
  });
});
