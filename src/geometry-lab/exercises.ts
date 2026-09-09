import { checkGeometryGoal, type GeometryGoalCheck } from './goal-check.js';
import { detectGeometryConjectures } from './conjectures.js';
import { computeGeometryInvariants, type GeometryInvariantId } from './gradable-invariants.js';
import type { GeometryLabSnapshot, GeometryLabTool } from './types.js';

/**
 * An exercise as something a program can act on.
 *
 * <p>The bank was good content in a dead format: prose a teacher reads aloud,
 * with no way to say what a correct answer establishes, what tools are in
 * scope, what to say to a child who is stuck, or what to give them next. This
 * is the same content with those four things written down.
 *
 * <p><b>An exercise carries an answer key</b> - the facts a finished figure has
 * to establish - and that is why nothing here goes anywhere near
 * `src/assessment`, whose whole type-level machinery exists to keep answers off
 * a learner-facing surface. {@link learnerGeometryExercise} is the projection
 * that is safe to hand a student: the prompt, the tools, and the hints that
 * have actually been asked for, with the key and the unspent ladder left
 * behind.
 *
 * <p>Not every activity has a key. "Build a shape garden" is a real exercise
 * and there is no invariant that says a garden is finished. Those carry an
 * empty target and are marked by a person, which is stated in the type rather
 * than worked around by inventing facts nobody meant.
 */

export type GeometryExerciseLevel =
  | 'ages-7-10'
  | 'ages-10-13'
  | 'ages-13-16'
  | 'ages-16-plus'
  | 'three-dimensional'
  | 'classroom';

/**
 * One rung of a hint ladder.
 *
 * <p>Ordered from a nudge towards the answer - "check the distance from M to
 * each end" before "use the circle tool centred on A". A rung tied to a fact is
 * only offered while that fact is missing, which is what makes the ladder
 * respond to the figure in front of the child rather than to a counter.
 */
export interface GeometryExerciseHint {
  /** 1 is the gentlest. Ties are broken by the order they are written in. */
  readonly rung: number;
  readonly text: string;
  /** Offered only while this fact is absent. Absent means "any time". */
  readonly forInvariant?: GeometryInvariantId;
}

/** One line of a mark scheme, and the facts that decide it. */
export interface GeometryExerciseCriterion {
  readonly id: string;
  readonly description: string;
  /** Facts that must all hold. Empty means a person has to judge it. */
  readonly requires: readonly GeometryInvariantId[];
  readonly points: number;
}

export interface GeometryExercise {
  readonly id: string;
  readonly title: string;
  readonly level: GeometryExerciseLevel;
  readonly goal: string;
  readonly view: '2d' | '3d';
  /** The numbered steps, as a child reads them. */
  readonly task: readonly string[];
  readonly questions: readonly string[];
  readonly extension?: string;
  /** The tools the exercise is about, so a host can offer those and not forty. */
  readonly tools: readonly GeometryLabTool[];
  /**
   * What a finished figure has to establish. Empty for an open activity, which
   * is a statement about the activity and not an omission.
   */
  readonly target: readonly GeometryInvariantId[];
  /**
   * Whether the target has to survive the figure being moved.
   *
   * <p>The difference between "construct the perpendicular bisector" and "put a
   * point where it looks about right". Set on the exercises that are about
   * constructing rather than about drawing; it makes marking cost several
   * recomputations, which is why it is not simply always on.
   */
  readonly requireConstruction?: boolean;
  readonly hints: readonly GeometryExerciseHint[];
  readonly rubric: readonly GeometryExerciseCriterion[];
  /** Exercises that should be finished first. */
  readonly prerequisites?: readonly string[];
}

/* -------------------------------------------------------------------------- */
/* What a learner may see                                                     */
/* -------------------------------------------------------------------------- */

/** An exercise with the answer key and the unspent hints removed. */
export interface GeometryExerciseTask {
  readonly id: string;
  readonly title: string;
  readonly level: GeometryExerciseLevel;
  readonly goal: string;
  readonly view: '2d' | '3d';
  readonly task: readonly string[];
  readonly questions: readonly string[];
  readonly extension?: string;
  readonly tools: readonly GeometryLabTool[];
  /** Only the hints that were actually asked for. */
  readonly hints: readonly string[];
  /** How many more there are, so a host can say "one hint left". */
  readonly hintsRemaining: number;
}

/**
 * The half of an exercise that is safe to send to a student.
 *
 * <p>`released` is the hint text they have already been given; anything beyond
 * it stays on the server. Passing the whole ladder and trusting the client to
 * show one rung would put the answer in the page.
 */
export function learnerGeometryExercise(
  exercise: GeometryExercise,
  released: readonly string[] = [],
): GeometryExerciseTask {
  const shown = exercise.hints.filter((hint) => released.includes(hint.text));
  const task: GeometryExerciseTask = {
    id: exercise.id,
    title: exercise.title,
    level: exercise.level,
    goal: exercise.goal,
    view: exercise.view,
    task: exercise.task,
    questions: exercise.questions,
    tools: exercise.tools,
    hints: shown.map((hint) => hint.text),
    hintsRemaining: exercise.hints.length - shown.length,
  };
  return exercise.extension === undefined ? task : { ...task, extension: exercise.extension };
}

/* -------------------------------------------------------------------------- */
/* The hint ladder                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The next thing to say to a child who is stuck.
 *
 * <p>Chosen from the figure rather than from a counter: the goal check says
 * which facts are absent, and the gentlest unspent rung that speaks to one of
 * them is the one to give. A child who has the equal halves but not the right
 * angle is told about the right angle, not about halves they already have.
 *
 * <p>Falls back to the gentlest unspent rung that is not tied to any fact -
 * the general encouragement a ladder ends with - and to nothing at all when the
 * ladder is spent, which a host should show as "no more hints" rather than as
 * an error.
 */
export function nextGeometryHint(
  exercise: GeometryExercise,
  snapshot: GeometryLabSnapshot,
  released: readonly string[] = [],
): GeometryExerciseHint | null {
  const unspent = exercise.hints
    .filter((hint) => !released.includes(hint.text))
    .sort((left, right) => left.rung - right.rung);
  if (unspent.length === 0) return null;

  const missing = new Set(
    exercise.target.length === 0
      ? []
      : checkGeometryGoal(snapshot, exercise.target).missing,
  );
  const pointed = unspent.find(
    (hint) => hint.forInvariant !== undefined && missing.has(hint.forInvariant),
  );
  if (pointed) return pointed;

  // Nothing is missing that a rung speaks to. A general rung still helps -
  // "check your labels" - but a rung about a fact the child already has does
  // not, and offering it would read as the tutor not looking at the figure.
  return unspent.find((hint) => hint.forInvariant === undefined) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Marking                                                                    */
/* -------------------------------------------------------------------------- */

export interface GeometryExerciseCriterionResult {
  readonly id: string;
  readonly description: string;
  readonly points: number;
  /** Null when the criterion names no facts and a person has to judge it. */
  readonly met: boolean | null;
  readonly missing: readonly GeometryInvariantId[];
}

export interface GeometryExerciseMark {
  readonly exerciseId: string;
  /** Every required fact holds. Null when nothing about it can be decided here. */
  readonly satisfied: boolean | null;
  readonly missing: readonly GeometryInvariantId[];
  /**
   * Facts the exercise asked for that hold only where the figure was left.
   *
   * <p>Populated only for an exercise that asks for a construction. A student
   * who dragged a point until it looked right has these and not a construction,
   * and telling them so is the most useful thing marking can do.
   */
  readonly coincidental: readonly GeometryInvariantId[];
  readonly criteria: readonly GeometryExerciseCriterionResult[];
  readonly points: number;
  readonly maxPoints: number;
  /** Points a person still has to award, because their criteria name no facts. */
  readonly pointsAwaitingJudgement: number;
  /** True when the marking was bounded and might have missed something. */
  readonly incomplete: boolean;
}

/** Marks a figure against an exercise. */
export function markGeometryExercise(
  exercise: GeometryExercise,
  snapshot: GeometryLabSnapshot,
): GeometryExerciseMark {
  const report = computeGeometryInvariants(snapshot);
  const held = new Set(
    exercise.target.length === 0
      ? report.invariants
      : checkGeometryGoal(snapshot, exercise.target, report).met,
  );

  // A construction exercise is marked on what survives the figure moving, so a
  // fact that only holds where it was left does not count towards it.
  let coincidental: GeometryInvariantId[] = [];
  let goal: GeometryGoalCheck | null = null;
  if (exercise.target.length > 0) {
    goal = checkGeometryGoal(snapshot, exercise.target, report);
    if (exercise.requireConstruction === true) {
      const conjectures = detectGeometryConjectures(snapshot);
      const survived = new Set(conjectures.invariant);
      const settled = new Set([...conjectures.invariant, ...conjectures.coincidental]);
      coincidental = goal.met.filter((fact) => settled.has(fact) && !survived.has(fact));
      for (const fact of coincidental) held.delete(fact);
    }
  }

  const missing = goal === null
    ? []
    : [...goal.missing, ...coincidental].sort();

  const criteria = exercise.rubric.map((criterion) => {
    if (criterion.requires.length === 0) {
      return {
        id: criterion.id,
        description: criterion.description,
        points: criterion.points,
        met: null,
        missing: [],
      } satisfies GeometryExerciseCriterionResult;
    }
    const short = criterion.requires.filter((fact) => !held.has(fact));
    return {
      id: criterion.id,
      description: criterion.description,
      points: criterion.points,
      met: short.length === 0,
      missing: short,
    } satisfies GeometryExerciseCriterionResult;
  });

  return {
    exerciseId: exercise.id,
    satisfied: exercise.target.length === 0 ? null : missing.length === 0,
    missing,
    coincidental,
    criteria,
    points: criteria.reduce((total, result) => total + (result.met === true ? result.points : 0), 0),
    maxPoints: exercise.rubric.reduce((total, criterion) => total + criterion.points, 0),
    pointsAwaitingJudgement: criteria.reduce(
      (total, result) => total + (result.met === null ? result.points : 0),
      0,
    ),
    incomplete: goal?.incomplete ?? report.truncated,
  };
}

/* -------------------------------------------------------------------------- */
/* Sequencing                                                                 */
/* -------------------------------------------------------------------------- */

/** What a student has done with one exercise. */
export interface GeometryExerciseAttempt {
  readonly exerciseId: string;
  readonly satisfied: boolean;
  /** Hint text already given, which is what decides how much help was needed. */
  readonly hintsUsed?: number;
}

export interface GeometryExerciseProgress {
  readonly completed: readonly string[];
  /** Attempted and not finished. */
  readonly inProgress: readonly string[];
  /** Not started, and everything they depend on is done. */
  readonly available: readonly string[];
  /** Not started, and waiting on something. */
  readonly locked: readonly string[];
}

/**
 * Where a student is in a bank.
 *
 * <p>An exercise is available when everything it names as a prerequisite is
 * finished - which is all "mastery sequencing" needs to be here. How many
 * attempts count as mastery, and whether a hinted answer counts, are decisions
 * about a course rather than about geometry, so they belong to the host that
 * knows the course.
 */
export function geometryExerciseProgress(
  bank: readonly GeometryExercise[],
  attempts: readonly GeometryExerciseAttempt[],
): GeometryExerciseProgress {
  const best = new Map<string, boolean>();
  for (const attempt of attempts) {
    best.set(attempt.exerciseId, (best.get(attempt.exerciseId) ?? false) || attempt.satisfied);
  }

  const completed: string[] = [];
  const inProgress: string[] = [];
  const available: string[] = [];
  const locked: string[] = [];
  for (const exercise of bank) {
    const outcome = best.get(exercise.id);
    if (outcome === true) { completed.push(exercise.id); continue; }
    if (outcome === false) { inProgress.push(exercise.id); continue; }
    const ready = (exercise.prerequisites ?? []).every((id) => best.get(id) === true);
    (ready ? available : locked).push(exercise.id);
  }
  return { completed, inProgress, available, locked };
}
