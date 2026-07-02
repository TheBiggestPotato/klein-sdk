import type { DeltaMeta, KleinInstrument } from '../core/index.js';

/** Optional presence payload for cursors and participant status. It is not persisted scene content. */
export interface PresenceEvent {
  actorId: string;
  displayName?: string;
  color?: string;
  cursor?: { x: number; y: number };
  status: 'online' | 'offline' | 'idle';
}

/** Host-provided transport contract for snapshots, deltas, and optional presence. */
export interface CollaborationTransport<TSnapshot, TDelta> {
  connect(): Promise<void>;
  disconnect(): void;
  sendDelta(delta: TDelta, meta: DeltaMeta): void;
  sendSnapshot(snapshot: TSnapshot): void;
  onDelta(handler: (delta: TDelta, meta: DeltaMeta) => void): () => void;
  onSnapshot(handler: (snapshot: TSnapshot) => void): () => void;
  onPresence?(handler: (presence: PresenceEvent) => void): () => void;
}

/** Handle returned after binding an instrument to a transport. */
export interface CollaborationBinding {
  disconnect(): void;
}

/** Inputs for connecting a host transport to a framework-independent SDK instrument. */
export interface CollaborationOptions<TSnapshot, TDelta> {
  instrument: KleinInstrument<TSnapshot, TDelta>;
  transport: CollaborationTransport<TSnapshot, TDelta>;
}

/** Wires remote transport events into an instrument without making the instrument know about networking. */
export function bindCollaboration<TSnapshot, TDelta>({
  instrument,
  transport,
}: CollaborationOptions<TSnapshot, TDelta>): CollaborationBinding {
  const offDelta = transport.onDelta((delta, meta) => {
    instrument.applyDelta(delta, { emit: false, meta });
  });
  const offSnapshot = transport.onSnapshot((snapshot) => {
    instrument.loadSnapshot(snapshot, { source: 'remote' });
  });

  void transport.connect();

  return {
    disconnect() {
      offDelta();
      offSnapshot();
      transport.disconnect();
    },
  };
}
