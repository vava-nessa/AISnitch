import { describe, expect, it } from 'vitest';

import { createEvent } from '../../events/index.js';
import { ContextDetector } from '../context-detector.js';

/**
 * @file src/core/engine/__tests__/context-detector.test.ts
 * @description Unit coverage for terminal, cwd, and instance context enrichment helpers.
 * @functions
 *   → none
 * @exports none
 * @see ../context-detector.ts
 */

describe('ContextDetector', () => {
  it('detects known TERM_PROGRAM values', () => {
    const detector = new ContextDetector();

    expect(detector.detectTerminal({ TERM_PROGRAM: 'WezTerm' })).toBe('WezTerm');
    expect(detector.detectTerminal({ TERM_PROGRAM: 'iTerm.app' })).toBe('iTerm2');
  });

  it('falls back to KITTY_WINDOW_ID when TERM_PROGRAM is missing', () => {
    const detector = new ContextDetector();

    expect(detector.detectTerminal({ KITTY_WINDOW_ID: '42' })).toBe('kitty');
  });

  it('decodes Claude transcript project paths', () => {
    const detector = new ContextDetector();

    expect(
      detector.decodeCWDFromTranscriptPath(
        '/Users/vava/.claude/projects/-Users-vava-Documents-myapp/abc123.jsonl',
      ),
    ).toBe('/Users/vava/Documents/myapp');
  });

  it('builds stable instance identifiers', () => {
    const detector = new ContextDetector();

    expect(detector.buildInstanceId('claude-code', 1234, 'session-abc')).toBe(
      'claude-code:session-abc',
    );
    expect(detector.buildInstanceId('codex', 5678)).toBe('codex:5678');
  });

  it('computes instance indexes from enumerated processes', async () => {
    const detector = new ContextDetector({
      execCommand: () => Promise.resolve('100 codex\n200 codex exec\n'),
      cwdResolver: () => Promise.resolve(undefined),
    });

    await expect(detector.getInstanceIndex(200, 'codex')).resolves.toEqual({
      index: 2,
      total: 2,
    });
  });

  it('enriches events gracefully even when detection commands fail', async () => {
    const detector = new ContextDetector({
      execCommand: () => Promise.reject(new Error('no shell access')),
      cwdResolver: () => Promise.reject(new Error('no pid cwd')),
    });
    const event = createEvent({
      source: 'aisnitch://tests/context',
      type: 'agent.coding',
      'aisnitch.tool': 'codex',
      'aisnitch.sessionid': 'context-session',
      'aisnitch.seqnum': 1,
    });

    const enrichedEvent = await detector.enrich(event, {
      pid: 12345,
      sessionId: 'context-session',
      hookPayload: {
        cwd: '/tmp/hook-project',
      },
    });

    expect(enrichedEvent.data.pid).toBe(12345);
    expect(enrichedEvent.data.cwd).toBe('/tmp/hook-project');
    expect(enrichedEvent.data.instanceId).toBe('codex:context-session');
  });
});
