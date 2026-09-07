/**
 * The Lab's 2D construction API (plan tasks 2.1 and 2.2).
 *
 * <p>`GeometryLabTool` has always declared point, segment, polygon, circle,
 * angle, midpoint, perpendicular, parallel and bisector. Not one of them had a
 * method: every function on the instrument was 3D, so a host wanting a midpoint
 * had to hand-assemble an `addPoint2D` delta and get the construction metadata
 * right itself - which is exactly the part that makes the point *follow* its
 * sources rather than sit where it was put.
 *
 * <p>The geometry is shared with the Geometry Calculator through geometry-core,
 * so these tests care about two things: that each tool produces the right
 * object, and that the object stays right when its sources move.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeometryLab } from '../../dist/geometry-lab/index.js';

const round = (value) => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
};
const at = (lab, id) => {
  const point = lab.peekSnapshot().scene.scene2d.points[id];
  return [round(point.x), round(point.y)];
};
const entity = (lab, id) => lab.peekSnapshot().scene.scene2d.entities[id];

/** A triangle ABC with AB along the x axis. */
function triangle() {
  const lab = createGeometryLab();
  return {
    lab,
    a: lab.addPoint2D({ x: 0, y: 0, label: 'A' }),
    b: lab.addPoint2D({ x: 8, y: 0, label: 'B' }),
    c: lab.addPoint2D({ x: 4, y: 6, label: 'C' }),
  };
}

/* -------------------------------------------------------------------------- */
/* Each declared tool has a method                                            */
/* -------------------------------------------------------------------------- */

test('a free point is placed where it was asked for', () => {
  const lab = createGeometryLab();
  const id = lab.addPoint2D({ x: 1.5, y: -2.5, label: 'P', color: '#ff0000' });
  assert.deepEqual(at(lab, id), [1.5, -2.5]);
  const point = lab.peekSnapshot().scene.scene2d.points[id];
  assert.equal(point.label, 'P');
  assert.equal(point.color, '#ff0000');
});

test('segments, rays and vectors join two points', () => {
  const { lab, a, b } = triangle();
  for (const [method, kind] of [['addSegment2D', 'segment'], ['addRay2D', 'ray'], ['addVector2D', 'vector']]) {
    const id = lab[method](a, b, { label: kind });
    const built = entity(lab, id);
    assert.equal(built.kind, kind);
    assert.deepEqual(built.pointIds, [a, b]);
    assert.equal(built.label, kind);
  }
});

test('a polygon takes its vertices in order', () => {
  const { lab, a, b, c } = triangle();
  const id = lab.addPolygon2D([a, b, c]);
  assert.deepEqual(entity(lab, id).pointIds, [a, b, c]);
});

test('an angle names its vertex in the middle', () => {
  const { lab, a, b, c } = triangle();
  const id = lab.addAngle2D([a, c, b]);
  const built = entity(lab, id);
  assert.equal(built.kind, 'angle');
  assert.deepEqual(built.pointIds, [a, c, b]);
});

test('a midpoint lands between its sources', () => {
  const { lab, a, b } = triangle();
  assert.deepEqual(at(lab, lab.addMidpoint2D(a, b)), [4, 0]);
});

test('a line through two points carries its equation', () => {
  const { lab, a, b } = triangle();
  const id = lab.addLine2D(a, b);
  const built = entity(lab, id);
  assert.equal(built.kind, 'line');
  assert.ok(built.equation, 'a line needs an equation for later constructions to use');
});

test('a circle takes its radius from a point on it', () => {
  const { lab, a, b } = triangle();
  const id = lab.addCircle2D(a, b);
  assert.equal(entity(lab, id).radius, 8);
});

test('a circle through three points passes through all three', () => {
  const { lab, a, b, c } = triangle();
  const id = lab.addCircleThroughPoints2D([a, b, c]);
  const circle = entity(lab, id);
  const scene = lab.peekSnapshot().scene.scene2d;
  const centre = scene.points[circle.centerId];
  for (const vertex of [a, b, c]) {
    const point = scene.points[vertex];
    const distance = Math.hypot(point.x - centre.x, point.y - centre.y);
    assert.equal(round(distance), round(circle.radius));
  }
});

test('perpendicular and parallel lines are built through a given point', () => {
  const { lab, a, b, c } = triangle();
  const ab = lab.addLine2D(a, b);

  const perpendicular = entity(lab, lab.addPerpendicularLine2D(ab, c));
  const parallel = entity(lab, lab.addParallelLine2D(ab, c));

  // AB lies along the x axis, so the parallel through C is horizontal and the
  // perpendicular is vertical.
  assert.equal(round(parallel.equation.a), 0, 'a parallel to the x axis has no x term');
  assert.equal(round(perpendicular.equation.b), 0, 'a perpendicular to the x axis has no y term');
});

test('an angle bisector starts at the vertex', () => {
  const { lab, a, b, c } = triangle();
  const id = lab.addAngleBisector2D([a, c, b]);
  const built = entity(lab, id);
  assert.equal(built.pointIds[0], c, 'the bisector is anchored at the angle vertex');
  assert.equal(built.construction.kind, 'angleBisector');
});

test('an intersection lands where two objects meet', () => {
  const { lab, a, b, c } = triangle();
  const ab = lab.addLine2D(a, b);
  const foot = lab.addIntersection2D(lab.addPerpendicularLine2D(ab, c), ab);
  assert.deepEqual(at(lab, foot), [4, 0], 'the foot of the perpendicular from C to AB');
});

/* -------------------------------------------------------------------------- */
/* And every construction is live                                             */
/* -------------------------------------------------------------------------- */

test('a midpoint follows both of its sources', () => {
  const { lab, a, b } = triangle();
  const mid = lab.addMidpoint2D(a, b);

  lab.applyDelta({ op: 'updatePoint', id: b, changes: { x: 20 } });
  assert.deepEqual(at(lab, mid), [10, 0]);

  lab.applyDelta({ op: 'updatePoint', id: a, changes: { x: -4, y: 4 } });
  assert.deepEqual(at(lab, mid), [8, 2]);
});

test('a circle keeps its radius on the point that defines it', () => {
  const { lab, a, b } = triangle();
  const circle = lab.addCircle2D(a, b);
  assert.equal(entity(lab, circle).radius, 8);

  lab.applyDelta({ op: 'updatePoint', id: b, changes: { x: 20 } });
  assert.equal(entity(lab, circle).radius, 20);
});

test('a perpendicular turns when its source line turns', () => {
  const { lab, a, b, c } = triangle();
  const ab = lab.addLine2D(a, b);
  const perpendicular = lab.addPerpendicularLine2D(ab, c);
  assert.equal(round(entity(lab, perpendicular).equation.b), 0, 'vertical to start with');

  // Stand AB up on the y axis; its perpendicular must become horizontal.
  lab.applyDelta({ op: 'updatePoint', id: b, changes: { x: 0, y: 8 } });
  assert.equal(round(entity(lab, perpendicular).equation.a), 0, 'now horizontal');
});

test('the foot of a perpendicular tracks the point it is dropped from', () => {
  const { lab, a, b, c } = triangle();
  const ab = lab.addLine2D(a, b);
  const foot = lab.addIntersection2D(lab.addPerpendicularLine2D(ab, c), ab);
  assert.deepEqual(at(lab, foot), [4, 0]);

  lab.applyDelta({ op: 'updatePoint', id: c, changes: { x: 6.5, y: 3 } });
  assert.deepEqual(at(lab, foot), [6.5, 0], 'the foot slid with C');
});

test('a construction chain settles in one commit', () => {
  // Midpoint of AB, then the perpendicular to AB through it: the perpendicular
  // bisector, which has to resolve behind the midpoint in a single edit.
  const { lab, a, b } = triangle();
  const ab = lab.addLine2D(a, b);
  const mid = lab.addMidpoint2D(a, b);
  const bisector = lab.addPerpendicularLine2D(ab, mid);

  assert.deepEqual(at(lab, mid), [4, 0]);
  lab.applyDelta({ op: 'updatePoint', id: b, changes: { x: 20 } });

  assert.deepEqual(at(lab, mid), [10, 0]);
  const line = entity(lab, bisector);
  assert.equal(line.pointIds[0], mid);
  // A vertical line through x = 10: no y term, and x = 10 satisfies it.
  assert.equal(round(line.equation.b), 0);
  assert.equal(round(line.equation.a * 10 + line.equation.c), 0);
});

/* -------------------------------------------------------------------------- */
/* Refusals                                                                   */
/* -------------------------------------------------------------------------- */

test('constructions refuse missing or unusable sources', () => {
  const { lab, a, b } = triangle();
  assert.throws(() => lab.addMidpoint2D(a, 'ghost'), error => error.code === 'invalid_point_reference');
  assert.throws(() => lab.addMidpoint2D(a, a), error => error.code === 'invalid_midpoint');
  assert.throws(() => lab.addSegment2D(a, a), error => error.code === 'invalid_segment');
  assert.throws(() => lab.addPolygon2D([a, b]), error => error.code === 'invalid_polygon');
  assert.throws(() => lab.addPolygon2D([a, b, a]), error => error.code === 'invalid_polygon');
  assert.throws(() => lab.addAngle2D([a, a, b]), error => error.code === 'invalid_angle');
  assert.throws(() => lab.addCircle2D(a, a), error => error.code === 'invalid_circle');
  assert.throws(() => lab.addPerpendicularLine2D('ghost', a), error => error.code === 'invalid_entity_reference');
});

test('three collinear points do not make a circle', () => {
  const lab = createGeometryLab();
  const points = [
    lab.addPoint2D({ x: 0, y: 0 }),
    lab.addPoint2D({ x: 1, y: 0 }),
    lab.addPoint2D({ x: 2, y: 0 }),
  ];
  assert.throws(() => lab.addCircleThroughPoints2D(points), error => error.code === 'invalid_circle');
});

test('a failed construction leaves nothing behind', () => {
  const { lab, a, b } = triangle();
  const before = lab.peekSnapshot().scene.scene2d;
  const pointCount = Object.keys(before.points).length;
  const entityCount = Object.keys(before.entities).length;

  assert.throws(() => lab.addCircle2D(a, a));
  assert.throws(() => lab.addMidpoint2D(a, a));
  assert.throws(() => lab.addPolygon2D([a, b]));

  const after = lab.peekSnapshot().scene.scene2d;
  assert.equal(Object.keys(after.points).length, pointCount, 'no half-built helper points');
  assert.equal(Object.keys(after.entities).length, entityCount);
});

test('helper points stay hidden and do not take the caller style', () => {
  const { lab, a, b, c } = triangle();
  const ab = lab.addLine2D(a, b);
  const line = lab.addPerpendicularLine2D(ab, c, { label: 'height', color: '#00ff00' });

  const scene = lab.peekSnapshot().scene.scene2d;
  const built = scene.entities[line];
  assert.equal(built.label, 'height', 'the line the caller asked for is styled');

  const helper = scene.points[built.pointIds[1]];
  assert.equal(helper.hidden, true, 'the direction helper is scaffolding, not an object');
  assert.equal(helper.label, undefined, 'and must not appear in an object list wearing the caller label');
});

test('2D constructions cascade on delete like their 3D counterparts', () => {
  const { lab, a, b } = triangle();
  const mid = lab.addMidpoint2D(a, b);
  lab.remove(a);
  assert.equal(
    lab.peekSnapshot().scene.scene2d.points[mid],
    undefined,
    'a midpoint cannot outlive an endpoint',
  );
});
