import type {
  Camera3DState,
  InstrumentSnapshot,
  JsonObject,
  JsonValue,
  KleinInstrument,
  LoadOptions,
  Vector2,
  Vector3,
  View2D,
} from '../core/index.js';
import type { ExactValue } from '../math/index.js';
import type {
  GeometryConstraint,
  GeometrySlider,
  GeometryEntity,
  GeometryTransform2D,
  GeometryPlaneEquation3D,
  GeometryPoint2D,
  GeometryPoint3D,
  GeometryScene,
} from '../geometry-core/index.js';

/** Guided Geometry Lab tools. These are classroom-oriented, not full CAD commands. */
export type GeometryLabTool =
  | 'select'
  | 'pan'
  | 'orbit'
  | 'point'
  | 'segment'
  | 'polygon'
  | 'circle'
  | 'angle'
  | 'stamp'
  | 'midpoint'
  | 'perpendicular'
  | 'parallel'
  | 'bisector'
  | 'label'
  | 'color'
  | 'hide'
  | 'cut'
  | 'scale'
  | 'rotate'
  | 'solid'
  | 'workPlane'
  | 'crossSection'
  | 'net'
  | 'equation'
  | 'remove';

/** 2D Geometry Lab scene; currently extends the shared geometry graph with a scene discriminator. */
export interface GeometryScene2D extends GeometryScene {
  kind: 'geometry-lab-2d';
  /**
   * Measurements over the 2D figure. Optional so that every snapshot written
   * before they existed stays valid without a migration.
   */
  measurements?: Record<string, Measurement2D>;
}

/**
 * What a 2D measurement is derived from.
 *
 * <p>The same design as {@link MeasurementSource3D}: the source is what is
 * stored and the value is recomputed from it, so a measurement follows the
 * figure instead of recording what it happened to be when it was taken. These
 * are the quantities a 2D geometry lesson asks for - how long a segment is, how
 * far apart two points are, how far a point is from a line, the size of an
 * angle, and a polygon's area and perimeter.
 */
export type MeasurementSource2D =
  | { kind: 'pointDistance'; firstPointId: string; secondPointId: string }
  | { kind: 'segmentLength'; entityId: string }
  | { kind: 'pointLineDistance'; pointId: string; entityId: string }
  | { kind: 'angle'; pointIds: [string, string, string] }
  | { kind: 'polygonArea'; entityId: string }
  | { kind: 'polygonPerimeter'; entityId: string };

/** A recomputed measurement over the 2D scene. */
export interface Measurement2D {
  id: string;
  kind: 'length' | 'area' | 'angle';
  value: number;
  unit?: 'u' | 'u^2' | 'deg';
  label?: string;
  color?: string;
  hidden?: boolean;
  targetIds?: string[];
  source: MeasurementSource2D;
  /**
   * The value written exactly - `2√5` rather than `4.4721` - when there is one.
   *
   * <p>Absent means no exact form was found, which is not the same as the value
   * being irrational: the coordinates may not have been recognisable as
   * fractions, or an intermediate may have run past what an integer holds here.
   */
  exact?: ExactValue;
}

/** 3D Geometry Lab scene content. Camera state stays in app state, not here. */
export interface GeometryScene3D {
  kind: 'geometry-lab-3d';
  points: Record<string, GeometryPoint3D>;
  entities: Record<string, GeometryEntity3D>;
  workPlanes: Record<string, WorkPlane3D>;
  measurements: Record<string, Measurement3D>;
  nets: Record<string, SolidNet3D>;
}

/** Geometry entities that can appear in the 3D scene graph. */
export type GeometryEntity3D = GeometryEntity | SolidEntity | CrossSectionEntity | SurfaceEntity3D | CurveEntity3D;

/** Lightweight style metadata shared by 3D lab objects. */
export interface GeometryLabStyleOptions {
  label?: string;
  color?: string;
  hidden?: boolean;
  locked?: boolean;
}

/** A constraint without its id, which the instrument assigns. */
/** A slider without the id the instrument assigns, and with sensible defaults. */
export interface GeometrySliderDraft2D {
  name: string;
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  color?: string;
  hidden?: boolean;
}

export type GeometryConstraintDraft2D =
  | { kind: 'fixedLength'; pointIds: [string, string]; length: number; label?: string; enabled?: boolean }
  | { kind: 'fixedAngle'; pointIds: [string, string, string]; degrees: number; label?: string; enabled?: boolean }
  | { kind: 'parallel'; entityIds: [string, string]; label?: string; enabled?: boolean }
  | { kind: 'perpendicular'; entityIds: [string, string]; label?: string; enabled?: boolean }
  | { kind: 'equalLength'; segments: [[string, string], [string, string]]; label?: string; enabled?: boolean }
  | { kind: 'equalRadius'; circleIds: [string, string]; label?: string; enabled?: boolean };

export type EquationAxis3D = 'x' | 'y' | 'z';

export type WorkPlaneSource3D =
  | { kind: 'threePoints'; pointIds: [string, string, string] }
  | { kind: 'equation'; input?: string }
  | { kind: 'parallelPlane'; sourcePlaneId: string; throughPointId?: string; through?: [number, number, number] }
  | { kind: 'perpendicularPlane'; sourcePlaneId: string; throughPointId?: string; through?: [number, number, number] }
  | { kind: 'perpendicularLine'; sourceEntityId: string; throughPointId?: string; through?: [number, number, number] };

/** Plane used for placement, snapping, and drawing in the movable 3D space. */
export interface WorkPlane3D extends GeometryLabStyleOptions {
  id: string;
  origin: [number, number, number];
  normal: [number, number, number];
  xAxis: [number, number, number];
  yAxis?: [number, number, number];
  equation?: GeometryPlaneEquation3D;
  source?: WorkPlaneSource3D;
}

export interface SolidFace3D {
  id: string;
  pointIds: string[];
  normal?: [number, number, number];
  area?: number;
}

export interface SolidEdge3D {
  id: string;
  pointIds: [string, string];
  length?: number;
}

export interface SolidParameters3D {
  width?: number;
  depth?: number;
  height?: number;
  radius?: number;
  sides?: number;
  baseArea?: number;
  volume?: number;
  surfaceArea?: number;
}

/** Educational 3D solid. Mesh faces are intentionally simple and serializable. */
export interface SolidEntity extends GeometryLabStyleOptions {
  id: string;
  kind: 'solid';
  solid:
    | 'cube'
    | 'cuboid'
    | 'tetrahedron'
    | 'prism'
    | 'pyramid'
    | 'cylinder'
    | 'cone'
    | 'sphere'
    | 'hemisphere'
    | 'polyhedron';
  pointIds: string[];
  faceIds: string[];
  faces?: SolidFace3D[];
  edges?: SolidEdge3D[];
  parameters?: SolidParameters3D;
  volume?: number;
  surfaceArea?: number;
}

/** Persisted cross-section produced by slicing a solid with a plane. */
export interface CrossSectionEntity extends GeometryLabStyleOptions {
  id: string;
  kind: 'crossSection';
  solidId: string;
  planeId?: string;
  pointIds: string[];
  vertices?: Vector3[];
  area?: number;
  perimeter?: number;
}

/** Sampled z-function or parametric surface. Vertices are persisted directly for deterministic replay. */
export interface SurfaceEntity3D extends GeometryLabStyleOptions {
  id: string;
  kind: 'surface3d';
  surfaceKind: 'z-function' | 'parametric' | 'equation';
  dependentAxis?: EquationAxis3D;
  vertices: Vector3[];
  faces: number[][];
  input?: string;
  domain?: {
    x?: [number, number];
    y?: [number, number];
    z?: [number, number];
    u?: [number, number];
    v?: [number, number];
  };
  samples?: { x?: number; y?: number; z?: number; u?: number; v?: number };
}

/** Sampled 3D curve. Hosts may build it from their own parser, then persist the sampled result. */
export interface CurveEntity3D extends GeometryLabStyleOptions {
  id: string;
  kind: 'curve3d';
  points: Vector3[];
  input?: string;
  parameter?: {
    tMin: number;
    tMax: number;
    samples: number;
  };
}

/** Cached or persisted measurement attached to a 3D target. */
export type MeasurementSource3D =
  | { kind: 'pointPlaneDistance'; pointId: string; planeId: string }
  | { kind: 'solidVolume'; solidId: string }
  | { kind: 'solidSurfaceArea'; solidId: string }
  | { kind: 'solidDihedral'; solidId: string; firstFaceId: string; secondFaceId: string }
  // The measurements school solid geometry is actually about, and which the
  // first four leave out: how far apart two points are, how far a point is from
  // a line, the angle a line makes with another line or with a plane, and the
  // distance between two lines that never meet.
  | { kind: 'pointPointDistance'; firstPointId: string; secondPointId: string }
  | { kind: 'pointLineDistance'; pointId: string; lineEntityId: string }
  | { kind: 'lineLineAngle'; firstLineId: string; secondLineId: string }
  | { kind: 'linePlaneAngle'; lineEntityId: string; planeId: string }
  | { kind: 'lineLineDistance'; firstLineId: string; secondLineId: string };

export interface Measurement3D {
  id: string;
  targetId: string;
  targetIds?: string[];
  kind: 'length' | 'area' | 'surfaceArea' | 'volume' | 'angle' | 'dihedral';
  value: number;
  unit?: 'u' | 'u^2' | 'u^3' | 'deg';
  label?: string;
  source?: MeasurementSource3D;
}

export interface SolidNetFace2D {
  id: string;
  sourceFaceId: string;
  vertices: Vector2[];
  area?: number;
}

export interface SolidNet3D {
  id: string;
  solidId: string;
  faces: SolidNetFace2D[];
  totalArea?: number;
  label?: string;
}

/** Link between 2D and 3D content, such as a net folded into a solid. */
export interface GeometrySceneLink {
  id: string;
  kind: 'netToSolid' | 'extrusion' | 'projection';
  sourceId: string;
  targetId: string;
}

/** Full Geometry Lab lesson content, keeping 2D and 3D scenes side by side. */
export interface GeometryLabScene {
  scene2d: GeometryScene2D;
  scene3d: GeometryScene3D;
  links: GeometrySceneLink[];
}

export type GeometryCameraPreset3D = 'front' | 'top' | 'side' | 'isometric';

export type GeometryPolyhedronKind = 'tetrahedron' | 'cube' | 'octahedron' | 'icosahedron';

/** UI state for Geometry Lab, including movable 3D camera and active work plane. */
export interface GeometryLabAppState {
  activeView: '2d' | '3d' | 'split';
  view2d: View2D;
  view3d: Camera3DState;
  activeTool?: GeometryLabTool;
  activeWorkPlaneId?: string;
  selected?: GeometrySelection[];
}

/** Selection model for points, entities, and 3D sub-selections. */
export type GeometrySelection =
  | { kind: 'point2d'; id: string }
  | { kind: 'point3d'; id: string }
  | { kind: 'entity2d'; id: string }
  | { kind: 'entity3d'; id: string }
  | { kind: 'face'; solidId: string; faceId: string }
  | { kind: 'edge'; solidId: string; edgeId: string };

/** Versioned Geometry Lab snapshot for persistence and collaboration. */
export type GeometryLabSnapshot = InstrumentSnapshot<GeometryLabScene, GeometryLabAppState> & {
  version: 1;
  instrument: 'geometry-lab';
  appState: GeometryLabAppState;
};

/** Stable record locations used by collaboration-safe conditional history patches. */
export type GeometryLabHistoryRef =
  | { collection: 'point2d' | 'entity2d' | 'constraint2d' | 'slider2d' | 'measurement2d' | 'point3d' | 'entity3d' | 'workPlane' | 'measurement' | 'net' | 'link'; id: string }
  | { collection: 'appState'; key: string }
  | { collection: 'metadata' };

/** JSON-safe missing/present sentinel used instead of non-serializable `undefined`. */
export type GeometryLabHistoryValue =
  | { present: false }
  | { present: true; value: JsonValue };

/** Compare-and-set patch generated for undo and redo collaboration messages. */
export interface GeometryLabHistoryPatch {
  ref: GeometryLabHistoryRef;
  expected: GeometryLabHistoryValue;
  next: GeometryLabHistoryValue;
}

/** Result of a validated, transactional Geometry Lab reduction. */
export interface GeometryLabReductionResult {
  snapshot: GeometryLabSnapshot;
  changed: boolean;
}

/** Semantic Geometry Lab edit operations. Camera changes intentionally are app-state deltas. */
export type GeometryLabDelta =
  | { op: 'addPoint2D'; point: GeometryPoint2D }
  | { op: 'addPoint3D'; point: GeometryPoint3D }
  | { op: 'updatePoint'; id: string; changes: Partial<GeometryPoint2D | GeometryPoint3D> }
  | { op: 'addEntity2D'; entity: GeometryEntity }
  | { op: 'addEntity3D'; entity: GeometryEntity3D }
  | { op: 'updateEntity'; id: string; changes: Partial<GeometryEntity | GeometryEntity3D> }
  | { op: 'addWorkPlane'; plane: WorkPlane3D }
  | { op: 'updateWorkPlane'; id: string; changes: Partial<WorkPlane3D> }
  | { op: 'deleteWorkPlane'; ids: string[] }
  | { op: 'addConstraint2D'; constraint: GeometryConstraint }
  | { op: 'addSlider2D'; slider: GeometrySlider }
  | { op: 'updateSlider2D'; id: string; changes: Partial<Omit<GeometrySlider, 'id'>> }
  | { op: 'deleteConstraint2D'; ids: string[] }
  | { op: 'addMeasurement2D'; measurement: Measurement2D }
  | { op: 'deleteMeasurement2D'; ids: string[] }
  | { op: 'addMeasurement'; measurement: Measurement3D }
  | { op: 'updateMeasurement'; id: string; changes: Partial<Measurement3D> }
  | { op: 'deleteMeasurement'; ids: string[] }
  | { op: 'addNet'; net: SolidNet3D }
  | { op: 'deleteNet'; ids: string[] }
  | { op: 'delete'; ids: string[] }
  | { op: 'setSceneLink'; link: GeometrySceneLink }
  | { op: 'setAppState'; changes: Partial<GeometryLabAppState> }
  | { op: 'setView3D'; view: Camera3DState }
  | { op: 'clear2D' }
  | { op: 'clear3D' }
  | { op: 'clearAll' }
  | { op: 'historyPatch'; patches: GeometryLabHistoryPatch[] }
  | { op: 'batch'; deltas: GeometryLabDelta[] };

export interface SolidCreationOptions extends GeometryLabStyleOptions {
  sides?: number;
}

export interface SurfaceZInput3D {
  xRange: [number, number];
  yRange: [number, number];
  xSamples?: number;
  ySamples?: number;
  input?: string;
  z: (x: number, y: number) => number;
}

export interface EquationSurfaceInput3D {
  input: string;
  dependentAxis?: EquationAxis3D;
  xRange?: [number, number];
  yRange?: [number, number];
  zRange?: [number, number];
  samples?: number;
}

export interface CompiledEquationSurface3D {
  input: string;
  expression: string;
  dependentAxis: EquationAxis3D;
  evaluate: (variables: Record<EquationAxis3D, number>) => number;
}

export interface ParametricCurve3DInput {
  tRange: [number, number];
  samples?: number;
  input?: string;
  point: (t: number) => Vector3;
}

export interface GeometryLab extends KleinInstrument<GeometryLabSnapshot, GeometryLabDelta, GeometryLabTool> {
  readonly actorId: string;
  /** The snapshot without copying it, for callers that only read. See the implementation note. */
  peekSnapshot(): Readonly<GeometryLabSnapshot>;
  importJson(input: string | JsonValue, options?: LoadOptions): void;
  // 2D construction. The geometry behind these is shared with the Geometry
  // Calculator through geometry-core, so the two instruments agree on what each
  // construction means.
  addPoint2D(point: Vector2 & GeometryLabStyleOptions): string;
  addSegment2D(firstPointId: string, secondPointId: string, style?: GeometryLabStyleOptions): string;
  addRay2D(firstPointId: string, secondPointId: string, style?: GeometryLabStyleOptions): string;
  addVector2D(firstPointId: string, secondPointId: string, style?: GeometryLabStyleOptions): string;
  addLine2D(firstPointId: string, secondPointId: string, style?: GeometryLabStyleOptions): string;
  addPolygon2D(pointIds: string[], style?: GeometryLabStyleOptions): string;
  addAngle2D(pointIds: [string, string, string], style?: GeometryLabStyleOptions): string;
  addMidpoint2D(firstPointId: string, secondPointId: string, style?: GeometryLabStyleOptions): string;
  addIntersection2D(firstEntityId: string, secondEntityId: string, style?: GeometryLabStyleOptions, index?: number): string;
  addParallelLine2D(sourceEntityId: string, throughPointId: string, style?: GeometryLabStyleOptions): string;
  addPerpendicularLine2D(sourceEntityId: string, throughPointId: string, style?: GeometryLabStyleOptions): string;
  addAngleBisector2D(pointIds: [string, string, string], style?: GeometryLabStyleOptions): string;
  addCircle2D(centerPointId: string, radiusPointId: string, style?: GeometryLabStyleOptions): string;
  addCircleThroughPoints2D(pointIds: [string, string, string], style?: GeometryLabStyleOptions): string;
  addPoint3D(point: Vector3 & GeometryLabStyleOptions): string;
  addSegment3D(firstPointId: string, secondPointId: string, style?: GeometryLabStyleOptions): string;
  addLine3D(firstPointId: string, secondPointId: string, style?: GeometryLabStyleOptions): string;
  addWorkPlaneByThreePoints(pointIds: [string, string, string], style?: GeometryLabStyleOptions): string;
  addWorkPlaneByPoints(pointIds: [string, string, string], style?: GeometryLabStyleOptions): string;
  addWorkPlaneByEquation(equation: GeometryPlaneEquation3D & { input?: string }, style?: GeometryLabStyleOptions): string;
  addWorkPlaneParallelToPlane(sourcePlaneId: string, through?: string | Vector3, style?: GeometryLabStyleOptions): string;
  addWorkPlanePerpendicularToPlane(sourcePlaneId: string, through?: string | Vector3, style?: GeometryLabStyleOptions): string;
  addWorkPlanePerpendicularToLine(sourceEntityId: string, through?: string | Vector3, style?: GeometryLabStyleOptions): string;
  pointPlaneDistance(pointId: string, planeId: string): number;
  transform2D(targetId: string, transform: GeometryTransform2D, style?: GeometryLabStyleOptions): string;
  translate2D(targetId: string, vectorEntityId: string, style?: GeometryLabStyleOptions): string;
  translateBy2D(targetId: string, dx: number, dy: number, style?: GeometryLabStyleOptions): string;
  rotate2D(targetId: string, centerPointId: string, degrees: number, style?: GeometryLabStyleOptions): string;
  reflectInLine2D(targetId: string, lineEntityId: string, style?: GeometryLabStyleOptions): string;
  reflectInPoint2D(targetId: string, centerPointId: string, style?: GeometryLabStyleOptions): string;
  dilate2D(targetId: string, centerPointId: string, factor: number, style?: GeometryLabStyleOptions): string;
  addConstraint2D(constraint: GeometryConstraintDraft2D): string;
  addSlider2D(slider: GeometrySliderDraft2D): string;
  setSliderValue2D(id: string, value: number): void;
  removeConstraint2D(ids: string | string[]): void;
  addDistanceMeasurement2D(firstPointId: string, secondPointId: string, label?: string): string;
  addLengthMeasurement2D(entityId: string, label?: string): string;
  addPointLineDistanceMeasurement2D(pointId: string, entityId: string, label?: string): string;
  addAngleMeasurement2D(pointIds: [string, string, string], label?: string): string;
  addAreaMeasurement2D(polygonId: string, label?: string): string;
  addPerimeterMeasurement2D(polygonId: string, label?: string): string;
  addPointPlaneDistanceMeasurement(pointId: string, planeId: string, label?: string): string;
  addDistanceMeasurement3D(firstPointId: string, secondPointId: string, label?: string): string;
  addPointLineDistanceMeasurement(pointId: string, lineEntityId: string, label?: string): string;
  addLineAngleMeasurement(firstLineId: string, secondLineId: string, label?: string): string;
  addLinePlaneAngleMeasurement(lineEntityId: string, planeId: string, label?: string): string;
  addLineDistanceMeasurement(firstLineId: string, secondLineId: string, label?: string): string;
  addLinePlaneIntersection(lineEntityId: string, planeId: string, style?: GeometryLabStyleOptions): string;
  addPlanePlaneIntersection(firstPlaneId: string, secondPlaneId: string, style?: GeometryLabStyleOptions): string;
  addPrism(base: Vector3[], height?: number | Vector3, style?: SolidCreationOptions): string;
  addPyramid(base: Vector3[], heightOrApex?: number | Vector3, style?: SolidCreationOptions): string;
  addCylinder(center: Vector3, radius: number, height: number, style?: SolidCreationOptions): string;
  addCone(center: Vector3, radius: number, height: number, style?: SolidCreationOptions): string;
  addSphere(center: Vector3, radius: number, style?: SolidCreationOptions): string;
  addSurfaceZ(input: SurfaceZInput3D, style?: GeometryLabStyleOptions): string;
  addEquationSurface3D(input: EquationSurfaceInput3D, style?: GeometryLabStyleOptions): string;
  updateEquationSurface3D(id: string, input: EquationSurfaceInput3D, style?: GeometryLabStyleOptions): void;
  remove(ids: string | string[]): void;
  addParametricCurve3D(input: ParametricCurve3DInput, style?: GeometryLabStyleOptions): string;
  addPolyhedron(kind: GeometryPolyhedronKind, center?: Vector3, size?: number, style?: GeometryLabStyleOptions): string;
  addCrossSection(solidId: string, planeId: string, style?: GeometryLabStyleOptions): string;
  createUnfoldedNet(solidId: string, label?: string): string;
  measureVolume(solidId: string): number;
  measureSurfaceArea(solidId: string): number;
  measureDihedralAngle(solidId: string, firstFaceId: string, secondFaceId: string): number;
  addVolumeMeasurement(solidId: string, label?: string): string;
  addSurfaceAreaMeasurement(solidId: string, label?: string): string;
  addDihedralAngleMeasurement(solidId: string, firstFaceId: string, secondFaceId: string, label?: string): string;
  setCameraPreset(preset: GeometryCameraPreset3D, distance?: number): void;
  fitSelection(selection?: GeometrySelection[]): void;
  setOrbitTarget(target: string | Vector3): void;
  orbitCamera(azimuthDegrees: number, elevationDegrees?: number, radius?: number): void;
}

export interface GeometryLabVectorPayload extends JsonObject { x: number; y: number; z: number }
export interface GeometryLabStylePayload extends JsonObject { label?: string; color?: string }
export interface GeometryLabPointPayload extends GeometryLabStylePayload { x: number; y: number; z: number }
export interface GeometryLabSegmentPayload extends GeometryLabStylePayload { firstPointId: string; secondPointId: string }
export interface GeometryLabSolidPayload extends GeometryLabStylePayload { center?: GeometryLabVectorPayload; size?: number; radius?: number }
export interface GeometryLabSurfacePayload extends GeometryLabStylePayload {
  preset?: 'paraboloid' | 'saddle' | 'wave';
  xRange?: [number, number];
  yRange?: [number, number];
  samples?: number;
}
export interface GeometryLabEquationSurfacePayload extends GeometryLabStylePayload {
  input: string;
  dependentAxis?: EquationAxis3D;
  xRange?: [number, number];
  yRange?: [number, number];
  zRange?: [number, number];
  samples?: number;
}
export interface GeometryLabUpdateEquationSurfacePayload extends GeometryLabEquationSurfacePayload { id: string }
export interface GeometryLabDeletePayload extends JsonObject { id?: string; ids?: string[] }
export interface GeometryLabCameraPayload extends JsonObject { preset: GeometryCameraPreset3D; distance?: number }
export interface GeometryLabMeasurementPayload extends JsonObject { solidId: string; label?: string }

export type GeometryLabCommand =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'setTool'; payload: GeometryLabTool }
  | { type: 'getSnapshot' }
  | { type: 'addPoint3D'; payload: GeometryLabPointPayload }
  | { type: 'addSegment3D'; payload: GeometryLabSegmentPayload }
  | { type: 'addLine3D'; payload: GeometryLabSegmentPayload }
  | { type: 'addCube'; payload?: GeometryLabSolidPayload }
  | { type: 'addSphere'; payload?: GeometryLabSolidPayload }
  | { type: 'addSurfaceZ'; payload?: GeometryLabSurfacePayload }
  | { type: 'addEquationSurface3D'; payload: GeometryLabEquationSurfacePayload }
  | { type: 'updateEquationSurface3D'; payload: GeometryLabUpdateEquationSurfacePayload }
  | { type: 'delete'; payload: string | string[] | GeometryLabDeletePayload }
  | { type: 'setCameraPreset'; payload: GeometryCameraPreset3D | GeometryLabCameraPayload }
  | { type: 'addVolumeMeasurement'; payload: GeometryLabMeasurementPayload }
  | { type: 'addSurfaceAreaMeasurement'; payload: GeometryLabMeasurementPayload };
