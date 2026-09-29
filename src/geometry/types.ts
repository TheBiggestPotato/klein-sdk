import type { ApplyDeltaOptions, DeltaMeta, ExportOptions, ExportResult, InstrumentOptions, JsonValue, KleinInstrument, LoadOptions, ValidationResult, Vector2, View2D } from '../core/index.js';
import type { AngleEntity, ArcEntity, CircleEntity, ConicEntity, GeometryConicEquation, GeometryConstraint, GeometryConstraintSummary, GeometryConstruction, GeometryCoreSnapshot, GeometryDependencyGraph, GeometryDimension, GeometryEntity, GeometryLine3D, GeometryLineEquation, GeometryObjectPanelOptions, GeometryObjectPanelRow, GeometryObjectSummary, GeometryObjectSummaryOptions, GeometryPlaneEquation3D, GeometryPoint, GeometryPoint2D, GeometryPoint3D, GeometryRelationMarkerEntity, GeometryScene, LineEntity, LocusEntity, ParametricCurveEntity, PlaneEntity, PolygonEntity, RayEntity, SegmentEntity, VectorEntity } from '../geometry-core/index.js';
import type { KleinToolThemeInput } from '../theme/index.js';
import { isCyclicQuadrilateral } from './geometry-math.js';

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


export interface ScreenRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}


export type HitTarget =
  | { selection: GeometryCalculatorSelectable; distanceWorld: number }
  | null;


export type DragState =
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


export interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}


export interface LinearExpression {
  a: number;
  b: number;
  c: number;
}


export interface CirclePolynomial {
  x2: number;
  y2: number;
  x: number;
  y: number;
  c: number;
}


export interface SnapOptions {
  toleranceWorld: number;
  gridStep: number;
  excludePointIds?: string[];
  settings: GeometrySnapSettings;
}


export interface SnapCandidate {
  point: Vector2;
  kind: GeometrySnapKind;
  label: string;
}


export interface SnapMarker extends SnapCandidate {
  distanceWorld: number;
}


export interface SnapResult {
  point: Vector2;
  marker: SnapMarker | null;
}


export interface SelectionTransformTargets {
  pointIds: string[];
  locusEntityIds: string[];
}

