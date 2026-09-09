import type { GeometryEntity, GeometryPoint } from '../geometry-core/index.js';
import { computeGeometry3DInvariants } from './gradable-invariants-3d.js';
import {
  ANGULAR_TOLERANCE,
  Budget,
  Facts,
  MAX_INCIDENCE_TESTS,
  MAX_INVARIANTS,
  MAX_POINTS,
  MIN_FIGURE_SIZE,
  RELATIVE_TOLERANCE,
  boundingDiagonal,
  geometryInvariantPointName,
  isFinite2DPoint,
  pair,
  type GeometryInvariantId,
} from './invariant-support.js';
import { ToleranceBuckets } from './tolerance-buckets.js';
import type { GeometryLabSnapshot } from './types.js';

export { RELATIVE_TOLERANCE, geometryInvariantPointName } from './invariant-support.js';
export type { GeometryInvariantId } from './invariant-support.js';

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
 *
 * <p><b>Pairs are proposed by bucketing and settled by comparison.</b> Every
 * relation here is "two measurements agree to within a tolerance", and trying
 * every pair is quadratic in segments and cubic in points - which is why this
 * could once only look at twenty-four of them. Quantizing each quantity into
 * buckets one tolerance wide puts any two values that agree into the same
 * bucket or the next, so only those pairs are tested; see
 * {@link ToleranceBuckets}. The comparison applied to a proposed pair is the
 * same one the exhaustive version used, so bucketing changed what is looked at
 * and not what is true.
 */

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

/** An arm from the vertex under consideration to one other point. */
interface Arm {
  index: number;
  dx: number;
  dy: number;
  length: number;
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

  const scale = boundingDiagonal(points);
  const facts = new Facts();
  const budget = new Budget(MAX_INCIDENCE_TESTS);

  // A figure can hold both scenes, or only one. A pure 3D construction has no
  // 2D points at all, so the plane pass is skipped rather than the whole
  // marking abandoned.
  if (points.length > 0 && scale >= MIN_FIGURE_SIZE) {
    const epsilon = scale * RELATIVE_TOLERANCE;
    const byId = new Map(points.map((point) => [point.id, point]));
    const indexById = new Map(points.map((point, index) => [point.id, index]));

    equalSegments(entities, byId, epsilon, facts);
    lineDirections(entities, byId, facts);
    pointTriples(points, epsilon, facts);
    pointsOnCircles(points, entities, byId, epsilon, facts);
    incidences(points, entities, byId, epsilon, facts, budget);
    tangents(entities, byId, epsilon, facts, budget);
    equalAngles(points, entities, indexById, facts);
    polygonRelations(entities, byId, scale, epsilon, facts);
  }

  // Space has its own scale and its own vocabulary; see the module it lives in.
  const spaceTruncated = computeGeometry3DInvariants(snapshot.scene.scene3d, facts, budget);

  return report(facts, truncated || spaceTruncated || budget.spent);
}

function report(facts: Facts, truncated: boolean): GeometryInvariantReport {
  const invariants = facts.sorted();
  return {
    toolKey: 'geometry-lab',
    // Bounded, and the bound is reported: a mark scheme naming a fact that
    // fell off the end must not look like a fact that failed.
    invariants: invariants.slice(0, MAX_INVARIANTS),
    relativeTolerance: RELATIVE_TOLERANCE,
    truncated: truncated || facts.full || invariants.length > MAX_INVARIANTS,
  };
}

/* -------------------------------------------------------------------------- */
/* Equal segments                                                             */
/* -------------------------------------------------------------------------- */

/** The relation behind most constructions a child is asked to make with compasses. */
function equalSegments(
  entities: readonly GeometryEntity[],
  byId: Map<string, NamedPoint>,
  epsilon: number,
  facts: Facts,
): void {
  const buckets = new ToleranceBuckets<{ entity: TwoPointEntity; length: number }>(epsilon);
  for (const entity of entities) {
    if (!isSegment(entity)) continue;
    const length = segmentLength(entity, byId);
    if (length === null) continue;
    buckets.add(length, { entity, length });
  }
  buckets.eachPair((one, other) => {
    if (facts.full) return false;
    if (Math.abs(one.length - other.length) <= epsilon) {
      facts.add(`equal-segments:${pair(name(one.entity, byId), name(other.entity, byId))}`);
    }
    return true;
  });
}

/* -------------------------------------------------------------------------- */
/* Parallel and perpendicular                                                 */
/* -------------------------------------------------------------------------- */

/** Over anything with two defining points, whether or not it is drawn as a line. */
function lineDirections(
  entities: readonly GeometryEntity[],
  byId: Map<string, NamedPoint>,
  facts: Facts,
): void {
  interface Directed { entity: TwoPointEntity; x: number; y: number }
  // A direction and its opposite are the same direction, so the quantity wraps
  // at half a turn rather than a whole one.
  const buckets = new ToleranceBuckets<Directed>(ANGULAR_TOLERANCE, Math.PI);
  for (const entity of entities) {
    if (!isLinear(entity)) continue;
    const vector = direction(entity, byId);
    if (!vector) continue;
    const angle = Math.atan2(vector.y, vector.x);
    buckets.add(((angle % Math.PI) + Math.PI) % Math.PI, { entity, x: vector.x, y: vector.y });
  }

  const compare = (one: Directed, other: Directed, relation: 'parallel' | 'perpendicular'): void => {
    // Compared against the tolerance scaled by both lengths, because a cross
    // product grows with the size of what it is measuring.
    const magnitude = Math.hypot(one.x, one.y) * Math.hypot(other.x, other.y);
    if (magnitude < MIN_FIGURE_SIZE) return;
    const measure = relation === 'parallel'
      ? Math.abs(one.x * other.y - one.y * other.x)
      : Math.abs(one.x * other.x + one.y * other.y);
    if (measure / magnitude <= RELATIVE_TOLERANCE) {
      facts.add(`${relation}:${pair(name(one.entity, byId), name(other.entity, byId))}`);
    }
  };

  buckets.eachPair((one, other) => {
    if (facts.full) return false;
    compare(one, other, 'parallel');
    return true;
  });
  buckets.eachPairOffsetBy(Math.PI / 2, (one, other) => {
    if (facts.full) return false;
    compare(one, other, 'perpendicular');
    return true;
  });
}

/* -------------------------------------------------------------------------- */
/* Right angles, collinearity and midpoints                                   */
/* -------------------------------------------------------------------------- */

/**
 * The three relations about a point and a pair of others, taken a vertex at a
 * time.
 *
 * <p>Bucketing the directions out of one vertex is what turns this from cubic
 * into quadratic: two points are collinear with the vertex when their bearings
 * from it agree, and at right angles when they are a quarter turn apart, so
 * both are bucket lookups rather than a scan of every other point.
 *
 * <p>The vertex is outermost and the other two are an unordered pair drawn from
 * everything else. Bounding the pair by the vertex's own position would
 * silently skip every triple whose vertex happens to sort last - a midpoint
 * labelled M between A and B, for instance, which is the commonest shape this
 * is for.
 */
function pointTriples(
  points: readonly NamedPoint[],
  epsilon: number,
  facts: Facts,
): void {
  const arms: Arm[] = points.map(() => ({ index: 0, dx: 0, dy: 0, length: 0 }));
  // One set of buckets for the whole scan rather than one per vertex: a figure
  // at the cap has a hundred and twenty-eight vertices, and the allocation
  // showed up against the exhaustive version it replaced.
  const buckets = new ToleranceBuckets<Arm>(ANGULAR_TOLERANCE, Math.PI);

  for (let vertexIndex = 0; vertexIndex < points.length; vertexIndex += 1) {
    if (facts.full) return;
    const vertex = points[vertexIndex];
    if (!vertex) continue;

    buckets.clear();
    let armCount = 0;
    for (let other = 0; other < points.length; other += 1) {
      if (other === vertexIndex) continue;
      const point = points[other];
      if (!point) continue;
      const dx = point.x - vertex.x;
      const dy = point.y - vertex.y;
      const length = Math.hypot(dx, dy);
      // A point sitting on the vertex has no bearing from it, and the
      // comparison below would reject every pair it took part in anyway.
      if (length === 0) continue;
      const arm = arms[armCount] as Arm;
      arm.index = other;
      arm.dx = dx;
      arm.dy = dy;
      arm.length = length;
      armCount += 1;
      const angle = Math.atan2(dy, dx);
      buckets.add(((angle % Math.PI) + Math.PI) % Math.PI, arm);
    }
    if (armCount < 2) continue;

    const visit = (one: Arm, other: Arm): boolean => {
      if (facts.full) return false;
      // Named in the order the points sort in, so `right-angle:ABC` reads the
      // way it is written on paper and does not depend on which bucket
      // proposed the pair.
      const first = one.index <= other.index ? one : other;
      const third = one.index <= other.index ? other : one;
      const firstPoint = points[first.index];
      const thirdPoint = points[third.index];
      if (!firstPoint || !thirdPoint) return true;

      const magnitude = first.length * third.length;
      if (magnitude < MIN_FIGURE_SIZE) return true;

      const dot = first.dx * third.dx + first.dy * third.dy;
      if (Math.abs(dot) / magnitude <= RELATIVE_TOLERANCE) {
        // Named vertex-in-the-middle, as an angle is written on paper.
        facts.add(`right-angle:${firstPoint.name}${vertex.name}${thirdPoint.name}`);
      }
      const cross = first.dx * third.dy - first.dy * third.dx;
      if (Math.abs(cross) / magnitude > RELATIVE_TOLERANCE) return true;
      // Sorted, so `collinear:A,B,C` and `collinear:C,B,A` are one fact.
      facts.add(`collinear:${[firstPoint.name, vertex.name, thirdPoint.name].sort().join(',')}`);
      // The vertex is the midpoint when it lies on the line through both and
      // both arms are the same length.
      if (Math.abs(first.length - third.length) <= epsilon) {
        facts.add(`midpoint:${vertex.name},${[firstPoint.name, thirdPoint.name].sort().join('')}`);
      }
      return true;
    };

    buckets.eachPair(visit);
    buckets.eachPairOffsetBy(Math.PI / 2, visit);
    if (facts.full) return;
  }
}

/* -------------------------------------------------------------------------- */
/* Circles                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A point on a circle - the other half of a compass construction - and the sets
 * of points that are therefore concyclic.
 *
 * <p>`concyclic` is stated for the whole set of points on a circle rather than
 * for every four of them: a circle with ten points on it has two hundred and
 * ten four-element subsets, and stating them all would fill a report with one
 * fact restated. Goal checking knows the relation is closed under subsets, so
 * an author asking about four of the ten still marks. That mechanism is what
 * makes the fact worth stating at all - without it, a maximal set would be a
 * fact no mark scheme could name.
 *
 * <p>Points concyclic on a circle that is <em>not</em> in the figure are still
 * not reported: finding those is a search over triples for the circumcircle
 * they span, which is the cubic cost bucketing exists to remove.
 */
function pointsOnCircles(
  points: readonly NamedPoint[],
  entities: readonly GeometryEntity[],
  byId: Map<string, NamedPoint>,
  epsilon: number,
  facts: Facts,
): void {
  for (const entity of entities) {
    if (entity.kind !== 'circle') continue;
    const centre = byId.get(entity.centerId);
    if (!centre) continue;
    const on: string[] = [];
    for (const point of points) {
      if (facts.full) return;
      if (point.id === centre.id) continue;
      const distance = Math.hypot(point.x - centre.x, point.y - centre.y);
      if (Math.abs(distance - entity.radius) <= epsilon) {
        on.push(point.name);
        facts.add(`point-on-circle:${point.name},${entityName(entity, byId)}`);
      }
    }
    if (on.length >= MIN_CONCYCLIC_POINTS) {
      facts.add(`concyclic:${on.slice().sort().join(',')}`);
    }
  }
}

/** The fewest points worth calling concyclic: any three non-collinear ones are. */
const MIN_CONCYCLIC_POINTS = 4;

/**
 * A line that touches a circle without crossing it.
 *
 * <p>Tangency is a distance, so it takes the same figure-relative tolerance
 * every other length here does. The touch has to fall on the object as drawn:
 * a short segment whose *extension* would graze the circle is not a tangent to
 * it, and saying it was would credit a construction nobody made.
 */
function tangents(
  entities: readonly GeometryEntity[],
  byId: Map<string, NamedPoint>,
  epsilon: number,
  facts: Facts,
  budget: Budget,
): void {
  const circles = entities.filter(
    (entity): entity is GeometryEntity & { kind: 'circle'; centerId: string; radius: number } =>
      entity.kind === 'circle',
  );
  if (circles.length === 0) return;

  for (const entity of entities) {
    if (!isLinear(entity)) continue;
    if (!budget.spend(circles.length)) return;
    const from = byId.get(entity.pointIds[0]);
    const to = byId.get(entity.pointIds[1]);
    if (!from || !to) continue;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared < MIN_FIGURE_SIZE) continue;
    const length = Math.sqrt(lengthSquared);

    for (const circle of circles) {
      if (facts.full) return;
      const centre = byId.get(circle.centerId);
      if (!centre) continue;
      const distance = Math.abs((centre.x - from.x) * dy - (centre.y - from.y) * dx) / length;
      if (Math.abs(distance - circle.radius) > epsilon) continue;
      const along = ((centre.x - from.x) * dx + (centre.y - from.y) * dy) / lengthSquared;
      if (!withinExtent(entity.kind, along, epsilon / length)) continue;
      facts.add(`tangent:${name(entity, byId)},${entityName(circle, byId)}`);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Incidence                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A point lying on an object.
 *
 * <p>Distinct from `collinear`, which is about three points and says nothing
 * about anything being drawn. A point on a *segment* has to be between its
 * ends, and on a *ray* on the right side of its start, because that is what the
 * object means; the endpoints themselves are left out, since "A is on AB" is
 * true of every figure and worth saying about none.
 */
function incidences(
  points: readonly NamedPoint[],
  entities: readonly GeometryEntity[],
  byId: Map<string, NamedPoint>,
  epsilon: number,
  facts: Facts,
  budget: Budget,
): void {
  for (const entity of entities) {
    if (!isLinear(entity)) continue;
    if (!budget.spend(points.length)) return;
    const from = byId.get(entity.pointIds[0]);
    const to = byId.get(entity.pointIds[1]);
    if (!from || !to) continue;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared < MIN_FIGURE_SIZE) continue;
    const length = Math.sqrt(lengthSquared);
    const slack = epsilon / length;

    for (const point of points) {
      if (facts.full) return;
      if (point.id === from.id || point.id === to.id) continue;
      const offset = Math.abs((point.x - from.x) * dy - (point.y - from.y) * dx) / length;
      if (offset > epsilon) continue;
      const along = ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared;
      if (!withinExtent(entity.kind, along, slack)) continue;
      facts.add(`point-on:${point.name},${name(entity, byId)}`);
    }
  }
}

/** Whether a parameter along a two-point object falls on the part that is drawn. */
function withinExtent(kind: string, along: number, slack: number): boolean {
  if (kind === 'line') return true;
  if (kind === 'ray') return along >= -slack;
  return along >= -slack && along <= 1 + slack;
}

/* -------------------------------------------------------------------------- */
/* Equal angles                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Two angles of the same size.
 *
 * <p>Over angles the figure actually shows: a vertex and two points joined to
 * it. Every triple of points has an angle at each of them, so taking all of
 * them would be cubic again and would mostly report angles nobody drew - and a
 * mark scheme asks about the angles in the figure.
 *
 * <p>Compared as angles rather than through a sine, so the tolerance is
 * {@link ANGULAR_TOLERANCE} directly. Angles too close to nothing or to a
 * straight line are left out: they are not angles a lesson is about, and two of
 * them being "equal" is an artefact of three points being in a row.
 */
function equalAngles(
  points: readonly NamedPoint[],
  entities: readonly GeometryEntity[],
  indexById: Map<string, number>,
  facts: Facts,
): void {
  const joined = new Map<number, Set<number>>();
  for (const entity of entities) {
    if (!isLinear(entity)) continue;
    const first = indexById.get(entity.pointIds[0]);
    const second = indexById.get(entity.pointIds[1]);
    if (first === undefined || second === undefined || first === second) continue;
    add(joined, first, second);
    add(joined, second, first);
  }

  const buckets = new ToleranceBuckets<{ name: string; measure: number }>(ANGULAR_TOLERANCE);
  for (const [vertexIndex, neighbours] of joined) {
    const vertex = points[vertexIndex];
    if (!vertex || neighbours.size < 2) continue;
    const around = [...neighbours].sort((left, right) => left - right);
    for (let left = 0; left < around.length; left += 1) {
      for (let right = left + 1; right < around.length; right += 1) {
        const first = points[around[left] as number];
        const third = points[around[right] as number];
        if (!first || !third) continue;
        const measure = angleBetween(vertex, first, third);
        if (measure === null) continue;
        if (measure <= ANGULAR_TOLERANCE || measure >= Math.PI - ANGULAR_TOLERANCE) continue;
        buckets.add(measure, { name: `${first.name}${vertex.name}${third.name}`, measure });
      }
    }
  }

  buckets.eachPair((one, other) => {
    if (facts.full) return false;
    if (one.name !== other.name && Math.abs(one.measure - other.measure) <= ANGULAR_TOLERANCE) {
      facts.add(`equal-angles:${pair(one.name, other.name)}`);
    }
    return true;
  });
}

function angleBetween(vertex: NamedPoint, first: NamedPoint, third: NamedPoint): number | null {
  const ax = first.x - vertex.x;
  const ay = first.y - vertex.y;
  const bx = third.x - vertex.x;
  const by = third.y - vertex.y;
  if (Math.hypot(ax, ay) * Math.hypot(bx, by) < MIN_FIGURE_SIZE) return null;
  return Math.atan2(Math.abs(ax * by - ay * bx), ax * bx + ay * by);
}

function add(map: Map<number, Set<number>>, key: number, value: number): void {
  const existing = map.get(key);
  if (existing) existing.add(value);
  else map.set(key, new Set([value]));
}

/* -------------------------------------------------------------------------- */
/* Polygons                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Congruent and similar triangles, and polygons of equal area.
 *
 * <p>Congruence is bucketed on the shortest side, because congruent triangles
 * have equal shortest sides and so cannot land more than a bucket apart;
 * similarity on the ratio of the shortest side to the longest, which is a
 * number rather than a length and so takes the plain relative tolerance. Area
 * is a length squared, so its tolerance is the figure's size squared times the
 * same relative number - comparing an area against a length tolerance would be
 * strict on a large figure and slack on a small one, which is the mistake this
 * whole file exists to avoid.
 */
function polygonRelations(
  entities: readonly GeometryEntity[],
  byId: Map<string, NamedPoint>,
  scale: number,
  epsilon: number,
  facts: Facts,
): void {
  interface Shape {
    name: string;
    sides: number[];
    area: number;
  }
  const triangles = new ToleranceBuckets<Shape>(epsilon);
  const similar = new ToleranceBuckets<Shape>(RELATIVE_TOLERANCE);
  const areas = new ToleranceBuckets<Shape>(scale * scale * RELATIVE_TOLERANCE);

  for (const entity of entities) {
    if (entity.kind !== 'polygon') continue;
    const corners = entity.pointIds
      .map((id) => byId.get(id))
      .filter((point): point is NamedPoint => point !== undefined);
    if (corners.length !== entity.pointIds.length || corners.length < 3) continue;

    const sides: number[] = [];
    for (let index = 0; index < corners.length; index += 1) {
      const from = corners[index] as NamedPoint;
      const to = corners[(index + 1) % corners.length] as NamedPoint;
      sides.push(Math.hypot(to.x - from.x, to.y - from.y));
    }
    const shape: Shape = {
      name: corners.map((corner) => corner.name).sort().join(''),
      sides: sides.slice().sort((left, right) => left - right),
      area: polygonArea(corners),
    };
    areas.add(shape.area, shape);
    if (corners.length === 3) {
      const shortest = shape.sides[0] as number;
      const longest = shape.sides[2] as number;
      triangles.add(shortest, shape);
      if (longest > MIN_FIGURE_SIZE) similar.add(shortest / longest, shape);
    }
  }

  triangles.eachPair((one, other) => {
    if (facts.full) return false;
    if (one.name !== other.name
      && one.sides.every((side, index) => Math.abs(side - (other.sides[index] as number)) <= epsilon)) {
      facts.add(`congruent:${pair(one.name, other.name)}`);
    }
    return true;
  });
  similar.eachPair((one, other) => {
    if (facts.full) return false;
    if (one.name !== other.name && sameShape(one.sides, other.sides)) {
      facts.add(`similar:${pair(one.name, other.name)}`);
    }
    return true;
  });
  const areaTolerance = scale * scale * RELATIVE_TOLERANCE;
  areas.eachPair((one, other) => {
    if (facts.full) return false;
    if (one.name !== other.name && Math.abs(one.area - other.area) <= areaTolerance) {
      facts.add(`equal-area:${pair(one.name, other.name)}`);
    }
    return true;
  });
}

/** Two triangles are the same shape when their sides are in the same proportion. */
function sameShape(one: readonly number[], other: readonly number[]): boolean {
  const oneLongest = one[2] as number;
  const otherLongest = other[2] as number;
  if (oneLongest < MIN_FIGURE_SIZE || otherLongest < MIN_FIGURE_SIZE) return false;
  for (let index = 0; index < 2; index += 1) {
    const first = (one[index] as number) / oneLongest;
    const second = (other[index] as number) / otherLongest;
    if (Math.abs(first - second) > RELATIVE_TOLERANCE) return false;
  }
  return true;
}

/** The shoelace formula, unsigned: a polygon's area does not depend on its winding. */
function polygonArea(corners: readonly NamedPoint[]): number {
  let twice = 0;
  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index] as NamedPoint;
    const next = corners[(index + 1) % corners.length] as NamedPoint;
    twice += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twice) / 2;
}

/* -------------------------------------------------------------------------- */
/* Collecting                                                                 */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Reading the figure                                                         */
/* -------------------------------------------------------------------------- */

function namedPoints(points: Record<string, GeometryPoint>): NamedPoint[] {
  return Object.values(points)
    .filter(isFinite2DPoint)
    .map((point) => ({
      id: point.id,
      name: geometryInvariantPointName(point),
      x: point.x,
      y: point.y,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

type TwoPointEntity = GeometryEntity & { pointIds: [string, string] };

function isSegment(entity: GeometryEntity): entity is TwoPointEntity & { kind: 'segment' } {
  return entity.kind === 'segment';
}

function isLinear(entity: GeometryEntity): entity is TwoPointEntity {
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
