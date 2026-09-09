/**
 * Sliders, traces and the dynamic locus (plan task 6.1).
 *
 * <p>`slider` appeared once in the whole codebase - an enum member with nothing
 * behind it - and `addLocus` took a list of coordinates somebody had computed
 * elsewhere, which made it a picture of a locus rather than one. What was
 * missing is the idea that turns a drawing into an experiment: a point placed
 * at a *parameter* rather than at a position, and a curve that is what a point
 * does as that parameter sweeps.
 *
 * <p>So the tests that matter are the ones that move something afterwards. A
 * locus that only held together where it was built would pass none of them.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { GeometryTrace, createGeometryLab } from '../../dist/geometry-lab/index.js';

const round = (value) => Math.round(value * 1e6) / 1e6;
const at = (lab, id) => {
  const point = lab.peekSnapshot().scene.scene2d.points[id];
  return [round(point.x), round(point.y)];
};

/**
 * A point sweeping a circle of radius 6 about the origin, and the midpoint of
 * it and a fixed point at (10, 0) - whose locus is a circle of radius 3 about
 * (5, 0). Chosen because every point of the answer can be checked exactly.
 */
function midpointLocus(samples = 16) {
  const lab = createGeometryLab({ initialView: '2d' });
  const o = lab.addPoint2D({ x: 0, y: 0, label: 'O' });
  const rim = lab.addPoint2D({ x: 6, y: 0, label: 'R' });
  const circle = lab.addCircle2D(o, rim);
  const t = lab.addSlider2D({ name: 't' });
  const sweeping = lab.addPointOnPath2D(circle, { sliderId: t }, { label: 'P' });
  const fixed = lab.addPoint2D({ x: 10, y: 0, label: 'A' });
  const tracer = lab.addMidpoint2D(fixed, sweeping, { label: 'M' });
  return { lab, o, rim, circle, t, sweeping, fixed, tracer, locus: lab.addDynamicLocus2D(t, tracer, { samples }) };
}

const locusPoints = (lab, id) => lab.peekSnapshot().scene.scene2d.entities[id].points;

/* -------------------------------------------------------------------------- */
/* A point at a parameter                                                     */
/* -------------------------------------------------------------------------- */

test('a point on a circle is placed by the number, not by hand', () => {
  const { lab, t, sweeping } = midpointLocus();
  assert.deepEqual(at(lab, sweeping), [6, 0], 'nought is the start');
  lab.setSliderValue2D(t, 0.25);
  assert.deepEqual(at(lab, sweeping), [0, 6], 'a quarter of the way round');
  lab.setSliderValue2D(t, 0.5);
  assert.deepEqual(at(lab, sweeping), [-6, 0]);
});

test('a parameter past the end of a circle goes round again', () => {
  // Three-quarters of the way round twice is three-quarters of the way round,
  // so the parameter wraps rather than sticking at the end.
  const lab = createGeometryLab({ initialView: '2d' });
  const o = lab.addPoint2D({ x: 0, y: 0 });
  const rim = lab.addPoint2D({ x: 4, y: 0 });
  const circle = lab.addCircle2D(o, rim);
  assert.deepEqual(at(lab, lab.addPointOnPath2D(circle, 0.25)), [0, 4]);
  assert.deepEqual(at(lab, lab.addPointOnPath2D(circle, 1.25)), [0, 4]);
});

test('a segment has ends, so its parameter stops at them', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0 });
  const b = lab.addPoint2D({ x: 10, y: 0 });
  const segment = lab.addSegment2D(a, b);
  assert.deepEqual(at(lab, lab.addPointOnPath2D(segment, 0.3)), [3, 0]);
  assert.deepEqual(at(lab, lab.addPointOnPath2D(segment, 5)), [10, 0], 'past the end is the end');
  assert.deepEqual(at(lab, lab.addPointOnPath2D(segment, -2)), [0, 0]);
});

test('a line has no ends, so its parameter runs past its two points', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0 });
  const b = lab.addPoint2D({ x: 10, y: 0 });
  const line = lab.addLine2D(a, b);
  assert.deepEqual(at(lab, lab.addPointOnPath2D(line, 2)), [20, 0]);
  assert.deepEqual(at(lab, lab.addPointOnPath2D(line, -1)), [-10, 0]);
});

test('a polygon is walked by arc length round its perimeter', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0 });
  const b = lab.addPoint2D({ x: 4, y: 0 });
  const c = lab.addPoint2D({ x: 4, y: 3 });
  const triangle = lab.addPolygon2D([a, b, c]);
  // Sides are 4, 3 and 5, so a perimeter of 12: a third of the way round is
  // the far end of the first side.
  assert.deepEqual(at(lab, lab.addPointOnPath2D(triangle, 1 / 3)), [4, 0]);
});

test('a point on a path follows the object it sits on', () => {
  const { lab, rim, sweeping } = midpointLocus();
  assert.deepEqual(at(lab, sweeping), [6, 0]);
  lab.applyDelta({ op: 'updatePoint', id: rim, changes: { x: 9, y: 0 } });
  assert.deepEqual(at(lab, sweeping), [9, 0], 'the circle grew and the point stayed on it');
});

/* -------------------------------------------------------------------------- */
/* The curve that a point traces                                              */
/* -------------------------------------------------------------------------- */

test('a locus is the path the tracer takes, not a list somebody typed', () => {
  const { lab, locus } = midpointLocus(16);
  const points = locusPoints(lab, locus);
  assert.equal(points.length, 16);
  const radii = new Set(points.map(point => round(Math.hypot(point.x - 5, point.y))));
  assert.deepEqual([...radii], [3], 'every one is exactly three from (5, 0)');
});

test('the curve follows the figure that generates it', () => {
  // The whole difference between a locus and a picture of one.
  const { lab, rim, locus } = midpointLocus(16);
  lab.applyDelta({ op: 'updatePoint', id: rim, changes: { x: 12, y: 0 } });
  const radii = new Set(locusPoints(lab, locus).map(point => round(Math.hypot(point.x - 5, point.y))));
  assert.deepEqual([...radii], [6], 'twice the circle, twice the curve');
});

test('moving the fixed point moves the curve with it', () => {
  const { lab, fixed, locus } = midpointLocus(16);
  lab.applyDelta({ op: 'updatePoint', id: fixed, changes: { x: 0, y: 0 } });
  const radii = new Set(locusPoints(lab, locus).map(point => round(Math.hypot(point.x, point.y))));
  assert.deepEqual([...radii], [3], 'now centred on the origin');
});

test('the sweep leaves the figure where the student left it', () => {
  const { lab, t, sweeping } = midpointLocus(16);
  lab.setSliderValue2D(t, 0.5);
  assert.deepEqual(at(lab, sweeping), [-6, 0]);
  assert.equal(lab.peekSnapshot().scene.scene2d.sliders[t].value, 0.5, 'sampling did not move the slider');
});

test('a locus survives a round trip through JSON and is still live', () => {
  const { lab, rim, locus } = midpointLocus(16);
  const saved = JSON.parse(JSON.stringify(lab.getSnapshot()));

  const reopened = createGeometryLab();
  reopened.loadSnapshot(saved);
  reopened.applyDelta({ op: 'updatePoint', id: rim, changes: { x: 12, y: 0 } });
  const radii = new Set(locusPoints(reopened, locus).map(point => round(Math.hypot(point.x - 5, point.y))));
  assert.deepEqual([...radii], [6]);
});

test('more samples make a smoother curve, and the cap is a cap', () => {
  const coarse = midpointLocus(8);
  assert.equal(locusPoints(coarse.lab, coarse.locus).length, 8);
  const greedy = midpointLocus(1000);
  assert.equal(locusPoints(greedy.lab, greedy.locus).length, 256, 'a figure cannot make one edit unaffordable');
});

test('two loci on one figure do not sample each other', () => {
  // Without excluding loci from the sweep this recurs until the stack gives
  // out, and short of that it is quadratic in the number of curves.
  const { lab, t, tracer, sweeping } = midpointLocus(16);
  const second = lab.addDynamicLocus2D(t, sweeping, { samples: 16 });
  assert.equal(locusPoints(lab, second).length, 16);
  assert.equal(lab.peekSnapshot().scene.scene2d.points[tracer] !== undefined, true);
});

test('deleting the slider takes the curve with it', () => {
  const { lab, t, locus } = midpointLocus();
  lab.remove(t);
  assert.equal(lab.peekSnapshot().scene.scene2d.entities[locus], undefined);
});

test('a locus that has lost its tracer is refused rather than left wrong', () => {
  const { lab, tracer, locus } = midpointLocus();
  lab.remove(tracer);
  assert.equal(lab.peekSnapshot().scene.scene2d.entities[locus], undefined);
});

/* -------------------------------------------------------------------------- */
/* Sliders                                                                    */
/* -------------------------------------------------------------------------- */

test('a slider is clamped to its own range rather than refusing', () => {
  const { lab, t } = midpointLocus();
  lab.setSliderValue2D(t, 5);
  assert.equal(lab.peekSnapshot().scene.scene2d.sliders[t].value, 1, 'a control dragged past its end stops there');
  lab.setSliderValue2D(t, -5);
  assert.equal(lab.peekSnapshot().scene.scene2d.sliders[t].value, 0);
});

test('a slider with an impossible range is refused', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  assert.throws(() => lab.addSlider2D({ name: 'bad', min: 5, max: 1 }), error => error.code === 'invalid_slider');
});

test('naming a slider that does not exist is refused', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0 });
  const b = lab.addPoint2D({ x: 4, y: 0 });
  const segment = lab.addSegment2D(a, b);
  assert.throws(() => lab.addPointOnPath2D(segment, { sliderId: 'ghost' }), error => error.code === 'missing_slider');
  assert.throws(() => lab.setSliderValue2D('ghost', 1), error => error.code === 'missing_slider');
});

test('a slider is undone like anything else', () => {
  const { lab, t } = midpointLocus();
  lab.setSliderValue2D(t, 0.5);
  lab.undo();
  assert.equal(lab.peekSnapshot().scene.scene2d.sliders[t].value, 0);
});

/* -------------------------------------------------------------------------- */
/* Traces                                                                     */
/* -------------------------------------------------------------------------- */

test('the ring keeps its last positions and counts what fell off', () => {
  // A trace is unbounded by nature, so it is a fixed buffer that overwrites
  // rather than a list that grows for as long as a lesson lasts.
  const trace = new GeometryTrace(4);
  for (let step = 0; step < 10; step += 1) trace.record({ x: step, y: 0 });
  assert.equal(trace.length, 4);
  assert.equal(trace.capacity, 4);
  assert.equal(trace.dropped, 6, 'a curve that has lost its beginning can say so');
  assert.deepEqual(trace.points().map(point => point.x), [6, 7, 8, 9], 'oldest first');
});

test('a repeated position is not recorded twice', () => {
  const trace = new GeometryTrace(8);
  trace.record({ x: 1, y: 1 });
  trace.record({ x: 1, y: 1 });
  trace.record({ x: 2, y: 1 });
  assert.equal(trace.length, 2, 'a still life is not a history');
});

test('a position that is not a number is not recorded', () => {
  const trace = new GeometryTrace(8);
  trace.record({ x: Number.NaN, y: 0 });
  trace.record({ x: 0, y: Number.POSITIVE_INFINITY });
  assert.equal(trace.length, 0);
});

test('a traced point records where it goes as the figure changes', () => {
  const { lab, t, sweeping } = midpointLocus();
  lab.startTrace2D(sweeping);
  for (const value of [0.1, 0.2, 0.3]) lab.setSliderValue2D(t, value);

  const trace = lab.getTrace2D(sweeping);
  assert.equal(trace.length, 4, 'where it started, and three moves');
  assert.deepEqual(trace.points()[0], { x: 6, y: 0 });
  assert.deepEqual(lab.tracedPointIds(), [sweeping]);
});

test('a trace is not part of the document', () => {
  // It is a record of what this session did, not a property of the figure -
  // and putting it in the snapshot would send it through undo, the history
  // diff and every collaborative message.
  const { lab, sweeping } = midpointLocus();
  lab.startTrace2D(sweeping);
  const saved = JSON.stringify(lab.getSnapshot());
  // `tracerId` is in there - it is how the locus names the point it follows -
  // so what is checked is that no recorded position went with it.
  assert.ok(!saved.includes('"traces"'));
  assert.ok(!saved.includes('positions'));

  const reopened = createGeometryLab();
  reopened.loadSnapshot(JSON.parse(saved));
  assert.deepEqual(reopened.tracedPointIds(), []);
});

test('a traced point that is deleted stops being traced', () => {
  const { lab, sweeping } = midpointLocus();
  lab.startTrace2D(sweeping);
  lab.remove(sweeping);
  assert.deepEqual(lab.tracedPointIds(), []);
});

test('tracing something that is not there is refused', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  assert.throws(() => lab.startTrace2D('ghost'), error => error.code === 'invalid_point_reference');
});
