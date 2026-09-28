/**
 * Telling a construction from a coincidence (plan task 4.4).
 *
 * <p>`computeGeometryInvariants` reports what holds in the figure in front of
 * it, which cannot tell a midpoint that was *constructed* from a point a child
 * nudged until the halves looked equal. Both are equally true of what is on
 * screen and only one answers the question.
 *
 * <p>So every test here builds the honest version and the eyeballed version of
 * the same fact in one figure, and asks which survives being moved. A figure
 * that only holds together where it was left is not a construction.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeometryLab, detectGeometryConjectures } from '../../dist/geometry-lab/index.js';

/* -------------------------------------------------------------------------- */
/* Constructed against eyeballed                                              */
/* -------------------------------------------------------------------------- */

test('a constructed midpoint survives being moved and a placed one does not', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: -4, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 4, y: 0, label: 'B' });
  lab.addMidpoint2D(a, b, { label: 'M' });

  const c = lab.addPoint2D({ x: -4, y: 6, label: 'C' });
  const d = lab.addPoint2D({ x: 4, y: 6, label: 'D' });
  lab.addPoint2D({ x: 0, y: 6, label: 'N' });

  const report = lab.detectConjectures();
  assert.ok(report.invariant.includes('midpoint:M,AB'), 'M is a midpoint because it was made one');
  assert.ok(report.coincidental.includes('midpoint:N,CD'), 'N is one only where it was left');
});

test('a constructed perpendicular survives and an eyeballed right angle does not', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 10, y: 0, label: 'B' });
  const ab = lab.addSegment2D(a, b);
  const p = lab.addPoint2D({ x: 4, y: 5, label: 'P' });
  lab.addPerpendicularLine2D(ab, p);

  // The same relation set up by hand: X, Y and Z placed at a right angle.
  const x = lab.addPoint2D({ x: 30, y: 0, label: 'X' });
  lab.addPoint2D({ x: 40, y: 0, label: 'Y' });
  lab.addPoint2D({ x: 30, y: 10, label: 'Z' });
  lab.addSegment2D(x, a);

  const report = lab.detectConjectures();
  assert.ok(
    report.coincidental.some(fact => fact === 'right-angle:YXZ' || fact === 'right-angle:ZXY'),
    'the hand-placed right angle came apart',
  );
  assert.ok(
    report.invariant.some(fact => fact.startsWith('perpendicular:')),
    'the constructed perpendicular did not',
  );
});

test('a circle through three points keeps them on it however they move', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 8, y: 0, label: 'B' });
  const c = lab.addPoint2D({ x: 3, y: 6, label: 'C' });
  lab.addCircleThroughPoints2D([a, b, c]);

  const report = lab.detectConjectures();
  const onCircle = report.invariant.filter(fact => fact.startsWith('point-on-circle:'));
  assert.equal(onCircle.length, 3, 'all three stay on their own circumcircle');
});

test('a constraint is part of the construction, so what it holds survives', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 5, y: 0, label: 'B' });
  const c = lab.addPoint2D({ x: 0, y: 9, label: 'C' });
  const d = lab.addPoint2D({ x: 5, y: 9, label: 'D' });
  lab.addSegment2D(a, b);
  lab.addSegment2D(c, d);
  lab.addConstraint2D({ kind: 'equalLength', segments: [[a, b], [c, d]] });

  const report = lab.detectConjectures();
  assert.ok(
    report.invariant.includes('equal-segments:AB,CD'),
    'the solver pulls the figure back, so the equality is not a configuration',
  );
});

/* -------------------------------------------------------------------------- */
/* What it will and will not claim                                            */
/* -------------------------------------------------------------------------- */

test('a figure with nothing free to move says so', () => {
  // Every point pinned: the figure has no configurations, so every fact holds
  // in all of them - which is true, and for a reason a reader should see.
  const lab = createGeometryLab({ initialView: '2d' });
  lab.addPoint2D({ x: 0, y: 0, label: 'A', locked: true });
  lab.addPoint2D({ x: 4, y: 0, label: 'B', locked: true });
  lab.addPoint2D({ x: 2, y: 0, label: 'M', locked: true });

  const report = lab.detectConjectures();
  assert.equal(report.movedPoints, 0);
  assert.equal(report.samples, 0);
  assert.ok(report.invariant.includes('midpoint:M,AB'));
  assert.deepEqual(report.coincidental, []);
});

test('an empty figure establishes nothing and does not fall over', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const report = lab.detectConjectures();
  assert.deepEqual(report.invariant, []);
  assert.deepEqual(report.coincidental, []);
  assert.equal(report.samples, 0);
});

test('a fact that only went missing from a truncated marking is unsettled, not broken', () => {
  // Absence from a marking that stopped early is not evidence that anything
  // came apart, and calling it coincidental would fail a correct construction.
  const lab = createGeometryLab({ initialView: '2d' });
  for (let index = 0; index < 60; index += 1) {
    lab.addPoint2D({ x: index * 3, y: 0, label: `P${index}` });
  }
  const report = lab.detectConjectures({ samples: 2 });
  assert.equal(report.truncated, true);
  assert.ok(report.unsettled.length > 0, 'a truncated sample settles nothing');
  assert.equal(
    report.coincidental.length + report.invariant.length + report.unsettled.length,
    new Set([...report.coincidental, ...report.invariant, ...report.unsettled]).size,
    'and every fact lands in exactly one of the three',
  );
});

/* -------------------------------------------------------------------------- */
/* A mark has to be repeatable                                                */
/* -------------------------------------------------------------------------- */

test('the same figure marked twice gives the same answer', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: -4, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 4, y: 0, label: 'B' });
  lab.addMidpoint2D(a, b, { label: 'M' });
  lab.addPoint2D({ x: 0, y: 5, label: 'N' });

  const first = lab.detectConjectures();
  const second = lab.detectConjectures();
  assert.deepEqual(second.invariant, first.invariant);
  assert.deepEqual(second.coincidental, first.coincidental);
});

test('a construction holds up whatever the seed', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: -4, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 4, y: 0, label: 'B' });
  lab.addMidpoint2D(a, b, { label: 'M' });
  lab.addPoint2D({ x: 0, y: 5, label: 'N' });

  for (const seed of [1, 2, 99, 12345]) {
    const report = lab.detectConjectures({ seed });
    assert.ok(report.invariant.includes('midpoint:M,AB'), `seed ${seed} lost a real construction`);
  }
});

test('marking does not disturb the figure', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: -4, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 4, y: 0, label: 'B' });
  lab.addMidpoint2D(a, b, { label: 'M' });

  const before = JSON.stringify(lab.getSnapshot().scene);
  lab.detectConjectures();
  assert.equal(JSON.stringify(lab.getSnapshot().scene), before, 'the perturbations are on a copy');
});

test('more samples are stricter, and one is still an honest test', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: -4, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 4, y: 0, label: 'B' });
  lab.addPoint2D({ x: 0, y: 0, label: 'N' });

  assert.equal(lab.detectConjectures({ samples: 1 }).samples, 1);
  assert.ok(
    lab.detectConjectures({ samples: 1 }).coincidental.includes('midpoint:N,AB'),
    'one nudge is enough to come apart',
  );
  assert.ok(lab.detectConjectures({ samples: 16 }).coincidental.includes('midpoint:N,AB'));
});

test('a nudge smaller than the tolerance settles nothing, which is why the default is not', () => {
  // The spread has to be far larger than the tolerance a fact is established
  // at, or a near-coincidence simply stays inside it. Shown rather than
  // asserted in a comment.
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: -4, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 4, y: 0, label: 'B' });
  lab.addPoint2D({ x: 0, y: 0, label: 'N' });

  const timid = lab.detectConjectures({ spread: 1e-6 });
  assert.ok(timid.invariant.includes('midpoint:N,AB'), 'too small a nudge calls a coincidence a construction');
  assert.ok(lab.detectConjectures().coincidental.includes('midpoint:N,AB'), 'the default does not');
});

test('the free function and the instrument method agree', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: -4, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 4, y: 0, label: 'B' });
  lab.addMidpoint2D(a, b, { label: 'M' });

  assert.deepEqual(
    detectGeometryConjectures(lab.getSnapshot()).invariant,
    lab.detectConjectures().invariant,
  );
});
