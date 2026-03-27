import { describe, expect, it } from 'vitest';

import {
  formatSessionLabel,
  formatSessionShortId,
  isGenericSessionId,
  resolveSessionId,
} from '../session-identity.js';

/**
 * @file src/core/__tests__/session-identity.test.ts
 * @description Coverage for best-effort session-id derivation and compact session labeling helpers.
 * @functions
 *   → none
 * @exports none
 * @see ../session-identity.ts
 */

describe('session identity helpers', () => {
  it('treats placeholder hook ids as generic', () => {
    expect(isGenericSessionId('opencode', 'opencode-session')).toBe(true);
    expect(isGenericSessionId('codex', 'codex:hook-session')).toBe(true);
    expect(isGenericSessionId('claude-code', 'session-abc')).toBe(false);
  });

  it('derives a richer session id from project scope and pid', () => {
    expect(
      resolveSessionId({
        cwd: '/Users/vava/Documents/GitHub/AutoSnitch',
        pid: 4242,
        sessionId: 'opencode-session',
        tool: 'opencode',
      }),
    ).toBe('opencode:AutoSnitch:p4242');
  });

  it('prefers explicit non-generic ids', () => {
    expect(
      resolveSessionId({
        pid: 4242,
        sessionId: 'real-session-id',
        tool: 'claude-code',
      }),
    ).toBe('real-session-id');
  });

  it('formats readable labels and shortened ids for the TUI', () => {
    expect(
      formatSessionLabel({
        cwd: '/Users/vava/Documents/GitHub/AutoSnitch',
        instanceIndex: 2,
        instanceTotal: 3,
        pid: 31337,
        sessionId: 'opencode:AutoSnitch:p31337',
        tool: 'opencode',
      }),
    ).toBe('AutoSnitch · #2/3 · pid 31337');
    expect(
      formatSessionShortId('claude-code', 'session-abcdef1234567890'),
    ).toBe('sessio…7890');
  });
});
