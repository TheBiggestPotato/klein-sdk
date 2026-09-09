import type { Vector2 } from '../core/index.js';
import type { GeometryLabFigureGeometry } from './renderers.js';

/**
 * What is under the pointer.
 *
 * <p><b>Indexed, not scanned.</b> The obvious implementation asks every object
 * how far away the pointer is, on every pointer move - which is linear in the
 * figure at sixty frames a second, and is the thing this was written to avoid.
 * A figure's geometry is instead bucketed into a uniform grid over the screen
 * once per view, and a query looks only in the cells the pick radius reaches.
 * A five-hundred-object figure then costs a query the same as a five-object
 * one, because the answer only ever depends on what is nearby.
 *
 * <p><b>Segments are indexed, not bounding boxes.</b> A polygon's box can cover
 * the whole viewport, so bucketing boxes would put it in every cell and the
 * index would be a scan wearing a hat. Each drawn segment goes into the cells
 * that segment crosses, which is a handful, and the exact distance test then
 * runs on a few real candidates.
 */

/** Something the pointer is over. */
export interface GeometryHit {
  readonly id: string;
  readonly kind: 'point' | 'entity';
  /** Screen distance from the query, in pixels. */
  readonly distance: number;
}

/** How near counts as over, in screen pixels. */
export const DEFAULT_PICK_RADIUS = 10;

/**
 * Cells are a few pick-radii across: small enough that a query reads a handful
 * of objects, large enough that a long line is not chopped into hundreds of
 * entries.
 */
const CELL_SIZE = 32;

interface IndexedSegment {
  id: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

interface IndexedPoint {
  id: string;
  x: number;
  y: number;
}

export class GeometryHitIndex {
  readonly #columns: number;
  readonly #rows: number;
  readonly #points: IndexedPoint[][] = [];
  readonly #segments: IndexedSegment[][] = [];

  private constructor(width: number, height: number) {
    this.#columns = Math.max(1, Math.ceil(width / CELL_SIZE));
    this.#rows = Math.max(1, Math.ceil(height / CELL_SIZE));
  }

  /** Builds an index over a figure's screen geometry. */
  static build(figure: GeometryLabFigureGeometry): GeometryHitIndex {
    const index = new GeometryHitIndex(figure.width, figure.height);
    for (const point of figure.points) {
      index.#addPoint({ id: point.id, x: point.at.x, y: point.at.y });
    }
    for (const path of figure.paths) {
      const points = path.points;
      const last = path.closed ? points.length : points.length - 1;
      for (let step = 0; step < last; step += 1) {
        const from = points[step] as Vector2;
        const to = points[(step + 1) % points.length] as Vector2;
        index.#addSegment({ id: path.id, ax: from.x, ay: from.y, bx: to.x, by: to.y });
      }
    }
    return index;
  }

  /**
   * The nearest object within `radius`, or nothing.
   *
   * <p>A point wins a tie with an entity at the same distance, and wins outright
   * whenever it is within the radius: a vertex is drawn on top of the polygon it
   * belongs to and is the smaller target, so a pointer near both means the
   * vertex. Getting this the other way round makes a figure feel unusable in a
   * way that is hard to name.
   */
  hit(at: Vector2, radius: number = DEFAULT_PICK_RADIUS): GeometryHit | null {
    let best: GeometryHit | null = null;
    this.#near(this.#points, at, radius, (point) => {
      const distance = Math.hypot(point.x - at.x, point.y - at.y);
      if (distance <= radius && (!best || distance < best.distance)) {
        best = { id: point.id, kind: 'point', distance };
      }
    });
    if (best) return best;

    this.#near(this.#segments, at, radius, (segment) => {
      const distance = distanceToSegment(at, segment);
      if (distance <= radius && (!best || distance < best.distance)) {
        best = { id: segment.id, kind: 'entity', distance };
      }
    });
    return best;
  }

  /** Everything within `radius`, nearest first - for a host offering a choice. */
  hitAll(at: Vector2, radius: number = DEFAULT_PICK_RADIUS): GeometryHit[] {
    const found = new Map<string, GeometryHit>();
    const keep = (hit: GeometryHit): void => {
      const existing = found.get(hit.id);
      if (!existing || hit.distance < existing.distance) found.set(hit.id, hit);
    };
    this.#near(this.#points, at, radius, (point) => {
      const distance = Math.hypot(point.x - at.x, point.y - at.y);
      if (distance <= radius) keep({ id: point.id, kind: 'point', distance });
    });
    this.#near(this.#segments, at, radius, (segment) => {
      const distance = distanceToSegment(at, segment);
      if (distance <= radius) keep({ id: segment.id, kind: 'entity', distance });
    });
    return [...found.values()].sort((left, right) => left.distance - right.distance);
  }

  /* ---------------------------------------------------------------------- */

  #addPoint(point: IndexedPoint): void {
    const cell = this.#cellAt(point.x, point.y);
    if (cell === null) return;
    (this.#points[cell] ??= []).push(point);
  }

  /**
   * Walks the segment cell by cell rather than filling its bounding box: a
   * diagonal across the viewport touches a line of cells, and its box touches
   * all of them.
   */
  #addSegment(segment: IndexedSegment): void {
    const length = Math.hypot(segment.bx - segment.ax, segment.by - segment.ay);
    const steps = Math.max(1, Math.ceil(length / (CELL_SIZE / 2)));
    let previous = -1;
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const cell = this.#cellAt(
        segment.ax + (segment.bx - segment.ax) * t,
        segment.ay + (segment.by - segment.ay) * t,
      );
      if (cell === null || cell === previous) continue;
      previous = cell;
      const bucket = (this.#segments[cell] ??= []);
      // Sampling at half a cell can revisit one, and a segment listed twice in
      // a cell would be measured twice for the same answer.
      if (bucket[bucket.length - 1] !== segment) bucket.push(segment);
    }
  }

  /**
   * Everything in the cells the radius reaches.
   *
   * <p>A callback rather than a generator, and measured rather than assumed:
   * this runs on every pointer move, and handing back an iterator cost enough
   * to eat most of the advantage the index exists to provide - the same lesson
   * the invariant bucketing learned. Most queries land on empty cells, where
   * the whole call should be a few bounds checks.
   */
  #near<T>(buckets: T[][], at: Vector2, radius: number, visit: (item: T) => void): void {
    const reach = Math.max(0, Math.ceil(radius / CELL_SIZE));
    const column = Math.floor(at.x / CELL_SIZE);
    const row = Math.floor(at.y / CELL_SIZE);
    for (let dy = -reach; dy <= reach; dy += 1) {
      const y = row + dy;
      if (y < 0 || y >= this.#rows) continue;
      const rowOffset = y * this.#columns;
      for (let dx = -reach; dx <= reach; dx += 1) {
        const x = column + dx;
        if (x < 0 || x >= this.#columns) continue;
        const bucket = buckets[rowOffset + x];
        if (bucket === undefined) continue;
        for (let index = 0; index < bucket.length; index += 1) visit(bucket[index] as T);
      }
    }
  }

  #cellAt(x: number, y: number): number | null {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const column = Math.floor(x / CELL_SIZE);
    const row = Math.floor(y / CELL_SIZE);
    if (column < 0 || row < 0 || column >= this.#columns || row >= this.#rows) return null;
    return row * this.#columns + column;
  }
}

/** Distance from a point to a segment, clamped to the segment's own extent. */
function distanceToSegment(at: Vector2, segment: IndexedSegment): number {
  const dx = segment.bx - segment.ax;
  const dy = segment.by - segment.ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-12) return Math.hypot(at.x - segment.ax, at.y - segment.ay);
  const along = Math.min(1, Math.max(0, ((at.x - segment.ax) * dx + (at.y - segment.ay) * dy) / lengthSquared));
  return Math.hypot(at.x - (segment.ax + dx * along), at.y - (segment.ay + dy * along));
}
