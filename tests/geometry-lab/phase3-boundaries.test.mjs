import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEmptyGeometryLabSnapshot,
  createGeometryLab,
  createGeometryLabRuntime,
  parseGeometryLabSnapshotJson,
  reduceGeometryLabDelta,
  validateGeometryLabCommand,
  validateGeometryLabDelta,
  validateGeometryLabSnapshot,
} from '../../dist/geometry-lab/index.js';

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function point3d(id, x = 0, y = 0, z = 0) {
  return { id, kind: 'point3d', x, y, z };
}

function assertRejectedValidation(result, label) {
  assert.equal(result.ok, false, `${label} should be rejected.`);
  if (!result.ok) assert.ok(result.issues.length > 0, `${label} should report at least one issue.`);
}

function assertRejectedCommand(result, label) {
  assert.equal(result.ok, false, `${label} should be rejected.`);
  if (!result.ok) assert.ok(result.error, `${label} should return an SDK error.`);
}

test('snapshot validation rejects malformed nested values at every public load boundary', () => {
  const malformedSnapshots = [
    {
      label: 'non-finite nested point coordinate',
      create() {
        const snapshot = createEmptyGeometryLabSnapshot();
        snapshot.scene.scene3d.points.bad = point3d('bad', Number.POSITIVE_INFINITY, 0, 0);
        return snapshot;
      },
    },
    {
      label: 'record key and object id mismatch',
      create() {
        const snapshot = createEmptyGeometryLabSnapshot();
        snapshot.scene.scene3d.points.key = point3d('different-id');
        return snapshot;
      },
    },
    {
      label: 'malformed nested scene link',
      create() {
        const snapshot = createEmptyGeometryLabSnapshot();
        snapshot.scene.links.push(null);
        return snapshot;
      },
    },
    {
      label: 'malformed camera tuple',
      create() {
        const snapshot = createEmptyGeometryLabSnapshot();
        snapshot.appState.view3d.position = [1, 2];
        return snapshot;
      },
    },
    {
      label: 'duplicate id across top-level collections',
      create() {
        const snapshot = createEmptyGeometryLabSnapshot();
        snapshot.scene.scene3d.points.xy = point3d('xy');
        return snapshot;
      },
    },
    {
      label: 'equation surface without canonical input',
      create() {
        const snapshot = createEmptyGeometryLabSnapshot();
        snapshot.scene.scene3d.entities.surface = {
          id: 'surface',
          kind: 'surface3d',
          surfaceKind: 'equation',
          vertices: [],
          faces: [],
        };
        return snapshot;
      },
    },
  ];

  for (const malformed of malformedSnapshots) {
    const snapshot = malformed.create();
    assertRejectedValidation(validateGeometryLabSnapshot(snapshot), malformed.label);
    assert.throws(
      () => parseGeometryLabSnapshotJson(snapshot),
      error => error?.code === 'invalid_snapshot',
      `${malformed.label} should be rejected by the JSON parser.`,
    );
    assert.throws(
      () => createGeometryLab({ initialSnapshot: snapshot }),
      error => error?.code === 'invalid_initial_snapshot',
      `${malformed.label} should be rejected by the constructor.`,
    );

    const lab = createGeometryLab();
    const before = lab.getSnapshot();
    assert.throws(
      () => lab.loadSnapshot(snapshot),
      error => error?.code === 'invalid_snapshot',
      `${malformed.label} should be rejected by loadSnapshot.`,
    );
    assert.deepEqual(lab.getSnapshot(), before);

    assert.throws(
      () => lab.importJson(snapshot),
      error => error?.code === 'invalid_snapshot',
      `${malformed.label} should be rejected by importJson.`,
    );
    assert.deepEqual(lab.getSnapshot(), before);

    const runtime = createGeometryLabRuntime();
    const runtimeBefore = runtime.getSnapshot();
    assert.throws(
      () => runtime.loadSnapshot(snapshot),
      error => error?.code === 'invalid_snapshot',
      `${malformed.label} should be rejected by runtime.loadSnapshot.`,
    );
    assert.deepEqual(runtime.getSnapshot(), runtimeBefore);
  }
});

test('snapshot JSON parsing reports syntax errors with a stable code', () => {
  assert.throws(
    () => parseGeometryLabSnapshotJson('{not valid json'),
    error => error?.code === 'invalid_json',
  );
});

test('delta validation rejects unknown operations and malformed nested payloads', () => {
  const malformedDeltas = [
    { label: 'unknown operation', delta: { op: 'definitelyUnknown' } },
    {
      label: 'malformed point coordinate',
      delta: { op: 'addPoint3D', point: { id: 'bad-point', kind: 'point3d', x: 0, y: 'nope', z: 0 } },
    },
    {
      label: 'malformed delete id list',
      delta: { op: 'delete', ids: ['valid-id', 42] },
    },
    {
      label: 'malformed nested batch operation',
      delta: {
        op: 'batch',
        deltas: [
          { op: 'addPoint3D', point: point3d('valid-first') },
          { op: 'unknownNestedOperation' },
        ],
      },
    },
    {
      label: 'malformed camera state',
      delta: {
        op: 'setView3D',
        view: {
          position: [0, 0],
          target: [0, 0, 0],
          up: [0, 0, 1],
          fov: 45,
          zoom: 1,
          projection: 'perspective',
        },
      },
    },
  ];

  for (const malformed of malformedDeltas) {
    assertRejectedValidation(validateGeometryLabDelta(malformed.delta), malformed.label);

    const lab = createGeometryLab();
    const before = lab.getSnapshot();
    assert.throws(() => lab.applyDelta(malformed.delta), undefined, `${malformed.label} should throw from applyDelta.`);
    assert.deepEqual(lab.getSnapshot(), before);

    const runtime = createGeometryLabRuntime();
    const applied = runtime.applyDelta(malformed.delta, {
      id: `invalid-${malformed.label}`,
      actorId: 'untrusted-peer',
      createdAt: 1,
      source: 'remote',
    });
    assert.equal(applied.ok, false, `${malformed.label} should fail through the shared runtime.`);
  }
});

test('delta validation accepts legitimate ambiguous partial entity updates and empty no-ops', () => {
  const validDeltas = [
    {
      op: 'updateEntity',
      id: 'solid',
      changes: {
        faces: [{ id: 'face', pointIds: ['a', 'b', 'c'] }],
        parameters: { height: 2, baseArea: 3 },
      },
    },
    {
      op: 'updateEntity',
      id: 'curve',
      changes: {
        points: [{ x: 0, y: 1, z: 2 }],
        parameter: { tMin: 0, tMax: 1, samples: 2 },
      },
    },
    {
      op: 'updateEntity',
      id: 'conic',
      changes: { equation: { a: 1, b: 0, c: 1, d: 0, e: 0, f: -1 } },
    },
    { op: 'updateEntity', id: 'surface', changes: { faces: [[0, 1, 2]] } },
    { op: 'delete', ids: [] },
    { op: 'historyPatch', patches: [] },
  ];

  for (const delta of validDeltas) {
    const validation = validateGeometryLabDelta(delta);
    assert.equal(validation.ok, true, JSON.stringify(validation));
  }
});

test('command execution rejects unknown commands, invalid enums, and malformed nested payloads', () => {
  const runtime = createGeometryLabRuntime();
  const before = runtime.getSnapshot();
  const malformedCommands = [
    { label: 'unknown command', command: { type: 'definitelyUnknown' } },
    {
      label: 'invalid point payload',
      command: { type: 'addPoint3D', payload: { x: 0, y: { value: 1 }, z: 0 } },
    },
    { label: 'invalid tool enum', command: { type: 'setTool', payload: 'not-a-geometry-tool' } },
    {
      label: 'invalid camera preset enum',
      command: { type: 'setCameraPreset', payload: { preset: 'diagonal', distance: 4 } },
    },
    {
      label: 'malformed equation range',
      command: {
        type: 'addEquationSurface3D',
        payload: { input: 'z = x + y', xRange: [0, 'far'], samples: 8 },
      },
    },
    {
      label: 'malformed nested delete ids',
      command: { type: 'delete', payload: { ids: ['missing', 42] } },
    },
  ];

  for (const malformed of malformedCommands) {
    assertRejectedValidation(validateGeometryLabCommand(malformed.command), malformed.label);
    assertRejectedCommand(runtime.execute(malformed.command), malformed.label);
  }
  assert.deepEqual(runtime.getSnapshot(), before);
});

test('constructor, loadSnapshot, and applyDelta clone caller-owned inputs deeply', () => {
  const initialSnapshot = createEmptyGeometryLabSnapshot();
  initialSnapshot.scene.scene3d.points.initial = point3d('initial', 1, 2, 3);
  const lab = createGeometryLab({ initialSnapshot });

  initialSnapshot.scene.scene3d.points.initial.x = 999;
  delete initialSnapshot.scene.scene3d.workPlanes.xy;
  assert.equal(lab.getSnapshot().scene.scene3d.points.initial.x, 1);
  assert.ok(lab.getSnapshot().scene.scene3d.workPlanes.xy);

  const loadedSnapshot = createEmptyGeometryLabSnapshot();
  loadedSnapshot.scene.scene3d.points.loaded = point3d('loaded', 4, 5, 6);
  lab.loadSnapshot(loadedSnapshot);
  loadedSnapshot.scene.scene3d.points.loaded.y = 999;
  assert.equal(lab.getSnapshot().scene.scene3d.points.loaded.y, 5);

  const surface = {
    id: 'caller-owned-surface',
    kind: 'surface3d',
    surfaceKind: 'parametric',
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ],
    faces: [[0, 1, 2]],
  };
  const delta = { op: 'addEntity3D', entity: surface };
  lab.applyDelta(delta, { emit: false, meta: { actorId: 'peer', source: 'remote' } });
  surface.vertices[0].x = 777;
  surface.faces[0][0] = 2;

  const storedSurface = lab.getSnapshot().scene.scene3d.entities[surface.id];
  assert.equal(storedSurface.vertices[0].x, 0);
  assert.deepEqual(storedSurface.faces[0], [0, 1, 2]);
});

test('the reducer returns changed explicitly and accepts frozen caller-owned inputs', () => {
  const snapshot = deepFreeze(createEmptyGeometryLabSnapshot());
  const noOpDelta = deepFreeze({ op: 'updatePoint', id: 'missing', changes: { x: 1 } });
  const noOp = reduceGeometryLabDelta(snapshot, noOpDelta);

  assert.equal(noOp.changed, false);
  assert.deepEqual(noOp.snapshot, snapshot);

  const point = point3d('frozen-point', 1, 2, 3);
  const addDelta = deepFreeze({ op: 'addPoint3D', point });
  const changed = reduceGeometryLabDelta(snapshot, addDelta);

  assert.equal(changed.changed, true);
  assert.deepEqual(changed.snapshot.scene.scene3d.points[point.id], point);
  assert.deepEqual(snapshot.scene.scene3d.points, {});
});

test('post-reduction validation rejects state-corrupting deltas atomically', () => {
  const lab = createGeometryLab();
  lab.applyDelta({
    op: 'addPoint2D',
    point: { id: 'two-dimensional', kind: 'point2d', x: 1, y: 2 },
  });
  const before = lab.getSnapshot();

  assert.throws(
    () => lab.applyDelta({ op: 'updatePoint', id: 'two-dimensional', changes: { z: 3 } }),
    error => error?.code === 'invalid_delta_result',
  );
  assert.throws(
    () => lab.applyDelta({
      op: 'historyPatch',
      patches: [{
        ref: { collection: 'appState', key: 'activeView' },
        expected: { present: true, value: '2d' },
        next: { present: false },
      }],
    }),
    error => error?.code === 'invalid_delta_result',
  );
  assert.deepEqual(lab.getSnapshot(), before);

  lab.undo();
  assert.equal(lab.getSnapshot().scene.scene2d.points['two-dimensional'], undefined);
});

test('snapshots and JSON exports are immutable copies and content-only JSON round-trips', async () => {
  const lab = createGeometryLab();
  const pointId = lab.addPoint3D({ x: 1, y: 2, z: 3 });

  const snapshot = lab.getSnapshot();
  snapshot.scene.scene3d.points[pointId].x = 100;
  delete snapshot.scene.scene3d.workPlanes.xy;
  assert.equal(lab.getSnapshot().scene.scene3d.points[pointId].x, 1);
  assert.ok(lab.getSnapshot().scene.scene3d.workPlanes.xy);

  const fullExport = await lab.export({ format: 'json' });
  assert.equal(fullExport.format, 'json');
  fullExport.data.scene.scene3d.points[pointId].x = 200;
  delete fullExport.data.scene.scene3d.workPlanes.xy;
  assert.equal(lab.getSnapshot().scene.scene3d.points[pointId].x, 1);
  assert.ok(lab.getSnapshot().scene.scene3d.workPlanes.xy);

  const contentExport = await lab.export({ format: 'json', includeAppState: false });
  assert.equal(contentExport.format, 'json');
  assert.equal(Object.hasOwn(contentExport.data, 'appState'), false);
  const parsed = parseGeometryLabSnapshotJson(contentExport.data);
  assert.equal(parsed.instrument, 'geometry-lab');
  assert.ok(parsed.appState);
  assert.equal(parsed.scene.scene3d.points[pointId].x, 1);

  contentExport.data.scene.scene3d.points[pointId].x = 300;
  assert.equal(parsed.scene.scene3d.points[pointId].x, 1);
  assert.equal(lab.getSnapshot().scene.scene3d.points[pointId].x, 1);
});

test('failed batches are atomic and do not add partial state, history, or emissions', () => {
  const emitted = [];
  const lab = createGeometryLab({
    onDelta(delta, meta) {
      emitted.push({ delta: clone(delta), meta: clone(meta) });
    },
  });
  const existingId = lab.addPoint3D({ x: 1, y: 2, z: 3 });
  emitted.length = 0;
  const before = lab.getSnapshot();

  const failingBatches = [
    {
      op: 'batch',
      deltas: [
        { op: 'addPoint3D', point: point3d('partial-from-malformed') },
        { op: 'unknownNestedOperation' },
      ],
    },
    {
      op: 'batch',
      deltas: [
        { op: 'addPoint3D', point: point3d('partial-from-conflict') },
        { op: 'addPoint3D', point: point3d(existingId, 99, 99, 99) },
      ],
    },
  ];

  for (const batch of failingBatches) {
    assert.throws(() => lab.applyDelta(batch));
    assert.deepEqual(lab.getSnapshot(), before);
    assert.equal(emitted.length, 0);
  }

  lab.undo();
  assert.equal(lab.getSnapshot().scene.scene3d.points[existingId], undefined);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].meta.source, 'history');
});

test('no-op deltas create neither history entries nor outbound emissions', () => {
  const emitted = [];
  const lab = createGeometryLab({
    onDelta(delta, meta) {
      emitted.push({ delta: clone(delta), meta: clone(meta) });
    },
  });
  const pointId = lab.addPoint3D({ x: 1, y: 2, z: 3 });
  assert.equal(emitted.length, 1);

  lab.applyDelta({ op: 'updatePoint', id: 'missing-point', changes: { x: 4 } });
  lab.remove('missing-object');
  lab.applyDelta({ op: 'delete', ids: [] });
  lab.applyDelta({ op: 'historyPatch', patches: [] });
  lab.applyDelta({ op: 'setAppState', changes: { activeTool: 'select' } });
  assert.equal(emitted.length, 1);

  lab.undo();
  assert.equal(lab.getSnapshot().scene.scene3d.points[pointId], undefined);
  assert.equal(emitted.length, 2);
  assert.equal(emitted[1].meta.source, 'history');
});

test('observer exceptions are isolated and reported through onError after commit', () => {
  const observerErrors = [];
  const lab = createGeometryLab({
    onDelta() {
      throw new Error('observer boundary failure');
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
  assert.match(observerErrors[0].message, /observer boundary failure/);
});

test('shared runtime reports no-ops, honors source semantics, and isolates subscriber copies', () => {
  const runtime = createGeometryLabRuntime();
  const observed = [];
  runtime.subscribe(event => {
    if (event.type === 'delta-applied' && event.delta.op === 'addPoint3D') {
      event.delta.point.x = 999;
      throw new Error('subscriber failure');
    }
  });
  runtime.subscribe(event => observed.push(event));

  const added = runtime.applyDelta(
    { op: 'addPoint3D', point: point3d('runtime-point', 1, 2, 3) },
    { id: 'local-runtime-delta', actorId: 'local', createdAt: 1, source: 'local' },
  );
  assert.deepEqual(added, { ok: true, changed: true });
  assert.equal(observed.at(-1).delta.point.x, 1);
  assert.equal(runtime.getSnapshot().scene.scene3d.points['runtime-point'].x, 1);

  const noOp = runtime.applyDelta(
    { op: 'updatePoint', id: 'missing-runtime-point', changes: { x: 4 } },
    { id: 'noop-runtime-delta', actorId: 'local', createdAt: 2, source: 'local' },
  );
  assert.deepEqual(noOp, { ok: true, changed: false });

  const readOnlyRuntime = createGeometryLabRuntime({ readOnly: true });
  const synchronized = readOnlyRuntime.applyDelta(
    { op: 'addPoint3D', point: point3d('runtime-remote', 4, 5, 6) },
    { id: 'remote-runtime-delta', actorId: 'peer', createdAt: 3, source: 'remote' },
  );
  assert.deepEqual(synchronized, { ok: true, changed: true });
  assert.equal(readOnlyRuntime.getSnapshot().scene.scene3d.points['runtime-remote'].x, 4);
});

test('read-only instruments reject local deltas but accept explicit remote synchronization', () => {
  const emitted = [];
  const lab = createGeometryLab({
    readOnly: true,
    onDelta(delta, meta) {
      emitted.push({ delta: clone(delta), meta: clone(meta) });
    },
  });

  assert.throws(
    () => lab.addPoint3D({ x: 1, y: 2, z: 3 }),
    error => error?.code === 'read_only',
  );
  assert.throws(
    () => lab.applyDelta({ op: 'addPoint3D', point: point3d('implicit-local') }),
    error => error?.code === 'read_only',
  );
  assert.throws(
    () => lab.applyDelta(
      { op: 'addPoint3D', point: point3d('explicit-local') },
      { emit: false, meta: { actorId: 'local', source: 'local' } },
    ),
    error => error?.code === 'read_only',
  );
  assert.throws(
    () => lab.applyDelta(
      { op: 'addPoint3D', point: point3d('invalid-source') },
      { emit: false, meta: { actorId: 'attacker', source: 'bogus' } },
    ),
    error => error?.code === 'invalid_delta_meta',
  );
  assert.deepEqual(lab.getSnapshot().scene.scene3d.points, {});
  assert.equal(emitted.length, 0);

  lab.setTool('pan');
  lab.setCameraPreset('front', 10);
  assert.equal(lab.getSnapshot().appState.activeTool, 'pan');
  assert.deepEqual(lab.getSnapshot().appState.view3d.position, [0, -10, 0]);
  assert.equal(emitted.length, 0, 'Read-only navigation should remain local UI state.');

  const remotePoint = point3d('remote-point', 4, 5, 6);
  lab.applyDelta(
    { op: 'addPoint3D', point: remotePoint },
    { meta: { actorId: 'peer', source: 'remote' } },
  );
  assert.deepEqual(lab.getSnapshot().scene.scene3d.points[remotePoint.id], remotePoint);
  assert.equal(emitted.length, 0, 'Remote synchronization should not echo by default.');

  lab.undo();
  assert.deepEqual(lab.getSnapshot().scene.scene3d.points[remotePoint.id], remotePoint);
  assert.equal(emitted.length, 0);
});
