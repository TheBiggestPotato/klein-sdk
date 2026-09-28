/**
 * Exact values for the numbers school geometry produces (plan task 6.2).
 *
 * <p>Every measurement was a float, so the tool could say `4.4721` and never
 * `2√5`. That is not a rounding complaint: a student asked to show a diagonal
 * is twice a side is shown `4.4721` and `2.2360` and has to guess, and shown
 * `2√5` and `√5` can see it.
 *
 * <p>The layer is narrow on purpose - sums of `(n/d)√r` - so these tests are as
 * much about what it *refuses* as about what it computes. A layer that guessed
 * would be worse than none, because being trusted is the whole of its value.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addExact,
  divideExact,
  exactFromNumber,
  exactRational,
  exactSqrt,
  exactToNumber,
  formatExact,
  multiplyExact,
  rationalize,
  subtractExact,
} from '../../dist/math/index.js';

const sqrt = (n, d = 1) => exactSqrt(exactRational(n, d));
const show = (value) => (value === null ? null : formatExact(value));

/* -------------------------------------------------------------------------- */
/* Simplifying                                                                */
/* -------------------------------------------------------------------------- */

test('a root is written with its squares taken out', () => {
  assert.equal(show(sqrt(20)), '2√5');
  assert.equal(show(sqrt(4)), '2', 'a perfect square is not a surd at all');
  assert.equal(show(sqrt(72)), '6√2');
  assert.equal(show(sqrt(1)), '1');
  assert.equal(show(sqrt(0)), '0');
});

test('a root of a fraction comes out with a rational denominator', () => {
  // The step a student is taught, done for them rather than left in.
  assert.equal(show(sqrt(1, 2)), '√2/2');
  assert.equal(show(sqrt(3, 4)), '√3/2');
  assert.equal(show(sqrt(9, 16)), '3/4');
});

test('a fraction is reduced', () => {
  assert.equal(show(exactRational(6, 4)), '3/2');
  assert.equal(show(exactRational(-4, 8)), '-1/2');
  assert.equal(show(exactRational(5, -10)), '-1/2', 'the sign lives on top');
  assert.equal(show(exactRational(0, 7)), '0');
});

/* -------------------------------------------------------------------------- */
/* Arithmetic                                                                 */
/* -------------------------------------------------------------------------- */

test('like roots add and unlike ones do not', () => {
  assert.equal(show(addExact(sqrt(8), sqrt(18))), '5√2', 'both are multiples of root two');
  assert.equal(show(addExact(sqrt(2), sqrt(3))), '√2 + √3');
  assert.equal(show(addExact(exactRational(3), sqrt(20))), '3 + 2√5');
});

test('what cancels, cancels', () => {
  assert.equal(show(subtractExact(sqrt(2), sqrt(2))), '0');
  assert.equal(show(subtractExact(addExact(exactRational(3), sqrt(2)), sqrt(2))), '3');
  assert.equal(show(subtractExact(sqrt(18), sqrt(2))), '2√2');
});

test('multiplying roots multiplies what is under them, and then simplifies', () => {
  assert.equal(show(multiplyExact(sqrt(2), sqrt(6))), '2√3', 'root twelve is two root three');
  assert.equal(show(multiplyExact(sqrt(5), sqrt(5))), '5');
  assert.equal(show(multiplyExact(exactRational(3), sqrt(2))), '3√2');
});

test('dividing rationalises the denominator', () => {
  assert.equal(show(divideExact(exactRational(3), sqrt(20))), '3√5/10');
  assert.equal(show(divideExact(sqrt(6), sqrt(2))), '√3');
  assert.equal(show(divideExact(exactRational(1), exactRational(4))), '1/4');
});

test('dividing by a sum of roots is refused rather than approximated', () => {
  // The conjugate trick only closes for two terms over a quadratic field, which
  // is the beginning of a CAS rather than the end of this.
  assert.equal(divideExact(exactRational(1), addExact(exactRational(1), sqrt(2))), null);
  assert.equal(divideExact(exactRational(1), exactRational(0)), null, 'and dividing by nothing is refused');
});

test('a root of a sum of roots is refused', () => {
  assert.equal(exactSqrt(addExact(exactRational(1), sqrt(2))), null, 'a fourth-degree number is outside this');
  assert.equal(exactSqrt(exactRational(-4)), null, 'and so is a root of a negative');
});

test('every value knows what it is worth as a float', () => {
  assert.ok(Math.abs(exactToNumber(sqrt(20)) - 4.47213595499958) < 1e-12);
  assert.ok(Math.abs(exactToNumber(addExact(exactRational(3), sqrt(20))) - 7.47213595499958) < 1e-12);
  assert.equal(exactToNumber(exactRational(0)), 0);
});

/* -------------------------------------------------------------------------- */
/* Writing it down                                                            */
/* -------------------------------------------------------------------------- */

test('a coefficient of one in front of a root is written by not writing it', () => {
  assert.equal(show(sqrt(5)), '√5');
  assert.equal(show(multiplyExact(exactRational(1), sqrt(5))), '√5');
});

test('a negative term is a minus sign rather than a plus and a minus', () => {
  assert.equal(show(subtractExact(exactRational(3), sqrt(2))), '3 - √2');
  assert.equal(show(subtractExact(exactRational(0), sqrt(2))), '-√2');
});

test('terms are always written in the same order', () => {
  // Otherwise two exports of one figure would differ for no reason.
  const one = addExact(exactRational(3), sqrt(20));
  const other = addExact(sqrt(20), exactRational(3));
  assert.equal(show(one), show(other));
  assert.equal(show(one), '3 + 2√5');
});

test('LaTeX is real roots and real fractions', () => {
  assert.equal(formatExact(sqrt(20), 'latex'), '2\\sqrt{5}');
  assert.equal(formatExact(sqrt(1, 2), 'latex'), '\\frac{\\sqrt{2}}{2}');
  assert.equal(formatExact(exactRational(3, 4), 'latex'), '\\frac{3}{4}');
  assert.equal(formatExact(addExact(exactRational(3), sqrt(20)), 'latex'), '3 + 2\\sqrt{5}');
});

/* -------------------------------------------------------------------------- */
/* Recognising a float                                                        */
/* -------------------------------------------------------------------------- */

test('a float that was meant to be a fraction is recognised as one', () => {
  assert.deepEqual(rationalize(0.1), { numerator: 1, denominator: 10 });
  assert.deepEqual(rationalize(0.75), { numerator: 3, denominator: 4 });
  assert.deepEqual(rationalize(-2.5), { numerator: -5, denominator: 2 });
  assert.deepEqual(rationalize(7), { numerator: 7, denominator: 1 });
});

test('a float that was not is refused', () => {
  // The important half. A coordinate out of a circumcentre of awkward points is
  // genuinely not a nice fraction, and guessing one would make this layer say
  // something false in the one place it has to be trusted.
  assert.equal(rationalize(Math.PI), null);
  assert.equal(rationalize(Math.SQRT2), null);
  assert.equal(rationalize(Math.E), null);
  assert.equal(rationalize(Number.NaN), null);
  assert.equal(rationalize(Number.POSITIVE_INFINITY), null);
});

test('a fraction too fine to be meant is refused', () => {
  assert.deepEqual(rationalize(1 / 7), { numerator: 1, denominator: 7 });
  assert.equal(rationalize(1 / 999983), null, 'nobody typed a denominator of a million');
  assert.equal(rationalize(1 / 7, 5), null, 'and the caller can ask for tighter');
});

test('exactFromNumber is rationalising and then building', () => {
  assert.equal(show(exactFromNumber(2.5)), '5/2');
  assert.equal(exactFromNumber(Math.PI), null);
});

/* -------------------------------------------------------------------------- */
/* Refusing rather than rounding                                              */
/* -------------------------------------------------------------------------- */

test('an intermediate too large to hold exactly is refused', () => {
  // Integer arithmetic on doubles is exact to 2^53 and silently wrong past it,
  // and a layer that lost precision quietly would be worse than no layer.
  const huge = exactRational(Number.MAX_SAFE_INTEGER);
  assert.equal(multiplyExact(huge, huge), null);
  assert.equal(exactRational(Number.MAX_SAFE_INTEGER + 10), null);
});

test('a radicand too large to factor is refused rather than left unsimplified', () => {
  assert.equal(exactSqrt(exactRational(1e12)), null);
});
