import type { JsonValue, ValidationResult, Vector2, View2D } from '../core/index.js';
import { KleinSdkError } from '../core/index.js';
import type { GeometryConstraint, GeometryEntity } from '../geometry-core/index.js';
import { createEmptyGeometryScene, recomputeGeometryScene } from '../geometry-core/index.js';
import { DEFAULT_SNAP_MODES, DEFAULT_SNAP_SETTINGS, DEFAULT_UNIT_SIZE, MAX_ZOOM, MIN_ZOOM } from './constants.js';
import { clamp, isRecord, normalizeAngleDelta } from './geometry-math.js';
import { deleteGeometryIds, normalizeEntityOrder, normalizeGroups, normalizeSelection, selectionItemsFromArray } from './selection.js';
import type { GeometryCalculatorDelta, GeometryCalculatorScene, GeometryCalculatorSnapshot, GeometryCalculatorTool, GeometryGridOptions, GeometryGridOptionsPatch, GeometrySnapSettings, GeometrySnapSettingsPatch, ScreenRectLike } from './types.js';

/** Creates a blank 2D geometry calculator snapshot. */
export function createEmptyGeometryCalculatorSnapshot(
  options: {
    unitSize?: number;
    gridMajorEvery?: number;
    snapToGrid?: boolean;
    activeTool?: GeometryCalculatorTool;
  } = {},
): GeometryCalculatorSnapshot {
  return {
    version: 1,
    instrument: 'geometry',
    scene: {
      ...createEmptyGeometryScene(),
      order: [],
    },
    appState: {
      view: { x: 0, y: 0, zoom: 1 },
      activeTool: options.activeTool ?? 'select',
      selected: null,
      groups: {},
      grid: {
        unitSize: positiveNumber(options.unitSize, DEFAULT_UNIT_SIZE),
        majorEvery: Math.max(1, Math.round(positiveNumber(options.gridMajorEvery, 5))),
        snap: options.snapToGrid ?? true,
        labels: true,
        snapping: {
          ...DEFAULT_SNAP_SETTINGS,
          enabled: options.snapToGrid ?? DEFAULT_SNAP_SETTINGS.enabled,
          modes: { ...DEFAULT_SNAP_MODES },
        },
      },
    },
  };
}


export function parseGeometryCalculatorSnapshotJson(input: string | JsonValue): GeometryCalculatorSnapshot {
  const parsed = typeof input === 'string'
    ? JSON.parse(input) as unknown
    : input;
  const validation = validateGeometryCalculatorSnapshot(parsed);
  if (!validation.ok) {
    throw new KleinSdkError('invalid_snapshot', 'Geometry calculator snapshot is invalid.', validation.issues as unknown as JsonValue);
  }
  return validation.value;
}


export function validateGeometryCalculatorSnapshot(value: unknown): ValidationResult<GeometryCalculatorSnapshot> {
  const issues: Array<{ path: string; message: string }> = [];
  if (!isRecord(value)) return { ok: false, issues: [{ path: '', message: 'Snapshot must be an object.' }] };
  if (value.version !== 1) issues.push({ path: 'version', message: 'Expected geometry snapshot version 1.' });
  if (value.instrument !== 'geometry') issues.push({ path: 'instrument', message: 'Expected geometry instrument.' });
  if (!isRecord(value.scene)) issues.push({ path: 'scene', message: 'Scene must be an object.' });
  if (!isRecord(value.appState)) issues.push({ path: 'appState', message: 'App state must be an object.' });
  if (isRecord(value.scene)) {
    if (!isRecord(value.scene.points)) issues.push({ path: 'scene.points', message: 'Scene points must be an object.' });
    if (!isRecord(value.scene.entities)) issues.push({ path: 'scene.entities', message: 'Scene entities must be an object.' });
    if (!Array.isArray(value.scene.order)) issues.push({ path: 'scene.order', message: 'Scene order must be an array.' });
  }
  return issues.length
    ? { ok: false, issues }
    : { ok: true, value: value as GeometryCalculatorSnapshot };
}


/** Converts a client/screen coordinate into world units for a given view. */
export function screenToGeometryWorld(
  point: Vector2,
  view: View2D,
  unitSize = DEFAULT_UNIT_SIZE,
  rect: Pick<ScreenRectLike, 'left' | 'top'> = { left: 0, top: 0 },
): Vector2 {
  const scale = unitSize * view.zoom;
  return {
    x: (point.x - rect.left - view.x) / scale,
    y: (view.y - (point.y - rect.top)) / scale,
  };
}


/** Converts world units into screen coordinates for a given view. */
export function geometryWorldToScreen(
  point: Vector2,
  view: View2D,
  unitSize = DEFAULT_UNIT_SIZE,
): Vector2 {
  const scale = unitSize * view.zoom;
  return {
    x: view.x + point.x * scale,
    y: view.y - point.y * scale,
  };
}


/** Clamps 2D canvas zoom to the range used by the interactive geometry surface. */
export function clampGeometryZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}


/** Applies one geometry calculator delta to a snapshot. */
export function applyGeometryCalculatorDelta(
  snapshot: GeometryCalculatorSnapshot,
  delta: GeometryCalculatorDelta,
): GeometryCalculatorSnapshot {
  const next = applyGeometryCalculatorDeltaRaw(snapshot, delta);
  if (!geometryDeltaChangesScene(delta)) return next;
  return {
    ...next,
    scene: recomputeGeometryScene(next.scene),
  };
}


export function applyGeometryCalculatorDeltaRaw(
  snapshot: GeometryCalculatorSnapshot,
  delta: GeometryCalculatorDelta,
): GeometryCalculatorSnapshot {
  switch (delta.op) {
    case 'batch':
      return delta.deltas.reduce(applyGeometryCalculatorDeltaRaw, snapshot);
    case 'clear':
      return {
        ...snapshot,
        scene: { ...createEmptyGeometryScene(), order: [] },
        appState: { ...snapshot.appState, selected: null, groups: {} },
      };
    case 'setTool':
      return { ...snapshot, appState: { ...snapshot.appState, activeTool: delta.tool } };
    case 'setSelection':
      return { ...snapshot, appState: { ...snapshot.appState, selected: normalizeSelection(delta.selection) } };
    case 'setView':
      return { ...snapshot, appState: { ...snapshot.appState, view: { ...delta.view, zoom: clampGeometryZoom(delta.view.zoom) } } };
    case 'setGrid':
      return {
        ...snapshot,
        appState: {
          ...snapshot.appState,
          grid: normalizeGridOptions(snapshot.appState.grid, delta.grid),
        },
      };
    case 'setOrder':
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          order: normalizeEntityOrder(delta.order, snapshot.scene.entities),
        },
      };
    case 'addGroup':
      return {
        ...snapshot,
        appState: {
          ...snapshot.appState,
          groups: {
            ...snapshot.appState.groups,
            [delta.group.id]: {
              ...delta.group,
              items: selectionItemsFromArray(delta.group.items),
            },
          },
        },
      };
    case 'deleteGroup': {
      const groups = { ...snapshot.appState.groups };
      for (const id of delta.ids) delete groups[id];
      return {
        ...snapshot,
        appState: {
          ...snapshot.appState,
          groups,
        },
      };
    }
    case 'addPoint':
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          points: { ...snapshot.scene.points, [delta.point.id]: delta.point },
        },
      };
    case 'updatePoint': {
      const current = snapshot.scene.points[delta.id];
      if (!current || current.kind !== 'point2d') return snapshot;
      const next = { ...current, ...delta.changes, kind: 'point2d' as const };
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          points: { ...snapshot.scene.points, [delta.id]: next },
        },
      };
    }
    case 'addEntity':
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          entities: { ...snapshot.scene.entities, [delta.entity.id]: delta.entity },
          order: snapshot.scene.order.includes(delta.entity.id)
            ? snapshot.scene.order
            : [...snapshot.scene.order, delta.entity.id],
        },
      };
    case 'updateEntity': {
      const current = snapshot.scene.entities[delta.id];
      if (!current) return snapshot;
      const next = { ...current, ...delta.changes } as GeometryEntity;
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          entities: { ...snapshot.scene.entities, [delta.id]: next },
        },
      };
    }
    case 'addConstraint':
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          constraints: { ...(snapshot.scene.constraints ?? {}), [delta.constraint.id]: delta.constraint },
        },
      };
    case 'updateConstraint': {
      const current = snapshot.scene.constraints?.[delta.id];
      if (!current) return snapshot;
      const next = { ...current, ...delta.changes, id: current.id } as GeometryConstraint;
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          constraints: { ...(snapshot.scene.constraints ?? {}), [delta.id]: next },
        },
      };
    }
    case 'deleteConstraint': {
      const constraints = { ...(snapshot.scene.constraints ?? {}) };
      for (const id of delta.ids) delete constraints[id];
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          constraints,
        },
      };
    }
    case 'delete':
      return deleteGeometryIds(snapshot, delta.ids);
  }
}


export function geometryDeltaChangesScene(delta: GeometryCalculatorDelta): boolean {
  switch (delta.op) {
    case 'addPoint':
    case 'updatePoint':
    case 'addEntity':
    case 'updateEntity':
    case 'addConstraint':
    case 'updateConstraint':
    case 'deleteConstraint':
    case 'delete':
    case 'clear':
      return true;
    case 'batch':
      return delta.deltas.some(geometryDeltaChangesScene);
    case 'setTool':
    case 'setSelection':
    case 'setView':
    case 'setGrid':
    case 'setOrder':
    case 'addGroup':
    case 'deleteGroup':
      return false;
  }
}


export function normalizeSnapshot(snapshot: GeometryCalculatorSnapshot): GeometryCalculatorSnapshot {
  const fallback = createEmptyGeometryCalculatorSnapshot();
  const scene = recomputeGeometryScene({
    points: { ...snapshot.scene.points },
    entities: { ...snapshot.scene.entities },
    constraints: { ...(snapshot.scene.constraints ?? {}) },
    order: snapshot.scene.order
      ? [...snapshot.scene.order]
      : Object.keys(snapshot.scene.entities),
  });
  return {
    ...fallback,
    ...snapshot,
    scene,
    appState: {
      ...fallback.appState,
      ...snapshot.appState,
      view: {
        ...fallback.appState.view,
        ...snapshot.appState.view,
        zoom: clampGeometryZoom(snapshot.appState.view.zoom),
      },
      grid: {
        ...normalizeGridOptions(fallback.appState.grid, snapshot.appState.grid),
      },
      selected: normalizeSelection(snapshot.appState.selected ?? null),
      groups: normalizeGroups(snapshot.appState.groups ?? {}),
    },
  };
}


export function normalizeGridOptions(
  base: GeometryGridOptions,
  patch: GeometryGridOptionsPatch = {},
): GeometryGridOptions {
  const previousSnap = base.snapping ?? DEFAULT_SNAP_SETTINGS;
  const patchSnap: GeometrySnapSettingsPatch = patch.snapping ?? {};
  const enabled = patch.snap ?? patchSnap.enabled ?? previousSnap.enabled ?? base.snap ?? DEFAULT_SNAP_SETTINGS.enabled;
  const snapping: GeometrySnapSettings = {
    enabled,
    strength: clamp(finiteNumber(patchSnap.strength, previousSnap.strength ?? DEFAULT_SNAP_SETTINGS.strength), 0.1, 3),
    showMarkers: patchSnap.showMarkers ?? previousSnap.showMarkers ?? DEFAULT_SNAP_SETTINGS.showMarkers,
    modes: {
      ...DEFAULT_SNAP_MODES,
      ...(previousSnap.modes ?? {}),
      ...(patchSnap.modes ?? {}),
    },
  };
  return {
    unitSize: positiveNumber(patch.unitSize, positiveNumber(base.unitSize, DEFAULT_UNIT_SIZE)),
    majorEvery: Math.max(1, Math.round(positiveNumber(patch.majorEvery, positiveNumber(base.majorEvery, 5)))),
    labels: patch.labels ?? base.labels ?? true,
    snap: enabled,
    snapping,
  };
}


export function cloneSnapSettings(settings: GeometrySnapSettings): GeometrySnapSettings {
  return {
    ...settings,
    modes: { ...settings.modes },
  };
}


export function effectiveSnapSettings(
  settings: GeometrySnapSettings,
  event: Pick<PointerEvent, 'altKey' | 'shiftKey'> | undefined,
): GeometrySnapSettings {
  const next = cloneSnapSettings(settings);
  if (event?.altKey) next.enabled = false;
  if (event?.shiftKey) {
    next.enabled = true;
    next.modes.angles = true;
  }
  return next;
}


export function changedIdsFromDeltas(deltas: GeometryCalculatorDelta[]): string[] {
  const ids = new Set<string>();
  for (const delta of deltas) {
    if (delta.op === 'batch') {
      for (const id of changedIdsFromDeltas(delta.deltas)) ids.add(id);
    } else if ('id' in delta && typeof delta.id === 'string') {
      ids.add(delta.id);
    }
  }
  return [...ids];
}


export function geometrySceneUpdateDeltas(
  before: GeometryCalculatorScene,
  after: GeometryCalculatorScene,
): GeometryCalculatorDelta[] {
  const deltas: GeometryCalculatorDelta[] = [];
  for (const [id, next] of Object.entries(after.points)) {
    const previous = before.points[id];
    if (previous?.kind !== 'point2d' || next.kind !== 'point2d') continue;
    if (Math.abs(previous.x - next.x) <= 1e-9 && Math.abs(previous.y - next.y) <= 1e-9) continue;
    deltas.push({ op: 'updatePoint', id, changes: { x: next.x, y: next.y } });
  }
  for (const [id, next] of Object.entries(after.entities)) {
    const previous = before.entities[id];
    if (!previous || JSON.stringify(previous) === JSON.stringify(next)) continue;
    deltas.push({ op: 'updateEntity', id, changes: { ...next } as Partial<GeometryEntity> });
  }
  return deltas;
}


export function dot(first: Vector2, second: Vector2): number {
  return first.x * second.x + first.y * second.y;
}


export function angularDistance(first: number, second: number): number {
  return Math.abs(normalizeAngleDelta(first - second));
}


export function cloneSnapshot(snapshot: GeometryCalculatorSnapshot): GeometryCalculatorSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as GeometryCalculatorSnapshot;
}


export function positiveNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}


export function finiteNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}


export function isCornerOriginView(view: View2D): boolean {
  return Math.abs(view.x) < 1e-9 && Math.abs(view.y) < 1e-9;
}


export function deltaAddedEntityId(delta: GeometryCalculatorDelta, kind: GeometryEntity['kind']): string | null {
  if (delta.op === 'addEntity' && delta.entity.kind === kind) return delta.entity.id;
  if (delta.op === 'batch') {
    for (const child of delta.deltas) {
      const id = deltaAddedEntityId(child, kind);
      if (id) return id;
    }
  }
  return null;
}


export function chooseGridStep(pixelScale: number): number {
  let step = 1;
  while (pixelScale * step < 24) step *= 2;
  while (pixelScale * step > 120 && step > 0.25) step /= 2;
  return step;
}


export function isMajorGridLine(value: number, majorEvery: number): boolean {
  const rounded = Math.round(value / majorEvery) * majorEvery;
  return Math.abs(value - rounded) < 1e-9;
}


export function formatGridLabel(value: number): string {
  return Math.abs(value - Math.round(value)) < 1e-9 ? String(Math.round(value)) : value.toFixed(2);
}


export function geometrySnapshotJson(snapshot: GeometryCalculatorSnapshot, includeAppState: boolean): JsonValue {
  if (includeAppState) return snapshot as unknown as JsonValue;
  const { appState: _appState, ...rest } = snapshot;
  return rest as unknown as JsonValue;
}

