import { describe, expect, it } from 'vitest';

import { describeEvent, eventToMascotState, formatStatusLine } from '../describe.js';
import { AISNITCH_EVENT_TYPES } from '../types.js';
import { makeEvent } from './helpers.js';

describe('describeEvent', () => {
  it('produces descriptions for all 12 event types', () => {
    for (const type of AISNITCH_EVENT_TYPES) {
      const event = makeEvent({ type, data: { state: type } });
      const description = describeEvent(event);
      expect(description).toBeTruthy();
      expect(description).toContain('claude-code');
    }
  });

  it('includes tool name on tool_call events', () => {
    const event = makeEvent({
      type: 'agent.tool_call',
      data: { state: 'agent.tool_call', toolName: 'Bash', toolInput: { command: 'ls' } },
    });
    const desc = describeEvent(event);
    expect(desc).toContain('Bash');
  });

  it('includes active file on coding events', () => {
    const event = makeEvent({
      type: 'agent.coding',
      data: { state: 'agent.coding', activeFile: 'src/index.ts' },
    });
    const desc = describeEvent(event);
    expect(desc).toContain('src/index.ts');
  });

  it('includes error message on error events', () => {
    const event = makeEvent({
      type: 'agent.error',
      data: { state: 'agent.error', errorMessage: 'Rate limited' },
    });
    const desc = describeEvent(event);
    expect(desc).toContain('Rate limited');
  });

  it('includes project name in brackets', () => {
    const event = makeEvent({
      type: 'agent.thinking',
      data: { state: 'agent.thinking', project: 'myproject' },
    });
    const desc = describeEvent(event);
    expect(desc).toContain('[myproject]');
  });
});

describe('formatStatusLine', () => {
  it('includes session number', () => {
    const event = makeEvent({ type: 'agent.thinking' });
    const line = formatStatusLine(event, 3);
    expect(line).toMatch(/^#3/);
  });

  it('includes cwd when available', () => {
    const event = makeEvent({
      type: 'agent.thinking',
      data: { state: 'agent.thinking', cwd: '/home/user/myproject' },
    });
    const line = formatStatusLine(event, 1);
    expect(line).toContain('/home/user/myproject');
    expect(line).toContain('—');
  });

  it('works without session number', () => {
    const event = makeEvent({ type: 'agent.thinking' });
    const line = formatStatusLine(event);
    expect(line).not.toMatch(/^#/);
  });
});

describe('eventToMascotState', () => {
  it('returns correct mood for all 12 event types', () => {
    const expectedMoods: Record<string, string> = {
      'session.start': 'celebrating',
      'session.end': 'idle',
      'task.start': 'working',
      'task.complete': 'celebrating',
      'agent.thinking': 'thinking',
      'agent.coding': 'working',
      'agent.tool_call': 'working',
      'agent.streaming': 'working',
      'agent.asking_user': 'waiting',
      'agent.idle': 'idle',
      'agent.error': 'panicking',
      'agent.compact': 'thinking',
    };

    for (const type of AISNITCH_EVENT_TYPES) {
      const event = makeEvent({ type, data: { state: type } });
      const state = eventToMascotState(event);
      expect(state.mood).toBe(expectedMoods[type]);
      expect(state.animation).toBeTruthy();
      expect(state.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(state.label).toBeTruthy();
    }
  });

  it('includes detail from toolName', () => {
    const event = makeEvent({
      type: 'agent.tool_call',
      data: { state: 'agent.tool_call', toolName: 'Edit' },
    });
    const state = eventToMascotState(event);
    expect(state.detail).toBe('Edit');
  });

  it('includes detail from activeFile', () => {
    const event = makeEvent({
      type: 'agent.coding',
      data: { state: 'agent.coding', activeFile: 'src/app.ts' },
    });
    const state = eventToMascotState(event);
    expect(state.detail).toBe('src/app.ts');
  });

  it('includes detail from errorMessage', () => {
    const event = makeEvent({
      type: 'agent.error',
      data: { state: 'agent.error', errorMessage: 'Context overflow' },
    });
    const state = eventToMascotState(event);
    expect(state.detail).toBe('Context overflow');
  });
});
