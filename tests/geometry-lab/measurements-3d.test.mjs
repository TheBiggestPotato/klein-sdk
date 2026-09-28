/**
 * The 3D measurements solid geometry is actually about (plan task 2.5).
 *
 * <p>`MeasurementSource3D` covered four things: point-plane distance, volume,
 * surface area, dihedral angle. That leaves out how far apart two points are,
 * how far a point is from a line, the angle a line makes with another line or
 * with a plane, and the distance between two lines that never meet - which is
 * most of what a spatial geometry lesson asks for.
 *
 * <p>Each is committed as a *source* and computed by canonicalization, the same
 * way the existing four are, so the tests below check the value twice: once for
 * being right, and once for still being right after the geometry moves.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeometryLab } from '../../dist/geometry-lab/index.js';

const round = (value) => Math.round(value * 1e6) / 1e6;
const valueOf = (lab, id) => round(lab.peekSnapshot().scene.scene3d.measurements[id].value);

/** The x axis, plus whatever else a case needs. */
function axes() {
  const lab = createGeometryLab();
  const origin = lab.addPoint3D({ x: 0, y: 0, z: 0 });
  const alongX = lab.addPoint3D({ x: 1, y: 0, z: 0 });
  return { lab, origin, alongX, xAxis: lab.addLine3D(origin, alongX) };
}

/* -------------------------------------------------------------------------- */
/* Distances                                                                  */
/* -------------------------------------------------------------------------- */

test('the distance between two points is a 3-4-5 triangle', () => {
  const lab = createGeometryLab();
  const a = lab.addPoint3D({ x: 0, y: 0, z: 0 });
  const b = lab.addPoint3D({ x: 3, y: 4, z: 0 });
  const id = lab.addDistanceMeasurement3D(a, b);
  assert.equal(valueOf(lab, id), 5);

  lab.applyDelta({ op: 'updatePoint', id: b, changes: { x: 6, y: 8 } });
  assert.equal(valueOf(lab, id), 10, 'the measurement follows the point');
});

test('a point-line distance is the perpendicular one, not the distance to an endpoint', () => {
  const { lab, xAxis } = axes();
  // Far along the axis but 5 above it: the answer is 5, not the 8.6 to the
  // line's own defining point.
  const point = lab.addPoint3D({ x: 7, y: 0, z: 5 });
  const id = lab.addPointLineDistanceMeasurement(point, xAxis);
  assert.equal(valueOf(lab, id), 5);

  lab.applyDelta({ op: 'updatePoint', id: point, changes: { x: -20, z: 12 } });
  assert.equal(valueOf(lab, id), 12, 'sliding along the line changes nothing; rising does');
});

test('two skew lines are measured along their common perpendicular', () => {
  const { lab, xAxis } = axes();
  // A line parallel to y, six units above the x axis: they never meet.
  const first = lab.addPoint3D({ x: 0, y: 0, z: 6 });
  const second = lab.addPoint3D({ x: 0, y: 1, z: 6 });
  const id = lab.addLineDistanceMeasurement(xAxis, lab.addLine3D(first, second));
  assert.equal(valueOf(lab, id), 6);

  for (const point of [first, second]) lab.applyDelta({ op: 'updatePoint', id: point, changes: { z: 10 } });
  assert.equal(valueOf(lab, id), 10);
});

test('parallel lines still have a distance, though they share no perpendicular', () => {
  const { lab, xAxis } = axes();
  const first = lab.addPoint3D({ x: 0, y: 3, z: 0 });
  const second = lab.addPoint3D({ x: 1, y: 3, z: 0 });
  const id = lab.addLineDistanceMeasurement(xAxis, lab.addLine3D(first, second));
  assert.equal(valueOf(lab, id), 3, 'the cross product vanishes, so it is measured point-to-line instead');
});

test('intersecting lines are zero apart', () => {
  const { lab, xAxis, origin } = axes();
  const up = lab.addPoint3D({ x: 0, y: 0, z: 1 });
  const id = lab.addLineDistanceMeasurement(xAxis, lab.addLine3D(origin, up));
  assert.equal(valueOf(lab, id), 0);
});

/* -------------------------------------------------------------------------- */
/* Angles                                                                     */
/* -------------------------------------------------------------------------- */

test('the angle between two lines is the acute one', () => {
  const { lab, xAxis, origin } = axes();
  const diagonal = lab.addLine3D(origin, lab.addPoint3D({ x: 1, y: 1, z: 0 }));
  const id = lab.addLineAngleMeasurement(xAxis, diagonal);
  assert.equal(valueOf(lab, id), 45);
});

test('reversing a line does not change the angle it makes', () => {
  // A line has no preferred direction, so the answer must never come back
  // obtuse just because the defining points were given the other way round.
  const { lab, xAxis, origin } = axes();
  const backwards = lab.addLine3D(lab.addPoint3D({ x: -1, y: -1, z: 0 }), origin);
  assert.equal(valueOf(lab, lab.addLineAngleMeasurement(xAxis, backwards)), 45);
});

test('a line-plane angle is measured from the plane, not from its normal', () => {
  const { lab, xAxis } = axes();
  const vertical = lab.addLine3D(
    lab.addPoint3D({ x: 2, y: 2, z: 0 }),
    lab.addPoint3D({ x: 2, y: 2, z: 1 }),
  );
  assert.equal(valueOf(lab, lab.addLinePlaneAngleMeasurement(vertical, 'xy')), 90, 'perpendicular to the plane');
  assert.equal(valueOf(lab, lab.addLinePlaneAngleMeasurement(xAxis, 'xy')), 0, 'lying in the plane');
});

test('a line-plane angle follows the line as it tilts', () => {
  const lab = createGeometryLab();
  const base = lab.addPoint3D({ x: 0, y: 0, z: 0 });
  const tip = lab.addPoint3D({ x: 1, y: 0, z: 1 });
  const id = lab.addLinePlaneAngleMeasurement(lab.addLine3D(base, tip), 'xy');
  assert.equal(valueOf(lab, id), 45);

  lab.applyDelta({ op: 'updatePoint', id: tip, changes: { x: 0, y: 0, z: 1 } });
  assert.equal(valueOf(lab, id), 90, 'stood upright');
});

/* -------------------------------------------------------------------------- */
/* Refusals                                                                   */
/* -------------------------------------------------------------------------- */

test('a measurement whose source disappears is removed with it', () => {
  const { lab, xAxis } = axes();
  const point = lab.addPoint3D({ x: 0, y: 0, z: 4 });
  const id = lab.addPointLineDistanceMeasurement(point, xAxis);
  assert.ok(lab.peekSnapshot().scene.scene3d.measurements[id]);

  lab.remove(xAxis);
  assert.equal(
    lab.peekSnapshot().scene.scene3d.measurements[id],
    undefined,
    'a measurement cannot outlive what it measures',
  );
});

test('a measurement declared with the wrong kind is rejected', () => {
  const { lab, xAxis, origin } = axes();
  const other = lab.addLine3D(origin, lab.addPoint3D({ x: 0, y: 1, z: 0 }));
  assert.throws(
    () => lab.applyDelta({
      op: 'addMeasurement',
      measurement: {
        id: 'wrong',
        targetId: xAxis,
        // An angle source cannot produce a length.
        kind: 'length',
        value: 0,
        source: { kind: 'lineLineAngle', firstLineId: xAxis, secondLineId: other },
      },
    }),
    error => error.code === 'invalid_delta_result',
  );
});

test('a measurement naming a missing line is rejected', () => {
  const { lab } = axes();
  const point = lab.addPoint3D({ x: 0, y: 0, z: 1 });
  assert.throws(
    () => lab.addPointLineDistanceMeasurement(point, 'no-such-line'),
    error => error.code === 'invalid_delta_result',
  );
});

test('a line whose defining points coincide cannot be measured against', () => {
  const lab = createGeometryLab();
  const a = lab.addPoint3D({ x: 0, y: 0, z: 0 });
  const b = lab.addPoint3D({ x: 1, y: 0, z: 0 });
  const line = lab.addLine3D(a, b);
  const point = lab.addPoint3D({ x: 0, y: 0, z: 5 });
  lab.addPointLineDistanceMeasurement(point, line);

  assert.throws(
    () => lab.applyDelta({ op: 'updatePoint', id: b, changes: { x: 0, y: 0, z: 0 } }),
    error => error.code === 'invalid_delta_result',
    'collapsing the line leaves nothing to measure from',
  );
});
