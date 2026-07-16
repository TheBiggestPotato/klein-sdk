import { KleinSdkError } from '../core/index.js';
import type {
  InstrumentSnapshot,
  JsonValue,
  KleinInstrument,
  ValidationIssue,
  ValidationResult,
} from '../core/index.js';

export interface SnapshotMigration<TSnapshot extends InstrumentSnapshot = InstrumentSnapshot> {
  instrument: string;
  fromVersion: number;
  toVersion: number;
  migrate(snapshot: TSnapshot): TSnapshot;
}

export interface PersistedSession<TSnapshot> {
  sessionId: string;
  snapshot: TSnapshot;
  revision: number;
  createdAt: number;
  updatedAt: number;
  userId?: string;
  datasourceId?: string;
  metadata?: Record<string, JsonValue>;
}

export interface SaveSnapshotInput<TSnapshot> {
  sessionId: string;
  snapshot: TSnapshot;
  expectedRevision?: number;
  actorId?: string;
  datasourceId?: string;
  metadata?: Record<string, JsonValue>;
}

export interface SavedSnapshot {
  sessionId: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  datasourceId?: string;
  metadata?: Record<string, JsonValue>;
}

export interface LoadSnapshotInput {
  sessionId: string;
}

export interface LoadedSnapshot<TSnapshot> extends SavedSnapshot {
  snapshot: TSnapshot;
}

export interface ListSnapshotsInput {
  actorId?: string;
  datasourceId?: string;
  limit?: number;
}

export interface SnapshotSummary extends SavedSnapshot {
  title?: string;
  tool?: string;
}

export interface KleinStorageAdapter<TSnapshot> {
  save(input: SaveSnapshotInput<TSnapshot>): Promise<SavedSnapshot>;
  load(input: LoadSnapshotInput): Promise<LoadedSnapshot<TSnapshot> | null>;
  list(input?: ListSnapshotsInput): Promise<SnapshotSummary[]>;
}

export interface SaveSessionInput<TSnapshot> {
  sessionId: string;
  snapshot: TSnapshot;
  expectedRevision?: number;
  userId?: string;
  datasourceId?: string;
  metadata?: Record<string, JsonValue>;
}

export interface ListSessionsOptions {
  userId?: string;
  datasourceId?: string;
  limit?: number;
}

export interface KleinSessionStorageAdapter<TSnapshot> {
  load(sessionId: string): Promise<PersistedSession<TSnapshot> | null>;
  save(input: SaveSessionInput<TSnapshot>): Promise<PersistedSession<TSnapshot>>;
  delete(sessionId: string): Promise<void>;
  list?(options?: ListSessionsOptions): Promise<Array<PersistedSession<TSnapshot>>>;
}

export interface LocalStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key?(index: number): string | null;
  readonly length?: number;
}

export interface LocalStorageSessionAdapterOptions {
  storage?: LocalStorageLike;
  namespace?: string;
}

export class LocalStorageSessionAdapter<TSnapshot>
implements KleinSessionStorageAdapter<TSnapshot> {
  #storage: LocalStorageLike | null;
  #memory = new Map<string, string>();
  #namespace: string;

  constructor(options: LocalStorageSessionAdapterOptions = {}) {
    this.#storage = options.storage ?? defaultBrowserStorage();
    this.#namespace = options.namespace ?? 'klein:sessions';
  }

  async load(sessionId: string): Promise<PersistedSession<TSnapshot> | null> {
    const raw = this.#get(this.#key(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as PersistedSession<TSnapshot>;
  }

  async save(input: SaveSessionInput<TSnapshot>): Promise<PersistedSession<TSnapshot>> {
    const now = Date.now();
    const current = await this.load(input.sessionId);
    if (
      input.expectedRevision !== undefined
      && current
      && current.revision !== input.expectedRevision
    ) {
      throw new KleinSdkError('revision_conflict', 'Session revision is stale.', {
        expectedRevision: input.expectedRevision,
        currentRevision: current.revision,
      });
    }
    const session: PersistedSession<TSnapshot> = {
      sessionId: input.sessionId,
      snapshot: input.snapshot,
      revision: (current?.revision ?? 0) + 1,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    if (input.userId !== undefined) session.userId = input.userId;
    else if (current?.userId !== undefined) session.userId = current.userId;
    if (input.datasourceId !== undefined) session.datasourceId = input.datasourceId;
    else if (current?.datasourceId !== undefined) session.datasourceId = current.datasourceId;
    if (input.metadata !== undefined) session.metadata = input.metadata;
    else if (current?.metadata !== undefined) session.metadata = current.metadata;
    this.#set(this.#key(input.sessionId), JSON.stringify(session));
    return session;
  }

  async delete(sessionId: string): Promise<void> {
    this.#remove(this.#key(sessionId));
  }

  async list(options: ListSessionsOptions = {}): Promise<Array<PersistedSession<TSnapshot>>> {
    const sessions: Array<PersistedSession<TSnapshot>> = [];
    for (const raw of this.#values()) {
      const session = JSON.parse(raw) as PersistedSession<TSnapshot>;
      if (options.userId !== undefined && session.userId !== options.userId) continue;
      if (options.datasourceId !== undefined && session.datasourceId !== options.datasourceId) continue;
      sessions.push(session);
    }
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    return options.limit ? sessions.slice(0, options.limit) : sessions;
  }

  #key(sessionId: string): string {
    if (!sessionId.trim()) throw new KleinSdkError('invalid_session', 'Session id cannot be empty.');
    return `${this.#namespace}:${sessionId}`;
  }

  #get(key: string): string | null {
    return this.#storage ? this.#storage.getItem(key) : this.#memory.get(key) ?? null;
  }

  #set(key: string, value: string): void {
    if (this.#storage) this.#storage.setItem(key, value);
    else this.#memory.set(key, value);
  }

  #remove(key: string): void {
    if (this.#storage) this.#storage.removeItem(key);
    else this.#memory.delete(key);
  }

  #values(): string[] {
    if (!this.#storage) return [...this.#memory.values()];
    const values: string[] = [];
    const length = this.#storage.length ?? 0;
    for (let index = 0; index < length; index += 1) {
      const key = this.#storage.key?.(index);
      if (!key?.startsWith(`${this.#namespace}:`)) continue;
      const value = this.#storage.getItem(key);
      if (value) values.push(value);
    }
    return values;
  }
}

export function createLocalStorageSessionAdapter<TSnapshot>(
  options?: LocalStorageSessionAdapterOptions,
): LocalStorageSessionAdapter<TSnapshot> {
  return new LocalStorageSessionAdapter<TSnapshot>(options);
}

/** Adapts the older session storage contract to the public v0 snapshot storage contract. */
export function createKleinStorageAdapter<TSnapshot>(
  adapter: KleinSessionStorageAdapter<TSnapshot>,
): KleinStorageAdapter<TSnapshot> {
  return {
    async save(input) {
      const saveInput: SaveSessionInput<TSnapshot> = {
        sessionId: input.sessionId,
        snapshot: input.snapshot,
      };
      if (input.expectedRevision !== undefined) saveInput.expectedRevision = input.expectedRevision;
      if (input.actorId !== undefined) saveInput.userId = input.actorId;
      if (input.datasourceId !== undefined) saveInput.datasourceId = input.datasourceId;
      if (input.metadata !== undefined) saveInput.metadata = input.metadata;
      const session = await adapter.save(saveInput);
      return savedSnapshotFromSession(session);
    },
    async load(input) {
      const session = await adapter.load(input.sessionId);
      return session ? loadedSnapshotFromSession(session) : null;
    },
    async list(input = {}) {
      if (!adapter.list) return [];
      const options: ListSessionsOptions = {};
      if (input.actorId !== undefined) options.userId = input.actorId;
      if (input.datasourceId !== undefined) options.datasourceId = input.datasourceId;
      if (input.limit !== undefined) options.limit = input.limit;
      const sessions = await adapter.list(options);
      return sessions.map(snapshotSummaryFromSession);
    },
  };
}

export async function saveInstrumentSession<TSnapshot, TDelta>(
  instrument: KleinInstrument<TSnapshot, TDelta>,
  adapter: KleinSessionStorageAdapter<TSnapshot>,
  options: Omit<SaveSessionInput<TSnapshot>, 'snapshot'>,
): Promise<PersistedSession<TSnapshot>> {
  return adapter.save({
    ...options,
    snapshot: instrument.getSnapshot(),
  });
}

export async function loadInstrumentSession<TSnapshot, TDelta>(
  instrument: KleinInstrument<TSnapshot, TDelta>,
  adapter: KleinSessionStorageAdapter<TSnapshot>,
  sessionId: string,
): Promise<PersistedSession<TSnapshot> | null> {
  const session = await adapter.load(sessionId);
  if (session) instrument.loadSnapshot(session.snapshot, { source: 'remote' });
  return session;
}

export function parseSnapshotJson<TSnapshot>(input: string | JsonValue): TSnapshot {
  if (typeof input === 'string') {
    try {
      return JSON.parse(input) as TSnapshot;
    } catch (error) {
      throw new KleinSdkError('invalid_json', 'Snapshot JSON could not be parsed.', String(error));
    }
  }
  return input as TSnapshot;
}

export function validateInstrumentSnapshot<TSnapshot extends InstrumentSnapshot>(
  value: unknown,
): ValidationResult<TSnapshot> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: '', message: 'Snapshot must be an object.' }] };
  }
  if (typeof value.version !== 'number') {
    issues.push({ path: 'version', message: 'Snapshot version must be a number.' });
  }
  if (typeof value.instrument !== 'string' || value.instrument.length === 0) {
    issues.push({ path: 'instrument', message: 'Snapshot instrument must be a non-empty string.' });
  }
  if (!isRecord(value.scene)) {
    issues.push({ path: 'scene', message: 'Snapshot scene must be an object.' });
  }
  if (value.appState !== undefined && !isRecord(value.appState)) {
    issues.push({ path: 'appState', message: 'Snapshot appState must be an object when present.' });
  }
  return issues.length
    ? { ok: false, issues }
    : { ok: true, value: value as TSnapshot };
}

export function migrateSnapshot<TSnapshot extends InstrumentSnapshot>(
  snapshot: TSnapshot,
  migrations: Array<SnapshotMigration<TSnapshot>>,
  targetVersion?: number,
): TSnapshot {
  let current = snapshot;
  const target = targetVersion ?? Math.max(snapshot.version, ...migrations.map(migration => migration.toVersion));
  while (current.version < target) {
    const migration = migrations.find(candidate => (
      candidate.instrument === current.instrument
      && candidate.fromVersion === current.version
    ));
    if (!migration) {
      throw new KleinSdkError('missing_migration', `No migration for ${current.instrument} v${current.version}.`);
    }
    current = migration.migrate(current);
    if (current.version !== migration.toVersion) {
      current = { ...current, version: migration.toVersion };
    }
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function defaultBrowserStorage(): LocalStorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function savedSnapshotFromSession<TSnapshot>(session: PersistedSession<TSnapshot>): SavedSnapshot {
  const saved: SavedSnapshot = {
    sessionId: session.sessionId,
    revision: session.revision,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
  if (session.datasourceId !== undefined) saved.datasourceId = session.datasourceId;
  if (session.metadata !== undefined) saved.metadata = session.metadata;
  return saved;
}

function loadedSnapshotFromSession<TSnapshot>(session: PersistedSession<TSnapshot>): LoadedSnapshot<TSnapshot> {
  return {
    ...savedSnapshotFromSession(session),
    snapshot: session.snapshot,
  };
}

function snapshotSummaryFromSession<TSnapshot>(session: PersistedSession<TSnapshot>): SnapshotSummary {
  const summary: SnapshotSummary = savedSnapshotFromSession(session);
  const metadata = session.metadata ?? {};
  if (typeof metadata.title === 'string') summary.title = metadata.title;
  if (typeof metadata.tool === 'string') summary.tool = metadata.tool;
  return summary;
}
