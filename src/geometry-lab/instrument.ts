/** Framework-independent Geometry Lab instrument and factory implementation. */
import { createInstrumentRuntime, KleinSdkError } from '../core/index.js';
import { svgToPngBlob } from '../export/index.js';
import { DEFAULT_TRACE_CAPACITY, GeometryTrace } from './trace.js';
import { attachGeometryLabPointer } from './interaction.js';
import type { GeometryPointerAttachment, GeometryPointerOptions } from './interaction.js';
import type { GeometrySliderDraft2D } from './types.js';
import type {
  ApplyDeltaOptions,
  Camera3DState,
  DeltaMeta,
  ExportOptions,
  ExportResult,
  InstrumentOptions,
  IdFactory,
  JsonValue,
  KleinToolRuntime,
  LoadOptions,
  Vector2,
  Vector3,
} from '../core/index.js';
import {
  MAX_LOCUS_SAMPLES,
  geometryPointOnPath2D,
  buildAngleBisector2D,
  buildTransformedObject2D,
  geometryTransform2DSourceIds,
  geometryConstraintDependencies,
  buildCircleByCenterPoint2D,
  buildCircleThroughPoints2D,
  buildConstructedLine2D,
  buildIntersection2D,
  buildLineThroughPoints2D,
  buildMidpoint2D,
  normalizeGeometryPlaneEquation3D,
  planeEquationFrom3DPoints,
} from '../geometry-core/index.js';
import type {
  AngleEntity,
  GeometryConstraint,
  GeometrySlider,
  LocusEntity,
  GeometryConstruction,
  GeometryConstructionResult,
  GeometryEntity,
  GeometryLine3D,
  GeometryPlaneEquation3D,
  GeometryPoint2D,
  GeometryTransform2D,
  GeometryPoint3D,
  LineEntity,
  PlaneEntity,
  PolygonEntity,
  RayEntity,
  SegmentEntity,
  VectorEntity,
} from '../geometry-core/index.js';
import type {
  CrossSectionEntity,
  CurveEntity3D,
  EquationSurfaceInput3D,
  GeometryCameraPreset3D,
  GeometryConstraintDraft2D,
  GeometryEntity3D,
  GeometryLab,
  GeometryLabAppState,
  GeometryLabCommand,
  GeometryLabDelta,
  GeometryLabSnapshot,
  GeometryLabStyleOptions,
  GeometryLabTool,
  GeometryPolyhedronKind,
  GeometryScene3D,
  GeometrySelection,
  Measurement2D,
  Measurement3D,
  MeasurementSource2D,
  MeasurementSource3D,
  ParametricCurve3DInput,
  SolidCreationOptions,
  SolidEntity,
  SolidFace3D,
  SolidNet3D,
  SolidParameters3D,
  SurfaceEntity3D,
  SurfaceZInput3D,
  WorkPlane3D,
  WorkPlaneSource3D,
} from './types.js';
import {
  compactGeometryLabDelta,
  compactGeometryLabSnapshot,
} from './persistence.js';
import {
  createGeometryLabHistoryEntry,
  geometryLabDependencyConflictRefKeys,
  geometryLabHistoryDelta,
  type GeometryLabHistoryEntry,
} from './history.js';
import {
  renderGeometryLabLatex,
  renderGeometryLabPdf,
  renderGeometryLabSvg2D,
  renderGeometryLabSvg3D,
  rendersTwoDimensionalScene,
} from './renderers.js';
import {
  assertGeometryLabDeltaComplexity,
  assertGeometryLabExportOutputComplexity,
  assertGeometryLabExportRequestComplexity,
  assertGeometryLabJsonInputComplexity,
  assertGeometryLabSnapshotComplexity,
  DEFAULT_GEOMETRY_LAB_COMPLEXITY_LIMITS,
  estimateGeometryLabSurfaceProbeEvaluations,
  resolveGeometryLabComplexityLimits,
  type GeometryLabComplexityLimits,
} from './complexity.js';
import { executeGeometryLabCommand } from './commands.js';
import {
  makeAuthoredEquationSurface3D,
  mergeEquationSurfaceInput,
} from './equations.js';
import {
  createEmptyGeometryLabSnapshot,
  normalizeGeometryLabSnapshot,
  reduceOwnedGeometryLabDelta,
} from './reducer.js';
import { validateGeometryLabDelta, validateGeometryLabSnapshot } from './validation.js';
import { sampleRectangularSurface3D } from './surface-sampling.js';
import {
  analyzePolygon3D,
  createConeMesh3D,
  createCylinderMesh3D,
  createPrismMesh3D,
  createPyramidMesh3D,
  createRegularPolyhedronMesh3D,
  createSphereMesh3D,
  crossSectionSolidMesh3D,
  intersectLinePlane3D,
  intersectPlanes3D,
  linearTolerance3D,
  polygonNormal3D,
  prismHeight3D,
  pyramidHeight3D,
} from './solids.js';

export { assertGeometryLabInvariants, getGeometryLabInvariantIssues } from './invariants.js';
import { computeGeometryInvariants } from './gradable-invariants.js';
import type { GeometryInvariantId, GeometryInvariantReport } from './gradable-invariants.js';
import { checkGeometryGoal } from './goal-check.js';
import type { GeometryGoalCheck } from './goal-check.js';
import { detectGeometryConjectures } from './conjectures.js';
import type { GeometryConjectureOptions, GeometryConjectureReport } from './conjectures.js';
import { markGeometryExercise, nextGeometryHint } from './exercises.js';
import type { GeometryExercise, GeometryExerciseHint, GeometryExerciseMark } from './exercises.js';
import { formatGeometryConstructionProtocol, geometryConstructionProtocol } from './protocol.js';
import type { GeometryConstructionProtocol } from './protocol.js';
import { describeGeometryLabFigure, geometryLabFigureSummary } from './describe.js';

export { computeGeometryInvariants, RELATIVE_TOLERANCE } from './gradable-invariants.js';
export type { GeometryInvariantId, GeometryInvariantReport } from './gradable-invariants.js';
export { checkGeometryGoal } from './goal-check.js';
export type { GeometryGoalCheck } from './goal-check.js';
export { detectGeometryConjectures } from './conjectures.js';
export type { GeometryConjectureOptions, GeometryConjectureReport } from './conjectures.js';
export {
  geometryExerciseProgress,
  learnerGeometryExercise,
  markGeometryExercise,
  nextGeometryHint,
} from './exercises.js';
export type {
  GeometryExercise,
  GeometryExerciseAttempt,
  GeometryExerciseCriterion,
  GeometryExerciseCriterionResult,
  GeometryExerciseHint,
  GeometryExerciseLevel,
  GeometryExerciseMark,
  GeometryExerciseProgress,
  GeometryExerciseTask,
} from './exercises.js';
export { GEOMETRY_EXERCISE_BANK, geometryExercise } from './exercise-bank.js';
export {
  describeGeometryInvariant,
  describeGeometryLabFigure,
  geometryLabFigureSummary,
} from './describe.js';
export {
  GEOMETRY_TOOL_KEYS,
  KEYBOARD_COMPLETABLE_TOOLS,
  createGeometryKeyboardSession,
} from './keyboard.js';
export type {
  GeometryKeyModifiers,
  GeometryKeyPress,
  GeometryKeyboardOptions,
  GeometryKeyboardSession,
  GeometryKeyboardState,
} from './keyboard.js';
export { formatGeometryConstructionProtocol, geometryConstructionProtocol } from './protocol.js';
export type {
  GeometryConstructionProtocol,
  GeometryProtocolStep,
  GeometryProtocolStepKind,
} from './protocol.js';
export { compactGeometryLabDelta, compactGeometryLabSnapshot } from './persistence.js';
export { compileEquationSurface3D } from './equations.js';
export {
  applyGeometryLabDelta,
  createEmptyGeometryLabSnapshot,
  defaultGeometryCamera3D,
  reduceGeometryLabDelta,
} from './reducer.js';
export {
  canonicalizeGeometryLabSnapshot,
  validateGeometryLabDelta,
  validateGeometryLabSnapshot,
} from './validation.js';
export { validateGeometryLabCommand } from './commands.js';
export { DEFAULT_TRACE_CAPACITY, GeometryTrace } from './trace.js';
export { attachGeometryLabPointer } from './interaction.js';
export type { GeometryPointerAttachment, GeometryPointerOptions } from './interaction.js';
export { DEFAULT_PICK_RADIUS, GeometryHitIndex } from './hit-test.js';
export type { GeometryHit } from './hit-test.js';
export {
  geometryLabFigureGeometry,
  renderGeometryLabLatex,
  renderGeometryLabPdf,
  renderGeometryLabSvg2D,
  renderGeometryLabSvg3D,
} from './renderers.js';
export {
  assertGeometryLabDeltaComplexity,
  assertGeometryLabCommandComplexity,
  assertGeometryLabExportOutputComplexity,
  assertGeometryLabExportRequestComplexity,
  assertGeometryLabJsonInputComplexity,
  assertGeometryLabSnapshotComplexity,
  DEFAULT_GEOMETRY_LAB_COMPLEXITY_LIMITS,
  GEOMETRY_LAB_MAX_SURFACE_PROBE_EVALUATIONS,
  GEOMETRY_LAB_MAX_SURFACE_GRID_SAMPLES,
  GEOMETRY_LAB_MAX_SURFACE_SAMPLES_PER_AXIS,
  GEOMETRY_LAB_SURFACE_CONTINUITY_SUBDIVISIONS,
  estimateGeometryLabSurfaceProbeEvaluations,
  preflightGeometryLabDeltaComplexity,
  preflightGeometryLabCommandComplexity,
  preflightGeometryLabExportOutputComplexity,
  preflightGeometryLabExportRequestComplexity,
  preflightGeometryLabJsonInputComplexity,
  preflightGeometryLabSnapshotComplexity,
  resolveGeometryLabComplexityLimits,
} from './complexity.js';
export type {
  GeometryLabComplexityIssue,
  GeometryLabComplexityIssueCode,
  GeometryLabComplexityLimits,
  GeometryLabComplexityResult,
} from './complexity.js';
export { GeometryLabCanonicalizationError } from './canonicalize.js';
export type { GeometryLabCanonicalizationErrorCode } from './canonicalize.js';
export {
  DEFAULT_SURFACE_DISCONTINUITY_POLICY_3D,
  sampleRectangularSurface3D,
  surfaceGridIndex3D,
} from './surface-sampling.js';
export type {
  RectangularSurfaceSamplingInput3D,
  SampledRectangularSurface3D,
  SurfaceDiscontinuityPolicy3D,
  SurfaceGridSampleValidity3D,
  SurfaceQuadFace3D,
  SurfaceSamplingAxis3D,
  SurfaceSamplingDiagnostics3D,
  SurfaceSamplingGrid3D,
} from './surface-sampling.js';
export {
  buildGeometryLabDependencyGraph,
  geometryLabDependencyKey,
  geometryLabDependencyRefsForId,
  geometryLabStoredCollections,
  planGeometryLabCascadeDeletion,
} from './dependencies.js';
export type {
  GeometryLabCascadeDeletePlan,
  GeometryLabDeleteBlocker,
  GeometryLabDependencyCollection,
  GeometryLabDependencyDeletePolicy,
  GeometryLabDependencyEdge,
  GeometryLabDependencyGraph,
  GeometryLabDependencyKey,
  GeometryLabDependencyNode,
  GeometryLabDependencyRef,
  GeometryLabDependencyRelation,
  GeometryLabNodeDeletePolicy,
  GeometryLabOwnershipConflict,
  GeometryLabOwnershipEdge,
  GeometryLabOwnershipRelation,
  GeometryLabStoredCollection,
  GeometryLabUnresolvedDependency,
} from './dependencies.js';
export type {
  CompiledEquationSurface3D,
  CrossSectionEntity,
  CurveEntity3D,
  EquationAxis3D,
  EquationSurfaceInput3D,
  GeometryCameraPreset3D,
  GeometryEntity3D,
  GeometryLab,
  GeometryLabAppState,
  GeometryLabCameraPayload,
  GeometryLabCommand,
  GeometryLabDeletePayload,
  GeometryLabDelta,
  GeometryLabEquationSurfacePayload,
  GeometryLabHistoryPatch,
  GeometryLabHistoryRef,
  GeometryLabHistoryValue,
  GeometryLabMeasurementPayload,
  GeometryLabPointPayload,
  GeometryLabReductionResult,
  GeometryLabScene,
  GeometryLabSegmentPayload,
  GeometryLabSnapshot,
  GeometryLabSolidPayload,
  GeometryLabStylePayload,
  GeometryLabStyleOptions,
  GeometryLabSurfacePayload,
  GeometryLabTool,
  GeometryLabUpdateEquationSurfacePayload,
  GeometryLabVectorPayload,
  GeometryPolyhedronKind,
  GeometryScene2D,
  GeometryScene3D,
  GeometrySceneLink,
  GeometrySelection,
  Measurement3D,
  MeasurementSource3D,
  ParametricCurve3DInput,
  SolidCreationOptions,
  SolidEdge3D,
  SolidEntity,
  SolidFace3D,
  SolidNet3D,
  SolidNetFace2D,
  SolidParameters3D,
  SurfaceEntity3D,
  SurfaceZInput3D,
  WorkPlane3D,
  WorkPlaneSource3D,
} from './types.js';
/** Geometry Lab factory options layered over the common instrument options. */
export type GeometryLabOptions = InstrumentOptions<GeometryLabSnapshot, GeometryLabDelta> & {
  /** Stable collaboration actor identity. A random opaque actor is generated when omitted. */
  actorId?: string;
  /** Initial host-facing view mode for a newly-created document. Ignored when initialSnapshot is supplied. */
  initialView?: GeometryLabAppState['activeView'];
  /** Maximum local semantic undo entries retained in memory. Zero disables history. */
  historyLimit?: number;
  /** Maximum serialized weight retained across local undo/redo entries. */
  historyByteLimit?: number;
  /** Optional resource-budget overrides for snapshots, deltas, sampling, exports, and history. */
  complexityLimits?: Partial<GeometryLabComplexityLimits>;
  /**
   * Whether a mounted figure responds to a pointer and a keyboard.
   *
   * <p>Off by default, and that is about not surprising the hosts that already
   * have their own layer rather than about doubting this one: a second set of
   * listeners on the same element would handle every click twice. A host with
   * nothing of its own asks for it here and gets a usable tool; one with its own
   * layer keeps it, and can still reach `attachGeometryLabPointer` directly.
   */
  interactive?: boolean | GeometryPointerOptions;
};

const GEOMETRY_LAB_TOOLS: ReadonlySet<string> = new Set([
  'select', 'pan', 'orbit', 'point', 'segment', 'polygon', 'circle', 'angle', 'stamp',
  'midpoint', 'perpendicular', 'parallel', 'bisector', 'label', 'color', 'hide', 'cut',
  'scale', 'rotate', 'solid', 'workPlane', 'crossSection', 'net', 'equation', 'remove',
]);
const GEOMETRY_LAB_CAMERA_PRESETS: ReadonlySet<string> = new Set(['front', 'top', 'side', 'isometric']);
const GEOMETRY_LAB_ACTIVE_VIEWS: ReadonlySet<string> = new Set(['2d', '3d', 'split']);
const GEOMETRY_LAB_DELTA_SOURCES: ReadonlySet<string> = new Set(['local', 'remote', 'history', 'import']);

function isGeometryLabTool(value: unknown): value is GeometryLabTool {
  return typeof value === 'string' && GEOMETRY_LAB_TOOLS.has(value);
}

function validateGeometryLabApplyOptions(
  options: unknown,
  complexityLimits: Readonly<GeometryLabComplexityLimits> = DEFAULT_GEOMETRY_LAB_COMPLEXITY_LIMITS,
): DeltaMeta['source'] {
  const issues: Array<{ path: string; message: string }> = [];
  if (!isRecord(options)) {
    throw new KleinSdkError('invalid_apply_options', 'Geometry Lab apply options must be an object.');
  }
  for (const key of Object.keys(options)) {
    if (key !== 'emit' && key !== 'meta') issues.push({ path: key, message: `Unknown apply option "${key}".` });
  }
  if (Object.hasOwn(options, 'emit') && typeof options.emit !== 'boolean') {
    issues.push({ path: 'emit', message: 'Apply option emit must be a boolean.' });
  }

  const meta = options.meta;
  if (meta !== undefined && !isRecord(meta)) {
    issues.push({ path: 'meta', message: 'Delta metadata must be an object.' });
  }
  if (isRecord(meta)) {
    for (const key of Object.keys(meta)) {
      if (!['id', 'actorId', 'createdAt', 'source'].includes(key)) {
        issues.push({ path: `meta.${key}`, message: `Unknown delta metadata property "${key}".` });
      }
    }
    if (Object.hasOwn(meta, 'id') && (typeof meta.id !== 'string' || meta.id.length === 0)) {
      issues.push({ path: 'meta.id', message: 'Delta metadata id must be a non-empty string.' });
    } else if (typeof meta.id === 'string' && meta.id.length > complexityLimits.maxIdChars) {
      issues.push({ path: 'meta.id', message: `Delta metadata id cannot exceed ${complexityLimits.maxIdChars} characters.` });
    }
    if (Object.hasOwn(meta, 'actorId') && (typeof meta.actorId !== 'string' || meta.actorId.length === 0)) {
      issues.push({ path: 'meta.actorId', message: 'Delta metadata actorId must be a non-empty string.' });
    } else if (typeof meta.actorId === 'string' && meta.actorId.length > complexityLimits.maxIdChars) {
      issues.push({ path: 'meta.actorId', message: `Delta metadata actorId cannot exceed ${complexityLimits.maxIdChars} characters.` });
    }
    if (Object.hasOwn(meta, 'createdAt') && (typeof meta.createdAt !== 'number' || !Number.isFinite(meta.createdAt))) {
      issues.push({ path: 'meta.createdAt', message: 'Delta metadata createdAt must be finite.' });
    }
    if (Object.hasOwn(meta, 'source') && (typeof meta.source !== 'string' || !GEOMETRY_LAB_DELTA_SOURCES.has(meta.source))) {
      issues.push({ path: 'meta.source', message: 'Delta metadata source is invalid.' });
    }
  }
  if (issues.length) {
    throw new KleinSdkError(
      'invalid_delta_meta',
      'Geometry Lab delta metadata is invalid.',
      issues as unknown as JsonValue,
    );
  }
  return isRecord(meta) && typeof meta.source === 'string'
    ? meta.source as DeltaMeta['source']
    : 'local';
}

export function parseGeometryLabSnapshotJson(
  input: string | JsonValue,
  complexityLimits: Partial<GeometryLabComplexityLimits> = {},
): GeometryLabSnapshot {
  if (typeof input === 'string') assertGeometryLabJsonInputComplexity(input, complexityLimits);
  let parsed: unknown;
  try {
    parsed = typeof input === 'string' ? JSON.parse(input) as unknown : input;
  } catch (error) {
    throw new KleinSdkError(
      'invalid_json',
      error instanceof Error ? error.message : 'Geometry Lab JSON could not be parsed.',
    );
  }
  const candidate = isRecord(parsed) && !Object.hasOwn(parsed, 'appState')
    ? { ...parsed, appState: createEmptyGeometryLabSnapshot().appState }
    : parsed;
  assertGeometryLabSnapshotComplexity(candidate, complexityLimits);
  const validation = validateGeometryLabSnapshot(candidate, complexityLimits);
  if (!validation.ok) {
    throw new KleinSdkError('invalid_snapshot', 'Geometry Lab snapshot is invalid.', validation.issues as unknown as JsonValue);
  }
  return normalizeGeometryLabSnapshot(validation.value);
}

/** Creates the framework-independent Geometry Lab instrument. */
export function createGeometryLab(
  options: GeometryLabOptions = {},
): GeometryLab {
  const instrument = new GeometryLabInstrument(options);
  if (options.container) instrument.mount(options.container);
  return instrument;
}

export function createGeometryLabRuntime(
  options: GeometryLabOptions = {},
): KleinToolRuntime<GeometryLabSnapshot, GeometryLabDelta, GeometryLabCommand> {
  const complexityLimits = resolveGeometryLabComplexityLimits(options.complexityLimits);
  return createInstrumentRuntime({
    toolKey: 'geometry-lab',
    instrument: createGeometryLab(options),
    validateSnapshot: value => validateGeometryLabSnapshot(value, complexityLimits),
    validateDelta: value => validateGeometryLabDelta(value, complexityLimits),
    execute: (instrument, command) => executeGeometryLabCommand(instrument, command, complexityLimits),
  });
}

class GeometryLabInstrument implements GeometryLab {
  readonly id: string;
  readonly kind = 'geometry-lab';
  readonly actorId: string;

  #ids: IdFactory;
  #snapshot: GeometryLabSnapshot;
  #options: Pick<GeometryLabOptions, 'readOnly' | 'onDelta' | 'onError'>;
  #deltaListeners = new Set<(delta: GeometryLabDelta, meta: DeltaMeta) => void>();
  #root: HTMLElement | undefined;
  #pointer: GeometryPointerAttachment | undefined;
  readonly #traces = new Map<string, GeometryTrace>();
  readonly #interactive: boolean | GeometryPointerOptions;
  #undoStack: GeometryLabHistoryEntry[] = [];
  #redoStack: GeometryLabHistoryEntry[] = [];
  #historyLimit: number;
  #historyByteLimit: number;
  #historyBytes = 0;
  #complexityLimits: Readonly<GeometryLabComplexityLimits>;
  #renderComplexityLimits: Readonly<GeometryLabComplexityLimits>;

  constructor(options: GeometryLabOptions) {
    const untypedOptions = options as GeometryLabOptions & Record<string, unknown>;
    const unsupportedOption = ['renderer3d', 'snapEnabled']
      .find(option => Object.hasOwn(untypedOptions, option));
    if (unsupportedOption !== undefined) {
      throw new KleinSdkError(
        'unsupported_geometry_lab_option',
        `Geometry Lab option "${unsupportedOption}" is not supported. Renderer selection is host-owned; snapping is a setting on "interactive".`,
      );
    }
    if (options.initialView !== undefined && !GEOMETRY_LAB_ACTIVE_VIEWS.has(options.initialView)) {
      throw new KleinSdkError(
        'invalid_geometry_lab_option',
        `Unsupported Geometry Lab initialView "${String(options.initialView)}". Use "2d", "3d", or "split".`,
      );
    }
    this.#interactive = options.interactive ?? false;
    this.#complexityLimits = resolveGeometryLabComplexityLimits(options.complexityLimits);
    this.actorId = geometryLabActorId(options.actorId, this.#complexityLimits.maxIdChars);
    this.#ids = createGeometryLabIdFactory(this.actorId);
    this.id = this.#ids.next('geometry-lab');
    this.#options = {};
    if (options.readOnly !== undefined) this.#options.readOnly = options.readOnly;
    if (options.onDelta !== undefined) this.#options.onDelta = options.onDelta;
    if (options.onError !== undefined) this.#options.onError = options.onError;
    this.#renderComplexityLimits = resolveGeometryLabComplexityLimits({
      ...this.#complexityLimits,
      maxExportWidth: Math.max(DEFAULT_GEOMETRY_LAB_COMPLEXITY_LIMITS.maxExportWidth, this.#complexityLimits.maxExportWidth),
      maxExportHeight: Math.max(DEFAULT_GEOMETRY_LAB_COMPLEXITY_LIMITS.maxExportHeight, this.#complexityLimits.maxExportHeight),
      maxExportPixelArea: Math.max(DEFAULT_GEOMETRY_LAB_COMPLEXITY_LIMITS.maxExportPixelArea, this.#complexityLimits.maxExportPixelArea),
      maxExportScale: Math.max(DEFAULT_GEOMETRY_LAB_COMPLEXITY_LIMITS.maxExportScale, this.#complexityLimits.maxExportScale),
      maxExportPrimitives: Math.max(DEFAULT_GEOMETRY_LAB_COMPLEXITY_LIMITS.maxExportPrimitives, this.#complexityLimits.maxExportPrimitives),
      maxExportVertexReferences: Math.max(DEFAULT_GEOMETRY_LAB_COMPLEXITY_LIMITS.maxExportVertexReferences, this.#complexityLimits.maxExportVertexReferences),
      maxExportBytes: Math.max(DEFAULT_GEOMETRY_LAB_COMPLEXITY_LIMITS.maxExportBytes, this.#complexityLimits.maxExportBytes),
    });
    const historyLimit = options.historyLimit ?? this.#complexityLimits.maxHistoryEntries;
    const historyByteLimit = options.historyByteLimit ?? this.#complexityLimits.maxHistoryBytes;
    if (
      !Number.isSafeInteger(historyLimit)
      || historyLimit < 0
      || historyLimit > this.#complexityLimits.maxHistoryEntries
    ) {
      throw new KleinSdkError(
        'invalid_history_limit',
        `Geometry Lab historyLimit must be a non-negative safe integer no greater than ${this.#complexityLimits.maxHistoryEntries}.`,
      );
    }
    if (
      !Number.isSafeInteger(historyByteLimit)
      || historyByteLimit < 0
      || historyByteLimit > this.#complexityLimits.maxHistoryBytes
    ) {
      throw new KleinSdkError(
        'invalid_history_limit',
        `Geometry Lab historyByteLimit must be a non-negative safe integer no greater than ${this.#complexityLimits.maxHistoryBytes}.`,
      );
    }
    this.#historyLimit = historyLimit;
    this.#historyByteLimit = historyByteLimit;
    const initial = options.initialSnapshot ?? createEmptyGeometryLabSnapshot();
    assertGeometryLabSnapshotComplexity(initial, this.#complexityLimits);
    const validation = validateGeometryLabSnapshot(initial, this.#complexityLimits);
    if (!validation.ok) {
      throw new KleinSdkError(
        'invalid_initial_snapshot',
        'Initial Geometry Lab snapshot is invalid.',
        validation.issues as unknown as JsonValue,
      );
    }
    this.#snapshot = normalizeGeometryLabSnapshot(validation.value);
    if (!options.initialSnapshot && options.initialView) {
      this.#snapshot = {
        ...this.#snapshot,
        appState: { ...this.#snapshot.appState, activeView: options.initialView },
      };
    }
  }

  mount(container: HTMLElement): void {
    this.destroy();
    const root = container.ownerDocument.createElement('div');
    root.dataset.kleinInstrument = this.kind;
    root.dataset.kleinInstrumentId = this.id;
    root.className = 'klein-geometry-lab-root';
    container.appendChild(root);
    this.#root = root;
    try {
      this.#render();
    } catch (error) {
      this.destroy();
      throw error;
    }
    if (this.#interactive !== false) {
      this.#pointer = attachGeometryLabPointer(
        this,
        root,
        this.#interactive === true ? {} : this.#interactive,
      );
    }
  }

  destroy(): void {
    this.#pointer?.detach();
    this.#pointer = undefined;
    this.#root?.remove();
    this.#root = undefined;
  }

  /** The pointer and keyboard session on the mounted figure, if there is one. */
  get interaction(): GeometryPointerAttachment | undefined {
    return this.#pointer;
  }

  /**
   * An isolated, mutable copy of the current snapshot. Writing into what this
   * returns never affects the instrument, and that is a tested guarantee.
   */
  getSnapshot(): GeometryLabSnapshot {
    return cloneSnapshot(this.#snapshot);
  }

  /**
   * The current snapshot without copying it, for callers that only read.
   *
   * <p>{@link getSnapshot} deep-clones through
   * `JSON.parse(JSON.stringify(...))`: 0.5 ms on a 500-point scene, and 11.7 ms
   * and 6.7 MB on one holding four sampled surfaces. A host redrawing from
   * state pays that per frame, for isolation it does not use.
   *
   * <p>Sharing is safe on this side - the reducer is copy-on-write and the
   * instrument only ever replaces the whole snapshot, never writes into one -
   * so the only hazard is a caller writing into what it receives. The
   * containers are frozen so that fails loudly rather than silently corrupting
   * instrument state: adding, replacing or deleting a record throws. Writing
   * into an individual point or entity is *not* caught, because deep-freezing
   * the surface scene above costs 30 ms, which would defeat the purpose.
   *
   * <p>So: read from this, and if you need to write, use {@link getSnapshot}.
   */
  peekSnapshot(): Readonly<GeometryLabSnapshot> {
    return freezeGeometryLabSnapshotShell(this.#snapshot);
  }

  /** What the figure establishes, as facts a mark scheme can name. */
  getInvariants(): GeometryInvariantReport {
    return computeGeometryInvariants(this.#snapshot);
  }

  /**
   * Checks the figure against the facts it was asked to establish, and says
   * which of them are absent - which is the half a hint is built from.
   */
  checkGoal(targetInvariants: readonly GeometryInvariantId[]): GeometryGoalCheck {
    return checkGeometryGoal(this.#snapshot, targetInvariants, this.getInvariants());
  }

  /** Marks the figure against an exercise, key and rubric included. */
  markExercise(exercise: GeometryExercise): GeometryExerciseMark {
    return markGeometryExercise(exercise, this.#snapshot);
  }

  /**
   * The next thing to say to a student who is stuck on this exercise, chosen
   * from what their figure is actually missing.
   */
  nextHint(exercise: GeometryExercise, released: readonly string[] = []): GeometryExerciseHint | null {
    return nextGeometryHint(exercise, this.#snapshot, released);
  }

  /**
   * Which of the figure's facts are true of the construction rather than of
   * this configuration of it.
   *
   * <p>Costs several recomputations of the whole figure, so it belongs where a
   * marker asks a question - an idle callback, a worker, a "check" button -
   * and never in a drag.
   */
  detectConjectures(options: GeometryConjectureOptions = {}): GeometryConjectureReport {
    return detectGeometryConjectures(this.#snapshot, options);
  }

  /**
   * How the figure was built, derived from the provenance it already carries.
   *
   * <p>A protocol of the figure as it stands rather than a log of what was done
   * to it, so it cannot go stale and costs nothing until it is asked for.
   */
  getConstructionProtocol(): GeometryConstructionProtocol {
    return geometryConstructionProtocol(this.#snapshot);
  }

  /** The protocol as numbered lines, which is how one is read on paper. */
  formatConstructionProtocol(): string {
    return formatGeometryConstructionProtocol(this.getConstructionProtocol());
  }

  /**
   * Starts keeping a record of where a point goes.
   *
   * <p>Kept on the instrument rather than in the document: a trace is what this
   * session did, not a property of the figure, and putting it in the snapshot
   * would send it through undo, the history diff and every collaborative
   * message for something nobody opening the file later would want.
   */
  startTrace2D(pointId: string, capacity: number = DEFAULT_TRACE_CAPACITY): void {
    this.#require2DPoint(pointId);
    const point = this.#snapshot.scene.scene2d.points[pointId] as GeometryPoint2D;
    const trace = new GeometryTrace(capacity);
    trace.record({ x: point.x, y: point.y });
    this.#traces.set(pointId, trace);
  }

  /** Stops recording, and forgets what was recorded. */
  stopTrace2D(pointId: string): void {
    this.#traces.delete(pointId);
  }

  /** Where the point has been, oldest first, or nothing if it is not traced. */
  getTrace2D(pointId: string): GeometryTrace | undefined {
    return this.#traces.get(pointId);
  }

  /** Every point being traced. */
  tracedPointIds(): string[] {
    return [...this.#traces.keys()].sort();
  }

  /**
   * Adds each traced point's new position, once per commit.
   *
   * <p>Per commit rather than per frame, because a commit is what a change is:
   * a drag that moves nothing records nothing, and the ring drops a repeat of
   * the position it already holds.
   */
  #recordTraces(): void {
    if (this.#traces.size === 0) return;
    const points = this.#snapshot.scene.scene2d.points;
    for (const [id, trace] of this.#traces) {
      const point = points[id];
      // A traced point that has been deleted stops being traced, rather than
      // keeping a buffer nothing will ever write to again.
      if (!point || point.kind !== 'point2d') { this.#traces.delete(id); continue; }
      trace.record({ x: point.x, y: point.y });
    }
  }

  /**
   * The figure in words: what it holds, how it was built, what it establishes
   * and what has been measured. The same text `export({ format: 'text' })`
   * produces.
   */
  describe(): string {
    return describeGeometryLabFigure(this.#snapshot);
  }

  /** One sentence naming what the figure holds. */
  summarize(): string {
    return geometryLabFigureSummary(this.#snapshot);
  }

  subscribeDelta(listener: (delta: GeometryLabDelta, meta: DeltaMeta) => void): () => void {
    this.#deltaListeners.add(listener);
    return () => this.#deltaListeners.delete(listener);
  }

  loadSnapshot(snapshot: GeometryLabSnapshot, options: LoadOptions = {}): void {
    assertGeometryLabSnapshotComplexity(snapshot, this.#complexityLimits);
    const validation = validateGeometryLabSnapshot(snapshot, this.#complexityLimits);
    if (!validation.ok) {
      throw new KleinSdkError(
        'invalid_snapshot',
        'Geometry Lab snapshot is invalid.',
        validation.issues as unknown as JsonValue,
      );
    }
    const currentView2d = this.#snapshot.appState.view2d;
    const currentView3d = this.#snapshot.appState.view3d;
    let next = normalizeGeometryLabSnapshot(validation.value);
    if (options.preserveView) {
      next = {
        ...next,
        appState: {
          ...next.appState,
          view2d: { ...currentView2d },
          view3d: { ...currentView3d },
        },
      };
    }
    try {
      this.#renderSnapshot(next);
    } catch (error) {
      const sdkError = geometryLabSdkError(error, 'geometry_lab_render_failed');
      this.#notifyError(sdkError);
      throw sdkError;
    }
    this.#snapshot = next;
    // A different document is a different figure, so what the last one's points
    // did is not this one's history.
    for (const trace of this.#traces.values()) trace.clear();
    this.#undoStack = [];
    this.#redoStack = [];
    this.#historyBytes = 0;
  }

  importJson(input: string | JsonValue, options: LoadOptions = {}): void {
    this.loadSnapshot(parseGeometryLabSnapshotJson(input, this.#complexityLimits), options);
  }

  applyDelta(delta: GeometryLabDelta, options: ApplyDeltaOptions = {}): boolean {
    assertGeometryLabDeltaComplexity(delta, this.#complexityLimits);
    const validation = validateGeometryLabDelta(delta, this.#complexityLimits);
    if (!validation.ok) {
      throw new KleinSdkError(
        'invalid_delta',
        'Geometry Lab delta is invalid.',
        validation.issues as unknown as JsonValue,
      );
    }
    const source = validateGeometryLabApplyOptions(options, this.#complexityLimits);
    const emit = options.emit ?? source === 'local';
    const trustedSynchronization = source !== 'local' && emit === false;
    if (this.#options.readOnly && !trustedSynchronization) {
      throw new KleinSdkError(
        'read_only',
        'Read-only Geometry Lab deltas require a non-local source and emit: false.',
      );
    }
    const commitOptions: {
      emit?: boolean;
      invalidateHistory?: boolean;
      meta?: Partial<DeltaMeta>;
      recordHistory?: boolean;
    } = {
      emit,
      invalidateHistory: source !== 'local',
      recordHistory: source === 'local',
    };
    if (options.meta !== undefined) commitOptions.meta = options.meta;
    return this.#commitDelta(validation.value, commitOptions);
  }

  setTool(tool: GeometryLabTool): void {
    if (!isGeometryLabTool(tool)) {
      throw new KleinSdkError('invalid_tool', `Unsupported Geometry Lab tool "${String(tool)}".`);
    }
    this.#commitDelta({ op: 'setAppState', changes: { activeTool: tool } }, {
      emit: false,
      recordHistory: false,
    });
  }

  undo(): void {
    while (this.#undoStack.length) {
      const entry = this.#undoStack[this.#undoStack.length - 1];
      if (!entry) return;
      const changed = this.#commitDelta(geometryLabHistoryDelta(entry, 'undo'), {
        emit: true,
        invalidateHistory: false,
        meta: { actorId: this.actorId, source: 'history' },
        recordHistory: false,
      });
      this.#undoStack.pop();
      if (!changed) {
        this.#historyBytes -= entry.serializedBytes;
        continue;
      }
      this.#redoStack.push(entry);
      return;
    }
  }

  redo(): void {
    while (this.#redoStack.length) {
      const entry = this.#redoStack[this.#redoStack.length - 1];
      if (!entry) return;
      const changed = this.#commitDelta(geometryLabHistoryDelta(entry, 'redo'), {
        emit: true,
        invalidateHistory: false,
        meta: { actorId: this.actorId, source: 'history' },
        recordHistory: false,
      });
      this.#redoStack.pop();
      if (!changed) {
        this.#historyBytes -= entry.serializedBytes;
        continue;
      }
      this.#undoStack.push(entry);
      return;
    }
  }

  async export(options: ExportOptions): Promise<ExportResult> {
    assertGeometryLabExportRequestComplexity(options, this.#snapshot, this.#complexityLimits);
    if (options.format === 'json') {
      const data = geometryLabSnapshotJson(this.#snapshot, options.includeAppState !== false);
      assertGeometryLabExportOutputComplexity(JSON.stringify(data), this.#complexityLimits);
      return {
        format: 'json',
        mimeType: 'application/json',
        data,
      };
    }
    if (options.format === 'svg') {
      const data = rendersTwoDimensionalScene(this.#snapshot)
        ? renderGeometryLabSvg2D(this.#snapshot, options, this.#complexityLimits)
        : renderGeometryLabSvg3D(this.#snapshot, options, this.#complexityLimits);
      assertGeometryLabExportOutputComplexity(data, this.#complexityLimits);
      return {
        format: 'svg',
        mimeType: 'image/svg+xml',
        data,
      };
    }
    if (options.format === 'png' || options.format === 'thumbnail') {
      // Rasterized from the SVG rather than drawn again: a PNG that did not
      // match the SVG would be two pictures of one figure. Browser-only, and
      // the failure says so rather than producing an empty image.
      const width = Math.max(1, Math.round(options.width ?? (options.format === 'thumbnail' ? 320 : 640)));
      const height = Math.max(1, Math.round(options.height ?? (options.format === 'thumbnail' ? 200 : 480)));
      const svg = rendersTwoDimensionalScene(this.#snapshot)
        ? renderGeometryLabSvg2D(this.#snapshot, { ...options, width, height }, this.#complexityLimits)
        : renderGeometryLabSvg3D(this.#snapshot, { ...options, width, height }, this.#complexityLimits);
      const data = await svgToPngBlob(svg, { width, height });
      return { format: options.format, mimeType: 'image/png', data } as ExportResult;
    }
    if (options.format === 'pdf') {
      const data = renderGeometryLabPdf(this.#snapshot, options, this.#complexityLimits);
      return {
        format: 'pdf',
        mimeType: 'application/pdf',
        data: new Blob([data], { type: 'application/pdf' }),
      };
    }
    if (options.format === 'latex') {
      const data = renderGeometryLabLatex(this.#snapshot, options, this.#complexityLimits);
      return { format: 'latex', mimeType: 'application/x-latex', data };
    }
    if (options.format === 'text') {
      const data = describeGeometryLabFigure(this.#snapshot);
      assertGeometryLabExportOutputComplexity(data, this.#complexityLimits);
      return {
        format: 'text',
        mimeType: 'text/plain',
        data,
      };
    }

    throw new KleinSdkError(
      'unsupported_export',
      `Geometry Lab does not support ${options.format} export yet.`,
    );
  }

  /* ---------------------------------------------------------------------- */
  /* 2D construction                                                        */
  /* ---------------------------------------------------------------------- */

  /**
   * The Lab declares 2D tools - point, segment, polygon, circle, angle,
   * midpoint, perpendicular, parallel, bisector - and until now offered no way
   * to use any of them: every method on the instrument was 3D, so a host had to
   * hand-assemble raw `addPoint2D` and `addEntity2D` deltas and get the
   * construction metadata right itself.
   *
   * <p>The geometry behind these lives in geometry-core and is shared with the
   * Geometry Calculator, so the two instruments cannot drift about what a
   * perpendicular is. What stays here is what is genuinely local: id prefixes,
   * the Lab's delta shape, and its error codes.
   */
  addPoint2D(point: Vector2 & GeometryLabStyleOptions): string {
    this.#assertWritable();
    const created: GeometryPoint2D = {
      id: this.#ids.next('p2'),
      kind: 'point2d',
      x: finiteNumber(point.x, 'Point x'),
      y: finiteNumber(point.y, 'Point y'),
    };
    if (point.label !== undefined) created.label = point.label;
    if (point.color !== undefined) created.color = point.color;
    if (point.hidden !== undefined) created.hidden = point.hidden;
    if (point.locked !== undefined) created.locked = point.locked;
    this.#commitDelta({ op: 'addPoint2D', point: created });
    return created.id;
  }

  addSegment2D(firstPointId: string, secondPointId: string, style: GeometryLabStyleOptions = {}): string {
    return this.#addLinear2D('segment', 'seg2', firstPointId, secondPointId, style);
  }

  addRay2D(firstPointId: string, secondPointId: string, style: GeometryLabStyleOptions = {}): string {
    return this.#addLinear2D('ray', 'ray2', firstPointId, secondPointId, style);
  }

  addVector2D(firstPointId: string, secondPointId: string, style: GeometryLabStyleOptions = {}): string {
    return this.#addLinear2D('vector', 'vec2', firstPointId, secondPointId, style);
  }

  addLine2D(firstPointId: string, secondPointId: string, style: GeometryLabStyleOptions = {}): string {
    this.#assertWritable();
    return this.#commit2DConstruction(
      buildLineThroughPoints2D(
        this.#snapshot.scene.scene2d,
        this.#require2DPoint(firstPointId),
        this.#require2DPoint(secondPointId),
        (prefix: string) => this.#ids.next(prefix),
      ),
      style,
      'invalid_line',
      'A line needs two distinct 2D points.',
    );
  }

  addPolygon2D(pointIds: string[], style: GeometryLabStyleOptions = {}): string {
    this.#assertWritable();
    this.#assertInputCount('Polygon points', pointIds.length, this.#complexityLimits.maxSolidFaceVertices);
    if (pointIds.length < 3) {
      throw new KleinSdkError('invalid_polygon', 'A polygon needs at least three 2D points.');
    }
    const resolved = pointIds.map(id => this.#require2DPoint(id));
    if (new Set(resolved).size !== resolved.length) {
      throw new KleinSdkError('invalid_polygon', 'A polygon cannot repeat a point.');
    }
    const entity = withEntity2DStyle<PolygonEntity>({
      id: this.#ids.next('poly2'),
      kind: 'polygon',
      pointIds: resolved,
    }, style);
    this.#commitDelta({ op: 'addEntity2D', entity });
    return entity.id;
  }

  addAngle2D(pointIds: [string, string, string], style: GeometryLabStyleOptions = {}): string {
    this.#assertWritable();
    const resolved = pointIds.map(id => this.#require2DPoint(id)) as [string, string, string];
    if (resolved[0] === resolved[1] || resolved[1] === resolved[2]) {
      throw new KleinSdkError('invalid_angle', 'An angle needs a vertex distinct from both arms.');
    }
    const entity = withEntity2DStyle<AngleEntity>({
      id: this.#ids.next('ang2'),
      kind: 'angle',
      pointIds: resolved,
    }, style);
    this.#commitDelta({ op: 'addEntity2D', entity });
    return entity.id;
  }

  addMidpoint2D(firstPointId: string, secondPointId: string, style: GeometryLabStyleOptions = {}): string {
    this.#assertWritable();
    return this.#commit2DConstruction(
      buildMidpoint2D(
        this.#snapshot.scene.scene2d,
        this.#require2DPoint(firstPointId),
        this.#require2DPoint(secondPointId),
        (prefix: string) => this.#ids.next(prefix),
      ),
      style,
      'invalid_midpoint',
      'A midpoint needs two distinct 2D points.',
    );
  }

  addIntersection2D(
    firstEntityId: string,
    secondEntityId: string,
    style: GeometryLabStyleOptions = {},
    index = 0,
  ): string {
    this.#assertWritable();
    return this.#commit2DConstruction(
      buildIntersection2D(
        this.#snapshot.scene.scene2d,
        this.#require2DEntity(firstEntityId),
        this.#require2DEntity(secondEntityId),
        (prefix: string) => this.#ids.next(prefix),
        index,
      ),
      style,
      'invalid_intersection',
      'Those objects do not meet at that intersection.',
    );
  }

  addParallelLine2D(sourceEntityId: string, throughPointId: string, style: GeometryLabStyleOptions = {}): string {
    return this.#addConstructedLine2D('parallelLine', sourceEntityId, throughPointId, style);
  }

  addPerpendicularLine2D(sourceEntityId: string, throughPointId: string, style: GeometryLabStyleOptions = {}): string {
    return this.#addConstructedLine2D('perpendicularLine', sourceEntityId, throughPointId, style);
  }

  addAngleBisector2D(pointIds: [string, string, string], style: GeometryLabStyleOptions = {}): string {
    this.#assertWritable();
    const resolved = pointIds.map(id => this.#require2DPoint(id)) as [string, string, string];
    return this.#commit2DConstruction(
      buildAngleBisector2D(this.#snapshot.scene.scene2d, resolved, (prefix: string) => this.#ids.next(prefix)),
      style,
      'invalid_bisector',
      'That angle has no bisector.',
    );
  }

  addCircle2D(centerPointId: string, radiusPointId: string, style: GeometryLabStyleOptions = {}): string {
    this.#assertWritable();
    return this.#commit2DConstruction(
      buildCircleByCenterPoint2D(
        this.#snapshot.scene.scene2d,
        this.#require2DPoint(centerPointId),
        this.#require2DPoint(radiusPointId),
        (prefix: string) => this.#ids.next(prefix),
      ),
      style,
      'invalid_circle',
      'A circle needs a centre and a distinct point on it.',
    );
  }

  addCircleThroughPoints2D(pointIds: [string, string, string], style: GeometryLabStyleOptions = {}): string {
    this.#assertWritable();
    const resolved = pointIds.map(id => this.#require2DPoint(id)) as [string, string, string];
    return this.#commit2DConstruction(
      buildCircleThroughPoints2D(this.#snapshot.scene.scene2d, resolved, (prefix: string) => this.#ids.next(prefix)),
      style,
      'invalid_circle',
      'Three collinear points do not define a circle.',
    );
  }

  #addLinear2D(
    kind: 'segment' | 'ray' | 'vector',
    prefix: string,
    firstPointId: string,
    secondPointId: string,
    style: GeometryLabStyleOptions,
  ): string {
    this.#assertWritable();
    const first = this.#require2DPoint(firstPointId);
    const second = this.#require2DPoint(secondPointId);
    if (first === second) {
      throw new KleinSdkError('invalid_segment', `A ${kind} needs two distinct 2D points.`);
    }
    const entity = withEntity2DStyle<SegmentEntity | RayEntity | VectorEntity>({
      id: this.#ids.next(prefix),
      kind,
      pointIds: [first, second],
    } as SegmentEntity | RayEntity | VectorEntity, style);
    this.#commitDelta({ op: 'addEntity2D', entity });
    return entity.id;
  }

  #addConstructedLine2D(
    kind: 'parallelLine' | 'perpendicularLine',
    sourceEntityId: string,
    throughPointId: string,
    style: GeometryLabStyleOptions,
  ): string {
    this.#assertWritable();
    return this.#commit2DConstruction(
      buildConstructedLine2D(
        this.#snapshot.scene.scene2d,
        kind,
        this.#require2DEntity(sourceEntityId),
        this.#require2DPoint(throughPointId),
        (prefix: string) => this.#ids.next(prefix),
      ),
      style,
      kind === 'parallelLine' ? 'invalid_parallel' : 'invalid_perpendicular',
      'That source has no direction to build from.',
    );
  }

  /**
   * Commits a shared builder's records as one atomic Lab delta.
   *
   * <p>Style is applied only to the primary object: helper points are hidden
   * scaffolding that hold a constructed line's direction, and colouring or
   * labelling them would put furniture in the object list that no one asked
   * for.
   */
  #commit2DConstruction(
    result: GeometryConstructionResult | null,
    style: GeometryLabStyleOptions,
    failureCode: string,
    failureMessage: string,
  ): string {
    if (!result) throw new KleinSdkError(failureCode, failureMessage);
    const deltas: GeometryLabDelta[] = [
      ...result.points.map(point => ({ op: 'addPoint2D' as const, point })),
      ...result.entities.map(entity => ({
        op: 'addEntity2D' as const,
        entity: entity.id === result.primaryId ? withEntity2DStyle(entity, style) : entity,
      })),
    ];
    // A construction whose primary object is a point still carries style.
    const styled = deltas.map(delta => (
      delta.op === 'addPoint2D' && delta.point.id === result.primaryId
        ? { ...delta, point: withPoint2DStyle(delta.point, style) }
        : delta
    ));
    this.#commitDelta({ op: 'batch', deltas: styled });
    return result.primaryId;
  }

  #require2DPoint(id: string): string {
    const point = this.#snapshot.scene.scene2d.points[id];
    if (!point || point.kind !== 'point2d') {
      throw new KleinSdkError('invalid_point_reference', `2D point "${id}" does not exist.`);
    }
    return id;
  }

  #require2DEntity(id: string): string {
    if (!this.#snapshot.scene.scene2d.entities[id]) {
      throw new KleinSdkError('invalid_entity_reference', `2D entity "${id}" does not exist.`);
    }
    return id;
  }

  addPoint3D(point: Vector3 & GeometryLabStyleOptions): string {
    this.#assertWritable();
    const created = this.#makePoint3D(point);
    this.#commitDelta({ op: 'addPoint3D', point: created });
    return created.id;
  }

  addSegment3D(firstPointId: string, secondPointId: string, style: GeometryLabStyleOptions = {}): string {
    this.#assertWritable();
    this.#requireDistinctPoint3D(firstPointId, secondPointId);
    const entity = withEntity3DStyle<SegmentEntity>({
      id: this.#ids.next('seg3'),
      kind: 'segment',
      pointIds: [firstPointId, secondPointId],
    }, style);
    this.#commitDelta({ op: 'addEntity3D', entity });
    return entity.id;
  }

  addLine3D(firstPointId: string, secondPointId: string, style: GeometryLabStyleOptions = {}): string {
    this.#assertWritable();
    this.#requireDistinctPoint3D(firstPointId, secondPointId);
    const entity = withEntity3DStyle<LineEntity>({
      id: this.#ids.next('line3'),
      kind: 'line',
      pointIds: [firstPointId, secondPointId],
    }, style);
    this.#commitDelta({ op: 'addEntity3D', entity });
    return entity.id;
  }

  addWorkPlaneByThreePoints(pointIds: [string, string, string], style: GeometryLabStyleOptions = {}): string {
    this.#assertWritable();
    const points = pointIds.map(pointId => this.#requirePoint3D(pointId)) as [GeometryPoint3D, GeometryPoint3D, GeometryPoint3D];
    const equation = planeEquationFrom3DPoints(points[0], points[1], points[2]);
    if (!equation) throw new KleinSdkError('invalid_plane', 'Work plane points must be non-collinear.');
    const plane = makeWorkPlane({
      id: this.#ids.next('wp'),
      equation,
      origin: points[0],
      preferredXAxis: subtract3(points[1], points[0]),
      style,
      source: { kind: 'threePoints', pointIds },
    });
    this.#commitDelta({ op: 'addWorkPlane', plane });
    return plane.id;
  }

  addWorkPlaneByPoints(pointIds: [string, string, string], style: GeometryLabStyleOptions = {}): string {
    return this.addWorkPlaneByThreePoints(pointIds, style);
  }

  addWorkPlaneByEquation(equation: GeometryPlaneEquation3D & { input?: string }, style: GeometryLabStyleOptions = {}): string {
    this.#assertWritable();
    const normalized = normalizeGeometryPlaneEquation3D(equation);
    if (!normalized) throw new KleinSdkError('invalid_plane_equation', 'Plane equation must have a non-zero normal.');
    const source: WorkPlaneSource3D = equation.input === undefined
      ? { kind: 'equation' }
      : { kind: 'equation', input: equation.input };
    const plane = makeWorkPlane({
      id: this.#ids.next('wp'),
      equation: normalized,
      style,
      source,
    });
    this.#commitDelta({ op: 'addWorkPlane', plane });
    return plane.id;
  }

  addWorkPlaneParallelToPlane(sourcePlaneId: string, through?: string | Vector3, style: GeometryLabStyleOptions = {}): string {
    this.#assertWritable();
    const source = this.#requirePlaneData(sourcePlaneId);
    const origin = this.#resolveThroughPoint(through) ?? source.origin;
    const equation = equationFromPointNormal(origin, source.normal);
    const planeSource: Extract<WorkPlaneSource3D, { kind: 'parallelPlane' }> = { kind: 'parallelPlane', sourcePlaneId };
    addWorkPlaneThroughSource(planeSource, through, origin);
    const plane = makeWorkPlane({
      id: this.#ids.next('wp'),
      equation,
      origin,
      preferredXAxis: source.xAxis,
      style,
      source: planeSource,
    });
    this.#commitDelta({ op: 'addWorkPlane', plane });
    return plane.id;
  }

  addWorkPlanePerpendicularToPlane(sourcePlaneId: string, through?: string | Vector3, style: GeometryLabStyleOptions = {}): string {
    this.#assertWritable();
    const source = this.#requirePlaneData(sourcePlaneId);
    const origin = this.#resolveThroughPoint(through) ?? source.origin;
    const normal = normalize3(source.xAxis) ?? basisForNormal(source.normal).xAxis;
    const equation = equationFromPointNormal(origin, normal);
    const planeSource: Extract<WorkPlaneSource3D, { kind: 'perpendicularPlane' }> = { kind: 'perpendicularPlane', sourcePlaneId };
    addWorkPlaneThroughSource(planeSource, through, origin);
    const plane = makeWorkPlane({
      id: this.#ids.next('wp'),
      equation,
      origin,
      style,
      source: planeSource,
    });
    this.#commitDelta({ op: 'addWorkPlane', plane });
    return plane.id;
  }

  addWorkPlanePerpendicularToLine(sourceEntityId: string, through?: string | Vector3, style: GeometryLabStyleOptions = {}): string {
    this.#assertWritable();
    const line = lineDataForEntity(this.#snapshot.scene.scene3d, sourceEntityId);
    if (!line) throw new KleinSdkError('invalid_line_reference', 'Choose a 3D line, segment, ray, or vector.');
    const origin = this.#resolveThroughPoint(through) ?? line.point;
    const equation = equationFromPointNormal(origin, line.direction);
    const planeSource: Extract<WorkPlaneSource3D, { kind: 'perpendicularLine' }> = { kind: 'perpendicularLine', sourceEntityId };
    addWorkPlaneThroughSource(planeSource, through, origin);
    const plane = makeWorkPlane({
      id: this.#ids.next('wp'),
      equation,
      origin,
      style,
      source: planeSource,
    });
    this.#commitDelta({ op: 'addWorkPlane', plane });
    return plane.id;
  }

  pointPlaneDistance(pointId: string, planeId: string): number {
    const point = this.#requirePoint3D(pointId);
    const plane = this.#requirePlaneData(planeId);
    return Math.abs(dot3(plane.normal, point) + plane.d);
  }

  /**
   * The measurements school solid geometry is actually about, beyond volume and
   * surface area: how far apart two points are, how far a point is from a line,
   * the angle a line makes with another line or with a plane, and the distance
   * between two lines that never meet.
   *
   * <p>Each commits the *source* and lets canonicalization compute the value,
   * exactly as the existing measurements do - which is what keeps them live
   * when the geometry underneath them moves. The zero seeded here is replaced
   * before the delta is ever visible.
   */
  addDistanceMeasurement3D(firstPointId: string, secondPointId: string, label = 'distance'): string {
    return this.#addSourcedMeasurement(
      { kind: 'pointPointDistance', firstPointId, secondPointId },
      'length', 'u', firstPointId, [firstPointId, secondPointId], label,
    );
  }

  addPointLineDistanceMeasurement(pointId: string, lineEntityId: string, label = 'point-line distance'): string {
    return this.#addSourcedMeasurement(
      { kind: 'pointLineDistance', pointId, lineEntityId },
      'length', 'u', pointId, [pointId, lineEntityId], label,
    );
  }

  addLineAngleMeasurement(firstLineId: string, secondLineId: string, label = 'angle'): string {
    return this.#addSourcedMeasurement(
      { kind: 'lineLineAngle', firstLineId, secondLineId },
      'angle', 'deg', firstLineId, [firstLineId, secondLineId], label,
    );
  }

  addLinePlaneAngleMeasurement(lineEntityId: string, planeId: string, label = 'line-plane angle'): string {
    return this.#addSourcedMeasurement(
      { kind: 'linePlaneAngle', lineEntityId, planeId },
      'angle', 'deg', lineEntityId, [lineEntityId, planeId], label,
    );
  }

  addLineDistanceMeasurement(firstLineId: string, secondLineId: string, label = 'line distance'): string {
    return this.#addSourcedMeasurement(
      { kind: 'lineLineDistance', firstLineId, secondLineId },
      'length', 'u', firstLineId, [firstLineId, secondLineId], label,
    );
  }

  #addSourcedMeasurement(
    source: MeasurementSource3D,
    kind: Measurement3D['kind'],
    unit: Measurement3D['unit'],
    targetId: string,
    targetIds: string[],
    label: string,
  ): string {
    this.#assertWritable();
    const measurement: Measurement3D = {
      id: this.#ids.next('m3'),
      targetId,
      targetIds,
      kind,
      // Canonicalization fills this in from the source during the commit, and
      // rejects the delta if the geometry cannot support the measurement.
      value: 0,
      label,
      source,
    };
    if (unit !== undefined) measurement.unit = unit;
    this.#commitDelta({ op: 'addMeasurement', measurement });
    return measurement.id;
  }

  /**
   * Measurements over the 2D figure: segment length, distance between points,
   * distance from a point to a line, angle size, and a polygon's area and
   * perimeter. The Lab could construct all of these shapes and could not report
   * a single number about them.
   *
   * <p>Like their 3D counterparts, these commit a source and let
   * canonicalization compute the value, which is what keeps the number correct
   * when the figure moves under it.
   */
  /**
   * Constrains the 2D figure.
   *
   * <p>The Lab has been able to *store* constraints since the model was written
   * - `scene2d.constraints` is validated, persisted and cascaded - and nothing
   * ever enforced them, so a segment declared to be five units long could be
   * dragged to any length at all. The solver is shared with the Geometry
   * Calculator and runs during canonicalization, so a constraint holds however
   * the figure is edited, not only through the method that set it.
   */
  /**
   * Builds the image of a point or a vertex-defined entity under a plane
   * transformation - translation, rotation, reflection in a line or in a point,
   * and dilation.
   *
   * <p>`scale`, `rotate`, `stamp` and `cut` have been declared tools since the
   * model was written, with nothing behind any of them, and the exercise bank
   * asks students to mirror a figure by copying it across by hand.
   *
   * <p>The image is a *construction*, not a copy: each image vertex records its
   * source and the transformation, so dragging the original moves the image, and
   * dragging the mirror line sweeps the image around. That is the difference
   * between a transformation tool and a one-off edit, and it is the whole reason
   * to do this on a screen.
   */
  transform2D(targetId: string, transform: GeometryTransform2D, style: GeometryLabStyleOptions = {}): string {
    this.#assertWritable();
    const scene = this.#snapshot.scene.scene2d;
    if (!scene.points[targetId] && !scene.entities[targetId]) {
      throw new KleinSdkError('invalid_transform_target', `2D object "${targetId}" does not exist.`);
    }
    for (const sourceId of geometryTransform2DSourceIds(transform)) {
      if (!scene.points[sourceId] && !scene.entities[sourceId]) {
        throw new KleinSdkError('invalid_transform_reference', `2D object "${sourceId}" does not exist.`);
      }
    }
    return this.#commit2DConstruction(
      buildTransformedObject2D(scene, targetId, transform, (prefix: string) => this.#ids.next(prefix)),
      style,
      'invalid_transform',
      'That object cannot be transformed - a circle or a curve needs its own rule, and the transformation must be defined.',
    );
  }

  translate2D(targetId: string, vectorEntityId: string, style: GeometryLabStyleOptions = {}): string {
    return this.transform2D(targetId, { kind: 'translate', vectorEntityId }, style);
  }

  translateBy2D(targetId: string, dx: number, dy: number, style: GeometryLabStyleOptions = {}): string {
    return this.transform2D(targetId, { kind: 'translateBy', dx, dy }, style);
  }

  rotate2D(targetId: string, centerPointId: string, degrees: number, style: GeometryLabStyleOptions = {}): string {
    return this.transform2D(targetId, { kind: 'rotate', centerPointId, degrees }, style);
  }

  reflectInLine2D(targetId: string, lineEntityId: string, style: GeometryLabStyleOptions = {}): string {
    return this.transform2D(targetId, { kind: 'reflectLine', lineEntityId }, style);
  }

  reflectInPoint2D(targetId: string, centerPointId: string, style: GeometryLabStyleOptions = {}): string {
    return this.transform2D(targetId, { kind: 'reflectPoint', centerPointId }, style);
  }

  dilate2D(targetId: string, centerPointId: string, factor: number, style: GeometryLabStyleOptions = {}): string {
    return this.transform2D(targetId, { kind: 'dilate', centerPointId, factor }, style);
  }

  /**
   * Adds a named number the figure can be built on.
   *
   * <p>The default range is nought to one, which is what a point placed along a
   * path wants: a slider's value *is* the parameter rather than being rescaled
   * into one, so the common case is the one that needs no arithmetic.
   */
  addSlider2D(slider: GeometrySliderDraft2D): string {
    this.#assertWritable();
    this.#assertInputString('Slider name', slider.name);
    const min = slider.min ?? 0;
    const max = slider.max ?? 1;
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
      throw new KleinSdkError('invalid_slider', 'A slider needs a finite range with its maximum at or above its minimum.');
    }
    const created: GeometrySlider = {
      id: this.#ids.next('slider'),
      name: slider.name,
      value: Math.min(max, Math.max(min, slider.value ?? min)),
      min,
      max,
      step: slider.step !== undefined && slider.step >= 0 ? slider.step : 0,
    };
    if (slider.label !== undefined) created.label = slider.label;
    if (slider.color !== undefined) created.color = slider.color;
    if (slider.hidden !== undefined) created.hidden = slider.hidden;
    this.#commitDelta({ op: 'addSlider2D', slider: created });
    return created.id;
  }

  /** Moves a slider, and with it everything built on it. */
  setSliderValue2D(id: string, value: number): void {
    this.#assertWritable();
    if (!this.#snapshot.scene.scene2d.sliders?.[id]) {
      throw new KleinSdkError('missing_slider', `Slider "${id}" does not exist.`);
    }
    this.#commitDelta({ op: 'updateSlider2D', id, changes: { value: finiteNumber(value, 'Slider value') } });
  }

  /**
   * A point placed along an object rather than at a position.
   *
   * <p>With a slider it is the thing that sweeps, and so the thing a locus is
   * traced by; without one it is a point pinned a fixed fraction of the way
   * along something, which follows that object as it moves.
   */
  addPointOnPath2D(
    entityId: string,
    at: number | { sliderId: string },
    style: GeometryLabStyleOptions = {},
  ): string {
    this.#assertWritable();
    this.#require2DEntity(entityId);
    const sliderId = typeof at === 'object' ? at.sliderId : undefined;
    if (sliderId !== undefined && !this.#snapshot.scene.scene2d.sliders?.[sliderId]) {
      throw new KleinSdkError('missing_slider', `Slider "${sliderId}" does not exist.`);
    }
    const construction: GeometryConstruction = sliderId === undefined
      ? { kind: 'pointOnPath', entityId, at: finiteNumber(at as number, 'Path parameter') }
      : { kind: 'pointOnPath', entityId, at: 0, sliderId };
    const position = geometryPointOnPath2D(this.#snapshot.scene.scene2d, construction);
    if (!position) {
      throw new KleinSdkError('invalid_point_on_path', 'That object has no path a point can sit along.');
    }
    const created = withPoint2DStyle({
      id: this.#ids.next('p2'),
      kind: 'point2d',
      x: position.x,
      y: position.y,
      locked: true,
      construction,
    }, style);
    this.#commitDelta({ op: 'addPoint2D', point: created });
    return created.id;
  }

  /**
   * The path a point traces as a slider sweeps its whole range.
   *
   * <p>A construction rather than a list of coordinates: the curve follows the
   * figure that generates it, which is the entire reason a locus is worth
   * drawing on a screen rather than on paper.
   */
  addDynamicLocus2D(
    sliderId: string,
    tracerId: string,
    options: GeometryLabStyleOptions & { samples?: number } = {},
  ): string {
    this.#assertWritable();
    if (!this.#snapshot.scene.scene2d.sliders?.[sliderId]) {
      throw new KleinSdkError('missing_slider', `Slider "${sliderId}" does not exist.`);
    }
    this.#require2DPoint(tracerId);
    const samples = Math.max(2, Math.min(MAX_LOCUS_SAMPLES, Math.floor(options.samples ?? 64)));
    const created = withEntity2DStyle<LocusEntity>({
      id: this.#ids.next('locus'),
      kind: 'locus',
      points: [],
      construction: { kind: 'dynamicLocus', sliderId, tracerId, samples },
    }, options);
    this.#commitDelta({ op: 'addEntity2D', entity: created });
    return created.id;
  }

  addConstraint2D(constraint: GeometryConstraintDraft2D): string {
    this.#assertWritable();
    for (const id of geometryConstraintDependencies({ ...constraint, id: 'draft' } as GeometryConstraint)) {
      if (!this.#snapshot.scene.scene2d.points[id] && !this.#snapshot.scene.scene2d.entities[id]) {
        throw new KleinSdkError('invalid_constraint_reference', `2D object "${id}" does not exist.`);
      }
    }
    const owned = { ...constraint, id: this.#ids.next('con2') } as GeometryConstraint;
    this.#commitDelta({ op: 'addConstraint2D', constraint: owned });
    return owned.id;
  }

  removeConstraint2D(ids: string | string[]): void {
    this.#assertWritable();
    const unique = [...new Set(typeof ids === 'string' ? [ids] : ids)].filter(Boolean);
    if (!unique.length) return;
    this.#commitDelta({ op: 'deleteConstraint2D', ids: unique });
  }

  addDistanceMeasurement2D(firstPointId: string, secondPointId: string, label = 'distance'): string {
    return this.#addMeasurement2D({ kind: 'pointDistance', firstPointId, secondPointId }, 'length', 'u', label);
  }

  addLengthMeasurement2D(entityId: string, label = 'length'): string {
    return this.#addMeasurement2D({ kind: 'segmentLength', entityId }, 'length', 'u', label);
  }

  addPointLineDistanceMeasurement2D(pointId: string, entityId: string, label = 'point-line distance'): string {
    return this.#addMeasurement2D({ kind: 'pointLineDistance', pointId, entityId }, 'length', 'u', label);
  }

  addAngleMeasurement2D(pointIds: [string, string, string], label = 'angle'): string {
    return this.#addMeasurement2D({ kind: 'angle', pointIds }, 'angle', 'deg', label);
  }

  addAreaMeasurement2D(polygonId: string, label = 'area'): string {
    return this.#addMeasurement2D({ kind: 'polygonArea', entityId: polygonId }, 'area', 'u^2', label);
  }

  addPerimeterMeasurement2D(polygonId: string, label = 'perimeter'): string {
    return this.#addMeasurement2D({ kind: 'polygonPerimeter', entityId: polygonId }, 'length', 'u', label);
  }

  #addMeasurement2D(
    source: MeasurementSource2D,
    kind: Measurement2D['kind'],
    unit: Measurement2D['unit'],
    label: string,
  ): string {
    this.#assertWritable();
    const measurement: Measurement2D = {
      id: this.#ids.next('m2'),
      kind,
      // Filled in by canonicalization during the commit, which also rejects the
      // delta when the sources cannot support the measurement.
      value: 0,
      label,
      source,
    };
    if (unit !== undefined) measurement.unit = unit;
    this.#commitDelta({ op: 'addMeasurement2D', measurement });
    return measurement.id;
  }

  addPointPlaneDistanceMeasurement(pointId: string, planeId: string, label = 'point-plane distance'): string {
    this.#assertWritable();
    const measurement: Measurement3D = {
      id: this.#ids.next('m3'),
      targetId: pointId,
      targetIds: [pointId, planeId],
      kind: 'length',
      value: this.pointPlaneDistance(pointId, planeId),
      unit: 'u',
      label,
      source: { kind: 'pointPlaneDistance', pointId, planeId },
    };
    this.#commitDelta({ op: 'addMeasurement', measurement });
    return measurement.id;
  }

  addLinePlaneIntersection(lineEntityId: string, planeId: string, style: GeometryLabStyleOptions = {}): string {
    this.#assertWritable();
    const line = lineDataForEntity(this.#snapshot.scene.scene3d, lineEntityId);
    if (!line) throw new KleinSdkError('invalid_line_reference', 'Choose a 3D line, segment, ray, or vector.');
    const plane = this.#requirePlaneData(planeId);
    const point = intersectLinePlane(line, plane);
    if (!point) throw new KleinSdkError('parallel_line_plane', 'Line and plane do not intersect in a finite point.');
    const created = this.#makePoint3D({
      ...point,
      ...style,
      construction: { kind: 'linePlaneIntersection', lineEntityId, planeId },
    });
    this.#commitDelta({ op: 'addPoint3D', point: created });
    return created.id;
  }

  addPlanePlaneIntersection(firstPlaneId: string, secondPlaneId: string, style: GeometryLabStyleOptions = {}): string {
    this.#assertWritable();
    const first = this.#requirePlaneData(firstPlaneId);
    const second = this.#requirePlaneData(secondPlaneId);
    const line = intersectPlanes(first, second);
    if (!line) throw new KleinSdkError('parallel_planes', 'Parallel planes do not form an intersection line.');
    const start = this.#makePoint3D({
      ...add3(line.point, scale3(line.direction, -1)),
      hidden: true,
      locked: true,
      construction: { kind: 'planePlaneIntersection', firstPlaneId, secondPlaneId, end: 0 },
    });
    const end = this.#makePoint3D({
      ...add3(line.point, line.direction),
      hidden: true,
      locked: true,
      construction: { kind: 'planePlaneIntersection', firstPlaneId, secondPlaneId, end: 1 },
    });
    const entity = withEntity3DStyle<LineEntity>({
      id: this.#ids.next('line3'),
      kind: 'line',
      pointIds: [start.id, end.id],
    }, style);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint3D', point: start },
        { op: 'addPoint3D', point: end },
        { op: 'addEntity3D', entity },
      ],
    });
    return entity.id;
  }

  addPrism(base: Vector3[], height: number | Vector3 = 1, style: SolidCreationOptions = {}): string {
    this.#assertWritable();
    this.#assertInputCount(
      'Prism base vertices',
      base.length,
      Math.min(
        Math.floor(this.#complexityLimits.maxSolidPointsPerEntity / 2),
        this.#complexityLimits.maxSolidFacesPerEntity - 2,
        this.#complexityLimits.maxSolidFaceVertices,
      ),
    );
    const basePoints = cleanVector3Array(base, 'Prism base');
    const baseAnalysis = analyzePolygon3D(basePoints);
    if (!baseAnalysis.valid || !baseAnalysis.normal) {
      throw new KleinSdkError('invalid_solid', 'A prism needs a simple, planar, non-degenerate base.', {
        issues: baseAnalysis.issues.map(issue => issue.code),
      });
    }
    const heightVector = typeof height === 'number'
      ? scale3(baseAnalysis.normal, finiteNumber(height, 'Prism height'))
      : finiteVector3(height, 'Prism height');
    const mesh = createPrismMesh3D(basePoints, heightVector);
    if (length3(heightVector) <= linearTolerance3D(mesh.vertices)) {
      throw new KleinSdkError('invalid_solid', 'Prism extrusion must be non-zero at the geometry scale.');
    }
    const perpendicularHeight = prismHeight3D(basePoints, heightVector);
    if (perpendicularHeight === null) throw new KleinSdkError('invalid_solid', 'Prism height could not be resolved.');
    return this.#addSolidFromMesh('prism', mesh.vertices, mesh.faces, {
      ...style,
      parameters: {
        height: perpendicularHeight,
      },
    });
  }

  addPyramid(base: Vector3[], heightOrApex: number | Vector3 = 1, style: SolidCreationOptions = {}): string {
    this.#assertWritable();
    this.#assertInputCount(
      'Pyramid base vertices',
      base.length,
      Math.min(
        this.#complexityLimits.maxSolidPointsPerEntity - 1,
        this.#complexityLimits.maxSolidFacesPerEntity - 1,
        this.#complexityLimits.maxSolidFaceVertices,
      ),
    );
    const basePoints = cleanVector3Array(base, 'Pyramid base');
    const baseAnalysis = analyzePolygon3D(basePoints);
    if (!baseAnalysis.valid || !baseAnalysis.normal) {
      throw new KleinSdkError('invalid_solid', 'A pyramid needs a simple, planar, non-degenerate base.', {
        issues: baseAnalysis.issues.map(issue => issue.code),
      });
    }
    const center = centroid3(basePoints);
    const baseNormal = baseAnalysis.normal;
    const apex = typeof heightOrApex === 'number'
      ? add3(center, scale3(baseNormal, finiteNumber(heightOrApex, 'Pyramid height')))
      : finiteVector3(heightOrApex, 'Pyramid apex');
    const height = pyramidHeight3D(basePoints, apex);
    if (height === null || height <= linearTolerance3D([...basePoints, apex])) {
      throw new KleinSdkError('invalid_solid', 'Pyramid apex must lie outside the base plane at the geometry scale.');
    }
    const mesh = createPyramidMesh3D(basePoints, apex);
    return this.#addSolidFromMesh('pyramid', mesh.vertices, mesh.faces, {
      ...style,
      parameters: {
        height,
      },
    });
  }

  addCylinder(center: Vector3, radius: number, height: number, style: SolidCreationOptions = {}): string {
    this.#assertWritable();
    const origin = finiteVector3(center, 'Cylinder center');
    const r = positiveNumber(radius, 'Cylinder radius');
    const h = positiveNumber(height, 'Cylinder height');
    const sides = clampInt(style.sides ?? 32, 8, 96);
    const mesh = createCylinderMesh3D(origin, r, h, sides);
    return this.#addSolidFromMesh('cylinder', mesh.vertices, mesh.faces, {
      ...style,
      parameters: {
        radius: r,
        height: h,
        sides,
      },
    });
  }

  addCone(center: Vector3, radius: number, height: number, style: SolidCreationOptions = {}): string {
    this.#assertWritable();
    const origin = finiteVector3(center, 'Cone center');
    const r = positiveNumber(radius, 'Cone radius');
    const h = positiveNumber(height, 'Cone height');
    const sides = clampInt(style.sides ?? 32, 8, 96);
    const mesh = createConeMesh3D(origin, r, h, sides);
    return this.#addSolidFromMesh('cone', mesh.vertices, mesh.faces, {
      ...style,
      parameters: {
        radius: r,
        height: h,
        sides,
      },
    });
  }

  addSphere(center: Vector3, radius: number, style: SolidCreationOptions = {}): string {
    this.#assertWritable();
    const origin = finiteVector3(center, 'Sphere center');
    const r = positiveNumber(radius, 'Sphere radius');
    const longitude = clampInt(style.sides ?? 24, 12, 48);
    const mesh = createSphereMesh3D(origin, r, longitude);
    return this.#addSolidFromMesh('sphere', mesh.vertices, mesh.faces, {
      ...style,
      parameters: {
        radius: r,
        sides: longitude,
      },
    });
  }

  addSurfaceZ(input: SurfaceZInput3D, style: GeometryLabStyleOptions = {}): string {
    this.#assertWritable();
    const xMin = finiteNumber(input.xRange[0], 'Surface x min');
    const xMax = finiteNumber(input.xRange[1], 'Surface x max');
    const yMin = finiteNumber(input.yRange[0], 'Surface y min');
    const yMax = finiteNumber(input.yRange[1], 'Surface y max');
    if (xMax <= xMin || yMax <= yMin) throw new KleinSdkError('invalid_surface_domain', 'Surface ranges must be increasing.');
    const xSamples = clampInt(input.xSamples ?? 48, 2, 128);
    const ySamples = clampInt(input.ySamples ?? 48, 2, 128);
    this.#assertSurfaceSamplingBudget(xSamples, ySamples);
    const sampled = sampleRectangularSurface3D({
      first: { axis: 'x', range: [xMin, xMax], samples: xSamples },
      second: { axis: 'y', range: [yMin, yMax], samples: ySamples },
      dependentAxis: 'z',
      evaluate: variables => input.z(variables.x, variables.y),
    });
    if (!sampled.vertices.length || !sampled.faces.length) {
      throw new KleinSdkError(
        'invalid_surface',
        sampled.vertices.length
          ? 'Surface evaluation did not produce any connected finite cells.'
          : 'Surface evaluation did not produce any finite samples.',
      );
    }
    const entity = withEntity3DStyle<SurfaceEntity3D>({
      id: this.#ids.next('surf3'),
      kind: 'surface3d',
      surfaceKind: 'z-function',
      vertices: sampled.vertices,
      faces: sampled.faces,
      domain: { x: [xMin, xMax], y: [yMin, yMax] },
      samples: { x: xSamples, y: ySamples },
    }, style);
    if (input.input !== undefined) entity.input = input.input;
    this.#commitDelta({ op: 'addEntity3D', entity });
    return entity.id;
  }

  addEquationSurface3D(input: EquationSurfaceInput3D, style: GeometryLabStyleOptions = {}): string {
    this.#assertWritable();
    this.#assertInputString('Equation input', input.input);
    const samples = clampInt(input.samples ?? 56, 4, 128);
    this.#assertSurfaceSamplingBudget(samples, samples);
    const entity = makeAuthoredEquationSurface3D(this.#ids.next('surf3'), input, style);
    this.#commitDelta({ op: 'addEntity3D', entity });
    return entity.id;
  }

  updateEquationSurface3D(id: string, input: EquationSurfaceInput3D, style: GeometryLabStyleOptions = {}): void {
    this.#assertWritable();
    const existing = this.#snapshot.scene.scene3d.entities[id];
    if (!existing || existing.kind !== 'surface3d' || existing.surfaceKind !== 'equation') {
      throw new KleinSdkError('missing_equation_surface', `Equation surface ${id} does not exist.`);
    }
    this.#assertInputString('Equation input', input.input);
    const nextStyle: GeometryLabStyleOptions = {};
    const label = style.label ?? existing.label;
    const color = style.color ?? existing.color;
    const hidden = style.hidden ?? existing.hidden;
    const locked = style.locked ?? existing.locked;
    if (label !== undefined) nextStyle.label = label;
    if (color !== undefined) nextStyle.color = color;
    if (hidden !== undefined) nextStyle.hidden = hidden;
    if (locked !== undefined) nextStyle.locked = locked;
    const mergedInput = mergeEquationSurfaceInput(input, existing);
    const samples = clampInt(mergedInput.samples ?? 56, 4, 128);
    this.#assertSurfaceSamplingBudget(samples, samples, id);
    const entity = makeAuthoredEquationSurface3D(id, mergedInput, nextStyle);
    this.#commitDelta({ op: 'updateEntity', id, changes: entity });
  }

  remove(ids: string | string[]): void {
    this.#assertWritable();
    if (Array.isArray(ids)) this.#assertInputCount('Delete ids', ids.length, this.#complexityLimits.maxDeleteIds);
    const uniqueIds = [...new Set(typeof ids === 'string' ? [ids] : ids)].filter(Boolean);
    if (!uniqueIds.length) return;
    this.#commitDelta({ op: 'delete', ids: uniqueIds });
  }

  addParametricCurve3D(input: ParametricCurve3DInput, style: GeometryLabStyleOptions = {}): string {
    this.#assertWritable();
    const tMin = finiteNumber(input.tRange[0], 'Curve t min');
    const tMax = finiteNumber(input.tRange[1], 'Curve t max');
    if (tMax <= tMin) throw new KleinSdkError('invalid_curve_domain', 'Curve range must be increasing.');
    const samples = clampInt(input.samples ?? 96, 2, 512);
    this.#assertInputCount('Curve samples', samples, this.#complexityLimits.maxCurvePointsPerEntity);
    const points = Array.from({ length: samples }, (_, index) => {
      const t = interpolate(tMin, tMax, samples === 1 ? 0 : index / (samples - 1));
      return finiteVector3(input.point(t), `Curve point ${index + 1}`);
    });
    const entity = withEntity3DStyle<CurveEntity3D>({
      id: this.#ids.next('curve3'),
      kind: 'curve3d',
      points,
      parameter: { tMin, tMax, samples },
    }, style);
    if (input.input !== undefined) entity.input = input.input;
    this.#commitDelta({ op: 'addEntity3D', entity });
    return entity.id;
  }

  addPolyhedron(kind: GeometryPolyhedronKind, center: Vector3 = { x: 0, y: 0, z: 0 }, size = 2, style: GeometryLabStyleOptions = {}): string {
    this.#assertWritable();
    const mesh = createRegularPolyhedronMesh3D(
      kind,
      finiteVector3(center, 'Polyhedron center'),
      positiveNumber(size, 'Polyhedron size'),
    );
    return this.#addSolidFromMesh(kind === 'cube' ? 'cube' : kind === 'tetrahedron' ? 'tetrahedron' : 'polyhedron', mesh.vertices, mesh.faces, style);
  }

  addCrossSection(solidId: string, planeId: string, style: GeometryLabStyleOptions = {}): string {
    this.#assertWritable();
    const solid = this.#requireSolid(solidId);
    const plane = this.#requirePlaneData(planeId);
    const vertices = crossSectionVertices(this.#snapshot.scene.scene3d, solid, plane);
    if (vertices.length < 3) throw new KleinSdkError('empty_cross_section', 'The plane does not slice this solid.');
    const points = vertices.map(vertex => this.#makePoint3D({ ...vertex, hidden: true, locked: true }));
    const entity = withEntity3DStyle<CrossSectionEntity>({
      id: this.#ids.next('section'),
      kind: 'crossSection',
      solidId,
      planeId,
      pointIds: points.map(point => point.id),
    }, style);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        ...points.map(point => ({ op: 'addPoint3D' as const, point })),
        { op: 'addEntity3D', entity },
      ],
    });
    return entity.id;
  }

  createUnfoldedNet(solidId: string, label = 'net'): string {
    this.#assertWritable();
    const solid = this.#requireSolid(solidId);
    const net: SolidNet3D = {
      id: this.#ids.next('net'),
      solidId: solid.id,
      faces: [],
      label,
    };
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addNet', net },
        {
          op: 'setSceneLink',
          link: {
            id: this.#ids.next('link'),
            kind: 'netToSolid',
            sourceId: net.id,
            targetId: solid.id,
          },
        },
      ],
    });
    return net.id;
  }

  measureVolume(solidId: string): number {
    const solid = this.#requireSolid(solidId);
    if (solid.volume === undefined) throw new KleinSdkError('invalid_solid', `Solid ${solidId} has no canonical volume.`);
    return solid.volume;
  }

  measureSurfaceArea(solidId: string): number {
    const solid = this.#requireSolid(solidId);
    if (solid.surfaceArea === undefined) throw new KleinSdkError('invalid_solid', `Solid ${solidId} has no canonical surface area.`);
    return solid.surfaceArea;
  }

  measureDihedralAngle(solidId: string, firstFaceId: string, secondFaceId: string): number {
    const solid = this.#requireSolid(solidId);
    const first = solid.faces?.find(face => face.id === firstFaceId);
    const second = solid.faces?.find(face => face.id === secondFaceId);
    if (!first || !second) throw new KleinSdkError('missing_face', 'Face does not exist on this solid.');
    const n1 = faceNormalFromIds(this.#snapshot.scene.scene3d, first.pointIds);
    const n2 = faceNormalFromIds(this.#snapshot.scene.scene3d, second.pointIds);
    if (!n1 || !n2) throw new KleinSdkError('invalid_face', 'Cannot compute a face normal.');
    return radiansToDegrees(Math.acos(clamp(dot3(n1, n2), -1, 1)));
  }

  addVolumeMeasurement(solidId: string, label = 'volume'): string {
    this.#assertWritable();
    const measurement: Measurement3D = {
      id: this.#ids.next('m3'),
      targetId: solidId,
      kind: 'volume',
      value: this.measureVolume(solidId),
      unit: 'u^3',
      label,
      source: { kind: 'solidVolume', solidId },
    };
    this.#commitDelta({ op: 'addMeasurement', measurement });
    return measurement.id;
  }

  addSurfaceAreaMeasurement(solidId: string, label = 'surface area'): string {
    this.#assertWritable();
    const measurement: Measurement3D = {
      id: this.#ids.next('m3'),
      targetId: solidId,
      kind: 'surfaceArea',
      value: this.measureSurfaceArea(solidId),
      unit: 'u^2',
      label,
      source: { kind: 'solidSurfaceArea', solidId },
    };
    this.#commitDelta({ op: 'addMeasurement', measurement });
    return measurement.id;
  }

  addDihedralAngleMeasurement(solidId: string, firstFaceId: string, secondFaceId: string, label = 'dihedral'): string {
    this.#assertWritable();
    const measurement: Measurement3D = {
      id: this.#ids.next('m3'),
      targetId: solidId,
      targetIds: [solidId, firstFaceId, secondFaceId],
      kind: 'dihedral',
      value: this.measureDihedralAngle(solidId, firstFaceId, secondFaceId),
      unit: 'deg',
      label,
      source: { kind: 'solidDihedral', solidId, firstFaceId, secondFaceId },
    };
    this.#commitDelta({ op: 'addMeasurement', measurement });
    return measurement.id;
  }

  setCameraPreset(preset: GeometryCameraPreset3D, distance?: number): void {
    if (!GEOMETRY_LAB_CAMERA_PRESETS.has(preset)) {
      throw new KleinSdkError('invalid_camera_preset', `Unsupported Geometry Lab camera preset "${String(preset)}".`);
    }
    const current = this.#snapshot.appState.view3d;
    const target = tupleToVector3(current.target);
    const d = positiveNumber(distance ?? distance3(tupleToVector3(current.position), target), 'Camera distance');
    const view = cameraPresetView(preset, target, d, current);
    this.#commitDelta({ op: 'setView3D', view }, {
      emit: !this.#options.readOnly,
      recordHistory: false,
    });
  }

  fitSelection(selection: GeometrySelection[] = this.#snapshot.appState.selected ?? []): void {
    const points = selection.length
      ? pointsForSelection(this.#snapshot.scene.scene3d, selection)
      : visibleScene3DPoints(this.#snapshot.scene.scene3d);
    if (!points.length) return;
    const bounds = boundsForPoints(points);
    const center = midpoint3(bounds.min, bounds.max);
    let radius = 1;
    for (const point of points) radius = Math.max(radius, distance3(point, center));
    const current = this.#snapshot.appState.view3d;
    const direction = normalize3(subtract3(tupleToVector3(current.position), tupleToVector3(current.target))) ?? normalize3({ x: 8, y: -8, z: 6 }) as Vector3;
    const distance = geometryLabCameraFitDistance(radius, current, 960 / 640);
    const next: Camera3DState = {
      ...current,
      target: vector3ToTuple(center),
      position: vector3ToTuple(add3(center, scale3(direction, distance))),
      zoom: 1,
    };
    this.#commitDelta({ op: 'setView3D', view: next }, {
      emit: !this.#options.readOnly,
      recordHistory: false,
    });
  }

  setOrbitTarget(target: string | Vector3): void {
    const point = typeof target === 'string'
      ? anchorFor3DId(this.#snapshot.scene.scene3d, target)
      : finiteVector3(target, 'Orbit target');
    if (!point) throw new KleinSdkError('missing_target', 'Orbit target does not exist.');
    this.#commitDelta({
      op: 'setView3D',
      view: { ...this.#snapshot.appState.view3d, target: vector3ToTuple(point) },
    }, { emit: !this.#options.readOnly, recordHistory: false });
  }

  orbitCamera(azimuthDegrees: number, elevationDegrees = 0, radius?: number): void {
    const current = this.#snapshot.appState.view3d;
    const target = tupleToVector3(current.target);
    const offset = subtract3(tupleToVector3(current.position), target);
    const currentRadius = radius ?? Math.max(length3(offset), 1);
    const azimuth = Math.atan2(offset.y, offset.x) + degreesToRadians(azimuthDegrees);
    const elevation = clamp(Math.asin(clamp(offset.z / Math.max(length3(offset), 1), -1, 1)) + degreesToRadians(elevationDegrees), -1.45, 1.45);
    const flat = Math.cos(elevation) * currentRadius;
    const position = {
      x: target.x + Math.cos(azimuth) * flat,
      y: target.y + Math.sin(azimuth) * flat,
      z: target.z + Math.sin(elevation) * currentRadius,
    };
    this.#commitDelta({
      op: 'setView3D',
      view: { ...current, position: vector3ToTuple(position) },
    }, { emit: !this.#options.readOnly, recordHistory: false });
  }

  #addSolidFromMesh(
    solidKind: SolidEntity['solid'],
    vertices: Vector3[],
    faces: number[][],
    style: GeometryLabStyleOptions & { parameters?: SolidParameters3D } = {},
  ): string {
    const points = vertices.map(vertex => this.#makePoint3D({ ...vertex, hidden: true, locked: true }));
    const solidFaces = faces.map((face, index): SolidFace3D => {
      const pointIds = face.map(vertexIndex => points[vertexIndex]?.id).filter(Boolean) as string[];
      return {
        id: `face-${index + 1}`,
        pointIds,
      };
    });
    const entity = withEntity3DStyle<SolidEntity>({
      id: this.#ids.next('solid'),
      kind: 'solid',
      solid: solidKind,
      pointIds: points.map(point => point.id),
      faceIds: solidFaces.map(face => face.id),
      faces: solidFaces,
    }, style);
    if (style.parameters) entity.parameters = style.parameters;
    this.#commitDelta({
      op: 'batch',
      deltas: [
        ...points.map(point => ({ op: 'addPoint3D' as const, point })),
        { op: 'addEntity3D', entity },
      ],
    });
    return entity.id;
  }

  #makePoint3D(
    point: Vector3 & GeometryLabStyleOptions & { construction?: GeometryConstruction },
  ): GeometryPoint3D {
    const next: GeometryPoint3D = {
      id: this.#ids.next('p3'),
      kind: 'point3d',
      x: finiteNumber(point.x, 'Point x'),
      y: finiteNumber(point.y, 'Point y'),
      z: finiteNumber(point.z, 'Point z'),
    };
    if (point.label !== undefined) next.label = point.label;
    if (point.color !== undefined) next.color = point.color;
    if (point.hidden !== undefined) next.hidden = point.hidden;
    if (point.locked !== undefined) next.locked = point.locked;
    // Carried so canonicalization can rebuild the position whenever a source
    // moves. The coordinates above are only the value at creation time.
    if (point.construction !== undefined) next.construction = point.construction;
    return next;
  }

  #requirePoint3D(id: string): GeometryPoint3D {
    const point = this.#snapshot.scene.scene3d.points[id];
    if (!point || point.kind !== 'point3d') {
      throw new KleinSdkError('missing_point3d', `3D point ${id} does not exist.`);
    }
    return point;
  }

  #requireDistinctPoint3D(firstPointId: string, secondPointId: string): void {
    if (firstPointId === secondPointId) throw new KleinSdkError('degenerate_entity', 'Choose two distinct 3D points.');
    this.#requirePoint3D(firstPointId);
    this.#requirePoint3D(secondPointId);
  }

  #requireSolid(id: string): SolidEntity {
    const entity = this.#snapshot.scene.scene3d.entities[id];
    if (!entity || entity.kind !== 'solid') {
      throw new KleinSdkError('missing_solid', `Solid ${id} does not exist.`);
    }
    return entity;
  }

  #requirePlaneData(id: string): PlaneData3D {
    const plane = planeDataForReference(this.#snapshot.scene.scene3d, id);
    if (!plane) throw new KleinSdkError('missing_plane', `Plane ${id} does not exist.`);
    return plane;
  }

  #resolveThroughPoint(through: string | Vector3 | undefined): Vector3 | null {
    if (through === undefined) return null;
    if (typeof through === 'string') return this.#requirePoint3D(through);
    return finiteVector3(through, 'Through point');
  }

  #commitDelta(
    delta: GeometryLabDelta,
    options: {
      emit?: boolean;
      invalidateHistory?: boolean;
      meta?: Partial<DeltaMeta>;
      recordHistory?: boolean;
    } = {},
  ): boolean {
    const recordHistory = options.recordHistory ?? true;
    const captureHistoryValues = recordHistory
      && this.#historyLimit > 0
      && this.#historyByteLimit > 0;
    const before = this.#snapshot;
    const reduction = reduceOwnedGeometryLabDelta(
      before,
      delta,
      this.#complexityLimits,
      captureHistoryValues,
    );
    if (!reduction.changed) return false;
    const next = reduction.snapshot;
    const historyEntry = captureHistoryValues
      ? createGeometryLabHistoryEntry(reduction.historyDiff)
      : null;
    if (captureHistoryValues && !historyEntry) return false;
    try {
      this.#renderSnapshot(next);
    } catch (error) {
      const sdkError = geometryLabSdkError(error, 'geometry_lab_render_failed');
      this.#notifyError(sdkError);
      throw sdkError;
    }
    this.#snapshot = next;
    this.#recordTraces();
    if (recordHistory && historyEntry) {
      this.#recordHistoryEntry(historyEntry);
    } else if (options.invalidateHistory) {
      this.#invalidateConflictingHistory(reduction.historyDiff.refKeys, before, next);
    }
    if (options.emit !== false) {
      this.#emitDelta(delta, this.#deltaMeta(options.meta));
    }
    return true;
  }

  #invalidateConflictingHistory(
    changedRefKeys: string[],
    before: GeometryLabSnapshot,
    after: GeometryLabSnapshot,
  ): void {
    const changed = geometryLabDependencyConflictRefKeys(changedRefKeys, before, after);
    const doesNotConflict = (entry: GeometryLabHistoryEntry): boolean => (
      !entry.refKeys.some(refKey => changed.has(refKey))
    );
    this.#undoStack = this.#undoStack.filter(doesNotConflict);
    this.#redoStack = this.#redoStack.filter(doesNotConflict);
    this.#historyBytes = [...this.#undoStack, ...this.#redoStack]
      .reduce((sum, entry) => sum + entry.serializedBytes, 0);
  }

  #recordHistoryEntry(entry: GeometryLabHistoryEntry): void {
    for (const redoEntry of this.#redoStack) this.#historyBytes -= redoEntry.serializedBytes;
    this.#redoStack = [];
    if (
      this.#historyLimit === 0
      || this.#historyByteLimit === 0
      || entry.serializedBytes > this.#complexityLimits.maxHistoryEntryBytes
      || entry.serializedBytes > this.#historyByteLimit
    ) return;
    this.#undoStack.push(entry);
    this.#historyBytes += entry.serializedBytes;
    while (
      this.#undoStack.length > this.#historyLimit
      || this.#historyBytes > this.#historyByteLimit
    ) {
      const removed = this.#undoStack.shift();
      if (!removed) break;
      this.#historyBytes -= removed.serializedBytes;
    }
  }

  #render(): void {
    this.#renderSnapshot(this.#snapshot);
  }

  #renderSnapshot(snapshot: GeometryLabSnapshot): void {
    if (!this.#root) return;
    // Focusable here and nowhere else: a mounted figure is the thing a keyboard
    // user is navigating, whereas an exported one is usually embedded in a page
    // that has its own tab order and does not want a hundred more stops in it.
    const options: Partial<ExportOptions> = { format: 'svg', focusableObjects: true };
    const markup = rendersTwoDimensionalScene(snapshot)
      ? renderGeometryLabSvg2D(snapshot, options, this.#renderComplexityLimits)
      : renderGeometryLabSvg3D(snapshot, options, this.#renderComplexityLimits);
    this.#root.innerHTML = markup;
  }

  #emitDelta(delta: GeometryLabDelta, meta: DeltaMeta): void {
    const listeners = [
      ...(this.#options.onDelta ? [this.#options.onDelta] : []),
      ...this.#deltaListeners,
    ];
    for (const listener of listeners) {
      try {
        listener(compactGeometryLabDelta(delta), { ...meta });
      } catch (error) {
        this.#notifyError(geometryLabSdkError(error, 'geometry_lab_observer_failed'));
      }
    }
  }

  #notifyError(error: KleinSdkError): void {
    try {
      this.#options.onError?.(error);
    } catch {
      // Host error observers must never change instrument transaction outcomes.
    }
  }

  #deltaMeta(meta: Partial<DeltaMeta> | undefined): DeltaMeta {
    const result: DeltaMeta = {
      id: meta?.id ?? this.#ids.next('delta'),
      createdAt: meta?.createdAt ?? Date.now(),
      source: meta?.source ?? 'local',
      actorId: meta?.actorId ?? this.actorId,
    };
    return result;
  }

  #assertWritable(): void {
    if (this.#options.readOnly) {
      throw new KleinSdkError('read_only', 'This geometry lab is read-only.');
    }
  }

  #assertInputString(label: string, value: string): void {
    this.#assertInputCount(`${label} characters`, value.length, this.#complexityLimits.maxStringChars);
  }

  #assertSurfaceSamplingBudget(firstSamples: number, secondSamples: number, replacingSurfaceId?: string): void {
    this.#assertInputCount(
      'Surface samples per axis',
      Math.max(firstSamples, secondSamples),
      this.#complexityLimits.maxSurfaceSamplesPerAxis,
    );
    this.#assertInputCount(
      'Surface grid samples',
      firstSamples * secondSamples,
      this.#complexityLimits.maxSamplerGridSamples,
    );
    this.#assertInputCount(
      'Surface continuity probe evaluations',
      estimateGeometryLabSurfaceProbeEvaluations(firstSamples, secondSamples),
      this.#complexityLimits.maxSamplerProbeEvaluations,
    );

    const vertices = firstSamples * secondSamples;
    const faces = 2 * Math.max(0, firstSamples - 1) * Math.max(0, secondSamples - 1);
    this.#assertInputCount(
      'Surface vertices per entity',
      vertices,
      this.#complexityLimits.maxSurfaceVerticesPerEntity,
    );
    this.#assertInputCount(
      'Surface faces per entity',
      faces,
      this.#complexityLimits.maxSurfaceFacesPerEntity,
    );
    this.#assertInputCount(
      'Surface face indices per entity',
      faces * 3,
      this.#complexityLimits.maxSurfaceFaceIndicesPerEntity,
    );

    let totalVertices = vertices;
    let totalFaces = faces;
    for (const [entityId, entity] of Object.entries(this.#snapshot.scene.scene3d.entities)) {
      if (entityId === replacingSurfaceId || entity.kind !== 'surface3d') continue;
      const usage = estimatedSurfaceMeshUsage(entity);
      totalVertices = saturatingSafeIntegerAdd(totalVertices, usage.vertices);
      totalFaces = saturatingSafeIntegerAdd(totalFaces, usage.faces);
    }
    this.#assertInputCount(
      'Surface vertices across the scene',
      totalVertices,
      this.#complexityLimits.maxSurfaceVerticesTotal,
    );
    this.#assertInputCount(
      'Surface faces across the scene',
      totalFaces,
      this.#complexityLimits.maxSurfaceFacesTotal,
    );
  }

  #assertInputCount(label: string, actual: number, limit: number): void {
    if (Number.isSafeInteger(actual) && actual >= 0 && actual <= limit) return;
    throw new KleinSdkError(
      'geometry_lab_input_too_complex',
      `${label} must be a non-negative safe integer no greater than ${limit}; received ${String(actual)}.`,
      { label, actual, limit },
    );
  }
}

interface PlaneData3D {
  id: string;
  origin: Vector3;
  normal: Vector3;
  xAxis: Vector3;
  yAxis: Vector3;
  d: number;
  equation: GeometryPlaneEquation3D;
}

interface LineData3D {
  point: Vector3;
  direction: Vector3;
  kind: 'line' | 'segment' | 'ray' | 'vector';
}

function geometryLabActorId(actorId: string | undefined, maximumCharacters = 256): string {
  if (actorId === undefined) return `actor-${secureGeometryLabRandomToken()}`;
  if (typeof actorId !== 'string' || actorId.trim().length === 0) {
    throw new KleinSdkError('invalid_actor_id', 'Geometry Lab actorId must be a non-empty string.');
  }
  if (actorId.length > maximumCharacters) {
    throw new KleinSdkError(
      'geometry_lab_input_too_complex',
      `Geometry Lab actorId cannot exceed ${maximumCharacters} characters.`,
    );
  }
  return actorId;
}

function createGeometryLabIdFactory(actorId: string): IdFactory {
  const actorScope = geometryLabActorScope(actorId);
  const replicaScope = secureGeometryLabRandomToken();
  let sequence = 0;
  return {
    next(prefix = 'id') {
      sequence += 1;
      return `${prefix}_${actorScope}_${replicaScope}_${sequence.toString(36)}`;
    },
  };
}

function geometryLabActorScope(actorId: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of actorId) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(36);
}

function secureGeometryLabRandomToken(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID().replaceAll('-', '');
  }
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const values = cryptoApi.getRandomValues(new Uint32Array(4));
    return [...values].map(value => value.toString(36).padStart(7, '0')).join('');
  }
  return [
    Date.now().toString(36),
    Math.random().toString(36).slice(2),
    Math.random().toString(36).slice(2),
  ].join('');
}

function geometryLabSnapshotJson(snapshot: GeometryLabSnapshot, includeAppState: boolean): JsonValue {
  const exported = compactGeometryLabSnapshot(snapshot);
  if (includeAppState) return exported as unknown as JsonValue;
  const { appState: _appState, ...contentOnly } = exported;
  return contentOnly as unknown as JsonValue;
}

type WorkPlaneThroughSource = Extract<
  WorkPlaneSource3D,
  { kind: 'parallelPlane' | 'perpendicularPlane' | 'perpendicularLine' }
>;

function addWorkPlaneThroughSource(
  source: WorkPlaneThroughSource,
  through: string | Vector3 | undefined,
  resolved: Vector3,
): void {
  if (typeof through === 'string') source.throughPointId = through;
  else source.through = vector3ToTuple(resolved);
}

function makeWorkPlane(options: {
  id: string;
  equation: GeometryPlaneEquation3D;
  origin?: Vector3;
  preferredXAxis?: Vector3;
  style?: GeometryLabStyleOptions;
  source?: WorkPlaneSource3D;
}): WorkPlane3D {
  const equation = normalizeGeometryPlaneEquation3D(options.equation);
  if (!equation) throw new KleinSdkError('invalid_plane', 'Plane normal must be non-zero.');
  const normal = { x: equation.a, y: equation.b, z: equation.c };
  const origin = options.origin ?? scale3(normal, -equation.d);
  const basis = basisForNormal(normal, options.preferredXAxis);
  const plane: WorkPlane3D = {
    id: options.id,
    origin: vector3ToTuple(origin),
    normal: vector3ToTuple(normal),
    xAxis: vector3ToTuple(basis.xAxis),
    yAxis: vector3ToTuple(basis.yAxis),
    equation,
  };
  const style = options.style ?? {};
  if (style.label !== undefined) plane.label = style.label;
  if (style.color !== undefined) plane.color = style.color;
  if (style.hidden !== undefined) plane.hidden = style.hidden;
  if (style.locked !== undefined) plane.locked = style.locked;
  if (options.source) plane.source = options.source;
  return plane;
}

function planeDataForReference(scene: GeometryScene3D, id: string): PlaneData3D | null {
  const workPlane = scene.workPlanes[id];
  if (workPlane) return planeDataFromWorkPlane(workPlane);
  const entity = scene.entities[id];
  if (entity?.kind !== 'plane') return null;
  const equation = planeEquationFromPlaneEntity(scene, entity);
  if (!equation) return null;
  const normal = { x: equation.a, y: equation.b, z: equation.c };
  const origin = scale3(normal, -equation.d);
  const basis = basisForNormal(normal);
  return { id, origin, normal, xAxis: basis.xAxis, yAxis: basis.yAxis, d: equation.d, equation };
}

function planeDataFromWorkPlane(plane: WorkPlane3D): PlaneData3D {
  const equation = plane.equation ?? equationFromPointNormal(tupleToVector3(plane.origin), tupleToVector3(plane.normal));
  const normalized = normalizeGeometryPlaneEquation3D(equation);
  if (!normalized) throw new KleinSdkError('invalid_plane', 'Work plane has an invalid equation.');
  const normal = { x: normalized.a, y: normalized.b, z: normalized.c };
  const xAxis = normalize3(tupleToVector3(plane.xAxis)) ?? basisForNormal(normal).xAxis;
  const yAxis = normalize3(plane.yAxis ? tupleToVector3(plane.yAxis) : cross3(normal, xAxis)) ?? basisForNormal(normal).yAxis;
  return {
    id: plane.id,
    origin: tupleToVector3(plane.origin),
    normal,
    xAxis,
    yAxis,
    d: normalized.d,
    equation: normalized,
  };
}

function planeEquationFromPlaneEntity(scene: GeometryScene3D, entity: PlaneEntity): GeometryPlaneEquation3D | null {
  const first = scene.points[entity.pointIds[0]];
  const second = scene.points[entity.pointIds[1]];
  const third = scene.points[entity.pointIds[2]];
  return first && second && third
    ? planeEquationFrom3DPoints(first, second, third)
    : null;
}

function lineDataForEntity(scene: GeometryScene3D, entityId: string): LineData3D | null {
  const entity = scene.entities[entityId];
  if (!entity || !hasTwoPointIds3D(entity)) return null;
  const first = scene.points[entity.pointIds[0]];
  const second = scene.points[entity.pointIds[1]];
  if (!first || !second) return null;
  const direction = subtract3(second, first);
  if (!Number.isFinite(length3(direction)) || length3(direction) <= linearTolerance3D([first, second])) return null;
  return { point: first, direction, kind: entity.kind };
}

function hasTwoPointIds3D(entity: GeometryEntity3D): entity is SegmentEntity | LineEntity {
  return entity.kind === 'segment' || entity.kind === 'line' || entity.kind === 'ray' || entity.kind === 'vector';
}

function intersectLinePlane(line: LineData3D, plane: PlaneData3D): Vector3 | null {
  const intersection = intersectLinePlane3D(line.point, line.direction, plane);
  if (intersection.kind !== 'point') return null;
  const parameterTolerance = linearTolerance3D([
    line.point,
    add3(line.point, line.direction),
  ]) / length3(line.direction);
  if (line.kind === 'ray' && intersection.parameter < -parameterTolerance) return null;
  if (
    (line.kind === 'segment' || line.kind === 'vector')
    && (intersection.parameter < -parameterTolerance || intersection.parameter > 1 + parameterTolerance)
  ) return null;
  return { ...intersection.point };
}

function intersectPlanes(first: PlaneData3D, second: PlaneData3D): GeometryLine3D | null {
  const intersection = intersectPlanes3D(first, second);
  return intersection.kind === 'line'
    ? { point: { ...intersection.point }, direction: { ...intersection.direction } }
    : null;
}

/** The 2D counterparts of {@link withEntity3DStyle}, over the shared geometry records. */
/**
 * Whether a snapshot should be drawn as a 2D scene.
 *
 * <p>`activeView` alone is not the signal it looks like: it defaults to `'2d'`,
 * so every 3D scene ever built without setting it would suddenly render as an
 * empty 2D one. The view must therefore be corroborated by the scene actually
 * holding 2D content, which also keeps the previous behaviour exactly - before
 * there was a 2D renderer, SVG always meant the 3D scene, and it still does for
 * every snapshot that has nothing 2D in it.
 */
function withEntity2DStyle<T extends GeometryEntity>(entity: T, style: GeometryLabStyleOptions): T {
  const next = { ...entity } as T & GeometryLabStyleOptions;
  if (style.label !== undefined) next.label = style.label;
  if (style.color !== undefined) next.color = style.color;
  if (style.hidden !== undefined) next.hidden = style.hidden;
  if (style.locked !== undefined) next.locked = style.locked;
  return next as T;
}

function withPoint2DStyle(point: GeometryPoint2D, style: GeometryLabStyleOptions): GeometryPoint2D {
  const next = { ...point };
  if (style.label !== undefined) next.label = style.label;
  if (style.color !== undefined) next.color = style.color;
  if (style.hidden !== undefined) next.hidden = style.hidden;
  if (style.locked !== undefined) next.locked = style.locked;
  return next;
}

function withEntity3DStyle<T extends GeometryEntity3D>(entity: T, style: GeometryLabStyleOptions): T {
  const next = { ...entity } as T & GeometryLabStyleOptions;
  if (style.label !== undefined) next.label = style.label;
  if (style.color !== undefined) next.color = style.color;
  if (style.hidden !== undefined) next.hidden = style.hidden;
  if (style.locked !== undefined) next.locked = style.locked;
  return next as T;
}

function cleanVector3Array(points: Vector3[], label: string): Vector3[] {
  return points.map((point, index) => finiteVector3(point, `${label} ${index + 1}`));
}

function finiteVector3(point: Vector3, label: string): Vector3 {
  return {
    x: finiteNumber(point.x, `${label} x`),
    y: finiteNumber(point.y, `${label} y`),
    z: finiteNumber(point.z, `${label} z`),
  };
}

function finiteNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new KleinSdkError('invalid_number', `${label} must be finite.`);
  return value;
}

function positiveNumber(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new KleinSdkError('invalid_number', `${label} must be positive.`);
  return value;
}

function crossSectionVertices(scene: GeometryScene3D, solid: SolidEntity, plane: PlaneData3D): Vector3[] {
  const section = crossSectionSolidMesh3D(scene.points, solid.faces ?? [], plane);
  if (section.status === 'empty') return [];
  if (section.status !== 'single_loop') {
    throw new KleinSdkError(
      'unsupported_cross_section',
      section.status === 'multiple_loops'
        ? 'This cut produces multiple disconnected loops, which one cross-section entity cannot represent.'
        : section.issues[0]?.message ?? 'The cut does not produce one supported polygon loop.',
      { status: section.status, issues: section.issues.map(issue => issue.code) },
    );
  }
  return section.loops[0]?.points.map(point => ({ ...point })) ?? [];
}

function faceNormalFromIds(scene: GeometryScene3D, pointIds: string[]): Vector3 | null {
  return faceNormal(pointIds.map(pointId => scene.points[pointId]).filter(Boolean) as GeometryPoint3D[]);
}

function faceNormal(points: Vector3[]): Vector3 | null {
  const normal = polygonNormal3D(points);
  return normal ? { ...normal } : null;
}

function basisForNormal(normalInput: Vector3, preferredXAxis?: Vector3): { xAxis: Vector3; yAxis: Vector3 } {
  const normal = normalize3(normalInput);
  if (!normal) throw new KleinSdkError('invalid_plane', 'Plane normal must be non-zero.');
  const preferred = preferredXAxis ? subtract3(preferredXAxis, scale3(normal, dot3(preferredXAxis, normal))) : null;
  const xAxis = normalize3(preferred ?? cross3(Math.abs(normal.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 }, normal));
  if (!xAxis) throw new KleinSdkError('invalid_plane', 'Could not derive plane basis.');
  const yAxis = normalize3(cross3(normal, xAxis));
  if (!yAxis) throw new KleinSdkError('invalid_plane', 'Could not derive plane basis.');
  return { xAxis, yAxis };
}

function equationFromPointNormal(point: Vector3, normalInput: Vector3): GeometryPlaneEquation3D {
  const normal = normalize3(normalInput);
  if (!normal) throw new KleinSdkError('invalid_plane', 'Plane normal must be non-zero.');
  return { a: normal.x, b: normal.y, c: normal.z, d: -dot3(normal, point) };
}

function cameraPresetView(
  preset: GeometryCameraPreset3D,
  target: Vector3,
  distance: number,
  current: Camera3DState,
): Camera3DState {
  if (preset === 'top') {
    return { ...current, target: vector3ToTuple(target), position: vector3ToTuple(add3(target, { x: 0, y: 0, z: distance })), up: [0, 1, 0] };
  }
  if (preset === 'side') {
    return { ...current, target: vector3ToTuple(target), position: vector3ToTuple(add3(target, { x: distance, y: 0, z: 0 })), up: [0, 0, 1] };
  }
  if (preset === 'front') {
    return { ...current, target: vector3ToTuple(target), position: vector3ToTuple(add3(target, { x: 0, y: -distance, z: 0 })), up: [0, 0, 1] };
  }
  const component = distance / Math.sqrt(2.75);
  return { ...current, target: vector3ToTuple(target), position: vector3ToTuple(add3(target, { x: component, y: -component, z: component * 0.85 })), up: [0, 0, 1] };
}

function pointsForSelection(scene: GeometryScene3D, selection: GeometrySelection[]): Vector3[] {
  const points: Vector3[] = [];
  for (const item of selection) {
    if (item.kind === 'point3d') {
      const point = scene.points[item.id];
      if (point) points.push(point);
    } else if (item.kind === 'entity3d') {
      const entity = scene.entities[item.id];
      if (entity) points.push(...anchorPointsForEntity3D(scene, entity));
    } else if (item.kind === 'face') {
      const solid = scene.entities[item.solidId];
      if (solid?.kind === 'solid') {
        const face = solid.faces?.find(candidate => candidate.id === item.faceId);
        if (face) points.push(...face.pointIds.map(pointId => scene.points[pointId]).filter(Boolean) as GeometryPoint3D[]);
      }
    }
  }
  return points;
}

/** Points that contribute to rendered framing, without hidden-only outliers. */
function visibleScene3DPoints(scene: GeometryScene3D): Vector3[] {
  const points: Vector3[] = [];
  for (const point of Object.values(scene.points)) {
    if (!point.hidden) points.push(point);
  }
  for (const entity of Object.values(scene.entities)) {
    if (!entity.hidden) points.push(...anchorPointsForEntity3D(scene, entity));
  }
  return points;
}

function anchorFor3DId(scene: GeometryScene3D, id: string): Vector3 | null {
  const point = scene.points[id];
  if (point) return point;
  const entity = scene.entities[id];
  if (entity) {
    const points = anchorPointsForEntity3D(scene, entity);
    return points.length ? centroid3(points) : null;
  }
  const plane = planeDataForReference(scene, id);
  return plane?.origin ?? null;
}

function anchorPointsForEntity3D(scene: GeometryScene3D, entity: GeometryEntity3D): Vector3[] {
  if (entity.kind === 'solid') return entity.pointIds.map(pointId => scene.points[pointId]).filter(Boolean) as GeometryPoint3D[];
  if (entity.kind === 'crossSection') return entity.pointIds.map(pointId => scene.points[pointId]).filter(Boolean) as GeometryPoint3D[];
  if (entity.kind === 'surface3d') return entity.vertices;
  if (entity.kind === 'curve3d') return entity.points;
  if ('pointIds' in entity) {
    return entity.pointIds.map(pointId => scene.points[pointId]).filter(Boolean) as GeometryPoint3D[];
  }
  if (entity.kind === 'circle') {
    const center = scene.points[entity.centerId];
    return center ? [center] : [];
  }
  return [];
}

function boundsForPoints(points: readonly Vector3[]): { min: Vector3; max: Vector3 } {
  if (!points.length) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  }
  const first = points[0] as Vector3;
  const min = { x: first.x, y: first.y, z: first.z };
  const max = { ...min };
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index] as Vector3;
    min.x = Math.min(min.x, point.x);
    min.y = Math.min(min.y, point.y);
    min.z = Math.min(min.z, point.z);
    max.x = Math.max(max.x, point.x);
    max.y = Math.max(max.y, point.y);
    max.z = Math.max(max.z, point.z);
  }
  return { min, max };
}

/**
 * Distance needed to contain a bounding sphere in the renderer's vertical FOV.
 * The narrower horizontal/vertical half-angle wins for the supplied aspect
 * ratio. Fit resets zoom to one.
 */
function geometryLabCameraFitDistance(
  radius: number,
  camera: Camera3DState,
  aspectRatio: number,
): number {
  const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const halfVerticalFov = degreesToRadians(clamp(camera.fov, 0.01, 179.99)) / 2;
  const verticalSlope = Math.tan(halfVerticalFov);
  const limitingSlope = verticalSlope * Math.min(1, safeAspectRatio);
  const paddedRadius = radius * 1.1;
  if (camera.projection === 'orthographic') {
    // Orthographic scale is matched to perspective at the orbit target. Keep
    // the eye outside the sphere because near-plane clipping still applies.
    return Math.max(paddedRadius, paddedRadius / limitingSlope);
  }
  const limitingHalfAngle = Math.atan(limitingSlope);
  return paddedRadius / Math.sin(limitingHalfAngle);
}

function estimatedSurfaceMeshUsage(entity: SurfaceEntity3D): { vertices: number; faces: number } {
  const sampleCounts = (['x', 'y', 'z', 'u', 'v'] as const).flatMap(axis => {
    const value = entity.samples?.[axis];
    return Number.isSafeInteger(value) && (value as number) > 0 ? [value as number] : [];
  });
  let authoredVertices = 0;
  let authoredFaces = 0;
  if (sampleCounts.length > 0 || entity.surfaceKind === 'equation') {
    let first = sampleCounts[0] ?? 56;
    let second = sampleCounts[1] ?? first;
    if (entity.surfaceKind === 'equation') {
      for (const count of sampleCounts) first = Math.max(first, count);
      second = first;
    }
    authoredVertices = first * second;
    authoredFaces = 2 * Math.max(0, first - 1) * Math.max(0, second - 1);
  }
  return {
    vertices: Math.max(entity.vertices.length, authoredVertices),
    faces: Math.max(entity.faces.length, authoredFaces),
  };
}

function saturatingSafeIntegerAdd(first: number, second: number): number {
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(second) || first < 0 || second < 0) {
    return Number.MAX_SAFE_INTEGER;
  }
  return first > Number.MAX_SAFE_INTEGER - second ? Number.MAX_SAFE_INTEGER : first + second;
}

function centroid3(points: Vector3[]): Vector3 {
  if (!points.length) return { x: 0, y: 0, z: 0 };
  const sum = points.reduce((acc, point) => add3(acc, point), { x: 0, y: 0, z: 0 });
  return scale3(sum, 1 / points.length);
}

function midpoint3(first: Vector3, second: Vector3): Vector3 {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2, z: (first.z + second.z) / 2 };
}

function add3(first: Vector3, second: Vector3): Vector3 {
  return { x: first.x + second.x, y: first.y + second.y, z: first.z + second.z };
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

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}

function interpolate(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function cloneSnapshot(snapshot: GeometryLabSnapshot): GeometryLabSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as GeometryLabSnapshot;
}

/**
 * Snapshots whose shell has already been frozen, so repeated reads of the same
 * version cost nothing. Keyed by the snapshot object: a new version is a new
 * key, and there is nothing to invalidate.
 */
const frozenGeometryLabShells = new WeakSet<GeometryLabSnapshot>();

/**
 * Freezes the snapshot's containers - the snapshot, its scenes, its app state
 * and the eight record maps - and nothing below them.
 *
 * <p>Bounded work regardless of scene size, which is the whole point: the
 * records inside can hold tens of thousands of mesh vertices, and walking them
 * would cost more than the deep copy this replaces.
 */
function freezeGeometryLabSnapshotShell(snapshot: GeometryLabSnapshot): GeometryLabSnapshot {
  if (frozenGeometryLabShells.has(snapshot)) return snapshot;

  const scene2d = snapshot.scene.scene2d;
  const scene3d = snapshot.scene.scene3d;
  Object.freeze(scene2d.points);
  Object.freeze(scene2d.entities);
  if (scene2d.constraints) Object.freeze(scene2d.constraints);
  Object.freeze(scene3d.points);
  Object.freeze(scene3d.entities);
  Object.freeze(scene3d.workPlanes);
  Object.freeze(scene3d.measurements);
  Object.freeze(scene3d.nets);
  Object.freeze(scene2d);
  Object.freeze(scene3d);
  Object.freeze(snapshot.scene.links);
  Object.freeze(snapshot.scene);
  Object.freeze(snapshot.appState);
  Object.freeze(snapshot);

  frozenGeometryLabShells.add(snapshot);
  return snapshot;
}

function geometryLabSdkError(error: unknown, fallbackCode: string): KleinSdkError {
  if (error instanceof KleinSdkError) return error;
  return new KleinSdkError(
    fallbackCode,
    error instanceof Error ? error.message : String(error),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
