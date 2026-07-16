import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertGeometryLabInvariants,
  createGeometryLab,
} from '../../dist/geometry-lab/index.js';

function clone(value) {
  return structuredClone(value);
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

function deliverNext(source, target) {
  const message = source.outbound.shift();
  assert.ok(message, `Expected an outbound delta from ${source.actorId}.`);
  target.lab.applyDelta(clone(message.delta), {
    emit: false,
    meta: {
      ...message.meta,
      source: 'remote',
    },
  });
  return message;
}

function assertPeersConverged(first, second) {
  const firstSnapshot = first.lab.getSnapshot();
  const secondSnapshot = second.lab.getSnapshot();
  assert.deepEqual(firstSnapshot.scene, secondSnapshot.scene);
  assertGeometryLabInvariants(firstSnapshot);
  assertGeometryLabInvariants(secondSnapshot);
}

test('generated identities are collision-resistant and actor-scoped across peers and instances', () => {
  const aliceFirst = createPeer('alice');
  const aliceSecond = createPeer('alice');
  const bob = createPeer('bob');

  const aliceFirstPoint = aliceFirst.lab.addPoint3D({ x: 1, y: 0, z: 0 });
  const aliceSecondPoint = aliceSecond.lab.addPoint3D({ x: 2, y: 0, z: 0 });
  const bobPoint = bob.lab.addPoint3D({ x: 3, y: 0, z: 0 });

  assert.equal(new Set([
    aliceFirst.lab.id,
    aliceSecond.lab.id,
    bob.lab.id,
  ]).size, 3);
  assert.equal(new Set([
    aliceFirstPoint,
    aliceSecondPoint,
    bobPoint,
  ]).size, 3);
  assert.equal(new Set([
    aliceFirst.outbound[0].meta.id,
    aliceSecond.outbound[0].meta.id,
    bob.outbound[0].meta.id,
  ]).size, 3);
  assert.equal(aliceFirst.outbound[0].meta.actorId, 'alice');
  assert.equal(aliceSecond.outbound[0].meta.actorId, 'alice');
  assert.equal(bob.outbound[0].meta.actorId, 'bob');
});

test('a conflicting duplicate add is rejected atomically instead of overwriting state', () => {
  const lab = createGeometryLab({ actorId: 'receiver' });
  const originalPoint = {
    id: 'shared-point',
    kind: 'point3d',
    x: 1,
    y: 2,
    z: 3,
  };

  lab.applyDelta(
    { op: 'addPoint3D', point: originalPoint },
    { emit: false, meta: { actorId: 'alice', source: 'remote' } },
  );

  assert.throws(
    () => lab.applyDelta(
      {
        op: 'addPoint3D',
        point: { ...originalPoint, x: 999 },
      },
      { emit: false, meta: { actorId: 'bob', source: 'remote' } },
    ),
    error => error?.code === 'duplicate_id',
  );
  assert.throws(
    () => lab.applyDelta(
      {
        op: 'addEntity3D',
        entity: {
          id: originalPoint.id,
          kind: 'curve3d',
          points: [{ x: 0, y: 0, z: 0 }],
          parameter: { tMin: 0, tMax: 1, samples: 1 },
        },
      },
      { emit: false, meta: { actorId: 'bob', source: 'remote' } },
    ),
    error => error?.code === 'duplicate_id',
  );
  assert.throws(
    () => lab.applyDelta(
      {
        op: 'batch',
        deltas: [
          {
            op: 'addPoint3D',
            point: { id: 'batch-first', kind: 'point3d', x: 0, y: 0, z: 0 },
          },
          {
            op: 'addPoint3D',
            point: { ...originalPoint, x: 500 },
          },
        ],
      },
      { emit: false, meta: { actorId: 'bob', source: 'remote' } },
    ),
    error => error?.code === 'duplicate_id',
  );

  const snapshot = lab.getSnapshot();
  assert.deepEqual(snapshot.scene.scene3d.points[originalPoint.id], originalPoint);
  assert.equal(snapshot.scene.scene3d.points['batch-first'], undefined);
  assert.equal(Object.keys(snapshot.scene.scene3d.points).length, 1);
  assertGeometryLabInvariants(snapshot);
});

test('local undo skips remote operations and preserves remote state', () => {
  const lab = createGeometryLab({ actorId: 'local' });
  const firstLocalId = lab.addPoint3D({ x: 1, y: 0, z: 0 });
  const firstRemotePoint = { id: 'remote-a', kind: 'point3d', x: 0, y: 1, z: 0 };
  const secondRemotePoint = { id: 'remote-b', kind: 'point3d', x: 0, y: 0, z: 1 };

  lab.applyDelta(
    { op: 'addPoint3D', point: firstRemotePoint },
    { emit: false, meta: { actorId: 'peer', source: 'remote' } },
  );
  const secondLocalId = lab.addPoint3D({ x: 2, y: 0, z: 0 });
  lab.applyDelta(
    { op: 'addPoint3D', point: secondRemotePoint },
    { emit: false, meta: { actorId: 'peer', source: 'remote' } },
  );

  lab.undo();
  let points = lab.getSnapshot().scene.scene3d.points;
  assert.ok(points[firstLocalId]);
  assert.equal(points[secondLocalId], undefined);
  assert.deepEqual(points[firstRemotePoint.id], firstRemotePoint);
  assert.deepEqual(points[secondRemotePoint.id], secondRemotePoint);

  lab.undo();
  points = lab.getSnapshot().scene.scene3d.points;
  assert.equal(points[firstLocalId], undefined);
  assert.equal(points[secondLocalId], undefined);
  assert.deepEqual(points[firstRemotePoint.id], firstRemotePoint);
  assert.deepEqual(points[secondRemotePoint.id], secondRemotePoint);
  assertGeometryLabInvariants(lab.getSnapshot());
});

test('a conflicting remote edit invalidates local history instead of overwriting the peer', () => {
  const peer = createPeer('local');
  const pointId = peer.lab.addPoint3D({ x: 1, y: 2, z: 3 });
  peer.outbound.length = 0;

  peer.lab.applyDelta(
    { op: 'updatePoint', id: pointId, changes: { x: 99 } },
    { emit: false, meta: { actorId: 'remote', source: 'remote' } },
  );
  peer.lab.undo();

  assert.equal(peer.lab.getSnapshot().scene.scene3d.points[pointId].x, 99);
  assert.equal(peer.outbound.length, 0);
  assertGeometryLabInvariants(peer.lab.getSnapshot());
});

test('undo and redo of clear preserve records added remotely afterward', () => {
  const lab = createGeometryLab({ actorId: 'local' });
  const localPointId = lab.addPoint3D({ x: 1, y: 2, z: 3 });
  lab.applyDelta({ op: 'clear3D' });
  const remotePoint = { id: 'remote-after-clear', kind: 'point3d', x: 4, y: 5, z: 6 };
  lab.applyDelta(
    { op: 'addPoint3D', point: remotePoint },
    { emit: false, meta: { actorId: 'remote', source: 'remote' } },
  );

  lab.undo();
  let points = lab.getSnapshot().scene.scene3d.points;
  assert.ok(points[localPointId]);
  assert.deepEqual(points[remotePoint.id], remotePoint);

  lab.redo();
  points = lab.getSnapshot().scene.scene3d.points;
  assert.equal(points[localPointId], undefined);
  assert.deepEqual(points[remotePoint.id], remotePoint);
  assertGeometryLabInvariants(lab.getSnapshot());
});

test('undo and redo emit semantic history deltas that another peer can apply', () => {
  const leader = createPeer('leader');
  const follower = createPeer('follower');
  const pointId = leader.lab.addPoint3D({ x: 4, y: 5, z: 6 });

  const added = deliverNext(leader, follower);
  assert.equal(added.delta.op, 'addPoint3D');

  leader.lab.undo();
  assert.equal(leader.outbound.length, 1);
  const undone = leader.outbound[0];
  assert.equal(undone.meta.source, 'history');
  assert.equal(undone.meta.actorId, 'leader');
  assert.equal(undone.delta.op, 'historyPatch');
  assert.deepEqual(undone.delta.patches, [{
    ref: { collection: 'point3d', id: pointId },
    expected: {
      present: true,
      value: { id: pointId, kind: 'point3d', x: 4, y: 5, z: 6 },
    },
    next: { present: false },
  }]);
  deliverNext(leader, follower);
  assertPeersConverged(leader, follower);

  leader.lab.redo();
  assert.equal(leader.outbound.length, 1);
  const redone = leader.outbound[0];
  assert.equal(redone.meta.source, 'history');
  assert.equal(redone.meta.actorId, 'leader');
  assert.equal(redone.delta.op, 'historyPatch');
  assert.deepEqual(redone.delta.patches, [{
    ref: { collection: 'point3d', id: pointId },
    expected: { present: false },
    next: {
      present: true,
      value: { id: pointId, kind: 'point3d', x: 4, y: 5, z: 6 },
    },
  }]);
  deliverNext(leader, follower);
  assertPeersConverged(leader, follower);
});

test('two peers converge across concurrent edits, remote delivery, and local history', () => {
  const alice = createPeer('alice');
  const bob = createPeer('bob');

  const alicePoint = alice.lab.addPoint3D({ x: -1, y: 0, z: 0 });
  const bobPoint = bob.lab.addPoint3D({ x: 1, y: 0, z: 0 });

  deliverNext(bob, alice);
  deliverNext(alice, bob);
  assertPeersConverged(alice, bob);

  const aliceSegment = alice.lab.addSegment3D(alicePoint, bobPoint);
  const bobThirdPoint = bob.lab.addPoint3D({ x: 0, y: 1, z: 0 });

  deliverNext(bob, alice);
  deliverNext(alice, bob);
  assertPeersConverged(alice, bob);

  alice.lab.undo();
  assert.equal(alice.lab.getSnapshot().scene.scene3d.entities[aliceSegment], undefined);
  deliverNext(alice, bob);
  assertPeersConverged(alice, bob);

  const bobSegment = bob.lab.addSegment3D(bobPoint, bobThirdPoint);
  const aliceFourthPoint = alice.lab.addPoint3D({ x: 0, y: -1, z: 0 });

  deliverNext(alice, bob);
  deliverNext(bob, alice);
  assertPeersConverged(alice, bob);

  bob.lab.undo();
  assert.equal(bob.lab.getSnapshot().scene.scene3d.entities[bobSegment], undefined);
  deliverNext(bob, alice);
  assertPeersConverged(alice, bob);

  const finalSnapshot = alice.lab.getSnapshot();
  assert.deepEqual(
    new Set(Object.keys(finalSnapshot.scene.scene3d.points)),
    new Set([alicePoint, bobPoint, bobThirdPoint, aliceFourthPoint]),
  );
  assert.deepEqual(finalSnapshot.scene.scene3d.entities, {});
  assert.equal(alice.outbound.length, 0);
  assert.equal(bob.outbound.length, 0);
});
