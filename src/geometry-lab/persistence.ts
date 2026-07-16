import type { JsonValue } from '../core/index.js';
import type {
  GeometryEntity3D,
  GeometryLabDelta,
  GeometryLabHistoryRef,
  GeometryLabSnapshot,
  SolidNet3D,
} from './types.js';

/**
 * Return a persistence-oriented copy with deterministic geometry caches omitted.
 *
 * Authored topology and coordinates remain intact so the Geometry Lab
 * canonicalizer can rehydrate the omitted fields after loading.
 */
export function compactGeometryLabSnapshot(snapshot: GeometryLabSnapshot): GeometryLabSnapshot {
  const compacted = structuredClone(snapshot);

  for (const entity of Object.values(compacted.scene.scene3d.entities)) {
    compactGeometryLabEntityInPlace(entity);
  }

  for (const net of Object.values(compacted.scene.scene3d.nets)) {
    compactGeometryLabNetInPlace(net);
  }

  return compacted;
}

/**
 * Compact one semantic history value without first cloning large derived mesh
 * arrays. The reducer's canonicalization pass rehydrates every omitted cache.
 */
export function compactGeometryLabHistoryValue(ref: GeometryLabHistoryRef, value: unknown): unknown {
  if (ref.collection === 'entity3d' && isRecord(value) && typeof value.kind === 'string') {
    if (value.kind === 'surface3d' && value.surfaceKind === 'equation') {
      const { vertices: _vertices, faces: _faces, ...authored } = value;
      return structuredClone({ ...authored, vertices: [], faces: [] });
    }
    const entity = structuredClone(value) as unknown as GeometryEntity3D;
    compactGeometryLabEntityInPlace(entity);
    return entity;
  }
  if (ref.collection === 'net' && isRecord(value)) {
    const net = structuredClone(value) as unknown as SolidNet3D;
    compactGeometryLabNetInPlace(net);
    return net;
  }
  return structuredClone(value);
}

/** Compact deterministic caches before collaboration transport. */
export function compactGeometryLabDelta(delta: GeometryLabDelta): GeometryLabDelta {
  if (delta.op === 'batch') {
    return { op: 'batch', deltas: delta.deltas.map(compactGeometryLabDelta) };
  }
  if (delta.op === 'addEntity3D') {
    return {
      op: 'addEntity3D',
      entity: compactGeometryLabHistoryValue(
        { collection: 'entity3d', id: delta.entity.id },
        delta.entity,
      ) as GeometryEntity3D,
    };
  }
  if (delta.op === 'updateEntity') {
    const changes = delta.changes as Record<string, unknown>;
    if (
      changes.kind === 'surface3d'
      && changes.surfaceKind === 'equation'
      && Array.isArray(changes.vertices)
      && Array.isArray(changes.faces)
    ) {
      const { vertices: _vertices, faces: _faces, ...authored } = changes;
      return structuredClone({
        op: 'updateEntity',
        id: delta.id,
        changes: { ...authored, vertices: [], faces: [] },
      }) as GeometryLabDelta;
    }
  }
  if (delta.op === 'addNet') {
    const net = compactGeometryLabHistoryValue(
      { collection: 'net', id: delta.net.id },
      delta.net,
    ) as SolidNet3D;
    return { op: 'addNet', net };
  }
  if (delta.op === 'historyPatch') {
    return {
      op: 'historyPatch',
      patches: delta.patches.map(patch => ({
        ref: structuredClone(patch.ref),
        expected: patch.expected.present
          ? {
              present: true,
              value: compactGeometryLabHistoryValue(patch.ref, patch.expected.value) as JsonValue,
            }
          : { present: false },
        next: patch.next.present
          ? {
              present: true,
              value: compactGeometryLabHistoryValue(patch.ref, patch.next.value) as JsonValue,
            }
          : { present: false },
      })),
    };
  }
  return structuredClone(delta);
}

function compactGeometryLabEntityInPlace(entity: GeometryEntity3D): void {
  if (entity.kind === 'solid') {
    delete entity.edges;
    delete entity.volume;
    delete entity.surfaceArea;
    if (entity.parameters) {
      delete entity.parameters.baseArea;
      delete entity.parameters.volume;
      delete entity.parameters.surfaceArea;
    }
    for (const face of entity.faces ?? []) {
      delete face.normal;
      delete face.area;
    }
    return;
  }
  if (entity.kind === 'crossSection') {
    delete entity.vertices;
    delete entity.area;
    delete entity.perimeter;
    return;
  }
  if (entity.kind === 'surface3d' && entity.surfaceKind === 'equation') {
    entity.vertices = [];
    entity.faces = [];
  }
}

function compactGeometryLabNetInPlace(net: SolidNet3D): void {
  net.faces = [];
  delete net.totalArea;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
