import type {
  DeltaMeta,
  JsonValue,
  KleinInstrument,
  KleinToolKey,
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
  disconnect(): void;
}

/** Inputs for connecting a host transport to a framework-independent SDK instrument. */
export interface CollaborationOptions<TSnapshot, TDelta> {
  instrument: KleinInstrument<TSnapshot, TDelta>;
  transport: CollaborationTransport<TSnapshot, TDelta>;
  onPresence?: (presence: PresenceEvent) => void;
}

/** Wires remote transport events into an instrument without making the instrument know about networking. */
export function bindCollaboration<TSnapshot, TDelta>({
  instrument,
  transport,
  onPresence,
}: CollaborationOptions<TSnapshot, TDelta>): CollaborationBinding {
  const offDelta = transport.onDelta((delta, meta) => {
    instrument.applyDelta(delta, { emit: false, meta });
  });
  const offSnapshot = transport.onSnapshot((snapshot) => {
    instrument.loadSnapshot(snapshot, { source: 'remote' });
  });
  const offPresence = transport.onPresence && onPresence
    ? transport.onPresence(onPresence)
    : () => undefined;

  const ready = transport.connect();
  void ready.catch(() => undefined);

  return {
    ready,
    disconnect() {
      offDelta();
      offSnapshot();
      offPresence();
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

/** In-process collaboration hub for local testing and host adapters that fan out events themselves. */
export class InMemoryCollaborationHub<TSnapshot, TDelta> {
  #rooms = new Map<string, Set<InMemoryCollaborationTransport<TSnapshot, TDelta>>>();

  join(roomId: string, transport: InMemoryCollaborationTransport<TSnapshot, TDelta>): void {
    const room = this.#rooms.get(roomId) ?? new Set<InMemoryCollaborationTransport<TSnapshot, TDelta>>();
    room.add(transport);
    this.#rooms.set(roomId, room);
  }

  leave(roomId: string, transport: InMemoryCollaborationTransport<TSnapshot, TDelta>): void {
    const room = this.#rooms.get(roomId);
    if (!room) return;
    room.delete(transport);
    if (room.size === 0) this.#rooms.delete(roomId);
  }

  publish(
    roomId: string,
    source: InMemoryCollaborationTransport<TSnapshot, TDelta>,
    event: CollaborationRoomEvent<TSnapshot, TDelta>,
  ): void {
    const room = this.#rooms.get(roomId);
    if (!room) return;
    for (const transport of room) {
      if (transport !== source) transport.receive(event);
    }
  }

  participantCount(roomId: string): number {
    return this.#rooms.get(roomId)?.size ?? 0;
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
  #connected = false;
  #deltaHandlers = new Set<(delta: TDelta, meta: DeltaMeta) => void>();
  #snapshotHandlers = new Set<(snapshot: TSnapshot) => void>();
  #presenceHandlers = new Set<(presence: PresenceEvent) => void>();

  constructor(options: InMemoryCollaborationTransportOptions<TSnapshot, TDelta>) {
    this.roomId = options.roomId;
    this.actorId = options.actorId;
    if (options.displayName !== undefined) this.displayName = options.displayName;
    if (options.color !== undefined) this.color = options.color;
    this.#hub = options.hub ?? defaultHub<TSnapshot, TDelta>(options.roomId);
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
      for (const handler of this.#deltaHandlers) handler(event.delta, event.meta);
    } else if (event.type === 'snapshot') {
      for (const handler of this.#snapshotHandlers) handler(event.snapshot);
    } else {
      for (const handler of this.#presenceHandlers) handler(event.presence);
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
