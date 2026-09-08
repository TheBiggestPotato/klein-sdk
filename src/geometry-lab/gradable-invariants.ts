import type { GeometryEntity, GeometryPoint } from '../geometry-core/index.js';
import type { GeometryLabSnapshot } from './types.js';

/**
 * What a construction can be marked on.
 *
 * <p>This is the half of automatic marking that lives in the instrument. The
 * assessment layer never looks at coordinates: it names the facts a
 * construction has to satisfy, and this states which facts hold. Klein's
 * scorer then checks that the named ones are in the list — so a question is
 * marked on geometry the tool vouched for, not on the scorer's own reading of
 * a picture.
 *
 * <p><b>Tolerance is the whole difficulty and it is stated rather than
 * hidden.</b> A child drags a point until two segments "look equal"; they
 * agree to eleven decimal places or to three, depending on how big the figure
 * is on screen and how steady the hand was. Comparing absolutely would mark a
 * correct construction wrong on a large figure and a sloppy one right on a
 * small one, so every comparison here is relative to the size of the figure
 * itself. `RELATIVE_TOLERANCE` is the number a marker is really setting when
 * they say "close enough", and it is one line, at the top, on purpose.
 *
 * <p>Facts are only emitted when they hold. Absence means "not established" —
 * which is not the same as false, and is why the scorer treats a snapshot with
 * no invariants as unscored rather than wrong.
 */

/**
 * One part in a thousand of the figure's own size. Tight enough that a
 * coincidence is unlikely, loose enough for a point positioned by hand on a
 * touchscreen, which is the instrument this has to be usable with.
 */
export const RELATIVE_TOLERANCE = 1e-3;

/** Below this the figure is a smudge and nothing can be established about it. */
const MIN_FIGURE_SIZE = 1e-9;

/**
 * Bounded so a construction with many points cannot make marking expensive:
 * the pairwise and triple-wise checks below are quadratic and cubic in the
 * number of points, and an exam is not the place to discover that.
 */
const MAX_POINTS = 24;
const MAX_INVARIANTS = 200;

/**
 * A fact about the figure, written so an author can name it in a mark scheme
 * without knowing anything about this file: `equal-segments:AB,CD`,
 * `right-angle:ABC`, `point-on-circle:P,c`.
 *
 * <p>Labels are used where a point has one, because `equal-segments:AB,CD` is
 * something a teacher can write and `equal-segments:p_7f3a,p_9c1b` is not.
 */
export type GeometryInvariantId = string;

export interface GeometryInvariantReport {
  readonly toolKey: 'geometry-lab';
  readonly invariants: readonly GeometryInvariantId[];
  /** The tolerance these were established at, so a mark can be explained. */
  readonly relativeTolerance: number;
  /** True when the figure was too large to check exhaustively. */
  readonly truncated: boolean;
}

interface NamedPoint {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
}

/**
 * Every fact this instrument is willing to vouch for about a 2D construction.
 *
 * <p>Deliberately a short list of the relations school geometry is about.
 * Adding to it is adding to what can be marked automatically, and each entry
 * needs a tolerance story of its own, so the list grows deliberately rather
 * than by accident.
 */
export function computeGeometryInvariants(
  snapshot: GeometryLabSnapshot,
): GeometryInvariantReport {
  const scene = snapshot.scene.scene2d;
  const allPoints = namedPoints(scene.points);
  const points = allPoints.slice(0, MAX_POINTS);
  const truncated = allPoints.length > MAX_POINTS;
  // Sorted by id, so nothing about the result depends on the order an object's
  // keys happened to be in.
  const entities = Object.values(scene.entities ?? {})
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));

  const scale = figureSize(points);
  const found = new Set<GeometryInvariantId>();
  if (points.length === 0 || scale < MIN_FIGURE_SIZE) {
    return report([], truncated);
  }
  const epsilon = scale * RELATIVE_TOLERANCE;

  const segments = entities.filter(isSegment);
  const byId = new Map(points.map((point) => [point.id, point]));

  // Equal segments: the relation behind most constructions a child is asked
  // to make with compasses.
  for (let left = 0; left < segments.length; left += 1) {
    for (let right = left + 1; right < segments.length; right += 1) {
      const one = segments[left];
      const other = segments[right];
      if (!one || !other) continue;
      const first = segmentLength(one, byId);
      const second = segmentLength(other, byId);
      if (first === null || second === null) continue;
      if (Math.abs(first - second) <= epsilon) {
        found.add(`equal-segments:${pair(name(one, byId), name(other, byId))}`);
      }
    }
  }

  // Parallel and perpendicular, over anything with two defining points.
  const lines = entities.filter(isLinear);
  for (let left = 0; left < lines.length; left += 1) {
    for (let right = left + 1; right < lines.length; right += 1) {
      const one = lines[left];
      const other = lines[right];
      if (!one || !other) continue;
      const first = direction(one, byId);
      const second = direction(other, byId);
      if (!first || !second) continue;
      const cross = Math.abs(first.x * second.y - first.y * second.x);
      const dot = Math.abs(first.x * second.x + first.y * second.y);
      // Compared against the tolerance scaled by both lengths, because a cross
      // product grows with the size of what it is measuring.
      const magnitude = Math.hypot(first.x, first.y) * Math.hypot(second.x, second.y);
      if (magnitude < MIN_FIGURE_SIZE) continue;
      if (cross / magnitude <= RELATIVE_TOLERANCE) {
        found.add(`parallel:${pair(name(one, byId), name(other, byId))}`);
      }
      if (dot / magnitude <= RELATIVE_TOLERANCE) {
        found.add(`perpendicular:${pair(name(one, byId), name(other, byId))}`);
      }
    }
  }

  // Right angles, collinearity, and midpoints.
  //
  // Iterated with the vertex outermost and the other two as an unordered pair
  // drawn from everything else. Bounding the pair by the vertex's own position
  // would silently skip every triple whose vertex happens to sort last — a
  // midpoint labelled M between A and B, for instance, which is the commonest
  // shape this is for.
  for (let vertexIndex = 0; vertexIndex < points.length; vertexIndex += 1) {
    const vertex = points[vertexIndex];
    if (!vertex) continue;
    for (let leftIndex = 0; leftIndex < points.length; leftIndex += 1) {
      if (leftIndex === vertexIndex) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < points.length; rightIndex += 1) {
        if (rightIndex === vertexIndex) continue;
        const first = points[leftIndex];
        const third = points[rightIndex];
        if (!first || !third) continue;

        const armOne = { x: first.x - vertex.x, y: first.y - vertex.y };
        const armTwo = { x: third.x - vertex.x, y: third.y - vertex.y };
        const magnitude = Math.hypot(armOne.x, armOne.y) * Math.hypot(armTwo.x, armTwo.y);
        if (magnitude < MIN_FIGURE_SIZE) continue;

        const dot = armOne.x * armTwo.x + armOne.y * armTwo.y;
        if (Math.abs(dot) / magnitude <= RELATIVE_TOLERANCE) {
          // Named vertex-in-the-middle, as an angle is written on paper.
          found.add(`right-angle:${first.name}${vertex.name}${third.name}`);
        }
        const cross = armOne.x * armTwo.y - armOne.y * armTwo.x;
        const collinear = Math.abs(cross) / magnitude <= RELATIVE_TOLERANCE;
        if (collinear) {
          // Sorted, so `collinear:A,B,C` and `collinear:C,B,A` are one fact.
          found.add(`collinear:${[first.name, vertex.name, third.name].sort().join(',')}`);
        }
        // The vertex is the midpoint when it lies on the line through both and
        // both arms are the same length.
        if (
          collinear
          && Math.abs(Math.hypot(armOne.x, armOne.y) - Math.hypot(armTwo.x, armTwo.y)) <= epsilon
        ) {
          found.add(`midpoint:${vertex.name},${[first.name, third.name].sort().join('')}`);
        }
      }
    }
  }

  // A point on a circle: the other half of a compass construction.
  for (const entity of entities) {
    if (entity.kind !== 'circle') continue;
    const centre = byId.get(entity.centerId);
    if (!centre) continue;
    for (const point of points) {
      if (point.id === centre.id) continue;
      const distance = Math.hypot(point.x - centre.x, point.y - centre.y);
      if (Math.abs(distance - entity.radius) <= epsilon) {
        found.add(`point-on-circle:${point.name},${entityName(entity, byId)}`);
      }
    }
  }

  return report([...found].sort(), truncated);
}

function report(
  invariants: GeometryInvariantId[],
  truncated: boolean,
): GeometryInvariantReport {
  return {
    toolKey: 'geometry-lab',
    // Bounded, and the bound is reported: a mark scheme naming a fact that
    // fell off the end must not look like a fact that failed.
    invariants: invariants.slice(0, MAX_INVARIANTS),
    relativeTolerance: RELATIVE_TOLERANCE,
    truncated: truncated || invariants.length > MAX_INVARIANTS,
  };
}

/**
 * The size of the figure, used as the yardstick every comparison is relative
 * to. The diagonal of the bounding box rather than, say, the largest
 * coordinate, so a figure drawn far from the origin is not treated as an
 * enormous one.
 */
function figureSize(points: readonly NamedPoint[]): number {
  if (points.length < 2) return 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return Math.hypot(maxX - minX, maxY - minY);
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
export function geometryInvariantPointName(point: GeometryPoint): string {
  return point.label && point.label.trim() !== '' ? point.label.trim() : point.id;
}

function namedPoints(points: Record<string, GeometryPoint>): NamedPoint[] {
  return Object.values(points)
    .filter((point): point is GeometryPoint & { x: number; y: number } =>
      point.kind === 'point2d'
      && Number.isFinite((point as { x?: number }).x)
      && Number.isFinite((point as { y?: number }).y))
    .map((point) => ({
      id: point.id,
      name: geometryInvariantPointName(point),
      x: point.x,
      y: point.y,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function isSegment(entity: GeometryEntity): entity is GeometryEntity & {
  kind: 'segment';
  pointIds: [string, string];
} {
  return entity.kind === 'segment';
}

function isLinear(entity: GeometryEntity): entity is GeometryEntity & {
  pointIds: [string, string];
} {
  return entity.kind === 'segment' || entity.kind === 'line' || entity.kind === 'ray';
}

function segmentLength(
  entity: { pointIds: [string, string] },
  byId: Map<string, NamedPoint>,
): number | null {
  const from = byId.get(entity.pointIds[0]);
  const to = byId.get(entity.pointIds[1]);
  if (!from || !to) return null;
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function direction(
  entity: { pointIds: [string, string] },
  byId: Map<string, NamedPoint>,
): { x: number; y: number } | null {
  const from = byId.get(entity.pointIds[0]);
  const to = byId.get(entity.pointIds[1]);
  if (!from || !to) return null;
  return { x: to.x - from.x, y: to.y - from.y };
}

/**
 * Two names in a fixed order. Without this the fact would be
 * `equal-segments:AB,CD` or `equal-segments:CD,AB` depending on iteration
 * order, and a mark scheme naming one would silently fail against the other.
 */
function pair(left: string, right: string): string {
  return left <= right ? `${left},${right}` : `${right},${left}`;
}

/** `AB` where both ends are labelled, so a mark scheme can name it. */
function name(
  entity: { pointIds: [string, string] },
  byId: Map<string, NamedPoint>,
): string {
  const from = byId.get(entity.pointIds[0]);
  const to = byId.get(entity.pointIds[1]);
  if (!from || !to) return '?';
  return [from.name, to.name].sort().join('');
}

function entityName(
  entity: { id: string; centerId: string },
  byId: Map<string, NamedPoint>,
): string {
  const centre = byId.get(entity.centerId);
  return centre ? `circle(${centre.name})` : entity.id;
}
