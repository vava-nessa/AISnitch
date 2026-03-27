import { describe, expect, it } from 'vitest';

import {
  AISNITCH_DESCRIPTION,
  AISNITCH_PACKAGE_NAME,
  getPackageScaffoldInfo,
} from '../index.js';

describe('package scaffold', () => {
  it('exposes the package identity constants', () => {
    expect(AISNITCH_PACKAGE_NAME).toBe('aisnitch');
    expect(AISNITCH_DESCRIPTION).toContain('Universal bridge');
  });

  it('returns stable scaffold metadata', () => {
    expect(getPackageScaffoldInfo()).toEqual({
      name: 'aisnitch',
      description: AISNITCH_DESCRIPTION,
      supportedNodeRange: '>=20.0.0',
    });
  });
});
