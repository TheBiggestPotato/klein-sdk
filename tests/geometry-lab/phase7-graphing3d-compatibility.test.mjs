import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyGraphing3DDelta,
  createEmptyGraphing3DSnapshot,
  createGraphing3DCalculator,
  createGraphing3DRuntime,
  parseGraphing3DSnapshotJson,
  validateGraphing3DDelta,
  validateGraphing3DSnapshot,
} from '../../dist/graphing-3d/index.js';
import {
  applyGeometryLabDelta,
  createEmptyGeometryLabSnapshot,
  createGeometryLabRuntime,
  parseGeometryLabSnapshotJson,
  validateGeometryLabDelta,
  validateGeometryLabSnapshot,
} from '../../dist/geometry-lab/index.js';
import {
  createKleinToolRuntime,
  normalizeKleinToolKey,
} from '../../dist/tools/index.js';

test('legacy exports delegate to the Geometry Lab persistence and validation boundaries', () => {
  assert.equal(applyGraphing3DDelta, applyGeometryLabDelta);
  assert.equal(parseGraphing3DSnapshotJson, parseGeometryLabSnapshotJson);
  assert.equal(validateGraphing3DSnapshot, validateGeometryLabSnapshot);

  const validDelta = { op: 'clear3D' };
  const invalidDelta = { op: 'not-a-real-operation' };
  assert.deepEqual(validateGraphing3DDelta(validDelta), validateGeometryLabDelta(validDelta));
  assert.deepEqual(validateGraphing3DDelta(invalidDelta), validateGeometryLabDelta(invalidDelta));
  assert.equal(validateGraphing3DDelta(invalidDelta).ok, false);
});

test('legacy empty state and calculator retain their 3D-first compatibility defaults', () => {
  const snapshot = createEmptyGraphing3DSnapshot();
  assert.equal(snapshot.appState.activeView, '3d');
  assert.equal(snapshot.appState.activeTool, 'orbit');

  const defaultCalculator = createGraphing3DCalculator();
  assert.equal(defaultCalculator.getSnapshot().appState.activeView, '3d');

  // Explicit callers could always override the facade default; keep that behavior intact.
  const explicit2D = createGraphing3DCalculator({ initialView: '2d' });
  assert.equal(explicit2D.getSnapshot().appState.activeView, '2d');
});

test('legacy runtime is a command-compatible Geometry Lab adapter with its historical key', () => {
  const graphing = createGraphing3DRuntime({ actorId: 'compatibility-test' });
  const geometry = createGeometryLabRuntime({ actorId: 'compatibility-test', initialView: '3d' });
  assert.equal(graphing.toolKey, 'graphing-3d');
  assert.equal(geometry.toolKey, 'geometry-lab');

  const remainingCommands = [
    { type: 'addCube', payload: { center: { x: 1, y: 2, z: 3 }, size: 4, color: '#123456' } },
    { type: 'addSphere', payload: { center: { x: -1, y: 0, z: 1 }, radius: 2 } },
    { type: 'addSurfaceZ', payload: { preset: 'wave', samples: 4 } },
    { type: 'addEquationSurface3D', payload: { input: 'z = x + y', samples: 4 } },
    { type: 'setCameraPreset', payload: { preset: 'top', distance: 12 } },
    { type: 'getSnapshot' },
  ];

  const graphingEvents = [];
  graphing.subscribe(event => graphingEvents.push(event));
  const graphingPointIds = [];
  const geometryPointIds = [];
  for (const payload of [
    { x: 0, y: 1, z: 2, label: 'A' },
    { x: 3, y: 4, z: 5, label: 'B' },
  ]) {
    const graphingResult = graphing.execute({ type: 'addPoint3D', payload });
    const geometryResult = geometry.execute({ type: 'addPoint3D', payload });
    assert.equal(graphingResult.ok, true, graphingResult.ok ? undefined : graphingResult.error.message);
    assert.equal(geometryResult.ok, true, geometryResult.ok ? undefined : geometryResult.error.message);
    graphingPointIds.push(graphingResult.payload);
    geometryPointIds.push(geometryResult.payload);
  }
  const graphingSegment = graphing.execute({
    type: 'addSegment3D',
    payload: { firstPointId: graphingPointIds[0], secondPointId: graphingPointIds[1] },
  });
  const geometrySegment = geometry.execute({
    type: 'addSegment3D',
    payload: { firstPointId: geometryPointIds[0], secondPointId: geometryPointIds[1] },
  });
  assert.equal(graphingSegment.ok, true, graphingSegment.ok ? undefined : graphingSegment.error.message);
  assert.equal(geometrySegment.ok, true, geometrySegment.ok ? undefined : geometrySegment.error.message);

  for (const command of remainingCommands) {
    const graphingResult = graphing.execute(command);
    const geometryResult = geometry.execute(command);
    assert.equal(graphingResult.ok, true, graphingResult.ok ? undefined : graphingResult.error.message);
    assert.equal(geometryResult.ok, true, geometryResult.ok ? undefined : geometryResult.error.message);
    assert.equal(typeof graphingResult.payload, typeof geometryResult.payload);
  }

  const graphingSnapshot = graphing.getSnapshot();
  const geometrySnapshot = geometry.getSnapshot();
  assert.deepEqual(graphingSnapshot.appState.view3d, geometrySnapshot.appState.view3d);
  assert.deepEqual(
    Object.values(graphingSnapshot.scene.scene3d.points).map(({ id: _id, ...point }) => point),
    Object.values(geometrySnapshot.scene.scene3d.points).map(({ id: _id, ...point }) => point),
  );
  assert.deepEqual(
    Object.values(graphingSnapshot.scene.scene3d.entities).map(entity => entity.kind).sort(),
    Object.values(geometrySnapshot.scene.scene3d.entities).map(entity => entity.kind).sort(),
  );
  assert.equal(graphingEvents.length, 3 + remainingCommands.length);
  assert.ok(graphingEvents.every(event => event.type === 'command-executed'));
});

test('legacy runtime inherits Geometry Lab complexity enforcement', () => {
  const runtime = createGraphing3DRuntime({
    complexityLimits: { maxPointRecords: 1 },
  });
  assert.equal(runtime.execute({ type: 'addPoint3D', payload: { x: 0, y: 0, z: 0 } }).ok, true);
  const rejected = runtime.execute({ type: 'addPoint3D', payload: { x: 1, y: 0, z: 0 } });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, 'geometry_lab_snapshot_too_complex');

  const empty = createEmptyGeometryLabSnapshot();
  empty.scene.scene3d.points.a = { id: 'a', kind: 'point3d', x: 0, y: 0, z: 0 };
  empty.scene.scene3d.points.b = { id: 'b', kind: 'point3d', x: 1, y: 0, z: 0 };
  assert.equal(runtime.validateSnapshot(empty).ok, false);
});

test('every legacy 3D registry alias normalizes through the Geometry Lab branch', () => {
  for (const alias of ['graphing-3d', 'geogebra-3d', 'geometrie-3d']) {
    assert.equal(normalizeKleinToolKey(alias), 'geometry-lab');
    const runtime = createKleinToolRuntime({ toolKey: alias });
    assert.equal(runtime.toolKey, 'geometry-lab');
    assert.equal(runtime.getSnapshot().appState.activeView, '3d');
  }
});
