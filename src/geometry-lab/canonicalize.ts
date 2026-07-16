import type { Vector2, Vector3 } from '../core/index.js';
import {
  geometryAngleBisectorPoint2D,
  geometryCircleTangentPoint2D,
  geometryCircumcircle2D,
  geometryIntersectionPoint2D,
  lineEquationFrom2DPoints,
  normalizeGeometryPlaneEquation3D,
  planeEquationFrom3DPoints,
  recomputeGeometryScene,
} from '../geometry-core/index.js';
import type {
  GeometryPlaneEquation3D,
  GeometryPoint3D,
  PlaneEntity,
} from '../geometry-core/index.js';
import type {
  CrossSectionEntity,
  GeometryLabSnapshot,
  GeometryScene3D,
  GeometrySelection,
  Measurement3D,
  MeasurementSource3D,
  SolidEdge3D,
  SolidEntity,
  SolidFace3D,
  SolidNet3D,
  SolidNetFace2D,
  SolidParameters3D,
  WorkPlane3D,
  WorkPlaneSource3D,
} from './types.js';
import {
  analyzeClosedSolidMesh3D,
  analyzePolygon3D,
  crossSectionSolidMesh3D,
  linearTolerance3D,
  polygonArea3D,
  polygonNormal3D,
  prismHeight3D,
  pyramidHeight3D,
} from './solids.js';

const EPSILON = 1e-9;

/** Stable failure categories emitted when persisted derived state cannot be rebuilt. */
export type GeometryLabCanonicalizationErrorCode =
  | 'unrecomputable_2d'
  | 'unrecomputable_point'
  | 'unrecomputable_entity'
  | 'work_plane_cycle'
  | 'unrecomputable_work_plane'
  | 'unrecomputable_solid'
  | 'unrecomputable_solid_face'
  | 'unrecomputable_cross_section'
  | 'cross_section_topology_changed'
  | 'unrecomputable_net'
  | 'unrecomputable_measurement';

/** Error raised instead of retaining stale or partially recomputed derived records. */
export class GeometryLabCanonicalizationError extends Error {
  readonly code: GeometryLabCanonicalizationErrorCode;
  readonly objectId: string;

  constructor(code: GeometryLabCanonicalizationErrorCode, objectId: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'GeometryLabCanonicalizationError';
    this.code = code;
    this.objectId = objectId;
  }
}

/** Internal ownership controls for canonicalizing an already-owned snapshot. */
export interface GeometryLabCanonicalizationOptions {
  /** Reuse immutable surface and sampled-curve arrays instead of cloning them. */
  reuseSurfaceMeshCaches?: boolean;
}

/**
 * Returns an owned, deterministic snapshot whose persisted derived geometry is
 * rebuilt from authored references. The input snapshot is never mutated.
 */
export function canonicalizeGeometryLabSnapshot(
  snapshot: GeometryLabSnapshot,
  options: GeometryLabCanonicalizationOptions = {},
): GeometryLabSnapshot {
  const next = cloneSnapshot(snapshot, options.reuseSurfaceMeshCaches === true);
  const legacySolidEdges = captureLegacySolidEdgeMappings(next.scene.scene3d);
  next.scene.scene2d = recomputeGeometryScene(next.scene.scene2d);
  assertRecomputableScene2D(next);

  const scene3d = next.scene.scene3d;
  canonicalizePointConstructions3D(scene3d);
  assertSupportedEntityConstructions3D(scene3d);
  canonicalizeWorkPlanes(scene3d);
  canonicalizeSolids(scene3d);
  canonicalizeCrossSections(scene3d);
  canonicalizeNets(scene3d);
  canonicalizeMeasurements(scene3d);
  canonicalizeAppState(next, legacySolidEdges);
  return next;
}

function assertRecomputableScene2D(snapshot: GeometryLabSnapshot): void {
  const scene = snapshot.scene.scene2d;
  for (const point of Object.values(scene.points)) {
    const construction = point.construction;
    if (!construction) continue;
    if (construction.kind === 'intersection') {
      const [firstId, secondId] = construction.sourceIds;
      if (!geometryIntersectionPoint2D(scene, firstId, secondId, construction.index ?? 0)) {
        fail('unrecomputable_2d', point.id, `Intersection point "${point.id}" has no finite intersection.`);
      }
    } else if (construction.kind === 'circumcenter') {
      if (!geometryCircumcircle2D(scene, construction.pointIds)) {
        fail('unrecomputable_2d', point.id, `Circumcenter "${point.id}" has collinear source points.`);
      }
    } else if (construction.kind === 'midpoint') {
      const [firstId, secondId] = construction.sourceIds;
      if (scene.points[firstId]?.kind !== 'point2d' || scene.points[secondId]?.kind !== 'point2d') {
        fail('unrecomputable_2d', point.id, `Midpoint "${point.id}" has a missing 2D source point.`);
      }
    } else {
      fail(
        'unrecomputable_2d',
        point.id,
        `2D point construction "${construction.kind}" is not deterministically supported.`,
      );
    }
  }

  for (const entity of Object.values(scene.entities)) {
    const construction = entity.construction;
    if (entity.kind === 'line' && !construction) {
      const [firstId, secondId] = entity.pointIds;
      const first = scene.points[firstId];
      const second = scene.points[secondId];
      if (!first || !second || !lineEquationFrom2DPoints(first, second)) {
        fail('unrecomputable_2d', entity.id, `Line "${entity.id}" has coincident or missing source points.`);
      }
    }
    if (!construction) continue;
    if (construction.kind === 'angleBisector') {
      if (entity.kind !== 'line' || !geometryAngleBisectorPoint2D(scene, construction.pointIds)) {
        fail('unrecomputable_2d', entity.id, `Angle bisector "${entity.id}" is undefined.`);
      }
    } else if (construction.kind === 'tangentLine') {
      if (entity.kind !== 'line' || !geometryCircleTangentPoint2D(
        scene,
        construction.circleId,
        construction.throughPointId,
        construction.branch,
      )) {
        fail('unrecomputable_2d', entity.id, `Tangent line "${entity.id}" is undefined.`);
      }
    } else if (construction.kind === 'parallelLine' || construction.kind === 'perpendicularLine') {
      const source = scene.entities[construction.sourceLineId];
      const through = scene.points[construction.throughPointId];
      if (entity.kind !== 'line' || !source || !through || !lineLikeEquation2D(scene, source.id)) {
        fail('unrecomputable_2d', entity.id, `Constructed line "${entity.id}" has an invalid source line or point.`);
      }
    } else if (entity.kind === 'circle' && construction.kind === 'circleCenterPoint') {
      const center = scene.points[construction.centerPointId];
      const radiusPoint = scene.points[construction.radiusPointId];
      if (!center || !radiusPoint || Math.hypot(radiusPoint.x - center.x, radiusPoint.y - center.y) <= EPSILON) {
        fail('unrecomputable_2d', entity.id, `Circle "${entity.id}" has a zero or undefined radius.`);
      }
    } else if (entity.kind === 'circle' && construction.kind === 'circleThroughPoints') {
      if (!geometryCircumcircle2D(scene, construction.pointIds)) {
        fail('unrecomputable_2d', entity.id, `Circle "${entity.id}" has collinear source points.`);
      }
    } else if (entity.kind === 'line' && construction.kind === 'lineThroughPoints') {
      const [firstId, secondId] = construction.sourceIds;
      const first = scene.points[firstId];
      const second = scene.points[secondId];
      if (
        !first
        || !second
        || !lineEquationFrom2DPoints(first, second)
        || entity.pointIds[0] !== firstId
        || entity.pointIds[1] !== secondId
      ) {
        fail('unrecomputable_2d', entity.id, `Line "${entity.id}" has inconsistent authored source points.`);
      }
    } else {
      fail(
        'unrecomputable_2d',
        entity.id,
        `2D entity construction "${construction.kind}" is not deterministically supported.`,
      );
    }
  }
}

function lineLikeEquation2D(
  scene: GeometryLabSnapshot['scene']['scene2d'],
  entityId: string,
): ReturnType<typeof lineEquationFrom2DPoints> {
  const entity = scene.entities[entityId];
  if (!entity || (entity.kind !== 'line' && entity.kind !== 'segment' && entity.kind !== 'ray' && entity.kind !== 'vector')) {
    return null;
  }
  const first = scene.points[entity.pointIds[0]];
  const second = scene.points[entity.pointIds[1]];
  return first && second ? lineEquationFrom2DPoints(first, second) : null;
}

function canonicalizePointConstructions3D(scene: GeometryScene3D): void {
  const complete = new Set<string>();
  const active = new Set<string>();

  const visit = (id: string): void => {
    if (complete.has(id)) return;
    const point = scene.points[id];
    if (!point) fail('unrecomputable_point', id, `Constructed point "${id}" does not exist.`);
    if (active.has(id)) fail('unrecomputable_point', id, `Constructed point "${id}" is part of a source cycle.`);
    active.add(id);
    const construction = point.construction;
    if (construction?.kind === 'midpoint') {
      const [firstId, secondId] = construction.sourceIds;
      if (scene.points[firstId]) visit(firstId);
      if (scene.points[secondId]) visit(secondId);
      const first = scene.points[firstId];
      const second = scene.points[secondId];
      if (!first || !second) {
        fail('unrecomputable_point', id, `Midpoint "${id}" has a missing source point.`);
      }
      scene.points[id] = {
        ...point,
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
        z: (first.z + second.z) / 2,
      };
    } else if (construction) {
      fail(
        'unrecomputable_point',
        id,
        `3D point construction "${construction.kind}" is not deterministically supported.`,
      );
    }
    active.delete(id);
    complete.add(id);
  };

  for (const id of Object.keys(scene.points).sort()) visit(id);
}

function assertSupportedEntityConstructions3D(scene: GeometryScene3D): void {
  for (const entity of Object.values(scene.entities)) {
    if (!('construction' in entity) || !entity.construction) continue;
    const construction = entity.construction;
    if (
      entity.kind === 'line'
      && construction.kind === 'lineThroughPoints'
      && entity.pointIds[0] === construction.sourceIds[0]
      && entity.pointIds[1] === construction.sourceIds[1]
    ) {
      continue;
    }
    fail(
      'unrecomputable_entity',
      entity.id,
      `3D entity construction "${construction.kind}" is not deterministically supported.`,
    );
  }
}

interface PlaneData3D {
  origin: Vector3;
  normal: Vector3;
  xAxis: Vector3;
  yAxis: Vector3;
  d: number;
  equation: GeometryPlaneEquation3D;
}

function canonicalizeWorkPlanes(scene: GeometryScene3D): void {
  const complete = new Set<string>();
  const active = new Set<string>();

  const visit = (id: string): void => {
    if (complete.has(id)) return;
    const plane = scene.workPlanes[id];
    if (!plane) fail('unrecomputable_work_plane', id, `Work plane "${id}" does not exist.`);
    if (active.has(id)) fail('work_plane_cycle', id, `Work plane "${id}" is part of a source cycle.`);

    active.add(id);
    const source = plane.source;
    if (source && (source.kind === 'parallelPlane' || source.kind === 'perpendicularPlane')) {
      if (scene.workPlanes[source.sourcePlaneId]) visit(source.sourcePlaneId);
    }
    scene.workPlanes[id] = canonicalWorkPlane(scene, plane);
    active.delete(id);
    complete.add(id);
  };

  for (const id of Object.keys(scene.workPlanes)) visit(id);
}

function canonicalWorkPlane(scene: GeometryScene3D, plane: WorkPlane3D): WorkPlane3D {
  const source = plane.source;
  if (!source) {
    const equation = normalizedPlaneEquation(
      plane.equation ?? equationFromPointNormal(tupleToVector3(plane.origin), tupleToVector3(plane.normal)),
      plane.id,
    );
    const origin = projectPointToPlane(tupleToVector3(plane.origin), equation);
    return buildWorkPlane(plane, equation, origin, tupleToVector3(plane.xAxis));
  }

  if (source.kind === 'equation') {
    const equation = normalizedPlaneEquation(
      plane.equation ?? equationFromPointNormal(tupleToVector3(plane.origin), tupleToVector3(plane.normal)),
      plane.id,
    );
    const normal = equationNormal(equation);
    return buildWorkPlane(plane, equation, scale3(normal, -equation.d));
  }

  if (source.kind === 'threePoints') {
    const [firstId, secondId, thirdId] = source.pointIds;
    const first = requirePoint(scene, firstId, plane.id, 'work plane');
    const second = requirePoint(scene, secondId, plane.id, 'work plane');
    const third = requirePoint(scene, thirdId, plane.id, 'work plane');
    const equation = planeEquationFrom3DPoints(first, second, third);
    if (!equation) {
      fail('unrecomputable_work_plane', plane.id, `Work plane "${plane.id}" has collinear source points.`);
    }
    return buildWorkPlane(plane, equation, first, subtract3(second, first));
  }

  if (source.kind === 'perpendicularLine') {
    const line = lineDataForEntity(scene, source.sourceEntityId, plane.id);
    const origin = throughPoint(scene, source, tupleToVector3(plane.origin), plane.id);
    return buildWorkPlane(plane, equationFromPointNormal(origin, line.direction), origin);
  }

  const sourcePlane = planeDataForReference(scene, source.sourcePlaneId, plane.id);
  const origin = throughPoint(scene, source, tupleToVector3(plane.origin), plane.id);
  if (source.kind === 'parallelPlane') {
    return buildWorkPlane(
      plane,
      equationFromPointNormal(origin, sourcePlane.normal),
      origin,
      sourcePlane.xAxis,
    );
  }
  return buildWorkPlane(
    plane,
    equationFromPointNormal(origin, sourcePlane.xAxis),
    origin,
  );
}

function buildWorkPlane(
  existing: WorkPlane3D,
  equationInput: GeometryPlaneEquation3D,
  origin: Vector3,
  preferredXAxis?: Vector3,
): WorkPlane3D {
  const equation = normalizedPlaneEquation(equationInput, existing.id);
  const normal = equationNormal(equation);
  const basis = basisForNormal(normal, preferredXAxis);
  return {
    ...existing,
    origin: vector3ToTuple(origin),
    normal: vector3ToTuple(normal),
    xAxis: vector3ToTuple(basis.xAxis),
    yAxis: vector3ToTuple(basis.yAxis),
    equation,
  };
}

function normalizedPlaneEquation(equation: GeometryPlaneEquation3D, ownerId: string): GeometryPlaneEquation3D {
  const normalized = normalizeGeometryPlaneEquation3D(equation);
  if (!normalized) {
    fail('unrecomputable_work_plane', ownerId, `Work plane "${ownerId}" has a degenerate equation.`);
  }
  return normalized;
}

function planeDataForReference(scene: GeometryScene3D, id: string, ownerId: string): PlaneData3D {
  const workPlane = scene.workPlanes[id];
  if (workPlane) return planeDataFromWorkPlane(workPlane, ownerId);

  const entity = scene.entities[id];
  if (!entity || entity.kind !== 'plane') {
    fail('unrecomputable_work_plane', ownerId, `Work plane "${ownerId}" references missing plane "${id}".`);
  }
  return planeDataFromEntity(scene, entity, ownerId);
}

function planeDataFromWorkPlane(plane: WorkPlane3D, ownerId: string): PlaneData3D {
  const equation = normalizedPlaneEquation(
    plane.equation ?? equationFromPointNormal(tupleToVector3(plane.origin), tupleToVector3(plane.normal)),
    ownerId,
  );
  const normal = equationNormal(equation);
  const basis = basisForNormal(normal, tupleToVector3(plane.xAxis));
  return {
    origin: tupleToVector3(plane.origin),
    normal,
    xAxis: basis.xAxis,
    yAxis: basis.yAxis,
    d: equation.d,
    equation,
  };
}

function planeDataFromEntity(scene: GeometryScene3D, entity: PlaneEntity, ownerId: string): PlaneData3D {
  const first = requirePoint(scene, entity.pointIds[0], ownerId, 'plane entity');
  const second = requirePoint(scene, entity.pointIds[1], ownerId, 'plane entity');
  const third = requirePoint(scene, entity.pointIds[2], ownerId, 'plane entity');
  const equation = planeEquationFrom3DPoints(first, second, third);
  if (!equation) {
    fail('unrecomputable_work_plane', ownerId, `Plane entity "${entity.id}" has collinear source points.`);
  }
  const normal = equationNormal(equation);
  const basis = basisForNormal(normal, subtract3(second, first));
  return {
    origin: first,
    normal,
    xAxis: basis.xAxis,
    yAxis: basis.yAxis,
    d: equation.d,
    equation,
  };
}

function throughPoint(
  scene: GeometryScene3D,
  source: Extract<WorkPlaneSource3D, { kind: 'parallelPlane' | 'perpendicularPlane' | 'perpendicularLine' }>,
  fallback: Vector3,
  ownerId: string,
): Vector3 {
  if (source.throughPointId !== undefined) {
    return requirePoint(scene, source.throughPointId, ownerId, 'through point');
  }
  if (source.through !== undefined) return tupleToVector3(source.through);
  source.through = vector3ToTuple(fallback);
  return fallback;
}

function lineDataForEntity(
  scene: GeometryScene3D,
  entityId: string,
  ownerId: string,
): { point: GeometryPoint3D; direction: Vector3 } {
  const entity = scene.entities[entityId];
  if (!entity || (entity.kind !== 'line' && entity.kind !== 'segment' && entity.kind !== 'ray' && entity.kind !== 'vector')) {
    fail('unrecomputable_work_plane', ownerId, `Work plane "${ownerId}" references invalid line "${entityId}".`);
  }
  const first = requirePoint(scene, entity.pointIds[0], ownerId, 'line');
  const second = requirePoint(scene, entity.pointIds[1], ownerId, 'line');
  const direction = subtract3(second, first);
  if (!normalize3(direction) || length3(direction) <= linearTolerance3D([first, second])) {
    fail('unrecomputable_work_plane', ownerId, `Line "${entityId}" has coincident source points.`);
  }
  return { point: first, direction };
}

function canonicalizeSolids(scene: GeometryScene3D): void {
  for (const [id, entity] of Object.entries(scene.entities)) {
    if (entity.kind !== 'solid') continue;
    scene.entities[id] = canonicalSolid(scene, entity);
  }
}

function canonicalSolid(scene: GeometryScene3D, solid: SolidEntity): SolidEntity {
  if (!solid.faces?.length) {
    fail('unrecomputable_solid', solid.id, `Solid "${solid.id}" has no authored faces.`);
  }
  const pointIds = [...new Set(solid.pointIds)];
  for (const pointId of pointIds) requirePoint(scene, pointId, solid.id, 'solid');

  const faceIds = new Set<string>();
  const faces = solid.faces.map(face => {
    if (faceIds.has(face.id)) {
      fail('unrecomputable_solid_face', solid.id, `Solid "${solid.id}" has duplicate face id "${face.id}".`);
    }
    faceIds.add(face.id);
    return canonicalSolidFace(scene, solid, face, new Set(pointIds));
  });
  const mesh = analyzeClosedSolidMesh3D(solid.id, scene.points, faces);
  const collapsedPrism = isExplicitlySupportedCollapsedPrism(scene, solid, pointIds);
  const blockingIssues = mesh.issues.filter(issue => !(
    collapsedPrism && (
      issue.code === 'degenerate_face'
      || issue.code === 'non_planar_face'
      || issue.code === 'degenerate_volume'
    )
  ));
  const firstIssue = blockingIssues[0];
  if (firstIssue) {
    const code = firstIssue.faceId ? 'unrecomputable_solid_face' : 'unrecomputable_solid';
    fail(code, solid.id, firstIssue.message);
  }
  const orientedFaces = faces.map((face, index): SolidFace3D => {
    if (mesh.faceOrientation[index] !== -1) return face;
    const pointIds = [...face.pointIds].reverse();
    const points = pointIds.map(pointId => requirePoint(scene, pointId, solid.id, `face ${face.id}`));
    const normal = polygonNormal3D(points);
    return normal
      ? { ...face, pointIds, normal: vector3ToTuple(normal) }
      : { ...face, pointIds };
  });
  const edges: SolidEdge3D[] = mesh.edges.map(edge => ({
    id: edge.id,
    pointIds: [...edge.pointIds],
    length: edge.length,
  }));
  const surfaceArea = mesh.surfaceArea;
  const volume = mesh.volume;

  const canonical: SolidEntity = {
    ...solid,
    pointIds,
    faceIds: orientedFaces.map(face => face.id),
    faces: orientedFaces,
    edges,
    volume,
    surfaceArea,
  };
  if (solid.parameters) {
    canonical.parameters = canonicalSolidParameters(scene, solid, pointIds);
  }
  return canonical;
}

/**
 * Keep authored dimensions, but never preserve a cached construction height
 * after its source points move. Prism/pyramid heights are recomputed only when
 * their documented point ordering still describes that construction; otherwise
 * the derived height is omitted instead of becoming misleading stale state.
 */
function canonicalSolidParameters(
  scene: GeometryScene3D,
  solid: SolidEntity,
  pointIds: string[],
): SolidParameters3D {
  const {
    baseArea: _baseArea,
    volume: _volume,
    surfaceArea: _surfaceArea,
    ...authoredParameters
  } = solid.parameters ?? {};

  if ((solid.solid === 'prism' || solid.solid === 'pyramid') && solid.parameters?.height !== undefined) {
    const height = solid.solid === 'prism'
      ? recognizablePrismHeight(scene, solid, pointIds)
      : recognizablePyramidHeight(scene, solid, pointIds);
    if (height === null) delete authoredParameters.height;
    else authoredParameters.height = height;
  }
  return authoredParameters;
}

function recognizablePrismHeight(
  scene: GeometryScene3D,
  solid: SolidEntity,
  pointIds: string[],
): number | null {
  if (pointIds.length < 6 || pointIds.length % 2 !== 0) return null;
  const sideCount = pointIds.length / 2;
  const base = pointIds.slice(0, sideCount).map(pointId => requirePoint(scene, pointId, solid.id, 'solid'));
  const top = pointIds.slice(sideCount).map(pointId => requirePoint(scene, pointId, solid.id, 'solid'));
  if (!analyzePolygon3D(base).valid) return null;
  const extrusion = subtract3(top[0] as GeometryPoint3D, base[0] as GeometryPoint3D);
  const tolerance = linearTolerance3D([...base, ...top]);
  for (let index = 1; index < sideCount; index += 1) {
    const candidate = subtract3(top[index] as GeometryPoint3D, base[index] as GeometryPoint3D);
    if (distance3(candidate, extrusion) > tolerance) return null;
  }
  return prismHeight3D(base, extrusion);
}

function recognizablePyramidHeight(
  scene: GeometryScene3D,
  solid: SolidEntity,
  pointIds: string[],
): number | null {
  if (pointIds.length < 4) return null;
  const base = pointIds.slice(0, -1).map(pointId => requirePoint(scene, pointId, solid.id, 'solid'));
  const apexId = pointIds[pointIds.length - 1];
  if (!apexId || !analyzePolygon3D(base).valid) return null;
  const apex = requirePoint(scene, apexId, solid.id, 'solid');
  return pyramidHeight3D(base, apex);
}

/**
 * Geometry Lab deliberately keeps a non-zero prism extrusion that lies in the
 * base plane as a collapsed construction with volume zero. All other
 * degenerate closed meshes are rejected. This preserves the educational
 * limiting-case behavior while making the exception explicit and narrow.
 */
function isExplicitlySupportedCollapsedPrism(
  scene: GeometryScene3D,
  solid: SolidEntity,
  pointIds: string[],
): boolean {
  if (solid.solid !== 'prism' || pointIds.length < 6 || pointIds.length % 2 !== 0) return false;
  const sideCount = pointIds.length / 2;
  const base = pointIds.slice(0, sideCount).map(pointId => requirePoint(scene, pointId, solid.id, 'solid'));
  const top = pointIds.slice(sideCount).map(pointId => requirePoint(scene, pointId, solid.id, 'solid'));
  const baseAnalysis = analyzePolygon3D(base);
  if (!baseAnalysis.valid) return false;
  const extrusion = subtract3(top[0] as GeometryPoint3D, base[0] as GeometryPoint3D);
  const tolerance = linearTolerance3D([...base, ...top]);
  if (length3(extrusion) <= tolerance) return false;
  for (let index = 1; index < sideCount; index += 1) {
    const candidate = subtract3(top[index] as GeometryPoint3D, base[index] as GeometryPoint3D);
    if (distance3(candidate, extrusion) > tolerance) return false;
  }
  const perpendicularHeight = prismHeight3D(base, extrusion);
  return perpendicularHeight !== null && perpendicularHeight <= tolerance;
}

function canonicalSolidFace(
  scene: GeometryScene3D,
  solid: SolidEntity,
  face: SolidFace3D,
  ownedPointIds: Set<string>,
): SolidFace3D {
  if (face.pointIds.length < 3 || new Set(face.pointIds).size < 3) {
    fail('unrecomputable_solid_face', solid.id, `Face "${face.id}" has fewer than three distinct points.`);
  }
  const points = face.pointIds.map(pointId => {
    if (!ownedPointIds.has(pointId)) {
      fail('unrecomputable_solid_face', solid.id, `Face "${face.id}" references non-owned point "${pointId}".`);
    }
    return requirePoint(scene, pointId, solid.id, `face ${face.id}`);
  });
  const normal = polygonNormal3D(points);
  const area = polygonArea3D(points);
  if (!Number.isFinite(area)) {
    fail('unrecomputable_solid_face', solid.id, `Face "${face.id}" has a non-finite area.`);
  }
  const { normal: _normal, area: _area, ...authoredFace } = face;
  return normal
    ? { ...authoredFace, normal: vector3ToTuple(normal), area }
    : { ...authoredFace, area };
}

function canonicalizeCrossSections(scene: GeometryScene3D): void {
  for (const [id, entity] of Object.entries(scene.entities)) {
    if (entity.kind !== 'crossSection') continue;
    scene.entities[id] = canonicalCrossSection(scene, entity);
  }
}

function canonicalCrossSection(scene: GeometryScene3D, section: CrossSectionEntity): CrossSectionEntity {
  const solid = scene.entities[section.solidId];
  if (!solid || solid.kind !== 'solid') {
    fail('unrecomputable_cross_section', section.id, `Cross-section "${section.id}" references missing solid "${section.solidId}".`);
  }
  if (!section.planeId) {
    fail('unrecomputable_cross_section', section.id, `Cross-section "${section.id}" has no source plane.`);
  }
  const plane = planeDataForCrossSection(scene, section.planeId, section.id);
  const vertices = crossSectionVertices(scene, solid, plane, section.id);
  if (vertices.length < 3) {
    fail('unrecomputable_cross_section', section.id, `Cross-section "${section.id}" is empty or degenerate.`);
  }
  if (new Set(section.pointIds).size !== section.pointIds.length || section.pointIds.length !== vertices.length) {
    fail(
      'cross_section_topology_changed',
      section.id,
      `Cross-section "${section.id}" changed from ${section.pointIds.length} to ${vertices.length} vertices.`,
    );
  }
  const priorPoints = section.pointIds.map(pointId => requirePoint(scene, pointId, section.id, 'cross-section'));
  const identityAlignedVertices = alignCrossSectionVertices(priorPoints, vertices, section.id);
  section.pointIds.forEach((pointId, index) => {
    const point = requirePoint(scene, pointId, section.id, 'cross-section');
    const vertex = identityAlignedVertices[index] as Vector3;
    scene.points[pointId] = { ...point, x: vertex.x, y: vertex.y, z: vertex.z };
  });
  return {
    ...section,
    vertices: identityAlignedVertices,
    area: polygonArea3D(identityAlignedVertices),
    perimeter: polygonPerimeter3D(identityAlignedVertices),
  };
}

/**
 * A loop has no privileged first vertex and may be emitted in either direction.
 * Align the recomputed loop with its existing point identities using only cyclic
 * rotations/reversals. Exact coordinate matches are used as hard anchors; when
 * the source geometry itself moved, the unique closest loop alignment carries
 * identities forward. Symmetric/ambiguous alignments fail rather than swapping
 * point ids silently.
 */
function alignCrossSectionVertices(
  priorPoints: readonly GeometryPoint3D[],
  vertices: readonly Vector3[],
  sectionId: string,
): Vector3[] {
  const count = priorPoints.length;
  const tolerance = linearTolerance3D([...priorPoints, ...vertices]);
  assertDistinctCrossSectionCoordinates(priorPoints, tolerance, sectionId, 'persisted points');
  assertDistinctCrossSectionCoordinates(vertices, tolerance, sectionId, 'recomputed vertices');

  const exactCandidates = priorPoints.map(point => vertices
    .map((vertex, index) => distance3(point, vertex) <= tolerance ? index : -1)
    .filter(index => index >= 0));
  if (exactCandidates.some(candidates => candidates.length > 1)) {
    fail(
      'cross_section_topology_changed',
      sectionId,
      `Cross-section "${sectionId}" has an ambiguous coordinate-to-point identity mapping.`,
    );
  }

  const alignments = crossSectionLoopAlignments(count).filter(indexes => exactCandidates.every(
    (candidates, pointIndex) => candidates.length === 0 || candidates[0] === indexes[pointIndex],
  ));
  if (alignments.length === 0) {
    fail(
      'cross_section_topology_changed',
      sectionId,
      `Cross-section "${sectionId}" connectivity is not a cyclic rotation or reversal of its persisted point identities.`,
    );
  }

  const scored = alignments.map(indexes => ({
    indexes,
    rmsDistance: rootMeanSquareDistance(priorPoints, vertices, indexes),
  })).sort((first, second) => first.rmsDistance - second.rmsDistance);
  const best = scored[0];
  const nextBest = scored[1];
  if (!best || (nextBest && nextBest.rmsDistance - best.rmsDistance <= tolerance)) {
    fail(
      'cross_section_topology_changed',
      sectionId,
      `Cross-section "${sectionId}" does not have a unique point-identity-preserving loop alignment.`,
    );
  }
  return best.indexes.map(index => ({ ...(vertices[index] as Vector3) }));
}

function rootMeanSquareDistance(
  first: readonly Vector3[],
  second: readonly Vector3[],
  secondIndexes: readonly number[],
): number {
  let squaredDistance = 0;
  for (let index = 0; index < secondIndexes.length; index += 1) {
    const distance = distance3(first[index] as Vector3, second[secondIndexes[index] as number] as Vector3);
    squaredDistance += distance * distance;
  }
  return Math.sqrt(squaredDistance / secondIndexes.length);
}

function assertDistinctCrossSectionCoordinates(
  points: readonly Vector3[],
  tolerance: number,
  sectionId: string,
  label: string,
): void {
  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      if (distance3(points[first] as Vector3, points[second] as Vector3) <= tolerance) {
        fail(
          'cross_section_topology_changed',
          sectionId,
          `Cross-section "${sectionId}" has ambiguous duplicate ${label}.`,
        );
      }
    }
  }
}

function crossSectionLoopAlignments(count: number): number[][] {
  const alignments: number[][] = [];
  const seen = new Set<string>();
  for (const direction of [1, -1] as const) {
    for (let offset = 0; offset < count; offset += 1) {
      const indexes = Array.from({ length: count }, (_, index) => modulo(offset + direction * index, count));
      const key = indexes.join(',');
      if (!seen.has(key)) {
        seen.add(key);
        alignments.push(indexes);
      }
    }
  }
  return alignments;
}

function modulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function planeDataForCrossSection(scene: GeometryScene3D, planeId: string, sectionId: string): PlaneData3D {
  const workPlane = scene.workPlanes[planeId];
  if (workPlane) return planeDataFromWorkPlane(workPlane, sectionId);
  const entity = scene.entities[planeId];
  if (!entity || entity.kind !== 'plane') {
    fail('unrecomputable_cross_section', sectionId, `Cross-section "${sectionId}" references invalid plane "${planeId}".`);
  }
  const first = scene.points[entity.pointIds[0]];
  const second = scene.points[entity.pointIds[1]];
  const third = scene.points[entity.pointIds[2]];
  if (!first || !second || !third) {
    fail('unrecomputable_cross_section', sectionId, `Plane entity "${planeId}" has missing source points.`);
  }
  const equation = planeEquationFrom3DPoints(first, second, third);
  if (!equation) {
    fail('unrecomputable_cross_section', sectionId, `Plane entity "${planeId}" is degenerate.`);
  }
  const normal = equationNormal(equation);
  const basis = basisForNormal(normal, subtract3(second, first));
  return { origin: first, normal, xAxis: basis.xAxis, yAxis: basis.yAxis, d: equation.d, equation };
}

function crossSectionVertices(
  scene: GeometryScene3D,
  solid: SolidEntity,
  plane: PlaneData3D,
  sectionId: string,
): Vector3[] {
  const section = crossSectionSolidMesh3D(scene.points, solid.faces ?? [], plane);
  if (section.status === 'empty') return [];
  if (section.status !== 'single_loop') {
    fail(
      'unrecomputable_cross_section',
      sectionId,
      section.status === 'multiple_loops'
        ? `Cross-section "${sectionId}" produces multiple disconnected loops.`
        : section.issues[0]?.message ?? `Cross-section "${sectionId}" has unsupported topology.`,
    );
  }
  return section.loops[0]?.points.map(point => ({ ...point })) ?? [];
}

function canonicalizeNets(scene: GeometryScene3D): void {
  for (const [id, net] of Object.entries(scene.nets)) {
    const solid = scene.entities[net.solidId];
    if (!solid || solid.kind !== 'solid') {
      fail('unrecomputable_net', id, `Net "${id}" references missing solid "${net.solidId}".`);
    }
    scene.nets[id] = canonicalNet(scene, net, solid);
  }
}

function canonicalNet(scene: GeometryScene3D, net: SolidNet3D, solid: SolidEntity): SolidNet3D {
  const faces: SolidNetFace2D[] = [];
  let cursorX = 0;
  for (const face of solid.faces ?? []) {
    const points = face.pointIds.map(pointId => requirePoint(scene, pointId, net.id, `net face ${face.id}`));
    if (points.length < 3) {
      fail('unrecomputable_net', net.id, `Net "${net.id}" has a degenerate source face "${face.id}".`);
    }
    const projected = projectFaceTo2D(points);
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    for (const point of projected) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
    }
    const vertices = projected.map(point => ({ x: point.x - minX + cursorX, y: point.y - minY }));
    cursorX += maxX - minX + 0.5;
    faces.push({
      id: `${net.id}-${face.id}`,
      sourceFaceId: face.id,
      vertices,
      area: face.area ?? polygonArea3D(points),
    });
  }
  if (!faces.length) fail('unrecomputable_net', net.id, `Net "${net.id}" has no source faces.`);
  return {
    ...net,
    faces,
    totalArea: faces.reduce((sum, face) => sum + (face.area ?? polygonArea2D(face.vertices)), 0),
  };
}

function canonicalizeMeasurements(scene: GeometryScene3D): void {
  for (const [id, measurement] of Object.entries(scene.measurements)) {
    const source = measurement.source ?? inferLegacyMeasurementSource(scene, measurement);
    if (!source) continue;
    scene.measurements[id] = canonicalMeasurement(scene, { ...measurement, source });
  }
}

function inferLegacyMeasurementSource(
  scene: GeometryScene3D,
  measurement: Measurement3D,
): MeasurementSource3D | null {
  const target = scene.entities[measurement.targetId];
  if (measurement.kind === 'volume' && target?.kind === 'solid') {
    return { kind: 'solidVolume', solidId: target.id };
  }
  if (measurement.kind === 'surfaceArea' && target?.kind === 'solid') {
    return { kind: 'solidSurfaceArea', solidId: target.id };
  }
  if (measurement.kind === 'dihedral' && target?.kind === 'solid') {
    const [, firstFaceId, secondFaceId] = measurement.targetIds ?? [];
    if (firstFaceId && secondFaceId) {
      return { kind: 'solidDihedral', solidId: target.id, firstFaceId, secondFaceId };
    }
  }
  if (measurement.kind === 'length') {
    const [pointId, planeId] = measurement.targetIds ?? [];
    const planeEntity = planeId === undefined ? undefined : scene.entities[planeId];
    if (
      pointId !== undefined
      && planeId !== undefined
      && scene.points[pointId]
      && (scene.workPlanes[planeId] || planeEntity?.kind === 'plane')
    ) {
      return { kind: 'pointPlaneDistance', pointId, planeId };
    }
  }
  return null;
}

function canonicalMeasurement(scene: GeometryScene3D, measurement: Measurement3D): Measurement3D {
  const source = measurement.source;
  if (!source) return measurement;
  if (source.kind === 'pointPlaneDistance') {
    if (measurement.kind !== 'length') {
      fail('unrecomputable_measurement', measurement.id, `Measurement "${measurement.id}" has an incompatible source kind.`);
    }
    const point = requireMeasurementPoint(scene, source.pointId, measurement.id);
    const plane = planeDataForMeasurement(scene, source.planeId, measurement.id);
    return {
      ...measurement,
      targetId: source.pointId,
      targetIds: [source.pointId, source.planeId],
      value: Math.abs(dot3(plane.normal, point) + plane.d),
      unit: 'u',
    };
  }

  const solid = scene.entities[source.solidId];
  if (!solid || solid.kind !== 'solid') {
    fail('unrecomputable_measurement', measurement.id, `Measurement "${measurement.id}" references missing solid "${source.solidId}".`);
  }
  if (source.kind === 'solidVolume') {
    if (measurement.kind !== 'volume' || solid.volume === undefined) {
      fail('unrecomputable_measurement', measurement.id, `Measurement "${measurement.id}" cannot compute solid volume.`);
    }
    return { ...measurement, targetId: solid.id, value: solid.volume, unit: 'u^3' };
  }
  if (source.kind === 'solidSurfaceArea') {
    if (measurement.kind !== 'surfaceArea' || solid.surfaceArea === undefined) {
      fail('unrecomputable_measurement', measurement.id, `Measurement "${measurement.id}" cannot compute solid surface area.`);
    }
    return { ...measurement, targetId: solid.id, value: solid.surfaceArea, unit: 'u^2' };
  }
  if (measurement.kind !== 'dihedral') {
    fail('unrecomputable_measurement', measurement.id, `Measurement "${measurement.id}" has an incompatible source kind.`);
  }
  const first = solid.faces?.find(face => face.id === source.firstFaceId);
  const second = solid.faces?.find(face => face.id === source.secondFaceId);
  if (!first?.normal || !second?.normal) {
    fail('unrecomputable_measurement', measurement.id, `Measurement "${measurement.id}" references a missing or degenerate face.`);
  }
  const value = radiansToDegrees(Math.acos(clamp(dot3(tupleToVector3(first.normal), tupleToVector3(second.normal)), -1, 1)));
  return {
    ...measurement,
    targetId: solid.id,
    targetIds: [solid.id, source.firstFaceId, source.secondFaceId],
    value,
    unit: 'deg',
  };
}

function planeDataForMeasurement(scene: GeometryScene3D, planeId: string, measurementId: string): PlaneData3D {
  const workPlane = scene.workPlanes[planeId];
  if (workPlane) return planeDataFromWorkPlane(workPlane, measurementId);
  const entity = scene.entities[planeId];
  if (!entity || entity.kind !== 'plane') {
    fail('unrecomputable_measurement', measurementId, `Measurement "${measurementId}" references invalid plane "${planeId}".`);
  }
  const first = scene.points[entity.pointIds[0]];
  const second = scene.points[entity.pointIds[1]];
  const third = scene.points[entity.pointIds[2]];
  const equation = first && second && third ? planeEquationFrom3DPoints(first, second, third) : null;
  if (!equation || !first || !second) {
    fail('unrecomputable_measurement', measurementId, `Measurement "${measurementId}" references a degenerate plane.`);
  }
  const normal = equationNormal(equation);
  const basis = basisForNormal(normal, subtract3(second, first));
  return { origin: first, normal, xAxis: basis.xAxis, yAxis: basis.yAxis, d: equation.d, equation };
}

function requireMeasurementPoint(scene: GeometryScene3D, pointId: string, measurementId: string): GeometryPoint3D {
  const point = scene.points[pointId];
  if (!point) {
    fail('unrecomputable_measurement', measurementId, `Measurement "${measurementId}" references missing point "${pointId}".`);
  }
  return point;
}

type LegacySolidEdgeMappings = ReadonlyMap<string, ReadonlyMap<string, readonly [string, string]>>;

function canonicalizeAppState(snapshot: GeometryLabSnapshot, legacySolidEdges: LegacySolidEdgeMappings): void {
  const workPlanes = snapshot.scene.scene3d.workPlanes;
  const activeId = snapshot.appState.activeWorkPlaneId;
  if (activeId !== undefined && !workPlanes[activeId]) {
    if (workPlanes.xy) snapshot.appState.activeWorkPlaneId = 'xy';
    else delete snapshot.appState.activeWorkPlaneId;
  }
  if (snapshot.appState.selected !== undefined) {
    snapshot.appState.selected = snapshot.appState.selected.filter(selection => (
      selectionExists(snapshot, selection, legacySolidEdges)
    ));
  }
}

function selectionExists(
  snapshot: GeometryLabSnapshot,
  selection: GeometrySelection,
  legacySolidEdges: LegacySolidEdgeMappings,
): boolean {
  if (selection.kind === 'point2d') return Boolean(snapshot.scene.scene2d.points[selection.id]);
  if (selection.kind === 'entity2d') return Boolean(snapshot.scene.scene2d.entities[selection.id]);
  if (selection.kind === 'point3d') return Boolean(snapshot.scene.scene3d.points[selection.id]);
  if (selection.kind === 'entity3d') return Boolean(snapshot.scene.scene3d.entities[selection.id]);
  const solid = snapshot.scene.scene3d.entities[selection.solidId];
  if (!solid || solid.kind !== 'solid') return false;
  if (selection.kind === 'face') return solid.faceIds.includes(selection.faceId);
  if (solid.edges?.some(edge => edge.id === selection.edgeId)) return true;
  const legacyEndpoints = legacySolidEdges.get(solid.id)?.get(selection.edgeId);
  if (!legacyEndpoints) return false;
  const replacement = solid.edges?.find(edge => sameUnorderedPair(edge.pointIds, legacyEndpoints));
  if (!replacement) return false;
  selection.edgeId = replacement.id;
  return true;
}

/**
 * Capture traversal-era edge identities before face winding is repaired. A
 * persisted edge-N record is authoritative only when its endpoints still form
 * an authored face edge; stale derived edge records fall back to legacy face
 * traversal order.
 */
function captureLegacySolidEdgeMappings(scene: GeometryScene3D): LegacySolidEdgeMappings {
  const mappings = new Map<string, ReadonlyMap<string, readonly [string, string]>>();
  for (const entity of Object.values(scene.entities)) {
    if (entity.kind !== 'solid') continue;
    const traversedEdges = legacySolidEdgeEndpoints(entity);
    const byLegacyId = new Map<string, readonly [string, string]>(traversedEdges.map((pointIds, index) => (
      [`edge-${index + 1}`, pointIds] as const
    )));
    const topologyPairs = new Set(traversedEdges.map(pointIds => normalizedPairKey(pointIds)));
    const ownedPointIds = new Set(entity.pointIds);
    for (const edge of entity.edges ?? []) {
      if (!/^edge-[1-9]\d*$/.test(edge.id)) continue;
      const [first, second] = edge.pointIds;
      if (
        !first
        || !second
        || first === second
        || !ownedPointIds.has(first)
        || !ownedPointIds.has(second)
        || !topologyPairs.has(normalizedPairKey(edge.pointIds))
      ) {
        continue;
      }
      byLegacyId.set(edge.id, [first, second]);
    }
    mappings.set(entity.id, byLegacyId);
  }
  return mappings;
}

/** Reconstruct the traversal-based edge-N order emitted before stable endpoint IDs. */
function legacySolidEdgeEndpoints(solid: SolidEntity): Array<readonly [string, string]> {
  const edges = new Map<string, [string, string]>();
  for (const face of solid.faces ?? []) {
    for (let index = 0; index < face.pointIds.length; index += 1) {
      const first = face.pointIds[index];
      const second = face.pointIds[(index + 1) % face.pointIds.length];
      if (!first || !second) continue;
      const ordered: [string, string] = first < second ? [first, second] : [second, first];
      const key = `${ordered[0].length}:${ordered[0]}${ordered[1].length}:${ordered[1]}`;
      if (!edges.has(key)) edges.set(key, [first, second]);
    }
  }
  return [...edges.values()];
}

function normalizedPairKey(pointIds: readonly [string, string]): string {
  const ordered = pointIds[0] < pointIds[1]
    ? pointIds
    : [pointIds[1], pointIds[0]] as const;
  return `${ordered[0].length}:${ordered[0]}${ordered[1].length}:${ordered[1]}`;
}

function sameUnorderedPair(
  first: readonly [string, string],
  second: readonly [string, string],
): boolean {
  return (first[0] === second[0] && first[1] === second[1])
    || (first[0] === second[1] && first[1] === second[0]);
}

function requirePoint(
  scene: GeometryScene3D,
  pointId: string,
  ownerId: string,
  label: string,
): GeometryPoint3D {
  const point = scene.points[pointId];
  if (!point) {
    const code = label === 'solid' || label.startsWith('face') || label === 'solid edge'
      ? 'unrecomputable_solid'
      : 'unrecomputable_work_plane';
    fail(code, ownerId, `${label} "${ownerId}" references missing point "${pointId}".`);
  }
  return point;
}

function projectFaceTo2D(points: Vector3[]): Vector2[] {
  const origin = points[0] as Vector3;
  const xAxis = normalize3(subtract3(points[1] as Vector3, origin));
  const normal = faceNormal(points);
  if (!xAxis || !normal) return [];
  const yAxis = normalize3(cross3(normal, xAxis));
  if (!yAxis) return [];
  return points.map(point => {
    const relative = subtract3(point, origin);
    return { x: dot3(relative, xAxis), y: dot3(relative, yAxis) };
  });
}

function faceNormal(points: Vector3[]): Vector3 | null {
  const normal = polygonNormal3D(points);
  return normal ? { ...normal } : null;
}

function polygonPerimeter3D(points: Vector3[]): number {
  let perimeter = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (current && next) perimeter += distance3(current, next);
  }
  return perimeter;
}

function polygonArea2D(points: Vector2[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (current && next) area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

function basisForNormal(normalInput: Vector3, preferredXAxis?: Vector3): { xAxis: Vector3; yAxis: Vector3 } {
  const normal = normalize3(normalInput);
  if (!normal) throw new Error('Plane normal must be non-zero.');
  const projectedPreferred = preferredXAxis
    ? subtract3(preferredXAxis, scale3(normal, dot3(preferredXAxis, normal)))
    : null;
  const fallback = cross3(Math.abs(normal.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 }, normal);
  const xAxis = normalize3(projectedPreferred ?? fallback) ?? normalize3(fallback);
  if (!xAxis) throw new Error('Could not derive plane x-axis.');
  const yAxis = normalize3(cross3(normal, xAxis));
  if (!yAxis) throw new Error('Could not derive plane y-axis.');
  return { xAxis, yAxis };
}

function equationFromPointNormal(point: Vector3, normalInput: Vector3): GeometryPlaneEquation3D {
  const normal = normalize3(normalInput);
  if (!normal) return { a: 0, b: 0, c: 0, d: 0 };
  return { a: normal.x, b: normal.y, c: normal.z, d: -dot3(normal, point) };
}

function projectPointToPlane(point: Vector3, equation: GeometryPlaneEquation3D): Vector3 {
  const normal = equationNormal(equation);
  return subtract3(point, scale3(normal, dot3(normal, point) + equation.d));
}

function equationNormal(equation: GeometryPlaneEquation3D): Vector3 {
  return { x: equation.a, y: equation.b, z: equation.c };
}

function subtract3(first: Vector3, second: Vector3): Vector3 {
  return { x: first.x - second.x, y: first.y - second.y, z: first.z - second.z };
}

function scale3(vector: Vector3, scale: number): Vector3 {
  return { x: vector.x * scale, y: vector.y * scale, z: vector.z * scale };
}

function dot3(first: Vector3, second: Vector3): number {
  return first.x * second.x + first.y * second.y + first.z * second.z;
}

function cross3(first: Vector3, second: Vector3): Vector3 {
  return {
    x: first.y * second.z - first.z * second.y,
    y: first.z * second.x - first.x * second.z,
    z: first.x * second.y - first.y * second.x,
  };
}

function length3(vector: Vector3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function distance3(first: Vector3, second: Vector3): number {
  return length3(subtract3(second, first));
}

function normalize3(vector: Vector3): Vector3 | null {
  const length = length3(vector);
  return Number.isFinite(length) && length > 0 ? scale3(vector, 1 / length) : null;
}

function tupleToVector3(tuple: [number, number, number]): Vector3 {
  return { x: tuple[0], y: tuple[1], z: tuple[2] };
}

function vector3ToTuple(vector: Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function cloneSnapshot(snapshot: GeometryLabSnapshot, reuseSurfaceMeshCaches: boolean): GeometryLabSnapshot {
  if (!reuseSurfaceMeshCaches) return JSON.parse(JSON.stringify(snapshot)) as GeometryLabSnapshot;

  const preserved = new Map<string, { vertices: Vector3[]; faces: number[][] }>();
  const preservedCurves = new Map<string, Vector3[]>();
  const entities = Object.fromEntries(Object.entries(snapshot.scene.scene3d.entities).map(([id, entity]) => {
    if (entity.kind === 'surface3d') {
      preserved.set(id, { vertices: entity.vertices, faces: entity.faces });
      return [id, { ...entity, vertices: [], faces: [] }];
    }
    if (entity.kind === 'curve3d') {
      preservedCurves.set(id, entity.points);
      return [id, { ...entity, points: [] }];
    }
    return [id, entity];
  })) as GeometryLabSnapshot['scene']['scene3d']['entities'];
  const withoutMeshes: GeometryLabSnapshot = {
    ...snapshot,
    scene: {
      ...snapshot.scene,
      scene3d: { ...snapshot.scene.scene3d, entities },
    },
  };
  const next = JSON.parse(JSON.stringify(withoutMeshes)) as GeometryLabSnapshot;
  for (const [id, mesh] of preserved) {
    const entity = next.scene.scene3d.entities[id];
    if (entity?.kind !== 'surface3d') continue;
    entity.vertices = mesh.vertices;
    entity.faces = mesh.faces;
  }
  for (const [id, points] of preservedCurves) {
    const entity = next.scene.scene3d.entities[id];
    if (entity?.kind === 'curve3d') entity.points = points;
  }
  return next;
}

function fail(code: GeometryLabCanonicalizationErrorCode, objectId: string, message: string): never {
  throw new GeometryLabCanonicalizationError(code, objectId, message);
}
