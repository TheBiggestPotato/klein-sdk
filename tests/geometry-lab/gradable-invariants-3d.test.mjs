/**
 * What a construction in space can be marked on (plan task 4.3b).
 *
 * <p>Split from the plane pass because three things are genuinely different: a
 * vocabulary that only exists once there is a third dimension to miss in, a
 * scale of its own so a small plane figure beside a large solid is not measured
 * against the wrong yardstick, and its own idea of which points belong to the
 * student rather than to a mesh.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { checkGeometryGoal, createGeometryLab } from '../../dist/geometry-lab/index.js';

const facts = (lab) => lab.getInvariants().invariants;
const has = (lab, fact) => facts(lab).includes(fact);

/** Four points on z = 0, one above them, and three planes. */
function box() {
  const lab = createGeometryLab();
  const base = lab.addWorkPlaneByEquation({ a: 0, b: 0, c: 1, d: 0 }, { label: 'base' });
  const top = lab.addWorkPlaneByEquation({ a: 0, b: 0, c: 1, d: -5 }, { label: 'top' });
  const side = lab.addWorkPlaneByEquation({ a: 1, b: 0, c: 0, d: 0 }, { label: 'side' });
  const points = {};
  for (const [label, x, y, z] of [['A', 0, 0, 0], ['B', 4, 0, 0], ['C', 4, 3, 0], ['D', 0, 3, 0], ['E', 0, 0, 6]]) {
    points[label] = lab.addPoint3D({ x, y, z, label });
  }
  return { lab, base, top, side, ...points };
}

/* -------------------------------------------------------------------------- */
/* Points and planes                                                          */
/* -------------------------------------------------------------------------- */

test('a point on a plane, and a point off it', () => {
  const { lab } = box();
  assert.ok(has(lab, 'point-on-plane:A,plane(base)'));
  assert.ok(has(lab, 'point-on-plane:C,plane(base)'));
  assert.ok(!has(lab, 'point-on-plane:E,plane(base)'), 'E is six units above it');
});

test('coplanar names the whole set on a plane, not every four of them', () => {
  // A plane with ten points on it has two hundred and ten four-element subsets.
  const { lab } = box();
  assert.ok(has(lab, 'coplanar:A,B,C,D'));
  assert.equal(facts(lab).filter(fact => fact.startsWith('coplanar:')).length, 1);
});

test('three points on a plane are not worth calling coplanar', () => {
  const lab = createGeometryLab();
  lab.addWorkPlaneByEquation({ a: 0, b: 0, c: 1, d: 0 }, { label: 'base' });
  for (const [label, x, y] of [['A', 0, 0], ['B', 4, 0], ['C', 4, 3]]) {
    lab.addPoint3D({ x, y, z: 0, label });
  }
  assert.ok(!facts(lab).some(fact => fact.startsWith('coplanar:')), 'any three points are');
});

test('a mark scheme naming some of a coplanar set still marks', () => {
  // The whole reason the maximal set is worth stating: coplanarity holds of
  // every subset, so an author asking about four of ten does not have to guess
  // which ten the student drew.
  const { lab } = box();
  const snapshot = lab.getSnapshot();
  assert.equal(checkGeometryGoal(snapshot, ['coplanar:A,B,C,D']).satisfied, true);
  assert.equal(checkGeometryGoal(snapshot, ['coplanar:A,B,C']).satisfied, true);
  assert.equal(checkGeometryGoal(snapshot, ['coplanar:D,B,A']).satisfied, true, 'and in any order');
  assert.equal(checkGeometryGoal(snapshot, ['coplanar:A,B,E']).satisfied, false, 'E is not on it');
});

test('a subset goal does not leave its own superset sitting in extra', () => {
  const { lab } = box();
  const result = checkGeometryGoal(lab.getSnapshot(), ['coplanar:A,B,C']);
  assert.ok(
    !result.extra.some(fact => fact.startsWith('coplanar:')),
    'the fact that answered the goal is not also something the figure has as well',
  );
});

test('parallel and perpendicular planes', () => {
  const { lab } = box();
  assert.ok(has(lab, 'parallel-planes:plane(base),plane(top)'), 'z = 0 and z = 5');
  assert.ok(has(lab, 'perpendicular-planes:plane(base),plane(side)'), 'z = 0 and x = 0');
  assert.ok(!has(lab, 'parallel-planes:plane(base),plane(side)'));
});

/* -------------------------------------------------------------------------- */
/* Lines against planes                                                       */
/* -------------------------------------------------------------------------- */

test('a line standing on a plane and a line lying along one', () => {
  // Perpendicular to a plane means parallel to its normal, and parallel to a
  // plane means perpendicular to it. Getting these the wrong way round would
  // be easy to do and hard to see, so both are pinned.
  const { lab, A, B, E } = box();
  lab.addSegment3D(A, E);
  lab.addSegment3D(A, B);

  assert.ok(has(lab, 'perpendicular-to-plane:AE,plane(base)'), 'AE points straight up');
  assert.ok(has(lab, 'parallel-to-plane:AB,plane(base)'), 'AB lies in it');
  assert.ok(!has(lab, 'parallel-to-plane:AE,plane(base)'));
  assert.ok(!has(lab, 'perpendicular-to-plane:AB,plane(base)'));
});

test('a line lying in a plane is parallel to it and on it at both ends', () => {
  const { lab, A, B } = box();
  lab.addSegment3D(A, B);
  assert.ok(has(lab, 'parallel-to-plane:AB,plane(base)'));
  assert.ok(has(lab, 'point-on-plane:A,plane(base)'));
  assert.ok(has(lab, 'point-on-plane:B,plane(base)'));
});

/* -------------------------------------------------------------------------- */
/* Skew                                                                       */
/* -------------------------------------------------------------------------- */

test('two lines that neither meet nor run alongside each other', () => {
  const lab = createGeometryLab();
  // Along x at z = 0, and along y at z = 5: they pass over each other.
  const a = lab.addPoint3D({ x: -5, y: 0, z: 0, label: 'A' });
  const b = lab.addPoint3D({ x: 5, y: 0, z: 0, label: 'B' });
  const c = lab.addPoint3D({ x: 0, y: -5, z: 5, label: 'C' });
  const d = lab.addPoint3D({ x: 0, y: 5, z: 5, label: 'D' });
  lab.addSegment3D(a, b);
  lab.addSegment3D(c, d);
  assert.ok(has(lab, 'skew:AB,CD'));
});

test('lines that cross are not skew, even in space', () => {
  const lab = createGeometryLab();
  const a = lab.addPoint3D({ x: -5, y: 0, z: 0, label: 'A' });
  const b = lab.addPoint3D({ x: 5, y: 0, z: 0, label: 'B' });
  const c = lab.addPoint3D({ x: 0, y: -5, z: 0, label: 'C' });
  const d = lab.addPoint3D({ x: 0, y: 5, z: 0, label: 'D' });
  lab.addSegment3D(a, b);
  lab.addSegment3D(c, d);
  assert.ok(!has(lab, 'skew:AB,CD'), 'they meet at the origin');
});

test('parallel lines are not skew either', () => {
  const lab = createGeometryLab();
  const a = lab.addPoint3D({ x: 0, y: 0, z: 0, label: 'A' });
  const b = lab.addPoint3D({ x: 5, y: 0, z: 0, label: 'B' });
  const c = lab.addPoint3D({ x: 0, y: 4, z: 3, label: 'C' });
  const d = lab.addPoint3D({ x: 5, y: 4, z: 3, label: 'D' });
  lab.addSegment3D(a, b);
  lab.addSegment3D(c, d);
  assert.ok(!has(lab, 'skew:AB,CD'), 'they never meet, but they do run alongside');
});

test('lines that share an endpoint meet, so they are not skew', () => {
  const { lab, A, B, E } = box();
  lab.addSegment3D(A, B);
  lab.addSegment3D(A, E);
  assert.ok(!has(lab, 'skew:AB,AE'));
});

/* -------------------------------------------------------------------------- */
/* Whose points are these                                                     */
/* -------------------------------------------------------------------------- */

test("a solid's own mesh vertices are not marked", () => {
  // Nobody placed a cube's eight corners; the cube did. A sphere brings
  // hundreds, and reporting them would bury the figure's real facts under its
  // triangulation.
  const lab = createGeometryLab();
  lab.addWorkPlaneByEquation({ a: 0, b: 0, c: 1, d: 1 }, { label: 'base' });
  lab.addPolyhedron('cube', { x: 0, y: 0, z: 0 }, 2);
  const spatial = facts(lab).filter(fact => fact.startsWith('point-on-plane:') || fact.startsWith('coplanar:'));
  assert.deepEqual(spatial, [], 'a cube sitting on a plane says nothing about mesh points');
});

test('a sphere does not flood the report', () => {
  const lab = createGeometryLab();
  lab.addSphere({ x: 0, y: 0, z: 0 }, 4);
  lab.addWorkPlaneByEquation({ a: 0, b: 0, c: 1, d: 0 }, { label: 'base' });
  assert.ok(lab.getInvariants().invariants.length < 10, 'a sphere is a mesh, not a hundred points');
});

/* -------------------------------------------------------------------------- */
/* Its own yardstick                                                          */
/* -------------------------------------------------------------------------- */

test('space is measured against space, not against the plane figure beside it', () => {
  // The 2D scene here is a millimetre across and the 3D one is a kilometre. A
  // shared tolerance would mark one of them nonsense.
  const lab = createGeometryLab();
  lab.addPoint2D({ x: 0, y: 0, label: 'p' });
  lab.addPoint2D({ x: 0.001, y: 0, label: 'q' });
  lab.addWorkPlaneByEquation({ a: 0, b: 0, c: 1, d: 0 }, { label: 'base' });
  for (const [label, x, y] of [['A', 0, 0], ['B', 1000, 0], ['C', 1000, 800], ['D', 0, 800]]) {
    lab.addPoint3D({ x, y, z: 0, label });
  }
  assert.ok(has(lab, 'coplanar:A,B,C,D'));

  // A point off the plane by more than the 3D tolerance is off it, however
  // small that offset looks beside a kilometre.
  lab.addPoint3D({ x: 500, y: 400, z: 50, label: 'E' });
  assert.ok(!has(lab, 'point-on-plane:E,plane(base)'));
});

test('a figure that is only in space is still marked', () => {
  const { lab } = box();
  assert.equal(Object.keys(lab.peekSnapshot().scene.scene2d.points).length, 0);
  assert.ok(facts(lab).length > 0, 'a plane pass that found nothing must not end the marking');
});

test('a figure in both scenes reports both, and the kinds keep them apart', () => {
  const { lab, A, B } = box();
  lab.addSegment3D(A, B);
  const flat = lab.addPoint2D({ x: 0, y: 0, label: 'X' });
  const other = lab.addPoint2D({ x: 4, y: 0, label: 'Y' });
  lab.addSegment2D(flat, other);
  const third = lab.addPoint2D({ x: 0, y: 3, label: 'Z' });
  lab.addSegment2D(flat, third);

  const reported = facts(lab);
  assert.ok(reported.some(fact => fact.startsWith('right-angle:')), 'the plane figure is marked');
  assert.ok(reported.some(fact => fact.startsWith('point-on-plane:')), 'and so is the spatial one');
  assert.ok(
    !reported.some(fact => fact.startsWith('parallel:') || fact.startsWith('equal-segments:')),
    'no kind is shared, so no fact is ambiguous about which scene it is about',
  );
});
