import { KleinSdkError } from '../core/index.js';
import {
  parsePdfColor,
  pdfDocument,
  pdfFillColor,
  pdfNumber,
  pdfStrokeColor,
  pdfText,
} from '../export/index.js';
import { geometryLabFigureSummary } from './describe.js';
import { geometryConstructionProtocol } from './protocol.js';
import { KLEIN_UI_FONT_STACK } from '../theme/index.js';
import { formatMathNode, parseMath } from '../math/index.js';
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
  /**
   * The object this was drawn for, when there is one.
   *
   * <p>What turns a picture into something a screen reader can walk: a
   * `<title>` naming the object and a `<desc>` saying how it was made, rather
   * than one label on the whole scene saying "geometry scene". Absent for
   * furniture - the background, a measurement panel - which has nothing to say.
   */
  described?: DescribedObject;
  /**
   * The object this was drawn for.
   *
   * <p>Separate from `described`, which is the *wording* and can be switched
   * off: hit testing has to know which object a shape belongs to whether or not
   * anybody asked for it to be narrated.
   */
  sourceId?: string;
}

/** A name and a sentence for one object in the figure. */
interface DescribedObject {
  /**
   * A short document-unique stem for this object's `<title>` and `<desc>` ids.
   *
   * <p>Short on purpose. The object's own id is around fifty characters and
   * would be written four times per object - twice in `aria-labelledby`, once
   * on each element - which on a five-hundred-object figure is a hundred
   * kilobytes of identifier. A per-figure prefix plus an index says the same
   * thing in a tenth of the space, and the prefix is derived from the figure so
   * that two Klein drawings on one page still do not collide.
   */
  stem: string;
  title: string;
  detail?: string;
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
function collectFigure3D(
  snapshot: GeometryLabSnapshot,
  options: Partial<ExportOptions>,
  complexityLimits: Partial<GeometryLabComplexityLimits>,
): CollectedFigure {
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
  const describe = options.describeObjects !== false;
  const focusable = describe && options.focusableObjects === true;
  const descriptions = describedObjects(snapshot, describe);
  const projection = createCameraProjection(snapshot, width, height);
  const primitives: SvgPrimitive[] = [];
  let sequence = 0;
  // The object currently being painted. `enqueueEntity` fans one entity out
  // into a sheaf of faces or a run of segments through style callbacks that
  // know nothing about ids, and threading one through all of them would touch
  // every solid, surface and curve painter for no gain.
  let current: DescribedObject | undefined;
  let currentId: string | undefined;
  const attach = <T extends SvgPrimitive>(primitive: T): T => {
    if (current) primitive.described = current;
    if (currentId !== undefined) primitive.sourceId = currentId;
    return primitive;
  };

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
    primitives.push(attach(primitive));
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
      primitives.push(attach(primitive));
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
    primitives.push(attach(primitive));
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
    current = descriptions.get(entity.id);
    currentId = entity.id;
    enqueueEntity(scene, entity, enqueuePolygon, enqueuePolyline);
  }
  for (const point of valuesByStableId(scene.points)) {
    if (point.hidden) continue;
    current = descriptions.get(point.id);
    currentId = point.id;
    enqueuePoint(point);
  }
  current = undefined;
  currentId = undefined;

  primitives.sort((first, second) => {
    const depthOrder = second.depth - first.depth;
    return depthOrder !== 0 ? depthOrder : first.sequence - second.sequence;
  });

  return {
    snapshot,
    limits,
    width,
    height,
    background: String(background),
    primitives,
    label: 'Klein 3D calculator scene',
    describe,
    focusable,
    // The 3D view paints a panel of measurements over the scene; the 2D one
    // renders them into the figure itself.
    measurementPanel: options.includeMeasurements !== false,
  };
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

/**
 * Wraps a primitive in the group that names it.
 *
 * <p>`role="graphics-symbol"` with `aria-labelledby` rather than an
 * `aria-label`, because a description is a sentence and belongs in a `<desc>`
 * where it can be read on request instead of announced with the name. The ids
 * are derived from the object's own id, which is unique across sessions, so two
 * Klein figures on one page do not collide.
 */
function describedGroup(
  primitive: SvgPrimitive,
  body: string,
  focusable: boolean,
  emitted: Set<string>,
): string {
  const described = primitive.described;
  if (!described) return body;
  const base = described.stem;
  const labelledBy = described.detail === undefined ? `${base}t` : `${base}t ${base}d`;

  // One object can be drawn as several primitives - a curve is a run of
  // segments, a solid a sheaf of faces - and they are depth-sorted, so they are
  // not next to each other and cannot be one group. The name and the sentence
  // are written once, on whichever piece is painted first, and the rest point
  // at them: an id may appear once in a document, and repeating it would make
  // the file invalid rather than more accessible.
  const first = !emitted.has(base);
  emitted.add(base);
  const labels = first
    ? `<title id="${base}t">${escapeXml(described.title)}</title>`
      + (described.detail === undefined ? '' : `<desc id="${base}d">${escapeXml(described.detail)}</desc>`)
    : '';
  // Only the first piece is a tab stop, for the same reason: an object is one
  // thing to arrive at, not one per line segment that draws it.
  //
  // The order they are arrived in is the order they are painted - back to
  // front - because tab order in SVG is document order and the only way to
  // override it is a positive `tabindex`, which hijacks the tab order of the
  // whole page the figure lands in. Deterministic, which is what a keyboard
  // user needs; walking the figure in the order it was *built* would need the
  // roving-tabindex handling an interaction layer does, which task 5.5 is a
  // decision about.
  const tabbable = focusable && first ? ' tabindex="0"' : '';
  return `<g role="graphics-symbol" aria-labelledby="${labelledBy}"${tabbable}>${labels}${body}</g>`;
}

/**
 * Names and stories for every object in the figure, keyed by id.
 *
 * <p>Read out of the construction protocol rather than written again here: the
 * protocol already turns the provenance the model carries into "Construct M,
 * the midpoint of A and B", and a picture whose descriptions disagreed with the
 * figure's own account of itself would be worse than one with none. The title
 * is the short form the protocol assigns - which is a student's own label where
 * they gave one - and the description is the step.
 */
function describedObjects(
  snapshot: GeometryLabSnapshot,
  enabled: boolean,
): Map<string, DescribedObject> {
  const described = new Map<string, DescribedObject>();
  if (!enabled) return described;
  const taken = new Set<string>();
  for (const step of geometryConstructionProtocol(snapshot).steps) {
    described.set(step.objectId, {
      stem: stemFor(step.objectId, taken),
      title: objectTitle(step.name, step.operation),
      detail: step.summary,
    });
  }
  return described;
}

/**
 * A short stem for one object's element ids, derived from that object's id.
 *
 * <p>From the object's own id rather than from its position in the figure, so
 * that adding an unrelated object does not renumber every element in the file
 * and turn a diff of two exports into a diff of everything. From a hash of it
 * rather than the id itself, because a Lab id is around fifty characters and
 * would be written four times per object.
 *
 * <p>Not a security hash and not pretending to be one: it only has to be unique
 * within the document, and where two ids happen to hash alike the second is
 * given a suffix, so uniqueness is exact rather than probable.
 */
function stemFor(id: string, taken: Set<string>): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const base = `k${(hash >>> 0).toString(36)}`;
  let stem = base;
  for (let suffix = 1; taken.has(stem); suffix += 1) stem = `${base}x${suffix}`;
  taken.add(stem);
  return stem;
}

/**
 * What the object is called out loud: `Point A`, `Segment AB`, `Circle 1`.
 *
 * <p>A student's own label says nothing about what the thing is, so the kind
 * goes in front of it. A name the protocol had to invent already carries the
 * kind - it is `circle 1` precisely because nobody named it - and putting the
 * kind in front of that again gives `Perpendicular line line 1`. The kind is
 * not lost either way: the description underneath says how the object was made.
 */
function objectTitle(name: string, operation: string): string {
  if (name.includes(' ')) return name.charAt(0).toUpperCase() + name.slice(1);
  const kind = operation === 'point2d' || operation === 'point3d' ? 'point' : operation;
  const spaced = kind.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)} ${name}`;
}

/**
 * The root element.
 *
 * <p>`role="graphics-document"` rather than `role="img"` once the objects
 * inside carry roles of their own: an image is a leaf, and saying a leaf has
 * structure inside it is a contradiction a screen reader resolves by ignoring
 * one of them. The `aria-label` stays as well, for anything that does not know
 * the graphics roles.
 */
function svgRoot(
  width: number,
  height: number,
  label: string,
  summary: string | null,
  structured: boolean,
): string {
  const role = structured ? 'graphics-document' : 'img';
  const described = summary === null
    ? ''
    : `<title id="klein-figure-title">${escapeXml(label)}</title>`
      + `<desc id="klein-figure-desc">${escapeXml(summary)}</desc>`;
  const labelled = summary === null ? '' : ' aria-labelledby="klein-figure-title klein-figure-desc"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="${role}" aria-label="${escapeXml(label)}"${labelled}>${described}`;
}

function renderPrimitive(primitive: SvgPrimitive, focusable: boolean, emitted: Set<string>): string {
  return describedGroup(primitive, renderPrimitiveBody(primitive), focusable, emitted);
}

function renderPrimitiveBody(primitive: SvgPrimitive): string {
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

/* -------------------------------------------------------------------------- */
/* 2D rendering                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A primitive before it has been given its paint order. Distributive, so each
 * member of the union keeps its own required fields rather than collapsing to
 * the fields they all share.
 */
type UnplacedPrimitive = SvgPrimitive extends infer T
  ? T extends SvgPrimitive ? Omit<T, 'depth' | 'sequence'> : never
  : never;

const DEFAULT_POINT_COLOR_2D = '#303841';
const DEFAULT_STROKE_2D = '#5e6770';
const DEFAULT_FILL_2D = '#76abae';

/**
 * Renders the Geometry Lab 2D scene.
 *
 * <p>The Lab has always carried a `scene2d` and, since task 2.2, a full API for
 * building one - but the only renderer was the 3D one, so a 2D figure could be
 * constructed and could never be looked at or exported. This is that missing
 * half.
 *
 * <p>Deliberately not a camera pipeline. A 2D scene has a pan and a zoom, so
 * world-to-screen is an offset and a scale, and the painter's problem the 3D
 * renderer solves - sorting faces by depth - does not exist here. What replaces
 * it is a fixed paint order: filled regions, then curves, then lines, then
 * points and labels on top, so that a point is never buried under the polygon
 * it defines.
 */
function collectFigure2D(
  snapshot: GeometryLabSnapshot,
  options: Partial<ExportOptions>,
  complexityLimits: Partial<GeometryLabComplexityLimits>,
): CollectedFigure {
  const limits = resolveGeometryLabComplexityLimits(complexityLimits);
  assertGeometryLabSnapshotComplexity(snapshot, limits);
  assertGeometryLabExportRequestComplexity({ ...options, format: 'svg' }, snapshot, limits);

  const width = renderDimension(options.width, DEFAULT_WIDTH, MIN_WIDTH);
  const height = renderDimension(options.height, DEFAULT_HEIGHT, MIN_HEIGHT);
  const background = options.background === 'transparent' ? 'transparent' : options.background ?? '#ffffff';
  const scene = snapshot.scene.scene2d;
  const describe = options.describeObjects !== false;
  const focusable = describe && options.focusableObjects === true;
  const descriptions = describedObjects(snapshot, describe);
  const view = snapshot.appState.view2d;

  // y grows upward in the scene and downward in SVG, so the vertical axis is
  // flipped here rather than at every use.
  const zoom = Number.isFinite(view.zoom) && view.zoom > 0 ? view.zoom : 1;
  const toScreen = (point: Vector2): Vector2 => ({
    x: width / 2 + (point.x - view.x) * zoom,
    y: height / 2 - (point.y - view.y) * zoom,
  });

  const primitives: SvgPrimitive[] = [];
  let sequence = 0;
  // Layers, painted low to high. Points and labels sit above everything so a
  // vertex stays visible on top of the polygon it belongs to.
  const LAYER_FILL = 0;
  const LAYER_CURVE = 1;
  const LAYER_LINE = 2;
  const LAYER_POINT = 3;
  const push = (primitive: UnplacedPrimitive, layer: number, sourceId?: string): void => {
    const placed = { ...primitive, depth: -layer, sequence: sequence++ } as SvgPrimitive;
    if (sourceId !== undefined) {
      placed.sourceId = sourceId;
      const described = descriptions.get(sourceId);
      if (described) placed.described = described;
    }
    primitives.push(placed);
  };

  const pointsFor = (ids: readonly string[]): Vector2[] | null => {
    const resolved: Vector2[] = [];
    for (const id of ids) {
      const point = scene.points[id];
      if (!point || point.kind !== 'point2d' || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
      resolved.push(toScreen(point));
    }
    return resolved;
  };

  /**
   * A line has no endpoints of its own, so it is drawn as the chord where it
   * crosses the viewport, clipped parametrically against the four edges.
   *
   * <p>Clipped rather than merely extended a long way: an unclipped line writes
   * coordinates far outside the viewBox into the file, which costs export bytes
   * for pixels no one can see and makes the output awkward to read or diff. A
   * ray is the same computation with its parameter held at or above zero, so it
   * starts at its own first point.
   */
  const spanAcrossView = (first: Vector2, second: Vector2, fromStart: boolean): Vector2[] | null => {
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 1e-9) return null;

    let enter = fromStart ? 0 : -Infinity;
    let exit = Infinity;
    // Liang-Barsky: each edge is a half-plane `p * t <= q`. A negative p means
    // the line enters through that edge and tightens `enter`; a positive p means
    // it leaves and tightens `exit`. p of zero is parallel to the edge, which is
    // only survivable if the line already starts on the inside.
    const clip = (p: number, q: number): boolean => {
      if (Math.abs(p) < 1e-12) return q >= 0;
      const t = q / p;
      if (p < 0) {
        if (t > enter) enter = t;
      } else if (t < exit) {
        exit = t;
      }
      return true;
    };
    if (!clip(-dx, first.x) || !clip(dx, width - first.x)) return null;
    if (!clip(-dy, first.y) || !clip(dy, height - first.y)) return null;
    if (!(enter <= exit) || !Number.isFinite(enter) || !Number.isFinite(exit)) return null;

    return [
      { x: first.x + dx * enter, y: first.y + dy * enter },
      { x: first.x + dx * exit, y: first.y + dy * exit },
    ];
  };

  for (const entity of valuesByStableId(scene.entities)) {
    if (entity.hidden) continue;
    const stroke = entity.strokeColor ?? entity.color ?? DEFAULT_STROKE_2D;
    const strokeWidth = entity.width ?? 2;

    if (entity.kind === 'polygon') {
      const points = pointsFor(entity.pointIds);
      if (!points || points.length < 3) continue;
      push({
        kind: 'polygon',
        points,
        fill: entity.fillColor ?? entity.color ?? DEFAULT_FILL_2D,
        fillOpacity: 0.25,
        stroke,
        strokeWidth,
      }, LAYER_FILL, entity.id);
      continue;
    }

    if (entity.kind === 'circle') {
      const center = scene.points[entity.centerId];
      if (!center || center.kind !== 'point2d' || !(entity.radius > 0)) continue;
      const screenCenter = toScreen(center);
      const radius = entity.radius * zoom;
      // Sampled rather than emitted as <circle>, so every primitive here is one
      // of the same four kinds the 3D renderer already knows how to serialize.
      const steps = 64;
      const points: Vector2[] = [];
      for (let index = 0; index <= steps; index += 1) {
        const angle = (index / steps) * Math.PI * 2;
        points.push({ x: screenCenter.x + Math.cos(angle) * radius, y: screenCenter.y + Math.sin(angle) * radius });
      }
      push({ kind: 'polyline', points, stroke, strokeWidth }, LAYER_CURVE, entity.id);
      continue;
    }

    if (entity.kind === 'conic' || entity.kind === 'parametricCurve' || entity.kind === 'locus') {
      const points = entity.points
        .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
        .map(toScreen);
      if (points.length < 2) continue;
      push({ kind: 'polyline', points, stroke, strokeWidth }, LAYER_CURVE, entity.id);
      continue;
    }

    if (entity.kind === 'arc') {
      const center = scene.points[entity.centerId];
      const start = scene.points[entity.startId];
      const end = scene.points[entity.endId];
      if (!center || !start || !end || center.kind !== 'point2d') continue;
      const radius = Math.hypot(start.x - center.x, start.y - center.y);
      if (!(radius > 0)) continue;
      const from = Math.atan2(start.y - center.y, start.x - center.x);
      let to = Math.atan2(end.y - center.y, end.x - center.x);
      if (to <= from) to += Math.PI * 2;
      const steps = 48;
      const points: Vector2[] = [];
      for (let index = 0; index <= steps; index += 1) {
        const angle = from + ((to - from) * index) / steps;
        points.push(toScreen({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }));
      }
      push({ kind: 'polyline', points, stroke, strokeWidth }, LAYER_CURVE, entity.id);
      continue;
    }

    if (entity.kind === 'segment' || entity.kind === 'vector' || entity.kind === 'ray' || entity.kind === 'line') {
      const points = pointsFor(entity.pointIds);
      if (!points || points.length < 2) continue;
      const [first, second] = points as [Vector2, Vector2];
      if (entity.kind === 'segment' || entity.kind === 'vector') {
        push({ kind: 'polyline', points: [first, second], stroke, strokeWidth }, LAYER_LINE, entity.id);
        continue;
      }
      const span = spanAcrossView(first, second, entity.kind === 'ray');
      if (!span) continue;
      push({ kind: 'polyline', points: span, stroke, strokeWidth }, LAYER_LINE, entity.id);
      continue;
    }

    if (entity.kind === 'angle') {
      const points = pointsFor(entity.pointIds);
      if (!points || points.length < 3) continue;
      const [armA, vertex, armB] = points as [Vector2, Vector2, Vector2];
      const radius = entity.radius !== undefined ? entity.radius * zoom : 24;
      const from = Math.atan2(armA.y - vertex.y, armA.x - vertex.x);
      const to = Math.atan2(armB.y - vertex.y, armB.x - vertex.x);
      const steps = 24;
      const arc: Vector2[] = [];
      for (let index = 0; index <= steps; index += 1) {
        const angle = from + (to - from) * (index / steps);
        arc.push({ x: vertex.x + Math.cos(angle) * radius, y: vertex.y + Math.sin(angle) * radius });
      }
      push({ kind: 'polyline', points: arc, stroke, strokeWidth: Math.max(1, strokeWidth - 1) }, LAYER_LINE, entity.id);
      continue;
    }
  }

  for (const point of valuesByStableId(scene.points)) {
    if (point.kind !== 'point2d' || point.hidden) continue;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const primitive: Omit<PointPrimitive, 'depth' | 'sequence'> = {
      kind: 'point',
      point: toScreen(point),
      color: point.color ?? DEFAULT_POINT_COLOR_2D,
    };
    if (point.label !== undefined) primitive.label = point.label;
    push(primitive, LAYER_POINT, point.id);
  }

  primitives.sort((first, second) => {
    const depthOrder = second.depth - first.depth;
    return depthOrder !== 0 ? depthOrder : first.sequence - second.sequence;
  });

  return {
    snapshot,
    limits,
    width,
    height,
    background: String(background),
    primitives,
    label: 'Klein 2D geometry scene',
    describe,
    focusable,
    measurementPanel: false,
  };
}

/**
 * A figure reduced to the four shapes every backend knows how to draw, with
 * everything a serializer needs to write it out.
 *
 * <p>Separated from the writing so that a second format is a second serializer
 * rather than a second renderer. A PDF drawn from its own reading of the scene
 * would drift from the SVG the first time either changed, and "the print does
 * not match the screen" is a bug nobody can reproduce from a description.
 */
interface CollectedFigure {
  snapshot: GeometryLabSnapshot;
  limits: GeometryLabComplexityLimits;
  width: number;
  height: number;
  background: string;
  primitives: SvgPrimitive[];
  label: string;
  describe: boolean;
  focusable: boolean;
  measurementPanel: boolean;
}

/** Renders the 2D scene as SVG. */
export function renderGeometryLabSvg2D(
  snapshot: GeometryLabSnapshot,
  options: Partial<ExportOptions> = {},
  complexityLimits: Partial<GeometryLabComplexityLimits> = {},
): string {
  return serializeFigureSvg(collectFigure2D(snapshot, options, complexityLimits));
}

/** Renders the 3D scene as SVG. */
export function renderGeometryLabSvg3D(
  snapshot: GeometryLabSnapshot,
  options: Partial<ExportOptions> = {},
  complexityLimits: Partial<GeometryLabComplexityLimits> = {},
): string {
  return serializeFigureSvg(collectFigure3D(snapshot, options, complexityLimits));
}

/**
 * Which scene a figure is: the one it is looking at, unless that is the plane
 * and the plane is empty.
 *
 * <p>Lives here rather than in the instrument because every backend has to
 * agree about it - a PDF of the 3D scene beside an SVG of the 2D one would be
 * two pictures of different figures.
 */
export function rendersTwoDimensionalScene(snapshot: GeometryLabSnapshot): boolean {
  if (snapshot.appState.activeView === '3d') return false;
  const scene2d = snapshot.scene.scene2d;
  return Object.keys(scene2d.points).length > 0 || Object.keys(scene2d.entities).length > 0;
}

/**
 * Where every object is on screen, for anything that needs to answer "what is
 * under the pointer".
 *
 * <p>The same primitives the renderer draws, which is the only way the answer
 * can be right: hit testing against a second, independent reading of the scene
 * would disagree with the picture at exactly the places that matter - a
 * clipped line, a sampled circle, the near plane of a solid.
 */
export interface GeometryLabFigureGeometry {
  readonly width: number;
  readonly height: number;
  /** Screen positions of the points, which are what a pointer usually wants. */
  readonly points: readonly { readonly id: string; readonly at: Vector2 }[];
  /** Screen polylines for everything else, closed for a filled shape. */
  readonly paths: readonly {
    readonly id: string;
    readonly points: readonly Vector2[];
    readonly closed: boolean;
  }[];
}

/** Reads the figure's screen geometry, drawn exactly as the renderer draws it. */
export function geometryLabFigureGeometry(
  snapshot: GeometryLabSnapshot,
  options: Partial<ExportOptions> = {},
  complexityLimits: Partial<GeometryLabComplexityLimits> = {},
): GeometryLabFigureGeometry {
  const figure = rendersTwoDimensionalScene(snapshot)
    // Descriptions are the protocol, which hit testing does not need and would
    // pay for on every view change.
    ? collectFigure2D(snapshot, { ...options, describeObjects: false }, complexityLimits)
    : collectFigure3D(snapshot, { ...options, describeObjects: false }, complexityLimits);

  const points: { id: string; at: Vector2 }[] = [];
  const paths: { id: string; points: Vector2[]; closed: boolean }[] = [];
  for (const primitive of figure.primitives) {
    if (primitive.kind === 'point') {
      if (primitive.sourceId) points.push({ id: primitive.sourceId, at: primitive.point });
      continue;
    }
    if (primitive.kind === 'text') continue;
    if (primitive.sourceId) {
      paths.push({ id: primitive.sourceId, points: primitive.points, closed: primitive.kind === 'polygon' });
    }
  }
  return { width: figure.width, height: figure.height, points, paths };
}

/** Renders the figure as a one-page PDF. */
export function renderGeometryLabPdf(
  snapshot: GeometryLabSnapshot,
  options: Partial<ExportOptions> = {},
  complexityLimits: Partial<GeometryLabComplexityLimits> = {},
): string {
  const figure = rendersTwoDimensionalScene(snapshot)
    ? collectFigure2D(snapshot, options, complexityLimits)
    : collectFigure3D(snapshot, options, complexityLimits);
  const output = pdfDocument(serializeFigurePdf(figure), { width: figure.width, height: figure.height });
  assertGeometryLabExportOutputComplexity(output, figure.limits);
  return output;
}

/**
 * The same primitives, written as PDF operators.
 *
 * <p>PDF puts its origin at the bottom left and SVG at the top left, so every
 * y is flipped once here rather than at each use. Everything else is a direct
 * translation - `m`/`l` for a path, `f`/`S` to fill or stroke it - because the
 * primitives were already reduced to the four shapes both formats have.
 */
function serializeFigurePdf(figure: CollectedFigure): string {
  const flip = (point: Vector2): Vector2 => ({ x: point.x, y: figure.height - point.y });
  const commands: string[] = [];

  if (figure.background !== 'transparent') {
    commands.push('q', pdfFillColor(figure.background), `0 0 ${pdfNumber(figure.width)} ${pdfNumber(figure.height)} re f`, 'Q');
  }

  for (const primitive of figure.primitives) {
    if (primitive.kind === 'polygon' || primitive.kind === 'polyline') {
      const points = primitive.points.map(flip);
      const first = points[0];
      if (!first || points.length < 2) continue;
      const path = [`${pdfNumber(first.x)} ${pdfNumber(first.y)} m`];
      for (const point of points.slice(1)) path.push(`${pdfNumber(point.x)} ${pdfNumber(point.y)} l`);
      if (primitive.kind === 'polygon') {
        commands.push(
          'q',
          pdfFillColor(blendOntoBackground(primitive.fill, primitive.fillOpacity, figure.background)),
          pdfStrokeColor(primitive.stroke),
          `${pdfNumber(primitive.strokeWidth)} w`,
          ...path,
          'h B',
          'Q',
        );
      } else {
        commands.push('q', pdfStrokeColor(primitive.stroke), `${pdfNumber(primitive.strokeWidth)} w`, ...path, 'S', 'Q');
      }
      continue;
    }
    if (primitive.kind === 'text') {
      commands.push(pdfText(primitive.text, { x: primitive.point.x + 4, y: primitive.point.y - 4 }, primitive.color, { width: figure.width, height: figure.height }));
      continue;
    }
    const centre = flip(primitive.point);
    // A dot, as four Bezier arcs - PDF has no circle operator, and a square
    // where the screen shows a disc would be a different drawing.
    commands.push('q', pdfFillColor(primitive.color), ...pdfCircle(centre, 3.5), 'f', 'Q');
    if (primitive.label !== undefined) {
      commands.push(pdfText(primitive.label, { x: primitive.point.x + 5, y: primitive.point.y - 5 }, '#172033', { width: figure.width, height: figure.height }, 11));
    }
  }

  if (figure.measurementPanel) {
    const measurements = Object.values(figure.snapshot.scene.scene3d.measurements ?? {})
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(0, 8);
    measurements.forEach((measurement, index) => {
      const text = `${measurement.label ?? measurement.kind}: ${formatNumber(measurement.value)} ${measurement.unit ?? ''}`.trim();
      commands.push(pdfText(text, { x: 12, y: 20 + index * 16 }, '#172033', { width: figure.width, height: figure.height }));
    });
  }

  return commands.join('\n');
}

/** The magic constant that makes four cubic Beziers into a circle. */
const KAPPA = 0.5522847498307936;

function pdfCircle(centre: Vector2, radius: number): string[] {
  const offset = radius * KAPPA;
  const { x, y } = centre;
  return [
    `${pdfNumber(x + radius)} ${pdfNumber(y)} m`,
    `${pdfNumber(x + radius)} ${pdfNumber(y + offset)} ${pdfNumber(x + offset)} ${pdfNumber(y + radius)} ${pdfNumber(x)} ${pdfNumber(y + radius)} c`,
    `${pdfNumber(x - offset)} ${pdfNumber(y + radius)} ${pdfNumber(x - radius)} ${pdfNumber(y + offset)} ${pdfNumber(x - radius)} ${pdfNumber(y)} c`,
    `${pdfNumber(x - radius)} ${pdfNumber(y - offset)} ${pdfNumber(x - offset)} ${pdfNumber(y - radius)} ${pdfNumber(x)} ${pdfNumber(y - radius)} c`,
    `${pdfNumber(x + offset)} ${pdfNumber(y - radius)} ${pdfNumber(x + radius)} ${pdfNumber(y - offset)} ${pdfNumber(x + radius)} ${pdfNumber(y)} c`,
  ];
}

/**
 * A translucent fill, flattened against what is behind it.
 *
 * <p>Transparency in PDF needs a graphics-state dictionary and a resource entry
 * for every distinct alpha, which is a lot of file for one thing: mixing the
 * colour with the background gives the same picture wherever the shape is not
 * overlapping something else, which for a geometry figure is nearly always.
 */
function blendOntoBackground(fill: string, opacity: number, background: string): string {
  const alpha = Math.max(0, Math.min(1, opacity));
  const behind = background === 'transparent' ? '#ffffff' : background;
  const front = parsePdfColor(fill, false);
  const back = parsePdfColor(behind, false);
  const mix = (one: number, other: number): number => Math.round((one * alpha + other * (1 - alpha)) * 255);
  const hex = (value: number): string => value.toString(16).padStart(2, '0');
  return `#${hex(mix(front.r, back.r))}${hex(mix(front.g, back.g))}${hex(mix(front.b, back.b))}`;
}

/**
 * Renders the figure as LaTeX: a TikZ picture and a table of measurements.
 *
 * <p>A fragment rather than a document, because what a teacher wants is
 * something to paste into a worksheet they have already started. The packages
 * it needs are named in a comment at the top so the paste does not fail
 * silently.
 *
 * <p>The picture is the same primitives again, which is the point of collecting
 * them: TikZ draws lines, filled paths, discs and text, and so does everything
 * else here.
 */
export function renderGeometryLabLatex(
  snapshot: GeometryLabSnapshot,
  options: Partial<ExportOptions> = {},
  complexityLimits: Partial<GeometryLabComplexityLimits> = {},
): string {
  const figure = rendersTwoDimensionalScene(snapshot)
    ? collectFigure2D(snapshot, options, complexityLimits)
    : collectFigure3D(snapshot, options, complexityLimits);

  const colors = new Map<string, string>();
  const colorName = (value: string): string => {
    const hex = pdfHex(value);
    const existing = colors.get(hex);
    if (existing) return existing;
    const name = `kleinColor${colors.size}`;
    colors.set(hex, name);
    return name;
  };

  const body: string[] = [];
  for (const primitive of figure.primitives) {
    if (primitive.kind === 'polygon') {
      const path = primitive.points.map(tikzPoint).join(' -- ');
      body.push(`  \\filldraw[draw=${colorName(primitive.stroke)}, fill=${colorName(primitive.fill)}, fill opacity=${round3(primitive.fillOpacity)}, line width=${round3(primitive.strokeWidth)}pt] ${path} -- cycle;`);
      continue;
    }
    if (primitive.kind === 'polyline') {
      body.push(`  \\draw[${colorName(primitive.stroke)}, line width=${round3(primitive.strokeWidth)}pt] ${primitive.points.map(tikzPoint).join(' -- ')};`);
      continue;
    }
    if (primitive.kind === 'text') {
      body.push(`  \\node[anchor=south west, text=${colorName(primitive.color)}] at ${tikzPoint({ x: primitive.point.x + 4, y: primitive.point.y - 4 })} {${escapeLatex(primitive.text)}};`);
      continue;
    }
    body.push(`  \\fill[${colorName(primitive.color)}] ${tikzPoint(primitive.point)} circle (3.5pt);`);
    if (primitive.label !== undefined) {
      body.push(`  \\node[anchor=south west] at ${tikzPoint({ x: primitive.point.x + 5, y: primitive.point.y - 5 })} {${escapeLatex(primitive.label)}};`);
    }
  }

  const lines = [
    '% Needs \\usepackage{tikz} in the preamble.',
    ...[...colors.entries()].map(([hex, name]) => `\\definecolor{${name}}{HTML}{${hex.slice(1).toUpperCase()}}`),
    // y is negated so the coordinates are the ones the figure is drawn at:
    // TikZ counts upwards and a rendered figure counts downwards.
    '\\begin{tikzpicture}[x=1pt, y=-1pt]',
    ...body,
    '\\end{tikzpicture}',
  ];

  const measurements = latexMeasurements(snapshot);
  if (measurements.length > 0) {
    lines.push(
      '',
      '\\begin{tabular}{ll}',
      '\\textbf{Measurement} & \\textbf{Value} \\\\',
      '\\hline',
      ...measurements,
      '\\end{tabular}',
    );
  }

  const output = lines.join('\n');
  assertGeometryLabExportOutputComplexity(output, figure.limits);
  return output;
}

/**
 * A measurement's label and value as table cells.
 *
 * <p>A label that reads as an expression is set as mathematics rather than as
 * text, through the shared parser and formatter - so `x^2 + 1` comes out as
 * real superscripts instead of a caret. A label that is not an expression is
 * escaped and left alone, which is most of them.
 */
function latexMeasurements(snapshot: GeometryLabSnapshot): string[] {
  const rows: string[] = [];
  const add = (label: string, value: number, unit: string | undefined): void => {
    const amount = Number.isFinite(value) ? round3(value) : value;
    rows.push(`${latexLabel(label)} & $${amount}${latexUnit(unit)}$ \\\\`);
  };
  for (const measurement of Object.values(snapshot.scene.scene2d.measurements ?? {})
    .sort((left, right) => left.id.localeCompare(right.id))) {
    if (measurement.hidden) continue;
    add(measurement.label ?? measurement.kind, measurement.value, measurement.unit);
  }
  for (const measurement of Object.values(snapshot.scene.scene3d.measurements ?? {})
    .sort((left, right) => left.id.localeCompare(right.id))) {
    add(measurement.label ?? measurement.kind, measurement.value, measurement.unit);
  }
  return rows;
}

/**
 * A unit as mathematics.
 *
 * <p>Written out rather than escaped, because the escaping is wrong inside a
 * formula: `u^2` run through the text escaper comes out as a literal caret
 * where a superscript was meant, and degrees want the symbol rather than the
 * letters. The set is small and closed, so naming its members is simpler than
 * teaching the escaper about mathematics.
 */
function latexUnit(unit: string | undefined): string {
  if (unit === undefined || unit === '') return '';
  if (unit === 'deg') return '^{\\circ}';
  const power = /^([a-z]+)\^(\d+)$/i.exec(unit);
  if (power) return `\\;\\mathrm{${power[1]}}^{${power[2]}}`;
  return `\\;\\mathrm{${escapeLatex(unit)}}`;
}

function latexLabel(label: string): string {
  // Only worth setting as mathematics when it actually reads as an expression:
  // a plain word parses as a variable, and `$AB$` is italic nonsense.
  if (!/[-+*/^()]|\d/.test(label)) return escapeLatex(label);
  try {
    const parsed = parseMath(label);
    if (parsed.warnings.length === 0) return `$${formatMathNode(parsed.ast, 'latex')}$`;
  } catch {
    // Not an expression; the escaped text is the right answer.
  }
  return escapeLatex(label);
}

function tikzPoint(point: Vector2): string {
  return `(${round3(point.x)}pt, ${round3(point.y)}pt)`;
}

function escapeLatex(value: string): string {
  return value.replace(/[\\&%$#_{}~^]/g, match => ({
    '\\': '\\textbackslash{}',
    '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#', '_': '\\_',
    '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
  }[match] ?? match));
}

/** A colour as `#rrggbb`, whatever notation it arrived in. */
function pdfHex(color: string): string {
  const rgb = parsePdfColor(color, false);
  const channel = (value: number): string => Math.round(value * 255).toString(16).padStart(2, '0');
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

function round3(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 1e3) / 1e3;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function serializeFigureSvg(figure: CollectedFigure): string {
  const builder = new BoundedSvgOutput(figure.limits.maxExportBytes);
  builder.append(svgRoot(
    figure.width,
    figure.height,
    figure.label,
    figure.describe ? geometryLabFigureSummary(figure.snapshot) : null,
    figure.describe,
  ));
  builder.append(`<rect width="100%" height="100%" fill="${escapeXml(figure.background)}"/>`);
  builder.append(`<g stroke-linecap="round" stroke-linejoin="round" font-family="${KLEIN_UI_FONT_STACK.replace(/"/g, '&quot;')}">`);
  const emitted = new Set<string>();
  for (const primitive of figure.primitives) {
    builder.append(renderPrimitive(primitive, figure.focusable, emitted));
  }
  if (figure.measurementPanel) builder.append(renderMeasurementsSvg(figure.snapshot, figure.width));
  builder.append('</g></svg>');
  const output = builder.toString();
  assertGeometryLabExportOutputComplexity(output, figure.limits);
  return output;
}
