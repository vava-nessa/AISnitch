/**
 * @file src/core/engine/ring-buffer.ts
 * @description Fixed-size oldest-first ring buffer used to absorb temporary consumer backpressure.
 * @functions
 *   → none
 * @exports RingBuffer
 */

/**
 * 📖 This buffer intentionally drops the oldest item when full. For a live
 * stream UI that is exactly the right tradeoff: newest activity beats stale UI.
 */
export class RingBuffer<T> {
  private readonly items: Array<T | undefined>;

  private head = 0;

  private count = 0;

  public constructor(private readonly maxCapacity: number) {
    if (!Number.isInteger(maxCapacity) || maxCapacity <= 0) {
      throw new Error('RingBuffer capacity must be a positive integer.');
    }

    this.items = new Array<T | undefined>(maxCapacity);
  }

  /**
   * Pushes one item into the buffer and returns the dropped oldest item if full.
   */
  push(item: T): T | undefined {
    if (this.count < this.maxCapacity) {
      const insertIndex = (this.head + this.count) % this.maxCapacity;
      this.items[insertIndex] = item;
      this.count += 1;
      return undefined;
    }

    const droppedItem = this.items[this.head];

    this.items[this.head] = item;
    this.head = (this.head + 1) % this.maxCapacity;

    return droppedItem;
  }

  /**
   * Removes and returns the oldest item in the buffer.
   */
  shift(): T | undefined {
    if (this.count === 0) {
      return undefined;
    }

    const item = this.items[this.head];

    this.items[this.head] = undefined;
    this.head = (this.head + 1) % this.maxCapacity;
    this.count -= 1;

    return item;
  }

  /**
   * Drains and returns all items in oldest-first order.
   */
  drain(): T[] {
    const drainedItems: T[] = [];

    while (this.count > 0) {
      const item = this.shift();

      if (item !== undefined) {
        drainedItems.push(item);
      }
    }

    return drainedItems;
  }

  /**
   * Clears the buffer contents.
   */
  clear(): void {
    this.items.fill(undefined);
    this.head = 0;
    this.count = 0;
  }

  public get capacity(): number {
    return this.maxCapacity;
  }

  public get size(): number {
    return this.count;
  }

  public get isFull(): boolean {
    return this.count === this.maxCapacity;
  }
}
