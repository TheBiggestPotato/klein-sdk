import type { InstrumentSnapshot, Vector2, Vector3 } from '../core/index.js';

/** Geometry scene dimensionality. Some tools are 2D-only, while Geometry Lab uses both. */
export type GeometryDimension = '2d' | '3d';

/** Serializable construction rules used to keep derived geometry linked to source objects. */
export type GeometryConstruction =
  | { kind: 'midpoint'; sourceIds: [string, string] }
  | { kind: 'intersection'; sourceIds: [string, string]; index?: number }
  | { kind: 'lineThroughPoints'; sourceIds: [string, string] }
  | { kind: 'circleCenterPoint'; centerPointId: string; radiusPointId: string }
  | { kind: 'circumcenter'; pointIds: [string, string, string] }
  | { kind: 'circleThroughPoints'; pointIds: [string, string, string] }
  | { kind: 'parallelLine'; sourceLineId: string; throughPointId: string }
  | { kind: 'perpendicularLine'; sourceLineId: string; throughPointId: string }
  | { kind: 'tangentLine'; circleId: string; throughPointId: string; branch: -1 | 1 }
  | { kind: 'angleBisector'; pointIds: [string, string, string] }
  | { kind: 'angleFromLines'; sourceIds: [string, string] }
  // 3D. Where a line meets a plane, and the two points that span the line where
  // two planes meet. Before these existed the instrument computed the position
  // once and stored a free point, so moving the plane left the "intersection"
  // behind - a figure that quietly stopped being true.
  // The image of another object under a transformation. The transform's own
  // parameters are objects too - a mirror line, a centre of rotation, a
  // translation vector - so the image follows both its source and the thing
  // transforming it, which is what makes reflecting a triangle in a line worth
  // doing on screen rather than on paper.
  | { kind: 'transformedPoint'; sourceId: string; transform: GeometryTransform2D }
  | { kind: 'linePlaneIntersection'; lineEntityId: string; planeId: string }
  | { kind: 'planePlaneIntersection'; firstPlaneId: string; secondPlaneId: string; end: 0 | 1 }
  | { kind: 'custom'; sourceIds: string[]; label?: string };

/**
 * A plane transformation, described by the objects that define it.
 *
 * <p>Deliberately not a matrix. `rotate` naming a centre *point* means the image
 * turns when that point is dragged; a matrix would freeze the numbers at the
 * moment the transformation was applied, which is what makes a transformation
 * tool a one-off edit instead of a construction.
 *
 * <p>`translateBy` is the exception, for a fixed offset with no vector to point
 * at. It is the only member whose parameters are numbers alone.
 */
export type GeometryTransform2D =
  | { kind: 'translate'; vectorEntityId: string }
  | { kind: 'translateBy'; dx: number; dy: number }
  | { kind: 'rotate'; centerPointId: string; degrees: number }
  | { kind: 'reflectLine'; lineEntityId: string }
  | { kind: 'reflectPoint'; centerPointId: string }
  | { kind: 'dilate'; centerPointId: string; factor: number };

/** Serializable 2D point used by construction and whiteboard-style geometry scenes. */
export interface GeometryPoint2D extends Vector2 {
  id: string;
  kind: 'point2d';
  label?: string;
  color?: string;
  hidden?: boolean;
  locked?: boolean;
  construction?: GeometryConstruction;
}

/** Serializable 3D point in the SDK's z-up coordinate system. */
export interface GeometryPoint3D extends Vector3 {
  id: string;
  kind: 'point3d';
  label?: string;
  color?: string;
  hidden?: boolean;
  locked?: boolean;
  construction?: GeometryConstruction;
}

/** Normalized implicit 2D line equation: `a * x + b * y + c = 0`. */
export interface GeometryLineEquation {
  a: number;
  b: number;
  c: number;
  input?: string;
}

/** General implicit 2D conic equation: `a*x^2 + b*x*y + c*y^2 + d*x + e*y + f = 0`. */
export interface GeometryConicEquation {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  input?: string;
}

/** Normalized implicit 3D plane equation: `a * x + b * y + c * z + d = 0`. */
export interface GeometryPlaneEquation3D {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** Infinite 3D line represented by a point and direction vector. */
export interface GeometryLine3D {
  point: Vector3;
  direction: Vector3;
}

/** Shared display metadata used by renderer-backed geometry entities. */
export interface GeometryEntityDisplay {
  label?: string;
  color?: string;
  strokeColor?: string;
  fillColor?: string;
  width?: number;
  hidden?: boolean;
  locked?: boolean;
  construction?: GeometryConstruction;
}

/** Any point type supported by the shared geometry graph. */
export type GeometryPoint = GeometryPoint2D | GeometryPoint3D;

/** Base geometry entities that reference points by id rather than duplicating coordinates. */
export type GeometryEntity =
  | SegmentEntity
  | RayEntity
  | LineEntity
  | VectorEntity
  | PolygonEntity
  | CircleEntity
  | ArcEntity
  | ConicEntity
  | ParametricCurveEntity
  | AngleEntity
  | PlaneEntity
  | LocusEntity
  | GeometryRelationMarkerEntity;

/** Finite segment between two points. */
export interface SegmentEntity extends GeometryEntityDisplay {
  id: string;
  kind: 'segment';
  pointIds: [string, string];
}

/** Ray beginning at the first point and passing through the second. */
export interface RayEntity extends GeometryEntityDisplay {
  id: string;
  kind: 'ray';
  pointIds: [string, string];
}

/** Infinite line through two points. */
export interface LineEntity extends GeometryEntityDisplay {
  id: string;
  kind: 'line';
  pointIds: [string, string];
  equation?: GeometryLineEquation;
}

/** Directed vector from the first point to the second. */
export interface VectorEntity extends GeometryEntityDisplay {
  id: string;
  kind: 'vector';
  pointIds: [string, string];
}

/** Polygon represented by an ordered list of vertex point ids. */
export interface PolygonEntity extends GeometryEntityDisplay {
  id: string;
  kind: 'polygon';
  pointIds: string[];
}

/** Circle represented by a center point and radius in scene units. */
export interface CircleEntity extends GeometryEntityDisplay {
  id: string;
  kind: 'circle';
  centerId: string;
  radius: number;
}

/** Arc represented by center, start, and end point ids. */
export interface ArcEntity extends GeometryEntityDisplay {
  id: string;
  kind: 'arc';
  centerId: string;
  startId: string;
  endId: string;
}

/** Sampled conic curve with serializable equation metadata. */
export interface ConicEntity extends GeometryEntityDisplay {
  id: string;
  kind: 'conic';
  conicKind: 'ellipse' | 'parabola' | 'hyperbola';
  points: Vector2[];
  segments?: Vector2[][];
  closed?: boolean;
  equation?: GeometryConicEquation;
  center?: Vector2;
  rotationDegrees?: number;
}

/** Sampled parametric 2D curve with serializable parameter metadata. */
export interface ParametricCurveEntity extends GeometryEntityDisplay {
  id: string;
  kind: 'parametricCurve';
  points: Vector2[];
  closed?: boolean;
  parameter?: {
    xExpression: string;
    yExpression: string;
    tMin: number;
    tMax: number;
    samples: number;
  };
}

/** Angle marker defined by three point ids, with the middle point as vertex. */
export interface AngleEntity extends GeometryEntityDisplay {
  id: string;
  kind: 'angle';
  pointIds: [string, string, string];
  radius?: number;
  orientation?: 'interior' | 'exterior';
}

/** 3D plane defined by three non-collinear point ids. */
export interface PlaneEntity extends GeometryEntityDisplay {
  id: string;
  kind: 'plane';
  pointIds: [string, string, string];
}

/** Sampled 2D locus/path. Points are stored directly so it can represent computed traces. */
export interface LocusEntity extends GeometryEntityDisplay {
  id: string;
  kind: 'locus';
  points: Vector2[];
  closed?: boolean;
}

/** Serializable visual marker for geometric relations and checks. */
export interface GeometryRelationMarkerEntity extends GeometryEntityDisplay {
  id: string;
  kind: 'relationMarker';
  relationKind: 'congruence' | 'similarity' | 'cyclicQuadrilateral' | 'triangleType';
  targetIds: string[];
  text?: string;
}

/** Shared metadata for serializable object constraints. */
export interface GeometryConstraintBase {
  id: string;
  label?: string;
  enabled?: boolean;
}

/** Serializable constraints that can be enforced by a host/editor solver. */
export type GeometryConstraint =
  | (GeometryConstraintBase & { kind: 'fixedLength'; pointIds: [string, string]; length: number })
  | (GeometryConstraintBase & { kind: 'fixedAngle'; pointIds: [string, string, string]; degrees: number })
  | (GeometryConstraintBase & { kind: 'parallel'; entityIds: [string, string] })
  | (GeometryConstraintBase & { kind: 'perpendicular'; entityIds: [string, string] })
  | (GeometryConstraintBase & { kind: 'equalLength'; segments: [[string, string], [string, string]] })
  | (GeometryConstraintBase & { kind: 'equalRadius'; circleIds: [string, string] });

/** Shared graph model for geometry instruments. Entities refer back to points by id. */
export interface GeometryScene {
  points: Record<string, GeometryPoint>;
  entities: Record<string, GeometryEntity>;
  constraints?: Record<string, GeometryConstraint>;
}

/** Direct geometry dependencies for each object id and reverse dependent lookup. */
export interface GeometryDependencyGraph {
  dependenciesById: Record<string, string[]>;
  dependentsById: Record<string, string[]>;
}

/** Flattened object row data suitable for object panels and inspectors. */
export interface GeometryObjectSummary {
  id: string;
  kind: 'point' | 'entity';
  geometryKind: GeometryPoint['kind'] | GeometryEntity['kind'];
  label: string;
  hidden: boolean;
  locked: boolean;
  dependencies: string[];
  dependents: string[];
  constructionKind?: GeometryConstruction['kind'];
}

/** Options for deriving object panel rows from a scene. */
export interface GeometryObjectSummaryOptions {
  order?: string[];
  includeHidden?: boolean;
}

/** Object-panel row with dependency labels already resolved for client rendering. */
export interface GeometryObjectPanelRow extends GeometryObjectSummary {
  displayKind: string;
  dependencyLabels: string[];
  dependentLabels: string[];
  constructionLabel?: string;
}

/** Options for SDK-generated object panel rows. */
export interface GeometryObjectPanelOptions extends GeometryObjectSummaryOptions {
  labelForId?: (id: string) => string | undefined;
}

/** Constraint row data suitable for sidebars and inspectors. */
export interface GeometryConstraintSummary {
  id: string;
  kind: GeometryConstraint['kind'];
  label: string;
  enabled: boolean;
  dependencies: string[];
  missingDependencies: string[];
}

/** Persisted geometry-core snapshot shape. */
export type GeometryCoreSnapshot = InstrumentSnapshot<GeometryScene>;

/** Creates an empty point/entity graph. */
export function createEmptyGeometryScene(): GeometryScene {
  return {
    points: {},
    entities: {},
    constraints: {},
  };
}

/** Euclidean distance between two 2D coordinates. */
export function distance2D(a: Vector2, b: Vector2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Midpoint between two 2D coordinates. */
export function midpoint2D(a: Vector2, b: Vector2): Vector2 {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

/** Normalizes an implicit 2D line equation, or returns null when it is degenerate. */
export function normalizeGeometryLineEquation(equation: GeometryLineEquation): GeometryLineEquation | null {
  const magnitude = Math.hypot(equation.a, equation.b);
  if (!Number.isFinite(magnitude) || magnitude < 1e-12 || !Number.isFinite(equation.c)) return null;
  const normalized: GeometryLineEquation = {
    a: equation.a / magnitude,
    b: equation.b / magnitude,
    c: equation.c / magnitude,
  };
  if (equation.input !== undefined) normalized.input = equation.input;
  return normalized;
}

/** Returns a normalized line through two 2D points, or null when the points overlap. */
export function lineEquationFrom2DPoints(a: Vector2, b: Vector2): GeometryLineEquation | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 1e-9) return null;
  return normalizeGeometryLineEquation({
    a: dy,
    b: -dx,
    c: dx * a.y - dy * a.x,
  });
}

/** Point ids referenced directly by a geometry entity. */
export function geometryEntityPointIds(entity: GeometryEntity): string[] {
  switch (entity.kind) {
    case 'segment':
    case 'ray':
    case 'line':
    case 'vector':
    case 'polygon':
    case 'angle':
    case 'plane':
      return [...entity.pointIds];
    case 'circle':
      return [entity.centerId];
    case 'arc':
      return [entity.centerId, entity.startId, entity.endId];
    case 'locus':
    case 'conic':
    case 'parametricCurve':
    case 'relationMarker':
      return [];
  }
}

/** Source object ids referenced by a serializable construction rule. */
export function geometryConstructionSourceIds(construction: GeometryConstruction | undefined): string[] {
  if (!construction) return [];
  switch (construction.kind) {
    case 'midpoint':
    case 'intersection':
    case 'lineThroughPoints':
    case 'angleBisector':
    case 'circumcenter':
    case 'circleThroughPoints':
    case 'angleFromLines':
    case 'custom':
      return uniqueStrings(
        construction.kind === 'angleBisector'
          || construction.kind === 'circumcenter'
          || construction.kind === 'circleThroughPoints'
          ? construction.pointIds
          : construction.sourceIds,
      );
    case 'circleCenterPoint':
      return uniqueStrings([construction.centerPointId, construction.radiusPointId]);
    case 'parallelLine':
    case 'perpendicularLine':
      return uniqueStrings([construction.sourceLineId, construction.throughPointId]);
    case 'tangentLine':
      return uniqueStrings([construction.circleId, construction.throughPointId]);
    case 'transformedPoint':
      return uniqueStrings([construction.sourceId, ...geometryTransform2DSourceIds(construction.transform)]);
    case 'linePlaneIntersection':
      return uniqueStrings([construction.lineEntityId, construction.planeId]);
    case 'planePlaneIntersection':
      return uniqueStrings([construction.firstPlaneId, construction.secondPlaneId]);
  }
}

/* -------------------------------------------------------------------------- */
/* Constraint solving                                                         */
/* -------------------------------------------------------------------------- */

/**
 * How many relaxation passes a constrained scene is given per edit.
 *
 * <p>Constraints are enforced by repeatedly nudging points until they stop
 * moving, which is the classic way an interactive geometry tool loses its frame
 * budget: an over-constrained or contradictory figure never converges, and an
 * uncapped loop spins on every drag. Six passes settle every satisfiable figure
 * this model can express, and a figure that has not settled by then is reported
 * as it stands rather than chased.
 */
const CONSTRAINT_SOLVER_ITERATIONS = 6;

/**
 * Applies every enabled constraint until the scene stops changing.
 *
 * <p>Moved here from the Geometry Calculator, which was its only home, so the
 * Lab can enforce the constraints it has always been able to *store*. Nothing
 * in it reads a Calculator-specific field, so it generalises over any
 * `GeometryScene` unchanged.
 *
 * <p>`changedIds` is what the edit touched, and it decides which end of a
 * constraint gives way: a fixed-length segment whose first point the user just
 * dragged moves its second point, not the one under the cursor.
 */
export function constrainGeometryScene<T extends GeometryScene>(
  scene: T,
  changedIds: Iterable<string>,
): T {
  const constraints = Object.values(scene.constraints ?? {}).filter(constraint => constraint.enabled !== false);
  if (!constraints.length) return scene;

  const changedSet = new Set(changedIds);
  let next = scene;
  for (let iteration = 0; iteration < CONSTRAINT_SOLVER_ITERATIONS; iteration += 1) {
    let changed = false;
    for (const constraint of constraints) {
      const before = next;
      next = enforceGeometryConstraint(next, constraint, changedSet);
      if (next !== before) changed = true;
    }
    if (!changed) break;
    next = recomputeGeometryScene(next);
  }
  return next;
}

function enforceGeometryConstraint<T extends GeometryScene>(
  scene: T,
  constraint: GeometryConstraint,
  changedSet: Set<string>,
): T {
  switch (constraint.kind) {
    case 'fixedLength':
      return enforceFixedLengthConstraint(scene, constraint.pointIds, constraint.length, changedSet);
    case 'fixedAngle':
      return enforceFixedAngleConstraint(scene, constraint.pointIds, constraint.degrees, changedSet);
    case 'parallel':
      return enforceDirectionConstraint(scene, constraint.entityIds, changedSet, false);
    case 'perpendicular':
      return enforceDirectionConstraint(scene, constraint.entityIds, changedSet, true);
    case 'equalLength':
      return enforceEqualLengthConstraint(scene, constraint.segments, changedSet);
    case 'equalRadius':
      return enforceEqualRadiusConstraint(scene, constraint.circleIds, changedSet);
  }
}

function enforceFixedLengthConstraint<T extends GeometryScene>(
  scene: T,
  pointIds: [string, string],
  length: number,
  changedSet: Set<string>,
): T {
  return geometryAdjustSegmentLength(scene, pointIds, length, changedSet);
}

function enforceEqualLengthConstraint<T extends GeometryScene>(
  scene: T,
  segments: [[string, string], [string, string]],
  changedSet: Set<string>,
): T {
  const [firstIds, secondIds] = segments;
  const firstLength = geometrySegmentLength(scene, firstIds);
  const secondLength = geometrySegmentLength(scene, secondIds);
  if (!Number.isFinite(firstLength) || !Number.isFinite(secondLength) || firstLength <= 0 || secondLength <= 0) {
    return scene;
  }
  const firstChanged = idsIntersect(firstIds, changedSet);
  const secondChanged = idsIntersect(secondIds, changedSet);
  if (firstChanged && !secondChanged) return geometryAdjustSegmentLength(scene, firstIds, secondLength, changedSet);
  return geometryAdjustSegmentLength(scene, secondIds, firstLength, changedSet);
}

function enforceFixedAngleConstraint<T extends GeometryScene>(
  scene: T,
  pointIds: [string, string, string],
  degrees: number,
  changedSet: Set<string>,
): T {
  const [firstId, vertexId, secondId] = pointIds;
  const first = constraintPoint2D(scene, firstId);
  const vertex = constraintPoint2D(scene, vertexId);
  const second = constraintPoint2D(scene, secondId);
  if (!first || !vertex || !second || !Number.isFinite(degrees)) return scene;

  const secondEditable = isEditablePoint(scene, secondId);
  const firstEditable = isEditablePoint(scene, firstId);
  const moveSecond = secondEditable && (
    changedSet.has(secondId)
    || changedSet.has(vertexId)
    || !changedSet.has(firstId)
    || !firstEditable
  );

  if (moveSecond) {
    return geometrySetPointOnAngle(scene, {
      moveId: secondId,
      anchor: vertex,
      base: first,
      current: second,
      degrees,
    });
  }
  if (firstEditable) {
    return geometrySetPointOnAngle(scene, {
      moveId: firstId,
      anchor: vertex,
      base: second,
      current: first,
      degrees,
    });
  }
  return scene;
}

function enforceDirectionConstraint<T extends GeometryScene>(
  scene: T,
  entityIds: [string, string],
  changedSet: Set<string>,
  perpendicular: boolean,
): T {
  const firstIds = geometryLineConstraintPointIds(scene, entityIds[0]);
  const secondIds = geometryLineConstraintPointIds(scene, entityIds[1]);
  if (!firstIds || !secondIds) return scene;

  const firstChanged = idsIntersect([...firstIds, entityIds[0]], changedSet);
  const secondChanged = idsIntersect([...secondIds, entityIds[1]], changedSet);
  const targetIds = firstChanged && !secondChanged ? firstIds : secondIds;
  const sourceIds = targetIds === firstIds ? secondIds : firstIds;
  const sourceDirection = segmentDirection(scene, sourceIds);
  if (!sourceDirection) return scene;
  const direction = perpendicular
    ? { x: -sourceDirection.y, y: sourceDirection.x }
    : sourceDirection;
  return adjustLineDirection(scene, targetIds, direction, changedSet);
}

function enforceEqualRadiusConstraint<T extends GeometryScene>(
  scene: T,
  circleIds: [string, string],
  changedSet: Set<string>,
): T {
  const first = scene.entities[circleIds[0]];
  const second = scene.entities[circleIds[1]];
  if (first?.kind !== 'circle' || second?.kind !== 'circle') return scene;
  if (!Number.isFinite(first.radius) || !Number.isFinite(second.radius) || first.radius <= 0 || second.radius <= 0) {
    return scene;
  }

  const firstChanged = idsIntersect([circleIds[0], ...circleConstraintPointIds(first)], changedSet);
  const secondChanged = idsIntersect([circleIds[1], ...circleConstraintPointIds(second)], changedSet);
  if (firstChanged && !secondChanged) return geometrySetCircleRadius(scene, first.id, second.radius);
  return geometrySetCircleRadius(scene, second.id, first.radius);
}

export function geometryAdjustSegmentLength<T extends GeometryScene>(
  scene: T,
  pointIds: [string, string],
  length: number,
  changedSet: Set<string>,
): T {
  if (!Number.isFinite(length) || length <= 0) return scene;
  const moveId = chooseEditablePointToMove(scene, pointIds, changedSet);
  if (!moveId) return scene;
  const anchorId = pointIds[0] === moveId ? pointIds[1] : pointIds[0];
  const move = constraintPoint2D(scene, moveId);
  const anchor = constraintPoint2D(scene, anchorId);
  if (!move || !anchor) return scene;
  const direction = normalizeVector2D({ x: move.x - anchor.x, y: move.y - anchor.y }) ?? { x: 1, y: 0 };
  return geometrySetPointPosition(scene, moveId, {
    x: anchor.x + direction.x * length,
    y: anchor.y + direction.y * length,
  });
}

function adjustLineDirection<T extends GeometryScene>(
  scene: T,
  pointIds: [string, string],
  direction: Vector2,
  changedSet: Set<string>,
): T {
  const normalized = normalizeVector2D(direction);
  if (!normalized) return scene;
  const moveId = chooseEditablePointToMove(scene, pointIds, changedSet);
  if (!moveId) return scene;
  const anchorId = pointIds[0] === moveId ? pointIds[1] : pointIds[0];
  const move = constraintPoint2D(scene, moveId);
  const anchor = constraintPoint2D(scene, anchorId);
  if (!move || !anchor) return scene;
  const length = Math.max(distance2D(move, anchor), 1);
  const currentDirection = normalizeVector2D({ x: move.x - anchor.x, y: move.y - anchor.y });
  const sign = currentDirection && dot(currentDirection, normalized) < 0 ? -1 : 1;
  return geometrySetPointPosition(scene, moveId, {
    x: anchor.x + normalized.x * sign * length,
    y: anchor.y + normalized.y * sign * length,
  });
}

export function geometrySetPointOnAngle<T extends GeometryScene>(
  scene: T,
  options: {
    moveId: string;
    anchor: Vector2;
    base: Vector2;
    current: Vector2;
    degrees: number;
  },
): T {
  const baseDirection = normalizeVector2D({
    x: options.base.x - options.anchor.x,
    y: options.base.y - options.anchor.y,
  });
  if (!baseDirection) return scene;
  const radius = Math.max(distance2D(options.current, options.anchor), 1);
  const baseAngle = Math.atan2(baseDirection.y, baseDirection.x);
  const target = ((options.degrees % 360) * Math.PI) / 180;
  const currentAngle = Math.atan2(options.current.y - options.anchor.y, options.current.x - options.anchor.x);
  const first = baseAngle + target;
  const second = baseAngle - target;
  const angle = angularDistance(currentAngle, first) <= angularDistance(currentAngle, second) ? first : second;
  return geometrySetPointPosition(scene, options.moveId, {
    x: options.anchor.x + Math.cos(angle) * radius,
    y: options.anchor.y + Math.sin(angle) * radius,
  });
}

export function geometrySetCircleRadius<T extends GeometryScene>(
  scene: T,
  circleId: string,
  radius: number,
): T {
  if (!Number.isFinite(radius) || radius <= 0) return scene;
  const circle = scene.entities[circleId];
  if (circle?.kind !== 'circle' || circle.locked) return scene;

  if (circle.construction?.kind === 'circleCenterPoint') {
    const center = constraintPoint2D(scene, circle.construction.centerPointId);
    const radiusPoint = constraintPoint2D(scene, circle.construction.radiusPointId);
    if (!center || !radiusPoint || radiusPoint.locked) return scene;
    const direction = normalizeVector2D({ x: radiusPoint.x - center.x, y: radiusPoint.y - center.y }) ?? { x: 1, y: 0 };
    return geometrySetPointPosition(scene, radiusPoint.id, {
      x: center.x + direction.x * radius,
      y: center.y + direction.y * radius,
    });
  }

  if (circle.construction?.kind === 'circleThroughPoints') return scene;
  if (Math.abs(circle.radius - radius) <= 1e-9) return scene;
  return {
    ...scene,
    entities: {
      ...scene.entities,
      [circle.id]: { ...circle, radius },
    },
  };
}

export function geometrySetPointPosition<T extends GeometryScene>(
  scene: T,
  pointId: string,
  position: Vector2,
): T {
  const point = constraintPoint2D(scene, pointId);
  if (!point || point.locked || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return scene;
  if (Math.abs(point.x - position.x) <= 1e-9 && Math.abs(point.y - position.y) <= 1e-9) return scene;
  return {
    ...scene,
    points: {
      ...scene.points,
      [point.id]: { ...point, x: position.x, y: position.y },
    },
  };
}

function chooseEditablePointToMove<T extends GeometryScene>(
  scene: T,
  pointIds: [string, string],
  changedSet: Set<string>,
): string | null {
  const changed = pointIds.filter(pointId => changedSet.has(pointId) && isEditablePoint(scene, pointId));
  if (changed.length > 0) return changed[changed.length - 1] ?? null;
  if (isEditablePoint(scene, pointIds[1])) return pointIds[1];
  if (isEditablePoint(scene, pointIds[0])) return pointIds[0];
  return null;
}

function isEditablePoint<T extends GeometryScene>(scene: T, pointId: string): boolean {
  const point = constraintPoint2D(scene, pointId);
  return Boolean(point && !point.locked);
}

export function geometryLineConstraintPointIds<T extends GeometryScene>(scene: T, entityId: string): [string, string] | null {
  const entity = scene.entities[entityId];
  if (!entity) return null;
  if (
    entity.kind === 'segment'
    || entity.kind === 'line'
    || entity.kind === 'ray'
    || entity.kind === 'vector'
  ) {
    return entity.pointIds;
  }
  return null;
}

export function geometrySegmentLength<T extends GeometryScene>(scene: T, pointIds: [string, string]): number {
  const first = constraintPoint2D(scene, pointIds[0]);
  const second = constraintPoint2D(scene, pointIds[1]);
  return first && second ? distance2D(first, second) : NaN;
}

function segmentDirection<T extends GeometryScene>(scene: T, pointIds: [string, string]): Vector2 | null {
  const first = constraintPoint2D(scene, pointIds[0]);
  const second = constraintPoint2D(scene, pointIds[1]);
  return first && second ? normalizeVector2D({ x: second.x - first.x, y: second.y - first.y }) : null;
}

function circleConstraintPointIds<T extends GeometryScene>(circle: CircleEntity): string[] {
  const ids = [circle.centerId];
  if (circle.construction?.kind === 'circleCenterPoint') ids.push(circle.construction.radiusPointId);
  if (circle.construction?.kind === 'circleThroughPoints') ids.push(...circle.construction.pointIds);
  return ids;
}

function idsIntersect<T extends GeometryScene>(ids: Iterable<string>, changedSet: Set<string>): boolean {
  for (const id of ids) {
    if (changedSet.has(id)) return true;
  }
  return false;
}

/** Dot product of two 2D vectors. */
function dot(first: Vector2, second: Vector2): number {
  return first.x * second.x + first.y * second.y;
}

/** Smallest absolute angle between two headings, in radians. */
function angularDistance(first: number, second: number): number {
  return Math.abs(normalizeAngleDelta(first - second));
}

/**
 * Wraps an angle difference into (-pi, pi], so 359 and 1 degrees are 2 apart.
 * Copied verbatim from the Calculator rather than rewritten with a modulo: this
 * extraction is meant to preserve behaviour exactly, and the two differ at the
 * boundary where the difference is precisely pi.
 */
function normalizeAngleDelta(delta: number): number {
  let result = delta;
  while (result <= -Math.PI) result += Math.PI * 2;
  while (result > Math.PI) result -= Math.PI * 2;
  return result;
}

/** The 2D point with this id, or undefined when it is missing or 3D. */
function constraintPoint2D<T extends GeometryScene>(scene: T, id: string): GeometryPoint2D | undefined {
  const point = scene.points[id];
  return isGeometryPoint2D(point) ? point : undefined;
}

/* -------------------------------------------------------------------------- */
/* Shared 2D construction builders                                            */
/* -------------------------------------------------------------------------- */

/**
 * The records a construction adds to a scene, before any instrument has decided
 * how to commit them.
 *
 * <p>The two instruments that build 2D geometry disagree about almost
 * everything around a construction - id prefixes, theme colours, whether the
 * result gets selected, and the shape of the delta that carries it - but they
 * agree completely about what a perpendicular *is*. These builders are that
 * agreement, and nothing else: given a scene and an id source, they return the
 * records, and the caller commits them however it commits things.
 *
 * <p>Some constructions need a hidden helper point to pin down a line's
 * direction, which is why this returns points as well as entities even for
 * operations that look like they only add an entity.
 */
export interface GeometryConstructionResult {
  points: GeometryPoint2D[];
  entities: GeometryEntity[];
  /** The object the caller should treat as the result - the last thing created. */
  primaryId: string;
}

/** Supplies ids for newly built records. Instruments pass their own generator. */
export type GeometryIdAllocator = (prefix: string) => string;

function point2D(id: string, position: Vector2, extra: Partial<GeometryPoint2D> = {}): GeometryPoint2D {
  return { id, kind: 'point2d', x: position.x, y: position.y, ...extra };
}

/** Midpoint of two existing points, linked so it follows them. */
export function buildMidpoint2D(
  scene: GeometryScene,
  firstPointId: string,
  secondPointId: string,
  allocate: GeometryIdAllocator,
): GeometryConstructionResult | null {
  const first = scene.points[firstPointId];
  const second = scene.points[secondPointId];
  if (!isGeometryPoint2D(first) || !isGeometryPoint2D(second)) return null;
  if (firstPointId === secondPointId) return null;

  const id = allocate('p');
  const created = point2D(id, midpoint2D(first, second), {
    locked: true,
    construction: { kind: 'midpoint', sourceIds: [firstPointId, secondPointId] },
  });
  return { points: [created], entities: [], primaryId: id };
}

/** Intersection of two entities, at `index` when they meet more than once. */
export function buildIntersection2D(
  scene: GeometryScene,
  firstEntityId: string,
  secondEntityId: string,
  allocate: GeometryIdAllocator,
  index = 0,
): GeometryConstructionResult | null {
  const position = geometryIntersectionPoint2D(scene, firstEntityId, secondEntityId, index);
  if (!position) return null;

  const id = allocate('p');
  const created = point2D(id, position, {
    locked: true,
    construction: { kind: 'intersection', sourceIds: [firstEntityId, secondEntityId], index },
  });
  return { points: [created], entities: [], primaryId: id };
}

/**
 * A line through a point, parallel or perpendicular to an existing line-like
 * entity. The hidden helper point is what gives the line its second defining
 * point; recomputation moves it as the source turns.
 */
export function buildConstructedLine2D(
  scene: GeometryScene,
  kind: 'parallelLine' | 'perpendicularLine',
  sourceEntityId: string,
  throughPointId: string,
  allocate: GeometryIdAllocator,
): GeometryConstructionResult | null {
  const through = scene.points[throughPointId];
  const source = scene.entities[sourceEntityId];
  if (!isGeometryPoint2D(through) || !source) return null;

  const sourceEquation = geometryLineLikeEquation2D(scene, sourceEntityId);
  if (!sourceEquation) return null;

  const equation = kind === 'parallelLine'
    ? normalizeGeometryLineEquation({
      a: sourceEquation.a,
      b: sourceEquation.b,
      c: -(sourceEquation.a * through.x + sourceEquation.b * through.y),
    })
    : normalizeGeometryLineEquation({
      a: -sourceEquation.b,
      b: sourceEquation.a,
      c: -((-sourceEquation.b) * through.x + sourceEquation.a * through.y),
    });
  if (!equation) return null;

  const direction = normalizeVector2D({ x: equation.b, y: -equation.a }) ?? { x: 1, y: 0 };
  const helperId = allocate('p');
  const helper = point2D(helperId, { x: through.x + direction.x, y: through.y + direction.y }, {
    hidden: true,
    locked: true,
  });
  const lineId = allocate('line');
  const line: LineEntity = {
    id: lineId,
    kind: 'line',
    pointIds: [throughPointId, helperId],
    equation,
    construction: { kind, sourceLineId: sourceEntityId, throughPointId },
  };
  return { points: [helper], entities: [line], primaryId: lineId };
}

/** The bisector of the angle at `pointIds[1]`, as a line from the vertex. */
export function buildAngleBisector2D(
  scene: GeometryScene,
  pointIds: [string, string, string],
  allocate: GeometryIdAllocator,
): GeometryConstructionResult | null {
  const vertex = scene.points[pointIds[1]];
  if (!isGeometryPoint2D(vertex)) return null;

  const helperPosition = geometryAngleBisectorPoint2D(scene, pointIds);
  if (!helperPosition) return null;
  const equation = lineEquationFrom2DPoints(vertex, helperPosition);
  if (!equation) return null;

  const helperId = allocate('p');
  const helper = point2D(helperId, helperPosition, { hidden: true, locked: true });
  const lineId = allocate('line');
  const line: LineEntity = {
    id: lineId,
    kind: 'line',
    pointIds: [pointIds[1], helperId],
    equation,
    construction: { kind: 'angleBisector', pointIds },
  };
  return { points: [helper], entities: [line], primaryId: lineId };
}

/** A circle centred on one point and passing through another. */
export function buildCircleByCenterPoint2D(
  scene: GeometryScene,
  centerPointId: string,
  radiusPointId: string,
  allocate: GeometryIdAllocator,
): GeometryConstructionResult | null {
  const center = scene.points[centerPointId];
  const radiusPoint = scene.points[radiusPointId];
  if (!isGeometryPoint2D(center) || !isGeometryPoint2D(radiusPoint)) return null;

  const radius = distance2D(center, radiusPoint);
  if (!Number.isFinite(radius) || radius <= 0) return null;

  const id = allocate('circle');
  const circle: CircleEntity = {
    id,
    kind: 'circle',
    centerId: centerPointId,
    radius,
    construction: { kind: 'circleCenterPoint', centerPointId, radiusPointId },
  };
  return { points: [], entities: [circle], primaryId: id };
}

/** The circle through three points, with its centre as a hidden owned point. */
export function buildCircleThroughPoints2D(
  scene: GeometryScene,
  pointIds: [string, string, string],
  allocate: GeometryIdAllocator,
): GeometryConstructionResult | null {
  const circle = geometryCircumcircle2D(scene, pointIds);
  if (!circle) return null;

  const centerId = allocate('p');
  const center = point2D(centerId, circle.center, { hidden: true, locked: true });
  const id = allocate('circle');
  const entity: CircleEntity = {
    id,
    kind: 'circle',
    centerId,
    radius: circle.radius,
    construction: { kind: 'circleThroughPoints', pointIds },
  };
  return { points: [center], entities: [entity], primaryId: id };
}

/** An infinite line through two existing points. */
export function buildLineThroughPoints2D(
  scene: GeometryScene,
  firstPointId: string,
  secondPointId: string,
  allocate: GeometryIdAllocator,
): GeometryConstructionResult | null {
  const first = scene.points[firstPointId];
  const second = scene.points[secondPointId];
  if (!isGeometryPoint2D(first) || !isGeometryPoint2D(second)) return null;

  const equation = lineEquationFrom2DPoints(first, second);
  if (!equation) return null;

  const id = allocate('line');
  const line: LineEntity = {
    id,
    kind: 'line',
    pointIds: [firstPointId, secondPointId],
    equation,
    construction: { kind: 'lineThroughPoints', sourceIds: [firstPointId, secondPointId] },
  };
  return { points: [], entities: [line], primaryId: id };
}

/**
 * Builds the image of a point or an entity under a transformation.
 *
 * <p>Transforming a whole object is the operation a lesson actually asks for -
 * "reflect this triangle in that line" - so an entity produces an image point
 * per vertex, each individually constructed, plus a matching entity joining
 * them. Every image point follows both its own source vertex and the
 * transformation's defining objects, so dragging the mirror drags the whole
 * reflected triangle.
 */
export function buildTransformedObject2D(
  scene: GeometryScene,
  targetId: string,
  transform: GeometryTransform2D,
  allocate: GeometryIdAllocator,
): GeometryConstructionResult | null {
  const imageOf = (sourceId: string): GeometryPoint2D | null => {
    const source = scene.points[sourceId];
    if (!isGeometryPoint2D(source)) return null;
    const position = applyGeometryTransform2D(scene, transform, source);
    if (!position) return null;
    return point2D(allocate('p'), position, {
      construction: { kind: 'transformedPoint', sourceId, transform },
    });
  };

  const targetPoint = scene.points[targetId];
  if (isGeometryPoint2D(targetPoint)) {
    const image = imageOf(targetId);
    return image ? { points: [image], entities: [], primaryId: image.id } : null;
  }

  const entity = scene.entities[targetId];
  if (!entity) return null;

  // Only entities defined purely by their vertices can be transformed this way.
  // A circle carries a radius and a conic its own sampled points, so each would
  // need its own rule rather than a vertex mapping.
  if (!('pointIds' in entity) || entity.pointIds.length === 0) return null;
  if (entity.kind !== 'segment' && entity.kind !== 'ray' && entity.kind !== 'vector' && entity.kind !== 'polygon') {
    return null;
  }

  const images: GeometryPoint2D[] = [];
  for (const sourceId of entity.pointIds) {
    const image = imageOf(sourceId);
    if (!image) return null;
    images.push(image);
  }

  const entityId = allocate(entity.kind === 'polygon' ? 'poly' : 'seg');
  const imageEntity = {
    ...entity,
    id: entityId,
    pointIds: entity.kind === 'polygon'
      ? images.map(image => image.id)
      : [images[0]?.id, images[1]?.id],
  } as GeometryEntity;
  // The image is a new object rather than a construction of the original
  // entity: its vertices already carry the link, and duplicating it here would
  // make the same dependency twice.
  delete (imageEntity as { construction?: unknown }).construction;

  return { points: images, entities: [imageEntity], primaryId: entityId };
}

/** Equation of any line-like 2D entity, or null when it has none. *//** Equation of any line-like 2D entity, or null when it has none. */
export function geometryLineLikeEquation2D(
  scene: GeometryScene,
  entityId: string,
): GeometryLineEquation | null {
  const entity = scene.entities[entityId];
  if (!entity) return null;
  if (entity.kind === 'line' && entity.equation) return normalizeGeometryLineEquation(entity.equation);
  if (entity.kind !== 'line' && entity.kind !== 'segment' && entity.kind !== 'ray' && entity.kind !== 'vector') {
    return null;
  }
  const first = scene.points[entity.pointIds[0]];
  const second = scene.points[entity.pointIds[1]];
  if (!isGeometryPoint2D(first) || !isGeometryPoint2D(second)) return null;
  return lineEquationFrom2DPoints(first, second);
}

/** Direct source ids for any point/entity in the scene. */
export function geometryObjectDependencies(scene: GeometryScene, objectId: string): string[] {
  const point = scene.points[objectId];
  if (point) return geometryConstructionSourceIds(point.construction);

  const entity = scene.entities[objectId];
  if (!entity) {
    const constraint = scene.constraints?.[objectId];
    return constraint ? geometryConstraintDependencies(constraint) : [];
  }
  const constructionSources = geometryConstructionSourceIds(entity.construction);
  if (constructionSources.length > 0) return constructionSources;

  if (entity.kind === 'relationMarker') return uniqueStrings(entity.targetIds);

  return uniqueStrings([
    ...geometryEntityPointIds(entity),
  ]);
}

/** Objects a transformation is defined by, which its images therefore depend on. */
export function geometryTransform2DSourceIds(transform: GeometryTransform2D): string[] {
  switch (transform.kind) {
    case 'translate':
      return [transform.vectorEntityId];
    case 'translateBy':
      return [];
    case 'rotate':
    case 'reflectPoint':
    case 'dilate':
      return [transform.centerPointId];
    case 'reflectLine':
      return [transform.lineEntityId];
  }
}

/**
 * Maps one point through a transformation, or null when the transformation's
 * own defining objects are missing or degenerate.
 */
export function applyGeometryTransform2D(
  scene: GeometryScene,
  transform: GeometryTransform2D,
  point: Vector2,
): Vector2 | null {
  if (transform.kind === 'translateBy') {
    if (!Number.isFinite(transform.dx) || !Number.isFinite(transform.dy)) return null;
    return { x: point.x + transform.dx, y: point.y + transform.dy };
  }

  if (transform.kind === 'translate') {
    const entity = scene.entities[transform.vectorEntityId];
    if (!entity || !('pointIds' in entity) || entity.pointIds.length < 2) return null;
    const from = scene.points[entity.pointIds[0] as string];
    const to = scene.points[entity.pointIds[1] as string];
    if (!isGeometryPoint2D(from) || !isGeometryPoint2D(to)) return null;
    return { x: point.x + (to.x - from.x), y: point.y + (to.y - from.y) };
  }

  if (transform.kind === 'reflectLine') {
    const equation = geometryLineLikeEquation2D(scene, transform.lineEntityId);
    if (!equation) return null;
    // Reflection across `a x + b y + c = 0`, with the normal already unit
    // length because the equation is normalized on the way in.
    const magnitudeSquared = equation.a * equation.a + equation.b * equation.b;
    if (magnitudeSquared <= 1e-18) return null;
    const signedDistance = (equation.a * point.x + equation.b * point.y + equation.c) / magnitudeSquared;
    return {
      x: point.x - 2 * equation.a * signedDistance,
      y: point.y - 2 * equation.b * signedDistance,
    };
  }

  const centre = scene.points[transform.centerPointId];
  if (!isGeometryPoint2D(centre)) return null;
  const dx = point.x - centre.x;
  const dy = point.y - centre.y;

  if (transform.kind === 'reflectPoint') {
    // A half turn: the centre is the midpoint of a point and its image.
    return { x: centre.x - dx, y: centre.y - dy };
  }

  if (transform.kind === 'dilate') {
    if (!Number.isFinite(transform.factor) || transform.factor === 0) return null;
    return { x: centre.x + dx * transform.factor, y: centre.y + dy * transform.factor };
  }

  if (!Number.isFinite(transform.degrees)) return null;
  const radians = (transform.degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: centre.x + dx * cos - dy * sin,
    y: centre.y + dx * sin + dy * cos,
  };
}

/** Source object ids referenced by a serializable constraint. */
export function geometryConstraintDependencies(constraint: GeometryConstraint): string[] {
  switch (constraint.kind) {
    case 'fixedLength':
      return uniqueStrings(constraint.pointIds);
    case 'fixedAngle':
      return uniqueStrings(constraint.pointIds);
    case 'parallel':
    case 'perpendicular':
      return uniqueStrings(constraint.entityIds);
    case 'equalLength':
      return uniqueStrings(constraint.segments.flat());
    case 'equalRadius':
      return uniqueStrings(constraint.circleIds);
  }
}

/** Intersection of two 2D line-like entities, respecting segment and ray bounds. */
export function geometryLineLikeIntersection2D(
  scene: GeometryScene,
  firstEntityId: string,
  secondEntityId: string,
): Vector2 | null {
  return geometryIntersectionPoint2D(scene, firstEntityId, secondEntityId, 0);
}

/** Returns a stable indexed 2D intersection point for entities that can intersect. */
export function geometryIntersectionPoint2D(
  scene: GeometryScene,
  firstEntityId: string,
  secondEntityId: string,
  index = 0,
): Vector2 | null {
  return geometryIntersectionPoints2D(scene, firstEntityId, secondEntityId)[index] ?? null;
}

/** Returns all supported 2D intersections for lines, rays, segments, circles, and polygon edges. */
export function geometryIntersectionPoints2D(
  scene: GeometryScene,
  firstEntityId: string,
  secondEntityId: string,
): Vector2[] {
  const first = scene.entities[firstEntityId];
  const second = scene.entities[secondEntityId];
  if (!first || !second) return [];

  if (first.kind === 'polygon') return polygonEntityIntersections(scene, first, second);
  if (second.kind === 'polygon') return polygonEntityIntersections(scene, second, first);

  const firstLine = lineEquationForEntity(scene, first);
  const secondLine = lineEquationForEntity(scene, second);
  const firstCircle = circleDataForEntity(scene, first);
  const secondCircle = circleDataForEntity(scene, second);

  if (firstLine && secondLine) {
    const point = lineLineIntersection(firstLine, secondLine);
    if (!point || !entityContainsPoint2D(scene, first, point) || !entityContainsPoint2D(scene, second, point)) return [];
    return [point];
  }

  if (firstLine && secondCircle) return lineCircleIntersections(scene, first, firstLine, secondCircle);
  if (secondLine && firstCircle) return lineCircleIntersections(scene, second, secondLine, firstCircle);
  if (firstCircle && secondCircle) return circleCircleIntersections(firstCircle, secondCircle);

  return [];
}

/** Helper point for a tangent line from a point to a circle. Returns null when impossible. */
export function geometryCircleTangentPoint2D(
  scene: GeometryScene,
  circleId: string,
  throughPointId: string,
  branch: -1 | 1,
): Vector2 | null {
  const circle = scene.entities[circleId];
  const center = circle?.kind === 'circle' ? scene.points[circle.centerId] : undefined;
  const through = scene.points[throughPointId];
  if (!circle || circle.kind !== 'circle' || !isGeometryPoint2D(center) || !isGeometryPoint2D(through)) {
    return null;
  }
  if (!Number.isFinite(circle.radius) || circle.radius <= 0) return null;

  const vx = through.x - center.x;
  const vy = through.y - center.y;
  const distanceSquared = vx * vx + vy * vy;
  const radiusSquared = circle.radius * circle.radius;
  if (distanceSquared < 1e-12) return null;

  const distance = Math.sqrt(distanceSquared);
  if (distance < circle.radius - 1e-9) return null;

  if (Math.abs(distance - circle.radius) <= 1e-9) {
    const radial = normalizeVector2D({ x: vx, y: vy });
    if (!radial) return null;
    return {
      x: through.x + (-radial.y * branch),
      y: through.y + (radial.x * branch),
    };
  }

  const baseScale = radiusSquared / distanceSquared;
  const offsetScale = (branch * circle.radius * Math.sqrt(distanceSquared - radiusSquared)) / distanceSquared;
  return {
    x: center.x + baseScale * vx - offsetScale * vy,
    y: center.y + baseScale * vy + offsetScale * vx,
  };
}

/** Helper point one unit from the vertex along the internal angle bisector. */
export function geometryAngleBisectorPoint2D(
  scene: GeometryScene,
  pointIds: [string, string, string],
): Vector2 | null {
  const first = scene.points[pointIds[0]];
  const vertex = scene.points[pointIds[1]];
  const second = scene.points[pointIds[2]];
  if (!isGeometryPoint2D(first) || !isGeometryPoint2D(vertex) || !isGeometryPoint2D(second)) return null;

  const firstDirection = normalizeVector2D({ x: first.x - vertex.x, y: first.y - vertex.y });
  const secondDirection = normalizeVector2D({ x: second.x - vertex.x, y: second.y - vertex.y });
  if (!firstDirection || !secondDirection) return null;

  let bisector = normalizeVector2D({
    x: firstDirection.x + secondDirection.x,
    y: firstDirection.y + secondDirection.y,
  });

  if (!bisector) {
    bisector = normalizeVector2D({ x: -firstDirection.y, y: firstDirection.x });
  }
  if (!bisector) return null;

  return {
    x: vertex.x + bisector.x,
    y: vertex.y + bisector.y,
  };
}

/** Circumcircle through three non-collinear 2D points. */
export function geometryCircumcircle2D(
  scene: GeometryScene,
  pointIds: [string, string, string],
): { center: Vector2; radius: number } | null {
  const first = scene.points[pointIds[0]];
  const second = scene.points[pointIds[1]];
  const third = scene.points[pointIds[2]];
  if (!isGeometryPoint2D(first) || !isGeometryPoint2D(second) || !isGeometryPoint2D(third)) return null;

  const determinant = 2 * (
    first.x * (second.y - third.y)
    + second.x * (third.y - first.y)
    + third.x * (first.y - second.y)
  );
  if (Math.abs(determinant) < 1e-9) return null;

  const firstSquared = first.x * first.x + first.y * first.y;
  const secondSquared = second.x * second.x + second.y * second.y;
  const thirdSquared = third.x * third.x + third.y * third.y;
  const center = {
    x: (
      firstSquared * (second.y - third.y)
      + secondSquared * (third.y - first.y)
      + thirdSquared * (first.y - second.y)
    ) / determinant,
    y: (
      firstSquared * (third.x - second.x)
      + secondSquared * (first.x - third.x)
      + thirdSquared * (second.x - first.x)
    ) / determinant,
  };
  const radius = distance2D(center, first);
  return Number.isFinite(radius) && radius > 0 ? { center, radius } : null;
}

/** Normalized 3D plane equation through three non-collinear points. */
export function planeEquationFrom3DPoints(
  first: Vector3,
  second: Vector3,
  third: Vector3,
): GeometryPlaneEquation3D | null {
  const firstEdge = subtractVector3D(second, first);
  const secondEdge = subtractVector3D(third, first);
  const cross = cross3D(firstEdge, secondEdge);
  const crossLength = Math.hypot(cross.x, cross.y, cross.z);
  const edgeProduct = Math.hypot(firstEdge.x, firstEdge.y, firstEdge.z)
    * Math.hypot(secondEdge.x, secondEdge.y, secondEdge.z);
  if (!Number.isFinite(edgeProduct) || edgeProduct === 0 || crossLength <= 1e-12 * edgeProduct) return null;
  const normal = normalizeVector3D(cross);
  if (!normal) return null;
  const d = -dot3D(normal, first);
  return { a: normal.x, b: normal.y, c: normal.z, d };
}

/** Normalizes a 3D plane equation, or returns null when it is degenerate. */
export function normalizeGeometryPlaneEquation3D(
  equation: GeometryPlaneEquation3D,
): GeometryPlaneEquation3D | null {
  const magnitude = Math.hypot(equation.a, equation.b, equation.c);
  if (!Number.isFinite(magnitude) || magnitude === 0 || !Number.isFinite(equation.d)) return null;
  return {
    a: equation.a / magnitude,
    b: equation.b / magnitude,
    c: equation.c / magnitude,
    d: equation.d / magnitude,
  };
}

/** Returns the plane equation for a 3D plane entity. */
export function geometryPlaneEquation3D(
  scene: GeometryScene,
  planeEntityId: string,
): GeometryPlaneEquation3D | null {
  const plane = scene.entities[planeEntityId];
  if (!plane || plane.kind !== 'plane') return null;
  const first = scene.points[plane.pointIds[0]];
  const second = scene.points[plane.pointIds[1]];
  const third = scene.points[plane.pointIds[2]];
  return isGeometryPoint3D(first) && isGeometryPoint3D(second) && isGeometryPoint3D(third)
    ? planeEquationFrom3DPoints(first, second, third)
    : null;
}

/** Returns a 3D line for a line-like entity whose points are 3D. */
export function geometryLine3DForEntity(
  scene: GeometryScene,
  entityId: string,
): GeometryLine3D | null {
  const data = line3DDataForEntity(scene, entityId);
  return data?.line ?? null;
}

/** Intersects a 3D line-like entity with a plane entity, respecting ray/segment bounds. */
export function geometryLinePlaneIntersection3D(
  scene: GeometryScene,
  lineEntityId: string,
  planeEntityId: string,
): Vector3 | null {
  const line = line3DDataForEntity(scene, lineEntityId);
  const plane = geometryPlaneEquation3D(scene, planeEntityId);
  if (!line || !plane) return null;

  const normal = { x: plane.a, y: plane.b, z: plane.c };
  const denominator = dot3D(normal, line.line.direction);
  if (Math.abs(denominator) < 1e-9) return null;

  const t = -(dot3D(normal, line.line.point) + plane.d) / denominator;
  if (!lineParameterWithinEntity(line.kind, t)) return null;

  return {
    x: line.line.point.x + line.line.direction.x * t,
    y: line.line.point.y + line.line.direction.y * t,
    z: line.line.point.z + line.line.direction.z * t,
  };
}

/** Intersects two 3D plane entities and returns their infinite intersection line. */
export function geometryPlanePlaneIntersection3D(
  scene: GeometryScene,
  firstPlaneEntityId: string,
  secondPlaneEntityId: string,
): GeometryLine3D | null {
  const first = geometryPlaneEquation3D(scene, firstPlaneEntityId);
  const second = geometryPlaneEquation3D(scene, secondPlaneEntityId);
  if (!first || !second) return null;

  const firstNormal = { x: first.a, y: first.b, z: first.c };
  const secondNormal = { x: second.a, y: second.b, z: second.c };
  const direction = cross3D(firstNormal, secondNormal);
  const directionLengthSquared = dot3D(direction, direction);
  if (directionLengthSquared < 1e-12) return null;

  const pointVector = cross3D(
    subtractVector3D(
      scaleVector3D(firstNormal, second.d),
      scaleVector3D(secondNormal, first.d),
    ),
    direction,
  );
  const normalizedDirection = normalizeVector3D(direction);
  if (!normalizedDirection) return null;

  return {
    point: scaleVector3D(pointVector, 1 / directionLengthSquared),
    direction: normalizedDirection,
  };
}

/** Returns object panel rows with dependency and dependent ids attached. */
export function summarizeGeometryObjects(
  scene: GeometryScene,
  options: GeometryObjectSummaryOptions = {},
): GeometryObjectSummary[] {
  const graph = cachedGeometryDependencyGraph(scene);
  const result: GeometryObjectSummary[] = [];

  for (const point of Object.values(scene.points)) {
    if (!options.includeHidden && point.hidden) continue;
    const summary: GeometryObjectSummary = {
      id: point.id,
      kind: 'point',
      geometryKind: point.kind,
      label: point.label ?? point.id,
      hidden: Boolean(point.hidden),
      locked: Boolean(point.locked),
      dependencies: graph.dependenciesById[point.id] ?? [],
      dependents: graph.dependentsById[point.id] ?? [],
    };
    if (point.construction?.kind) summary.constructionKind = point.construction.kind;
    result.push(summary);
  }

  const orderedEntityIds = orderedGeometryEntityIds(scene, options.order);
  for (const entityId of orderedEntityIds) {
    const entity = scene.entities[entityId];
    if (!entity || (!options.includeHidden && entity.hidden)) continue;
    const summary: GeometryObjectSummary = {
      id: entity.id,
      kind: 'entity',
      geometryKind: entity.kind,
      label: entity.label ?? entity.id,
      hidden: Boolean(entity.hidden),
      locked: Boolean(entity.locked),
      dependencies: graph.dependenciesById[entity.id] ?? [],
      dependents: graph.dependentsById[entity.id] ?? [],
    };
    if (entity.construction?.kind) summary.constructionKind = entity.construction.kind;
    result.push(summary);
  }

  return result;
}

/** Builds object-panel rows with human-readable dependency/dependent labels. */
export function buildGeometryObjectPanelRows(
  scene: GeometryScene,
  options: GeometryObjectPanelOptions = {},
): GeometryObjectPanelRow[] {
  return summarizeGeometryObjects(scene, options).map(summary => {
    const row: GeometryObjectPanelRow = {
      ...summary,
      displayKind: geometryKindLabel(summary.geometryKind),
      dependencyLabels: summary.dependencies.map(id => geometryLabelForId(scene, id, options.labelForId)),
      dependentLabels: summary.dependents.map(id => geometryLabelForId(scene, id, options.labelForId)),
    };
    if (summary.constructionKind) row.constructionLabel = geometryConstructionKindLabel(summary.constructionKind);
    return row;
  });
}

/** Summarizes scene constraints with dependency validation for sidebars and persistence UIs. */
export function summarizeGeometryConstraints(scene: GeometryScene): GeometryConstraintSummary[] {
  return Object.values(scene.constraints ?? {}).map(constraint => {
    const dependencies = geometryConstraintDependencies(constraint);
    return {
      id: constraint.id,
      kind: constraint.kind,
      label: constraint.label ?? geometryConstraintKindLabel(constraint.kind),
      enabled: constraint.enabled ?? true,
      dependencies,
      missingDependencies: dependencies.filter(id => !scene.points[id] && !scene.entities[id]),
    };
  });
}

/** Builds a dependency graph for the whole scene. */
export function buildGeometryDependencyGraph(scene: GeometryScene): GeometryDependencyGraph {
  // Public callers receive their own graph. The instrument hands this straight
  // out to hosts, which are free to mutate what they are given, so the shared
  // cache below is never exposed.
  return computeGeometryDependencyGraph(scene);
}

/**
 * Graphs keyed by the exact scene object they describe.
 *
 * <p>Keyed by identity, so it cannot go stale: any edit produces a new scene
 * object, which is a new key and a fresh build. What it saves is the repeated
 * build within one scene - an object panel asking for summaries, then rows,
 * then a delete plan, all against the same snapshot, used to rebuild the whole
 * graph each time.
 */
const geometryDependencyGraphCache = new WeakMap<GeometryScene, GeometryDependencyGraph>();

function cachedGeometryDependencyGraph(scene: GeometryScene): GeometryDependencyGraph {
  const cached = geometryDependencyGraphCache.get(scene);
  if (cached) return cached;
  const graph = computeGeometryDependencyGraph(scene);
  geometryDependencyGraphCache.set(scene, graph);
  return graph;
}

function computeGeometryDependencyGraph(scene: GeometryScene): GeometryDependencyGraph {
  const dependenciesById: Record<string, string[]> = {};
  const dependentsById: Record<string, string[]> = {};
  const ids = [
    ...Object.keys(scene.points),
    ...Object.keys(scene.entities),
    ...Object.keys(scene.constraints ?? {}),
  ];

  for (const id of ids) {
    dependentsById[id] = [];
  }

  for (const id of ids) {
    const dependencies = geometryObjectDependencies(scene, id).filter(sourceId => sourceId !== id);
    dependenciesById[id] = dependencies;
    for (const sourceId of dependencies) {
      // Pushed rather than rebuilt. This used to be `includes` followed by
      // `[...existing, id]`, which is O(d) time and a fresh array per edge, so
      // O(d^2) on a heavily depended-on object - the shape a dragged control
      // point has. The scan was also redundant: an object's dependency list is
      // already unique, and each id is visited once, so the same edge cannot
      // be offered twice.
      (dependentsById[sourceId] ??= []).push(id);
    }
  }

  return { dependenciesById, dependentsById };
}

/** Returns all transitively dependent ids for a set of changed source ids. */
export function geometryDependentsOf(scene: GeometryScene, changedIds: Iterable<string>): string[] {
  const graph = cachedGeometryDependencyGraph(scene);
  const visited = new Set<string>();
  // A cursor rather than `shift()`, which is O(n) on an array and made this
  // traversal quadratic in the number of dependents it walked.
  const queue: string[] = [...changedIds];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor];
    if (id === undefined) continue;
    for (const dependentId of graph.dependentsById[id] ?? []) {
      if (visited.has(dependentId)) continue;
      visited.add(dependentId);
      queue.push(dependentId);
    }
  }

  return [...visited];
}

/** Recomputes every supported derived object in dependency order. */
export function recomputeGeometryScene<T extends GeometryScene>(scene: T): T {
  return recomputeGeometryObjects(scene, [...Object.keys(scene.points), ...Object.keys(scene.entities)]);
}

/** Recomputes supported derived objects affected by the changed source ids. */
export function recomputeGeometryDependents<T extends GeometryScene>(scene: T, changedIds: Iterable<string>): T {
  const ids = geometryDependentsOf(scene, changedIds);
  return recomputeGeometryObjects(scene, ids);
}

/**
 * Working state for one recompute pass.
 *
 * <p>A recompute walk used to rebuild the scene once per object it moved:
 * every writer returned `{ ...scene, points: { ...scene.points, [id]: next } }`,
 * so moving k derived points in a scene of N copied N entries k times. On the
 * shape that matters - many derived objects driven by one dragged source - that
 * is quadratic, and it was the largest single cost on the drag path.
 *
 * <p>So the pass keeps one draft instead. It holds the original scene until the
 * first actual write, at which point it takes a single shallow copy and mutates
 * that from then on. Two properties fall out, and both are relied on elsewhere:
 * a pass that changes nothing allocates nothing and returns the very same
 * object it was given, so callers comparing by identity still see "unchanged";
 * and a pass that changes anything costs one copy rather than k.
 *
 * <p>The draft is never exposed. It is created and consumed inside
 * `recomputeGeometryObjects`, and the scene handed back out is not mutated
 * again after that function returns, so callers keep the immutable snapshot
 * semantics they had before.
 */
interface GeometryRecomputeDraft<T extends GeometryScene> {
  scene: T;
  changed: boolean;
}

/**
 * Takes the pass's single copy, the first time something is actually written.
 * Both records are copied together: a writer that touches a point and an entity
 * in one step would otherwise copy at two different moments and leave the draft
 * half-shared.
 */
function makeGeometryDraftWritable<T extends GeometryScene>(draft: GeometryRecomputeDraft<T>): void {
  if (draft.changed) return;
  draft.scene = {
    ...draft.scene,
    points: { ...draft.scene.points },
    entities: { ...draft.scene.entities },
  };
  draft.changed = true;
}

function setGeometryDraftPoint<T extends GeometryScene>(
  draft: GeometryRecomputeDraft<T>,
  point: GeometryPoint,
): void {
  makeGeometryDraftWritable(draft);
  draft.scene.points[point.id] = point;
}

function setGeometryDraftEntity<T extends GeometryScene>(
  draft: GeometryRecomputeDraft<T>,
  entity: GeometryEntity,
): void {
  makeGeometryDraftWritable(draft);
  draft.scene.entities[entity.id] = entity;
}

function recomputeGeometryObjects<T extends GeometryScene>(scene: T, objectIds: Iterable<string>): T {
  const draft: GeometryRecomputeDraft<T> = { scene, changed: false };
  const done = new Set<string>();
  const active = new Set<string>();

  const visit = (id: string): void => {
    if (done.has(id) || active.has(id)) return;
    active.add(id);
    // Dependencies are read from the draft's current scene, so an object still
    // sees sources recomputed earlier in this same walk.
    for (const dependencyId of geometryObjectDependencies(draft.scene, id)) {
      visit(dependencyId);
    }
    active.delete(id);
    recomputeGeometryObject(draft, id);
    done.add(id);
  };

  for (const id of objectIds) visit(id);
  return draft.scene;
}

function recomputeGeometryObject<T extends GeometryScene>(
  draft: GeometryRecomputeDraft<T>,
  objectId: string,
): void {
  const point = draft.scene.points[objectId];
  if (point) {
    recomputeGeometryPoint(draft, point);
    return;
  }

  const entity = draft.scene.entities[objectId];
  if (entity) recomputeGeometryEntity(draft, entity);
}

function recomputeGeometryPoint<T extends GeometryScene>(
  draft: GeometryRecomputeDraft<T>,
  point: GeometryPoint,
): void {
  if (point.kind !== 'point2d') return;
  if (!point.construction) return;

  const scene = draft.scene;

  if (point.construction.kind === 'intersection') {
    const [firstId, secondId] = point.construction.sourceIds;
    const nextPosition = geometryIntersectionPoint2D(scene, firstId, secondId, point.construction.index ?? 0);
    if (!nextPosition) return;
    updateGeometryPointPosition(draft, point, nextPosition);
    return;
  }

  if (point.construction.kind === 'circumcenter') {
    const circle = geometryCircumcircle2D(scene, point.construction.pointIds);
    if (circle) updateGeometryPointPosition(draft, point, circle.center);
    return;
  }

  if (point.construction.kind === 'transformedPoint') {
    const { sourceId, transform } = point.construction;
    const source = scene.points[sourceId];
    if (!isGeometryPoint2D(source)) return;
    const image = applyGeometryTransform2D(scene, transform, source);
    if (image) updateGeometryPointPosition(draft, point, image);
    return;
  }

  if (point.construction.kind !== 'midpoint') return;

  const [firstId, secondId] = point.construction.sourceIds;
  const first = scene.points[firstId];
  const second = scene.points[secondId];
  if (!isGeometryPoint2D(first) || !isGeometryPoint2D(second)) return;

  updateGeometryPointPosition(draft, point, midpoint2D(first, second));
}

function recomputeGeometryEntity<T extends GeometryScene>(
  draft: GeometryRecomputeDraft<T>,
  entity: GeometryEntity,
): void {
  const scene = draft.scene;

  if (entity.kind === 'line') {
    if (entity.construction?.kind === 'angleBisector') {
      recomputeAngleBisectorLine(draft, entity);
      return;
    }

    if (entity.construction?.kind === 'tangentLine') {
      recomputeTangentLine(draft, entity);
      return;
    }

    if (entity.construction?.kind === 'parallelLine' || entity.construction?.kind === 'perpendicularLine') {
      recomputeConstructedLine(draft, entity);
      return;
    }

    const [firstId, secondId] = entity.pointIds;
    const first = scene.points[firstId];
    const second = scene.points[secondId];
    if (!isGeometryPoint2D(first) || !isGeometryPoint2D(second)) return;

    const equation = lineEquationFrom2DPoints(first, second);
    if (!equation || sameLineEquation(entity.equation, equation)) return;
    setGeometryDraftEntity(draft, { ...entity, equation });
    return;
  }

  if (entity.kind === 'circle' && entity.construction?.kind === 'circleCenterPoint') {
    const center = scene.points[entity.construction.centerPointId];
    const radiusPoint = scene.points[entity.construction.radiusPointId];
    if (!isGeometryPoint2D(center) || !isGeometryPoint2D(radiusPoint)) return;

    const radius = distance2D(center, radiusPoint);
    if (!Number.isFinite(radius) || radius <= 0 || nearlyEqual(entity.radius, radius)) return;
    setGeometryDraftEntity(draft, { ...entity, centerId: center.id, radius });
    return;
  }

  if (entity.kind === 'circle' && entity.construction?.kind === 'circleThroughPoints') {
    const circle = geometryCircumcircle2D(scene, entity.construction.pointIds);
    const center = scene.points[entity.centerId];
    if (!circle || !isGeometryPoint2D(center)) return;
    const nextCenter = { ...center, x: circle.center.x, y: circle.center.y, hidden: true, locked: true };
    if (
      nearlyEqual(center.x, nextCenter.x)
      && nearlyEqual(center.y, nextCenter.y)
      && nearlyEqual(entity.radius, circle.radius)
      && center.hidden === true
      && center.locked === true
    ) {
      return;
    }
    setGeometryDraftPoint(draft, nextCenter);
    setGeometryDraftEntity(draft, { ...entity, centerId: center.id, radius: circle.radius });
  }
}

function recomputeAngleBisectorLine<T extends GeometryScene>(
  draft: GeometryRecomputeDraft<T>,
  entity: LineEntity,
): void {
  const scene = draft.scene;
  const construction = entity.construction;
  if (construction?.kind !== 'angleBisector') return;

  const vertex = scene.points[construction.pointIds[1]];
  const helper = scene.points[entity.pointIds[1]];
  if (!isGeometryPoint2D(vertex) || !isGeometryPoint2D(helper)) return;

  const helperPosition = geometryAngleBisectorPoint2D(scene, construction.pointIds);
  if (!helperPosition) return;

  const equation = lineEquationFrom2DPoints(vertex, helperPosition);
  if (!equation) return;

  const nextHelper = {
    ...helper,
    x: helperPosition.x,
    y: helperPosition.y,
    hidden: true,
    locked: true,
  };

  const nextEntity: LineEntity = sameLineEquation(entity.equation, equation)
    && entity.pointIds[0] === vertex.id
    && entity.pointIds[1] === helper.id
    ? entity
    : { ...entity, pointIds: [vertex.id, helper.id], equation };

  if (
    nextEntity === entity
    && nearlyEqual(helper.x, nextHelper.x)
    && nearlyEqual(helper.y, nextHelper.y)
    && helper.hidden === true
    && helper.locked === true
  ) {
    return;
  }

  setGeometryDraftPoint(draft, nextHelper);
  setGeometryDraftEntity(draft, nextEntity);
}

function recomputeTangentLine<T extends GeometryScene>(
  draft: GeometryRecomputeDraft<T>,
  entity: LineEntity,
): void {
  const scene = draft.scene;
  const construction = entity.construction;
  if (construction?.kind !== 'tangentLine') return;

  const through = scene.points[construction.throughPointId];
  const helper = scene.points[entity.pointIds[1]];
  if (!isGeometryPoint2D(through) || !isGeometryPoint2D(helper)) return;

  const helperPosition = geometryCircleTangentPoint2D(
    scene,
    construction.circleId,
    construction.throughPointId,
    construction.branch,
  );
  if (!helperPosition) return;

  const equation = lineEquationFrom2DPoints(through, helperPosition);
  if (!equation) return;

  const nextHelper = {
    ...helper,
    x: helperPosition.x,
    y: helperPosition.y,
    hidden: true,
    locked: true,
  };

  const nextEntity: LineEntity = sameLineEquation(entity.equation, equation)
    && entity.pointIds[0] === through.id
    && entity.pointIds[1] === helper.id
    ? entity
    : { ...entity, pointIds: [through.id, helper.id], equation };

  if (
    nextEntity === entity
    && nearlyEqual(helper.x, nextHelper.x)
    && nearlyEqual(helper.y, nextHelper.y)
    && helper.hidden === true
    && helper.locked === true
  ) {
    return;
  }

  setGeometryDraftPoint(draft, nextHelper);
  setGeometryDraftEntity(draft, nextEntity);
}

function recomputeConstructedLine<T extends GeometryScene>(
  draft: GeometryRecomputeDraft<T>,
  entity: LineEntity,
): void {
  const scene = draft.scene;
  const construction = entity.construction;
  if (construction?.kind !== 'parallelLine' && construction?.kind !== 'perpendicularLine') return;

  const through = scene.points[construction.throughPointId];
  const helper = scene.points[entity.pointIds[1]];
  if (!isGeometryPoint2D(through) || !isGeometryPoint2D(helper)) return;

  const sourceEquation = lineEquationForEntity(scene, scene.entities[construction.sourceLineId]);
  if (!sourceEquation) return;

  const equation = construction.kind === 'parallelLine'
    ? normalizeGeometryLineEquation({
      a: sourceEquation.a,
      b: sourceEquation.b,
      c: -(sourceEquation.a * through.x + sourceEquation.b * through.y),
    })
    : normalizeGeometryLineEquation({
      a: -sourceEquation.b,
      b: sourceEquation.a,
      c: -((-sourceEquation.b) * through.x + sourceEquation.a * through.y),
    });
  if (!equation) return;

  const direction = normalizeVector2D({ x: equation.b, y: -equation.a }) ?? { x: 1, y: 0 };
  const nextHelper = {
    ...helper,
    x: through.x + direction.x,
    y: through.y + direction.y,
    hidden: true,
    locked: true,
  };

  const nextEntity: LineEntity = sameLineEquation(entity.equation, equation)
    && entity.pointIds[0] === through.id
    && entity.pointIds[1] === helper.id
    ? entity
    : { ...entity, pointIds: [through.id, helper.id], equation };

  if (
    nextEntity === entity
    && nearlyEqual(helper.x, nextHelper.x)
    && nearlyEqual(helper.y, nextHelper.y)
    && helper.hidden === true
    && helper.locked === true
  ) {
    return;
  }

  setGeometryDraftPoint(draft, nextHelper);
  setGeometryDraftEntity(draft, nextEntity);
}

function updateGeometryPointPosition<T extends GeometryScene>(
  draft: GeometryRecomputeDraft<T>,
  point: GeometryPoint2D,
  position: Vector2,
): void {
  if (nearlyEqual(point.x, position.x) && nearlyEqual(point.y, position.y)) return;
  setGeometryDraftPoint(draft, { ...point, x: position.x, y: position.y });
}

function orderedGeometryEntityIds(scene: GeometryScene, order: string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of order ?? []) {
    if (scene.entities[id] && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  for (const id of Object.keys(scene.entities)) {
    if (!seen.has(id)) result.push(id);
  }
  return result;
}

interface CircleData {
  center: GeometryPoint2D;
  radius: number;
}

interface Line3DData {
  line: GeometryLine3D;
  kind: 'line' | 'segment' | 'ray' | 'vector';
}

function polygonEntityIntersections(
  scene: GeometryScene,
  polygon: PolygonEntity,
  other: GeometryEntity,
): Vector2[] {
  const result: Vector2[] = [];
  const edges = polygonEdges(scene, polygon);

  if (other.kind === 'polygon') {
    const otherEdges = polygonEdges(scene, other);
    for (const edge of edges) {
      for (const otherEdge of otherEdges) {
        result.push(...lineLineIntersectionsForEntities(scene, edge, otherEdge));
      }
    }
    return uniquePoints(result);
  }

  for (const edge of edges) {
    result.push(...entityIntersectionsWithoutPolygons(scene, edge, other));
  }
  return uniquePoints(result);
}

function entityIntersectionsWithoutPolygons(
  scene: GeometryScene,
  first: SegmentEntity | RayEntity | LineEntity | VectorEntity,
  second: GeometryEntity,
): Vector2[] {
  const firstLine = lineEquationForEntity(scene, first);
  const secondLine = lineEquationForEntity(scene, second);
  const secondCircle = circleDataForEntity(scene, second);
  if (firstLine && secondLine) return lineLineIntersectionsForEntities(scene, first, second);
  if (firstLine && secondCircle) return lineCircleIntersections(scene, first, firstLine, secondCircle);
  return [];
}

function lineLineIntersectionsForEntities(
  scene: GeometryScene,
  first: GeometryEntity,
  second: GeometryEntity,
): Vector2[] {
  const firstLine = lineEquationForEntity(scene, first);
  const secondLine = lineEquationForEntity(scene, second);
  if (!firstLine || !secondLine) return [];
  const point = lineLineIntersection(firstLine, secondLine);
  if (!point || !entityContainsPoint2D(scene, first, point) || !entityContainsPoint2D(scene, second, point)) return [];
  return [point];
}

function polygonEdges(scene: GeometryScene, polygon: PolygonEntity): SegmentEntity[] {
  const edges: SegmentEntity[] = [];
  for (let index = 0; index < polygon.pointIds.length; index += 1) {
    const firstId = polygon.pointIds[index];
    const secondId = polygon.pointIds[(index + 1) % polygon.pointIds.length];
    if (!firstId || !secondId) continue;
    const edge: SegmentEntity = {
      id: `${polygon.id}:edge:${index}`,
      kind: 'segment',
      pointIds: [firstId, secondId],
    };
    if (polygon.hidden !== undefined) edge.hidden = polygon.hidden;
    edges.push(edge);
  }
  return edges;
}

function circleDataForEntity(scene: GeometryScene, entity: GeometryEntity | undefined): CircleData | null {
  if (!entity || entity.kind !== 'circle') return null;
  const center = scene.points[entity.centerId];
  if (!isGeometryPoint2D(center) || !Number.isFinite(entity.radius) || entity.radius <= 0) return null;
  return { center, radius: entity.radius };
}

function lineCircleIntersections(
  scene: GeometryScene,
  lineEntity: GeometryEntity,
  line: GeometryLineEquation,
  circle: CircleData,
): Vector2[] {
  const signedDistance = line.a * circle.center.x + line.b * circle.center.y + line.c;
  const foot = {
    x: circle.center.x - line.a * signedDistance,
    y: circle.center.y - line.b * signedDistance,
  };
  const distance = Math.abs(signedDistance);
  if (distance > circle.radius + 1e-9) return [];
  if (Math.abs(distance - circle.radius) <= 1e-9) {
    return entityContainsPoint2D(scene, lineEntity, foot) ? [foot] : [];
  }

  const offset = Math.sqrt(Math.max(0, circle.radius * circle.radius - distance * distance));
  const direction = normalizeVector2D({ x: line.b, y: -line.a });
  if (!direction) return [];
  return uniquePoints([
    { x: foot.x + direction.x * offset, y: foot.y + direction.y * offset },
    { x: foot.x - direction.x * offset, y: foot.y - direction.y * offset },
  ].filter(point => entityContainsPoint2D(scene, lineEntity, point)));
}

function circleCircleIntersections(first: CircleData, second: CircleData): Vector2[] {
  const dx = second.center.x - first.center.x;
  const dy = second.center.y - first.center.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-12) return [];
  if (distance > first.radius + second.radius + 1e-9) return [];
  if (distance < Math.abs(first.radius - second.radius) - 1e-9) return [];

  const along = (first.radius * first.radius - second.radius * second.radius + distance * distance) / (2 * distance);
  const heightSquared = first.radius * first.radius - along * along;
  if (heightSquared < -1e-9) return [];

  const unit = { x: dx / distance, y: dy / distance };
  const base = {
    x: first.center.x + along * unit.x,
    y: first.center.y + along * unit.y,
  };

  if (Math.abs(heightSquared) <= 1e-9) return [base];

  const height = Math.sqrt(Math.max(0, heightSquared));
  return uniquePoints([
    { x: base.x - unit.y * height, y: base.y + unit.x * height },
    { x: base.x + unit.y * height, y: base.y - unit.x * height },
  ]);
}

function line3DDataForEntity(scene: GeometryScene, entityId: string): Line3DData | null {
  const entity = scene.entities[entityId];
  if (!entity || !hasTwoPointIds(entity)) return null;
  const first = scene.points[entity.pointIds[0]];
  const second = scene.points[entity.pointIds[1]];
  if (!isGeometryPoint3D(first) || !isGeometryPoint3D(second)) return null;

  const direction = subtractVector3D(second, first);
  if (Math.hypot(direction.x, direction.y, direction.z) < 1e-12) return null;
  return {
    line: {
      point: { x: first.x, y: first.y, z: first.z },
      direction,
    },
    kind: entity.kind,
  };
}

function lineParameterWithinEntity(kind: Line3DData['kind'], t: number): boolean {
  if (kind === 'line') return true;
  if (kind === 'ray') return t >= -1e-9;
  return t >= -1e-9 && t <= 1 + 1e-9;
}

function lineEquationForEntity(
  scene: GeometryScene,
  entity: GeometryEntity | undefined,
): GeometryLineEquation | null {
  if (!entity) return null;
  if (entity.kind === 'line' && entity.equation) {
    const equation = normalizeGeometryLineEquation(entity.equation);
    if (equation) return equation;
  }

  if (!hasTwoPointIds(entity)) return null;
  const [firstId, secondId] = entity.pointIds;
  const first = scene.points[firstId];
  const second = scene.points[secondId];
  return isGeometryPoint2D(first) && isGeometryPoint2D(second)
    ? lineEquationFrom2DPoints(first, second)
    : null;
}

function entityContainsPoint2D(scene: GeometryScene, entity: GeometryEntity, point: Vector2): boolean {
  if (entity.kind === 'line') return true;
  if (!hasTwoPointIds(entity)) return false;

  const [firstId, secondId] = entity.pointIds;
  const first = scene.points[firstId];
  const second = scene.points[secondId];
  if (!isGeometryPoint2D(first) || !isGeometryPoint2D(second)) return false;

  if (entity.kind === 'ray') {
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const dot = (point.x - first.x) * dx + (point.y - first.y) * dy;
    return dot >= -1e-8 && pointDistanceToLine(point, first, second) <= 1e-8;
  }

  return pointDistanceToSegment(point, first, second) <= 1e-8;
}

function hasTwoPointIds(
  entity: GeometryEntity,
): entity is SegmentEntity | RayEntity | LineEntity | VectorEntity {
  return entity.kind === 'segment'
    || entity.kind === 'ray'
    || entity.kind === 'line'
    || entity.kind === 'vector';
}

function lineLineIntersection(first: GeometryLineEquation, second: GeometryLineEquation): Vector2 | null {
  const determinant = first.a * second.b - second.a * first.b;
  if (Math.abs(determinant) < 1e-9) return null;
  return {
    x: (first.b * second.c - second.b * first.c) / determinant,
    y: (second.a * first.c - first.a * second.c) / determinant,
  };
}

function pointDistanceToLine(point: Vector2, first: Vector2, second: Vector2): number {
  const equation = lineEquationFrom2DPoints(first, second);
  return equation ? Math.abs(equation.a * point.x + equation.b * point.y + equation.c) : Infinity;
}

function pointDistanceToSegment(point: Vector2, first: Vector2, second: Vector2): number {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-12) return distance2D(point, first);
  const t = Math.min(1, Math.max(0, ((point.x - first.x) * dx + (point.y - first.y) * dy) / lengthSquared));
  return distance2D(point, { x: first.x + dx * t, y: first.y + dy * t });
}

function normalizeVector2D(vector: Vector2): Vector2 | null {
  const length = Math.hypot(vector.x, vector.y);
  if (!Number.isFinite(length) || length < 1e-12) return null;
  return { x: vector.x / length, y: vector.y / length };
}

function subtractVector3D(first: Vector3, second: Vector3): Vector3 {
  return {
    x: first.x - second.x,
    y: first.y - second.y,
    z: first.z - second.z,
  };
}

function scaleVector3D(vector: Vector3, scale: number): Vector3 {
  return {
    x: vector.x * scale,
    y: vector.y * scale,
    z: vector.z * scale,
  };
}

function dot3D(first: Vector3, second: Vector3): number {
  return first.x * second.x + first.y * second.y + first.z * second.z;
}

function cross3D(first: Vector3, second: Vector3): Vector3 {
  return {
    x: first.y * second.z - first.z * second.y,
    y: first.z * second.x - first.x * second.z,
    z: first.x * second.y - first.y * second.x,
  };
}

function normalizeVector3D(vector: Vector3): Vector3 | null {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (!Number.isFinite(length) || length === 0) return null;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function isGeometryPoint2D(point: GeometryPoint | undefined): point is GeometryPoint2D {
  return point?.kind === 'point2d';
}

function isGeometryPoint3D(point: GeometryPoint | undefined): point is GeometryPoint3D {
  return point?.kind === 'point3d';
}

function geometryLabelForId(
  scene: GeometryScene,
  id: string,
  labelForId: ((id: string) => string | undefined) | undefined,
): string {
  const custom = labelForId?.(id);
  if (custom) return custom;
  const point = scene.points[id];
  if (point) return point.label ?? point.id;
  const entity = scene.entities[id];
  if (entity) return entity.label ?? entity.id;
  const constraint = scene.constraints?.[id];
  if (constraint) return constraint.label ?? geometryConstraintKindLabel(constraint.kind);
  return id;
}

function geometryKindLabel(kind: GeometryPoint['kind'] | GeometryEntity['kind']): string {
  switch (kind) {
    case 'point2d':
      return 'Point';
    case 'point3d':
      return '3D point';
    case 'segment':
      return 'Segment';
    case 'ray':
      return 'Ray';
    case 'line':
      return 'Line';
    case 'vector':
      return 'Vector';
    case 'polygon':
      return 'Polygon';
    case 'circle':
      return 'Circle';
    case 'arc':
      return 'Arc';
    case 'conic':
      return 'Conic';
    case 'parametricCurve':
      return 'Parametric curve';
    case 'angle':
      return 'Angle';
    case 'plane':
      return 'Plane';
    case 'locus':
      return 'Locus';
    case 'relationMarker':
      return 'Relation marker';
  }
}

function geometryConstructionKindLabel(kind: GeometryConstruction['kind']): string {
  switch (kind) {
    case 'midpoint':
      return 'Midpoint';
    case 'intersection':
      return 'Intersection';
    case 'lineThroughPoints':
      return 'Line through points';
    case 'circleCenterPoint':
      return 'Circle by center and point';
    case 'circumcenter':
      return 'Circumcenter';
    case 'circleThroughPoints':
      return 'Circle through points';
    case 'parallelLine':
      return 'Parallel line';
    case 'perpendicularLine':
      return 'Perpendicular line';
    case 'tangentLine':
      return 'Tangent line';
    case 'angleBisector':
      return 'Angle bisector';
    case 'angleFromLines':
      return 'Angle from lines';
    case 'transformedPoint':
      return 'Transformed point';
    case 'linePlaneIntersection':
      return 'Line-plane intersection';
    case 'planePlaneIntersection':
      return 'Plane-plane intersection';
    case 'custom':
      return 'Custom construction';
  }
}

function geometryConstraintKindLabel(kind: GeometryConstraint['kind']): string {
  switch (kind) {
    case 'fixedLength':
      return 'Fixed length';
    case 'fixedAngle':
      return 'Fixed angle';
    case 'parallel':
      return 'Parallel lock';
    case 'perpendicular':
      return 'Perpendicular lock';
    case 'equalLength':
      return 'Equal length';
    case 'equalRadius':
      return 'Equal radius';
  }
}

function sameLineEquation(
  first: GeometryLineEquation | undefined,
  second: GeometryLineEquation,
): boolean {
  if (!first) return false;
  const sameDirection = nearlyEqual(first.a, second.a)
    && nearlyEqual(first.b, second.b)
    && nearlyEqual(first.c, second.c);
  const oppositeDirection = nearlyEqual(first.a, -second.a)
    && nearlyEqual(first.b, -second.b)
    && nearlyEqual(first.c, -second.c);
  return sameDirection || oppositeDirection;
}

function nearlyEqual(first: number, second: number): boolean {
  return Math.abs(first - second) <= 1e-9;
}

function uniquePoints(points: Vector2[]): Vector2[] {
  const result: Vector2[] = [];
  for (const point of points) {
    if (!result.some(candidate => distance2D(candidate, point) <= 1e-7)) result.push(point);
  }
  return result;
}

function uniqueStrings(ids: Iterable<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}
