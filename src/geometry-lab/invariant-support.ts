import type { GeometryPoint } from '../geometry-core/index.js';

/**
 * The parts of marking that both the plane and the space pass need.
 *
 * <p>Shared rather than copied because the two would drift on exactly the
 * things that must not drift: what a tolerance means, what a point is called,
 * and how many facts a report is allowed to state.
 */

/**
 * One part in a thousand of the figure's own size. Tight enough that a
 * coincidence is unlikely, loose enough for a point positioned by hand on a
 * touchscreen, which is the instrument this has to be usable with.
 */
export const RELATIVE_TOLERANCE = 1e-3;

/** Below this the figure is a smudge and nothing can be established about it. */
export const MIN_FIGURE_SIZE = 1e-9;

/**
 * How far two directions may differ and still count as the same one.
 *
 * <p>The comparisons are on a sine or a cosine rather than on an angle -
 * `|cross| / |a||b|` is the sine of the angle between - so the angle a
 * tolerance of `RELATIVE_TOLERANCE` really permits is its arcsine. Bucketing on
 * the angle has to use that number, or a pair the comparison would accept could
 * land two buckets apart and never be proposed.
 */
export const ANGULAR_TOLERANCE = Math.asin(RELATIVE_TOLERANCE);

/**
 * Bounded so a construction with many points cannot make marking expensive.
 *
 * <p>Bucketing made the point scans quadratic rather than cubic, which is what
 * pays for a cap in the low hundreds instead of at twenty-four. The number is
 * measured rather than chosen: the densest figure the benchmark builds at this
 * size costs about five milliseconds, inside the eight the harness allows, and
 * the next size up does not.
 */
export const MAX_POINTS = 128;

/** The most facts a report will state. */
export const MAX_INVARIANTS = 200;

/**
 * The most facts that will be *found* before the scan gives up.
 *
 * <p>Raising the point cap raises the number of facts a pathological figure can
 * hold: two hundred points on one line are a million collinear triples, and
 * generating them all to then report two hundred is work nobody asked for.
 * Deliberately several times `MAX_INVARIANTS`, so that a figure with a
 * reasonable number of facts is reported exactly as it was before this bound
 * existed - sorted, then cut to two hundred - and only a figure already far
 * past what can be reported is affected. Either way the report says it was
 * truncated.
 */
export const MAX_SCANNED_INVARIANTS = MAX_INVARIANTS * 4;

/**
 * How many object-against-object tests the scans that cannot bucket may do.
 *
 * <p>Some relations are not "two measurements agreeing" and so have no quantity
 * to bucket on: whether a point lies on a line, whether two lines in space miss
 * each other. They cost objects times objects, and unlike the pair scans the
 * fact bound does not stop them - a figure can hold a thousand segments that no
 * point lies on, and finding that out is the whole cost. Bounding the work
 * directly is the honest version: past this, the scan stops and the report says
 * it was truncated, which is what every other bound here does.
 */
export const MAX_INCIDENCE_TESTS = 50_000;

/**
 * A fact about the figure, written so an author can name it in a mark scheme
 * without knowing anything about this file: `equal-segments:AB,CD`,
 * `right-angle:ABC`, `point-on-circle:P,c`.
 *
 * <p>Labels are used where a point has one, because `equal-segments:AB,CD` is
 * something a teacher can write and `equal-segments:p_7f3a,p_9c1b` is not.
 */
export type GeometryInvariantId = string;

/** The facts found so far, and whether the scan gave up before finding them all. */
export class Facts {
  readonly #found = new Set<GeometryInvariantId>();
  #overflowed = false;

  add(invariant: GeometryInvariantId): void {
    if (this.#found.has(invariant)) return;
    if (this.#found.size >= MAX_SCANNED_INVARIANTS) {
      this.#overflowed = true;
      return;
    }
    this.#found.add(invariant);
  }

  /** True once the scan has stopped being worth continuing. */
  get full(): boolean {
    return this.#overflowed;
  }

  sorted(): GeometryInvariantId[] {
    return [...this.#found].sort();
  }
}

/** A count of work still allowed, so an unbounded scan stops rather than runs. */
export class Budget {
  #left: number;
  #spent = false;

  constructor(total: number) {
    this.#left = total;
  }

  /** Takes `amount` from the budget, or reports that there is not enough left. */
  spend(amount: number): boolean {
    if (this.#left < amount) {
      this.#spent = true;
      return false;
    }
    this.#left -= amount;
    return true;
  }

  /** True once a scan had to be cut short, which makes the report truncated. */
  get spent(): boolean {
    return this.#spent;
  }
}

/**
 * Two names in a fixed order. Without this the fact would be
 * `equal-segments:AB,CD` or `equal-segments:CD,AB` depending on iteration
 * order, and a mark scheme naming one would silently fail against the other.
 */
export function pair(left: string, right: string): string {
  return left <= right ? `${left},${right}` : `${right},${left}`;
}

/**
 * What a point is called in an invariant id: a label if the child gave one,
 * because `equal-segments:AB,CD` is what a teacher writes in a mark scheme and
 * an internal id is not.
 *
 * <p>Shared with goal checking, which has to split these names back out of a
 * run-together `AB` and would read the wrong figure if it named points
 * differently from the reporter.
 */
export function geometryInvariantPointName(point: { label?: string; id: string }): string {
  return point.label && point.label.trim() !== '' ? point.label.trim() : point.id;
}

/** What a named object with no two defining points is called: `plane(XY)`. */
export function geometryInvariantObjectName(
  wrapper: string,
  object: { label?: string; id: string },
): string {
  return `${wrapper}(${geometryInvariantPointName(object)})`;
}

/**
 * The size of a figure, used as the yardstick every comparison is relative to.
 * The diagonal of the bounding box rather than, say, the largest coordinate, so
 * a figure drawn far from the origin is not treated as an enormous one.
 */
export function boundingDiagonal(
  points: Iterable<{ x: number; y: number; z?: number }>,
): number {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let count = 0;
  for (const point of points) {
    const z = point.z ?? 0;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    maxZ = Math.max(maxZ, z);
    count += 1;
  }
  return count < 2 ? 0 : Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
}

/** Narrows a stored point to a finite 2D one. */
export function isFinite2DPoint(
  point: GeometryPoint,
): point is GeometryPoint & { kind: 'point2d'; x: number; y: number } {
  return point.kind === 'point2d'
    && Number.isFinite((point as { x?: number }).x)
    && Number.isFinite((point as { y?: number }).y);
}
