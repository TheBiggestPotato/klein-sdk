import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeometryLab } from '../../dist/geometry-lab/index.js';
import {
  circlePoints3D,
  createConeMesh3D,
  createCylinderMesh3D,
  createPrismMesh3D,
  createPyramidMesh3D,
  createRegularPolyhedronMesh3D,
  createSphereMesh3D,
  integerRange,
  reverseIntegerRange,
} from '../../dist/geometry-lab/solids.js';

const SQUARE = Object.freeze([
  Object.freeze({ x: 0, y: 0, z: 0 }),
  Object.freeze({ x: 2, y: 0, z: 0 }),
  Object.freeze({ x: 2, y: 2, z: 0 }),
  Object.freeze({ x: 0, y: 2, z: 0 }),
]);

function assertMeshMatchesInstrument(mesh, lab, solidId, expected = {}) {
  const snapshot = lab.getSnapshot();
  const solid = snapshot.scene.scene3d.entities[solidId];
  assert.equal(solid?.kind, 'solid');
  assert.equal(new Set(solid.pointIds).size, solid.pointIds.length);
  assert.equal(new Set(solid.faces.map(face => face.id)).size, solid.faces.length);
  assert.deepEqual(
    solid.faces.map((face, index) => face.id),
    solid.faces.map((_, index) => `face-${index + 1}`),
  );

  const vertices = solid.pointIds.map(pointId => {
    const { x, y, z } = snapshot.scene.scene3d.points[pointId];
    return { x, y, z };
  });
  const pointIndex = new Map(solid.pointIds.map((pointId, index) => [pointId, index]));
  const faces = solid.faces.map(face => face.pointIds.map(pointId => pointIndex.get(pointId)));
  assert.deepEqual(vertices, mesh.vertices);
  assert.equal(faces.length, mesh.faces.length);
  for (let index = 0; index < faces.length; index += 1) {
    assert.equal(
      isEquivalentPolygonCycle(faces[index], mesh.faces[index]),
      true,
      `face-${index + 1} must retain its vertex cycle after outward-winding canonicalization`,
    );
  }
  assert.equal(solid.label, expected.label);
  assert.equal(solid.color, expected.color);
  if (expected.parameters) assert.deepEqual(solid.parameters, expected.parameters);
}

function isEquivalentPolygonCycle(actual, expected) {
  if (actual.length !== expected.length) return false;
  const candidates = [expected, [...expected].reverse()];
  return candidates.some(candidate => candidate.some((_, offset) => (
    actual.every((value, index) => value === candidate[(index + offset) % candidate.length])
  )));
}

test('circle and integer helpers retain deterministic ordering', () => {
  assert.deepEqual(integerRange(2, 6), [2, 3, 4, 5]);
  assert.deepEqual(reverseIntegerRange(2, 6), [5, 4, 3, 2]);
  const circle = circlePoints3D(1, 2, 3, 4, 4);
  assert.equal(circle.length, 4);
  assert.deepEqual(circle[0], { x: 5, y: 2, z: 3 });
  assert.ok(Math.abs(circle[1].x - 1) <= Number.EPSILON * 4);
  assert.equal(circle[1].y, 6);
  assert.equal(circle[1].z, 3);
});

test('prism and pyramid factories preserve instrument vertex, face, parameter, and ID ordering', () => {
  const heightVector = { x: 0, y: 0, z: 3 };
  const prismMesh = createPrismMesh3D(SQUARE, heightVector);
  assert.deepEqual(SQUARE, [
    { x: 0, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 },
    { x: 2, y: 2, z: 0 },
    { x: 0, y: 2, z: 0 },
  ]);
  assert.equal(prismMesh.vertices.length, 8);
  assert.equal(prismMesh.faces.length, 6);
  assert.deepEqual(prismMesh.faces[0], [3, 2, 1, 0]);
  assert.deepEqual(prismMesh.faces[1], [4, 5, 6, 7]);

  const prismLab = createGeometryLab();
  const prismId = prismLab.addPrism([...SQUARE], heightVector, { label: 'Prism', color: '#123456' });
  assertMeshMatchesInstrument(prismMesh, prismLab, prismId, {
    label: 'Prism',
    color: '#123456',
    parameters: { height: 3 },
  });

  const apex = { x: 1, y: 1, z: 3 };
  const pyramidMesh = createPyramidMesh3D(SQUARE, apex);
  assert.equal(pyramidMesh.vertices.length, 5);
  assert.equal(pyramidMesh.faces.length, 5);
  assert.deepEqual(pyramidMesh.faces[0], [3, 2, 1, 0]);
  const pyramidLab = createGeometryLab();
  const pyramidId = pyramidLab.addPyramid([...SQUARE], apex, { label: 'Pyramid', color: '#654321' });
  assertMeshMatchesInstrument(pyramidMesh, pyramidLab, pyramidId, {
    label: 'Pyramid',
    color: '#654321',
    parameters: { height: 3 },
  });
});

test('cylinder, cone, and sphere factories match instrument topology exactly', () => {
  const center = { x: 1, y: -2, z: 3 };

  const cylinderMesh = createCylinderMesh3D(center, 2, 4, 8);
  assert.equal(cylinderMesh.vertices.length, 16);
  assert.equal(cylinderMesh.faces.length, 10);
  const cylinderLab = createGeometryLab();
  const cylinderId = cylinderLab.addCylinder(center, 2, 4, { sides: 8, label: 'Cylinder' });
  assertMeshMatchesInstrument(cylinderMesh, cylinderLab, cylinderId, {
    label: 'Cylinder',
    parameters: { radius: 2, height: 4, sides: 8 },
  });

  const coneMesh = createConeMesh3D(center, 2, 4, 8);
  assert.equal(coneMesh.vertices.length, 9);
  assert.equal(coneMesh.faces.length, 9);
  const coneLab = createGeometryLab();
  const coneId = coneLab.addCone(center, 2, 4, { sides: 8, label: 'Cone' });
  assertMeshMatchesInstrument(coneMesh, coneLab, coneId, {
    label: 'Cone',
    parameters: { radius: 2, height: 4, sides: 8 },
  });

  const sphereMesh = createSphereMesh3D(center, 2, 12);
  assert.equal(sphereMesh.vertices.length, 62);
  assert.equal(sphereMesh.faces.length, 72);
  assert.deepEqual(sphereMesh.faces[12], [1, 2, 14, 13]);
  assert.deepEqual(sphereMesh.faces[71], [49, 60, 61]);
  const sphereLab = createGeometryLab();
  const sphereId = sphereLab.addSphere(center, 2, { sides: 12, label: 'Sphere' });
  assertMeshMatchesInstrument(sphereMesh, sphereLab, sphereId, {
    label: 'Sphere',
    parameters: { radius: 2, sides: 12 },
  });
});

test('all regular polyhedron factories match instrument topology and stable face IDs', () => {
  const center = { x: 1, y: -2, z: 3 };
  const expectedCounts = {
    tetrahedron: [4, 4],
    cube: [8, 6],
    octahedron: [6, 8],
    icosahedron: [12, 20],
  };
  for (const kind of Object.keys(expectedCounts)) {
    const mesh = createRegularPolyhedronMesh3D(kind, center, 4);
    assert.deepEqual([mesh.vertices.length, mesh.faces.length], expectedCounts[kind]);
    const lab = createGeometryLab();
    const solidId = lab.addPolyhedron(kind, center, 4, { label: kind, color: '#abcdef' });
    assertMeshMatchesInstrument(mesh, lab, solidId, { label: kind, color: '#abcdef' });
  }
});
