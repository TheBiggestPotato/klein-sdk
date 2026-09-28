import type { Vector2 } from '../core/index.js';

/**
 * Where a point has been.
 *
 * <p>A trace is the oldest idea in dynamic geometry and the easiest one to get
 * wrong in memory: it is unbounded by nature, and the obvious implementation -
 * push a position on every change - is a list that grows for as long as a
 * lesson lasts. A student dragging for two minutes at sixty frames a second has
 * appended seven thousand objects to an array nobody will ever read the middle
 * of.
 *
 * <p>So it is a ring over a packed `Float64Array`, allocated once at its full
 * size and never resized. Two thousand and forty-eight positions is thirty-two
 * kilobytes, and the two-thousand-and-forty-ninth overwrites the first. What
 * fell off is counted rather than silently forgotten, because a curve that has
 * lost its beginning should be able to say so.
 *
 * <p><b>Not in the snapshot, on purpose.</b> A trace is a record of what this
 * session did, not a property of the figure: putting it in the document would
 * put it through undo, through the history diff, through every collaborative
 * message and through JSON, and it would grow all of them for something that
 * means nothing to anybody who opens the file later. A typed array is not JSON
 * either, and flattening it to one would give up the only reason it is a typed
 * array.
 */
export class GeometryTrace {
  readonly #positions: Float64Array;
  readonly #capacity: number;
  #count = 0;
  #dropped = 0;

  constructor(capacity: number = DEFAULT_TRACE_CAPACITY) {
    this.#capacity = Math.max(1, Math.floor(capacity));
    this.#positions = new Float64Array(this.#capacity * 2);
  }

  /** How many positions are being kept. */
  get length(): number {
    return Math.min(this.#count, this.#capacity);
  }

  /** How many fell off the start, so a curve can say it has lost its beginning. */
  get dropped(): number {
    return this.#dropped;
  }

  get capacity(): number {
    return this.#capacity;
  }

  /**
   * Records a position, unless it is where the point already was.
   *
   * <p>A drag produces a commit per frame and a figure often has not moved
   * between two of them - a click, a tool change, a point somewhere else being
   * edited - and a trace full of the same position repeated is a trace that has
   * thrown away its own history to store a still life.
   */
  record(at: Vector2): void {
    if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
    if (this.#count > 0) {
      const last = ((this.#count - 1) % this.#capacity) * 2;
      if (this.#positions[last] === at.x && this.#positions[last + 1] === at.y) return;
    }
    const slot = (this.#count % this.#capacity) * 2;
    this.#positions[slot] = at.x;
    this.#positions[slot + 1] = at.y;
    this.#count += 1;
    if (this.#count > this.#capacity) this.#dropped += 1;
  }

  /** The positions, oldest first. */
  points(): Vector2[] {
    const length = this.length;
    const start = this.#count <= this.#capacity ? 0 : this.#count % this.#capacity;
    const out: Vector2[] = new Array(length);
    for (let index = 0; index < length; index += 1) {
      const slot = ((start + index) % this.#capacity) * 2;
      out[index] = { x: this.#positions[slot] as number, y: this.#positions[slot + 1] as number };
    }
    return out;
  }

  clear(): void {
    this.#count = 0;
    this.#dropped = 0;
  }
}

/** Two thousand and forty-eight positions: thirty-two kilobytes, allocated once. */
export const DEFAULT_TRACE_CAPACITY = 2048;
