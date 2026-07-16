import type { DeltaMeta, KleinToolKey } from '../core/index.js';
import type {
  CollabMessage,
  CollaborationTransport,
  PresenceEvent,
} from './index.js';

const SOCKET_OPEN = 1;

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
  | { kind: 'delta'; id: string; delta: TDelta; meta: DeltaMeta; reapplyAfterSnapshot: boolean; bytes: number }
  | { kind: 'snapshot'; id: string; snapshot: TSnapshot; bytes: number };

interface CheckpointWaiter {
  acceptedRevision?: number;
  resolve: (revision: number) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
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

/** Parses the collaboration envelope shape; tool-specific snapshot/delta validation remains host-owned. */
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
  if (!isRecord(parsed) || typeof parsed.type !== 'string') return null;
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
  #socket: CollaborationWebSocketLike | null = null;
  #state: CollaborationConnectionState = 'idle';
  #revision: number;
  #persistedRevision: number;
  #queue: QueuedMutation<TSnapshot, TDelta>[] = [];
  #inFlight: QueuedMutation<TSnapshot, TDelta> | null = null;
  #pendingBytes = 0;
  #deltaHandlers = new Set<(delta: TDelta, meta: DeltaMeta) => void>();
  #snapshotHandlers = new Set<(snapshot: TSnapshot) => void>();
  #presenceHandlers = new Set<(presence: PresenceEvent) => void>();
  #stateHandlers = new Set<(state: CollaborationConnectionState) => void>();
  #errorHandlers = new Set<(error: CollaborationProtocolError) => void>();
  #persistedRevisionHandlers = new Set<(revision: number) => void>();
  #checkpointWaiters = new Map<string, CheckpointWaiter>();
  #connectPromise: Promise<void> | null = null;
  #manualClose = false;
  #readyToSend = false;
  #reconnectAttempt = 0;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #messageSequence = 0;
  #helloRevision: number | null = null;
  #receivedSnapshotInSync = false;
  #deltasSinceCheckpoint = 0;

  constructor(options: CollaborationWebSocketTransportOptions<TSnapshot, TDelta>) {
    this.#options = options;
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

  async connect(): Promise<void> {
    if (this.#state === 'connected' || this.#state === 'syncing') return;
    if (this.#connectPromise !== null) return this.#connectPromise;
    this.#manualClose = false;
    this.#transition(this.#reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
    this.#connectPromise = this.#openSocket();
    try {
      await this.#connectPromise;
    } catch (error) {
      this.#emitError({
        code: 'connect_failed',
        message: 'The collaboration connection attempt failed.',
        recoverable: this.#options.autoReconnect !== false,
        details: error,
      });
      if (!this.#manualClose && this.#options.autoReconnect !== false) {
        this.#transition('reconnecting');
        this.#scheduleReconnect({ reason: 'connect_failed' });
      } else {
        this.#transition('closed');
      }
    } finally {
      this.#connectPromise = null;
    }
  }

  disconnect(): void {
    this.#manualClose = true;
    this.#readyToSend = false;
    if (this.#reconnectTimer !== null) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    const socket = this.#socket;
    this.#socket = null;
    if (socket !== null) socket.close(1000, 'client_disconnect');
    this.#rejectCheckpoints('Collaboration transport disconnected before persistence completed.');
    this.#queue = [];
    this.#inFlight = null;
    this.#pendingBytes = 0;
    this.#transition('closed');
  }

  sendDelta(delta: TDelta, meta: DeltaMeta): void {
    const queued = this.#enqueue({
      kind: 'delta',
      id: meta.id || this.#nextMessageId('delta'),
      delta,
      meta,
      reapplyAfterSnapshot: false,
      bytes: estimateJsonBytes(delta),
    });
    if (!queued) return;
    const checkpointEvery = Math.max(0, this.#options.checkpointEveryDeltas ?? 0);
    if (this.#options.snapshotProvider !== undefined && checkpointEvery > 0) {
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

  async #openSocket(): Promise<void> {
    const url = await this.#options.createUrl(
      this.#revision > 0 ? this.#revision : undefined,
    );
    if (this.#manualClose) return;
    const createSocket = this.#options.createSocket ?? defaultSocketFactory;
    const socket = createSocket(url);
    this.#socket = socket;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      socket.onopen = () => {
        settled = true;
        this.#transition('syncing');
        resolve();
      };
      socket.onmessage = (event) => this.#receive(event.data);
      socket.onerror = (event) => {
        this.#emitError({
          code: 'socket_error',
          message: 'The collaboration socket reported a transport error.',
          recoverable: true,
          details: event,
        });
      };
      socket.onclose = (event) => {
        if (!settled) {
          settled = true;
          reject(new Error(`Collaboration socket closed before opening (${event.code ?? 0}).`));
        }
        this.#handleClose(socket, event);
      };
    });
  }

  #handleClose(
    socket: CollaborationWebSocketLike,
    event: { code?: number; reason?: string },
  ): void {
    if (this.#socket !== socket) return;
    this.#socket = null;
    this.#readyToSend = false;
    if (this.#inFlight !== null) {
      this.#queue.unshift(this.#inFlight);
      this.#inFlight = null;
    }
    if (this.#manualClose || this.#options.autoReconnect === false) {
      this.#transition('closed');
      return;
    }
    this.#transition('reconnecting');
    this.#scheduleReconnect(event);
  }

  #scheduleReconnect(event: { code?: number; reason?: string }): void {
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
      void this.connect().catch((error: unknown) => {
        this.#emitError({
          code: 'reconnect_failed',
          message: 'The collaboration reconnect attempt failed.',
          recoverable: true,
          details: error,
        });
        this.#scheduleReconnect(event);
      });
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
      if (next.reapplyAfterSnapshot) {
        const replayMeta: DeltaMeta = {
          ...next.meta,
          source: 'history',
        };
        for (const handler of this.#deltaHandlers) handler(next.delta, replayMeta);
        next.reapplyAfterSnapshot = false;
      }
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
    switch (message.type) {
      case 'hello':
        this.#helloRevision = message.currentRevision;
        this.#setPersistedRevision(message.currentRevision);
        this.#receivedSnapshotInSync = false;
        this.#transition('syncing');
        break;
      case 'delta':
        this.#receiveDelta(message);
        break;
      case 'snapshot':
        this.#receiveSnapshot(message);
        break;
      case 'ack':
        this.#receiveAck(message.messageId, message.revision);
        break;
      case 'persisted':
        this.#setPersistedRevision(message.revision);
        this.#resolvePersistedCheckpoints();
        break;
      case 'resume-complete':
        this.#revision = Math.max(this.#revision, message.revision);
        this.#readyToSend = true;
        if (this.#helloRevision === 0
            && !this.#receivedSnapshotInSync
            && this.#options.snapshotProvider !== undefined
            && !this.#hasQueuedSnapshot()) {
          const snapshot = this.#readCheckpointSnapshot();
          if (snapshot !== undefined) {
            this.#prepend({
              kind: 'snapshot',
              id: this.#nextMessageId('snapshot'),
              snapshot,
              bytes: estimateJsonBytes(snapshot),
            });
          }
        }
        this.#reconnectAttempt = 0;
        this.#transition('connected');
        this.#sendNext();
        break;
      case 'resync-required':
        this.#beginResync(message.reason);
        break;
      case 'policy-rejected':
        this.#rejectInFlight(message.code);
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
      default:
        break;
    }
  }

  #receiveDelta(
    message: Extract<CollabMessage<TSnapshot, TDelta>, { type: 'delta' }>,
  ): void {
    if (message.toolKey !== this.toolKey || message.revision === undefined) return;
    if (message.baseRevision !== this.#revision || message.revision !== this.#revision + 1) {
      this.#requestResume('out_of_order_delta');
      return;
    }
    this.#revision = message.revision;
    if (this.#removeOwnMutation(message.deltaId)) return;
    const meta = normalizeRemoteMeta(message.meta, message.deltaId, this.#now());
    for (const handler of this.#deltaHandlers) handler(message.delta, meta);
  }

  #receiveSnapshot(
    message: Extract<CollabMessage<TSnapshot, TDelta>, { type: 'snapshot' }>,
  ): void {
    if (message.toolKey !== this.toolKey || message.revision === undefined) return;
    this.#revision = message.revision;
    this.#receivedSnapshotInSync = true;
    for (const mutation of this.#queue) {
      if (mutation.kind === 'delta') mutation.reapplyAfterSnapshot = true;
    }
    if (message.snapshotId !== undefined) {
      const checkpoint = this.#checkpointWaiters.get(message.snapshotId);
      if (checkpoint !== undefined) checkpoint.acceptedRevision = message.revision;
      if (this.#removeOwnMutation(message.snapshotId)) {
        this.#resolvePersistedCheckpoints();
        return;
      }
    }
    for (const handler of this.#snapshotHandlers) handler(message.snapshot);
  }

  #receiveAck(messageId: string, revision: number): void {
    const checkpoint = this.#checkpointWaiters.get(messageId);
    if (checkpoint !== undefined) checkpoint.acceptedRevision = revision;
    if (this.#inFlight?.id !== messageId) {
      this.#removeQueuedMutation(messageId);
      this.#revision = Math.max(this.#revision, revision);
      this.#resolvePersistedCheckpoints();
      return;
    }
    this.#revision = Math.max(this.#revision, revision);
    this.#pendingBytes = Math.max(0, this.#pendingBytes - this.#inFlight.bytes);
    this.#inFlight = null;
    this.#resolvePersistedCheckpoints();
    this.#sendNext();
  }

  #beginResync(reason: string): void {
    this.#readyToSend = false;
    if (this.#inFlight?.kind === 'delta') {
      this.#queue.unshift(this.#inFlight);
    } else if (this.#inFlight?.kind === 'snapshot') {
      this.#pendingBytes = Math.max(0, this.#pendingBytes - this.#inFlight.bytes);
      this.#rejectCheckpoint(this.#inFlight.id, 'snapshot_conflict');
      this.#emitError({
        code: 'snapshot_conflict',
        message: 'A stale local snapshot was dropped during resynchronization.',
        recoverable: true,
      });
    }
    this.#inFlight = null;
    this.#transition('syncing');
    this.#emitError({
      code: reason,
      message: 'The collaboration session requires state resynchronization.',
      recoverable: true,
    });
    if (reason === 'stale_base_revision' || reason === 'out_of_order_delta') {
      this.#send({ type: 'resume', afterRevision: this.#revision });
    }
  }

  #requestResume(reason: string): void {
    if (this.#inFlight?.kind === 'delta') {
      this.#queue.unshift(this.#inFlight);
    } else if (this.#inFlight?.kind === 'snapshot') {
      this.#pendingBytes = Math.max(0, this.#pendingBytes - this.#inFlight.bytes);
      this.#rejectCheckpoint(this.#inFlight.id, 'snapshot_conflict');
      this.#emitError({
        code: 'snapshot_conflict',
        message: 'An out-of-order local snapshot was dropped during replay recovery.',
        recoverable: true,
      });
    }
    this.#inFlight = null;
    this.#readyToSend = false;
    this.#transition('syncing');
    this.#emitError({
      code: reason,
      message: 'An out-of-order collaboration message triggered replay recovery.',
      recoverable: true,
    });
    this.#send({ type: 'resume', afterRevision: this.#revision });
  }

  #rejectInFlight(code: string): void {
    const rejected = this.#inFlight;
    this.#inFlight = null;
    if (rejected !== null) {
      this.#pendingBytes = Math.max(0, this.#pendingBytes - rejected.bytes);
      this.#rejectCheckpoint(rejected.id, code);
    }
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
    for (const handler of this.#presenceHandlers) handler(presence);
  }

  #removeOwnMutation(id: string): boolean {
    if (this.#inFlight?.id === id) {
      this.#pendingBytes = Math.max(0, this.#pendingBytes - this.#inFlight.bytes);
      this.#inFlight = null;
      this.#sendNext();
      return true;
    }
    return this.#removeQueuedMutation(id);
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

  #hasQueuedSnapshot(): boolean {
    return this.#inFlight?.kind === 'snapshot'
      || this.#queue.some((mutation) => mutation.kind === 'snapshot');
  }

  #readCheckpointSnapshot(): TSnapshot | undefined {
    try {
      return this.#options.snapshotProvider?.();
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
    this.#options.onPersistedRevisionChange?.(next);
    for (const handler of this.#persistedRevisionHandlers) handler(next);
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
    this.#options.onStateChange?.(state);
    for (const handler of this.#stateHandlers) handler(state);
  }

  #emitError(error: CollaborationProtocolError): void {
    this.#options.onError?.(error);
    for (const handler of this.#errorHandlers) handler(error);
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
