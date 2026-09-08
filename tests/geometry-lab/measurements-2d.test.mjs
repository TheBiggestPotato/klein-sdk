/**
 * Measurements over the 2D figure (plan task 2.4).
 *
 * <p>There was no such thing. The Lab could build a triangle, and could not
 * report its area, its perimeter, the length of a side or the size of an angle
 * - the numbers a geometry lesson is mostly about.
 *
 * <p>They follow the 3D design: the *source* is stored and the value is
 * recomputed from it, so a measurement tracks the figure rather than recording
 * what it happened to be when taken. Every case below therefore checks the
 * value twice, once as built and once after the geometry moves under it.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeometryLab } from '../../dist/geometry-lab/index.js';

const round = (value) => Math.round(value * 1e6) / 1e6;
const valueOf = (lab, id) => round(lab.peekSnapshot().scene.scene2d.measurements[id].value);
const unitOf = (lab, id) => lab.peekSnapshot().scene.scene2d.measurements[id].unit;

/** A 3-4-5 right triangle with the right angle at C. */
function rightTriangle() {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 3, y: 4, label: 'B' });
  const c = lab.addPoint2D({ x: 3, y: 0, label: 'C' });
  return { lab, a, b, c, triangle: lab.addPolygon2D([a, c, b]) };
}

/* -------------------------------------------------------------------------- */
/* Each measurement, and its unit                                             */
/* -------------------------------------------------------------------------- */

test('the distance between two points is the hypotenuse', () => {
  const { lab, a, b } = rightTriangle();
  const id = lab.addDistanceMeasurement2D(a, b);
  assert.equal(valueOf(lab, id), 5);
  assert.equal(unitOf(lab, id), 'u');
});

test('a segment reports its own length', () => {
  const { lab, a, b } = rightTriangle();
  assert.equal(valueOf(lab, lab.addLengthMeasurement2D(lab.addSegment2D(a, b))), 5);
});

test('an angle is measured at the middle point', () => {
  const { lab, a, b, c } = rightTriangle();
  const id = lab.addAngleMeasurement2D([a, c, b]);
  assert.equal(valueOf(lab, id), 90);
  assert.equal(unitOf(lab, id), 'deg');
});

test('a polygon reports area and perimeter', () => {
  const { lab, triangle } = rightTriangle();
  const area = lab.addAreaMeasurement2D(triangle);
  const perimeter = lab.addPerimeterMeasurement2D(triangle);
  assert.equal(valueOf(lab, area), 6, 'half of 3 by 4');
  assert.equal(unitOf(lab, area), 'u^2');
  assert.equal(valueOf(lab, perimeter), 12, '3 + 4 + 5');
});

test('polygon area does not depend on winding order', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const points = [
    lab.addPoint2D({ x: 0, y: 0 }),
    lab.addPoint2D({ x: 4, y: 0 }),
    lab.addPoint2D({ x: 4, y: 3 }),
  ];
  const clockwise = lab.addPolygon2D([...points].reverse());
  assert.equal(valueOf(lab, lab.addAreaMeasurement2D(clockwise)), 6, 'the shoelace sum is taken unsigned');
});

test('a point-line distance is perpendicular, not to an endpoint', () => {
  const { lab, a, b, c } = rightTriangle();
  // B is 4 above the line AC, which runs along the x axis.
  assert.equal(valueOf(lab, lab.addPointLineDistanceMeasurement2D(b, lab.addLine2D(a, c))), 4);
});

/* -------------------------------------------------------------------------- */
/* They follow the figure                                                     */
/* -------------------------------------------------------------------------- */

test('every measurement updates when the figure moves', () => {
  const { lab, a, b, c, triangle } = rightTriangle();
  const distance = lab.addDistanceMeasurement2D(a, b);
  const area = lab.addAreaMeasurement2D(triangle);
  const perimeter = lab.addPerimeterMeasurement2D(triangle);
  const height = lab.addPointLineDistanceMeasurement2D(b, lab.addLine2D(a, c));

  lab.applyDelta({ op: 'updatePoint', id: b, changes: { x: 6, y: 8 } });

  assert.equal(valueOf(lab, distance), 10);
  assert.equal(valueOf(lab, height), 8);
  assert.equal(valueOf(lab, area), 12);
  assert.equal(round(valueOf(lab, perimeter)), round(3 + 10 + Math.hypot(3, 8)));
});

test('a measurement over a constructed point follows the construction', () => {
  const { lab, a, b } = rightTriangle();
  const midpoint = lab.addMidpoint2D(a, b);
  const id = lab.addDistanceMeasurement2D(a, midpoint);
  assert.equal(valueOf(lab, id), 2.5);

  lab.applyDelta({ op: 'updatePoint', id: b, changes: { x: 6, y: 8 } });
  assert.equal(valueOf(lab, id), 5, 'the midpoint moved, so the distance to it did too');
});

test('an angle measurement survives a round trip through JSON', () => {
  const { lab, a, b, c } = rightTriangle();
  const id = lab.addAngleMeasurement2D([a, c, b]);
  const saved = JSON.parse(JSON.stringify(lab.getSnapshot()));

  const reopened = createGeometryLab();
  reopened.loadSnapshot(saved);
  assert.equal(valueOf(reopened, id), 90);
});

/* -------------------------------------------------------------------------- */
/* Refusals and cascade                                                       */
/* -------------------------------------------------------------------------- */

test('deleting a source point removes the measurement', () => {
  const { lab, a, b } = rightTriangle();
  const id = lab.addDistanceMeasurement2D(a, b);
  lab.remove(b);
  assert.equal(
    lab.peekSnapshot().scene.scene2d.measurements[id],
    undefined,
    'a measurement cannot outlive what it measures',
  );
});

test('deleting the polygon removes its area and perimeter', () => {
  const { lab, triangle } = rightTriangle();
  const area = lab.addAreaMeasurement2D(triangle);
  const perimeter = lab.addPerimeterMeasurement2D(triangle);
  lab.remove(triangle);
  const measurements = lab.peekSnapshot().scene.scene2d.measurements ?? {};
  assert.equal(measurements[area], undefined);
  assert.equal(measurements[perimeter], undefined);
});

test('a measurement naming something missing is rejected', () => {
  const { lab, a } = rightTriangle();
  assert.throws(
    () => lab.addDistanceMeasurement2D(a, 'no-such-point'),
    error => error.code === 'invalid_delta_result',
  );
  assert.throws(
    () => lab.addAreaMeasurement2D('no-such-polygon'),
    error => error.code === 'invalid_delta_result',
  );
});

test('an area source cannot be declared as a length', () => {
  const { lab, triangle } = rightTriangle();
  assert.throws(
    () => lab.applyDelta({
      op: 'addMeasurement2D',
      measurement: { id: 'wrong', kind: 'length', value: 0, source: { kind: 'polygonArea', entityId: triangle } },
    }),
    error => error.code === 'invalid_delta_result',
  );
});

test('collapsing a line breaks the distance measured to it', () => {
  const { lab, a, b, c } = rightTriangle();
  lab.addPointLineDistanceMeasurement2D(b, lab.addLine2D(a, c));
  assert.throws(
    () => lab.applyDelta({ op: 'updatePoint', id: c, changes: { x: 0, y: 0 } }),
    error => error.code === 'invalid_delta_result',
    'a line with coincident points has no perpendicular to measure along',
  );
});

test('a snapshot written before 2D measurements existed still loads', () => {
  // The collection is optional precisely so no migration is needed.
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0 });
  lab.addPoint2D({ x: 1, y: 1 });
  const saved = JSON.parse(JSON.stringify(lab.getSnapshot()));
  delete saved.scene.scene2d.measurements;

  const reopened = createGeometryLab();
  assert.doesNotThrow(() => reopened.loadSnapshot(saved));
  assert.ok(reopened.peekSnapshot().scene.scene2d.points[a]);
});

test('a measurement id cannot collide with another object', () => {
  // The scan that enforces unique ids across collections has a list of
  // collections, and a new one has to be added to it or ids stop being unique.
  const { lab, a, b } = rightTriangle();
  const id = lab.addDistanceMeasurement2D(a, b);
  assert.throws(
    () => lab.applyDelta({ op: 'addPoint2D', point: { id, kind: 'point2d', x: 9, y: 9 } }),
    error => error.code === 'duplicate_id',
  );
});

test('a snapshot whose measurement names a missing source is refused on load', () => {
  const { lab, a, b } = rightTriangle();
  const id = lab.addDistanceMeasurement2D(a, b);
  const tampered = JSON.parse(JSON.stringify(lab.getSnapshot()));
  tampered.scene.scene2d.measurements[id].source = {
    kind: 'pointDistance',
    firstPointId: 'ghost',
    secondPointId: b,
  };
  assert.throws(
    () => createGeometryLab().loadSnapshot(tampered),
    error => error.code === 'invalid_snapshot',
  );
});

test('undo removes a measurement and redo brings it back', () => {
  const { lab, a, b } = rightTriangle();
  const id = lab.addDistanceMeasurement2D(a, b);
  assert.equal(valueOf(lab, id), 5);

  lab.undo();
  assert.equal((lab.peekSnapshot().scene.scene2d.measurements ?? {})[id], undefined);

  lab.redo();
  assert.equal(valueOf(lab, id), 5);
});
