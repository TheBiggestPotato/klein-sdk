import type { Vector2 } from '../core/index.js';
import { KleinSdkError } from '../core/index.js';
import type { AngleEntity, GeometryConicEquation, GeometryLineEquation, GeometryPoint2D, ParametricCurveEntity, PolygonEntity } from '../geometry-core/index.js';
import { distance2D, geometryCircumcircle2D } from '../geometry-core/index.js';
import { compileScalarExpression, conicEquationFromQuadratic, parabolaEquation } from './equations.js';
import { isPoint2D, point2D } from './scene.js';
import { finiteNumber, positiveNumber } from './snapshot.js';
import type { GeometryAngleOptions, GeometryCalculatorScene, GeometryConicOptions, GeometryParametricCurveOptions, GeometryShapeKind, GeometryTriangleClassification, ShapeCreationOptions, WorldBounds } from './types.js';

/** Measures an angle in degrees for point triple A-vertex-C. */
export function angleMeasureDegrees(a: Vector2, vertex: Vector2, c: Vector2): number {
  const first = { x: a.x - vertex.x, y: a.y - vertex.y };
  const second = { x: c.x - vertex.x, y: c.y - vertex.y };
  const denominator = Math.hypot(first.x, first.y) * Math.hypot(second.x, second.y);
  if (denominator < 1e-9) return 0;
  const cos = Math.max(-1, Math.min(1, (first.x * second.x + first.y * second.y) / denominator));
  return (Math.acos(cos) * 180) / Math.PI;
}


export function worldRectFromPoints(a: Vector2, b: Vector2): WorldBounds {
  return {
    minX: Math.min(a.x, b.x),
    maxX: Math.max(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxY: Math.max(a.y, b.y),
  };
}


export function rectContainsPoint(rect: WorldBounds, point: Vector2): boolean {
  return point.x >= rect.minX && point.x <= rect.maxX && point.y >= rect.minY && point.y <= rect.maxY;
}


export function segmentIntersectsRect(a: Vector2, b: Vector2, rect: WorldBounds): boolean {
  if (rectContainsPoint(rect, a) || rectContainsPoint(rect, b)) return true;
  const corners = [
    { x: rect.minX, y: rect.minY },
    { x: rect.maxX, y: rect.minY },
    { x: rect.maxX, y: rect.maxY },
    { x: rect.minX, y: rect.maxY },
  ];
  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index];
    const next = corners[(index + 1) % corners.length];
    if (current && next && segmentIntersection(a, b, current, next)) return true;
  }
  return false;
}


export function distanceToSegment(point: Vector2, a: Vector2, b: Vector2): number {
  return distance2D(point, nearestPointOnSegment(point, a, b));
}


export function nearestPointOnSegment(point: Vector2, a: Vector2, b: Vector2): Vector2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-12) return a;
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1);
  return { x: a.x + dx * t, y: a.y + dy * t };
}


export function distanceToRay(point: Vector2, a: Vector2, b: Vector2): number {
  return distance2D(point, nearestPointOnRay(point, a, b));
}


export function nearestPointOnRay(point: Vector2, a: Vector2, b: Vector2): Vector2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-12) return a;
  const t = Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared);
  return { x: a.x + dx * t, y: a.y + dy * t };
}


export function segmentIntersection(a: Vector2, b: Vector2, c: Vector2, d: Vector2): Vector2 | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const denominator = cross(r, s);
  if (Math.abs(denominator) < 1e-9) return null;
  const cma = { x: c.x - a.x, y: c.y - a.y };
  const t = cross(cma, s) / denominator;
  const u = cross(cma, r) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + r.x * t, y: a.y + r.y * t };
}


export function lineLineIntersection(first: GeometryLineEquation, second: GeometryLineEquation): Vector2 | null {
  const determinant = first.a * second.b - second.a * first.b;
  if (Math.abs(determinant) < 1e-9) return null;
  return {
    x: (first.b * second.c - second.b * first.c) / determinant,
    y: (second.a * first.c - first.a * second.c) / determinant,
  };
}


export function pointInPolygon(point: Vector2, polygon: Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const current = polygon[i];
    const previous = polygon[j];
    if (!current || !previous) continue;
    const intersects = ((current.y > point.y) !== (previous.y > point.y))
      && point.x < ((previous.x - current.x) * (point.y - current.y)) / ((previous.y - current.y) || 1e-9) + current.x;
    if (intersects) inside = !inside;
  }
  return inside;
}


export function polygonCentroid(points: Vector2[]): Vector2 {
  if (!points.length) return { x: 0, y: 0 };
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}


export function classifyTriangle(scene: GeometryCalculatorScene, polygon: PolygonEntity): GeometryTriangleClassification {
  if (polygon.pointIds.length !== 3) {
    throw new KleinSdkError('invalid_triangle', 'Triangle type detection needs a three-vertex polygon.');
  }
  const points = polygon.pointIds.map(id => point2D(scene, id)).filter(isPoint2D);
  if (points.length !== 3) {
    throw new KleinSdkError('invalid_triangle', 'Triangle vertices must be valid 2D points.');
  }
  const [a, b, c] = points as [GeometryPoint2D, GeometryPoint2D, GeometryPoint2D];
  const sideLengths: [number, number, number] = [
    distance2D(b, c),
    distance2D(a, c),
    distance2D(a, b),
  ];
  const angles: [number, number, number] = [
    angleMeasureDegrees(b, a, c),
    angleMeasureDegrees(a, b, c),
    angleMeasureDegrees(a, c, b),
  ];
  const area = Math.abs(cross({ x: b.x - a.x, y: b.y - a.y }, { x: c.x - a.x, y: c.y - a.y })) / 2;
  if (area <= 1e-9) {
    throw new KleinSdkError('invalid_triangle', 'Triangle vertices must be non-collinear.');
  }
  const equal01 = nearlyEqualNumber(sideLengths[0], sideLengths[1], 1e-6);
  const equal12 = nearlyEqualNumber(sideLengths[1], sideLengths[2], 1e-6);
  const equal02 = nearlyEqualNumber(sideLengths[0], sideLengths[2], 1e-6);
  const sideType = equal01 && equal12 ? 'equilateral' : equal01 || equal12 || equal02 ? 'isosceles' : 'scalene';
  const maxAngle = Math.max(...angles);
  const angleType = Math.abs(maxAngle - 90) <= 1e-5 ? 'right' : maxAngle > 90 ? 'obtuse' : 'acute';
  return { polygonId: polygon.id, sideType, angleType, sideLengths, angles, area };
}


export function isCyclicQuadrilateral(
  scene: GeometryCalculatorScene,
  polygon: PolygonEntity,
  tolerance: number,
): boolean {
  if (polygon.pointIds.length !== 4) {
    throw new KleinSdkError('invalid_quadrilateral', 'Cyclic checks need a four-vertex polygon.');
  }
  const points = polygon.pointIds.map(id => point2D(scene, id)).filter(isPoint2D);
  if (points.length !== 4) {
    throw new KleinSdkError('invalid_quadrilateral', 'Quadrilateral vertices must be valid 2D points.');
  }
  const [a, b, c, d] = points as [GeometryPoint2D, GeometryPoint2D, GeometryPoint2D, GeometryPoint2D];
  const circle = geometryCircumcircle2D(scene, [a.id, b.id, c.id]);
  if (!circle) return false;
  const delta = Math.abs(distance2D(circle.center, d) - circle.radius);
  return delta <= Math.max(1e-9, tolerance);
}


export function shapeCoordinates(kind: GeometryShapeKind, center: Vector2, options: ShapeCreationOptions): Vector2[] {
  const size = positiveNumber(options.size, positiveNumber(options.radius, 2));
  const width = positiveNumber(options.width, size * 1.6);
  const height = positiveNumber(options.height, size);
  switch (kind) {
    case 'triangle':
      return [
        { x: center.x, y: center.y + size },
        { x: center.x - size, y: center.y - size * 0.75 },
        { x: center.x + size, y: center.y - size * 0.75 },
      ];
    case 'rightTriangle':
      return [
        { x: center.x - size, y: center.y + size },
        { x: center.x - size, y: center.y - size },
        { x: center.x + size, y: center.y - size },
      ];
    case 'equilateralTriangle':
      return regularPolygonCoordinates(center, 3, size, -Math.PI / 2);
    case 'square':
      return [
        { x: center.x - size / 2, y: center.y - size / 2 },
        { x: center.x + size / 2, y: center.y - size / 2 },
        { x: center.x + size / 2, y: center.y + size / 2 },
        { x: center.x - size / 2, y: center.y + size / 2 },
      ];
    case 'rectangle':
      return [
        { x: center.x - width / 2, y: center.y - height / 2 },
        { x: center.x + width / 2, y: center.y - height / 2 },
        { x: center.x + width / 2, y: center.y + height / 2 },
        { x: center.x - width / 2, y: center.y + height / 2 },
      ];
    case 'regularPolygon':
      return regularPolygonCoordinates(center, clamp(Math.round(options.sides ?? 6), 3, 64), size, -Math.PI / 2);
    case 'parallelogram':
      return [
        { x: center.x - size * 0.8, y: center.y - size * 0.55 },
        { x: center.x + size * 0.9, y: center.y - size * 0.55 },
        { x: center.x + size * 0.55, y: center.y + size * 0.55 },
        { x: center.x - size * 1.15, y: center.y + size * 0.55 },
      ];
  }
}


export function regularPolygonCoordinates(center: Vector2, sides: number, radius: number, startAngle: number): Vector2[] {
  return Array.from({ length: sides }, (_, index) => {
    const angle = startAngle + (index * Math.PI * 2) / sides;
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
  });
}


export function sampleConic(options: GeometryConicOptions): {
  points: Vector2[];
  segments?: Vector2[][];
  closed?: boolean;
  equation?: GeometryConicEquation;
  center?: Vector2;
} {
  if (options.points) {
    const points = cleanFinitePoints(options.points, 'conic');
    if (points.length < 2) throw new KleinSdkError('invalid_conic', 'A conic needs at least two sampled points.');
    const result: {
      points: Vector2[];
      segments?: Vector2[][];
      closed?: boolean;
      equation?: GeometryConicEquation;
      center?: Vector2;
    } = { points };
    if (options.closed !== undefined) result.closed = options.closed;
    if (options.equation) result.equation = options.equation;
    if (options.center) result.center = { x: options.center.x, y: options.center.y };
    return result;
  }

  const samples = clamp(Math.round(options.samples ?? 96), 16, 512);
  const rotation = ((options.rotationDegrees ?? 0) * Math.PI) / 180;
  if (options.kind === 'ellipse') {
    const center = finiteVector(options.center ?? { x: 0, y: 0 }, 'conic center');
    const radiusX = positiveNumber(options.radiusX, 2);
    const radiusY = positiveNumber(options.radiusY, 1);
    const points = Array.from({ length: samples }, (_, index) => {
      const t = (index * Math.PI * 2) / samples;
      return rotateAroundOrigin({ x: Math.cos(t) * radiusX, y: Math.sin(t) * radiusY }, rotation, center);
    });
    return {
      points,
      closed: true,
      center,
      equation: conicEquationFromQuadratic(center, rotation, 1 / (radiusX * radiusX), 1 / (radiusY * radiusY), -1),
    };
  }

  if (options.kind === 'hyperbola') {
    const center = finiteVector(options.center ?? { x: 0, y: 0 }, 'conic center');
    const radiusX = positiveNumber(options.radiusX, 2);
    const radiusY = positiveNumber(options.radiusY, 1);
    const limit = 1.9;
    const branchSamples = Math.max(16, Math.floor(samples / 2));
    const makeBranch = (sign: -1 | 1): Vector2[] => Array.from({ length: branchSamples }, (_, index) => {
      const u = -limit + (index * limit * 2) / Math.max(branchSamples - 1, 1);
      return rotateAroundOrigin({
        x: sign * radiusX * Math.cosh(u),
        y: radiusY * Math.sinh(u),
      }, rotation, center);
    });
    const segments = [makeBranch(-1), makeBranch(1)];
    return {
      points: segments.flat(),
      segments,
      closed: false,
      center,
      equation: conicEquationFromQuadratic(center, rotation, 1 / (radiusX * radiusX), -1 / (radiusY * radiusY), -1),
    };
  }

  const vertex = finiteVector(options.vertex ?? options.center ?? { x: 0, y: 0 }, 'parabola vertex');
  const focalLength = positiveNumber(options.focalLength, 1);
  const extent = Math.max(4, focalLength * 6);
  const points = Array.from({ length: samples }, (_, index) => {
    const x = -extent + (index * extent * 2) / Math.max(samples - 1, 1);
    const y = (x * x) / (4 * focalLength);
    return rotateAroundOrigin({ x, y }, rotation, vertex);
  });
  return {
    points,
    closed: false,
    center: vertex,
    equation: parabolaEquation(vertex, rotation, focalLength),
  };
}


export function sampleParametricCurve(options: GeometryParametricCurveOptions): {
  points: Vector2[];
  closed?: boolean;
  parameter?: NonNullable<ParametricCurveEntity['parameter']>;
} {
  if (options.points) {
    const points = cleanFinitePoints(options.points, 'parametric curve');
    if (points.length < 2) throw new KleinSdkError('invalid_parametric_curve', 'A parametric curve needs at least two points.');
    const result: {
      points: Vector2[];
      closed?: boolean;
      parameter?: NonNullable<ParametricCurveEntity['parameter']>;
    } = { points };
    if (options.closed !== undefined) result.closed = options.closed;
    return result;
  }

  const xExpression = options.xExpression?.trim();
  const yExpression = options.yExpression?.trim();
  if (!xExpression || !yExpression) {
    throw new KleinSdkError('invalid_parametric_curve', 'Parametric curves need xExpression and yExpression, or explicit points.');
  }
  const tMin = finiteNumber(options.tMin, 0);
  const tMax = finiteNumber(options.tMax, Math.PI * 2);
  if (Math.abs(tMax - tMin) < 1e-12) {
    throw new KleinSdkError('invalid_parametric_curve', 'Parametric range must have non-zero length.');
  }
  const samples = clamp(Math.round(options.samples ?? 128), 2, 1024);
  const xEvaluator = compileScalarExpression(xExpression);
  const yEvaluator = compileScalarExpression(yExpression);
  const points: Vector2[] = [];
  for (let index = 0; index < samples; index += 1) {
    const t = tMin + ((tMax - tMin) * index) / Math.max(samples - 1, 1);
    const point = { x: xEvaluator(t), y: yEvaluator(t) };
    if (Number.isFinite(point.x) && Number.isFinite(point.y)) points.push(point);
  }
  if (points.length < 2) {
    throw new KleinSdkError('invalid_parametric_curve', 'Parametric expressions did not produce enough finite points.');
  }
  const result: {
    points: Vector2[];
    closed?: boolean;
    parameter?: NonNullable<ParametricCurveEntity['parameter']>;
  } = {
    points,
    parameter: { xExpression, yExpression, tMin, tMax, samples },
  };
  if (options.closed !== undefined) result.closed = options.closed;
  return result;
}


export function cleanFinitePoints(points: Vector2[], label: string): Vector2[] {
  return points.map(point => finiteVector(point, `${label} point`));
}


export function finiteVector(point: Vector2, label: string): Vector2 {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new KleinSdkError('invalid_point', `${label} coordinates must be finite.`);
  }
  return { x: point.x, y: point.y };
}


export function rotateAroundOrigin(point: Vector2, radians: number, origin: Vector2): Vector2 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: origin.x + point.x * cos - point.y * sin,
    y: origin.y + point.x * sin + point.y * cos,
  };
}


export function uniquePoints(points: Vector2[]): Vector2[] {
  const result: Vector2[] = [];
  for (const point of points) {
    if (!result.some(candidate => distance2D(candidate, point) < 1e-7)) result.push(point);
  }
  return result;
}


export function farthestPair(points: Vector2[]): [Vector2, Vector2] {
  let pair: [Vector2, Vector2] = [points[0] as Vector2, points[1] as Vector2];
  let best = -Infinity;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const first = points[i];
      const second = points[j];
      if (!first || !second) continue;
      const distance = distance2D(first, second);
      if (distance > best) {
        best = distance;
        pair = [first, second];
      }
    }
  }
  return pair;
}


export function pointWithinBounds(point: Vector2, bounds: WorldBounds): boolean {
  return point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY;
}


export function normalizeVector(vector: Vector2): Vector2 | null {
  const length = Math.hypot(vector.x, vector.y);
  if (length < 1e-12) return null;
  return { x: vector.x / length, y: vector.y / length };
}


export function normalizeAngleDelta(delta: number): number {
  let result = delta;
  while (result <= -Math.PI) result += Math.PI * 2;
  while (result > Math.PI) result -= Math.PI * 2;
  return result;
}


export function angleSweep(start: number, end: number, orientation: AngleEntity['orientation'] = 'interior'): number {
  const interior = normalizeAngleDelta(end - start);
  if (orientation !== 'exterior') return interior;
  return interior >= 0 ? interior - Math.PI * 2 : interior + Math.PI * 2;
}


export function angleMeasureForEntityDegrees(a: Vector2, vertex: Vector2, c: Vector2, entity: AngleEntity): number {
  const interior = angleMeasureDegrees(a, vertex, c);
  return entity.orientation === 'exterior' ? 360 - interior : interior;
}


export function normalizeAngleOptions(options: GeometryAngleOptions): { radius: number; orientation: 'interior' | 'exterior' } {
  return {
    radius: positiveNumber(options.radius, positiveNumber(options.width, 0.7)),
    orientation: options.orientation ?? (options.exterior ? 'exterior' : 'interior'),
  };
}


export function normalizeVertexIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || length <= 0) {
    throw new KleinSdkError('invalid_polygon', 'Vertex index must be finite.');
  }
  const rounded = Math.round(index);
  return ((rounded % length) + length) % length;
}


export function cross(a: Vector2, b: Vector2): number {
  return a.x * b.y - a.y * b.x;
}


export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}


export function nearlyEqualNumber(first: number, second: number, tolerance: number): boolean {
  return Math.abs(first - second) <= tolerance;
}


export function uniqueStrings(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}


export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

