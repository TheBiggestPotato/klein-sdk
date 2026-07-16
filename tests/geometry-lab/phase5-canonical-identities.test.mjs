import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeometryLab } from '../../dist/geometry-lab/index.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function pairKey(pointIds) {
  return [...pointIds].sort().join('\u0000');
}

function legacyTraversalEdges(solid) {
  const edges = new Map();
  for (const face of solid.faces) {
    for (let index = 0; index < face.pointIds.length; index += 1) {
      const first = face.pointIds[index];
      const second = face.pointIds[(index + 1) % face.pointIds.length];
      const key = pairKey([first, second]);
      if (!edges.has(key)) edges.set(key, [first, second]);
    }
  }
  return [...edges.values()];
}

function pointCoordinates(snapshot, pointId) {
  const { x, y, z } = snapshot.scene.scene3d.points[pointId];
  return { x, y, z };
}

test('legacy edge-N selections retain pre-canonical-winding endpoint identities', () => {
  const source = createGeometryLab();
  const solidId = source.addPolyhedron('cube');
  const legacy = source.getSnapshot();
  const solid = legacy.scene.scene3d.entities[solidId];

  // Make one face inconsistent so mesh repair reverses other face traversals.
  solid.faces[0].pointIds.reverse();
  delete solid.edges;
  const legacyEndpoints = legacyTraversalEdges(solid);
  legacy.appState.selected = legacyEndpoints.map((_, index) => ({
    kind: 'edge',
    solidId,
    edgeId: `edge-${index + 1}`,
  }));

  const restored = createGeometryLab({ initialSnapshot: legacy }).getSnapshot();
  const canonicalSolid = restored.scene.scene3d.entities[solidId];
  const selectedEndpointKeys = restored.appState.selected.map(selection => {
    const edge = canonicalSolid.edges.find(candidate => candidate.id === selection.edgeId);
    assert.ok(edge);
    return pairKey(edge.pointIds);
  });

  assert.deepEqual(selectedEndpointKeys, legacyEndpoints.map(pairKey));
});

test('meaningful persisted legacy edge endpoints override reconstructed traversal order', () => {
  const source = createGeometryLab();
  const solidId = source.addPolyhedron('cube');
  const legacy = source.getSnapshot();
  const solid = legacy.scene.scene3d.entities[solidId];
  const traversed = legacyTraversalEdges(solid);
  const persistedEndpoints = traversed[5];
  assert.ok(persistedEndpoints);
  solid.edges = [{ id: 'edge-1', pointIds: persistedEndpoints }];
  legacy.appState.selected = [{ kind: 'edge', solidId, edgeId: 'edge-1' }];

  const restored = createGeometryLab({ initialSnapshot: legacy }).getSnapshot();
  const canonicalSolid = restored.scene.scene3d.entities[solidId];
  const selected = restored.appState.selected[0];
  const selectedEdge = canonicalSolid.edges.find(edge => edge.id === selected.edgeId);

  assert.ok(selectedEdge);
  assert.equal(pairKey(selectedEdge.pointIds), pairKey(persistedEndpoints));
});

test('cross-section point identities survive cyclic rotation and reversal of loop order', () => {
  const source = createGeometryLab();
  const solidId = source.addPolyhedron('cube');
  const sectionId = source.addCrossSection(solidId, 'xy');
  const persisted = source.getSnapshot();
  const section = persisted.scene.scene3d.entities[sectionId];
  const originalPointIds = [...section.pointIds];
  const coordinatesById = Object.fromEntries(originalPointIds.map(pointId => (
    [pointId, pointCoordinates(persisted, pointId)]
  )));
  section.pointIds = [
    originalPointIds[2],
    originalPointIds[1],
    originalPointIds[0],
    originalPointIds[3],
  ];

  const restored = createGeometryLab({ initialSnapshot: persisted }).getSnapshot();
  const restoredSection = restored.scene.scene3d.entities[sectionId];

  assert.deepEqual(restoredSection.pointIds, section.pointIds);
  for (const pointId of originalPointIds) {
    assert.deepEqual(pointCoordinates(restored, pointId), coordinatesById[pointId]);
  }
  assert.deepEqual(
    restoredSection.vertices,
    restoredSection.pointIds.map(pointId => coordinatesById[pointId]),
  );
});

test('non-loop and ambiguous cross-section identity changes reject atomically', () => {
  const source = createGeometryLab();
  const solidId = source.addPolyhedron('cube');
  const sectionId = source.addCrossSection(solidId, 'xy');
  const valid = source.getSnapshot();
  const section = valid.scene.scene3d.entities[sectionId];
  const [first, second, third, fourth] = section.pointIds;

  const nonLoop = clone(valid);
  nonLoop.scene.scene3d.entities[sectionId].pointIds = [first, third, second, fourth];

  const ambiguous = clone(valid);
  ambiguous.scene.scene3d.points[second] = {
    ...ambiguous.scene.scene3d.points[second],
    ...pointCoordinates(ambiguous, first),
  };

  for (const invalid of [nonLoop, ambiguous]) {
    const target = createGeometryLab({ initialSnapshot: valid });
    const before = target.getSnapshot();
    assert.throws(() => target.loadSnapshot(invalid));
    assert.deepEqual(target.getSnapshot(), before);
  }
});

test('prism and pyramid derived heights follow point edits and disappear when topology ordering is unrecognizable', () => {
  const base = [
    { x: 0, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 },
    { x: 2, y: 2, z: 0 },
    { x: 0, y: 2, z: 0 },
  ];

  const prismLab = createGeometryLab();
  const prismId = prismLab.addPrism(base, 1);
  let prism = prismLab.getSnapshot().scene.scene3d.entities[prismId];
  const topPointIds = prism.pointIds.slice(prism.pointIds.length / 2);
  prismLab.applyDelta({
    op: 'batch',
    deltas: topPointIds.map(id => ({ op: 'updatePoint', id, changes: { z: 3 } })),
  });
  prism = prismLab.getSnapshot().scene.scene3d.entities[prismId];
  assert.equal(prism.parameters.height, 3);

  const pyramidLab = createGeometryLab();
  const pyramidId = pyramidLab.addPyramid(base, 1);
  let pyramid = pyramidLab.getSnapshot().scene.scene3d.entities[pyramidId];
  const apexId = pyramid.pointIds.at(-1);
  pyramidLab.applyDelta({ op: 'updatePoint', id: apexId, changes: { z: 4 } });
  pyramid = pyramidLab.getSnapshot().scene.scene3d.entities[pyramidId];
  assert.equal(pyramid.parameters.height, 4);

  const reordered = prismLab.getSnapshot();
  const reorderedPrism = reordered.scene.scene3d.entities[prismId];
  [reorderedPrism.pointIds[0], reorderedPrism.pointIds[topPointIds.length]] = [
    reorderedPrism.pointIds[topPointIds.length],
    reorderedPrism.pointIds[0],
  ];
  const restored = createGeometryLab({ initialSnapshot: reordered }).getSnapshot();
  assert.equal(restored.scene.scene3d.entities[prismId].parameters.height, undefined);
});

test('canonical work-plane recomputation accepts scale-valid tiny line directions', () => {
  const source = createGeometryLab();
  const firstId = source.addPoint3D({ x: 0, y: 0, z: 0 });
  const secondId = source.addPoint3D({ x: 2e-12, y: 0, z: 0 });
  const lineId = source.addLine3D(firstId, secondId);
  const planeId = source.addWorkPlanePerpendicularToLine(lineId);
  const restored = createGeometryLab({ initialSnapshot: source.getSnapshot() }).getSnapshot();

  assert.deepEqual(restored.scene.scene3d.workPlanes[planeId].normal, [1, 0, 0]);
});
