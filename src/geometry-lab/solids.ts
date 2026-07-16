/**
 * Pure, scale-aware helpers for Geometry Lab polygon, solid, and plane math.
 *
 * This module intentionally has no dependency on Geometry Lab state. Callers
 * adapt their point/face records to these structural input types, which keeps
 * validation and canonicalization deterministic and independently testable.
 */

export interface Vector3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Mutable, serializable topology emitted by the pure solid mesh factories. */
export interface GeneratedSolidMesh3D {
  readonly vertices: Array<{ x: number; y: number; z: number }>;
  readonly faces: number[][];
}

export type RegularPolyhedronKind3D = 'tetrahedron' | 'cube' | 'octahedron' | 'icosahedron';

/** Extrudes an ordered polygon by an already-validated height vector. */
export function createPrismMesh3D(
  base: readonly Vector3Like[],
  heightVector: Vector3Like,
): GeneratedSolidMesh3D {
  const baseVertices = base.map(copyMutable3);
  const top = base.map(point => mutableVector3(
    point.x + heightVector.x,
    point.y + heightVector.y,
    point.z + heightVector.z,
  ));
  const sides = base.length;
  return {
    vertices: [...baseVertices, ...top],
    faces: [
      reverseIntegerRange(0, sides),
      integerRange(sides, sides * 2),
      ...Array.from({ length: sides }, (_, index) => [
        index,
        (index + 1) % sides,
        sides + ((index + 1) % sides),
        sides + index,
      ]),
    ],
  };
}

/** Joins an ordered polygon to an already-validated apex. */
export function createPyramidMesh3D(
  base: readonly Vector3Like[],
  apex: Vector3Like,
): GeneratedSolidMesh3D {
  const vertices = [...base.map(copyMutable3), copyMutable3(apex)];
  const apexIndex = vertices.length - 1;
  return {
    vertices,
    faces: [
      reverseIntegerRange(0, base.length),
      ...Array.from({ length: base.length }, (_, index) => [
        index,
        (index + 1) % base.length,
        apexIndex,
      ]),
    ],
  };
}

/** Generates a z-axis cylinder for already-validated dimensions and side count. */
export function createCylinderMesh3D(
  center: Vector3Like,
  radius: number,
  height: number,
  sides: number,
): GeneratedSolidMesh3D {
  const bottomZ = center.z - height / 2;
  const topZ = center.z + height / 2;
  const bottom = circlePoints3D(center.x, center.y, bottomZ, radius, sides);
  const top = circlePoints3D(center.x, center.y, topZ, radius, sides);
  return {
    vertices: [...bottom, ...top],
    faces: [
      reverseIntegerRange(0, sides),
      integerRange(sides, sides * 2),
      ...Array.from({ length: sides }, (_, index) => [
        index,
        (index + 1) % sides,
        sides + ((index + 1) % sides),
        sides + index,
      ]),
    ],
  };
}

/** Generates a z-axis cone for already-validated dimensions and side count. */
export function createConeMesh3D(
  center: Vector3Like,
  radius: number,
  height: number,
  sides: number,
): GeneratedSolidMesh3D {
  const base = circlePoints3D(center.x, center.y, center.z - height / 2, radius, sides);
  const vertices = [
    ...base,
    mutableVector3(center.x, center.y, center.z + height / 2),
  ];
  const apexIndex = vertices.length - 1;
  return {
    vertices,
    faces: [
      reverseIntegerRange(0, sides),
      ...Array.from({ length: sides }, (_, index) => [index, (index + 1) % sides, apexIndex]),
    ],
  };
}

/** Generates the existing latitude/longitude sphere topology without changing its pole ordering. */
export function createSphereMesh3D(
  center: Vector3Like,
  radius: number,
  longitude: number,
): GeneratedSolidMesh3D {
  const latitude = Math.max(4, Math.floor(longitude / 2));
  const vertices = [mutableVector3(center.x, center.y, center.z + radius)];
  for (let lat = 1; lat < latitude; lat += 1) {
    const phi = (Math.PI * lat) / latitude;
    const z = center.z + Math.cos(phi) * radius;
    const ringRadius = Math.sin(phi) * radius;
    vertices.push(...circlePoints3D(center.x, center.y, z, ringRadius, longitude));
  }
  const bottomIndex = vertices.length;
  vertices.push(mutableVector3(center.x, center.y, center.z - radius));

  const faces: number[][] = [];
  for (let lon = 0; lon < longitude; lon += 1) {
    faces.push([0, 1 + lon, 1 + ((lon + 1) % longitude)]);
  }
  for (let lat = 0; lat < latitude - 2; lat += 1) {
    const firstRing = 1 + lat * longitude;
    const secondRing = firstRing + longitude;
    for (let lon = 0; lon < longitude; lon += 1) {
      faces.push([
        firstRing + lon,
        firstRing + ((lon + 1) % longitude),
        secondRing + ((lon + 1) % longitude),
        secondRing + lon,
      ]);
    }
  }
  const lastRing = 1 + (latitude - 2) * longitude;
  for (let lon = 0; lon < longitude; lon += 1) {
    faces.push([lastRing + ((lon + 1) % longitude), lastRing + lon, bottomIndex]);
  }
  return { vertices, faces };
}

/** Generates the legacy regular-polyhedron vertex and face ordering exactly. */
export function createRegularPolyhedronMesh3D(
  kind: RegularPolyhedronKind3D,
  center: Vector3Like,
  size: number,
): GeneratedSolidMesh3D {
  if (kind === 'cube') {
    const s = size / 2;
    return {
      vertices: [
        mutableVector3(center.x - s, center.y - s, center.z - s),
        mutableVector3(center.x + s, center.y - s, center.z - s),
        mutableVector3(center.x + s, center.y + s, center.z - s),
        mutableVector3(center.x - s, center.y + s, center.z - s),
        mutableVector3(center.x - s, center.y - s, center.z + s),
        mutableVector3(center.x + s, center.y - s, center.z + s),
        mutableVector3(center.x + s, center.y + s, center.z + s),
        mutableVector3(center.x - s, center.y + s, center.z + s),
      ],
      faces: [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]],
    };
  }
  if (kind === 'tetrahedron') {
    const s = size / Math.sqrt(2);
    return {
      vertices: [
        mutableVector3(center.x + s, center.y, center.z - s / Math.sqrt(2)),
        mutableVector3(center.x - s, center.y, center.z - s / Math.sqrt(2)),
        mutableVector3(center.x, center.y + s, center.z + s / Math.sqrt(2)),
        mutableVector3(center.x, center.y - s, center.z + s / Math.sqrt(2)),
      ],
      faces: [[0, 2, 3], [0, 3, 1], [0, 1, 2], [1, 3, 2]],
    };
  }
  if (kind === 'octahedron') {
    const s = size / 2;
    return {
      vertices: [
        mutableVector3(center.x, center.y, center.z + s),
        mutableVector3(center.x + s, center.y, center.z),
        mutableVector3(center.x, center.y + s, center.z),
        mutableVector3(center.x - s, center.y, center.z),
        mutableVector3(center.x, center.y - s, center.z),
        mutableVector3(center.x, center.y, center.z - s),
      ],
      faces: [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1], [5, 2, 1], [5, 3, 2], [5, 4, 3], [5, 1, 4]],
    };
  }
  const phi = (1 + Math.sqrt(5)) / 2;
  const base = [
    mutableVector3(-1, phi, 0), mutableVector3(1, phi, 0), mutableVector3(-1, -phi, 0), mutableVector3(1, -phi, 0),
    mutableVector3(0, -1, phi), mutableVector3(0, 1, phi), mutableVector3(0, -1, -phi), mutableVector3(0, 1, -phi),
    mutableVector3(phi, 0, -1), mutableVector3(phi, 0, 1), mutableVector3(-phi, 0, -1), mutableVector3(-phi, 0, 1),
  ];
  return {
    vertices: base.map(point => mutableVector3(
      center.x + point.x * size * 0.35,
      center.y + point.y * size * 0.35,
      center.z + point.z * size * 0.35,
    )),
    faces: [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ],
  };
}

/** Returns points around a horizontal circle, starting at angle zero. */
export function circlePoints3D(
  cx: number,
  cy: number,
  z: number,
  radius: number,
  sides: number,
): Array<{ x: number; y: number; z: number }> {
  return Array.from({ length: sides }, (_, index) => {
    const angle = (index * Math.PI * 2) / sides;
    return mutableVector3(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, z);
  });
}

/** Integer interval `[start, end)`, used to keep cap ordering explicit. */
export function integerRange(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, index) => start + index);
}

export function reverseIntegerRange(start: number, end: number): number[] {
  return integerRange(start, end).reverse();
}

function mutableVector3(x: number, y: number, z: number): { x: number; y: number; z: number } {
  return { x, y, z };
}

function copyMutable3(vector: Vector3Like): { x: number; y: number; z: number } {
  return mutableVector3(vector.x, vector.y, vector.z);
}

export interface Plane3DLike {
  readonly normal: Vector3Like;
  readonly d: number;
}

export interface Segment3DLike {
  readonly first: Vector3Like;
  readonly second: Vector3Like;
}

export interface GeometryToleranceOptions {
  /** Relative tolerance applied to the local geometry extent. */
  readonly relative?: number;
  /** Absolute lower bound for a distance comparison. */
  readonly absolute?: number;
  /** Number of coordinate ulps reserved for subtraction round-off. */
  readonly ulps?: number;
}

export interface PolygonPlanarity3D {
  readonly planar: boolean;
  readonly normal: Vector3Like | null;
  readonly maxDistance: number;
  readonly tolerance: number;
}

export type PolygonIssueCode =
  | 'too_few_vertices'
  | 'non_finite_vertex'
  | 'duplicate_vertex'
  | 'degenerate_area'
  | 'non_planar'
  | 'self_intersection';

export interface PolygonIssue3D {
  readonly code: PolygonIssueCode;
  readonly message: string;
}

export interface PolygonAnalysis3D {
  readonly valid: boolean;
  readonly issues: readonly PolygonIssue3D[];
  readonly normal: Vector3Like | null;
  readonly area: number;
  readonly scale: number;
  readonly tolerance: number;
  readonly maxPlanarityDistance: number;
}

export interface SolidMeshFaceInput {
  readonly id: string;
  readonly pointIds: readonly string[];
}

export interface StableSolidEdge3D {
  readonly id: string;
  readonly pointIds: [string, string];
  readonly length: number;
}

export type SolidMeshIssueCode =
  | 'no_faces'
  | 'duplicate_face_id'
  | 'missing_vertex'
  | 'duplicate_face_vertex'
  | 'degenerate_face'
  | 'non_planar_face'
  | 'self_intersecting_face'
  | 'open_edge'
  | 'non_manifold_edge'
  | 'non_orientable_mesh'
  | 'disconnected_shell'
  | 'self_intersecting_mesh'
  | 'degenerate_volume';

export interface SolidMeshIssue3D {
  readonly code: SolidMeshIssueCode;
  readonly message: string;
  readonly faceId?: string;
  readonly pointId?: string;
  readonly edgePointIds?: readonly [string, string];
}

export interface SolidMeshAnalysis3D {
  readonly valid: boolean;
  readonly issues: readonly SolidMeshIssue3D[];
  readonly edges: readonly StableSolidEdge3D[];
  readonly surfaceArea: number;
  readonly volume: number;
  /** Multiplier that makes each face winding consistent and globally outward. */
  readonly faceOrientation: readonly (1 | -1)[];
  readonly scale: number;
  readonly tolerance: number;
}

export type LinePlaneIntersection3D =
  | { readonly kind: 'point'; readonly point: Vector3Like; readonly parameter: number }
  | { readonly kind: 'parallel' }
  | { readonly kind: 'coplanar' }
  | { readonly kind: 'degenerate' };

export type SegmentPlaneIntersection3D =
  | { readonly kind: 'point'; readonly point: Vector3Like; readonly parameter: number }
  | { readonly kind: 'none' }
  | { readonly kind: 'coplanar' }
  | { readonly kind: 'degenerate' };

export type PlanePlaneIntersection3D =
  | { readonly kind: 'line'; readonly point: Vector3Like; readonly direction: Vector3Like }
  | { readonly kind: 'parallel' }
  | { readonly kind: 'coincident' }
  | { readonly kind: 'degenerate' };

export interface CrossSectionCandidates3D {
  readonly points: readonly Vector3Like[];
  readonly coplanarSegmentIndexes: readonly number[];
  readonly tolerance: number;
}

export type CrossSectionTopologyStatus3D =
  | 'empty'
  | 'single_loop'
  | 'multiple_loops'
  | 'invalid_input'
  | 'unsupported_topology';

export type CrossSectionTopologyIssueCode3D =
  | 'invalid_plane'
  | 'no_faces'
  | 'duplicate_face_id'
  | 'invalid_face'
  | 'missing_vertex'
  | 'non_finite_vertex'
  | 'open_mesh_edge'
  | 'non_manifold_mesh_edge'
  | 'numerical_ambiguity'
  | 'lower_dimensional_section'
  | 'open_section'
  | 'branched_section'
  | 'degenerate_loop';

export interface CrossSectionTopologyIssue3D {
  readonly code: CrossSectionTopologyIssueCode3D;
  readonly message: string;
  readonly faceId?: string;
  readonly pointId?: string;
  readonly edgePointIds?: readonly [string, string];
}

export interface CrossSectionLoop3D {
  /** Counter-clockwise relative to the supplied plane normal. */
  readonly points: readonly Vector3Like[];
  readonly area: number;
  readonly perimeter: number;
}

/**
 * A topology-preserving plane cut through a closed polygon mesh.
 *
 * `multiple_loops` is deliberately distinct from `single_loop`: Geometry Lab
 * currently stores one polygon per cross-section, so callers must choose an
 * explicit policy instead of silently joining or discarding disconnected cuts.
 */
export interface CrossSectionTopology3D {
  readonly status: CrossSectionTopologyStatus3D;
  readonly loops: readonly CrossSectionLoop3D[];
  readonly issues: readonly CrossSectionTopologyIssue3D[];
  readonly tolerance: number;
}

const DEFAULT_RELATIVE_TOLERANCE = 1e-9;
// Geometry Lab has no privileged world unit, so the default absolute floor is
// zero. Callers with a physical unit can opt into one; floating-point loss from
// large translations is handled separately by the coordinate-ulp term.
const DEFAULT_ABSOLUTE_TOLERANCE = 0;
const DEFAULT_ULPS = 2;

/** Return the diagonal of the points' axis-aligned bounding box. */
export function geometryScale3D(points: readonly Vector3Like[]): number {
  if (points.length === 0) return 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (!isFiniteVector3(point)) return Number.NaN;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    minZ = Math.min(minZ, point.z);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    maxZ = Math.max(maxZ, point.z);
  }
  return Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
}

/**
 * Derive a distance tolerance from local extent and floating-point magnitude.
 * The ulp term is important after large translations, where subtracting nearby
 * coordinates loses more precision than a relative-to-extent test accounts for.
 */
export function linearTolerance3D(
  points: readonly Vector3Like[],
  options: GeometryToleranceOptions = {},
): number {
  const relative = finiteNonNegative(options.relative, DEFAULT_RELATIVE_TOLERANCE);
  const absolute = finiteNonNegative(options.absolute, DEFAULT_ABSOLUTE_TOLERANCE);
  const ulps = finiteNonNegative(options.ulps, DEFAULT_ULPS);
  const scale = geometryScale3D(points);
  let coordinateMagnitude = 0;
  for (const point of points) {
    coordinateMagnitude = Math.max(
      coordinateMagnitude,
      Math.abs(point.x),
      Math.abs(point.y),
      Math.abs(point.z),
    );
  }
  return Math.max(
    absolute,
    Number.isFinite(scale) ? relative * scale : absolute,
    Number.EPSILON * coordinateMagnitude * ulps,
  );
}

/** Twice the oriented area vector, computed with the centered Newell formula. */
export function newellAreaVector3D(points: readonly Vector3Like[]): Vector3Like {
  if (points.length < 3 || points.some(point => !isFiniteVector3(point))) return vector3(0, 0, 0);
  const center = centroid3(points);
  const xTerms: number[] = [];
  const yTerms: number[] = [];
  const zTerms: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = subtract3(points[index] as Vector3Like, center);
    const next = subtract3(points[(index + 1) % points.length] as Vector3Like, center);
    xTerms.push((current.y - next.y) * (current.z + next.z));
    yTerms.push((current.z - next.z) * (current.x + next.x));
    zTerms.push((current.x - next.x) * (current.y + next.y));
  }
  return vector3(compensatedSum(xTerms), compensatedSum(yTerms), compensatedSum(zTerms));
}

/** Unit polygon normal based on all vertices, not only the first triangle. */
export function polygonNormal3D(
  points: readonly Vector3Like[],
  options: GeometryToleranceOptions = {},
): Vector3Like | null {
  const areaVector = newellAreaVector3D(points);
  const scale = geometryScale3D(points);
  const tolerance = linearTolerance3D(points, options);
  const minimumAreaVector = 2 * tolerance * Math.max(scale, tolerance);
  return normalize3(areaVector, minimumAreaVector);
}

/**
 * Area of a planar simple polygon. Newell's formula handles concave polygons
 * without the over-counting caused by an unsigned triangle fan.
 */
export function polygonArea3D(points: readonly Vector3Like[]): number {
  return length3(newellAreaVector3D(points)) / 2;
}

export function polygonPlanarity3D(
  points: readonly Vector3Like[],
  options: GeometryToleranceOptions = {},
): PolygonPlanarity3D {
  const tolerance = linearTolerance3D(points, options);
  const normal = representativePolygonNormal(points, tolerance);
  if (!normal) return { planar: false, normal: null, maxDistance: Number.POSITIVE_INFINITY, tolerance };
  const origin = centroid3(points);
  let maxDistance = 0;
  for (const point of points) maxDistance = Math.max(maxDistance, Math.abs(dot3(normal, subtract3(point, origin))));
  return { planar: maxDistance <= tolerance, normal, maxDistance, tolerance };
}

/** Detect non-adjacent edge intersections after a stable dominant-axis projection. */
export function polygonSelfIntersects3D(
  points: readonly Vector3Like[],
  options: GeometryToleranceOptions = {},
): boolean {
  if (points.length < 4 || points.some(point => !isFiniteVector3(point))) return false;
  const tolerance = linearTolerance3D(points, options);
  const normal = representativePolygonNormal(points, tolerance);
  if (!normal) return false;
  const projected = points.map(point => projectDominant2D(point, normal));
  for (let firstIndex = 0; firstIndex < projected.length; firstIndex += 1) {
    const firstStart = projected[firstIndex] as Vector2Like;
    const firstEnd = projected[(firstIndex + 1) % projected.length] as Vector2Like;
    for (let secondIndex = firstIndex + 1; secondIndex < projected.length; secondIndex += 1) {
      if (edgesAreAdjacent(firstIndex, secondIndex, projected.length)) continue;
      const secondStart = projected[secondIndex] as Vector2Like;
      const secondEnd = projected[(secondIndex + 1) % projected.length] as Vector2Like;
      if (segmentsIntersect2D(firstStart, firstEnd, secondStart, secondEnd, tolerance)) return true;
    }
  }
  return false;
}

/** Apply Geometry Lab's face policy: finite, simple, planar, and non-degenerate. */
export function analyzePolygon3D(
  points: readonly Vector3Like[],
  options: GeometryToleranceOptions = {},
): PolygonAnalysis3D {
  const issues: PolygonIssue3D[] = [];
  const scale = geometryScale3D(points);
  const tolerance = linearTolerance3D(points, options);
  if (points.length < 3) issues.push({ code: 'too_few_vertices', message: 'A polygon needs at least three vertices.' });
  if (points.some(point => !isFiniteVector3(point))) {
    issues.push({ code: 'non_finite_vertex', message: 'Polygon vertices must contain finite coordinates.' });
    return {
      valid: false,
      issues,
      normal: null,
      area: Number.NaN,
      scale,
      tolerance,
      maxPlanarityDistance: Number.POSITIVE_INFINITY,
    };
  }

  if (hasDuplicatePoint(points, tolerance)) {
    issues.push({ code: 'duplicate_vertex', message: 'Polygon vertices must be distinct at the geometry scale.' });
  }
  const area = polygonArea3D(points);
  const areaTolerance = tolerance * Math.max(scale, tolerance);
  if (!Number.isFinite(area) || area <= areaTolerance) {
    issues.push({ code: 'degenerate_area', message: 'Polygon area is zero or below the geometry tolerance.' });
  }
  const planarity = polygonPlanarity3D(points, options);
  if (!planarity.planar) {
    issues.push({ code: 'non_planar', message: 'Polygon vertices are not coplanar at the geometry scale.' });
  }
  if (polygonSelfIntersects3D(points, options)) {
    issues.push({ code: 'self_intersection', message: 'Polygon boundary intersects itself.' });
  }
  return {
    valid: issues.length === 0,
    issues,
    normal: planarity.normal,
    area,
    scale,
    tolerance,
    maxPlanarityDistance: planarity.maxDistance,
  };
}

/** Perpendicular height of an extrusion relative to its base plane. */
export function prismHeight3D(
  base: readonly Vector3Like[],
  extrusion: Vector3Like,
  options: GeometryToleranceOptions = {},
): number | null {
  const normal = polygonNormal3D(base, options);
  if (!normal || !isFiniteVector3(extrusion)) return null;
  return Math.abs(dot3(normal, extrusion));
}

/** Perpendicular point-to-base height of a pyramid. */
export function pyramidHeight3D(
  base: readonly Vector3Like[],
  apex: Vector3Like,
  options: GeometryToleranceOptions = {},
): number | null {
  const normal = polygonNormal3D(base, options);
  if (!normal || !isFiniteVector3(apex) || base.length === 0) return null;
  return Math.abs(dot3(normal, subtract3(apex, base[0] as Vector3Like)));
}

/** Analytic prism volume using perpendicular, rather than vector, height. */
export function prismVolume3D(
  base: readonly Vector3Like[],
  extrusion: Vector3Like,
  options: GeometryToleranceOptions = {},
): number | null {
  const polygon = analyzePolygon3D(base, options);
  const height = prismHeight3D(base, extrusion, options);
  return polygon.valid && height !== null ? polygon.area * height : null;
}

/** Analytic pyramid volume using apex-to-base-plane distance. */
export function pyramidVolume3D(
  base: readonly Vector3Like[],
  apex: Vector3Like,
  options: GeometryToleranceOptions = {},
): number | null {
  const polygon = analyzePolygon3D(base, options);
  const height = pyramidHeight3D(base, apex, options);
  return polygon.valid && height !== null ? polygon.area * height / 3 : null;
}

/** Collision-free canonical key for an unordered pair of point IDs. */
export function solidEdgeKey(firstPointId: string, secondPointId: string): string {
  const [first, second] = orderedPair(firstPointId, secondPointId);
  return `${first.length}:${first}${second.length}:${second}`;
}

/** Deterministic edge identity that does not depend on face traversal order. */
export function stableSolidEdgeId(solidId: string, firstPointId: string, secondPointId: string): string {
  const [first, second] = orderedPair(firstPointId, secondPointId);
  return `edge:${encodeURIComponent(solidId)}:${encodeURIComponent(first)}:${encodeURIComponent(second)}`;
}

/** Rebuild unique solid edges in canonical endpoint order. */
export function stableSolidEdgesFromFaces(
  solidId: string,
  pointsById: Readonly<Record<string, Vector3Like>>,
  faces: readonly SolidMeshFaceInput[],
): StableSolidEdge3D[] {
  const pairs = edgePairsFromFaces(faces);
  return [...pairs.values()]
    .sort((first, second) => compareCodeUnits(
      solidEdgeKey(first[0], first[1]),
      solidEdgeKey(second[0], second[1]),
    ))
    .flatMap(pointIds => {
      const first = pointsById[pointIds[0]];
      const second = pointsById[pointIds[1]];
      if (!first || !second) return [];
      return [{
        id: stableSolidEdgeId(solidId, pointIds[0], pointIds[1]),
        pointIds,
        length: distance3(first, second),
      }];
    });
}

/**
 * Validate a closed two-manifold mesh and calculate winding-independent volume.
 * Individual faces may arrive in arbitrary winding; adjacency is used to orient
 * every connected shell consistently before signed tetrahedral integration.
 */
export function analyzeClosedSolidMesh3D(
  solidId: string,
  pointsById: Readonly<Record<string, Vector3Like>>,
  faces: readonly SolidMeshFaceInput[],
  options: GeometryToleranceOptions = {},
): SolidMeshAnalysis3D {
  const issues: SolidMeshIssue3D[] = [];
  const usedPoints: Vector3Like[] = [];
  const seenFaceIds = new Set<string>();
  let surfaceArea = 0;
  if (faces.length === 0) issues.push({ code: 'no_faces', message: `Solid "${solidId}" has no faces.` });

  for (const face of faces) {
    if (seenFaceIds.has(face.id)) {
      issues.push({ code: 'duplicate_face_id', faceId: face.id, message: `Solid face id "${face.id}" is duplicated.` });
    }
    seenFaceIds.add(face.id);
    if (new Set(face.pointIds).size !== face.pointIds.length) {
      issues.push({
        code: 'duplicate_face_vertex',
        faceId: face.id,
        message: `Face "${face.id}" repeats a vertex.`,
      });
    }
    const facePoints: Vector3Like[] = [];
    for (const pointId of face.pointIds) {
      const point = pointsById[pointId];
      if (!point) {
        issues.push({
          code: 'missing_vertex',
          faceId: face.id,
          pointId,
          message: `Face "${face.id}" references missing point "${pointId}".`,
        });
      } else {
        facePoints.push(point);
        usedPoints.push(point);
      }
    }
    if (facePoints.length !== face.pointIds.length) continue;
    const polygon = analyzePolygon3D(facePoints, options);
    surfaceArea += Number.isFinite(polygon.area) ? polygon.area : 0;
    for (const issue of polygon.issues) {
      if (issue.code === 'non_planar') {
        issues.push({ code: 'non_planar_face', faceId: face.id, message: `Face "${face.id}" is not planar.` });
      } else if (issue.code === 'self_intersection') {
        issues.push({
          code: 'self_intersecting_face',
          faceId: face.id,
          message: `Face "${face.id}" intersects itself.`,
        });
      } else {
        issues.push({ code: 'degenerate_face', faceId: face.id, message: `Face "${face.id}" is degenerate.` });
      }
    }
  }

  const scale = geometryScale3D(usedPoints);
  const tolerance = linearTolerance3D(usedPoints, options);
  const edgeOccurrences = collectEdgeOccurrences(faces);
  let closedTopology = true;
  for (const occurrences of edgeOccurrences.values()) {
    const pointIds = occurrences[0]?.pointIds;
    if (!pointIds) continue;
    if (occurrences.length === 1) {
      closedTopology = false;
      issues.push({ code: 'open_edge', edgePointIds: pointIds, message: `Edge "${pointIds.join(' - ')}" is open.` });
    } else if (occurrences.length !== 2) {
      closedTopology = false;
      issues.push({
        code: 'non_manifold_edge',
        edgePointIds: pointIds,
        message: `Edge "${pointIds.join(' - ')}" belongs to ${occurrences.length} faces.`,
      });
    }
  }

  const relativeOrientation = closedTopology ? orientFaceComponents(faces, edgeOccurrences) : null;
  if (relativeOrientation?.conflict) {
    issues.push({ code: 'non_orientable_mesh', message: `Solid "${solidId}" cannot be oriented consistently.` });
  }
  if (relativeOrientation && relativeOrientation.components.length > 1) {
    issues.push({
      code: 'disconnected_shell',
      message: `Solid "${solidId}" contains ${relativeOrientation.components.length} disconnected closed shells.`,
    });
  }

  let volume = 0;
  const faceGeometryIsValid = !issues.some(issue =>
    issue.code === 'missing_vertex'
    || issue.code === 'duplicate_face_vertex'
    || issue.code === 'degenerate_face'
    || issue.code === 'non_planar_face'
    || issue.code === 'self_intersecting_face');
  if (closedTopology && faceGeometryIsValid) {
    const intersection = firstMeshSelfIntersection3D(pointsById, faces, edgeOccurrences, tolerance);
    if (intersection) {
      issues.push({
        code: 'self_intersecting_mesh',
        edgePointIds: intersection.edgePointIds,
        message: intersection.faceId
          ? `Edge "${intersection.edgePointIds.join(' - ')}" intersects nonincident face "${intersection.faceId}".`
          : `Nonincident mesh edges intersect at "${intersection.edgePointIds.join(' - ')}".`,
      });
    }
  }

  const orientation = relativeOrientation && !relativeOrientation.conflict && faceGeometryIsValid
    ? orientFaceComponentsOutward(pointsById, faces, relativeOrientation)
    : relativeOrientation;
  const meshGeometryIsValid = faceGeometryIsValid
    && !issues.some(issue => issue.code === 'self_intersecting_mesh');
  if (orientation && !orientation.conflict && meshGeometryIsValid) {
    volume = closedMeshVolumeFromOrientation(pointsById, faces, orientation.multipliers, orientation.components);
    const volumeTolerance = tolerance * Math.max(scale * scale, tolerance * tolerance);
    if (!Number.isFinite(volume) || volume <= volumeTolerance) {
      issues.push({
        code: 'degenerate_volume',
        message: `Solid "${solidId}" has zero or tolerance-scale volume.`,
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    edges: stableSolidEdgesFromFaces(solidId, pointsById, faces),
    surfaceArea,
    volume,
    faceOrientation: orientation && !orientation.conflict
      ? orientation.multipliers
      : faces.map(() => 1 as const),
    scale,
    tolerance,
  };
}

/** Scale-aware infinite-line/plane intersection with coplanarity classification. */
export function intersectLinePlane3D(
  point: Vector3Like,
  direction: Vector3Like,
  plane: Plane3DLike,
  options: GeometryToleranceOptions = {},
): LinePlaneIntersection3D {
  const normalLength = length3(plane.normal);
  const directionLength = length3(direction);
  if (!isFiniteVector3(point) || !isFiniteVector3(direction) || !isFinitePlane(plane)
    || normalLength === 0 || directionLength === 0) return { kind: 'degenerate' };

  const denominator = dot3(plane.normal, direction);
  const angularTolerance = finiteNonNegative(options.relative, DEFAULT_RELATIVE_TOLERANCE)
    + Number.EPSILON * finiteNonNegative(options.ulps, DEFAULT_ULPS);
  const signedDistance = (dot3(plane.normal, point) + plane.d) / normalLength;
  if (Math.abs(denominator) <= angularTolerance * normalLength * directionLength) {
    const distanceTolerance = linearTolerance3D([point, add3(point, direction)], options);
    return Math.abs(signedDistance) <= distanceTolerance ? { kind: 'coplanar' } : { kind: 'parallel' };
  }
  const parameter = -(dot3(plane.normal, point) + plane.d) / denominator;
  return { kind: 'point', point: add3(point, scale3(direction, parameter)), parameter };
}

/** Scale-aware plane/plane intersection with coincident-plane classification. */
export function intersectPlanes3D(
  first: Plane3DLike,
  second: Plane3DLike,
  options: GeometryToleranceOptions = {},
): PlanePlaneIntersection3D {
  const firstNormalLength = length3(first.normal);
  const secondNormalLength = length3(second.normal);
  if (!isFinitePlane(first) || !isFinitePlane(second) || firstNormalLength === 0 || secondNormalLength === 0) {
    return { kind: 'degenerate' };
  }
  const direction = cross3(first.normal, second.normal);
  const directionLength = length3(direction);
  const angularTolerance = finiteNonNegative(options.relative, DEFAULT_RELATIVE_TOLERANCE)
    + Number.EPSILON * finiteNonNegative(options.ulps, DEFAULT_ULPS);
  if (directionLength <= angularTolerance * firstNormalLength * secondNormalLength) {
    const firstAnchor = scale3(first.normal, -first.d / (firstNormalLength * firstNormalLength));
    const secondAnchor = scale3(second.normal, -second.d / (secondNormalLength * secondNormalLength));
    const separation = Math.abs((dot3(second.normal, firstAnchor) + second.d) / secondNormalLength);
    const distanceTolerance = linearTolerance3D([firstAnchor, secondAnchor], options);
    return separation <= distanceTolerance ? { kind: 'coincident' } : { kind: 'parallel' };
  }
  const weightedNormals = subtract3(scale3(first.normal, second.d), scale3(second.normal, first.d));
  const point = scale3(cross3(weightedNormals, direction), 1 / (directionLength * directionLength));
  return { kind: 'line', point, direction: scale3(direction, 1 / directionLength) };
}

/** Scale-aware finite-segment/plane intersection used by cross-sections. */
export function intersectSegmentPlane3D(
  first: Vector3Like,
  second: Vector3Like,
  plane: Plane3DLike,
  options: GeometryToleranceOptions = {},
): SegmentPlaneIntersection3D {
  const normalLength = length3(plane.normal);
  const segmentLength = distance3(first, second);
  if (!isFiniteVector3(first) || !isFiniteVector3(second) || !isFinitePlane(plane) || normalLength === 0) {
    return { kind: 'degenerate' };
  }
  const tolerance = linearTolerance3D([first, second], options);
  if (segmentLength <= tolerance) {
    const distance = Math.abs((dot3(plane.normal, first) + plane.d) / normalLength);
    return distance <= tolerance ? { kind: 'coplanar' } : { kind: 'degenerate' };
  }
  const firstDistance = (dot3(plane.normal, first) + plane.d) / normalLength;
  const secondDistance = (dot3(plane.normal, second) + plane.d) / normalLength;
  const firstOnPlane = Math.abs(firstDistance) <= tolerance;
  const secondOnPlane = Math.abs(secondDistance) <= tolerance;
  if (firstOnPlane && secondOnPlane) return { kind: 'coplanar' };
  if (firstOnPlane) return { kind: 'point', point: copy3(first), parameter: 0 };
  if (secondOnPlane) return { kind: 'point', point: copy3(second), parameter: 1 };
  if ((firstDistance > 0) === (secondDistance > 0)) return { kind: 'none' };
  const parameter = firstDistance / (firstDistance - secondDistance);
  return {
    kind: 'point',
    point: add3(first, scale3(subtract3(second, first), parameter)),
    parameter,
  };
}

/** Collect and scale-deduplicate the point candidates for a plane cut. */
export function crossSectionPointCandidates3D(
  segments: readonly Segment3DLike[],
  plane: Plane3DLike,
  options: GeometryToleranceOptions = {},
): CrossSectionCandidates3D {
  const endpoints = segments.flatMap(segment => [segment.first, segment.second]);
  const tolerance = linearTolerance3D(endpoints, options);
  const points: Vector3Like[] = [];
  const coplanarSegmentIndexes: number[] = [];
  segments.forEach((segment, index) => {
    const intersection = intersectSegmentPlane3D(segment.first, segment.second, plane, options);
    if (intersection.kind === 'point') points.push(intersection.point);
    if (intersection.kind === 'coplanar') {
      coplanarSegmentIndexes.push(index);
      points.push(copy3(segment.first), copy3(segment.second));
    }
  });
  return { points: deduplicatePoints3D(points, tolerance), coplanarSegmentIndexes, tolerance };
}

/**
 * Intersect a closed polygon mesh with a plane and recover its boundary loops
 * from face/edge connectivity. Unlike a centroid-angle sort, this preserves
 * concavity and reports disconnected or degenerate topology explicitly.
 */
export function crossSectionSolidMesh3D(
  pointsById: Readonly<Record<string, Vector3Like>>,
  faces: readonly SolidMeshFaceInput[],
  plane: Plane3DLike,
  options: GeometryToleranceOptions = {},
): CrossSectionTopology3D {
  const usedPointIds = new Set(faces.flatMap(face => [...face.pointIds]));
  const usedPoints = [...usedPointIds].flatMap(pointId => {
    const point = pointsById[pointId];
    return point && isFiniteVector3(point) ? [point] : [];
  });
  const tolerance = linearTolerance3D(usedPoints, options);
  const inputIssues = validateCrossSectionMeshInput(pointsById, faces, plane, options);
  if (inputIssues.length > 0) {
    return { status: 'invalid_input', loops: [], issues: inputIssues, tolerance };
  }

  const normalLength = length3(plane.normal);
  // The validation above guarantees a finite, non-zero normal.
  const normalizedPlane: Plane3DLike = {
    normal: scale3(plane.normal, 1 / normalLength),
    d: plane.d / normalLength,
  };
  const signedDistance = (point: Vector3Like): number => dot3(normalizedPlane.normal, point) + normalizedPlane.d;
  const coplanarFaceIndexes = new Set<number>();
  const faceDistances = faces.map((face, faceIndex) => {
    const distances = face.pointIds.map(pointId => signedDistance(pointsById[pointId] as Vector3Like));
    if (distances.every(distance => Math.abs(distance) <= tolerance)) coplanarFaceIndexes.add(faceIndex);
    return distances;
  });

  const segments: RawCrossSectionSegment3D[] = [];
  let hadPlaneContact = false;
  let numericalAmbiguity = false;

  // A set of coplanar faces is a planar patch. Only mesh edges on the patch
  // boundary belong to the section; edges shared by two coplanar faces are
  // internal triangulation/subdivision edges and must disappear.
  const edgeOccurrences = collectEdgeOccurrences(faces);
  for (const occurrences of edgeOccurrences.values()) {
    const coplanarCount = occurrences.filter(occurrence => coplanarFaceIndexes.has(occurrence.faceIndex)).length;
    if (coplanarCount !== 1) continue;
    const pointIds = occurrences[0]?.pointIds;
    if (!pointIds) continue;
    const first = pointsById[pointIds[0]];
    const second = pointsById[pointIds[1]];
    if (!first || !second) continue;
    hadPlaneContact = true;
    segments.push({ first: copy3(first), second: copy3(second) });
  }

  const orderedFaces = faces
    .map((face, faceIndex) => ({ face, faceIndex }))
    .sort((first, second) => compareCodeUnits(first.face.id, second.face.id) || first.faceIndex - second.faceIndex);
  for (const { face, faceIndex } of orderedFaces) {
    if (coplanarFaceIndexes.has(faceIndex)) {
      hadPlaneContact = true;
      continue;
    }
    const facePoints = face.pointIds.map(pointId => pointsById[pointId] as Vector3Like);
    const result = intersectFaceWithPlane3D(
      facePoints,
      faceDistances[faceIndex] as readonly number[],
      normalizedPlane.normal,
      tolerance,
    );
    hadPlaneContact ||= result.hadContact;
    numericalAmbiguity ||= result.numericalAmbiguity;
    segments.push(...result.segments);
  }

  if (numericalAmbiguity) {
    return {
      status: 'unsupported_topology',
      loops: [],
      tolerance,
      issues: [{
        code: 'numerical_ambiguity',
        message: 'The cutting plane is tolerance-parallel to a face while touching only part of it.',
      }],
    };
  }

  const graph = buildCrossSectionGraph3D(segments, normalizedPlane, tolerance);
  if (graph.edges.length === 0) {
    return hadPlaneContact
      ? {
        status: 'unsupported_topology',
        loops: [],
        tolerance,
        issues: [{
          code: 'lower_dimensional_section',
          message: 'The plane touches the mesh only at isolated points; no polygon loop exists.',
        }],
      }
      : { status: 'empty', loops: [], issues: [], tolerance };
  }

  const degrees = graph.nodes.map(() => 0);
  for (const [first, second] of graph.edges) {
    degrees[first] = (degrees[first] ?? 0) + 1;
    degrees[second] = (degrees[second] ?? 0) + 1;
  }
  if (degrees.some(degree => degree < 2)) {
    return {
      status: 'unsupported_topology',
      loops: [],
      tolerance,
      issues: [{
        code: 'open_section',
        message: 'The section contains an open or lower-dimensional chain instead of a closed polygon.',
      }],
    };
  }
  if (degrees.some(degree => degree > 2)) {
    return {
      status: 'unsupported_topology',
      loops: [],
      tolerance,
      issues: [{
        code: 'branched_section',
        message: 'The section branches at a vertex and cannot be represented as disjoint polygon loops.',
      }],
    };
  }

  const loopIndexes = traceCrossSectionLoops(graph.nodes, graph.edges);
  const loops: CrossSectionLoop3D[] = [];
  for (const indexes of loopIndexes) {
    let points = indexes.map(index => graph.nodes[index] as Vector3Like);
    if (points.length < 3) {
      return unsupportedDegenerateCrossSection(tolerance, 'A section loop has fewer than three distinct vertices.');
    }
    const areaVector = newellAreaVector3D(points);
    const orientedDoubleArea = dot3(areaVector, normalizedPlane.normal);
    const areaTolerance = tolerance * Math.max(geometryScale3D(points), tolerance);
    if (!Number.isFinite(orientedDoubleArea) || Math.abs(orientedDoubleArea) <= 2 * areaTolerance) {
      return unsupportedDegenerateCrossSection(tolerance, 'A section loop has zero or tolerance-scale area.');
    }
    if (orientedDoubleArea < 0) points = [points[0] as Vector3Like, ...points.slice(1).reverse()];
    const analysis = analyzePolygon3D(points, options);
    if (!analysis.valid) {
      return unsupportedDegenerateCrossSection(tolerance, 'A section loop is non-planar, self-intersecting, or degenerate.');
    }
    loops.push({
      points,
      area: analysis.area,
      perimeter: polygonPerimeter3D(points),
    });
  }
  loops.sort((first, second) => compareVector3(first.points[0] as Vector3Like, second.points[0] as Vector3Like));
  return {
    status: loops.length === 1 ? 'single_loop' : 'multiple_loops',
    loops,
    issues: [],
    tolerance,
  };
}

/** Deduplicate coordinates without a fixed world-unit epsilon. */
export function deduplicatePoints3D(
  points: readonly Vector3Like[],
  toleranceOrOptions: number | GeometryToleranceOptions = {},
): Vector3Like[] {
  const tolerance = typeof toleranceOrOptions === 'number'
    ? Math.max(0, toleranceOrOptions)
    : linearTolerance3D(points, toleranceOrOptions);
  const unique: Vector3Like[] = [];
  for (const point of points) {
    if (!unique.some(candidate => distance3(candidate, point) <= tolerance)) unique.push(copy3(point));
  }
  return unique;
}

interface Vector2Like {
  readonly x: number;
  readonly y: number;
}

interface EdgeOccurrence {
  readonly faceIndex: number;
  readonly direction: 1 | -1;
  readonly pointIds: [string, string];
}

interface FaceOrientation {
  readonly conflict: boolean;
  readonly multipliers: readonly (1 | -1)[];
  readonly components: readonly (readonly number[])[];
}

interface SolidMeshEdge3D {
  readonly pointIds: readonly [string, string];
  readonly first: Vector3Like;
  readonly second: Vector3Like;
  readonly faceIndexes: ReadonlySet<number>;
}

interface SolidMeshIntersection3D {
  readonly edgePointIds: readonly [string, string];
  readonly faceId?: string;
}

interface RawCrossSectionSegment3D {
  readonly first: Vector3Like;
  readonly second: Vector3Like;
}

interface FacePlaneIntersection3D {
  readonly segments: readonly RawCrossSectionSegment3D[];
  readonly hadContact: boolean;
  readonly numericalAmbiguity: boolean;
}

interface CrossSectionGraph3D {
  readonly nodes: readonly Vector3Like[];
  readonly edges: readonly (readonly [number, number])[];
}

function validateCrossSectionMeshInput(
  pointsById: Readonly<Record<string, Vector3Like>>,
  faces: readonly SolidMeshFaceInput[],
  plane: Plane3DLike,
  options: GeometryToleranceOptions,
): CrossSectionTopologyIssue3D[] {
  const issues: CrossSectionTopologyIssue3D[] = [];
  if (!isFinitePlane(plane) || length3(plane.normal) === 0) {
    issues.push({ code: 'invalid_plane', message: 'The cutting plane must have a finite, non-zero normal.' });
  }
  if (faces.length === 0) issues.push({ code: 'no_faces', message: 'A closed mesh needs at least one face.' });

  const faceIds = new Set<string>();
  for (const face of faces) {
    if (faceIds.has(face.id)) {
      issues.push({ code: 'duplicate_face_id', faceId: face.id, message: `Face id "${face.id}" is duplicated.` });
    }
    faceIds.add(face.id);
    if (face.pointIds.length < 3 || new Set(face.pointIds).size !== face.pointIds.length) {
      issues.push({
        code: 'invalid_face',
        faceId: face.id,
        message: `Face "${face.id}" must contain at least three distinct point ids.`,
      });
      continue;
    }
    const facePoints: Vector3Like[] = [];
    for (const pointId of face.pointIds) {
      const point = pointsById[pointId];
      if (!point) {
        issues.push({
          code: 'missing_vertex',
          faceId: face.id,
          pointId,
          message: `Face "${face.id}" references missing point "${pointId}".`,
        });
      } else if (!isFiniteVector3(point)) {
        issues.push({
          code: 'non_finite_vertex',
          faceId: face.id,
          pointId,
          message: `Point "${pointId}" contains a non-finite coordinate.`,
        });
      } else {
        facePoints.push(point);
      }
    }
    if (facePoints.length !== face.pointIds.length) continue;
    const analysis = analyzePolygon3D(facePoints, options);
    if (!analysis.valid) {
      issues.push({
        code: 'invalid_face',
        faceId: face.id,
        message: `Face "${face.id}" is non-planar, self-intersecting, or degenerate.`,
      });
    }
  }

  for (const occurrences of collectEdgeOccurrences(faces).values()) {
    const pointIds = occurrences[0]?.pointIds;
    if (!pointIds) continue;
    if (occurrences.length === 1) {
      issues.push({
        code: 'open_mesh_edge',
        edgePointIds: pointIds,
        message: `Mesh edge "${pointIds.join(' - ')}" belongs to only one face.`,
      });
    } else if (occurrences.length !== 2) {
      issues.push({
        code: 'non_manifold_mesh_edge',
        edgePointIds: pointIds,
        message: `Mesh edge "${pointIds.join(' - ')}" belongs to ${occurrences.length} faces.`,
      });
    }
  }
  return issues;
}

function intersectFaceWithPlane3D(
  facePoints: readonly Vector3Like[],
  distances: readonly number[],
  planeNormal: Vector3Like,
  tolerance: number,
): FacePlaneIntersection3D {
  const candidates: Vector3Like[] = [];
  for (let index = 0; index < facePoints.length; index += 1) {
    const current = facePoints[index] as Vector3Like;
    const next = facePoints[(index + 1) % facePoints.length] as Vector3Like;
    const currentDistance = distances[index] as number;
    const nextDistance = distances[(index + 1) % facePoints.length] as number;
    const currentOnPlane = Math.abs(currentDistance) <= tolerance;
    const nextOnPlane = Math.abs(nextDistance) <= tolerance;
    if (currentOnPlane) candidates.push(copy3(current));
    if (!currentOnPlane && !nextOnPlane && (currentDistance > 0) !== (nextDistance > 0)) {
      const parameter = currentDistance / (currentDistance - nextDistance);
      candidates.push(add3(current, scale3(subtract3(next, current), parameter)));
    }
  }
  const unique = deduplicatePoints3D(candidates, tolerance);
  if (unique.length < 2) {
    return { segments: [], hadContact: unique.length > 0, numericalAmbiguity: false };
  }

  const faceNormal = normalize3(newellAreaVector3D(facePoints), 0);
  const lineDirection = faceNormal ? cross3(faceNormal, planeNormal) : vector3(0, 0, 0);
  const lineLength = length3(lineDirection);
  if (!faceNormal || lineLength <= DEFAULT_RELATIVE_TOLERANCE + Number.EPSILON * DEFAULT_ULPS) {
    return { segments: [], hadContact: true, numericalAmbiguity: true };
  }
  const unitLine = scale3(lineDirection, 1 / lineLength);
  unique.sort((first, second) => dot3(first, unitLine) - dot3(second, unitLine) || compareVector3(first, second));
  const projectedFace = facePoints.map(point => projectDominant2D(point, faceNormal));
  const segments: RawCrossSectionSegment3D[] = [];
  for (let index = 0; index < unique.length - 1; index += 1) {
    const first = unique[index] as Vector3Like;
    const second = unique[index + 1] as Vector3Like;
    if (distance3(first, second) <= tolerance) continue;
    const midpoint = scale3(add3(first, second), 0.5);
    if (pointInPolygonInclusive2D(projectDominant2D(midpoint, faceNormal), projectedFace, tolerance)) {
      segments.push({ first, second });
    }
  }
  return { segments, hadContact: true, numericalAmbiguity: false };
}

function buildCrossSectionGraph3D(
  inputSegments: readonly RawCrossSectionSegment3D[],
  plane: Plane3DLike,
  tolerance: number,
): CrossSectionGraph3D {
  const segments = inputSegments.filter(segment => distance3(segment.first, segment.second) > tolerance);
  const endpoints = segments.flatMap(segment => [segment.first, segment.second]);
  const parent = endpoints.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while ((parent[root] as number) !== root) root = parent[root] as number;
    while ((parent[index] as number) !== index) {
      const next = parent[index] as number;
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const union = (first: number, second: number): void => {
    const firstRoot = find(first);
    const secondRoot = find(second);
    if (firstRoot === secondRoot) return;
    parent[Math.max(firstRoot, secondRoot)] = Math.min(firstRoot, secondRoot);
  };
  for (let first = 0; first < endpoints.length; first += 1) {
    for (let second = first + 1; second < endpoints.length; second += 1) {
      if (distance3(endpoints[first] as Vector3Like, endpoints[second] as Vector3Like) <= tolerance) union(first, second);
    }
  }

  const indexesByRoot = new Map<number, number[]>();
  endpoints.forEach((_, index) => {
    const root = find(index);
    const existing = indexesByRoot.get(root);
    if (existing) existing.push(index);
    else indexesByRoot.set(root, [index]);
  });
  const clusters = [...indexesByRoot.entries()].map(([root, indexes]) => {
    const sortedPoints = indexes.map(index => endpoints[index] as Vector3Like).sort(compareVector3);
    const average = scale3(sortedPoints.reduce<Vector3Like>((sum, point) => add3(sum, point), vector3(0, 0, 0)), 1 / sortedPoints.length);
    const planeDistance = dot3(plane.normal, average) + plane.d;
    return { root, point: subtract3(average, scale3(plane.normal, planeDistance)) };
  }).sort((first, second) => compareVector3(first.point, second.point));
  const nodeByRoot = new Map(clusters.map((cluster, index) => [cluster.root, index]));
  const edgeKeys = new Set<string>();
  const edges: Array<readonly [number, number]> = [];
  segments.forEach((_, segmentIndex) => {
    const first = nodeByRoot.get(find(segmentIndex * 2));
    const second = nodeByRoot.get(find(segmentIndex * 2 + 1));
    if (first === undefined || second === undefined || first === second) return;
    const ordered: readonly [number, number] = first < second ? [first, second] : [second, first];
    const key = `${ordered[0]}:${ordered[1]}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push(ordered);
  });
  edges.sort((first, second) => first[0] - second[0] || first[1] - second[1]);
  return { nodes: clusters.map(cluster => cluster.point), edges };
}

function traceCrossSectionLoops(
  nodes: readonly Vector3Like[],
  edges: readonly (readonly [number, number])[],
): number[][] {
  const adjacency = nodes.map(() => [] as number[]);
  for (const [first, second] of edges) {
    adjacency[first]?.push(second);
    adjacency[second]?.push(first);
  }
  adjacency.forEach(neighbors => neighbors.sort((first, second) => first - second));
  const visited = new Set<number>();
  const loops: number[][] = [];
  for (let start = 0; start < nodes.length; start += 1) {
    if (visited.has(start) || adjacency[start]?.length !== 2) continue;
    const loop: number[] = [];
    let previous = -1;
    let current = start;
    do {
      if (visited.has(current) && current !== start) return [];
      visited.add(current);
      loop.push(current);
      const neighbors = adjacency[current] as number[];
      const next = previous < 0 || neighbors[0] !== previous ? neighbors[0] as number : neighbors[1] as number;
      previous = current;
      current = next;
    } while (current !== start);
    loops.push(loop);
  }
  return loops;
}

function pointInPolygonInclusive2D(
  point: Vector2Like,
  polygon: readonly Vector2Like[],
  tolerance: number,
): boolean {
  let inside = false;
  for (let index = 0; index < polygon.length; index += 1) {
    const first = polygon[index] as Vector2Like;
    const second = polygon[(index + 1) % polygon.length] as Vector2Like;
    if (distancePointToSegment2D(point, first, second) <= tolerance) return true;
    if ((first.y > point.y) !== (second.y > point.y)) {
      const crossingX = first.x + (point.y - first.y) * (second.x - first.x) / (second.y - first.y);
      if (crossingX > point.x) inside = !inside;
    }
  }
  return inside;
}

function distancePointToSegment2D(point: Vector2Like, first: Vector2Like, second: Vector2Like): number {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const denominator = dx * dx + dy * dy;
  if (denominator === 0) return distance2(point, first);
  const parameter = Math.max(0, Math.min(1, ((point.x - first.x) * dx + (point.y - first.y) * dy) / denominator));
  return Math.hypot(point.x - (first.x + parameter * dx), point.y - (first.y + parameter * dy));
}

function polygonPerimeter3D(points: readonly Vector3Like[]): number {
  const lengths = points.map((point, index) => distance3(point, points[(index + 1) % points.length] as Vector3Like));
  return compensatedSum(lengths);
}

function compareVector3(first: Vector3Like, second: Vector3Like): number {
  return first.x - second.x || first.y - second.y || first.z - second.z;
}

function unsupportedDegenerateCrossSection(tolerance: number, message: string): CrossSectionTopology3D {
  return {
    status: 'unsupported_topology',
    loops: [],
    tolerance,
    issues: [{ code: 'degenerate_loop', message }],
  };
}

function collectEdgeOccurrences(faces: readonly SolidMeshFaceInput[]): Map<string, EdgeOccurrence[]> {
  const occurrences = new Map<string, EdgeOccurrence[]>();
  faces.forEach((face, faceIndex) => {
    for (let index = 0; index < face.pointIds.length; index += 1) {
      const start = face.pointIds[index];
      const end = face.pointIds[(index + 1) % face.pointIds.length];
      if (start === undefined || end === undefined) continue;
      const [first, second] = orderedPair(start, end);
      const occurrence: EdgeOccurrence = {
        faceIndex,
        direction: start === first ? 1 : -1,
        pointIds: [first, second],
      };
      const key = solidEdgeKey(first, second);
      const existing = occurrences.get(key);
      if (existing) existing.push(occurrence);
      else occurrences.set(key, [occurrence]);
    }
  });
  return occurrences;
}

function orientFaceComponents(
  faces: readonly SolidMeshFaceInput[],
  occurrences: ReadonlyMap<string, readonly EdgeOccurrence[]>,
): FaceOrientation {
  const adjacency: Array<Array<{ faceIndex: number; factor: 1 | -1 }>> = faces.map(() => []);
  for (const edgeOccurrences of occurrences.values()) {
    if (edgeOccurrences.length !== 2) continue;
    const first = edgeOccurrences[0] as EdgeOccurrence;
    const second = edgeOccurrences[1] as EdgeOccurrence;
    const factor = (-first.direction * second.direction) as 1 | -1;
    adjacency[first.faceIndex]?.push({ faceIndex: second.faceIndex, factor });
    adjacency[second.faceIndex]?.push({ faceIndex: first.faceIndex, factor });
  }

  const multipliers: Array<1 | -1 | undefined> = Array.from({ length: faces.length });
  const components: number[][] = [];
  let conflict = false;
  for (let start = 0; start < faces.length; start += 1) {
    if (multipliers[start] !== undefined) continue;
    multipliers[start] = 1;
    const component: number[] = [];
    const queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const faceIndex = queue[cursor] as number;
      component.push(faceIndex);
      const multiplier = multipliers[faceIndex] as 1 | -1;
      for (const neighbor of adjacency[faceIndex] ?? []) {
        const expected = (multiplier * neighbor.factor) as 1 | -1;
        if (multipliers[neighbor.faceIndex] === undefined) {
          multipliers[neighbor.faceIndex] = expected;
          queue.push(neighbor.faceIndex);
        } else if (multipliers[neighbor.faceIndex] !== expected) {
          conflict = true;
        }
      }
    }
    components.push(component);
  }
  return { conflict, multipliers: multipliers.map(value => value ?? 1), components };
}

function orientFaceComponentsOutward(
  pointsById: Readonly<Record<string, Vector3Like>>,
  faces: readonly SolidMeshFaceInput[],
  orientation: FaceOrientation,
): FaceOrientation {
  const multipliers = [...orientation.multipliers];
  for (const component of orientation.components) {
    const signedVolume = signedComponentVolumeFromOrientation(pointsById, faces, multipliers, component);
    if (!(signedVolume < 0)) continue;
    for (const faceIndex of component) {
      multipliers[faceIndex] = (-(multipliers[faceIndex] as 1 | -1)) as 1 | -1;
    }
  }
  return { ...orientation, multipliers };
}

function closedMeshVolumeFromOrientation(
  pointsById: Readonly<Record<string, Vector3Like>>,
  faces: readonly SolidMeshFaceInput[],
  multipliers: readonly (1 | -1)[],
  components: readonly (readonly number[])[],
): number {
  let totalVolume = 0;
  for (const component of components) {
    totalVolume += Math.abs(signedComponentVolumeFromOrientation(pointsById, faces, multipliers, component));
  }
  return totalVolume;
}

function signedComponentVolumeFromOrientation(
  pointsById: Readonly<Record<string, Vector3Like>>,
  faces: readonly SolidMeshFaceInput[],
  multipliers: readonly (1 | -1)[],
  component: readonly number[],
): number {
  const componentPointIds = new Set<string>();
  for (const faceIndex of component) {
    for (const pointId of faces[faceIndex]?.pointIds ?? []) componentPointIds.add(pointId);
  }
  const componentPoints = [...componentPointIds].flatMap(pointId => {
    const point = pointsById[pointId];
    return point ? [point] : [];
  });
  const reference = centroid3(componentPoints);
  const terms: number[] = [];
  for (const faceIndex of component) {
    const face = faces[faceIndex];
    if (!face || face.pointIds.length < 3) continue;
    const anchorPoint = pointsById[face.pointIds[0] as string];
    if (!anchorPoint) continue;
    const anchor = subtract3(anchorPoint, reference);
    for (let index = 1; index < face.pointIds.length - 1; index += 1) {
      const secondPoint = pointsById[face.pointIds[index] as string];
      const thirdPoint = pointsById[face.pointIds[index + 1] as string];
      if (!secondPoint || !thirdPoint) continue;
      const second = subtract3(secondPoint, reference);
      const third = subtract3(thirdPoint, reference);
      terms.push((multipliers[faceIndex] as 1 | -1) * dot3(anchor, cross3(second, third)) / 6);
    }
  }
  return compensatedSum(terms);
}

function firstMeshSelfIntersection3D(
  pointsById: Readonly<Record<string, Vector3Like>>,
  faces: readonly SolidMeshFaceInput[],
  occurrences: ReadonlyMap<string, readonly EdgeOccurrence[]>,
  tolerance: number,
): SolidMeshIntersection3D | null {
  const edges = [...occurrences.entries()]
    .sort((first, second) => compareCodeUnits(first[0], second[0]))
    .flatMap(([, edgeOccurrences]): SolidMeshEdge3D[] => {
      const pointIds = edgeOccurrences[0]?.pointIds;
      if (!pointIds) return [];
      const first = pointsById[pointIds[0]];
      const second = pointsById[pointIds[1]];
      if (!first || !second) return [];
      return [{
        pointIds,
        first,
        second,
        faceIndexes: new Set(edgeOccurrences.map(occurrence => occurrence.faceIndex)),
      }];
    });

  for (let firstIndex = 0; firstIndex < edges.length; firstIndex += 1) {
    const first = edges[firstIndex] as SolidMeshEdge3D;
    for (let secondIndex = firstIndex + 1; secondIndex < edges.length; secondIndex += 1) {
      const second = edges[secondIndex] as SolidMeshEdge3D;
      if (first.pointIds.some(pointId => second.pointIds.includes(pointId))) continue;
      if ([...first.faceIndexes].some(faceIndex => second.faceIndexes.has(faceIndex))) continue;
      if (!boundingBoxesOverlap3D(first.first, first.second, second.first, second.second, tolerance)) continue;
      if (distanceBetweenSegments3D(first.first, first.second, second.first, second.second) <= tolerance) {
        return { edgePointIds: first.pointIds };
      }
    }
  }

  for (const edge of edges) {
    for (let faceIndex = 0; faceIndex < faces.length; faceIndex += 1) {
      if (edge.faceIndexes.has(faceIndex)) continue;
      const face = faces[faceIndex];
      if (!face) continue;
      const facePoints = face.pointIds.flatMap(pointId => {
        const point = pointsById[pointId];
        return point ? [point] : [];
      });
      if (facePoints.length !== face.pointIds.length) continue;
      if (segmentIntersectsNonincidentFace3D(edge, face, facePoints, tolerance)) {
        return { edgePointIds: edge.pointIds, faceId: face.id };
      }
    }
  }
  return null;
}

function segmentIntersectsNonincidentFace3D(
  edge: SolidMeshEdge3D,
  face: SolidMeshFaceInput,
  facePoints: readonly Vector3Like[],
  tolerance: number,
): boolean {
  const normal = representativePolygonNormal(facePoints, tolerance);
  const origin = facePoints[0];
  if (!normal || !origin) return false;
  const firstDistance = dot3(normal, subtract3(edge.first, origin));
  const secondDistance = dot3(normal, subtract3(edge.second, origin));
  if ((firstDistance > tolerance && secondDistance > tolerance)
    || (firstDistance < -tolerance && secondDistance < -tolerance)) return false;

  const projectedFace = facePoints.map(point => projectDominant2D(point, normal));
  const pointTouchesFace = (point: Vector3Like): boolean => pointInPolygonInclusive2D(
    projectDominant2D(point, normal),
    projectedFace,
    tolerance,
  );
  const firstOnPlane = Math.abs(firstDistance) <= tolerance;
  const secondOnPlane = Math.abs(secondDistance) <= tolerance;
  if (firstOnPlane && secondOnPlane) {
    if (!face.pointIds.includes(edge.pointIds[0]) && pointTouchesFace(edge.first)) return true;
    if (!face.pointIds.includes(edge.pointIds[1]) && pointTouchesFace(edge.second)) return true;
    const midpoint = scale3(add3(edge.first, edge.second), 0.5);
    return pointTouchesFace(midpoint);
  }

  const denominator = firstDistance - secondDistance;
  if (denominator === 0) return false;
  const parameter = firstDistance / denominator;
  if (parameter < 0 || parameter > 1) return false;
  const edgeLength = distance3(edge.first, edge.second);
  const parameterTolerance = edgeLength > 0 ? Math.min(0.25, tolerance / edgeLength) : 0.25;
  if (parameter <= parameterTolerance && face.pointIds.includes(edge.pointIds[0])) return false;
  if (parameter >= 1 - parameterTolerance && face.pointIds.includes(edge.pointIds[1])) return false;
  return pointTouchesFace(add3(edge.first, scale3(subtract3(edge.second, edge.first), parameter)));
}

function boundingBoxesOverlap3D(
  firstStart: Vector3Like,
  firstEnd: Vector3Like,
  secondStart: Vector3Like,
  secondEnd: Vector3Like,
  tolerance: number,
): boolean {
  return Math.max(Math.min(firstStart.x, firstEnd.x), Math.min(secondStart.x, secondEnd.x))
      <= Math.min(Math.max(firstStart.x, firstEnd.x), Math.max(secondStart.x, secondEnd.x)) + tolerance
    && Math.max(Math.min(firstStart.y, firstEnd.y), Math.min(secondStart.y, secondEnd.y))
      <= Math.min(Math.max(firstStart.y, firstEnd.y), Math.max(secondStart.y, secondEnd.y)) + tolerance
    && Math.max(Math.min(firstStart.z, firstEnd.z), Math.min(secondStart.z, secondEnd.z))
      <= Math.min(Math.max(firstStart.z, firstEnd.z), Math.max(secondStart.z, secondEnd.z)) + tolerance;
}

function distanceBetweenSegments3D(
  firstStart: Vector3Like,
  firstEnd: Vector3Like,
  secondStart: Vector3Like,
  secondEnd: Vector3Like,
): number {
  const firstDirection = subtract3(firstEnd, firstStart);
  const secondDirection = subtract3(secondEnd, secondStart);
  const offset = subtract3(firstStart, secondStart);
  const firstLengthSquared = dot3(firstDirection, firstDirection);
  const secondLengthSquared = dot3(secondDirection, secondDirection);
  const secondOffset = dot3(secondDirection, offset);
  if (firstLengthSquared === 0 && secondLengthSquared === 0) return distance3(firstStart, secondStart);

  let firstParameter = 0;
  let secondParameter = 0;
  if (firstLengthSquared === 0) {
    secondParameter = clamp01(secondOffset / secondLengthSquared);
  } else {
    const firstOffset = dot3(firstDirection, offset);
    if (secondLengthSquared === 0) {
      firstParameter = clamp01(-firstOffset / firstLengthSquared);
    } else {
      const directionsDot = dot3(firstDirection, secondDirection);
      const denominator = firstLengthSquared * secondLengthSquared - directionsDot * directionsDot;
      if (denominator > 0) {
        firstParameter = clamp01((directionsDot * secondOffset - firstOffset * secondLengthSquared) / denominator);
      }
      secondParameter = (directionsDot * firstParameter + secondOffset) / secondLengthSquared;
      if (secondParameter < 0) {
        secondParameter = 0;
        firstParameter = clamp01(-firstOffset / firstLengthSquared);
      } else if (secondParameter > 1) {
        secondParameter = 1;
        firstParameter = clamp01((directionsDot - firstOffset) / firstLengthSquared);
      }
    }
  }
  const firstClosest = add3(firstStart, scale3(firstDirection, firstParameter));
  const secondClosest = add3(secondStart, scale3(secondDirection, secondParameter));
  return distance3(firstClosest, secondClosest);
}

function edgePairsFromFaces(faces: readonly SolidMeshFaceInput[]): Map<string, [string, string]> {
  const pairs = new Map<string, [string, string]>();
  for (const face of faces) {
    for (let index = 0; index < face.pointIds.length; index += 1) {
      const start = face.pointIds[index];
      const end = face.pointIds[(index + 1) % face.pointIds.length];
      if (start === undefined || end === undefined || start === end) continue;
      const pair = orderedPair(start, end);
      pairs.set(solidEdgeKey(pair[0], pair[1]), pair);
    }
  }
  return pairs;
}

function representativePolygonNormal(points: readonly Vector3Like[], tolerance: number): Vector3Like | null {
  const scale = geometryScale3D(points);
  const minimumAreaVector = 2 * tolerance * Math.max(scale, tolerance);
  const newell = normalize3(newellAreaVector3D(points), minimumAreaVector);
  if (newell) return newell;
  if (points.length < 3) return null;
  const anchor = points[0] as Vector3Like;
  let strongest = vector3(0, 0, 0);
  let strongestLength = 0;
  for (let firstIndex = 1; firstIndex < points.length - 1; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
      const candidate = cross3(
        subtract3(points[firstIndex] as Vector3Like, anchor),
        subtract3(points[secondIndex] as Vector3Like, anchor),
      );
      const candidateLength = length3(candidate);
      if (candidateLength > strongestLength) {
        strongest = candidate;
        strongestLength = candidateLength;
      }
    }
  }
  return normalize3(strongest, minimumAreaVector);
}

function projectDominant2D(point: Vector3Like, normal: Vector3Like): Vector2Like {
  const absX = Math.abs(normal.x);
  const absY = Math.abs(normal.y);
  const absZ = Math.abs(normal.z);
  if (absX >= absY && absX >= absZ) return { x: point.y, y: point.z };
  if (absY >= absZ) return { x: point.x, y: point.z };
  return { x: point.x, y: point.y };
}

function edgesAreAdjacent(firstIndex: number, secondIndex: number, count: number): boolean {
  return firstIndex === secondIndex
    || (firstIndex + 1) % count === secondIndex
    || (secondIndex + 1) % count === firstIndex;
}

function segmentsIntersect2D(
  firstStart: Vector2Like,
  firstEnd: Vector2Like,
  secondStart: Vector2Like,
  secondEnd: Vector2Like,
  tolerance: number,
): boolean {
  const firstSecond = orientation2D(firstStart, firstEnd, secondStart);
  const firstFourth = orientation2D(firstStart, firstEnd, secondEnd);
  const secondFirst = orientation2D(secondStart, secondEnd, firstStart);
  const secondThird = orientation2D(secondStart, secondEnd, firstEnd);
  const firstTolerance = tolerance * Math.max(distance2(firstStart, firstEnd), tolerance);
  const secondTolerance = tolerance * Math.max(distance2(secondStart, secondEnd), tolerance);
  const firstSecondSign = toleranceSign(firstSecond, firstTolerance);
  const firstFourthSign = toleranceSign(firstFourth, firstTolerance);
  const secondFirstSign = toleranceSign(secondFirst, secondTolerance);
  const secondThirdSign = toleranceSign(secondThird, secondTolerance);
  if (firstSecondSign * firstFourthSign < 0 && secondFirstSign * secondThirdSign < 0) return true;
  return (firstSecondSign === 0 && pointOnSegment2D(secondStart, firstStart, firstEnd, tolerance))
    || (firstFourthSign === 0 && pointOnSegment2D(secondEnd, firstStart, firstEnd, tolerance))
    || (secondFirstSign === 0 && pointOnSegment2D(firstStart, secondStart, secondEnd, tolerance))
    || (secondThirdSign === 0 && pointOnSegment2D(firstEnd, secondStart, secondEnd, tolerance));
}

function pointOnSegment2D(point: Vector2Like, start: Vector2Like, end: Vector2Like, tolerance: number): boolean {
  return point.x >= Math.min(start.x, end.x) - tolerance
    && point.x <= Math.max(start.x, end.x) + tolerance
    && point.y >= Math.min(start.y, end.y) - tolerance
    && point.y <= Math.max(start.y, end.y) + tolerance;
}

function orientation2D(first: Vector2Like, second: Vector2Like, third: Vector2Like): number {
  return (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x);
}

function distance2(first: Vector2Like, second: Vector2Like): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function toleranceSign(value: number, tolerance: number): -1 | 0 | 1 {
  if (value > tolerance) return 1;
  if (value < -tolerance) return -1;
  return 0;
}

function hasDuplicatePoint(points: readonly Vector3Like[], tolerance: number): boolean {
  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      if (distance3(points[first] as Vector3Like, points[second] as Vector3Like) <= tolerance) return true;
    }
  }
  return false;
}

function orderedPair(first: string, second: string): [string, string] {
  return first <= second ? [first, second] : [second, first];
}

function compareCodeUnits(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function compensatedSum(values: readonly number[]): number {
  let sum = 0;
  let correction = 0;
  for (const value of values) {
    const adjusted = value - correction;
    const next = sum + adjusted;
    correction = (next - sum) - adjusted;
    sum = next;
  }
  return sum;
}

function finiteNonNegative(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function isFiniteVector3(vector: Vector3Like): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

function isFinitePlane(plane: Plane3DLike): boolean {
  return isFiniteVector3(plane.normal) && Number.isFinite(plane.d);
}

function vector3(x: number, y: number, z: number): Vector3Like {
  return { x, y, z };
}

function copy3(vector: Vector3Like): Vector3Like {
  return vector3(vector.x, vector.y, vector.z);
}

function centroid3(points: readonly Vector3Like[]): Vector3Like {
  if (points.length === 0) return vector3(0, 0, 0);
  return scale3(points.reduce<Vector3Like>((sum, point) => add3(sum, point), vector3(0, 0, 0)), 1 / points.length);
}

function add3(first: Vector3Like, second: Vector3Like): Vector3Like {
  return vector3(first.x + second.x, first.y + second.y, first.z + second.z);
}

function subtract3(first: Vector3Like, second: Vector3Like): Vector3Like {
  return vector3(first.x - second.x, first.y - second.y, first.z - second.z);
}

function scale3(vector: Vector3Like, scale: number): Vector3Like {
  return vector3(vector.x * scale, vector.y * scale, vector.z * scale);
}

function dot3(first: Vector3Like, second: Vector3Like): number {
  return first.x * second.x + first.y * second.y + first.z * second.z;
}

function cross3(first: Vector3Like, second: Vector3Like): Vector3Like {
  return vector3(
    first.y * second.z - first.z * second.y,
    first.z * second.x - first.x * second.z,
    first.x * second.y - first.y * second.x,
  );
}

function length3(vector: Vector3Like): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function distance3(first: Vector3Like, second: Vector3Like): number {
  return length3(subtract3(second, first));
}

function normalize3(vector: Vector3Like, minimumLength: number): Vector3Like | null {
  const length = length3(vector);
  return Number.isFinite(length) && length > minimumLength ? scale3(vector, 1 / length) : null;
}
