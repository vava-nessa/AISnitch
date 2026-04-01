import { describe, expect, it } from 'vitest';

import { parseEvent, parseWelcome } from '../schema.js';
import { AISNITCH_EVENT_TYPES } from '../types.js';
import { makeEvent, makeWelcome } from './helpers.js';

describe('parseEvent', () => {
  it('parses a valid event', () => {
    const event = makeEvent({ type: 'agent.thinking' });
    const result = parseEvent(event);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('agent.thinking');
    expect(result?.specversion).toBe('1.0');
  });

  it('returns null on invalid payload (missing fields)', () => {
    expect(parseEvent({ type: 'agent.thinking' })).toBeNull();
  });

  it('returns null on non-object input', () => {
    expect(parseEvent('hello')).toBeNull();
    expect(parseEvent(42)).toBeNull();
    expect(parseEvent(null)).toBeNull();
    expect(parseEvent(undefined)).toBeNull();
  });

  it('returns null on unknown event type', () => {
    const event = makeEvent();
    const invalid = { ...event, type: 'unknown.type' };
    expect(parseEvent(invalid)).toBeNull();
  });

  it('returns null on unknown tool name', () => {
    const event = makeEvent();
    const invalid = { ...event, 'aisnitch.tool': 'not-a-tool' };
    expect(parseEvent(invalid)).toBeNull();
  });

  it('validates all 12 event types', () => {
    for (const type of AISNITCH_EVENT_TYPES) {
      const event = makeEvent({ type, data: { state: type } });
      const result = parseEvent(event);
      expect(result).not.toBeNull();
      expect(result?.type).toBe(type);
    }
  });

  it('accepts events with optional data fields', () => {
    const event = makeEvent({
      type: 'agent.tool_call',
      data: {
        state: 'agent.tool_call',
        toolName: 'Bash',
        toolInput: { command: 'ls' },
        project: 'myproject',
        cwd: '/home/user/myproject',
        model: 'claude-opus-4-6',
        tokensUsed: 1500,
      },
    });
    const result = parseEvent(event);
    expect(result).not.toBeNull();
    expect(result?.data.toolName).toBe('Bash');
    expect(result?.data.tokensUsed).toBe(1500);
  });

  it('accepts events with error data', () => {
    const event = makeEvent({
      type: 'agent.error',
      data: {
        state: 'agent.error',
        errorMessage: 'Rate limited',
        errorType: 'rate_limit',
      },
    });
    const result = parseEvent(event);
    expect(result).not.toBeNull();
    expect(result?.data.errorType).toBe('rate_limit');
  });
});

describe('parseWelcome', () => {
  it('parses a valid welcome message', () => {
    const welcome = makeWelcome();
    const result = parseWelcome(welcome);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('welcome');
    expect(result?.version).toBe('0.2.11');
  });

  it('returns null on invalid welcome', () => {
    expect(parseWelcome({ type: 'welcome' })).toBeNull();
    expect(parseWelcome(null)).toBeNull();
    expect(parseWelcome('hello')).toBeNull();
  });
});
