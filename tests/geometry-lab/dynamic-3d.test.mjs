/**
 * Dynamic 3D constructions (plan tasks 1.1 and 1.2).
 *
 * <p>Until now the instrument computed a 3D intersection once and stored a free
 * point. Moving the plane left the point behind, so the figure went on claiming
 * an intersection that was no longer there - worse than a missing feature,
 * because nothing about the picture said it had stopped being true.
 *
 * <p>These tests are therefore mostly about what happens *after* an edit. Every
 * one moves a source and checks the derived object followed, and several check
 * the harder direction: that a construction whose sources have moved into a
 * degenerate arrangement fails loudly instead of quietly keeping a stale
 * position.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeometryLab } from '../../dist/geometry-lab/index.js';

// Normalises -0 to 0: floating point puts a negative zero on an axis-aligned
// coordinate often enough, and deepStrictEqual treats the two as different.
const round = (value) => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
};
const at = (lab, id) => {
  const point = lab.peekSnapshot().scene.scene3d.points[id];
  return [round(point.x), round(point.y), round(point.z)];
};

/** A vertical line at (x, y) crossing a horizontal plane built from three points. */
function verticalLineAndPlane(x = 2, y = 3) {
  const lab = createGeometryLab();
  const lower = lab.addPoint3D({ x, y, z: -5 });
  const upper = lab.addPoint3D({ x, y, z: 5 });
  const line = lab.addLine3D(lower, upper);
  const corners = [
    lab.addPoint3D({ x: 0, y: 0, z: 0 }),
    lab.addPoint3D({ x: 1, y: 0, z: 0 }),
    lab.addPoint3D({ x: 0, y: 1, z: 0 }),
  ];
  const plane = lab.addWorkPlaneByThreePoints(corners);
  return { lab, line, plane, corners, lower, upper };
}

/* -------------------------------------------------------------------------- */
/* Line meets plane                                                           */
/* -------------------------------------------------------------------------- */

test('a line-plane intersection starts where the two actually meet', () => {
  const { lab, line, plane } = verticalLineAndPlane();
  const hit = lab.addLinePlaneIntersection(line, plane);
  assert.deepEqual(at(lab, hit), [2, 3, 0]);
});

test('the intersection follows the plane when the plane moves', () => {
  const { lab, line, plane, corners } = verticalLineAndPlane();
  const hit = lab.addLinePlaneIntersection(line, plane);

  for (const id of corners) lab.applyDelta({ op: 'updatePoint', id, changes: { z: 4 } });
  assert.deepEqual(at(lab, hit), [2, 3, 4], 'raising the plane must raise the intersection');

  for (const id of corners) lab.applyDelta({ op: 'updatePoint', id, changes: { z: -2.5 } });
  assert.deepEqual(at(lab, hit), [2, 3, -2.5]);
});

test('the intersection follows the line when the line moves', () => {
  const { lab, line, plane, lower, upper } = verticalLineAndPlane();
  const hit = lab.addLinePlaneIntersection(line, plane);

  lab.applyDelta({ op: 'updatePoint', id: lower, changes: { x: -1, y: 7 } });
  lab.applyDelta({ op: 'updatePoint', id: upper, changes: { x: -1, y: 7 } });
  assert.deepEqual(at(lab, hit), [-1, 7, 0]);
});

test('the intersection follows a tilted plane', () => {
  const { lab, line, plane, corners } = verticalLineAndPlane(1, 0);
  const hit = lab.addLinePlaneIntersection(line, plane);

  // Tilt about the y axis: z = x, so the vertical line at x = 1 meets it at z = 1.
  lab.applyDelta({ op: 'updatePoint', id: corners[1], changes: { x: 1, y: 0, z: 1 } });
  assert.deepEqual(at(lab, hit), [1, 0, 1]);
});

test('the construction is recorded, not just the position', () => {
  const { lab, line, plane } = verticalLineAndPlane();
  const hit = lab.addLinePlaneIntersection(line, plane);
  const point = lab.peekSnapshot().scene.scene3d.points[hit];
  assert.deepEqual(point.construction, { kind: 'linePlaneIntersection', lineEntityId: line, planeId: plane });
});

test('a plane dragged parallel to its line is rejected rather than left stale', () => {
  const { lab, line, plane, corners } = verticalLineAndPlane();
  const hit = lab.addLinePlaneIntersection(line, plane);
  assert.deepEqual(at(lab, hit), [2, 3, 0]);

  // Stand the plane up so it contains the vertical direction: now parallel to
  // the line, and there is no single intersection point any more.
  assert.throws(
    () => lab.applyDelta({ op: 'updatePoint', id: corners[2], changes: { x: 0, y: 0, z: 1 } }),
    error => error.code === 'invalid_delta_result',
    'a construction that can no longer be computed must fail the edit',
  );
  assert.deepEqual(at(lab, hit), [2, 3, 0], 'and the rejected edit leaves the figure untouched');
});

/* -------------------------------------------------------------------------- */
/* Plane meets plane                                                          */
/* -------------------------------------------------------------------------- */

function twoPlanes() {
  const lab = createGeometryLab();
  const xz = lab.addWorkPlaneByThreePoints([
    lab.addPoint3D({ x: 0, y: 0, z: 0 }),
    lab.addPoint3D({ x: 1, y: 0, z: 0 }),
    lab.addPoint3D({ x: 0, y: 0, z: 1 }),
  ]);
  const movable = [
    lab.addPoint3D({ x: 0, y: 0, z: 0 }),
    lab.addPoint3D({ x: 0, y: 1, z: 0 }),
    lab.addPoint3D({ x: 0, y: 0, z: 1 }),
  ];
  const yz = lab.addWorkPlaneByThreePoints(movable);
  return { lab, xz, yz, movable };
}

const endpoints = (lab, lineId) => {
  const scene = lab.peekSnapshot().scene.scene3d;
  return scene.entities[lineId].pointIds.map(id => {
    const point = scene.points[id];
    return [round(point.x), round(point.y), round(point.z)];
  });
};

test('two planes meet along the expected line', () => {
  const { lab, xz, yz } = twoPlanes();
  const line = lab.addPlanePlaneIntersection(xz, yz);
  assert.deepEqual(endpoints(lab, line), [[0, 0, -1], [0, 0, 1]], 'y = 0 meets x = 0 along the z axis');
});

test('the intersection line follows a plane that moves', () => {
  const { lab, xz, yz, movable } = twoPlanes();
  const line = lab.addPlanePlaneIntersection(xz, yz);

  for (const id of movable) lab.applyDelta({ op: 'updatePoint', id, changes: { x: 5 } });
  assert.deepEqual(endpoints(lab, line), [[5, 0, -1], [5, 0, 1]]);

  for (const id of movable) lab.applyDelta({ op: 'updatePoint', id, changes: { x: -3 } });
  assert.deepEqual(endpoints(lab, line), [[-3, 0, -1], [-3, 0, 1]]);
});

test('both endpoints record which end of the intersection they are', () => {
  const { lab, xz, yz } = twoPlanes();
  const line = lab.addPlanePlaneIntersection(xz, yz);
  const scene = lab.peekSnapshot().scene.scene3d;
  const [first, second] = scene.entities[line].pointIds.map(id => scene.points[id].construction);
  assert.equal(first.kind, 'planePlaneIntersection');
  assert.equal(first.end, 0);
  assert.equal(second.end, 1);
  assert.equal(first.firstPlaneId, xz);
  assert.equal(first.secondPlaneId, yz);
});

test('making two planes parallel is rejected rather than left stale', () => {
  const { lab, xz, yz, movable } = twoPlanes();
  const line = lab.addPlanePlaneIntersection(xz, yz);
  const before = endpoints(lab, line);

  // Lay the second plane flat so it becomes parallel to the first.
  assert.throws(
    () => {
      lab.applyDelta({ op: 'updatePoint', id: movable[1], changes: { x: 1, y: 0, z: 0 } });
      lab.applyDelta({ op: 'updatePoint', id: movable[2], changes: { x: 0, y: 0, z: 1 } });
      lab.applyDelta({ op: 'updatePoint', id: movable[1], changes: { x: 0, y: 0, z: 5 } });
    },
    error => error.code === 'invalid_delta_result',
  );
  assert.deepEqual(endpoints(lab, line), before, 'the figure is unchanged by the rejected edit');
});

/* -------------------------------------------------------------------------- */
/* Ordering, cycles and migration                                             */
/* -------------------------------------------------------------------------- */

test('a plane built on a constructed point resolves in one pass', () => {
  // The plane depends on a midpoint, and the midpoint on free points, so the
  // walk has to reach the point before the plane whichever order ids sort in.
  const lab = createGeometryLab();
  const a = lab.addPoint3D({ x: 0, y: 0, z: 0 });
  const b = lab.addPoint3D({ x: 0, y: 0, z: 10 });
  const mid = lab.applyDelta({
    op: 'addPoint3D',
    point: { id: 'mid', kind: 'point3d', x: 0, y: 0, z: 0, construction: { kind: 'midpoint', sourceIds: [a, b] } },
  });
  assert.equal(mid, true);
  assert.deepEqual(at(lab, 'mid'), [0, 0, 5]);

  const plane = lab.addWorkPlaneByThreePoints([
    'mid',
    lab.addPoint3D({ x: 1, y: 0, z: 5 }),
    lab.addPoint3D({ x: 0, y: 1, z: 5 }),
  ]);
  const lower = lab.addPoint3D({ x: 3, y: 3, z: -9 });
  const upper = lab.addPoint3D({ x: 3, y: 3, z: 9 });
  const hit = lab.addLinePlaneIntersection(lab.addLine3D(lower, upper), plane);
  assert.deepEqual(at(lab, hit), [3, 3, 5]);

  // Raise the whole plane: the midpoint moves with its parent, the other two
  // corners move with it, and the intersection has to settle behind both levels
  // of dependency inside the same commit.
  lab.applyDelta({ op: 'updatePoint', id: b, changes: { z: 20 } });
  assert.deepEqual(at(lab, 'mid'), [0, 0, 10], 'the midpoint follows its parent');
  for (const id of Object.keys(lab.peekSnapshot().scene.scene3d.points)) {
    const point = lab.peekSnapshot().scene.scene3d.points[id];
    if (point.construction) continue;
    if (point.z === 5) lab.applyDelta({ op: 'updatePoint', id, changes: { z: 10 } });
  }
  assert.deepEqual(at(lab, hit), [3, 3, 10], 'the intersection settled behind two levels of dependency');
});

test('a snapshot with no constructions still loads and stays put', () => {
  // Migration: everything persisted before this feature has free points, which
  // must keep behaving exactly as free points.
  const lab = createGeometryLab();
  const a = lab.addPoint3D({ x: 1, y: 2, z: 3 });
  const b = lab.addPoint3D({ x: 4, y: 5, z: 6 });
  lab.addSegment3D(a, b);
  const saved = JSON.parse(JSON.stringify(lab.getSnapshot()));

  const reopened = createGeometryLab();
  reopened.loadSnapshot(saved);
  assert.deepEqual(at(reopened, a), [1, 2, 3]);

  reopened.applyDelta({ op: 'updatePoint', id: a, changes: { x: 99 } });
  assert.deepEqual(at(reopened, a), [99, 2, 3]);
  assert.deepEqual(at(reopened, b), [4, 5, 6], 'an unconstructed point never moves on its own');
});

test('a construction naming a missing source is rejected', () => {
  const lab = createGeometryLab();
  assert.throws(
    () => lab.applyDelta({
      op: 'addPoint3D',
      point: {
        id: 'ghostly',
        kind: 'point3d',
        x: 0,
        y: 0,
        z: 0,
        construction: { kind: 'linePlaneIntersection', lineEntityId: 'nope', planeId: 'xy' },
      },
    }),
    error => error.code === 'invalid_delta_result',
  );
});

test('deleting the plane an intersection depends on takes the intersection with it', () => {
  const { lab, line, plane } = verticalLineAndPlane();
  const hit = lab.addLinePlaneIntersection(line, plane);
  assert.ok(lab.peekSnapshot().scene.scene3d.points[hit]);

  lab.remove(plane);
  assert.equal(
    lab.peekSnapshot().scene.scene3d.points[hit],
    undefined,
    'a derived point cannot outlive the plane it is derived from',
  );
});
