import { describe, expect, it } from 'vitest';

import { RingBuffer } from '../ring-buffer.js';

/**
 * @file src/core/engine/__tests__/ring-buffer.test.ts
 * @description Unit coverage for the fixed-size oldest-first ring buffer used by WS consumers.
 * @functions
 *   → none
 * @exports none
 * @see ../ring-buffer.ts
 */

describe('RingBuffer', () => {
  it('drains items in insertion order', () => {
    const buffer = new RingBuffer<number>(3);

    buffer.push(1);
    buffer.push(2);
    buffer.push(3);

    expect(buffer.drain()).toEqual([1, 2, 3]);
    expect(buffer.size).toBe(0);
  });

  it('drops the oldest item when capacity is exceeded', () => {
    const buffer = new RingBuffer<string>(2);

    buffer.push('old');
    buffer.push('mid');
    const dropped = buffer.push('new');

    expect(dropped).toBe('old');
    expect(buffer.drain()).toEqual(['mid', 'new']);
  });
});
