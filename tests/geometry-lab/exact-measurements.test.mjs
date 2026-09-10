/**
 * Measurements that can say `2√5` (plan task 6.2).
 *
 * <p>The arithmetic is tested in `tests/math/exact.test.mjs`; what these cover
 * is the geometry on top of it - which measurements have exact values, that the
 * value follows the figure when it moves, and above all that the tool says
 * nothing rather than something wrong when it cannot be sure.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeometryLab } from '../../dist/geometry-lab/index.js';
import { formatExact } from '../../dist/math/index.js';

/** A 2-4 / 4-0 triangle, whose sides and area are all exactly expressible. */
function triangle() {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 2, y: 4, label: 'B' });
  const c = lab.addPoint2D({ x: 4, y: 0, label: 'C' });
  return { lab, a, b, c, polygon: lab.addPolygon2D([a, b, c]) };
}

const exactOf = (lab, id) => {
  const measurement = lab.peekSnapshot().scene.scene2d.measurements[id];
  return measurement.exact ? formatExact(measurement.exact) : null;
};

/* -------------------------------------------------------------------------- */
/* What can be said exactly                                                   */
/* -------------------------------------------------------------------------- */

test('a length between points with whole coordinates is a surd', () => {
  const { lab, a, b } = triangle();
  const id = lab.addLengthMeasurement2D(lab.addSegment2D(a, b), 'AB');
  assert.equal(exactOf(lab, id), '2√5');
  assert.ok(Math.abs(lab.peekSnapshot().scene.scene2d.measurements[id].value - 4.47213595) < 1e-6);
});

test('a distance between two points needs no segment drawn between them', () => {
  const { lab, a, b } = triangle();
  assert.equal(exactOf(lab, lab.addDistanceMeasurement2D(a, b, 'AB')), '2√5');
});

test('an area is a rational, because the shoelace formula never takes a root', () => {
  const { lab, polygon } = triangle();
  assert.equal(exactOf(lab, lab.addAreaMeasurement2D(polygon, 'area')), '8');
});

test('a perimeter is a sum of surds, which is why the layer holds sums', () => {
  const { lab, polygon } = triangle();
  assert.equal(exactOf(lab, lab.addPerimeterMeasurement2D(polygon, 'perimeter')), '4 + 4√5');
});

test('a fractional coordinate is still a fraction', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0 });
  const b = lab.addPoint2D({ x: 0.5, y: 0 });
  assert.equal(exactOf(lab, lab.addDistanceMeasurement2D(a, b, 'half')), '1/2');
});

test('the distance from a point to a line is rationalised', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0 });
  const b = lab.addPoint2D({ x: 1, y: 1 });
  const off = lab.addPoint2D({ x: 1, y: 0 });
  const id = lab.addPointLineDistanceMeasurement2D(off, lab.addSegment2D(a, b), 'gap');
  assert.equal(exactOf(lab, id), '√2/2', 'and not 1/√2, which nobody writes');
});

test('a right angle and a half turn are said exactly', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const east = lab.addPoint2D({ x: 1, y: 0 });
  const origin = lab.addPoint2D({ x: 0, y: 0 });
  const north = lab.addPoint2D({ x: 0, y: 1 });
  const west = lab.addPoint2D({ x: -1, y: 0 });
  const diagonal = lab.addPoint2D({ x: 1, y: 1 });

  assert.equal(exactOf(lab, lab.addAngleMeasurement2D([east, origin, north], 'right')), '90');
  assert.equal(exactOf(lab, lab.addAngleMeasurement2D([east, origin, west], 'straight')), '180');
  assert.equal(exactOf(lab, lab.addAngleMeasurement2D([east, origin, diagonal], 'half a right angle')), '45');
});

/* -------------------------------------------------------------------------- */
/* What cannot, and is not guessed at                                         */
/* -------------------------------------------------------------------------- */

test('an angle that is not one of the ones a protractor is marked for says nothing', () => {
  const { lab, a, b, c } = triangle();
  assert.equal(exactOf(lab, lab.addAngleMeasurement2D([b, a, c], 'BAC')), null);
});

test('thirty degrees is not reported, because no such figure has rational corners', () => {
  // cos squared of thirty is three quarters, and setting a ratio of rationals
  // to that forces root three to be rational. So a protractor reading 30 here
  // is reading a rounded 30.0000-something, and saying "exactly 30" would be a
  // confident lie. Built as exactly as a float allows and still refused.
  const lab = createGeometryLab({ initialView: '2d' });
  const origin = lab.addPoint2D({ x: 0, y: 0 });
  const east = lab.addPoint2D({ x: 1, y: 0 });
  const thirty = lab.addPoint2D({ x: Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) });
  const id = lab.addAngleMeasurement2D([east, origin, thirty], 'thirty');

  assert.ok(Math.abs(lab.peekSnapshot().scene.scene2d.measurements[id].value - 30) < 1e-9);
  assert.equal(exactOf(lab, id), null);
});

test('a coordinate that is not a fraction ends the attempt', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0 });
  const b = lab.addPoint2D({ x: Math.PI, y: 0 });
  assert.equal(exactOf(lab, lab.addDistanceMeasurement2D(a, b, 'pi')), null);
});

test('one bad coordinate is enough, however good the rest are', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0 });
  const b = lab.addPoint2D({ x: 3, y: 4 });
  const c = lab.addPoint2D({ x: Math.SQRT2, y: 0 });
  const polygon = lab.addPolygon2D([a, b, c]);
  assert.equal(exactOf(lab, lab.addPerimeterMeasurement2D(polygon, 'perimeter')), null);
  assert.equal(exactOf(lab, lab.addDistanceMeasurement2D(a, b, 'AB')), '5', 'but the good pair is still exact');
});

/* -------------------------------------------------------------------------- */
/* It follows the figure                                                      */
/* -------------------------------------------------------------------------- */

test('dragging a point changes the exact value with it', () => {
  const { lab, a, b } = triangle();
  const id = lab.addLengthMeasurement2D(lab.addSegment2D(a, b), 'AB');
  assert.equal(exactOf(lab, id), '2√5');

  lab.applyDelta({ op: 'updatePoint', id: b, changes: { x: 3, y: 4 } });
  assert.equal(exactOf(lab, id), '5');
});

test('dragging to somewhere inexpressible removes the exact value rather than leaving it stale', () => {
  // A stale exact value is a confident wrong answer, which is worse than none.
  const { lab, a, b } = triangle();
  const id = lab.addLengthMeasurement2D(lab.addSegment2D(a, b), 'AB');
  assert.equal(exactOf(lab, id), '2√5');

  lab.applyDelta({ op: 'updatePoint', id: b, changes: { x: Math.PI, y: 1 } });
  assert.equal(exactOf(lab, id), null);

  lab.applyDelta({ op: 'updatePoint', id: b, changes: { x: 2, y: 4 } });
  assert.equal(exactOf(lab, id), '2√5', 'and comes back when it can be said again');
});

test('an exact value survives a round trip through JSON', () => {
  const { lab, a, b } = triangle();
  const id = lab.addLengthMeasurement2D(lab.addSegment2D(a, b), 'AB');
  const saved = JSON.parse(JSON.stringify(lab.getSnapshot()));

  const reopened = createGeometryLab();
  reopened.loadSnapshot(saved);
  assert.equal(exactOf(reopened, id), '2√5');
});

/* -------------------------------------------------------------------------- */
/* Where it comes out                                                         */
/* -------------------------------------------------------------------------- */

test('the description leads with the exact value and keeps the decimal', () => {
  // A reader still wants to know roughly how big it is; a length given only as
  // a surd is a puzzle rather than a measurement.
  const { lab, a, b } = triangle();
  lab.addLengthMeasurement2D(lab.addSegment2D(a, b), 'AB');
  assert.ok(lab.describe().includes('AB: 2√5 (about 4.472) u'));
});

test('a whole number is not told to the reader twice', () => {
  const { lab, polygon } = triangle();
  lab.addAreaMeasurement2D(polygon, 'area');
  assert.ok(lab.describe().includes('area: 8 u^2'));
  assert.ok(!lab.describe().includes('about 8'));
});

test('LaTeX sets the exact value as mathematics', () => {
  const { lab, a, b, polygon } = triangle();
  lab.addLengthMeasurement2D(lab.addSegment2D(a, b), 'AB');
  lab.addPerimeterMeasurement2D(polygon, 'perimeter');
  return lab.export({ format: 'latex', width: 300, height: 220 }).then(({ data }) => {
    assert.ok(data.includes('$2\\sqrt{5}\\;\\mathrm{u}$'), data.slice(data.indexOf('\\begin{tabular}')));
    assert.ok(data.includes('$4 + 4\\sqrt{5}\\;\\mathrm{u}$'));
  });
});
