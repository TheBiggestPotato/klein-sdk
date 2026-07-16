import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertGeometryLabInvariants,
  createGeometryLab,
  createGeometryLabRuntime,
  getGeometryLabInvariantIssues,
  parseGeometryLabSnapshotJson,
} from '../../dist/geometry-lab/index.js';

function assertInvariantClean(snapshot) {
  assert.deepEqual(getGeometryLabInvariantIssues(snapshot), []);
  assert.doesNotThrow(() => assertGeometryLabInvariants(snapshot));
}

test('equation surfaces support add, edit, delete, and undo', () => {
  const runtime = createGeometryLabRuntime();
  const added = runtime.execute({
    type: 'addEquationSurface3D',
    payload: {
      input: 'z = x^2 + y^2',
      samples: 10,
      label: 'Paraboloid',
    },
  });

  assert.equal(added.ok, true, added.ok ? undefined : added.error.message);
  assert.equal(typeof added.payload, 'string');
  const surfaceId = added.payload;

  let snapshot = runtime.getSnapshot();
  let surface = snapshot.scene.scene3d.entities[surfaceId];
  assert.equal(surface?.kind, 'surface3d');
  assert.equal(surface?.surfaceKind, 'equation');
  assert.equal(surface?.input, 'z = x^2 + y^2');
  assert.equal(surface?.vertices.length, 100);
  assertInvariantClean(snapshot);

  const edited = runtime.execute({
    type: 'updateEquationSurface3D',
    payload: {
      id: surfaceId,
      input: 'z = x - y',
      samples: 8,
    },
  });

  assert.equal(edited.ok, true, edited.ok ? undefined : edited.error.message);
  snapshot = runtime.getSnapshot();
  surface = snapshot.scene.scene3d.entities[surfaceId];
  assert.equal(surface?.kind, 'surface3d');
  assert.equal(surface?.surfaceKind, 'equation');
  assert.equal(surface?.input, 'z = x - y');
  assert.equal(surface?.vertices.length, 64);
  assertInvariantClean(snapshot);

  const deleted = runtime.execute({ type: 'delete', payload: surfaceId });
  assert.equal(deleted.ok, true, deleted.ok ? undefined : deleted.error.message);
  snapshot = runtime.getSnapshot();
  assert.equal(snapshot.scene.scene3d.entities[surfaceId], undefined);
  assertInvariantClean(snapshot);

  const undone = runtime.execute({ type: 'undo' });
  assert.equal(undone.ok, true, undone.ok ? undefined : undone.error.message);
  snapshot = runtime.getSnapshot();
  surface = snapshot.scene.scene3d.entities[surfaceId];
  assert.equal(surface?.kind, 'surface3d');
  assert.equal(surface?.surfaceKind, 'equation');
  assert.equal(surface?.input, 'z = x - y');
  assert.equal(surface?.vertices.length, 64);
  assertInvariantClean(snapshot);
});

test('invariant helpers accept valid scenes and reject dangling references', () => {
  const lab = createGeometryLab();
  const firstPointId = lab.addPoint3D({ x: 0, y: 0, z: 0 });
  const secondPointId = lab.addPoint3D({ x: 1, y: 0, z: 0 });
  lab.addSegment3D(firstPointId, secondPointId);

  const validSnapshot = lab.getSnapshot();
  assertInvariantClean(validSnapshot);

  const invalidSnapshot = structuredClone(validSnapshot);
  delete invalidSnapshot.scene.scene3d.points[firstPointId];

  const issues = getGeometryLabInvariantIssues(invalidSnapshot);
  assert.ok(issues.length > 0);
  assert.throws(() => assertGeometryLabInvariants(invalidSnapshot));
});

test('invariant helpers detect identity, mesh, and sub-object corruption', () => {
  const lab = createGeometryLab();
  const pointId = lab.addPoint3D({ x: 0, y: 0, z: 0 });
  const surfaceId = lab.addEquationSurface3D({ input: 'z = x + y', samples: 4 });
  const solidId = lab.addPolyhedron('cube');
  const snapshot = lab.getSnapshot();

  snapshot.scene.scene3d.points[pointId].id = 'mismatched-id';
  snapshot.scene.scene2d.points['duplicate-key'] = { id: 'xy', kind: 'point2d', x: 0, y: 0 };
  snapshot.scene.scene3d.entities[surfaceId].faces[0][0] = 100_000;
  const solid = snapshot.scene.scene3d.entities[solidId];
  solid.edges[1].id = solid.edges[0].id;

  const issues = getGeometryLabInvariantIssues(snapshot);
  assert.ok(issues.some(issue => issue.message.includes('does not match object id')));
  assert.ok(issues.some(issue => issue.message.includes('already used')));
  assert.ok(issues.some(issue => issue.message.includes('out of bounds')));
  assert.ok(issues.some(issue => issue.message.includes('Duplicate solid edge id')));
  assert.ok(snapshot.scene.scene3d.entities[solidId]);
  assert.throws(() => assertGeometryLabInvariants(snapshot), error => error?.code === 'geometry_lab_invariant_violation');
});

test('deterministic mixed local operations preserve model invariants', () => {
  const lab = createGeometryLab();
  let seed = 0x5eed1234;
  const next = () => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed;
  };

  for (let step = 0; step < 120; step += 1) {
    const snapshot = lab.getSnapshot();
    const pointIds = Object.keys(snapshot.scene.scene3d.points);
    const surfaceIds = Object.values(snapshot.scene.scene3d.entities)
      .filter(entity => entity.kind === 'surface3d' && entity.surfaceKind === 'equation')
      .map(entity => entity.id);
    const operation = next() % 7;

    if (operation <= 2 || pointIds.length < 2) {
      lab.addPoint3D({ x: (next() % 101) - 50, y: (next() % 101) - 50, z: (next() % 101) - 50 });
    } else if (operation === 3) {
      const first = pointIds[next() % pointIds.length];
      let second = pointIds[next() % pointIds.length];
      if (second === first) second = pointIds[(pointIds.indexOf(first) + 1) % pointIds.length];
      lab.addSegment3D(first, second);
    } else if (operation === 4) {
      lab.addEquationSurface3D({ input: 'z = x^2 + y', samples: 4 });
    } else if (operation === 5 && surfaceIds.length) {
      lab.remove(surfaceIds[next() % surfaceIds.length]);
    } else {
      lab.undo();
      lab.redo();
    }

    assertInvariantClean(lab.getSnapshot());
  }
});

test('loading a snapshot cannot reuse and overwrite an existing id', () => {
  const source = createGeometryLab();
  const existingId = source.addPoint3D({ x: 1, y: 2, z: 3 });
  const existingPoint = source.getSnapshot().scene.scene3d.points[existingId];

  const restored = createGeometryLab({ initialSnapshot: source.getSnapshot() });
  const newId = restored.addPoint3D({ x: 9, y: 9, z: 9 });
  const snapshot = restored.getSnapshot();

  assert.notEqual(newId, existingId);
  assert.equal(Object.keys(snapshot.scene.scene3d.points).length, 2);
  assert.deepEqual(snapshot.scene.scene3d.points[existingId], existingPoint);
});

test('undoing a local edit preserves a later remote point', () => {
  const lab = createGeometryLab();
  const localPointId = lab.addPoint3D({ x: 1, y: 0, z: 0 });
  const remotePoint = {
    id: 'remote-point',
    kind: 'point3d',
    x: 0,
    y: 1,
    z: 0,
  };

  lab.applyDelta(
    { op: 'addPoint3D', point: remotePoint },
    { emit: false, meta: { source: 'remote' } },
  );
  lab.undo();

  const points = lab.getSnapshot().scene.scene3d.points;
  assert.equal(points[localPointId], undefined);
  assert.deepEqual(points[remotePoint.id], remotePoint);
});

test('JSON export does not expose mutable instrument state', async () => {
  const lab = createGeometryLab();
  const pointId = lab.addPoint3D({ x: 1, y: 2, z: 3 });
  const exported = await lab.export({ format: 'json' });

  assert.equal(exported.format, 'json');
  exported.data.scene.scene3d.points[pointId].x = 999;

  assert.equal(lab.getSnapshot().scene.scene3d.points[pointId].x, 1);
});

test('content-only JSON export can be parsed back into a snapshot', async () => {
  const lab = createGeometryLab();
  lab.addPoint3D({ x: 1, y: 2, z: 3 });
  const exported = await lab.export({ format: 'json', includeAppState: false });

  assert.equal(exported.format, 'json');
  const parsed = parseGeometryLabSnapshotJson(exported.data);
  assert.equal(parsed.instrument, 'geometry-lab');
  assert.ok(parsed.appState);
  assert.equal(Object.keys(parsed.scene.scene3d.points).length, 1);
});

test('deleting a solid cascades to owned points and dependent records', () => {
  const lab = createGeometryLab();
  const solidId = lab.addPolyhedron('cube');
  const measurementId = lab.addVolumeMeasurement(solidId);
  const netId = lab.createUnfoldedNet(solidId);
  const ownedPointIds = lab.getSnapshot().scene.scene3d.entities[solidId].pointIds;

  lab.remove(solidId);

  const snapshot = lab.getSnapshot();
  assert.equal(snapshot.scene.scene3d.entities[solidId], undefined);
  for (const pointId of ownedPointIds) {
    assert.equal(snapshot.scene.scene3d.points[pointId], undefined);
  }
  assert.equal(snapshot.scene.scene3d.measurements[measurementId], undefined);
  assert.equal(snapshot.scene.scene3d.nets[netId], undefined);
  assert.equal(
    snapshot.scene.links.some(link => link.sourceId === netId || link.targetId === solidId),
    false,
  );
});

test('read-only instruments reject local deltas', () => {
  const lab = createGeometryLab({ readOnly: true });

  assert.throws(
    () => lab.applyDelta({
      op: 'addPoint3D',
      point: {
        id: 'local-point',
        kind: 'point3d',
        x: 0,
        y: 0,
        z: 0,
      },
    }),
    error => error?.code === 'read_only',
  );
  assert.deepEqual(lab.getSnapshot().scene.scene3d.points, {});
});

test('observer exceptions do not turn committed edits into operation failures', () => {
  const observerErrors = [];
  const lab = createGeometryLab({
    onDelta() {
      throw new Error('observer blew up');
    },
    onError(error) {
      observerErrors.push(error);
    },
  });
  let pointId;

  assert.doesNotThrow(() => {
    pointId = lab.addPoint3D({ x: 1, y: 2, z: 3 });
  });

  assert.equal(typeof pointId, 'string');
  assert.ok(lab.getSnapshot().scene.scene3d.points[pointId]);
  assert.equal(observerErrors.length, 1);
  assert.match(observerErrors[0].message, /observer blew up/);
});
