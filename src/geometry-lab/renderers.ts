import { KleinSdkError } from '../core/index.js';
import { KLEIN_UI_FONT_STACK } from '../theme/index.js';
import type { ExportOptions, Vector2, Vector3 } from '../core/index.js';
import type { GeometryPoint3D } from '../geometry-core/index.js';
import {
  assertGeometryLabExportOutputComplexity,
  assertGeometryLabExportRequestComplexity,
  assertGeometryLabSnapshotComplexity,
  resolveGeometryLabComplexityLimits,
  type GeometryLabComplexityLimits,
} from './complexity.js';
import type {
  CrossSectionEntity,
  CurveEntity3D,
  GeometryEntity3D,
  GeometryLabSnapshot,
  GeometryScene3D,
  SolidEntity,
  SurfaceEntity3D,
} from './types.js';

const DEFAULT_WIDTH = 960;
const DEFAULT_HEIGHT = 640;
const MIN_WIDTH = 240;
const MIN_HEIGHT = 180;
const MIN_RENDER_FOV_DEGREES = 0.01;
const MAX_RENDER_FOV_DEGREES = 179.99;
const MIN_RENDER_ZOOM = 1e-6;
const MAX_RENDER_ZOOM = 1e6;
const RELATIVE_NEAR_PLANE = 1e-4;

interface ViewPoint3D extends Vector3 {}

interface CameraProjection3D {
  near: number;
  toView(point: Vector3): ViewPoint3D;
  projectView(point: ViewPoint3D): Vector2 | null;
}

interface PrimitiveBase {
  depth: number;
  sequence: number;
}

interface PolygonPrimitive extends PrimitiveBase {
  kind: 'polygon';
  points: Vector2[];
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeOpacity?: number;
  strokeWidth: number;
}

interface PolylinePrimitive extends PrimitiveBase {
  kind: 'polyline';
  points: Vector2[];
  stroke: string;
  strokeOpacity?: number;
  strokeWidth: number;
}

interface PointPrimitive extends PrimitiveBase {
  kind: 'point';
  point: Vector2;
  color: string;
  label?: string;
}

interface TextPrimitive extends PrimitiveBase {
  kind: 'text';
  point: Vector2;
  color: string;
  text: string;
}

type SvgPrimitive = PolygonPrimitive | PolylinePrimitive | PointPrimitive | TextPrimitive;

interface PolygonStyle3D {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeOpacity?: number;
  strokeWidth: number;
}

interface PolylineStyle3D {
  stroke: string;
  strokeOpacity?: number;
  strokeWidth: number;
}

/**
 * Renders the Geometry Lab 3D scene with a conventional camera-space pipeline.
 * Perspective uses a vertical field of view. Orthographic projection is matched
 * to the perspective projection at the orbit target so switching modes does not
 * unexpectedly reframe the scene. SVG faces are stably painter-sorted by their
 * clipped average view depth; geometrically intersecting faces are not split at
 * their intersection.
 */
export function renderGeometryLabSvg3D(
  snapshot: GeometryLabSnapshot,
  options: Partial<ExportOptions> = {},
  complexityLimits: Partial<GeometryLabComplexityLimits> = {},
): string {
  const limits = resolveGeometryLabComplexityLimits(complexityLimits);
  assertGeometryLabSnapshotComplexity(snapshot, limits);
  assertGeometryLabExportRequestComplexity(
    { ...options, format: 'svg' },
    snapshot,
    limits,
  );
  const width = renderDimension(options.width, DEFAULT_WIDTH, MIN_WIDTH);
  const height = renderDimension(options.height, DEFAULT_HEIGHT, MIN_HEIGHT);
  const background = options.background === 'transparent' ? 'transparent' : options.background ?? '#ffffff';
  const scene = snapshot.scene.scene3d;
  const projection = createCameraProjection(snapshot, width, height);
  const primitives: SvgPrimitive[] = [];
  let sequence = 0;

  const enqueuePolygon = (points: readonly Vector3[], style: PolygonStyle3D): void => {
    const viewPoints = pointsToView(points, projection);
    if (!viewPoints) return;
    const clipped = clipPolygonToNearPlane(viewPoints, projection.near);
    if (clipped.length < 3) return;
    const projected = projectViewPoints(clipped, projection);
    if (!projected) return;
    const primitive: PolygonPrimitive = {
      kind: 'polygon',
      points: projected,
      fill: style.fill,
      fillOpacity: style.fillOpacity,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      depth: averageViewDepth(clipped),
      sequence: sequence++,
    };
    if (style.strokeOpacity !== undefined) primitive.strokeOpacity = style.strokeOpacity;
    primitives.push(primitive);
  };

  const enqueuePolyline = (points: readonly Vector3[], style: PolylineStyle3D): void => {
    const viewPoints = pointsToView(points, projection);
    if (!viewPoints || viewPoints.length < 2) return;
    for (let index = 0; index + 1 < viewPoints.length; index += 1) {
      const first = viewPoints[index];
      const second = viewPoints[index + 1];
      if (!first || !second) continue;
      const clipped = clipSegmentToNearPlane(first, second, projection.near);
      if (!clipped) continue;
      const projected = projectViewPoints(clipped, projection);
      if (!projected) continue;
      const primitive: PolylinePrimitive = {
        kind: 'polyline',
        points: projected,
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        depth: averageViewDepth(clipped),
        sequence: sequence++,
      };
      if (style.strokeOpacity !== undefined) primitive.strokeOpacity = style.strokeOpacity;
      primitives.push(primitive);
    }
  };

  const enqueuePoint = (point: GeometryPoint3D): void => {
    const viewPoint = projection.toView(point);
    if (!isFiniteVector3(viewPoint) || viewPoint.z < projection.near) return;
    const projected = projection.projectView(viewPoint);
    if (!projected) return;
    const primitive: PointPrimitive = {
      kind: 'point',
      point: projected,
      color: point.color ?? '#172033',
      depth: viewPoint.z,
      sequence: sequence++,
    };
    if (point.label !== undefined) primitive.label = point.label;
    primitives.push(primitive);
  };

  const enqueueText = (point: Vector3, text: string, color: string): void => {
    const viewPoint = projection.toView(point);
    if (!isFiniteVector3(viewPoint) || viewPoint.z < projection.near) return;
    const projected = projection.projectView(viewPoint);
    if (!projected) return;
    primitives.push({
      kind: 'text',
      point: projected,
      color,
      text,
      depth: viewPoint.z,
      sequence: sequence++,
    });
  };

  enqueueAxes(enqueuePolyline, enqueueText);

  for (const entity of valuesByStableId(scene.entities)) {
    if (entity.hidden) continue;
    enqueueEntity(scene, entity, enqueuePolygon, enqueuePolyline);
  }
  for (const point of valuesByStableId(scene.points)) {
    if (!point.hidden) enqueuePoint(point);
  }

  primitives.sort((first, second) => {
    const depthOrder = second.depth - first.depth;
    return depthOrder !== 0 ? depthOrder : first.sequence - second.sequence;
  });

  const builder = new BoundedSvgOutput(limits.maxExportBytes);
  builder.append(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Klein 3D calculator scene">`);
  builder.append(`<rect width="100%" height="100%" fill="${escapeXml(String(background))}"/>`);
  builder.append(`<g stroke-linecap="round" stroke-linejoin="round" font-family="${KLEIN_UI_FONT_STACK.replace(/"/g, '&quot;')}">`);
  for (const primitive of primitives) builder.append(renderPrimitive(primitive));
  if (options.includeMeasurements !== false) builder.append(renderMeasurementsSvg(snapshot, width));
  builder.append('</g></svg>');
  const output = builder.toString();
  assertGeometryLabExportOutputComplexity(output, limits);
  return output;
}

class BoundedSvgOutput {
  readonly #parts: string[] = [];
  readonly #maximumBytes: number;
  #bytes = 0;

  constructor(maximumBytes: number) {
    this.#maximumBytes = maximumBytes;
  }

  append(part: string): void {
    const partBytes = utf8ByteLengthUpTo(part, this.#maximumBytes - this.#bytes);
    if (partBytes > this.#maximumBytes - this.#bytes) {
      throw new KleinSdkError(
        'geometry_lab_export_too_complex',
        'Geometry Lab serialized export is too large.',
        [{
          path: '',
          code: 'export_bytes',
          message: `Geometry Lab serialized export exceeds ${this.#maximumBytes} bytes.`,
          actual: this.#maximumBytes + 1,
          limit: this.#maximumBytes,
        }],
      );
    }
    this.#parts.push(part);
    this.#bytes += partBytes;
  }

  toString(): string {
    return this.#parts.join('');
  }
}

function createCameraProjection(snapshot: GeometryLabSnapshot, width: number, height: number): CameraProjection3D {
  const camera = snapshot.appState.view3d;
  const eye = tupleToVector3(camera.position);
  const target = tupleToVector3(camera.target);
  const targetOffset = subtract3(target, eye);
  const measuredFocusDistance = length3(targetOffset);
  const hasUsableTarget = Number.isFinite(measuredFocusDistance) && measuredFocusDistance > 0;
  const focusDistance = hasUsableTarget ? measuredFocusDistance : 1;
  const forward = hasUsableTarget
    ? scale3(targetOffset, 1 / measuredFocusDistance)
    : normalize3({ x: -1, y: 1, z: -0.75 }) as Vector3;
  const up = cameraUpVector(forward, tupleToVector3(camera.up));
  const right = normalize3(cross3(forward, up)) ?? { x: 1, y: 0, z: 0 };
  const correctedUp = normalize3(cross3(right, forward)) ?? up;
  const fov = clamp(
    Number.isFinite(camera.fov) ? camera.fov : 45,
    MIN_RENDER_FOV_DEGREES,
    MAX_RENDER_FOV_DEGREES,
  );
  const zoom = clamp(
    Number.isFinite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1,
    MIN_RENDER_ZOOM,
    MAX_RENDER_ZOOM,
  );
  const tangent = Math.tan(degreesToRadians(fov) / 2);
  const focalPixels = (height / 2) / tangent * zoom;
  const orthographicScale = focalPixels / focusDistance;
  const near = Math.max(focusDistance * RELATIVE_NEAR_PLANE, Number.MIN_VALUE);

  return {
    near,
    toView(point: Vector3): ViewPoint3D {
      const relative = subtract3(point, eye);
      return {
        x: dot3(relative, right),
        y: dot3(relative, correctedUp),
        z: dot3(relative, forward),
      };
    },
    projectView(point: ViewPoint3D): Vector2 | null {
      if (!isFiniteVector3(point) || point.z < near) return null;
      const scale = camera.projection === 'perspective' ? focalPixels / point.z : orthographicScale;
      const x = width / 2 + point.x * scale;
      const y = height / 2 - point.y * scale;
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    },
  };
}

function cameraUpVector(forward: Vector3, upHint: Vector3): Vector3 {
  const projectedHint = subtract3(upHint, scale3(forward, dot3(upHint, forward)));
  const normalizedHint = normalize3(projectedHint);
  if (normalizedHint) return normalizedHint;

  const candidates: Vector3[] = [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
  ];
  let fallback = candidates[0] as Vector3;
  let alignment = Math.abs(dot3(fallback, forward));
  for (let index = 1; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!candidate) continue;
    const candidateAlignment = Math.abs(dot3(candidate, forward));
    if (candidateAlignment < alignment) {
      fallback = candidate;
      alignment = candidateAlignment;
    }
  }
  const projectedFallback = subtract3(fallback, scale3(forward, dot3(fallback, forward)));
  return normalize3(projectedFallback) ?? { x: 0, y: 0, z: 1 };
}

function enqueueAxes(
  enqueuePolyline: (points: readonly Vector3[], style: PolylineStyle3D) => void,
  enqueueText: (point: Vector3, text: string, color: string) => void,
): void {
  const origin = { x: 0, y: 0, z: 0 };
  const axes = [
    { label: 'x', color: '#d43f4b', end: { x: 3, y: 0, z: 0 } },
    { label: 'y', color: '#16845f', end: { x: 0, y: 3, z: 0 } },
    { label: 'z', color: '#3157d5', end: { x: 0, y: 0, z: 3 } },
  ];
  for (const axis of axes) {
    enqueuePolyline([origin, axis.end], { stroke: axis.color, strokeWidth: 1.5 });
    enqueueText(axis.end, axis.label, axis.color);
  }
}

function enqueueEntity(
  scene: GeometryScene3D,
  entity: GeometryEntity3D,
  enqueuePolygon: (points: readonly Vector3[], style: PolygonStyle3D) => void,
  enqueuePolyline: (points: readonly Vector3[], style: PolylineStyle3D) => void,
): void {
  if (entity.kind === 'solid') {
    enqueueSolid(scene, entity, enqueuePolygon);
    return;
  }
  if (entity.kind === 'surface3d') {
    enqueueSurface(entity, enqueuePolygon);
    return;
  }
  if (entity.kind === 'crossSection') {
    enqueueCrossSection(scene, entity, enqueuePolygon);
    return;
  }
  if (entity.kind === 'curve3d') {
    enqueueCurve(entity, enqueuePolyline);
    return;
  }
  if (!hasPointIds(entity)) return;
  const points = pointsForIds(scene, entity.pointIds);
  if (entity.kind === 'polygon' || entity.kind === 'plane') {
    if (points.length < 3) return;
    const stroke = entity.strokeColor ?? entity.color ?? '#172033';
    enqueuePolygon(points, {
      fill: entity.fillColor ?? entity.color ?? '#3157d5',
      fillOpacity: 0.12,
      stroke,
      strokeWidth: 1.4,
    });
    return;
  }
  if (points.length < 2) return;
  enqueuePolyline(points, {
    stroke: entity.strokeColor ?? entity.color ?? '#172033',
    strokeWidth: typeof entity.width === 'number' ? entity.width : 2,
  });
}

function enqueueSolid(
  scene: GeometryScene3D,
  solid: SolidEntity,
  enqueuePolygon: (points: readonly Vector3[], style: PolygonStyle3D) => void,
): void {
  const color = solid.color ?? '#8fb3ff';
  const stroke = solid.color ?? '#3157d5';
  for (const face of solid.faces ?? []) {
    const points = pointsForIds(scene, face.pointIds);
    if (points.length < 3) continue;
    enqueuePolygon(points, {
      fill: color,
      fillOpacity: 0.22,
      stroke,
      strokeOpacity: 0.55,
      strokeWidth: 1,
    });
  }
}

function enqueueSurface(
  surface: SurfaceEntity3D,
  enqueuePolygon: (points: readonly Vector3[], style: PolygonStyle3D) => void,
): void {
  const color = surface.color ?? '#7754d8';
  for (const face of surface.faces) {
    const points: Vector3[] = [];
    for (const index of face) {
      const point = surface.vertices[index];
      if (point) points.push(point);
    }
    if (points.length < 3) continue;
    enqueuePolygon(points, {
      fill: color,
      fillOpacity: 0.14,
      stroke: color,
      strokeOpacity: 0.35,
      strokeWidth: 0.8,
    });
  }
}

function enqueueCrossSection(
  scene: GeometryScene3D,
  section: CrossSectionEntity,
  enqueuePolygon: (points: readonly Vector3[], style: PolygonStyle3D) => void,
): void {
  const points = section.vertices?.length ? section.vertices : pointsForIds(scene, section.pointIds);
  if (points.length < 3) return;
  const color = section.color ?? '#dd6b20';
  enqueuePolygon(points, {
    fill: color,
    fillOpacity: 0.28,
    stroke: color,
    strokeWidth: 1.5,
  });
}

function enqueueCurve(
  curve: CurveEntity3D,
  enqueuePolyline: (points: readonly Vector3[], style: PolylineStyle3D) => void,
): void {
  enqueuePolyline(curve.points, { stroke: curve.color ?? '#7754d8', strokeWidth: 2 });
}

function hasPointIds(entity: GeometryEntity3D): entity is GeometryEntity3D & { pointIds: string[] } {
  return 'pointIds' in entity && Array.isArray(entity.pointIds);
}

function pointsForIds(scene: GeometryScene3D, pointIds: readonly string[]): GeometryPoint3D[] {
  const points: GeometryPoint3D[] = [];
  for (const pointId of pointIds) {
    const point = scene.points[pointId];
    if (point) points.push(point);
  }
  return points;
}

function pointsToView(points: readonly Vector3[], projection: CameraProjection3D): ViewPoint3D[] | null {
  const result: ViewPoint3D[] = [];
  for (const point of points) {
    const viewPoint = projection.toView(point);
    if (!isFiniteVector3(viewPoint)) return null;
    result.push(viewPoint);
  }
  return result;
}

function projectViewPoints(points: readonly ViewPoint3D[], projection: CameraProjection3D): Vector2[] | null {
  const result: Vector2[] = [];
  for (const point of points) {
    const projected = projection.projectView(point);
    if (!projected) return null;
    result.push(projected);
  }
  return result;
}

function clipSegmentToNearPlane(
  first: ViewPoint3D,
  second: ViewPoint3D,
  near: number,
): [ViewPoint3D, ViewPoint3D] | null {
  const firstInside = first.z >= near;
  const secondInside = second.z >= near;
  if (firstInside && secondInside) return [first, second];
  if (!firstInside && !secondInside) return null;
  const intersection = intersectNearPlane(first, second, near);
  return firstInside ? [first, intersection] : [intersection, second];
}

function clipPolygonToNearPlane(points: readonly ViewPoint3D[], near: number): ViewPoint3D[] {
  if (points.length < 3) return [];
  const clipped: ViewPoint3D[] = [];
  let previous = points[points.length - 1] as ViewPoint3D;
  let previousInside = previous.z >= near;
  for (const current of points) {
    const currentInside = current.z >= near;
    if (currentInside !== previousInside) clipped.push(intersectNearPlane(previous, current, near));
    if (currentInside) clipped.push(current);
    previous = current;
    previousInside = currentInside;
  }
  return removeAdjacentDuplicateViewPoints(clipped);
}

function intersectNearPlane(first: ViewPoint3D, second: ViewPoint3D, near: number): ViewPoint3D {
  const denominator = second.z - first.z;
  const ratio = denominator === 0 ? 0 : clamp((near - first.z) / denominator, 0, 1);
  return {
    x: first.x + (second.x - first.x) * ratio,
    y: first.y + (second.y - first.y) * ratio,
    z: near,
  };
}

function removeAdjacentDuplicateViewPoints(points: readonly ViewPoint3D[]): ViewPoint3D[] {
  const result: ViewPoint3D[] = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (!previous || !sameVector3(previous, point)) result.push(point);
  }
  if (result.length > 1) {
    const first = result[0];
    const last = result[result.length - 1];
    if (first && last && sameVector3(first, last)) result.pop();
  }
  return result;
}

function sameVector3(first: Vector3, second: Vector3): boolean {
  return first.x === second.x && first.y === second.y && first.z === second.z;
}

function averageViewDepth(points: readonly ViewPoint3D[]): number {
  let sum = 0;
  for (const point of points) sum += point.z;
  return points.length ? sum / points.length : 0;
}

function renderPrimitive(primitive: SvgPrimitive): string {
  if (primitive.kind === 'polygon') {
    const strokeOpacity = primitive.strokeOpacity === undefined ? '' : ` stroke-opacity="${formatNumber(primitive.strokeOpacity)}"`;
    return `<polygon points="${primitive.points.map(pointToSvg).join(' ')}" fill="${escapeXml(primitive.fill)}" fill-opacity="${formatNumber(primitive.fillOpacity)}" stroke="${escapeXml(primitive.stroke)}"${strokeOpacity} stroke-width="${formatNumber(primitive.strokeWidth)}"/>`;
  }
  if (primitive.kind === 'polyline') {
    const strokeOpacity = primitive.strokeOpacity === undefined ? '' : ` stroke-opacity="${formatNumber(primitive.strokeOpacity)}"`;
    return `<polyline points="${primitive.points.map(pointToSvg).join(' ')}" fill="none" stroke="${escapeXml(primitive.stroke)}"${strokeOpacity} stroke-width="${formatNumber(primitive.strokeWidth)}"/>`;
  }
  if (primitive.kind === 'text') {
    return `<text x="${formatNumber(primitive.point.x + 4)}" y="${formatNumber(primitive.point.y - 4)}" fill="${escapeXml(primitive.color)}" font-size="12">${escapeXml(primitive.text)}</text>`;
  }
  const label = primitive.label === undefined
    ? ''
    : `<text x="${formatNumber(primitive.point.x + 5)}" y="${formatNumber(primitive.point.y - 5)}" fill="#172033" font-size="11">${escapeXml(primitive.label)}</text>`;
  return `<g><circle cx="${formatNumber(primitive.point.x)}" cy="${formatNumber(primitive.point.y)}" r="3.5" fill="${escapeXml(primitive.color)}"/>${label}</g>`;
}

function renderMeasurementsSvg(snapshot: GeometryLabSnapshot, width: number): string {
  const measurements = valuesByStableId(snapshot.scene.scene3d.measurements);
  if (!measurements.length) return '';
  const rows: string[] = [];
  const visibleCount = Math.min(measurements.length, 8);
  for (let index = 0; index < visibleCount; index += 1) {
    const measurement = measurements[index];
    if (!measurement) continue;
    const label = measurement.label ?? measurement.kind;
    const unit = measurement.unit ?? '';
    rows.push(`<text x="12" y="${20 + index * 16}" fill="#172033" font-size="12">${escapeXml(label)}: ${formatNumber(measurement.value)} ${escapeXml(unit)}</text>`);
  }
  const panelWidth = Math.min(width - 12, 280);
  const panelHeight = Math.min(132, 12 + visibleCount * 16);
  return `<g opacity="0.92"><rect x="6" y="6" width="${panelWidth}" height="${panelHeight}" rx="6" fill="#ffffff" stroke="#d8dee8"/>${rows.join('')}</g>`;
}

function pointToSvg(point: Vector2): string {
  return `${formatNumber(point.x)},${formatNumber(point.y)}`;
}

function valuesByStableId<T extends { id: string }>(record: Record<string, T>): T[] {
  return Object.values(record).sort((first, second) => (
    first.id < second.id ? -1 : first.id > second.id ? 1 : 0
  ));
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error('Geometry Lab renderer produced a non-finite SVG coordinate.');
  return Number(value.toFixed(3)).toString();
}

function renderDimension(value: number | undefined, fallback: number, minimum: number): number {
  return Math.max(minimum, Math.round(value !== undefined && Number.isFinite(value) ? value : fallback));
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function utf8ByteLengthUpTo(value: string, maximum: number): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
    if (bytes > maximum) return maximum + 1;
  }
  return bytes;
}

function tupleToVector3(tuple: readonly [number, number, number]): Vector3 {
  return { x: tuple[0], y: tuple[1], z: tuple[2] };
}

function isFiniteVector3(vector: Vector3): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

function normalize3(vector: Vector3): Vector3 | null {
  const length = length3(vector);
  if (!Number.isFinite(length) || length === 0) return null;
  return scale3(vector, 1 / length);
}

function length3(vector: Vector3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function subtract3(first: Vector3, second: Vector3): Vector3 {
  return { x: first.x - second.x, y: first.y - second.y, z: first.z - second.z };
}

function scale3(vector: Vector3, factor: number): Vector3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function degreesToRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}
