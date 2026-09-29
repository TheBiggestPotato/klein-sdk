import type { Vector2 } from '../core/index.js';
import { KleinSdkError, createIdFactory } from '../core/index.js';
import type { AngleEntity, ArcEntity, CircleEntity, ConicEntity, GeometryEntity, GeometryPoint2D, GeometryRelationMarkerEntity, LineEntity, LocusEntity, ParametricCurveEntity, PlaneEntity, PolygonEntity, RayEntity, SegmentEntity, VectorEntity } from '../geometry-core/index.js';
import { constrainGeometryScene, distance2D, geometryConstraintDependencies, geometryDependentsOf, geometryEntityPointIds, recomputeGeometryScene } from '../geometry-core/index.js';
import { clipLineToBounds, clipRayToBounds, lineEquationFromEntityPoints } from './equations.js';
import { clamp, normalizeVector, pointInPolygon, polygonCentroid, rectContainsPoint, regularPolygonCoordinates, segmentIntersectsRect } from './geometry-math.js';
import { isPoint2D, orderedEntities, point2D } from './scene.js';
import { isSampledCurveEntity, relationMarkerAnchor, sampledCurveSegments } from './snap.js';
import { geometrySceneUpdateDeltas } from './snapshot.js';
import type { DragState, GeometryCalculatorDelta, GeometryCalculatorScene, GeometryCalculatorSelectable, GeometryCalculatorSelection, GeometryCalculatorSnapshot, GeometryObjectEditOptions, GeometryObjectGroup, GeometryReflectionAxis, GeometryStyleOptions, SelectionTransformTargets, WorldBounds } from './types.js';

export function normalizeSelection(selection: GeometryCalculatorSelection | null | undefined): GeometryCalculatorSelection | null {
  if (!selection) return null;
  if (selection.kind === 'point' || selection.kind === 'entity') {
    return { kind: selection.kind, id: selection.id };
  }
  return selectionFromItems(selection.items);
}


export function cloneSelection(selection: GeometryCalculatorSelection | null): GeometryCalculatorSelection | null {
  const normalized = normalizeSelection(selection);
  if (!normalized) return null;
  if (normalized.kind === 'multi') return { kind: 'multi', items: [...normalized.items] };
  return { ...normalized };
}


export function selectionItems(selection: GeometryCalculatorSelection | null | undefined): GeometryCalculatorSelectable[] {
  if (!selection) return [];
  if (selection.kind === 'multi') return selectionItemsFromArray(selection.items);
  return [{ kind: selection.kind, id: selection.id }];
}


export function selectionItemsFromArray(items: GeometryCalculatorSelectable[]): GeometryCalculatorSelectable[] {
  const seen = new Set<string>();
  const result: GeometryCalculatorSelectable[] = [];
  for (const item of items) {
    if (!item.id || (item.kind !== 'point' && item.kind !== 'entity')) continue;
    const key = selectionKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ kind: item.kind, id: item.id });
  }
  return result;
}


export function selectionFromItems(items: GeometryCalculatorSelectable[]): GeometryCalculatorSelection | null {
  const normalized = selectionItemsFromArray(items);
  if (normalized.length === 0) return null;
  if (normalized.length === 1) return normalized[0] as GeometryCalculatorSelectable;
  return { kind: 'multi', items: normalized };
}


export function selectionKey(item: GeometryCalculatorSelectable): string {
  return `${item.kind}:${item.id}`;
}


export function selectionHasItem(selection: GeometryCalculatorSelection | null | undefined, item: GeometryCalculatorSelectable): boolean {
  return selectionItems(selection).some(candidate => candidate.kind === item.kind && candidate.id === item.id);
}


export function toggleSelectionItem(
  selection: GeometryCalculatorSelection | null | undefined,
  item: GeometryCalculatorSelectable,
): GeometryCalculatorSelection | null {
  const key = selectionKey(item);
  const items = selectionItems(selection);
  if (items.some(candidate => selectionKey(candidate) === key)) {
    return selectionFromItems(items.filter(candidate => selectionKey(candidate) !== key));
  }
  return selectionFromItems([...items, item]);
}


export function normalizeGroups(groups: Record<string, GeometryObjectGroup>): Record<string, GeometryObjectGroup> {
  const normalized: Record<string, GeometryObjectGroup> = {};
  for (const [id, group] of Object.entries(groups)) {
    const items = selectionItemsFromArray(group.items ?? []);
    if (!id || !items.length) continue;
    const next: GeometryObjectGroup = { id, items };
    if (group.label !== undefined) next.label = group.label;
    if (group.locked !== undefined) next.locked = group.locked;
    if (group.hidden !== undefined) next.hidden = group.hidden;
    if (group.createdAt !== undefined) next.createdAt = group.createdAt;
    normalized[id] = next;
  }
  return normalized;
}


export function normalizeEntityOrder(order: string[], entities: Record<string, GeometryEntity>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of order) {
    if (!entities[id] || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  for (const id of Object.keys(entities)) {
    if (!seen.has(id)) result.push(id);
  }
  return result;
}


export function selectionAfterDeletedIds(
  selection: GeometryCalculatorSelection | null,
  deleteSet: Set<string>,
): GeometryCalculatorSelection | null {
  return selectionFromItems(selectionItems(selection).filter(item => !deleteSet.has(item.id)));
}


export function groupsAfterDeletedIds(
  groups: Record<string, GeometryObjectGroup>,
  deleteSet: Set<string>,
): Record<string, GeometryObjectGroup> {
  const next: Record<string, GeometryObjectGroup> = {};
  for (const group of Object.values(groups)) {
    const items = group.items.filter(item => !deleteSet.has(item.id));
    if (items.length < 2) continue;
    next[group.id] = { ...group, items };
  }
  return next;
}


export function selectionTransformTargets(
  scene: GeometryCalculatorScene,
  selection: GeometryCalculatorSelection | null,
): SelectionTransformTargets {
  const pointIds = new Set<string>();
  const locusEntityIds = new Set<string>();
  for (const item of selectionItems(selection)) {
    if (item.kind === 'point') {
      const point = point2D(scene, item.id);
      if (point && !point.locked) pointIds.add(point.id);
      continue;
    }

    const entity = scene.entities[item.id];
    if (!entity || entity.locked) continue;
    if (isSampledCurveEntity(entity)) {
      locusEntityIds.add(entity.id);
      continue;
    }
    for (const pointId of geometryEntityPointIds(entity)) {
      const point = point2D(scene, pointId);
      if (!point) continue;
      if (point.locked && !(point.hidden && !point.construction)) continue;
      pointIds.add(point.id);
    }
  }
  return { pointIds: [...pointIds], locusEntityIds: [...locusEntityIds] };
}


export function transformTargetDeltas(
  scene: GeometryCalculatorScene,
  targets: SelectionTransformTargets,
  mapPoint: (point: Vector2) => Vector2,
): GeometryCalculatorDelta[] {
  const deltas: GeometryCalculatorDelta[] = [];
  for (const pointId of targets.pointIds) {
    const point = point2D(scene, pointId);
    if (!point) continue;
    const next = mapPoint(point);
    if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) continue;
    if (Math.abs(next.x - point.x) <= 1e-9 && Math.abs(next.y - point.y) <= 1e-9) continue;
    deltas.push({ op: 'updatePoint', id: point.id, changes: { x: next.x, y: next.y } });
  }
  for (const entityId of targets.locusEntityIds) {
    const entity = scene.entities[entityId];
    if (!isSampledCurveEntity(entity)) continue;
    const points = entity.points.map(point => mapPoint(point));
    const changes: Partial<GeometryEntity> = { points } as Partial<GeometryEntity>;
    if (entity.kind === 'conic' && entity.segments) {
      (changes as Partial<ConicEntity>).segments = entity.segments.map(segment => segment.map(point => mapPoint(point)));
    }
    if (entity.kind === 'conic' && entity.center) {
      (changes as Partial<ConicEntity>).center = mapPoint(entity.center);
    }
    deltas.push({ op: 'updateEntity', id: entity.id, changes });
  }
  return deltas;
}


export function selectionCenter(
  scene: GeometryCalculatorScene,
  selection: GeometryCalculatorSelection | null,
): Vector2 | null {
  const targets = selectionTransformTargets(scene, selection);
  const points: Vector2[] = [];
  for (const pointId of targets.pointIds) {
    const point = point2D(scene, pointId);
    if (point) points.push(point);
  }
  for (const entityId of targets.locusEntityIds) {
    const entity = scene.entities[entityId];
    if (isSampledCurveEntity(entity)) points.push(...entity.points);
  }
  return points.length ? polygonCentroid(points) : null;
}


export function reflectionMapper(axis: GeometryReflectionAxis): (point: Vector2) => Vector2 {
  if (axis === 'x') return point => ({ x: point.x, y: -point.y });
  if (axis === 'y') return point => ({ x: -point.x, y: point.y });
  const direction = normalizeVector(axis.direction);
  if (!direction) {
    throw new KleinSdkError('invalid_transform', 'Reflection axis direction must be non-zero.');
  }
  return point => {
    const vx = point.x - axis.point.x;
    const vy = point.y - axis.point.y;
    const projected = vx * direction.x + vy * direction.y;
    const px = axis.point.x + projected * direction.x;
    const py = axis.point.y + projected * direction.y;
    return { x: 2 * px - point.x, y: 2 * py - point.y };
  };
}


export function addDuplicatedPoint(
  point: GeometryPoint2D,
  pointIdMap: Map<string, string>,
  deltas: GeometryCalculatorDelta[],
  ids: ReturnType<typeof createIdFactory>,
  offset: Vector2,
  createdSelection: GeometryCalculatorSelectable[],
  createdIds: string[],
): void {
  if (pointIdMap.has(point.id)) return;
  const next: GeometryPoint2D = {
    ...point,
    id: ids.next('p'),
    x: point.x + offset.x,
    y: point.y + offset.y,
  };
  delete next.construction;
  if (!point.hidden) next.locked = false;
  pointIdMap.set(point.id, next.id);
  deltas.push({ op: 'addPoint', point: next });
  if (!next.hidden) {
    createdSelection.push({ kind: 'point', id: next.id });
    createdIds.push(next.id);
  }
}


export function duplicateGeometryEntity(
  entity: GeometryEntity,
  pointIdMap: Map<string, string>,
  ids: ReturnType<typeof createIdFactory>,
  offset: Vector2,
): GeometryEntity | null {
  const id = ids.next(entityIdPrefix(entity.kind));
  switch (entity.kind) {
    case 'segment':
      return duplicatePointIdPairEntity(entity, id, pointIdMap);
    case 'ray':
      return duplicatePointIdPairEntity(entity, id, pointIdMap);
    case 'line': {
      const pointIds = mapTuple2(entity.pointIds, pointIdMap);
      if (!pointIds) return null;
      const next: LineEntity = { ...entity, id, pointIds };
      delete next.construction;
      return next;
    }
    case 'vector':
      return duplicatePointIdPairEntity(entity, id, pointIdMap);
    case 'polygon': {
      const pointIds = entity.pointIds.map(pointId => pointIdMap.get(pointId));
      if (pointIds.some(pointId => !pointId)) return null;
      const next: PolygonEntity = { ...entity, id, pointIds: pointIds as string[] };
      delete next.construction;
      return next;
    }
    case 'circle': {
      const centerId = pointIdMap.get(entity.centerId);
      if (!centerId) return null;
      const next: CircleEntity = { ...entity, id, centerId };
      delete next.construction;
      return next;
    }
    case 'arc': {
      const centerId = pointIdMap.get(entity.centerId);
      const startId = pointIdMap.get(entity.startId);
      const endId = pointIdMap.get(entity.endId);
      if (!centerId || !startId || !endId) return null;
      const next: ArcEntity = { ...entity, id, centerId, startId, endId };
      delete next.construction;
      return next;
    }
    case 'angle': {
      const pointIds = mapTuple3(entity.pointIds, pointIdMap);
      if (!pointIds) return null;
      const next: AngleEntity = { ...entity, id, pointIds };
      delete next.construction;
      return next;
    }
    case 'plane': {
      const pointIds = mapTuple3(entity.pointIds, pointIdMap);
      if (!pointIds) return null;
      const next: PlaneEntity = { ...entity, id, pointIds };
      delete next.construction;
      return next;
    }
    case 'locus': {
      const next: LocusEntity = {
        ...entity,
        id,
        points: entity.points.map(point => ({ x: point.x + offset.x, y: point.y + offset.y })),
      };
      delete next.construction;
      return next;
    }
    case 'conic': {
      const next: ConicEntity = {
        ...entity,
        id,
        points: entity.points.map(point => ({ x: point.x + offset.x, y: point.y + offset.y })),
      };
      if (entity.segments) {
        next.segments = entity.segments.map(segment => segment.map(point => ({ x: point.x + offset.x, y: point.y + offset.y })));
      }
      if (entity.center) next.center = { x: entity.center.x + offset.x, y: entity.center.y + offset.y };
      delete next.construction;
      return next;
    }
    case 'parametricCurve': {
      const next: ParametricCurveEntity = {
        ...entity,
        id,
        points: entity.points.map(point => ({ x: point.x + offset.x, y: point.y + offset.y })),
      };
      delete next.construction;
      return next;
    }
    case 'relationMarker': {
      const next: GeometryRelationMarkerEntity = { ...entity, id };
      delete next.construction;
      return next;
    }
  }
}


export function duplicatePointIdPairEntity<T extends SegmentEntity | RayEntity | VectorEntity>(
  entity: T,
  id: string,
  pointIdMap: Map<string, string>,
): T | null {
  const pointIds = mapTuple2(entity.pointIds, pointIdMap);
  if (!pointIds) return null;
  const next = { ...entity, id, pointIds } as T;
  delete next.construction;
  return next;
}


export function mapTuple2(pointIds: [string, string], pointIdMap: Map<string, string>): [string, string] | null {
  const first = pointIdMap.get(pointIds[0]);
  const second = pointIdMap.get(pointIds[1]);
  return first && second ? [first, second] : null;
}


export function mapTuple3(pointIds: [string, string, string], pointIdMap: Map<string, string>): [string, string, string] | null {
  const first = pointIdMap.get(pointIds[0]);
  const second = pointIdMap.get(pointIds[1]);
  const third = pointIdMap.get(pointIds[2]);
  return first && second && third ? [first, second, third] : null;
}


export function geometryDisplayEditChanges<T extends GeometryPoint2D | GeometryEntity>(
  edits: GeometryObjectEditOptions,
): Partial<T> {
  const changes: Partial<T> = {};
  if (edits.label !== undefined) {
    (changes as Partial<GeometryStyleOptions>).label = edits.label.trim();
  }
  if (edits.hidden !== undefined) {
    (changes as Partial<GeometryStyleOptions>).hidden = edits.hidden;
  }
  if (edits.locked !== undefined) {
    (changes as Partial<GeometryStyleOptions>).locked = edits.locked;
  }
  return changes;
}


export function entityIdPrefix(kind: GeometryEntity['kind']): string {
  switch (kind) {
    case 'segment':
      return 'seg';
    case 'ray':
      return 'ray';
    case 'line':
      return 'line';
    case 'vector':
      return 'vec';
    case 'polygon':
      return 'poly';
    case 'circle':
      return 'circle';
    case 'arc':
      return 'arc';
    case 'angle':
      return 'angle';
    case 'plane':
      return 'plane';
    case 'locus':
      return 'locus';
    case 'conic':
      return 'conic';
    case 'parametricCurve':
      return 'curve';
    case 'relationMarker':
      return 'marker';
  }
}


export function polygonSideCountEditDeltas(
  scene: GeometryCalculatorScene,
  polygonId: string,
  sidesInput: number,
  ids: ReturnType<typeof createIdFactory>,
): GeometryCalculatorDelta[] {
  const entity = scene.entities[polygonId];
  if (entity?.kind !== 'polygon') {
    throw new KleinSdkError('invalid_edit', 'Side count editing needs a polygon.');
  }
  const sides = clamp(Math.round(sidesInput), 3, 64);
  const points = entity.pointIds.map(pointId => point2D(scene, pointId)).filter(isPoint2D);
  const center = points.length ? polygonCentroid(points) : { x: 0, y: 0 };
  const radius = Math.max(
    points.reduce((sum, point) => sum + distance2D(point, center), 0) / Math.max(points.length, 1),
    1,
  );
  const coordinates = regularPolygonCoordinates(center, sides, radius, -Math.PI / 2);
  const pointIds: string[] = [];
  const deltas: GeometryCalculatorDelta[] = [];
  for (let index = 0; index < coordinates.length; index += 1) {
    const coordinate = coordinates[index];
    if (!coordinate) continue;
    const existingId = entity.pointIds[index];
    const existing = existingId ? point2D(scene, existingId) : undefined;
    if (existing && !existing.locked) {
      pointIds.push(existing.id);
      deltas.push({
        op: 'updatePoint',
        id: existing.id,
        changes: { x: coordinate.x, y: coordinate.y, hidden: false },
      });
      continue;
    }
    const point: GeometryPoint2D = {
      id: ids.next('p'),
      kind: 'point2d',
      x: coordinate.x,
      y: coordinate.y,
    };
    if (entity.color) point.color = entity.color;
    pointIds.push(point.id);
    deltas.push({ op: 'addPoint', point });
  }
  for (const extraId of entity.pointIds.slice(sides)) {
    const point = point2D(scene, extraId);
    if (point && !point.locked) deltas.push({ op: 'updatePoint', id: point.id, changes: { hidden: true } });
  }
  deltas.push({ op: 'updateEntity', id: entity.id, changes: { pointIds } });
  return deltas;
}


export function deleteGeometryIds(
  snapshot: GeometryCalculatorSnapshot,
  ids: string[],
): GeometryCalculatorSnapshot {
  const deleteSet = new Set([...ids, ...geometryDependentsOf(snapshot.scene, ids)]);
  const points = { ...snapshot.scene.points };
  const entities = { ...snapshot.scene.entities };
  const constraints = { ...(snapshot.scene.constraints ?? {}) };
  for (const id of deleteSet) {
    delete points[id];
    delete entities[id];
    delete constraints[id];
  }
  for (const [entityId, entity] of Object.entries(entities)) {
    if (geometryEntityPointIds(entity).some(pointId => deleteSet.has(pointId))) {
      delete entities[entityId];
      deleteSet.add(entityId);
    }
  }
  for (const [constraintId, constraint] of Object.entries(constraints)) {
    if (geometryConstraintDependencies(constraint).some(id => deleteSet.has(id))) {
      delete constraints[constraintId];
      deleteSet.add(constraintId);
    }
  }
  return {
    ...snapshot,
    scene: {
      ...snapshot.scene,
      points,
      entities,
      constraints,
      order: snapshot.scene.order.filter(id => !deleteSet.has(id)),
    },
    appState: {
      ...snapshot.appState,
      selected: selectionAfterDeletedIds(snapshot.appState.selected, deleteSet),
      groups: groupsAfterDeletedIds(snapshot.appState.groups, deleteSet),
    },
  };
}


export function previewMoveSelection(
  snapshot: GeometryCalculatorSnapshot,
  drag: Extract<DragState, { kind: 'moveSelection' }>,
  delta: Vector2,
): GeometryCalculatorSnapshot {
  const points = { ...snapshot.scene.points };
  for (const pointId of drag.pointIds) {
    const point = drag.originalPoints[pointId];
    if (point) points[pointId] = { ...point, x: point.x + delta.x, y: point.y + delta.y };
  }
  const entities = { ...snapshot.scene.entities };
  for (const [entityId, pointsBefore] of Object.entries(drag.locusPoints)) {
    const entity = entities[entityId];
    if (entity?.kind === 'locus') {
      entities[entityId] = {
        ...entity,
        points: pointsBefore.map(point => ({ x: point.x + delta.x, y: point.y + delta.y })),
      };
    } else if (entity?.kind === 'conic') {
      const next: ConicEntity = {
        ...entity,
        points: pointsBefore.map(point => ({ x: point.x + delta.x, y: point.y + delta.y })),
      };
      if (entity.segments) {
        next.segments = entity.segments.map(segment => segment.map(point => ({ x: point.x + delta.x, y: point.y + delta.y })));
      }
      if (entity.center) next.center = { x: entity.center.x + delta.x, y: entity.center.y + delta.y };
      entities[entityId] = next;
    } else if (entity?.kind === 'parametricCurve') {
      entities[entityId] = {
        ...entity,
        points: pointsBefore.map(point => ({ x: point.x + delta.x, y: point.y + delta.y })),
      };
    }
  }
  return {
    ...snapshot,
    scene: constrainGeometryScene(
      recomputeGeometryScene({ ...snapshot.scene, points, entities }),
      [...drag.pointIds, ...Object.keys(drag.locusPoints)],
    ),
  };
}


export function moveSelectionCommitDeltas(
  moved: GeometryCalculatorSnapshot,
  drag: Extract<DragState, { kind: 'moveSelection' }>,
): GeometryCalculatorDelta[] {
  return geometrySceneUpdateDeltas(drag.startSnapshot.scene, moved.scene);
}


export function selectionItemsInWorldRect(scene: GeometryCalculatorScene, rect: WorldBounds): GeometryCalculatorSelectable[] {
  const items: GeometryCalculatorSelectable[] = [];
  for (const point of Object.values(scene.points)) {
    if (point.kind === 'point2d' && !point.hidden && rectContainsPoint(rect, point)) {
      items.push({ kind: 'point', id: point.id });
    }
  }
  for (const entity of orderedEntities(scene)) {
    if (!entity.hidden && entityIntersectsRect(scene, entity, rect)) {
      items.push({ kind: 'entity', id: entity.id });
    }
  }
  return items;
}


export function entityIntersectsRect(scene: GeometryCalculatorScene, entity: GeometryEntity, rect: WorldBounds): boolean {
  switch (entity.kind) {
    case 'segment':
    case 'vector': {
      const a = point2D(scene, entity.pointIds[0]);
      const b = point2D(scene, entity.pointIds[1]);
      return Boolean(a && b && segmentIntersectsRect(a, b, rect));
    }
    case 'ray': {
      const a = point2D(scene, entity.pointIds[0]);
      const b = point2D(scene, entity.pointIds[1]);
      if (!a || !b) return false;
      return Boolean(clipRayToBounds(a, b, rect));
    }
    case 'line': {
      const equation = entity.equation ?? lineEquationFromEntityPoints(scene, entity);
      return Boolean(equation && clipLineToBounds(equation, rect));
    }
    case 'polygon': {
      const points = entity.pointIds.map(id => point2D(scene, id)).filter(isPoint2D);
      if (points.some(point => rectContainsPoint(rect, point))) return true;
      const center = {
        x: (rect.minX + rect.maxX) / 2,
        y: (rect.minY + rect.maxY) / 2,
      };
      if (pointInPolygon(center, points)) return true;
      return points.some((point, index) => {
        const next = points[(index + 1) % points.length];
        return Boolean(next && segmentIntersectsRect(point, next, rect));
      });
    }
    case 'circle': {
      const center = point2D(scene, entity.centerId);
      if (!center) return false;
      if (rectContainsPoint(rect, center)) return true;
      const closest = {
        x: clamp(center.x, rect.minX, rect.maxX),
        y: clamp(center.y, rect.minY, rect.maxY),
      };
      return distance2D(center, closest) <= entity.radius;
    }
    case 'arc':
    case 'angle':
    case 'plane':
      return geometryEntityPointIds(entity).some(pointId => {
        const point = point2D(scene, pointId);
        return Boolean(point && rectContainsPoint(rect, point));
      });
    case 'locus':
      return entity.points.some(point => rectContainsPoint(rect, point))
        || entity.points.some((point, index) => {
          const next = entity.points[index + 1] ?? (entity.closed ? entity.points[0] : undefined);
          return Boolean(next && segmentIntersectsRect(point, next, rect));
        });
    case 'conic':
    case 'parametricCurve':
      return sampledCurveSegments(entity).some(segment => segment.some(point => rectContainsPoint(rect, point))
        || segment.some((point, index) => {
          const next = segment[index + 1] ?? (entity.closed ? segment[0] : undefined);
          return Boolean(next && segmentIntersectsRect(point, next, rect));
        }));
    case 'relationMarker': {
      const anchor = relationMarkerAnchor(scene, entity);
      return Boolean(anchor && rectContainsPoint(rect, anchor));
    }
  }
}

