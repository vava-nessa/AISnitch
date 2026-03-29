import { describe, expect, it } from 'vitest';

import { SessionTracker } from '../sessions.js';
import { makeEvent } from './helpers.js';

describe('SessionTracker', () => {
  it('creates a session on first event', () => {
    const tracker = new SessionTracker();
    tracker.update(makeEvent({ 'aisnitch.sessionid': 's1', 'aisnitch.tool': 'claude-code' }));

    expect(tracker.count).toBe(1);
    const session = tracker.get('s1');
    expect(session).toBeDefined();
    expect(session?.tool).toBe('claude-code');
    expect(session?.eventCount).toBe(1);
  });

  it('updates existing session on subsequent events', () => {
    const tracker = new SessionTracker();
    tracker.update(makeEvent({ 'aisnitch.sessionid': 's1', type: 'agent.thinking' }));
    tracker.update(makeEvent({
      'aisnitch.sessionid': 's1',
      type: 'agent.coding',
      data: { state: 'agent.coding', project: 'myproject', cwd: '/home/user/myproject' },
    }));

    expect(tracker.count).toBe(1);
    const session = tracker.get('s1');
    expect(session?.eventCount).toBe(2);
    expect(session?.project).toBe('myproject');
    expect(session?.cwd).toBe('/home/user/myproject');
    expect(session?.lastEvent.type).toBe('agent.coding');
  });

  it('removes session on session.end', () => {
    const tracker = new SessionTracker();
    tracker.update(makeEvent({ 'aisnitch.sessionid': 's1', type: 'session.start' }));
    expect(tracker.count).toBe(1);

    tracker.update(makeEvent({ 'aisnitch.sessionid': 's1', type: 'session.end' }));
    expect(tracker.count).toBe(0);
    expect(tracker.get('s1')).toBeUndefined();
  });

  it('tracks multiple sessions independently', () => {
    const tracker = new SessionTracker();
    tracker.update(makeEvent({ 'aisnitch.sessionid': 's1', 'aisnitch.tool': 'claude-code' }));
    tracker.update(makeEvent({ 'aisnitch.sessionid': 's2', 'aisnitch.tool': 'opencode' }));

    expect(tracker.count).toBe(2);
    expect(tracker.getAll()).toHaveLength(2);
  });

  it('getByTool() filters correctly', () => {
    const tracker = new SessionTracker();
    tracker.update(makeEvent({ 'aisnitch.sessionid': 's1', 'aisnitch.tool': 'claude-code' }));
    tracker.update(makeEvent({ 'aisnitch.sessionid': 's2', 'aisnitch.tool': 'opencode' }));
    tracker.update(makeEvent({ 'aisnitch.sessionid': 's3', 'aisnitch.tool': 'claude-code' }));

    const claudeSessions = tracker.getByTool('claude-code');
    expect(claudeSessions).toHaveLength(2);
    expect(claudeSessions.every((s) => s.tool === 'claude-code')).toBe(true);

    const opencodeSessions = tracker.getByTool('opencode');
    expect(opencodeSessions).toHaveLength(1);
  });

  it('clear() removes all sessions', () => {
    const tracker = new SessionTracker();
    tracker.update(makeEvent({ 'aisnitch.sessionid': 's1' }));
    tracker.update(makeEvent({ 'aisnitch.sessionid': 's2' }));
    expect(tracker.count).toBe(2);

    tracker.clear();
    expect(tracker.count).toBe(0);
  });
});
