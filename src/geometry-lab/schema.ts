import type { ValidationIssue, ValidationResult } from '../core/index.js';
import type {
  GeometryConstraint,
  GeometryConstruction,
  GeometryEntity,
} from '../geometry-core/index.js';
import type {
  GeometryEntity3D,
  GeometryLabCommand,
  GeometryLabDelta,
  GeometryLabHistoryRef,
  GeometryLabSnapshot,
  GeometryLabTool,
  WorkPlaneSource3D,
} from './types.js';

type UnknownRecord = Record<string, unknown>;

interface ValidationContext {
  issues: ValidationIssue[];
  jsonAncestors: WeakSet<object>;
  maximumIssues: number;
}

type ValueValidator = (value: unknown, path: string, context: ValidationContext) => void;

const hasOwn = (value: UnknownRecord, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

const GEOMETRY_LAB_TOOLS: Record<GeometryLabTool, true> = {
  select: true,
  pan: true,
  orbit: true,
  point: true,
  segment: true,
  polygon: true,
  circle: true,
  angle: true,
  stamp: true,
  midpoint: true,
  perpendicular: true,
  parallel: true,
  bisector: true,
  label: true,
  color: true,
  hide: true,
  cut: true,
  scale: true,
  rotate: true,
  solid: true,
  workPlane: true,
  crossSection: true,
  net: true,
  equation: true,
  remove: true,
};

const GEOMETRY_ENTITY_KINDS: Record<GeometryEntity['kind'], true> = {
  segment: true,
  ray: true,
  line: true,
  vector: true,
  polygon: true,
  circle: true,
  arc: true,
  conic: true,
  parametricCurve: true,
  angle: true,
  plane: true,
  locus: true,
  relationMarker: true,
};

const GEOMETRY_ENTITY_3D_KINDS: Record<GeometryEntity3D['kind'], true> = {
  ...GEOMETRY_ENTITY_KINDS,
  solid: true,
  crossSection: true,
  surface3d: true,
  curve3d: true,
};

const GEOMETRY_CONSTRUCTION_KINDS: Record<GeometryConstruction['kind'], true> = {
  midpoint: true,
  intersection: true,
  lineThroughPoints: true,
  circleCenterPoint: true,
  circumcenter: true,
  circleThroughPoints: true,
  parallelLine: true,
  perpendicularLine: true,
  tangentLine: true,
  angleBisector: true,
  angleFromLines: true,
  transformedPoint: true,
  linePlaneIntersection: true,
  planePlaneIntersection: true,
  custom: true,
};

const GEOMETRY_CONSTRAINT_KINDS: Record<GeometryConstraint['kind'], true> = {
  fixedLength: true,
  fixedAngle: true,
  parallel: true,
  perpendicular: true,
  equalLength: true,
  equalRadius: true,
};

const WORK_PLANE_SOURCE_KINDS: Record<WorkPlaneSource3D['kind'], true> = {
  threePoints: true,
  equation: true,
  parallelPlane: true,
  perpendicularPlane: true,
  perpendicularLine: true,
};

const DELTA_OPS: Record<GeometryLabDelta['op'], true> = {
  addPoint2D: true,
  addPoint3D: true,
  updatePoint: true,
  addEntity2D: true,
  addEntity3D: true,
  updateEntity: true,
  addWorkPlane: true,
  updateWorkPlane: true,
  deleteWorkPlane: true,
  addConstraint2D: true,
  deleteConstraint2D: true,
  addMeasurement2D: true,
  deleteMeasurement2D: true,
  addMeasurement: true,
  updateMeasurement: true,
  deleteMeasurement: true,
  addNet: true,
  deleteNet: true,
  delete: true,
  setSceneLink: true,
  setAppState: true,
  setView3D: true,
  clear2D: true,
  clear3D: true,
  clearAll: true,
  historyPatch: true,
  batch: true,
};

const COMMAND_TYPES: Record<GeometryLabCommand['type'], true> = {
  undo: true,
  redo: true,
  setTool: true,
  getSnapshot: true,
  addPoint3D: true,
  addSegment3D: true,
  addLine3D: true,
  addCube: true,
  addSphere: true,
  addSurfaceZ: true,
  addEquationSurface3D: true,
  updateEquationSurface3D: true,
  delete: true,
  setCameraPreset: true,
  addVolumeMeasurement: true,
  addSurfaceAreaMeasurement: true,
};

const RECORD_HISTORY_COLLECTIONS = new Set([
  'point2d',
  'entity2d',
  'constraint2d',
  'measurement2d',
  'point3d',
  'entity3d',
  'workPlane',
  'measurement',
  'net',
  'link',
]);

const APP_STATE_KEYS = new Set([
  'activeView',
  'view2d',
  'view3d',
  'activeTool',
  'activeWorkPlaneId',
  'selected',
]);

const ENTITY_DISPLAY_KEYS = [
  'label',
  'color',
  'strokeColor',
  'fillColor',
  'width',
  'hidden',
  'locked',
  'construction',
] as const;

const LAB_STYLE_KEYS = ['label', 'color', 'hidden', 'locked'] as const;

/** Strict, path-aware validation for imported Geometry Lab snapshots. */
export function validateGeometryLabSnapshotStrict(value: unknown, maximumIssues = Number.MAX_SAFE_INTEGER): ValidationResult<GeometryLabSnapshot> {
  return validateResult(value, validateSnapshotValue, maximumIssues);
}

/** Strict, exhaustive validation for every currently declared Geometry Lab delta operation. */
export function validateGeometryLabDeltaStrict(value: unknown, maximumIssues = Number.MAX_SAFE_INTEGER): ValidationResult<GeometryLabDelta> {
  return validateResult(value, (input, path, context) => validateDeltaValue(input, path, context, 0), maximumIssues);
}

/** Strict, exhaustive validation for every currently declared Geometry Lab runtime command. */
export function validateGeometryLabCommandStrict(value: unknown, maximumIssues = Number.MAX_SAFE_INTEGER): ValidationResult<GeometryLabCommand> {
  return validateResult(value, validateCommandValue, maximumIssues);
}

export const validateGeometryLabSnapshotSchema = validateGeometryLabSnapshotStrict;
export const validateGeometryLabDeltaSchema = validateGeometryLabDeltaStrict;
export const validateGeometryLabCommandSchema = validateGeometryLabCommandStrict;

function validateResult<T>(value: unknown, validator: ValueValidator, maximumIssues: number): ValidationResult<T> {
  const issueLimit = Number.isSafeInteger(maximumIssues) && maximumIssues > 0 ? maximumIssues : 1;
  const context: ValidationContext = { issues: [], jsonAncestors: new WeakSet(), maximumIssues: issueLimit };
  validator(value, '', context);
  return context.issues.length > 0
    ? { ok: false, issues: context.issues }
    : { ok: true, value: value as T };
}

function validateSnapshotValue(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['version', 'instrument', 'scene', 'appState', 'metadata']);
  if (!record) return;
  required(record, 'version', path, context, (item, itemPath, itemContext) => literal(item, itemPath, itemContext, 1));
  required(record, 'instrument', path, context, (item, itemPath, itemContext) => literal(item, itemPath, itemContext, 'geometry-lab'));
  required(record, 'scene', path, context, validateScene);
  required(record, 'appState', path, context, validateAppState);
  optional(record, 'metadata', path, context, validateMetadata);
  validateSnapshotRecordIds(record, context);
}

function validateSnapshotRecordIds(snapshot: UnknownRecord, context: ValidationContext): void {
  const scene = isPlainRecord(snapshot.scene) ? snapshot.scene : null;
  const scene2d = scene && isPlainRecord(scene.scene2d) ? scene.scene2d : null;
  const scene3d = scene && isPlainRecord(scene.scene3d) ? scene.scene3d : null;
  const collections: Array<[string, unknown]> = [
    ['scene.scene2d.points', scene2d?.points],
    ['scene.scene2d.entities', scene2d?.entities],
    ['scene.scene2d.constraints', scene2d?.constraints],
    ['scene.scene3d.points', scene3d?.points],
    ['scene.scene3d.entities', scene3d?.entities],
    ['scene.scene3d.workPlanes', scene3d?.workPlanes],
    ['scene.scene3d.measurements', scene3d?.measurements],
    ['scene.scene3d.nets', scene3d?.nets],
  ];
  const seen = new Map<string, string>();
  const register = (id: unknown, idPath: string): void => {
    if (typeof id !== 'string' || id.length === 0) return;
    const previousPath = seen.get(id);
    if (previousPath) {
      issue(context, idPath, `Duplicate top-level id "${id}"; it is already used at ${previousPath}.`);
    } else {
      seen.set(id, idPath);
    }
  };

  for (const [collectionPath, value] of collections) {
    if (!isPlainRecord(value)) continue;
    for (const [key, item] of Object.entries(value)) {
      if (isPlainRecord(item)) register(item.id, `${recordPath(collectionPath, key)}.id`);
    }
  }
  if (scene && Array.isArray(scene.links)) {
    scene.links.forEach((link, index) => {
      if (isPlainRecord(link)) register(link.id, `scene.links[${index}].id`);
    });
  }
}

function validateScene(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['scene2d', 'scene3d', 'links']);
  if (!record) return;
  required(record, 'scene2d', path, context, validateScene2D);
  required(record, 'scene3d', path, context, validateScene3D);
  required(record, 'links', path, context, (item, itemPath, itemContext) => array(item, itemPath, itemContext, validateSceneLink));
}

function validateScene2D(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['kind', 'points', 'entities', 'constraints', 'measurements']);
  if (!record) return;
  required(record, 'kind', path, context, (item, itemPath, itemContext) => literal(item, itemPath, itemContext, 'geometry-lab-2d'));
  required(record, 'points', path, context, (item, itemPath, itemContext) => recordMap(item, itemPath, itemContext, validatePoint2D));
  required(record, 'entities', path, context, (item, itemPath, itemContext) => recordMap(item, itemPath, itemContext, validateGeometryEntity));
  optional(record, 'constraints', path, context, (item, itemPath, itemContext) => recordMap(item, itemPath, itemContext, validateGeometryConstraint));
  optional(record, 'measurements', path, context, (item, itemPath, itemContext) => recordMap(item, itemPath, itemContext, validateMeasurement2D));
}

function validateScene3D(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['kind', 'points', 'entities', 'workPlanes', 'measurements', 'nets']);
  if (!record) return;
  required(record, 'kind', path, context, (item, itemPath, itemContext) => literal(item, itemPath, itemContext, 'geometry-lab-3d'));
  required(record, 'points', path, context, (item, itemPath, itemContext) => recordMap(item, itemPath, itemContext, validatePoint3D));
  required(record, 'entities', path, context, (item, itemPath, itemContext) => recordMap(item, itemPath, itemContext, validateGeometryEntity3D));
  required(record, 'workPlanes', path, context, (item, itemPath, itemContext) => recordMap(item, itemPath, itemContext, validateWorkPlane));
  required(record, 'measurements', path, context, (item, itemPath, itemContext) => recordMap(item, itemPath, itemContext, validateMeasurement));
  required(record, 'nets', path, context, (item, itemPath, itemContext) => recordMap(item, itemPath, itemContext, validateNet));
}

function validateMetadata(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['title', 'locale', 'createdAt', 'updatedAt']);
  if (!record) return;
  optional(record, 'title', path, context, stringValue);
  optional(record, 'locale', path, context, stringValue);
  optional(record, 'createdAt', path, context, finiteNumber);
  optional(record, 'updatedAt', path, context, finiteNumber);
}

function validateAppState(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, [...APP_STATE_KEYS]);
  if (!record) return;
  required(record, 'activeView', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['2d', '3d', 'split']));
  required(record, 'view2d', path, context, validateView2D);
  required(record, 'view3d', path, context, validateCamera3D);
  optional(record, 'activeTool', path, context, validateTool);
  optional(record, 'activeWorkPlaneId', path, context, nonEmptyString);
  optional(record, 'selected', path, context, (item, itemPath, itemContext) => array(item, itemPath, itemContext, validateSelection));
}

function validateView2D(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['x', 'y', 'zoom']);
  if (!record) return;
  required(record, 'x', path, context, finiteNumber);
  required(record, 'y', path, context, finiteNumber);
  required(record, 'zoom', path, context, positiveFiniteNumber);
}

function validateCamera3D(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['position', 'target', 'up', 'fov', 'zoom', 'projection']);
  if (!record) return;
  required(record, 'position', path, context, vector3Tuple);
  required(record, 'target', path, context, vector3Tuple);
  required(record, 'up', path, context, vector3Tuple);
  required(record, 'fov', path, context, (item, itemPath, itemContext) => {
    positiveFiniteNumber(item, itemPath, itemContext);
    if (typeof item === 'number' && Number.isFinite(item) && item >= 180) issue(itemContext, itemPath, 'Expected a field of view below 180 degrees.');
  });
  required(record, 'zoom', path, context, positiveFiniteNumber);
  required(record, 'projection', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['perspective', 'orthographic']));
}

function validateSelection(value: unknown, path: string, context: ValidationContext): void {
  const record = plainRecord(value, path, context);
  if (!record) return;
  if (typeof record.kind !== 'string') {
    issue(context, childPath(path, 'kind'), 'Expected a selection kind.');
    return;
  }
  if (record.kind === 'face' || record.kind === 'edge') {
    const edgeKey = record.kind === 'face' ? 'faceId' : 'edgeId';
    rejectUnknown(record, path, context, ['kind', 'solidId', edgeKey]);
    literal(record.kind, childPath(path, 'kind'), context, record.kind);
    required(record, 'solidId', path, context, nonEmptyString);
    required(record, edgeKey, path, context, nonEmptyString);
    return;
  }
  if (['point2d', 'point3d', 'entity2d', 'entity3d'].includes(record.kind)) {
    rejectUnknown(record, path, context, ['kind', 'id']);
    required(record, 'id', path, context, nonEmptyString);
    return;
  }
  issue(context, childPath(path, 'kind'), `Unknown selection kind "${record.kind}".`);
}

function validatePoint2D(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['id', 'kind', 'x', 'y', 'label', 'color', 'hidden', 'locked', 'construction']);
  if (!record) return;
  validatePointCommon(record, path, context, 'point2d');
  required(record, 'x', path, context, finiteNumber);
  required(record, 'y', path, context, finiteNumber);
}

function validatePoint3D(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['id', 'kind', 'x', 'y', 'z', 'label', 'color', 'hidden', 'locked', 'construction']);
  if (!record) return;
  validatePointCommon(record, path, context, 'point3d');
  required(record, 'x', path, context, finiteNumber);
  required(record, 'y', path, context, finiteNumber);
  required(record, 'z', path, context, finiteNumber);
}

function validatePointCommon(record: UnknownRecord, path: string, context: ValidationContext, kind: 'point2d' | 'point3d'): void {
  required(record, 'id', path, context, nonEmptyString);
  required(record, 'kind', path, context, (item, itemPath, itemContext) => literal(item, itemPath, itemContext, kind));
  optional(record, 'label', path, context, stringValue);
  optional(record, 'color', path, context, stringValue);
  optional(record, 'hidden', path, context, booleanValue);
  optional(record, 'locked', path, context, booleanValue);
  optional(record, 'construction', path, context, validateConstruction);
}

function validateConstruction(value: unknown, path: string, context: ValidationContext): void {
  const record = plainRecord(value, path, context);
  if (!record) return;
  const kind = record.kind;
  if (typeof kind !== 'string' || !hasOwn(GEOMETRY_CONSTRUCTION_KINDS, kind)) {
    issue(context, childPath(path, 'kind'), `Unknown geometry construction kind ${quoted(kind)}.`);
    return;
  }
  if (kind === 'midpoint' || kind === 'lineThroughPoints' || kind === 'angleFromLines') {
    rejectUnknown(record, path, context, ['kind', 'sourceIds']);
    required(record, 'sourceIds', path, context, idTupleValidator(2));
  } else if (kind === 'intersection') {
    rejectUnknown(record, path, context, ['kind', 'sourceIds', 'index']);
    required(record, 'sourceIds', path, context, idTupleValidator(2));
    optional(record, 'index', path, context, nonNegativeInteger);
  } else if (kind === 'circleCenterPoint') {
    rejectUnknown(record, path, context, ['kind', 'centerPointId', 'radiusPointId']);
    required(record, 'centerPointId', path, context, nonEmptyString);
    required(record, 'radiusPointId', path, context, nonEmptyString);
  } else if (kind === 'circumcenter' || kind === 'circleThroughPoints' || kind === 'angleBisector') {
    rejectUnknown(record, path, context, ['kind', 'pointIds']);
    required(record, 'pointIds', path, context, idTupleValidator(3));
  } else if (kind === 'parallelLine' || kind === 'perpendicularLine') {
    rejectUnknown(record, path, context, ['kind', 'sourceLineId', 'throughPointId']);
    required(record, 'sourceLineId', path, context, nonEmptyString);
    required(record, 'throughPointId', path, context, nonEmptyString);
  } else if (kind === 'transformedPoint') {
    rejectUnknown(record, path, context, ['kind', 'sourceId', 'transform']);
    required(record, 'sourceId', path, context, nonEmptyString);
    required(record, 'transform', path, context, validateGeometryTransform2D);
  } else if (kind === 'linePlaneIntersection') {
    rejectUnknown(record, path, context, ['kind', 'lineEntityId', 'planeId']);
    required(record, 'lineEntityId', path, context, nonEmptyString);
    required(record, 'planeId', path, context, nonEmptyString);
  } else if (kind === 'planePlaneIntersection') {
    rejectUnknown(record, path, context, ['kind', 'firstPlaneId', 'secondPlaneId', 'end']);
    required(record, 'firstPlaneId', path, context, nonEmptyString);
    required(record, 'secondPlaneId', path, context, nonEmptyString);
    // Two planes meet in a line, which the model stores as two constructed
    // endpoints; `end` says which of them this point is.
    required(record, 'end', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, [0, 1]));
  } else if (kind === 'tangentLine') {
    rejectUnknown(record, path, context, ['kind', 'circleId', 'throughPointId', 'branch']);
    required(record, 'circleId', path, context, nonEmptyString);
    required(record, 'throughPointId', path, context, nonEmptyString);
    required(record, 'branch', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, [-1, 1]));
  } else {
    rejectUnknown(record, path, context, ['kind', 'sourceIds', 'label']);
    required(record, 'sourceIds', path, context, idArrayValidator());
    optional(record, 'label', path, context, stringValue);
  }
}

function validateGeometryConstraint(value: unknown, path: string, context: ValidationContext): void {
  const record = plainRecord(value, path, context);
  if (!record) return;
  const kind = record.kind;
  if (typeof kind !== 'string' || !hasOwn(GEOMETRY_CONSTRAINT_KINDS, kind)) {
    issue(context, childPath(path, 'kind'), `Unknown geometry constraint kind ${quoted(kind)}.`);
    return;
  }
  const base = ['id', 'kind', 'label', 'enabled'];
  if (kind === 'fixedLength') {
    rejectUnknown(record, path, context, [...base, 'pointIds', 'length']);
    required(record, 'pointIds', path, context, idTupleValidator(2));
    required(record, 'length', path, context, nonNegativeFiniteNumber);
  } else if (kind === 'fixedAngle') {
    rejectUnknown(record, path, context, [...base, 'pointIds', 'degrees']);
    required(record, 'pointIds', path, context, idTupleValidator(3));
    required(record, 'degrees', path, context, finiteNumber);
  } else if (kind === 'parallel' || kind === 'perpendicular') {
    rejectUnknown(record, path, context, [...base, 'entityIds']);
    required(record, 'entityIds', path, context, idTupleValidator(2));
  } else if (kind === 'equalLength') {
    rejectUnknown(record, path, context, [...base, 'segments']);
    required(record, 'segments', path, context, (item, itemPath, itemContext) => tuple(item, itemPath, itemContext, [idTupleValidator(2), idTupleValidator(2)]));
  } else {
    rejectUnknown(record, path, context, [...base, 'circleIds']);
    required(record, 'circleIds', path, context, idTupleValidator(2));
  }
  required(record, 'id', path, context, nonEmptyString);
  optional(record, 'label', path, context, stringValue);
  optional(record, 'enabled', path, context, booleanValue);
}

function validateGeometryEntity(value: unknown, path: string, context: ValidationContext): void {
  const record = plainRecord(value, path, context);
  if (!record) return;
  const kind = record.kind;
  if (typeof kind !== 'string' || !hasOwn(GEOMETRY_ENTITY_KINDS, kind)) {
    issue(context, childPath(path, 'kind'), `Unknown geometry entity kind ${quoted(kind)}.`);
    return;
  }
  validateGeometryEntityByKind(record, path, context, kind as GeometryEntity['kind']);
}

function validateGeometryEntity3D(value: unknown, path: string, context: ValidationContext): void {
  const record = plainRecord(value, path, context);
  if (!record) return;
  const kind = record.kind;
  if (typeof kind !== 'string' || !hasOwn(GEOMETRY_ENTITY_3D_KINDS, kind)) {
    issue(context, childPath(path, 'kind'), `Unknown 3D entity kind ${quoted(kind)}.`);
    return;
  }
  if (kind === 'solid') validateSolid(record, path, context);
  else if (kind === 'crossSection') validateCrossSection(record, path, context);
  else if (kind === 'surface3d') validateSurface(record, path, context);
  else if (kind === 'curve3d') validateCurve3D(record, path, context);
  else validateGeometryEntityByKind(record, path, context, kind as GeometryEntity['kind']);
}

function validateGeometryEntityByKind(record: UnknownRecord, path: string, context: ValidationContext, kind: GeometryEntity['kind']): void {
  const base = ['id', 'kind', ...ENTITY_DISPLAY_KEYS];
  if (kind === 'segment' || kind === 'ray' || kind === 'vector') {
    rejectUnknown(record, path, context, [...base, 'pointIds']);
    required(record, 'pointIds', path, context, idTupleValidator(2));
  } else if (kind === 'line') {
    rejectUnknown(record, path, context, [...base, 'pointIds', 'equation']);
    required(record, 'pointIds', path, context, idTupleValidator(2));
    optional(record, 'equation', path, context, validateLineEquation);
  } else if (kind === 'polygon') {
    rejectUnknown(record, path, context, [...base, 'pointIds']);
    required(record, 'pointIds', path, context, idArrayValidator());
  } else if (kind === 'circle') {
    rejectUnknown(record, path, context, [...base, 'centerId', 'radius']);
    required(record, 'centerId', path, context, nonEmptyString);
    required(record, 'radius', path, context, positiveFiniteNumber);
  } else if (kind === 'arc') {
    rejectUnknown(record, path, context, [...base, 'centerId', 'startId', 'endId']);
    required(record, 'centerId', path, context, nonEmptyString);
    required(record, 'startId', path, context, nonEmptyString);
    required(record, 'endId', path, context, nonEmptyString);
  } else if (kind === 'conic') {
    rejectUnknown(record, path, context, [...base, 'conicKind', 'points', 'segments', 'closed', 'equation', 'center', 'rotationDegrees']);
    required(record, 'conicKind', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['ellipse', 'parabola', 'hyperbola']));
    required(record, 'points', path, context, vector2Array);
    optional(record, 'segments', path, context, (item, itemPath, itemContext) => array(item, itemPath, itemContext, vector2Array));
    optional(record, 'closed', path, context, booleanValue);
    optional(record, 'equation', path, context, validateConicEquation);
    optional(record, 'center', path, context, vector2Object);
    optional(record, 'rotationDegrees', path, context, finiteNumber);
  } else if (kind === 'parametricCurve') {
    rejectUnknown(record, path, context, [...base, 'points', 'closed', 'parameter']);
    required(record, 'points', path, context, vector2Array);
    optional(record, 'closed', path, context, booleanValue);
    optional(record, 'parameter', path, context, validateParametricCurve2DParameter);
  } else if (kind === 'angle') {
    rejectUnknown(record, path, context, [...base, 'pointIds', 'radius', 'orientation']);
    required(record, 'pointIds', path, context, idTupleValidator(3));
    optional(record, 'radius', path, context, positiveFiniteNumber);
    optional(record, 'orientation', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['interior', 'exterior']));
  } else if (kind === 'plane') {
    rejectUnknown(record, path, context, [...base, 'pointIds']);
    required(record, 'pointIds', path, context, idTupleValidator(3));
  } else if (kind === 'locus') {
    rejectUnknown(record, path, context, [...base, 'points', 'closed']);
    required(record, 'points', path, context, vector2Array);
    optional(record, 'closed', path, context, booleanValue);
  } else {
    rejectUnknown(record, path, context, [...base, 'relationKind', 'targetIds', 'text']);
    required(record, 'relationKind', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['congruence', 'similarity', 'cyclicQuadrilateral', 'triangleType']));
    required(record, 'targetIds', path, context, idArrayValidator());
    optional(record, 'text', path, context, stringValue);
  }
  required(record, 'id', path, context, nonEmptyString);
  required(record, 'kind', path, context, (item, itemPath, itemContext) => literal(item, itemPath, itemContext, kind));
  validateEntityDisplay(record, path, context);
}

function validateEntityDisplay(record: UnknownRecord, path: string, context: ValidationContext): void {
  optional(record, 'label', path, context, stringValue);
  optional(record, 'color', path, context, stringValue);
  optional(record, 'strokeColor', path, context, stringValue);
  optional(record, 'fillColor', path, context, stringValue);
  optional(record, 'width', path, context, nonNegativeFiniteNumber);
  optional(record, 'hidden', path, context, booleanValue);
  optional(record, 'locked', path, context, booleanValue);
  optional(record, 'construction', path, context, validateConstruction);
}

function validateLineEquation(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['a', 'b', 'c', 'input']);
  if (!record) return;
  for (const key of ['a', 'b', 'c']) required(record, key, path, context, finiteNumber);
  optional(record, 'input', path, context, stringValue);
}

function validateConicEquation(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['a', 'b', 'c', 'd', 'e', 'f', 'input']);
  if (!record) return;
  for (const key of ['a', 'b', 'c', 'd', 'e', 'f']) required(record, key, path, context, finiteNumber);
  optional(record, 'input', path, context, stringValue);
}

function validatePlaneEquation(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['a', 'b', 'c', 'd']);
  if (!record) return;
  for (const key of ['a', 'b', 'c', 'd']) required(record, key, path, context, finiteNumber);
}

function validateParametricCurve2DParameter(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['xExpression', 'yExpression', 'tMin', 'tMax', 'samples']);
  if (!record) return;
  required(record, 'xExpression', path, context, stringValue);
  required(record, 'yExpression', path, context, stringValue);
  required(record, 'tMin', path, context, finiteNumber);
  required(record, 'tMax', path, context, finiteNumber);
  required(record, 'samples', path, context, positiveInteger);
  increasingBounds(record, path, context, 'tMin', 'tMax');
}

function validateSolid(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['id', 'kind', 'solid', 'pointIds', 'faceIds', 'faces', 'edges', 'parameters', 'volume', 'surfaceArea', ...LAB_STYLE_KEYS]);
  if (!record) return;
  required(record, 'id', path, context, nonEmptyString);
  required(record, 'kind', path, context, (item, itemPath, itemContext) => literal(item, itemPath, itemContext, 'solid'));
  required(record, 'solid', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['cube', 'cuboid', 'tetrahedron', 'prism', 'pyramid', 'cylinder', 'cone', 'sphere', 'hemisphere', 'polyhedron']));
  required(record, 'pointIds', path, context, idArrayValidator());
  required(record, 'faceIds', path, context, idArrayValidator());
  optional(record, 'faces', path, context, (item, itemPath, itemContext) => array(item, itemPath, itemContext, validateSolidFace));
  optional(record, 'edges', path, context, (item, itemPath, itemContext) => array(item, itemPath, itemContext, validateSolidEdge));
  optional(record, 'parameters', path, context, validateSolidParameters);
  optional(record, 'volume', path, context, nonNegativeFiniteNumber);
  optional(record, 'surfaceArea', path, context, nonNegativeFiniteNumber);
  validateLabStyle(record, path, context);
}

function validateSolidFace(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['id', 'pointIds', 'normal', 'area']);
  if (!record) return;
  required(record, 'id', path, context, nonEmptyString);
  required(record, 'pointIds', path, context, idArrayValidator());
  optional(record, 'normal', path, context, vector3Tuple);
  optional(record, 'area', path, context, nonNegativeFiniteNumber);
}

function validateSolidEdge(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['id', 'pointIds', 'length']);
  if (!record) return;
  required(record, 'id', path, context, nonEmptyString);
  required(record, 'pointIds', path, context, idTupleValidator(2));
  optional(record, 'length', path, context, nonNegativeFiniteNumber);
}

function validateSolidParameters(value: unknown, path: string, context: ValidationContext): void {
  const keys = ['width', 'depth', 'height', 'radius', 'sides', 'baseArea', 'volume', 'surfaceArea'];
  const record = exactRecord(value, path, context, keys);
  if (!record) return;
  for (const key of keys) optional(record, key, path, context, key === 'sides' ? positiveInteger : nonNegativeFiniteNumber);
}

function validateCrossSection(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['id', 'kind', 'solidId', 'planeId', 'pointIds', 'vertices', 'area', 'perimeter', ...LAB_STYLE_KEYS]);
  if (!record) return;
  required(record, 'id', path, context, nonEmptyString);
  required(record, 'kind', path, context, (item, itemPath, itemContext) => literal(item, itemPath, itemContext, 'crossSection'));
  required(record, 'solidId', path, context, nonEmptyString);
  optional(record, 'planeId', path, context, nonEmptyString);
  required(record, 'pointIds', path, context, idArrayValidator());
  optional(record, 'vertices', path, context, vector3Array);
  optional(record, 'area', path, context, nonNegativeFiniteNumber);
  optional(record, 'perimeter', path, context, nonNegativeFiniteNumber);
  validateLabStyle(record, path, context);
}

function validateSurface(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['id', 'kind', 'surfaceKind', 'dependentAxis', 'vertices', 'faces', 'input', 'domain', 'samples', ...LAB_STYLE_KEYS]);
  if (!record) return;
  required(record, 'id', path, context, nonEmptyString);
  required(record, 'kind', path, context, (item, itemPath, itemContext) => literal(item, itemPath, itemContext, 'surface3d'));
  required(record, 'surfaceKind', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['z-function', 'parametric', 'equation']));
  optional(record, 'dependentAxis', path, context, validateAxis);
  required(record, 'vertices', path, context, vector3Array);
  required(record, 'faces', path, context, faceIndexArray);
  optional(record, 'input', path, context, stringValue);
  optional(record, 'domain', path, context, validateSurfaceDomain);
  optional(record, 'samples', path, context, validateSurfaceSamples);
  validateLabStyle(record, path, context);
  if (record.surfaceKind === 'equation' && !hasOwn(record, 'input')) {
    issue(context, childPath(path, 'input'), 'Equation surfaces require their authored input so cached geometry can be rebuilt.');
  }
  if (Array.isArray(record.vertices) && Array.isArray(record.faces)) {
    const vertexCount = record.vertices.length;
    record.faces.forEach((face, faceIndex) => {
      if (!Array.isArray(face)) return;
      face.forEach((index, indexIndex) => {
        if (Number.isInteger(index) && typeof index === 'number' && index >= vertexCount) {
          issue(context, `${childPath(path, 'faces')}[${faceIndex}][${indexIndex}]`, `Vertex index ${index} is outside the vertices array.`);
        }
      });
    });
  }
}

function validateSurfaceDomain(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['x', 'y', 'z', 'u', 'v']);
  if (!record) return;
  for (const key of ['x', 'y', 'z', 'u', 'v']) optional(record, key, path, context, increasingRange);
}

function validateSurfaceSamples(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['x', 'y', 'z', 'u', 'v']);
  if (!record) return;
  for (const key of ['x', 'y', 'z', 'u', 'v']) optional(record, key, path, context, positiveInteger);
}

function validateCurve3D(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['id', 'kind', 'points', 'input', 'parameter', ...LAB_STYLE_KEYS]);
  if (!record) return;
  required(record, 'id', path, context, nonEmptyString);
  required(record, 'kind', path, context, (item, itemPath, itemContext) => literal(item, itemPath, itemContext, 'curve3d'));
  required(record, 'points', path, context, vector3Array);
  optional(record, 'input', path, context, stringValue);
  optional(record, 'parameter', path, context, validateCurve3DParameter);
  validateLabStyle(record, path, context);
}

function validateCurve3DParameter(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['tMin', 'tMax', 'samples']);
  if (!record) return;
  required(record, 'tMin', path, context, finiteNumber);
  required(record, 'tMax', path, context, finiteNumber);
  required(record, 'samples', path, context, positiveInteger);
  increasingBounds(record, path, context, 'tMin', 'tMax');
}

function validateLabStyle(record: UnknownRecord, path: string, context: ValidationContext): void {
  optional(record, 'label', path, context, stringValue);
  optional(record, 'color', path, context, stringValue);
  optional(record, 'hidden', path, context, booleanValue);
  optional(record, 'locked', path, context, booleanValue);
}

function validateWorkPlane(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['id', 'origin', 'normal', 'xAxis', 'yAxis', 'equation', 'source', ...LAB_STYLE_KEYS]);
  if (!record) return;
  required(record, 'id', path, context, nonEmptyString);
  required(record, 'origin', path, context, vector3Tuple);
  required(record, 'normal', path, context, vector3Tuple);
  required(record, 'xAxis', path, context, vector3Tuple);
  optional(record, 'yAxis', path, context, vector3Tuple);
  optional(record, 'equation', path, context, validatePlaneEquation);
  optional(record, 'source', path, context, validateWorkPlaneSource);
  validateLabStyle(record, path, context);
}

function validateWorkPlaneSource(value: unknown, path: string, context: ValidationContext): void {
  const record = plainRecord(value, path, context);
  if (!record) return;
  const kind = record.kind;
  if (typeof kind !== 'string' || !hasOwn(WORK_PLANE_SOURCE_KINDS, kind)) {
    issue(context, childPath(path, 'kind'), `Unknown work-plane source kind ${quoted(kind)}.`);
    return;
  }
  if (kind === 'threePoints') {
    rejectUnknown(record, path, context, ['kind', 'pointIds']);
    required(record, 'pointIds', path, context, idTupleValidator(3));
  } else if (kind === 'equation') {
    rejectUnknown(record, path, context, ['kind', 'input']);
    optional(record, 'input', path, context, stringValue);
  } else if (kind === 'perpendicularLine') {
    rejectUnknown(record, path, context, ['kind', 'sourceEntityId', 'throughPointId', 'through']);
    required(record, 'sourceEntityId', path, context, nonEmptyString);
    validateWorkPlaneThrough(record, path, context);
  } else {
    rejectUnknown(record, path, context, ['kind', 'sourcePlaneId', 'throughPointId', 'through']);
    required(record, 'sourcePlaneId', path, context, nonEmptyString);
    validateWorkPlaneThrough(record, path, context);
  }
}

function validateWorkPlaneThrough(record: UnknownRecord, path: string, context: ValidationContext): void {
  optional(record, 'throughPointId', path, context, nonEmptyString);
  optional(record, 'through', path, context, vector3Tuple);
  if (hasOwn(record, 'throughPointId') && hasOwn(record, 'through')) {
    issue(context, path, 'A work-plane source cannot define both throughPointId and through.');
  }
}

function validateGeometryTransform2D(value: unknown, path: string, context: ValidationContext): void {
  const record = plainRecord(value, path, context);
  if (!record) return;
  if (record.kind === 'translate') {
    rejectUnknown(record, path, context, ['kind', 'vectorEntityId']);
    required(record, 'vectorEntityId', path, context, nonEmptyString);
    return;
  }
  if (record.kind === 'translateBy') {
    rejectUnknown(record, path, context, ['kind', 'dx', 'dy']);
    required(record, 'dx', path, context, finiteNumber);
    required(record, 'dy', path, context, finiteNumber);
    return;
  }
  if (record.kind === 'rotate') {
    rejectUnknown(record, path, context, ['kind', 'centerPointId', 'degrees']);
    required(record, 'centerPointId', path, context, nonEmptyString);
    required(record, 'degrees', path, context, finiteNumber);
    return;
  }
  if (record.kind === 'reflectLine') {
    rejectUnknown(record, path, context, ['kind', 'lineEntityId']);
    required(record, 'lineEntityId', path, context, nonEmptyString);
    return;
  }
  if (record.kind === 'reflectPoint') {
    rejectUnknown(record, path, context, ['kind', 'centerPointId']);
    required(record, 'centerPointId', path, context, nonEmptyString);
    return;
  }
  if (record.kind === 'dilate') {
    rejectUnknown(record, path, context, ['kind', 'centerPointId', 'factor']);
    required(record, 'centerPointId', path, context, nonEmptyString);
    // Zero would collapse every image onto the centre, which is not a dilation.
    required(record, 'factor', path, context, (item, itemPath, itemContext) => {
      finiteNumber(item, itemPath, itemContext);
      if (item === 0) issue(itemContext, itemPath, 'A dilation factor cannot be zero.');
    });
    return;
  }
  issue(context, childPath(path, 'kind'), `Unknown transformation kind ${quoted(record.kind)}.`);
}

function validateMeasurement2D(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['id', 'kind', 'value', 'unit', 'label', 'color', 'hidden', 'targetIds', 'source']);
  if (!record) return;
  required(record, 'id', path, context, nonEmptyString);
  required(record, 'kind', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['length', 'area', 'angle']));
  required(record, 'value', path, context, finiteNumber);
  optional(record, 'unit', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['u', 'u^2', 'deg']));
  optional(record, 'label', path, context, stringValue);
  optional(record, 'color', path, context, stringValue);
  optional(record, 'hidden', path, context, booleanValue);
  optional(record, 'targetIds', path, context, (item, itemPath, itemContext) => array(item, itemPath, itemContext, nonEmptyString));
  required(record, 'source', path, context, validateMeasurementSource2D);
}

function validateMeasurementSource2D(value: unknown, path: string, context: ValidationContext): void {
  const record = plainRecord(value, path, context);
  if (!record) return;
  if (record.kind === 'pointDistance') {
    rejectUnknown(record, path, context, ['kind', 'firstPointId', 'secondPointId']);
    required(record, 'firstPointId', path, context, nonEmptyString);
    required(record, 'secondPointId', path, context, nonEmptyString);
    return;
  }
  if (record.kind === 'segmentLength' || record.kind === 'polygonArea' || record.kind === 'polygonPerimeter') {
    rejectUnknown(record, path, context, ['kind', 'entityId']);
    required(record, 'entityId', path, context, nonEmptyString);
    return;
  }
  if (record.kind === 'pointLineDistance') {
    rejectUnknown(record, path, context, ['kind', 'pointId', 'entityId']);
    required(record, 'pointId', path, context, nonEmptyString);
    required(record, 'entityId', path, context, nonEmptyString);
    return;
  }
  if (record.kind === 'angle') {
    rejectUnknown(record, path, context, ['kind', 'pointIds']);
    required(record, 'pointIds', path, context, idTupleValidator(3));
    return;
  }
  issue(context, childPath(path, 'kind'), `Unknown 2D measurement source kind ${quoted(record.kind)}.`);
}

function validateMeasurement(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['id', 'targetId', 'targetIds', 'kind', 'value', 'unit', 'label', 'source']);
  if (!record) return;
  required(record, 'id', path, context, nonEmptyString);
  required(record, 'targetId', path, context, nonEmptyString);
  optional(record, 'targetIds', path, context, idArrayValidator());
  required(record, 'kind', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['length', 'area', 'surfaceArea', 'volume', 'angle', 'dihedral']));
  required(record, 'value', path, context, finiteNumber);
  optional(record, 'unit', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['u', 'u^2', 'u^3', 'deg']));
  optional(record, 'label', path, context, stringValue);
  optional(record, 'source', path, context, validateMeasurementSource);
}

function validateMeasurementSource(value: unknown, path: string, context: ValidationContext): void {
  const record = plainRecord(value, path, context);
  if (!record) return;
  if (record.kind === 'pointPlaneDistance') {
    rejectUnknown(record, path, context, ['kind', 'pointId', 'planeId']);
    required(record, 'pointId', path, context, nonEmptyString);
    required(record, 'planeId', path, context, nonEmptyString);
    return;
  }
  if (record.kind === 'solidVolume' || record.kind === 'solidSurfaceArea') {
    rejectUnknown(record, path, context, ['kind', 'solidId']);
    required(record, 'solidId', path, context, nonEmptyString);
    return;
  }
  if (record.kind === 'solidDihedral') {
    rejectUnknown(record, path, context, ['kind', 'solidId', 'firstFaceId', 'secondFaceId']);
    required(record, 'solidId', path, context, nonEmptyString);
    required(record, 'firstFaceId', path, context, nonEmptyString);
    required(record, 'secondFaceId', path, context, nonEmptyString);
    return;
  }
  if (record.kind === 'pointPointDistance') {
    rejectUnknown(record, path, context, ['kind', 'firstPointId', 'secondPointId']);
    required(record, 'firstPointId', path, context, nonEmptyString);
    required(record, 'secondPointId', path, context, nonEmptyString);
    return;
  }
  if (record.kind === 'pointLineDistance') {
    rejectUnknown(record, path, context, ['kind', 'pointId', 'lineEntityId']);
    required(record, 'pointId', path, context, nonEmptyString);
    required(record, 'lineEntityId', path, context, nonEmptyString);
    return;
  }
  if (record.kind === 'lineLineAngle' || record.kind === 'lineLineDistance') {
    rejectUnknown(record, path, context, ['kind', 'firstLineId', 'secondLineId']);
    required(record, 'firstLineId', path, context, nonEmptyString);
    required(record, 'secondLineId', path, context, nonEmptyString);
    return;
  }
  if (record.kind === 'linePlaneAngle') {
    rejectUnknown(record, path, context, ['kind', 'lineEntityId', 'planeId']);
    required(record, 'lineEntityId', path, context, nonEmptyString);
    required(record, 'planeId', path, context, nonEmptyString);
    return;
  }
  issue(context, childPath(path, 'kind'), `Unknown measurement source kind ${quoted(record.kind)}.`);
}

function validateNet(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['id', 'solidId', 'faces', 'totalArea', 'label']);
  if (!record) return;
  required(record, 'id', path, context, nonEmptyString);
  required(record, 'solidId', path, context, nonEmptyString);
  required(record, 'faces', path, context, (item, itemPath, itemContext) => array(item, itemPath, itemContext, validateNetFace));
  optional(record, 'totalArea', path, context, nonNegativeFiniteNumber);
  optional(record, 'label', path, context, stringValue);
}

function validateNetFace(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['id', 'sourceFaceId', 'vertices', 'area']);
  if (!record) return;
  required(record, 'id', path, context, nonEmptyString);
  required(record, 'sourceFaceId', path, context, nonEmptyString);
  required(record, 'vertices', path, context, vector2Array);
  optional(record, 'area', path, context, nonNegativeFiniteNumber);
}

function validateSceneLink(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['id', 'kind', 'sourceId', 'targetId']);
  if (!record) return;
  required(record, 'id', path, context, nonEmptyString);
  required(record, 'kind', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['netToSolid', 'extrusion', 'projection']));
  required(record, 'sourceId', path, context, nonEmptyString);
  required(record, 'targetId', path, context, nonEmptyString);
}

function validateDeltaValue(value: unknown, path: string, context: ValidationContext, depth: number): void {
  if (depth > 64) {
    issue(context, path, 'Geometry Lab delta nesting exceeds 64 levels.');
    return;
  }
  const record = plainRecord(value, path, context);
  if (!record) return;
  const op = record.op;
  if (typeof op !== 'string' || !hasOwn(DELTA_OPS, op)) {
    issue(context, childPath(path, 'op'), `Unknown Geometry Lab delta operation ${quoted(op)}.`);
    return;
  }
  if (op === 'batch') {
    rejectUnknown(record, path, context, ['op', 'deltas']);
    required(record, 'deltas', path, context, (item, itemPath, itemContext) => {
      array(item, itemPath, itemContext, (delta, deltaPath, deltaContext) => validateDeltaValue(delta, deltaPath, deltaContext, depth + 1));
    });
    return;
  }
  if (op === 'historyPatch') {
    rejectUnknown(record, path, context, ['op', 'patches']);
    required(record, 'patches', path, context, (item, itemPath, itemContext) => array(item, itemPath, itemContext, validateHistoryPatch));
    return;
  }
  if (op === 'addPoint2D') validateOpPayload(record, path, context, 'point', validatePoint2D);
  else if (op === 'addPoint3D') validateOpPayload(record, path, context, 'point', validatePoint3D);
  else if (op === 'updatePoint') validateIdAndChanges(record, path, context, validatePointChanges);
  else if (op === 'addEntity2D') validateOpPayload(record, path, context, 'entity', validateGeometryEntity);
  else if (op === 'addEntity3D') validateOpPayload(record, path, context, 'entity', validateGeometryEntity3D);
  else if (op === 'updateEntity') validateIdAndChanges(record, path, context, validateEntityChanges);
  else if (op === 'addWorkPlane') validateOpPayload(record, path, context, 'plane', validateWorkPlane);
  else if (op === 'updateWorkPlane') validateIdAndChanges(record, path, context, validateWorkPlaneChanges);
  else if (op === 'deleteWorkPlane' || op === 'deleteMeasurement' || op === 'deleteMeasurement2D' || op === 'deleteConstraint2D' || op === 'deleteNet' || op === 'delete') validateIdsOp(record, path, context);
  else if (op === 'addMeasurement2D') validateOpPayload(record, path, context, 'measurement', validateMeasurement2D);
  else if (op === 'addConstraint2D') validateOpPayload(record, path, context, 'constraint', validateGeometryConstraint);
  else if (op === 'addMeasurement') validateOpPayload(record, path, context, 'measurement', validateMeasurement);
  else if (op === 'updateMeasurement') validateIdAndChanges(record, path, context, validateMeasurementChanges);
  else if (op === 'addNet') validateOpPayload(record, path, context, 'net', validateNet);
  else if (op === 'setSceneLink') validateOpPayload(record, path, context, 'link', validateSceneLink);
  else if (op === 'setAppState') {
    rejectUnknown(record, path, context, ['op', 'changes']);
    required(record, 'changes', path, context, validateAppStateChanges);
  } else if (op === 'setView3D') {
    rejectUnknown(record, path, context, ['op', 'view']);
    required(record, 'view', path, context, validateCamera3D);
  } else {
    rejectUnknown(record, path, context, ['op']);
  }
}

function validateOpPayload(record: UnknownRecord, path: string, context: ValidationContext, key: string, validator: ValueValidator): void {
  rejectUnknown(record, path, context, ['op', key]);
  required(record, key, path, context, validator);
}

function validateIdAndChanges(record: UnknownRecord, path: string, context: ValidationContext, validator: ValueValidator): void {
  rejectUnknown(record, path, context, ['op', 'id', 'changes']);
  required(record, 'id', path, context, nonEmptyString);
  required(record, 'changes', path, context, validator);
}

function validateIdsOp(record: UnknownRecord, path: string, context: ValidationContext): void {
  rejectUnknown(record, path, context, ['op', 'ids']);
  required(record, 'ids', path, context, (item, itemPath, itemContext) => array(item, itemPath, itemContext, nonEmptyString));
}

function validatePointChanges(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['id', 'kind', 'x', 'y', 'z', 'label', 'color', 'hidden', 'locked', 'construction']);
  if (!record) return;
  optional(record, 'id', path, context, nonEmptyString);
  optional(record, 'kind', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['point2d', 'point3d']));
  for (const key of ['x', 'y', 'z']) optional(record, key, path, context, finiteNumber);
  optional(record, 'label', path, context, stringValue);
  optional(record, 'color', path, context, stringValue);
  optional(record, 'hidden', path, context, booleanValue);
  optional(record, 'locked', path, context, booleanValue);
  optional(record, 'construction', path, context, validateConstruction);
}

function validateEntityChanges(value: unknown, path: string, context: ValidationContext): void {
  const keys = [
    'id', 'kind', 'label', 'color', 'strokeColor', 'fillColor', 'width', 'hidden', 'locked', 'construction',
    'pointIds', 'equation', 'centerId', 'radius', 'startId', 'endId', 'conicKind', 'points', 'segments', 'closed',
    'center', 'rotationDegrees', 'parameter', 'orientation', 'relationKind', 'targetIds', 'text', 'solid', 'faceIds',
    'faces', 'edges', 'parameters', 'volume', 'surfaceArea', 'solidId', 'planeId', 'vertices', 'area', 'perimeter',
    'surfaceKind', 'dependentAxis', 'input', 'domain', 'samples',
  ];
  const record = exactRecord(value, path, context, keys);
  if (!record) return;
  optional(record, 'id', path, context, nonEmptyString);
  optional(record, 'kind', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, Object.keys(GEOMETRY_ENTITY_3D_KINDS)));
  for (const key of ['label', 'color', 'strokeColor', 'fillColor', 'startId', 'endId', 'centerId', 'text', 'solidId', 'planeId', 'input']) optional(record, key, path, context, stringValue);
  for (const key of ['width', 'radius', 'rotationDegrees', 'volume', 'surfaceArea', 'area', 'perimeter']) optional(record, key, path, context, finiteNumber);
  for (const key of ['hidden', 'locked', 'closed']) optional(record, key, path, context, booleanValue);
  optional(record, 'construction', path, context, validateConstruction);
  optional(record, 'pointIds', path, context, idArrayValidator());
  optional(record, 'faceIds', path, context, idArrayValidator());
  optional(record, 'targetIds', path, context, idArrayValidator());
  optional(record, 'dependentAxis', path, context, validateAxis);
  optional(record, 'surfaceKind', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['z-function', 'parametric', 'equation']));
  optional(record, 'solid', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['cube', 'cuboid', 'tetrahedron', 'prism', 'pyramid', 'cylinder', 'cone', 'sphere', 'hemisphere', 'polyhedron']));
  optional(record, 'conicKind', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['ellipse', 'parabola', 'hyperbola']));
  optional(record, 'orientation', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['interior', 'exterior']));
  optional(record, 'relationKind', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['congruence', 'similarity', 'cyclicQuadrilateral', 'triangleType']));
  validateAmbiguousEntityChangeObjects(record, path, context);
}

function validateAmbiguousEntityChangeObjects(record: UnknownRecord, path: string, context: ValidationContext): void {
  const kind = record.kind;
  optional(record, 'equation', path, context, kind === 'conic'
    ? validateConicEquation
    : kind === 'line'
      ? validateLineEquation
      : alternativeValidator([validateLineEquation, validateConicEquation]));
  optional(record, 'center', path, context, vector2Object);
  optional(record, 'points', path, context, kind === 'curve3d'
    ? vector3Array
    : typeof kind === 'string'
      ? vector2Array
      : alternativeValidator([vector2Array, vector3Array]));
  optional(record, 'segments', path, context, (item, itemPath, itemContext) => array(item, itemPath, itemContext, vector2Array));
  optional(record, 'vertices', path, context, vector3Array);
  optional(record, 'faces', path, context, kind === 'solid'
    ? (item, itemPath, itemContext) => array(item, itemPath, itemContext, validateSolidFace)
    : kind === 'surface3d'
      ? faceIndexArray
      : alternativeValidator([
        (item, itemPath, itemContext) => array(item, itemPath, itemContext, validateSolidFace),
        faceIndexArray,
      ]));
  optional(record, 'edges', path, context, (item, itemPath, itemContext) => array(item, itemPath, itemContext, validateSolidEdge));
  optional(record, 'parameters', path, context, validateSolidParameters);
  optional(record, 'parameter', path, context, kind === 'curve3d'
    ? validateCurve3DParameter
    : kind === 'parametricCurve'
      ? validateParametricCurve2DParameter
      : alternativeValidator([validateParametricCurve2DParameter, validateCurve3DParameter]));
  optional(record, 'domain', path, context, validateSurfaceDomain);
  optional(record, 'samples', path, context, validateSurfaceSamples);
}

function validateWorkPlaneChanges(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['id', 'origin', 'normal', 'xAxis', 'yAxis', 'equation', 'source', ...LAB_STYLE_KEYS]);
  if (!record) return;
  optional(record, 'id', path, context, nonEmptyString);
  for (const key of ['origin', 'normal', 'xAxis', 'yAxis']) optional(record, key, path, context, vector3Tuple);
  optional(record, 'equation', path, context, validatePlaneEquation);
  optional(record, 'source', path, context, validateWorkPlaneSource);
  validateLabStyle(record, path, context);
}

function validateMeasurementChanges(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['id', 'targetId', 'targetIds', 'kind', 'value', 'unit', 'label', 'source']);
  if (!record) return;
  optional(record, 'id', path, context, nonEmptyString);
  optional(record, 'targetId', path, context, nonEmptyString);
  optional(record, 'targetIds', path, context, idArrayValidator());
  optional(record, 'kind', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['length', 'area', 'surfaceArea', 'volume', 'angle', 'dihedral']));
  optional(record, 'value', path, context, finiteNumber);
  optional(record, 'unit', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['u', 'u^2', 'u^3', 'deg']));
  optional(record, 'label', path, context, stringValue);
  optional(record, 'source', path, context, validateMeasurementSource);
}

function validateAppStateChanges(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, [...APP_STATE_KEYS]);
  if (!record) return;
  optional(record, 'activeView', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['2d', '3d', 'split']));
  optional(record, 'view2d', path, context, validateView2D);
  optional(record, 'view3d', path, context, validateCamera3D);
  optional(record, 'activeTool', path, context, validateTool);
  optional(record, 'activeWorkPlaneId', path, context, nonEmptyString);
  optional(record, 'selected', path, context, (item, itemPath, itemContext) => array(item, itemPath, itemContext, validateSelection));
}

function validateHistoryPatch(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['ref', 'expected', 'next']);
  if (!record) return;
  required(record, 'ref', path, context, validateHistoryRef);
  required(record, 'expected', path, context, validateHistoryValue);
  required(record, 'next', path, context, validateHistoryValue);
  if (!isPlainRecord(record.ref)) return;
  const ref = record.ref as GeometryLabHistoryRef;
  validateHistoryValueForRef(record.expected, childPath(path, 'expected'), context, ref);
  validateHistoryValueForRef(record.next, childPath(path, 'next'), context, ref);
}

function validateHistoryRef(value: unknown, path: string, context: ValidationContext): void {
  const record = plainRecord(value, path, context);
  if (!record) return;
  if (record.collection === 'metadata') {
    rejectUnknown(record, path, context, ['collection']);
    return;
  }
  if (record.collection === 'appState') {
    rejectUnknown(record, path, context, ['collection', 'key']);
    required(record, 'key', path, context, (item, itemPath, itemContext) => {
      nonEmptyString(item, itemPath, itemContext);
      if (typeof item === 'string' && !APP_STATE_KEYS.has(item)) issue(itemContext, itemPath, `Unknown app-state history key "${item}".`);
    });
    return;
  }
  if (typeof record.collection === 'string' && RECORD_HISTORY_COLLECTIONS.has(record.collection)) {
    rejectUnknown(record, path, context, ['collection', 'id']);
    required(record, 'id', path, context, nonEmptyString);
    return;
  }
  issue(context, childPath(path, 'collection'), `Unknown history collection ${quoted(record.collection)}.`);
}

function validateHistoryValue(value: unknown, path: string, context: ValidationContext): void {
  const record = plainRecord(value, path, context);
  if (!record) return;
  if (record.present === false) {
    rejectUnknown(record, path, context, ['present']);
    return;
  }
  if (record.present === true) {
    rejectUnknown(record, path, context, ['present', 'value']);
    required(record, 'value', path, context, validateJsonValue);
    return;
  }
  issue(context, childPath(path, 'present'), 'Expected a boolean history presence discriminator.');
}

function validateHistoryValueForRef(value: unknown, path: string, context: ValidationContext, ref: GeometryLabHistoryRef): void {
  if (!isPlainRecord(value) || value.present !== true || !hasOwn(value, 'value')) return;
  const validator = historyRefValidator(ref);
  if (!validator) return;
  validator(value.value, childPath(path, 'value'), context);
  if ('id' in ref && isPlainRecord(value.value) && value.value.id !== ref.id) {
    issue(context, `${childPath(path, 'value')}.id`, `Expected record id "${ref.id}" to match its history reference.`);
  }
}

function historyRefValidator(ref: GeometryLabHistoryRef): ValueValidator | null {
  if (ref.collection === 'point2d') return validatePoint2D;
  if (ref.collection === 'entity2d') return validateGeometryEntity;
  if (ref.collection === 'constraint2d') return validateGeometryConstraint;
  if (ref.collection === 'point3d') return validatePoint3D;
  if (ref.collection === 'entity3d') return validateGeometryEntity3D;
  if (ref.collection === 'workPlane') return validateWorkPlane;
  if (ref.collection === 'measurement') return validateMeasurement;
  if (ref.collection === 'net') return validateNet;
  if (ref.collection === 'link') return validateSceneLink;
  if (ref.collection === 'metadata') return validateMetadata;
  if (ref.collection === 'appState') return appStateFieldValidator(ref.key);
  return null;
}

function appStateFieldValidator(key: string): ValueValidator | null {
  if (key === 'activeView') return (item, path, context) => oneOf(item, path, context, ['2d', '3d', 'split']);
  if (key === 'view2d') return validateView2D;
  if (key === 'view3d') return validateCamera3D;
  if (key === 'activeTool') return validateTool;
  if (key === 'activeWorkPlaneId') return nonEmptyString;
  if (key === 'selected') return (item, path, context) => array(item, path, context, validateSelection);
  return null;
}

function validateCommandValue(value: unknown, path: string, context: ValidationContext): void {
  const record = plainRecord(value, path, context);
  if (!record) return;
  const type = record.type;
  if (typeof type !== 'string' || !hasOwn(COMMAND_TYPES, type)) {
    issue(context, childPath(path, 'type'), `Unknown Geometry Lab command ${quoted(type)}.`);
    return;
  }
  if (type === 'undo' || type === 'redo' || type === 'getSnapshot') {
    rejectUnknown(record, path, context, ['type']);
  } else if (type === 'setTool') {
    commandPayload(record, path, context, validateTool);
  } else if (type === 'addPoint3D') {
    commandPayload(record, path, context, validatePointPayload);
  } else if (type === 'addSegment3D' || type === 'addLine3D') {
    commandPayload(record, path, context, validateSegmentPayload);
  } else if (type === 'addCube' || type === 'addSphere') {
    optionalCommandPayload(record, path, context, validateSolidPayload);
  } else if (type === 'addSurfaceZ') {
    optionalCommandPayload(record, path, context, validateSurfacePayload);
  } else if (type === 'addEquationSurface3D') {
    commandPayload(record, path, context, validateEquationSurfacePayload);
  } else if (type === 'updateEquationSurface3D') {
    commandPayload(record, path, context, validateUpdateEquationSurfacePayload);
  } else if (type === 'delete') {
    commandPayload(record, path, context, validateDeletePayload);
  } else if (type === 'setCameraPreset') {
    commandPayload(record, path, context, validateCameraPayload);
  } else {
    commandPayload(record, path, context, validateMeasurementPayload);
  }
}

function commandPayload(record: UnknownRecord, path: string, context: ValidationContext, validator: ValueValidator): void {
  rejectUnknown(record, path, context, ['type', 'payload']);
  required(record, 'payload', path, context, validator);
}

function optionalCommandPayload(record: UnknownRecord, path: string, context: ValidationContext, validator: ValueValidator): void {
  rejectUnknown(record, path, context, ['type', 'payload']);
  optional(record, 'payload', path, context, validator);
}

function validatePointPayload(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['x', 'y', 'z', 'label', 'color']);
  if (!record) return;
  for (const key of ['x', 'y', 'z']) required(record, key, path, context, finiteNumber);
  validateCommandStyle(record, path, context);
}

function validateSegmentPayload(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['firstPointId', 'secondPointId', 'label', 'color']);
  if (!record) return;
  required(record, 'firstPointId', path, context, nonEmptyString);
  required(record, 'secondPointId', path, context, nonEmptyString);
  validateCommandStyle(record, path, context);
}

function validateSolidPayload(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['center', 'size', 'radius', 'label', 'color']);
  if (!record) return;
  optional(record, 'center', path, context, vector3Object);
  optional(record, 'size', path, context, positiveFiniteNumber);
  optional(record, 'radius', path, context, positiveFiniteNumber);
  validateCommandStyle(record, path, context);
}

function validateSurfacePayload(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['preset', 'xRange', 'yRange', 'samples', 'label', 'color']);
  if (!record) return;
  optional(record, 'preset', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['paraboloid', 'saddle', 'wave']));
  optional(record, 'xRange', path, context, increasingRange);
  optional(record, 'yRange', path, context, increasingRange);
  optional(record, 'samples', path, context, positiveInteger);
  validateCommandStyle(record, path, context);
}

function validateEquationSurfacePayload(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['input', 'dependentAxis', 'xRange', 'yRange', 'zRange', 'samples', 'label', 'color']);
  if (!record) return;
  required(record, 'input', path, context, nonEmptyString);
  optional(record, 'dependentAxis', path, context, validateAxis);
  for (const key of ['xRange', 'yRange', 'zRange']) optional(record, key, path, context, increasingRange);
  optional(record, 'samples', path, context, positiveInteger);
  validateCommandStyle(record, path, context);
}

function validateUpdateEquationSurfacePayload(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['id', 'input', 'dependentAxis', 'xRange', 'yRange', 'zRange', 'samples', 'label', 'color']);
  if (!record) return;
  required(record, 'id', path, context, nonEmptyString);
  required(record, 'input', path, context, nonEmptyString);
  optional(record, 'dependentAxis', path, context, validateAxis);
  for (const key of ['xRange', 'yRange', 'zRange']) optional(record, key, path, context, increasingRange);
  optional(record, 'samples', path, context, positiveInteger);
  validateCommandStyle(record, path, context);
}

function validateDeletePayload(value: unknown, path: string, context: ValidationContext): void {
  if (typeof value === 'string') {
    nonEmptyString(value, path, context);
    return;
  }
  if (Array.isArray(value)) {
    nonEmptyArray(value, path, context, nonEmptyString);
    return;
  }
  const record = exactRecord(value, path, context, ['id', 'ids']);
  if (!record) return;
  optional(record, 'id', path, context, nonEmptyString);
  optional(record, 'ids', path, context, (item, itemPath, itemContext) => nonEmptyArray(item, itemPath, itemContext, nonEmptyString));
  if (!hasOwn(record, 'id') && !hasOwn(record, 'ids')) issue(context, path, 'Expected at least one delete id.');
}

function validateCameraPayload(value: unknown, path: string, context: ValidationContext): void {
  if (typeof value === 'string') {
    oneOf(value, path, context, ['front', 'top', 'side', 'isometric']);
    return;
  }
  const record = exactRecord(value, path, context, ['preset', 'distance']);
  if (!record) return;
  required(record, 'preset', path, context, (item, itemPath, itemContext) => oneOf(item, itemPath, itemContext, ['front', 'top', 'side', 'isometric']));
  optional(record, 'distance', path, context, positiveFiniteNumber);
}

function validateMeasurementPayload(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['solidId', 'label']);
  if (!record) return;
  required(record, 'solidId', path, context, nonEmptyString);
  optional(record, 'label', path, context, stringValue);
}

function validateCommandStyle(record: UnknownRecord, path: string, context: ValidationContext): void {
  optional(record, 'label', path, context, stringValue);
  optional(record, 'color', path, context, stringValue);
}

function validateTool(value: unknown, path: string, context: ValidationContext): void {
  if (typeof value !== 'string' || !hasOwn(GEOMETRY_LAB_TOOLS, value)) issue(context, path, `Unknown Geometry Lab tool ${quoted(value)}.`);
}

function validateAxis(value: unknown, path: string, context: ValidationContext): void {
  oneOf(value, path, context, ['x', 'y', 'z']);
}

function validateJsonValue(value: unknown, path: string, context: ValidationContext): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    finiteNumber(value, path, context);
    return;
  }
  if (typeof value !== 'object') {
    issue(context, path, 'Expected a JSON-compatible value.');
    return;
  }
  if (context.jsonAncestors.has(value)) {
    issue(context, path, 'Circular JSON values are not allowed.');
    return;
  }
  context.jsonAncestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateJsonValue(item, `${path}[${index}]`, context));
  } else if (isPlainRecord(value)) {
    for (const [key, item] of Object.entries(value)) validateJsonValue(item, recordPath(path, key), context);
  } else {
    issue(context, path, 'Expected a plain JSON object.');
  }
  context.jsonAncestors.delete(value);
}

function vector2Object(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['x', 'y']);
  if (!record) return;
  required(record, 'x', path, context, finiteNumber);
  required(record, 'y', path, context, finiteNumber);
}

function vector3Object(value: unknown, path: string, context: ValidationContext): void {
  const record = exactRecord(value, path, context, ['x', 'y', 'z']);
  if (!record) return;
  required(record, 'x', path, context, finiteNumber);
  required(record, 'y', path, context, finiteNumber);
  required(record, 'z', path, context, finiteNumber);
}

function vector3Tuple(value: unknown, path: string, context: ValidationContext): void {
  tuple(value, path, context, [finiteNumber, finiteNumber, finiteNumber]);
}

function vector2Array(value: unknown, path: string, context: ValidationContext): void {
  array(value, path, context, vector2Object);
}

/**
 * Mesh arrays that already validated cleanly.
 *
 * <p>Keyed on the array rather than on the entity holding it, because the array
 * is what survives an edit. Canonicalization rebuilds every entity object each
 * delta - it strips the meshes, clones the rest, and reattaches the original
 * arrays by reference - so an entity-keyed cache never hits, while the vertex
 * and face arrays inside it are the very same objects as before. Those arrays
 * are also the only part big enough to be worth remembering.
 */
const cleanlyValidatedMeshArrays = new WeakMap<object, Set<ValueValidator>>();

function cachedArrayValidation(
  value: unknown,
  path: string,
  context: ValidationContext,
  validator: ValueValidator,
): void {
  if (value === null || typeof value !== 'object') {
    validator(value, path, context);
    return;
  }
  const passed = cleanlyValidatedMeshArrays.get(value as object);
  if (passed?.has(validator)) return;

  const issuesBefore = context.issues.length;
  validator(value, path, context);
  if (context.issues.length !== issuesBefore) return;

  if (passed) passed.add(validator);
  else cleanlyValidatedMeshArrays.set(value as object, new Set([validator]));
}

function vector3ArrayUncached(value: unknown, path: string, context: ValidationContext): void {
  array(value, path, context, vector3Object);
}

function vector3Array(value: unknown, path: string, context: ValidationContext): void {
  cachedArrayValidation(value, path, context, vector3ArrayUncached);
}

function faceIndexArrayUncached(value: unknown, path: string, context: ValidationContext): void {
  array(value, path, context, (face, facePath, faceContext) => array(face, facePath, faceContext, nonNegativeInteger));
}

function faceIndexArray(value: unknown, path: string, context: ValidationContext): void {
  cachedArrayValidation(value, path, context, faceIndexArrayUncached);
}

function increasingRange(value: unknown, path: string, context: ValidationContext): void {
  tuple(value, path, context, [finiteNumber, finiteNumber]);
  if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number'
    && Number.isFinite(value[0]) && Number.isFinite(value[1]) && value[1] <= value[0]) {
    issue(context, path, 'Expected an increasing [minimum, maximum] range.');
  }
}

function idTupleValidator(length: number): ValueValidator {
  return (value, path, context) => tuple(value, path, context, Array.from({ length }, () => nonEmptyString));
}

function idArrayValidator(): ValueValidator {
  return (value, path, context) => array(value, path, context, nonEmptyString);
}

function alternativeValidator(validators: ValueValidator[]): ValueValidator {
  return (value, path, context) => {
    let bestIssues: ValidationIssue[] | undefined;
    for (const validator of validators) {
      const alternativeContext: ValidationContext = {
        issues: [],
        jsonAncestors: new WeakSet(),
        maximumIssues: context.maximumIssues,
      };
      validator(value, path, alternativeContext);
      if (alternativeContext.issues.length === 0) return;
      if (!bestIssues || alternativeContext.issues.length < bestIssues.length) {
        bestIssues = alternativeContext.issues;
      }
    }
    for (const candidate of bestIssues ?? [{ path, message: 'Value does not match any supported schema.' }]) {
      issue(context, candidate.path, candidate.message);
    }
  };
}

function finiteNumber(value: unknown, path: string, context: ValidationContext): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) issue(context, path, 'Expected a finite number.');
}

function positiveFiniteNumber(value: unknown, path: string, context: ValidationContext): void {
  finiteNumber(value, path, context);
  if (typeof value === 'number' && Number.isFinite(value) && value <= 0) issue(context, path, 'Expected a positive number.');
}

function nonNegativeFiniteNumber(value: unknown, path: string, context: ValidationContext): void {
  finiteNumber(value, path, context);
  if (typeof value === 'number' && Number.isFinite(value) && value < 0) issue(context, path, 'Expected a non-negative number.');
}

function positiveInteger(value: unknown, path: string, context: ValidationContext): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) issue(context, path, 'Expected a positive safe integer.');
}

function nonNegativeInteger(value: unknown, path: string, context: ValidationContext): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) issue(context, path, 'Expected a non-negative safe integer.');
}

function stringValue(value: unknown, path: string, context: ValidationContext): void {
  if (typeof value !== 'string') issue(context, path, 'Expected a string.');
}

function nonEmptyString(value: unknown, path: string, context: ValidationContext): void {
  if (typeof value !== 'string' || value.length === 0) issue(context, path, 'Expected a non-empty string.');
}

function booleanValue(value: unknown, path: string, context: ValidationContext): void {
  if (typeof value !== 'boolean') issue(context, path, 'Expected a boolean.');
}

function literal(value: unknown, path: string, context: ValidationContext, expected: string | number | boolean): void {
  if (value !== expected) issue(context, path, `Expected ${JSON.stringify(expected)}.`);
}

function oneOf(value: unknown, path: string, context: ValidationContext, expected: readonly unknown[]): void {
  if (!expected.includes(value)) issue(context, path, `Expected one of ${expected.map(item => JSON.stringify(item)).join(', ')}.`);
}

function tuple(value: unknown, path: string, context: ValidationContext, validators: ValueValidator[]): void {
  if (!Array.isArray(value)) {
    issue(context, path, `Expected a ${validators.length}-item tuple.`);
    return;
  }
  if (value.length !== validators.length) issue(context, path, `Expected exactly ${validators.length} items.`);
  validators.forEach((validator, index) => {
    if (!(index in value)) issue(context, `${path}[${index}]`, 'Tuple item is required.');
    else validator(value[index], `${path}[${index}]`, context);
  });
}

function array(value: unknown, path: string, context: ValidationContext, validator: ValueValidator): void {
  if (!Array.isArray(value)) {
    issue(context, path, 'Expected an array.');
    return;
  }
  value.forEach((item, index) => validator(item, `${path}[${index}]`, context));
}

function nonEmptyArray(value: unknown, path: string, context: ValidationContext, validator: ValueValidator): void {
  array(value, path, context, validator);
  if (Array.isArray(value) && value.length === 0) issue(context, path, 'Expected at least one item.');
}

/**
 * Records that already passed a given validator, cleanly.
 *
 * <p>Validation is a pure check - the value comes back untouched and only
 * issues are collected - so a record object that satisfied a validator once
 * satisfies it forever, unless it changes, and a changed record is a different
 * object under the reducer's copy-on-write. Path and issue budget influence
 * only what a *failing* validation reports, so caching successes alone leaves
 * every failure reported exactly as before.
 *
 * <p>This exists for the same reason as the scan cache in `complexity.ts`: a
 * single sampled surface holds tens of thousands of vertex objects, and
 * revalidating all of them to price an edit that moved an unrelated point was
 * most of that edit.
 */
const cleanlyValidatedRecords = new WeakMap<object, Set<ValueValidator>>();

function recordMap(value: unknown, path: string, context: ValidationContext, validator: ValueValidator): void {
  const record = plainRecord(value, path, context);
  if (!record) return;
  for (const [key, item] of Object.entries(record)) {
    if (key.length === 0) issue(context, recordPath(path, key), 'Record keys must be non-empty.');
    const itemPath = recordPath(path, key);

    const cacheable = item !== null && typeof item === 'object';
    const passed = cacheable ? cleanlyValidatedRecords.get(item as object) : undefined;
    if (passed?.has(validator)) {
      // Already known good against this exact validator.
    } else {
      const issuesBefore = context.issues.length;
      validator(item, itemPath, context);
      if (cacheable && context.issues.length === issuesBefore) {
        if (passed) passed.add(validator);
        else cleanlyValidatedRecords.set(item as object, new Set([validator]));
      }
    }

    // Deliberately outside the cache: this compares the record against the key
    // it is filed under, so it depends on where the record sits and not only on
    // the record itself.
    if (isPlainRecord(item) && typeof item.id === 'string' && item.id !== key) {
      issue(context, childPath(itemPath, 'id'), `Expected record id "${item.id}" to match key "${key}".`);
    }
  }
}

function exactRecord(value: unknown, path: string, context: ValidationContext, keys: readonly string[]): UnknownRecord | null {
  const record = plainRecord(value, path, context);
  if (!record) return null;
  rejectUnknown(record, path, context, keys);
  return record;
}

function plainRecord(value: unknown, path: string, context: ValidationContext): UnknownRecord | null {
  if (!isPlainRecord(value)) {
    issue(context, path, 'Expected a plain object.');
    return null;
  }
  return value;
}

function isPlainRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function rejectUnknown(record: UnknownRecord, path: string, context: ValidationContext, keys: readonly string[]): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) issue(context, recordPath(path, key), `Unknown property "${key}".`);
  }
}

function required(record: UnknownRecord, key: string, path: string, context: ValidationContext, validator: ValueValidator): void {
  const nextPath = childPath(path, key);
  if (!hasOwn(record, key)) issue(context, nextPath, 'Required property is missing.');
  else validator(record[key], nextPath, context);
}

function optional(record: UnknownRecord, key: string, path: string, context: ValidationContext, validator: ValueValidator): void {
  if (hasOwn(record, key)) validator(record[key], childPath(path, key), context);
}

function increasingBounds(record: UnknownRecord, path: string, context: ValidationContext, minKey: string, maxKey: string): void {
  const min = record[minKey];
  const max = record[maxKey];
  if (typeof min === 'number' && Number.isFinite(min) && typeof max === 'number' && Number.isFinite(max) && max <= min) {
    issue(context, childPath(path, maxKey), `Expected ${maxKey} to be greater than ${minKey}.`);
  }
}

function issue(context: ValidationContext, path: string, message: string): void {
  if (context.issues.length < context.maximumIssues) context.issues.push({ path, message });
}

function childPath(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

function recordPath(path: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? childPath(path, key)
    : `${path}[${JSON.stringify(key)}]`;
}

function quoted(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
