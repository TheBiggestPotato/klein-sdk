import { createIdFactory, KleinSdkError } from '../core/index.js';
import { resolveKleinToolTheme } from '../theme/index.js';
import { KLEIN_MONO_FONT_STACK, KLEIN_UI_FONT_STACK } from '../theme/index.js';
import type { KleinToolThemeInput } from '../theme/index.js';
import type {
  ApplyDeltaOptions,
  DeltaMeta,
  ExportOptions,
  ExportResult,
  InstrumentOptions,
  JsonValue,
  KleinInstrument,
  LoadOptions,
  ValidationResult,
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
  ConicEntity,
  GeometryConstraint,
  GeometryConstraintSummary,
  GeometryConicEquation,
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
  ParametricCurveEntity,
  PlaneEntity,
  PolygonEntity,
  RayEntity,
  GeometryRelationMarkerEntity,
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
  ConicEntity,
  GeometryConstraint,
  GeometryConstraintSummary,
  GeometryConicEquation,
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
  ParametricCurveEntity,
  PlaneEntity,
  PolygonEntity,
  RayEntity,
  GeometryRelationMarkerEntity,
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
  | 'conic'
  | 'parametricCurve'
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
export type GeometryCalculatorSelectable =
  | { kind: 'point'; id: string }
  | { kind: 'entity'; id: string };

export type GeometryCalculatorSelection =
  | GeometryCalculatorSelectable
  | { kind: 'multi'; items: GeometryCalculatorSelectable[] };

/** Group metadata persisted by the calculator. Groups do not change geometry; they collect objects for editor workflows. */
export interface GeometryObjectGroup {
  id: string;
  label?: string;
  items: GeometryCalculatorSelectable[];
  locked?: boolean;
  hidden?: boolean;
  createdAt?: number;
}

/** Axis accepted by reflection transforms. */
export type GeometryReflectionAxis =
  | 'x'
  | 'y'
  | { point: Vector2; direction: Vector2 };

/** Geometry calculator scene with explicit entity draw order. */
export interface GeometryCalculatorScene extends GeometryScene {
  order: string[];
}

/** Grid and unit settings. World coordinates are stored in these unit values. */
export type GeometrySnapKind =
  | 'grid'
  | 'points'
  | 'midpoints'
  | 'intersections'
  | 'axes'
  | 'angles'
  | 'shapeEdges';

export type GeometrySnapModes = Record<GeometrySnapKind, boolean>;

export interface GeometrySnapSettings {
  enabled: boolean;
  strength: number;
  showMarkers: boolean;
  modes: GeometrySnapModes;
}

export type GeometrySnapSettingsPatch =
  Partial<Omit<GeometrySnapSettings, 'modes'>>
  & { modes?: Partial<GeometrySnapModes> };

export type GeometryGridOptionsPatch =
  Omit<Partial<GeometryGridOptions>, 'snapping'>
  & { snapping?: GeometrySnapSettingsPatch };

export interface GeometryGridOptions {
  unitSize: number;
  majorEvery: number;
  snap: boolean;
  labels: boolean;
  snapping: GeometrySnapSettings;
}

/** UI state that can be persisted with a 2D geometry scene. */
export interface GeometryCalculatorAppState {
  view: View2D;
  activeTool: GeometryCalculatorTool;
  selected: GeometryCalculatorSelection | null;
  groups: Record<string, GeometryObjectGroup>;
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
  | { op: 'setGrid'; grid: GeometryGridOptionsPatch }
  | { op: 'setOrder'; order: string[] }
  | { op: 'addGroup'; group: GeometryObjectGroup }
  | { op: 'deleteGroup'; ids: string[] }
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

/** Angle construction/display options. */
export interface GeometryAngleOptions extends GeometryStyleOptions {
  radius?: number;
  orientation?: 'interior' | 'exterior';
  exterior?: boolean;
}

/** Parsed circle equation in center-radius form. */
export interface GeometryCircleEquation {
  center: Vector2;
  radius: number;
  input?: string;
}

/** Conic construction options. Generated curves are sampled for renderer/export portability. */
export interface GeometryConicOptions extends GeometryStyleOptions {
  kind: ConicEntity['conicKind'];
  center?: Vector2;
  vertex?: Vector2;
  radiusX?: number;
  radiusY?: number;
  focalLength?: number;
  rotationDegrees?: number;
  samples?: number;
  points?: Vector2[];
  equation?: GeometryConicEquation;
  closed?: boolean;
}

/** Parametric curve construction options. Expressions use `t` and Math-style functions such as `sin(t)`. */
export interface GeometryParametricCurveOptions extends GeometryStyleOptions {
  xExpression?: string;
  yExpression?: string;
  tMin?: number;
  tMax?: number;
  samples?: number;
  points?: Vector2[];
  closed?: boolean;
}

export type GeometryRelationMarkerKind = GeometryRelationMarkerEntity['relationKind'];

export interface GeometryTriangleClassification {
  polygonId: string;
  sideType: 'equilateral' | 'isosceles' | 'scalene';
  angleType: 'acute' | 'right' | 'obtuse';
  sideLengths: [number, number, number];
  angles: [number, number, number];
  area: number;
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
  /** Shared host palette. Explicit geometry `theme` overrides this presentation baseline. */
  palette?: KleinToolThemeInput;
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
  importJson(input: string | JsonValue, options?: LoadOptions): void;
  createCheckpoint(name?: string): string;
  restoreCheckpoint(id: string): void;
  getCheckpoints(): GeometryCheckpoint[];
  getHistoryEntries(): GeometryHistoryEntry[];
  getTheme(): GeometryCalculatorTheme;
  setTheme(theme: GeometryCalculatorThemeInput): void;
  getSnapSettings(): GeometrySnapSettings;
  setSnapSettings(settings: GeometrySnapSettingsPatch): void;
  getSelection(): GeometryCalculatorSelection | null;
  select(selection: GeometryCalculatorSelection | null): void;
  selectObjects(items: GeometryCalculatorSelectable[]): void;
  addToSelection(item: GeometryCalculatorSelectable): void;
  toggleSelection(item: GeometryCalculatorSelectable): void;
  clearSelection(): void;
  deleteSelection(): void;
  duplicateSelection(offset?: Vector2): string[];
  translateSelection(delta: Vector2): void;
  rotateSelection(angleDegrees: number, center?: Vector2): void;
  scaleSelection(factor: number | Vector2, center?: Vector2): void;
  reflectSelection(axis: GeometryReflectionAxis): void;
  setSelectionLocked(locked: boolean): void;
  setSelectionHidden(hidden: boolean): void;
  bringSelectionForward(): void;
  sendSelectionBackward(): void;
  bringSelectionToFront(): void;
  sendSelectionToBack(): void;
  groupSelection(label?: string): string;
  ungroupSelection(groupId?: string): string[];
  getGroups(): GeometryObjectGroup[];
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
  addLineByCoordinates(first: Vector2, second: Vector2, style?: GeometryStyleOptions): string;
  addLineByEquation(equation: string | GeometryLineEquation, style?: GeometryStyleOptions): string;
  addRayByPoints(firstPointId: string, secondPointId: string, style?: GeometryStyleOptions): string;
  addRayByCoordinates(first: Vector2, second: Vector2, style?: GeometryStyleOptions): string;
  addSegmentByPoints(firstPointId: string, secondPointId: string, style?: GeometryStyleOptions): string;
  addSegmentByCoordinates(first: Vector2, second: Vector2, style?: GeometryStyleOptions): string;
  addVectorByPoints(firstPointId: string, secondPointId: string, style?: GeometryStyleOptions): string;
  addVectorByCoordinates(first: Vector2, second: Vector2, style?: GeometryStyleOptions): string;
  addPolygon(pointIds: string[], style?: GeometryStyleOptions): string;
  addPolygonByCoordinates(points: Vector2[], style?: GeometryStyleOptions): string;
  addLocus(points: Vector2[], options?: GeometryLocusOptions): string;
  addCircle(centerPointId: string, radius: number, style?: GeometryStyleOptions): string;
  addCircleByCenterPoint(centerPointId: string, radiusPointId: string, style?: GeometryStyleOptions): string;
  addCircleThroughPoints(pointIds: [string, string, string], style?: GeometryStyleOptions): string;
  addCircleByCoordinates(center: Vector2, radius: number, style?: GeometryStyleOptions): string;
  addCircleByEquation(equation: string | GeometryCircleEquation, style?: GeometryStyleOptions): string;
  addArcByPoints(centerPointId: string, startPointId: string, endPointId: string, style?: GeometryStyleOptions): string;
  addArcByCoordinates(center: Vector2, start: Vector2, end: Vector2, style?: GeometryStyleOptions): string;
  addConic(options: GeometryConicOptions): string;
  addEllipse(center: Vector2, radiusX: number, radiusY: number, rotationDegrees?: number, style?: GeometryStyleOptions): string;
  addParabola(vertex: Vector2, focalLength: number, rotationDegrees?: number, style?: GeometryStyleOptions): string;
  addHyperbola(center: Vector2, radiusX: number, radiusY: number, rotationDegrees?: number, style?: GeometryStyleOptions): string;
  addParametricCurve(options: GeometryParametricCurveOptions): string;
  addShape(kind: GeometryShapeKind, center: Vector2, options?: ShapeCreationOptions): string;
  addRegularPolygonBySideCount(center: Vector2, sides: number, radius?: number, style?: GeometryStyleOptions): string;
  addRegularPolygonByCenterAndVertex(centerPointId: string, vertexPointId: string, sides: number, style?: GeometryStyleOptions): string;
  addRegularPolygonByCenterAndVertexCoordinates(center: Vector2, vertex: Vector2, sides: number, style?: GeometryStyleOptions): string;
  setPolygonVertex(polygonId: string, vertexIndex: number, coordinates: Vector2): void;
  insertPolygonVertex(polygonId: string, vertexIndex: number, coordinates: Vector2, style?: GeometryStyleOptions): string;
  removePolygonVertex(polygonId: string, vertexIndex: number): string;
  addPolygonSideConstraints(polygonId: string, length?: number): string[];
  addPolygonAngleConstraints(polygonId: string, degrees?: number): string[];
  detectTriangleType(polygonId: string): GeometryTriangleClassification;
  isCyclicQuadrilateral(polygonId: string, tolerance?: number): boolean;
  addCongruenceMarker(targetIds: string[], label?: string, style?: GeometryStyleOptions): string;
  addSimilarityMarker(targetIds: string[], label?: string, style?: GeometryStyleOptions): string;
  addCyclicQuadrilateralMarker(polygonId: string, style?: GeometryStyleOptions): string;
  addTriangleTypeMarker(polygonId: string, style?: GeometryStyleOptions): string;
  addAngleByPoints(pointIds: [string, string, string], style?: GeometryAngleOptions): string;
  addAngleBetweenEntities(
    firstEntityId: string,
    secondEntityId: string,
    style?: GeometryAngleOptions,
  ): string;
  addAngleAt(options: AngleCreationOptions): string;
  addConstraint(constraint: GeometryConstraintDraft): string;
  editObject(id: string, edits: GeometryObjectEditOptions): void;
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

export interface AngleCreationOptions extends GeometryAngleOptions {
  vertex: Vector2;
  startDegrees?: number;
  degrees: number;
  armLength?: number;
}

export interface GeometryObjectEditOptions {
  coordinates?: Vector2;
  length?: number;
  radius?: number;
  angleDegrees?: number;
  sides?: number;
  label?: string;
  hidden?: boolean;
  locked?: boolean;
}

export interface GeometryCheckpoint {
  id: string;
  name: string;
  createdAt: number;
  snapshot: GeometryCalculatorSnapshot;
}

export interface GeometryHistoryEntry {
  id: string;
  kind: 'undo' | 'redo' | 'checkpoint';
  label: string;
  createdAt?: number;
  checkpointId?: string;
}

interface ScreenRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

type HitTarget =
  | { selection: GeometryCalculatorSelectable; distanceWorld: number }
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
      kind: 'moveSelection';
      pointerId: number;
      startSnapshot: GeometryCalculatorSnapshot;
      startWorld: Vector2;
      pointIds: string[];
      originalPoints: Record<string, GeometryPoint2D>;
      locusPoints: Record<string, Vector2[]>;
    }
  | {
      kind: 'marquee';
      pointerId: number;
      additive: boolean;
      startSelection: GeometryCalculatorSelection | null;
      screen: Vector2;
      startWorld: Vector2;
      currentWorld: Vector2;
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
const GEOMETRY_TOOL_CATALOG: Array<{
  tool: GeometryCalculatorTool;
  label: string;
  shortcut?: string;
  description: string;
}> = [
  { tool: 'select', label: 'Select', shortcut: 'V', description: 'Select, move, and edit existing objects.' },
  { tool: 'pan', label: 'Pan', shortcut: 'M', description: 'Move through the canvas without changing geometry.' },
  { tool: 'point', label: 'Point', shortcut: 'P', description: 'Place a free point by clicking or coordinates.' },
  { tool: 'midpoint', label: 'Midpoint', description: 'Create a linked midpoint between two points.' },
  { tool: 'intersect', label: 'Intersect', description: 'Create intersection points between supported objects.' },
  { tool: 'segment', label: 'Segment', shortcut: 'S', description: 'Draw a finite segment between two points.' },
  { tool: 'line', label: 'Line', shortcut: 'L', description: 'Draw an infinite line from points or equation.' },
  { tool: 'ray', label: 'Ray', shortcut: 'R', description: 'Draw a ray from an endpoint through a second point.' },
  { tool: 'vector', label: 'Vector', shortcut: 'U', description: 'Draw a directed vector between two points.' },
  { tool: 'parallel', label: 'Parallel', description: 'Construct a parallel line through a point.' },
  { tool: 'perpendicular', label: 'Perp', description: 'Construct a perpendicular line through a point.' },
  { tool: 'tangent', label: 'Tangent', description: 'Construct tangent lines from a point to a circle.' },
  { tool: 'angleBisector', label: 'Bisector', description: 'Construct an angle bisector from three points.' },
  { tool: 'polygon', label: 'Polygon', shortcut: 'G', description: 'Create a closed polygon from clicked vertices.' },
  { tool: 'circle', label: 'Circle', shortcut: 'C', description: 'Create a circle from center and radius.' },
  { tool: 'circleThroughPoints', label: 'Circle 3pt', description: 'Create a circle through three non-collinear points.' },
  { tool: 'arc', label: 'Arc', description: 'Create an arc from center, start, and end points.' },
  { tool: 'conic', label: 'Conic', shortcut: 'K', description: 'Create ellipses, parabolas, and hyperbolas.' },
  { tool: 'parametricCurve', label: 'Param', shortcut: 'Q', description: 'Create a sampled parametric curve.' },
  { tool: 'angle', label: 'Angle', shortcut: 'A', description: 'Mark or create an angle.' },
  { tool: 'triangle', label: 'Triangle', description: 'Create a triangle preset.' },
  { tool: 'rectangle', label: 'Rect', description: 'Create a rectangle preset.' },
  { tool: 'square', label: 'Square', description: 'Create a square preset.' },
  { tool: 'regularPolygon', label: 'Regular', description: 'Create a regular polygon preset.' },
  { tool: 'remove', label: 'Remove', shortcut: 'X', description: 'Delete objects by clicking them.' },
];
const DEFAULT_SNAP_MODES: GeometrySnapModes = {
  grid: true,
  points: true,
  midpoints: true,
  intersections: true,
  axes: true,
  angles: false,
  shapeEdges: true,
};
const DEFAULT_SNAP_SETTINGS: GeometrySnapSettings = {
  enabled: true,
  strength: 0.85,
  showMarkers: true,
  modes: DEFAULT_SNAP_MODES,
};
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 8;
const HIT_TOLERANCE_PX = 10;
const POINT_RADIUS_PX = 5;
const CONSTRAINT_SOLVER_ITERATIONS = 6;
const SVG_NS = 'http://www.w3.org/2000/svg';

const LIGHT_GEOMETRY_CALCULATOR_THEME: GeometryCalculatorTheme = {
  name: 'light',
  colorScheme: 'light',
  background: '#f5f5f5',
  surface: '#f5f5f5',
  surfaceRaised: '#ffffff',
  canvas: '#ffffff',
  border: '#dadfe0',
  text: '#303841',
  mutedText: '#5e6770',
  faintText: '#8a939b',
  inputBackground: '#ffffff',
  buttonBackground: '#ffffff',
  buttonText: '#303841',
  buttonBorder: '#dadfe0',
  buttonActiveBackground: '#ff5722',
  buttonActiveText: '#ffffff',
  accent: '#ff5722',
  drawColor: '#76abae',
  pointColor: '#303841',
  fill: 'rgba(118, 171, 174, 0.16)',
  selection: '#ff5722',
  gridMinor: '#e9eced',
  gridMajor: '#dadfe0',
  axis: '#5e6770',
  gridLabel: '#5e6770',
  draft: '#76abae',
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
      groups: {},
      grid: {
        unitSize: positiveNumber(options.unitSize, DEFAULT_UNIT_SIZE),
        majorEvery: Math.max(1, Math.round(positiveNumber(options.gridMajorEvery, 5))),
        snap: options.snapToGrid ?? true,
        labels: true,
        snapping: {
          ...DEFAULT_SNAP_SETTINGS,
          enabled: options.snapToGrid ?? DEFAULT_SNAP_SETTINGS.enabled,
          modes: { ...DEFAULT_SNAP_MODES },
        },
      },
    },
  };
}

export function parseGeometryCalculatorSnapshotJson(input: string | JsonValue): GeometryCalculatorSnapshot {
  const parsed = typeof input === 'string'
    ? JSON.parse(input) as unknown
    : input;
  const validation = validateGeometryCalculatorSnapshot(parsed);
  if (!validation.ok) {
    throw new KleinSdkError('invalid_snapshot', 'Geometry calculator snapshot is invalid.', validation.issues as unknown as JsonValue);
  }
  return validation.value;
}

export function validateGeometryCalculatorSnapshot(value: unknown): ValidationResult<GeometryCalculatorSnapshot> {
  const issues: Array<{ path: string; message: string }> = [];
  if (!isRecord(value)) return { ok: false, issues: [{ path: '', message: 'Snapshot must be an object.' }] };
  if (value.version !== 1) issues.push({ path: 'version', message: 'Expected geometry snapshot version 1.' });
  if (value.instrument !== 'geometry') issues.push({ path: 'instrument', message: 'Expected geometry instrument.' });
  if (!isRecord(value.scene)) issues.push({ path: 'scene', message: 'Scene must be an object.' });
  if (!isRecord(value.appState)) issues.push({ path: 'appState', message: 'App state must be an object.' });
  if (isRecord(value.scene)) {
    if (!isRecord(value.scene.points)) issues.push({ path: 'scene.points', message: 'Scene points must be an object.' });
    if (!isRecord(value.scene.entities)) issues.push({ path: 'scene.entities', message: 'Scene entities must be an object.' });
    if (!Array.isArray(value.scene.order)) issues.push({ path: 'scene.order', message: 'Scene order must be an array.' });
  }
  return issues.length
    ? { ok: false, issues }
    : { ok: true, value: value as GeometryCalculatorSnapshot };
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

/** Parses common circle equation forms into center-radius form. */
export function parseGeometryCircleEquation(input: string): GeometryCircleEquation {
  const raw = input.trim();
  if (!raw) {
    throw new KleinSdkError('invalid_circle_equation', 'Circle equation cannot be empty.');
  }
  const normalized = raw
    .replace(/\u2212/g, '-')
    .replace(/\*\*/g, '^')
    .replace(/\s+/g, '')
    .toLowerCase();

  const centerRadius = parseCenterRadiusCircleEquation(normalized, raw);
  if (centerRadius) return centerRadius;

  const parts = normalized.split('=');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new KleinSdkError(
      'invalid_circle_equation',
      'Use a circle equation such as (x-1)^2+(y+2)^2=9 or x^2+y^2-2x+4y-4=0.',
      raw,
    );
  }

  const left = parseCirclePolynomial(parts[0], 1);
  const right = parseCirclePolynomial(parts[1], -1);
  const x2 = left.x2 + right.x2;
  const y2 = left.y2 + right.y2;
  const x = left.x + right.x;
  const y = left.y + right.y;
  const c = left.c + right.c;
  if (Math.abs(x2 - y2) > 1e-9 || Math.abs(x2) < 1e-12) {
    throw new KleinSdkError('invalid_circle_equation', 'Circle equation must have matching x^2 and y^2 coefficients.', raw);
  }
  const center = {
    x: -x / (2 * x2),
    y: -y / (2 * x2),
  };
  const radiusSquared = (x * x + y * y) / (4 * x2 * x2) - c / x2;
  if (!Number.isFinite(radiusSquared) || radiusSquared <= 0) {
    throw new KleinSdkError('invalid_circle_equation', 'Circle equation radius must be positive.', raw);
  }
  return normalizeCircleEquation({ center, radius: Math.sqrt(radiusSquared), input: raw });
}

function normalizeCircleEquation(equation: GeometryCircleEquation): GeometryCircleEquation {
  if (!Number.isFinite(equation.center.x) || !Number.isFinite(equation.center.y)) {
    throw new KleinSdkError('invalid_circle_equation', 'Circle center must be finite.');
  }
  if (!Number.isFinite(equation.radius) || equation.radius <= 0) {
    throw new KleinSdkError('invalid_circle_equation', 'Circle radius must be positive.');
  }
  const result: GeometryCircleEquation = {
    center: { x: equation.center.x, y: equation.center.y },
    radius: equation.radius,
  };
  if (equation.input !== undefined) result.input = equation.input;
  return result;
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
        appState: { ...snapshot.appState, selected: null, groups: {} },
      };
    case 'setTool':
      return { ...snapshot, appState: { ...snapshot.appState, activeTool: delta.tool } };
    case 'setSelection':
      return { ...snapshot, appState: { ...snapshot.appState, selected: normalizeSelection(delta.selection) } };
    case 'setView':
      return { ...snapshot, appState: { ...snapshot.appState, view: { ...delta.view, zoom: clampGeometryZoom(delta.view.zoom) } } };
    case 'setGrid':
      return {
        ...snapshot,
        appState: {
          ...snapshot.appState,
          grid: normalizeGridOptions(snapshot.appState.grid, delta.grid),
        },
      };
    case 'setOrder':
      return {
        ...snapshot,
        scene: {
          ...snapshot.scene,
          order: normalizeEntityOrder(delta.order, snapshot.scene.entities),
        },
      };
    case 'addGroup':
      return {
        ...snapshot,
        appState: {
          ...snapshot.appState,
          groups: {
            ...snapshot.appState.groups,
            [delta.group.id]: {
              ...delta.group,
              items: selectionItemsFromArray(delta.group.items),
            },
          },
        },
      };
    case 'deleteGroup': {
      const groups = { ...snapshot.appState.groups };
      for (const id of delta.ids) delete groups[id];
      return {
        ...snapshot,
        appState: {
          ...snapshot.appState,
          groups,
        },
      };
    }
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
    case 'setGrid':
    case 'setOrder':
    case 'addGroup':
    case 'deleteGroup':
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
  #deltaListeners = new Set<(delta: GeometryCalculatorDelta, meta: DeltaMeta) => void>();
  #theme: GeometryCalculatorTheme;
  #container: HTMLElement | undefined;
  #root: HTMLDivElement | undefined;
  #canvas: HTMLCanvasElement | undefined;
  #ctx: CanvasRenderingContext2D | undefined;
  #resizeObserver: ResizeObserver | undefined;
  #contextMenuEl: HTMLDivElement | undefined;
  #commandPaletteEl: HTMLDivElement | undefined;
  #toolTooltipEl: HTMLDivElement | undefined;
  #objectPanelEl: HTMLDivElement | undefined;
  #historyPanelEl: HTMLDivElement | undefined;
  #undoStack: GeometryCalculatorSnapshot[] = [];
  #redoStack: GeometryCalculatorSnapshot[] = [];
  #checkpoints: GeometryCheckpoint[] = [];
  #objectSearchQuery = '';
  #objectTypeFilters = new Set<string>();
  #drag: DragState | null = null;
  #hoverWorld: Vector2 | null = null;
  #snapMarker: SnapMarker | null = null;
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
  #angleRadius = 0.7;
  #angleOrientation: 'interior' | 'exterior' = 'interior';

  constructor(options: GeometryCalculatorOptions) {
    this.id = this.#ids.next('geometry');
    this.#options = options;
    this.#theme = resolveGeometryCalculatorTheme(options.theme ?? geometryThemeFromPalette(options.palette));
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
      fontFamily: KLEIN_UI_FONT_STACK,
      userSelect: 'none',
    });

    if (this.#options.showControls !== false) {
      root.append(this.#createControls());
    }

    const workArea = document.createElement('div');
    Object.assign(workArea.style, {
      display: 'flex',
      flex: '1 1 auto',
      minHeight: '320px',
      minWidth: '0',
      overflow: 'hidden',
      flexWrap: 'wrap',
      background: 'var(--kgc-canvas)',
    });

    const canvasWrap = document.createElement('div');
    Object.assign(canvasWrap.style, {
      position: 'relative',
      flex: '1 1 520px',
      minHeight: '320px',
      minWidth: '280px',
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
      userSelect: 'none',
    });
    canvas.addEventListener('pointerdown', this.#onPointerDown);
    canvas.addEventListener('pointermove', this.#onPointerMove);
    canvas.addEventListener('pointerup', this.#onPointerUp);
    canvas.addEventListener('pointercancel', this.#onPointerCancel);
    canvas.addEventListener('contextmenu', this.#onContextMenu);
    canvas.addEventListener('wheel', this.#onWheel, { passive: false });
    canvas.addEventListener('keydown', this.#onKeyDown);
    document.addEventListener('pointerdown', this.#onDocumentPointerDown, true);

    canvasWrap.append(canvas);
    workArea.append(canvasWrap);
    if (this.#options.showControls !== false) {
      workArea.append(this.#createSidePanel());
    }
    root.append(workArea);

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
      this.#canvas.removeEventListener('contextmenu', this.#onContextMenu);
      this.#canvas.removeEventListener('wheel', this.#onWheel);
      this.#canvas.removeEventListener('keydown', this.#onKeyDown);
    }
    document.removeEventListener('pointerdown', this.#onDocumentPointerDown, true);
    this.#hideContextMenu();
    this.#hideCommandPalette();
    this.#hideToolTooltip();

    if (this.#container?.dataset.kleinInstrument === this.kind) {
      delete this.#container.dataset.kleinInstrument;
    }
    this.#root?.remove();
    this.#container = undefined;
    this.#root = undefined;
    this.#canvas = undefined;
    this.#ctx = undefined;
    this.#statusEl = undefined;
    this.#objectPanelEl = undefined;
    this.#historyPanelEl = undefined;
    this.#toolButtons = [];
    this.#drag = null;
  }

  getSnapshot(): GeometryCalculatorSnapshot {
    return cloneSnapshot(this.#snapshot);
  }

  subscribeDelta(listener: (delta: GeometryCalculatorDelta, meta: DeltaMeta) => void): () => void {
    this.#deltaListeners.add(listener);
    return () => this.#deltaListeners.delete(listener);
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
    this.#syncPanels();
    this.#render();
  }

  importJson(input: string | JsonValue, options: LoadOptions = {}): void {
    this.loadSnapshot(parseGeometryCalculatorSnapshotJson(input), options);
  }

  createCheckpoint(name = `Checkpoint ${this.#checkpoints.length + 1}`): string {
    const checkpoint: GeometryCheckpoint = {
      id: this.#ids.next('checkpoint'),
      name,
      createdAt: Date.now(),
      snapshot: cloneSnapshot(this.#snapshot),
    };
    this.#checkpoints = [checkpoint, ...this.#checkpoints].slice(0, 24);
    this.#syncPanels();
    return checkpoint.id;
  }

  restoreCheckpoint(id: string): void {
    const checkpoint = this.#checkpoints.find(candidate => candidate.id === id);
    if (!checkpoint) {
      throw new KleinSdkError('missing_checkpoint', `Checkpoint ${id} does not exist.`);
    }
    this.#undoStack.push(cloneSnapshot(this.#snapshot));
    this.#redoStack = [];
    this.#snapshot = cloneSnapshot(checkpoint.snapshot);
    this.#cancelDrafts();
    this.#syncPanels();
    this.#render();
  }

  getCheckpoints(): GeometryCheckpoint[] {
    return this.#checkpoints.map(checkpoint => ({
      ...checkpoint,
      snapshot: cloneSnapshot(checkpoint.snapshot),
    }));
  }

  getHistoryEntries(): GeometryHistoryEntry[] {
    const entries: GeometryHistoryEntry[] = [];
    if (this.#undoStack.length) {
      entries.push({
        id: 'undo-latest',
        kind: 'undo',
        label: `Previous version (${this.#undoStack.length})`,
      });
    }
    if (this.#redoStack.length) {
      entries.push({
        id: 'redo-latest',
        kind: 'redo',
        label: `Redo version (${this.#redoStack.length})`,
      });
    }
    for (const checkpoint of this.#checkpoints) {
      entries.push({
        id: `checkpoint:${checkpoint.id}`,
        kind: 'checkpoint',
        label: checkpoint.name,
        createdAt: checkpoint.createdAt,
        checkpointId: checkpoint.id,
      });
    }
    return entries;
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
    this.#emitSnapshotReplacement('history');
    this.#cancelDrafts();
    this.#syncPanels();
    this.#render();
  }

  redo(): void {
    const next = this.#redoStack.pop();
    if (!next) return;
    this.#undoStack.push(cloneSnapshot(this.#snapshot));
    this.#snapshot = next;
    this.#emitSnapshotReplacement('history');
    this.#cancelDrafts();
    this.#syncPanels();
    this.#render();
  }

  async export(options: ExportOptions): Promise<ExportResult> {
    if (options.format === 'json') {
      return {
        format: 'json',
        mimeType: 'application/json',
        data: geometrySnapshotJson(this.#snapshot, options.includeAppState !== false),
      };
    }

    if (options.format === 'svg') {
      const size = this.#exportSize(options);
      return {
        format: 'svg',
        mimeType: 'image/svg+xml',
        data: geometrySceneToSvg(this.#snapshot, size, options),
      };
    }

    if (options.format === 'png' || options.format === 'thumbnail') {
      const size = this.#exportSize(options, options.format === 'thumbnail');
      const svg = geometrySceneToSvg(this.#snapshot, size, options);
      const blob = await svgToPngBlob(svg, size);
      return { format: options.format, mimeType: 'image/png', data: blob } as ExportResult;
    }

    if (options.format === 'pdf') {
      const size = this.#exportSize(options);
      return {
        format: 'pdf',
        mimeType: 'application/pdf',
        data: geometrySceneToPdfBlob(
          this.#snapshot,
          size,
          options,
          this.#snapshot.metadata?.title ?? 'Klein Geometry Export',
        ),
      };
    }

    throw new KleinSdkError(
      'unsupported_export',
      `Geometry calculator does not support ${options.format} export yet.`,
    );
  }

  #exportSize(options: ExportOptions, thumbnail = false): { width: number; height: number } {
    const current = this.#logicalCanvasSize();
    return {
      width: Math.max(1, Math.round(options.width ?? (thumbnail ? 320 : current.width))),
      height: Math.max(1, Math.round(options.height ?? (thumbnail ? 200 : current.height))),
    };
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
    this.#syncPanels();
    this.#render();
  }

  getSnapSettings(): GeometrySnapSettings {
    return cloneSnapSettings(this.#snapshot.appState.grid.snapping);
  }

  setSnapSettings(settings: GeometrySnapSettingsPatch): void {
    this.#commitDelta({
      op: 'setGrid',
      grid: { snapping: settings },
    }, { recordHistory: false });
  }

  getSelection(): GeometryCalculatorSelection | null {
    return cloneSelection(this.#snapshot.appState.selected);
  }

  select(selection: GeometryCalculatorSelection | null): void {
    this.#select(selection);
  }

  selectObjects(items: GeometryCalculatorSelectable[]): void {
    this.#select(selectionFromItems(items));
  }

  addToSelection(item: GeometryCalculatorSelectable): void {
    this.#select(selectionFromItems([...selectionItems(this.#snapshot.appState.selected), item]));
  }

  toggleSelection(item: GeometryCalculatorSelectable): void {
    this.#select(toggleSelectionItem(this.#snapshot.appState.selected, item));
  }

  clearSelection(): void {
    this.#select(null);
  }

  deleteSelection(): void {
    this.#assertWritable();
    const ids = selectionItems(this.#snapshot.appState.selected).map(item => item.id);
    if (!ids.length) return;
    this.#commitDelta({ op: 'delete', ids });
  }

  duplicateSelection(offset: Vector2 = { x: 0.45, y: -0.45 }): string[] {
    this.#assertWritable();
    const selection = this.#snapshot.appState.selected;
    const items = selectionItems(selection);
    if (!items.length) return [];

    const pointIdMap = new Map<string, string>();
    const entityIds: string[] = [];
    const deltas: GeometryCalculatorDelta[] = [];
    const createdSelection: GeometryCalculatorSelectable[] = [];
    const createdIds: string[] = [];

    for (const item of items) {
      if (item.kind === 'point') {
        const point = point2D(this.#snapshot.scene, item.id);
        if (point) addDuplicatedPoint(point, pointIdMap, deltas, this.#ids, offset, createdSelection, createdIds);
        continue;
      }

      const entity = this.#snapshot.scene.entities[item.id];
      if (!entity) continue;
      entityIds.push(entity.id);
      for (const pointId of geometryEntityPointIds(entity)) {
        const point = point2D(this.#snapshot.scene, pointId);
        if (point) addDuplicatedPoint(point, pointIdMap, deltas, this.#ids, offset, createdSelection, createdIds);
      }
    }

    for (const entityId of entityIds) {
      const entity = this.#snapshot.scene.entities[entityId];
      if (!entity) continue;
      const duplicate = duplicateGeometryEntity(entity, pointIdMap, this.#ids, offset);
      if (!duplicate) continue;
      deltas.push({ op: 'addEntity', entity: duplicate });
      createdSelection.push({ kind: 'entity', id: duplicate.id });
      createdIds.push(duplicate.id);
    }

    if (!deltas.length) return [];
    deltas.push({ op: 'setSelection', selection: selectionFromItems(createdSelection) });
    this.#commitDelta({ op: 'batch', deltas });
    return createdIds;
  }

  translateSelection(delta: Vector2): void {
    this.#commitSelectionTransform(point => ({
      x: point.x + delta.x,
      y: point.y + delta.y,
    }));
  }

  rotateSelection(angleDegrees: number, center?: Vector2): void {
    if (!Number.isFinite(angleDegrees)) {
      throw new KleinSdkError('invalid_transform', 'Rotation angle must be finite.');
    }
    const origin = center ?? selectionCenter(this.#snapshot.scene, this.#snapshot.appState.selected);
    if (!origin) return;
    const radians = (angleDegrees * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    this.#commitSelectionTransform(point => {
      const x = point.x - origin.x;
      const y = point.y - origin.y;
      return {
        x: origin.x + x * cos - y * sin,
        y: origin.y + x * sin + y * cos,
      };
    });
  }

  scaleSelection(factor: number | Vector2, center?: Vector2): void {
    const scale = typeof factor === 'number' ? { x: factor, y: factor } : factor;
    if (!Number.isFinite(scale.x) || !Number.isFinite(scale.y)) {
      throw new KleinSdkError('invalid_transform', 'Scale factor must be finite.');
    }
    const origin = center ?? selectionCenter(this.#snapshot.scene, this.#snapshot.appState.selected);
    if (!origin) return;
    this.#commitSelectionTransform(point => ({
      x: origin.x + (point.x - origin.x) * scale.x,
      y: origin.y + (point.y - origin.y) * scale.y,
    }));
  }

  reflectSelection(axis: GeometryReflectionAxis): void {
    const reflector = reflectionMapper(axis);
    this.#commitSelectionTransform(reflector);
  }

  setSelectionLocked(locked: boolean): void {
    this.#commitSelectionDisplayChanges({ locked });
  }

  setSelectionHidden(hidden: boolean): void {
    this.#commitSelectionDisplayChanges({ hidden });
  }

  bringSelectionForward(): void {
    this.#reorderSelection('forward');
  }

  sendSelectionBackward(): void {
    this.#reorderSelection('backward');
  }

  bringSelectionToFront(): void {
    this.#reorderSelection('front');
  }

  sendSelectionToBack(): void {
    this.#reorderSelection('back');
  }

  groupSelection(label?: string): string {
    this.#assertWritable();
    const items = selectionItems(this.#snapshot.appState.selected);
    if (items.length < 2) {
      throw new KleinSdkError('invalid_group', 'Choose at least two objects to create a group.');
    }
    const group: GeometryObjectGroup = {
      id: this.#ids.next('group'),
      items,
      createdAt: Date.now(),
    };
    if (label !== undefined) group.label = label;
    this.#commitDelta({ op: 'addGroup', group });
    return group.id;
  }

  ungroupSelection(groupId?: string): string[] {
    this.#assertWritable();
    const selectedItems = selectionItems(this.#snapshot.appState.selected);
    const selectedKeys = new Set(selectedItems.map(selectionKey));
    const ids = groupId
      ? [groupId]
      : Object.values(this.#snapshot.appState.groups)
        .filter(group => group.items.some(item => selectedKeys.has(selectionKey(item))))
        .map(group => group.id);
    if (!ids.length) return [];
    this.#commitDelta({ op: 'deleteGroup', ids });
    return ids;
  }

  getGroups(): GeometryObjectGroup[] {
    return Object.values(this.#snapshot.appState.groups).map(group => ({
      ...group,
      items: [...group.items],
    }));
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

  addLineByCoordinates(first: Vector2, second: Vector2, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    const firstPoint = this.#makePoint(first.x, first.y, style);
    const secondPoint = this.#makePoint(second.x, second.y, style);
    if (distance2D(firstPoint, secondPoint) < 1e-12) {
      throw new KleinSdkError('degenerate_line', 'A line needs two distinct coordinates.');
    }
    const entity = withEntityStyle<LineEntity>({
      id: this.#ids.next('line'),
      kind: 'line',
      pointIds: [firstPoint.id, secondPoint.id],
      equation: lineEquationFromPoints(firstPoint, secondPoint),
      construction: { kind: 'lineThroughPoints', sourceIds: [firstPoint.id, secondPoint.id] },
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: firstPoint },
        { op: 'addPoint', point: secondPoint },
        { op: 'addEntity', entity },
      ],
    });
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

  addRayByPoints(firstPointId: string, secondPointId: string, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    this.#requireDistinctPoints(firstPointId, secondPointId);
    const entity = withEntityStyle<RayEntity>({
      id: this.#ids.next('ray'),
      kind: 'ray',
      pointIds: [firstPointId, secondPointId],
    }, style, this.#theme.drawColor);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addRayByCoordinates(first: Vector2, second: Vector2, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    const firstPoint = this.#makePoint(first.x, first.y, style);
    const secondPoint = this.#makePoint(second.x, second.y, style);
    if (distance2D(firstPoint, secondPoint) < 1e-12) {
      throw new KleinSdkError('degenerate_ray', 'A ray needs two distinct coordinates.');
    }
    const entity = withEntityStyle<RayEntity>({
      id: this.#ids.next('ray'),
      kind: 'ray',
      pointIds: [firstPoint.id, secondPoint.id],
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: firstPoint },
        { op: 'addPoint', point: secondPoint },
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

  addSegmentByCoordinates(first: Vector2, second: Vector2, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    const firstPoint = this.#makePoint(first.x, first.y, style);
    const secondPoint = this.#makePoint(second.x, second.y, style);
    if (distance2D(firstPoint, secondPoint) < 1e-12) {
      throw new KleinSdkError('degenerate_segment', 'A segment needs two distinct coordinates.');
    }
    const entity = withEntityStyle<SegmentEntity>({
      id: this.#ids.next('seg'),
      kind: 'segment',
      pointIds: [firstPoint.id, secondPoint.id],
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: firstPoint },
        { op: 'addPoint', point: secondPoint },
        { op: 'addEntity', entity },
      ],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addVectorByPoints(firstPointId: string, secondPointId: string, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    this.#requireDistinctPoints(firstPointId, secondPointId);
    const entity = withEntityStyle<VectorEntity>({
      id: this.#ids.next('vec'),
      kind: 'vector',
      pointIds: [firstPointId, secondPointId],
    }, style, this.#theme.drawColor);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addVectorByCoordinates(first: Vector2, second: Vector2, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    const firstPoint = this.#makePoint(first.x, first.y, style);
    const secondPoint = this.#makePoint(second.x, second.y, style);
    if (distance2D(firstPoint, secondPoint) < 1e-12) {
      throw new KleinSdkError('degenerate_vector', 'A vector needs two distinct coordinates.');
    }
    const entity = withEntityStyle<VectorEntity>({
      id: this.#ids.next('vec'),
      kind: 'vector',
      pointIds: [firstPoint.id, secondPoint.id],
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: firstPoint },
        { op: 'addPoint', point: secondPoint },
        { op: 'addEntity', entity },
      ],
    });
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

  addCircleByEquation(equation: string | GeometryCircleEquation, style: GeometryStyleOptions = {}): string {
    const parsed = typeof equation === 'string' ? parseGeometryCircleEquation(equation) : normalizeCircleEquation(equation);
    const nextStyle: GeometryStyleOptions = { ...style };
    if (nextStyle.label === undefined && parsed.input !== undefined) nextStyle.label = parsed.input;
    return this.addCircleByCoordinates(parsed.center, parsed.radius, nextStyle);
  }

  addArcByPoints(
    centerPointId: string,
    startPointId: string,
    endPointId: string,
    style: GeometryStyleOptions = {},
  ): string {
    this.#assertWritable();
    this.#requireDistinctPoints(centerPointId, startPointId);
    this.#requireDistinctPoints(centerPointId, endPointId);
    const center = this.#requirePoint2D(centerPointId);
    const start = this.#requirePoint2D(startPointId);
    const end = this.#requirePoint2D(endPointId);
    if (distance2D(center, start) <= 1e-12 || distance2D(center, end) <= 1e-12) {
      throw new KleinSdkError('degenerate_arc', 'An arc needs a center and two distinct radius points.');
    }
    const entity = withEntityStyle<ArcEntity>({
      id: this.#ids.next('arc'),
      kind: 'arc',
      centerId: center.id,
      startId: start.id,
      endId: end.id,
    }, style, this.#theme.drawColor);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addArcByCoordinates(center: Vector2, start: Vector2, end: Vector2, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    const centerPoint = this.#makePoint(center.x, center.y, style);
    const startPoint = this.#makePoint(start.x, start.y, style);
    const endPoint = this.#makePoint(end.x, end.y, style);
    if (distance2D(centerPoint, startPoint) <= 1e-12 || distance2D(centerPoint, endPoint) <= 1e-12) {
      throw new KleinSdkError('degenerate_arc', 'An arc needs a center and two distinct radius coordinates.');
    }
    const entity = withEntityStyle<ArcEntity>({
      id: this.#ids.next('arc'),
      kind: 'arc',
      centerId: centerPoint.id,
      startId: startPoint.id,
      endId: endPoint.id,
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: centerPoint },
        { op: 'addPoint', point: startPoint },
        { op: 'addPoint', point: endPoint },
        { op: 'addEntity', entity },
      ],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addConic(options: GeometryConicOptions): string {
    this.#assertWritable();
    const sampled = sampleConic(options);
    const base: ConicEntity = {
      id: this.#ids.next('conic'),
      kind: 'conic',
      conicKind: options.kind,
      points: sampled.points,
    };
    if (sampled.closed !== undefined) base.closed = sampled.closed;
    if (sampled.segments) base.segments = sampled.segments;
    if (sampled.equation) base.equation = sampled.equation;
    if (sampled.center) base.center = sampled.center;
    if (Number.isFinite(options.rotationDegrees)) base.rotationDegrees = options.rotationDegrees as number;
    const entity = withEntityStyle(base, options, this.#theme.drawColor);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addEllipse(
    center: Vector2,
    radiusX: number,
    radiusY: number,
    rotationDegrees = 0,
    style: GeometryStyleOptions = {},
  ): string {
    return this.addConic({ ...style, kind: 'ellipse', center, radiusX, radiusY, rotationDegrees });
  }

  addParabola(
    vertex: Vector2,
    focalLength: number,
    rotationDegrees = 0,
    style: GeometryStyleOptions = {},
  ): string {
    return this.addConic({ ...style, kind: 'parabola', vertex, focalLength, rotationDegrees });
  }

  addHyperbola(
    center: Vector2,
    radiusX: number,
    radiusY: number,
    rotationDegrees = 0,
    style: GeometryStyleOptions = {},
  ): string {
    return this.addConic({ ...style, kind: 'hyperbola', center, radiusX, radiusY, rotationDegrees });
  }

  addParametricCurve(options: GeometryParametricCurveOptions): string {
    this.#assertWritable();
    const sampled = sampleParametricCurve(options);
    const base: ParametricCurveEntity = {
      id: this.#ids.next('curve'),
      kind: 'parametricCurve',
      points: sampled.points,
    };
    if (sampled.closed !== undefined) base.closed = sampled.closed;
    if (sampled.parameter) base.parameter = sampled.parameter;
    const entity = withEntityStyle(base, options, this.#theme.drawColor);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addShape(kind: GeometryShapeKind, center: Vector2, options: ShapeCreationOptions = {}): string {
    const coordinates = shapeCoordinates(kind, center, options);
    return this.addPolygonByCoordinates(coordinates, options);
  }

  addRegularPolygonBySideCount(
    center: Vector2,
    sides: number,
    radius = 2,
    style: GeometryStyleOptions = {},
  ): string {
    return this.addPolygonByCoordinates(
      regularPolygonCoordinates(center, clamp(Math.round(sides), 3, 64), positiveNumber(radius, 2), -Math.PI / 2),
      style,
    );
  }

  addRegularPolygonByCenterAndVertex(
    centerPointId: string,
    vertexPointId: string,
    sides: number,
    style: GeometryStyleOptions = {},
  ): string {
    this.#assertWritable();
    this.#requireDistinctPoints(centerPointId, vertexPointId);
    const center = this.#requirePoint2D(centerPointId);
    const vertex = this.#requirePoint2D(vertexPointId);
    const count = clamp(Math.round(sides), 3, 64);
    const radius = distance2D(center, vertex);
    if (!Number.isFinite(radius) || radius <= 1e-12) {
      throw new KleinSdkError('invalid_polygon', 'Regular polygon needs a center and a distinct vertex.');
    }
    const startAngle = Math.atan2(vertex.y - center.y, vertex.x - center.x);
    const coordinates = regularPolygonCoordinates(center, count, radius, startAngle);
    const createdPoints = coordinates.slice(1).map(point => this.#makePoint(point.x, point.y, style));
    const entity = withEntityStyle<PolygonEntity>({
      id: this.#ids.next('poly'),
      kind: 'polygon',
      pointIds: [vertexPointId, ...createdPoints.map(point => point.id)],
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

  addRegularPolygonByCenterAndVertexCoordinates(
    center: Vector2,
    vertex: Vector2,
    sides: number,
    style: GeometryStyleOptions = {},
  ): string {
    this.#assertWritable();
    const centerPoint = this.#makePoint(center.x, center.y, { ...style, hidden: true, locked: true });
    const vertexPoint = this.#makePoint(vertex.x, vertex.y, style);
    const radius = distance2D(centerPoint, vertexPoint);
    if (!Number.isFinite(radius) || radius <= 1e-12) {
      throw new KleinSdkError('invalid_polygon', 'Regular polygon needs a center and a distinct vertex.');
    }
    const count = clamp(Math.round(sides), 3, 64);
    const startAngle = Math.atan2(vertexPoint.y - centerPoint.y, vertexPoint.x - centerPoint.x);
    const coordinates = regularPolygonCoordinates(centerPoint, count, radius, startAngle);
    const rest = coordinates.slice(1).map(point => this.#makePoint(point.x, point.y, style));
    const entity = withEntityStyle<PolygonEntity>({
      id: this.#ids.next('poly'),
      kind: 'polygon',
      pointIds: [vertexPoint.id, ...rest.map(point => point.id)],
      fillColor: style.fillColor ?? colorWithAlpha(style.color ?? style.strokeColor ?? this.#theme.drawColor, 0.12),
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: centerPoint },
        { op: 'addPoint', point: vertexPoint },
        ...rest.map(point => ({ op: 'addPoint' as const, point })),
        { op: 'addEntity', entity },
      ],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  setPolygonVertex(polygonId: string, vertexIndex: number, coordinates: Vector2): void {
    this.#assertWritable();
    const entity = this.#requirePolygonEntity(polygonId);
    const pointId = entity.pointIds[normalizeVertexIndex(vertexIndex, entity.pointIds.length)];
    if (!pointId) return;
    const scene = setPointPosition(this.#snapshot.scene, pointId, coordinates);
    const deltas = geometrySceneUpdateDeltas(this.#snapshot.scene, constrainGeometryScene(scene, [pointId]));
    if (deltas.length) this.#commitDelta({ op: 'batch', deltas });
  }

  insertPolygonVertex(
    polygonId: string,
    vertexIndex: number,
    coordinates: Vector2,
    style: GeometryStyleOptions = {},
  ): string {
    this.#assertWritable();
    const entity = this.#requirePolygonEntity(polygonId);
    const point = this.#makePoint(coordinates.x, coordinates.y, style);
    const index = clamp(Math.round(vertexIndex), 0, entity.pointIds.length);
    const pointIds = [...entity.pointIds.slice(0, index), point.id, ...entity.pointIds.slice(index)];
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point },
        { op: 'updateEntity', id: entity.id, changes: { pointIds } },
      ],
    });
    this.#select({ kind: 'point', id: point.id });
    return point.id;
  }

  removePolygonVertex(polygonId: string, vertexIndex: number): string {
    this.#assertWritable();
    const entity = this.#requirePolygonEntity(polygonId);
    if (entity.pointIds.length <= 3) {
      throw new KleinSdkError('invalid_polygon', 'A polygon must keep at least three vertices.');
    }
    const index = normalizeVertexIndex(vertexIndex, entity.pointIds.length);
    const removedId = entity.pointIds[index];
    if (!removedId) throw new KleinSdkError('invalid_polygon', 'Polygon vertex does not exist.');
    const pointIds = entity.pointIds.filter((_, candidateIndex) => candidateIndex !== index);
    this.#commitDelta({ op: 'updateEntity', id: entity.id, changes: { pointIds } });
    this.#select({ kind: 'entity', id: entity.id });
    return removedId;
  }

  addPolygonSideConstraints(polygonId: string, length?: number): string[] {
    this.#assertWritable();
    const entity = this.#requirePolygonEntity(polygonId);
    const result: string[] = [];
    for (let index = 0; index < entity.pointIds.length; index += 1) {
      const firstId = entity.pointIds[index];
      const secondId = entity.pointIds[(index + 1) % entity.pointIds.length];
      if (!firstId || !secondId) continue;
      const currentLength = segmentLength(this.#snapshot.scene, [firstId, secondId]);
      result.push(this.addConstraint({
        kind: 'fixedLength',
        pointIds: [firstId, secondId],
        length: positiveNumber(length, currentLength),
        label: `side ${index + 1}`,
      }));
    }
    return result;
  }

  addPolygonAngleConstraints(polygonId: string, degrees?: number): string[] {
    this.#assertWritable();
    const entity = this.#requirePolygonEntity(polygonId);
    const result: string[] = [];
    for (let index = 0; index < entity.pointIds.length; index += 1) {
      const previousId = entity.pointIds[(index - 1 + entity.pointIds.length) % entity.pointIds.length];
      const vertexId = entity.pointIds[index];
      const nextId = entity.pointIds[(index + 1) % entity.pointIds.length];
      if (!previousId || !vertexId || !nextId) continue;
      const previous = this.#requirePoint2D(previousId);
      const vertex = this.#requirePoint2D(vertexId);
      const next = this.#requirePoint2D(nextId);
      result.push(this.addConstraint({
        kind: 'fixedAngle',
        pointIds: [previousId, vertexId, nextId],
        degrees: positiveNumber(degrees, angleMeasureDegrees(previous, vertex, next)),
        label: `angle ${index + 1}`,
      }));
    }
    return result;
  }

  detectTriangleType(polygonId: string): GeometryTriangleClassification {
    const entity = this.#requirePolygonEntity(polygonId);
    return classifyTriangle(this.#snapshot.scene, entity);
  }

  isCyclicQuadrilateral(polygonId: string, tolerance = 1e-6): boolean {
    const entity = this.#requirePolygonEntity(polygonId);
    return isCyclicQuadrilateral(this.#snapshot.scene, entity, tolerance);
  }

  addCongruenceMarker(targetIds: string[], label = 'congruent', style: GeometryStyleOptions = {}): string {
    return this.#addRelationMarker('congruence', targetIds, label, style);
  }

  addSimilarityMarker(targetIds: string[], label = 'similar', style: GeometryStyleOptions = {}): string {
    return this.#addRelationMarker('similarity', targetIds, label, style);
  }

  addCyclicQuadrilateralMarker(polygonId: string, style: GeometryStyleOptions = {}): string {
    const cyclic = this.isCyclicQuadrilateral(polygonId);
    return this.#addRelationMarker(
      'cyclicQuadrilateral',
      [polygonId],
      cyclic ? 'cyclic' : 'not cyclic',
      style,
    );
  }

  addTriangleTypeMarker(polygonId: string, style: GeometryStyleOptions = {}): string {
    const classification = this.detectTriangleType(polygonId);
    return this.#addRelationMarker(
      'triangleType',
      [polygonId],
      `${classification.sideType}, ${classification.angleType}`,
      style,
    );
  }

  addAngleByPoints(pointIds: [string, string, string], style: GeometryAngleOptions = {}): string {
    this.#assertWritable();
    for (const pointId of pointIds) this.#requirePoint2D(pointId);
    const angleOptions = normalizeAngleOptions(style);
    const entity = withEntityStyle<AngleEntity>({
      id: this.#ids.next('angle'),
      kind: 'angle',
      pointIds,
      radius: angleOptions.radius,
      orientation: angleOptions.orientation,
      color: style.color ?? '#f97316',
    }, style, '#f97316');
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addAngleBetweenEntities(
    firstEntityId: string,
    secondEntityId: string,
    style: GeometryAngleOptions = {},
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
    const angleOptions = normalizeAngleOptions(options);
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
      radius: angleOptions.radius,
      orientation: angleOptions.orientation,
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

  editObject(id: string, edits: GeometryObjectEditOptions): void {
    this.#assertWritable();
    let working = this.#snapshot;
    const deltas: GeometryCalculatorDelta[] = [];
    const pushScene = (scene: GeometryCalculatorScene): void => {
      const sceneDeltas = geometrySceneUpdateDeltas(working.scene, scene);
      if (!sceneDeltas.length) return;
      deltas.push(...sceneDeltas);
      working = applyGeometryCalculatorDelta(working, { op: 'batch', deltas: sceneDeltas });
    };

    const point = point2D(working.scene, id);
    if (point) {
      const changes = geometryDisplayEditChanges<GeometryPoint2D>(edits);
      if (Object.keys(changes).length > 0) {
        deltas.push({ op: 'updatePoint', id, changes });
        working = applyGeometryCalculatorDelta(working, { op: 'updatePoint', id, changes });
      }
      if (edits.coordinates) {
        pushScene(setPointPosition(working.scene, id, edits.coordinates));
      }
    } else {
      const entity = working.scene.entities[id];
      if (!entity) {
        throw new KleinSdkError('missing_object', `Object ${id} does not exist.`);
      }

      const changes = geometryDisplayEditChanges<GeometryEntity>(edits);
      if (Object.keys(changes).length > 0) {
        deltas.push({ op: 'updateEntity', id, changes });
        working = applyGeometryCalculatorDelta(working, { op: 'updateEntity', id, changes });
      }

      if (edits.length !== undefined) {
        const pointIds = lineConstraintPointIds(working.scene, id);
        if (!pointIds) {
          throw new KleinSdkError('invalid_edit', 'Length editing needs a line, ray, segment, or vector.');
        }
        pushScene(adjustSegmentLength(working.scene, pointIds, edits.length, new Set([pointIds[1]])));
      }

      if (edits.radius !== undefined) {
        pushScene(setCircleRadius(working.scene, id, edits.radius));
      }

      if (edits.angleDegrees !== undefined) {
        const current = working.scene.entities[id];
        if (current?.kind !== 'angle') {
          throw new KleinSdkError('invalid_edit', 'Angle editing needs an angle object.');
        }
        const [firstId, vertexId, secondId] = current.pointIds;
        const first = point2D(working.scene, firstId);
        const vertex = point2D(working.scene, vertexId);
        const second = point2D(working.scene, secondId);
        if (first && vertex && second) {
          pushScene(setPointOnAngle(working.scene, {
            moveId: secondId,
            anchor: vertex,
            base: first,
            current: second,
            degrees: edits.angleDegrees,
          }));
        }
      }

      if (edits.sides !== undefined) {
        const sideDeltas = polygonSideCountEditDeltas(working.scene, id, edits.sides, this.#ids);
        if (sideDeltas.length) {
          deltas.push(...sideDeltas);
          working = applyGeometryCalculatorDelta(working, { op: 'batch', deltas: sideDeltas });
        }
      }
    }

    if (!deltas.length) return;
    const constrainedScene = constrainGeometryScene(working.scene, changedIdsFromDeltas(deltas));
    const constrainedDeltas = geometrySceneUpdateDeltas(working.scene, constrainedScene);
    this.#commitDelta({ op: 'batch', deltas: [...deltas, ...constrainedDeltas] });
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

  #addRelationMarker(
    relationKind: GeometryRelationMarkerKind,
    targetIds: string[],
    label: string,
    style: GeometryStyleOptions,
  ): string {
    this.#assertWritable();
    const targets = uniqueStrings(targetIds);
    if (!targets.length) {
      throw new KleinSdkError('invalid_marker', 'A relation marker needs at least one target.');
    }
    for (const targetId of targets) {
      if (!this.#snapshot.scene.points[targetId] && !this.#snapshot.scene.entities[targetId]) {
        throw new KleinSdkError('invalid_marker', `Marker target ${targetId} does not exist.`);
      }
    }
    const entity = withEntityStyle<GeometryRelationMarkerEntity>({
      id: this.#ids.next('marker'),
      kind: 'relationMarker',
      relationKind,
      targetIds: targets,
      text: label,
      label,
      color: style.color ?? this.#theme.angle,
    }, style, this.#theme.angle);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  #commitSelectionTransform(mapPoint: (point: Vector2) => Vector2): void {
    this.#assertWritable();
    const targets = selectionTransformTargets(this.#snapshot.scene, this.#snapshot.appState.selected);
    const deltas = transformTargetDeltas(this.#snapshot.scene, targets, mapPoint);
    if (!deltas.length) return;
    const direct = applyGeometryCalculatorDelta(this.#snapshot, { op: 'batch', deltas });
    const constrainedScene = constrainGeometryScene(direct.scene, changedIdsFromDeltas(deltas));
    const constrainedDeltas = geometrySceneUpdateDeltas(this.#snapshot.scene, constrainedScene);
    if (!constrainedDeltas.length) return;
    this.#commitDelta({ op: 'batch', deltas: constrainedDeltas });
  }

  #commitSelectionDisplayChanges(changes: Pick<GeometryStyleOptions, 'hidden' | 'locked'>): void {
    this.#assertWritable();
    const deltas: GeometryCalculatorDelta[] = [];
    const seen = new Set<string>();
    for (const item of selectionItems(this.#snapshot.appState.selected)) {
      if (seen.has(selectionKey(item))) continue;
      seen.add(selectionKey(item));
      if (item.kind === 'point' && point2D(this.#snapshot.scene, item.id)) {
        deltas.push({ op: 'updatePoint', id: item.id, changes });
      }
      if (item.kind === 'entity' && this.#snapshot.scene.entities[item.id]) {
        deltas.push({ op: 'updateEntity', id: item.id, changes });
      }
    }
    if (!deltas.length) return;
    this.#commitDelta({ op: 'batch', deltas });
  }

  #reorderSelection(mode: 'forward' | 'backward' | 'front' | 'back'): void {
    this.#assertWritable();
    const selectedIds = new Set(
      selectionItems(this.#snapshot.appState.selected)
        .filter((item): item is Extract<GeometryCalculatorSelectable, { kind: 'entity' }> => item.kind === 'entity')
        .map(item => item.id),
    );
    if (!selectedIds.size) return;

    const order = normalizeEntityOrder(this.#snapshot.scene.order, this.#snapshot.scene.entities);
    if (mode === 'front') {
      this.#commitDelta({ op: 'setOrder', order: [...order.filter(id => !selectedIds.has(id)), ...order.filter(id => selectedIds.has(id))] });
      return;
    }
    if (mode === 'back') {
      this.#commitDelta({ op: 'setOrder', order: [...order.filter(id => selectedIds.has(id)), ...order.filter(id => !selectedIds.has(id))] });
      return;
    }

    const next = [...order];
    if (mode === 'forward') {
      for (let index = next.length - 2; index >= 0; index -= 1) {
        const id = next[index];
        const after = next[index + 1];
        if (id && after && selectedIds.has(id) && !selectedIds.has(after)) {
          next[index] = after;
          next[index + 1] = id;
        }
      }
    } else {
      for (let index = 1; index < next.length; index += 1) {
        const id = next[index];
        const before = next[index - 1];
        if (id && before && selectedIds.has(id) && !selectedIds.has(before)) {
          next[index] = before;
          next[index - 1] = id;
        }
      }
    }
    this.#commitDelta({ op: 'setOrder', order: next });
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
      this.#emitDelta(delta, this.#deltaMeta(options.meta));
    }
    this.#updateToolbarState();
    this.#syncPanels();
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

  #emitDelta(delta: GeometryCalculatorDelta, meta: DeltaMeta): void {
    const listeners = [
      ...(this.#options.onDelta ? [this.#options.onDelta] : []),
      ...this.#deltaListeners,
    ];
    for (const listener of listeners) {
      try {
        listener(structuredClone(delta), { ...meta });
      } catch (error) {
        const sdkError = error instanceof KleinSdkError
          ? error
          : new KleinSdkError('geometry_observer_failed', error instanceof Error ? error.message : 'A geometry delta observer failed.');
        try {
          this.#options.onError?.(sdkError);
        } catch {
          // Error observers are isolated from committed geometry transactions.
        }
      }
    }
  }

  #emitSnapshotReplacement(source: DeltaMeta['source']): void {
    const snapshot = this.#snapshot;
    const deltas: GeometryCalculatorDelta[] = [{ op: 'clear' }];
    for (const point of Object.values(snapshot.scene.points)) {
      if (point.kind === 'point2d') {
        deltas.push({ op: 'addPoint', point: structuredClone(point) });
      }
    }
    for (const entity of Object.values(snapshot.scene.entities)) {
      deltas.push({ op: 'addEntity', entity: structuredClone(entity) });
    }
    for (const constraint of Object.values(snapshot.scene.constraints ?? {})) {
      deltas.push({ op: 'addConstraint', constraint: structuredClone(constraint) });
    }
    for (const group of Object.values(snapshot.appState.groups)) {
      deltas.push({ op: 'addGroup', group: structuredClone(group) });
    }
    deltas.push(
      { op: 'setOrder', order: [...snapshot.scene.order] },
      { op: 'setTool', tool: snapshot.appState.activeTool },
      { op: 'setSelection', selection: structuredClone(snapshot.appState.selected) },
      { op: 'setView', view: { ...snapshot.appState.view } },
      { op: 'setGrid', grid: structuredClone(snapshot.appState.grid) },
    );
    this.#emitDelta({ op: 'batch', deltas }, this.#deltaMeta({ source }));
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

    const actionRow = document.createElement('div');
    Object.assign(actionRow.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
      alignItems: 'center',
    });
    const toolSearchInput = document.createElement('input');
    toolSearchInput.type = 'search';
    toolSearchInput.placeholder = 'Search tools';
    toolSearchInput.setAttribute('aria-label', 'Search tools');
    Object.assign(toolSearchInput.style, inputStyle('150px'));
    actionRow.append(
      this.#button('Undo', () => this.undo(), 'Restore the previous version. Ctrl or Cmd + Z.'),
      this.#button('Redo', () => this.redo(), 'Restore the next version. Ctrl or Cmd + Shift + Z, or Ctrl + Y.'),
      this.#button('Checkpoint', () => this.#promptCheckpoint(), 'Name and save the current construction state.'),
      this.#button('Commands', () => this.#showCommandPalette(), 'Open command palette. Ctrl or Cmd + K.'),
      this.#labelled('tools', toolSearchInput),
    );
    controls.append(actionRow);

    const toolRow = document.createElement('div');
    Object.assign(toolRow.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
      alignItems: 'center',
      overflowX: 'auto',
      paddingBottom: '2px',
    });

    const renderToolButtons = (): void => {
      const query = toolSearchInput.value.trim().toLowerCase();
      toolRow.replaceChildren();
      this.#toolButtons = [];
      for (const item of GEOMETRY_TOOL_CATALOG) {
        const searchable = `${item.label} ${item.tool} ${item.description} ${item.shortcut ?? ''}`.toLowerCase();
        if (query && !searchable.includes(query)) continue;
        const shortcut = item.shortcut ? ` Shortcut: ${item.shortcut}.` : '';
        const button = this.#button(item.label, () => this.setTool(item.tool), `${item.description}${shortcut}`);
        button.dataset.tool = item.tool;
        button.dataset.preview = item.description;
        this.#attachToolTooltip(button, item);
        this.#toolButtons.push(button);
        toolRow.append(button);
      }
      this.#updateToolbarState();
    };
    toolSearchInput.addEventListener('input', renderToolButtons);
    renderToolButtons();
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
    const x2Input = this.#numberInput('x2', '1');
    const y2Input = this.#numberInput('y2', '0');
    commandRow.append(
      this.#labelled('x', xInput),
      this.#labelled('y', yInput),
      this.#labelled('x2', x2Input),
      this.#labelled('y2', y2Input),
      this.#button('Add point', () => {
        const x = readNumberInput(xInput);
        const y = readNumberInput(yInput);
        this.addPoint({ x, y });
      }),
      this.#button('Add segment', () => {
        this.addSegmentByCoordinates(
          { x: readNumberInput(xInput), y: readNumberInput(yInput) },
          { x: readNumberInput(x2Input), y: readNumberInput(y2Input) },
        );
      }),
      this.#button('Add ray', () => {
        this.addRayByCoordinates(
          { x: readNumberInput(xInput), y: readNumberInput(yInput) },
          { x: readNumberInput(x2Input), y: readNumberInput(y2Input) },
        );
      }),
      this.#button('Add vector', () => {
        this.addVectorByCoordinates(
          { x: readNumberInput(xInput), y: readNumberInput(yInput) },
          { x: readNumberInput(x2Input), y: readNumberInput(y2Input) },
        );
      }),
      this.#button('Add line pts', () => {
        this.addLineByCoordinates(
          { x: readNumberInput(xInput), y: readNumberInput(yInput) },
          { x: readNumberInput(x2Input), y: readNumberInput(y2Input) },
        );
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

    const circleEquationInput = document.createElement('input');
    circleEquationInput.type = 'text';
    circleEquationInput.placeholder = '(x-1)^2+(y+2)^2=9';
    Object.assign(circleEquationInput.style, inputStyle('190px'));
    const radiusInput = this.#numberInput('r', '1');
    commandRow.append(
      this.#labelled('circle', circleEquationInput),
      this.#button('Add circle eq', () => {
        this.addCircleByEquation(circleEquationInput.value);
      }),
      this.#labelled('r', radiusInput),
      this.#button('Add circle', () => {
        this.addCircleByCoordinates(
          { x: readNumberInput(xInput), y: readNumberInput(yInput) },
          readNumberInput(radiusInput),
        );
      }),
    );

    const conicSelect = document.createElement('select');
    for (const conic of ['ellipse', 'parabola', 'hyperbola'] satisfies ConicEntity['conicKind'][]) {
      const option = document.createElement('option');
      option.value = conic;
      option.textContent = conic;
      conicSelect.append(option);
    }
    Object.assign(conicSelect.style, inputStyle('112px'));
    const rxInput = this.#numberInput('rx', '2');
    const ryInput = this.#numberInput('ry', '1');
    const rotationInput = this.#numberInput('rot', '0');
    commandRow.append(
      this.#labelled('conic', conicSelect),
      this.#labelled('rx/p', rxInput),
      this.#labelled('ry', ryInput),
      this.#labelled('rot', rotationInput),
      this.#button('Add conic', () => {
        const kind = conicSelect.value as ConicEntity['conicKind'];
        const origin = { x: readNumberInput(xInput), y: readNumberInput(yInput) };
        const rotation = readNumberInput(rotationInput);
        if (kind === 'parabola') {
          this.addParabola(origin, readNumberInput(rxInput), rotation);
        } else if (kind === 'hyperbola') {
          this.addHyperbola(origin, readNumberInput(rxInput), readNumberInput(ryInput), rotation);
        } else {
          this.addEllipse(origin, readNumberInput(rxInput), readNumberInput(ryInput), rotation);
        }
      }),
    );

    const paramXInput = document.createElement('input');
    paramXInput.type = 'text';
    paramXInput.placeholder = 'cos(t)';
    paramXInput.value = 'cos(t)';
    Object.assign(paramXInput.style, inputStyle('98px'));
    const paramYInput = document.createElement('input');
    paramYInput.type = 'text';
    paramYInput.placeholder = 'sin(t)';
    paramYInput.value = 'sin(t)';
    Object.assign(paramYInput.style, inputStyle('98px'));
    const tMinInput = this.#numberInput('t min', '0');
    const tMaxInput = this.#numberInput('t max', String(Math.PI * 2));
    commandRow.append(
      this.#labelled('x(t)', paramXInput),
      this.#labelled('y(t)', paramYInput),
      this.#labelled('t0', tMinInput),
      this.#labelled('t1', tMaxInput),
      this.#button('Add curve', () => {
        this.addParametricCurve({
          xExpression: paramXInput.value,
          yExpression: paramYInput.value,
          tMin: readNumberInput(tMinInput),
          tMax: readNumberInput(tMaxInput),
          samples: 160,
        });
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
      this.#button('Regular c/v', () => {
        this.addRegularPolygonByCenterAndVertexCoordinates(
          { x: readNumberInput(xInput), y: readNumberInput(yInput) },
          { x: readNumberInput(x2Input), y: readNumberInput(y2Input) },
          Math.max(3, Math.round(readNumberInput(sidesInput))),
        );
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
    const angleRow = document.createElement('div');
    Object.assign(angleRow.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
      alignItems: 'center',
    });
    const angleRadiusInput = this.#numberInput('angle radius', String(this.#angleRadius));
    angleRadiusInput.min = '0.1';
    angleRadiusInput.step = '0.1';
    angleRadiusInput.addEventListener('change', () => {
      try {
        this.#angleRadius = positiveNumber(readNumberInput(angleRadiusInput), 0.7);
      } catch (error) {
        this.#handleError(error);
      }
    });
    angleRow.append(
      this.#labelled('angle r', angleRadiusInput),
      this.#checkbox('exterior angle', this.#angleOrientation === 'exterior', checked => {
        this.#angleOrientation = checked ? 'exterior' : 'interior';
      }),
    );
    controls.append(angleRow);

    const snapRow = document.createElement('div');
    Object.assign(snapRow.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
      alignItems: 'center',
    });
    const snap = this.#snapshot.appState.grid.snapping;
    const strengthInput = this.#numberInput('snap strength', String(snap.strength));
    strengthInput.min = '0.1';
    strengthInput.max = '3';
    strengthInput.step = '0.05';
    strengthInput.addEventListener('change', () => {
      try {
        this.setSnapSettings({ strength: readNumberInput(strengthInput) });
      } catch (error) {
        this.#handleError(error);
      }
    });
    snapRow.append(
      this.#checkbox('snap', snap.enabled, checked => this.setSnapSettings({ enabled: checked })),
      this.#checkbox('grid', snap.modes.grid, checked => this.setSnapSettings({ modes: { grid: checked } })),
      this.#checkbox('points', snap.modes.points, checked => this.setSnapSettings({ modes: { points: checked } })),
      this.#checkbox('mid', snap.modes.midpoints, checked => this.setSnapSettings({ modes: { midpoints: checked } })),
      this.#checkbox('intersections', snap.modes.intersections, checked => this.setSnapSettings({ modes: { intersections: checked } })),
      this.#checkbox('axes', snap.modes.axes, checked => this.setSnapSettings({ modes: { axes: checked } })),
      this.#checkbox('angles', snap.modes.angles, checked => this.setSnapSettings({ modes: { angles: checked } })),
      this.#checkbox('edges', snap.modes.shapeEdges, checked => this.setSnapSettings({ modes: { shapeEdges: checked } })),
      this.#checkbox('markers', snap.showMarkers, checked => this.setSnapSettings({ showMarkers: checked })),
      this.#labelled('strength', strengthInput),
    );
    controls.append(snapRow);

    const editRow = document.createElement('div');
    Object.assign(editRow.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
      alignItems: 'center',
    });
    const objectInput = document.createElement('input');
    objectInput.type = 'text';
    objectInput.placeholder = 'selected id';
    Object.assign(objectInput.style, inputStyle('118px'));
    const editXInput = this.#numberInput('edit x', '0');
    const editYInput = this.#numberInput('edit y', '0');
    const editLengthInput = this.#numberInput('length', '1');
    const editRadiusInput = this.#numberInput('radius', '1');
    const editAngleInput = this.#numberInput('angle', '90');
    const editSidesInput = this.#numberInput('sides', '6');
    const selectedObjectId = (): string => {
      const explicit = objectInput.value.trim();
      if (explicit) return explicit;
      const item = selectionItems(this.#snapshot.appState.selected)[0];
      if (!item) throw new KleinSdkError('missing_selection', 'Choose an object first.');
      return item.id;
    };
    editRow.append(
      this.#labelled('id', objectInput),
      this.#labelled('x', editXInput),
      this.#labelled('y', editYInput),
      this.#button('Set xy', () => this.editObject(selectedObjectId(), {
        coordinates: { x: readNumberInput(editXInput), y: readNumberInput(editYInput) },
      })),
      this.#labelled('len', editLengthInput),
      this.#button('Set len', () => this.editObject(selectedObjectId(), { length: readNumberInput(editLengthInput) })),
      this.#labelled('rad', editRadiusInput),
      this.#button('Set rad', () => this.editObject(selectedObjectId(), { radius: readNumberInput(editRadiusInput) })),
      this.#labelled('ang', editAngleInput),
      this.#button('Set ang', () => this.editObject(selectedObjectId(), { angleDegrees: readNumberInput(editAngleInput) })),
      this.#labelled('sides', editSidesInput),
      this.#button('Set sides', () => this.editObject(selectedObjectId(), {
        sides: Math.max(3, Math.round(readNumberInput(editSidesInput))),
      })),
      this.#button('Duplicate', () => this.duplicateSelection()),
      this.#button('Group', () => this.groupSelection()),
      this.#button('Ungroup', () => this.ungroupSelection()),
      this.#button('Lock', () => this.setSelectionLocked(true)),
      this.#button('Unlock', () => this.setSelectionLocked(false)),
      this.#button('Hide', () => this.setSelectionHidden(true)),
      this.#button('Front', () => this.bringSelectionToFront()),
      this.#button('Back', () => this.sendSelectionToBack()),
      this.#button('Delete', () => this.deleteSelection()),
    );
    controls.append(editRow);
    return controls;
  }

  #createSidePanel(): HTMLDivElement {
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      flex: '0 1 320px',
      minWidth: '260px',
      maxWidth: '360px',
      maxHeight: '100%',
      display: 'grid',
      gridTemplateRows: 'minmax(0, 1fr) auto',
      gap: '8px',
      padding: '8px',
      borderLeft: '1px solid var(--kgc-border)',
      background: 'var(--kgc-surface)',
      overflow: 'auto',
    });

    this.#objectPanelEl = document.createElement('div');
    this.#historyPanelEl = document.createElement('div');
    panel.append(this.#objectPanelEl, this.#historyPanelEl);
    this.#syncPanels();
    return panel;
  }

  #syncPanels(): void {
    this.#renderObjectPanel();
    this.#renderHistoryPanel();
  }

  #renderObjectPanel(): void {
    const panel = this.#objectPanelEl;
    if (!panel) return;
    panel.replaceChildren();
    Object.assign(panel.style, {
      display: 'grid',
      gap: '8px',
      alignContent: 'start',
      minWidth: '0',
    });

    const title = document.createElement('div');
    title.textContent = 'Objects';
    Object.assign(title.style, {
      fontSize: '12px',
      fontWeight: '750',
      letterSpacing: '0',
      color: 'var(--kgc-text)',
    });

    const search = document.createElement('input');
    search.type = 'search';
    search.value = this.#objectSearchQuery;
    search.placeholder = 'Search objects';
    search.setAttribute('aria-label', 'Search objects');
    Object.assign(search.style, inputStyle('100%'));
    search.addEventListener('input', () => {
      this.#objectSearchQuery = search.value;
      this.#renderObjectPanel();
    });

    const filters = document.createElement('div');
    Object.assign(filters.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '4px',
    });
    for (const filter of geometryObjectFilters()) {
      const active = this.#objectTypeFilters.size === 0 || this.#objectTypeFilters.has(filter.id);
      const button = this.#panelButton(filter.label, () => {
        if (this.#objectTypeFilters.size === 0) {
          for (const candidate of geometryObjectFilters()) this.#objectTypeFilters.add(candidate.id);
        }
        if (this.#objectTypeFilters.has(filter.id)) this.#objectTypeFilters.delete(filter.id);
        else this.#objectTypeFilters.add(filter.id);
        if (this.#objectTypeFilters.size === geometryObjectFilters().length) this.#objectTypeFilters.clear();
        this.#renderObjectPanel();
      });
      button.setAttribute('aria-pressed', String(active));
      button.style.background = active ? 'var(--kgc-button-active-bg)' : 'var(--kgc-button-bg)';
      button.style.color = active ? 'var(--kgc-button-active-text)' : 'var(--kgc-button-text)';
      filters.append(button);
    }

    panel.append(title, search, filters);

    const rows = this.getObjectPanelRows({ includeHidden: true })
      .filter(row => this.#objectRowMatches(row));
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.textContent = this.#objectSearchQuery.trim()
        ? 'No matching objects.'
        : 'No objects yet. Add a point or shape to start.';
      Object.assign(empty.style, emptyStateStyle());
      panel.append(empty);
      return;
    }

    const tree = document.createElement('div');
    tree.setAttribute('role', 'tree');
    Object.assign(tree.style, {
      display: 'grid',
      gap: '6px',
      minWidth: '0',
    });

    const groups = [
      { label: 'Points', rows: rows.filter(row => row.kind === 'point') },
      { label: 'Objects', rows: rows.filter(row => row.kind === 'entity') },
    ];
    for (const group of groups) {
      if (!group.rows.length) continue;
      const groupLabel = document.createElement('div');
      groupLabel.textContent = `${group.label} (${group.rows.length})`;
      Object.assign(groupLabel.style, {
        marginTop: '4px',
        color: 'var(--kgc-muted-text)',
        fontSize: '11px',
        fontWeight: '750',
      });
      tree.append(groupLabel);
      for (const row of group.rows) tree.append(this.#objectRow(row));
    }
    panel.append(tree);
  }

  #objectRowMatches(row: GeometryObjectPanelRow): boolean {
    const query = this.#objectSearchQuery.trim().toLowerCase();
    if (query) {
      const text = `${row.id} ${row.label} ${row.displayKind} ${row.constructionLabel ?? ''}`.toLowerCase();
      if (!text.includes(query)) return false;
    }
    if (this.#objectTypeFilters.size === 0) return true;
    if (row.kind === 'point') return this.#objectTypeFilters.has('point');
    if (this.#objectTypeFilters.has(row.geometryKind)) return true;
    if ((row.geometryKind === 'conic' || row.geometryKind === 'parametricCurve') && this.#objectTypeFilters.has('curve')) return true;
    return false;
  }

  #objectRow(row: GeometryObjectPanelRow): HTMLDivElement {
    const item = document.createElement('div');
    item.setAttribute('role', 'treeitem');
    item.tabIndex = 0;
    const selected = selectionHasItem(this.#snapshot.appState.selected, { kind: row.kind, id: row.id });
    Object.assign(item.style, {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto auto',
      gap: '6px',
      alignItems: 'center',
      minWidth: '0',
      padding: '6px',
      border: `1px solid ${selected ? this.#theme.accent : this.#theme.border}`,
      borderRadius: '6px',
      background: selected ? this.#theme.buttonActiveBackground : this.#theme.surfaceRaised,
      color: selected ? this.#theme.buttonActiveText : this.#theme.text,
      cursor: 'pointer',
    });
    const selectRow = (): void => this.#select({ kind: row.kind, id: row.id });
    item.addEventListener('click', selectRow);
    item.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectRow();
      }
    });

    const main = document.createElement('div');
    Object.assign(main.style, {
      display: 'grid',
      gap: '3px',
      minWidth: '0',
    });
    const labelInput = document.createElement('input');
    labelInput.value = row.label;
    labelInput.setAttribute('aria-label', `Rename ${row.label}`);
    Object.assign(labelInput.style, {
      ...inputStyle('100%'),
      minWidth: '0',
      height: '26px',
      fontWeight: '650',
    });
    labelInput.addEventListener('click', event => event.stopPropagation());
    labelInput.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Enter') labelInput.blur();
    });
    labelInput.addEventListener('change', () => {
      this.editObject(row.id, { label: labelInput.value });
    });
    const meta = document.createElement('div');
    meta.textContent = `${row.displayKind}  ${row.id}`;
    if (row.constructionLabel) meta.textContent += `  ${row.constructionLabel}`;
    Object.assign(meta.style, {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      color: selected ? 'inherit' : 'var(--kgc-muted-text)',
      fontSize: '11px',
    });
    main.append(labelInput, meta);

    const hideButton = this.#panelButton(row.hidden ? 'Show' : 'Hide', () => {
      this.editObject(row.id, { hidden: !row.hidden });
    });
    const lockButton = this.#panelButton(row.locked ? 'Unlock' : 'Lock', () => {
      this.editObject(row.id, { locked: !row.locked });
    });
    hideButton.addEventListener('click', event => event.stopPropagation());
    lockButton.addEventListener('click', event => event.stopPropagation());
    item.append(main, hideButton, lockButton);
    return item;
  }

  #renderHistoryPanel(): void {
    const panel = this.#historyPanelEl;
    if (!panel) return;
    panel.replaceChildren();
    Object.assign(panel.style, {
      display: 'grid',
      gap: '6px',
      paddingTop: '8px',
      borderTop: '1px solid var(--kgc-border)',
    });
    const title = document.createElement('div');
    title.textContent = 'History';
    Object.assign(title.style, {
      fontSize: '12px',
      fontWeight: '750',
      color: 'var(--kgc-text)',
    });
    const actions = document.createElement('div');
    Object.assign(actions.style, {
      display: 'flex',
      gap: '4px',
      flexWrap: 'wrap',
    });
    actions.append(
      this.#panelButton('Undo', () => this.undo()),
      this.#panelButton('Redo', () => this.redo()),
      this.#panelButton('Checkpoint', () => this.#promptCheckpoint()),
    );
    panel.append(title, actions);
    const entries = this.getHistoryEntries();
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.textContent = 'No saved checkpoints yet.';
      Object.assign(empty.style, emptyStateStyle());
      panel.append(empty);
      return;
    }
    for (const entry of entries) {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: '6px',
        alignItems: 'center',
        minWidth: '0',
      });
      const label = document.createElement('div');
      label.textContent = entry.createdAt
        ? `${entry.label}  ${new Date(entry.createdAt).toLocaleTimeString()}`
        : entry.label;
      Object.assign(label.style, {
        minWidth: '0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: 'var(--kgc-muted-text)',
        fontSize: '11px',
      });
      const restore = this.#panelButton(entry.kind === 'redo' ? 'Redo' : 'Restore', () => {
        if (entry.kind === 'undo') this.undo();
        else if (entry.kind === 'redo') this.redo();
        else if (entry.checkpointId) this.restoreCheckpoint(entry.checkpointId);
      });
      row.append(label, restore);
      panel.append(row);
    }
  }

  #panelButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-label', label);
    Object.assign(button.style, {
      minHeight: '26px',
      padding: '0 8px',
      border: '1px solid var(--kgc-button-border)',
      borderRadius: '6px',
      background: 'var(--kgc-button-bg)',
      color: 'var(--kgc-button-text)',
      font: `650 11px/1 ${KLEIN_UI_FONT_STACK}`,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
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

  #promptCheckpoint(): void {
    const fallback = `Checkpoint ${this.#checkpoints.length + 1}`;
    const name = window.prompt('Checkpoint name', fallback);
    if (name === null) return;
    this.createCheckpoint(name.trim() || fallback);
  }

  #showCommandPalette(): void {
    this.#hideCommandPalette();
    const overlay = document.createElement('div');
    this.#commandPaletteEl = overlay;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Command palette');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '1000000',
      display: 'grid',
      placeItems: 'start center',
      paddingTop: '10vh',
      background: 'rgba(15, 23, 42, 0.22)',
    });

    const palette = document.createElement('div');
    Object.assign(palette.style, {
      width: 'min(560px, calc(100vw - 24px))',
      maxHeight: '70vh',
      display: 'grid',
      gap: '8px',
      padding: '10px',
      border: `1px solid ${this.#theme.border}`,
      borderRadius: '8px',
      background: this.#theme.surfaceRaised,
      color: this.#theme.text,
      boxShadow: '0 24px 70px rgba(15, 23, 42, 0.28)',
    });
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Search commands or tools';
    input.setAttribute('aria-label', 'Search commands or tools');
    Object.assign(input.style, inputStyle('100%'));
    const list = document.createElement('div');
    Object.assign(list.style, {
      display: 'grid',
      gap: '5px',
      overflow: 'auto',
    });
    palette.append(input, list);
    overlay.append(palette);
    document.body.append(overlay);

    const render = (): void => {
      const query = input.value.trim().toLowerCase();
      list.replaceChildren();
      const commands = this.#commandPaletteItems()
        .filter(command => `${command.label} ${command.detail}`.toLowerCase().includes(query));
      if (!commands.length) {
        const empty = document.createElement('div');
        empty.textContent = 'No matching commands.';
        Object.assign(empty.style, emptyStateStyle());
        list.append(empty);
        return;
      }
      for (const command of commands.slice(0, 18)) {
        const button = document.createElement('button');
        button.type = 'button';
        Object.assign(button.style, {
          display: 'grid',
          gap: '2px',
          width: '100%',
          minHeight: '44px',
          padding: '7px 9px',
          border: '1px solid var(--kgc-button-border)',
          borderRadius: '6px',
          background: 'var(--kgc-button-bg)',
          color: 'var(--kgc-button-text)',
          textAlign: 'left',
          cursor: 'pointer',
        });
        const label = document.createElement('span');
        label.textContent = command.label;
        Object.assign(label.style, { fontWeight: '750', fontSize: '12px' });
        const detail = document.createElement('span');
        detail.textContent = command.detail;
        Object.assign(detail.style, { color: 'var(--kgc-muted-text)', fontSize: '11px' });
        button.append(label, detail);
        button.addEventListener('click', () => {
          this.#hideCommandPalette();
          command.run();
        });
        list.append(button);
      }
    };
    input.addEventListener('input', render);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) this.#hideCommandPalette();
    });
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.#hideCommandPalette();
      }
      if (event.key === 'Enter') {
        const first = list.querySelector('button');
        if (first instanceof HTMLButtonElement) {
          event.preventDefault();
          first.click();
        }
      }
    });
    render();
    input.focus();
  }

  #hideCommandPalette(): void {
    this.#commandPaletteEl?.remove();
    this.#commandPaletteEl = undefined;
  }

  #commandPaletteItems(): Array<{ label: string; detail: string; run: () => void }> {
    const commands: Array<{ label: string; detail: string; run: () => void }> = GEOMETRY_TOOL_CATALOG.map(item => ({
      label: `Tool: ${item.label}`,
      detail: item.shortcut ? `${item.description} Shortcut: ${item.shortcut}.` : item.description,
      run: () => this.setTool(item.tool),
    }));
    commands.push(
      { label: 'Undo', detail: 'Restore the previous version.', run: () => this.undo() },
      { label: 'Redo', detail: 'Restore the next version.', run: () => this.redo() },
      { label: 'Create checkpoint', detail: 'Name and save the current construction state.', run: () => this.#promptCheckpoint() },
      { label: 'Restore previous version', detail: 'Use the undo stack to restore the last version.', run: () => this.undo() },
      { label: 'Reset view', detail: 'Center the origin and reset zoom.', run: () => this.resetView() },
      { label: 'Duplicate selection', detail: 'Duplicate the currently selected objects.', run: () => this.duplicateSelection() },
      { label: 'Delete selection', detail: 'Delete the currently selected objects.', run: () => this.deleteSelection() },
    );
    return commands;
  }

  #attachToolTooltip(
    button: HTMLButtonElement,
    item: (typeof GEOMETRY_TOOL_CATALOG)[number],
  ): void {
    const show = (): void => {
      this.#hideToolTooltip();
      const rect = button.getBoundingClientRect();
      const tooltip = document.createElement('div');
      this.#toolTooltipEl = tooltip;
      Object.assign(tooltip.style, {
        position: 'fixed',
        left: `${Math.min(rect.left, window.innerWidth - 260)}px`,
        top: `${rect.bottom + 8}px`,
        zIndex: '1000001',
        width: '240px',
        display: 'grid',
        gap: '6px',
        padding: '8px',
        border: `1px solid ${this.#theme.border}`,
        borderRadius: '8px',
        background: this.#theme.surfaceRaised,
        color: this.#theme.text,
        boxShadow: '0 16px 40px rgba(15, 23, 42, 0.22)',
        pointerEvents: 'none',
      });
      const title = document.createElement('div');
      title.textContent = item.shortcut ? `${item.label} (${item.shortcut})` : item.label;
      Object.assign(title.style, { fontSize: '12px', fontWeight: '800' });
      const preview = document.createElement('div');
      preview.textContent = toolPreviewText(item.tool);
      Object.assign(preview.style, {
        minHeight: '34px',
        display: 'grid',
        placeItems: 'center',
        border: '1px solid var(--kgc-border)',
        borderRadius: '6px',
        background: 'var(--kgc-canvas)',
        color: 'var(--kgc-accent)',
        font: `700 12px/1.2 ${KLEIN_MONO_FONT_STACK}`,
        letterSpacing: '0',
      });
      const description = document.createElement('div');
      description.textContent = item.description;
      Object.assign(description.style, { fontSize: '11px', color: 'var(--kgc-muted-text)', lineHeight: '1.35' });
      tooltip.append(title, preview, description);
      document.body.append(tooltip);
    };
    button.addEventListener('mouseenter', show);
    button.addEventListener('focus', show);
    button.addEventListener('mouseleave', () => this.#hideToolTooltip());
    button.addEventListener('blur', () => this.#hideToolTooltip());
  }

  #hideToolTooltip(): void {
    this.#toolTooltipEl?.remove();
    this.#toolTooltipEl = undefined;
  }

  #button(label: string, onClick: () => void, tooltip?: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-label', tooltip ? `${label}. ${tooltip}` : label);
    if (tooltip) button.title = tooltip;
    Object.assign(button.style, {
      minHeight: '30px',
      padding: '0 10px',
      border: '1px solid var(--kgc-button-border)',
      borderRadius: '6px',
      background: 'var(--kgc-button-bg)',
      color: 'var(--kgc-button-text)',
      font: `600 12px/1 ${KLEIN_UI_FONT_STACK}`,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
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

  #checkbox(label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLLabelElement {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    Object.assign(input.style, {
      margin: '0',
      accentColor: 'var(--kgc-accent)',
    });
    input.addEventListener('change', () => {
      try {
        onChange(input.checked);
      } catch (error) {
        this.#handleError(error);
      }
    });
    const wrapper = document.createElement('label');
    Object.assign(wrapper.style, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      minHeight: '28px',
      color: 'var(--kgc-muted-text)',
      fontSize: '12px',
      fontWeight: '650',
      userSelect: 'none',
    });
    const text = document.createElement('span');
    text.textContent = label;
    wrapper.append(input, text);
    return wrapper;
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

    if (event.button !== 0) return;

    if ((tool === 'select' || tool === 'move') && !this.#options.readOnly) {
      event.preventDefault();
      const hit = this.#hitTest(world);
      const additive = event.shiftKey || event.metaKey || event.ctrlKey;

      if (!hit) {
        this.#canvas.setPointerCapture(event.pointerId);
        this.#drag = {
          kind: 'marquee',
          pointerId: event.pointerId,
          additive,
          startSelection: additive ? cloneSelection(this.#snapshot.appState.selected) : null,
          screen,
          startWorld: world,
          currentWorld: world,
        };
        this.#render();
        return;
      }

      if (additive) {
        this.#select(toggleSelectionItem(this.#snapshot.appState.selected, hit.selection), false);
        this.#render();
        return;
      }

      const wasSelected = selectionHasItem(this.#snapshot.appState.selected, hit.selection);
      if (!wasSelected) this.#select(hit.selection, false);
      const activeSelection = this.#snapshot.appState.selected;
      const useSelectionDrag = selectionItems(activeSelection).length > 1 || hit.selection.kind === 'entity';
      if (useSelectionDrag) {
        const selectionDrag = this.#makeMoveSelectionDrag(event.pointerId, world, activeSelection);
        if (selectionDrag) {
          this.#canvas.setPointerCapture(event.pointerId);
          this.#drag = selectionDrag;
          return;
        }
      }

      if (hit.selection.kind === 'point') {
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

    if (this.#contextMenuEl) this.#hideContextMenu();
    this.#canvas.setPointerCapture(event.pointerId);
    this.#drag = { kind: 'press', pointerId: event.pointerId, screen, world };
  };

  #onPointerMove = (event: PointerEvent): void => {
    if (!this.#canvas) return;
    const world = this.#eventWorld(event);
    this.#hoverWorld = world;

    if (!this.#drag) {
      const tool = this.#snapshot.appState.activeTool;
      if (tool !== 'select' && tool !== 'move' && tool !== 'pan' && tool !== 'remove') {
        this.#snapWorld(world, [], event);
      } else {
        this.#snapMarker = null;
      }
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
      }, [this.#drag.pointId], event);
      const points = {
        ...this.#drag.startSnapshot.scene.points,
        [this.#drag.pointId]: { ...this.#drag.original, x: next.x, y: next.y },
      };
      this.#snapshot = {
        ...this.#drag.startSnapshot,
        scene: constrainGeometryScene(
          recomputeGeometryScene({ ...this.#drag.startSnapshot.scene, points }),
          [this.#drag.pointId],
        ),
      };
      this.#render();
      return;
    }

    if (this.#drag.kind === 'moveSelection') {
      const dx = world.x - this.#drag.startWorld.x;
      const dy = world.y - this.#drag.startWorld.y;
      this.#snapshot = previewMoveSelection(this.#drag.startSnapshot, this.#drag, { x: dx, y: dy });
      this.#render();
      return;
    }

    if (this.#drag.kind === 'marquee') {
      this.#drag = { ...this.#drag, currentWorld: world };
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
      const moved = this.#snapshot;
      this.#snapshot = drag.startSnapshot;
      const deltas = geometrySceneUpdateDeltas(drag.startSnapshot.scene, moved.scene);
      if (deltas.length) {
        this.#commitDelta({ op: 'batch', deltas });
      } else {
        this.#render();
      }
      return;
    }

    if (drag.kind === 'moveSelection') {
      const moved = this.#snapshot;
      this.#snapshot = drag.startSnapshot;
      const deltas = moveSelectionCommitDeltas(moved, drag);
      if (deltas.length) {
        this.#commitDelta({ op: 'batch', deltas });
      } else {
        this.#render();
      }
      return;
    }

    if (drag.kind === 'marquee') {
      const upScreen = this.#eventScreen(event);
      if (distance2D(upScreen, drag.screen) <= 4) {
        this.#select(drag.additive ? drag.startSelection : null);
        return;
      }
      const marqueeItems = selectionItemsInWorldRect(this.#snapshot.scene, worldRectFromPoints(drag.startWorld, this.#eventWorld(event)));
      const nextItems = drag.additive
        ? [...selectionItems(drag.startSelection), ...marqueeItems]
        : marqueeItems;
      this.#select(selectionFromItems(nextItems));
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
      if (this.#drag.kind === 'movePoint' || this.#drag.kind === 'moveSelection') {
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

  #onContextMenu = (event: MouseEvent): void => {
    if (!this.#canvas || this.#options.readOnly) return;
    event.preventDefault();
    const world = this.#mouseWorld(event);
    const hit = this.#hitTest(world);
    if (!hit) {
      this.#hideContextMenu();
      return;
    }
    if (!selectionHasItem(this.#snapshot.appState.selected, hit.selection)) {
      this.#select(hit.selection, false);
    }
    this.#showContextMenu({ x: event.clientX, y: event.clientY });
    this.#render();
  };

  #onDocumentPointerDown = (event: PointerEvent): void => {
    if (!this.#contextMenuEl) return;
    if (event.target instanceof Node && this.#contextMenuEl.contains(event.target)) return;
    this.#hideContextMenu();
  };

  #onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && key === 'k') {
      event.preventDefault();
      this.#showCommandPalette();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && key === 'y') {
      event.preventDefault();
      this.redo();
      return;
    }
    const shortcuts: Record<string, GeometryCalculatorTool> = {
      v: 'select',
      m: 'pan',
      p: 'point',
      s: 'segment',
      l: 'line',
      r: 'ray',
      u: 'vector',
      g: 'polygon',
      c: 'circle',
      k: 'conic',
      q: 'parametricCurve',
      a: 'angle',
      x: 'remove',
    };
    if ((key === 'delete' || key === 'backspace') && this.#snapshot.appState.selected) {
      event.preventDefault();
      this.deleteSelection();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && key === 'd') {
      event.preventDefault();
      this.duplicateSelection();
      return;
    }
    const tool = shortcuts[key];
    if (tool) {
      event.preventDefault();
      this.setTool(tool);
      return;
    }
    if (key === 'escape') {
      this.#hideContextMenu();
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
      const placed = this.#snapWorld(world, [], event);
      this.addPoint({ x: placed.x, y: placed.y });
      return;
    }

    if (tool === 'midpoint') {
      const pointId = this.#findOrCreatePoint(world, hit, event);
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
      const pointId = this.#findOrCreatePoint(world, hit, event);
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
      const pointId = this.#findOrCreatePoint(world, hit, event);
      const lineIds = this.addTangentLines(this.#pendingReferenceEntityId, pointId);
      this.#pendingReferenceEntityId = null;
      this.#select({ kind: 'entity', id: lineIds[0] ?? '' });
      return;
    }

    if (tool === 'angleBisector') {
      const pointId = this.#findOrCreatePoint(world, hit, event);
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
      const pointId = this.#findOrCreatePoint(world, hit, event);
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
      const pointId = this.#findOrCreatePoint(world, hit, event);
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
      const pointId = this.#findOrCreatePoint(world, hit, event);
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
      const pointId = this.#findOrCreatePoint(world, hit, event);
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

    if (tool === 'arc') {
      const pointId = this.#findOrCreatePoint(world, hit, event);
      if (!this.#draftCirclePointIds.includes(pointId)) {
        this.#draftCirclePointIds.push(pointId);
      }
      if (this.#draftCirclePointIds.length === 3) {
        const [center, start, end] = this.#draftCirclePointIds;
        this.#draftCirclePointIds = [];
        if (center && start && end) {
          const arcId = this.addArcByPoints(center, start, end);
          this.#select({ kind: 'entity', id: arcId });
        }
      } else {
        this.#setStatus('Choose center, start point, then end point.');
      }
      return;
    }

    if (tool === 'angle') {
      if (hit?.selection.kind === 'entity' && this.#isLineLikeEntity(hit.selection.id)) {
        this.#draftAngleEntityIds.push(hit.selection.id);
        if (this.#draftAngleEntityIds.length >= 2) {
          const [firstId, secondId] = this.#draftAngleEntityIds;
          this.#draftAngleEntityIds = [];
          if (firstId && secondId) {
            this.addAngleBetweenEntities(firstId, secondId, {
              radius: this.#angleRadius,
              orientation: this.#angleOrientation,
            });
          }
        } else {
          this.#setStatus('Choose the second intersecting line or segment.');
        }
        return;
      }

      const pointId = this.#findOrCreatePoint(world, hit, event);
      this.#draftAnglePointIds.push(pointId);
      if (this.#draftAnglePointIds.length === 3) {
        const [a, vertex, c] = this.#draftAnglePointIds;
        this.#draftAnglePointIds = [];
        if (a && vertex && c) {
          this.addAngleByPoints([a, vertex, c], {
            radius: this.#angleRadius,
            orientation: this.#angleOrientation,
          });
        }
      } else {
        this.#setStatus('Choose three points: arm, vertex, arm.');
      }
      return;
    }

    if (tool === 'conic') {
      this.addEllipse(this.#snapWorld(world, [], event), 2, 1);
      return;
    }

    if (tool === 'parametricCurve') {
      const origin = this.#snapWorld(world, [], event);
      const points = Array.from({ length: 96 }, (_, index) => {
        const t = (index * Math.PI * 2) / 96;
        return { x: origin.x + Math.cos(t), y: origin.y + Math.sin(t) };
      });
      this.addParametricCurve({ points, closed: true, label: 'x(t), y(t)' });
      return;
    }

    if (tool === 'triangle' || tool === 'rectangle' || tool === 'square' || tool === 'regularPolygon') {
      const shapeOptions: ShapeCreationOptions = { size: 2 };
      if (tool === 'regularPolygon') shapeOptions.sides = 6;
      this.addShape(tool, this.#snapWorld(world, [], event), shapeOptions);
    }

    void event;
  }

  #findOrCreatePoint(world: Vector2, hit: HitTarget, event?: PointerEvent): string {
    if (hit?.selection.kind === 'point') return hit.selection.id;
    const placed = this.#snapWorld(world, [], event);
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
    this.#snapMarker = null;
    this.#setStatus(this.#statusForTool());
  }

  #select(selection: GeometryCalculatorSelection | null, emit = true): void {
    const normalized = normalizeSelection(selection);
    this.#snapshot = applyGeometryCalculatorDelta(this.#snapshot, { op: 'setSelection', selection: normalized });
    if (emit) {
      this.#emitDelta({ op: 'setSelection', selection: normalized }, this.#deltaMeta(undefined));
    }
    this.#syncPanels();
    this.#render();
  }

  #makeMoveSelectionDrag(
    pointerId: number,
    startWorld: Vector2,
    selection: GeometryCalculatorSelection | null,
  ): Extract<DragState, { kind: 'moveSelection' }> | null {
    const targets = selectionTransformTargets(this.#snapshot.scene, selection);
    if (!targets.pointIds.length && !targets.locusEntityIds.length) return null;
    const originalPoints: Record<string, GeometryPoint2D> = {};
    for (const pointId of targets.pointIds) {
      const point = point2D(this.#snapshot.scene, pointId);
      if (point) originalPoints[pointId] = point;
    }
    const locusPoints: Record<string, Vector2[]> = {};
    for (const entityId of targets.locusEntityIds) {
      const entity = this.#snapshot.scene.entities[entityId];
      if (isSampledCurveEntity(entity)) locusPoints[entityId] = entity.points.map(point => ({ ...point }));
    }
    return {
      kind: 'moveSelection',
      pointerId,
      startSnapshot: cloneSnapshot(this.#snapshot),
      startWorld,
      pointIds: targets.pointIds,
      originalPoints,
      locusPoints,
    };
  }

  #showContextMenu(position: Vector2): void {
    this.#hideContextMenu();
    const menu = document.createElement('div');
    this.#contextMenuEl = menu;
    Object.assign(menu.style, {
      position: 'fixed',
      left: `${position.x}px`,
      top: `${position.y}px`,
      zIndex: '999999',
      minWidth: '158px',
      padding: '5px',
      border: `1px solid ${this.#theme.border}`,
      borderRadius: '8px',
      background: this.#theme.surfaceRaised,
      boxShadow: '0 14px 30px rgba(15, 23, 42, 0.18)',
      color: this.#theme.text,
      font: `500 12px/1.2 ${KLEIN_UI_FONT_STACK}`,
      userSelect: 'none',
    });
    const appendAction = (label: string, action: () => void): void => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      Object.assign(button.style, {
        display: 'block',
        width: '100%',
        minHeight: '28px',
        padding: '0 9px',
        border: '0',
        borderRadius: '6px',
        background: 'transparent',
        color: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
        font: 'inherit',
      });
      button.addEventListener('mouseenter', () => {
        button.style.background = this.#theme.buttonActiveBackground;
        button.style.color = this.#theme.buttonActiveText;
      });
      button.addEventListener('mouseleave', () => {
        button.style.background = 'transparent';
        button.style.color = 'inherit';
      });
      button.addEventListener('click', () => {
        try {
          action();
        } catch (error) {
          this.#handleError(error);
        } finally {
          this.#hideContextMenu();
        }
      });
      menu.append(button);
    };
    appendAction('Duplicate', () => this.duplicateSelection());
    appendAction('Lock', () => this.setSelectionLocked(true));
    appendAction('Unlock', () => this.setSelectionLocked(false));
    appendAction('Hide', () => this.setSelectionHidden(true));
    appendAction('Bring to front', () => this.bringSelectionToFront());
    appendAction('Send to back', () => this.sendSelectionToBack());
    appendAction('Delete', () => this.deleteSelection());
    document.body.append(menu);
  }

  #hideContextMenu(): void {
    this.#contextMenuEl?.remove();
    this.#contextMenuEl = undefined;
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

  #mouseWorld(event: MouseEvent): Vector2 {
    const rect = this.#canvas?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return screenToGeometryWorld(
      { x: event.clientX, y: event.clientY },
      this.#snapshot.appState.view,
      this.#snapshot.appState.grid.unitSize,
      rect,
    );
  }

  #snapWorld(
    world: Vector2,
    excludePointIds: string[] = [],
    event?: Pick<PointerEvent, 'altKey' | 'shiftKey'>,
  ): Vector2 {
    const settings = effectiveSnapSettings(this.#snapshot.appState.grid.snapping, event);
    if (!settings.enabled) {
      this.#snapMarker = null;
      return world;
    }
    const snap = resolveGeometrySnap(this.#snapshot.scene, world, {
      toleranceWorld: this.#worldHitTolerance(),
      gridStep: 1,
      excludePointIds,
      settings,
    });
    this.#snapMarker = settings.showMarkers ? snap.marker : null;
    return snap.point;
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

  #requirePolygonEntity(id: string): PolygonEntity {
    const entity = this.#snapshot.scene.entities[id];
    if (!entity || entity.kind !== 'polygon') {
      throw new KleinSdkError('invalid_polygon_reference', 'Choose a polygon.');
    }
    if (entity.pointIds.length < 3) {
      throw new KleinSdkError('invalid_polygon', 'A polygon needs at least three vertices.');
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
    style: GeometryAngleOptions,
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
        const angleOptions = normalizeAngleOptions(style);
        const entity = withEntityStyle<AngleEntity>({
          id: this.#ids.next('angle'),
          kind: 'angle',
          pointIds: [firstArm, shared, secondArm],
          radius: angleOptions.radius,
          orientation: angleOptions.orientation,
          color: style.color ?? '#f97316',
        }, style, '#f97316');
        return { op: 'addEntity', entity };
      }
    }

    const color = style.color ?? '#f97316';
    const vertex = this.#makePoint(vertexPoint.x, vertexPoint.y, { color });
    const firstArm = this.#makePointAlongLine(first, vertexPoint, 1.5, color);
    const secondArm = this.#makePointAlongLine(second, vertexPoint, 1.5, color);
    const angleOptions = normalizeAngleOptions(style);
    const angle = withEntityStyle<AngleEntity>({
      id: this.#ids.next('angle'),
      kind: 'angle',
      pointIds: [firstArm.id, vertex.id, secondArm.id],
      radius: angleOptions.radius,
      orientation: angleOptions.orientation,
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
    if (tool === 'ray') return 'Choose the ray endpoint, then a point showing its direction.';
    if (tool === 'vector') return 'Choose the vector tail, then the vector head.';
    if (tool === 'polygon') return 'Click vertices, then click the first vertex or press Enter to close.';
    if (tool === 'circle') return 'Choose a center point, then a radius point.';
    if (tool === 'circleThroughPoints') return 'Choose three non-collinear points.';
    if (tool === 'arc') return 'Choose center, start point, then end point for the arc.';
    if (tool === 'conic') return 'Click to place a default ellipse, or use the conic controls.';
    if (tool === 'parametricCurve') return 'Click to place a sampled unit curve, or use x(t), y(t) controls.';
    if (tool === 'angle') return 'Choose three points, or choose two intersecting lines or segments. Use angle radius/exterior controls.';
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
    ctx.font = `11px ${KLEIN_UI_FONT_STACK}`;
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
        case 'conic':
        case 'parametricCurve':
          this.#drawSampledCurve(ctx, entity);
          break;
        case 'relationMarker':
          this.#drawRelationMarker(ctx, entity);
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
    for (const point of Object.values(this.#snapshot.scene.points)) {
      if (point.kind !== 'point2d' || point.hidden) continue;
      const screen = this.worldToScreen(point);
      const selectedPoint = selectionHasItem(this.#snapshot.appState.selected, { kind: 'point', id: point.id });
      ctx.save();
      ctx.fillStyle = point.color ?? this.#theme.pointColor;
      ctx.strokeStyle = selectedPoint ? this.#theme.selection : this.#theme.canvas;
      ctx.lineWidth = selectedPoint ? 3 : 2;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, selectedPoint ? POINT_RADIUS_PX + 2 : POINT_RADIUS_PX, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (point.label) {
        ctx.font = `600 12px ${KLEIN_UI_FONT_STACK}`;
        ctx.fillStyle = this.#theme.text;
        ctx.fillText(point.label, screen.x + 8, screen.y - 8);
      }
      ctx.restore();
    }
  }

  #drawPolygon(ctx: CanvasRenderingContext2D, entity: PolygonEntity): void {
    const points = entity.pointIds.map(id => point2D(this.#snapshot.scene, id)).filter(isPoint2D);
    if (points.length < 3) return;
    const selected = selectionHasItem(this.#snapshot.appState.selected, { kind: 'entity', id: entity.id });
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
    const selected = selectionHasItem(this.#snapshot.appState.selected, { kind: 'entity', id: entity.id });
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
    const selected = selectionHasItem(this.#snapshot.appState.selected, { kind: 'entity', id: entity.id });
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
    const selected = selectionHasItem(this.#snapshot.appState.selected, { kind: 'entity', id: entity.id });
    const radius = positiveNumber(entity.radius, 0.7) * this.#snapshot.appState.grid.unitSize * this.#snapshot.appState.view.zoom;
    const start = Math.atan2(sa.y - sv.y, sa.x - sv.x);
    const end = Math.atan2(sc.y - sv.y, sc.x - sv.x);
    const delta = angleSweep(start, end, entity.orientation);
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
    const label = entity.label ?? `${angleMeasureForEntityDegrees(a, vertex, c, entity).toFixed(1)} deg`;
    this.#drawTextAtWorld(ctx, labelPoint, label, this.#theme.angleText);
    ctx.restore();
  }

  #drawSampledCurve(ctx: CanvasRenderingContext2D, entity: ConicEntity | ParametricCurveEntity): void {
    const segments = sampledCurveSegments(entity);
    if (!segments.length) return;
    const selected = selectionHasItem(this.#snapshot.appState.selected, { kind: 'entity', id: entity.id });
    ctx.save();
    ctx.strokeStyle = selected ? this.#theme.selection : entity.strokeColor ?? entity.color ?? this.#theme.drawColor;
    ctx.lineWidth = selected ? 4 : entity.width ?? DEFAULT_WIDTH;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const segment of segments) {
      if (segment.length < 2) continue;
      const firstPoint = segment[0];
      if (!firstPoint) continue;
      const first = this.worldToScreen(firstPoint);
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (const point of segment.slice(1)) {
        const screen = this.worldToScreen(point);
        ctx.lineTo(screen.x, screen.y);
      }
      if (entity.closed) ctx.closePath();
      if (entity.closed && entity.fillColor) {
        ctx.fillStyle = entity.fillColor;
        ctx.fill();
      }
      ctx.stroke();
    }
    const labelPoint = entity.kind === 'conic' && entity.center ? entity.center : polygonCentroid(entity.points);
    this.#drawEntityLabel(ctx, entity, labelPoint);
    ctx.restore();
  }

  #drawRelationMarker(ctx: CanvasRenderingContext2D, entity: GeometryRelationMarkerEntity): void {
    const anchor = relationMarkerAnchor(this.#snapshot.scene, entity);
    if (!anchor) return;
    const selected = selectionHasItem(this.#snapshot.appState.selected, { kind: 'entity', id: entity.id });
    const label = entity.text ?? entity.label ?? relationMarkerLabel(entity.relationKind);
    this.#drawTextAtWorld(ctx, anchor, label, selected ? this.#theme.selection : entity.color ?? this.#theme.angleText);
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
    const selected = selectionHasItem(this.#snapshot.appState.selected, { kind: 'entity', id: entity.id });
    ctx.save();
    ctx.strokeStyle = selected ? this.#theme.selection : entity.color ?? this.#theme.drawColor;
    ctx.lineWidth = selected ? 4 : entity.width ?? DEFAULT_WIDTH;
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

    if (hover && this.#snapshot.appState.activeTool === 'arc' && this.#draftCirclePointIds.length >= 1) {
      const center = point2D(this.#snapshot.scene, this.#draftCirclePointIds[0] ?? '');
      const start = point2D(this.#snapshot.scene, this.#draftCirclePointIds[1] ?? '');
      if (center && !start) {
        this.#strokeWorldLine(ctx, center, hover, { color: this.#theme.draft }, false);
      } else if (center && start) {
        const screenCenter = this.worldToScreen(center);
        const radius = distance2D(center, start) * this.#snapshot.appState.grid.unitSize * this.#snapshot.appState.view.zoom;
        const screenStart = this.worldToScreen(start);
        const screenEnd = this.worldToScreen(hover);
        const startAngle = Math.atan2(screenStart.y - screenCenter.y, screenStart.x - screenCenter.x);
        const endAngle = Math.atan2(screenEnd.y - screenCenter.y, screenEnd.x - screenCenter.x);
        const delta = normalizeAngleDelta(endAngle - startAngle);
        ctx.beginPath();
        ctx.arc(screenCenter.x, screenCenter.y, radius, startAngle, startAngle + delta, delta < 0);
        ctx.stroke();
      }
    }

    if (this.#drag?.kind === 'marquee') {
      const start = this.worldToScreen(this.#drag.startWorld);
      const end = this.worldToScreen(this.#drag.currentWorld);
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const width = Math.abs(end.x - start.x);
      const height = Math.abs(end.y - start.y);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = this.#theme.selection;
      ctx.fillStyle = colorWithAlpha(this.#theme.selection, 0.1);
      ctx.lineWidth = 1.5;
      ctx.fillRect(x, y, width, height);
      ctx.strokeRect(x, y, width, height);
    }

    if (this.#snapMarker && this.#snapshot.appState.grid.snapping.showMarkers) {
      const screen = this.worldToScreen(this.#snapMarker.point);
      ctx.setLineDash([]);
      ctx.strokeStyle = this.#theme.selection;
      ctx.fillStyle = this.#theme.selection;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(screen.x - 7, screen.y);
      ctx.lineTo(screen.x + 7, screen.y);
      ctx.moveTo(screen.x, screen.y - 7);
      ctx.lineTo(screen.x, screen.y + 7);
      ctx.stroke();
      this.#drawTextAtWorld(ctx, {
        x: this.#snapMarker.point.x,
        y: this.#snapMarker.point.y,
      }, this.#snapMarker.label, this.#theme.selection);
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
    const selected = 'id' in style && typeof style.id === 'string' && selectionHasItem(this.#snapshot.appState.selected, { kind: 'entity', id: style.id });
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
    ctx.font = `600 12px ${KLEIN_UI_FONT_STACK}`;
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

interface CirclePolynomial {
  x2: number;
  y2: number;
  x: number;
  y: number;
  c: number;
}

interface SnapOptions {
  toleranceWorld: number;
  gridStep: number;
  excludePointIds?: string[];
  settings: GeometrySnapSettings;
}

interface SnapCandidate {
  point: Vector2;
  kind: GeometrySnapKind;
  label: string;
}

interface SnapMarker extends SnapCandidate {
  distanceWorld: number;
}

interface SnapResult {
  point: Vector2;
  marker: SnapMarker | null;
}

interface SelectionTransformTargets {
  pointIds: string[];
  locusEntityIds: string[];
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
        ...normalizeGridOptions(fallback.appState.grid, snapshot.appState.grid),
      },
      selected: normalizeSelection(snapshot.appState.selected ?? null),
      groups: normalizeGroups(snapshot.appState.groups ?? {}),
    },
  };
}

function normalizeGridOptions(
  base: GeometryGridOptions,
  patch: GeometryGridOptionsPatch = {},
): GeometryGridOptions {
  const previousSnap = base.snapping ?? DEFAULT_SNAP_SETTINGS;
  const patchSnap: GeometrySnapSettingsPatch = patch.snapping ?? {};
  const enabled = patch.snap ?? patchSnap.enabled ?? previousSnap.enabled ?? base.snap ?? DEFAULT_SNAP_SETTINGS.enabled;
  const snapping: GeometrySnapSettings = {
    enabled,
    strength: clamp(finiteNumber(patchSnap.strength, previousSnap.strength ?? DEFAULT_SNAP_SETTINGS.strength), 0.1, 3),
    showMarkers: patchSnap.showMarkers ?? previousSnap.showMarkers ?? DEFAULT_SNAP_SETTINGS.showMarkers,
    modes: {
      ...DEFAULT_SNAP_MODES,
      ...(previousSnap.modes ?? {}),
      ...(patchSnap.modes ?? {}),
    },
  };
  return {
    unitSize: positiveNumber(patch.unitSize, positiveNumber(base.unitSize, DEFAULT_UNIT_SIZE)),
    majorEvery: Math.max(1, Math.round(positiveNumber(patch.majorEvery, positiveNumber(base.majorEvery, 5)))),
    labels: patch.labels ?? base.labels ?? true,
    snap: enabled,
    snapping,
  };
}

function cloneSnapSettings(settings: GeometrySnapSettings): GeometrySnapSettings {
  return {
    ...settings,
    modes: { ...settings.modes },
  };
}

function effectiveSnapSettings(
  settings: GeometrySnapSettings,
  event: Pick<PointerEvent, 'altKey' | 'shiftKey'> | undefined,
): GeometrySnapSettings {
  const next = cloneSnapSettings(settings);
  if (event?.altKey) next.enabled = false;
  if (event?.shiftKey) {
    next.enabled = true;
    next.modes.angles = true;
  }
  return next;
}

function normalizeSelection(selection: GeometryCalculatorSelection | null | undefined): GeometryCalculatorSelection | null {
  if (!selection) return null;
  if (selection.kind === 'point' || selection.kind === 'entity') {
    return { kind: selection.kind, id: selection.id };
  }
  return selectionFromItems(selection.items);
}

function cloneSelection(selection: GeometryCalculatorSelection | null): GeometryCalculatorSelection | null {
  const normalized = normalizeSelection(selection);
  if (!normalized) return null;
  if (normalized.kind === 'multi') return { kind: 'multi', items: [...normalized.items] };
  return { ...normalized };
}

function selectionItems(selection: GeometryCalculatorSelection | null | undefined): GeometryCalculatorSelectable[] {
  if (!selection) return [];
  if (selection.kind === 'multi') return selectionItemsFromArray(selection.items);
  return [{ kind: selection.kind, id: selection.id }];
}

function selectionItemsFromArray(items: GeometryCalculatorSelectable[]): GeometryCalculatorSelectable[] {
  const seen = new Set<string>();
  const result: GeometryCalculatorSelectable[] = [];
  for (const item of items) {
    if (!item.id || (item.kind !== 'point' && item.kind !== 'entity')) continue;
    const key = selectionKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ kind: item.kind, id: item.id });
  }
  return result;
}

function selectionFromItems(items: GeometryCalculatorSelectable[]): GeometryCalculatorSelection | null {
  const normalized = selectionItemsFromArray(items);
  if (normalized.length === 0) return null;
  if (normalized.length === 1) return normalized[0] as GeometryCalculatorSelectable;
  return { kind: 'multi', items: normalized };
}

function selectionKey(item: GeometryCalculatorSelectable): string {
  return `${item.kind}:${item.id}`;
}

function selectionHasItem(selection: GeometryCalculatorSelection | null | undefined, item: GeometryCalculatorSelectable): boolean {
  return selectionItems(selection).some(candidate => candidate.kind === item.kind && candidate.id === item.id);
}

function toggleSelectionItem(
  selection: GeometryCalculatorSelection | null | undefined,
  item: GeometryCalculatorSelectable,
): GeometryCalculatorSelection | null {
  const key = selectionKey(item);
  const items = selectionItems(selection);
  if (items.some(candidate => selectionKey(candidate) === key)) {
    return selectionFromItems(items.filter(candidate => selectionKey(candidate) !== key));
  }
  return selectionFromItems([...items, item]);
}

function normalizeGroups(groups: Record<string, GeometryObjectGroup>): Record<string, GeometryObjectGroup> {
  const normalized: Record<string, GeometryObjectGroup> = {};
  for (const [id, group] of Object.entries(groups)) {
    const items = selectionItemsFromArray(group.items ?? []);
    if (!id || !items.length) continue;
    const next: GeometryObjectGroup = { id, items };
    if (group.label !== undefined) next.label = group.label;
    if (group.locked !== undefined) next.locked = group.locked;
    if (group.hidden !== undefined) next.hidden = group.hidden;
    if (group.createdAt !== undefined) next.createdAt = group.createdAt;
    normalized[id] = next;
  }
  return normalized;
}

function normalizeEntityOrder(order: string[], entities: Record<string, GeometryEntity>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of order) {
    if (!entities[id] || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  for (const id of Object.keys(entities)) {
    if (!seen.has(id)) result.push(id);
  }
  return result;
}

function selectionAfterDeletedIds(
  selection: GeometryCalculatorSelection | null,
  deleteSet: Set<string>,
): GeometryCalculatorSelection | null {
  return selectionFromItems(selectionItems(selection).filter(item => !deleteSet.has(item.id)));
}

function groupsAfterDeletedIds(
  groups: Record<string, GeometryObjectGroup>,
  deleteSet: Set<string>,
): Record<string, GeometryObjectGroup> {
  const next: Record<string, GeometryObjectGroup> = {};
  for (const group of Object.values(groups)) {
    const items = group.items.filter(item => !deleteSet.has(item.id));
    if (items.length < 2) continue;
    next[group.id] = { ...group, items };
  }
  return next;
}

function selectionTransformTargets(
  scene: GeometryCalculatorScene,
  selection: GeometryCalculatorSelection | null,
): SelectionTransformTargets {
  const pointIds = new Set<string>();
  const locusEntityIds = new Set<string>();
  for (const item of selectionItems(selection)) {
    if (item.kind === 'point') {
      const point = point2D(scene, item.id);
      if (point && !point.locked) pointIds.add(point.id);
      continue;
    }

    const entity = scene.entities[item.id];
    if (!entity || entity.locked) continue;
    if (isSampledCurveEntity(entity)) {
      locusEntityIds.add(entity.id);
      continue;
    }
    for (const pointId of geometryEntityPointIds(entity)) {
      const point = point2D(scene, pointId);
      if (!point) continue;
      if (point.locked && !(point.hidden && !point.construction)) continue;
      pointIds.add(point.id);
    }
  }
  return { pointIds: [...pointIds], locusEntityIds: [...locusEntityIds] };
}

function transformTargetDeltas(
  scene: GeometryCalculatorScene,
  targets: SelectionTransformTargets,
  mapPoint: (point: Vector2) => Vector2,
): GeometryCalculatorDelta[] {
  const deltas: GeometryCalculatorDelta[] = [];
  for (const pointId of targets.pointIds) {
    const point = point2D(scene, pointId);
    if (!point) continue;
    const next = mapPoint(point);
    if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) continue;
    if (Math.abs(next.x - point.x) <= 1e-9 && Math.abs(next.y - point.y) <= 1e-9) continue;
    deltas.push({ op: 'updatePoint', id: point.id, changes: { x: next.x, y: next.y } });
  }
  for (const entityId of targets.locusEntityIds) {
    const entity = scene.entities[entityId];
    if (!isSampledCurveEntity(entity)) continue;
    const points = entity.points.map(point => mapPoint(point));
    const changes: Partial<GeometryEntity> = { points } as Partial<GeometryEntity>;
    if (entity.kind === 'conic' && entity.segments) {
      (changes as Partial<ConicEntity>).segments = entity.segments.map(segment => segment.map(point => mapPoint(point)));
    }
    if (entity.kind === 'conic' && entity.center) {
      (changes as Partial<ConicEntity>).center = mapPoint(entity.center);
    }
    deltas.push({ op: 'updateEntity', id: entity.id, changes });
  }
  return deltas;
}

function selectionCenter(
  scene: GeometryCalculatorScene,
  selection: GeometryCalculatorSelection | null,
): Vector2 | null {
  const targets = selectionTransformTargets(scene, selection);
  const points: Vector2[] = [];
  for (const pointId of targets.pointIds) {
    const point = point2D(scene, pointId);
    if (point) points.push(point);
  }
  for (const entityId of targets.locusEntityIds) {
    const entity = scene.entities[entityId];
    if (isSampledCurveEntity(entity)) points.push(...entity.points);
  }
  return points.length ? polygonCentroid(points) : null;
}

function reflectionMapper(axis: GeometryReflectionAxis): (point: Vector2) => Vector2 {
  if (axis === 'x') return point => ({ x: point.x, y: -point.y });
  if (axis === 'y') return point => ({ x: -point.x, y: point.y });
  const direction = normalizeVector(axis.direction);
  if (!direction) {
    throw new KleinSdkError('invalid_transform', 'Reflection axis direction must be non-zero.');
  }
  return point => {
    const vx = point.x - axis.point.x;
    const vy = point.y - axis.point.y;
    const projected = vx * direction.x + vy * direction.y;
    const px = axis.point.x + projected * direction.x;
    const py = axis.point.y + projected * direction.y;
    return { x: 2 * px - point.x, y: 2 * py - point.y };
  };
}

function addDuplicatedPoint(
  point: GeometryPoint2D,
  pointIdMap: Map<string, string>,
  deltas: GeometryCalculatorDelta[],
  ids: ReturnType<typeof createIdFactory>,
  offset: Vector2,
  createdSelection: GeometryCalculatorSelectable[],
  createdIds: string[],
): void {
  if (pointIdMap.has(point.id)) return;
  const next: GeometryPoint2D = {
    ...point,
    id: ids.next('p'),
    x: point.x + offset.x,
    y: point.y + offset.y,
  };
  delete next.construction;
  if (!point.hidden) next.locked = false;
  pointIdMap.set(point.id, next.id);
  deltas.push({ op: 'addPoint', point: next });
  if (!next.hidden) {
    createdSelection.push({ kind: 'point', id: next.id });
    createdIds.push(next.id);
  }
}

function duplicateGeometryEntity(
  entity: GeometryEntity,
  pointIdMap: Map<string, string>,
  ids: ReturnType<typeof createIdFactory>,
  offset: Vector2,
): GeometryEntity | null {
  const id = ids.next(entityIdPrefix(entity.kind));
  switch (entity.kind) {
    case 'segment':
      return duplicatePointIdPairEntity(entity, id, pointIdMap);
    case 'ray':
      return duplicatePointIdPairEntity(entity, id, pointIdMap);
    case 'line': {
      const pointIds = mapTuple2(entity.pointIds, pointIdMap);
      if (!pointIds) return null;
      const next: LineEntity = { ...entity, id, pointIds };
      delete next.construction;
      return next;
    }
    case 'vector':
      return duplicatePointIdPairEntity(entity, id, pointIdMap);
    case 'polygon': {
      const pointIds = entity.pointIds.map(pointId => pointIdMap.get(pointId));
      if (pointIds.some(pointId => !pointId)) return null;
      const next: PolygonEntity = { ...entity, id, pointIds: pointIds as string[] };
      delete next.construction;
      return next;
    }
    case 'circle': {
      const centerId = pointIdMap.get(entity.centerId);
      if (!centerId) return null;
      const next: CircleEntity = { ...entity, id, centerId };
      delete next.construction;
      return next;
    }
    case 'arc': {
      const centerId = pointIdMap.get(entity.centerId);
      const startId = pointIdMap.get(entity.startId);
      const endId = pointIdMap.get(entity.endId);
      if (!centerId || !startId || !endId) return null;
      const next: ArcEntity = { ...entity, id, centerId, startId, endId };
      delete next.construction;
      return next;
    }
    case 'angle': {
      const pointIds = mapTuple3(entity.pointIds, pointIdMap);
      if (!pointIds) return null;
      const next: AngleEntity = { ...entity, id, pointIds };
      delete next.construction;
      return next;
    }
    case 'plane': {
      const pointIds = mapTuple3(entity.pointIds, pointIdMap);
      if (!pointIds) return null;
      const next: PlaneEntity = { ...entity, id, pointIds };
      delete next.construction;
      return next;
    }
    case 'locus': {
      const next: LocusEntity = {
        ...entity,
        id,
        points: entity.points.map(point => ({ x: point.x + offset.x, y: point.y + offset.y })),
      };
      delete next.construction;
      return next;
    }
    case 'conic': {
      const next: ConicEntity = {
        ...entity,
        id,
        points: entity.points.map(point => ({ x: point.x + offset.x, y: point.y + offset.y })),
      };
      if (entity.segments) {
        next.segments = entity.segments.map(segment => segment.map(point => ({ x: point.x + offset.x, y: point.y + offset.y })));
      }
      if (entity.center) next.center = { x: entity.center.x + offset.x, y: entity.center.y + offset.y };
      delete next.construction;
      return next;
    }
    case 'parametricCurve': {
      const next: ParametricCurveEntity = {
        ...entity,
        id,
        points: entity.points.map(point => ({ x: point.x + offset.x, y: point.y + offset.y })),
      };
      delete next.construction;
      return next;
    }
    case 'relationMarker': {
      const next: GeometryRelationMarkerEntity = { ...entity, id };
      delete next.construction;
      return next;
    }
  }
}

function duplicatePointIdPairEntity<T extends SegmentEntity | RayEntity | VectorEntity>(
  entity: T,
  id: string,
  pointIdMap: Map<string, string>,
): T | null {
  const pointIds = mapTuple2(entity.pointIds, pointIdMap);
  if (!pointIds) return null;
  const next = { ...entity, id, pointIds } as T;
  delete next.construction;
  return next;
}

function mapTuple2(pointIds: [string, string], pointIdMap: Map<string, string>): [string, string] | null {
  const first = pointIdMap.get(pointIds[0]);
  const second = pointIdMap.get(pointIds[1]);
  return first && second ? [first, second] : null;
}

function mapTuple3(pointIds: [string, string, string], pointIdMap: Map<string, string>): [string, string, string] | null {
  const first = pointIdMap.get(pointIds[0]);
  const second = pointIdMap.get(pointIds[1]);
  const third = pointIdMap.get(pointIds[2]);
  return first && second && third ? [first, second, third] : null;
}

function geometryDisplayEditChanges<T extends GeometryPoint2D | GeometryEntity>(
  edits: GeometryObjectEditOptions,
): Partial<T> {
  const changes: Partial<T> = {};
  if (edits.label !== undefined) {
    (changes as Partial<GeometryStyleOptions>).label = edits.label.trim();
  }
  if (edits.hidden !== undefined) {
    (changes as Partial<GeometryStyleOptions>).hidden = edits.hidden;
  }
  if (edits.locked !== undefined) {
    (changes as Partial<GeometryStyleOptions>).locked = edits.locked;
  }
  return changes;
}

function entityIdPrefix(kind: GeometryEntity['kind']): string {
  switch (kind) {
    case 'segment':
      return 'seg';
    case 'ray':
      return 'ray';
    case 'line':
      return 'line';
    case 'vector':
      return 'vec';
    case 'polygon':
      return 'poly';
    case 'circle':
      return 'circle';
    case 'arc':
      return 'arc';
    case 'angle':
      return 'angle';
    case 'plane':
      return 'plane';
    case 'locus':
      return 'locus';
    case 'conic':
      return 'conic';
    case 'parametricCurve':
      return 'curve';
    case 'relationMarker':
      return 'marker';
  }
}

function polygonSideCountEditDeltas(
  scene: GeometryCalculatorScene,
  polygonId: string,
  sidesInput: number,
  ids: ReturnType<typeof createIdFactory>,
): GeometryCalculatorDelta[] {
  const entity = scene.entities[polygonId];
  if (entity?.kind !== 'polygon') {
    throw new KleinSdkError('invalid_edit', 'Side count editing needs a polygon.');
  }
  const sides = clamp(Math.round(sidesInput), 3, 64);
  const points = entity.pointIds.map(pointId => point2D(scene, pointId)).filter(isPoint2D);
  const center = points.length ? polygonCentroid(points) : { x: 0, y: 0 };
  const radius = Math.max(
    points.reduce((sum, point) => sum + distance2D(point, center), 0) / Math.max(points.length, 1),
    1,
  );
  const coordinates = regularPolygonCoordinates(center, sides, radius, -Math.PI / 2);
  const pointIds: string[] = [];
  const deltas: GeometryCalculatorDelta[] = [];
  for (let index = 0; index < coordinates.length; index += 1) {
    const coordinate = coordinates[index];
    if (!coordinate) continue;
    const existingId = entity.pointIds[index];
    const existing = existingId ? point2D(scene, existingId) : undefined;
    if (existing && !existing.locked) {
      pointIds.push(existing.id);
      deltas.push({
        op: 'updatePoint',
        id: existing.id,
        changes: { x: coordinate.x, y: coordinate.y, hidden: false },
      });
      continue;
    }
    const point: GeometryPoint2D = {
      id: ids.next('p'),
      kind: 'point2d',
      x: coordinate.x,
      y: coordinate.y,
    };
    if (entity.color) point.color = entity.color;
    pointIds.push(point.id);
    deltas.push({ op: 'addPoint', point });
  }
  for (const extraId of entity.pointIds.slice(sides)) {
    const point = point2D(scene, extraId);
    if (point && !point.locked) deltas.push({ op: 'updatePoint', id: point.id, changes: { hidden: true } });
  }
  deltas.push({ op: 'updateEntity', id: entity.id, changes: { pointIds } });
  return deltas;
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
      selected: selectionAfterDeletedIds(snapshot.appState.selected, deleteSet),
      groups: groupsAfterDeletedIds(snapshot.appState.groups, deleteSet),
    },
  };
}

function previewMoveSelection(
  snapshot: GeometryCalculatorSnapshot,
  drag: Extract<DragState, { kind: 'moveSelection' }>,
  delta: Vector2,
): GeometryCalculatorSnapshot {
  const points = { ...snapshot.scene.points };
  for (const pointId of drag.pointIds) {
    const point = drag.originalPoints[pointId];
    if (point) points[pointId] = { ...point, x: point.x + delta.x, y: point.y + delta.y };
  }
  const entities = { ...snapshot.scene.entities };
  for (const [entityId, pointsBefore] of Object.entries(drag.locusPoints)) {
    const entity = entities[entityId];
    if (entity?.kind === 'locus') {
      entities[entityId] = {
        ...entity,
        points: pointsBefore.map(point => ({ x: point.x + delta.x, y: point.y + delta.y })),
      };
    } else if (entity?.kind === 'conic') {
      const next: ConicEntity = {
        ...entity,
        points: pointsBefore.map(point => ({ x: point.x + delta.x, y: point.y + delta.y })),
      };
      if (entity.segments) {
        next.segments = entity.segments.map(segment => segment.map(point => ({ x: point.x + delta.x, y: point.y + delta.y })));
      }
      if (entity.center) next.center = { x: entity.center.x + delta.x, y: entity.center.y + delta.y };
      entities[entityId] = next;
    } else if (entity?.kind === 'parametricCurve') {
      entities[entityId] = {
        ...entity,
        points: pointsBefore.map(point => ({ x: point.x + delta.x, y: point.y + delta.y })),
      };
    }
  }
  return {
    ...snapshot,
    scene: constrainGeometryScene(
      recomputeGeometryScene({ ...snapshot.scene, points, entities }),
      [...drag.pointIds, ...Object.keys(drag.locusPoints)],
    ),
  };
}

function moveSelectionCommitDeltas(
  moved: GeometryCalculatorSnapshot,
  drag: Extract<DragState, { kind: 'moveSelection' }>,
): GeometryCalculatorDelta[] {
  return geometrySceneUpdateDeltas(drag.startSnapshot.scene, moved.scene);
}

function worldRectFromPoints(a: Vector2, b: Vector2): WorldBounds {
  return {
    minX: Math.min(a.x, b.x),
    maxX: Math.max(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxY: Math.max(a.y, b.y),
  };
}

function selectionItemsInWorldRect(scene: GeometryCalculatorScene, rect: WorldBounds): GeometryCalculatorSelectable[] {
  const items: GeometryCalculatorSelectable[] = [];
  for (const point of Object.values(scene.points)) {
    if (point.kind === 'point2d' && !point.hidden && rectContainsPoint(rect, point)) {
      items.push({ kind: 'point', id: point.id });
    }
  }
  for (const entity of orderedEntities(scene)) {
    if (!entity.hidden && entityIntersectsRect(scene, entity, rect)) {
      items.push({ kind: 'entity', id: entity.id });
    }
  }
  return items;
}

function entityIntersectsRect(scene: GeometryCalculatorScene, entity: GeometryEntity, rect: WorldBounds): boolean {
  switch (entity.kind) {
    case 'segment':
    case 'vector': {
      const a = point2D(scene, entity.pointIds[0]);
      const b = point2D(scene, entity.pointIds[1]);
      return Boolean(a && b && segmentIntersectsRect(a, b, rect));
    }
    case 'ray': {
      const a = point2D(scene, entity.pointIds[0]);
      const b = point2D(scene, entity.pointIds[1]);
      if (!a || !b) return false;
      return Boolean(clipRayToBounds(a, b, rect));
    }
    case 'line': {
      const equation = entity.equation ?? lineEquationFromEntityPoints(scene, entity);
      return Boolean(equation && clipLineToBounds(equation, rect));
    }
    case 'polygon': {
      const points = entity.pointIds.map(id => point2D(scene, id)).filter(isPoint2D);
      if (points.some(point => rectContainsPoint(rect, point))) return true;
      const center = {
        x: (rect.minX + rect.maxX) / 2,
        y: (rect.minY + rect.maxY) / 2,
      };
      if (pointInPolygon(center, points)) return true;
      return points.some((point, index) => {
        const next = points[(index + 1) % points.length];
        return Boolean(next && segmentIntersectsRect(point, next, rect));
      });
    }
    case 'circle': {
      const center = point2D(scene, entity.centerId);
      if (!center) return false;
      if (rectContainsPoint(rect, center)) return true;
      const closest = {
        x: clamp(center.x, rect.minX, rect.maxX),
        y: clamp(center.y, rect.minY, rect.maxY),
      };
      return distance2D(center, closest) <= entity.radius;
    }
    case 'arc':
    case 'angle':
    case 'plane':
      return geometryEntityPointIds(entity).some(pointId => {
        const point = point2D(scene, pointId);
        return Boolean(point && rectContainsPoint(rect, point));
      });
    case 'locus':
      return entity.points.some(point => rectContainsPoint(rect, point))
        || entity.points.some((point, index) => {
          const next = entity.points[index + 1] ?? (entity.closed ? entity.points[0] : undefined);
          return Boolean(next && segmentIntersectsRect(point, next, rect));
        });
    case 'conic':
    case 'parametricCurve':
      return sampledCurveSegments(entity).some(segment => segment.some(point => rectContainsPoint(rect, point))
        || segment.some((point, index) => {
          const next = segment[index + 1] ?? (entity.closed ? segment[0] : undefined);
          return Boolean(next && segmentIntersectsRect(point, next, rect));
        }));
    case 'relationMarker': {
      const anchor = relationMarkerAnchor(scene, entity);
      return Boolean(anchor && rectContainsPoint(rect, anchor));
    }
  }
}

function rectContainsPoint(rect: WorldBounds, point: Vector2): boolean {
  return point.x >= rect.minX && point.x <= rect.maxX && point.y >= rect.minY && point.y <= rect.maxY;
}

function segmentIntersectsRect(a: Vector2, b: Vector2, rect: WorldBounds): boolean {
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

function constrainGeometryScene(
  scene: GeometryCalculatorScene,
  changedIds: Iterable<string>,
): GeometryCalculatorScene {
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

function enforceGeometryConstraint(
  scene: GeometryCalculatorScene,
  constraint: GeometryConstraint,
  changedSet: Set<string>,
): GeometryCalculatorScene {
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

function enforceFixedLengthConstraint(
  scene: GeometryCalculatorScene,
  pointIds: [string, string],
  length: number,
  changedSet: Set<string>,
): GeometryCalculatorScene {
  return adjustSegmentLength(scene, pointIds, length, changedSet);
}

function enforceEqualLengthConstraint(
  scene: GeometryCalculatorScene,
  segments: [[string, string], [string, string]],
  changedSet: Set<string>,
): GeometryCalculatorScene {
  const [firstIds, secondIds] = segments;
  const firstLength = segmentLength(scene, firstIds);
  const secondLength = segmentLength(scene, secondIds);
  if (!Number.isFinite(firstLength) || !Number.isFinite(secondLength) || firstLength <= 0 || secondLength <= 0) {
    return scene;
  }
  const firstChanged = idsIntersect(firstIds, changedSet);
  const secondChanged = idsIntersect(secondIds, changedSet);
  if (firstChanged && !secondChanged) return adjustSegmentLength(scene, firstIds, secondLength, changedSet);
  return adjustSegmentLength(scene, secondIds, firstLength, changedSet);
}

function enforceFixedAngleConstraint(
  scene: GeometryCalculatorScene,
  pointIds: [string, string, string],
  degrees: number,
  changedSet: Set<string>,
): GeometryCalculatorScene {
  const [firstId, vertexId, secondId] = pointIds;
  const first = point2D(scene, firstId);
  const vertex = point2D(scene, vertexId);
  const second = point2D(scene, secondId);
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
    return setPointOnAngle(scene, {
      moveId: secondId,
      anchor: vertex,
      base: first,
      current: second,
      degrees,
    });
  }
  if (firstEditable) {
    return setPointOnAngle(scene, {
      moveId: firstId,
      anchor: vertex,
      base: second,
      current: first,
      degrees,
    });
  }
  return scene;
}

function enforceDirectionConstraint(
  scene: GeometryCalculatorScene,
  entityIds: [string, string],
  changedSet: Set<string>,
  perpendicular: boolean,
): GeometryCalculatorScene {
  const firstIds = lineConstraintPointIds(scene, entityIds[0]);
  const secondIds = lineConstraintPointIds(scene, entityIds[1]);
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

function enforceEqualRadiusConstraint(
  scene: GeometryCalculatorScene,
  circleIds: [string, string],
  changedSet: Set<string>,
): GeometryCalculatorScene {
  const first = scene.entities[circleIds[0]];
  const second = scene.entities[circleIds[1]];
  if (first?.kind !== 'circle' || second?.kind !== 'circle') return scene;
  if (!Number.isFinite(first.radius) || !Number.isFinite(second.radius) || first.radius <= 0 || second.radius <= 0) {
    return scene;
  }

  const firstChanged = idsIntersect([circleIds[0], ...circleConstraintPointIds(first)], changedSet);
  const secondChanged = idsIntersect([circleIds[1], ...circleConstraintPointIds(second)], changedSet);
  if (firstChanged && !secondChanged) return setCircleRadius(scene, first.id, second.radius);
  return setCircleRadius(scene, second.id, first.radius);
}

function adjustSegmentLength(
  scene: GeometryCalculatorScene,
  pointIds: [string, string],
  length: number,
  changedSet: Set<string>,
): GeometryCalculatorScene {
  if (!Number.isFinite(length) || length <= 0) return scene;
  const moveId = chooseEditablePointToMove(scene, pointIds, changedSet);
  if (!moveId) return scene;
  const anchorId = pointIds[0] === moveId ? pointIds[1] : pointIds[0];
  const move = point2D(scene, moveId);
  const anchor = point2D(scene, anchorId);
  if (!move || !anchor) return scene;
  const direction = normalizeVector({ x: move.x - anchor.x, y: move.y - anchor.y }) ?? { x: 1, y: 0 };
  return setPointPosition(scene, moveId, {
    x: anchor.x + direction.x * length,
    y: anchor.y + direction.y * length,
  });
}

function adjustLineDirection(
  scene: GeometryCalculatorScene,
  pointIds: [string, string],
  direction: Vector2,
  changedSet: Set<string>,
): GeometryCalculatorScene {
  const normalized = normalizeVector(direction);
  if (!normalized) return scene;
  const moveId = chooseEditablePointToMove(scene, pointIds, changedSet);
  if (!moveId) return scene;
  const anchorId = pointIds[0] === moveId ? pointIds[1] : pointIds[0];
  const move = point2D(scene, moveId);
  const anchor = point2D(scene, anchorId);
  if (!move || !anchor) return scene;
  const length = Math.max(distance2D(move, anchor), 1);
  const currentDirection = normalizeVector({ x: move.x - anchor.x, y: move.y - anchor.y });
  const sign = currentDirection && dot(currentDirection, normalized) < 0 ? -1 : 1;
  return setPointPosition(scene, moveId, {
    x: anchor.x + normalized.x * sign * length,
    y: anchor.y + normalized.y * sign * length,
  });
}

function setPointOnAngle(
  scene: GeometryCalculatorScene,
  options: {
    moveId: string;
    anchor: Vector2;
    base: Vector2;
    current: Vector2;
    degrees: number;
  },
): GeometryCalculatorScene {
  const baseDirection = normalizeVector({
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
  return setPointPosition(scene, options.moveId, {
    x: options.anchor.x + Math.cos(angle) * radius,
    y: options.anchor.y + Math.sin(angle) * radius,
  });
}

function setCircleRadius(
  scene: GeometryCalculatorScene,
  circleId: string,
  radius: number,
): GeometryCalculatorScene {
  if (!Number.isFinite(radius) || radius <= 0) return scene;
  const circle = scene.entities[circleId];
  if (circle?.kind !== 'circle' || circle.locked) return scene;

  if (circle.construction?.kind === 'circleCenterPoint') {
    const center = point2D(scene, circle.construction.centerPointId);
    const radiusPoint = point2D(scene, circle.construction.radiusPointId);
    if (!center || !radiusPoint || radiusPoint.locked) return scene;
    const direction = normalizeVector({ x: radiusPoint.x - center.x, y: radiusPoint.y - center.y }) ?? { x: 1, y: 0 };
    return setPointPosition(scene, radiusPoint.id, {
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

function setPointPosition(
  scene: GeometryCalculatorScene,
  pointId: string,
  position: Vector2,
): GeometryCalculatorScene {
  const point = point2D(scene, pointId);
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

function chooseEditablePointToMove(
  scene: GeometryCalculatorScene,
  pointIds: [string, string],
  changedSet: Set<string>,
): string | null {
  const changed = pointIds.filter(pointId => changedSet.has(pointId) && isEditablePoint(scene, pointId));
  if (changed.length > 0) return changed[changed.length - 1] ?? null;
  if (isEditablePoint(scene, pointIds[1])) return pointIds[1];
  if (isEditablePoint(scene, pointIds[0])) return pointIds[0];
  return null;
}

function isEditablePoint(scene: GeometryCalculatorScene, pointId: string): boolean {
  const point = point2D(scene, pointId);
  return Boolean(point && !point.locked);
}

function lineConstraintPointIds(scene: GeometryCalculatorScene, entityId: string): [string, string] | null {
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

function segmentLength(scene: GeometryCalculatorScene, pointIds: [string, string]): number {
  const first = point2D(scene, pointIds[0]);
  const second = point2D(scene, pointIds[1]);
  return first && second ? distance2D(first, second) : NaN;
}

function segmentDirection(scene: GeometryCalculatorScene, pointIds: [string, string]): Vector2 | null {
  const first = point2D(scene, pointIds[0]);
  const second = point2D(scene, pointIds[1]);
  return first && second ? normalizeVector({ x: second.x - first.x, y: second.y - first.y }) : null;
}

function circleConstraintPointIds(circle: CircleEntity): string[] {
  const ids = [circle.centerId];
  if (circle.construction?.kind === 'circleCenterPoint') ids.push(circle.construction.radiusPointId);
  if (circle.construction?.kind === 'circleThroughPoints') ids.push(...circle.construction.pointIds);
  return ids;
}

function idsIntersect(ids: Iterable<string>, changedSet: Set<string>): boolean {
  for (const id of ids) {
    if (changedSet.has(id)) return true;
  }
  return false;
}

function changedIdsFromDeltas(deltas: GeometryCalculatorDelta[]): string[] {
  const ids = new Set<string>();
  for (const delta of deltas) {
    if (delta.op === 'batch') {
      for (const id of changedIdsFromDeltas(delta.deltas)) ids.add(id);
    } else if ('id' in delta && typeof delta.id === 'string') {
      ids.add(delta.id);
    }
  }
  return [...ids];
}

function geometrySceneUpdateDeltas(
  before: GeometryCalculatorScene,
  after: GeometryCalculatorScene,
): GeometryCalculatorDelta[] {
  const deltas: GeometryCalculatorDelta[] = [];
  for (const [id, next] of Object.entries(after.points)) {
    const previous = before.points[id];
    if (previous?.kind !== 'point2d' || next.kind !== 'point2d') continue;
    if (Math.abs(previous.x - next.x) <= 1e-9 && Math.abs(previous.y - next.y) <= 1e-9) continue;
    deltas.push({ op: 'updatePoint', id, changes: { x: next.x, y: next.y } });
  }
  for (const [id, next] of Object.entries(after.entities)) {
    const previous = before.entities[id];
    if (!previous || JSON.stringify(previous) === JSON.stringify(next)) continue;
    deltas.push({ op: 'updateEntity', id, changes: { ...next } as Partial<GeometryEntity> });
  }
  return deltas;
}

function dot(first: Vector2, second: Vector2): number {
  return first.x * second.x + first.y * second.y;
}

function angularDistance(first: number, second: number): number {
  return Math.abs(normalizeAngleDelta(first - second));
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
    font: `600 12px/1 ${KLEIN_UI_FONT_STACK}`,
  };
}

function emptyStateStyle(): Partial<CSSStyleDeclaration> {
  return {
    padding: '10px',
    border: '1px dashed var(--kgc-border)',
    borderRadius: '6px',
    color: 'var(--kgc-muted-text)',
    fontSize: '12px',
    lineHeight: '1.35',
  };
}

function geometryObjectFilters(): Array<{ id: string; label: string }> {
  return [
    { id: 'point', label: 'Points' },
    { id: 'segment', label: 'Segments' },
    { id: 'line', label: 'Lines' },
    { id: 'ray', label: 'Rays' },
    { id: 'vector', label: 'Vectors' },
    { id: 'polygon', label: 'Polygons' },
    { id: 'circle', label: 'Circles' },
    { id: 'arc', label: 'Arcs' },
    { id: 'angle', label: 'Angles' },
    { id: 'curve', label: 'Curves' },
    { id: 'relationMarker', label: 'Markers' },
  ];
}

function toolPreviewText(tool: GeometryCalculatorTool): string {
  if (tool === 'point' || tool === 'midpoint' || tool === 'intersect') return 'A . B';
  if (tool === 'segment') return 'A --- B';
  if (tool === 'line' || tool === 'parallel' || tool === 'perpendicular' || tool === 'tangent') return '<--- line --->';
  if (tool === 'ray') return 'A --->';
  if (tool === 'vector') return 'A ==> B';
  if (tool === 'polygon' || tool === 'triangle' || tool === 'rectangle' || tool === 'square' || tool === 'regularPolygon') return '/\\ shape';
  if (tool === 'circle' || tool === 'circleThroughPoints' || tool === 'arc') return '( circle )';
  if (tool === 'angle' || tool === 'angleBisector') return '< angle';
  if (tool === 'conic' || tool === 'parametricCurve') return 'curve(t)';
  if (tool === 'remove') return 'delete x';
  if (tool === 'pan') return 'move view';
  return 'select';
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

function geometryThemeFromPalette(input: KleinToolThemeInput | undefined): Partial<GeometryCalculatorTheme> | undefined {
  if (input === undefined) return undefined;
  const palette = resolveKleinToolTheme(input);
  return {
    name: palette.name,
    colorScheme: palette.colorScheme,
    background: palette.background,
    surface: palette.background,
    surfaceRaised: palette.surfaceRaised,
    canvas: palette.canvas,
    border: palette.border,
    text: palette.text,
    mutedText: palette.mutedText,
    faintText: palette.faintText,
    inputBackground: palette.surface,
    buttonBackground: palette.surfaceRaised,
    buttonText: palette.text,
    buttonBorder: palette.border,
    buttonActiveBackground: palette.primary,
    buttonActiveText: palette.primaryForeground,
    accent: palette.primary,
    drawColor: palette.accent,
    pointColor: palette.text,
    fill: palette.accentSoft,
    selection: palette.primary,
    gridMinor: palette.gridMinor,
    gridMajor: palette.gridMajor,
    axis: palette.axis,
    gridLabel: palette.mutedText,
    draft: palette.accent,
    textHalo: palette.colorScheme === 'dark' ? 'rgba(37,43,49,0.92)' : 'rgba(255,255,255,0.92)',
    angle: palette.primary,
    angleText: palette.primary,
  };
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

function parseCenterRadiusCircleEquation(normalized: string, raw: string): GeometryCircleEquation | null {
  const match = normalized.match(/^\(?x(?<x>[+-](?:\d+(?:\.\d+)?|\.\d+))?\)?\^2\+\(?y(?<y>[+-](?:\d+(?:\.\d+)?|\.\d+))?\)?\^2=(?<rhs>.+)$/);
  if (!match?.groups) return null;
  const xOffset = match.groups.x ? parseScalar(match.groups.x) : 0;
  const yOffset = match.groups.y ? parseScalar(match.groups.y) : 0;
  return normalizeCircleEquation({
    center: { x: -xOffset, y: -yOffset },
    radius: parseCircleRadiusInput(match.groups.rhs ?? ''),
    input: raw,
  });
}

function parseCircleRadiusInput(input: string): number {
  const squared = input.match(/^(?<base>[+-]?(?:\d+(?:\.\d+)?|\.\d+))\^2$/);
  if (squared?.groups?.base) return Math.abs(parseScalar(squared.groups.base));
  const value = parseScalar(input);
  if (value <= 0) {
    throw new KleinSdkError('invalid_circle_equation', 'Circle radius squared must be positive.');
  }
  return Math.sqrt(value);
}

function parseCirclePolynomial(input: string, sign: 1 | -1): CirclePolynomial {
  const compact = input.replace(/\*/g, '');
  const terms = compact.match(/[+-]?[^+-]+/g);
  if (!terms?.length) {
    throw new KleinSdkError('invalid_circle_equation', `Invalid expression: ${input}`);
  }
  const result: CirclePolynomial = { x2: 0, y2: 0, x: 0, y: 0, c: 0 };
  for (const term of terms) {
    const termSign = (term.startsWith('-') ? -1 : 1) * sign;
    const unsigned = term.replace(/^[+-]/, '');
    if (!unsigned) continue;
    if (unsigned.includes('xy')) {
      throw new KleinSdkError('invalid_circle_equation', `Unsupported circle term: ${term}`);
    }
    if (unsigned.endsWith('x^2')) {
      result.x2 += termSign * parsePowerCoefficient(unsigned, 'x');
    } else if (unsigned.endsWith('y^2')) {
      result.y2 += termSign * parsePowerCoefficient(unsigned, 'y');
    } else if (unsigned.endsWith('x')) {
      result.x += termSign * parseCoefficient(unsigned, 'x');
    } else if (unsigned.endsWith('y')) {
      result.y += termSign * parseCoefficient(unsigned, 'y');
    } else {
      result.c += termSign * parseScalar(unsigned);
    }
  }
  return result;
}

function parsePowerCoefficient(term: string, variable: 'x' | 'y'): number {
  const suffix = `${variable}^2`;
  if (!term.endsWith(suffix)) {
    throw new KleinSdkError('invalid_circle_equation', `Invalid quadratic term: ${term}`);
  }
  const coefficient = term.slice(0, -suffix.length);
  return coefficient ? parseScalar(coefficient) : 1;
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

type ScalarEvaluator = (t: number) => number;

interface ExpressionToken {
  type: 'number' | 'identifier' | 'operator' | 'paren' | 'comma';
  value: string;
}

function compileScalarExpression(input: string): ScalarEvaluator {
  const tokens = tokenizeScalarExpression(input);
  let index = 0;

  const peek = (): ExpressionToken | undefined => tokens[index];
  const consume = (): ExpressionToken | undefined => tokens[index++];
  const match = (value: string): boolean => {
    if (peek()?.value !== value) return false;
    index += 1;
    return true;
  };

  const parseExpression = (): ScalarEvaluator => {
    let left = parseTerm();
    while (peek()?.value === '+' || peek()?.value === '-') {
      const operator = consume()?.value;
      const right = parseTerm();
      const previous = left;
      left = operator === '+'
        ? t => previous(t) + right(t)
        : t => previous(t) - right(t);
    }
    return left;
  };

  const parseTerm = (): ScalarEvaluator => {
    let left = parsePower();
    while (peek()?.value === '*' || peek()?.value === '/') {
      const operator = consume()?.value;
      const right = parsePower();
      const previous = left;
      left = operator === '*'
        ? t => previous(t) * right(t)
        : t => previous(t) / right(t);
    }
    return left;
  };

  const parsePower = (): ScalarEvaluator => {
    const left = parseUnary();
    if (!match('^')) return left;
    const right = parsePower();
    return t => Math.pow(left(t), right(t));
  };

  const parseUnary = (): ScalarEvaluator => {
    if (match('+')) return parseUnary();
    if (match('-')) {
      const value = parseUnary();
      return t => -value(t);
    }
    return parsePrimary();
  };

  const parsePrimary = (): ScalarEvaluator => {
    const token = consume();
    if (!token) {
      throw new KleinSdkError('invalid_expression', `Invalid expression: ${input}`);
    }
    if (token.type === 'number') {
      const value = Number(token.value);
      return () => value;
    }
    if (token.value === '(') {
      const expression = parseExpression();
      if (!match(')')) {
        throw new KleinSdkError('invalid_expression', `Missing ")" in expression: ${input}`);
      }
      return expression;
    }
    if (token.type === 'identifier') {
      const name = token.value.toLowerCase();
      if (match('(')) {
        const args: ScalarEvaluator[] = [];
        if (!match(')')) {
          do {
            args.push(parseExpression());
          } while (match(','));
          if (!match(')')) {
            throw new KleinSdkError('invalid_expression', `Missing ")" in function call: ${input}`);
          }
        }
        return t => evaluateScalarFunction(name, args.map(arg => arg(t)));
      }
      if (name === 't') return t => t;
      if (name === 'pi') return () => Math.PI;
      if (name === 'e') return () => Math.E;
      throw new KleinSdkError('invalid_expression', `Unknown symbol: ${token.value}`);
    }
    throw new KleinSdkError('invalid_expression', `Unexpected token: ${token.value}`);
  };

  const evaluator = parseExpression();
  if (index < tokens.length) {
    throw new KleinSdkError('invalid_expression', `Unexpected token: ${tokens[index]?.value}`);
  }
  return evaluator;
}

function tokenizeScalarExpression(input: string): ExpressionToken[] {
  const tokens: ExpressionToken[] = [];
  let index = 0;
  const source = input.replace(/\u2212/g, '-').replace(/\*\*/g, '^');
  while (index < source.length) {
    const char = source[index];
    if (!char) break;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && /[0-9.eE+-]/.test(source[index] ?? '')) {
        const current = source[index] ?? '';
        const previous = source[index - 1] ?? '';
        if ((current === '+' || current === '-') && previous.toLowerCase() !== 'e') break;
        index += 1;
      }
      const value = source.slice(start, index);
      if (!Number.isFinite(Number(value))) {
        throw new KleinSdkError('invalid_expression', `Invalid number: ${value}`);
      }
      tokens.push({ type: 'number', value });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index] ?? '')) index += 1;
      tokens.push({ type: 'identifier', value: source.slice(start, index) });
      continue;
    }
    if ('+-*/^'.includes(char)) {
      tokens.push({ type: 'operator', value: char });
      index += 1;
      continue;
    }
    if (char === '(' || char === ')') {
      tokens.push({ type: 'paren', value: char });
      index += 1;
      continue;
    }
    if (char === ',') {
      tokens.push({ type: 'comma', value: char });
      index += 1;
      continue;
    }
    throw new KleinSdkError('invalid_expression', `Unsupported character: ${char}`);
  }
  return tokens;
}

function evaluateScalarFunction(name: string, args: number[]): number {
  const unary = (fn: (value: number) => number): number => {
    if (args.length !== 1) throw new KleinSdkError('invalid_expression', `${name} expects one argument.`);
    return fn(args[0] as number);
  };
  switch (name) {
    case 'sin':
      return unary(Math.sin);
    case 'cos':
      return unary(Math.cos);
    case 'tan':
      return unary(Math.tan);
    case 'asin':
      return unary(Math.asin);
    case 'acos':
      return unary(Math.acos);
    case 'atan':
      return unary(Math.atan);
    case 'sqrt':
      return unary(Math.sqrt);
    case 'abs':
      return unary(Math.abs);
    case 'log':
    case 'ln':
      return unary(Math.log);
    case 'exp':
      return unary(Math.exp);
    case 'floor':
      return unary(Math.floor);
    case 'ceil':
      return unary(Math.ceil);
    case 'round':
      return unary(Math.round);
    case 'min':
      if (args.length < 1) throw new KleinSdkError('invalid_expression', 'min expects at least one argument.');
      return Math.min(...args);
    case 'max':
      if (args.length < 1) throw new KleinSdkError('invalid_expression', 'max expects at least one argument.');
      return Math.max(...args);
    case 'pow':
      if (args.length !== 2) throw new KleinSdkError('invalid_expression', 'pow expects two arguments.');
      return Math.pow(args[0] as number, args[1] as number);
    default:
      throw new KleinSdkError('invalid_expression', `Unsupported function: ${name}`);
  }
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
): SnapResult {
  const excluded = new Set(options.excludePointIds ?? []);
  const tolerance = options.toleranceWorld * clamp(options.settings.strength, 0.1, 3);
  const candidates: SnapCandidate[] = [];
  const modes = options.settings.modes;

  if (modes.points) {
    for (const point of Object.values(scene.points)) {
      if (point.kind !== 'point2d' || point.hidden || excluded.has(point.id)) continue;
      candidates.push({ point, kind: 'points', label: point.label ?? point.id });
    }
  }

  if (modes.midpoints || modes.intersections || modes.shapeEdges) {
    candidates.push(...candidateSnapPoints(scene, modes, world));
  }

  if (modes.axes) {
    candidates.push({ point: { x: 0, y: world.y }, kind: 'axes', label: 'y-axis' });
    candidates.push({ point: { x: world.x, y: 0 }, kind: 'axes', label: 'x-axis' });
  }

  if (modes.angles) {
    const radius = Math.hypot(world.x, world.y);
    if (radius > 1e-9) {
      const increment = Math.PI / 12;
      const angle = Math.round(Math.atan2(world.y, world.x) / increment) * increment;
      candidates.push({
        point: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
        kind: 'angles',
        label: `${Math.round((angle * 180) / Math.PI)} deg`,
      });
    }
  }

  if (modes.grid) {
    const point = {
      x: Math.round(world.x / options.gridStep) * options.gridStep,
      y: Math.round(world.y / options.gridStep) * options.gridStep,
    };
    candidates.push({
      point,
      kind: 'grid',
      label: `${formatGridLabel(point.x)}, ${formatGridLabel(point.y)}`,
    });
  }

  let best: SnapMarker | null = null;
  for (const candidate of candidates) {
    const distanceWorld = distance2D(world, candidate.point);
    if (distanceWorld <= tolerance && (!best || distanceWorld < best.distanceWorld)) {
      best = { ...candidate, distanceWorld };
    }
  }

  return best
    ? { point: { x: best.point.x, y: best.point.y }, marker: best }
    : { point: world, marker: null };
}

function candidateSnapPoints(
  scene: GeometryCalculatorScene,
  modes: GeometrySnapModes,
  world: Vector2,
): SnapCandidate[] {
  const candidates: SnapCandidate[] = [];
  const segments = lineSegmentsForSnap(scene);
  if (modes.midpoints) {
    for (const segment of segments) {
      candidates.push({ point: midpoint2D(segment.a, segment.b), kind: 'midpoints', label: 'midpoint' });
    }
  }
  if (modes.intersections) {
    const lineLikeIds = lineLikeEntityIdsForSnap(scene);
    for (let i = 0; i < lineLikeIds.length; i += 1) {
      for (let j = i + 1; j < lineLikeIds.length; j += 1) {
        const firstId = lineLikeIds[i];
        const secondId = lineLikeIds[j];
        if (!firstId || !secondId) continue;
        const hits = geometryIntersectionPoints2D(scene, firstId, secondId);
        for (const hit of hits) {
          candidates.push({ point: hit, kind: 'intersections', label: 'intersection' });
        }
      }
    }
    for (let i = 0; i < segments.length; i += 1) {
      for (let j = i + 1; j < segments.length; j += 1) {
        const first = segments[i];
        const second = segments[j];
        if (!first || !second) continue;
        const hit = segmentIntersection(first.a, first.b, second.a, second.b);
        if (hit) candidates.push({ point: hit, kind: 'intersections', label: 'intersection' });
      }
    }
  }
  if (modes.shapeEdges) {
    for (const point of nearestShapeEdgePoints(scene, world)) {
      candidates.push({ point, kind: 'shapeEdges', label: 'edge' });
    }
  }
  return candidates;
}

function lineLikeEntityIdsForSnap(scene: GeometryCalculatorScene): string[] {
  return orderedEntities(scene)
    .filter(entity => !entity.hidden && (
      entity.kind === 'line'
      || entity.kind === 'ray'
      || entity.kind === 'segment'
      || entity.kind === 'vector'
    ))
    .map(entity => entity.id);
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

function nearestShapeEdgePoints(scene: GeometryCalculatorScene, world: Vector2): Vector2[] {
  const candidates: Vector2[] = [];
  for (const entity of Object.values(scene.entities)) {
    if (entity.hidden) continue;
    if (entity.kind === 'segment' || entity.kind === 'vector') {
      const a = point2D(scene, entity.pointIds[0]);
      const b = point2D(scene, entity.pointIds[1]);
      if (a && b) candidates.push(nearestPointOnSegment(world, a, b));
    } else if (entity.kind === 'ray') {
      const a = point2D(scene, entity.pointIds[0]);
      const b = point2D(scene, entity.pointIds[1]);
      if (a && b) candidates.push(nearestPointOnRay(world, a, b));
    } else if (entity.kind === 'line') {
      const equation = entity.equation ?? lineEquationFromEntityPoints(scene, entity);
      if (equation) candidates.push(projectPointToLineEquation(world, equation));
    } else if (entity.kind === 'polygon') {
      const points = entity.pointIds.map(id => point2D(scene, id)).filter(isPoint2D);
      for (let index = 0; index < points.length; index += 1) {
        const current = points[index];
        const next = points[(index + 1) % points.length];
        if (current && next) candidates.push(nearestPointOnSegment(world, current, next));
      }
    } else if (entity.kind === 'circle') {
      const center = point2D(scene, entity.centerId);
      if (center && entity.radius > 0) {
        const direction = normalizeVector({ x: world.x - center.x, y: world.y - center.y }) ?? { x: 1, y: 0 };
        candidates.push({ x: center.x + direction.x * entity.radius, y: center.y + direction.y * entity.radius });
      }
    } else if (entity.kind === 'locus') {
      for (let index = 0; index < entity.points.length - 1; index += 1) {
        const current = entity.points[index];
        const next = entity.points[index + 1];
        if (current && next) candidates.push(nearestPointOnSegment(world, current, next));
      }
      if (entity.closed) {
        const first = entity.points[0];
        const last = entity.points[entity.points.length - 1];
        if (first && last) candidates.push(nearestPointOnSegment(world, last, first));
      }
    } else if (entity.kind === 'conic' || entity.kind === 'parametricCurve') {
      for (const segment of sampledCurveSegments(entity)) {
        for (let index = 0; index < segment.length - 1; index += 1) {
          const current = segment[index];
          const next = segment[index + 1];
          if (current && next) candidates.push(nearestPointOnSegment(world, current, next));
        }
        if (entity.closed) {
          const first = segment[0];
          const last = segment[segment.length - 1];
          if (first && last) candidates.push(nearestPointOnSegment(world, last, first));
        }
      }
    }
  }
  return candidates;
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
    case 'conic':
    case 'parametricCurve':
      return distanceToSampledCurve(world, entity);
    case 'relationMarker': {
      const anchor = relationMarkerAnchor(scene, entity);
      return anchor ? distance2D(world, anchor) : Infinity;
    }
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

function distanceToSampledCurve(point: Vector2, entity: ConicEntity | ParametricCurveEntity): number {
  let best = Infinity;
  for (const segment of sampledCurveSegments(entity)) {
    for (let index = 0; index < segment.length - 1; index += 1) {
      const current = segment[index];
      const next = segment[index + 1];
      if (!current || !next) continue;
      best = Math.min(best, distanceToSegment(point, current, next));
    }
    if (entity.closed) {
      const first = segment[0];
      const last = segment[segment.length - 1];
      if (first && last) {
        best = Math.min(best, distanceToSegment(point, last, first));
        if (pointInPolygon(point, segment)) best = Math.min(best, 0.05);
      }
    }
  }
  return best;
}

function sampledCurveSegments(entity: ConicEntity | ParametricCurveEntity): Vector2[][] {
  if (entity.kind === 'conic' && entity.segments?.length) return entity.segments;
  return entity.points.length >= 2 ? [entity.points] : [];
}

function isSampledCurveEntity(entity: GeometryEntity | undefined): entity is LocusEntity | ConicEntity | ParametricCurveEntity {
  return entity?.kind === 'locus' || entity?.kind === 'conic' || entity?.kind === 'parametricCurve';
}

function relationMarkerAnchor(
  scene: GeometryCalculatorScene,
  marker: GeometryRelationMarkerEntity,
): Vector2 | null {
  const points = relationMarkerTargetPoints(scene, marker);
  return points.length ? polygonCentroid(points) : null;
}

function relationMarkerTargetPoints(scene: GeometryCalculatorScene, marker: GeometryRelationMarkerEntity): Vector2[] {
  const points: Vector2[] = [];
  for (const targetId of marker.targetIds) {
    const point = point2D(scene, targetId);
    if (point) {
      points.push(point);
      continue;
    }
    const entity = scene.entities[targetId];
    if (!entity) continue;
    points.push(...entityAnchorPoints(scene, entity));
  }
  return points;
}

function entityAnchorPoints(scene: GeometryCalculatorScene, entity: GeometryEntity): Vector2[] {
  switch (entity.kind) {
    case 'segment':
    case 'ray':
    case 'line':
    case 'vector':
    case 'polygon':
    case 'angle':
    case 'plane':
      return geometryEntityPointIds(entity).map(id => point2D(scene, id)).filter(isPoint2D);
    case 'circle': {
      const center = point2D(scene, entity.centerId);
      return center ? [center] : [];
    }
    case 'arc':
      return [entity.centerId, entity.startId, entity.endId].map(id => point2D(scene, id)).filter(isPoint2D);
    case 'locus':
    case 'parametricCurve':
      return entity.points;
    case 'conic':
      return entity.center ? [entity.center] : entity.points;
    case 'relationMarker':
      return relationMarkerTargetPoints(scene, entity);
  }
}

function relationMarkerLabel(kind: GeometryRelationMarkerKind): string {
  switch (kind) {
    case 'congruence':
      return 'congruent';
    case 'similarity':
      return 'similar';
    case 'cyclicQuadrilateral':
      return 'cyclic';
    case 'triangleType':
      return 'triangle';
  }
}

function distanceToSegment(point: Vector2, a: Vector2, b: Vector2): number {
  return distance2D(point, nearestPointOnSegment(point, a, b));
}

function nearestPointOnSegment(point: Vector2, a: Vector2, b: Vector2): Vector2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-12) return a;
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1);
  return { x: a.x + dx * t, y: a.y + dy * t };
}

function distanceToRay(point: Vector2, a: Vector2, b: Vector2): number {
  return distance2D(point, nearestPointOnRay(point, a, b));
}

function nearestPointOnRay(point: Vector2, a: Vector2, b: Vector2): Vector2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-12) return a;
  const t = Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared);
  return { x: a.x + dx * t, y: a.y + dy * t };
}

function projectPointToLineEquation(point: Vector2, equation: GeometryLineEquation): Vector2 {
  const distance = equation.a * point.x + equation.b * point.y + equation.c;
  return {
    x: point.x - equation.a * distance,
    y: point.y - equation.b * distance,
  };
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

function classifyTriangle(scene: GeometryCalculatorScene, polygon: PolygonEntity): GeometryTriangleClassification {
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

function isCyclicQuadrilateral(
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

function sampleConic(options: GeometryConicOptions): {
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

function sampleParametricCurve(options: GeometryParametricCurveOptions): {
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

function cleanFinitePoints(points: Vector2[], label: string): Vector2[] {
  return points.map(point => finiteVector(point, `${label} point`));
}

function finiteVector(point: Vector2, label: string): Vector2 {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new KleinSdkError('invalid_point', `${label} coordinates must be finite.`);
  }
  return { x: point.x, y: point.y };
}

function rotateAroundOrigin(point: Vector2, radians: number, origin: Vector2): Vector2 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: origin.x + point.x * cos - point.y * sin,
    y: origin.y + point.x * sin + point.y * cos,
  };
}

function conicEquationFromQuadratic(
  center: Vector2,
  rotation: number,
  localX2: number,
  localY2: number,
  constant: number,
): GeometryConicEquation {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const a = cos * cos * localX2 + sin * sin * localY2;
  const b = 2 * cos * sin * (localX2 - localY2);
  const c = sin * sin * localX2 + cos * cos * localY2;
  const d = -2 * a * center.x - b * center.y;
  const e = -b * center.x - 2 * c * center.y;
  const f = a * center.x * center.x + b * center.x * center.y + c * center.y * center.y + constant;
  return { a, b, c, d, e, f };
}

function parabolaEquation(vertex: Vector2, rotation: number, focalLength: number): GeometryConicEquation {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const a = cos * cos;
  const b = 2 * cos * sin;
  const c = sin * sin;
  const d = -2 * a * vertex.x - b * vertex.y + 4 * focalLength * sin;
  const e = -b * vertex.x - 2 * c * vertex.y - 4 * focalLength * cos;
  const f = a * vertex.x * vertex.x
    + b * vertex.x * vertex.y
    + c * vertex.y * vertex.y
    - 4 * focalLength * sin * vertex.x
    + 4 * focalLength * cos * vertex.y;
  return { a, b, c, d, e, f };
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

function angleSweep(start: number, end: number, orientation: AngleEntity['orientation'] = 'interior'): number {
  const interior = normalizeAngleDelta(end - start);
  if (orientation !== 'exterior') return interior;
  return interior >= 0 ? interior - Math.PI * 2 : interior + Math.PI * 2;
}

function angleMeasureForEntityDegrees(a: Vector2, vertex: Vector2, c: Vector2, entity: AngleEntity): number {
  const interior = angleMeasureDegrees(a, vertex, c);
  return entity.orientation === 'exterior' ? 360 - interior : interior;
}

function normalizeAngleOptions(options: GeometryAngleOptions): { radius: number; orientation: 'interior' | 'exterior' } {
  return {
    radius: positiveNumber(options.radius, positiveNumber(options.width, 0.7)),
    orientation: options.orientation ?? (options.exterior ? 'exterior' : 'interior'),
  };
}

function normalizeVertexIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || length <= 0) {
    throw new KleinSdkError('invalid_polygon', 'Vertex index must be finite.');
  }
  const rounded = Math.round(index);
  return ((rounded % length) + length) % length;
}

function cross(a: Vector2, b: Vector2): number {
  return a.x * b.y - a.y * b.x;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nearlyEqualNumber(first: number, second: number, tolerance: number): boolean {
  return Math.abs(first - second) <= tolerance;
}

function uniqueStrings(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function geometrySnapshotJson(snapshot: GeometryCalculatorSnapshot, includeAppState: boolean): JsonValue {
  if (includeAppState) return snapshot as unknown as JsonValue;
  const { appState: _appState, ...rest } = snapshot;
  return rest as unknown as JsonValue;
}

function exportBackground(background: ExportOptions['background']): string {
  if (background === undefined || background === 'white') return '#ffffff';
  if (background === 'transparent') return 'transparent';
  return background;
}

function appendSvgGrid(
  bounds: WorldBounds,
  view: View2D,
  unitSize: number,
  grid: GeometryGridOptions,
  size: { width: number; height: number },
): string {
  const step = chooseGridStep(unitSize * view.zoom);
  const lines: string[] = ['<g data-klein-grid="true">'];
  const startX = Math.floor(bounds.minX / step) * step;
  const endX = Math.ceil(bounds.maxX / step) * step;
  for (let x = startX; x <= endX + 1e-9; x += step) {
    const screen = geometryWorldToScreen({ x, y: 0 }, view, unitSize);
    lines.push(svgElement('line', {
      x1: screen.x,
      y1: 0,
      x2: screen.x,
      y2: size.height,
      stroke: Math.abs(x) < 1e-9 ? '#94a3b8' : isMajorGridLine(x, grid.majorEvery) ? '#cbd5e1' : '#e7edf4',
      'stroke-width': Math.abs(x) < 1e-9 ? 1.5 : 0.75,
    }));
  }
  const startY = Math.floor(bounds.minY / step) * step;
  const endY = Math.ceil(bounds.maxY / step) * step;
  for (let y = startY; y <= endY + 1e-9; y += step) {
    const screen = geometryWorldToScreen({ x: 0, y }, view, unitSize);
    lines.push(svgElement('line', {
      x1: 0,
      y1: screen.y,
      x2: size.width,
      y2: screen.y,
      stroke: Math.abs(y) < 1e-9 ? '#94a3b8' : isMajorGridLine(y, grid.majorEvery) ? '#cbd5e1' : '#e7edf4',
      'stroke-width': Math.abs(y) < 1e-9 ? 1.5 : 0.75,
    }));
  }
  lines.push('</g>');
  return lines.join('');
}

async function svgToPngBlob(svg: string, size: { width: number; height: number }): Promise<Blob> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new KleinSdkError('unsupported_export', 'PNG export requires a browser canvas environment.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new KleinSdkError('export_failed', 'Canvas context could not be created.');
  const image = new Image();
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new KleinSdkError('export_failed', 'SVG rasterization failed.'));
    image.src = url;
  });
  context.drawImage(image, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new KleinSdkError('export_failed', 'Canvas PNG export failed.');
  return blob;
}

function geometrySceneToPdfBlob(
  snapshot: GeometryCalculatorSnapshot,
  size: { width: number; height: number },
  options: ExportOptions,
  title: string,
): Blob {
  const stream = geometrySceneToPdfStream(snapshot, size, options, title);
  return new Blob([pdfDocument(stream, size)], { type: 'application/pdf' });
}

function geometrySceneToPdfStream(
  snapshot: GeometryCalculatorSnapshot,
  size: { width: number; height: number },
  options: ExportOptions,
  title: string,
): string {
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
  const commands: string[] = [];
  const backgroundFill = exportBackground(options.background);
  if (backgroundFill !== 'transparent') {
    commands.push(
      'q',
      pdfFillColor(backgroundFill),
      `0 0 ${pdfNumber(size.width)} ${pdfNumber(size.height)} re f`,
      'Q',
    );
  }
  if (options.includeGrid) {
    commands.push(pdfGrid(bounds, view, unitSize, snapshot.appState.grid, size));
  }

  for (const entity of orderedEntities(snapshot.scene)) {
    if (entity.hidden) continue;
    if (options.includeMeasurements === false && entity.kind === 'relationMarker') continue;
    if (entity.kind === 'polygon') {
      const points = entity.pointIds.map(id => point2D(snapshot.scene, id)).filter(isPoint2D);
      if (points.length < 3) continue;
      commands.push(pdfPolyline(
        points,
        view,
        unitSize,
        size,
        true,
        entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR,
        entity.fillColor ?? DEFAULT_FILL,
        entity.width ?? DEFAULT_WIDTH,
      ));
      continue;
    }
    if (entity.kind === 'locus') {
      if (entity.points.length < 2) continue;
      commands.push(pdfPolyline(
        entity.points,
        view,
        unitSize,
        size,
        Boolean(entity.closed),
        entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR,
        entity.closed && entity.fillColor ? entity.fillColor : null,
        entity.width ?? DEFAULT_WIDTH,
      ));
      continue;
    }
    if (entity.kind === 'conic' || entity.kind === 'parametricCurve') {
      for (const segment of sampledCurveSegments(entity)) {
        if (segment.length < 2) continue;
        commands.push(pdfPolyline(
          segment,
          view,
          unitSize,
          size,
          Boolean(entity.closed),
          entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR,
          entity.closed && entity.fillColor ? entity.fillColor : null,
          entity.width ?? DEFAULT_WIDTH,
        ));
      }
      continue;
    }
    if (entity.kind === 'relationMarker') {
      const anchor = relationMarkerAnchor(snapshot.scene, entity);
      if (!anchor) continue;
      const screen = geometryWorldToScreen(anchor, view, unitSize);
      commands.push(pdfText(
        entity.text ?? entity.label ?? relationMarkerLabel(entity.relationKind),
        { x: screen.x + 6, y: screen.y - 6 },
        entity.color ?? DEFAULT_DRAW_COLOR,
        size,
      ));
      continue;
    }
    if (entity.kind === 'circle') {
      const center = point2D(snapshot.scene, entity.centerId);
      if (!center || entity.radius <= 0) continue;
      commands.push(pdfCircle(
        center,
        entity.radius * unitSize * view.zoom,
        view,
        unitSize,
        entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR,
        entity.fillColor ?? colorWithAlpha(entity.color ?? DEFAULT_DRAW_COLOR, 0.1),
        entity.width ?? DEFAULT_WIDTH,
        size,
      ));
      continue;
    }
    if (entity.kind === 'line') {
      const equation = entity.equation ?? lineEquationFromEntityPoints(snapshot.scene, entity);
      const clipped = equation ? clipLineToBounds(equation, bounds) : null;
      if (!clipped) continue;
      commands.push(pdfLine(clipped[0], clipped[1], entity, view, unitSize, size));
      continue;
    }
    if (entity.kind === 'ray') {
      const a = point2D(snapshot.scene, entity.pointIds[0]);
      const b = point2D(snapshot.scene, entity.pointIds[1]);
      const clipped = a && b ? clipRayToBounds(a, b, bounds) : null;
      if (!clipped) continue;
      commands.push(pdfLine(clipped[0], clipped[1], entity, view, unitSize, size));
      continue;
    }
    if (entity.kind === 'segment' || entity.kind === 'vector') {
      const a = point2D(snapshot.scene, entity.pointIds[0]);
      const b = point2D(snapshot.scene, entity.pointIds[1]);
      if (!a || !b) continue;
      commands.push(pdfLine(a, b, entity, view, unitSize, size));
      continue;
    }
    if (entity.kind === 'arc') {
      const center = point2D(snapshot.scene, entity.centerId);
      const start = point2D(snapshot.scene, entity.startId);
      const end = point2D(snapshot.scene, entity.endId);
      if (!center || !start || !end) continue;
      commands.push(pdfArc(center, start, end, entity, view, unitSize, size));
    }
  }

  commands.push(pdfText(title, { x: 16, y: size.height - 18 }, '#64748b', size, 9));
  return commands.filter(Boolean).join('\n');
}

function pdfDocument(stream: string, size: { width: number; height: number }): string {
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size.width} ${size.height}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj`,
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += `${object}\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

function pdfGrid(
  bounds: WorldBounds,
  view: View2D,
  unitSize: number,
  grid: GeometryGridOptions,
  size: { width: number; height: number },
): string {
  const step = chooseGridStep(unitSize * view.zoom);
  const commands = ['q', '0.75 w'];
  const startX = Math.floor(bounds.minX / step) * step;
  const endX = Math.ceil(bounds.maxX / step) * step;
  for (let x = startX; x <= endX + 1e-9; x += step) {
    const screen = geometryWorldToScreen({ x, y: 0 }, view, unitSize);
    commands.push(
      Math.abs(x) < 1e-9 ? pdfStrokeColor('#94a3b8') : pdfStrokeColor(isMajorGridLine(x, grid.majorEvery) ? '#cbd5e1' : '#e7edf4'),
      `${pdfNumber(screen.x)} 0 m ${pdfNumber(screen.x)} ${pdfNumber(size.height)} l S`,
    );
  }
  const startY = Math.floor(bounds.minY / step) * step;
  const endY = Math.ceil(bounds.maxY / step) * step;
  for (let y = startY; y <= endY + 1e-9; y += step) {
    const screen = geometryWorldToScreen({ x: 0, y }, view, unitSize);
    const pdfY = size.height - screen.y;
    commands.push(
      Math.abs(y) < 1e-9 ? pdfStrokeColor('#94a3b8') : pdfStrokeColor(isMajorGridLine(y, grid.majorEvery) ? '#cbd5e1' : '#e7edf4'),
      `0 ${pdfNumber(pdfY)} m ${pdfNumber(size.width)} ${pdfNumber(pdfY)} l S`,
    );
  }
  commands.push('Q');
  return commands.join('\n');
}

function pdfLine(
  a: Vector2,
  b: Vector2,
  entity: GeometryEntityDisplay,
  view: View2D,
  unitSize: number,
  size: { width: number; height: number },
): string {
  const start = pdfPoint(a, view, unitSize, size);
  const end = pdfPoint(b, view, unitSize, size);
  return [
    'q',
    pdfStrokeColor(entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR),
    `${pdfNumber(entity.width ?? DEFAULT_WIDTH)} w`,
    `${pdfNumber(start.x)} ${pdfNumber(start.y)} m ${pdfNumber(end.x)} ${pdfNumber(end.y)} l S`,
    'Q',
  ].join('\n');
}

function pdfPolyline(
  points: Vector2[],
  view: View2D,
  unitSize: number,
  size: { width: number; height: number },
  closed: boolean,
  strokeColor: string,
  fillColor: string | null,
  width: number,
): string {
  const [first, ...rest] = points;
  if (!first) return '';
  const start = pdfPoint(first, view, unitSize, size);
  const commands = [
    'q',
    pdfStrokeColor(strokeColor),
    fillColor ? pdfFillColor(fillColor) : '',
    `${pdfNumber(width)} w`,
    `${pdfNumber(start.x)} ${pdfNumber(start.y)} m`,
  ];
  for (const point of rest) {
    const pdf = pdfPoint(point, view, unitSize, size);
    commands.push(`${pdfNumber(pdf.x)} ${pdfNumber(pdf.y)} l`);
  }
  if (closed) commands.push('h');
  commands.push(fillColor ? 'B' : 'S', 'Q');
  return commands.filter(Boolean).join('\n');
}

function pdfCircle(
  center: Vector2,
  radius: number,
  view: View2D,
  unitSize: number,
  strokeColor: string,
  fillColor: string | null,
  width: number,
  size: { width: number; height: number },
): string {
  const c = pdfPoint(center, view, unitSize, size);
  const k = radius * 0.5522847498307936;
  const r = radius;
  return [
    'q',
    pdfStrokeColor(strokeColor),
    fillColor ? pdfFillColor(fillColor) : '',
    `${pdfNumber(width)} w`,
    `${pdfNumber(c.x + r)} ${pdfNumber(c.y)} m`,
    `${pdfNumber(c.x + r)} ${pdfNumber(c.y + k)} ${pdfNumber(c.x + k)} ${pdfNumber(c.y + r)} ${pdfNumber(c.x)} ${pdfNumber(c.y + r)} c`,
    `${pdfNumber(c.x - k)} ${pdfNumber(c.y + r)} ${pdfNumber(c.x - r)} ${pdfNumber(c.y + k)} ${pdfNumber(c.x - r)} ${pdfNumber(c.y)} c`,
    `${pdfNumber(c.x - r)} ${pdfNumber(c.y - k)} ${pdfNumber(c.x - k)} ${pdfNumber(c.y - r)} ${pdfNumber(c.x)} ${pdfNumber(c.y - r)} c`,
    `${pdfNumber(c.x + k)} ${pdfNumber(c.y - r)} ${pdfNumber(c.x + r)} ${pdfNumber(c.y - k)} ${pdfNumber(c.x + r)} ${pdfNumber(c.y)} c`,
    fillColor ? 'B' : 'S',
    'Q',
  ].filter(Boolean).join('\n');
}

function pdfArc(
  center: Vector2,
  start: Vector2,
  end: Vector2,
  entity: GeometryEntityDisplay,
  view: View2D,
  unitSize: number,
  size: { width: number; height: number },
): string {
  const centerScreen = geometryWorldToScreen(center, view, unitSize);
  const startScreen = geometryWorldToScreen(start, view, unitSize);
  const endScreen = geometryWorldToScreen(end, view, unitSize);
  const radius = distance2D(center, start) * unitSize * view.zoom;
  const startAngle = Math.atan2(startScreen.y - centerScreen.y, startScreen.x - centerScreen.x);
  const endAngle = Math.atan2(endScreen.y - centerScreen.y, endScreen.x - centerScreen.x);
  const delta = normalizeAngleDelta(endAngle - startAngle);
  const steps = Math.max(8, Math.ceil(Math.abs(delta) / (Math.PI / 18)));
  const points: Vector2[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = startAngle + (delta * index) / steps;
    const screenPoint = {
      x: centerScreen.x + Math.cos(angle) * radius,
      y: centerScreen.y + Math.sin(angle) * radius,
    };
    points.push(screenToGeometryWorld(screenPoint, view, unitSize));
  }
  return pdfPolyline(
    points,
    view,
    unitSize,
    size,
    false,
    entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR,
    null,
    entity.width ?? DEFAULT_WIDTH,
  );
}

function pdfText(
  text: string,
  screenPoint: Vector2,
  color: string,
  size: { width: number; height: number },
  fontSize = 12,
): string {
  return [
    'q',
    pdfFillColor(color),
    `BT /F1 ${pdfNumber(fontSize)} Tf ${pdfNumber(screenPoint.x)} ${pdfNumber(size.height - screenPoint.y)} Td (${escapePdfText(text)}) Tj ET`,
    'Q',
  ].join('\n');
}

function pdfPoint(
  point: Vector2,
  view: View2D,
  unitSize: number,
  size: { width: number; height: number },
): Vector2 {
  const screen = geometryWorldToScreen(point, view, unitSize);
  return { x: screen.x, y: size.height - screen.y };
}

function pdfStrokeColor(color: string): string {
  const rgb = parsePdfColor(color, false);
  return `${pdfNumber(rgb.r)} ${pdfNumber(rgb.g)} ${pdfNumber(rgb.b)} RG`;
}

function pdfFillColor(color: string): string {
  const rgb = parsePdfColor(color, true);
  return `${pdfNumber(rgb.r)} ${pdfNumber(rgb.g)} ${pdfNumber(rgb.b)} rg`;
}

function parsePdfColor(color: string, blendAlpha: boolean): { r: number; g: number; b: number } {
  const trimmed = color.trim();
  const hex = trimmed.match(/^#(?<hex>[0-9a-f]{6})(?<alpha>[0-9a-f]{2})?$/i);
  if (hex?.groups) {
    const raw = hex.groups.hex ?? '2563eb';
    const alpha = hex.groups.alpha ? Number.parseInt(hex.groups.alpha, 16) / 255 : 1;
    return normalizePdfColor(
      Number.parseInt(raw.slice(0, 2), 16),
      Number.parseInt(raw.slice(2, 4), 16),
      Number.parseInt(raw.slice(4, 6), 16),
      blendAlpha ? alpha : 1,
    );
  }
  const rgba = trimmed.match(/^rgba?\((?<r>[\d.]+),\s*(?<g>[\d.]+),\s*(?<b>[\d.]+)(?:,\s*(?<a>[\d.]+))?\)$/i);
  if (rgba?.groups) {
    return normalizePdfColor(
      Number(rgba.groups.r),
      Number(rgba.groups.g),
      Number(rgba.groups.b),
      blendAlpha ? Number(rgba.groups.a ?? 1) : 1,
    );
  }
  return normalizePdfColor(37, 99, 235, 1);
}

function normalizePdfColor(r: number, g: number, b: number, alpha: number): { r: number; g: number; b: number } {
  const a = clamp(alpha, 0, 1);
  return {
    r: clamp((r * a + 255 * (1 - a)) / 255, 0, 1),
    g: clamp((g * a + 255 * (1 - a)) / 255, 0, 1),
    b: clamp((b * a + 255 * (1 - a)) / 255, 0, 1),
  };
}

function escapePdfText(value: string): string {
  return value
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/[()\\]/g, match => `\\${match}`)
    .replace(/\r?\n/g, ' ');
}

function pdfNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Number(value.toFixed(4)).toString();
}

function geometrySceneToSvg(
  snapshot: GeometryCalculatorSnapshot,
  size: { width: number; height: number },
  options: ExportOptions = { format: 'svg' },
): string {
  const parts = [
    `<svg xmlns="${SVG_NS}" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">`,
    '<defs>',
    svgElement('marker', {
      id: 'kgc-arrow',
      markerWidth: 10,
      markerHeight: 10,
      refX: 9,
      refY: 3,
      orient: 'auto',
      markerUnits: 'strokeWidth',
    }, svgElement('path', {
      d: 'M 0 0 L 9 3 L 0 6 z',
      fill: DEFAULT_DRAW_COLOR,
    })),
    '</defs>',
  ];
  const backgroundFill = exportBackground(options.background);
  if (backgroundFill !== 'transparent') {
    parts.push(svgElement('rect', {
      width: '100%',
      height: '100%',
      fill: backgroundFill,
    }));
  }

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

  if (options.includeGrid) parts.push(appendSvgGrid(bounds, view, unitSize, snapshot.appState.grid, size));

  for (const entity of orderedEntities(snapshot.scene)) {
    if (entity.hidden) continue;
    if (options.includeMeasurements === false && entity.kind === 'relationMarker') continue;

    if (entity.kind === 'polygon') {
      const points = entity.pointIds.map(id => point2D(snapshot.scene, id)).filter(isPoint2D);
      if (points.length < 3) continue;
      parts.push(svgElement('polygon', {
        points: points.map(point => {
          const screen = geometryWorldToScreen(point, view, unitSize);
          return `${screen.x},${screen.y}`;
        }).join(' '),
        fill: entity.fillColor ?? DEFAULT_FILL,
        stroke: entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR,
        'stroke-width': entity.width ?? DEFAULT_WIDTH,
      }));
      continue;
    }

    if (entity.kind === 'locus') {
      if (entity.points.length < 2) continue;
      parts.push(svgElement('path', {
        d: svgPathForWorldPoints(entity.points, view, unitSize, Boolean(entity.closed)),
        fill: entity.closed && entity.fillColor ? entity.fillColor : 'none',
        stroke: entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR,
        'stroke-width': entity.width ?? DEFAULT_WIDTH,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      }));
      continue;
    }

    if (entity.kind === 'conic' || entity.kind === 'parametricCurve') {
      for (const segment of sampledCurveSegments(entity)) {
        if (segment.length < 2) continue;
        parts.push(svgElement('path', {
          d: svgPathForWorldPoints(segment, view, unitSize, Boolean(entity.closed)),
          fill: entity.closed && entity.fillColor ? entity.fillColor : 'none',
          stroke: entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR,
          'stroke-width': entity.width ?? DEFAULT_WIDTH,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }));
      }
      continue;
    }

    if (entity.kind === 'relationMarker') {
      const anchor = relationMarkerAnchor(snapshot.scene, entity);
      if (!anchor) continue;
      const screen = geometryWorldToScreen(anchor, view, unitSize);
      parts.push(svgElement('text', {
        x: screen.x + 6,
        y: screen.y - 6,
        fill: entity.color ?? DEFAULT_DRAW_COLOR,
        'font-size': 12,
        'font-family': KLEIN_UI_FONT_STACK,
      }, escapeXml(entity.text ?? entity.label ?? relationMarkerLabel(entity.relationKind))));
      continue;
    }

    if (entity.kind === 'circle') {
      const center = point2D(snapshot.scene, entity.centerId);
      if (!center || entity.radius <= 0) continue;
      const screen = geometryWorldToScreen(center, view, unitSize);
      parts.push(svgElement('circle', {
        cx: screen.x,
        cy: screen.y,
        r: entity.radius * unitSize * view.zoom,
        fill: entity.fillColor ?? colorWithAlpha(entity.color ?? DEFAULT_DRAW_COLOR, 0.1),
        stroke: entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR,
        'stroke-width': entity.width ?? DEFAULT_WIDTH,
      }));
      continue;
    }

    if (entity.kind === 'line') {
      const equation = entity.equation ?? lineEquationFromEntityPoints(snapshot.scene, entity);
      const clipped = equation ? clipLineToBounds(equation, bounds) : null;
      if (!clipped) continue;
      parts.push(svgLine(clipped[0], clipped[1], entity, view, unitSize));
      continue;
    }

    if (entity.kind === 'ray') {
      const a = point2D(snapshot.scene, entity.pointIds[0]);
      const b = point2D(snapshot.scene, entity.pointIds[1]);
      const clipped = a && b ? clipRayToBounds(a, b, bounds) : null;
      if (!clipped) continue;
      parts.push(svgLine(clipped[0], clipped[1], entity, view, unitSize));
      continue;
    }

    if (entity.kind === 'segment' || entity.kind === 'vector') {
      const a = point2D(snapshot.scene, entity.pointIds[0]);
      const b = point2D(snapshot.scene, entity.pointIds[1]);
      if (!a || !b) continue;
      parts.push(svgLine(a, b, entity, view, unitSize, entity.kind === 'vector'));
      continue;
    }

    if (entity.kind === 'arc') {
      const center = point2D(snapshot.scene, entity.centerId);
      const start = point2D(snapshot.scene, entity.startId);
      const end = point2D(snapshot.scene, entity.endId);
      if (!center || !start || !end) continue;
      parts.push(svgArc(center, start, end, entity, view, unitSize));
    }
  }
  parts.push('</svg>');
  return parts.join('');
}

function svgLine(
  a: Vector2,
  b: Vector2,
  entity: GeometryEntityDisplay,
  view: View2D,
  unitSize: number,
  arrow = false,
): string {
  const sa = geometryWorldToScreen(a, view, unitSize);
  const sb = geometryWorldToScreen(b, view, unitSize);
  return svgElement('line', {
    x1: sa.x,
    y1: sa.y,
    x2: sb.x,
    y2: sb.y,
    stroke: entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR,
    'stroke-width': entity.width ?? DEFAULT_WIDTH,
    'stroke-linecap': 'round',
    'marker-end': arrow ? 'url(#kgc-arrow)' : undefined,
  });
}

function svgArc(
  center: Vector2,
  start: Vector2,
  end: Vector2,
  entity: GeometryEntityDisplay,
  view: View2D,
  unitSize: number,
): string {
  const screenCenter = geometryWorldToScreen(center, view, unitSize);
  const screenStart = geometryWorldToScreen(start, view, unitSize);
  const screenEnd = geometryWorldToScreen(end, view, unitSize);
  const radius = distance2D(center, start) * unitSize * view.zoom;
  const startAngle = Math.atan2(screenStart.y - screenCenter.y, screenStart.x - screenCenter.x);
  const endAngle = Math.atan2(screenEnd.y - screenCenter.y, screenEnd.x - screenCenter.x);
  const delta = normalizeAngleDelta(endAngle - startAngle);
  const largeArc = Math.abs(delta) > Math.PI ? 1 : 0;
  const sweep = delta >= 0 ? 1 : 0;
  return svgElement('path', {
    d: `M ${screenStart.x} ${screenStart.y} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${screenEnd.x} ${screenEnd.y}`,
    fill: 'none',
    stroke: entity.strokeColor ?? entity.color ?? DEFAULT_DRAW_COLOR,
    'stroke-width': entity.width ?? DEFAULT_WIDTH,
    'stroke-linecap': 'round',
  });
}

function svgElement(
  name: string,
  attributes: Record<string, string | number | boolean | null | undefined>,
  content?: string,
): string {
  const renderedAttributes = Object.entries(attributes)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => ` ${key}="${escapeXml(String(value))}"`)
    .join('');
  if (content === undefined) return `<${name}${renderedAttributes}/>`;
  return `<${name}${renderedAttributes}>${content}</${name}>`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, character => {
    switch (character) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '\'':
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return character;
    }
  });
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
