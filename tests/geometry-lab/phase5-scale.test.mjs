import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeometryLab } from '../../dist/geometry-lab/index.js';

test('plane equations are invariant under non-zero coefficient rescaling', () => {
  const lab = createGeometryLab();
  const planeId = lab.addWorkPlaneByEquation({ a: 1e-15, b: 0, c: 0, d: -2e-15 });
  const plane = lab.getSnapshot().scene.scene3d.workPlanes[planeId];

  assert.deepEqual(plane.equation, { a: 1, b: 0, c: 0, d: -2 });
  assert.equal(lab.pointPlaneDistance(lab.addPoint3D({ x: 5, y: 0, z: 0 }), planeId), 3);
});

test('tiny but well-conditioned directions and triangles remain valid', () => {
  const lab = createGeometryLab();
  const originId = lab.addPoint3D({ x: 0, y: 0, z: 0 });
  const lineEndId = lab.addPoint3D({ x: 2e-12, y: 0, z: 0 });
  const lineId = lab.addLine3D(originId, lineEndId);
  const perpendicularId = lab.addWorkPlanePerpendicularToLine(lineId);
  const perpendicular = lab.getSnapshot().scene.scene3d.workPlanes[perpendicularId];
  assert.deepEqual(perpendicular.normal, [1, 0, 0]);

  const secondId = lab.addPoint3D({ x: 0, y: 2e-12, z: 0 });
  const planeId = lab.addWorkPlaneByThreePoints([originId, lineEndId, secondId]);
  const plane = lab.getSnapshot().scene.scene3d.workPlanes[planeId];
  assert.deepEqual(plane.normal, [0, 0, 1]);
});
