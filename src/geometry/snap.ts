import type { Vector2 } from '../core/index.js';
import type { ConicEntity, GeometryEntity, GeometryRelationMarkerEntity, LocusEntity, ParametricCurveEntity } from '../geometry-core/index.js';
import { distance2D, geometryEntityPointIds, geometryIntersectionPoints2D, midpoint2D } from '../geometry-core/index.js';
import { lineEquationFromEntityPoints, projectPointToLineEquation } from './equations.js';
import { clamp, distanceToRay, distanceToSegment, nearestPointOnRay, nearestPointOnSegment, normalizeVector, pointInPolygon, polygonCentroid, segmentIntersection } from './geometry-math.js';
import { isPoint2D, orderedEntities, point2D } from './scene.js';
import { formatGridLabel, positiveNumber } from './snapshot.js';
import type { GeometryCalculatorScene, GeometryRelationMarkerKind, GeometrySnapModes, HitTarget, SnapCandidate, SnapMarker, SnapOptions, SnapResult } from './types.js';

export function resolveGeometrySnap(
  scene: GeometryCalculatorScene,
  world: Vector2,
  options: SnapOptions,
): SnapResult {
  const excluded = new Set(options.excludePointIds ?? []);
  const tolerance = options.toleranceWorld * clamp(options.settings.strength, 0.1, 3);
  const candidates: SnapCandidate[] = [];
  const modes = options.settings.modes;

  if (modes.points) {
    for (const point of Object.values(scene.points)) {
      if (point.kind !== 'point2d' || point.hidden || excluded.has(point.id)) continue;
      candidates.push({ point, kind: 'points', label: point.label ?? point.id });
    }
  }

  if (modes.midpoints || modes.intersections || modes.shapeEdges) {
    candidates.push(...candidateSnapPoints(scene, modes, world));
  }

  if (modes.axes) {
    candidates.push({ point: { x: 0, y: world.y }, kind: 'axes', label: 'y-axis' });
    candidates.push({ point: { x: world.x, y: 0 }, kind: 'axes', label: 'x-axis' });
  }

  if (modes.angles) {
    const radius = Math.hypot(world.x, world.y);
    if (radius > 1e-9) {
      const increment = Math.PI / 12;
      const angle = Math.round(Math.atan2(world.y, world.x) / increment) * increment;
      candidates.push({
        point: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
        kind: 'angles',
        label: `${Math.round((angle * 180) / Math.PI)} deg`,
      });
    }
  }

  if (modes.grid) {
    const point = {
      x: Math.round(world.x / options.gridStep) * options.gridStep,
      y: Math.round(world.y / options.gridStep) * options.gridStep,
    };
    candidates.push({
      point,
      kind: 'grid',
      label: `${formatGridLabel(point.x)}, ${formatGridLabel(point.y)}`,
    });
  }

  let best: SnapMarker | null = null;
  for (const candidate of candidates) {
    const distanceWorld = distance2D(world, candidate.point);
    if (distanceWorld <= tolerance && (!best || distanceWorld < best.distanceWorld)) {
      best = { ...candidate, distanceWorld };
    }
  }

  return best
    ? { point: { x: best.point.x, y: best.point.y }, marker: best }
    : { point: world, marker: null };
}


export function candidateSnapPoints(
  scene: GeometryCalculatorScene,
  modes: GeometrySnapModes,
  world: Vector2,
): SnapCandidate[] {
  const candidates: SnapCandidate[] = [];
  const segments = lineSegmentsForSnap(scene);
  if (modes.midpoints) {
    for (const segment of segments) {
      candidates.push({ point: midpoint2D(segment.a, segment.b), kind: 'midpoints', label: 'midpoint' });
    }
  }
  if (modes.intersections) {
    const lineLikeIds = lineLikeEntityIdsForSnap(scene);
    for (let i = 0; i < lineLikeIds.length; i += 1) {
      for (let j = i + 1; j < lineLikeIds.length; j += 1) {
        const firstId = lineLikeIds[i];
        const secondId = lineLikeIds[j];
        if (!firstId || !secondId) continue;
        const hits = geometryIntersectionPoints2D(scene, firstId, secondId);
        for (const hit of hits) {
          candidates.push({ point: hit, kind: 'intersections', label: 'intersection' });
        }
      }
    }
    for (let i = 0; i < segments.length; i += 1) {
      for (let j = i + 1; j < segments.length; j += 1) {
        const first = segments[i];
        const second = segments[j];
        if (!first || !second) continue;
        const hit = segmentIntersection(first.a, first.b, second.a, second.b);
        if (hit) candidates.push({ point: hit, kind: 'intersections', label: 'intersection' });
      }
    }
  }
  if (modes.shapeEdges) {
    for (const point of nearestShapeEdgePoints(scene, world)) {
      candidates.push({ point, kind: 'shapeEdges', label: 'edge' });
    }
  }
  return candidates;
}


export function lineLikeEntityIdsForSnap(scene: GeometryCalculatorScene): string[] {
  return orderedEntities(scene)
    .filter(entity => !entity.hidden && (
      entity.kind === 'line'
      || entity.kind === 'ray'
      || entity.kind === 'segment'
      || entity.kind === 'vector'
    ))
    .map(entity => entity.id);
}


export function lineSegmentsForSnap(scene: GeometryCalculatorScene): Array<{ a: Vector2; b: Vector2 }> {
  const segments: Array<{ a: Vector2; b: Vector2 }> = [];
  for (const entity of Object.values(scene.entities)) {
    if (entity.hidden) continue;
    if (entity.kind === 'segment') {
      const a = point2D(scene, entity.pointIds[0]);
      const b = point2D(scene, entity.pointIds[1]);
      if (a && b) segments.push({ a, b });
    }
    if (entity.kind === 'polygon') {
      for (let index = 0; index < entity.pointIds.length; index += 1) {
        const aId = entity.pointIds[index];
        const bId = entity.pointIds[(index + 1) % entity.pointIds.length];
        if (!aId || !bId) continue;
        const a = point2D(scene, aId);
        const b = point2D(scene, bId);
        if (a && b) segments.push({ a, b });
      }
    }
  }
  return segments;
}


export function nearestShapeEdgePoints(scene: GeometryCalculatorScene, world: Vector2): Vector2[] {
  const candidates: Vector2[] = [];
  for (const entity of Object.values(scene.entities)) {
    if (entity.hidden) continue;
    if (entity.kind === 'segment' || entity.kind === 'vector') {
      const a = point2D(scene, entity.pointIds[0]);
      const b = point2D(scene, entity.pointIds[1]);
      if (a && b) candidates.push(nearestPointOnSegment(world, a, b));
    } else if (entity.kind === 'ray') {
      const a = point2D(scene, entity.pointIds[0]);
      const b = point2D(scene, entity.pointIds[1]);
      if (a && b) candidates.push(nearestPointOnRay(world, a, b));
    } else if (entity.kind === 'line') {
      const equation = entity.equation ?? lineEquationFromEntityPoints(scene, entity);
      if (equation) candidates.push(projectPointToLineEquation(world, equation));
    } else if (entity.kind === 'polygon') {
      const points = entity.pointIds.map(id => point2D(scene, id)).filter(isPoint2D);
      for (let index = 0; index < points.length; index += 1) {
        const current = points[index];
        const next = points[(index + 1) % points.length];
        if (current && next) candidates.push(nearestPointOnSegment(world, current, next));
      }
    } else if (entity.kind === 'circle') {
      const center = point2D(scene, entity.centerId);
      if (center && entity.radius > 0) {
        const direction = normalizeVector({ x: world.x - center.x, y: world.y - center.y }) ?? { x: 1, y: 0 };
        candidates.push({ x: center.x + direction.x * entity.radius, y: center.y + direction.y * entity.radius });
      }
    } else if (entity.kind === 'locus') {
      for (let index = 0; index < entity.points.length - 1; index += 1) {
        const current = entity.points[index];
        const next = entity.points[index + 1];
        if (current && next) candidates.push(nearestPointOnSegment(world, current, next));
      }
      if (entity.closed) {
        const first = entity.points[0];
        const last = entity.points[entity.points.length - 1];
        if (first && last) candidates.push(nearestPointOnSegment(world, last, first));
      }
    } else if (entity.kind === 'conic' || entity.kind === 'parametricCurve') {
      for (const segment of sampledCurveSegments(entity)) {
        for (let index = 0; index < segment.length - 1; index += 1) {
          const current = segment[index];
          const next = segment[index + 1];
          if (current && next) candidates.push(nearestPointOnSegment(world, current, next));
        }
        if (entity.closed) {
          const first = segment[0];
          const last = segment[segment.length - 1];
          if (first && last) candidates.push(nearestPointOnSegment(world, last, first));
        }
      }
    }
  }
  return candidates;
}


export function hitTestGeometryCalculator(
  scene: GeometryCalculatorScene,
  world: Vector2,
  toleranceWorld: number,
): HitTarget {
  let bestPoint: HitTarget = null;
  for (const point of Object.values(scene.points).reverse()) {
    if (point.kind !== 'point2d' || point.hidden) continue;
    const distanceWorld = distance2D(world, point);
    if (distanceWorld <= toleranceWorld && (!bestPoint || distanceWorld < bestPoint.distanceWorld)) {
      bestPoint = { selection: { kind: 'point', id: point.id }, distanceWorld };
    }
  }
  if (bestPoint) return bestPoint;

  let bestEntity: HitTarget = null;
  for (const entity of orderedEntities(scene).reverse()) {
    if (entity.hidden) continue;
    const distanceWorld = distanceToEntity(scene, world, entity);
    if (distanceWorld <= toleranceWorld && (!bestEntity || distanceWorld < bestEntity.distanceWorld)) {
      bestEntity = { selection: { kind: 'entity', id: entity.id }, distanceWorld };
    }
  }
  return bestEntity;
}


export function distanceToEntity(scene: GeometryCalculatorScene, world: Vector2, entity: GeometryEntity): number {
  switch (entity.kind) {
    case 'segment':
    case 'vector': {
      const a = point2D(scene, entity.pointIds[0]);
      const b = point2D(scene, entity.pointIds[1]);
      return a && b ? distanceToSegment(world, a, b) : Infinity;
    }
    case 'ray': {
      const a = point2D(scene, entity.pointIds[0]);
      const b = point2D(scene, entity.pointIds[1]);
      return a && b ? distanceToRay(world, a, b) : Infinity;
    }
    case 'line': {
      const equation = entity.equation ?? lineEquationFromEntityPoints(scene, entity);
      return equation ? Math.abs(equation.a * world.x + equation.b * world.y + equation.c) : Infinity;
    }
    case 'polygon': {
      const points = entity.pointIds.map(id => point2D(scene, id)).filter(isPoint2D);
      if (points.length < 3) return Infinity;
      const edgeDistance = points.reduce((best, point, index) => {
        const next = points[(index + 1) % points.length];
        return next ? Math.min(best, distanceToSegment(world, point, next)) : best;
      }, Infinity);
      return pointInPolygon(world, points) ? Math.min(edgeDistance, 0.05) : edgeDistance;
    }
    case 'circle': {
      const center = point2D(scene, entity.centerId);
      return center ? Math.abs(distance2D(world, center) - entity.radius) : Infinity;
    }
    case 'angle': {
      const vertex = point2D(scene, entity.pointIds[1]);
      return vertex ? Math.abs(distance2D(world, vertex) - positiveNumber(entity.radius, 0.7)) : Infinity;
    }
    case 'arc': {
      const center = point2D(scene, entity.centerId);
      const start = point2D(scene, entity.startId);
      return center && start ? Math.abs(distance2D(world, center) - distance2D(center, start)) : Infinity;
    }
    case 'locus':
      return distanceToLocus(world, entity);
    case 'conic':
    case 'parametricCurve':
      return distanceToSampledCurve(world, entity);
    case 'relationMarker': {
      const anchor = relationMarkerAnchor(scene, entity);
      return anchor ? distance2D(world, anchor) : Infinity;
    }
    case 'plane':
      return Infinity;
  }
}


export function distanceToLocus(point: Vector2, entity: LocusEntity): number {
  if (entity.points.length < 2) return Infinity;
  let best = Infinity;
  for (let index = 0; index < entity.points.length - 1; index += 1) {
    const current = entity.points[index];
    const next = entity.points[index + 1];
    if (!current || !next) continue;
    best = Math.min(best, distanceToSegment(point, current, next));
  }
  if (entity.closed) {
    const first = entity.points[0];
    const last = entity.points[entity.points.length - 1];
    if (first && last) {
      best = Math.min(best, distanceToSegment(point, last, first));
      if (pointInPolygon(point, entity.points)) best = Math.min(best, 0.05);
    }
  }
  return best;
}


export function distanceToSampledCurve(point: Vector2, entity: ConicEntity | ParametricCurveEntity): number {
  let best = Infinity;
  for (const segment of sampledCurveSegments(entity)) {
    for (let index = 0; index < segment.length - 1; index += 1) {
      const current = segment[index];
      const next = segment[index + 1];
      if (!current || !next) continue;
      best = Math.min(best, distanceToSegment(point, current, next));
    }
    if (entity.closed) {
      const first = segment[0];
      const last = segment[segment.length - 1];
      if (first && last) {
        best = Math.min(best, distanceToSegment(point, last, first));
        if (pointInPolygon(point, segment)) best = Math.min(best, 0.05);
      }
    }
  }
  return best;
}


export function sampledCurveSegments(entity: ConicEntity | ParametricCurveEntity): Vector2[][] {
  if (entity.kind === 'conic' && entity.segments?.length) return entity.segments;
  return entity.points.length >= 2 ? [entity.points] : [];
}


export function isSampledCurveEntity(entity: GeometryEntity | undefined): entity is LocusEntity | ConicEntity | ParametricCurveEntity {
  return entity?.kind === 'locus' || entity?.kind === 'conic' || entity?.kind === 'parametricCurve';
}


export function relationMarkerAnchor(
  scene: GeometryCalculatorScene,
  marker: GeometryRelationMarkerEntity,
): Vector2 | null {
  const points = relationMarkerTargetPoints(scene, marker);
  return points.length ? polygonCentroid(points) : null;
}


export function relationMarkerTargetPoints(scene: GeometryCalculatorScene, marker: GeometryRelationMarkerEntity): Vector2[] {
  const points: Vector2[] = [];
  for (const targetId of marker.targetIds) {
    const point = point2D(scene, targetId);
    if (point) {
      points.push(point);
      continue;
    }
    const entity = scene.entities[targetId];
    if (!entity) continue;
    points.push(...entityAnchorPoints(scene, entity));
  }
  return points;
}


export function entityAnchorPoints(scene: GeometryCalculatorScene, entity: GeometryEntity): Vector2[] {
  switch (entity.kind) {
    case 'segment':
    case 'ray':
    case 'line':
    case 'vector':
    case 'polygon':
    case 'angle':
    case 'plane':
      return geometryEntityPointIds(entity).map(id => point2D(scene, id)).filter(isPoint2D);
    case 'circle': {
      const center = point2D(scene, entity.centerId);
      return center ? [center] : [];
    }
    case 'arc':
      return [entity.centerId, entity.startId, entity.endId].map(id => point2D(scene, id)).filter(isPoint2D);
    case 'locus':
    case 'parametricCurve':
      return entity.points;
    case 'conic':
      return entity.center ? [entity.center] : entity.points;
    case 'relationMarker':
      return relationMarkerTargetPoints(scene, entity);
  }
}


export function relationMarkerLabel(kind: GeometryRelationMarkerKind): string {
  switch (kind) {
    case 'congruence':
      return 'congruent';
    case 'similarity':
      return 'similar';
    case 'cyclicQuadrilateral':
      return 'cyclic';
    case 'triangleType':
      return 'triangle';
  }
}

