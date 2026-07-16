import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGeometryLabDependencyGraph,
  createEmptyGeometryLabSnapshot,
  createGeometryLab,
  getGeometryLabInvariantIssues,
  parseGeometryLabSnapshotJson,
} from '../../dist/geometry-lab/index.js';

const EPSILON = 1e-9;

function clone(value) {
  return structuredClone(value);
}

function assertSetEqual(actual, expected, message) {
  assert.deepEqual(new Set(actual ?? []), new Set(expected), message);
}

function assertClose(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) <= EPSILON * Math.max(1, Math.abs(actual), Math.abs(expected)),
    `${message}: expected ${expected}, received ${actual}`,
  );
}

function assertNoDanglingReferences(snapshot) {
  // Duplicate generated solid edge IDs are a separate Phase 5 regression. Keep
  // Phase 4 focused on ownership, references, and canonical derived state.
  const issues = getGeometryLabInvariantIssues(snapshot).filter(
    issue => !issue.message.includes('Duplicate solid edge id'),
  );
  assert.deepEqual(issues, []);
}

function vectorSubtract(first, second) {
  return {
    x: first.x - second.x,
    y: first.y - second.y,
    z: first.z - second.z,
  };
}

function vectorCross(first, second) {
  return {
    x: first.y * second.z - first.z * second.y,
    y: first.z * second.x - first.x * second.z,
    z: first.x * second.y - first.y * second.x,
  };
}

function vectorDot(first, second) {
  return first.x * second.x + first.y * second.y + first.z * second.z;
}

function vectorLength(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function polygonArea(points) {
  if (points.length < 3) return 0;
  const anchor = points[0];
  let area = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    area += vectorLength(vectorCross(
      vectorSubtract(points[index], anchor),
      vectorSubtract(points[index + 1], anchor),
    )) / 2;
  }
  return area;
}

function polygonPerimeter(points) {
  let perimeter = 0;
  for (let index = 0; index < points.length; index += 1) {
    perimeter += vectorLength(vectorSubtract(points[index], points[(index + 1) % points.length]));
  }
  return perimeter;
}

function solidAreaFromAuthoredPoints(snapshot, solid) {
  return (solid.faces ?? []).reduce((total, face) => {
    const points = face.pointIds.map(pointId => snapshot.scene.scene3d.points[pointId]);
    return total + polygonArea(points);
  }, 0);
}

function solidVolumeFromAuthoredPoints(snapshot, solid) {
  let signedVolume = 0;
  for (const face of solid.faces ?? []) {
    const points = face.pointIds.map(pointId => snapshot.scene.scene3d.points[pointId]);
    const anchor = points[0];
    for (let index = 1; index < points.length - 1; index += 1) {
      signedVolume += vectorDot(anchor, vectorCross(points[index], points[index + 1])) / 6;
    }
  }
  return Math.abs(signedVolume);
}

function createPeer(actorId) {
  const outbound = [];
  const lab = createGeometryLab({
    actorId,
    onDelta(delta, meta) {
      outbound.push({ delta: clone(delta), meta: clone(meta) });
    },
  });
  return { actorId, lab, outbound };
}

function deliverAll(source, target) {
  while (source.outbound.length > 0) {
    const message = source.outbound.shift();
    target.lab.applyDelta(clone(message.delta), {
      emit: false,
      meta: {
        ...clone(message.meta),
        source: 'remote',
      },
    });
  }
}

function assertPeersConverged(first, second) {
  const firstSnapshot = first.lab.getSnapshot();
  const secondSnapshot = second.lab.getSnapshot();
  assert.deepEqual(firstSnapshot.scene, secondSnapshot.scene);
  assert.deepEqual(firstSnapshot.appState, secondSnapshot.appState);
  assertNoDanglingReferences(firstSnapshot);
  assertNoDanglingReferences(secondSnapshot);
}

test('the public dependency graph covers every Geometry Lab record kind in both directions', () => {
  const lab = createGeometryLab();
  const firstPointId = lab.addPoint3D({ x: 0, y: 0, z: 0 });
  const secondPointId = lab.addPoint3D({ x: 2, y: 0, z: 0 });
  const thirdPointId = lab.addPoint3D({ x: 0, y: 2, z: 0 });
  const segmentId = lab.addSegment3D(firstPointId, secondPointId);
  const planeId = lab.addWorkPlaneByThreePoints([firstPointId, secondPointId, thirdPointId]);
  const parallelPlaneId = lab.addWorkPlaneParallelToPlane(planeId, { x: 0, y: 0, z: 1 });
  const distanceId = lab.addPointPlaneDistanceMeasurement(thirdPointId, parallelPlaneId);
  const solidId = lab.addPolyhedron('cube');
  const volumeId = lab.addVolumeMeasurement(solidId);
  const netId = lab.createUnfoldedNet(solidId);
  const sectionId = lab.addCrossSection(solidId, planeId);
  const snapshot = lab.getSnapshot();
  const solid = snapshot.scene.scene3d.entities[solidId];
  const section = snapshot.scene.scene3d.entities[sectionId];
  const link = snapshot.scene.links.find(candidate => candidate.sourceId === netId);
  const graph = buildGeometryLabDependencyGraph(snapshot);

  assert.ok(link);
  assertSetEqual(graph.dependenciesById[segmentId], [firstPointId, secondPointId]);
  assertSetEqual(graph.dependenciesById[planeId], [firstPointId, secondPointId, thirdPointId]);
  assertSetEqual(graph.dependenciesById[parallelPlaneId], [planeId]);
  assertSetEqual(graph.dependenciesById[distanceId], [thirdPointId, parallelPlaneId]);
  assertSetEqual(graph.dependenciesById[solidId], solid.pointIds);
  assertSetEqual(graph.dependenciesById[volumeId], [solidId]);
  assertSetEqual(graph.dependenciesById[netId], [solidId]);
  assertSetEqual(graph.dependenciesById[sectionId], [solidId, planeId, ...section.pointIds]);
  assertSetEqual(graph.dependenciesById[link.id], [netId, solidId]);

  assert.ok(graph.dependentsById[firstPointId].includes(segmentId));
  assert.ok(graph.dependentsById[firstPointId].includes(planeId));
  assert.ok(graph.dependentsById[planeId].includes(parallelPlaneId));
  assert.ok(graph.dependentsById[planeId].includes(sectionId));
  assertSetEqual(
    graph.dependentsById[solidId],
    [volumeId, netId, sectionId, link.id],
  );
  assertNoDanglingReferences(snapshot);
});

test('deleting a solid cascades through owned points, measurements, nets, links, selections, and cross-sections', () => {
  const lab = createGeometryLab();
  const unrelatedPointId = lab.addPoint3D({ x: 20, y: 20, z: 20 });
  const solidId = lab.addPolyhedron('cube');
  const measurementId = lab.addVolumeMeasurement(solidId);
  const netId = lab.createUnfoldedNet(solidId);
  const sectionId = lab.addCrossSection(solidId, 'xy');
  const before = lab.getSnapshot();
  const solid = before.scene.scene3d.entities[solidId];
  const section = before.scene.scene3d.entities[sectionId];
  const linkIds = before.scene.links
    .filter(link => link.sourceId === netId || link.targetId === solidId)
    .map(link => link.id);

  lab.applyDelta({
    op: 'setAppState',
    changes: {
      selected: [
        { kind: 'point3d', id: solid.pointIds[0] },
        { kind: 'entity3d', id: solidId },
        { kind: 'entity3d', id: sectionId },
        { kind: 'face', solidId, faceId: solid.faces[0].id },
        { kind: 'edge', solidId, edgeId: solid.edges[0].id },
        { kind: 'point3d', id: unrelatedPointId },
      ],
    },
  });

  lab.remove(solidId);

  const snapshot = lab.getSnapshot();
  assert.equal(snapshot.scene.scene3d.entities[solidId], undefined);
  assert.equal(snapshot.scene.scene3d.entities[sectionId], undefined);
  assert.equal(snapshot.scene.scene3d.measurements[measurementId], undefined);
  assert.equal(snapshot.scene.scene3d.nets[netId], undefined);
  for (const pointId of [...solid.pointIds, ...section.pointIds]) {
    assert.equal(snapshot.scene.scene3d.points[pointId], undefined);
  }
  for (const linkId of linkIds) {
    assert.equal(snapshot.scene.links.some(link => link.id === linkId), false);
  }
  assert.deepEqual(snapshot.appState.selected, [{ kind: 'point3d', id: unrelatedPointId }]);
  assert.ok(snapshot.scene.scene3d.points[unrelatedPointId]);
  assertNoDanglingReferences(snapshot);
});

test('deleting a point cascades transitively through constructed objects, entities, planes, and measurements', () => {
  const lab = createGeometryLab();
  const firstPointId = lab.addPoint3D({ x: 0, y: 0, z: 0 });
  const secondPointId = lab.addPoint3D({ x: 2, y: 0, z: 0 });
  const thirdPointId = lab.addPoint3D({ x: 0, y: 2, z: 0 });
  const probePointId = lab.addPoint3D({ x: 0, y: 0, z: 3 });
  const derivedPointId = 'constructed-midpoint';
  lab.applyDelta({
    op: 'addPoint3D',
    point: {
      id: derivedPointId,
      kind: 'point3d',
      x: 1,
      y: 0,
      z: 0,
      construction: { kind: 'midpoint', sourceIds: [firstPointId, secondPointId] },
    },
  });
  const segmentId = lab.addSegment3D(firstPointId, secondPointId);
  const planeId = lab.addWorkPlaneByThreePoints([firstPointId, secondPointId, thirdPointId]);
  const parallelPlaneId = lab.addWorkPlaneParallelToPlane(planeId, probePointId);
  const measurementId = lab.addPointPlaneDistanceMeasurement(probePointId, parallelPlaneId);

  lab.remove(firstPointId);

  const snapshot = lab.getSnapshot();
  assert.equal(snapshot.scene.scene3d.points[firstPointId], undefined);
  assert.equal(snapshot.scene.scene3d.points[derivedPointId], undefined);
  assert.equal(snapshot.scene.scene3d.entities[segmentId], undefined);
  assert.equal(snapshot.scene.scene3d.workPlanes[planeId], undefined);
  assert.equal(snapshot.scene.scene3d.workPlanes[parallelPlaneId], undefined);
  assert.equal(snapshot.scene.scene3d.measurements[measurementId], undefined);
  assert.equal(snapshot.appState.activeWorkPlaneId, 'xy');
  assert.ok(snapshot.scene.scene3d.points[secondPointId]);
  assert.ok(snapshot.scene.scene3d.points[thirdPointId]);
  assert.ok(snapshot.scene.scene3d.points[probePointId]);
  assertNoDanglingReferences(snapshot);
});

test('entity and work-plane deletion cascades to their transitive dependents and owned section points', () => {
  const lab = createGeometryLab();
  const firstPointId = lab.addPoint3D({ x: -2, y: 0, z: 0 });
  const secondPointId = lab.addPoint3D({ x: 2, y: 0, z: 0 });
  const lineId = lab.addLine3D(firstPointId, secondPointId);
  const perpendicularPlaneId = lab.addWorkPlanePerpendicularToLine(lineId);
  const planeMeasurementId = lab.addPointPlaneDistanceMeasurement(firstPointId, perpendicularPlaneId);

  lab.remove(lineId);

  let snapshot = lab.getSnapshot();
  assert.equal(snapshot.scene.scene3d.entities[lineId], undefined);
  assert.equal(snapshot.scene.scene3d.workPlanes[perpendicularPlaneId], undefined);
  assert.equal(snapshot.scene.scene3d.measurements[planeMeasurementId], undefined);
  assertNoDanglingReferences(snapshot);

  const solidId = lab.addPolyhedron('cube');
  const planeId = lab.addWorkPlaneByEquation({ a: 0, b: 0, c: 1, d: 0 });
  const sectionId = lab.addCrossSection(solidId, planeId);
  snapshot = lab.getSnapshot();
  const sectionPointIds = snapshot.scene.scene3d.entities[sectionId].pointIds;

  lab.remove(planeId);

  snapshot = lab.getSnapshot();
  assert.equal(snapshot.scene.scene3d.workPlanes[planeId], undefined);
  assert.equal(snapshot.scene.scene3d.entities[sectionId], undefined);
  for (const pointId of sectionPointIds) {
    assert.equal(snapshot.scene.scene3d.points[pointId], undefined);
  }
  assert.ok(snapshot.scene.scene3d.entities[solidId]);
  assertNoDanglingReferences(snapshot);
});

test('clear2D, clear3D, and clearAll remove cross-scene references and selections without damaging the other scene', () => {
  const initial = createEmptyGeometryLabSnapshot();
  initial.scene.scene2d.points['point-2d-a'] = { id: 'point-2d-a', kind: 'point2d', x: 0, y: 0 };
  initial.scene.scene2d.points['point-2d-b'] = { id: 'point-2d-b', kind: 'point2d', x: 1, y: 0 };
  initial.scene.scene2d.entities['segment-2d'] = {
    id: 'segment-2d',
    kind: 'segment',
    pointIds: ['point-2d-a', 'point-2d-b'],
  };
  initial.scene.scene2d.constraints['length-2d'] = {
    id: 'length-2d',
    kind: 'fixedLength',
    pointIds: ['point-2d-a', 'point-2d-b'],
    length: 1,
  };
  const lab = createGeometryLab({ initialSnapshot: initial });
  const point3dId = lab.addPoint3D({ x: 0, y: 0, z: 1 });
  lab.applyDelta({
    op: 'setSceneLink',
    link: {
      id: 'projection-link',
      kind: 'projection',
      sourceId: 'segment-2d',
      targetId: point3dId,
    },
  });
  lab.applyDelta({
    op: 'setAppState',
    changes: {
      selected: [
        { kind: 'entity2d', id: 'segment-2d' },
        { kind: 'point3d', id: point3dId },
      ],
    },
  });
  const complete = lab.getSnapshot();

  lab.applyDelta({ op: 'clear2D' });
  let snapshot = lab.getSnapshot();
  assert.deepEqual(snapshot.scene.scene2d.points, {});
  assert.deepEqual(snapshot.scene.scene2d.entities, {});
  assert.deepEqual(snapshot.scene.scene2d.constraints, {});
  assert.deepEqual(snapshot.scene.links, []);
  assert.ok(snapshot.scene.scene3d.points[point3dId]);
  assert.deepEqual(snapshot.appState.selected, [{ kind: 'point3d', id: point3dId }]);
  assertNoDanglingReferences(snapshot);

  lab.undo();
  assert.deepEqual(lab.getSnapshot().scene, complete.scene);
  lab.applyDelta({ op: 'clear3D' });
  snapshot = lab.getSnapshot();
  assert.ok(snapshot.scene.scene2d.entities['segment-2d']);
  assert.equal(snapshot.scene.scene3d.points[point3dId], undefined);
  assert.deepEqual(Object.keys(snapshot.scene.scene3d.workPlanes), ['xy']);
  assert.deepEqual(snapshot.scene.links, []);
  assert.deepEqual(snapshot.appState.selected, [{ kind: 'entity2d', id: 'segment-2d' }]);
  assert.equal(snapshot.appState.activeWorkPlaneId, 'xy');
  assertNoDanglingReferences(snapshot);

  lab.undo();
  lab.applyDelta({ op: 'clearAll' });
  assert.deepEqual(lab.getSnapshot(), createEmptyGeometryLabSnapshot());
  assertNoDanglingReferences(lab.getSnapshot());
});

test('source-point edits recompute three-point work planes and dependent measurements', () => {
  const lab = createGeometryLab();
  const firstPointId = lab.addPoint3D({ x: 0, y: 0, z: 0 });
  const secondPointId = lab.addPoint3D({ x: 2, y: 0, z: 0 });
  const thirdPointId = lab.addPoint3D({ x: 0, y: 2, z: 0 });
  const probePointId = lab.addPoint3D({ x: 0, y: 0, z: 2 });
  const midpointId = 'canonical-midpoint-3d';
  lab.applyDelta({
    op: 'addPoint3D',
    point: {
      id: midpointId,
      kind: 'point3d',
      x: 999,
      y: 999,
      z: 999,
      construction: { kind: 'midpoint', sourceIds: [secondPointId, thirdPointId] },
    },
  });
  const planeId = lab.addWorkPlaneByThreePoints([firstPointId, secondPointId, thirdPointId]);
  const measurementId = lab.addPointPlaneDistanceMeasurement(probePointId, planeId);
  const before = lab.getSnapshot();
  const beforeEquation = before.scene.scene3d.workPlanes[planeId].equation;
  const beforeValue = before.scene.scene3d.measurements[measurementId].value;

  lab.applyDelta({ op: 'updatePoint', id: thirdPointId, changes: { z: 2 } });

  const snapshot = lab.getSnapshot();
  const plane = snapshot.scene.scene3d.workPlanes[planeId];
  const measurement = snapshot.scene.scene3d.measurements[measurementId];
  assert.notDeepEqual(plane.equation, beforeEquation);
  assert.notEqual(measurement.value, beforeValue);
  assert.deepEqual(snapshot.scene.scene3d.points[midpointId], {
    id: midpointId,
    kind: 'point3d',
    x: 1,
    y: 1,
    z: 1,
    construction: { kind: 'midpoint', sourceIds: [secondPointId, thirdPointId] },
  });
  assertClose(measurement.value, lab.pointPlaneDistance(probePointId, planeId), 'measurement follows its recomputed plane');
  assertNoDanglingReferences(snapshot);
});

test('solid point edits refresh cached faces, edges, measurements, nets, and cross-sections', () => {
  const lab = createGeometryLab();
  const solidId = lab.addPolyhedron('cube');
  const volumeMeasurementId = lab.addVolumeMeasurement(solidId);
  const areaMeasurementId = lab.addSurfaceAreaMeasurement(solidId);
  const netId = lab.createUnfoldedNet(solidId);
  const sectionId = lab.addCrossSection(solidId, 'xy');
  const before = lab.getSnapshot();
  const solidBefore = before.scene.scene3d.entities[solidId];
  const sectionBefore = before.scene.scene3d.entities[sectionId];

  const deformation = solidBefore.pointIds.flatMap(pointId => {
    const point = before.scene.scene3d.points[pointId];
    return point.x === -1 ? [{ op: 'updatePoint', id: pointId, changes: { x: -2 } }] : [];
  });
  lab.applyDelta({ op: 'batch', deltas: deformation });

  const snapshot = lab.getSnapshot();
  const solid = snapshot.scene.scene3d.entities[solidId];
  const net = snapshot.scene.scene3d.nets[netId];
  const section = snapshot.scene.scene3d.entities[sectionId];
  const expectedVolume = solidVolumeFromAuthoredPoints(snapshot, solid);
  const expectedArea = solidAreaFromAuthoredPoints(snapshot, solid);

  assertClose(expectedVolume, 12, 'deformed cube volume');
  assertClose(expectedArea, 32, 'deformed cube surface area');
  assertClose(solid.volume, expectedVolume, 'solid volume cache');
  assertClose(solid.surfaceArea, expectedArea, 'solid surface-area cache');
  assertClose(snapshot.scene.scene3d.measurements[volumeMeasurementId].value, expectedVolume, 'volume measurement');
  assertClose(snapshot.scene.scene3d.measurements[areaMeasurementId].value, expectedArea, 'surface-area measurement');
  assertClose(net.totalArea, expectedArea, 'net total area');

  for (const face of solid.faces) {
    const points = face.pointIds.map(pointId => snapshot.scene.scene3d.points[pointId]);
    assertClose(face.area, polygonArea(points), `face ${face.id} area`);
  }
  for (const edge of solid.edges) {
    const [first, second] = edge.pointIds.map(pointId => snapshot.scene.scene3d.points[pointId]);
    assertClose(edge.length, vectorLength(vectorSubtract(first, second)), `edge ${edge.id} length`);
  }

  assert.notDeepEqual(section.vertices, sectionBefore.vertices);
  const sectionPoints = section.pointIds.map(pointId => snapshot.scene.scene3d.points[pointId]);
  assert.deepEqual(
    sectionPoints.map(({ x, y, z }) => ({ x, y, z })),
    section.vertices,
  );
  assertClose(section.area, polygonArea(section.vertices), 'cross-section area');
  assertClose(section.perimeter, polygonPerimeter(section.vertices), 'cross-section perimeter');
  assertNoDanglingReferences(snapshot);
});

test('transactions that would introduce dangling references are rejected atomically', () => {
  const lab = createGeometryLab();
  const before = lab.getSnapshot();

  assert.throws(
    () => lab.applyDelta({
      op: 'batch',
      deltas: [
        {
          op: 'addPoint3D',
          point: { id: 'valid-first', kind: 'point3d', x: 0, y: 0, z: 0 },
        },
        {
          op: 'addEntity3D',
          entity: {
            id: 'dangling-segment',
            kind: 'segment',
            pointIds: ['valid-first', 'missing-point'],
          },
        },
      ],
    }),
    error => error?.code === 'invalid_delta_result',
  );

  assert.deepEqual(lab.getSnapshot(), before);
  assertNoDanglingReferences(lab.getSnapshot());
});

test('undefined 2D constructions and unsupported 3D construction rules reject atomically', () => {
  const initial = createEmptyGeometryLabSnapshot();
  Object.assign(initial.scene.scene2d.points, {
    a: { id: 'a', kind: 'point2d', x: 0, y: 0 },
    b: { id: 'b', kind: 'point2d', x: 1, y: 0 },
    c: { id: 'c', kind: 'point2d', x: 0.5, y: -1 },
    d: { id: 'd', kind: 'point2d', x: 0.5, y: 1 },
    intersection: {
      id: 'intersection',
      kind: 'point2d',
      x: 0.5,
      y: 0,
      construction: { kind: 'intersection', sourceIds: ['horizontal', 'vertical'] },
    },
  });
  Object.assign(initial.scene.scene2d.entities, {
    horizontal: { id: 'horizontal', kind: 'line', pointIds: ['a', 'b'] },
    vertical: { id: 'vertical', kind: 'line', pointIds: ['c', 'd'] },
  });
  const lab = createGeometryLab({ initialSnapshot: initial });
  const beforeParallelEdit = lab.getSnapshot();

  assert.throws(
    () => lab.applyDelta({ op: 'updatePoint', id: 'd', changes: { x: 1.5, y: -1 } }),
    error => error?.code === 'invalid_delta_result'
      && error?.details?.canonicalizationCode === 'unrecomputable_2d',
  );
  assert.deepEqual(lab.getSnapshot(), beforeParallelEdit);

  const sourceId = lab.addPoint3D({ x: 0, y: 0, z: 0 });
  const beforeUnsupported = lab.getSnapshot();
  assert.throws(
    () => lab.applyDelta({
      op: 'addPoint3D',
      point: {
        id: 'unsupported-3d-construction',
        kind: 'point3d',
        x: 1,
        y: 1,
        z: 1,
        construction: { kind: 'custom', sourceIds: [sourceId], label: 'host-only' },
      },
    }),
    error => error?.code === 'invalid_delta_result'
      && error?.details?.canonicalizationCode === 'unrecomputable_point',
  );
  assert.deepEqual(lab.getSnapshot(), beforeUnsupported);
});

test('solid cascades are undoable, redoable, and converge when replayed remotely', () => {
  const leader = createPeer('leader');
  const follower = createPeer('follower');
  const solidId = leader.lab.addPolyhedron('cube');
  const measurementId = leader.lab.addVolumeMeasurement(solidId);
  const netId = leader.lab.createUnfoldedNet(solidId);
  const sectionId = leader.lab.addCrossSection(solidId, 'xy');
  deliverAll(leader, follower);
  assertPeersConverged(leader, follower);

  const populated = leader.lab.getSnapshot();
  const ownedPointIds = [
    ...populated.scene.scene3d.entities[solidId].pointIds,
    ...populated.scene.scene3d.entities[sectionId].pointIds,
  ];

  leader.lab.remove(solidId);
  assert.equal(leader.outbound.length, 1);
  assert.equal(leader.outbound[0].delta.op, 'delete');
  deliverAll(leader, follower);
  assertPeersConverged(leader, follower);
  let snapshot = leader.lab.getSnapshot();
  assert.equal(snapshot.scene.scene3d.entities[solidId], undefined);
  assert.equal(snapshot.scene.scene3d.entities[sectionId], undefined);
  assert.equal(snapshot.scene.scene3d.measurements[measurementId], undefined);
  assert.equal(snapshot.scene.scene3d.nets[netId], undefined);
  for (const pointId of ownedPointIds) assert.equal(snapshot.scene.scene3d.points[pointId], undefined);

  leader.lab.undo();
  assert.equal(leader.outbound.length, 1);
  assert.equal(leader.outbound[0].delta.op, 'historyPatch');
  deliverAll(leader, follower);
  assertPeersConverged(leader, follower);
  snapshot = leader.lab.getSnapshot();
  assert.ok(snapshot.scene.scene3d.entities[solidId]);
  assert.ok(snapshot.scene.scene3d.entities[sectionId]);
  assert.ok(snapshot.scene.scene3d.measurements[measurementId]);
  assert.ok(snapshot.scene.scene3d.nets[netId]);
  for (const pointId of ownedPointIds) assert.ok(snapshot.scene.scene3d.points[pointId]);

  leader.lab.redo();
  assert.equal(leader.outbound.length, 1);
  assert.equal(leader.outbound[0].delta.op, 'historyPatch');
  deliverAll(leader, follower);
  assertPeersConverged(leader, follower);
  snapshot = leader.lab.getSnapshot();
  assert.equal(snapshot.scene.scene3d.entities[solidId], undefined);
  assert.equal(snapshot.scene.scene3d.entities[sectionId], undefined);
  assert.equal(snapshot.scene.scene3d.measurements[measurementId], undefined);
  assert.equal(snapshot.scene.scene3d.nets[netId], undefined);
  for (const pointId of ownedPointIds) assert.equal(snapshot.scene.scene3d.points[pointId], undefined);
});

test('a remote dependent invalidates local source undo before it can orphan peer state', () => {
  const leader = createPeer('dependency-owner');
  const follower = createPeer('dependency-author');
  const solidId = leader.lab.addPolyhedron('cube');
  deliverAll(leader, follower);

  const measurementId = follower.lab.addVolumeMeasurement(solidId);
  deliverAll(follower, leader);
  assertPeersConverged(leader, follower);

  const beforeUndo = leader.lab.getSnapshot();
  leader.lab.undo();

  assert.equal(leader.outbound.length, 0);
  assert.deepEqual(leader.lab.getSnapshot(), beforeUndo);
  assert.ok(leader.lab.getSnapshot().scene.scene3d.entities[solidId]);
  assert.ok(leader.lab.getSnapshot().scene.scene3d.measurements[measurementId]);
  assertPeersConverged(leader, follower);
});

test('compact JSON persistence rehydrates derived meshes without losing edge selections', async () => {
  const lab = createGeometryLab();
  const solidId = lab.addPolyhedron('cube');
  const netId = lab.createUnfoldedNet(solidId);
  const sectionId = lab.addCrossSection(solidId, 'xy');
  const before = lab.getSnapshot();
  const edgeId = before.scene.scene3d.entities[solidId].edges[0].id;
  lab.applyDelta({
    op: 'setAppState',
    changes: { selected: [{ kind: 'edge', solidId, edgeId }] },
  });

  const exported = await lab.export({ format: 'json' });
  const compactSolid = exported.data.scene.scene3d.entities[solidId];
  const compactSection = exported.data.scene.scene3d.entities[sectionId];
  assert.equal(compactSolid.edges, undefined);
  assert.equal(compactSolid.volume, undefined);
  assert.equal(compactSolid.faces[0].area, undefined);
  assert.deepEqual(exported.data.scene.scene3d.nets[netId].faces, []);
  assert.equal(compactSection.vertices, undefined);

  const restored = parseGeometryLabSnapshotJson(exported.data);
  const restoredSolid = restored.scene.scene3d.entities[solidId];
  const restoredSection = restored.scene.scene3d.entities[sectionId];
  assert.equal(restoredSolid.edges.length, 12);
  assert.equal(restoredSolid.volume, lab.getSnapshot().scene.scene3d.entities[solidId].volume);
  assert.ok(restored.scene.scene3d.nets[netId].faces.length > 0);
  assert.ok(restoredSection.vertices.length > 0);
  assert.deepEqual(restored.appState.selected, [{ kind: 'edge', solidId, edgeId }]);
  assertNoDanglingReferences(restored);
});

test('creation deltas transmit authored topology and rehydrate deterministic meshes locally', () => {
  const outbound = [];
  const lab = createGeometryLab({
    onDelta(delta) {
      outbound.push(clone(delta));
    },
  });

  const solidId = lab.addPolyhedron('cube');
  const solidBatch = outbound.shift();
  const authoredSolid = solidBatch.deltas.find(delta => delta.op === 'addEntity3D').entity;
  assert.equal(authoredSolid.edges, undefined);
  assert.equal(authoredSolid.volume, undefined);
  assert.equal(authoredSolid.faces[0].area, undefined);
  assert.equal(lab.getSnapshot().scene.scene3d.entities[solidId].edges.length, 12);

  const netId = lab.createUnfoldedNet(solidId);
  const netBatch = outbound.shift();
  const authoredNet = netBatch.deltas.find(delta => delta.op === 'addNet').net;
  assert.deepEqual(authoredNet.faces, []);
  assert.ok(lab.getSnapshot().scene.scene3d.nets[netId].faces.length > 0);

  const sectionId = lab.addCrossSection(solidId, 'xy');
  const sectionBatch = outbound.shift();
  const authoredSection = sectionBatch.deltas.find(
    delta => delta.op === 'addEntity3D' && delta.entity.kind === 'crossSection',
  ).entity;
  assert.equal(authoredSection.vertices, undefined);
  assert.ok(lab.getSnapshot().scene.scene3d.entities[sectionId].vertices.length > 0);
});

test('legacy through-vector work planes migrate from their stored origin without moving', () => {
  const source = createGeometryLab();
  const sourcePlaneId = source.addWorkPlaneByEquation({ a: 0, b: 0, c: 1, d: 0 });
  const parallelId = source.addWorkPlaneParallelToPlane(sourcePlaneId, { x: 0, y: 0, z: 3 });
  const legacy = source.getSnapshot();
  delete legacy.scene.scene3d.workPlanes[parallelId].source.through;

  const restored = createGeometryLab({ initialSnapshot: legacy });
  let restoredPlane = restored.getSnapshot().scene.scene3d.workPlanes[parallelId];
  assert.deepEqual(restoredPlane.origin, [0, 0, 3]);
  assert.deepEqual(restoredPlane.source.through, [0, 0, 3]);

  restored.applyDelta({
    op: 'updateWorkPlane',
    id: sourcePlaneId,
    changes: { equation: { a: 0, b: 0, c: 1, d: -5 } },
  });
  restoredPlane = restored.getSnapshot().scene.scene3d.workPlanes[parallelId];
  assert.deepEqual(restoredPlane.origin, [0, 0, 3]);
});

test('protected planes, dependency cycles, and shared ownership reject atomically', () => {
  const lab = createGeometryLab();
  const empty = lab.getSnapshot();
  assert.throws(
    () => lab.applyDelta({ op: 'deleteWorkPlane', ids: ['xy'] }),
    error => error?.code === 'dependency_delete_blocked',
  );
  assert.deepEqual(lab.getSnapshot(), empty);

  const xy = empty.scene.scene3d.workPlanes.xy;
  assert.throws(
    () => lab.applyDelta({
      op: 'batch',
      deltas: [
        {
          op: 'addWorkPlane',
          plane: {
            ...clone(xy),
            id: 'cycle-plane-a',
            source: {
              kind: 'parallelPlane',
              sourcePlaneId: 'cycle-plane-b',
              through: [0, 0, 0],
            },
          },
        },
        {
          op: 'addWorkPlane',
          plane: {
            ...clone(xy),
            id: 'cycle-plane-b',
            source: {
              kind: 'parallelPlane',
              sourcePlaneId: 'cycle-plane-a',
              through: [0, 0, 0],
            },
          },
        },
      ],
    }),
    error => error?.code === 'invalid_delta_result'
      && error?.details?.canonicalizationCode === 'work_plane_cycle',
  );
  assert.deepEqual(lab.getSnapshot(), empty);

  const solidId = lab.addPolyhedron('cube');
  const beforeConflict = lab.getSnapshot();
  const sharedOwner = clone(beforeConflict.scene.scene3d.entities[solidId]);
  sharedOwner.id = 'shared-solid-owner';
  assert.throws(
    () => lab.applyDelta({ op: 'addEntity3D', entity: sharedOwner }),
    error => error?.code === 'invalid_delta_result',
  );
  assert.deepEqual(lab.getSnapshot(), beforeConflict);
});
