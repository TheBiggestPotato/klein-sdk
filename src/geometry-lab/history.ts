import { KleinSdkError } from '../core/index.js';
import type { JsonValue, Vector3 } from '../core/index.js';
import { buildGeometryLabDependencyGraph } from './dependencies.js';
import { compactGeometryLabHistoryValue } from './persistence.js';
import type {
  GeometryLabDelta,
  GeometryLabHistoryPatch,
  GeometryLabHistoryRef,
  GeometryLabHistoryValue,
  GeometryLabSnapshot,
  GeometryScene3D,
  GeometrySceneLink,
} from './types.js';

export interface GeometryLabHistoryEntry {
  changes: GeometryLabHistoryChange[];
  refKeys: string[];
  serializedBytes: number;
}

const GEOMETRY_LAB_HISTORY_RECORD_COLLECTIONS = [
  'point2d',
  'entity2d',
  'constraint2d',
  'point3d',
  'entity3d',
  'workPlane',
  'measurement',
  'net',
  'link',
] as const;

type GeometryLabHistoryRecordCollection = typeof GEOMETRY_LAB_HISTORY_RECORD_COLLECTIONS[number];

export interface GeometryLabHistoryChange {
  ref: GeometryLabHistoryRef;
  before: GeometryLabHistoryValue;
  after: GeometryLabHistoryValue;
}

export interface GeometryLabHistoryDiff {
  changes: GeometryLabHistoryChange[];
  refKeys: string[];
}

export function createGeometryLabHistoryEntry(
  diff: GeometryLabHistoryDiff,
): GeometryLabHistoryEntry | null {
  const { changes, refKeys } = diff;
  if (!changes.length) return null;
  return {
    changes,
    refKeys,
    serializedBytes: utf8ByteLength(JSON.stringify({ changes, refKeys })),
  };
}

/**
 * One encoder for the module rather than one per history entry.
 *
 * <p>The allocation this makes - a full encoded copy of the entry's JSON, just
 * to read its length - looks like obvious waste, and counting the bytes in a
 * loop instead was tried. It is 17x slower: 2.41 ms against 0.14 ms on the
 * largest entry the instrument can produce, because the native encoder beats a
 * per-character JavaScript loop over 1.5 million characters by far more than
 * the allocation costs. Hoisting the instance is the part that was actually
 * worth doing.
 */
const historyByteEncoder = new TextEncoder();

/** Exact UTF-8 size of an entry, used for the history memory budget. */
function utf8ByteLength(value: string): number {
  return historyByteEncoder.encode(value).byteLength;
}

export function geometryLabHistoryDelta(
  entry: GeometryLabHistoryEntry,
  direction: 'undo' | 'redo',
): GeometryLabDelta {
  return {
    op: 'historyPatch',
    patches: entry.changes.map(change => ({
      ref: cloneGeometryLabHistoryRef(change.ref),
      expected: cloneGeometryLabHistoryValue(direction === 'undo' ? change.after : change.before),
      next: cloneGeometryLabHistoryValue(direction === 'undo' ? change.before : change.after),
    })),
  };
}

export function diffGeometryLabHistory(
  before: GeometryLabSnapshot,
  after: GeometryLabSnapshot,
  captureValues = true,
): GeometryLabHistoryDiff {
  const diff: GeometryLabHistoryDiff = { changes: [], refKeys: [] };
  for (const collection of GEOMETRY_LAB_HISTORY_RECORD_COLLECTIONS) {
    const beforeRecord = geometryLabHistoryRecord(before, collection);
    const afterRecord = geometryLabHistoryRecord(after, collection);
    const ids = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]);
    for (const id of [...ids].sort()) {
      addGeometryLabHistoryChange(diff, { collection, id }, before, after, captureValues);
    }
  }

  const appStateKeys = new Set([
    ...Object.keys(before.appState),
    ...Object.keys(after.appState),
  ]);
  for (const key of [...appStateKeys].sort()) {
    addGeometryLabHistoryChange(diff, { collection: 'appState', key }, before, after, captureValues);
  }
  addGeometryLabHistoryChange(diff, { collection: 'metadata' }, before, after, captureValues);
  return diff;
}

function addGeometryLabHistoryChange(
  diff: GeometryLabHistoryDiff,
  ref: GeometryLabHistoryRef,
  before: GeometryLabSnapshot,
  after: GeometryLabSnapshot,
  captureValue: boolean,
): void {
  const beforeValue = readGeometryLabHistoryValueRaw(before, ref);
  const afterValue = readGeometryLabHistoryValueRaw(after, ref);
  const equationValue = isEquationGeometryLabHistoryValue(beforeValue)
    || isEquationGeometryLabHistoryValue(afterValue);
  if (
    (!equationValue || equationGeometryLabHistoryCachesShared(beforeValue, afterValue))
    && geometryLabHistoryValuesEqual(beforeValue, afterValue)
  ) return;
  if (equationValue) {
    const comparableBefore = compactGeometryLabHistoryValueForRef(ref, beforeValue);
    const comparableAfter = compactGeometryLabHistoryValueForRef(ref, afterValue);
    if (geometryLabHistoryValuesEqual(comparableBefore, comparableAfter)) return;
  }
  diff.refKeys.push(geometryLabHistoryRefKey(ref));
  if (!captureValue) return;
  diff.changes.push({
    ref: cloneGeometryLabHistoryRef(ref),
    before: ownedGeometryLabHistoryValue(ref, beforeValue),
    after: ownedGeometryLabHistoryValue(ref, afterValue),
  });
}

function equationGeometryLabHistoryCachesShared(
  before: GeometryLabHistoryValue,
  after: GeometryLabHistoryValue,
): boolean {
  if (!before.present || !after.present || !isRecord(before.value) || !isRecord(after.value)) return false;
  return before.value.vertices === after.value.vertices && before.value.faces === after.value.faces;
}

function isEquationGeometryLabHistoryValue(value: GeometryLabHistoryValue): boolean {
  if (!value.present || !isRecord(value.value)) return false;
  return value.value.kind === 'surface3d' && value.value.surfaceKind === 'equation';
}

function ownedGeometryLabHistoryValue(
  ref: GeometryLabHistoryRef,
  value: GeometryLabHistoryValue,
): GeometryLabHistoryValue {
  if (!value.present) return { present: false };
  if (ref.collection === 'appState' || ref.collection === 'metadata') {
    return { present: true, value: cloneJsonValue(value.value) };
  }
  return {
    present: true,
    value: compactGeometryLabHistoryValue(ref, value.value) as JsonValue,
  };
}

export function applyGeometryLabHistoryPatches(
  snapshot: GeometryLabSnapshot,
  patches: GeometryLabHistoryPatch[],
): GeometryLabSnapshot {
  if (!patches.length) return snapshot;
  const next = cloneSnapshotReusingSampledGeometry(snapshot);
  let changed = false;
  for (const patch of patches) {
    const current = readGeometryLabHistoryValue(next, patch.ref);
    const expected = compactGeometryLabHistoryValueForRef(patch.ref, patch.expected);
    const nextValue = compactGeometryLabHistoryValueForRef(patch.ref, patch.next);
    if (!geometryLabHistoryValuesEqual(current, expected)) continue;
    if (geometryLabHistoryValuesEqual(current, nextValue)) continue;
    if (
      nextValue.present
      && !current.present
      && 'id' in patch.ref
      && geometryLabIdPath(next, patch.ref.id) !== null
    ) {
      continue;
    }
    writeGeometryLabHistoryValue(next, patch.ref, nextValue);
    changed = true;
  }
  return changed ? next : snapshot;
}

function compactGeometryLabHistoryValueForRef(
  ref: GeometryLabHistoryRef,
  value: GeometryLabHistoryValue,
): GeometryLabHistoryValue {
  return value.present
    ? { present: true, value: compactGeometryLabHistoryValue(ref, value.value) as JsonValue }
    : { present: false };
}

function readGeometryLabHistoryValue(
  snapshot: GeometryLabSnapshot,
  ref: GeometryLabHistoryRef,
): GeometryLabHistoryValue {
  const value = readGeometryLabHistoryValueRaw(snapshot, ref);
  if (!value.present || ref.collection === 'metadata' || ref.collection === 'appState') return value;
  return presentGeometryLabHistoryValue(compactGeometryLabHistoryValue(ref, value.value));
}

function readGeometryLabHistoryValueRaw(
  snapshot: GeometryLabSnapshot,
  ref: GeometryLabHistoryRef,
): GeometryLabHistoryValue {
  if (ref.collection === 'metadata') {
    return Object.hasOwn(snapshot, 'metadata')
      ? presentGeometryLabHistoryValue(snapshot.metadata)
      : { present: false };
  }
  if (ref.collection === 'appState') {
    const appState = snapshot.appState as unknown as Record<string, unknown>;
    return Object.hasOwn(appState, ref.key)
      ? presentGeometryLabHistoryValue(appState[ref.key])
      : { present: false };
  }
  const record = geometryLabHistoryRecord(snapshot, ref.collection);
  return Object.hasOwn(record, ref.id)
    ? presentGeometryLabHistoryValue(record[ref.id])
    : { present: false };
}

function writeGeometryLabHistoryValue(
  snapshot: GeometryLabSnapshot,
  ref: GeometryLabHistoryRef,
  value: GeometryLabHistoryValue,
): void {
  if (ref.collection === 'metadata') {
    if (!value.present) {
      delete snapshot.metadata;
    } else {
      snapshot.metadata = cloneJsonValue(value.value) as NonNullable<GeometryLabSnapshot['metadata']>;
    }
    return;
  }
  if (ref.collection === 'appState') {
    const appState = snapshot.appState as unknown as Record<string, unknown>;
    if (!value.present) delete appState[ref.key];
    else appState[ref.key] = cloneJsonValue(value.value);
    return;
  }
  if (ref.collection === 'link') {
    if (!value.present) {
      snapshot.scene.links = snapshot.scene.links.filter(link => link.id !== ref.id);
    } else {
      const link = cloneJsonValue(value.value) as unknown as GeometrySceneLink;
      const index = snapshot.scene.links.findIndex(candidate => candidate.id === ref.id);
      if (index < 0) snapshot.scene.links.push(link);
      else snapshot.scene.links[index] = link;
    }
    return;
  }
  const record = writableGeometryLabHistoryRecord(snapshot, ref.collection);
  if (!value.present) delete record[ref.id];
  else record[ref.id] = cloneJsonValue(value.value);
}

function geometryLabHistoryRecord(
  snapshot: GeometryLabSnapshot,
  collection: GeometryLabHistoryRecordCollection,
): Record<string, unknown> {
  switch (collection) {
    case 'point2d': return snapshot.scene.scene2d.points;
    case 'entity2d': return snapshot.scene.scene2d.entities;
    case 'constraint2d': return snapshot.scene.scene2d.constraints ?? {};
    case 'point3d': return snapshot.scene.scene3d.points;
    case 'entity3d': return snapshot.scene.scene3d.entities;
    case 'workPlane': return snapshot.scene.scene3d.workPlanes;
    case 'measurement': return snapshot.scene.scene3d.measurements;
    case 'net': return snapshot.scene.scene3d.nets;
    case 'link': return Object.fromEntries(snapshot.scene.links.map(link => [link.id, link]));
  }
}

function writableGeometryLabHistoryRecord(
  snapshot: GeometryLabSnapshot,
  collection: Exclude<GeometryLabHistoryRecordCollection, 'link'>,
): Record<string, unknown> {
  if (collection === 'constraint2d' && !snapshot.scene.scene2d.constraints) {
    snapshot.scene.scene2d.constraints = {};
  }
  return geometryLabHistoryRecord(snapshot, collection);
}

function presentGeometryLabHistoryValue(value: unknown): GeometryLabHistoryValue {
  return { present: true, value: value as JsonValue };
}

function cloneGeometryLabHistoryRef(ref: GeometryLabHistoryRef): GeometryLabHistoryRef {
  return { ...ref };
}

function cloneGeometryLabHistoryValue(value: GeometryLabHistoryValue): GeometryLabHistoryValue {
  return value.present
    ? { present: true, value: cloneJsonValue(value.value) }
    : { present: false };
}

function geometryLabHistoryValuesEqual(
  first: GeometryLabHistoryValue,
  second: GeometryLabHistoryValue,
): boolean {
  if (first.present !== second.present) return false;
  if (!first.present || !second.present) return true;
  return jsonValuesEqual(first.value, second.value);
}

function geometryLabHistoryRefKey(ref: GeometryLabHistoryRef): string {
  if (ref.collection === 'metadata') return 'metadata';
  if (ref.collection === 'appState') return `appState:${ref.key}`;
  return `id:${ref.id}`;
}

export function geometryLabDependencyConflictRefKeys(
  refKeys: readonly string[],
  before: GeometryLabSnapshot,
  after: GeometryLabSnapshot,
): Set<string> {
  const result = new Set(refKeys);
  const seedIds = refKeys
    .filter(refKey => refKey.startsWith('id:'))
    .map(refKey => refKey.slice(3));

  for (const snapshot of [before, after]) {
    const graph = buildGeometryLabDependencyGraph(snapshot);
    const visited = new Set<string>();
    const queue = [...seedIds].sort();
    while (queue.length > 0) {
      const id = queue.shift();
      if (id === undefined || visited.has(id)) continue;
      visited.add(id);
      result.add(`id:${id}`);
      const adjacent = new Set([
        ...(graph.dependenciesById[id] ?? []),
        ...(graph.dependentsById[id] ?? []),
      ]);
      for (const adjacentId of [...adjacent].sort()) {
        if (!visited.has(adjacentId)) queue.push(adjacentId);
      }
    }
  }
  return result;
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (value === null || typeof value !== 'object') return value;
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new KleinSdkError('invalid_json_value', 'Geometry Lab history values must be JSON-serializable.');
  }
  return JSON.parse(serialized) as JsonValue;
}

export function jsonValuesEqual(first: unknown, second: unknown): boolean {
  if (Object.is(first, second)) return true;
  if (typeof first !== 'object' || first === null || typeof second !== 'object' || second === null) return false;
  if (Array.isArray(first) || Array.isArray(second)) {
    if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length) return false;
    return first.every((value, index) => jsonValuesEqual(value, second[index]));
  }
  const firstRecord = first as Record<string, unknown>;
  const secondRecord = second as Record<string, unknown>;
  const firstKeys = Object.keys(firstRecord);
  const secondKeys = Object.keys(secondRecord);
  if (firstKeys.length !== secondKeys.length) return false;
  return firstKeys.every(key => (
    Object.hasOwn(secondRecord, key) && jsonValuesEqual(firstRecord[key], secondRecord[key])
  ));
}


export function geometryLabIdPath(snapshot: GeometryLabSnapshot, id: string): string | null {
  const records: Array<[string, Record<string, unknown>]> = [
    ['scene.scene2d.points', snapshot.scene.scene2d.points],
    ['scene.scene2d.entities', snapshot.scene.scene2d.entities],
    ['scene.scene2d.constraints', snapshot.scene.scene2d.constraints ?? {}],
    ['scene.scene3d.points', snapshot.scene.scene3d.points],
    ['scene.scene3d.entities', snapshot.scene.scene3d.entities],
    ['scene.scene3d.workPlanes', snapshot.scene.scene3d.workPlanes],
    ['scene.scene3d.measurements', snapshot.scene.scene3d.measurements],
    ['scene.scene3d.nets', snapshot.scene.scene3d.nets],
  ];
  for (const [path, record] of records) {
    if (Object.hasOwn(record, id)) return `${path}.${id}`;
  }
  const linkIndex = snapshot.scene.links.findIndex(link => link.id === id);
  return linkIndex < 0 ? null : `scene.links[${linkIndex}]`;
}


/** Owned-state clone that treats sampled surface buffers as immutable values. */
function cloneSnapshotReusingSampledGeometry(snapshot: GeometryLabSnapshot): GeometryLabSnapshot {
  const meshes = new Map<string, { vertices: Vector3[]; faces: number[][] }>();
  const curves = new Map<string, Vector3[]>();
  const entities = Object.fromEntries(Object.entries(snapshot.scene.scene3d.entities).map(([id, entity]) => {
    if (entity.kind === 'surface3d') {
      meshes.set(id, { vertices: entity.vertices, faces: entity.faces });
      return [id, { ...entity, vertices: [], faces: [] }];
    }
    if (entity.kind === 'curve3d') {
      curves.set(id, entity.points);
      return [id, { ...entity, points: [] }];
    }
    return [id, entity];
  })) as GeometryScene3D['entities'];
  const withoutMeshes: GeometryLabSnapshot = {
    ...snapshot,
    scene: {
      ...snapshot.scene,
      scene3d: { ...snapshot.scene.scene3d, entities },
    },
  };
  const next = cloneSnapshot(withoutMeshes);
  for (const [id, mesh] of meshes) {
    const entity = next.scene.scene3d.entities[id];
    if (entity?.kind !== 'surface3d') continue;
    entity.vertices = mesh.vertices;
    entity.faces = mesh.faces;
  }
  for (const [id, points] of curves) {
    const entity = next.scene.scene3d.entities[id];
    if (entity?.kind === 'curve3d') entity.points = points;
  }
  return next;
}


function cloneSnapshot(snapshot: GeometryLabSnapshot): GeometryLabSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as GeometryLabSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

