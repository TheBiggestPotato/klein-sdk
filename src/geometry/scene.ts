import type { GeometryEntity, GeometryPoint2D, LineEntity, RayEntity, SegmentEntity } from '../geometry-core/index.js';
import type { GeometryCalculatorScene, GeometryCalculatorSelectable } from './types.js';


export function point2D(scene: GeometryCalculatorScene, id: string): GeometryPoint2D | undefined {
  const point = scene.points[id];
  return point?.kind === 'point2d' ? point : undefined;
}


export function isPoint2D(point: GeometryPoint2D | undefined): point is GeometryPoint2D {
  return Boolean(point);
}


export function orderedEntities(scene: GeometryCalculatorScene): GeometryEntity[] {
  const seen = new Set<string>();
  const result: GeometryEntity[] = [];
  for (const id of scene.order) {
    const entity = scene.entities[id];
    if (entity) {
      seen.add(id);
      result.push(entity);
    }
  }
  for (const entity of Object.values(scene.entities)) {
    if (!seen.has(entity.id)) result.push(entity);
  }
  return result;
}


export function isLineLike(entity: GeometryEntity): entity is SegmentEntity | LineEntity | RayEntity {
  return entity.kind === 'segment' || entity.kind === 'line' || entity.kind === 'ray';
}


export function isIntersectableEntity(entity: GeometryEntity): boolean {
  return entity.kind === 'segment'
    || entity.kind === 'line'
    || entity.kind === 'ray'
    || entity.kind === 'vector'
    || entity.kind === 'circle'
    || entity.kind === 'polygon';
}

