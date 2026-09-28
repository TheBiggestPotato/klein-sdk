/**
 * Exact values for the numbers school geometry actually produces.
 *
 * <p>Every measurement in the instrument is a float, so it can say `4.4721` and
 * never `2√5`. That is not a rounding complaint: the two say different things.
 * A student asked to show that a diagonal is twice the side length is shown
 * `4.4721` and `2.2360` and has to guess; shown `2√5` and `√5` they can see it.
 * Feedback, marking and any explanation the tool ever gives are all capped by
 * the most precise thing it can say.
 *
 * <p><b>A narrow layer, not a CAS.</b> The values here are sums of terms
 * `(n/d)·√r` with `r` square-free - rationals when `r` is one. That is closed
 * under addition and subtraction, which is what perimeters need, and it covers
 * lengths and areas between rational points, which is nearly everything a
 * lesson measures. Anything outside it - a cube root, a transcendental, a
 * quotient by a sum of surds - is reported as *no exact value found* rather
 * than approximated.
 *
 * <p><b>Absence means "not found", not "irrational".</b> The same discipline the
 * invariant reporter uses. A value can fail to be recognised because it really
 * is irrational, because rationalising its inputs failed, or because an
 * intermediate exceeded what an integer can hold here; a reader must not take
 * silence for a proof.
 */

/** One term of an exact value: `(numerator / denominator) * sqrt(radicand)`. */
export interface ExactTerm {
  readonly numerator: number;
  /** Always positive. */
  readonly denominator: number;
  /** Always a positive square-free integer; one for a plain rational. */
  readonly radicand: number;
}

/** A sum of surd terms, with one term per radicand and none of them zero. */
export interface ExactValue {
  readonly terms: readonly ExactTerm[];
}

/**
 * Beyond this an intermediate is refused rather than silently rounded.
 *
 * <p>Everything here is integer arithmetic on doubles, which is exact up to
 * 2^53. A layer that quietly lost precision would be worse than no layer at
 * all, because the whole point of it is being able to trust what it says.
 */
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

/**
 * The largest radicand whose square factors will be looked for.
 *
 * <p>Extracting them is trial division to the square root, so this bounds that
 * at about thirty-two thousand steps - unnoticeable for the handful of
 * measurements a figure carries, and a refusal rather than a hang for anything
 * past it.
 */
const MAX_RADICAND = 1e9;

/** The largest denominator a float will be recognised as a fraction over. */
const MAX_RATIONAL_DENOMINATOR = 10_000;

/** Nothing. */
export const EXACT_ZERO: ExactValue = { terms: [] };

/* -------------------------------------------------------------------------- */
/* Building                                                                   */
/* -------------------------------------------------------------------------- */

/** `numerator / denominator`, or nothing when it cannot be held exactly. */
export function exactRational(numerator: number, denominator = 1): ExactValue | null {
  const term = makeTerm(numerator, denominator, 1);
  if (term === null) return null;
  return { terms: term.numerator === 0 ? [] : [term] };
}

/**
 * The square root of an exact value, when that root is itself one.
 *
 * <p>Only a rational has a square root inside this layer: `√(p/q)` is
 * `√(pq)/q`, which is a term. The square root of a sum of surds generally is
 * not - `√(1+√2)` is a fourth-degree number - so it is refused rather than
 * approximated.
 */
export function exactSqrt(value: ExactValue): ExactValue | null {
  if (value.terms.length === 0) return EXACT_ZERO;
  if (value.terms.length > 1) return null;
  const term = value.terms[0] as ExactTerm;
  if (term.radicand !== 1) return null;
  if (term.numerator < 0) return null;
  // sqrt(n/d) = sqrt(n*d)/d, which keeps the radicand an integer.
  const product = term.numerator * term.denominator;
  if (!Number.isSafeInteger(product)) return null;
  const built = makeTerm(1, term.denominator, product);
  return built === null ? null : { terms: built.numerator === 0 ? [] : [built] };
}

/* -------------------------------------------------------------------------- */
/* Arithmetic                                                                 */
/* -------------------------------------------------------------------------- */

export function addExact(left: ExactValue, right: ExactValue): ExactValue | null {
  const byRadicand = new Map<number, { numerator: number; denominator: number }>();
  for (const term of [...left.terms, ...right.terms]) {
    const existing = byRadicand.get(term.radicand);
    if (!existing) {
      byRadicand.set(term.radicand, { numerator: term.numerator, denominator: term.denominator });
      continue;
    }
    const sum = addRational(existing, term);
    if (sum === null) return null;
    byRadicand.set(term.radicand, sum);
  }
  return collect(byRadicand);
}

export function negateExact(value: ExactValue): ExactValue {
  return { terms: value.terms.map((term) => ({ ...term, numerator: -term.numerator })) };
}

export function subtractExact(left: ExactValue, right: ExactValue): ExactValue | null {
  return addExact(left, negateExact(right));
}

export function multiplyExact(left: ExactValue, right: ExactValue): ExactValue | null {
  const byRadicand = new Map<number, { numerator: number; denominator: number }>();
  for (const one of left.terms) {
    for (const other of right.terms) {
      // sqrt(a)*sqrt(b) = sqrt(ab), which then needs its squares taking out
      // again - sqrt(2)*sqrt(6) is 2*sqrt(3), not sqrt(12).
      const radicand = one.radicand * other.radicand;
      if (!Number.isSafeInteger(radicand)) return null;
      const numerator = one.numerator * other.numerator;
      const denominator = one.denominator * other.denominator;
      if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) return null;
      const term = makeTerm(numerator, denominator, radicand);
      if (term === null) return null;
      const existing = byRadicand.get(term.radicand);
      if (!existing) {
        byRadicand.set(term.radicand, { numerator: term.numerator, denominator: term.denominator });
        continue;
      }
      const sum = addRational(existing, term);
      if (sum === null) return null;
      byRadicand.set(term.radicand, sum);
    }
  }
  return collect(byRadicand);
}

/**
 * Division, when the divisor is a single term.
 *
 * <p>Dividing by a sum needs its conjugate, which only closes for two terms and
 * only over a quadratic field - the beginning of a CAS rather than the end of
 * this. `a/(b√c)` is `a√c/(bc)`, which is the rationalising step a student is
 * taught, and it is the case that comes up.
 */
export function divideExact(left: ExactValue, right: ExactValue): ExactValue | null {
  if (right.terms.length !== 1) return null;
  const divisor = right.terms[0] as ExactTerm;
  if (divisor.numerator === 0) return null;

  const byRadicand = new Map<number, { numerator: number; denominator: number }>();
  for (const term of left.terms) {
    // Multiply above and below by sqrt(radicand) to clear the root downstairs.
    const radicand = term.radicand * divisor.radicand;
    const numerator = term.numerator * divisor.denominator;
    const denominator = term.denominator * divisor.numerator * divisor.radicand;
    if (!Number.isSafeInteger(radicand) || !Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
      return null;
    }
    const built = makeTerm(numerator, denominator, radicand);
    if (built === null) return null;
    const existing = byRadicand.get(built.radicand);
    if (!existing) {
      byRadicand.set(built.radicand, { numerator: built.numerator, denominator: built.denominator });
      continue;
    }
    const sum = addRational(existing, built);
    if (sum === null) return null;
    byRadicand.set(built.radicand, sum);
  }
  return collect(byRadicand);
}

/* -------------------------------------------------------------------------- */
/* Reading and writing                                                        */
/* -------------------------------------------------------------------------- */

/** What the value is worth as a float, for checking against the measurement. */
export function exactToNumber(value: ExactValue): number {
  let total = 0;
  for (const term of value.terms) {
    total += (term.numerator / term.denominator) * Math.sqrt(term.radicand);
  }
  return total;
}

/**
 * The value written out: `2√5`, `3/2`, `3 + 2√5`, or `\frac{2\sqrt{5}}{3}`.
 *
 * <p>Terms are ordered rationals first and then by radicand, so the same value
 * is always written the same way - `3 + 2√5` and never `2√5 + 3` on alternate
 * runs, which would make two exports of one figure differ for no reason.
 */
export function formatExact(value: ExactValue, format: 'plain' | 'latex' = 'plain'): string {
  if (value.terms.length === 0) return '0';
  const ordered = [...value.terms].sort((left, right) => left.radicand - right.radicand);

  let out = '';
  for (const [index, term] of ordered.entries()) {
    const negative = term.numerator < 0;
    if (index === 0) out += negative ? '-' : '';
    else out += negative ? ' - ' : ' + ';
    out += formatTerm({ ...term, numerator: Math.abs(term.numerator) }, format);
  }
  return out;
}

function formatTerm(term: ExactTerm, format: 'plain' | 'latex'): string {
  const root = term.radicand === 1
    ? ''
    : (format === 'latex' ? `\\sqrt{${term.radicand}}` : `√${term.radicand}`);
  // A coefficient of one in front of a root is written by not writing it.
  const head = term.numerator === 1 && root !== '' ? '' : String(term.numerator);

  if (term.denominator === 1) return `${head}${root}`;
  if (format === 'latex') return `\\frac{${head === '' ? root : `${head}${root}`}}{${term.denominator}}`;
  return `${head}${root}/${term.denominator}`;
}

/* -------------------------------------------------------------------------- */
/* Recognising a float                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The fraction a float was almost certainly meant to be.
 *
 * <p>Every finite double already *is* a rational, but `0.1` is
 * `3602879701896397/36028797018963968`, and carrying that through a square root
 * produces nothing anybody wants to read. So this looks for a small fraction
 * that reproduces the float, by continued fractions, and refuses when the
 * smallest one that fits is not small.
 *
 * <p>Refusing is the important half. A coordinate that came out of a
 * circumcentre of awkward points is genuinely not a nice fraction, and guessing
 * one would make the exact layer say something false in the one place it is
 * supposed to be trusted.
 */
export function rationalize(
  value: number,
  maxDenominator: number = MAX_RATIONAL_DENOMINATOR,
): { numerator: number; denominator: number } | null {
  if (!Number.isFinite(value)) return null;
  if (Number.isInteger(value)) return Number.isSafeInteger(value) ? { numerator: value, denominator: 1 } : null;

  const sign = value < 0 ? -1 : 1;
  let remainder = Math.abs(value);
  let previousNumerator = 1;
  let previousDenominator = 0;
  let numerator = Math.floor(remainder);
  let denominator = 1;

  for (let step = 0; step < 40; step += 1) {
    const approximation = numerator / denominator;
    // Relative, because a coordinate of a thousand and a coordinate of a
    // thousandth do not deserve the same absolute slack.
    if (Math.abs(approximation - Math.abs(value)) <= Math.abs(value) * 1e-12) {
      return denominator <= maxDenominator && Number.isSafeInteger(numerator)
        ? { numerator: sign * numerator, denominator }
        : null;
    }
    const fraction = remainder - Math.floor(remainder);
    if (fraction < 1e-12) break;
    remainder = 1 / fraction;
    const whole = Math.floor(remainder);
    const nextNumerator = whole * numerator + previousNumerator;
    const nextDenominator = whole * denominator + previousDenominator;
    if (!Number.isSafeInteger(nextNumerator) || nextDenominator > maxDenominator) break;
    previousNumerator = numerator;
    previousDenominator = denominator;
    numerator = nextNumerator;
    denominator = nextDenominator;
  }
  return null;
}

/** The exact value a float was almost certainly meant to be, or nothing. */
export function exactFromNumber(value: number): ExactValue | null {
  const fraction = rationalize(value);
  return fraction === null ? null : exactRational(fraction.numerator, fraction.denominator);
}

/* -------------------------------------------------------------------------- */

function makeTerm(numerator: number, denominator: number, radicand: number): ExactTerm | null {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) return null;
  if (!Number.isSafeInteger(radicand) || radicand < 0) return null;
  if (denominator === 0) return null;
  if (numerator === 0 || radicand === 0) return { numerator: 0, denominator: 1, radicand: 1 };

  const reduced = squareFree(radicand);
  if (reduced === null) return null;
  let outside = numerator * reduced.square;
  if (!Number.isSafeInteger(outside)) return null;
  let below = denominator;
  if (below < 0) {
    below = -below;
    outside = -outside;
  }
  const divisor = gcd(Math.abs(outside), below);
  return { numerator: outside / divisor, denominator: below / divisor, radicand: reduced.radicand };
}

/**
 * Splits `n` into `square² · radicand` with the radicand square-free, so that
 * `√12` is written `2√3` rather than left as it arrived.
 */
function squareFree(value: number): { square: number; radicand: number } | null {
  if (value <= 1) return { square: 1, radicand: Math.max(1, value) };
  if (value > MAX_RADICAND) return null;
  let remaining = value;
  let square = 1;
  for (let factor = 2; factor * factor <= remaining; factor += 1) {
    const squared = factor * factor;
    while (remaining % squared === 0) {
      remaining /= squared;
      square *= factor;
    }
  }
  return { square, radicand: remaining };
}

function addRational(
  left: { numerator: number; denominator: number },
  right: { numerator: number; denominator: number },
): { numerator: number; denominator: number } | null {
  const denominator = left.denominator * right.denominator;
  const numerator = left.numerator * right.denominator + right.numerator * left.denominator;
  if (!Number.isSafeInteger(denominator) || !Number.isSafeInteger(numerator)) return null;
  if (Math.abs(numerator) > MAX_SAFE || denominator > MAX_SAFE) return null;
  const divisor = gcd(Math.abs(numerator), denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

/** Drops the terms that cancelled to nothing, which is most of why sums simplify. */
function collect(byRadicand: Map<number, { numerator: number; denominator: number }>): ExactValue {
  const terms: ExactTerm[] = [];
  for (const [radicand, rational] of [...byRadicand.entries()].sort(([left], [right]) => left - right)) {
    if (rational.numerator === 0) continue;
    terms.push({ numerator: rational.numerator, denominator: rational.denominator, radicand });
  }
  return { terms };
}

function gcd(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a === 0 ? 1 : a;
}
