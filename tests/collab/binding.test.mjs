import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bindCollaboration,
  bindRuntimeCollaboration,
  createGeometryCalculator,
  createGeometryLab,
  createGeometryLabRuntime,
  createGraphingCalculator,
  createGraphingRuntime,
  createInMemoryCollaborationHub,
  createInMemoryCollaborationTransport,
  createProbabilityExplorer,
  createProbabilityRuntime,
  createScientificCalculator,
  createScientificCalculatorRuntime,
  createWhiteboardRuntime,
} from '../../dist/index.js';

function roomPeer(hub, roomId, actorId) {
  return createInMemoryCollaborationTransport({ roomId, actorId, hub });
}

function assertToolStateEqual(left, right, message) {
  assert.deepEqual(right.getSnapshot().scene, left.getSnapshot().scene, `${message} scene`);
  assert.deepEqual(right.getSnapshot().appState, left.getSnapshot().appState, `${message} app state`);
}

test('instrument binding sends local deltas and applies them to read-only peers as remote', async () => {
  const hub = createInMemoryCollaborationHub();
  const leftTransport = roomPeer(hub, 'two-way', 'left');
  const rightTransport = roomPeer(hub, 'two-way', 'right');
  const left = createGeometryLab({ actorId: 'left' });
  const right = createGeometryLab({ actorId: 'right', readOnly: true });
  const leftBinding = bindCollaboration({ instrument: left, transport: leftTransport });
  const rightBinding = bindCollaboration({ instrument: right, transport: rightTransport });
  await Promise.all([leftBinding.ready, rightBinding.ready]);

  const pointId = left.addPoint3D({ x: 1, y: 2, z: 3 });
  assert.deepEqual(right.getSnapshot().scene.scene3d.points[pointId], {
    id: pointId,
    kind: 'point3d',
    x: 1,
    y: 2,
    z: 3,
  });

  right.undo();
  assert.ok(right.getSnapshot().scene.scene3d.points[pointId], 'Remote work entered local undo history.');
  leftBinding.disconnect();
  rightBinding.disconnect();
});

test('runtime binding includes command-driven instrument edits', async () => {
  const hub = createInMemoryCollaborationHub();
  const leftTransport = roomPeer(hub, 'runtime', 'left');
  const rightTransport = roomPeer(hub, 'runtime', 'right');
  const left = createGeometryLabRuntime({ actorId: 'left' });
  const right = createGeometryLabRuntime({ actorId: 'right' });
  const leftBinding = bindRuntimeCollaboration({ runtime: left, transport: leftTransport });
  const rightBinding = bindRuntimeCollaboration({ runtime: right, transport: rightTransport });
  await Promise.all([leftBinding.ready, rightBinding.ready]);

  const result = left.execute({ type: 'addPoint3D', payload: { x: 4, y: 5, z: 6 } });
  assert.equal(result.ok, true);
  assert.equal(Object.keys(right.getSnapshot().scene.scene3d.points).length, 1);
  assert.deepEqual(right.getSnapshot().scene, left.getSnapshot().scene);
  leftBinding.disconnect();
  rightBinding.disconnect();
});

test('runtime binding treats applyDelta without metadata as a local collaborative edit', async () => {
  const cases = [
    {
      name: 'graphing',
      create: createGraphingRuntime,
      delta: {
        op: 'setViewport',
        viewport: { x: 2, y: -1, zoom: 1.5, xMin: -4, xMax: 8, yMin: -3, yMax: 9 },
      },
    },
    {
      name: 'calculator',
      create: createScientificCalculatorRuntime,
      delta: { op: 'setAngleMode', angleMode: 'radians' },
    },
    {
      name: 'probability',
      create: createProbabilityRuntime,
      delta: {
        op: 'addDistribution',
        distribution: { id: 'normal-runtime', kind: 'normal', parameters: { mean: 1, sd: 2 } },
      },
    },
    {
      name: 'whiteboard',
      create: createWhiteboardRuntime,
      delta: { op: 'setView', view: { x: 12, y: -8, zoom: 2 } },
    },
  ];

  for (const spec of cases) {
    const hub = createInMemoryCollaborationHub();
    const left = spec.create();
    const right = spec.create();
    const leftBinding = bindRuntimeCollaboration({
      runtime: left,
      transport: roomPeer(hub, `runtime-direct-${spec.name}`, 'left'),
    });
    const rightBinding = bindRuntimeCollaboration({
      runtime: right,
      transport: roomPeer(hub, `runtime-direct-${spec.name}`, 'right'),
    });
    await Promise.all([leftBinding.ready, rightBinding.ready]);

    const result = left.applyDelta(spec.delta);
    assert.equal(result.ok, true, `${spec.name} local apply failed`);
    assertToolStateEqual(left, right, `${spec.name} direct runtime delta`);
    leftBinding.disconnect();
    rightBinding.disconnect();
  }
});

test('undo and redo emit convergent history deltas for built-in instruments', async () => {
  const cases = [
    {
      name: 'graphing',
      create: () => createGraphingCalculator(),
      mutate: instrument => {
        instrument.addExpression('y = x');
        instrument.addExpression('y = 2 * x');
      },
    },
    {
      name: 'calculator',
      create: () => createScientificCalculator(),
      mutate: instrument => {
        instrument.calculate('1 + 1');
        instrument.calculate('2 + 2');
      },
    },
    {
      name: 'probability',
      create: () => createProbabilityExplorer(),
      mutate: instrument => {
        instrument.addDistribution({ id: 'normal-one', kind: 'normal', parameters: { mean: 0, sd: 1 } });
        instrument.addDistribution({ id: 'normal-two', kind: 'normal', parameters: { mean: 2, sd: 3 } });
      },
    },
    {
      name: 'geometry',
      create: () => createGeometryCalculator({ showControls: false }),
      mutate: instrument => {
        instrument.addPoint({ x: 0, y: 0 });
        instrument.addPoint({ x: 3, y: 4 });
      },
    },
  ];

  for (const spec of cases) {
    const hub = createInMemoryCollaborationHub();
    const left = spec.create();
    const right = spec.create();
    const leftBinding = bindCollaboration({
      instrument: left,
      transport: roomPeer(hub, `history-${spec.name}`, 'left'),
    });
    const rightBinding = bindCollaboration({
      instrument: right,
      transport: roomPeer(hub, `history-${spec.name}`, 'right'),
    });
    await Promise.all([leftBinding.ready, rightBinding.ready]);

    spec.mutate(left);
    assertToolStateEqual(left, right, `${spec.name} before undo`);
    left.undo();
    assertToolStateEqual(left, right, `${spec.name} after undo`);
    left.redo();
    assertToolStateEqual(left, right, `${spec.name} after redo`);
    leftBinding.disconnect();
    rightBinding.disconnect();
  }
});

test('late join and requestSync pull established room state without publishing joiner state', async () => {
  const hub = createInMemoryCollaborationHub();
  const authorityTransport = roomPeer(hub, 'late-join', 'authority');
  const authority = createGeometryLab({ actorId: 'authority' });
  const authorityBinding = bindCollaboration({ instrument: authority, transport: authorityTransport });
  await authorityBinding.ready;
  const sharedPointId = authority.addPoint3D({ x: 7, y: 8, z: 9 });

  const joinerTransport = roomPeer(hub, 'late-join', 'joiner');
  const joiner = createGeometryLab({ actorId: 'joiner' });
  const joinerOnlyPointId = joiner.addPoint3D({ x: -1, y: -2, z: -3 });
  const joinerInitialSnapshot = joiner.getSnapshot();
  const joinerBinding = bindCollaboration({ instrument: joiner, transport: joinerTransport });
  await joinerBinding.ready;

  assert.ok(joiner.getSnapshot().scene.scene3d.points[sharedPointId]);
  assert.equal(joiner.getSnapshot().scene.scene3d.points[joinerOnlyPointId], undefined);
  assert.equal(authority.getSnapshot().scene.scene3d.points[joinerOnlyPointId], undefined);

  joiner.loadSnapshot(joinerInitialSnapshot, { source: 'import' });
  assert.ok(joiner.getSnapshot().scene.scene3d.points[joinerOnlyPointId]);
  assert.equal(joinerBinding.requestSync(), true);
  assert.deepEqual(joiner.getSnapshot().scene, authority.getSnapshot().scene);
  assert.equal(authority.getSnapshot().scene.scene3d.points[joinerOnlyPointId], undefined);
  authorityBinding.disconnect();
  joinerBinding.disconnect();
});

test('a rejected inbound delta is reported and does not interrupt room fan-out', async () => {
  const hub = createInMemoryCollaborationHub();
  const source = createGeometryLab({ actorId: 'source' });
  const conflicted = createGeometryLab({ actorId: 'conflicted' });
  const healthy = createGeometryLab({ actorId: 'healthy' });
  const errors = [];
  const sourceBinding = bindCollaboration({
    instrument: source,
    transport: roomPeer(hub, 'errors', 'source'),
  });
  const conflictedBinding = bindCollaboration({
    instrument: conflicted,
    transport: roomPeer(hub, 'errors', 'conflicted'),
    onError: error => errors.push(error),
  });
  const healthyBinding = bindCollaboration({
    instrument: healthy,
    transport: roomPeer(hub, 'errors', 'healthy'),
  });
  await Promise.all([sourceBinding.ready, conflictedBinding.ready, healthyBinding.ready]);

  const conflictSnapshot = conflicted.getSnapshot();
  conflictSnapshot.scene.scene3d.points.shared = {
    id: 'shared',
    kind: 'point3d',
    x: 99,
    y: 0,
    z: 0,
  };
  conflicted.loadSnapshot(conflictSnapshot, { source: 'import' });
  source.applyDelta({
    op: 'addPoint3D',
    point: { id: 'shared', kind: 'point3d', x: 1, y: 2, z: 3 },
  });

  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'duplicate_id');
  assert.equal(conflicted.getSnapshot().scene.scene3d.points.shared.x, 99);
  assert.equal(healthy.getSnapshot().scene.scene3d.points.shared.x, 1);
  sourceBinding.disconnect();
  conflictedBinding.disconnect();
  healthyBinding.disconnect();
});
