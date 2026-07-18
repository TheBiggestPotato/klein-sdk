import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCollaborationWebSocketTransport,
  parseCollaborationMessage,
} from '../../dist/collab/index.js';

class FakeSocket {
  readyState = 0;
  onopen = null;
  onmessage = null;
  onclose = null;
  onerror = null;
  sent = [];

  open() {
    this.readyState = 1;
    this.onopen?.({});
  }

  receive(message) {
    this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  }

  send(payload) {
    this.sent.push(JSON.parse(payload));
  }

  serverClose(code = 1000, reason = '') {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  close(code = 1000, reason = '') {
    this.serverClose(code, reason);
  }
}

function createHarness(options = {}) {
  const sockets = [];
  const errors = [];
  let sequence = 0;
  const transport = createCollaborationWebSocketTransport({
    sessionId: 'session-one',
    toolKey: 'geometry-lab',
    createUrl: afterRevision => `wss://collab.test/session-one?after=${afterRevision ?? ''}`,
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    createMessageId: kind => `${kind}-${++sequence}`,
    autoReconnect: false,
    onError: error => errors.push(error),
    ...options,
  });
  return { transport, sockets, errors };
}

function hello(socket, revision = 0) {
  socket.receive({
    type: 'hello',
    sessionId: 'session-one',
    connectionId: 'connection-one',
    currentRevision: revision,
    oldestAvailableRevision: revision === 0 ? 1 : revision,
    heartbeatIntervalMs: 20_000,
    maxPayloadBytes: 1_048_576,
  });
}

async function startConnection(harness) {
  const ready = harness.transport.connect();
  await Promise.resolve();
  const socket = harness.sockets.at(-1);
  assert.ok(socket, 'Expected the transport to create a socket.');
  socket.open();
  return { ready, socket };
}

async function connectAndResume(harness, revision = 0) {
  const { ready, socket } = await startConnection(harness);
  hello(socket, revision);
  socket.receive({ type: 'resume-complete', sessionId: 'session-one', revision });
  await ready;
  return socket;
}

function deltaMeta(id) {
  return { id, actorId: 'local', createdAt: 1, source: 'local' };
}

test('message parser validates complete protocol envelopes instead of accepting a type tag', () => {
  const valid = {
    type: 'hello',
    sessionId: 'session-one',
    connectionId: 'connection-one',
    currentRevision: 0,
    oldestAvailableRevision: 1,
    heartbeatIntervalMs: 20_000,
    maxPayloadBytes: 1_048_576,
  };
  assert.deepEqual(parseCollaborationMessage(JSON.stringify(valid)), valid);

  for (const malformed of [
    { type: 'hello' },
    { ...valid, currentRevision: -1 },
    { type: 'delta', sessionId: 'session-one', toolKey: 'geometry-lab' },
    { type: 'ack', messageType: 'delta', messageId: 'id', revision: Number.NaN },
    { type: 'unknown', sessionId: 'session-one' },
    '{broken-json',
  ]) {
    assert.equal(parseCollaborationMessage(malformed), null);
  }
});

test('connect resolves only after resume-complete and rejects a terminal opening failure', async () => {
  const harness = createHarness();
  const { ready, socket } = await startConnection(harness);
  let settled = false;
  void ready.finally(() => { settled = true; });

  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(harness.transport.state, 'syncing');
  hello(socket);
  await Promise.resolve();
  assert.equal(settled, false);

  socket.receive({ type: 'resume-complete', sessionId: 'session-one', revision: 0 });
  await ready;
  assert.equal(settled, true);
  assert.equal(harness.transport.state, 'connected');
  harness.transport.disconnect();

  const failed = createHarness();
  const opening = failed.transport.connect();
  await Promise.resolve();
  failed.sockets[0].serverClose(1006, 'network failure');
  await assert.rejects(opening, /closed|connect/i);
  assert.equal(failed.transport.state, 'closed');
  assert.ok(failed.errors.some(error => error.code === 'connect_failed'));
});

test('host observers cannot interrupt synchronization, presence, or persistence', async () => {
  const reported = [];
  const harness = createHarness({
    onStateChange: () => {
      throw new Error('broken state observer');
    },
    onPersistedRevisionChange: () => {
      throw new Error('broken persistence observer');
    },
    onError: error => {
      reported.push(error);
      throw new Error('broken error observer');
    },
  });
  const states = [];
  harness.transport.onStateChange(state => states.push(state));
  harness.transport.onPresence(() => {
    throw new Error('broken presence observer');
  });

  const socket = await connectAndResume(harness);
  assert.equal(harness.transport.state, 'connected');
  assert.ok(states.includes('connected'));

  socket.receive({
    type: 'presence',
    sessionId: 'session-one',
    user: { actorId: 'peer-one' },
    presence: { actorId: 'peer-one', status: 'online' },
  });
  harness.transport.sendSnapshot({ value: 'checkpoint' });
  const mutation = socket.sent.at(-1);
  assert.equal(mutation.type, 'snapshot');
  socket.receive({
    type: 'ack',
    messageType: 'snapshot',
    messageId: mutation.snapshotId,
    revision: 1,
  });
  socket.receive({ type: 'persisted', sessionId: 'session-one', revision: 1 });

  assert.equal(harness.transport.persistedRevision, 1);
  assert.ok(reported.some(error => error.code === 'state_handler_failed'));
  assert.ok(reported.some(error => error.code === 'presence_handler_failed'));
  assert.ok(reported.some(error => error.code === 'persisted_revision_handler_failed'));
  harness.transport.disconnect();
});

test('transport rejects wrong-session, wrong-tool, malformed, and stale state messages', async () => {
  const harness = createHarness();
  const socket = await connectAndResume(harness);
  const deltas = [];
  const snapshots = [];
  harness.transport.onDelta(delta => deltas.push(delta));
  harness.transport.onSnapshot(snapshot => snapshots.push(snapshot));

  socket.receive({
    type: 'delta',
    sessionId: 'another-session',
    toolKey: 'geometry-lab',
    deltaId: 'wrong-session',
    baseRevision: 0,
    revision: 1,
    delta: { op: 'remote' },
  });
  socket.receive({
    type: 'delta',
    sessionId: 'session-one',
    toolKey: 'graphing',
    deltaId: 'wrong-tool',
    baseRevision: 0,
    revision: 1,
    delta: { op: 'remote' },
  });
  socket.receive({ type: 'hello' });
  socket.receive({
    type: 'snapshot',
    sessionId: 'session-one',
    toolKey: 'geometry-lab',
    revision: 1,
    snapshot: { value: 1 },
  });
  socket.receive({
    type: 'snapshot',
    sessionId: 'session-one',
    toolKey: 'geometry-lab',
    revision: 0,
    snapshot: { value: 0 },
  });

  assert.equal(harness.transport.revision, 1);
  assert.equal(deltas.length, 0);
  assert.deepEqual(snapshots, [{ value: 1 }]);
  assert.ok(harness.errors.some(error => error.code === 'unexpected_session'));
  assert.ok(harness.errors.some(error => error.code === 'unexpected_tool'));
  assert.ok(harness.errors.some(error => error.code === 'malformed_message'));
  assert.ok(harness.errors.some(error => error.code === 'stale_snapshot'));
  harness.transport.disconnect();
});

test('unknown or mismatched acknowledgements cannot advance the revision', async () => {
  const harness = createHarness();
  const socket = await connectAndResume(harness);

  socket.receive({ type: 'ack', messageType: 'delta', messageId: 'ghost', revision: 99 });
  assert.equal(harness.transport.revision, 0);
  assert.equal(harness.transport.pendingMessages, 0);

  harness.transport.sendDelta({ op: 'local' }, deltaMeta('local-delta'));
  assert.equal(socket.sent.at(-1).deltaId, 'local-delta');
  socket.receive({ type: 'ack', messageType: 'snapshot', messageId: 'local-delta', revision: 1 });
  assert.equal(harness.transport.revision, 0);
  assert.equal(harness.transport.pendingMessages, 1);

  socket.receive({ type: 'ack', messageType: 'delta', messageId: 'local-delta', revision: 1 });
  assert.equal(harness.transport.revision, 1);
  assert.equal(harness.transport.pendingMessages, 0);
  assert.ok(harness.errors.some(error => error.code === 'unknown_ack'));
  assert.ok(harness.errors.some(error => error.code === 'ack_type_mismatch'));
  harness.transport.disconnect();
});

test('an own snapshot acknowledgement does not reapply later queued deltas', async () => {
  const harness = createHarness();
  const socket = await connectAndResume(harness);
  const reapplied = [];
  const snapshots = [];
  harness.transport.onDelta((delta, meta) => reapplied.push({ delta, meta }));
  harness.transport.onSnapshot(snapshot => snapshots.push(snapshot));

  harness.transport.sendSnapshot({ value: 0 });
  const snapshotId = socket.sent.at(-1).snapshotId;
  harness.transport.sendDelta({ op: 'increment' }, deltaMeta('later-delta'));
  socket.receive({
    type: 'snapshot',
    sessionId: 'session-one',
    toolKey: 'geometry-lab',
    snapshotId,
    revision: 1,
    snapshot: { value: 0 },
  });

  assert.equal(reapplied.length, 0);
  assert.equal(snapshots.length, 0);
  assert.equal(socket.sent.at(-1).deltaId, 'later-delta');
  assert.equal(socket.sent.at(-1).baseRevision, 1);
  socket.receive({ type: 'ack', messageType: 'delta', messageId: 'later-delta', revision: 2 });
  harness.transport.disconnect();
});

test('a remote snapshot replays all unacknowledged local deltas once and in order', async () => {
  const harness = createHarness();
  const socket = await connectAndResume(harness);
  const events = [];
  harness.transport.onSnapshot(snapshot => events.push(['snapshot', snapshot.value]));
  harness.transport.onDelta((delta, meta) => events.push(['delta', delta.op, meta.source]));

  harness.transport.sendDelta({ op: 'first' }, deltaMeta('first'));
  harness.transport.sendDelta({ op: 'second' }, deltaMeta('second'));
  socket.receive({
    type: 'snapshot',
    sessionId: 'session-one',
    toolKey: 'geometry-lab',
    revision: 1,
    snapshot: { value: 'remote' },
  });

  assert.deepEqual(events, [
    ['snapshot', 'remote'],
    ['delta', 'first', 'history'],
    ['delta', 'second', 'history'],
  ]);
  assert.equal(socket.sent.at(-1).deltaId, 'first');
  assert.equal(socket.sent.at(-1).baseRevision, 1);

  socket.receive({ type: 'ack', messageType: 'delta', messageId: 'first', revision: 2 });
  assert.equal(socket.sent.at(-1).deltaId, 'second');
  assert.equal(socket.sent.at(-1).baseRevision, 2);
  socket.receive({ type: 'ack', messageType: 'delta', messageId: 'second', revision: 3 });
  assert.equal(events.length, 3);
  harness.transport.disconnect();
});

test('ordinary resync reasons request replay and recover through a snapshot', async () => {
  const harness = createHarness();
  const socket = await connectAndResume(harness);
  socket.sent.length = 0;

  socket.receive({
    type: 'resync-required',
    sessionId: 'session-one',
    reason: 'history_compacted',
    currentRevision: 5,
    oldestAvailableRevision: 4,
  });
  assert.equal(harness.transport.state, 'syncing');
  assert.deepEqual(socket.sent, [{ type: 'resume', afterRevision: 0 }]);

  socket.receive({
    type: 'snapshot',
    sessionId: 'session-one',
    toolKey: 'geometry-lab',
    revision: 5,
    snapshot: { value: 5 },
  });
  socket.receive({ type: 'resume-complete', sessionId: 'session-one', revision: 5 });
  assert.equal(harness.transport.state, 'connected');
  assert.equal(harness.transport.revision, 5);
  harness.transport.disconnect();
});

test('replay_unavailable waits for the relay full-state push without starting a duplicate resume cycle', async () => {
  const harness = createHarness();
  const socket = await connectAndResume(harness);
  socket.sent.length = 0;

  socket.receive({
    type: 'resync-required',
    sessionId: 'session-one',
    reason: 'replay_unavailable',
    currentRevision: 5,
    oldestAvailableRevision: 4,
  });
  assert.equal(harness.transport.state, 'syncing');
  assert.deepEqual(socket.sent, []);

  socket.receive({
    type: 'snapshot',
    sessionId: 'session-one',
    toolKey: 'geometry-lab',
    revision: 5,
    snapshot: { value: 5 },
  });
  socket.receive({ type: 'resume-complete', sessionId: 'session-one', revision: 5 });
  assert.equal(harness.transport.state, 'connected');
  assert.equal(harness.transport.revision, 5);
  harness.transport.disconnect();
});

test('registered snapshot providers seed rooms and requestSnapshot performs a pull-only resync', async () => {
  const harness = createHarness();
  const removeProvider = harness.transport.setSnapshotProvider(() => ({ value: 'seed' }));
  const snapshots = [];
  harness.transport.onSnapshot(snapshot => snapshots.push(snapshot));
  const socket = await connectAndResume(harness);

  assert.equal(socket.sent.length, 1);
  assert.equal(socket.sent[0].type, 'snapshot');
  assert.deepEqual(socket.sent[0].snapshot, { value: 'seed' });
  socket.receive({
    type: 'ack',
    messageType: 'snapshot',
    messageId: socket.sent[0].snapshotId,
    revision: 1,
  });
  socket.sent.length = 0;

  assert.equal(harness.transport.requestSnapshot(), true);
  assert.equal(harness.transport.state, 'syncing');
  assert.deepEqual(socket.sent, [{ type: 'resume', afterRevision: 1 }]);
  socket.receive({
    type: 'snapshot',
    sessionId: 'session-one',
    toolKey: 'geometry-lab',
    revision: 1,
    snapshot: { value: 'authoritative' },
  });
  socket.receive({ type: 'resume-complete', sessionId: 'session-one', revision: 1 });
  assert.deepEqual(snapshots, [{ value: 'authoritative' }]);
  assert.equal(harness.transport.state, 'connected');
  assert.equal(socket.sent.some(message => message.type === 'snapshot'), false);

  socket.sent.length = 0;
  assert.equal(harness.transport.requestSnapshot(), true);
  socket.receive({ type: 'resume-complete', sessionId: 'session-one', revision: 1 });
  assert.deepEqual(socket.sent, [{ type: 'resume', afterRevision: 1 }]);
  assert.equal(harness.transport.state, 'connected');
  removeProvider();
  harness.transport.disconnect();
});

test('authorization close codes are terminal and never auto-reconnect', async () => {
  const harness = createHarness({
    autoReconnect: true,
    reconnect: { initialDelayMs: 50, maxDelayMs: 50, jitterRatio: 0 },
  });
  const { ready, socket } = await startConnection(harness);
  socket.serverClose(4401, 'unauthorized');

  await assert.rejects(ready, /unauthor|closed|connect/i);
  assert.equal(harness.transport.state, 'closed');
  assert.ok(harness.errors.some(error => error.code === 'unauthorized'));
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(harness.sockets.length, 1);
});

test('reconnect preserves in-flight and queued delta order without duplicate local replay', async () => {
  const harness = createHarness({
    autoReconnect: true,
    reconnect: { initialDelayMs: 50, maxDelayMs: 50, jitterRatio: 0 },
  });
  const firstSocket = await connectAndResume(harness);
  const received = [];
  harness.transport.onDelta((delta, meta) => received.push([delta.op, meta.source]));

  harness.transport.sendDelta({ op: 'first' }, deltaMeta('first'));
  harness.transport.sendDelta({ op: 'second' }, deltaMeta('second'));
  firstSocket.serverClose(1006, 'temporary network loss');
  assert.equal(harness.transport.state, 'reconnecting');

  await new Promise(resolve => setTimeout(resolve, 80));
  const secondSocket = harness.sockets[1];
  assert.ok(secondSocket, 'Expected a reconnect socket.');
  secondSocket.open();
  hello(secondSocket, 0);
  secondSocket.receive({ type: 'resume-complete', sessionId: 'session-one', revision: 0 });
  await Promise.resolve();

  assert.equal(harness.transport.state, 'connected');
  assert.equal(secondSocket.sent[0].deltaId, 'first');
  assert.equal(secondSocket.sent[0].baseRevision, 0);
  secondSocket.receive({ type: 'ack', messageType: 'delta', messageId: 'first', revision: 1 });
  assert.equal(secondSocket.sent[1].deltaId, 'second');
  assert.equal(secondSocket.sent[1].baseRevision, 1);
  secondSocket.receive({ type: 'ack', messageType: 'delta', messageId: 'second', revision: 2 });
  assert.deepEqual(received, []);
  assert.equal(harness.transport.pendingMessages, 0);
  harness.transport.disconnect();
});

test('reconnect consumes a replayed local delta whose acknowledgement was lost', async () => {
  const harness = createHarness({
    autoReconnect: true,
    reconnect: { initialDelayMs: 50, maxDelayMs: 50, jitterRatio: 0 },
  });
  const firstSocket = await connectAndResume(harness);
  const received = [];
  harness.transport.onDelta((delta, meta) => received.push([delta.op, meta.source]));

  harness.transport.sendDelta({ op: 'accepted' }, deltaMeta('accepted'));
  harness.transport.sendDelta({ op: 'queued' }, deltaMeta('queued'));
  firstSocket.serverClose(1006, 'ack lost after relay acceptance');

  await new Promise(resolve => setTimeout(resolve, 80));
  const secondSocket = harness.sockets[1];
  assert.ok(secondSocket, 'Expected a reconnect socket.');
  secondSocket.open();
  hello(secondSocket, 1);
  secondSocket.receive({
    type: 'delta',
    sessionId: 'session-one',
    toolKey: 'geometry-lab',
    deltaId: 'accepted',
    baseRevision: 0,
    revision: 1,
    delta: { op: 'accepted' },
    meta: deltaMeta('accepted'),
  });
  secondSocket.receive({ type: 'resume-complete', sessionId: 'session-one', revision: 1 });
  await Promise.resolve();

  assert.deepEqual(received, [], 'the already-local replay must not be applied a second time');
  assert.equal(secondSocket.sent.length, 1);
  assert.equal(secondSocket.sent[0].deltaId, 'queued');
  assert.equal(secondSocket.sent[0].baseRevision, 1);
  secondSocket.receive({ type: 'ack', messageType: 'delta', messageId: 'queued', revision: 2 });
  assert.equal(harness.transport.pendingMessages, 0);
  harness.transport.disconnect();
});

test('relay rollback rebases accepted but unpersisted local deltas over the pushed snapshot', async () => {
  const harness = createHarness({
    autoReconnect: true,
    reconnect: { initialDelayMs: 50, maxDelayMs: 50, jitterRatio: 0 },
  });
  const firstSocket = await connectAndResume(harness);
  let localValue = 1;
  harness.transport.onSnapshot(snapshot => { localValue = snapshot.value; });
  harness.transport.onDelta(delta => { localValue += delta.amount; });

  harness.transport.sendDelta({ op: 'increment', amount: 1 }, deltaMeta('unpersisted-local'));
  firstSocket.receive({
    type: 'ack',
    messageType: 'delta',
    messageId: 'unpersisted-local',
    revision: 1,
  });
  assert.equal(harness.transport.revision, 1);
  assert.equal(harness.transport.persistedRevision, 0);
  firstSocket.serverClose(1006, 'relay restarted before persistence');

  await new Promise(resolve => setTimeout(resolve, 80));
  const secondSocket = harness.sockets[1];
  assert.ok(secondSocket, 'Expected a reconnect socket.');
  secondSocket.open();
  hello(secondSocket, 0);
  secondSocket.receive({
    type: 'resync-required',
    sessionId: 'session-one',
    reason: 'replay_unavailable',
    currentRevision: 0,
    oldestAvailableRevision: 1,
  });
  assert.deepEqual(secondSocket.sent, [], 'the relay is already pushing full state');
  secondSocket.receive({
    type: 'snapshot',
    sessionId: 'session-one',
    toolKey: 'geometry-lab',
    revision: 0,
    snapshot: { value: 0 },
  });
  secondSocket.receive({ type: 'resume-complete', sessionId: 'session-one', revision: 0 });
  await Promise.resolve();

  assert.equal(localValue, 1, 'the local accepted delta must be reapplied after rollback');
  assert.equal(secondSocket.sent.length, 1);
  assert.equal(secondSocket.sent[0].deltaId, 'unpersisted-local');
  assert.equal(secondSocket.sent[0].baseRevision, 0);
  secondSocket.receive({
    type: 'ack',
    messageType: 'delta',
    messageId: 'unpersisted-local',
    revision: 1,
  });
  harness.transport.disconnect();
});

test('empty-room seeding drops queued mutations already represented by the seed snapshot', async () => {
  let snapshot = { value: 2 };
  const harness = createHarness({
    snapshotProvider: () => snapshot,
    checkpointEveryDeltas: 1,
  });
  harness.transport.sendDelta({ op: 'first' }, deltaMeta('first'));
  snapshot = { value: 3 };
  harness.transport.sendDelta({ op: 'second' }, deltaMeta('second'));
  assert.equal(harness.transport.pendingMessages, 4);

  const { ready, socket } = await startConnection(harness);
  hello(socket, 0);
  socket.receive({ type: 'resume-complete', sessionId: 'session-one', revision: 0 });
  await ready;

  assert.equal(socket.sent.length, 1);
  assert.equal(socket.sent[0].type, 'snapshot');
  assert.deepEqual(socket.sent[0].snapshot, { value: 3 });
  assert.equal(socket.sent.some(message => message.type === 'delta'), false);
  assert.equal(harness.transport.pendingMessages, 1);
  socket.receive({
    type: 'ack',
    messageType: 'snapshot',
    messageId: socket.sent[0].snapshotId,
    revision: 1,
  });
  assert.equal(harness.transport.pendingMessages, 0);
  harness.transport.disconnect();
});
