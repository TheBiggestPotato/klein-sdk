import { KleinSdkError } from '../core/index.js';
import type { GeometryConstraint, GeometryEntity } from '../geometry-core/index.js';
import type { GeometryCalculatorScene, GeometryConstraintDraft } from './types.js';


export function makeGeometryConstraint(
  draft: GeometryConstraintDraft,
  fallbackId: string,
  scene: GeometryCalculatorScene,
): GeometryConstraint {
  const id = draft.id && draft.id.trim() ? draft.id : fallbackId;
  const constraint = { ...draft, id } as GeometryConstraint;
  validateGeometryConstraint(constraint, scene);
  return constraint;
}


export function validateGeometryConstraint(constraint: GeometryConstraint, scene: GeometryCalculatorScene): void {
  const requirePoint = (pointId: string): void => {
    const point = scene.points[pointId];
    if (!point || point.kind !== 'point2d') {
      throw new KleinSdkError('invalid_constraint', `Constraint references missing 2D point ${pointId}.`);
    }
  };
  const requireLineEntity = (entityId: string): void => {
    const entity = scene.entities[entityId];
    if (!entity || !isConstraintLineEntity(entity)) {
      throw new KleinSdkError('invalid_constraint', `Constraint references a missing or non-linear object ${entityId}.`);
    }
  };
  const requireCircle = (entityId: string): void => {
    const entity = scene.entities[entityId];
    if (!entity || entity.kind !== 'circle') {
      throw new KleinSdkError('invalid_constraint', `Constraint references a missing circle ${entityId}.`);
    }
  };

  switch (constraint.kind) {
    case 'fixedLength':
      constraint.pointIds.forEach(requirePoint);
      if (!Number.isFinite(constraint.length) || constraint.length <= 0) {
        throw new KleinSdkError('invalid_constraint', 'Fixed length must be a positive number.');
      }
      break;
    case 'fixedAngle':
      constraint.pointIds.forEach(requirePoint);
      if (!Number.isFinite(constraint.degrees) || constraint.degrees <= 0 || constraint.degrees >= 360) {
        throw new KleinSdkError('invalid_constraint', 'Fixed angle must be between 0 and 360 degrees.');
      }
      break;
    case 'parallel':
    case 'perpendicular':
      constraint.entityIds.forEach(requireLineEntity);
      break;
    case 'equalLength':
      constraint.segments.flat().forEach(requirePoint);
      break;
    case 'equalRadius':
      constraint.circleIds.forEach(requireCircle);
      break;
  }
}


export function isConstraintLineEntity(entity: GeometryEntity): boolean {
  return entity.kind === 'segment'
    || entity.kind === 'line'
    || entity.kind === 'ray'
    || entity.kind === 'vector';
}

