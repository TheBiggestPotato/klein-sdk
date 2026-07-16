import { KleinSdkError } from '../core/index.js';
import type { Camera3DState, JsonObject, JsonValue } from '../core/index.js';
import { createEmptyGeometryScene } from '../geometry-core/index.js';
import type { GeometryEntity, GeometryPoint2D, GeometryPoint3D } from '../geometry-core/index.js';
import {
  canonicalizeGeometryLabSnapshot as canonicalizeGeometryLabSnapshotBase,
  GeometryLabCanonicalizationError,
} from './canonicalize.js';
import {
  assertGeometryLabDeltaComplexity,
  assertGeometryLabSnapshotComplexity,
  resolveGeometryLabComplexityLimits,
} from './complexity.js';
import type { GeometryLabComplexityLimits } from './complexity.js';
import {
  buildGeometryLabDependencyGraph,
  planGeometryLabCascadeDeletion,
} from './dependencies.js';
import type { GeometryLabDependencyRef } from './dependencies.js';
import { canonicalizeEquationSurfaceCaches } from './equations.js';
import {
  applyGeometryLabHistoryPatches,
  diffGeometryLabHistory,
  geometryLabIdPath,
  jsonValuesEqual,
} from './history.js';
import type { GeometryLabHistoryDiff } from './history.js';
import { getGeometryLabInvariantIssues } from './invariants.js';
import {
  validateGeometryLabDeltaStrict as validateGeometryLabDeltaShape,
  validateGeometryLabSnapshotStrict as validateGeometryLabSnapshotShape,
} from './schema.js';
import type {
  GeometryEntity3D,
  GeometryLabAppState,
  GeometryLabDelta,
  GeometryLabReductionResult,
  GeometryLabSnapshot,
  GeometryScene3D,
} from './types.js';
import {
  validateGeometryLabDelta,
  validateGeometryLabSnapshot,
} from './validation.js';

/** Default z-up camera for the movable 3D scene. */
export function defaultGeometryCamera3D(): Camera3DState {
  return {
    position: [8, -8, 6],
    target: [0, 0, 0],
    up: [0, 0, 1],
    fov: 45,
    zoom: 1,
    projection: 'perspective',
  };
}

/** Creates a blank Geometry Lab document with an empty 2D scene and an XY work plane in 3D. */
export function createEmptyGeometryLabSnapshot(): GeometryLabSnapshot {
  return {
    version: 1,
    instrument: 'geometry-lab',
    scene: {
      scene2d: {
        kind: 'geometry-lab-2d',
        ...createEmptyGeometryScene(),
      },
      scene3d: {
        kind: 'geometry-lab-3d',
        points: {},
        entities: {},
        workPlanes: {
          xy: {
            id: 'xy',
            origin: [0, 0, 0],
            normal: [0, 0, 1],
            xAxis: [1, 0, 0],
            yAxis: [0, 1, 0],
            equation: { a: 0, b: 0, c: 1, d: 0 },
            label: 'XY',
          },
        },
        measurements: {},
        nets: {},
      },
      links: [],
    },
    appState: {
      activeView: '2d',
      view2d: { x: 0, y: 0, zoom: 1 },
      view3d: defaultGeometryCamera3D(),
      activeTool: 'select',
      activeWorkPlaneId: 'xy',
    },
  };
}

/** Owns and fills optional state used at public load and construction boundaries. */
export function normalizeGeometryLabSnapshot(snapshot: GeometryLabSnapshot): GeometryLabSnapshot {
  const owned = cloneSnapshot(snapshot);
  const fallback = createEmptyGeometryLabSnapshot();
  const scene3d: GeometryScene3D = {
    kind: 'geometry-lab-3d',
    points: { ...(owned.scene?.scene3d?.points ?? {}) },
    entities: { ...(owned.scene?.scene3d?.entities ?? {}) },
    workPlanes: {
      ...fallback.scene.scene3d.workPlanes,
      ...(owned.scene?.scene3d?.workPlanes ?? {}),
    },
    measurements: { ...(owned.scene?.scene3d?.measurements ?? {}) },
    nets: { ...(owned.scene?.scene3d?.nets ?? {}) },
  };
  return {
    ...fallback,
    ...owned,
    scene: {
      scene2d: {
        ...fallback.scene.scene2d,
        ...(owned.scene?.scene2d ?? {}),
        kind: 'geometry-lab-2d',
      },
      scene3d,
      links: [...(owned.scene?.links ?? [])],
    },
    appState: {
      ...fallback.appState,
      ...(owned.appState ?? {}),
      view2d: { ...fallback.appState.view2d, ...(owned.appState?.view2d ?? {}) },
      view3d: { ...fallback.appState.view3d, ...(owned.appState?.view3d ?? {}) },
    },
  };
}

/** Validates and reduces a delta without mutating caller-owned inputs. */
export function reduceGeometryLabDelta(
  snapshot: GeometryLabSnapshot,
  delta: GeometryLabDelta,
  complexityLimits: Partial<GeometryLabComplexityLimits> = {},
): GeometryLabReductionResult {
  const limits = resolveGeometryLabComplexityLimits(complexityLimits);
  assertGeometryLabSnapshotComplexity(snapshot, limits);
  assertGeometryLabDeltaComplexity(delta, limits);
  const snapshotValidation = validateGeometryLabSnapshot(snapshot, limits);
  if (!snapshotValidation.ok) {
    throw new KleinSdkError(
      'invalid_snapshot',
      'Geometry Lab snapshot is invalid.',
      snapshotValidation.issues as unknown as JsonValue,
    );
  }
  const deltaValidation = validateGeometryLabDelta(delta, limits);
  if (!deltaValidation.ok) {
    throw new KleinSdkError(
      'invalid_delta',
      'Geometry Lab delta is invalid.',
      deltaValidation.issues as unknown as JsonValue,
    );
  }
  const before = normalizeGeometryLabSnapshot(snapshotValidation.value);
  const reduced = reduceOwnedGeometryLabDelta(before, deltaValidation.value, limits, false);
  return {
    snapshot: reduced.snapshot,
    changed: reduced.changed,
  };
}

/** Compatibility reducer returning only the next snapshot. */
export function applyGeometryLabDelta(
  snapshot: GeometryLabSnapshot,
  delta: GeometryLabDelta,
  complexityLimits: Partial<GeometryLabComplexityLimits> = {},
): GeometryLabSnapshot {
  return reduceGeometryLabDelta(snapshot, delta, complexityLimits).snapshot;
}

/** Fast transactional path for the instrument's already-owned canonical state. */
export function reduceOwnedGeometryLabDelta(
  snapshot: GeometryLabSnapshot,
  delta: GeometryLabDelta,
  complexityLimits: Partial<GeometryLabComplexityLimits>,
  captureHistoryValues: boolean,
): GeometryLabReductionResult & { historyDiff: GeometryLabHistoryDiff } {
  const limits = resolveGeometryLabComplexityLimits(complexityLimits);
  assertGeometryLabDeltaComplexity(delta, limits);
  const deltaValidation = validateGeometryLabDeltaShape(delta, limits.maxValidationIssues);
  if (!deltaValidation.ok) {
    throw new KleinSdkError(
      'invalid_delta',
      'Geometry Lab delta is invalid.',
      deltaValidation.issues as unknown as JsonValue,
    );
  }
  const ownedDelta = cloneGeometryLabDelta(deltaValidation.value);
  const rebuildEquationIds = equationSurfaceIdsTouchedByDelta(snapshot, ownedDelta);
  const reduced = applyGeometryLabDeltaUnchecked(snapshot, ownedDelta);
  const reducedValidation = validateGeometryLabSnapshotShape(reduced, limits.maxValidationIssues);
  if (!reducedValidation.ok) {
    throw new KleinSdkError(
      'invalid_delta_result',
      'Geometry Lab delta produced an invalid snapshot.',
      reducedValidation.issues as unknown as JsonValue,
    );
  }
  const next = canonicalizeGeometryLabBoundary(
    reducedValidation.value,
    'invalid_delta_result',
    'Geometry Lab delta produced geometry that could not be canonically recomputed.',
    limits,
    true,
    rebuildEquationIds,
  );
  const invariantIssues = getGeometryLabInvariantIssues(next);
  if (invariantIssues.length > 0) {
    throw new KleinSdkError(
      'invalid_delta_result',
      'Geometry Lab delta produced a snapshot with dangling or inconsistent references.',
      invariantIssues.slice(0, limits.maxValidationIssues) as unknown as JsonValue,
    );
  }
  const historyDiff = diffGeometryLabHistory(snapshot, next, captureHistoryValues);
  return {
    snapshot: next,
    changed: historyDiff.refKeys.length > 0,
    historyDiff,
  };
}

function equationSurfaceIdsTouchedByDelta(
  snapshot: GeometryLabSnapshot,
  delta: GeometryLabDelta,
  result = new Set<string>(),
): Set<string> {
  if (delta.op === 'batch') {
    for (const child of delta.deltas) equationSurfaceIdsTouchedByDelta(snapshot, child, result);
  } else if (delta.op === 'addEntity3D') {
    if (delta.entity.kind === 'surface3d' && delta.entity.surfaceKind === 'equation') {
      result.add(delta.entity.id);
    }
  } else if (delta.op === 'updateEntity') {
    const existing = snapshot.scene.scene3d.entities[delta.id];
    if (
      (existing?.kind === 'surface3d' && existing.surfaceKind === 'equation')
      || (delta.changes.kind === 'surface3d' && delta.changes.surfaceKind === 'equation')
    ) {
      result.add(delta.id);
    }
  } else if (delta.op === 'historyPatch') {
    for (const patch of delta.patches) {
      if (patch.ref.collection === 'entity3d') result.add(patch.ref.id);
    }
  }
  return result;
}

function applyGeometryLabDeltaUnchecked(
  snapshot: GeometryLabSnapshot,
  delta: GeometryLabDelta,
): GeometryLabSnapshot {
  switch (delta.op) {
    case 'batch':
      return delta.deltas.reduce(applyGeometryLabDeltaUnchecked, snapshot);
    case 'historyPatch':
      return applyGeometryLabHistoryPatches(snapshot, delta.patches);
    case 'addPoint2D':
      assertGeometryLabIdAvailable(snapshot, delta.point.id, delta.op);
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          scene2d: {
            ...snapshot.scene.scene2d,
            points: { ...snapshot.scene.scene2d.points, [delta.point.id]: delta.point },
          },
        },
      };
    case 'addPoint3D':
      assertGeometryLabIdAvailable(snapshot, delta.point.id, delta.op);
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          scene3d: {
            ...snapshot.scene.scene3d,
            points: { ...snapshot.scene.scene3d.points, [delta.point.id]: delta.point },
          },
        },
      };
    case 'updatePoint': {
      const point2d = snapshot.scene.scene2d.points[delta.id];
      if (point2d) {
        assertGeometryLabIdentityChanges(delta.id, point2d.kind, delta.changes, delta.op);
        return {
          ...snapshot,
          scene: {
            ...snapshot.scene,
            scene2d: {
              ...snapshot.scene.scene2d,
              points: {
                ...snapshot.scene.scene2d.points,
                [delta.id]: { ...point2d, ...delta.changes } as GeometryPoint2D,
              },
            },
          },
        };
      }
      const point3d = snapshot.scene.scene3d.points[delta.id];
      if (!point3d) return snapshot;
      assertGeometryLabIdentityChanges(delta.id, point3d.kind, delta.changes, delta.op);
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          scene3d: {
            ...snapshot.scene.scene3d,
            points: {
              ...snapshot.scene.scene3d.points,
              [delta.id]: { ...point3d, ...delta.changes } as GeometryPoint3D,
            },
          },
        },
      };
    }
    case 'addEntity2D':
      assertGeometryLabIdAvailable(snapshot, delta.entity.id, delta.op);
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          scene2d: {
            ...snapshot.scene.scene2d,
            entities: { ...snapshot.scene.scene2d.entities, [delta.entity.id]: delta.entity },
          },
        },
      };
    case 'addEntity3D':
      assertGeometryLabIdAvailable(snapshot, delta.entity.id, delta.op);
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          scene3d: {
            ...snapshot.scene.scene3d,
            entities: { ...snapshot.scene.scene3d.entities, [delta.entity.id]: delta.entity },
          },
        },
      };
    case 'updateEntity': {
      const entity2d = snapshot.scene.scene2d.entities[delta.id];
      if (entity2d) {
        assertGeometryLabIdentityChanges(delta.id, entity2d.kind, delta.changes, delta.op);
        return {
          ...snapshot,
          scene: {
            ...snapshot.scene,
            scene2d: {
              ...snapshot.scene.scene2d,
              entities: {
                ...snapshot.scene.scene2d.entities,
                [delta.id]: { ...entity2d, ...delta.changes } as GeometryEntity,
              },
            },
          },
        };
      }
      const entity3d = snapshot.scene.scene3d.entities[delta.id];
      if (!entity3d) return snapshot;
      assertGeometryLabIdentityChanges(delta.id, entity3d.kind, delta.changes, delta.op);
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          scene3d: {
            ...snapshot.scene.scene3d,
            entities: {
              ...snapshot.scene.scene3d.entities,
              [delta.id]: { ...entity3d, ...delta.changes } as GeometryEntity3D,
            },
          },
        },
      };
    }
    case 'addWorkPlane':
      assertGeometryLabIdAvailable(snapshot, delta.plane.id, delta.op);
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          scene3d: {
            ...snapshot.scene.scene3d,
            workPlanes: { ...snapshot.scene.scene3d.workPlanes, [delta.plane.id]: delta.plane },
          },
        },
        appState: { ...snapshot.appState, activeWorkPlaneId: delta.plane.id },
      };
    case 'updateWorkPlane': {
      const current = snapshot.scene.scene3d.workPlanes[delta.id];
      if (!current) return snapshot;
      assertGeometryLabIdentityChanges(delta.id, undefined, delta.changes, delta.op);
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          scene3d: {
            ...snapshot.scene.scene3d,
            workPlanes: {
              ...snapshot.scene.scene3d.workPlanes,
              [delta.id]: { ...current, ...delta.changes },
            },
          },
        },
      };
    }
    case 'deleteWorkPlane':
      return deleteGeometryLabIds(
        snapshot,
        delta.ids.map(id => ({ collection: 'workPlane', id })),
      );
    case 'addMeasurement':
      assertGeometryLabIdAvailable(snapshot, delta.measurement.id, delta.op);
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          scene3d: {
            ...snapshot.scene.scene3d,
            measurements: {
              ...snapshot.scene.scene3d.measurements,
              [delta.measurement.id]: delta.measurement,
            },
          },
        },
      };
    case 'updateMeasurement': {
      const current = snapshot.scene.scene3d.measurements[delta.id];
      if (!current) return snapshot;
      assertGeometryLabIdentityChanges(delta.id, current.kind, delta.changes, delta.op);
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          scene3d: {
            ...snapshot.scene.scene3d,
            measurements: {
              ...snapshot.scene.scene3d.measurements,
              [delta.id]: { ...current, ...delta.changes },
            },
          },
        },
      };
    }
    case 'deleteMeasurement':
      return deleteGeometryLabIds(
        snapshot,
        delta.ids.map(id => ({ collection: 'measurement', id })),
      );
    case 'addNet':
      assertGeometryLabIdAvailable(snapshot, delta.net.id, delta.op);
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          scene3d: {
            ...snapshot.scene.scene3d,
            nets: { ...snapshot.scene.scene3d.nets, [delta.net.id]: delta.net },
          },
        },
      };
    case 'deleteNet':
      return deleteGeometryLabIds(
        snapshot,
        delta.ids.map(id => ({ collection: 'net', id })),
      );
    case 'delete':
      return deleteGeometryLabIds(snapshot, delta.ids);
    case 'setSceneLink': {
      const existing = snapshot.scene.links.find(link => link.id === delta.link.id);
      if (existing) {
        if (jsonValuesEqual(existing, delta.link)) return snapshot;
        throw duplicateGeometryLabIdError(delta.link.id, delta.op, 'scene.links');
      }
      assertGeometryLabIdAvailable(snapshot, delta.link.id, delta.op);
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          links: [...snapshot.scene.links, delta.link],
        },
      };
    }
    case 'setAppState':
      return { ...snapshot, appState: { ...snapshot.appState, ...delta.changes } };
    case 'setView3D':
      return { ...snapshot, appState: { ...snapshot.appState, view3d: delta.view } };
    case 'clear2D':
      return clearGeometryLabScope(snapshot, '2d');
    case 'clear3D':
      return clearGeometryLabScope(snapshot, '3d');
    case 'clearAll':
      return clearGeometryLabScope(snapshot, 'all');
  }
}

function canonicalizeGeometryLabBoundary(
  snapshot: GeometryLabSnapshot,
  code: 'invalid_snapshot' | 'invalid_initial_snapshot' | 'invalid_delta_result',
  message: string,
  complexityLimits: Partial<GeometryLabComplexityLimits> = {},
  reuseSurfaceMeshCaches = false,
  equationEntityIds?: ReadonlySet<string>,
): GeometryLabSnapshot {
  try {
    assertGeometryLabSnapshotComplexity(snapshot, complexityLimits);
    const canonical = canonicalizeEquationSurfaceCaches(
      canonicalizeGeometryLabSnapshotBase(snapshot, { reuseSurfaceMeshCaches }),
      equationEntityIds,
    );
    assertGeometryLabSnapshotComplexity(canonical, complexityLimits);
    return canonical;
  } catch (error) {
    if (error instanceof KleinSdkError && error.code === 'geometry_lab_snapshot_too_complex') throw error;
    const details: JsonObject = error instanceof GeometryLabCanonicalizationError
      ? {
          canonicalizationCode: error.code,
          objectId: error.objectId,
          message: error.message,
        }
      : {
          message: error instanceof Error ? error.message : 'Unknown canonicalization failure.',
        };
    throw new KleinSdkError(code, message, details);
  }
}

function assertGeometryLabIdAvailable(
  snapshot: GeometryLabSnapshot,
  id: string,
  op: GeometryLabDelta['op'],
): void {
  if (typeof id !== 'string' || id.length === 0) {
    throw new KleinSdkError('invalid_id', `Geometry Lab ${op} requires a non-empty id.`);
  }
  const existingPath = geometryLabIdPath(snapshot, id);
  if (existingPath) throw duplicateGeometryLabIdError(id, op, existingPath);
}

function duplicateGeometryLabIdError(
  id: string,
  op: GeometryLabDelta['op'],
  existingPath: string,
): KleinSdkError {
  return new KleinSdkError(
    'duplicate_id',
    `Geometry Lab id "${id}" already exists.`,
    { id, op, existingPath },
  );
}

function assertGeometryLabIdentityChanges(
  id: string,
  kind: string | undefined,
  changes: object,
  op: GeometryLabDelta['op'],
): void {
  const record = changes as Record<string, unknown>;
  if (Object.hasOwn(record, 'id') && record.id !== id) {
    throw new KleinSdkError('immutable_id', `Geometry Lab ${op} cannot change object id "${id}".`);
  }
  if (kind !== undefined && Object.hasOwn(record, 'kind') && record.kind !== kind) {
    throw new KleinSdkError('immutable_kind', `Geometry Lab ${op} cannot change object kind "${kind}".`);
  }
}

type GeometryLabClearScope = '2d' | '3d' | 'all';

function clearGeometryLabScope(
  snapshot: GeometryLabSnapshot,
  scope: GeometryLabClearScope,
): GeometryLabSnapshot {
  const targets: GeometryLabDependencyRef[] = [];
  const addTargets = (
    collection: GeometryLabDependencyRef['collection'],
    ids: readonly string[],
  ): void => {
    for (const id of [...ids].sort()) targets.push({ collection, id });
  };

  if (scope === '2d' || scope === 'all') {
    addTargets('point2d', Object.keys(snapshot.scene.scene2d.points));
    addTargets('entity2d', Object.keys(snapshot.scene.scene2d.entities));
    addTargets('constraint2d', Object.keys(snapshot.scene.scene2d.constraints ?? {}));
  }
  if (scope === '3d' || scope === 'all') {
    addTargets('point3d', Object.keys(snapshot.scene.scene3d.points));
    addTargets('entity3d', Object.keys(snapshot.scene.scene3d.entities));
    addTargets(
      'workPlane',
      Object.keys(snapshot.scene.scene3d.workPlanes).filter(id => id !== 'xy'),
    );
    addTargets('measurement', Object.keys(snapshot.scene.scene3d.measurements));
    addTargets('net', Object.keys(snapshot.scene.scene3d.nets));
  }
  if (scope === 'all') {
    addTargets('link', snapshot.scene.links.map(link => link.id));
  }

  const cleared = deleteGeometryLabIds(snapshot, targets);
  return scope === 'all' ? createEmptyGeometryLabSnapshot() : cleared;
}

function deleteGeometryLabIds(
  snapshot: GeometryLabSnapshot,
  targets: readonly (string | GeometryLabDependencyRef)[],
): GeometryLabSnapshot {
  const graph = buildGeometryLabDependencyGraph(snapshot);
  const plan = planGeometryLabCascadeDeletion(graph, targets);
  if (!plan.ok) {
    throw new KleinSdkError(
      'dependency_delete_blocked',
      'Geometry Lab deletion includes a protected object or a dependency that rejects deletion.',
      {
        blockers: plan.blockers.map(blocker => ({
          collection: blocker.ref.collection,
          id: blocker.ref.id,
          reason: blocker.reason,
          ...(blocker.dependentKey === undefined ? {} : { dependentKey: blocker.dependentKey }),
        })),
      },
    );
  }
  if (
    plan.deleteRefs.length === 0
    && plan.pruneSelectionIndexes.length === 0
    && !plan.resetActiveWorkPlane
  ) {
    return snapshot;
  }

  const scene2dPoints = { ...snapshot.scene.scene2d.points };
  const scene2dEntities = { ...snapshot.scene.scene2d.entities };
  const scene2dConstraints = { ...(snapshot.scene.scene2d.constraints ?? {}) };
  const scene3dPoints = { ...snapshot.scene.scene3d.points };
  const scene3dEntities = { ...snapshot.scene.scene3d.entities };
  const workPlanes = { ...snapshot.scene.scene3d.workPlanes };
  const measurements = { ...snapshot.scene.scene3d.measurements };
  const nets = { ...snapshot.scene.scene3d.nets };
  const linkIds = new Set<string>();
  for (const ref of plan.deleteRefs) {
    switch (ref.collection) {
      case 'point2d': delete scene2dPoints[ref.id]; break;
      case 'entity2d': delete scene2dEntities[ref.id]; break;
      case 'constraint2d': delete scene2dConstraints[ref.id]; break;
      case 'point3d': delete scene3dPoints[ref.id]; break;
      case 'entity3d': delete scene3dEntities[ref.id]; break;
      case 'workPlane': delete workPlanes[ref.id]; break;
      case 'measurement': delete measurements[ref.id]; break;
      case 'net': delete nets[ref.id]; break;
      case 'link': linkIds.add(ref.id); break;
      case 'appSelection':
      case 'activeWorkPlane':
        break;
    }
  }

  const currentActive = snapshot.appState.activeWorkPlaneId;
  const activeWorkPlaneId = plan.resetActiveWorkPlane
    || !currentActive
    || !workPlanes[currentActive]
    ? 'xy'
    : currentActive;
  const appState: GeometryLabAppState = {
    ...snapshot.appState,
    activeWorkPlaneId,
  };
  if (snapshot.appState.selected !== undefined) {
    const pruneSelectionIndexes = new Set(plan.pruneSelectionIndexes);
    appState.selected = snapshot.appState.selected.filter((_, index) => !pruneSelectionIndexes.has(index));
  }
  return {
    ...snapshot,
    scene: {
      scene2d: {
        ...snapshot.scene.scene2d,
        points: scene2dPoints,
        entities: scene2dEntities,
        constraints: scene2dConstraints,
      },
      scene3d: {
        ...snapshot.scene.scene3d,
        points: scene3dPoints,
        entities: scene3dEntities,
        workPlanes,
        measurements,
        nets,
      },
      links: snapshot.scene.links.filter(link => !linkIds.has(link.id)),
    },
    appState,
  };
}

function cloneSnapshot(snapshot: GeometryLabSnapshot): GeometryLabSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as GeometryLabSnapshot;
}

function cloneGeometryLabDelta(delta: GeometryLabDelta): GeometryLabDelta {
  return JSON.parse(JSON.stringify(delta)) as GeometryLabDelta;
}
