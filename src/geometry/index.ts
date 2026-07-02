import { createIdFactory, KleinSdkError } from '../core/index.js';
import type {
  ApplyDeltaOptions,
  DeltaMeta,
  ExportOptions,
  ExportResult,
  InstrumentOptions,
  JsonValue,
  KleinInstrument,
  LoadOptions,
  Vector2,
  View2D,
} from '../core/index.js';
import {
  buildGeometryDependencyGraph,
  buildGeometryObjectPanelRows,
  createEmptyGeometryScene,
  distance2D,
  geometryAngleBisectorPoint2D,
  geometryConstraintDependencies,
  geometryConstructionSourceIds,
  geometryCircleTangentPoint2D,
  geometryDependentsOf,
  geometryCircumcircle2D,
  geometryEntityPointIds,
  geometryIntersectionPoint2D,
  geometryIntersectionPoints2D,
  geometryLine3DForEntity,
  geometryLineLikeIntersection2D,
  geometryLinePlaneIntersection3D,
  geometryObjectDependencies,
  geometryPlaneEquation3D,
  geometryPlanePlaneIntersection3D,
  lineEquationFrom2DPoints,
  midpoint2D,
  normalizeGeometryLineEquation,
  normalizeGeometryPlaneEquation3D,
  planeEquationFrom3DPoints,
  recomputeGeometryDependents,
  recomputeGeometryScene,
  summarizeGeometryConstraints,
  summarizeGeometryObjects,
} from '../geometry-core/index.js';
import type {
  AngleEntity,
  ArcEntity,
  CircleEntity,
  GeometryConstraint,
  GeometryConstraintSummary,
  GeometryConstruction,
  GeometryCoreSnapshot,
  GeometryDependencyGraph,
  GeometryDimension,
  GeometryEntity,
  GeometryEntityDisplay,
  GeometryLine3D,
  GeometryLineEquation,
  GeometryObjectPanelOptions,
  GeometryObjectPanelRow,
  GeometryObjectSummary,
  GeometryObjectSummaryOptions,
  GeometryPoint,
  GeometryPoint2D,
  GeometryPoint3D,
  GeometryPlaneEquation3D,
  GeometryScene,
  LineEntity,
  LocusEntity,
  PlaneEntity,
  PolygonEntity,
  RayEntity,
  SegmentEntity,
  VectorEntity,
} from '../geometry-core/index.js';

export {
  buildGeometryDependencyGraph,
  buildGeometryObjectPanelRows,
  createEmptyGeometryScene,
  distance2D,
  geometryAngleBisectorPoint2D,
  geometryCircleTangentPoint2D,
  geometryConstraintDependencies,
  geometryConstructionSourceIds,
  geometryDependentsOf,
  geometryCircumcircle2D,
  geometryEntityPointIds,
  geometryIntersectionPoint2D,
  geometryIntersectionPoints2D,
  geometryLine3DForEntity,
  geometryLineLikeIntersection2D,
  geometryLinePlaneIntersection3D,
  geometryObjectDependencies,
  geometryPlaneEquation3D,
  geometryPlanePlaneIntersection3D,
  lineEquationFrom2DPoints,
  midpoint2D,
  normalizeGeometryLineEquation,
  normalizeGeometryPlaneEquation3D,
  planeEquationFrom3DPoints,
  recomputeGeometryDependents,
  recomputeGeometryScene,
  summarizeGeometryConstraints,
  summarizeGeometryObjects,
};
export type {
  AngleEntity,
  ArcEntity,
  CircleEntity,
  GeometryConstraint,
  GeometryConstraintSummary,
  GeometryConstruction,
  GeometryCoreSnapshot,
  GeometryDependencyGraph,
  GeometryDimension,
  GeometryEntity,
  GeometryEntityDisplay,
  GeometryLine3D,
  GeometryLineEquation,
  GeometryObjectPanelOptions,
  GeometryObjectPanelRow,
  GeometryObjectSummary,
  GeometryObjectSummaryOptions,
  GeometryPoint,
  GeometryPoint2D,
  GeometryPoint3D,
  GeometryPlaneEquation3D,
  GeometryScene,
  LineEntity,
  LocusEntity,
  PlaneEntity,
  PolygonEntity,
  RayEntity,
  SegmentEntity,
  VectorEntity,
};

/** Tool ids for the precise GeoGebra-style 2D geometry calculator surface. */
export type GeometryCalculatorTool =
  | 'select'
  | 'move'
  | 'pan'
  | 'point'
  | 'pointOnObject'
  | 'intersect'
  | 'midpoint'
  | 'line'
  | 'segment'
  | 'ray'
  | 'vector'
  | 'perpendicular'
  | 'parallel'
  | 'tangent'
  | 'angleBisector'
  | 'polygon'
  | 'triangle'
  | 'rectangle'
  | 'square'
  | 'regularPolygon'
  | 'circle'
  | 'circleThroughPoints'
  | 'arc'
  | 'angle'
  | 'distance'
  | 'area'
  | 'reflect'
  | 'rotate'
  | 'translate'
  | 'dilate'
  | 'slider'
  | 'text'
  | 'remove';

/** Selection shape used by the 2D geometry calculator. */
export type GeometryCalculatorSelection =
  | { kind: 'point'; id: string }
  | { kind: 'entity'; id: string };

/** Geometry calculator scene with explicit entity draw order. */
export interface GeometryCalculatorScene extends GeometryScene {
  order: string[];
}

/** Grid and unit settings. World coordinates are stored in these unit values. */
export interface GeometryGridOptions {
  unitSize: number;
  majorEvery: number;
  snap: boolean;
  labels: boolean;
}

/** UI state that can be persisted with a 2D geometry scene. */
export interface GeometryCalculatorAppState {
  view: View2D;
  activeTool: GeometryCalculatorTool;
  selected: GeometryCalculatorSelection | null;
  grid: GeometryGridOptions;
}

/** Versioned 2D geometry calculator snapshot. */
export type GeometryCalculatorSnapshot = {
  version: 1;
  instrument: 'geometry';
  scene: GeometryCalculatorScene;
  appState: GeometryCalculatorAppState;
  metadata?: {
    title?: string;
    locale?: string;
    createdAt?: number;
    updatedAt?: number;
  };
};

/** Geometry calculator edit operations. View changes are local app-state deltas. */
export type GeometryCalculatorDelta =
  | { op: 'addPoint'; point: GeometryPoint2D }
  | { op: 'updatePoint'; id: string; changes: Partial<GeometryPoint2D> }
  | { op: 'addEntity'; entity: GeometryEntity }
  | { op: 'updateEntity'; id: string; changes: Partial<GeometryEntity> }
  | { op: 'addConstraint'; constraint: GeometryConstraint }
  | { op: 'updateConstraint'; id: string; changes: Partial<GeometryConstraint> }
  | { op: 'deleteConstraint'; ids: string[] }
  | { op: 'delete'; ids: string[] }
  | { op: 'setTool'; tool: GeometryCalculatorTool }
  | { op: 'setSelection'; selection: GeometryCalculatorSelection | null }
  | { op: 'setView'; view: View2D }
  | { op: 'clear' }
  | { op: 'batch'; deltas: GeometryCalculatorDelta[] };

/** Common style options accepted by imperative geometry construction methods. */
export interface GeometryStyleOptions {
  label?: string;
  color?: string;
  strokeColor?: string;
  fillColor?: string;
  width?: number;
  hidden?: boolean;
  locked?: boolean;
}

/** Locus/path creation options. */
export interface GeometryLocusOptions extends GeometryStyleOptions {
  closed?: boolean;
}

/** Built-in geometry tool themes. */
export type GeometryCalculatorThemeName = 'light' | 'dark';

/** Resolved visual tokens used by the framework-independent geometry calculator. */
export interface GeometryCalculatorTheme {
  name: GeometryCalculatorThemeName | string;
  colorScheme: 'light' | 'dark';
  background: string;
  surface: string;
  surfaceRaised: string;
  canvas: string;
  border: string;
  text: string;
  mutedText: string;
  faintText: string;
  inputBackground: string;
  buttonBackground: string;
  buttonText: string;
  buttonBorder: string;
  buttonActiveBackground: string;
  buttonActiveText: string;
  accent: string;
  drawColor: string;
  pointColor: string;
  fill: string;
  selection: string;
  gridMinor: string;
  gridMajor: string;
  axis: string;
  gridLabel: string;
  draft: string;
  textHalo: string;
  angle: string;
  angleText: string;
}

/** Theme input accepted by the calculator. Partial custom tokens extend the light theme. */
export type GeometryCalculatorThemeInput =
  | GeometryCalculatorThemeName
  | Partial<GeometryCalculatorTheme>;

/** Constraint input accepted by the calculator; an id is generated when omitted. */
export type GeometryConstraintDraft =
  | (Omit<Extract<GeometryConstraint, { kind: 'fixedLength' }>, 'id'> & { id?: string })
  | (Omit<Extract<GeometryConstraint, { kind: 'fixedAngle' }>, 'id'> & { id?: string })
  | (Omit<Extract<GeometryConstraint, { kind: 'parallel' }>, 'id'> & { id?: string })
  | (Omit<Extract<GeometryConstraint, { kind: 'perpendicular' }>, 'id'> & { id?: string })
  | (Omit<Extract<GeometryConstraint, { kind: 'equalLength' }>, 'id'> & { id?: string })
  | (Omit<Extract<GeometryConstraint, { kind: 'equalRadius' }>, 'id'> & { id?: string });

/** Shape presets supported by the first 2D geometry canvas. */
export type GeometryShapeKind =
  | 'triangle'
  | 'rightTriangle'
  | 'equilateralTriangle'
  | 'square'
  | 'rectangle'
  | 'regularPolygon'
  | 'parallelogram';

/** Factory options layered over the common instrument options. */
export type GeometryCalculatorOptions = InstrumentOptions<
  GeometryCalculatorSnapshot,
  GeometryCalculatorDelta
> & {
  unitSize?: number;
  gridMajorEvery?: number;
  snapToGrid?: boolean;
  showControls?: boolean;
  initialTool?: GeometryCalculatorTool;
  theme?: GeometryCalculatorThemeInput;
};

/** Public 2D geometry calculator instance with imperative construction helpers. */
export interface GeometryCalculator extends KleinInstrument<
  GeometryCalculatorSnapshot,
  GeometryCalculatorDelta,
  GeometryCalculatorTool
> {
  readonly canvas: HTMLCanvasElement | null;
  screenToWorld(point: Vector2): Vector2;
  worldToScreen(point: Vector2): Vector2;
  getDependencyGraph(): GeometryDependencyGraph;
  getObjectDependencies(objectId: string): string[];
  getObjectSummaries(options?: GeometryObjectSummaryOptions): GeometryObjectSummary[];
  getObjectPanelRows(options?: GeometryObjectPanelOptions): GeometryObjectPanelRow[];
  getConstraints(): GeometryConstraint[];
  getConstraintSummaries(): GeometryConstraintSummary[];
  getTheme(): GeometryCalculatorTheme;
  setTheme(theme: GeometryCalculatorThemeInput): void;
  resetView(): void;
  setView(view: Partial<View2D>): void;
  addPoint(point: Vector2 & GeometryStyleOptions): string;
  addMidpoint(firstPointId: string, secondPointId: string, style?: GeometryStyleOptions): string;
  addIntersection(firstEntityId: string, secondEntityId: string, style?: GeometryStyleOptions, index?: number): string;
  addIntersections(firstEntityId: string, secondEntityId: string, style?: GeometryStyleOptions): string[];
  addParallelLine(sourceEntityId: string, throughPointId: string, style?: GeometryStyleOptions): string;
  addPerpendicularLine(sourceEntityId: string, throughPointId: string, style?: GeometryStyleOptions): string;
  addTangentLines(circleEntityId: string, throughPointId: string, style?: GeometryStyleOptions): string[];
  addAngleBisectorByPoints(pointIds: [string, string, string], style?: GeometryStyleOptions): string;
  addLineByPoints(firstPointId: string, secondPointId: string, style?: GeometryStyleOptions): string;
  addLineByEquation(equation: string | GeometryLineEquation, style?: GeometryStyleOptions): string;
  addSegmentByPoints(firstPointId: string, secondPointId: string, style?: GeometryStyleOptions): string;
  addPolygon(pointIds: string[], style?: GeometryStyleOptions): string;
  addPolygonByCoordinates(points: Vector2[], style?: GeometryStyleOptions): string;
  addLocus(points: Vector2[], options?: GeometryLocusOptions): string;
  addCircle(centerPointId: string, radius: number, style?: GeometryStyleOptions): string;
  addCircleByCenterPoint(centerPointId: string, radiusPointId: string, style?: GeometryStyleOptions): string;
  addCircleThroughPoints(pointIds: [string, string, string], style?: GeometryStyleOptions): string;
  addCircleByCoordinates(center: Vector2, radius: number, style?: GeometryStyleOptions): string;
  addShape(kind: GeometryShapeKind, center: Vector2, options?: ShapeCreationOptions): string;
  addAngleByPoints(pointIds: [string, string, string], style?: GeometryStyleOptions): string;
  addAngleBetweenEntities(
    firstEntityId: string,
    secondEntityId: string,
    style?: GeometryStyleOptions,
  ): string;
  addAngleAt(options: AngleCreationOptions): string;
  addConstraint(constraint: GeometryConstraintDraft): string;
  updateConstraint(id: string, changes: Partial<GeometryConstraint>): void;
  deleteConstraints(ids: string[]): void;
}

export interface ShapeCreationOptions extends GeometryStyleOptions {
  size?: number;
  width?: number;
  height?: number;
  sides?: number;
  radius?: number;
}

export interface AngleCreationOptions extends GeometryStyleOptions {
  vertex: Vector2;
  startDegrees?: number;
  degrees: number;
  armLength?: number;
}

interface ScreenRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

type HitTarget =
  | { selection: GeometryCalculatorSelection; distanceWorld: number }
  | null;

type DragState =
  | {
      kind: 'pan';
      pointerId: number;
      startScreen: Vector2;
      startView: View2D;
    }
  | {
      kind: 'movePoint';
      pointerId: number;
      pointId: string;
      startSnapshot: GeometryCalculatorSnapshot;
      startWorld: Vector2;
      original: GeometryPoint2D;
    }
  | {
      kind: 'press';
      pointerId: number;
      screen: Vector2;
      world: Vector2;
    };

const DEFAULT_DRAW_COLOR = '#2563eb';
const DEFAULT_POINT_COLOR = '#111827';
const DEFAULT_FILL = 'rgba(37, 99, 235, 0.12)';
const DEFAULT_WIDTH = 2;
const DEFAULT_UNIT_SIZE = 40;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 8;
const HIT_TOLERANCE_PX = 10;
const POINT_RADIUS_PX = 5;
const SVG_NS = 'http://www.w3.org/2000/svg';

const LIGHT_GEOMETRY_CALCULATOR_THEME: GeometryCalculatorTheme = {
  name: 'light',
  colorScheme: 'light',
  background: '#f8fafc',
  surface: '#f8fafc',
  surfaceRaised: '#ffffff',
  canvas: '#ffffff',
  border: '#d9e0e8',
  text: '#0f172a',
  mutedText: '#475569',
  faintText: '#64748b',
  inputBackground: '#ffffff',
  buttonBackground: '#ffffff',
  buttonText: '#0f172a',
  buttonBorder: '#cbd5e1',
  buttonActiveBackground: '#2563eb',
  buttonActiveText: '#ffffff',
  accent: '#2563eb',
  drawColor: DEFAULT_DRAW_COLOR,
  pointColor: DEFAULT_POINT_COLOR,
  fill: DEFAULT_FILL,
  selection: '#f97316',
  gridMinor: '#e7edf4',
  gridMajor: '#cbd5e1',
  axis: '#334155',
  gridLabel: '#64748b',
  draft: '#64748b',
  textHalo: 'rgba(255,255,255,0.9)',
  angle: '#f97316',
  angleText: '#92400e',
};

const DARK_GEOMETRY_CALCULATOR_THEME: GeometryCalculatorTheme = {
  name: 'dark',
  colorScheme: 'dark',
  background: '#1e242a',
  surface: '#252b31',
  surfaceRaised: '#303841',
  canvas: '#111923',
  border: '#414b55',
  text: '#f5f5f5',
  mutedText: '#a9b2ba',
  faintText: '#7e878f',
  inputBackground: '#252b31',
  buttonBackground: '#303841',
  buttonText: '#f5f5f5',
  buttonBorder: '#4b5563',
  buttonActiveBackground: '#ff6a3d',
  buttonActiveText: '#ffffff',
  accent: '#ff6a3d',
  drawColor: '#76abae',
  pointColor: '#f5f5f5',
  fill: 'rgba(118, 171, 174, 0.16)',
  selection: '#ff8a65',
  gridMinor: '#1d2733',
  gridMajor: '#2a3543',
  axis: '#7e878f',
  gridLabel: '#98a2b0',
  draft: '#9cc4c6',
  textHalo: 'rgba(17, 25, 35, 0.92)',
  angle: '#ff8a65',
  angleText: '#ffbd9e',
};

/** Creates a blank 2D geometry calculator snapshot. */
export function createEmptyGeometryCalculatorSnapshot(
  options: {
    unitSize?: number;
    gridMajorEvery?: number;
    snapToGrid?: boolean;
    activeTool?: GeometryCalculatorTool;
  } = {},
): GeometryCalculatorSnapshot {
  return {
    version: 1,
    instrument: 'geometry',
    scene: {
      ...createEmptyGeometryScene(),
      order: [],
    },
    appState: {
      view: { x: 0, y: 0, zoom: 1 },
      activeTool: options.activeTool ?? 'select',
      selected: null,
      grid: {
        unitSize: positiveNumber(options.unitSize, DEFAULT_UNIT_SIZE),
        majorEvery: Math.max(1, Math.round(positiveNumber(options.gridMajorEvery, 5))),
        snap: options.snapToGrid ?? true,
        labels: true,
      },
    },
  };
}

/** Converts a client/screen coordinate into world units for a given view. */
export function screenToGeometryWorld(
  point: Vector2,
  view: View2D,
  unitSize = DEFAULT_UNIT_SIZE,
  rect: Pick<ScreenRectLike, 'left' | 'top'> = { left: 0, top: 0 },
): Vector2 {
  const scale = unitSize * view.zoom;
  return {
    x: (point.x - rect.left - view.x) / scale,
    y: (view.y - (point.y - rect.top)) / scale,
  };
}

/** Converts world units into screen coordinates for a given view. */
export function geometryWorldToScreen(
  point: Vector2,
  view: View2D,
  unitSize = DEFAULT_UNIT_SIZE,
): Vector2 {
  const scale = unitSize * view.zoom;
  return {
    x: view.x + point.x * scale,
    y: view.y - point.y * scale,
  };
}

/** Clamps 2D canvas zoom to the range used by the interactive geometry surface. */
export function clampGeometryZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Parses common line equation forms into `a*x + b*y + c = 0`. */
export function parseGeometryLineEquation(input: string): GeometryLineEquation {
  const raw = input.trim();
  if (!raw) {
    throw new KleinSdkError('invalid_line_equation', 'Line equation cannot be empty.');
  }

  const normalized = raw
    .replace(/\u2212/g, '-')
    .replace(/\s+/g, '')
    .toLowerCase();
  const parts = normalized.split('=');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new KleinSdkError(
      'invalid_line_equation',
      'Use a linear equation such as y=2x+1, x=3, or 2x+3y-4=0.',
      raw,
    );
  }

  const left = parseLinearExpression(parts[0]);
  const right = parseLinearExpression(parts[1]);
  return normalizeLineEquation({
    a: left.a - right.a,
    b: left.b - right.b,
    c: left.c - right.c,
    input: raw,
  });
}

/** Returns a normalized line equation through two distinct 2D points. */
export function lineEquationFromPoints(a: Vector2, b: Vector2): GeometryLineEquation {
  const equation = lineEquationFrom2DPoints(a, b);
  if (!equation) {
    throw new KleinSdkError('degenerate_line', 'A line needs two distinct points.');
  }
  return equation;
}

/** Measures an angle in degrees for point triple A-vertex-C. */
export function angleMeasureDegrees(a: Vector2, vertex: Vector2, c: Vector2): number {
  const first = { x: a.x - vertex.x, y: a.y - vertex.y };
  const second = { x: c.x - vertex.x, y: c.y - vertex.y };
  const denominator = Math.hypot(first.x, first.y) * Math.hypot(second.x, second.y);
  if (denominator < 1e-9) return 0;
  const cos = Math.max(-1, Math.min(1, (first.x * second.x + first.y * second.y) / denominator));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Applies one geometry calculator delta to a snapshot. */
export function applyGeometryCalculatorDelta(
  snapshot: GeometryCalculatorSnapshot,
  delta: GeometryCalculatorDelta,
): GeometryCalculatorSnapshot {
  const next = applyGeometryCalculatorDeltaRaw(snapshot, delta);
  if (!geometryDeltaChangesScene(delta)) return next;
  return {
    ...next,
    scene: recomputeGeometryScene(next.scene),
  };
}

function applyGeometryCalculatorDeltaRaw(
  snapshot: GeometryCalculatorSnapshot,
  delta: GeometryCalculatorDelta,
): GeometryCalculatorSnapshot {
  switch (delta.op) {
    case 'batch':
      return delta.deltas.reduce(applyGeometryCalculatorDeltaRaw, snapshot);
    case 'clear':
      return {
        ...snapshot,
        scene: { ...createEmptyGeometryScene(), order: [] },
        appState: { ...snapshot.appState, selected: null },
      };
    case 'setTool':
      return { ...snapshot, appState: { ...snapshot.appState, activeTool: delta.tool } };
    case 'setSelection':
      return { ...snapshot, appState: { ...snapshot.appState, selected: delta.selection } };
    case 'setView':
      return { ...snapshot, appState: { ...snapshot.appState, view: { ...delta.view, zoom: clampGeometryZoom(delta.view.zoom) } } };
    case 'addPoint':
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          points: { ...snapshot.scene.points, [delta.point.id]: delta.point },
        },
      };
    case 'updatePoint': {
      const current = snapshot.scene.points[delta.id];
      if (!current || current.kind !== 'point2d') return snapshot;
      const next = { ...current, ...delta.changes, kind: 'point2d' as const };
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          points: { ...snapshot.scene.points, [delta.id]: next },
        },
      };
    }
    case 'addEntity':
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          entities: { ...snapshot.scene.entities, [delta.entity.id]: delta.entity },
          order: snapshot.scene.order.includes(delta.entity.id)
            ? snapshot.scene.order
            : [...snapshot.scene.order, delta.entity.id],
        },
      };
    case 'updateEntity': {
      const current = snapshot.scene.entities[delta.id];
      if (!current) return snapshot;
      const next = { ...current, ...delta.changes } as GeometryEntity;
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          entities: { ...snapshot.scene.entities, [delta.id]: next },
        },
      };
    }
    case 'addConstraint':
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          constraints: { ...(snapshot.scene.constraints ?? {}), [delta.constraint.id]: delta.constraint },
        },
      };
    case 'updateConstraint': {
      const current = snapshot.scene.constraints?.[delta.id];
      if (!current) return snapshot;
      const next = { ...current, ...delta.changes, id: current.id } as GeometryConstraint;
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          constraints: { ...(snapshot.scene.constraints ?? {}), [delta.id]: next },
        },
      };
    }
    case 'deleteConstraint': {
      const constraints = { ...(snapshot.scene.constraints ?? {}) };
      for (const id of delta.ids) delete constraints[id];
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          constraints,
        },
      };
    }
    case 'delete':
      return deleteGeometryIds(snapshot, delta.ids);
  }
}

function geometryDeltaChangesScene(delta: GeometryCalculatorDelta): boolean {
  switch (delta.op) {
    case 'addPoint':
    case 'updatePoint':
    case 'addEntity':
    case 'updateEntity':
    case 'addConstraint':
    case 'updateConstraint':
    case 'deleteConstraint':
    case 'delete':
    case 'clear':
      return true;
    case 'batch':
      return delta.deltas.some(geometryDeltaChangesScene);
    case 'setTool':
    case 'setSelection':
    case 'setView':
      return false;
  }
}

/** Creates the framework-independent 2D geometry calculator. */
export function createGeometryCalculator(
  options: GeometryCalculatorOptions = {},
): GeometryCalculator {
  const instrument = new GeometryCalculatorInstrument(options);
  if (options.container) {
    instrument.mount(options.container);
  }
  return instrument;
}

class GeometryCalculatorInstrument implements GeometryCalculator {
  readonly id: string;
  readonly kind = 'geometry';

  #ids = createIdFactory();
  #snapshot: GeometryCalculatorSnapshot;
  #options: GeometryCalculatorOptions;
  #theme: GeometryCalculatorTheme;
  #container: HTMLElement | undefined;
  #root: HTMLDivElement | undefined;
  #canvas: HTMLCanvasElement | undefined;
  #ctx: CanvasRenderingContext2D | undefined;
  #resizeObserver: ResizeObserver | undefined;
  #undoStack: GeometryCalculatorSnapshot[] = [];
  #redoStack: GeometryCalculatorSnapshot[] = [];
  #drag: DragState | null = null;
  #hoverWorld: Vector2 | null = null;
  #viewInitialized = false;
  #toolButtons: HTMLButtonElement[] = [];
  #statusEl: HTMLDivElement | undefined;
  #pendingLineStartId: string | null = null;
  #draftPolygonPointIds: string[] = [];
  #draftAnglePointIds: string[] = [];
  #draftAngleEntityIds: string[] = [];
  #draftCirclePointIds: string[] = [];
  #pendingReferenceEntityId: string | null = null;
  #pendingCircleCenterId: string | null = null;

  constructor(options: GeometryCalculatorOptions) {
    this.id = this.#ids.next('geometry');
    this.#options = options;
    this.#theme = resolveGeometryCalculatorTheme(options.theme);
    const snapshotOptions: Parameters<typeof createEmptyGeometryCalculatorSnapshot>[0] = {};
    if (options.unitSize !== undefined) snapshotOptions.unitSize = options.unitSize;
    if (options.gridMajorEvery !== undefined) snapshotOptions.gridMajorEvery = options.gridMajorEvery;
    if (options.snapToGrid !== undefined) snapshotOptions.snapToGrid = options.snapToGrid;
    if (options.initialTool !== undefined) snapshotOptions.activeTool = options.initialTool;
    this.#snapshot = cloneSnapshot(
      options.initialSnapshot
        ?? createEmptyGeometryCalculatorSnapshot(snapshotOptions),
    );
  }

  get canvas(): HTMLCanvasElement | null {
    return this.#canvas ?? null;
  }

  mount(container: HTMLElement): void {
    this.destroy();
    this.#container = container;
    container.dataset.kleinInstrument = this.kind;

    const root = document.createElement('div');
    root.className = 'klein-geometry-calculator';
    root.dataset.kleinTheme = this.#theme.colorScheme;
    applyGeometryCalculatorTheme(root, this.#theme);
    Object.assign(root.style, {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      minHeight: '420px',
      background: 'var(--kgc-background)',
      border: '1px solid var(--kgc-border)',
      borderRadius: '8px',
      overflow: 'hidden',
      color: 'var(--kgc-text)',
      colorScheme: this.#theme.colorScheme,
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    });

    if (this.#options.showControls !== false) {
      root.append(this.#createControls());
    }

    const canvasWrap = document.createElement('div');
    Object.assign(canvasWrap.style, {
      position: 'relative',
      flex: '1 1 auto',
      minHeight: '320px',
      background: 'var(--kgc-canvas)',
    });

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', 'Geometry canvas');
    canvas.tabIndex = 0;
    Object.assign(canvas.style, {
      display: 'block',
      width: '100%',
      height: '100%',
      cursor: this.#cursorForTool(this.#snapshot.appState.activeTool),
      touchAction: 'none',
      background: 'var(--kgc-canvas)',
    });
    canvas.addEventListener('pointerdown', this.#onPointerDown);
    canvas.addEventListener('pointermove', this.#onPointerMove);
    canvas.addEventListener('pointerup', this.#onPointerUp);
    canvas.addEventListener('pointercancel', this.#onPointerCancel);
    canvas.addEventListener('wheel', this.#onWheel, { passive: false });
    canvas.addEventListener('keydown', this.#onKeyDown);

    canvasWrap.append(canvas);
    root.append(canvasWrap);

    const status = document.createElement('div');
    Object.assign(status.style, {
      minHeight: '28px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '5px 10px',
      borderTop: '1px solid var(--kgc-border)',
      background: 'var(--kgc-surface)',
      color: 'var(--kgc-muted-text)',
      fontSize: '12px',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    });
    root.append(status);

    container.replaceChildren(root);
    this.#root = root;
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d') ?? undefined;
    this.#statusEl = status;

    if (typeof ResizeObserver !== 'undefined') {
      this.#resizeObserver = new ResizeObserver(() => this.#resizeCanvas());
      this.#resizeObserver.observe(canvasWrap);
    }
    window.addEventListener('resize', this.#resizeCanvas);
    this.#resizeCanvas();
    this.#updateToolbarState();
    this.#setStatus(this.#statusForTool());
    this.#render();
  }

  destroy(): void {
    window.removeEventListener('resize', this.#resizeCanvas);
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = undefined;

    if (this.#canvas) {
      this.#canvas.removeEventListener('pointerdown', this.#onPointerDown);
      this.#canvas.removeEventListener('pointermove', this.#onPointerMove);
      this.#canvas.removeEventListener('pointerup', this.#onPointerUp);
      this.#canvas.removeEventListener('pointercancel', this.#onPointerCancel);
      this.#canvas.removeEventListener('wheel', this.#onWheel);
      this.#canvas.removeEventListener('keydown', this.#onKeyDown);
    }

    if (this.#container?.dataset.kleinInstrument === this.kind) {
      delete this.#container.dataset.kleinInstrument;
    }
    this.#root?.remove();
    this.#container = undefined;
    this.#root = undefined;
    this.#canvas = undefined;
    this.#ctx = undefined;
    this.#statusEl = undefined;
    this.#toolButtons = [];
    this.#drag = null;
  }

  getSnapshot(): GeometryCalculatorSnapshot {
    return cloneSnapshot(this.#snapshot);
  }

  loadSnapshot(snapshot: GeometryCalculatorSnapshot, options: LoadOptions = {}): void {
    const currentView = this.#snapshot.appState.view;
    this.#snapshot = normalizeSnapshot(snapshot);
    if (options.preserveView) {
      this.#snapshot = {
        ...this.#snapshot,
        appState: { ...this.#snapshot.appState, view: currentView },
      };
    }
    this.#undoStack = [];
    this.#redoStack = [];
    this.#cancelDrafts();
    this.#viewInitialized = false;
    this.#resizeCanvas();
    this.#updateToolbarState();
    this.#render();
  }

  applyDelta(delta: GeometryCalculatorDelta, options: ApplyDeltaOptions = {}): void {
    const commitOptions: {
      emit?: boolean;
      meta?: Partial<DeltaMeta>;
      recordHistory?: boolean;
    } = {
      emit: options.emit ?? true,
      recordHistory: options.meta?.source !== 'remote' && options.meta?.source !== 'history',
    };
    if (options.meta !== undefined) commitOptions.meta = options.meta;
    this.#commitDelta(delta, commitOptions);
  }

  setTool(tool: GeometryCalculatorTool): void {
    this.#commitDelta({ op: 'setTool', tool }, { emit: false, recordHistory: false });
    this.#cancelDrafts();
    if (this.#canvas) this.#canvas.style.cursor = this.#cursorForTool(tool);
    this.#updateToolbarState();
    this.#setStatus(this.#statusForTool());
    this.#render();
  }

  undo(): void {
    const previous = this.#undoStack.pop();
    if (!previous) return;
    this.#redoStack.push(cloneSnapshot(this.#snapshot));
    this.#snapshot = previous;
    this.#cancelDrafts();
    this.#render();
  }

  redo(): void {
    const next = this.#redoStack.pop();
    if (!next) return;
    this.#undoStack.push(cloneSnapshot(this.#snapshot));
    this.#snapshot = next;
    this.#cancelDrafts();
    this.#render();
  }

  async export(options: ExportOptions): Promise<ExportResult> {
    if (options.format === 'json') {
      return {
        format: 'json',
        mimeType: 'application/json',
        data: this.#snapshot as unknown as JsonValue,
      };
    }

    if (options.format === 'png' && this.#canvas) {
      const blob = await new Promise<Blob | null>(resolve => this.#canvas?.toBlob(resolve, 'image/png'));
      if (!blob) {
        throw new KleinSdkError('export_failed', 'Canvas PNG export failed.');
      }
      return { format: 'png', mimeType: 'image/png', data: blob };
    }

    if (options.format === 'svg') {
      return {
        format: 'svg',
        mimeType: 'image/svg+xml',
        data: geometrySceneToSvg(this.#snapshot, this.#logicalCanvasSize()),
      };
    }

    throw new KleinSdkError(
      'unsupported_export',
      `Geometry calculator does not support ${options.format} export yet.`,
    );
  }

  screenToWorld(point: Vector2): Vector2 {
    return screenToGeometryWorld(point, this.#snapshot.appState.view, this.#snapshot.appState.grid.unitSize);
  }

  worldToScreen(point: Vector2): Vector2 {
    return geometryWorldToScreen(point, this.#snapshot.appState.view, this.#snapshot.appState.grid.unitSize);
  }

  getDependencyGraph(): GeometryDependencyGraph {
    return buildGeometryDependencyGraph(this.#snapshot.scene);
  }

  getObjectDependencies(objectId: string): string[] {
    return geometryObjectDependencies(this.#snapshot.scene, objectId);
  }

  getObjectSummaries(options: GeometryObjectSummaryOptions = {}): GeometryObjectSummary[] {
    return summarizeGeometryObjects(this.#snapshot.scene, {
      order: this.#snapshot.scene.order,
      ...options,
    });
  }

  getObjectPanelRows(options: GeometryObjectPanelOptions = {}): GeometryObjectPanelRow[] {
    return buildGeometryObjectPanelRows(this.#snapshot.scene, {
      order: this.#snapshot.scene.order,
      ...options,
    });
  }

  getConstraints(): GeometryConstraint[] {
    return Object.values(this.#snapshot.scene.constraints ?? {}).map(constraint => ({ ...constraint }));
  }

  getConstraintSummaries(): GeometryConstraintSummary[] {
    return summarizeGeometryConstraints(this.#snapshot.scene);
  }

  getTheme(): GeometryCalculatorTheme {
    return { ...this.#theme };
  }

  setTheme(theme: GeometryCalculatorThemeInput): void {
    this.#theme = resolveGeometryCalculatorTheme(theme);
    if (this.#root) {
      this.#root.dataset.kleinTheme = this.#theme.colorScheme;
      this.#root.style.colorScheme = this.#theme.colorScheme;
      applyGeometryCalculatorTheme(this.#root, this.#theme);
    }
    this.#updateToolbarState();
    this.#render();
  }

  resetView(): void {
    const size = this.#logicalCanvasSize();
    this.setView({ x: size.width / 2, y: size.height / 2, zoom: 1 });
  }

  setView(view: Partial<View2D>): void {
    const current = this.#snapshot.appState.view;
    const next = {
      x: finiteNumber(view.x, current.x),
      y: finiteNumber(view.y, current.y),
      zoom: clampGeometryZoom(finiteNumber(view.zoom, current.zoom)),
    };
    this.#snapshot = applyGeometryCalculatorDelta(this.#snapshot, { op: 'setView', view: next });
    this.#render();
  }

  addPoint(point: Vector2 & GeometryStyleOptions): string {
    this.#assertWritable();
    const created = this.#makePoint(point.x, point.y, point);
    this.#commitDelta({ op: 'addPoint', point: created });
    this.#select({ kind: 'point', id: created.id });
    return created.id;
  }

  addMidpoint(firstPointId: string, secondPointId: string, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    this.#requireDistinctPoints(firstPointId, secondPointId);
    const first = this.#requirePoint2D(firstPointId);
    const second = this.#requirePoint2D(secondPointId);
    const position = midpoint2D(first, second);
    const point = withPointStyle({
      id: this.#ids.next('p'),
      kind: 'point2d',
      x: position.x,
      y: position.y,
      locked: true,
      construction: { kind: 'midpoint', sourceIds: [first.id, second.id] },
    }, style);
    this.#commitDelta({ op: 'addPoint', point: { ...point, locked: true } });
    this.#select({ kind: 'point', id: point.id });
    return point.id;
  }

  addIntersection(
    firstEntityId: string,
    secondEntityId: string,
    style: GeometryStyleOptions = {},
    index = 0,
  ): string {
    this.#assertWritable();
    this.#requireDistinctEntities(firstEntityId, secondEntityId);
    const first = this.#requireIntersectableEntity(firstEntityId);
    const second = this.#requireIntersectableEntity(secondEntityId);
    const point = geometryIntersectionPoint2D(this.#snapshot.scene, first.id, second.id, index);
    if (!point) {
      throw new KleinSdkError('no_intersection', 'The selected objects do not intersect in a usable point.');
    }
    const created = withPointStyle({
      id: this.#ids.next('p'),
      kind: 'point2d',
      x: point.x,
      y: point.y,
      locked: true,
      construction: { kind: 'intersection', sourceIds: [first.id, second.id], index },
    }, style);
    this.#commitDelta({ op: 'addPoint', point: { ...created, locked: true } });
    this.#select({ kind: 'point', id: created.id });
    return created.id;
  }

  addIntersections(firstEntityId: string, secondEntityId: string, style: GeometryStyleOptions = {}): string[] {
    this.#assertWritable();
    this.#requireDistinctEntities(firstEntityId, secondEntityId);
    const first = this.#requireIntersectableEntity(firstEntityId);
    const second = this.#requireIntersectableEntity(secondEntityId);
    const points = geometryIntersectionPoints2D(this.#snapshot.scene, first.id, second.id);
    if (points.length === 0) {
      throw new KleinSdkError('no_intersection', 'The selected objects do not intersect in a usable point.');
    }

    const created = points.map((point, index) => withPointStyle({
      id: this.#ids.next('p'),
      kind: 'point2d',
      x: point.x,
      y: point.y,
      locked: true,
      construction: { kind: 'intersection', sourceIds: [first.id, second.id], index },
    }, style));

    this.#commitDelta({
      op: 'batch',
      deltas: created.map(point => ({ op: 'addPoint' as const, point: { ...point, locked: true } })),
    });
    this.#select({ kind: 'point', id: created[0]?.id ?? '' });
    return created.map(point => point.id);
  }

  addParallelLine(sourceEntityId: string, throughPointId: string, style: GeometryStyleOptions = {}): string {
    return this.#addConstructedLine('parallelLine', sourceEntityId, throughPointId, style);
  }

  addPerpendicularLine(sourceEntityId: string, throughPointId: string, style: GeometryStyleOptions = {}): string {
    return this.#addConstructedLine('perpendicularLine', sourceEntityId, throughPointId, style);
  }

  addTangentLines(circleEntityId: string, throughPointId: string, style: GeometryStyleOptions = {}): string[] {
    this.#assertWritable();
    const circle = this.#requireCircleEntity(circleEntityId);
    const through = this.#requirePoint2D(throughPointId);
    const created: Array<{ helper: GeometryPoint2D; entity: LineEntity }> = [];
    const equations: GeometryLineEquation[] = [];

    for (const branch of [-1, 1] as const) {
      const helperPosition = geometryCircleTangentPoint2D(this.#snapshot.scene, circle.id, through.id, branch);
      if (!helperPosition) continue;
      const equation = lineEquationFrom2DPoints(through, helperPosition);
      if (!equation || equations.some(existing => sameGeometryLineEquation(existing, equation))) continue;
      equations.push(equation);
      const helper: GeometryPoint2D = {
        id: this.#ids.next('p'),
        kind: 'point2d',
        x: helperPosition.x,
        y: helperPosition.y,
        color: style.color ?? this.#theme.drawColor,
        hidden: true,
        locked: true,
      };
      const entity = withEntityStyle<LineEntity>({
        id: this.#ids.next('line'),
        kind: 'line',
        pointIds: [through.id, helper.id],
        equation,
        construction: {
          kind: 'tangentLine',
          circleId: circle.id,
          throughPointId: through.id,
          branch,
        },
      }, style, this.#theme.drawColor);
      created.push({ helper, entity });
    }

    if (created.length === 0) {
      throw new KleinSdkError('invalid_tangent', 'A tangent needs a point on or outside the circle.');
    }

    this.#commitDelta({
      op: 'batch',
      deltas: created.flatMap(item => [
        { op: 'addPoint' as const, point: item.helper },
        { op: 'addEntity' as const, entity: item.entity },
      ]),
    });
    this.#select({ kind: 'entity', id: created[0]?.entity.id ?? '' });
    return created.map(item => item.entity.id);
  }

  addAngleBisectorByPoints(
    pointIds: [string, string, string],
    style: GeometryStyleOptions = {},
  ): string {
    this.#assertWritable();
    for (const pointId of pointIds) this.#requirePoint2D(pointId);
    const vertex = this.#requirePoint2D(pointIds[1]);
    const helperPosition = geometryAngleBisectorPoint2D(this.#snapshot.scene, pointIds);
    if (!helperPosition) {
      throw new KleinSdkError('invalid_angle_bisector', 'Choose three non-degenerate points.');
    }
    const equation = lineEquationFrom2DPoints(vertex, helperPosition);
    if (!equation) {
      throw new KleinSdkError('invalid_angle_bisector', 'Choose three non-degenerate points.');
    }
    const helper: GeometryPoint2D = {
      id: this.#ids.next('p'),
      kind: 'point2d',
      x: helperPosition.x,
      y: helperPosition.y,
      color: style.color ?? this.#theme.drawColor,
      hidden: true,
      locked: true,
    };
    const entity = withEntityStyle<LineEntity>({
      id: this.#ids.next('line'),
      kind: 'line',
      pointIds: [vertex.id, helper.id],
      equation,
      construction: { kind: 'angleBisector', pointIds },
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: helper },
        { op: 'addEntity', entity },
      ],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addLineByPoints(firstPointId: string, secondPointId: string, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    this.#requireDistinctPoints(firstPointId, secondPointId);
    const first = this.#requirePoint2D(firstPointId);
    const second = this.#requirePoint2D(secondPointId);
    const entity = withEntityStyle<LineEntity>({
      id: this.#ids.next('line'),
      kind: 'line',
      pointIds: [first.id, second.id],
      equation: lineEquationFromPoints(first, second),
      construction: { kind: 'lineThroughPoints', sourceIds: [first.id, second.id] },
    }, style, this.#theme.drawColor);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addLineByEquation(equation: string | GeometryLineEquation, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    const parsed = typeof equation === 'string' ? parseGeometryLineEquation(equation) : normalizeLineEquation(equation);
    const [first, second] = helperPointsForEquation(parsed, this.#ids, style.color ?? this.#theme.drawColor);
    const entity = withEntityStyle<LineEntity>({
      id: this.#ids.next('line'),
      kind: 'line',
      pointIds: [first.id, second.id],
      equation: parsed,
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: first },
        { op: 'addPoint', point: second },
        { op: 'addEntity', entity },
      ],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addSegmentByPoints(firstPointId: string, secondPointId: string, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    this.#requireDistinctPoints(firstPointId, secondPointId);
    const entity = withEntityStyle<SegmentEntity>({
      id: this.#ids.next('seg'),
      kind: 'segment',
      pointIds: [firstPointId, secondPointId],
    }, style, this.#theme.drawColor);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addPolygon(pointIds: string[], style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    if (pointIds.length < 3) {
      throw new KleinSdkError('invalid_polygon', 'A closed polygon needs at least three points.');
    }
    for (const pointId of pointIds) this.#requirePoint2D(pointId);
    const entity = withEntityStyle<PolygonEntity>({
      id: this.#ids.next('poly'),
      kind: 'polygon',
      pointIds: [...pointIds],
      fillColor: style.fillColor ?? colorWithAlpha(style.color ?? style.strokeColor ?? this.#theme.drawColor, 0.12),
    }, style, this.#theme.drawColor);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addPolygonByCoordinates(points: Vector2[], style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    if (points.length < 3) {
      throw new KleinSdkError('invalid_polygon', 'A closed polygon needs at least three coordinates.');
    }
    const createdPoints = points.map(point => this.#makePoint(point.x, point.y, style));
    const entity = withEntityStyle<PolygonEntity>({
      id: this.#ids.next('poly'),
      kind: 'polygon',
      pointIds: createdPoints.map(point => point.id),
      fillColor: style.fillColor ?? colorWithAlpha(style.color ?? style.strokeColor ?? this.#theme.drawColor, 0.12),
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        ...createdPoints.map(point => ({ op: 'addPoint' as const, point })),
        { op: 'addEntity', entity },
      ],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addLocus(points: Vector2[], options: GeometryLocusOptions = {}): string {
    this.#assertWritable();
    if (points.length < 2) {
      throw new KleinSdkError('invalid_locus', 'A locus/path needs at least two coordinates.');
    }
    const cleaned = points.map(point => {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        throw new KleinSdkError('invalid_locus', 'Locus/path coordinates must be finite numbers.');
      }
      return { x: point.x, y: point.y };
    });
    const base: LocusEntity = {
      id: this.#ids.next('locus'),
      kind: 'locus',
      points: cleaned,
    };
    if (options.closed !== undefined) base.closed = options.closed;
    const entity = withEntityStyle(base, options, this.#theme.drawColor);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addCircle(centerPointId: string, radius: number, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    this.#requirePoint2D(centerPointId);
    if (!Number.isFinite(radius) || radius <= 0) {
      throw new KleinSdkError('invalid_circle', 'Circle radius must be a positive number.');
    }
    const entity = withEntityStyle<CircleEntity>({
      id: this.#ids.next('circle'),
      kind: 'circle',
      centerId: centerPointId,
      radius,
      fillColor: style.fillColor ?? colorWithAlpha(style.color ?? this.#theme.drawColor, 0.1),
    }, style, this.#theme.drawColor);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addCircleByCenterPoint(
    centerPointId: string,
    radiusPointId: string,
    style: GeometryStyleOptions = {},
  ): string {
    this.#assertWritable();
    this.#requireDistinctPoints(centerPointId, radiusPointId);
    const center = this.#requirePoint2D(centerPointId);
    const radiusPoint = this.#requirePoint2D(radiusPointId);
    const radius = distance2D(center, radiusPoint);
    if (!Number.isFinite(radius) || radius <= 0) {
      throw new KleinSdkError('invalid_circle', 'Circle radius must be a positive number.');
    }
    const entity = withEntityStyle<CircleEntity>({
      id: this.#ids.next('circle'),
      kind: 'circle',
      centerId: center.id,
      radius,
      fillColor: style.fillColor ?? colorWithAlpha(style.color ?? this.#theme.drawColor, 0.1),
      construction: {
        kind: 'circleCenterPoint',
        centerPointId: center.id,
        radiusPointId: radiusPoint.id,
      },
    }, style, this.#theme.drawColor);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addCircleThroughPoints(pointIds: [string, string, string], style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    for (const pointId of pointIds) this.#requirePoint2D(pointId);
    const circle = geometryCircumcircle2D(this.#snapshot.scene, pointIds);
    if (!circle) {
      throw new KleinSdkError('invalid_circle', 'Choose three non-collinear points.');
    }
    const center = withPointStyle({
      id: this.#ids.next('p'),
      kind: 'point2d',
      x: circle.center.x,
      y: circle.center.y,
      hidden: true,
      locked: true,
      construction: { kind: 'circumcenter', pointIds },
    }, style);
    const entity = withEntityStyle<CircleEntity>({
      id: this.#ids.next('circle'),
      kind: 'circle',
      centerId: center.id,
      radius: circle.radius,
      fillColor: style.fillColor ?? colorWithAlpha(style.color ?? this.#theme.drawColor, 0.1),
      construction: { kind: 'circleThroughPoints', pointIds },
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: { ...center, hidden: true, locked: true } },
        { op: 'addEntity', entity },
      ],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addCircleByCoordinates(center: Vector2, radius: number, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    const point = this.#makePoint(center.x, center.y, style);
    const entity = withEntityStyle<CircleEntity>({
      id: this.#ids.next('circle'),
      kind: 'circle',
      centerId: point.id,
      radius,
      fillColor: style.fillColor ?? colorWithAlpha(style.color ?? this.#theme.drawColor, 0.1),
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [{ op: 'addPoint', point }, { op: 'addEntity', entity }],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addShape(kind: GeometryShapeKind, center: Vector2, options: ShapeCreationOptions = {}): string {
    const coordinates = shapeCoordinates(kind, center, options);
    return this.addPolygonByCoordinates(coordinates, options);
  }

  addAngleByPoints(pointIds: [string, string, string], style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    for (const pointId of pointIds) this.#requirePoint2D(pointId);
    const entity = withEntityStyle<AngleEntity>({
      id: this.#ids.next('angle'),
      kind: 'angle',
      pointIds,
      radius: positiveNumber(style.width, 0.7),
      color: style.color ?? '#f97316',
    }, style, '#f97316');
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addAngleBetweenEntities(
    firstEntityId: string,
    secondEntityId: string,
    style: GeometryStyleOptions = {},
  ): string {
    this.#assertWritable();
    const delta = this.#angleBetweenEntitiesDelta(firstEntityId, secondEntityId, style);
    const angleId = deltaAddedEntityId(delta, 'angle');
    if (!angleId) {
      throw new KleinSdkError('invalid_angle', 'The selected lines do not intersect in a usable angle.');
    }
    this.#commitDelta(delta);
    this.#select({ kind: 'entity', id: angleId });
    return angleId;
  }

  addAngleAt(options: AngleCreationOptions): string {
    this.#assertWritable();
    if (!Number.isFinite(options.degrees) || options.degrees <= 0 || options.degrees >= 360) {
      throw new KleinSdkError('invalid_angle', 'Angle degrees must be between 0 and 360.');
    }
    const length = positiveNumber(options.armLength, 2);
    const start = ((options.startDegrees ?? 0) * Math.PI) / 180;
    const end = start + (options.degrees * Math.PI) / 180;
    const first = this.#makePoint(
      options.vertex.x + Math.cos(start) * length,
      options.vertex.y + Math.sin(start) * length,
      options,
    );
    const vertex = this.#makePoint(options.vertex.x, options.vertex.y, options);
    const second = this.#makePoint(
      options.vertex.x + Math.cos(end) * length,
      options.vertex.y + Math.sin(end) * length,
      options,
    );
    const entity = withEntityStyle<AngleEntity>({
      id: this.#ids.next('angle'),
      kind: 'angle',
      pointIds: [first.id, vertex.id, second.id],
      radius: 0.7,
      color: options.color ?? '#f97316',
    }, options, '#f97316');
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: first },
        { op: 'addPoint', point: vertex },
        { op: 'addPoint', point: second },
        { op: 'addEntity', entity },
      ],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addConstraint(constraint: GeometryConstraintDraft): string {
    this.#assertWritable();
    const created = makeGeometryConstraint(constraint, this.#ids.next('constraint'), this.#snapshot.scene);
    this.#commitDelta({ op: 'addConstraint', constraint: created });
    return created.id;
  }

  updateConstraint(id: string, changes: Partial<GeometryConstraint>): void {
    this.#assertWritable();
    const current = this.#snapshot.scene.constraints?.[id];
    if (!current) {
      throw new KleinSdkError('missing_constraint', `Constraint ${id} does not exist.`);
    }
    const next = { ...current, ...changes, id } as GeometryConstraint;
    validateGeometryConstraint(next, this.#snapshot.scene);
    this.#commitDelta({ op: 'updateConstraint', id, changes: next });
  }

  deleteConstraints(ids: string[]): void {
    this.#assertWritable();
    this.#commitDelta({ op: 'deleteConstraint', ids });
  }

  #addConstructedLine(
    constructionKind: 'parallelLine' | 'perpendicularLine',
    sourceEntityId: string,
    throughPointId: string,
    style: GeometryStyleOptions,
  ): string {
    this.#assertWritable();
    const source = this.#requireLineLikeEntity(sourceEntityId);
    const through = this.#requirePoint2D(throughPointId);
    const sourceEquation = entityLineEquation(this.#snapshot.scene, source);
    const equation = constructedLineEquation(constructionKind, sourceEquation, through);
    const helper = helperPointForLineEquation(equation, through, this.#ids, style.color ?? this.#theme.drawColor);
    const entity = withEntityStyle<LineEntity>({
      id: this.#ids.next('line'),
      kind: 'line',
      pointIds: [through.id, helper.id],
      equation,
      construction: {
        kind: constructionKind,
        sourceLineId: source.id,
        throughPointId: through.id,
      },
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: helper },
        { op: 'addEntity', entity },
      ],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  #commitDelta(
    delta: GeometryCalculatorDelta,
    options: {
      emit?: boolean;
      meta?: Partial<DeltaMeta>;
      recordHistory?: boolean;
    } = {},
  ): void {
    const recordHistory = options.recordHistory ?? true;
    if (recordHistory) {
      this.#undoStack.push(cloneSnapshot(this.#snapshot));
      this.#redoStack = [];
    }

    this.#snapshot = applyGeometryCalculatorDelta(this.#snapshot, delta);
    this.#snapshot = {
      ...this.#snapshot,
      metadata: {
        ...this.#snapshot.metadata,
        updatedAt: Date.now(),
      },
    };

    if (options.emit !== false) {
      this.#options.onDelta?.(delta, this.#deltaMeta(options.meta));
    }
    this.#updateToolbarState();
    this.#render();
  }

  #deltaMeta(meta: Partial<DeltaMeta> | undefined): DeltaMeta {
    const result: DeltaMeta = {
      id: meta?.id ?? this.#ids.next('delta'),
      createdAt: meta?.createdAt ?? Date.now(),
      source: meta?.source ?? 'local',
    };
    if (meta?.actorId) result.actorId = meta.actorId;
    return result;
  }

  #assertWritable(): void {
    if (this.#options.readOnly) {
      throw new KleinSdkError('read_only', 'This geometry calculator is read-only.');
    }
  }

  #createControls(): HTMLDivElement {
    const controls = document.createElement('div');
    Object.assign(controls.style, {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr)',
      gap: '6px',
      padding: '8px',
      borderBottom: '1px solid var(--kgc-border)',
      background: 'var(--kgc-surface)',
    });

    const toolRow = document.createElement('div');
    Object.assign(toolRow.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
      alignItems: 'center',
    });

    const toolItems: Array<[GeometryCalculatorTool, string]> = [
      ['select', 'Select'],
      ['pan', 'Pan'],
      ['point', 'Point'],
      ['midpoint', 'Midpoint'],
      ['intersect', 'Intersect'],
      ['segment', 'Segment'],
      ['line', 'Line'],
      ['parallel', 'Parallel'],
      ['perpendicular', 'Perp'],
      ['tangent', 'Tangent'],
      ['angleBisector', 'Bisector'],
      ['polygon', 'Polygon'],
      ['circle', 'Circle'],
      ['circleThroughPoints', 'Circle 3pt'],
      ['angle', 'Angle'],
      ['triangle', 'Triangle'],
      ['rectangle', 'Rect'],
      ['square', 'Square'],
      ['regularPolygon', 'Regular'],
      ['remove', 'Remove'],
    ];
    for (const [tool, label] of toolItems) {
      const button = this.#button(label, () => this.setTool(tool));
      button.dataset.tool = tool;
      this.#toolButtons.push(button);
      toolRow.append(button);
    }
    controls.append(toolRow);

    const commandRow = document.createElement('div');
    Object.assign(commandRow.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
      alignItems: 'center',
    });

    const xInput = this.#numberInput('x', '0');
    const yInput = this.#numberInput('y', '0');
    commandRow.append(
      this.#labelled('x', xInput),
      this.#labelled('y', yInput),
      this.#button('Add point', () => {
        const x = readNumberInput(xInput);
        const y = readNumberInput(yInput);
        this.addPoint({ x, y });
      }),
    );

    const equationInput = document.createElement('input');
    equationInput.type = 'text';
    equationInput.placeholder = 'y = 2x + 1';
    Object.assign(equationInput.style, inputStyle('150px'));
    commandRow.append(
      this.#labelled('line', equationInput),
      this.#button('Add equation', () => {
        this.addLineByEquation(equationInput.value);
      }),
    );

    const shapeSelect = document.createElement('select');
    for (const shape of ['triangle', 'rectangle', 'square', 'regularPolygon', 'parallelogram'] satisfies GeometryShapeKind[]) {
      const option = document.createElement('option');
      option.value = shape;
      option.textContent = shape;
      shapeSelect.append(option);
    }
    Object.assign(shapeSelect.style, inputStyle('142px'));
    const sizeInput = this.#numberInput('size', '2');
    const sidesInput = this.#numberInput('sides', '6');
    commandRow.append(
      this.#labelled('shape', shapeSelect),
      this.#labelled('size', sizeInput),
      this.#labelled('sides', sidesInput),
      this.#button('Add shape', () => {
        const shape = shapeSelect.value as GeometryShapeKind;
        this.addShape(shape, { x: readNumberInput(xInput), y: readNumberInput(yInput) }, {
          size: readNumberInput(sizeInput),
          sides: Math.max(3, Math.round(readNumberInput(sidesInput))),
        });
      }),
      this.#button('Finish polygon', () => this.#finishPolygonDraft()),
      this.#button('Cancel', () => {
        this.#cancelDrafts();
        this.#render();
      }),
      this.#button('Reset view', () => this.resetView()),
      this.#button('Clear', () => {
        this.#commitDelta({ op: 'clear' });
        this.#cancelDrafts();
      }),
    );

    controls.append(commandRow);
    return controls;
  }

  #button(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    Object.assign(button.style, {
      minHeight: '30px',
      padding: '0 10px',
      border: '1px solid var(--kgc-button-border)',
      borderRadius: '6px',
      background: 'var(--kgc-button-bg)',
      color: 'var(--kgc-button-text)',
      font: '600 12px/1 Inter, ui-sans-serif, system-ui, sans-serif',
      cursor: 'pointer',
    });
    button.addEventListener('click', () => {
      try {
        onClick();
      } catch (error) {
        this.#handleError(error);
      }
    });
    return button;
  }

  #numberInput(label: string, value: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.value = value;
    input.setAttribute('aria-label', label);
    Object.assign(input.style, inputStyle('64px'));
    return input;
  }

  #labelled(label: string, control: HTMLElement): HTMLLabelElement {
    const wrapper = document.createElement('label');
    Object.assign(wrapper.style, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      color: 'var(--kgc-muted-text)',
      fontSize: '12px',
      fontWeight: '650',
    });
    const text = document.createElement('span');
    text.textContent = label;
    wrapper.append(text, control);
    return wrapper;
  }

  #handleError(error: unknown): void {
    if (error instanceof KleinSdkError) {
      this.#options.onError?.(error);
      this.#setStatus(error.message);
      return;
    }
    const message = error instanceof Error ? error.message : 'Unknown geometry error.';
    const sdkError = new KleinSdkError('geometry_error', message);
    this.#options.onError?.(sdkError);
    this.#setStatus(message);
  }

  #resizeCanvas = (): void => {
    if (!this.#canvas || !this.#ctx) return;
    const rect = this.#canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width || this.#container?.clientWidth || 800);
    const height = Math.max(1, rect.height || 420);
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (this.#canvas.width !== pixelWidth || this.#canvas.height !== pixelHeight) {
      this.#canvas.width = pixelWidth;
      this.#canvas.height = pixelHeight;
      this.#ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    if (!this.#viewInitialized && isCornerOriginView(this.#snapshot.appState.view)) {
      this.#snapshot = applyGeometryCalculatorDelta(this.#snapshot, {
        op: 'setView',
        view: {
          x: width / 2,
          y: height / 2,
          zoom: clampGeometryZoom(this.#snapshot.appState.view.zoom),
        },
      });
      this.#viewInitialized = true;
    }
    this.#render();
  };

  #onPointerDown = (event: PointerEvent): void => {
    if (!this.#canvas) return;
    this.#canvas.focus();
    const screen = this.#eventScreen(event);
    const world = this.#eventWorld(event);
    const tool = this.#snapshot.appState.activeTool;
    this.#hoverWorld = world;

    if (event.button === 1 || tool === 'pan') {
      event.preventDefault();
      this.#canvas.setPointerCapture(event.pointerId);
      this.#drag = {
        kind: 'pan',
        pointerId: event.pointerId,
        startScreen: { x: event.clientX, y: event.clientY },
        startView: this.#snapshot.appState.view,
      };
      return;
    }

    if ((tool === 'select' || tool === 'move') && !this.#options.readOnly) {
      const hit = this.#hitTest(world);
      this.#select(hit?.selection ?? null, false);
      if (hit?.selection.kind === 'point') {
        const point = this.#requirePoint2D(hit.selection.id);
        if (point.locked) {
          this.#render();
          return;
        }
        this.#canvas.setPointerCapture(event.pointerId);
        this.#drag = {
          kind: 'movePoint',
          pointerId: event.pointerId,
          pointId: point.id,
          startSnapshot: cloneSnapshot(this.#snapshot),
          startWorld: world,
          original: point,
        };
        return;
      }
      this.#render();
    }

    this.#canvas.setPointerCapture(event.pointerId);
    this.#drag = { kind: 'press', pointerId: event.pointerId, screen, world };
  };

  #onPointerMove = (event: PointerEvent): void => {
    if (!this.#canvas) return;
    const world = this.#eventWorld(event);
    this.#hoverWorld = world;

    if (!this.#drag) {
      this.#render();
      return;
    }

    if (this.#drag.kind === 'pan') {
      const dx = event.clientX - this.#drag.startScreen.x;
      const dy = event.clientY - this.#drag.startScreen.y;
      this.setView({
        x: this.#drag.startView.x + dx,
        y: this.#drag.startView.y + dy,
      });
      return;
    }

    if (this.#drag.kind === 'movePoint') {
      const dx = world.x - this.#drag.startWorld.x;
      const dy = world.y - this.#drag.startWorld.y;
      const next = this.#snapWorld({
        x: this.#drag.original.x + dx,
        y: this.#drag.original.y + dy,
      }, [this.#drag.pointId]);
      const points = {
        ...this.#snapshot.scene.points,
        [this.#drag.pointId]: { ...this.#drag.original, x: next.x, y: next.y },
      };
      this.#snapshot = {
        ...this.#snapshot,
        scene: recomputeGeometryScene({ ...this.#snapshot.scene, points }),
      };
      this.#render();
      return;
    }

    this.#render();
  };

  #onPointerUp = (event: PointerEvent): void => {
    if (!this.#canvas || !this.#drag || this.#drag.pointerId !== event.pointerId) return;
    this.#canvas.releasePointerCapture(event.pointerId);

    const drag = this.#drag;
    this.#drag = null;

    if (drag.kind === 'movePoint') {
      const moved = this.#snapshot.scene.points[drag.pointId];
      this.#snapshot = drag.startSnapshot;
      if (moved?.kind === 'point2d' && (Math.abs(moved.x - drag.original.x) > 1e-9 || Math.abs(moved.y - drag.original.y) > 1e-9)) {
        this.#commitDelta({
          op: 'updatePoint',
          id: drag.pointId,
          changes: { x: moved.x, y: moved.y },
        });
      } else {
        this.#render();
      }
      return;
    }

    if (drag.kind === 'pan') {
      this.#render();
      return;
    }

    const upScreen = this.#eventScreen(event);
    if (distance2D(upScreen, drag.screen) <= 4) {
      try {
        this.#handleCanvasClick(this.#eventWorld(event), event);
      } catch (error) {
        this.#handleError(error);
      }
    }
    this.#render();
  };

  #onPointerCancel = (event: PointerEvent): void => {
    if (this.#drag?.pointerId === event.pointerId) {
      if (this.#drag.kind === 'movePoint') {
        this.#snapshot = this.#drag.startSnapshot;
      }
      this.#drag = null;
      this.#render();
    }
  };

  #onWheel = (event: WheelEvent): void => {
    if (!this.#canvas) return;
    event.preventDefault();
    const rect = this.#canvas.getBoundingClientRect();
    const view = this.#snapshot.appState.view;
    if (event.ctrlKey || event.metaKey) {
      const mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const nextZoom = clampGeometryZoom(view.zoom * Math.pow(0.999, event.deltaY));
      const scale = nextZoom / view.zoom;
      this.setView({
        zoom: nextZoom,
        x: mouse.x - scale * (mouse.x - view.x),
        y: mouse.y - scale * (mouse.y - view.y),
      });
      return;
    }
    this.setView({ x: view.x - event.deltaX, y: view.y - event.deltaY });
  };

  #onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    const shortcuts: Record<string, GeometryCalculatorTool> = {
      v: 'select',
      m: 'pan',
      p: 'point',
      s: 'segment',
      l: 'line',
      g: 'polygon',
      c: 'circle',
      a: 'angle',
      x: 'remove',
    };
    const tool = shortcuts[key];
    if (tool) {
      event.preventDefault();
      this.setTool(tool);
      return;
    }
    if (key === 'escape') {
      this.#cancelDrafts();
      this.#render();
      return;
    }
    if (key === 'enter' && this.#draftPolygonPointIds.length >= 3) {
      this.#finishPolygonDraft();
    }
  };

  #handleCanvasClick(world: Vector2, event: PointerEvent): void {
    if (this.#options.readOnly) return;
    const tool = this.#snapshot.appState.activeTool;
    const hit = this.#hitTest(world);

    if (tool === 'select' || tool === 'move') {
      this.#select(hit?.selection ?? null);
      return;
    }

    if (tool === 'remove') {
      if (hit) this.#commitDelta({ op: 'delete', ids: [hit.selection.id] });
      this.#select(null);
      return;
    }

    if (tool === 'point' || tool === 'pointOnObject') {
      const placed = this.#snapWorld(world);
      this.addPoint({ x: placed.x, y: placed.y });
      return;
    }

    if (tool === 'midpoint') {
      const pointId = this.#findOrCreatePoint(world, hit);
      if (!this.#pendingLineStartId) {
        this.#pendingLineStartId = pointId;
        this.#select({ kind: 'point', id: pointId });
        this.#setStatus('Choose the second point for the midpoint.');
        return;
      }
      if (this.#pendingLineStartId === pointId) return;
      const midpointId = this.addMidpoint(this.#pendingLineStartId, pointId);
      this.#pendingLineStartId = null;
      this.#select({ kind: 'point', id: midpointId });
      return;
    }

    if (tool === 'intersect') {
      if (hit?.selection.kind !== 'entity' || !this.#isIntersectableEntity(hit.selection.id)) {
        this.#setStatus('Choose a line, ray, segment, circle, or polygon.');
        return;
      }
      if (!this.#pendingReferenceEntityId) {
        this.#pendingReferenceEntityId = hit.selection.id;
        this.#select({ kind: 'entity', id: hit.selection.id });
        this.#setStatus('Choose the second intersecting object.');
        return;
      }
      if (this.#pendingReferenceEntityId === hit.selection.id) return;
      const pointIds = this.addIntersections(this.#pendingReferenceEntityId, hit.selection.id);
      this.#pendingReferenceEntityId = null;
      this.#select({ kind: 'point', id: pointIds[0] ?? '' });
      return;
    }

    if (tool === 'parallel' || tool === 'perpendicular') {
      if (!this.#pendingReferenceEntityId) {
        if (hit?.selection.kind !== 'entity' || !this.#isLineLikeEntity(hit.selection.id)) {
          this.#setStatus('Choose the source line, ray, or segment.');
          return;
        }
        this.#pendingReferenceEntityId = hit.selection.id;
        this.#select({ kind: 'entity', id: hit.selection.id });
        this.#setStatus('Choose a point the new line should pass through.');
        return;
      }
      const pointId = this.#findOrCreatePoint(world, hit);
      const lineId = tool === 'parallel'
        ? this.addParallelLine(this.#pendingReferenceEntityId, pointId)
        : this.addPerpendicularLine(this.#pendingReferenceEntityId, pointId);
      this.#pendingReferenceEntityId = null;
      this.#select({ kind: 'entity', id: lineId });
      return;
    }

    if (tool === 'tangent') {
      if (!this.#pendingReferenceEntityId) {
        if (hit?.selection.kind !== 'entity' || !this.#isCircleEntity(hit.selection.id)) {
          this.#setStatus('Choose a circle.');
          return;
        }
        this.#pendingReferenceEntityId = hit.selection.id;
        this.#select({ kind: 'entity', id: hit.selection.id });
        this.#setStatus('Choose a point on or outside the circle.');
        return;
      }
      const pointId = this.#findOrCreatePoint(world, hit);
      const lineIds = this.addTangentLines(this.#pendingReferenceEntityId, pointId);
      this.#pendingReferenceEntityId = null;
      this.#select({ kind: 'entity', id: lineIds[0] ?? '' });
      return;
    }

    if (tool === 'angleBisector') {
      const pointId = this.#findOrCreatePoint(world, hit);
      this.#draftAnglePointIds.push(pointId);
      if (this.#draftAnglePointIds.length === 3) {
        const [first, vertex, second] = this.#draftAnglePointIds;
        this.#draftAnglePointIds = [];
        if (first && vertex && second) {
          const lineId = this.addAngleBisectorByPoints([first, vertex, second]);
          this.#select({ kind: 'entity', id: lineId });
        }
      } else {
        this.#setStatus('Choose three points: arm, vertex, arm.');
      }
      return;
    }

    if (tool === 'segment' || tool === 'line' || tool === 'ray' || tool === 'vector') {
      const pointId = this.#findOrCreatePoint(world, hit);
      if (!this.#pendingLineStartId) {
        this.#pendingLineStartId = pointId;
        this.#select({ kind: 'point', id: pointId });
        this.#setStatus('Choose the second point.');
        return;
      }
      if (this.#pendingLineStartId === pointId) return;
      const entity = this.#makeLineLikeEntity(tool, this.#pendingLineStartId, pointId);
      this.#pendingLineStartId = null;
      this.#commitDelta({ op: 'addEntity', entity });
      this.#select({ kind: 'entity', id: entity.id });
      return;
    }

    if (tool === 'polygon') {
      const pointId = this.#findOrCreatePoint(world, hit);
      const firstId = this.#draftPolygonPointIds[0];
      if (firstId && pointId === firstId && this.#draftPolygonPointIds.length >= 3) {
        this.#finishPolygonDraft();
        return;
      }
      if (!this.#draftPolygonPointIds.includes(pointId)) {
        this.#draftPolygonPointIds.push(pointId);
      }
      this.#setStatus(this.#draftPolygonPointIds.length >= 3 ? 'Click the first point or press Enter to close.' : 'Add at least three polygon points.');
      return;
    }

    if (tool === 'circle') {
      const pointId = this.#findOrCreatePoint(world, hit);
      if (!this.#pendingCircleCenterId) {
        this.#pendingCircleCenterId = pointId;
        this.#select({ kind: 'point', id: pointId });
        this.#setStatus('Choose a radius point.');
        return;
      }
      const centerId = this.#pendingCircleCenterId;
      this.#pendingCircleCenterId = null;
      this.addCircleByCenterPoint(centerId, pointId);
      return;
    }

    if (tool === 'circleThroughPoints') {
      const pointId = this.#findOrCreatePoint(world, hit);
      if (!this.#draftCirclePointIds.includes(pointId)) {
        this.#draftCirclePointIds.push(pointId);
      }
      if (this.#draftCirclePointIds.length === 3) {
        const [first, second, third] = this.#draftCirclePointIds;
        this.#draftCirclePointIds = [];
        if (first && second && third) {
          const circleId = this.addCircleThroughPoints([first, second, third]);
          this.#select({ kind: 'entity', id: circleId });
        }
      } else {
        this.#setStatus('Choose three non-collinear points.');
      }
      return;
    }

    if (tool === 'angle') {
      if (hit?.selection.kind === 'entity' && this.#isLineLikeEntity(hit.selection.id)) {
        this.#draftAngleEntityIds.push(hit.selection.id);
        if (this.#draftAngleEntityIds.length >= 2) {
          const [firstId, secondId] = this.#draftAngleEntityIds;
          this.#draftAngleEntityIds = [];
          if (firstId && secondId) this.addAngleBetweenEntities(firstId, secondId);
        } else {
          this.#setStatus('Choose the second intersecting line or segment.');
        }
        return;
      }

      const pointId = this.#findOrCreatePoint(world, hit);
      this.#draftAnglePointIds.push(pointId);
      if (this.#draftAnglePointIds.length === 3) {
        const [a, vertex, c] = this.#draftAnglePointIds;
        this.#draftAnglePointIds = [];
        if (a && vertex && c) this.addAngleByPoints([a, vertex, c]);
      } else {
        this.#setStatus('Choose three points: arm, vertex, arm.');
      }
      return;
    }

    if (tool === 'triangle' || tool === 'rectangle' || tool === 'square' || tool === 'regularPolygon') {
      const shapeOptions: ShapeCreationOptions = { size: 2 };
      if (tool === 'regularPolygon') shapeOptions.sides = 6;
      this.addShape(tool, this.#snapWorld(world), shapeOptions);
    }

    void event;
  }

  #findOrCreatePoint(world: Vector2, hit: HitTarget): string {
    if (hit?.selection.kind === 'point') return hit.selection.id;
    const placed = this.#snapWorld(world);
    const point = this.#makePoint(placed.x, placed.y);
    this.#commitDelta({ op: 'addPoint', point });
    return point.id;
  }

  #makePoint(x: number, y: number, style: GeometryStyleOptions = {}): GeometryPoint2D {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new KleinSdkError('invalid_point', 'Point coordinates must be finite numbers.');
    }
    const point: GeometryPoint2D = {
      id: this.#ids.next('p'),
      kind: 'point2d',
      x,
      y,
    };
    return withPointStyle(point, style);
  }

  #makeLineLikeEntity(
    tool: GeometryCalculatorTool,
    firstPointId: string,
    secondPointId: string,
  ): SegmentEntity | LineEntity | RayEntity | VectorEntity {
    this.#requireDistinctPoints(firstPointId, secondPointId);
    if (tool === 'line') {
      return withEntityStyle<LineEntity>({
        id: this.#ids.next('line'),
        kind: 'line',
        pointIds: [firstPointId, secondPointId],
        equation: lineEquationFromPoints(this.#requirePoint2D(firstPointId), this.#requirePoint2D(secondPointId)),
        construction: { kind: 'lineThroughPoints', sourceIds: [firstPointId, secondPointId] },
      }, {}, this.#theme.drawColor);
    }
    if (tool === 'ray') {
      return withEntityStyle<RayEntity>({
        id: this.#ids.next('ray'),
        kind: 'ray',
        pointIds: [firstPointId, secondPointId],
      }, {}, this.#theme.drawColor);
    }
    if (tool === 'vector') {
      return withEntityStyle<VectorEntity>({
        id: this.#ids.next('vec'),
        kind: 'vector',
        pointIds: [firstPointId, secondPointId],
      }, {}, this.#theme.drawColor);
    }
    return withEntityStyle<SegmentEntity>({
      id: this.#ids.next('seg'),
      kind: 'segment',
      pointIds: [firstPointId, secondPointId],
    }, {}, this.#theme.drawColor);
  }

  #finishPolygonDraft(): void {
    if (this.#draftPolygonPointIds.length < 3) {
      this.#setStatus('A polygon needs at least three points.');
      return;
    }
    const id = this.addPolygon(this.#draftPolygonPointIds);
    this.#draftPolygonPointIds = [];
    this.#select({ kind: 'entity', id });
  }

  #cancelDrafts(): void {
    this.#pendingLineStartId = null;
    this.#draftPolygonPointIds = [];
    this.#draftAnglePointIds = [];
    this.#draftAngleEntityIds = [];
    this.#draftCirclePointIds = [];
    this.#pendingReferenceEntityId = null;
    this.#pendingCircleCenterId = null;
    this.#drag = null;
    this.#setStatus(this.#statusForTool());
  }

  #select(selection: GeometryCalculatorSelection | null, emit = true): void {
    this.#snapshot = applyGeometryCalculatorDelta(this.#snapshot, { op: 'setSelection', selection });
    if (emit) {
      this.#options.onDelta?.({ op: 'setSelection', selection }, this.#deltaMeta(undefined));
    }
    this.#render();
  }

  #eventScreen(event: PointerEvent): Vector2 {
    const rect = this.#canvas?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  #eventWorld(event: PointerEvent): Vector2 {
    const rect = this.#canvas?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return screenToGeometryWorld(
      { x: event.clientX, y: event.clientY },
      this.#snapshot.appState.view,
      this.#snapshot.appState.grid.unitSize,
      rect,
    );
  }

  #snapWorld(world: Vector2, excludePointIds: string[] = []): Vector2 {
    if (!this.#snapshot.appState.grid.snap) return world;
    const snap = resolveGeometrySnap(this.#snapshot.scene, world, {
      toleranceWorld: this.#worldHitTolerance(),
      gridStep: 1,
      excludePointIds,
    });
    return snap;
  }

  #worldHitTolerance(): number {
    const grid = this.#snapshot.appState.grid;
    return HIT_TOLERANCE_PX / (grid.unitSize * this.#snapshot.appState.view.zoom);
  }

  #hitTest(world: Vector2): HitTarget {
    return hitTestGeometryCalculator(this.#snapshot.scene, world, this.#worldHitTolerance());
  }

  #requirePoint2D(id: string): GeometryPoint2D {
    const point = this.#snapshot.scene.points[id];
    if (!point || point.kind !== 'point2d') {
      throw new KleinSdkError('missing_point', `Point ${id} does not exist.`);
    }
    return point;
  }

  #requireDistinctPoints(firstPointId: string, secondPointId: string): void {
    if (firstPointId === secondPointId) {
      throw new KleinSdkError('degenerate_entity', 'Choose two distinct points.');
    }
    this.#requirePoint2D(firstPointId);
    this.#requirePoint2D(secondPointId);
  }

  #requireDistinctEntities(firstEntityId: string, secondEntityId: string): void {
    if (firstEntityId === secondEntityId) {
      throw new KleinSdkError('degenerate_entity', 'Choose two distinct objects.');
    }
  }

  #requireLineLikeEntity(id: string): SegmentEntity | LineEntity | RayEntity {
    const entity = this.#snapshot.scene.entities[id];
    if (!entity || !isLineLike(entity)) {
      throw new KleinSdkError('invalid_line_reference', 'Choose a line, ray, or segment.');
    }
    return entity;
  }

  #requireIntersectableEntity(id: string): GeometryEntity {
    const entity = this.#snapshot.scene.entities[id];
    if (!entity || !isIntersectableEntity(entity)) {
      throw new KleinSdkError('invalid_intersection_reference', 'Choose a line, ray, segment, circle, or polygon.');
    }
    return entity;
  }

  #requireCircleEntity(id: string): CircleEntity {
    const entity = this.#snapshot.scene.entities[id];
    if (!entity || entity.kind !== 'circle') {
      throw new KleinSdkError('invalid_circle_reference', 'Choose a circle.');
    }
    return entity;
  }

  #isLineLikeEntity(id: string): boolean {
    const entity = this.#snapshot.scene.entities[id];
    return entity?.kind === 'segment' || entity?.kind === 'line' || entity?.kind === 'ray';
  }

  #isCircleEntity(id: string): boolean {
    return this.#snapshot.scene.entities[id]?.kind === 'circle';
  }

  #isIntersectableEntity(id: string): boolean {
    const entity = this.#snapshot.scene.entities[id];
    return Boolean(entity && isIntersectableEntity(entity));
  }

  #angleBetweenEntitiesDelta(
    firstEntityId: string,
    secondEntityId: string,
    style: GeometryStyleOptions,
  ): GeometryCalculatorDelta {
    const first = this.#snapshot.scene.entities[firstEntityId];
    const second = this.#snapshot.scene.entities[secondEntityId];
    if (!first || !second || !isLineLike(first) || !isLineLike(second)) {
      throw new KleinSdkError('invalid_angle', 'Angles can be marked between lines, rays, or segments.');
    }

    const firstLine = entityLineEquation(this.#snapshot.scene, first);
    const secondLine = entityLineEquation(this.#snapshot.scene, second);
    const vertexPoint = lineLineIntersection(firstLine, secondLine);
    if (!vertexPoint) {
      throw new KleinSdkError('parallel_lines', 'Parallel lines do not form an intersection angle.');
    }

    const shared = first.pointIds.find(pointId => second.pointIds.includes(pointId));
    if (shared) {
      const firstArm = first.pointIds.find(pointId => pointId !== shared);
      const secondArm = second.pointIds.find(pointId => pointId !== shared);
      if (firstArm && secondArm) {
        const entity = withEntityStyle<AngleEntity>({
          id: this.#ids.next('angle'),
          kind: 'angle',
          pointIds: [firstArm, shared, secondArm],
          radius: 0.7,
          color: style.color ?? '#f97316',
        }, style, '#f97316');
        return { op: 'addEntity', entity };
      }
    }

    const color = style.color ?? '#f97316';
    const vertex = this.#makePoint(vertexPoint.x, vertexPoint.y, { color });
    const firstArm = this.#makePointAlongLine(first, vertexPoint, 1.5, color);
    const secondArm = this.#makePointAlongLine(second, vertexPoint, 1.5, color);
    const angle = withEntityStyle<AngleEntity>({
      id: this.#ids.next('angle'),
      kind: 'angle',
      pointIds: [firstArm.id, vertex.id, secondArm.id],
      radius: 0.7,
      color,
    }, style, '#f97316');
    return {
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: vertex },
        { op: 'addPoint', point: firstArm },
        { op: 'addPoint', point: secondArm },
        { op: 'addEntity', entity: angle },
      ],
    };
  }

  #makePointAlongLine(
    entity: SegmentEntity | LineEntity | RayEntity,
    vertex: Vector2,
    distance: number,
    color: string,
  ): GeometryPoint2D {
    const [aId, bId] = entity.pointIds;
    const a = this.#requirePoint2D(aId);
    const b = this.#requirePoint2D(bId);
    const direction = normalizeVector({ x: b.x - a.x, y: b.y - a.y }) ?? { x: 1, y: 0 };
    const firstCandidate = { x: vertex.x + direction.x * distance, y: vertex.y + direction.y * distance };
    const secondCandidate = { x: vertex.x - direction.x * distance, y: vertex.y - direction.y * distance };
    const farEndpoint = distance2D(vertex, a) >= distance2D(vertex, b) ? a : b;
    const useFirst = distance2D(firstCandidate, farEndpoint) <= distance2D(secondCandidate, farEndpoint);
    return this.#makePoint(useFirst ? firstCandidate.x : secondCandidate.x, useFirst ? firstCandidate.y : secondCandidate.y, {
      color,
      hidden: true,
      locked: true,
    });
  }

  #cursorForTool(tool: GeometryCalculatorTool): string {
    if (tool === 'pan') return 'grab';
    if (tool === 'select' || tool === 'move') return 'default';
    if (tool === 'remove') return 'not-allowed';
    return 'crosshair';
  }

  #statusForTool(): string {
    const tool = this.#snapshot.appState.activeTool;
    if (tool === 'point') return 'Click the canvas or enter x/y coordinates to place a point.';
    if (tool === 'midpoint') return 'Choose two points to create a linked midpoint.';
    if (tool === 'intersect') return 'Choose two intersecting lines, rays, segments, circles, or polygons.';
    if (tool === 'line') return 'Choose two points, or add a line from an equation.';
    if (tool === 'parallel') return 'Choose a source line, then a point for the parallel line.';
    if (tool === 'perpendicular') return 'Choose a source line, then a point for the perpendicular line.';
    if (tool === 'tangent') return 'Choose a circle, then a point on or outside it.';
    if (tool === 'angleBisector') return 'Choose three points: arm, vertex, arm.';
    if (tool === 'segment') return 'Choose two points to draw a segment.';
    if (tool === 'polygon') return 'Click vertices, then click the first vertex or press Enter to close.';
    if (tool === 'circle') return 'Choose a center point, then a radius point.';
    if (tool === 'circleThroughPoints') return 'Choose three non-collinear points.';
    if (tool === 'angle') return 'Choose three points, or choose two intersecting lines or segments.';
    if (tool === 'pan') return 'Drag or use the wheel to move through the canvas. Ctrl-wheel zooms.';
    return 'Origin (0,0) starts centered. Coordinates are in grid units.';
  }

  #setStatus(message: string): void {
    if (this.#statusEl) {
      const view = this.#snapshot.appState.view;
      this.#statusEl.textContent = `${message}  |  zoom ${view.zoom.toFixed(2)}x`;
    }
  }

  #updateToolbarState(): void {
    const activeTool = this.#snapshot.appState.activeTool;
    for (const button of this.#toolButtons) {
      const active = button.dataset.tool === activeTool;
      button.style.background = active ? 'var(--kgc-button-active-bg)' : 'var(--kgc-button-bg)';
      button.style.borderColor = active ? 'var(--kgc-button-active-bg)' : 'var(--kgc-button-border)';
      button.style.color = active ? 'var(--kgc-button-active-text)' : 'var(--kgc-button-text)';
    }
    if (this.#canvas) this.#canvas.style.cursor = this.#cursorForTool(activeTool);
    this.#setStatus(this.#statusForTool());
  }

  #logicalCanvasSize(): { width: number; height: number } {
    const rect = this.#canvas?.getBoundingClientRect();
    return {
      width: Math.max(1, rect?.width ?? 800),
      height: Math.max(1, rect?.height ?? 420),
    };
  }

  #render(): void {
    const ctx = this.#ctx;
    const canvas = this.#canvas;
    if (!ctx || !canvas) return;

    const { width, height } = this.#logicalCanvasSize();
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = this.#theme.canvas;
    ctx.fillRect(0, 0, width, height);

    this.#drawGrid(ctx, width, height);
    this.#drawEntities(ctx);
    this.#drawDrafts(ctx);
    this.#drawPoints(ctx);
    this.#setStatus(this.#statusForTool());
  }

  #drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const { view, grid } = this.#snapshot.appState;
    const scale = grid.unitSize * view.zoom;
    const bounds = this.#worldBounds(width, height);
    const step = chooseGridStep(scale);
    const minorColor = this.#theme.gridMinor;
    const majorColor = this.#theme.gridMajor;
    const axisColor = this.#theme.axis;

    ctx.save();
    ctx.lineCap = 'butt';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillStyle = this.#theme.gridLabel;

    const startX = Math.floor(bounds.minX / step) * step;
    const endX = Math.ceil(bounds.maxX / step) * step;
    for (let x = startX; x <= endX + 1e-9; x += step) {
      const screen = geometryWorldToScreen({ x, y: 0 }, view, grid.unitSize);
      const major = isMajorGridLine(x, grid.majorEvery);
      ctx.strokeStyle = Math.abs(x) < 1e-9 ? axisColor : major ? majorColor : minorColor;
      ctx.lineWidth = Math.abs(x) < 1e-9 ? 1.5 : major ? 1 : 0.6;
      ctx.beginPath();
      ctx.moveTo(screen.x, 0);
      ctx.lineTo(screen.x, height);
      ctx.stroke();
      if (grid.labels && major && Math.abs(x) > 1e-9) {
        ctx.fillText(formatGridLabel(x), screen.x + 4, clamp(view.y + 14, 14, height - 4));
      }
    }

    const startY = Math.floor(bounds.minY / step) * step;
    const endY = Math.ceil(bounds.maxY / step) * step;
    for (let y = startY; y <= endY + 1e-9; y += step) {
      const screen = geometryWorldToScreen({ x: 0, y }, view, grid.unitSize);
      const major = isMajorGridLine(y, grid.majorEvery);
      ctx.strokeStyle = Math.abs(y) < 1e-9 ? axisColor : major ? majorColor : minorColor;
      ctx.lineWidth = Math.abs(y) < 1e-9 ? 1.5 : major ? 1 : 0.6;
      ctx.beginPath();
      ctx.moveTo(0, screen.y);
      ctx.lineTo(width, screen.y);
      ctx.stroke();
      if (grid.labels && major && Math.abs(y) > 1e-9) {
        ctx.fillText(formatGridLabel(y), clamp(view.x + 4, 4, width - 30), screen.y - 4);
      }
    }

    const origin = geometryWorldToScreen({ x: 0, y: 0 }, view, grid.unitSize);
    ctx.fillStyle = this.#theme.text;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText('0,0', origin.x + 6, origin.y - 6);
    ctx.restore();
  }

  #drawEntities(ctx: CanvasRenderingContext2D): void {
    const entities = orderedEntities(this.#snapshot.scene);
    for (const entity of entities) {
      if (entity.hidden) continue;
      switch (entity.kind) {
        case 'polygon':
          this.#drawPolygon(ctx, entity);
          break;
        case 'locus':
          this.#drawLocus(ctx, entity);
          break;
        case 'circle':
          this.#drawCircle(ctx, entity);
          break;
        case 'line':
          this.#drawLine(ctx, entity);
          break;
        case 'segment':
          this.#drawSegment(ctx, entity);
          break;
        case 'ray':
          this.#drawRay(ctx, entity);
          break;
        case 'vector':
          this.#drawSegment(ctx, entity, true);
          break;
        case 'angle':
          this.#drawAngle(ctx, entity);
          break;
        case 'arc':
          this.#drawArc(ctx, entity);
          break;
        default:
          break;
      }
    }
  }

  #drawPoints(ctx: CanvasRenderingContext2D): void {
    const selected = this.#snapshot.appState.selected;
    for (const point of Object.values(this.#snapshot.scene.points)) {
      if (point.kind !== 'point2d' || point.hidden) continue;
      const screen = this.worldToScreen(point);
      const selectedPoint = selected?.kind === 'point' && selected.id === point.id;
      ctx.save();
      ctx.fillStyle = point.color ?? this.#theme.pointColor;
      ctx.strokeStyle = selectedPoint ? this.#theme.selection : this.#theme.canvas;
      ctx.lineWidth = selectedPoint ? 3 : 2;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, selectedPoint ? POINT_RADIUS_PX + 2 : POINT_RADIUS_PX, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (point.label) {
        ctx.font = '600 12px Inter, system-ui, sans-serif';
        ctx.fillStyle = this.#theme.text;
        ctx.fillText(point.label, screen.x + 8, screen.y - 8);
      }
      ctx.restore();
    }
  }

  #drawPolygon(ctx: CanvasRenderingContext2D, entity: PolygonEntity): void {
    const points = entity.pointIds.map(id => point2D(this.#snapshot.scene, id)).filter(isPoint2D);
    if (points.length < 3) return;
    const selected = this.#snapshot.appState.selected?.kind === 'entity' && this.#snapshot.appState.selected.id === entity.id;
    const firstPoint = points[0];
    if (!firstPoint) return;
    ctx.save();
    ctx.beginPath();
    const first = this.worldToScreen(firstPoint);
    ctx.moveTo(first.x, first.y);
    for (const point of points.slice(1)) {
      const screen = this.worldToScreen(point);
      ctx.lineTo(screen.x, screen.y);
    }
    ctx.closePath();
    ctx.fillStyle = entity.fillColor ?? this.#theme.fill;
    ctx.fill();
    ctx.strokeStyle = selected ? this.#theme.selection : entity.strokeColor ?? entity.color ?? this.#theme.drawColor;
    ctx.lineWidth = selected ? 4 : entity.width ?? DEFAULT_WIDTH;
    ctx.stroke();
    this.#drawEntityLabel(ctx, entity, polygonCentroid(points));
    ctx.restore();
  }

  #drawLocus(ctx: CanvasRenderingContext2D, entity: LocusEntity): void {
    if (entity.points.length < 2) return;
    const selected = this.#snapshot.appState.selected?.kind === 'entity' && this.#snapshot.appState.selected.id === entity.id;
    const firstPoint = entity.points[0];
    if (!firstPoint) return;
    ctx.save();
    ctx.beginPath();
    const first = this.worldToScreen(firstPoint);
    ctx.moveTo(first.x, first.y);
    for (const point of entity.points.slice(1)) {
      const screen = this.worldToScreen(point);
      ctx.lineTo(screen.x, screen.y);
    }
    if (entity.closed) {
      ctx.closePath();
      if (entity.fillColor) {
        ctx.fillStyle = entity.fillColor;
        ctx.fill();
      }
    }
    ctx.strokeStyle = selected ? this.#theme.selection : entity.strokeColor ?? entity.color ?? this.#theme.drawColor;
    ctx.lineWidth = selected ? 4 : entity.width ?? DEFAULT_WIDTH;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    this.#drawEntityLabel(ctx, entity, polygonCentroid(entity.points));
    ctx.restore();
  }

  #drawCircle(ctx: CanvasRenderingContext2D, entity: CircleEntity): void {
    const center = point2D(this.#snapshot.scene, entity.centerId);
    if (!center || entity.radius <= 0) return;
    const screen = this.worldToScreen(center);
    const radius = entity.radius * this.#snapshot.appState.grid.unitSize * this.#snapshot.appState.view.zoom;
    const selected = this.#snapshot.appState.selected?.kind === 'entity' && this.#snapshot.appState.selected.id === entity.id;
    ctx.save();
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = entity.fillColor ?? colorWithAlpha(entity.color ?? this.#theme.drawColor, 0.1);
    ctx.fill();
    ctx.strokeStyle = selected ? this.#theme.selection : entity.color ?? this.#theme.drawColor;
    ctx.lineWidth = selected ? 4 : entity.width ?? DEFAULT_WIDTH;
    ctx.stroke();
    this.#drawEntityLabel(ctx, entity, { x: center.x + entity.radius * 0.7, y: center.y + entity.radius * 0.7 });
    ctx.restore();
  }

  #drawLine(ctx: CanvasRenderingContext2D, entity: LineEntity): void {
    const equation = entity.equation ?? lineEquationFromEntityPoints(this.#snapshot.scene, entity);
    if (!equation) return;
    const size = this.#logicalCanvasSize();
    const clipped = clipLineToBounds(equation, this.#worldBounds(size.width, size.height));
    if (!clipped) return;
    this.#strokeWorldLine(ctx, clipped[0], clipped[1], entity, false);
  }

  #drawSegment(ctx: CanvasRenderingContext2D, entity: SegmentEntity | VectorEntity, arrow = false): void {
    const a = point2D(this.#snapshot.scene, entity.pointIds[0]);
    const b = point2D(this.#snapshot.scene, entity.pointIds[1]);
    if (!a || !b) return;
    this.#strokeWorldLine(ctx, a, b, entity, arrow);
  }

  #drawRay(ctx: CanvasRenderingContext2D, entity: RayEntity): void {
    const a = point2D(this.#snapshot.scene, entity.pointIds[0]);
    const b = point2D(this.#snapshot.scene, entity.pointIds[1]);
    if (!a || !b) return;
    const size = this.#logicalCanvasSize();
    const clipped = clipRayToBounds(a, b, this.#worldBounds(size.width, size.height));
    if (!clipped) return;
    this.#strokeWorldLine(ctx, clipped[0], clipped[1], entity, false);
  }

  #drawAngle(ctx: CanvasRenderingContext2D, entity: AngleEntity): void {
    const a = point2D(this.#snapshot.scene, entity.pointIds[0]);
    const vertex = point2D(this.#snapshot.scene, entity.pointIds[1]);
    const c = point2D(this.#snapshot.scene, entity.pointIds[2]);
    if (!a || !vertex || !c) return;
    const sa = this.worldToScreen(a);
    const sv = this.worldToScreen(vertex);
    const sc = this.worldToScreen(c);
    const selected = this.#snapshot.appState.selected?.kind === 'entity' && this.#snapshot.appState.selected.id === entity.id;
    const radius = positiveNumber(entity.radius, 0.7) * this.#snapshot.appState.grid.unitSize * this.#snapshot.appState.view.zoom;
    const start = Math.atan2(sa.y - sv.y, sa.x - sv.x);
    const end = Math.atan2(sc.y - sv.y, sc.x - sv.x);
    const delta = normalizeAngleDelta(end - start);
    ctx.save();
    ctx.strokeStyle = selected ? this.#theme.selection : entity.color ?? this.#theme.angle;
    ctx.lineWidth = selected ? 4 : entity.width ?? 2.5;
    ctx.beginPath();
    ctx.arc(sv.x, sv.y, radius, start, start + delta, delta < 0);
    ctx.stroke();
    const mid = start + delta / 2;
    const labelPoint = {
      x: vertex.x + Math.cos(-mid) * (positiveNumber(entity.radius, 0.7) + 0.35),
      y: vertex.y + Math.sin(-mid) * (positiveNumber(entity.radius, 0.7) + 0.35),
    };
    const label = entity.label ?? `${angleMeasureDegrees(a, vertex, c).toFixed(1)} deg`;
    this.#drawTextAtWorld(ctx, labelPoint, label, this.#theme.angleText);
    ctx.restore();
  }

  #drawArc(ctx: CanvasRenderingContext2D, entity: ArcEntity): void {
    const center = point2D(this.#snapshot.scene, entity.centerId);
    const start = point2D(this.#snapshot.scene, entity.startId);
    const end = point2D(this.#snapshot.scene, entity.endId);
    if (!center || !start || !end) return;
    const screenCenter = this.worldToScreen(center);
    const radius = distance2D(center, start) * this.#snapshot.appState.grid.unitSize * this.#snapshot.appState.view.zoom;
    const screenStart = this.worldToScreen(start);
    const screenEnd = this.worldToScreen(end);
    const startAngle = Math.atan2(screenStart.y - screenCenter.y, screenStart.x - screenCenter.x);
    const endAngle = Math.atan2(screenEnd.y - screenCenter.y, screenEnd.x - screenCenter.x);
    const delta = normalizeAngleDelta(endAngle - startAngle);
    ctx.save();
    ctx.strokeStyle = entity.color ?? this.#theme.drawColor;
    ctx.lineWidth = entity.width ?? DEFAULT_WIDTH;
    ctx.beginPath();
    ctx.arc(screenCenter.x, screenCenter.y, radius, startAngle, startAngle + delta, delta < 0);
    ctx.stroke();
    ctx.restore();
  }

  #drawDrafts(ctx: CanvasRenderingContext2D): void {
    const hover = this.#hoverWorld;
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = this.#theme.draft;
    ctx.lineWidth = 1.5;

    if (hover && this.#pendingLineStartId) {
      const start = point2D(this.#snapshot.scene, this.#pendingLineStartId);
      if (start) this.#strokeWorldLine(ctx, start, hover, { color: this.#theme.draft }, false);
    }

    if (this.#draftPolygonPointIds.length) {
      const points = this.#draftPolygonPointIds.map(id => point2D(this.#snapshot.scene, id)).filter(isPoint2D);
      if (hover) points.push(hover as GeometryPoint2D);
      if (points.length >= 2) {
        for (let index = 0; index < points.length - 1; index += 1) {
          const current = points[index];
          const next = points[index + 1];
          if (current && next) this.#strokeWorldLine(ctx, current, next, { color: this.#theme.draft }, false);
        }
      }
    }

    if (hover && this.#pendingCircleCenterId) {
      const center = point2D(this.#snapshot.scene, this.#pendingCircleCenterId);
      if (center) {
        const screen = this.worldToScreen(center);
        const radius = distance2D(center, hover) * this.#snapshot.appState.grid.unitSize * this.#snapshot.appState.view.zoom;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  #strokeWorldLine(
    ctx: CanvasRenderingContext2D,
    a: Vector2,
    b: Vector2,
    style: Partial<GeometryEntityDisplay>,
    arrow: boolean,
  ): void {
    const sa = this.worldToScreen(a);
    const sb = this.worldToScreen(b);
    const selected = 'id' in style && this.#snapshot.appState.selected?.kind === 'entity' && this.#snapshot.appState.selected.id === style.id;
    ctx.save();
    ctx.strokeStyle = selected ? this.#theme.selection : style.color ?? style.strokeColor ?? this.#theme.drawColor;
    ctx.lineWidth = selected ? 4 : style.width ?? DEFAULT_WIDTH;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
    if (arrow) {
      drawArrowHead(ctx, sa, sb, ctx.strokeStyle.toString());
    }
    if (style.label) {
      this.#drawTextAtWorld(ctx, midpoint2D(a, b), style.label, this.#theme.text);
    }
    ctx.restore();
  }

  #drawEntityLabel(ctx: CanvasRenderingContext2D, entity: GeometryEntityDisplay, point: Vector2): void {
    if (entity.label) this.#drawTextAtWorld(ctx, point, entity.label, this.#theme.text);
  }

  #drawTextAtWorld(ctx: CanvasRenderingContext2D, point: Vector2, text: string, color: string): void {
    const screen = this.worldToScreen(point);
    ctx.save();
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.#theme.textHalo;
    ctx.strokeText(text, screen.x + 6, screen.y - 6);
    ctx.fillStyle = color;
    ctx.fillText(text, screen.x + 6, screen.y - 6);
    ctx.restore();
  }

  #worldBounds(width: number, height: number): WorldBounds {
    const view = this.#snapshot.appState.view;
    const unitSize = this.#snapshot.appState.grid.unitSize;
    const topLeft = screenToGeometryWorld({ x: 0, y: 0 }, view, unitSize);
    const bottomRight = screenToGeometryWorld({ x: width, y: height }, view, unitSize);
    return {
      minX: Math.min(topLeft.x, bottomRight.x),
      maxX: Math.max(topLeft.x, bottomRight.x),
      minY: Math.min(topLeft.y, bottomRight.y),
      maxY: Math.max(topLeft.y, bottomRight.y),
    };
  }
}

interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface LinearExpression {
  a: number;
  b: number;
  c: number;
}

interface SnapOptions {
  toleranceWorld: number;
  gridStep: number;
  excludePointIds?: string[];
}

function normalizeSnapshot(snapshot: GeometryCalculatorSnapshot): GeometryCalculatorSnapshot {
  const fallback = createEmptyGeometryCalculatorSnapshot();
  const scene = recomputeGeometryScene({
    points: { ...snapshot.scene.points },
    entities: { ...snapshot.scene.entities },
    constraints: { ...(snapshot.scene.constraints ?? {}) },
    order: snapshot.scene.order
      ? [...snapshot.scene.order]
      : Object.keys(snapshot.scene.entities),
  });
  return {
    ...fallback,
    ...snapshot,
    scene,
    appState: {
      ...fallback.appState,
      ...snapshot.appState,
      view: {
        ...fallback.appState.view,
        ...snapshot.appState.view,
        zoom: clampGeometryZoom(snapshot.appState.view.zoom),
      },
      grid: {
        ...fallback.appState.grid,
        ...snapshot.appState.grid,
      },
      selected: snapshot.appState.selected ?? null,
    },
  };
}

function deleteGeometryIds(
  snapshot: GeometryCalculatorSnapshot,
  ids: string[],
): GeometryCalculatorSnapshot {
  const deleteSet = new Set([...ids, ...geometryDependentsOf(snapshot.scene, ids)]);
  const points = { ...snapshot.scene.points };
  const entities = { ...snapshot.scene.entities };
  const constraints = { ...(snapshot.scene.constraints ?? {}) };
  for (const id of deleteSet) {
    delete points[id];
    delete entities[id];
    delete constraints[id];
  }
  for (const [entityId, entity] of Object.entries(entities)) {
    if (geometryEntityPointIds(entity).some(pointId => deleteSet.has(pointId))) {
      delete entities[entityId];
      deleteSet.add(entityId);
    }
  }
  for (const [constraintId, constraint] of Object.entries(constraints)) {
    if (geometryConstraintDependencies(constraint).some(id => deleteSet.has(id))) {
      delete constraints[constraintId];
      deleteSet.add(constraintId);
    }
  }
  return {
    ...snapshot,
    scene: {
      ...snapshot.scene,
      points,
      entities,
      constraints,
      order: snapshot.scene.order.filter(id => !deleteSet.has(id)),
    },
    appState: {
      ...snapshot.appState,
      selected: snapshot.appState.selected && deleteSet.has(snapshot.appState.selected.id)
        ? null
        : snapshot.appState.selected,
    },
  };
}

function cloneSnapshot(snapshot: GeometryCalculatorSnapshot): GeometryCalculatorSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as GeometryCalculatorSnapshot;
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function finiteNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function isCornerOriginView(view: View2D): boolean {
  return Math.abs(view.x) < 1e-9 && Math.abs(view.y) < 1e-9;
}

function inputStyle(width: string): Partial<CSSStyleDeclaration> {
  return {
    width,
    minHeight: '30px',
    border: '1px solid var(--kgc-button-border)',
    borderRadius: '6px',
    padding: '0 8px',
    color: 'var(--kgc-text)',
    background: 'var(--kgc-input-bg)',
    font: '600 12px/1 Inter, ui-sans-serif, system-ui, sans-serif',
  };
}

function resolveGeometryCalculatorTheme(
  input: GeometryCalculatorThemeInput | undefined,
): GeometryCalculatorTheme {
  if (input === 'dark') return { ...DARK_GEOMETRY_CALCULATOR_THEME };
  if (input === 'light' || input === undefined) return { ...LIGHT_GEOMETRY_CALCULATOR_THEME };
  const base = input.colorScheme === 'dark' || input.name === 'dark'
    ? DARK_GEOMETRY_CALCULATOR_THEME
    : LIGHT_GEOMETRY_CALCULATOR_THEME;
  return { ...base, ...input };
}

function applyGeometryCalculatorTheme(root: HTMLElement, theme: GeometryCalculatorTheme): void {
  const tokens: Record<string, string> = {
    '--kgc-background': theme.background,
    '--kgc-surface': theme.surface,
    '--kgc-surface-raised': theme.surfaceRaised,
    '--kgc-canvas': theme.canvas,
    '--kgc-border': theme.border,
    '--kgc-text': theme.text,
    '--kgc-muted-text': theme.mutedText,
    '--kgc-faint-text': theme.faintText,
    '--kgc-input-bg': theme.inputBackground,
    '--kgc-button-bg': theme.buttonBackground,
    '--kgc-button-text': theme.buttonText,
    '--kgc-button-border': theme.buttonBorder,
    '--kgc-button-active-bg': theme.buttonActiveBackground,
    '--kgc-button-active-text': theme.buttonActiveText,
    '--kgc-accent': theme.accent,
  };
  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(name, value);
  }
}

function readNumberInput(input: HTMLInputElement): number {
  const value = Number(input.value);
  if (!Number.isFinite(value)) {
    throw new KleinSdkError('invalid_number', `Invalid number: ${input.value}`);
  }
  return value;
}

function withPointStyle(point: GeometryPoint2D, style: GeometryStyleOptions): GeometryPoint2D {
  const next: GeometryPoint2D = { ...point };
  if (style.label !== undefined) next.label = style.label;
  if (style.color !== undefined) next.color = style.color;
  if (style.hidden !== undefined) next.hidden = style.hidden;
  if (style.locked !== undefined) next.locked = style.locked;
  return next;
}

function withEntityStyle<T extends GeometryEntity>(
  entity: T,
  style: GeometryStyleOptions,
  defaultColor: string,
): T {
  const next = { ...entity } as T & GeometryEntityDisplay;
  const color = style.color ?? style.strokeColor ?? defaultColor;
  if (style.label !== undefined) next.label = style.label;
  if (style.color !== undefined || !next.color) next.color = color;
  if (style.strokeColor !== undefined) next.strokeColor = style.strokeColor;
  if (style.fillColor !== undefined) next.fillColor = style.fillColor;
  if (style.width !== undefined && Number.isFinite(style.width) && style.width > 0) next.width = style.width;
  if (style.hidden !== undefined) next.hidden = style.hidden;
  if (style.locked !== undefined) next.locked = style.locked;
  return next as T;
}

function makeGeometryConstraint(
  draft: GeometryConstraintDraft,
  fallbackId: string,
  scene: GeometryCalculatorScene,
): GeometryConstraint {
  const id = draft.id && draft.id.trim() ? draft.id : fallbackId;
  const constraint = { ...draft, id } as GeometryConstraint;
  validateGeometryConstraint(constraint, scene);
  return constraint;
}

function validateGeometryConstraint(constraint: GeometryConstraint, scene: GeometryCalculatorScene): void {
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

function isConstraintLineEntity(entity: GeometryEntity): boolean {
  return entity.kind === 'segment'
    || entity.kind === 'line'
    || entity.kind === 'ray'
    || entity.kind === 'vector';
}

function colorWithAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#') || color.length !== 7) return color;
  const value = Math.round(clamp(alpha, 0, 1) * 255).toString(16).padStart(2, '0');
  return `${color}${value}`;
}

function parseLinearExpression(input: string): LinearExpression {
  const compact = input.replace(/\*/g, '');
  const terms = compact.match(/[+-]?[^+-]+/g);
  if (!terms?.length) {
    throw new KleinSdkError('invalid_line_equation', `Invalid expression: ${input}`);
  }
  const result: LinearExpression = { a: 0, b: 0, c: 0 };
  for (const term of terms) {
    const sign = term.startsWith('-') ? -1 : 1;
    const unsigned = term.replace(/^[+-]/, '');
    if (!unsigned) continue;
    if (unsigned.includes('x')) {
      result.a += sign * parseCoefficient(unsigned, 'x');
    } else if (unsigned.includes('y')) {
      result.b += sign * parseCoefficient(unsigned, 'y');
    } else {
      result.c += sign * parseScalar(unsigned);
    }
  }
  return result;
}

function parseCoefficient(term: string, variable: 'x' | 'y'): number {
  if ((term.match(/[xy]/g) ?? []).length !== 1 || !term.endsWith(variable)) {
    throw new KleinSdkError('invalid_line_equation', `Invalid linear term: ${term}`);
  }
  const coefficient = term.slice(0, -1);
  return coefficient ? parseScalar(coefficient) : 1;
}

function parseScalar(input: string): number {
  if (input.includes('/')) {
    const [numerator, denominator] = input.split('/');
    const n = Number(numerator);
    const d = Number(denominator);
    if (Number.isFinite(n) && Number.isFinite(d) && Math.abs(d) > 1e-12) return n / d;
  }
  const value = Number(input);
  if (!Number.isFinite(value)) {
    throw new KleinSdkError('invalid_line_equation', `Invalid number in equation: ${input}`);
  }
  return value;
}

function normalizeLineEquation(equation: GeometryLineEquation): GeometryLineEquation {
  const magnitude = Math.hypot(equation.a, equation.b);
  if (!Number.isFinite(magnitude) || magnitude < 1e-12 || !Number.isFinite(equation.c)) {
    throw new KleinSdkError('invalid_line_equation', 'Line equation must have a finite x or y coefficient.');
  }
  const normalized: GeometryLineEquation = {
    a: equation.a / magnitude,
    b: equation.b / magnitude,
    c: equation.c / magnitude,
  };
  if (equation.input !== undefined) normalized.input = equation.input;
  return normalized;
}

function sameGeometryLineEquation(first: GeometryLineEquation, second: GeometryLineEquation): boolean {
  const sameDirection = Math.abs(first.a - second.a) <= 1e-9
    && Math.abs(first.b - second.b) <= 1e-9
    && Math.abs(first.c - second.c) <= 1e-9;
  const oppositeDirection = Math.abs(first.a + second.a) <= 1e-9
    && Math.abs(first.b + second.b) <= 1e-9
    && Math.abs(first.c + second.c) <= 1e-9;
  return sameDirection || oppositeDirection;
}

function helperPointsForEquation(
  equation: GeometryLineEquation,
  ids: ReturnType<typeof createIdFactory>,
  color: string,
): [GeometryPoint2D, GeometryPoint2D] {
  let first: Vector2;
  let second: Vector2;
  if (Math.abs(equation.b) >= Math.abs(equation.a)) {
    first = { x: -2, y: solveLineY(equation, -2) };
    second = { x: 2, y: solveLineY(equation, 2) };
  } else {
    first = { x: solveLineX(equation, -2), y: -2 };
    second = { x: solveLineX(equation, 2), y: 2 };
  }
  return [
    { id: ids.next('p'), kind: 'point2d', x: first.x, y: first.y, color, hidden: true, locked: true },
    { id: ids.next('p'), kind: 'point2d', x: second.x, y: second.y, color, hidden: true, locked: true },
  ];
}

function helperPointForLineEquation(
  equation: GeometryLineEquation,
  through: GeometryPoint2D,
  ids: ReturnType<typeof createIdFactory>,
  color: string,
): GeometryPoint2D {
  const direction = normalizeVector({ x: equation.b, y: -equation.a }) ?? { x: 1, y: 0 };
  return {
    id: ids.next('p'),
    kind: 'point2d',
    x: through.x + direction.x,
    y: through.y + direction.y,
    color,
    hidden: true,
    locked: true,
  };
}

function constructedLineEquation(
  constructionKind: 'parallelLine' | 'perpendicularLine',
  source: GeometryLineEquation,
  through: Vector2,
): GeometryLineEquation {
  if (constructionKind === 'parallelLine') {
    return normalizeLineEquation({
      a: source.a,
      b: source.b,
      c: -(source.a * through.x + source.b * through.y),
    });
  }
  return normalizeLineEquation({
    a: -source.b,
    b: source.a,
    c: -((-source.b) * through.x + source.a * through.y),
  });
}

function solveLineY(equation: GeometryLineEquation, x: number): number {
  return -(equation.a * x + equation.c) / equation.b;
}

function solveLineX(equation: GeometryLineEquation, y: number): number {
  return -(equation.b * y + equation.c) / equation.a;
}

function point2D(scene: GeometryCalculatorScene, id: string): GeometryPoint2D | undefined {
  const point = scene.points[id];
  return point?.kind === 'point2d' ? point : undefined;
}

function isPoint2D(point: GeometryPoint2D | undefined): point is GeometryPoint2D {
  return Boolean(point);
}

function orderedEntities(scene: GeometryCalculatorScene): GeometryEntity[] {
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

function resolveGeometrySnap(
  scene: GeometryCalculatorScene,
  world: Vector2,
  options: SnapOptions,
): Vector2 {
  const excluded = new Set(options.excludePointIds ?? []);
  let best: { point: Vector2; distance: number } | null = null;
  for (const point of Object.values(scene.points)) {
    if (point.kind !== 'point2d' || point.hidden || excluded.has(point.id)) continue;
    const distance = distance2D(world, point);
    if (distance <= options.toleranceWorld && (!best || distance < best.distance)) {
      best = { point, distance };
    }
  }
  if (best) return { x: best.point.x, y: best.point.y };

  for (const point of candidateSnapPoints(scene)) {
    const distance = distance2D(world, point);
    if (distance <= options.toleranceWorld && (!best || distance < best.distance)) {
      best = { point, distance };
    }
  }
  if (best) return { x: best.point.x, y: best.point.y };

  return {
    x: Math.round(world.x / options.gridStep) * options.gridStep,
    y: Math.round(world.y / options.gridStep) * options.gridStep,
  };
}

function candidateSnapPoints(scene: GeometryCalculatorScene): Vector2[] {
  const candidates: Vector2[] = [];
  const segments = lineSegmentsForSnap(scene);
  for (const segment of segments) {
    candidates.push(midpoint2D(segment.a, segment.b));
  }
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const first = segments[i];
      const second = segments[j];
      if (!first || !second) continue;
      const hit = segmentIntersection(first.a, first.b, second.a, second.b);
      if (hit) candidates.push(hit);
    }
  }
  return candidates;
}

function lineSegmentsForSnap(scene: GeometryCalculatorScene): Array<{ a: Vector2; b: Vector2 }> {
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

function hitTestGeometryCalculator(
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

function distanceToEntity(scene: GeometryCalculatorScene, world: Vector2, entity: GeometryEntity): number {
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
    case 'plane':
      return Infinity;
  }
}

function distanceToLocus(point: Vector2, entity: LocusEntity): number {
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

function distanceToSegment(point: Vector2, a: Vector2, b: Vector2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-12) return distance2D(point, a);
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1);
  return distance2D(point, { x: a.x + dx * t, y: a.y + dy * t });
}

function distanceToRay(point: Vector2, a: Vector2, b: Vector2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-12) return distance2D(point, a);
  const t = Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared);
  return distance2D(point, { x: a.x + dx * t, y: a.y + dy * t });
}

function segmentIntersection(a: Vector2, b: Vector2, c: Vector2, d: Vector2): Vector2 | null {
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

function lineLineIntersection(first: GeometryLineEquation, second: GeometryLineEquation): Vector2 | null {
  const determinant = first.a * second.b - second.a * first.b;
  if (Math.abs(determinant) < 1e-9) return null;
  return {
    x: (first.b * second.c - second.b * first.c) / determinant,
    y: (second.a * first.c - first.a * second.c) / determinant,
  };
}

function pointInPolygon(point: Vector2, polygon: Vector2[]): boolean {
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

function polygonCentroid(points: Vector2[]): Vector2 {
  if (!points.length) return { x: 0, y: 0 };
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function shapeCoordinates(kind: GeometryShapeKind, center: Vector2, options: ShapeCreationOptions): Vector2[] {
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

function regularPolygonCoordinates(center: Vector2, sides: number, radius: number, startAngle: number): Vector2[] {
  return Array.from({ length: sides }, (_, index) => {
    const angle = startAngle + (index * Math.PI * 2) / sides;
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
  });
}

function lineEquationFromEntityPoints(scene: GeometryCalculatorScene, entity: LineEntity): GeometryLineEquation | null {
  const a = point2D(scene, entity.pointIds[0]);
  const b = point2D(scene, entity.pointIds[1]);
  if (!a || !b) return null;
  return lineEquationFromPoints(a, b);
}

function entityLineEquation(
  scene: GeometryCalculatorScene,
  entity: SegmentEntity | LineEntity | RayEntity,
): GeometryLineEquation {
  if (entity.kind === 'line' && entity.equation) return entity.equation;
  const a = point2D(scene, entity.pointIds[0]);
  const b = point2D(scene, entity.pointIds[1]);
  if (!a || !b) {
    throw new KleinSdkError('missing_point', 'Line entity references missing points.');
  }
  return lineEquationFromPoints(a, b);
}

function isLineLike(entity: GeometryEntity): entity is SegmentEntity | LineEntity | RayEntity {
  return entity.kind === 'segment' || entity.kind === 'line' || entity.kind === 'ray';
}

function isIntersectableEntity(entity: GeometryEntity): boolean {
  return entity.kind === 'segment'
    || entity.kind === 'line'
    || entity.kind === 'ray'
    || entity.kind === 'vector'
    || entity.kind === 'circle'
    || entity.kind === 'polygon';
}

function deltaAddedEntityId(delta: GeometryCalculatorDelta, kind: GeometryEntity['kind']): string | null {
  if (delta.op === 'addEntity' && delta.entity.kind === kind) return delta.entity.id;
  if (delta.op === 'batch') {
    for (const child of delta.deltas) {
      const id = deltaAddedEntityId(child, kind);
      if (id) return id;
    }
  }
  return null;
}

function clipLineToBounds(equation: GeometryLineEquation, bounds: WorldBounds): [Vector2, Vector2] | null {
  const candidates: Vector2[] = [];
  if (Math.abs(equation.b) > 1e-12) {
    for (const x of [bounds.minX, bounds.maxX]) {
      const y = solveLineY(equation, x);
      if (y >= bounds.minY - 1e-9 && y <= bounds.maxY + 1e-9) candidates.push({ x, y });
    }
  }
  if (Math.abs(equation.a) > 1e-12) {
    for (const y of [bounds.minY, bounds.maxY]) {
      const x = solveLineX(equation, y);
      if (x >= bounds.minX - 1e-9 && x <= bounds.maxX + 1e-9) candidates.push({ x, y });
    }
  }
  const unique = uniquePoints(candidates);
  if (unique.length < 2) return null;
  return farthestPair(unique);
}

function clipRayToBounds(a: Vector2, b: Vector2, bounds: WorldBounds): [Vector2, Vector2] | null {
  const equation = lineEquationFromPoints(a, b);
  const clipped = clipLineToBounds(equation, bounds);
  if (!clipped) return null;
  const direction = normalizeVector({ x: b.x - a.x, y: b.y - a.y });
  if (!direction) return null;
  const forward = clipped.filter(point => ((point.x - a.x) * direction.x + (point.y - a.y) * direction.y) >= -1e-9);
  if (pointWithinBounds(a, bounds)) {
    if (!forward.length) return null;
    return [a, forward.reduce((best, point) => distance2D(a, point) > distance2D(a, best) ? point : best, forward[0] as Vector2)];
  }
  if (forward.length >= 2) return farthestPair(forward);
  return null;
}

function uniquePoints(points: Vector2[]): Vector2[] {
  const result: Vector2[] = [];
  for (const point of points) {
    if (!result.some(candidate => distance2D(candidate, point) < 1e-7)) result.push(point);
  }
  return result;
}

function farthestPair(points: Vector2[]): [Vector2, Vector2] {
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

function pointWithinBounds(point: Vector2, bounds: WorldBounds): boolean {
  return point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY;
}

function normalizeVector(vector: Vector2): Vector2 | null {
  const length = Math.hypot(vector.x, vector.y);
  if (length < 1e-12) return null;
  return { x: vector.x / length, y: vector.y / length };
}

function normalizeAngleDelta(delta: number): number {
  let result = delta;
  while (result <= -Math.PI) result += Math.PI * 2;
  while (result > Math.PI) result -= Math.PI * 2;
  return result;
}

function cross(a: Vector2, b: Vector2): number {
  return a.x * b.y - a.y * b.x;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function chooseGridStep(pixelScale: number): number {
  let step = 1;
  while (pixelScale * step < 24) step *= 2;
  while (pixelScale * step > 120 && step > 0.25) step /= 2;
  return step;
}

function isMajorGridLine(value: number, majorEvery: number): boolean {
  const rounded = Math.round(value / majorEvery) * majorEvery;
  return Math.abs(value - rounded) < 1e-9;
}

function formatGridLabel(value: number): string {
  return Math.abs(value - Math.round(value)) < 1e-9 ? String(Math.round(value)) : value.toFixed(2);
}

function drawArrowHead(ctx: CanvasRenderingContext2D, from: Vector2, to: Vector2, color: string): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const length = 10;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - Math.cos(angle - Math.PI / 6) * length, to.y - Math.sin(angle - Math.PI / 6) * length);
  ctx.lineTo(to.x - Math.cos(angle + Math.PI / 6) * length, to.y - Math.sin(angle + Math.PI / 6) * length);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function geometrySceneToSvg(
  snapshot: GeometryCalculatorSnapshot,
  size: { width: number; height: number },
): string {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('width', String(size.width));
  svg.setAttribute('height', String(size.height));
  svg.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);
  const background = document.createElementNS(SVG_NS, 'rect');
  background.setAttribute('width', '100%');
  background.setAttribute('height', '100%');
  background.setAttribute('fill', '#ffffff');
  svg.append(background);

  const view = snapshot.appState.view;
  const unitSize = snapshot.appState.grid.unitSize;
  const topLeft = screenToGeometryWorld({ x: 0, y: 0 }, view, unitSize);
  const bottomRight = screenToGeometryWorld({ x: size.width, y: size.height }, view, unitSize);
  const bounds: WorldBounds = {
    minX: Math.min(topLeft.x, bottomRight.x),
    maxX: Math.max(topLeft.x, bottomRight.x),
    minY: Math.min(topLeft.y, bottomRight.y),
    maxY: Math.max(topLeft.y, bottomRight.y),
  };

  for (const entity of orderedEntities(snapshot.scene)) {
    if (entity.hidden) continue;

    if (entity.kind === 'polygon') {
      const points = entity.pointIds.map(id => point2D(snapshot.scene, id)).filter(isPoint2D);
      if (points.length < 3) continue;
      const polygon = document.createElementNS(SVG_NS, 'polygon');
      polygon.setAttribute('points', points.map(point => {
        const screen = geometryWorldToScreen(point, view, unitSize);
        return `${screen.x},${screen.y}`;
      }).join(' '));
      polygon.setAttribute('fill', entity.fillColor ?? DEFAULT_FILL);
      polygon.setAttribute('stroke', entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR);
      polygon.setAttribute('stroke-width', String(entity.width ?? DEFAULT_WIDTH));
      svg.append(polygon);
      continue;
    }

    if (entity.kind === 'locus') {
      if (entity.points.length < 2) continue;
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', svgPathForWorldPoints(entity.points, view, unitSize, Boolean(entity.closed)));
      path.setAttribute('fill', entity.closed && entity.fillColor ? entity.fillColor : 'none');
      path.setAttribute('stroke', entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR);
      path.setAttribute('stroke-width', String(entity.width ?? DEFAULT_WIDTH));
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.append(path);
      continue;
    }

    if (entity.kind === 'circle') {
      const center = point2D(snapshot.scene, entity.centerId);
      if (!center || entity.radius <= 0) continue;
      const screen = geometryWorldToScreen(center, view, unitSize);
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', String(screen.x));
      circle.setAttribute('cy', String(screen.y));
      circle.setAttribute('r', String(entity.radius * unitSize * view.zoom));
      circle.setAttribute('fill', entity.fillColor ?? colorWithAlpha(entity.color ?? DEFAULT_DRAW_COLOR, 0.1));
      circle.setAttribute('stroke', entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR);
      circle.setAttribute('stroke-width', String(entity.width ?? DEFAULT_WIDTH));
      svg.append(circle);
      continue;
    }

    if (entity.kind === 'line') {
      const equation = entity.equation ?? lineEquationFromEntityPoints(snapshot.scene, entity);
      const clipped = equation ? clipLineToBounds(equation, bounds) : null;
      if (!clipped) continue;
      svg.append(svgLine(clipped[0], clipped[1], entity, view, unitSize));
      continue;
    }

    if (entity.kind === 'ray') {
      const a = point2D(snapshot.scene, entity.pointIds[0]);
      const b = point2D(snapshot.scene, entity.pointIds[1]);
      const clipped = a && b ? clipRayToBounds(a, b, bounds) : null;
      if (!clipped) continue;
      svg.append(svgLine(clipped[0], clipped[1], entity, view, unitSize));
      continue;
    }

    if (entity.kind === 'segment' || entity.kind === 'vector') {
      const a = point2D(snapshot.scene, entity.pointIds[0]);
      const b = point2D(snapshot.scene, entity.pointIds[1]);
      if (!a || !b) continue;
      svg.append(svgLine(a, b, entity, view, unitSize));
    }
  }
  return new XMLSerializer().serializeToString(svg);
}

function svgLine(
  a: Vector2,
  b: Vector2,
  entity: GeometryEntityDisplay,
  view: View2D,
  unitSize: number,
): SVGLineElement {
  const sa = geometryWorldToScreen(a, view, unitSize);
  const sb = geometryWorldToScreen(b, view, unitSize);
  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('x1', String(sa.x));
  line.setAttribute('y1', String(sa.y));
  line.setAttribute('x2', String(sb.x));
  line.setAttribute('y2', String(sb.y));
  line.setAttribute('stroke', entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR);
  line.setAttribute('stroke-width', String(entity.width ?? DEFAULT_WIDTH));
  line.setAttribute('stroke-linecap', 'round');
  return line;
}

function svgPathForWorldPoints(points: Vector2[], view: View2D, unitSize: number, closed: boolean): string {
  const first = points[0];
  if (!first) return '';
  const start = geometryWorldToScreen(first, view, unitSize);
  const commands = [`M ${start.x} ${start.y}`];
  for (const point of points.slice(1)) {
    const screen = geometryWorldToScreen(point, view, unitSize);
    commands.push(`L ${screen.x} ${screen.y}`);
  }
  if (closed) commands.push('Z');
  return commands.join(' ');
}
