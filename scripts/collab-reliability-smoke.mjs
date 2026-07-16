import {
  createCollaborationWebSocketTransport,
  createCollaborationWebSocketUrl,
} from '../dist/index.js';

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
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  send(payload) {
    this.sent.push(JSON.parse(payload));
  }

  close(code = 1000, reason = '') {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

const url = createCollaborationWebSocketUrl({
  baseUrl: 'wss://collab.example.test/',
  sessionId: 'work/one',
  token: 'ticket value',
  transportKind: 'tool',
  sessionKind: 'student-work',
  toolKey: 'graphing',
  afterRevision: 4,
});
const parsedUrl = new URL(url);
assert(parsedUrl.pathname === '/work%2Fone', 'Collaboration session IDs must be path encoded.');
assert(parsedUrl.searchParams.get('afterRevision') === '4', 'Resume revision is missing from the URL.');
assert(parsedUrl.searchParams.get('token') === 'ticket value', 'Ticket query encoding is invalid.');

const sockets = [];
const states = [];
const errors = [];
const remoteDeltas = [];
let snapshot = { version: 1, value: 0 };
let sequence = 0;
const transport = createCollaborationWebSocketTransport({
  sessionId: 'work-one',
  toolKey: 'graphing',
  createUrl: (afterRevision) => `wss://collab.example.test/work-one?after=${afterRevision ?? ''}`,
  createSocket: () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  },
  createMessageId: (kind) => `${kind}-${++sequence}`,
  snapshotProvider: () => snapshot,
  checkpointEveryDeltas: 1,
  autoReconnect: false,
  onStateChange: (state) => states.push(state),
  onError: (error) => errors.push(error),
});
transport.onDelta((delta, meta) => remoteDeltas.push({ delta, meta }));

const connecting = transport.connect();
await Promise.resolve();
assert(sockets.length === 1, 'Transport did not create a socket.');
const socket = sockets[0];
socket.open();
await connecting;
socket.receive({
  type: 'hello',
  sessionId: 'work-one',
  connectionId: 'connection-one',
  currentRevision: 0,
  oldestAvailableRevision: 1,
  heartbeatIntervalMs: 20_000,
  maxPayloadBytes: 1_048_576,
});
socket.receive({ type: 'resume-complete', sessionId: 'work-one', revision: 0 });

assert(socket.sent.length === 1, 'An empty session must be seeded with one snapshot.');
assert(socket.sent[0].type === 'snapshot', 'Initial collaboration message must be a snapshot.');
assert(socket.sent[0].baseRevision === 0, 'Initial snapshot base revision must be zero.');
socket.receive({ type: 'ack', messageType: 'snapshot', messageId: 'snapshot-1', revision: 1 });

snapshot = { version: 1, value: 1 };
transport.sendDelta(
  { op: 'set', value: 1 },
  { id: 'delta-local', createdAt: 1, source: 'local' },
);
assert(socket.sent[1].type === 'delta', 'Local delta was not sent after synchronization.');
assert(socket.sent[1].baseRevision === 1, 'Local delta used the wrong base revision.');
socket.receive({ type: 'ack', messageType: 'delta', messageId: 'delta-local', revision: 2 });
assert(socket.sent[2].type === 'snapshot', 'Checkpoint snapshot was not queued after the delta.');
assert(socket.sent[2].baseRevision === 2, 'Checkpoint snapshot used the wrong base revision.');
socket.receive({ type: 'ack', messageType: 'snapshot', messageId: 'snapshot-2', revision: 3 });
socket.receive({ type: 'persisted', sessionId: 'work-one', revision: 3 });
assert(transport.persistedRevision === 3, 'Persisted revision was not tracked.');

snapshot = { version: 1, value: 3 };
const checkpoint = transport.checkpoint(snapshot);
assert(socket.sent[3].type === 'snapshot', 'Explicit durable checkpoint was not sent.');
socket.receive({ type: 'ack', messageType: 'snapshot', messageId: 'snapshot-3', revision: 4 });
let checkpointResolved = false;
void checkpoint.then(() => { checkpointResolved = true; });
await Promise.resolve();
assert(!checkpointResolved, 'Checkpoint resolved before durable persistence confirmation.');
socket.receive({ type: 'persisted', sessionId: 'work-one', revision: 4 });
assert(await checkpoint === 4, 'Checkpoint resolved with the wrong durable revision.');

socket.receive({
  type: 'delta',
  sessionId: 'work-one',
  toolKey: 'graphing',
  deltaId: 'delta-remote',
  baseRevision: 4,
  revision: 5,
  delta: { op: 'set', value: 2 },
});
assert(transport.revision === 5, 'Remote replay did not advance the local revision.');
assert(remoteDeltas.length === 1, 'Remote delta handler was not called exactly once.');
assert(remoteDeltas[0].meta.source === 'remote', 'Remote delta metadata was not normalized.');
assert(errors.length === 0, 'Reliable transport emitted an unexpected protocol error.');
assert(states.includes('syncing') && states.includes('connected'), 'Connection state transitions are incomplete.');

transport.disconnect();
assert(transport.state === 'closed', 'Transport did not enter the closed state.');

const boundedErrors = [];
const bounded = createCollaborationWebSocketTransport({
  sessionId: 'bounded',
  toolKey: 'graphing',
  createUrl: () => 'wss://collab.example.test/bounded',
  createSocket: () => new FakeSocket(),
  maxPendingBytes: 1024,
  autoReconnect: false,
  onError: (error) => boundedErrors.push(error),
});
bounded.sendSnapshot({ value: 'x'.repeat(2_000) });
assert(bounded.pendingMessages === 0, 'Oversized offline snapshot entered the bounded queue.');
assert(boundedErrors[0]?.code === 'pending_queue_full', 'Oversized queue rejection was not reported.');

console.log('Collaboration reliability smoke test passed.');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
