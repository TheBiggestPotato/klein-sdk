import assert from 'node:assert/strict';
import test from 'node:test';

import {
  executeGeometryLabCommand,
  validateGeometryLabCommandInput,
} from '../../dist/geometry-lab/commands.js';
import {
  createGeometryLab,
  validateGeometryLabCommand,
} from '../../dist/geometry-lab/index.js';

test('public command validation delegates to the extracted command boundary', () => {
  const commands = [
    { type: 'addPoint3D', payload: { x: 1, y: 2, z: 3 } },
    { type: 'addPoint3D', payload: { x: 'not-a-number', y: 2, z: 3 } },
    { type: 'unknown-command' },
  ];
  for (const command of commands) {
    assert.deepEqual(
      validateGeometryLabCommand(command),
      validateGeometryLabCommandInput(command),
    );
  }
});

test('extracted executor owns construction and default command dispatch', () => {
  const lab = createGeometryLab({ actorId: 'commands-module' });
  const first = executeGeometryLabCommand(lab, {
    type: 'addPoint3D',
    payload: { x: 0, y: 0, z: 0, label: 'A' },
  });
  const second = executeGeometryLabCommand(lab, {
    type: 'addPoint3D',
    payload: { x: 2, y: 0, z: 0, label: 'B' },
  });
  assert.equal(first.ok, true, first.ok ? undefined : first.error.message);
  assert.equal(second.ok, true, second.ok ? undefined : second.error.message);

  const segment = executeGeometryLabCommand(lab, {
    type: 'addSegment3D',
    payload: { firstPointId: first.payload, secondPointId: second.payload, color: '#123456' },
  });
  assert.equal(segment.ok, true, segment.ok ? undefined : segment.error.message);

  assert.deepEqual(executeGeometryLabCommand(lab, { type: 'setTool', payload: 'orbit' }), { ok: true });
  const snapshotResult = executeGeometryLabCommand(lab, { type: 'getSnapshot' });
  assert.equal(snapshotResult.ok, true, snapshotResult.ok ? undefined : snapshotResult.error.message);
  assert.equal(snapshotResult.payload.appState.activeTool, 'orbit');
  assert.equal(snapshotResult.payload.scene.scene3d.entities[segment.payload].color, '#123456');

  assert.deepEqual(executeGeometryLabCommand(lab, { type: 'undo' }), { ok: true });
  assert.equal(lab.getSnapshot().scene.scene3d.entities[segment.payload], undefined);
  assert.deepEqual(executeGeometryLabCommand(lab, { type: 'redo' }), { ok: true });
  assert.ok(lab.getSnapshot().scene.scene3d.entities[segment.payload]);
});

test('extracted executor handles equation edits, deletes, and invalid input atomically', () => {
  const lab = createGeometryLab();
  const added = executeGeometryLabCommand(lab, {
    type: 'addEquationSurface3D',
    payload: { input: 'z = x + y', samples: 4 },
  });
  assert.equal(added.ok, true, added.ok ? undefined : added.error.message);

  const updated = executeGeometryLabCommand(lab, {
    type: 'updateEquationSurface3D',
    payload: { id: added.payload, input: 'z = x - y', samples: 5 },
  });
  assert.deepEqual(updated, { ok: true, payload: added.payload });
  assert.equal(lab.getSnapshot().scene.scene3d.entities[added.payload].vertices.length, 25);

  const beforeInvalid = lab.getSnapshot();
  const invalid = executeGeometryLabCommand(lab, {
    type: 'addPoint3D',
    payload: { x: Number.POSITIVE_INFINITY, y: 0, z: 0 },
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'invalid_command');
  assert.deepEqual(lab.getSnapshot(), beforeInvalid);

  const deleted = executeGeometryLabCommand(lab, { type: 'delete', payload: added.payload });
  assert.deepEqual(deleted, { ok: true, payload: [added.payload] });
  assert.equal(lab.getSnapshot().scene.scene3d.entities[added.payload], undefined);
});
