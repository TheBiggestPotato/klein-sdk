import type { DeltaMeta, KleinToolKey } from '../core/index.js';
import type {
  CollabMessage,
  CollaborationTransport,
  PresenceEvent,
} from './index.js';

const SOCKET_OPEN = 1;
const TERMINAL_CLOSE_CODES = new Set([1008, 4001, 4003, 4401, 4403]);
const KLEIN_TOOL_KEYS = new Set<KleinToolKey>([
  'graphing',
  'geometry-lab',
  'graphing-3d',
  'scientific',
  'probability',
  'whiteboard',
]);

export type CollaborationConnectionState =
  | 'idle'
  | 'connecting'
  | 'syncing'
  | 'connected'
  | 'reconnecting'
  | 'closed';

export interface CollaborationProtocolError {
  code: string;
  message: string;
  recoverable: boolean;
  details?: unknown;
}

export interface CollaborationWebSocketLike {
  readonly readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type CollaborationSocketFactory = (url: string) => CollaborationWebSocketLike;

export interface ReconnectPolicy {
  initialDelayMs?: number;
  maxDelayMs?: number;
  multiplier?: number;
  jitterRatio?: number;
}

export interface CreateCollaborationWebSocketUrlInput {
  baseUrl: string;
  sessionId: string;
  token: string;
  transportKind?: 'tool' | 'whiteboard' | 'geogebra';
  sessionKind?: 'room' | 'tool-session' | 'student-work' | 'live-session' | 'exam';
  toolKey?: KleinToolKey;
  afterRevision?: number;
}

export interface CollaborationWebSocketTransportOptions<TSnapshot, TDelta> {
  sessionId: string;
  toolKey: KleinToolKey;
  createUrl: (afterRevision: number | undefined) => string | Promise<string>;
  createSocket?: CollaborationSocketFactory;
  initialRevision?: number;
  maxPendingMessages?: number;
  maxPendingBytes?: number;
  reconnect?: ReconnectPolicy;
  autoReconnect?: boolean;
  createMessageId?: (kind: 'delta' | 'snapshot') => string;
  snapshotProvider?: () => TSnapshot;
  checkpointEveryDeltas?: number;
  onStateChange?: (state: CollaborationConnectionState) => void;
  onPersistedRevisionChange?: (revision: number) => void;
  onError?: (error: CollaborationProtocolError) => void;
  now?: () => number;
  random?: () => number;
}

type QueuedMutation<TSnapshot, TDelta> =
  | { kind: 'delta'; id: string; delta: TDelta; meta: DeltaMeta; bytes: number }
  | { kind: 'snapshot'; id: string; snapshot: TSnapshot; bytes: number };

interface AcceptedMutation<TSnapshot, TDelta> {
  mutation: QueuedMutation<TSnapshot, TDelta>;
  revision: number;
}

interface CheckpointWaiter {
  acceptedRevision?: number;
  resolve: (revision: number) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface SocketHandshake {
  socket: CollaborationWebSocketLike;
  resolve: () => void;
  reject: (error: Error) => void;
}

class CollaborationConnectionFailure extends Error {
  readonly code: string;
  readonly terminal: boolean;

  constructor(code: string, message: string, terminal: boolean) {
    super(message);
    this.name = 'CollaborationConnectionFailure';
    this.code = code;
    this.terminal = terminal;
  }
}

/** Builds a relay URL without coupling authentication or ticket acquisition to the SDK. */
export function createCollaborationWebSocketUrl(
  input: CreateCollaborationWebSocketUrlInput,
): string {
  const base = input.baseUrl.endsWith('/')
    ? input.baseUrl.slice(0, -1)
    : input.baseUrl;
  const url = new URL(`${base}/${encodeURIComponent(input.sessionId)}`);
  url.searchParams.set('type', input.transportKind ?? 'tool');
  url.searchParams.set('token', input.token);
  if (input.sessionKind !== undefined) url.searchParams.set('sessionKind', input.sessionKind);
  if (input.toolKey !== undefined) url.searchParams.set('tool', input.toolKey);
  if (input.afterRevision !== undefined) {
    url.searchParams.set('afterRevision', String(input.afterRevision));
  }
  return url.toString();
}

/** Parses and validates a collaboration envelope; tool-specific payload validation remains host-owned. */
export function parseCollaborationMessage<TSnapshot = unknown, TDelta = unknown>(
  value: unknown,
): CollabMessage<TSnapshot, TDelta> | null {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!isCollaborationMessage(parsed)) return null;
  return parsed as CollabMessage<TSnapshot, TDelta>;
}

/**
 * Framework-independent, revision-aware WebSocket transport for the Klein relay protocol.
 * It serializes local mutations, resumes from the last applied revision, and bounds offline work.
 */
export class WebSocketCollaborationTransport<TSnapshot, TDelta>
implements CollaborationTransport<TSnapshot, TDelta> {
  readonly sessionId: string;
  readonly toolKey: KleinToolKey;

  #options: CollaborationWebSocketTransportOptions<TSnapshot, TDelta>;
  #snapshotProvider: (() => TSnapshot) | undefined;
  #socket: CollaborationWebSocketLike | null = null;
  #state: CollaborationConnectionState = 'idle';
  #revision: number;
  #persistedRevision: number;
  #queue: QueuedMutation<TSnapshot, TDelta>[] = [];
  #inFlight: QueuedMutation<TSnapshot, TDelta> | null = null;
  #acceptedMutations: AcceptedMutation<TSnapshot, TDelta>[] = [];
  #pendingBytes = 0;
  #deltaHandlers = new Set<(delta: TDelta, meta: DeltaMeta) => void>();
  #snapshotHandlers = new Set<(snapshot: TSnapshot) => void>();
  #presenceHandlers = new Set<(presence: PresenceEvent) => void>();
  #stateHandlers = new Set<(state: CollaborationConnectionState) => void>();
  #errorHandlers = new Set<(error: CollaborationProtocolError) => void>();
  #persistedRevisionHandlers = new Set<(revision: number) => void>();
  #checkpointWaiters = new Map<string, CheckpointWaiter>();
  #connectPromise: Promise<void> | null = null;
  #resolveConnect: (() => void) | null = null;
  #rejectConnect: ((error: Error) => void) | null = null;
  #attemptInProgress = false;
  #handshake: SocketHandshake | null = null;
  #manualClose = false;
  #readyToSend = false;
  #reconnectAttempt = 0;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #messageSequence = 0;
  #helloRevision: number | null = null;
  #maySeedEmptyRoom = false;
  #receivedSnapshotInSync = false;
  #allowAuthoritativeRollback = false;
  #deltasSinceCheckpoint = 0;

  constructor(options: CollaborationWebSocketTransportOptions<TSnapshot, TDelta>) {
    this.#options = options;
    this.#snapshotProvider = options.snapshotProvider;
    this.sessionId = options.sessionId;
    this.toolKey = options.toolKey;
    this.#revision = Math.max(0, options.initialRevision ?? 0);
    this.#persistedRevision = this.#revision;
  }

  get state(): CollaborationConnectionState {
    return this.#state;
  }

  get revision(): number {
    return this.#revision;
  }

  get pendingMessages(): number {
    return this.#queue.length + (this.#inFlight === null ? 0 : 1);
  }

  get pendingBytes(): number {
    return this.#pendingBytes;
  }

  get persistedRevision(): number {
    return this.#persistedRevision;
  }

  connect(): Promise<void> {
    if (this.#state === 'connected') return Promise.resolve();
    this.#manualClose = false;
    if (this.#connectPromise === null) {
      this.#connectPromise = new Promise<void>((resolve, reject) => {
        this.#resolveConnect = resolve;
        this.#rejectConnect = reject;
      });
    }
    if (!this.#attemptInProgress && this.#socket === null && this.#reconnectTimer === null) {
      void this.#startConnectionAttempt();
    }
    return this.#connectPromise;
  }

  async #startConnectionAttempt(): Promise<void> {
    if (this.#attemptInProgress || this.#manualClose || this.#socket !== null) return;
    this.#attemptInProgress = true;
    this.#transition(this.#reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
    try {
      await this.#openSocket();
      if (this.#state !== 'connected' || this.#socket === null) return;
      this.#reconnectAttempt = 0;
      this.#resolveConnectWaiter();
    } catch (error) {
      if (this.#manualClose) return;
      const failure = connectionFailure(error, this.#options.autoReconnect === false);
      this.#emitError({
        code: failure.code,
        message: failure.message,
        recoverable: !failure.terminal,
        details: error,
      });
      if (!failure.terminal) {
        this.#transition('reconnecting');
        this.#scheduleReconnect();
      } else {
        this.#transition('closed');
        this.#rejectConnectWaiter(failure);
      }
    } finally {
      this.#attemptInProgress = false;
    }
  }

  disconnect(): void {
    this.#manualClose = true;
    this.#readyToSend = false;
    this.#allowAuthoritativeRollback = false;
    if (this.#reconnectTimer !== null) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    const handshake = this.#handshake;
    this.#handshake = null;
    handshake?.reject(new CollaborationConnectionFailure(
      'disconnected',
      'Collaboration transport disconnected before synchronization completed.',
      true,
    ));
    this.#rejectConnectWaiter(new Error(
      'Collaboration transport disconnected before synchronization completed.',
    ));
    const socket = this.#socket;
    this.#socket = null;
    if (socket !== null) socket.close(1000, 'client_disconnect');
    this.#rejectCheckpoints('Collaboration transport disconnected before persistence completed.');
    this.#queue = [];
    this.#inFlight = null;
    this.#acceptedMutations = [];
    this.#pendingBytes = 0;
    this.#transition('closed');
  }

  sendDelta(delta: TDelta, meta: DeltaMeta): void {
    const queued = this.#enqueue({
      kind: 'delta',
      id: meta.id || this.#nextMessageId('delta'),
      delta,
      meta,
      bytes: estimateJsonBytes(delta),
    });
    if (!queued) return;
    const checkpointEvery = Math.max(0, this.#options.checkpointEveryDeltas ?? 0);
    if (this.#snapshotProvider !== undefined && checkpointEvery > 0) {
      this.#deltasSinceCheckpoint += 1;
      if (this.#deltasSinceCheckpoint >= checkpointEvery) {
        this.#deltasSinceCheckpoint = 0;
        const snapshot = this.#readCheckpointSnapshot();
        if (snapshot !== undefined) this.sendSnapshot(snapshot);
      }
    }
  }

  sendSnapshot(snapshot: TSnapshot): void {
    this.#enqueue({
      kind: 'snapshot',
      id: this.#nextMessageId('snapshot'),
      snapshot,
      bytes: estimateJsonBytes(snapshot),
    });
  }

  checkpoint(snapshot: TSnapshot, timeoutMs = 15_000): Promise<number> {
    const id = this.#nextMessageId('snapshot');
    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#checkpointWaiters.delete(id);
        this.#removeQueuedMutation(id);
        reject(new Error('Timed out waiting for the collaboration checkpoint to persist.'));
      }, Math.max(1, timeoutMs));
      this.#checkpointWaiters.set(id, { resolve, reject, timer });
      const queued = this.#enqueue({
        kind: 'snapshot',
        id,
        snapshot,
        bytes: estimateJsonBytes(snapshot),
      });
      if (!queued) {
        clearTimeout(timer);
        this.#checkpointWaiters.delete(id);
        reject(new Error('The collaboration checkpoint could not be queued.'));
      }
    });
  }

  sendPresence(presence: PresenceEvent): void {
    this.#send({
      type: 'presence',
      sessionId: this.sessionId,
      user: presenceUser(presence),
      presence,
    });
  }

  onDelta(handler: (delta: TDelta, meta: DeltaMeta) => void): () => void {
    this.#deltaHandlers.add(handler);
    return () => this.#deltaHandlers.delete(handler);
  }

  onSnapshot(handler: (snapshot: TSnapshot) => void): () => void {
    this.#snapshotHandlers.add(handler);
    return () => this.#snapshotHandlers.delete(handler);
  }

  onPresence(handler: (presence: PresenceEvent) => void): () => void {
    this.#presenceHandlers.add(handler);
    return () => this.#presenceHandlers.delete(handler);
  }

  onStateChange(handler: (state: CollaborationConnectionState) => void): () => void {
    this.#stateHandlers.add(handler);
    return () => this.#stateHandlers.delete(handler);
  }

  onError(handler: (error: CollaborationProtocolError) => void): () => void {
    this.#errorHandlers.add(handler);
    return () => this.#errorHandlers.delete(handler);
  }

  onPersistedRevisionChange(handler: (revision: number) => void): () => void {
    this.#persistedRevisionHandlers.add(handler);
    return () => this.#persistedRevisionHandlers.delete(handler);
  }

  setSnapshotProvider(provider: () => TSnapshot): () => void {
    const previous = this.#snapshotProvider;
    this.#snapshotProvider = provider;
    return () => {
      if (this.#snapshotProvider === provider) this.#snapshotProvider = previous;
    };
  }

  requestSnapshot(): boolean {
    if (this.#state !== 'connected' || this.#socket?.readyState !== SOCKET_OPEN) return false;
    this.#prepareForRecovery('snapshot_conflict');
    this.#readyToSend = false;
    this.#maySeedEmptyRoom = false;
    this.#receivedSnapshotInSync = false;
    this.#allowAuthoritativeRollback = false;
    this.#transition('syncing');
    return this.#send({ type: 'resume', afterRevision: this.#revision });
  }

  async #openSocket(): Promise<void> {
    const url = await this.#options.createUrl(
      this.#revision > 0 ? this.#revision : undefined,
    );
    if (this.#manualClose) {
      throw new CollaborationConnectionFailure(
        'disconnected',
        'Collaboration connection was cancelled.',
        true,
      );
    }
    const createSocket = this.#options.createSocket ?? defaultSocketFactory;
    const socket = createSocket(url);
    this.#socket = socket;
    this.#helloRevision = null;
    this.#maySeedEmptyRoom = false;
    this.#receivedSnapshotInSync = false;
    this.#allowAuthoritativeRollback = false;
    this.#readyToSend = false;

    await new Promise<void>((resolve, reject) => {
      this.#handshake = { socket, resolve, reject };
      socket.onopen = () => {
        if (this.#socket !== socket) return;
        this.#transition('syncing');
      };
      socket.onmessage = (event) => {
        if (this.#socket === socket) this.#receive(event.data);
      };
      socket.onerror = (event) => {
        this.#emitError({
          code: 'socket_error',
          message: 'The collaboration socket reported a transport error.',
          recoverable: true,
          details: event,
        });
      };
      socket.onclose = (event) => {
        const pendingHandshake = this.#handshake?.socket === socket;
        if (pendingHandshake) {
          this.#handshake = null;
          reject(closeFailure(event, this.#options.autoReconnect === false));
        }
        this.#handleClose(socket, event, pendingHandshake);
      };
    });
  }

  #handleClose(
    socket: CollaborationWebSocketLike,
    event: { code?: number; reason?: string },
    pendingHandshake: boolean,
  ): void {
    if (this.#socket !== socket) return;
    this.#socket = null;
    this.#readyToSend = false;
    if (this.#inFlight !== null) {
      this.#queue.unshift(this.#inFlight);
      this.#inFlight = null;
    }
    if (pendingHandshake) return;
    if (this.#manualClose) {
      this.#transition('closed');
      return;
    }
    if (isTerminalClose(event)) {
      const failure = closeFailure(event, true);
      this.#emitError({
        code: failure.code,
        message: failure.message,
        recoverable: false,
        details: event,
      });
      this.#transition('closed');
      this.#rejectConnectWaiter(failure);
      return;
    }
    if (this.#options.autoReconnect === false) {
      this.#transition('closed');
      return;
    }
    this.#transition('reconnecting');
    this.#scheduleReconnect();
  }

  #scheduleReconnect(): void {
    if (this.#reconnectTimer !== null) return;
    const policy = this.#options.reconnect ?? {};
    const initial = Math.max(50, policy.initialDelayMs ?? 500);
    const maximum = Math.max(initial, policy.maxDelayMs ?? 15_000);
    const multiplier = Math.max(1, policy.multiplier ?? 2);
    const jitter = Math.min(1, Math.max(0, policy.jitterRatio ?? 0.2));
    const base = Math.min(maximum, initial * multiplier ** this.#reconnectAttempt);
    const random = this.#options.random?.() ?? Math.random();
    const delay = Math.max(0, Math.round(base * (1 - jitter + 2 * jitter * random)));
    this.#reconnectAttempt += 1;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      void this.#startConnectionAttempt();
    }, delay);
  }

  #enqueue(mutation: QueuedMutation<TSnapshot, TDelta>): boolean {
    return this.#queueMutation(mutation, false);
  }

  #prepend(mutation: QueuedMutation<TSnapshot, TDelta>): boolean {
    return this.#queueMutation(mutation, true);
  }

  #queueMutation(
    mutation: QueuedMutation<TSnapshot, TDelta>,
    prepend: boolean,
  ): boolean {
    const maxPending = Math.max(1, this.#options.maxPendingMessages ?? 256);
    const maxPendingBytes = Math.max(1_024, this.#options.maxPendingBytes ?? 2_097_152);
    if (this.pendingMessages >= maxPending
        || this.#pendingBytes + mutation.bytes > maxPendingBytes) {
      this.#emitError({
        code: 'pending_queue_full',
        message: 'The bounded collaboration pending queue is full.',
        recoverable: false,
      });
      return false;
    }
    if (prepend) this.#queue.unshift(mutation);
    else this.#queue.push(mutation);
    this.#pendingBytes += mutation.bytes;
    this.#sendNext();
    return true;
  }

  #sendNext(): void {
    if (!this.#readyToSend || this.#inFlight !== null) return;
    const next = this.#queue.shift();
    if (next === undefined) return;
    this.#inFlight = next;
    if (next.kind === 'delta') {
      this.#send({
        type: 'delta',
        sessionId: this.sessionId,
        toolKey: this.toolKey,
        deltaId: next.id,
        baseRevision: this.#revision,
        delta: next.delta,
        meta: next.meta,
      });
    } else {
      this.#send({
        type: 'snapshot',
        sessionId: this.sessionId,
        toolKey: this.toolKey,
        snapshotId: next.id,
        baseRevision: this.#revision,
        snapshot: next.snapshot,
      });
    }
  }

  #send(message: CollabMessage<TSnapshot, TDelta>): boolean {
    const socket = this.#socket;
    if (socket === null || socket.readyState !== SOCKET_OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  #receive(raw: unknown): void {
    const message = parseCollaborationMessage<TSnapshot, TDelta>(raw);
    if (message === null) {
      this.#emitError({
        code: 'malformed_message',
        message: 'A malformed collaboration message was ignored.',
        recoverable: true,
      });
      return;
    }
    const messageSessionId = collaborationMessageSessionId(message);
    if (messageSessionId !== undefined && messageSessionId !== this.sessionId) {
      this.#emitError({
        code: 'unexpected_session',
        message: 'A collaboration message for another session was ignored.',
        recoverable: true,
        details: { expected: this.sessionId, received: messageSessionId, type: message.type },
      });
      return;
    }
    if ((message.type === 'delta' || message.type === 'snapshot')
        && message.toolKey !== this.toolKey) {
      this.#emitError({
        code: 'unexpected_tool',
        message: 'A collaboration message for another tool was ignored.',
        recoverable: true,
        details: { expected: this.toolKey, received: message.toolKey, type: message.type },
      });
      return;
    }
    switch (message.type) {
      case 'hello': {
        if (this.#state !== 'syncing') {
          this.#emitError({
            code: 'unexpected_message_order',
            message: 'A collaboration hello outside synchronization was ignored.',
            recoverable: true,
          });
          break;
        }
        this.#helloRevision = message.currentRevision;
        this.#maySeedEmptyRoom = message.currentRevision === 0;
        this.#receivedSnapshotInSync = false;
        this.#readyToSend = false;
        break;
      }
      case 'delta':
        this.#receiveDelta(message);
        break;
      case 'snapshot':
        this.#receiveSnapshot(message);
        break;
      case 'ack':
        this.#receiveAck(message.messageType, message.messageId, message.revision);
        break;
      case 'persisted': {
        const greatestKnownRevision = Math.max(
          this.#revision,
          this.#helloRevision ?? this.#revision,
        );
        if (message.revision > greatestKnownRevision) {
          this.#emitError({
            code: 'future_persisted_revision',
            message: 'A persisted revision beyond known server state was ignored.',
            recoverable: true,
            details: { greatestKnownRevision, receivedRevision: message.revision },
          });
          break;
        }
        this.#setPersistedRevision(message.revision);
        this.#resolvePersistedCheckpoints();
        break;
      }
      case 'resume-complete':
        if (this.#state !== 'syncing' || this.#helloRevision === null) {
          this.#emitError({
            code: 'unexpected_message_order',
            message: 'A resume completion before hello or outside synchronization was ignored.',
            recoverable: true,
          });
          break;
        }
        if (message.revision !== this.#revision) {
          this.#requestResume('resume_revision_mismatch');
          break;
        }
        if (this.#maySeedEmptyRoom && !this.#receivedSnapshotInSync) {
          this.#prepareEmptyRoomSeed();
        }
        this.#maySeedEmptyRoom = false;
        this.#readyToSend = true;
        this.#reconnectAttempt = 0;
        this.#transition('connected');
        this.#sendNext();
        this.#completeHandshake();
        break;
      case 'resync-required':
        this.#beginResync(message.reason);
        break;
      case 'policy-rejected':
        this.#rejectInFlight(message.messageType, message.code);
        break;
      case 'presence':
        this.#receivePresence(message);
        break;
      case 'error':
        this.#emitError({
          code: message.code,
          message: message.message,
          recoverable: true,
          details: message.details,
        });
        break;
      case 'resume':
      case 'classroom-event':
      case 'exam-event':
        this.#emitError({
          code: 'unexpected_message_type',
          message: `Unexpected server collaboration message type "${message.type}" was ignored.`,
          recoverable: true,
        });
        break;
      default:
        break;
    }
  }

  #receiveDelta(
    message: Extract<CollabMessage<TSnapshot, TDelta>, { type: 'delta' }>,
  ): void {
    if (message.revision === undefined) {
      this.#emitError({
        code: 'malformed_message',
        message: 'A server delta without a revision was ignored.',
        recoverable: true,
      });
      return;
    }
    const alreadyAccepted = this.#acceptedMutation(message.deltaId);
    if (alreadyAccepted?.mutation.kind === 'delta') {
      if (message.revision > this.#revision + 1) this.#requestResume('out_of_order_delta');
      return;
    }

    const pending = this.#findPendingMutation(message.deltaId);
    if (pending?.kind === 'delta') {
      if (message.revision > this.#revision + 1
          || (message.revision === this.#revision + 1
            && message.baseRevision !== this.#revision)) {
        this.#requestResume('out_of_order_delta');
        return;
      }
      if (message.revision === this.#revision + 1) this.#revision = message.revision;
      const completed = this.#takePendingMutation(message.deltaId);
      if (completed !== undefined) this.#completeAcceptedMutation(completed, message.revision);
      return;
    }

    if (message.baseRevision !== this.#revision || message.revision !== this.#revision + 1) {
      this.#requestResume('out_of_order_delta');
      return;
    }
    this.#revision = message.revision;
    const meta = normalizeRemoteMeta(message.meta, message.deltaId, this.#now());
    this.#notifyDeltaHandlers(message.delta, meta);
  }

  #receiveSnapshot(
    message: Extract<CollabMessage<TSnapshot, TDelta>, { type: 'snapshot' }>,
  ): void {
    if (message.revision === undefined) {
      this.#emitError({
        code: 'malformed_message',
        message: 'A server snapshot without a revision was ignored.',
        recoverable: true,
      });
      return;
    }
    const alreadyAccepted = message.snapshotId === undefined
      ? undefined
      : this.#acceptedMutation(message.snapshotId);
    if (alreadyAccepted?.mutation.kind === 'snapshot') {
      if (message.revision > this.#revision + 1) this.#requestResume('out_of_order_snapshot');
      return;
    }

    const pendingSnapshot = message.snapshotId === undefined
      ? undefined
      : this.#findPendingMutation(message.snapshotId);
    if (pendingSnapshot?.kind === 'snapshot') {
      if (message.revision > this.#revision + 1) {
        this.#requestResume('out_of_order_snapshot');
        return;
      }
      const checkpoint = this.#checkpointWaiters.get(message.snapshotId as string);
      if (checkpoint !== undefined) checkpoint.acceptedRevision = message.revision;
      if (message.revision === this.#revision + 1) this.#revision = message.revision;
      const completed = this.#takePendingMutation(message.snapshotId as string);
      if (completed !== undefined) this.#completeAcceptedMutation(completed, message.revision);
      return;
    }
    const allowCurrentRevisionDuringSync = this.#state === 'syncing'
      && !this.#receivedSnapshotInSync
      && message.revision === this.#revision;
    const allowRollbackDuringSync = this.#state === 'syncing'
      && this.#allowAuthoritativeRollback
      && !this.#receivedSnapshotInSync
      && message.revision < this.#revision
      && (this.#helloRevision === null || message.revision <= this.#helloRevision);
    if ((message.revision < this.#revision && !allowRollbackDuringSync)
        || (message.revision === this.#revision && !allowCurrentRevisionDuringSync)) {
      this.#emitError({
        code: 'stale_snapshot',
        message: 'A stale or duplicate collaboration snapshot was ignored.',
        recoverable: true,
        details: { currentRevision: this.#revision, receivedRevision: message.revision },
      });
      return;
    }

    const restoreSending = this.#readyToSend && this.#state === 'connected';
    this.#readyToSend = false;
    const pendingDeltas = this.#prepareForRemoteSnapshot();
    const rollbackMutations = allowRollbackDuringSync
      ? this.#requeueAcceptedMutationsAfter(message.revision)
      : [];
    this.#revision = message.revision;
    this.#receivedSnapshotInSync = true;
    this.#allowAuthoritativeRollback = false;
    this.#notifySnapshotHandlers(message.snapshot);
    for (const mutation of rollbackMutations) {
      if (mutation.kind === 'snapshot') {
        this.#notifySnapshotHandlers(mutation.snapshot);
      } else {
        this.#notifyDeltaHandlers(mutation.delta, { ...mutation.meta, source: 'history' });
      }
    }
    for (const mutation of pendingDeltas) {
      this.#notifyDeltaHandlers(mutation.delta, { ...mutation.meta, source: 'history' });
    }
    if (restoreSending) {
      this.#readyToSend = true;
      this.#sendNext();
    }
  }

  #receiveAck(messageType: string, messageId: string, revision: number): void {
    const accepted = this.#acceptedMutation(messageId);
    if (accepted !== undefined) {
      if (accepted.mutation.kind !== messageType) {
        this.#emitError({
          code: 'ack_type_mismatch',
          message: 'An acknowledgement with the wrong mutation type was ignored.',
          recoverable: true,
          details: { messageId, expected: accepted.mutation.kind, received: messageType },
        });
      }
      return;
    }

    const mutation = this.#findPendingMutation(messageId);
    if (mutation === undefined) {
      this.#emitError({
        code: 'unknown_ack',
        message: 'An acknowledgement for an unknown mutation was ignored.',
        recoverable: true,
        details: { messageId, messageType, revision },
      });
      return;
    }
    if (messageType !== mutation.kind) {
      this.#emitError({
        code: 'ack_type_mismatch',
        message: 'An acknowledgement with the wrong mutation type was ignored.',
        recoverable: true,
        details: { messageId, expected: mutation.kind, received: messageType },
      });
      return;
    }
    if (revision > this.#revision + 1) {
      this.#requestResume('out_of_order_ack');
      return;
    }
    if (mutation.kind === 'snapshot') {
      const checkpoint = this.#checkpointWaiters.get(messageId);
      if (checkpoint !== undefined) checkpoint.acceptedRevision = revision;
    }
    if (revision === this.#revision + 1) this.#revision = revision;
    const completed = this.#takePendingMutation(messageId);
    if (completed !== undefined) this.#completeAcceptedMutation(completed, revision);
  }

  #beginResync(reason: string): void {
    this.#prepareForRecovery('snapshot_conflict');
    this.#readyToSend = false;
    this.#maySeedEmptyRoom = false;
    this.#receivedSnapshotInSync = false;
    this.#allowAuthoritativeRollback = reason === 'replay_unavailable';
    this.#transition('syncing');
    this.#emitError({
      code: reason,
      message: 'The collaboration session requires state resynchronization.',
      recoverable: true,
    });
    // replay_unavailable is followed immediately by the relay's full-state push.
    // Sending another resume here duplicates that cycle and can loop indefinitely.
    if (reason !== 'replay_unavailable') {
      this.#send({ type: 'resume', afterRevision: this.#revision });
    }
  }

  #requestResume(reason: string): void {
    this.#prepareForRecovery('snapshot_conflict');
    this.#readyToSend = false;
    this.#maySeedEmptyRoom = false;
    this.#receivedSnapshotInSync = false;
    this.#allowAuthoritativeRollback = false;
    this.#transition('syncing');
    this.#emitError({
      code: reason,
      message: 'An out-of-order collaboration message triggered replay recovery.',
      recoverable: true,
    });
    this.#send({ type: 'resume', afterRevision: this.#revision });
  }

  #rejectInFlight(messageType: string, code: string): void {
    const rejected = this.#inFlight;
    if (rejected === null || rejected.kind !== messageType) {
      this.#emitError({
        code: 'unexpected_policy_rejection',
        message: 'A policy rejection without a matching mutation was ignored.',
        recoverable: true,
        details: { code, messageType },
      });
      return;
    }
    this.#inFlight = null;
    this.#pendingBytes = Math.max(0, this.#pendingBytes - rejected.bytes);
    this.#rejectCheckpoint(rejected.id, code);
    this.#emitError({
      code,
      message: 'The collaboration server rejected a local mutation.',
      recoverable: false,
      details: rejected,
    });
    this.#sendNext();
  }

  #receivePresence(
    message: Extract<CollabMessage<TSnapshot, TDelta>, { type: 'presence' }>,
  ): void {
    const base: PresenceEvent = {
      actorId: message.user.actorId,
      status: message.presence?.status ?? 'online',
      updatedAt: message.presence?.updatedAt ?? this.#now(),
    };
    const presence: PresenceEvent = {
      ...base,
      ...(message.presence ?? {}),
      actorId: message.user.actorId,
    };
    if (presence.displayName === undefined && message.user.displayName !== undefined) {
      presence.displayName = message.user.displayName;
    }
    if (presence.color === undefined && message.user.color !== undefined) {
      presence.color = message.user.color;
    }
    for (const handler of this.#presenceHandlers) {
      try {
        handler(presence);
      } catch (error) {
        this.#emitError({
          code: 'presence_handler_failed',
          message: 'A collaboration presence handler failed.',
          recoverable: true,
          details: error,
        });
      }
    }
  }

  #prepareEmptyRoomSeed(): void {
    let latestSnapshotIndex = -1;
    for (let index = this.#queue.length - 1; index >= 0; index -= 1) {
      if (this.#queue[index]?.kind === 'snapshot') {
        latestSnapshotIndex = index;
        break;
      }
    }
    if (latestSnapshotIndex >= 0) {
      const represented = this.#queue.splice(0, latestSnapshotIndex);
      for (const mutation of represented) {
        this.#discardMutation(mutation, 'seed_snapshot_superseded');
      }
      return;
    }

    const snapshot = this.#readCheckpointSnapshot();
    if (snapshot === undefined) return;
    const represented = this.#queue.splice(0);
    for (const mutation of represented) this.#discardMutation(mutation);
    this.#prepend({
      kind: 'snapshot',
      id: this.#nextMessageId('snapshot'),
      snapshot,
      bytes: estimateJsonBytes(snapshot),
    });
  }

  #prepareForRemoteSnapshot(): Array<Extract<QueuedMutation<TSnapshot, TDelta>, { kind: 'delta' }>> {
    if (this.#inFlight?.kind === 'delta') {
      this.#queue.unshift(this.#inFlight);
    } else if (this.#inFlight?.kind === 'snapshot') {
      this.#discardMutation(this.#inFlight, 'snapshot_conflict');
    }
    this.#inFlight = null;

    const pendingDeltas: Array<Extract<QueuedMutation<TSnapshot, TDelta>, { kind: 'delta' }>> = [];
    const retained: QueuedMutation<TSnapshot, TDelta>[] = [];
    for (const mutation of this.#queue) {
      if (mutation.kind === 'snapshot') {
        this.#discardMutation(mutation, 'snapshot_conflict');
      } else {
        retained.push(mutation);
        pendingDeltas.push(mutation);
      }
    }
    this.#queue = retained;
    return pendingDeltas;
  }

  #prepareForRecovery(snapshotReason: string): void {
    if (this.#inFlight?.kind === 'delta') {
      this.#queue.unshift(this.#inFlight);
    } else if (this.#inFlight?.kind === 'snapshot') {
      this.#discardMutation(this.#inFlight, snapshotReason);
    }
    this.#inFlight = null;
    const retained: QueuedMutation<TSnapshot, TDelta>[] = [];
    for (const mutation of this.#queue) {
      if (mutation.kind === 'snapshot') this.#discardMutation(mutation, snapshotReason);
      else retained.push(mutation);
    }
    this.#queue = retained;
  }

  #discardMutation(mutation: QueuedMutation<TSnapshot, TDelta>, reason?: string): void {
    this.#pendingBytes = Math.max(0, this.#pendingBytes - mutation.bytes);
    if (mutation.kind === 'snapshot' && reason !== undefined) {
      this.#rejectCheckpoint(mutation.id, reason);
    }
  }

  #findPendingMutation(id: string): QueuedMutation<TSnapshot, TDelta> | undefined {
    if (this.#inFlight?.id === id) return this.#inFlight;
    return this.#queue.find(mutation => mutation.id === id);
  }

  #takePendingMutation(id: string): QueuedMutation<TSnapshot, TDelta> | undefined {
    if (this.#inFlight?.id === id) {
      const mutation = this.#inFlight;
      this.#inFlight = null;
      this.#pendingBytes = Math.max(0, this.#pendingBytes - mutation.bytes);
      return mutation;
    }
    const index = this.#queue.findIndex(mutation => mutation.id === id);
    if (index < 0) return undefined;
    const [mutation] = this.#queue.splice(index, 1);
    if (mutation !== undefined) {
      this.#pendingBytes = Math.max(0, this.#pendingBytes - mutation.bytes);
    }
    return mutation;
  }

  #acceptedMutation(id: string): AcceptedMutation<TSnapshot, TDelta> | undefined {
    return this.#acceptedMutations.find(entry => entry.mutation.id === id);
  }

  #completeAcceptedMutation(
    mutation: QueuedMutation<TSnapshot, TDelta>,
    revision: number,
  ): void {
    if (revision > this.#persistedRevision) {
      if (mutation.kind === 'snapshot') {
        // A full snapshot supersedes earlier local mutations for rollback recovery.
        this.#acceptedMutations = [];
      }
      this.#acceptedMutations.push({ mutation, revision });
    }
    this.#resolvePersistedCheckpoints();
    this.#sendNext();
  }

  #requeueAcceptedMutationsAfter(
    revision: number,
  ): QueuedMutation<TSnapshot, TDelta>[] {
    const retained: AcceptedMutation<TSnapshot, TDelta>[] = [];
    const replay: QueuedMutation<TSnapshot, TDelta>[] = [];
    for (const entry of this.#acceptedMutations) {
      if (entry.revision > revision) replay.push(entry.mutation);
      else retained.push(entry);
    }
    this.#acceptedMutations = retained;
    if (replay.length === 0) return replay;
    for (const mutation of replay) {
      this.#pendingBytes += mutation.bytes;
      if (mutation.kind === 'snapshot') {
        const waiter = this.#checkpointWaiters.get(mutation.id);
        if (waiter !== undefined) delete waiter.acceptedRevision;
      }
    }
    this.#queue = [...replay, ...this.#queue];
    return replay;
  }

  #notifyDeltaHandlers(delta: TDelta, meta: DeltaMeta): void {
    for (const handler of this.#deltaHandlers) {
      try {
        handler(delta, meta);
      } catch (error) {
        this.#emitError({
          code: 'delta_handler_failed',
          message: 'A collaboration delta handler failed.',
          recoverable: true,
          details: error,
        });
      }
    }
  }

  #notifySnapshotHandlers(snapshot: TSnapshot): void {
    for (const handler of this.#snapshotHandlers) {
      try {
        handler(snapshot);
      } catch (error) {
        this.#emitError({
          code: 'snapshot_handler_failed',
          message: 'A collaboration snapshot handler failed.',
          recoverable: true,
          details: error,
        });
      }
    }
  }

  #completeHandshake(): void {
    const handshake = this.#handshake;
    if (handshake === null || handshake.socket !== this.#socket) return;
    this.#handshake = null;
    handshake.resolve();
  }

  #resolveConnectWaiter(): void {
    const resolve = this.#resolveConnect;
    this.#connectPromise = null;
    this.#resolveConnect = null;
    this.#rejectConnect = null;
    resolve?.();
  }

  #rejectConnectWaiter(error: Error): void {
    const reject = this.#rejectConnect;
    this.#connectPromise = null;
    this.#resolveConnect = null;
    this.#rejectConnect = null;
    reject?.(error);
  }

  #removeQueuedMutation(id: string): boolean {
    const index = this.#queue.findIndex((mutation) => mutation.id === id);
    if (index < 0) return false;
    const [removed] = this.#queue.splice(index, 1);
    if (removed !== undefined) {
      this.#pendingBytes = Math.max(0, this.#pendingBytes - removed.bytes);
    }
    return true;
  }

  #readCheckpointSnapshot(): TSnapshot | undefined {
    try {
      return this.#snapshotProvider?.();
    } catch (error) {
      this.#emitError({
        code: 'snapshot_provider_failed',
        message: 'The collaboration snapshot provider failed.',
        recoverable: true,
        details: error,
      });
      return undefined;
    }
  }

  #setPersistedRevision(revision: number): void {
    const next = Math.max(this.#persistedRevision, revision);
    if (next === this.#persistedRevision) return;
    this.#persistedRevision = next;
    this.#acceptedMutations = this.#acceptedMutations.filter(entry => entry.revision > next);
    const handlers = [
      ...(this.#options.onPersistedRevisionChange
        ? [this.#options.onPersistedRevisionChange]
        : []),
      ...this.#persistedRevisionHandlers,
    ];
    for (const handler of handlers) {
      try {
        handler(next);
      } catch (error) {
        this.#emitError({
          code: 'persisted_revision_handler_failed',
          message: 'A collaboration persistence observer failed.',
          recoverable: true,
          details: error,
        });
      }
    }
  }

  #resolvePersistedCheckpoints(): void {
    for (const [id, waiter] of this.#checkpointWaiters) {
      if (waiter.acceptedRevision === undefined
          || waiter.acceptedRevision > this.#persistedRevision) continue;
      clearTimeout(waiter.timer);
      this.#checkpointWaiters.delete(id);
      waiter.resolve(waiter.acceptedRevision);
    }
  }

  #rejectCheckpoint(id: string, reason: string): void {
    const waiter = this.#checkpointWaiters.get(id);
    if (waiter === undefined) return;
    clearTimeout(waiter.timer);
    this.#checkpointWaiters.delete(id);
    waiter.reject(new Error(`Collaboration checkpoint rejected: ${reason}.`));
  }

  #rejectCheckpoints(message: string): void {
    for (const [id, waiter] of this.#checkpointWaiters) {
      clearTimeout(waiter.timer);
      this.#checkpointWaiters.delete(id);
      waiter.reject(new Error(message));
    }
  }

  #transition(state: CollaborationConnectionState): void {
    if (this.#state === state) return;
    this.#state = state;
    const handlers = [
      ...(this.#options.onStateChange ? [this.#options.onStateChange] : []),
      ...this.#stateHandlers,
    ];
    for (const handler of handlers) {
      try {
        handler(state);
      } catch (error) {
        this.#emitError({
          code: 'state_handler_failed',
          message: 'A collaboration state observer failed.',
          recoverable: true,
          details: error,
        });
      }
    }
  }

  #emitError(error: CollaborationProtocolError): void {
    const handlers = [
      ...(this.#options.onError ? [this.#options.onError] : []),
      ...this.#errorHandlers,
    ];
    for (const handler of handlers) {
      try {
        handler(error);
      } catch {
        // Error observers are a terminal reporting boundary and must never recurse
        // into, or interrupt, the collaboration state machine.
      }
    }
  }

  #nextMessageId(kind: 'delta' | 'snapshot'): string {
    const custom = this.#options.createMessageId?.(kind);
    if (custom !== undefined && custom.length > 0) return custom;
    this.#messageSequence += 1;
    return `${kind}:${this.#now().toString(36)}:${this.#messageSequence.toString(36)}`;
  }

  #now(): number {
    return this.#options.now?.() ?? Date.now();
  }
}

export function createCollaborationWebSocketTransport<TSnapshot, TDelta>(
  options: CollaborationWebSocketTransportOptions<TSnapshot, TDelta>,
): WebSocketCollaborationTransport<TSnapshot, TDelta> {
  return new WebSocketCollaborationTransport(options);
}

function defaultSocketFactory(url: string): CollaborationWebSocketLike {
  return new WebSocket(url) as unknown as CollaborationWebSocketLike;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCollaborationMessage(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'hello':
      return isNonEmptyString(value.sessionId)
        && isNonEmptyString(value.connectionId)
        && isRevision(value.currentRevision)
        && isRevision(value.oldestAvailableRevision)
        && isPositiveFiniteNumber(value.heartbeatIntervalMs)
        && isPositiveFiniteNumber(value.maxPayloadBytes);
    case 'presence':
      return isNonEmptyString(value.sessionId)
        && isPresenceUser(value.user)
        && (value.presence === undefined || isPresenceEvent(value.presence));
    case 'delta':
      return isNonEmptyString(value.sessionId)
        && isKleinToolKey(value.toolKey)
        && isNonEmptyString(value.deltaId)
        && isRevision(value.baseRevision)
        && (value.revision === undefined || isRevision(value.revision))
        && Object.hasOwn(value, 'delta')
        && (value.meta === undefined || isDeltaMeta(value.meta));
    case 'snapshot':
      return isNonEmptyString(value.sessionId)
        && isKleinToolKey(value.toolKey)
        && (value.snapshotId === undefined || isNonEmptyString(value.snapshotId))
        && (value.baseRevision === undefined || isRevision(value.baseRevision))
        && (value.revision === undefined || isRevision(value.revision))
        && Object.hasOwn(value, 'snapshot');
    case 'ack':
      return isMutationKind(value.messageType)
        && isNonEmptyString(value.messageId)
        && isRevision(value.revision);
    case 'persisted':
      return isNonEmptyString(value.sessionId) && isRevision(value.revision);
    case 'resume':
      return isRevision(value.afterRevision);
    case 'resume-complete':
      return isNonEmptyString(value.sessionId) && isRevision(value.revision);
    case 'resync-required':
      return isNonEmptyString(value.sessionId)
        && isNonEmptyString(value.reason)
        && isRevision(value.currentRevision)
        && isRevision(value.oldestAvailableRevision);
    case 'policy-rejected':
      return isMutationKind(value.messageType) && isNonEmptyString(value.code);
    case 'classroom-event':
    case 'exam-event':
      return isNonEmptyString(value.sessionId) && Object.hasOwn(value, 'event');
    case 'error':
      return (value.sessionId === undefined || isNonEmptyString(value.sessionId))
        && isNonEmptyString(value.code)
        && typeof value.message === 'string';
    default:
      return false;
  }
}

function isDeltaMeta(value: unknown): value is DeltaMeta {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.id)
    && (value.actorId === undefined || isNonEmptyString(value.actorId))
    && typeof value.createdAt === 'number'
    && Number.isFinite(value.createdAt)
    && (value.source === 'local'
      || value.source === 'remote'
      || value.source === 'history'
      || value.source === 'import');
}

function isPresenceUser(value: unknown): boolean {
  return isRecord(value)
    && isNonEmptyString(value.actorId)
    && (value.displayName === undefined || typeof value.displayName === 'string')
    && (value.color === undefined || typeof value.color === 'string');
}

function isPresenceEvent(value: unknown): boolean {
  if (!isRecord(value)
      || !isNonEmptyString(value.actorId)
      || (value.status !== 'online' && value.status !== 'offline' && value.status !== 'idle')) {
    return false;
  }
  if (value.displayName !== undefined && typeof value.displayName !== 'string') return false;
  if (value.color !== undefined && typeof value.color !== 'string') return false;
  if (value.tool !== undefined && typeof value.tool !== 'string') return false;
  if (value.updatedAt !== undefined
      && (typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt))) return false;
  if (value.cursor !== undefined && !isVector2(value.cursor)) return false;
  if (value.selection !== undefined && !isSelection(value.selection)) return false;
  return true;
}

function isVector2(value: unknown): boolean {
  return isRecord(value)
    && typeof value.x === 'number'
    && Number.isFinite(value.x)
    && typeof value.y === 'number'
    && Number.isFinite(value.y);
}

function isSelection(value: unknown): boolean {
  return Array.isArray(value) && value.every(item => (
    isRecord(item) && isNonEmptyString(item.kind) && isNonEmptyString(item.id)
  ));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isKleinToolKey(value: unknown): value is KleinToolKey {
  return typeof value === 'string' && KLEIN_TOOL_KEYS.has(value as KleinToolKey);
}

function isMutationKind(value: unknown): value is QueuedMutation<unknown, unknown>['kind'] {
  return value === 'delta' || value === 'snapshot';
}

function collaborationMessageSessionId(
  message: CollabMessage<unknown, unknown>,
): string | undefined {
  return 'sessionId' in message && typeof message.sessionId === 'string'
    ? message.sessionId
    : undefined;
}

function isTerminalClose(event: { code?: number; reason?: string }): boolean {
  if (event.code !== undefined && TERMINAL_CLOSE_CODES.has(event.code)) return true;
  return /unauthori[sz]ed|forbidden|invalid[_ -]?token|authentication/i.test(event.reason ?? '');
}

function closeFailure(
  event: { code?: number; reason?: string },
  terminalByPolicy: boolean,
): CollaborationConnectionFailure {
  const unauthorized = isTerminalClose(event);
  const code = unauthorized ? 'unauthorized' : 'connect_failed';
  const reason = event.reason ? `: ${event.reason}` : '';
  const message = unauthorized
    ? `The collaboration server rejected authorization${reason}.`
    : `The collaboration socket closed before synchronization completed (${event.code ?? 0})${reason}.`;
  return new CollaborationConnectionFailure(code, message, unauthorized || terminalByPolicy);
}

function connectionFailure(error: unknown, terminalByPolicy: boolean): CollaborationConnectionFailure {
  if (error instanceof CollaborationConnectionFailure) {
    if (error.terminal || !terminalByPolicy) return error;
    return new CollaborationConnectionFailure(error.code, error.message, true);
  }
  const message = error instanceof Error
    ? `The collaboration connection attempt failed: ${error.message}`
    : 'The collaboration connection attempt failed.';
  return new CollaborationConnectionFailure('connect_failed', message, terminalByPolicy);
}

function presenceUser(presence: PresenceEvent) {
  const user: { actorId: string; displayName?: string; color?: string } = {
    actorId: presence.actorId,
  };
  if (presence.displayName !== undefined) user.displayName = presence.displayName;
  if (presence.color !== undefined) user.color = presence.color;
  return user;
}

function normalizeRemoteMeta(
  meta: DeltaMeta | undefined,
  id: string,
  now: number,
): DeltaMeta {
  const normalized: DeltaMeta = {
    id,
    createdAt: meta?.createdAt ?? now,
    source: 'remote',
  };
  if (meta?.actorId !== undefined) normalized.actorId = meta.actorId;
  return normalized;
}

function estimateJsonBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}
