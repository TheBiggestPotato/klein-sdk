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
  for (const invariant of report.invariants) established.add(reader(invariant).canonical);

  for (const target of targetInvariants) {
    // Reported back in the goal's spelling rather than the reporter's, so an
    // author reads their own mark scheme rather than this file's conventions.
    (established.has(reader(target).canonical) ? met : missing).push(target);
  }

  const extra: GeometryInvariantId[] = [];
  // A goal that names no objects puts nothing in scope, so there is nothing to
  // scan for; this is also the empty-goal case, which is the common one.
  if (goalObjects.size > 0) {
    for (const invariant of report.invariants) {
      const read = reader(invariant);
      if (required.has(read.canonical)) continue;
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
  const splits = new Map<string, string[] | null>();

  const split = (text: string, count: number): string[] | null => {
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
  split: (text: string, count: number) => string[] | null,
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
      const first = split(parts[0] as string, 2);
      const second = split(parts[1] as string, 2);
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
      const segmented = split(args, 3);
      if (!segmented) return literal();
      const [first, vertex, third] = segmented as [string, string, string];
      const arms = [first, third].sort();
      return { canonical: `${kind}:${arms[0]}${vertex}${arms[1]}`, objects: segmented };
    }
    case 'collinear': {
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
      const between = split(parts[1] as string, 2);
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
    default:
      return literal();
  }
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
function segmentName(
  text: string,
  names: readonly string[],
  count: number,
): string[] | null {
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
  return found === 1 ? only : null;
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
