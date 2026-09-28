/**
 * Grouping measured quantities so that only plausible pairs are compared.
 *
 * <p>Every relation this instrument states is "two measurements agree to within
 * a tolerance", and the obvious way to find those pairs is to try them all.
 * That is quadratic in segments and cubic in points, which is why the reporter
 * could only ever look at twenty-four points.
 *
 * <p>A quantity quantized into buckets one tolerance wide puts any two values
 * that agree into the same bucket or an adjacent one - never further, because
 * they differ by less than a bucket. So the pairs worth testing are the pairs
 * inside a bucket and the pairs across one bucket boundary, and everything else
 * can be skipped without being looked at. <b>The neighbour is not optional</b>:
 * two values either side of a boundary agree perfectly well, and a scheme that
 * only compared within a bucket would miss them - silently, and only sometimes,
 * which is the worst way for a marker to be wrong.
 *
 * <p>Bucketing only *proposes* pairs. Every one is then put through the same
 * comparison the exhaustive version used, so this changes what is compared and
 * not what is true.
 */
export class ToleranceBuckets<T> {
  readonly #width: number;
  readonly #count: number;
  readonly #buckets = new Map<number, T[]>();

  /**
   * @param width   A bucket, in the units of the quantity. Must be at least the
   *                tolerance the caller will compare at, or agreeing values can
   *                land two buckets apart and be missed.
   * @param period  Set for a quantity that wraps - a direction, where 0 and
   *                just-under-π are neighbours. The width is then rounded down
   *                so a whole number of buckets covers the period exactly, and
   *                that number is even, so "a quarter turn away" is a whole
   *                number of buckets too.
   */
  constructor(width: number, readonly period: number | null = null) {
    if (period === null) {
      this.#width = width;
      this.#count = 0;
      return;
    }
    const count = Math.max(4, Math.ceil(period / width));
    this.#count = count % 2 === 0 ? count : count + 1;
    this.#width = period / this.#count;
  }

  /** Buckets away that a shift of `offset` in the quantity's units amounts to. */
  offsetInBuckets(offset: number): number {
    return Math.round(offset / this.#width);
  }

  /** Empties the buckets so one instance can serve a scan that repeats. */
  clear(): void {
    this.#buckets.clear();
  }

  add(value: number, item: T): void {
    const index = this.#indexOf(value);
    const bucket = this.#buckets.get(index);
    if (bucket) bucket.push(item);
    else this.#buckets.set(index, [item]);
  }

  /**
   * Every pair whose values could agree, each once: the pairs inside a bucket,
   * and the pairs across each boundary.
   *
   * <p>A callback rather than an iterator on purpose. This is the innermost
   * loop of the whole file and it runs once per vertex; handing back a
   * generator cost more than the scan it was there to shorten, and made small
   * figures - the ones an exam is actually made of - slower than the exhaustive
   * version it replaced. Returning `false` stops the walk.
   */
  eachPair(visit: (one: T, other: T) => boolean | void): void {
    for (const [index, bucket] of this.#buckets) {
      for (let left = 0; left < bucket.length; left += 1) {
        for (let right = left + 1; right < bucket.length; right += 1) {
          if (visit(bucket[left] as T, bucket[right] as T) === false) return;
        }
      }
      const next = this.#bucketAt(index + 1);
      for (let other = 0; other < next.length; other += 1) {
        for (const item of bucket) {
          if (visit(item, next[other] as T) === false) return;
        }
      }
    }
  }

  /**
   * Every pair whose values could differ by `offset`: for a wrapping quantity,
   * "a quarter turn apart" rather than "the same".
   *
   * <p>A pair is proposed twice when the offset is half the period, because
   * then each of the two is that far from the other. Cheaper to let the caller
   * discard a repeat - it holds a set of facts already - than to carry the
   * bookkeeping to avoid it.
   */
  eachPairOffsetBy(offset: number, visit: (one: T, other: T) => boolean | void): void {
    const shift = this.offsetInBuckets(offset);
    for (const [index, bucket] of this.#buckets) {
      for (let step = -1; step <= 1; step += 1) {
        const target = this.#bucketAt(index + shift + step);
        for (let other = 0; other < target.length; other += 1) {
          for (const item of bucket) {
            if (visit(item, target[other] as T) === false) return;
          }
        }
      }
    }
  }

  #bucketAt(index: number): readonly T[] {
    return this.#buckets.get(this.#wrap(index)) ?? [];
  }

  #indexOf(value: number): number {
    return this.#wrap(Math.floor(value / this.#width));
  }

  #wrap(index: number): number {
    if (this.period === null) return index;
    return ((index % this.#count) + this.#count) % this.#count;
  }
}
