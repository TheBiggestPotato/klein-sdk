import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeometryLab } from '../../dist/geometry-lab/index.js';

const RELATIVE_EPSILON = 1e-8;

function assertClose(actual, expected, message) {
  const tolerance = RELATIVE_EPSILON * Math.max(Number.MIN_VALUE, Math.abs(actual), Math.abs(expected));
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, received ${actual}`,
  );
}

function uBase(z = 0) {
  return [
    { x: 0, y: 0, z },
    { x: 3, y: 0, z },
    { x: 3, y: 3, z },
    { x: 2, y: 3, z },
    { x: 2, y: 1, z },
    { x: 1, y: 1, z },
    { x: 1, y: 3, z },
    { x: 0, y: 3, z },
  ];
}

test('concave prism measurements use polygon boundary area, not an absolute triangle fan', () => {
  const lab = createGeometryLab();
  const id = lab.addPrism(uBase(), { x: 0, y: 0, z: 2 });

  assertClose(lab.measureVolume(id), 14, 'concave prism volume');
  assertClose(lab.measureSurfaceArea(id), 46, 'concave prism surface area');
});

test('an oblique pyramid uses perpendicular height over its concave base', () => {
  const lab = createGeometryLab();
  const id = lab.addPyramid(uBase(), { x: 8, y: -5, z: 3 });

  assertClose(lab.measureVolume(id), 7, 'oblique concave pyramid volume');
});

test('solid constructors reject non-planar, self-intersecting, and degenerate bases atomically', () => {
  const invalidBases = [
    [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 2, y: 2, z: 0.1 },
      { x: 0, y: 2, z: 0 },
    ],
    [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 2, z: 0 },
      { x: 0, y: 2, z: 0 },
      { x: 2, y: 0, z: 0 },
    ],
    [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ],
  ];

  for (const base of invalidBases) {
    const lab = createGeometryLab();
    const before = lab.getSnapshot();
    assert.throws(() => lab.addPrism(base, 1));
    assert.deepEqual(lab.getSnapshot(), before);
  }
});

test('solid volume and surface area obey rigid-transform and scale laws', () => {
  const originalLab = createGeometryLab();
  const originalId = originalLab.addPrism(uBase(), { x: 0, y: 0, z: 2 });
  const originalVolume = originalLab.measureVolume(originalId);
  const originalArea = originalLab.measureSurfaceArea(originalId);

  const scale = 3;
  const translation = { x: 11, y: -7, z: 5 };
  const transformPoint = point => ({
    x: point.z * scale + translation.x,
    y: point.x * scale + translation.y,
    z: point.y * scale + translation.z,
  });
  const transformVector = vector => ({
    x: vector.z * scale,
    y: vector.x * scale,
    z: vector.y * scale,
  });

  const transformedLab = createGeometryLab();
  const transformedId = transformedLab.addPrism(
    uBase().map(transformPoint),
    transformVector({ x: 0, y: 0, z: 2 }),
  );

  assertClose(transformedLab.measureVolume(transformedId), originalVolume * scale ** 3, 'scaled volume');
  assertClose(transformedLab.measureSurfaceArea(transformedId), originalArea * scale ** 2, 'scaled area');

  const farTranslation = { x: 1e14, y: -1e14, z: 1e14 };
  const farLab = createGeometryLab();
  const farId = farLab.addPrism(uBase().map(point => ({
    x: point.x + farTranslation.x,
    y: point.y + farTranslation.y,
    z: point.z + farTranslation.z,
  })), { x: 0, y: 0, z: 2 });
  assertClose(farLab.measureVolume(farId), originalVolume, 'large-translation volume');
  assertClose(farLab.measureSurfaceArea(farId), originalArea, 'large-translation area');
});

test('solid winding is reconciled and edge identity survives face reordering', () => {
  const lab = createGeometryLab();
  const solidId = lab.addPolyhedron('cube');
  const before = lab.getSnapshot().scene.scene3d.entities[solidId];
  const edgeIdsByEndpoints = new Map(before.edges.map(edge => [
    [...edge.pointIds].sort().join('\u0000'),
    edge.id,
  ]));
  const faces = [...before.faces]
    .reverse()
    .map((face, index) => ({
      ...face,
      pointIds: index % 2 === 0 ? [...face.pointIds].reverse() : [...face.pointIds],
    }));

  lab.applyDelta({
    op: 'updateEntity',
    id: solidId,
    changes: { faces, faceIds: faces.map(face => face.id) },
  });

  const after = lab.getSnapshot().scene.scene3d.entities[solidId];
  assertClose(lab.measureVolume(solidId), 8, 'reconciled cube volume');
  assertClose(lab.measureSurfaceArea(solidId), 24, 'reconciled cube area');
  assert.deepEqual(
    new Map(after.edges.map(edge => [[...edge.pointIds].sort().join('\u0000'), edge.id])),
    edgeIdsByEndpoints,
  );

  const traversals = new Map();
  for (const face of after.faces) {
    for (let index = 0; index < face.pointIds.length; index += 1) {
      const first = face.pointIds[index];
      const second = face.pointIds[(index + 1) % face.pointIds.length];
      const key = [first, second].sort().join('\u0000');
      const direction = first < second ? 1 : -1;
      const existing = traversals.get(key) ?? [];
      existing.push(direction);
      traversals.set(key, existing);
    }
  }
  for (const directions of traversals.values()) assert.deepEqual(directions.sort(), [-1, 1]);
});

test('globally reversed solid winding is canonicalized outward', () => {
  const lab = createGeometryLab();
  const solidId = lab.addPolyhedron('cube');
  const before = lab.getSnapshot().scene.scene3d.entities[solidId];
  const reversedFaces = before.faces.map(face => ({
    ...face,
    pointIds: [...face.pointIds].reverse(),
  }));

  lab.applyDelta({
    op: 'updateEntity',
    id: solidId,
    changes: { faces: reversedFaces, faceIds: reversedFaces.map(face => face.id) },
  });

  const snapshot = lab.getSnapshot();
  const solid = snapshot.scene.scene3d.entities[solidId];
  const points = solid.pointIds.map(pointId => snapshot.scene.scene3d.points[pointId]);
  const centroid = points.reduce((sum, point) => ({
    x: sum.x + point.x / points.length,
    y: sum.y + point.y / points.length,
    z: sum.z + point.z / points.length,
  }), { x: 0, y: 0, z: 0 });

  for (const face of solid.faces) {
    const facePoints = face.pointIds.map(pointId => snapshot.scene.scene3d.points[pointId]);
    const faceCentroid = facePoints.reduce((sum, point) => ({
      x: sum.x + point.x / facePoints.length,
      y: sum.y + point.y / facePoints.length,
      z: sum.z + point.z / facePoints.length,
    }), { x: 0, y: 0, z: 0 });
    const [nx, ny, nz] = face.normal;
    const outwardDot = nx * (faceCentroid.x - centroid.x)
      + ny * (faceCentroid.y - centroid.y)
      + nz * (faceCentroid.z - centroid.z);
    assert.ok(outwardDot > 0, `face ${face.id} should point outward`);
  }
});

test('multiple disconnected closed shells are rejected', () => {
  const lab = createGeometryLab();
  const solidId = lab.addPolyhedron('cube');
  const before = lab.getSnapshot();
  const solid = before.scene.scene3d.entities[solidId];
  const pointIdMap = new Map();
  const duplicatePoints = [];

  for (const pointId of [...solid.pointIds]) {
    const duplicateId = `${pointId}-shell-2`;
    pointIdMap.set(pointId, duplicateId);
    const point = before.scene.scene3d.points[pointId];
    duplicatePoints.push({
      ...point,
      id: duplicateId,
      x: point.x + 10,
    });
  }
  const duplicateFaces = solid.faces.map(face => ({
    ...face,
    id: `${face.id}-shell-2`,
    pointIds: face.pointIds.map(pointId => pointIdMap.get(pointId)),
  }));

  assert.throws(
    () => lab.applyDelta({
      op: 'batch',
      deltas: [
        ...duplicatePoints.map(point => ({ op: 'addPoint3D', point })),
        {
          op: 'updateEntity',
          id: solidId,
          changes: {
            pointIds: [...solid.pointIds, ...duplicatePoints.map(point => point.id)],
            faces: [...solid.faces, ...duplicateFaces],
            faceIds: [...solid.faceIds, ...duplicateFaces.map(face => face.id)],
          },
        },
      ],
    }),
    error => error.code === 'invalid_delta_result'
      && /disconnected closed shells/.test(error.details?.message ?? ''),
  );
  assert.deepEqual(lab.getSnapshot(), before);
});

test('mesh-level edge crossings are rejected atomically', () => {
  const lab = createGeometryLab();
  const solidId = lab.addPolyhedron('octahedron');
  const before = lab.getSnapshot();
  const solid = before.scene.scene3d.entities[solidId];
  const secondId = solid.pointIds[2];
  const thirdId = solid.pointIds[3];
  const second = before.scene.scene3d.points[secondId];
  const third = before.scene.scene3d.points[thirdId];

  assert.throws(
    () => lab.applyDelta({
      op: 'batch',
      deltas: [
        { op: 'updatePoint', id: secondId, changes: { x: third.x, y: third.y, z: third.z } },
        { op: 'updatePoint', id: thirdId, changes: { x: second.x, y: second.y, z: second.z } },
      ],
    }),
    error => error.code === 'invalid_delta_result'
      && /intersect/.test(error.details?.message ?? ''),
  );
  assert.deepEqual(lab.getSnapshot(), before);
});

test('legacy traversal-based edge selections migrate to stable endpoint IDs', () => {
  const source = createGeometryLab();
  const solidId = source.addPolyhedron('cube');
  const legacy = source.getSnapshot();
  const solid = legacy.scene.scene3d.entities[solidId];
  const legacyEndpoints = [solid.faces[0].pointIds[0], solid.faces[0].pointIds[1]];
  const expected = solid.edges.find(edge => (
    edge.pointIds.includes(legacyEndpoints[0]) && edge.pointIds.includes(legacyEndpoints[1])
  ));
  assert.ok(expected);
  delete solid.edges;
  legacy.appState.selected = [{ kind: 'edge', solidId, edgeId: 'edge-1' }];

  const restored = createGeometryLab({ initialSnapshot: legacy }).getSnapshot();
  assert.deepEqual(restored.appState.selected, [{ kind: 'edge', solidId, edgeId: expected.id }]);
});

test('non-planar solid edits are rejected without changing cached geometry', () => {
  const lab = createGeometryLab();
  const solidId = lab.addPolyhedron('cube');
  const before = lab.getSnapshot();
  const solid = before.scene.scene3d.entities[solidId];
  const pointId = solid.pointIds.find(id => {
    const point = before.scene.scene3d.points[id];
    return point.x > 0 && point.y > 0 && point.z > 0;
  });
  assert.ok(pointId);

  assert.throws(() => lab.applyDelta({
    op: 'updatePoint',
    id: pointId,
    changes: { z: 1.25 },
  }));
  assert.deepEqual(lab.getSnapshot(), before);
});

test('open solid topology is rejected atomically', () => {
  const lab = createGeometryLab();
  const solidId = lab.addPolyhedron('cube');
  const before = lab.getSnapshot();
  const solid = before.scene.scene3d.entities[solidId];
  const faces = solid.faces.slice(1);

  assert.throws(() => lab.applyDelta({
    op: 'updateEntity',
    id: solidId,
    changes: { faces, faceIds: faces.map(face => face.id) },
  }));
  assert.deepEqual(lab.getSnapshot(), before);
});

test('tiny solids and cross-sections use geometry-relative tolerances', () => {
  const lab = createGeometryLab();
  const size = 1e-6;
  const solidId = lab.addPolyhedron('cube', { x: 0, y: 0, z: 0 }, size);
  const sectionId = lab.addCrossSection(solidId, 'xy');
  const section = lab.getSnapshot().scene.scene3d.entities[sectionId];

  assert.equal(section.kind, 'crossSection');
  assert.equal(section.vertices.length, 4);
  assertClose(lab.measureVolume(solidId), size ** 3, 'tiny cube volume');
  assertClose(section.area, size ** 2, 'tiny cube section area');
});

test('concave cross-sections preserve mesh boundary connectivity', () => {
  const lab = createGeometryLab();
  const solidId = lab.addPrism(uBase(), { x: 0, y: 0, z: 2 });
  const planeId = lab.addWorkPlaneByEquation({ a: 0, b: 0, c: 1, d: -1 });
  const sectionId = lab.addCrossSection(solidId, planeId);
  const section = lab.getSnapshot().scene.scene3d.entities[sectionId];

  assert.equal(section.kind, 'crossSection');
  assert.equal(section.vertices.length, 8);
  assertClose(section.area, 7, 'concave section area');
  assertClose(section.perimeter, 16, 'concave section perimeter');
});

test('line-plane and plane-plane intersections use relative direction tolerances', () => {
  const lab = createGeometryLab();
  const startId = lab.addPoint3D({ x: 2, y: 3, z: -1e-12 });
  const endId = lab.addPoint3D({ x: 2, y: 3, z: 1e-12 });
  const lineId = lab.addLine3D(startId, endId);
  const pointId = lab.addLinePlaneIntersection(lineId, 'xy');
  const point = lab.getSnapshot().scene.scene3d.points[pointId];
  assertClose(point.x, 2, 'tiny-line intersection x');
  assertClose(point.y, 3, 'tiny-line intersection y');
  assertClose(point.z, 0, 'tiny-line intersection z');

  const firstPlaneId = lab.addWorkPlaneByEquation({ a: 0, b: 0, c: 1, d: 0 });
  const secondPlaneId = lab.addWorkPlaneByEquation({ a: 1e-5, b: 0, c: 1, d: 0 });
  const intersectionId = lab.addPlanePlaneIntersection(firstPlaneId, secondPlaneId);
  const intersection = lab.getSnapshot().scene.scene3d.entities[intersectionId];
  assert.equal(intersection.kind, 'line');
});
