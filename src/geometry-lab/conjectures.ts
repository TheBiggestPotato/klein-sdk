import type { GeometryPoint2D } from '../geometry-core/index.js';
import { canonicalizeGeometryLabSnapshot } from './canonicalize.js';
import {
  computeGeometryInvariants,
  RELATIVE_TOLERANCE,
  type GeometryInvariantId,
} from './gradable-invariants.js';
import type { GeometryLabSnapshot } from './types.js';

/**
 * Telling a construction from a coincidence.
 *
 * <p>`computeGeometryInvariants` reports what holds in the figure in front of
 * it. That cannot distinguish the two things a marker most needs to
 * distinguish: a midpoint that is a midpoint *because it was constructed as
 * one*, and a point a child nudged until the two halves looked equal. Both are
 * equally true of the configuration on screen, and only one is an answer to the
 * question.
 *
 * <p>Dynamic geometry answers this the way it has always been answered on a
 * screen: move the parts that are free to move, and see what survives. A
 * constructed midpoint follows its ends and stays a midpoint through every
 * configuration; a dragged one comes apart on the first nudge. So the free
 * points are perturbed several times over, the figure is recomputed each time
 * through the same canonicalisation an edit goes through - constraints and all
 * - and only the facts that hold in every configuration are reported as
 * established.
 *
 * <p><b>This is not free and does not belong on the interaction path.</b> It is
 * k recomputations of the whole figure plus k markings of it, which is
 * milliseconds, not microseconds. It belongs where a marker asks a question -
 * an idle callback, a worker, the moment a student presses "check" - and never
 * in a drag.
 *
 * <p>Deterministic on purpose: the same figure and the same seed give the same
 * answer, because a mark that changes between two runs of the same submission
 * is not a mark.
 */

export interface GeometryConjectureOptions {
  /**
   * How many perturbed configurations to try. More is stricter and slower; a
   * coincidence rarely survives even one honest nudge, and eight leaves room
   * for a sample that degenerates.
   */
  readonly samples?: number;
  /**
   * How far a free point may move, as a fraction of the figure's own size.
   *
   * <p>Has to be far larger than the tolerance a fact is established at, or a
   * near-coincidence simply stays inside it and is reported as a construction.
   * The default is fifty times that tolerance, and small enough to leave the
   * figure recognisable rather than folded onto itself.
   */
  readonly spread?: number;
  /** Fixed so that marking the same submission twice gives the same answer. */
  readonly seed?: number;
}

export interface GeometryConjectureReport {
  readonly toolKey: 'geometry-lab';
  /** Facts that held in every configuration: true of the construction. */
  readonly invariant: readonly GeometryInvariantId[];
  /** Facts that held as drawn and came apart when the figure moved. */
  readonly coincidental: readonly GeometryInvariantId[];
  /**
   * Facts that went missing only from a configuration whose own marking was
   * truncated, so nothing can be concluded about them either way.
   */
  readonly unsettled: readonly GeometryInvariantId[];
  /** How many configurations were tried, the figure as drawn not counted. */
  readonly samples: number;
  /**
   * How many points were free to move.
   *
   * <p>Zero means the figure has no degrees of freedom - every point is either
   * constructed from others or pinned - so there was nothing to vary and every
   * fact is invariant for the trivial reason. Worth reading before trusting a
   * report where everything is established.
   */
  readonly movedPoints: number;
  readonly relativeTolerance: number;
  /** True when any of the markings was itself truncated. */
  readonly truncated: boolean;
}

/** Fifty times the tolerance a fact is established at. */
const DEFAULT_SPREAD = RELATIVE_TOLERANCE * 50;
const DEFAULT_SAMPLES = 8;
const DEFAULT_SEED = 0x5eed;

/** Separates what a construction guarantees from what a configuration happens to show. */
export function detectGeometryConjectures(
  snapshot: GeometryLabSnapshot,
  options: GeometryConjectureOptions = {},
): GeometryConjectureReport {
  const samples = Math.max(1, Math.floor(options.samples ?? DEFAULT_SAMPLES));
  const spread = options.spread ?? DEFAULT_SPREAD;

  const base = computeGeometryInvariants(snapshot);
  const free = freePointIds(snapshot);
  const scale = figureSize(snapshot);

  if (base.invariants.length === 0 || free.length === 0 || scale <= 0) {
    // Nothing to vary, or nothing to say. A figure with no freedom really does
    // hold every one of its facts in every configuration it has.
    return {
      toolKey: 'geometry-lab',
      invariant: base.invariants,
      coincidental: [],
      unsettled: [],
      samples: 0,
      movedPoints: free.length,
      relativeTolerance: base.relativeTolerance,
      truncated: base.truncated,
    };
  }

  const random = seeded(options.seed ?? DEFAULT_SEED);
  const radius = scale * spread;
  const survived = new Set(base.invariants);
  const brokeReliably = new Set<GeometryInvariantId>();
  let truncated = base.truncated;

  for (let sample = 0; sample < samples; sample += 1) {
    const moved = canonicalizeGeometryLabSnapshot(perturb(snapshot, free, radius, random));
    const report = computeGeometryInvariants(moved);
    truncated = truncated || report.truncated;
    const holds = new Set(report.invariants);

    for (const invariant of base.invariants) {
      if (holds.has(invariant)) continue;
      survived.delete(invariant);
      // A fact missing from a truncated marking may simply never have been
      // looked for, which is not the same as having come apart.
      if (!report.truncated) brokeReliably.add(invariant);
    }
  }

  const invariant: GeometryInvariantId[] = [];
  const coincidental: GeometryInvariantId[] = [];
  const unsettled: GeometryInvariantId[] = [];
  for (const fact of base.invariants) {
    if (survived.has(fact)) invariant.push(fact);
    else if (brokeReliably.has(fact)) coincidental.push(fact);
    else unsettled.push(fact);
  }

  return {
    toolKey: 'geometry-lab',
    invariant,
    coincidental,
    unsettled,
    samples,
    movedPoints: free.length,
    relativeTolerance: base.relativeTolerance,
    truncated,
  };
}

/* -------------------------------------------------------------------------- */
/* Moving the figure                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The points a student can actually drag.
 *
 * <p>A point built from others is not free - it goes where its rule sends it -
 * and a locked point is a given of the problem rather than something the
 * student arranged. Moving either would test a figure the exercise does not
 * describe.
 */
function freePointIds(snapshot: GeometryLabSnapshot): string[] {
  const ids: string[] = [];
  for (const point of Object.values(snapshot.scene.scene2d.points)) {
    if (point.kind !== 'point2d') continue;
    if (point.construction || point.locked === true) continue;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    ids.push(point.id);
  }
  return ids.sort();
}

function perturb(
  snapshot: GeometryLabSnapshot,
  free: readonly string[],
  radius: number,
  random: () => number,
): GeometryLabSnapshot {
  const scene2d = snapshot.scene.scene2d;
  const points: Record<string, GeometryPoint2D> = { ...scene2d.points } as Record<string, GeometryPoint2D>;
  for (const id of free) {
    const point = points[id];
    if (!point) continue;
    // Uniform over a disc rather than a square, so no direction is favoured -
    // a figure whose facts only survive movement along an axis is not one.
    const angle = random() * Math.PI * 2;
    const distance = radius * Math.sqrt(random());
    points[id] = {
      ...point,
      x: point.x + Math.cos(angle) * distance,
      y: point.y + Math.sin(angle) * distance,
    };
  }
  // Copy-on-write down to the record that changed; canonicalisation clones what
  // it needs from here, so the caller's snapshot is not touched.
  return {
    ...snapshot,
    scene: { ...snapshot.scene, scene2d: { ...scene2d, points } },
  };
}

function figureSize(snapshot: GeometryLabSnapshot): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (const point of Object.values(snapshot.scene.scene2d.points)) {
    if (point.kind !== 'point2d') continue;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    count += 1;
  }
  return count < 2 ? 0 : Math.hypot(maxX - minX, maxY - minY);
}

/**
 * A small linear congruential generator, so a mark does not depend on the
 * host's `Math.random` and two runs of the same submission agree.
 */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
