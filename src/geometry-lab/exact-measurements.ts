import {
  EXACT_ZERO,
  addExact,
  divideExact,
  exactFromNumber,
  exactRational,
  exactSqrt,
  exactToNumber,
  multiplyExact,
  subtractExact,
  type ExactValue,
} from '../math/index.js';
import type { GeometryPoint2D } from '../geometry-core/index.js';
import type { GeometryScene2D, MeasurementSource2D } from './types.js';

/**
 * The exact value of a measurement, when there is one to be had.
 *
 * <p>A length between points with fractional coordinates is a surd, an area is
 * a rational, and a perimeter is a sum of surds - so nearly everything a lesson
 * measures lands inside the narrow layer in `src/math/exact.ts` and can be said
 * as `2√5` rather than as `4.4721`.
 *
 * <p><b>It starts by recognising the coordinates.</b> Points are floats, and a
 * float is only a fraction if it was meant to be one. Every one of them has to
 * be recognised before anything exact can be built on top, and a single
 * unrecognisable coordinate ends the attempt - which is the honest outcome,
 * because a figure whose points came out of a circumcentre of awkward points
 * has a length that is genuinely not a surd over the rationals.
 *
 * <p><b>The answer is checked against the float before it is returned.</b> Every
 * step is exact, so a disagreement means a mistake in this file rather than
 * rounding, and returning nothing is better than returning a confident wrong
 * number in the one place the tool is supposed to be trustworthy.
 */
export function exactMeasurement2D(
  scene: GeometryScene2D,
  source: MeasurementSource2D,
  value: number,
): ExactValue | null {
  const exact = computeExact(scene, source);
  if (exact === null) return null;
  // A relative check, because an area of ten thousand and a length of a
  // hundredth do not deserve the same absolute slack.
  const scale = Math.max(1, Math.abs(value));
  return Math.abs(exactToNumber(exact) - value) <= scale * 1e-9 ? exact : null;
}

function computeExact(scene: GeometryScene2D, source: MeasurementSource2D): ExactValue | null {
  switch (source.kind) {
    case 'pointDistance': {
      const from = exactPoint(scene, source.firstPointId);
      const to = exactPoint(scene, source.secondPointId);
      return from && to ? distance(from, to) : null;
    }
    case 'segmentLength': {
      const ends = exactEnds(scene, source.entityId);
      return ends ? distance(ends[0], ends[1]) : null;
    }
    case 'pointLineDistance': {
      const from = exactPoint(scene, source.pointId);
      const ends = exactEnds(scene, source.entityId);
      if (!from || !ends) return null;
      return perpendicularDistance(from, ends[0], ends[1]);
    }
    case 'angle': {
      const corners = source.pointIds.map((id) => exactPoint(scene, id));
      const [first, vertex, third] = corners;
      return first && vertex && third ? exactAngleDegrees(first, vertex, third) : null;
    }
    case 'polygonArea': {
      const corners = exactCorners(scene, source.entityId);
      return corners ? polygonArea(corners) : null;
    }
    case 'polygonPerimeter': {
      const corners = exactCorners(scene, source.entityId);
      return corners ? polygonPerimeter(corners) : null;
    }
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* The shapes                                                                 */
/* -------------------------------------------------------------------------- */

interface ExactPoint {
  readonly x: ExactValue;
  readonly y: ExactValue;
}

function distance(from: ExactPoint, to: ExactPoint): ExactValue | null {
  const squared = squaredDistance(from, to);
  return squared === null ? null : exactSqrt(squared);
}

function squaredDistance(from: ExactPoint, to: ExactPoint): ExactValue | null {
  const dx = subtractExact(to.x, from.x);
  const dy = subtractExact(to.y, from.y);
  if (!dx || !dy) return null;
  const one = multiplyExact(dx, dx);
  const other = multiplyExact(dy, dy);
  return one && other ? addExact(one, other) : null;
}

/** Twice the triangle's area over its base, which is the perpendicular height. */
function perpendicularDistance(from: ExactPoint, first: ExactPoint, second: ExactPoint): ExactValue | null {
  const dx = subtractExact(second.x, first.x);
  const dy = subtractExact(second.y, first.y);
  if (!dx || !dy) return null;
  const toX = subtractExact(from.x, first.x);
  const toY = subtractExact(from.y, first.y);
  if (!toX || !toY) return null;
  const one = multiplyExact(dx, toY);
  const other = multiplyExact(dy, toX);
  if (!one || !other) return null;
  const cross = subtractExact(one, other);
  const base = distance(first, second);
  if (!cross || !base) return null;
  const quotient = divideExact(absolute(cross), base);
  return quotient;
}

function polygonArea(corners: readonly ExactPoint[]): ExactValue | null {
  let twice: ExactValue | null = EXACT_ZERO;
  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index] as ExactPoint;
    const next = corners[(index + 1) % corners.length] as ExactPoint;
    const one = multiplyExact(current.x, next.y);
    const other = multiplyExact(next.x, current.y);
    if (!one || !other || !twice) return null;
    const step = subtractExact(one, other);
    twice = step === null ? null : addExact(twice, step);
  }
  if (!twice) return null;
  return divideExact(absolute(twice), exactRational(2) as ExactValue);
}

function polygonPerimeter(corners: readonly ExactPoint[]): ExactValue | null {
  let total: ExactValue | null = EXACT_ZERO;
  for (let index = 0; index < corners.length; index += 1) {
    const side = distance(corners[index] as ExactPoint, corners[(index + 1) % corners.length] as ExactPoint);
    if (!side || !total) return null;
    total = addExact(total, side);
  }
  return total;
}

/**
 * An angle in whole degrees, when it is one of the nine a lesson is about.
 *
 * <p>Not by comparing a float against `cos 30°`. The *square* of the cosine is
 * `dot² / (|a|²|b|²)`, and both of those are exact rationals when the
 * coordinates are - so the test is an equality between fractions rather than a
 * near-miss between floats, and the sign of the dot product picks which side of
 * a right angle the answer is on. `cos²` of 1, 3/4, 1/2, 1/4 and 0 are the only
 * values that come out whole, which is exactly the set a protractor is marked
 * for.
 */
function exactAngleDegrees(first: ExactPoint, vertex: ExactPoint, third: ExactPoint): ExactValue | null {
  const ax = subtractExact(first.x, vertex.x);
  const ay = subtractExact(first.y, vertex.y);
  const bx = subtractExact(third.x, vertex.x);
  const by = subtractExact(third.y, vertex.y);
  if (!ax || !ay || !bx || !by) return null;

  const dotOne = multiplyExact(ax, bx);
  const dotOther = multiplyExact(ay, by);
  if (!dotOne || !dotOther) return null;
  const dot = addExact(dotOne, dotOther);
  const lengthsSquared = multiplyExact(
    addExact(multiplyExact(ax, ax) as ExactValue, multiplyExact(ay, ay) as ExactValue) as ExactValue,
    addExact(multiplyExact(bx, bx) as ExactValue, multiplyExact(by, by) as ExactValue) as ExactValue,
  );
  if (!dot || !lengthsSquared) return null;

  const dotSquared = multiplyExact(dot, dot);
  if (!dotSquared) return null;
  const cosineSquared = divideExact(dotSquared, lengthsSquared);
  if (!cosineSquared || cosineSquared.terms.length > 1) return null;
  const rational = cosineSquared.terms[0];
  if (rational !== undefined && rational.radicand !== 1) return null;

  const numerator = rational?.numerator ?? 0;
  const denominator = rational?.denominator ?? 1;
  const sign = exactToNumber(dot);
  for (const [top, bottom, acute, obtuse] of SPECIAL_ANGLES) {
    if (numerator !== top || denominator !== bottom) continue;
    if (acute === obtuse) return exactRational(acute);
    return exactRational(sign > 0 ? acute : obtuse);
  }
  return null;
}

/**
 * `cos²`, then the angle it means when the cosine is positive and negative.
 *
 * <p><b>Thirty and sixty degrees are not in this table, and cannot be.</b> The
 * arms are vectors between points with rational coordinates, so `cos²` is
 * `dot²/(|a|²|b|²)` - a ratio of rationals. Setting that to three quarters or a
 * quarter forces `√3` to be rational, so no figure with fractional coordinates
 * has a thirty-degree angle in it, however it was drawn. Checked as well as
 * argued: an exhaustive search over every pair of integer vectors up to sixty
 * finds tens of thousands of right angles and forty-fives, and not one thirty.
 *
 * <p>So a protractor showing 30° in this instrument is showing a rounded
 * 30.0000-something, and the honest answer is no exact value rather than a
 * number that looks certain.
 */
const SPECIAL_ANGLES: readonly (readonly [number, number, number, number])[] = [
  [1, 1, 0, 180],
  [1, 2, 45, 135],
  [0, 1, 90, 90],
];

function absolute(value: ExactValue): ExactValue {
  return exactToNumber(value) < 0
    ? { terms: value.terms.map((term) => ({ ...term, numerator: -term.numerator })) }
    : value;
}

/* -------------------------------------------------------------------------- */
/* Reading the scene                                                          */
/* -------------------------------------------------------------------------- */

function exactPoint(scene: GeometryScene2D, id: string): ExactPoint | null {
  const point = scene.points[id];
  if (!point || point.kind !== 'point2d') return null;
  const x = exactFromNumber((point as GeometryPoint2D).x);
  const y = exactFromNumber((point as GeometryPoint2D).y);
  return x && y ? { x, y } : null;
}

function exactEnds(scene: GeometryScene2D, entityId: string): [ExactPoint, ExactPoint] | null {
  const entity = scene.entities[entityId];
  if (!entity || !('pointIds' in entity) || entity.pointIds.length < 2) return null;
  const from = exactPoint(scene, entity.pointIds[0] as string);
  const to = exactPoint(scene, entity.pointIds[1] as string);
  return from && to ? [from, to] : null;
}

function exactCorners(scene: GeometryScene2D, entityId: string): ExactPoint[] | null {
  const entity = scene.entities[entityId];
  if (!entity || entity.kind !== 'polygon') return null;
  const corners: ExactPoint[] = [];
  for (const id of entity.pointIds) {
    const corner = exactPoint(scene, id);
    if (!corner) return null;
    corners.push(corner);
  }
  return corners.length >= 3 ? corners : null;
}
