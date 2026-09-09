import type { GeometryPoint } from '../geometry-core/index.js';
import type { GeometryLabSnapshot } from './types.js';
import {
  computeGeometryInvariants,
  geometryInvariantPointName,
  type GeometryInvariantId,
  type GeometryInvariantReport,
} from './gradable-invariants.js';

/**
 * Marking a construction against what it was asked to be.
 *
 * <p>`computeGeometryInvariants` states what a figure *is*. On its own that
 * marks: a scorer holding a list of required facts can check them off. It
 * cannot teach, because it never says what is **absent**, and absence is the
 * whole of a hint — "you have the equal segments, you have not made them
 * perpendicular" is a lesson, while "here are nineteen facts about your
 * drawing" is not.
 *
 * <p>The comparison looks like set difference and is not, for two reasons.
 *
 * <p><b>A goal is written by a person.</b> A mark scheme says
 * `equal-segments:MB,AM`; the reporter emits `equal-segments:AM,BM`. Both name
 * the same fact. The reporter's spellings are canonical only by accident of
 * how its loops are nested, so both sides are put through the same
 * canonicaliser here rather than the goal being expected to guess.
 *
 * <p><b>A missing fact is not the same as a false one.</b>
 * `computeGeometryInvariants` bounds its own work and says so, and a fact that
 * fell off the end of a truncated report has not been checked. Reporting it as
 * missing would tell a child to fix something that may already be right, so
 * this says `incomplete` instead.
 */

export interface GeometryGoalCheck {
  /** Every required fact was established. */
  readonly satisfied: boolean;
  /** Required facts the figure has, in the goal's own spelling. */
  readonly met: readonly GeometryInvariantId[];
  /** Required facts the figure does not have, in the goal's own spelling. */
  readonly missing: readonly GeometryInvariantId[];
  /**
   * Established facts about the goal's own objects that it did not ask for.
   *
   * <p>Restricted to the objects named in the goal on purpose. Any figure
   * satisfies dozens of incidental relations, and a tutor that recites them is
   * noise; a relation between the very points the exercise is about is worth
   * saying, because it is usually how the child got there.
   */
  readonly extra: readonly GeometryInvariantId[];
  /**
   * True when something is missing *and* the report was truncated, so the
   * missing facts may simply never have been checked.
   */
  readonly incomplete: boolean;
  /** The tolerance the answer was established at, so a mark can be explained. */
  readonly relativeTolerance: number;
}

/**
 * Checks a figure against the facts it was asked to establish.
 *
 * <p>Takes a report as well as a snapshot, because computing one is the
 * expensive part - cubic in the number of points - and a caller that already
 * has a report for the same figure must not be made to pay for it twice.
 */
export function checkGeometryGoal(
  snapshot: GeometryLabSnapshot,
  targetInvariants: readonly GeometryInvariantId[],
  report: GeometryInvariantReport = computeGeometryInvariants(snapshot),
): GeometryGoalCheck {
  const reader = invariantReader(pointNames(snapshot));

  const met: GeometryInvariantId[] = [];
  const missing: GeometryInvariantId[] = [];
  const required = new Set<string>();
  const goalObjects = new Set<string>();
  for (const target of targetInvariants) {
    const read = reader(target);
    required.add(read.canonical);
    for (const object of read.objects) goalObjects.add(object);
  }

  const established = new Set<string>();
  const closed = new Map<string, Set<string>[]>();
  for (const invariant of report.invariants) {
    const canonical = reader(invariant).canonical;
    established.add(canonical);
    const listed = subsetClosed(canonical);
    if (listed) {
      const existing = closed.get(listed.kind);
      if (existing) existing.push(listed.members);
      else closed.set(listed.kind, [listed.members]);
    }
  }

  for (const target of targetInvariants) {
    // Reported back in the goal's spelling rather than the reporter's, so an
    // author reads their own mark scheme rather than this file's conventions.
    const canonical = reader(target).canonical;
    (established.has(canonical) || containedInClosed(canonical, closed) ? met : missing).push(target);
  }

  const extra: GeometryInvariantId[] = [];
  // A goal that names no objects puts nothing in scope, so there is nothing to
  // scan for; this is also the empty-goal case, which is the common one.
  if (goalObjects.size > 0) {
    for (const invariant of report.invariants) {
      const read = reader(invariant);
      if (required.has(read.canonical) || answersAClosedGoal(read.canonical, required)) continue;
      // An invariant whose objects cannot be read is left out rather than
      // guessed at: it would be reported against an exercise it may not concern.
      if (read.objects.length === 0) continue;
      if (read.objects.every((object) => goalObjects.has(object))) extra.push(invariant);
    }
  }

  return {
    satisfied: missing.length === 0,
    met,
    missing,
    extra: extra.sort(),
    incomplete: missing.length > 0 && report.truncated,
    relativeTolerance: report.relativeTolerance,
  };
}

/* -------------------------------------------------------------------------- */
/* Relations that hold of every subset                                        */
/* -------------------------------------------------------------------------- */

/**
 * Kinds where naming more points than were asked about still answers the
 * question.
 *
 * <p>Four points on a circle are concyclic, and so is any three of them; the
 * same is true of coplanarity and of collinearity. The reporter states the
 * <b>whole</b> set of points on a circle or a plane rather than every subset,
 * because a circle with ten points on it has two hundred and ten four-element
 * subsets and listing them would fill a report with one fact restated. That
 * only works if a mark scheme asking about four of the ten still marks, which
 * is what this is.
 *
 * <p>Not every relation is like this - three equal segments do not make any two
 * of them "the pair that was asked for" in the same sense - so the rule is a
 * list rather than a default.
 */
const SUBSET_CLOSED_KINDS = new Set(['collinear', 'concyclic', 'coplanar']);

function subsetClosed(canonical: string): { kind: string; members: Set<string> } | null {
  const colon = canonical.indexOf(':');
  if (colon < 0) return null;
  const kind = canonical.slice(0, colon);
  if (!SUBSET_CLOSED_KINDS.has(kind)) return null;
  return { kind, members: new Set(canonical.slice(colon + 1).split(',')) };
}

/** Whether a goal names a subset of something the figure established. */
function containedInClosed(canonical: string, closed: Map<string, Set<string>[]>): boolean {
  const goal = subsetClosed(canonical);
  if (!goal) return false;
  for (const established of closed.get(goal.kind) ?? []) {
    let all = true;
    for (const member of goal.members) {
      if (!established.has(member)) { all = false; break; }
    }
    if (all) return true;
  }
  return false;
}

/**
 * Whether an established fact is the one a subset goal was asking for, and so
 * is not something the figure has "as well".
 */
function answersAClosedGoal(canonical: string, required: ReadonlySet<string>): boolean {
  const fact = subsetClosed(canonical);
  if (!fact) return false;
  for (const target of required) {
    const goal = subsetClosed(target);
    if (!goal || goal.kind !== fact.kind) continue;
    let all = true;
    for (const member of goal.members) {
      if (!fact.members.has(member)) { all = false; break; }
    }
    if (all) return true;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Reading an invariant id                                                    */
/* -------------------------------------------------------------------------- */

interface ReadInvariant {
  /** One spelling per fact, so two ways of writing it compare equal. */
  readonly canonical: string;
  /** The points the fact is about, or none when they cannot be read. */
  readonly objects: readonly string[];
}

/**
 * Reads ids against one figure's point names, remembering what it has seen.
 *
 * <p>Both halves of the answer come from the same parse. Splitting them into
 * two functions read every id twice, which made checking a goal cost more than
 * computing the invariants it checks - the reporter's scan is bounded at
 * twenty-four points and this is not bounded at all. The memo matters for the
 * same reason: a figure's invariants name the same few segments over and over.
 */
function invariantReader(names: readonly string[]): (id: GeometryInvariantId) => ReadInvariant {
  const seen = new Map<string, ReadInvariant>();
  const splits = new Map<string, Segmentation>();

  const split = (text: string, count: number): Segmentation => {
    const key = `${count}\u0000${text}`;
    const cached = splits.get(key);
    if (cached !== undefined) return cached;
    const computed = segmentName(text, names, count);
    splits.set(key, computed);
    return computed;
  };

  return (id: GeometryInvariantId): ReadInvariant => {
    const cached = seen.get(id);
    if (cached) return cached;
    const read = readInvariant(id, names, split);
    seen.set(id, read);
    return read;
  };
}

/**
 * <p>An id is `kind:arguments`, and what the arguments mean is per kind: which
 * of them are unordered, and which are several point names run together. Only
 * the kinds this instrument emits are understood; anything else is returned
 * untouched and therefore compared literally, which is the right answer for a
 * vocabulary this does not know rather than a wrong one.
 */
function readInvariant(
  invariant: GeometryInvariantId,
  names: readonly string[],
  split: (text: string, count: number) => Segmentation,
): ReadInvariant {
  const trimmed = invariant.trim();
  const colon = trimmed.indexOf(':');
  if (colon < 0) return { canonical: trimmed, objects: [] };
  const kind = trimmed.slice(0, colon);
  const args = trimmed.slice(colon + 1);
  const literal = (): ReadInvariant => ({ canonical: trimmed, objects: [] });

  switch (kind) {
    case 'equal-segments':
    case 'parallel':
    case 'perpendicular': {
      // Two two-point objects, neither the objects nor their ends ordered.
      const parts = args.split(',');
      if (parts.length !== 2) return literal();
      const first = readable(split(parts[0] as string, 2));
      const second = readable(split(parts[1] as string, 2));
      if (!first || !second) return literal();
      const one = joined(first);
      const other = joined(second);
      return {
        canonical: `${kind}:${one <= other ? `${one},${other}` : `${other},${one}`}`,
        objects: [...first, ...second],
      };
    }
    case 'right-angle': {
      // `ABC` is the angle at B, and reading it backwards is the same angle.
      const segmented = readable(split(args, 3));
      if (!segmented) return literal();
      const [first, vertex, third] = segmented as [string, string, string];
      const arms = [first, third].sort();
      return { canonical: `${kind}:${arms[0]}${vertex}${arms[1]}`, objects: segmented };
    }
    case 'collinear':
    case 'concyclic':
    case 'coplanar': {
      const parts = args.split(',').map((part) => part.trim());
      if (parts.length < 2) return literal();
      return {
        canonical: `${kind}:${parts.slice().sort().join(',')}`,
        objects: parts.every((part) => names.includes(part)) ? parts : [],
      };
    }
    case 'midpoint': {
      // `M,AB`: the midpoint, then the pair it sits between.
      const parts = args.split(',');
      if (parts.length !== 2) return literal();
      const middle = (parts[0] as string).trim();
      const between = readable(split(parts[1] as string, 2));
      if (!between) return literal();
      return {
        canonical: `${kind}:${middle},${joined(between)}`,
        objects: names.includes(middle) ? [middle, ...between] : [],
      };
    }
    case 'point-on-circle': {
      // Both arguments are already single names, and the circle is named for
      // its centre - which is a point in the figure, so it is in scope too.
      const parts = args.split(',').map((part) => part.trim());
      if (parts.length !== 2) return literal();
      const point = parts[0] as string;
      return { canonical: trimmed, objects: names.includes(point) ? [point] : [] };
    }
    case 'point-on': {
      // `P,AB`: the point, then the object it lies on, whose ends are unordered.
      const parts = args.split(',');
      if (parts.length !== 2) return literal();
      const point = (parts[0] as string).trim();
      const on = readable(split(parts[1] as string, 2));
      if (!on) return literal();
      return {
        canonical: `${kind}:${point},${joined(on)}`,
        objects: names.includes(point) ? [point, ...on] : [],
      };
    }
    case 'tangent': {
      // `AB,circle(O)`: a two-point object, then a circle named for its centre.
      const parts = args.split(',');
      if (parts.length !== 2) return literal();
      const line = readable(split(parts[0] as string, 2));
      if (!line) return literal();
      return { canonical: `${kind}:${joined(line)},${(parts[1] as string).trim()}`, objects: line };
    }
    case 'equal-angles': {
      // Two angles, each written vertex-in-the-middle and each reversible.
      const parts = args.split(',');
      if (parts.length !== 2) return literal();
      const first = angleName(parts[0] as string, split);
      const second = angleName(parts[1] as string, split);
      if (first === null || second === null) return literal();
      return {
        canonical: `${kind}:${first.canonical <= second.canonical
          ? `${first.canonical},${second.canonical}`
          : `${second.canonical},${first.canonical}`}`,
        objects: [...first.objects, ...second.objects],
      };
    }
    case 'congruent':
    case 'similar':
    case 'equal-area': {
      // Two polygons, each named by its corners in no particular order and of
      // no particular number - a quadrilateral has equal area to a triangle
      // just as readily.
      const parts = args.split(',');
      if (parts.length !== 2) return literal();
      const first = corners(parts[0] as string, split);
      const second = corners(parts[1] as string, split);
      if (!first || !second) return literal();
      const one = first.slice().sort().join('');
      const other = second.slice().sort().join('');
      return {
        canonical: `${kind}:${one <= other ? `${one},${other}` : `${other},${one}`}`,
        objects: [...first, ...second],
      };
    }
    default:
      return literal();
  }
}

/** `ABC` and `CBA` are the same angle: the vertex stays, the arms sort. */
function angleName(
  text: string,
  split: (value: string, count: number) => Segmentation,
): { canonical: string; objects: string[] } | null {
  const segmented = readable(split(text, 3));
  if (!segmented) return null;
  const [first, vertex, third] = segmented as [string, string, string];
  const arms = [first, third].sort();
  return { canonical: `${arms[0]}${vertex}${arms[1]}`, objects: segmented };
}

/**
 * The corners of a polygon, whose number the name does not say.
 *
 * <p>Every plausible corner count is tried and the reading is accepted only if
 * exactly one of them works - the same refusal as an ambiguous two-point name,
 * for the same reason.
 */
function corners(
  text: string,
  split: (value: string, count: number) => Segmentation,
): string[] | null {
  let only: string[] | null = null;
  for (let count = 3; count <= 12; count += 1) {
    const segmented = split(text, count);
    // A corner count that reads two ways is a refusal outright: another count
    // reading cleanly does not make the name unambiguous, it just means this
    // loop looked somewhere else.
    if (segmented === 'ambiguous') return null;
    if (segmented === null) continue;
    if (only) return null;
    only = segmented;
  }
  return only;
}

/** The one reading, or nothing when there was none or more than one. */
function readable(segmentation: Segmentation): string[] | null {
  return Array.isArray(segmentation) ? segmentation : null;
}

/** `BA` and `AB` both become `AB`. */
function joined(segmented: readonly string[]): string {
  return segmented.slice().sort().join('');
}

/**
 * Splits run-together point names apart - `AMB` into `A`, `M`, `B`.
 *
 * <p>The invariant grammar concatenates names without a separator, which is
 * readable for the single letters a mark scheme uses and ambiguous in general:
 * with points named `B`, `C`, `BC` and `CA` in the same figure, `BCA` can be
 * read two ways. Rather than pick one, an ambiguous name is refused, and the
 * caller falls back to comparing the id literally. Guessing would silently
 * credit the wrong segment.
 */
type Segmentation = string[] | 'ambiguous' | null;

function segmentName(
  text: string,
  names: readonly string[],
  count: number,
): Segmentation {
  const target = text.trim();
  let only: string[] | null = null;
  let found = 0;

  const walk = (offset: number, taken: string[]): void => {
    // Two readings are already one too many; there is no point finding more.
    if (found > 1) return;
    if (taken.length === count) {
      if (offset === target.length) {
        found += 1;
        if (found === 1) only = taken.slice();
      }
      return;
    }
    for (const name of names) {
      if (name.length === 0) continue;
      if (!target.startsWith(name, offset)) continue;
      taken.push(name);
      walk(offset + name.length, taken);
      taken.pop();
      if (found > 1) return;
    }
  };

  walk(0, []);
  if (found === 1) return only;
  return found > 1 ? 'ambiguous' : null;
}

function pointNames(snapshot: GeometryLabSnapshot): string[] {
  const points: Record<string, GeometryPoint> = snapshot.scene.scene2d.points ?? {};
  const names = new Set<string>();
  for (const point of Object.values(points)) {
    if (point.kind !== 'point2d') continue;
    names.add(geometryInvariantPointName(point));
  }
  // Longest first, so a greedy reader meets `AB` before `A`; the ambiguity
  // check does not depend on the order, but the common case terminates sooner.
  return [...names].sort((left, right) => right.length - left.length || left.localeCompare(right));
}
