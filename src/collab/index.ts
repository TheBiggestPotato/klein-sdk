import { KleinSdkError } from '../core/index.js';
import type {
  DeltaMeta,
  JsonValue,
  KleinInstrument,
  KleinToolKey,
  KleinToolRuntime,
  Vector2,
} from '../core/index.js';

/** Selection item mirrored through collaboration presence. */
export interface CollaborationSelectionItem {
  kind: string;
  id: string;
}

/** Cursor state used by classroom/team sessions. Coordinates are host-defined canvas or world units. */
export interface CollaborativeCursor {
  actorId: string;
  displayName?: string;
  color?: string;
  position?: Vector2;
  tool?: string;
  selection?: CollaborationSelectionItem[];
  updatedAt: number;
}

/** Optional presence payload for cursors and participant status. It is not persisted scene content. */
export interface PresenceEvent {
  actorId: string;
  displayName?: string;
  color?: string;
  cursor?: { x: number; y: number };
  tool?: string;
  selection?: CollaborationSelectionItem[];
  status: 'online' | 'offline' | 'idle';
  updatedAt?: number;
}

export interface PresenceUser {
  actorId: string;
  displayName?: string;
  color?: string;
}

export type CollabMessage<TSnapshot = unknown, TDelta = unknown> =
  | { type: 'hello'; sessionId: string; connectionId: string; currentRevision: number; oldestAvailableRevision: number; heartbeatIntervalMs: number; maxPayloadBytes: number }
  | { type: 'presence'; sessionId: string; user: PresenceUser; presence?: PresenceEvent }
  | { type: 'delta'; sessionId: string; toolKey: KleinToolKey; deltaId: string; baseRevision: number; revision?: number; delta: TDelta; meta?: DeltaMeta }
  | { type: 'snapshot'; sessionId: string; toolKey: KleinToolKey; snapshotId?: string; baseRevision?: number; revision?: number; snapshot: TSnapshot }
  | { type: 'ack'; messageType: string; messageId: string; revision: number }
  | { type: 'persisted'; sessionId: string; revision: number }
  | { type: 'resume'; afterRevision: number }
  | { type: 'resume-complete'; sessionId: string; revision: number }
  | { type: 'resync-required'; sessionId: string; reason: string; currentRevision: number; oldestAvailableRevision: number }
  | { type: 'policy-rejected'; messageType: string; code: string }
  | { type: 'classroom-event'; sessionId: string; event: JsonValue }
  | { type: 'exam-event'; sessionId: string; event: JsonValue }
  | { type: 'error'; sessionId?: string; code: string; message: string; details?: JsonValue };

export interface CreateDeltaMessageInput<TDelta> {
  sessionId: string;
  toolKey: KleinToolKey;
  deltaId: string;
  baseRevision: number;
  delta: TDelta;
  meta?: DeltaMeta;
}

export function createDeltaMessage<TDelta>(
  input: CreateDeltaMessageInput<TDelta>,
): CollabMessage<unknown, TDelta> {
  const message: CollabMessage<unknown, TDelta> = {
    type: 'delta',
    sessionId: input.sessionId,
    toolKey: input.toolKey,
    deltaId: input.deltaId,
    baseRevision: input.baseRevision,
    delta: input.delta,
  };
  if (input.meta !== undefined) message.meta = input.meta;
  return message;
}

export function isDeltaMessage<TSnapshot, TDelta>(
  message: CollabMessage<TSnapshot, TDelta>,
): message is Extract<CollabMessage<TSnapshot, TDelta>, { type: 'delta' }> {
  return message.type === 'delta';
}

/** Host-provided transport contract for snapshots, deltas, and optional presence. */
export interface CollaborationTransport<TSnapshot, TDelta> {
  connect(): Promise<void>;
  disconnect(): void;
  sendDelta(delta: TDelta, meta: DeltaMeta): void;
  sendSnapshot(snapshot: TSnapshot): void;
  sendPresence?(presence: PresenceEvent): void;
  onDelta(handler: (delta: TDelta, meta: DeltaMeta) => void): () => void;
  onSnapshot(handler: (snapshot: TSnapshot) => void): () => void;
  onPresence?(handler: (presence: PresenceEvent) => void): () => void;
  /** Registers a fresh snapshot source for transports that support peer-initiated synchronization. */
  setSnapshotProvider?(provider: () => TSnapshot): () => void;
  /** Pulls the authoritative room snapshot into this peer without publishing local state. */
  requestSnapshot?(): boolean;
}

export {
  WebSocketCollaborationTransport,
  createCollaborationWebSocketTransport,
  createCollaborationWebSocketUrl,
  parseCollaborationMessage,
} from './websocket.js';
export type {
  CollaborationConnectionState,
  CollaborationProtocolError,
  CollaborationSocketFactory,
  CollaborationWebSocketLike,
  CollaborationWebSocketTransportOptions,
  CreateCollaborationWebSocketUrlInput,
  ReconnectPolicy,
} from './websocket.js';

/** Handle returned after binding an instrument to a transport. */
export interface CollaborationBinding {
  readonly ready: Promise<void>;
  /** Requests authoritative state from transports that implement safe pull synchronization. */
  requestSync(): boolean;
  disconnect(): void;
}

/** Inputs for connecting a host transport to a framework-independent SDK instrument. */
export interface CollaborationOptions<TSnapshot, TDelta> {
  instrument: KleinInstrument<TSnapshot, TDelta>;
  transport: CollaborationTransport<TSnapshot, TDelta>;
  onPresence?: (presence: PresenceEvent) => void;
  onError?: (error: KleinSdkError) => void;
}

/** Inputs for connecting a shared tool runtime to a collaboration transport. */
export interface RuntimeCollaborationOptions<TSnapshot, TDelta, TCommand> {
  runtime: KleinToolRuntime<TSnapshot, TDelta, TCommand>;
  transport: CollaborationTransport<TSnapshot, TDelta>;
  onPresence?: (presence: PresenceEvent) => void;
  onError?: (error: KleinSdkError) => void;
}

interface CollaborationSource<TSnapshot, TDelta> {
  getSnapshot(): TSnapshot;
  loadRemoteSnapshot(snapshot: TSnapshot): void;
  applyRemoteDelta(delta: TDelta, meta: DeltaMeta): void;
  subscribeDelta(handler: (delta: TDelta, meta: DeltaMeta) => void): () => void;
}

/** Wires local and remote instrument deltas without making the instrument know about networking. */
export function bindCollaboration<TSnapshot, TDelta>(
  options: CollaborationOptions<TSnapshot, TDelta>,
): CollaborationBinding {
  const { instrument } = options;
  return bindCollaborationSource({
    getSnapshot: () => instrument.getSnapshot(),
    loadRemoteSnapshot: snapshot => instrument.loadSnapshot(snapshot, { source: 'remote' }),
    applyRemoteDelta: (delta, meta) => {
      instrument.applyDelta(delta, { emit: false, meta });
    },
    subscribeDelta: handler => instrument.subscribeDelta(handler),
  }, options.transport, options.onPresence, options.onError);
}

/** Wires a shared KleinToolRuntime to collaboration using its instrument-originated delta stream. */
export function bindRuntimeCollaboration<TSnapshot, TDelta, TCommand>(
  options: RuntimeCollaborationOptions<TSnapshot, TDelta, TCommand>,
): CollaborationBinding {
  const { runtime } = options;
  return bindCollaborationSource({
    getSnapshot: () => runtime.getSnapshot(),
    loadRemoteSnapshot: snapshot => runtime.loadSnapshot(snapshot),
    applyRemoteDelta: (delta, meta) => {
      const result = runtime.applyDelta(delta, meta);
      if (!result.ok) throw result.error;
    },
    subscribeDelta: handler => runtime.subscribeDelta(handler),
  }, options.transport, options.onPresence, options.onError);
}

function bindCollaborationSource<TSnapshot, TDelta>(
  source: CollaborationSource<TSnapshot, TDelta>,
  transport: CollaborationTransport<TSnapshot, TDelta>,
  onPresence: ((presence: PresenceEvent) => void) | undefined,
  onError: ((error: KleinSdkError) => void) | undefined,
): CollaborationBinding {
  const report = (error: unknown, code: string, message: string): void => {
    const sdkError = error instanceof KleinSdkError
      ? error
      : new KleinSdkError(code, error instanceof Error ? `${message} ${error.message}` : message);
    try {
      onError?.(sdkError);
    } catch {
      // Binding error observers cannot interrupt collaboration fan-out.
    }
  };

  const offSnapshotProvider = transport.setSnapshotProvider?.(
    () => source.getSnapshot(),
  ) ?? (() => undefined);
  const offLocalDelta = source.subscribeDelta((delta, meta) => {
    if (meta.source === 'remote') return;
    try {
      transport.sendDelta(delta, { ...meta });
    } catch (error) {
      report(error, 'collaboration_delta_send_failed', 'A local collaboration delta could not be sent.');
    }
  });
  const offDelta = transport.onDelta((delta, meta) => {
    try {
      source.applyRemoteDelta(delta, { ...meta, source: 'remote' });
    } catch (error) {
      report(error, 'collaboration_delta_apply_failed', 'A remote collaboration delta could not be applied.');
    }
  });
  const offSnapshot = transport.onSnapshot((snapshot) => {
    try {
      source.loadRemoteSnapshot(snapshot);
    } catch (error) {
      report(error, 'collaboration_snapshot_load_failed', 'A remote collaboration snapshot could not be loaded.');
    }
  });
  const offPresence = transport.onPresence && onPresence
    ? transport.onPresence((presence) => {
      try {
        onPresence(presence);
      } catch (error) {
        report(error, 'collaboration_presence_observer_failed', 'A collaboration presence observer failed.');
      }
    })
    : () => undefined;

  const ready = transport.connect();
  void ready.catch(error => report(
    error,
    'collaboration_connect_failed',
    'The collaboration transport could not connect.',
  ));

  let disconnected = false;
  return {
    ready,
    requestSync() {
      if (disconnected) return false;
      try {
        return transport.requestSnapshot?.() ?? false;
      } catch (error) {
        report(error, 'collaboration_sync_failed', 'The collaboration synchronization request failed.');
        return false;
      }
    },
    disconnect() {
      if (disconnected) return;
      disconnected = true;
      offLocalDelta();
      offDelta();
      offSnapshot();
      offPresence();
      offSnapshotProvider();
      transport.disconnect();
    },
  };
}

export type CollaborationRoomEvent<TSnapshot, TDelta> =
  | { type: 'delta'; delta: TDelta; meta: DeltaMeta }
  | { type: 'snapshot'; snapshot: TSnapshot }
  | { type: 'presence'; presence: PresenceEvent };

export interface InMemoryCollaborationTransportOptions<TSnapshot, TDelta> {
  roomId: string;
  actorId: string;
  displayName?: string;
  color?: string;
  hub?: InMemoryCollaborationHub<TSnapshot, TDelta>;
}

interface InMemoryCollaborationRoom<TSnapshot, TDelta> {
  participants: Set<InMemoryCollaborationTransport<TSnapshot, TDelta>>;
  authority: InMemoryCollaborationTransport<TSnapshot, TDelta>;
}

const inMemorySnapshotProviders = new WeakMap<object, () => unknown>();

/** In-process collaboration hub for local testing and host adapters that fan out events themselves. */
export class InMemoryCollaborationHub<TSnapshot, TDelta> {
  #rooms = new Map<string, InMemoryCollaborationRoom<TSnapshot, TDelta>>();

  join(roomId: string, transport: InMemoryCollaborationTransport<TSnapshot, TDelta>): void {
    const existing = this.#rooms.get(roomId);
    if (existing === undefined) {
      this.#rooms.set(roomId, {
        participants: new Set([transport]),
        authority: transport,
      });
      return;
    }
    if (existing.participants.has(transport)) return;
    existing.participants.add(transport);
    this.synchronize(roomId, transport);
  }

  leave(roomId: string, transport: InMemoryCollaborationTransport<TSnapshot, TDelta>): void {
    const room = this.#rooms.get(roomId);
    if (!room) return;
    room.participants.delete(transport);
    if (room.participants.size === 0) {
      this.#rooms.delete(roomId);
      return;
    }
    if (room.authority === transport) {
      room.authority = room.participants.values().next().value as InMemoryCollaborationTransport<TSnapshot, TDelta>;
    }
  }

  publish(
    roomId: string,
    source: InMemoryCollaborationTransport<TSnapshot, TDelta>,
    event: CollaborationRoomEvent<TSnapshot, TDelta>,
  ): void {
    const room = this.#rooms.get(roomId);
    if (!room) return;
    if (event.type === 'snapshot') room.authority = source;
    for (const transport of [...room.participants]) {
      if (transport === source) continue;
      try {
        transport.receive(cloneCollaborationRoomEvent(event));
      } catch {
        // One peer must not prevent delivery to the rest of the room.
      }
    }
  }

  /** Pulls a fresh snapshot from an established peer and delivers it only to the target. */
  synchronize(
    roomId: string,
    target: InMemoryCollaborationTransport<TSnapshot, TDelta>,
  ): boolean {
    const room = this.#rooms.get(roomId);
    if (!room || !room.participants.has(target)) return false;
    const candidates = [
      room.authority,
      ...[...room.participants].filter(candidate => candidate !== room.authority),
    ];
    for (const candidate of candidates) {
      if (candidate === target) continue;
      const captured = captureInMemorySnapshot<TSnapshot, TDelta>(candidate);
      if (!captured.available) continue;
      try {
        target.receive({ type: 'snapshot', snapshot: captured.snapshot });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  participantCount(roomId: string): number {
    return this.#rooms.get(roomId)?.participants.size ?? 0;
  }
}

const defaultHubs = new Map<string, InMemoryCollaborationHub<unknown, unknown>>();

/** In-process transport that satisfies the live collaboration contract without requiring a server. */
export class InMemoryCollaborationTransport<TSnapshot, TDelta>
implements CollaborationTransport<TSnapshot, TDelta> {
  readonly roomId: string;
  readonly actorId: string;
  readonly displayName?: string;
  readonly color?: string;
  #hub: InMemoryCollaborationHub<TSnapshot, TDelta>;
  #usesDefaultHub: boolean;
  #connected = false;
  #deltaHandlers = new Set<(delta: TDelta, meta: DeltaMeta) => void>();
  #snapshotHandlers = new Set<(snapshot: TSnapshot) => void>();
  #presenceHandlers = new Set<(presence: PresenceEvent) => void>();

  constructor(options: InMemoryCollaborationTransportOptions<TSnapshot, TDelta>) {
    this.roomId = options.roomId;
    this.actorId = options.actorId;
    if (options.displayName !== undefined) this.displayName = options.displayName;
    if (options.color !== undefined) this.color = options.color;
    if (options.hub !== undefined) {
      this.#hub = options.hub;
      this.#usesDefaultHub = false;
    } else {
      this.#hub = defaultHub<TSnapshot, TDelta>(options.roomId);
      this.#usesDefaultHub = true;
    }
  }

  async connect(): Promise<void> {
    if (this.#connected) return;
    this.#connected = true;
    this.#hub.join(this.roomId, this);
    this.sendPresence(this.#presence('online'));
  }

  disconnect(): void {
    if (!this.#connected) return;
    this.sendPresence(this.#presence('offline'));
    this.#hub.leave(this.roomId, this);
    this.#connected = false;
    this.#releaseDefaultHubIfEmpty();
  }

  /**
   * A default hub is module-level state shared by every transport created
   * without a hub of their own. Leaving the last participant in without
   * releasing it keeps the room alive for the next suite or host that reuses
   * the roomId — a leak that survives garbage collection. Host-provided hubs
   * are owned by whoever passed them and are never released here.
   */
  #releaseDefaultHubIfEmpty(): void {
    if (!this.#usesDefaultHub) return;
    if (this.#hub.participantCount(this.roomId) > 0) return;
    if (defaultHubs.get(this.roomId) === (this.#hub as InMemoryCollaborationHub<unknown, unknown>)) {
      defaultHubs.delete(this.roomId);
    }
  }

  sendDelta(delta: TDelta, meta: DeltaMeta): void {
    this.#publish({ type: 'delta', delta, meta });
  }

  sendSnapshot(snapshot: TSnapshot): void {
    this.#publish({ type: 'snapshot', snapshot });
  }

  sendPresence(presence: PresenceEvent): void {
    const enriched = ensurePresenceDefaults(presence, this);
    this.#publish({ type: 'presence', presence: enriched });
  }

  setSnapshotProvider(provider: () => TSnapshot): () => void {
    inMemorySnapshotProviders.set(this, provider);
    return () => {
      if (inMemorySnapshotProviders.get(this) === provider) {
        inMemorySnapshotProviders.delete(this);
      }
    };
  }

  requestSnapshot(): boolean {
    if (!this.#connected) return false;
    return this.#hub.synchronize(this.roomId, this);
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

  receive(event: CollaborationRoomEvent<TSnapshot, TDelta>): void {
    if (event.type === 'delta') {
      const remoteMeta: DeltaMeta = { ...event.meta, source: 'remote' };
      for (const handler of this.#deltaHandlers) {
        try {
          handler(structuredClone(event.delta), { ...remoteMeta });
        } catch {
          // Individual peer handlers are isolated from the room fan-out.
        }
      }
    } else if (event.type === 'snapshot') {
      for (const handler of this.#snapshotHandlers) {
        try {
          handler(structuredClone(event.snapshot));
        } catch {
          // Individual peer handlers are isolated from the room fan-out.
        }
      }
    } else {
      for (const handler of this.#presenceHandlers) {
        try {
          handler(structuredClone(event.presence));
        } catch {
          // Individual peer handlers are isolated from the room fan-out.
        }
      }
    }
  }

  #publish(event: CollaborationRoomEvent<TSnapshot, TDelta>): void {
    if (!this.#connected) void this.connect();
    this.#hub.publish(this.roomId, this, event);
  }

  #presence(status: PresenceEvent['status']): PresenceEvent {
    const presence: PresenceEvent = {
      actorId: this.actorId,
      status,
    };
    if (this.displayName !== undefined) presence.displayName = this.displayName;
    if (this.color !== undefined) presence.color = this.color;
    return presence;
  }
}

export function createInMemoryCollaborationHub<TSnapshot, TDelta>(): InMemoryCollaborationHub<TSnapshot, TDelta> {
  return new InMemoryCollaborationHub<TSnapshot, TDelta>();
}

export function createInMemoryCollaborationTransport<TSnapshot, TDelta>(
  options: InMemoryCollaborationTransportOptions<TSnapshot, TDelta>,
): InMemoryCollaborationTransport<TSnapshot, TDelta> {
  return new InMemoryCollaborationTransport<TSnapshot, TDelta>(options);
}

/** Sends a cursor update through any transport that supports presence. */
export function sendCollaborativeCursor<TSnapshot, TDelta>(
  transport: CollaborationTransport<TSnapshot, TDelta>,
  cursor: CollaborativeCursor,
): void {
  const presence: PresenceEvent = {
    actorId: cursor.actorId,
    status: 'online',
    updatedAt: cursor.updatedAt,
  };
  if (cursor.displayName !== undefined) presence.displayName = cursor.displayName;
  if (cursor.color !== undefined) presence.color = cursor.color;
  if (cursor.position !== undefined) presence.cursor = cursor.position;
  if (cursor.tool !== undefined) presence.tool = cursor.tool;
  if (cursor.selection !== undefined) presence.selection = cursor.selection;
  transport.sendPresence?.(presence);
}

function cloneCollaborationRoomEvent<TSnapshot, TDelta>(
  event: CollaborationRoomEvent<TSnapshot, TDelta>,
): CollaborationRoomEvent<TSnapshot, TDelta> {
  if (event.type === 'delta') {
    return {
      type: 'delta',
      delta: structuredClone(event.delta),
      meta: { ...event.meta },
    };
  }
  if (event.type === 'snapshot') {
    return { type: 'snapshot', snapshot: structuredClone(event.snapshot) };
  }
  return { type: 'presence', presence: structuredClone(event.presence) };
}

function captureInMemorySnapshot<TSnapshot, TDelta>(
  transport: InMemoryCollaborationTransport<TSnapshot, TDelta>,
): { available: true; snapshot: TSnapshot } | { available: false } {
  const provider = inMemorySnapshotProviders.get(transport);
  if (provider === undefined) return { available: false };
  try {
    return { available: true, snapshot: structuredClone(provider()) as TSnapshot };
  } catch {
    return { available: false };
  }
}

function defaultHub<TSnapshot, TDelta>(roomId: string): InMemoryCollaborationHub<TSnapshot, TDelta> {
  const existing = defaultHubs.get(roomId);
  if (existing) return existing as InMemoryCollaborationHub<TSnapshot, TDelta>;
  const created = new InMemoryCollaborationHub<unknown, unknown>();
  defaultHubs.set(roomId, created);
  return created as InMemoryCollaborationHub<TSnapshot, TDelta>;
}

function ensurePresenceDefaults<TSnapshot, TDelta>(
  presence: PresenceEvent,
  transport: InMemoryCollaborationTransport<TSnapshot, TDelta>,
): PresenceEvent {
  const next: PresenceEvent = {
    actorId: presence.actorId || transport.actorId,
    status: presence.status,
  };
  if (presence.displayName !== undefined) next.displayName = presence.displayName;
  else if (transport.displayName !== undefined) next.displayName = transport.displayName;
  if (presence.color !== undefined) next.color = presence.color;
  else if (transport.color !== undefined) next.color = transport.color;
  if (presence.cursor !== undefined) next.cursor = presence.cursor;
  if (presence.tool !== undefined) next.tool = presence.tool;
  if (presence.selection !== undefined) next.selection = presence.selection;
  next.updatedAt = presence.updatedAt ?? Date.now();
  return next;
}
