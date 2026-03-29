import { describe, expect, it } from 'vitest';

import { filters } from '../filters.js';
import { makeEvent } from './helpers.js';

describe('filters', () => {
  it('byTool() matches the given tool', () => {
    const f = filters.byTool('claude-code');
    expect(f(makeEvent({ 'aisnitch.tool': 'claude-code' }))).toBe(true);
    expect(f(makeEvent({ 'aisnitch.tool': 'opencode' }))).toBe(false);
  });

  it('byType() matches a single event type', () => {
    const f = filters.byType('agent.error');
    expect(f(makeEvent({ type: 'agent.error' }))).toBe(true);
    expect(f(makeEvent({ type: 'agent.thinking' }))).toBe(false);
  });

  it('byTypes() matches any of the given types', () => {
    const f = filters.byTypes('agent.thinking', 'agent.coding');
    expect(f(makeEvent({ type: 'agent.thinking' }))).toBe(true);
    expect(f(makeEvent({ type: 'agent.coding' }))).toBe(true);
    expect(f(makeEvent({ type: 'agent.error' }))).toBe(false);
  });

  it('byProject() matches the project name', () => {
    const f = filters.byProject('myapp');
    expect(f(makeEvent({ data: { state: 'agent.thinking', project: 'myapp' } }))).toBe(true);
    expect(f(makeEvent({ data: { state: 'agent.thinking', project: 'other' } }))).toBe(false);
    expect(f(makeEvent({ data: { state: 'agent.thinking' } }))).toBe(false);
  });

  it('needsAttention() matches asking_user and error', () => {
    expect(filters.needsAttention(makeEvent({ type: 'agent.asking_user' }))).toBe(true);
    expect(filters.needsAttention(makeEvent({ type: 'agent.error' }))).toBe(true);
    expect(filters.needsAttention(makeEvent({ type: 'agent.coding' }))).toBe(false);
  });

  it('isCoding() matches coding and tool_call', () => {
    expect(filters.isCoding(makeEvent({ type: 'agent.coding' }))).toBe(true);
    expect(filters.isCoding(makeEvent({ type: 'agent.tool_call' }))).toBe(true);
    expect(filters.isCoding(makeEvent({ type: 'agent.thinking' }))).toBe(false);
  });

  it('isActive() excludes idle and session.end', () => {
    expect(filters.isActive(makeEvent({ type: 'agent.thinking' }))).toBe(true);
    expect(filters.isActive(makeEvent({ type: 'agent.coding' }))).toBe(true);
    expect(filters.isActive(makeEvent({ type: 'agent.idle' }))).toBe(false);
    expect(filters.isActive(makeEvent({ type: 'session.end' }))).toBe(false);
  });

  it('filters are composable via Array.filter chaining', () => {
    const events = [
      makeEvent({ type: 'agent.coding', 'aisnitch.tool': 'claude-code' }),
      makeEvent({ type: 'agent.thinking', 'aisnitch.tool': 'claude-code' }),
      makeEvent({ type: 'agent.coding', 'aisnitch.tool': 'opencode' }),
    ];

    const result = events
      .filter(filters.byTool('claude-code'))
      .filter(filters.isCoding);

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('agent.coding');
    expect(result[0]?.['aisnitch.tool']).toBe('claude-code');
  });
});
