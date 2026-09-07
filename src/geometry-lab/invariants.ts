import { KleinSdkError } from '../core/index.js';
import type { JsonValue, ValidationIssue, Vector2, Vector3 } from '../core/index.js';
import type { GeometryConstruction, GeometryConstraint, GeometryEntity, GeometryPoint } from '../geometry-core/index.js';
import { buildGeometryLabIntegrityView } from './dependencies.js';
import type { GeometryLabDependencyKey, GeometryLabIntegrityView } from './dependencies.js';
import type {
  GeometryEntity3D,
  GeometryLabSnapshot,
  GeometrySelection,
  Measurement3D,
  SolidEntity,
  SurfaceEntity3D,
  WorkPlane3D,
} from './types.js';

type Identified = { id: string };

/** Returns cross-record integrity problems in an otherwise shape-valid Geometry Lab snapshot. */
export function getGeometryLabInvariantIssues(snapshot: GeometryLabSnapshot): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenIds = new Map<string, string>();
  const scene2d = snapshot.scene.scene2d;
  const scene3d = snapshot.scene.scene3d;

  registerRecord('scene.scene2d.points', scene2d.points, seenIds, issues);
  registerRecord('scene.scene2d.entities', scene2d.entities, seenIds, issues);
  registerRecord('scene.scene2d.constraints', scene2d.constraints ?? {}, seenIds, issues);
  registerRecord('scene.scene3d.points', scene3d.points, seenIds, issues);
  registerRecord('scene.scene3d.entities', scene3d.entities, seenIds, issues);
  registerRecord('scene.scene3d.workPlanes', scene3d.workPlanes, seenIds, issues);
  registerRecord('scene.scene3d.measurements', scene3d.measurements, seenIds, issues);
  registerRecord('scene.scene3d.nets', scene3d.nets, seenIds, issues);
  snapshot.scene.links.forEach((link, index) => registerId(link, `scene.links[${index}]`, seenIds, issues));

  const point2dIds = new Set(Object.keys(scene2d.points));
  const entity2dIds = new Set(Object.keys(scene2d.entities));
  const point3dIds = new Set(Object.keys(scene3d.points));
  const entity3dIds = new Set(Object.keys(scene3d.entities));
  const workPlaneIds = new Set(Object.keys(scene3d.workPlanes));
  const measurementIds = new Set(Object.keys(scene3d.measurements));
  const netIds = new Set(Object.keys(scene3d.nets));
  const constraintIds = new Set(Object.keys(scene2d.constraints ?? {}));
  const topLevelIds = unionSets(
    point2dIds,
    entity2dIds,
    point3dIds,
    entity3dIds,
    workPlaneIds,
    measurementIds,
    netIds,
    constraintIds,
  );

  for (const [id, point] of Object.entries(scene2d.points)) {
    const path = `scene.scene2d.points.${id}`;
    if (point.kind !== 'point2d') addIssue(issues, `${path}.kind`, 'A 2D scene point must have kind "point2d".');
    checkVector2(point, path, issues);
    checkConstruction(point.construction, `${path}.construction`, topLevelIds, issues);
  }
  for (const [id, point] of Object.entries(scene3d.points)) {
    const path = `scene.scene3d.points.${id}`;
    if (point.kind !== 'point3d') addIssue(issues, `${path}.kind`, 'A 3D scene point must have kind "point3d".');
    checkVector3(point, path, issues);
    checkConstruction(point.construction, `${path}.construction`, topLevelIds, issues);
  }

  for (const [id, entity] of Object.entries(scene2d.entities)) {
    checkGeometryEntityReferences(entity, `scene.scene2d.entities.${id}`, point2dIds, topLevelIds, issues);
    checkConstruction(entity.construction, `scene.scene2d.entities.${id}.construction`, topLevelIds, issues);
  }
  for (const [id, constraint] of Object.entries(scene2d.constraints ?? {})) {
    checkConstraintReferences(constraint, `scene.scene2d.constraints.${id}`, point2dIds, entity2dIds, issues);
  }
  for (const [id, entity] of Object.entries(scene3d.entities)) {
    checkEntity3D(entity, `scene.scene3d.entities.${id}`, point3dIds, entity3dIds, workPlaneIds, topLevelIds, issues);
  }
  for (const [id, plane] of Object.entries(scene3d.workPlanes)) {
    checkWorkPlane(plane, `scene.scene3d.workPlanes.${id}`, point3dIds, entity3dIds, workPlaneIds, issues);
  }
  for (const [id, measurement] of Object.entries(scene3d.measurements)) {
    checkMeasurement(
      measurement,
      `scene.scene3d.measurements.${id}`,
      topLevelIds,
      point3dIds,
      workPlaneIds,
      scene3d.entities,
      issues,
    );
  }
  for (const [id, net] of Object.entries(scene3d.nets)) {
    const path = `scene.scene3d.nets.${id}`;
    const solid = scene3d.entities[net.solidId];
    if (!solid || solid.kind !== 'solid') addIssue(issues, `${path}.solidId`, `Net references missing solid "${net.solidId}".`);
    const faceIds = new Set(solid?.kind === 'solid' ? solid.faceIds : []);
    const seenFaceIds = new Set<string>();
    for (let index = 0; index < net.faces.length; index += 1) {
      const face = net.faces[index];
      if (!face) continue;
      const facePath = `${path}.faces[${index}]`;
      if (seenFaceIds.has(face.id)) addIssue(issues, `${facePath}.id`, `Duplicate net face id "${face.id}".`);
      seenFaceIds.add(face.id);
      if (!faceIds.has(face.sourceFaceId)) addIssue(issues, `${facePath}.sourceFaceId`, `Net face references missing solid face "${face.sourceFaceId}".`);
      face.vertices.forEach((vertex, vertexIndex) => checkVector2(vertex, `${facePath}.vertices[${vertexIndex}]`, issues));
      checkOptionalFinite(face.area, `${facePath}.area`, issues);
    }
    checkOptionalFinite(net.totalArea, `${path}.totalArea`, issues);
  }

  if (!scene3d.workPlanes.xy) addIssue(issues, 'scene.scene3d.workPlanes.xy', 'The required XY work plane is missing.');
  const activeWorkPlaneId = snapshot.appState.activeWorkPlaneId;
  if (activeWorkPlaneId !== undefined && !workPlaneIds.has(activeWorkPlaneId)) {
    addIssue(issues, 'appState.activeWorkPlaneId', `Active work plane "${activeWorkPlaneId}" does not exist.`);
  }
  checkVector2(snapshot.appState.view2d, 'appState.view2d', issues);
  checkPositiveFinite(snapshot.appState.view2d.zoom, 'appState.view2d.zoom', issues);
  checkTuple3(snapshot.appState.view3d.position, 'appState.view3d.position', issues);
  checkTuple3(snapshot.appState.view3d.target, 'appState.view3d.target', issues);
  checkTuple3(snapshot.appState.view3d.up, 'appState.view3d.up', issues);
  checkPositiveFinite(snapshot.appState.view3d.zoom, 'appState.view3d.zoom', issues);
  checkPositiveFinite(snapshot.appState.view3d.fov, 'appState.view3d.fov', issues);
  snapshot.appState.selected?.forEach((selection, index) => {
    checkSelection(selection, `appState.selected[${index}]`, scene2d.points, scene2d.entities, scene3d.points, scene3d.entities, issues);
  });

  snapshot.scene.links.forEach((link, index) => {
    const path = `scene.links[${index}]`;
    if (link.kind === 'netToSolid') {
      if (!netIds.has(link.sourceId)) addIssue(issues, `${path}.sourceId`, `Link references missing net "${link.sourceId}".`);
      const target = scene3d.entities[link.targetId];
      if (!target || target.kind !== 'solid') addIssue(issues, `${path}.targetId`, `Link references missing solid "${link.targetId}".`);
      return;
    }
    requireReference(link.sourceId, topLevelIds, `${path}.sourceId`, 'link source', issues);
    requireReference(link.targetId, topLevelIds, `${path}.targetId`, 'link target', issues);
  });

  checkDependencyGraph(snapshot, issues);

  return issues;
}

/** Throws a stable SDK error when a snapshot violates cross-record Geometry Lab invariants. */
export function assertGeometryLabInvariants(snapshot: GeometryLabSnapshot): void {
  const issues = getGeometryLabInvariantIssues(snapshot);
  if (!issues.length) return;
  throw new KleinSdkError(
    'geometry_lab_invariant_violation',
    `Geometry Lab snapshot violates ${issues.length} model invariant${issues.length === 1 ? '' : 's'}.`,
    issues as unknown as JsonValue,
  );
}

function registerRecord<T extends Identified>(
  path: string,
  record: Record<string, T>,
  seenIds: Map<string, string>,
  issues: ValidationIssue[],
): void {
  for (const [key, value] of Object.entries(record)) {
    const valuePath = `${path}.${key}`;
    if (value.id !== key) addIssue(issues, `${valuePath}.id`, `Record key "${key}" does not match object id "${value.id}".`);
    registerId(value, valuePath, seenIds, issues);
  }
}

function registerId(value: Identified, path: string, seenIds: Map<string, string>, issues: ValidationIssue[]): void {
  if (!value.id) {
    addIssue(issues, `${path}.id`, 'Object id must not be empty.');
    return;
  }
  const previousPath = seenIds.get(value.id);
  if (previousPath && previousPath !== path) {
    addIssue(issues, `${path}.id`, `Object id "${value.id}" is already used at ${previousPath}.`);
    return;
  }
  seenIds.set(value.id, path);
}

function checkEntity3D(
  entity: GeometryEntity3D,
  path: string,
  pointIds: Set<string>,
  entityIds: Set<string>,
  workPlaneIds: Set<string>,
  topLevelIds: Set<string>,
  issues: ValidationIssue[],
): void {
  if (entity.kind === 'surface3d') {
    checkSurface(entity, path, issues);
    return;
  }
  if (entity.kind === 'curve3d') {
    entity.points.forEach((point, index) => checkVector3(point, `${path}.points[${index}]`, issues));
    if (entity.parameter) {
      checkFinite(entity.parameter.tMin, `${path}.parameter.tMin`, issues);
      checkFinite(entity.parameter.tMax, `${path}.parameter.tMax`, issues);
      checkPositiveInteger(entity.parameter.samples, `${path}.parameter.samples`, issues);
    }
    return;
  }
  if (entity.kind === 'solid') {
    checkSolid(entity, path, pointIds, issues);
    return;
  }
  if (entity.kind === 'crossSection') {
    entity.pointIds.forEach((id, index) => requireReference(id, pointIds, `${path}.pointIds[${index}]`, '3D point', issues));
    requireReference(entity.solidId, entityIds, `${path}.solidId`, 'solid', issues);
    if (entity.planeId !== undefined && !workPlaneIds.has(entity.planeId) && !entityIds.has(entity.planeId)) {
      addIssue(issues, `${path}.planeId`, `Cross-section references missing plane "${entity.planeId}".`);
    }
    entity.vertices?.forEach((point, index) => checkVector3(point, `${path}.vertices[${index}]`, issues));
    checkOptionalFinite(entity.area, `${path}.area`, issues);
    checkOptionalFinite(entity.perimeter, `${path}.perimeter`, issues);
    return;
  }
  checkGeometryEntityReferences(entity, path, pointIds, topLevelIds, issues);
  checkConstruction(entity.construction, `${path}.construction`, topLevelIds, issues);
}

function checkSolid(solid: SolidEntity, path: string, pointIds: Set<string>, issues: ValidationIssue[]): void {
  solid.pointIds.forEach((id, index) => requireReference(id, pointIds, `${path}.pointIds[${index}]`, '3D point', issues));
  const declaredFaceIds = new Set<string>();
  solid.faceIds.forEach((id, index) => {
    if (declaredFaceIds.has(id)) addIssue(issues, `${path}.faceIds[${index}]`, `Duplicate solid face id "${id}".`);
    declaredFaceIds.add(id);
  });
  const actualFaceIds = new Set<string>();
  for (let index = 0; index < (solid.faces?.length ?? 0); index += 1) {
    const face = solid.faces?.[index];
    if (!face) continue;
    const facePath = `${path}.faces[${index}]`;
    if (actualFaceIds.has(face.id)) addIssue(issues, `${facePath}.id`, `Duplicate solid face id "${face.id}".`);
    actualFaceIds.add(face.id);
    if (!declaredFaceIds.has(face.id)) addIssue(issues, `${facePath}.id`, `Solid face "${face.id}" is missing from faceIds.`);
    face.pointIds.forEach((id, pointIndex) => requireReference(id, pointIds, `${facePath}.pointIds[${pointIndex}]`, '3D point', issues));
    checkOptionalFinite(face.area, `${facePath}.area`, issues);
    if (face.normal) checkTuple3(face.normal, `${facePath}.normal`, issues);
  }
  for (const faceId of declaredFaceIds) {
    if (solid.faces && !actualFaceIds.has(faceId)) addIssue(issues, `${path}.faceIds`, `faceIds contains missing face "${faceId}".`);
  }
  const edgeIds = new Set<string>();
  for (let index = 0; index < (solid.edges?.length ?? 0); index += 1) {
    const edge = solid.edges?.[index];
    if (!edge) continue;
    const edgePath = `${path}.edges[${index}]`;
    if (edgeIds.has(edge.id)) addIssue(issues, `${edgePath}.id`, `Duplicate solid edge id "${edge.id}".`);
    edgeIds.add(edge.id);
    edge.pointIds.forEach((id, pointIndex) => requireReference(id, pointIds, `${edgePath}.pointIds[${pointIndex}]`, '3D point', issues));
    checkOptionalFinite(edge.length, `${edgePath}.length`, issues);
  }
  checkOptionalFinite(solid.volume, `${path}.volume`, issues);
  checkOptionalFinite(solid.surfaceArea, `${path}.surfaceArea`, issues);
}

/**
 * Mesh arrays whose integrity has already been established.
 *
 * <p>Keyed on the arrays rather than on the surface, because canonicalization
 * rebuilds the surface object on every edit while reattaching these same arrays
 * by reference - so a surface-keyed cache would never hit. Only clean results
 * are remembered, so a malformed mesh is reported every time.
 *
 * <p>Faces additionally record the vertex count they were checked against,
 * since the bounds check below depends on it: the same face array against a
 * shorter vertex array is a different question and is re-checked.
 */
const checkedSurfaceVertices = new WeakSet<object>();
const checkedSurfaceFaces = new WeakMap<object, number>();

function checkSurface(surface: SurfaceEntity3D, path: string, issues: ValidationIssue[]): void {
  if (!checkedSurfaceVertices.has(surface.vertices)) {
    const before = issues.length;
    surface.vertices.forEach((vertex, index) => checkVector3(vertex, `${path}.vertices[${index}]`, issues));
    if (issues.length === before) checkedSurfaceVertices.add(surface.vertices);
  }

  if (checkedSurfaceFaces.get(surface.faces) !== surface.vertices.length) {
    const before = issues.length;
    checkSurfaceFaces(surface, path, issues);
    if (issues.length === before) checkedSurfaceFaces.set(surface.faces, surface.vertices.length);
  }
  for (const [axis, range] of Object.entries(surface.domain ?? {})) {
    if (!range) continue;
    checkFinite(range[0], `${path}.domain.${axis}[0]`, issues);
    checkFinite(range[1], `${path}.domain.${axis}[1]`, issues);
    if (range[1] <= range[0]) addIssue(issues, `${path}.domain.${axis}`, 'Surface domain ranges must be increasing.');
  }
  for (const [axis, samples] of Object.entries(surface.samples ?? {})) {
    if (samples !== undefined) checkPositiveInteger(samples, `${path}.samples.${axis}`, issues);
  }
}

/** The face half of {@link checkSurface}, split out so it can be cached on its own. */
function checkSurfaceFaces(surface: SurfaceEntity3D, path: string, issues: ValidationIssue[]): void {
  for (let faceIndex = 0; faceIndex < surface.faces.length; faceIndex += 1) {
    const face = surface.faces[faceIndex];
    if (!face) continue;
    const facePath = `${path}.faces[${faceIndex}]`;
    if (face.length < 3) addIssue(issues, facePath, 'A surface face must contain at least three vertex indices.');
    if (new Set(face).size < 3) addIssue(issues, facePath, 'A surface face must reference at least three distinct vertices.');
    face.forEach((index, indexPosition) => {
      if (!Number.isInteger(index) || index < 0 || index >= surface.vertices.length) {
        addIssue(issues, `${facePath}[${indexPosition}]`, `Surface vertex index ${index} is out of bounds.`);
      }
    });
  }
}

function checkGeometryEntityReferences(
  entity: GeometryEntity,
  path: string,
  pointIds: Set<string>,
  topLevelIds: Set<string>,
  issues: ValidationIssue[],
): void {
  if ('pointIds' in entity) {
    entity.pointIds.forEach((id, index) => requireReference(id, pointIds, `${path}.pointIds[${index}]`, 'point', issues));
  }
  if (entity.kind === 'circle') requireReference(entity.centerId, pointIds, `${path}.centerId`, 'point', issues);
  if (entity.kind === 'arc') {
    requireReference(entity.centerId, pointIds, `${path}.centerId`, 'point', issues);
    requireReference(entity.startId, pointIds, `${path}.startId`, 'point', issues);
    requireReference(entity.endId, pointIds, `${path}.endId`, 'point', issues);
  }
  if (entity.kind === 'relationMarker') {
    entity.targetIds.forEach((id, index) => requireReference(id, topLevelIds, `${path}.targetIds[${index}]`, 'target', issues));
  }
}

function checkWorkPlane(
  plane: WorkPlane3D,
  path: string,
  pointIds: Set<string>,
  entityIds: Set<string>,
  workPlaneIds: Set<string>,
  issues: ValidationIssue[],
): void {
  checkTuple3(plane.origin, `${path}.origin`, issues);
  checkTuple3(plane.normal, `${path}.normal`, issues);
  checkTuple3(plane.xAxis, `${path}.xAxis`, issues);
  if (plane.yAxis) checkTuple3(plane.yAxis, `${path}.yAxis`, issues);
  if (plane.equation) {
    checkFinite(plane.equation.a, `${path}.equation.a`, issues);
    checkFinite(plane.equation.b, `${path}.equation.b`, issues);
    checkFinite(plane.equation.c, `${path}.equation.c`, issues);
    checkFinite(plane.equation.d, `${path}.equation.d`, issues);
  }
  const source = plane.source;
  if (!source || source.kind === 'equation') return;
  if (source.kind === 'threePoints') {
    source.pointIds.forEach((id, index) => requireReference(id, pointIds, `${path}.source.pointIds[${index}]`, '3D point', issues));
    return;
  }
  if (source.throughPointId !== undefined) {
    requireReference(source.throughPointId, pointIds, `${path}.source.throughPointId`, '3D point', issues);
  }
  if (source.through !== undefined) checkTuple3(source.through, `${path}.source.through`, issues);
  if (source.kind === 'perpendicularLine') {
    requireReference(source.sourceEntityId, entityIds, `${path}.source.sourceEntityId`, '3D entity', issues);
    return;
  }
  if (!workPlaneIds.has(source.sourcePlaneId) && !entityIds.has(source.sourcePlaneId)) {
    addIssue(issues, `${path}.source.sourcePlaneId`, `Work plane references missing plane "${source.sourcePlaneId}".`);
  }
}

function checkMeasurement(
  measurement: Measurement3D,
  path: string,
  topLevelIds: Set<string>,
  pointIds: Set<string>,
  workPlaneIds: Set<string>,
  entities: Record<string, GeometryEntity3D>,
  issues: ValidationIssue[],
): void {
  requireReference(measurement.targetId, topLevelIds, `${path}.targetId`, 'measurement target', issues);
  checkFinite(measurement.value, `${path}.value`, issues);
  if (measurement.targetIds) {
    if (measurement.kind === 'dihedral') {
      const solid = entities[measurement.targetId];
      const faceIds = new Set(solid?.kind === 'solid' ? solid.faceIds : []);
      measurement.targetIds.forEach((id, index) => {
        if (index === 0) requireReference(id, topLevelIds, `${path}.targetIds[${index}]`, 'solid', issues);
        else if (!faceIds.has(id)) addIssue(issues, `${path}.targetIds[${index}]`, `Measurement references missing face "${id}".`);
      });
    } else {
      measurement.targetIds.forEach((id, index) => requireReference(id, topLevelIds, `${path}.targetIds[${index}]`, 'measurement target', issues));
    }
  }

  const source = measurement.source;
  if (!source) return;
  if (source.kind === 'pointPlaneDistance') {
    requireReference(source.pointId, pointIds, `${path}.source.pointId`, '3D point', issues);
    const plane = entities[source.planeId];
    if (!workPlaneIds.has(source.planeId) && plane?.kind !== 'plane') {
      addIssue(issues, `${path}.source.planeId`, `Measurement references missing plane "${source.planeId}".`);
    }
    if (measurement.kind !== 'length') {
      addIssue(issues, `${path}.source.kind`, 'A point-plane distance source requires a length measurement.');
    }
    return;
  }

  const isLineLike = (id: string, field: string): void => {
    const entity = entities[id];
    if (!entity || (entity.kind !== 'line' && entity.kind !== 'segment' && entity.kind !== 'ray' && entity.kind !== 'vector')) {
      addIssue(issues, `${path}.source.${field}`, `Measurement references missing line "${id}".`);
    }
  };
  const requiresKind = (expected: Measurement3D['kind'], description: string): void => {
    if (measurement.kind !== expected) {
      addIssue(issues, `${path}.source.kind`, `${description} requires a ${expected} measurement.`);
    }
  };

  if (source.kind === 'pointPointDistance') {
    requireReference(source.firstPointId, pointIds, `${path}.source.firstPointId`, '3D point', issues);
    requireReference(source.secondPointId, pointIds, `${path}.source.secondPointId`, '3D point', issues);
    requiresKind('length', 'A point-point distance source');
    return;
  }
  if (source.kind === 'pointLineDistance') {
    requireReference(source.pointId, pointIds, `${path}.source.pointId`, '3D point', issues);
    isLineLike(source.lineEntityId, 'lineEntityId');
    requiresKind('length', 'A point-line distance source');
    return;
  }
  if (source.kind === 'lineLineAngle') {
    isLineLike(source.firstLineId, 'firstLineId');
    isLineLike(source.secondLineId, 'secondLineId');
    requiresKind('angle', 'A line-line angle source');
    return;
  }
  if (source.kind === 'linePlaneAngle') {
    isLineLike(source.lineEntityId, 'lineEntityId');
    if (!workPlaneIds.has(source.planeId) && entities[source.planeId]?.kind !== 'plane') {
      addIssue(issues, `${path}.source.planeId`, `Measurement references missing plane "${source.planeId}".`);
    }
    requiresKind('angle', 'A line-plane angle source');
    return;
  }
  if (source.kind === 'lineLineDistance') {
    isLineLike(source.firstLineId, 'firstLineId');
    isLineLike(source.secondLineId, 'secondLineId');
    requiresKind('length', 'A line-line distance source');
    return;
  }

  const solid = entities[source.solidId];
  if (!solid || solid.kind !== 'solid') {
    addIssue(issues, `${path}.source.solidId`, `Measurement references missing solid "${source.solidId}".`);
    return;
  }
  if (source.kind === 'solidVolume' && measurement.kind !== 'volume') {
    addIssue(issues, `${path}.source.kind`, 'A solid-volume source requires a volume measurement.');
  }
  if (source.kind === 'solidSurfaceArea' && measurement.kind !== 'surfaceArea') {
    addIssue(issues, `${path}.source.kind`, 'A solid-surface-area source requires a surface-area measurement.');
  }
  if (source.kind === 'solidDihedral') {
    if (measurement.kind !== 'dihedral') {
      addIssue(issues, `${path}.source.kind`, 'A solid-dihedral source requires a dihedral measurement.');
    }
    const solid = entities[measurement.targetId];
    const faceIds = new Set(solid?.kind === 'solid' ? solid.faceIds : []);
    if (!faceIds.has(source.firstFaceId)) {
      addIssue(issues, `${path}.source.firstFaceId`, `Measurement references missing face "${source.firstFaceId}".`);
    }
    if (!faceIds.has(source.secondFaceId)) {
      addIssue(issues, `${path}.source.secondFaceId`, `Measurement references missing face "${source.secondFaceId}".`);
    }
  }
}

function checkConstraintReferences(
  constraint: GeometryConstraint,
  path: string,
  pointIds: Set<string>,
  entityIds: Set<string>,
  issues: ValidationIssue[],
): void {
  if ('pointIds' in constraint) {
    constraint.pointIds.forEach((id, index) => requireReference(id, pointIds, `${path}.pointIds[${index}]`, '2D point', issues));
  }
  if ('entityIds' in constraint) {
    constraint.entityIds.forEach((id, index) => requireReference(id, entityIds, `${path}.entityIds[${index}]`, '2D entity', issues));
  }
  if (constraint.kind === 'equalLength') {
    constraint.segments.flat().forEach((id, index) => requireReference(id, pointIds, `${path}.segments[${index}]`, '2D point', issues));
  }
  if (constraint.kind === 'equalRadius') {
    constraint.circleIds.forEach((id, index) => requireReference(id, entityIds, `${path}.circleIds[${index}]`, 'circle', issues));
  }
}

function checkConstruction(
  construction: GeometryConstruction | undefined,
  path: string,
  topLevelIds: Set<string>,
  issues: ValidationIssue[],
): void {
  if (!construction) return;
  for (const [field, value] of Object.entries(construction)) {
    if (field === 'kind' || field === 'label' || field === 'index') continue;
    const ids = typeof value === 'string' ? [value] : Array.isArray(value) ? value.flat(2) : [];
    ids.forEach((id, index) => {
      if (typeof id === 'string') requireReference(id, topLevelIds, `${path}.${field}[${index}]`, 'construction source', issues);
    });
  }
}

function checkSelection(
  selection: GeometrySelection,
  path: string,
  points2d: Record<string, GeometryPoint>,
  entities2d: Record<string, GeometryEntity>,
  points3d: Record<string, Identified>,
  entities3d: Record<string, GeometryEntity3D>,
  issues: ValidationIssue[],
): void {
  if (selection.kind === 'point2d' && !points2d[selection.id]) addIssue(issues, `${path}.id`, `Selection references missing 2D point "${selection.id}".`);
  if (selection.kind === 'point3d' && !points3d[selection.id]) addIssue(issues, `${path}.id`, `Selection references missing 3D point "${selection.id}".`);
  if (selection.kind === 'entity2d' && !entities2d[selection.id]) addIssue(issues, `${path}.id`, `Selection references missing 2D entity "${selection.id}".`);
  if (selection.kind === 'entity3d' && !entities3d[selection.id]) addIssue(issues, `${path}.id`, `Selection references missing 3D entity "${selection.id}".`);
  if (selection.kind === 'face' || selection.kind === 'edge') {
    const solid = entities3d[selection.solidId];
    if (!solid || solid.kind !== 'solid') {
      addIssue(issues, `${path}.solidId`, `Selection references missing solid "${selection.solidId}".`);
      return;
    }
    if (selection.kind === 'face' && !solid.faceIds.includes(selection.faceId)) addIssue(issues, `${path}.faceId`, `Selection references missing face "${selection.faceId}".`);
    if (selection.kind === 'edge' && !solid.edges?.some(edge => edge.id === selection.edgeId)) addIssue(issues, `${path}.edgeId`, `Selection references missing edge "${selection.edgeId}".`);
  }
}

function checkDependencyGraph(snapshot: GeometryLabSnapshot, issues: ValidationIssue[]): void {
  // The lean view rather than the full graph: this check reads node paths,
  // forward adjacency and ownership conflicts, and the full graph builds nine
  // further indexes nothing here touches - on every edit.
  const graph = buildGeometryLabIntegrityView(snapshot);
  for (const conflict of graph.ownershipConflicts) {
    const node = graph.nodesByKey[conflict.ownedKey];
    addIssue(
      issues,
      node?.path ?? conflict.ownedKey,
      `Object "${node?.ref.id ?? conflict.ownedKey}" has multiple owners: ${conflict.ownerKeys.join(', ')}.`,
    );
  }

  for (const cycle of dependencyCycles(graph)) {
    const node = graph.nodesByKey[cycle[0] as GeometryLabDependencyKey];
    addIssue(
      issues,
      node?.path ?? cycle[0] ?? 'scene',
      `Cyclic Geometry Lab dependency: ${cycle.join(' -> ')}.`,
    );
  }
}

function dependencyCycles(graph: GeometryLabIntegrityView): GeometryLabDependencyKey[][] {
  const states = new Map<GeometryLabDependencyKey, 'active' | 'done'>();
  const stack: GeometryLabDependencyKey[] = [];
  const cycles = new Map<string, GeometryLabDependencyKey[]>();

  const visit = (key: GeometryLabDependencyKey): void => {
    if (states.get(key) === 'done') return;
    if (states.get(key) === 'active') {
      const start = stack.indexOf(key);
      const cycle = [...stack.slice(Math.max(0, start)), key];
      const fingerprint = [...new Set(cycle)].sort().join('\u0000');
      if (!cycles.has(fingerprint)) cycles.set(fingerprint, cycle);
      return;
    }
    states.set(key, 'active');
    stack.push(key);
    for (const dependency of graph.dependenciesByKey[key] ?? []) visit(dependency);
    stack.pop();
    states.set(key, 'done');
  };

  // Already sorted by the view, so no second sort of every node key.
  for (const key of graph.sortedKeys) visit(key);
  return [...cycles.values()].sort((first, second) => first.join('\u0000').localeCompare(second.join('\u0000')));
}

function requireReference(id: string, ids: Set<string>, path: string, label: string, issues: ValidationIssue[]): void {
  if (!ids.has(id)) addIssue(issues, path, `Missing ${label} "${id}".`);
}

function checkVector2(vector: Vector2, path: string, issues: ValidationIssue[]): void {
  checkFinite(vector.x, `${path}.x`, issues);
  checkFinite(vector.y, `${path}.y`, issues);
}

function checkVector3(vector: Vector3, path: string, issues: ValidationIssue[]): void {
  checkFinite(vector.x, `${path}.x`, issues);
  checkFinite(vector.y, `${path}.y`, issues);
  checkFinite(vector.z, `${path}.z`, issues);
}

function checkTuple3(tuple: readonly number[], path: string, issues: ValidationIssue[]): void {
  if (tuple.length !== 3) addIssue(issues, path, 'Expected a three-component tuple.');
  tuple.forEach((value, index) => checkFinite(value, `${path}[${index}]`, issues));
}

function checkFinite(value: number, path: string, issues: ValidationIssue[]): void {
  if (!Number.isFinite(value)) addIssue(issues, path, 'Expected a finite number.');
}

function checkOptionalFinite(value: number | undefined, path: string, issues: ValidationIssue[]): void {
  if (value !== undefined) checkFinite(value, path, issues);
}

function checkPositiveFinite(value: number, path: string, issues: ValidationIssue[]): void {
  checkFinite(value, path, issues);
  if (!(value > 0)) addIssue(issues, path, 'Expected a positive number.');
}

function checkPositiveInteger(value: number, path: string, issues: ValidationIssue[]): void {
  if (!Number.isInteger(value) || value <= 0) addIssue(issues, path, 'Expected a positive integer.');
}

function unionSets(...sets: Array<Set<string>>): Set<string> {
  const result = new Set<string>();
  sets.forEach(set => set.forEach(value => result.add(value)));
  return result;
}

function addIssue(issues: ValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}
