import type { GeometryPoint3D } from '../geometry-core/index.js';
import {
  ANGULAR_TOLERANCE,
  Budget,
  Facts,
  MAX_POINTS,
  MIN_FIGURE_SIZE,
  RELATIVE_TOLERANCE,
  boundingDiagonal,
  geometryInvariantObjectName,
  geometryInvariantPointName,
  pair,
} from './invariant-support.js';
import { ToleranceBuckets } from './tolerance-buckets.js';
import type { GeometryEntity3D, GeometryScene3D, WorkPlane3D } from './types.js';

/**
 * What a construction in space can be marked on.
 *
 * <p>Split from the plane pass rather than folded into it, because three things
 * are genuinely different and pretending otherwise would have been the mistake.
 *
 * <p><b>Its own vocabulary.</b> Every relation named here is one that only
 * exists in space - `skew`, `coplanar`, a line perpendicular *to a plane*. That
 * is not modesty about scope: naming a 3D segment `AB` the way the plane pass
 * names a 2D one would make `parallel:AB,CD` mean either scene, and a mark
 * scheme could not say which figure it was asking about. Kinds unique to space
 * cannot be confused with kinds unique to the plane, so the names resolve.
 *
 * <p><b>Its own scale.</b> The tolerance is relative to the figure, and a
 * snapshot can hold a small plane figure beside a large solid. Measuring one
 * against the other's yardstick would mark a correct construction wrong.
 *
 * <p><b>Its own idea of which points are the student's.</b> A cube carries
 * eight mesh vertices and a sphere carries hundreds; they are the instrument's
 * working, not points anybody placed, and marking them would bury a figure's
 * real facts under its triangulation.
 *
 * <p>Not here: `inscribed`. It is not one relation but a family - a solid whose
 * vertices lie on another's surface, a solid whose faces touch another's - and
 * each needs its own definition. Worse, a solid in this model is a mesh: the
 * "surface" of a sphere is a polyhedral approximation of one, so a tolerance
 * story for touching it would be a story about how finely it was sampled rather
 * than about the geometry. That is a decision about the solid model, not about
 * marking.
 */

/** The fewest points worth calling coplanar: any three of them always are. */
const MIN_COPLANAR_POINTS = 4;

/**
 * Adds every fact space can establish to `facts`, and says whether it had to
 * stop early.
 */
export function computeGeometry3DInvariants(
  scene: GeometryScene3D | undefined,
  facts: Facts,
  budget: Budget,
): boolean {
  if (!scene) return false;

  const machinery = meshPointIds(scene.entities ?? {});
  const all = namedPoints3D(scene.points ?? {}, machinery);
  const points = all.slice(0, MAX_POINTS);
  let truncated = all.length > MAX_POINTS;

  const planes = Object.values(scene.workPlanes ?? {})
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(readPlane)
    .filter((plane): plane is Plane => plane !== null);

  const lines = Object.values(scene.entities ?? {})
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((entity) => readLine(entity, scene.points ?? {}))
    .filter((line): line is Line => line !== null);

  // Wide enough to cover the whole figure: a plane is placed at an origin, and
  // a figure of two points beside a distant plane is still one figure.
  const scale = boundingDiagonal([...points, ...planes.map((plane) => plane.origin)]);
  if (scale < MIN_FIGURE_SIZE) return truncated;
  const epsilon = scale * RELATIVE_TOLERANCE;

  pointsOnPlanes(points, planes, epsilon, facts, budget);
  planePairs(planes, facts);
  linesAgainstPlanes(lines, planes, facts, budget);
  if (!skewLines(lines, epsilon, facts, budget)) truncated = true;

  return truncated;
}

/* -------------------------------------------------------------------------- */
/* Reading the scene                                                          */
/* -------------------------------------------------------------------------- */

interface NamedPoint3D {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface Plane {
  readonly id: string;
  readonly name: string;
  readonly origin: { x: number; y: number; z: number };
  /** Unit length, so a dot product against another one is a cosine. */
  readonly normal: { x: number; y: number; z: number };
}

interface Line {
  readonly name: string;
  readonly from: NamedPoint3D;
  readonly direction: { x: number; y: number; z: number };
  readonly length: number;
}

/**
 * The points a solid or a cross-section brought with it.
 *
 * <p>Nobody placed a cube's eight corners; the cube did. Marking them would
 * report a solid's triangulation as though it were a construction, and on a
 * sphere it would report several hundred of them.
 */
function meshPointIds(entities: Record<string, GeometryEntity3D>): Set<string> {
  const owned = new Set<string>();
  for (const entity of Object.values(entities)) {
    if (entity.kind !== 'solid' && entity.kind !== 'crossSection') continue;
    for (const id of entity.pointIds ?? []) owned.add(id);
  }
  return owned;
}

function namedPoints3D(
  points: Record<string, GeometryPoint3D>,
  machinery: ReadonlySet<string>,
): NamedPoint3D[] {
  return Object.values(points)
    .filter((point) => point.kind === 'point3d'
      && !machinery.has(point.id)
      && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z))
    .map((point) => ({
      id: point.id,
      name: geometryInvariantPointName(point),
      x: point.x,
      y: point.y,
      z: point.z,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function readPlane(plane: WorkPlane3D): Plane | null {
  const raw = plane.equation
    ? { x: plane.equation.a, y: plane.equation.b, z: plane.equation.c }
    : { x: plane.normal[0], y: plane.normal[1], z: plane.normal[2] };
  const length = Math.hypot(raw.x, raw.y, raw.z);
  if (!Number.isFinite(length) || length < MIN_FIGURE_SIZE) return null;
  const origin = { x: plane.origin[0], y: plane.origin[1], z: plane.origin[2] };
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y) || !Number.isFinite(origin.z)) return null;
  return {
    id: plane.id,
    name: geometryInvariantObjectName('plane', plane),
    origin,
    normal: { x: raw.x / length, y: raw.y / length, z: raw.z / length },
  };
}

function readLine(entity: GeometryEntity3D, points: Record<string, GeometryPoint3D>): Line | null {
  if (entity.kind !== 'segment' && entity.kind !== 'line' && entity.kind !== 'ray'
    && entity.kind !== 'vector') {
    return null;
  }
  const from = points[entity.pointIds[0] ?? ''];
  const to = points[entity.pointIds[1] ?? ''];
  if (!from || !to || from.kind !== 'point3d' || to.kind !== 'point3d') return null;
  const direction = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(length) || length < MIN_FIGURE_SIZE) return null;
  return {
    // The same two-point naming the plane pass uses, which is what a teacher
    // writes; the relation kinds are what keep the two scenes apart.
    name: [geometryInvariantPointName(from), geometryInvariantPointName(to)].sort().join(''),
    from: { id: from.id, name: geometryInvariantPointName(from), x: from.x, y: from.y, z: from.z },
    direction,
    length,
  };
}

/* -------------------------------------------------------------------------- */
/* Points and planes                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Which points lie on which planes, and which sets of them are therefore
 * coplanar.
 *
 * <p>`coplanar` is stated for the *whole* set of points on a plane rather than
 * for every four of them, because a plane with ten points on it has two hundred
 * and ten four-element subsets and stating them all would fill a report with
 * one fact restated. Goal checking knows that coplanarity is closed under
 * subsets, so an author asking about four of the ten still marks.
 *
 * <p>Points coplanar on a plane that is <em>not</em> in the figure are not
 * reported, for the same reason concyclic points without a circle are not:
 * finding them is a search over triples of points for the plane they span,
 * which is the cost the bucketing work exists to remove.
 */
function pointsOnPlanes(
  points: readonly NamedPoint3D[],
  planes: readonly Plane[],
  epsilon: number,
  facts: Facts,
  budget: Budget,
): void {
  for (const plane of planes) {
    if (facts.full) return;
    if (!budget.spend(points.length)) return;
    const on: string[] = [];
    for (const point of points) {
      const offset = (point.x - plane.origin.x) * plane.normal.x
        + (point.y - plane.origin.y) * plane.normal.y
        + (point.z - plane.origin.z) * plane.normal.z;
      if (Math.abs(offset) > epsilon) continue;
      on.push(point.name);
      facts.add(`point-on-plane:${point.name},${plane.name}`);
    }
    if (on.length >= MIN_COPLANAR_POINTS) {
      facts.add(`coplanar:${on.slice().sort().join(',')}`);
    }
  }
}

/** Planes that face the same way, and planes that meet at a right angle. */
function planePairs(planes: readonly Plane[], facts: Facts): void {
  // Few enough that bucketing would cost more than it saved; a figure with
  // hundreds of work planes is not one anybody builds.
  for (let left = 0; left < planes.length; left += 1) {
    for (let right = left + 1; right < planes.length; right += 1) {
      if (facts.full) return;
      const one = planes[left] as Plane;
      const other = planes[right] as Plane;
      const cosine = dot(one.normal, other.normal);
      if (Math.abs(Math.abs(cosine) - 1) <= 1 - Math.cos(ANGULAR_TOLERANCE)) {
        facts.add(`parallel-planes:${pair(one.name, other.name)}`);
      } else if (Math.abs(cosine) <= RELATIVE_TOLERANCE) {
        facts.add(`perpendicular-planes:${pair(one.name, other.name)}`);
      }
    }
  }
}

/**
 * A line standing on a plane, or lying along one.
 *
 * <p>Perpendicular to a plane means parallel to its normal, and parallel to a
 * plane means perpendicular to it - which is why both come out of one dot
 * product, and why getting the two the wrong way round would be so easy to do
 * and so hard to notice.
 */
function linesAgainstPlanes(
  lines: readonly Line[],
  planes: readonly Plane[],
  facts: Facts,
  budget: Budget,
): void {
  if (planes.length === 0) return;
  for (const line of lines) {
    if (facts.full) return;
    if (!budget.spend(planes.length)) return;
    for (const plane of planes) {
      const cosine = dot(line.direction, plane.normal) / line.length;
      if (Math.abs(Math.abs(cosine) - 1) <= 1 - Math.cos(ANGULAR_TOLERANCE)) {
        facts.add(`perpendicular-to-plane:${line.name},${plane.name}`);
      } else if (Math.abs(cosine) <= RELATIVE_TOLERANCE) {
        facts.add(`parallel-to-plane:${line.name},${plane.name}`);
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Skew lines                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Two lines that neither meet nor run alongside each other - the relation that
 * only exists once there is a third dimension to miss in.
 *
 * <p>Scanned rather than bucketed, and that is worth being straight about: an
 * earlier note in the plan said skewness would be a bucket lookup, and it is
 * not. Bucketing finds pairs whose measurements *agree*; skewness is what is
 * left when they disagree in two different ways at once, and almost every pair
 * qualifies. What bucketing does give is the parallel test used to rule pairs
 * out - and a figure with enough lines in space for a quadratic scan to matter
 * would have to be enormous, so the scan carries a work budget instead.
 */
function skewLines(
  lines: readonly Line[],
  epsilon: number,
  facts: Facts,
  budget: Budget,
): boolean {
  // Parallel pairs are found by bucketing and then excluded, so the scan below
  // is only about whether the rest of them meet.
  const parallel = new Set<string>();
  const buckets = new ToleranceBuckets<Line>(ANGULAR_TOLERANCE, Math.PI);
  for (const line of lines) {
    // A bearing in the plane the direction leans hardest into: two directions
    // that are genuinely parallel share it, which is all the filter needs.
    const angle = Math.atan2(line.direction.y, line.direction.x);
    buckets.add(((angle % Math.PI) + Math.PI) % Math.PI, line);
  }
  buckets.eachPair((one, other) => {
    if (isParallel3D(one, other)) parallel.add(pair(one.name, other.name));
    return true;
  });

  for (let left = 0; left < lines.length; left += 1) {
    const one = lines[left] as Line;
    if (!budget.spend(lines.length - left - 1)) return false;
    for (let right = left + 1; right < lines.length; right += 1) {
      if (facts.full) return true;
      const other = lines[right] as Line;
      const key = pair(one.name, other.name);
      if (one.name === other.name || parallel.has(key)) continue;
      if (meet(one, other, epsilon)) continue;
      facts.add(`skew:${key}`);
    }
  }
  return true;
}

function isParallel3D(one: Line, other: Line): boolean {
  const cross = crossProduct(one.direction, other.direction);
  const magnitude = one.length * other.length;
  if (magnitude < MIN_FIGURE_SIZE) return false;
  return Math.hypot(cross.x, cross.y, cross.z) / magnitude <= RELATIVE_TOLERANCE;
}

/**
 * Whether two non-parallel lines in space cross.
 *
 * <p>The volume of the box spanned by the two directions and the gap between
 * the lines: zero exactly when all three lie in one plane, which for
 * non-parallel lines is exactly when they meet. Divided by the box's own
 * cross-sectional area, so the answer is a distance and can be compared against
 * a distance tolerance - the same relative-not-absolute rule the whole file
 * follows.
 */
function meet(one: Line, other: Line, epsilon: number): boolean {
  const between = {
    x: other.from.x - one.from.x,
    y: other.from.y - one.from.y,
    z: other.from.z - one.from.z,
  };
  const normal = crossProduct(one.direction, other.direction);
  const area = Math.hypot(normal.x, normal.y, normal.z);
  if (area < MIN_FIGURE_SIZE) return true;
  return Math.abs(dot(between, normal)) / area <= epsilon;
}

/* -------------------------------------------------------------------------- */

function dot(
  one: { x: number; y: number; z: number },
  other: { x: number; y: number; z: number },
): number {
  return one.x * other.x + one.y * other.y + one.z * other.z;
}

function crossProduct(
  one: { x: number; y: number; z: number },
  other: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  return {
    x: one.y * other.z - one.z * other.y,
    y: one.z * other.x - one.x * other.z,
    z: one.x * other.y - one.y * other.x,
  };
}
