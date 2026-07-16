import { KleinSdkError } from '../core/index.js';
import type { ExportOptions, JsonValue } from '../core/index.js';
import type { GeometryLabCommand, GeometryLabDelta, GeometryLabSnapshot } from './types.js';

const MEBIBYTE = 1024 * 1024;
const DEFAULT_EQUATION_SURFACE_SAMPLES = 56;

/** Absolute continuity-probe ceiling shared by the public surface sampler. */
export const GEOMETRY_LAB_MAX_SURFACE_PROBE_EVALUATIONS = 3_500_000;
/** Fine intervals used by the shared discontinuity probe policy. */
export const GEOMETRY_LAB_SURFACE_CONTINUITY_SUBDIVISIONS = 32;
/** Absolute per-axis ceiling shared by public surface-sampling entry points. */
export const GEOMETRY_LAB_MAX_SURFACE_SAMPLES_PER_AXIS = 128;
/** Absolute base-grid ceiling shared by public surface-sampling entry points. */
export const GEOMETRY_LAB_MAX_SURFACE_GRID_SAMPLES = 16_384;

/** Resource limits applied before Geometry Lab data reaches semantic validation. */
export interface GeometryLabComplexityLimits {
  maxJsonBytes: number;
  maxDeltaBytes: number;
  maxStringChars: number;
  maxIdChars: number;
  maxLabelChars: number;
  maxValidationIssues: number;
  maxTraversalNodes: number;
  maxTraversalDepth: number;
  maxArrayItems: number;
  maxObjectProperties: number;
  maxTopLevelRecords: number;
  maxPointRecords: number;
  maxEntities3D: number;
  maxSurfaceVerticesPerEntity: number;
  maxSurfaceFacesPerEntity: number;
  maxSurfaceFaceIndicesPerEntity: number;
  maxSurfaceVerticesTotal: number;
  maxSurfaceFacesTotal: number;
  maxSurfaceSamplesPerAxis: number;
  maxCurvePointsPerEntity: number;
  maxCurvePointsTotal: number;
  maxSolidPointsPerEntity: number;
  maxSolidFacesPerEntity: number;
  maxSolidEdgesPerEntity: number;
  maxSolidFaceVertices: number;
  maxSolidFacesTotal: number;
  maxNetFacesPerEntity: number;
  maxNetFaceVertices: number;
  maxSamplerGridSamples: number;
  maxSamplerProbeEvaluations: number;
  maxBatchDepth: number;
  maxDeltaOperations: number;
  maxHistoryPatches: number;
  maxDeleteIds: number;
  maxSelections: number;
  maxExportWidth: number;
  maxExportHeight: number;
  maxExportPixelArea: number;
  maxExportScale: number;
  maxExportPrimitives: number;
  maxExportVertexReferences: number;
  maxExportBytes: number;
  maxHistoryEntries: number;
  maxHistoryBytes: number;
  maxHistoryEntryBytes: number;
}

/** Conservative v0 defaults that still admit every SDK-generated Geometry Lab mesh. */
export const DEFAULT_GEOMETRY_LAB_COMPLEXITY_LIMITS: Readonly<GeometryLabComplexityLimits> = Object.freeze({
  maxJsonBytes: 16 * MEBIBYTE,
  maxDeltaBytes: 16 * MEBIBYTE,
  maxStringChars: 16_384,
  maxIdChars: 256,
  maxLabelChars: 4_096,
  maxValidationIssues: 100,
  maxTraversalNodes: 2_000_000,
  maxTraversalDepth: 64,
  maxArrayItems: 500_000,
  maxObjectProperties: 20_000,
  maxTopLevelRecords: 20_000,
  maxPointRecords: 10_000,
  maxEntities3D: 2_000,
  maxSurfaceVerticesPerEntity: 16_384,
  maxSurfaceFacesPerEntity: 32_768,
  maxSurfaceFaceIndicesPerEntity: 131_072,
  maxSurfaceVerticesTotal: 131_072,
  maxSurfaceFacesTotal: 131_072,
  maxSurfaceSamplesPerAxis: GEOMETRY_LAB_MAX_SURFACE_SAMPLES_PER_AXIS,
  maxCurvePointsPerEntity: 4_096,
  maxCurvePointsTotal: 65_536,
  maxSolidPointsPerEntity: 2_048,
  maxSolidFacesPerEntity: 2_048,
  maxSolidEdgesPerEntity: 4_096,
  maxSolidFaceVertices: 512,
  maxSolidFacesTotal: 8_192,
  maxNetFacesPerEntity: 2_048,
  maxNetFaceVertices: 512,
  maxSamplerGridSamples: GEOMETRY_LAB_MAX_SURFACE_GRID_SAMPLES,
  maxSamplerProbeEvaluations: GEOMETRY_LAB_MAX_SURFACE_PROBE_EVALUATIONS,
  maxBatchDepth: 16,
  maxDeltaOperations: 4_096,
  maxHistoryPatches: 4_096,
  maxDeleteIds: 10_000,
  maxSelections: 4_096,
  maxExportWidth: 8_192,
  maxExportHeight: 8_192,
  maxExportPixelArea: 32 * MEBIBYTE,
  maxExportScale: 8,
  maxExportPrimitives: 100_000,
  maxExportVertexReferences: 500_000,
  maxExportBytes: 16 * MEBIBYTE,
  maxHistoryEntries: 100,
  maxHistoryBytes: 32 * MEBIBYTE,
  maxHistoryEntryBytes: 16 * MEBIBYTE,
});

export type GeometryLabComplexityIssueCode =
  | 'array_items'
  | 'batch_depth'
  | 'curve_points'
  | 'delta_bytes'
  | 'delta_operations'
  | 'delete_ids'
  | 'export_bytes'
  | 'export_dimension'
  | 'export_pixel_area'
  | 'export_primitives'
  | 'export_scale'
  | 'export_vertex_references'
  | 'history_patches'
  | 'id_length'
  | 'invalid_input'
  | 'json_bytes'
  | 'label_length'
  | 'net_face_vertices'
  | 'net_faces'
  | 'object_properties'
  | 'point_records'
  | 'records'
  | 'sampler_grid_samples'
  | 'sampler_probe_evaluations'
  | 'selection_items'
  | 'solid_edges'
  | 'solid_face_vertices'
  | 'solid_faces'
  | 'solid_points'
  | 'string_length'
  | 'surface_face_indices'
  | 'surface_faces'
  | 'surface_samples'
  | 'surface_vertices'
  | 'traversal_cycle'
  | 'traversal_depth'
  | 'traversal_nodes'
  | 'entities_3d';

/** Path-specific, machine-readable complexity rejection. */
export interface GeometryLabComplexityIssue {
  path: string;
  code: GeometryLabComplexityIssueCode;
  message: string;
  actual?: number;
  limit?: number;
}

export type GeometryLabComplexityResult =
  | { ok: true; issues: [] }
  | { ok: false; issues: GeometryLabComplexityIssue[] };

type UnknownRecord = Record<string, unknown>;

interface SnapshotMetrics {
  surfaceVertices: number;
  surfaceFaces: number;
  curvePoints: number;
  solidFaces: number;
}

interface RenderMetrics {
  primitives: number;
  vertexReferences: number;
}

class ComplexityCollector {
  readonly issues: GeometryLabComplexityIssue[] = [];
  readonly #maximum: number;

  constructor(maximum: number) {
    this.#maximum = maximum;
  }

  add(
    path: string,
    code: GeometryLabComplexityIssueCode,
    message: string,
    actual?: number,
    limit?: number,
  ): void {
    if (this.issues.length >= this.#maximum) return;
    const issue: GeometryLabComplexityIssue = { path, code, message };
    if (actual !== undefined) issue.actual = actual;
    if (limit !== undefined) issue.limit = limit;
    this.issues.push(issue);
  }

  limit(path: string, code: GeometryLabComplexityIssueCode, label: string, actual: number, maximum: number): void {
    if (actual <= maximum) return;
    this.add(path, code, `${label} contains ${formatCount(actual)}; the limit is ${formatCount(maximum)}.`, actual, maximum);
  }
}

/** Merge caller overrides with v0 defaults and reject malformed limit profiles. */
export function resolveGeometryLabComplexityLimits(
  overrides: Partial<GeometryLabComplexityLimits> = {},
): Readonly<GeometryLabComplexityLimits> {
  if (!isPlainRecord(overrides)) {
    throw new KleinSdkError('invalid_geometry_lab_complexity_limits', 'Geometry Lab complexity limits must be a plain object.');
  }
  const defaults = DEFAULT_GEOMETRY_LAB_COMPLEXITY_LIMITS as GeometryLabComplexityLimits;
  const known = new Set(Object.keys(defaults));
  for (const key of Object.keys(overrides)) {
    if (!known.has(key)) {
      throw new KleinSdkError(
        'invalid_geometry_lab_complexity_limits',
        `Unknown Geometry Lab complexity limit "${key}".`,
      );
    }
    const value = overrides[key as keyof GeometryLabComplexityLimits];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
      throw new KleinSdkError(
        'invalid_geometry_lab_complexity_limits',
        `Geometry Lab complexity limit "${key}" must be a positive safe integer.`,
      );
    }
  }
  const resolved = { ...defaults, ...overrides };
  if (resolved.maxHistoryEntryBytes > resolved.maxHistoryBytes) {
    throw new KleinSdkError(
      'invalid_geometry_lab_complexity_limits',
      'Geometry Lab maxHistoryEntryBytes cannot exceed maxHistoryBytes.',
    );
  }
  if (resolved.maxSamplerProbeEvaluations > GEOMETRY_LAB_MAX_SURFACE_PROBE_EVALUATIONS) {
    throw new KleinSdkError(
      'invalid_geometry_lab_complexity_limits',
      `Geometry Lab maxSamplerProbeEvaluations cannot exceed the hard ceiling of ${formatCount(GEOMETRY_LAB_MAX_SURFACE_PROBE_EVALUATIONS)}.`,
    );
  }
  if (resolved.maxSurfaceSamplesPerAxis > GEOMETRY_LAB_MAX_SURFACE_SAMPLES_PER_AXIS) {
    throw new KleinSdkError(
      'invalid_geometry_lab_complexity_limits',
      `Geometry Lab maxSurfaceSamplesPerAxis cannot exceed the hard ceiling of ${GEOMETRY_LAB_MAX_SURFACE_SAMPLES_PER_AXIS}.`,
    );
  }
  if (resolved.maxSamplerGridSamples > GEOMETRY_LAB_MAX_SURFACE_GRID_SAMPLES) {
    throw new KleinSdkError(
      'invalid_geometry_lab_complexity_limits',
      `Geometry Lab maxSamplerGridSamples cannot exceed the hard ceiling of ${formatCount(GEOMETRY_LAB_MAX_SURFACE_GRID_SAMPLES)}.`,
    );
  }
  return Object.freeze(resolved);
}

/** Bounded preflight for an already-parsed snapshot candidate. */
export function preflightGeometryLabSnapshotComplexity(
  value: unknown | GeometryLabSnapshot,
  overrides: Partial<GeometryLabComplexityLimits> = {},
): GeometryLabComplexityResult {
  const limits = resolveGeometryLabComplexityLimits(overrides);
  const collector = new ComplexityCollector(limits.maxValidationIssues);
  scanUnknownJson(value, limits.maxJsonBytes, limits, collector, '', 'json_bytes', 'Geometry Lab snapshot');
  inspectSnapshot(value, limits, collector);
  return complexityResult(collector);
}

export function assertGeometryLabSnapshotComplexity(
  value: unknown | GeometryLabSnapshot,
  overrides: Partial<GeometryLabComplexityLimits> = {},
): void {
  const result = preflightGeometryLabSnapshotComplexity(value, overrides);
  if (!result.ok) throwComplexity('geometry_lab_snapshot_too_complex', 'Geometry Lab snapshot exceeds its complexity limits.', result.issues);
}

/** Bounded preflight for a local or remotely supplied delta candidate. */
export function preflightGeometryLabDeltaComplexity(
  value: unknown | GeometryLabDelta,
  overrides: Partial<GeometryLabComplexityLimits> = {},
): GeometryLabComplexityResult {
  const limits = resolveGeometryLabComplexityLimits(overrides);
  const collector = new ComplexityCollector(limits.maxValidationIssues);
  scanUnknownJson(value, limits.maxDeltaBytes, limits, collector, '', 'delta_bytes', 'Geometry Lab delta');
  inspectDelta(value, limits, collector);
  return complexityResult(collector);
}

export function assertGeometryLabDeltaComplexity(
  value: unknown | GeometryLabDelta,
  overrides: Partial<GeometryLabComplexityLimits> = {},
): void {
  const result = preflightGeometryLabDeltaComplexity(value, overrides);
  if (!result.ok) throwComplexity('geometry_lab_delta_too_complex', 'Geometry Lab delta exceeds its complexity limits.', result.issues);
}

/** Bounded preflight for command payloads before command-schema traversal. */
export function preflightGeometryLabCommandComplexity(
  value: unknown | GeometryLabCommand,
  overrides: Partial<GeometryLabComplexityLimits> = {},
): GeometryLabComplexityResult {
  const limits = resolveGeometryLabComplexityLimits(overrides);
  const collector = new ComplexityCollector(limits.maxValidationIssues);
  scanUnknownJson(value, limits.maxDeltaBytes, limits, collector, '', 'delta_bytes', 'Geometry Lab command');
  inspectCommand(value, limits, collector);
  return complexityResult(collector);
}

export function assertGeometryLabCommandComplexity(
  value: unknown | GeometryLabCommand,
  overrides: Partial<GeometryLabComplexityLimits> = {},
): void {
  const result = preflightGeometryLabCommandComplexity(value, overrides);
  if (!result.ok) throwComplexity('geometry_lab_command_too_complex', 'Geometry Lab command exceeds its complexity limits.', result.issues);
}

/** Check a JSON source before `JSON.parse` allocates its object graph. */
export function preflightGeometryLabJsonInputComplexity(
  value: unknown,
  overrides: Partial<GeometryLabComplexityLimits> = {},
): GeometryLabComplexityResult {
  const limits = resolveGeometryLabComplexityLimits(overrides);
  const collector = new ComplexityCollector(limits.maxValidationIssues);
  if (typeof value !== 'string') {
    collector.add('', 'invalid_input', 'Geometry Lab JSON input must be a string.');
  } else {
    const bytes = utf8ByteLengthUpTo(value, limits.maxJsonBytes);
    collector.limit('', 'json_bytes', 'Geometry Lab JSON input', bytes, limits.maxJsonBytes);
  }
  return complexityResult(collector);
}

export function assertGeometryLabJsonInputComplexity(
  value: unknown,
  overrides: Partial<GeometryLabComplexityLimits> = {},
): void {
  const result = preflightGeometryLabJsonInputComplexity(value, overrides);
  if (!result.ok) throwComplexity('geometry_lab_json_too_large', 'Geometry Lab JSON input exceeds its size limit.', result.issues);
}

/** Preflight export dimensions and, when supplied, visible scene output complexity. */
export function preflightGeometryLabExportRequestComplexity(
  options: unknown | Partial<ExportOptions>,
  snapshot?: unknown | GeometryLabSnapshot,
  overrides: Partial<GeometryLabComplexityLimits> = {},
): GeometryLabComplexityResult {
  const limits = resolveGeometryLabComplexityLimits(overrides);
  const collector = new ComplexityCollector(limits.maxValidationIssues);
  scanUnknownJson(options, limits.maxDeltaBytes, limits, collector, '', 'json_bytes', 'Geometry Lab export request');
  inspectExportRequest(options, snapshot, limits, collector);
  return complexityResult(collector);
}

export function assertGeometryLabExportRequestComplexity(
  options: unknown | Partial<ExportOptions>,
  snapshot?: unknown | GeometryLabSnapshot,
  overrides: Partial<GeometryLabComplexityLimits> = {},
): void {
  const result = preflightGeometryLabExportRequestComplexity(options, snapshot, overrides);
  if (!result.ok) throwComplexity('geometry_lab_export_too_complex', 'Geometry Lab export exceeds its complexity limits.', result.issues);
}

/** Post-render guard for serializers whose exact output size is not known in advance. */
export function preflightGeometryLabExportOutputComplexity(
  output: unknown,
  overrides: Partial<GeometryLabComplexityLimits> = {},
): GeometryLabComplexityResult {
  const limits = resolveGeometryLabComplexityLimits(overrides);
  const collector = new ComplexityCollector(limits.maxValidationIssues);
  if (typeof output !== 'string') {
    collector.add('', 'invalid_input', 'Geometry Lab serialized export output must be a string.');
  } else {
    const bytes = utf8ByteLengthUpTo(output, limits.maxExportBytes);
    collector.limit('', 'export_bytes', 'Geometry Lab serialized export output', bytes, limits.maxExportBytes);
  }
  return complexityResult(collector);
}

export function assertGeometryLabExportOutputComplexity(
  output: unknown,
  overrides: Partial<GeometryLabComplexityLimits> = {},
): void {
  const result = preflightGeometryLabExportOutputComplexity(output, overrides);
  if (!result.ok) throwComplexity('geometry_lab_export_too_complex', 'Geometry Lab serialized export is too large.', result.issues);
}

function inspectSnapshot(value: unknown, limits: Readonly<GeometryLabComplexityLimits>, collector: ComplexityCollector): void {
  const snapshot = asRecord(value);
  const scene = asRecord(snapshot?.scene);
  const scene2d = asRecord(scene?.scene2d);
  const scene3d = asRecord(scene?.scene3d);
  if (!snapshot || !scene || !scene2d || !scene3d) return;

  const collectionInputs: Array<[string, unknown]> = [
    ['scene.scene2d.points', scene2d.points],
    ['scene.scene2d.entities', scene2d.entities],
    ['scene.scene2d.constraints', scene2d.constraints],
    ['scene.scene3d.points', scene3d.points],
    ['scene.scene3d.entities', scene3d.entities],
    ['scene.scene3d.workPlanes', scene3d.workPlanes],
    ['scene.scene3d.measurements', scene3d.measurements],
    ['scene.scene3d.nets', scene3d.nets],
  ];
  let records = 0;
  for (const [path, collection] of collectionInputs) {
    const count = boundedRecordSize(collection, limits.maxTopLevelRecords);
    records = saturatingAdd(records, count, limits.maxTopLevelRecords + 1);
    collector.limit(path, 'records', path, count, limits.maxTopLevelRecords);
  }
  const linkCount = boundedArrayLength(scene.links);
  records = saturatingAdd(records, linkCount, limits.maxTopLevelRecords + 1);
  collector.limit('scene', 'records', 'Geometry Lab top-level scene records', records, limits.maxTopLevelRecords);

  const pointRecords = saturatingAdd(
    boundedRecordSize(scene2d.points, limits.maxPointRecords),
    boundedRecordSize(scene3d.points, limits.maxPointRecords),
    limits.maxPointRecords + 1,
  );
  collector.limit('scene', 'point_records', 'Geometry Lab point records', pointRecords, limits.maxPointRecords);

  const entities3d = asRecord(scene3d.entities);
  const entityCount = boundedRecordSize(entities3d, limits.maxEntities3D);
  collector.limit('scene.scene3d.entities', 'entities_3d', '3D entities', entityCount, limits.maxEntities3D);

  const metrics: SnapshotMetrics = { surfaceVertices: 0, surfaceFaces: 0, curvePoints: 0, solidFaces: 0 };
  forEachRecordBounded(asRecord(scene2d.entities), limits.maxTopLevelRecords, (entity, key) => {
    inspectCurveLikeEntity(entity, `scene.scene2d.entities${recordSuffix(key)}`, metrics, limits, collector);
  });
  forEachRecordBounded(entities3d, limits.maxEntities3D, (entity, key) => {
    inspectEntityPayload(entity, `scene.scene3d.entities${recordSuffix(key)}`, metrics, limits, collector);
  });
  forEachRecordBounded(asRecord(scene3d.nets), limits.maxTopLevelRecords, (net, key) => {
    inspectNet(net, `scene.scene3d.nets${recordSuffix(key)}`, limits, collector);
  });

  collector.limit('scene.scene3d.entities', 'surface_vertices', 'Surface vertices across the scene', metrics.surfaceVertices, limits.maxSurfaceVerticesTotal);
  collector.limit('scene.scene3d.entities', 'surface_faces', 'Surface faces across the scene', metrics.surfaceFaces, limits.maxSurfaceFacesTotal);
  collector.limit('scene', 'curve_points', 'Sampled curve points across the scene', metrics.curvePoints, limits.maxCurvePointsTotal);
  collector.limit('scene.scene3d.entities', 'solid_faces', 'Solid faces across the scene', metrics.solidFaces, limits.maxSolidFacesTotal);

  const appState = asRecord(snapshot.appState);
  collector.limit('appState.selected', 'selection_items', 'Geometry Lab selection', boundedArrayLength(appState?.selected), limits.maxSelections);
}

function inspectDelta(value: unknown, limits: Readonly<GeometryLabComplexityLimits>, collector: ComplexityCollector): void {
  const stack: Array<{ value: unknown; path: string; depth: number }> = [{ value, path: '', depth: 0 }];
  let operationCount = 0;
  let deleteIdCount = 0;
  const metrics: SnapshotMetrics = { surfaceVertices: 0, surfaceFaces: 0, curvePoints: 0, solidFaces: 0 };

  while (stack.length > 0 && operationCount <= limits.maxDeltaOperations) {
    const current = stack.pop();
    if (!current) break;
    const record = asRecord(current.value);
    if (!record) continue;
    operationCount += 1;
    if (current.depth > limits.maxBatchDepth) {
      collector.limit(current.path, 'batch_depth', 'Geometry Lab delta nesting depth', current.depth, limits.maxBatchDepth);
      continue;
    }
    const op = record.op;
    if (op === 'batch') {
      const deltas = Array.isArray(record.deltas) ? record.deltas : [];
      if (operationCount + deltas.length > limits.maxDeltaOperations) {
        collector.limit(currentPath(current.path, 'deltas'), 'delta_operations', 'Geometry Lab delta operations', operationCount + deltas.length, limits.maxDeltaOperations);
      }
      const inspectCount = Math.min(deltas.length, Math.max(0, limits.maxDeltaOperations - operationCount + 1));
      for (let index = inspectCount - 1; index >= 0; index -= 1) {
        stack.push({ value: deltas[index], path: `${currentPath(current.path, 'deltas')}[${index}]`, depth: current.depth + 1 });
      }
      continue;
    }
    if (op === 'historyPatch') {
      const patches = Array.isArray(record.patches) ? record.patches : [];
      collector.limit(currentPath(current.path, 'patches'), 'history_patches', 'Geometry Lab history patches', patches.length, limits.maxHistoryPatches);
      for (let index = 0; index < Math.min(patches.length, limits.maxHistoryPatches + 1); index += 1) {
        inspectHistoryPatch(patches[index], `${currentPath(current.path, 'patches')}[${index}]`, metrics, limits, collector);
      }
    } else if (op === 'delete' || op === 'deleteWorkPlane' || op === 'deleteMeasurement' || op === 'deleteNet') {
      deleteIdCount = saturatingAdd(deleteIdCount, boundedArrayLength(record.ids), limits.maxDeleteIds + 1);
    } else if (op === 'addEntity3D') {
      inspectEntityPayload(record.entity, currentPath(current.path, 'entity'), metrics, limits, collector);
    } else if (op === 'addEntity2D') {
      inspectCurveLikeEntity(record.entity, currentPath(current.path, 'entity'), metrics, limits, collector);
    } else if (op === 'updateEntity') {
      inspectEntityPayload(record.changes, currentPath(current.path, 'changes'), metrics, limits, collector);
    } else if (op === 'addNet') {
      inspectNet(record.net, currentPath(current.path, 'net'), limits, collector);
    } else if (op === 'setAppState') {
      const changes = asRecord(record.changes);
      collector.limit(currentPath(current.path, 'changes.selected'), 'selection_items', 'Geometry Lab selection', boundedArrayLength(changes?.selected), limits.maxSelections);
    }
  }
  collector.limit('', 'delta_operations', 'Geometry Lab delta operations', operationCount, limits.maxDeltaOperations);
  collector.limit('', 'delete_ids', 'Geometry Lab delete ids', deleteIdCount, limits.maxDeleteIds);
  collector.limit('', 'surface_vertices', 'Surface vertices in the delta', metrics.surfaceVertices, limits.maxSurfaceVerticesTotal);
  collector.limit('', 'surface_faces', 'Surface faces in the delta', metrics.surfaceFaces, limits.maxSurfaceFacesTotal);
  collector.limit('', 'curve_points', 'Sampled curve points in the delta', metrics.curvePoints, limits.maxCurvePointsTotal);
  collector.limit('', 'solid_faces', 'Solid faces in the delta', metrics.solidFaces, limits.maxSolidFacesTotal);
}

function inspectCommand(
  value: unknown,
  limits: Readonly<GeometryLabComplexityLimits>,
  collector: ComplexityCollector,
): void {
  const command = asRecord(value);
  if (!command) return;
  const payload = command.payload;
  if (command.type === 'delete') {
    let count = 0;
    if (Array.isArray(payload)) count = payload.length;
    else {
      const record = asRecord(payload);
      count = Array.isArray(record?.ids) ? record.ids.length : typeof payload === 'string' || typeof record?.id === 'string' ? 1 : 0;
    }
    collector.limit('payload', 'delete_ids', 'Geometry Lab command delete ids', count, limits.maxDeleteIds);
  }
  if (
    command.type === 'addSurfaceZ'
    || command.type === 'addEquationSurface3D'
    || command.type === 'updateEquationSurface3D'
  ) {
    const record = asRecord(payload);
    const requestedSamples = record?.samples;
    if (typeof requestedSamples === 'number' && Number.isFinite(requestedSamples)) {
      const commandMaximum = command.type === 'addSurfaceZ' ? 96 : 128;
      const samples = Math.max(4, Math.min(commandMaximum, Math.round(requestedSamples)));
      collector.limit('payload.samples', 'surface_samples', 'Surface command samples', samples, limits.maxSurfaceSamplesPerAxis);
      const grid = Number.isSafeInteger(samples)
        ? saturatingMultiply(samples, samples, limits.maxSamplerGridSamples + 1)
        : Number.MAX_SAFE_INTEGER;
      collector.limit('payload.samples', 'sampler_grid_samples', 'Surface command sample grid', grid, limits.maxSamplerGridSamples);
      collector.limit(
        'payload.samples',
        'sampler_probe_evaluations',
        'Surface command continuity probe evaluations',
        estimateGeometryLabSurfaceProbeEvaluations(samples, samples),
        limits.maxSamplerProbeEvaluations,
      );
    }
  }
}

function inspectHistoryPatch(
  value: unknown,
  path: string,
  metrics: SnapshotMetrics,
  limits: Readonly<GeometryLabComplexityLimits>,
  collector: ComplexityCollector,
): void {
  const patch = asRecord(value);
  const ref = asRecord(patch?.ref);
  if (!patch || ref?.collection !== 'entity3d') return;
  for (const key of ['expected', 'next']) {
    const historyValue = asRecord(patch[key]);
    if (historyValue?.present !== true) continue;
    inspectEntityPayload(historyValue.value, currentPath(path, `${key}.value`), metrics, limits, collector);
  }
}

function inspectEntityPayload(
  value: unknown,
  path: string,
  metrics: SnapshotMetrics,
  limits: Readonly<GeometryLabComplexityLimits>,
  collector: ComplexityCollector,
): void {
  const entity = asRecord(value);
  if (!entity) return;
  const kind = entity.kind;
  const faces = Array.isArray(entity.faces) ? entity.faces : undefined;
  const looksLikeSurface = kind === 'surface3d'
    || Array.isArray(entity.vertices)
    || asRecord(entity.samples) !== null
    || entity.surfaceKind !== undefined
    || (faces !== undefined && (faces.length === 0 || Array.isArray(faces[0])));
  const looksLikeSolid = kind === 'solid'
    || Array.isArray(entity.edges)
    || (faces !== undefined && faces.some(face => isPlainRecord(face)));
  const pointReferences = boundedArrayLength(entity.pointIds);
  if (Array.isArray(entity.pointIds)) {
    collector.limit(
      currentPath(path, 'pointIds'),
      'solid_points',
      'Entity point references',
      pointReferences,
      limits.maxSolidPointsPerEntity,
    );
  }

  if (looksLikeSurface) {
    const cachedVertices = boundedArrayLength(entity.vertices);
    const cachedFaces = boundedArrayLength(faces);
    const authoredGrid = authoredSurfaceGrid(entity, limits);
    const vertices = Math.max(cachedVertices, authoredGrid.vertices);
    const faceCount = Math.max(cachedFaces, authoredGrid.faces);
    metrics.surfaceVertices = saturatingAdd(metrics.surfaceVertices, vertices, limits.maxSurfaceVerticesTotal + 1);
    metrics.surfaceFaces = saturatingAdd(metrics.surfaceFaces, faceCount, limits.maxSurfaceFacesTotal + 1);
    collector.limit(currentPath(path, 'vertices'), 'surface_vertices', 'Surface vertices', vertices, limits.maxSurfaceVerticesPerEntity);
    collector.limit(currentPath(path, 'faces'), 'surface_faces', 'Surface faces', faceCount, limits.maxSurfaceFacesPerEntity);
    collector.limit(currentPath(path, 'samples'), 'sampler_grid_samples', 'Surface authored sample grid', authoredGrid.vertices, limits.maxSamplerGridSamples);
    collector.limit(currentPath(path, 'samples'), 'sampler_probe_evaluations', 'Surface continuity probe evaluations', authoredGrid.probes, limits.maxSamplerProbeEvaluations);
    let indices = 0;
    if (faces) {
      const inspected = Math.min(faces.length, limits.maxSurfaceFacesPerEntity + 1);
      for (let index = 0; index < inspected && indices <= limits.maxSurfaceFaceIndicesPerEntity; index += 1) {
        indices = saturatingAdd(indices, boundedArrayLength(faces[index]), limits.maxSurfaceFaceIndicesPerEntity + 1);
      }
    }
    collector.limit(currentPath(path, 'faces'), 'surface_face_indices', 'Surface face indices', indices, limits.maxSurfaceFaceIndicesPerEntity);
    const samples = asRecord(entity.samples);
    if (samples) {
      for (const axis of ['x', 'y', 'z', 'u', 'v']) {
        const sampleCount = samples[axis];
        if (typeof sampleCount === 'number' && Number.isFinite(sampleCount)) {
          collector.limit(currentPath(path, `samples.${axis}`), 'surface_samples', `Surface ${axis}-axis samples`, sampleCount, limits.maxSurfaceSamplesPerAxis);
        }
      }
    }
  }

  if (looksLikeSolid) {
    const faceCount = boundedArrayLength(faces);
    const edges = boundedArrayLength(entity.edges);
    metrics.solidFaces = saturatingAdd(metrics.solidFaces, faceCount, limits.maxSolidFacesTotal + 1);
    collector.limit(currentPath(path, 'faces'), 'solid_faces', 'Solid faces', faceCount, limits.maxSolidFacesPerEntity);
    collector.limit(currentPath(path, 'edges'), 'solid_edges', 'Solid edges', edges, limits.maxSolidEdgesPerEntity);
    if (faces) {
      const inspected = Math.min(faces.length, limits.maxSolidFacesPerEntity + 1);
      for (let index = 0; index < inspected; index += 1) {
        const face = asRecord(faces[index]);
        collector.limit(
          `${currentPath(path, 'faces')}[${index}].pointIds`,
          'solid_face_vertices',
          'Solid face vertices',
          boundedArrayLength(face?.pointIds),
          limits.maxSolidFaceVertices,
        );
      }
    }
  }

  if (Array.isArray(entity.points)) inspectCurveLikeEntity(entity, path, metrics, limits, collector);
}

function authoredSurfaceGrid(
  entity: UnknownRecord,
  limits: Readonly<GeometryLabComplexityLimits>,
): { vertices: number; faces: number; probes: number } {
  const samples = asRecord(entity.samples);
  if (!samples && entity.surfaceKind !== 'equation') return { vertices: 0, faces: 0, probes: 0 };
  const finiteSamples = ['x', 'y', 'z', 'u', 'v'].flatMap(axis => {
    const value = samples?.[axis];
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? [value] : [];
  });
  if (finiteSamples.length === 0 && entity.surfaceKind !== 'equation') return { vertices: 0, faces: 0, probes: 0 };
  let first = finiteSamples[0] ?? DEFAULT_EQUATION_SURFACE_SAMPLES;
  let second = finiteSamples[1] ?? first;
  if (entity.surfaceKind === 'equation') {
    first = finiteSamples.reduce((maximum, value) => Math.max(maximum, value), first);
    second = first;
  }
  const ceiling = Math.max(
    limits.maxSamplerGridSamples,
    limits.maxSurfaceVerticesPerEntity,
    limits.maxSurfaceFacesPerEntity,
  ) + 1;
  return {
    vertices: saturatingMultiply(first, second, ceiling),
    faces: saturatingMultiply(
      2,
      saturatingMultiply(Math.max(0, first - 1), Math.max(0, second - 1), ceiling),
      ceiling,
    ),
    probes: estimateGeometryLabSurfaceProbeEvaluations(first, second),
  };
}

/** Exact upper bound for a fully continuous rectangular grid's unique probes. */
export function estimateGeometryLabSurfaceProbeEvaluations(
  firstSamples: number,
  secondSamples: number,
): number {
  if (
    !Number.isSafeInteger(firstSamples)
    || !Number.isSafeInteger(secondSamples)
    || firstSamples < 2
    || secondSamples < 2
  ) return Number.MAX_SAFE_INTEGER;
  const subdivisions = GEOMETRY_LAB_SURFACE_CONTINUITY_SUBDIVISIONS;
  const firstCells = firstSamples - 1;
  const secondCells = secondSamples - 1;
  const boundaryHorizontal = secondSamples * firstCells * (subdivisions - 1);
  const boundaryVertical = firstSamples * secondCells * (subdivisions - 1);
  const middleHorizontal = secondCells * (firstCells * subdivisions + 1);
  const middleVertical = firstCells * (secondCells * subdivisions + 1);
  const overlaps = firstCells * secondCells
    + firstSamples * secondCells
    + secondSamples * firstCells;
  const result = boundaryHorizontal + boundaryVertical + middleHorizontal + middleVertical - overlaps;
  return Number.isSafeInteger(result) && result >= 0 ? result : Number.MAX_SAFE_INTEGER;
}

function inspectCurveLikeEntity(
  value: unknown,
  path: string,
  metrics: SnapshotMetrics,
  limits: Readonly<GeometryLabComplexityLimits>,
  collector: ComplexityCollector,
): void {
  const entity = asRecord(value);
  if (!entity || !Array.isArray(entity.points)) return;
  if (entity.kind !== 'curve3d' && entity.kind !== 'parametricCurve' && entity.kind !== 'conic' && entity.kind !== undefined) return;
  const points = entity.points.length;
  metrics.curvePoints = saturatingAdd(metrics.curvePoints, points, limits.maxCurvePointsTotal + 1);
  collector.limit(currentPath(path, 'points'), 'curve_points', 'Sampled curve points', points, limits.maxCurvePointsPerEntity);
  const parameter = asRecord(entity.parameter);
  const samples = parameter?.samples;
  if (typeof samples === 'number' && Number.isFinite(samples)) {
    collector.limit(currentPath(path, 'parameter.samples'), 'curve_points', 'Curve parameter samples', samples, limits.maxCurvePointsPerEntity);
  }
}

function inspectNet(
  value: unknown,
  path: string,
  limits: Readonly<GeometryLabComplexityLimits>,
  collector: ComplexityCollector,
): void {
  const net = asRecord(value);
  const faces = Array.isArray(net?.faces) ? net.faces : undefined;
  if (!net || !faces) return;
  collector.limit(currentPath(path, 'faces'), 'net_faces', 'Net faces', faces.length, limits.maxNetFacesPerEntity);
  for (let index = 0; index < Math.min(faces.length, limits.maxNetFacesPerEntity + 1); index += 1) {
    const face = asRecord(faces[index]);
    collector.limit(
      `${currentPath(path, 'faces')}[${index}].vertices`,
      'net_face_vertices',
      'Net face vertices',
      boundedArrayLength(face?.vertices),
      limits.maxNetFaceVertices,
    );
  }
}

function inspectExportRequest(
  value: unknown,
  snapshot: unknown,
  limits: Readonly<GeometryLabComplexityLimits>,
  collector: ComplexityCollector,
): void {
  const options = asRecord(value);
  if (!options) return;
  if (options.format !== 'svg') return;
  const width = exportDimension(options.width, 960, 240, 'width', limits.maxExportWidth, collector);
  const height = exportDimension(options.height, 640, 180, 'height', limits.maxExportHeight, collector);
  const area = width * height;
  if (Number.isFinite(area)) collector.limit('', 'export_pixel_area', 'Geometry Lab export pixel area', area, limits.maxExportPixelArea);
  if (options.scale !== undefined) {
    if (typeof options.scale !== 'number' || !Number.isFinite(options.scale) || options.scale <= 0) {
      collector.add('scale', 'export_scale', 'Geometry Lab export scale must be positive and finite.');
    } else {
      collector.limit('scale', 'export_scale', 'Geometry Lab export scale', options.scale, limits.maxExportScale);
    }
  }
  if (snapshot === undefined) return;
  const metrics = visibleRenderMetrics(snapshot, limits);
  collector.limit('', 'export_primitives', 'Visible SVG primitives', metrics.primitives, limits.maxExportPrimitives);
  collector.limit('', 'export_vertex_references', 'Visible SVG vertex references', metrics.vertexReferences, limits.maxExportVertexReferences);
}

function visibleRenderMetrics(value: unknown, limits: Readonly<GeometryLabComplexityLimits>): RenderMetrics {
  const snapshot = asRecord(value);
  const scene = asRecord(snapshot?.scene);
  const scene3d = asRecord(scene?.scene3d);
  if (!scene3d) return { primitives: 0, vertexReferences: 0 };
  const metrics: RenderMetrics = { primitives: 7, vertexReferences: 6 }; // background plus three axis lines/labels
  forEachRecordBounded(asRecord(scene3d.points), limits.maxPointRecords, pointValue => {
    const point = asRecord(pointValue);
    if (!point || point.hidden === true) return;
    metrics.primitives = saturatingAdd(metrics.primitives, point.label === undefined ? 1 : 2, limits.maxExportPrimitives + 1);
    metrics.vertexReferences = saturatingAdd(metrics.vertexReferences, 1, limits.maxExportVertexReferences + 1);
  });
  forEachRecordBounded(asRecord(scene3d.entities), limits.maxEntities3D, entityValue => {
    const entity = asRecord(entityValue);
    if (!entity || entity.hidden === true) return;
    if (entity.kind === 'surface3d') {
      const faces = Array.isArray(entity.faces) ? entity.faces : [];
      metrics.primitives = saturatingAdd(metrics.primitives, faces.length, limits.maxExportPrimitives + 1);
      metrics.vertexReferences = saturatingAdd(metrics.vertexReferences, 2 * faceReferenceCount(faces, limits.maxExportVertexReferences), limits.maxExportVertexReferences + 1);
    } else if (entity.kind === 'solid') {
      const faces = Array.isArray(entity.faces) ? entity.faces : [];
      metrics.primitives = saturatingAdd(metrics.primitives, faces.length, limits.maxExportPrimitives + 1);
      let references = 0;
      for (let index = 0; index < Math.min(faces.length, limits.maxSolidFacesPerEntity + 1); index += 1) {
        references = saturatingAdd(references, boundedArrayLength(asRecord(faces[index])?.pointIds), limits.maxExportVertexReferences + 1);
      }
      metrics.vertexReferences = saturatingAdd(metrics.vertexReferences, 2 * references, limits.maxExportVertexReferences + 1);
    } else if (entity.kind === 'crossSection') {
      metrics.primitives = saturatingAdd(metrics.primitives, 1, limits.maxExportPrimitives + 1);
      const references = Array.isArray(entity.vertices) && entity.vertices.length > 0
        ? entity.vertices.length
        : boundedArrayLength(entity.pointIds);
      metrics.vertexReferences = saturatingAdd(metrics.vertexReferences, 2 * references, limits.maxExportVertexReferences + 1);
    } else if (entity.kind === 'curve3d') {
      const segments = Math.max(0, boundedArrayLength(entity.points) - 1);
      metrics.primitives = saturatingAdd(metrics.primitives, segments, limits.maxExportPrimitives + 1);
      metrics.vertexReferences = saturatingAdd(metrics.vertexReferences, segments * 2, limits.maxExportVertexReferences + 1);
    } else {
      const references = boundedArrayLength(entity.pointIds);
      if (entity.kind === 'polygon' || entity.kind === 'plane') {
        if (references >= 3) {
          metrics.primitives = saturatingAdd(metrics.primitives, 1, limits.maxExportPrimitives + 1);
          metrics.vertexReferences = saturatingAdd(metrics.vertexReferences, references * 2, limits.maxExportVertexReferences + 1);
        }
      } else {
        const segments = Math.max(0, references - 1);
        metrics.primitives = saturatingAdd(metrics.primitives, segments, limits.maxExportPrimitives + 1);
        metrics.vertexReferences = saturatingAdd(metrics.vertexReferences, segments * 2, limits.maxExportVertexReferences + 1);
      }
    }
  });
  const measurementCount = boundedRecordSize(scene3d.measurements, limits.maxTopLevelRecords);
  metrics.primitives = saturatingAdd(
    metrics.primitives,
    measurementCount > 0 ? 1 + Math.min(measurementCount, 8) : 0,
    limits.maxExportPrimitives + 1,
  );
  return metrics;
}

function scanUnknownJson(
  value: unknown,
  byteLimit: number,
  limits: Readonly<GeometryLabComplexityLimits>,
  collector: ComplexityCollector,
  rootPath: string,
  byteIssueCode: 'json_bytes' | 'delta_bytes',
  byteLabel: string,
): void {
  const active = new WeakSet<object>();
  let nodes = 0;
  let bytes = 0;
  let nodeLimitReported = false;
  let byteLimitReported = false;

  const addBytes = (amount: number, path: string): void => {
    bytes = saturatingAdd(bytes, amount, byteLimit + 1);
    if (bytes > byteLimit && !byteLimitReported) {
      byteLimitReported = true;
      collector.limit(path, byteIssueCode, byteLabel, bytes, byteLimit);
    }
  };

  const visit = (current: unknown, path: string, depth: number, role?: string): void => {
    nodes += 1;
    if (nodes > limits.maxTraversalNodes) {
      if (!nodeLimitReported) {
        nodeLimitReported = true;
        collector.limit(path, 'traversal_nodes', 'Geometry Lab input nodes', nodes, limits.maxTraversalNodes);
      }
      return;
    }
    if (depth > limits.maxTraversalDepth) {
      collector.limit(path, 'traversal_depth', 'Geometry Lab input depth', depth, limits.maxTraversalDepth);
      return;
    }
    if (current === null) {
      addBytes(4, path);
      return;
    }
    if (typeof current === 'string') {
      addBytes(jsonStringByteLengthUpTo(current, byteLimit) + 2, path);
      const limit = stringLimit(role, limits);
      const code = idRole(role) ? 'id_length' : labelRole(role) ? 'label_length' : 'string_length';
      collector.limit(path, code, idRole(role) ? 'Geometry Lab id' : labelRole(role) ? 'Geometry Lab label' : 'Geometry Lab string', current.length, limit);
      return;
    }
    if (typeof current === 'number') {
      addBytes(Number.isFinite(current) ? String(current).length : 4, path);
      return;
    }
    if (typeof current === 'boolean') {
      addBytes(current ? 4 : 5, path);
      return;
    }
    if (typeof current !== 'object') {
      addBytes(4, path);
      return;
    }
    if (active.has(current)) {
      collector.add(path, 'traversal_cycle', 'Geometry Lab input contains a circular object reference.');
      return;
    }
    active.add(current);
    if (Array.isArray(current)) {
      addBytes(2 + Math.max(0, current.length - 1), path);
      collector.limit(path, 'array_items', 'Geometry Lab array', current.length, limits.maxArrayItems);
      if (current.length > limits.maxArrayItems) addBytes((current.length - limits.maxArrayItems) * 4, path);
      const count = Math.min(current.length, limits.maxArrayItems);
      for (let index = 0; index < count && nodes <= limits.maxTraversalNodes; index += 1) {
        if (index in current) visit(current[index], `${path}[${index}]`, depth + 1, role);
        else addBytes(4, `${path}[${index}]`);
      }
    } else if (isPlainRecord(current)) {
      addBytes(2, path);
      let propertyCount = 0;
      for (const key in current) {
        if (!Object.prototype.hasOwnProperty.call(current, key)) continue;
        propertyCount += 1;
        if (propertyCount > limits.maxObjectProperties || nodes > limits.maxTraversalNodes) break;
        if (propertyCount > 1) addBytes(1, path);
        addBytes(jsonStringByteLengthUpTo(key, byteLimit) + 3, path);
        visit(current[key], currentPath(path, key), depth + 1, key);
      }
      collector.limit(path, 'object_properties', 'Geometry Lab object properties', propertyCount, limits.maxObjectProperties);
    } else {
      collector.add(path, 'invalid_input', 'Geometry Lab input must contain only plain JSON objects.');
    }
    active.delete(current);
  };

  visit(value, rootPath, 0);
}

function exportDimension(
  value: unknown,
  fallback: number,
  minimum: number,
  key: 'width' | 'height',
  maximum: number,
  collector: ComplexityCollector,
): number {
  if (value === undefined) {
    const effectiveFallback = Math.max(minimum, Math.round(fallback));
    collector.limit(key, 'export_dimension', `Geometry Lab export ${key}`, effectiveFallback, maximum);
    return effectiveFallback;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    collector.add(key, 'export_dimension', `Geometry Lab export ${key} must be positive and finite.`);
    return fallback;
  }
  const effective = Math.max(minimum, Math.round(value));
  collector.limit(key, 'export_dimension', `Geometry Lab export ${key}`, effective, maximum);
  return effective;
}

function faceReferenceCount(faces: unknown[], maximum: number): number {
  let references = 0;
  for (let index = 0; index < faces.length && references <= maximum; index += 1) {
    references = saturatingAdd(references, boundedArrayLength(faces[index]), maximum + 1);
  }
  return references;
}

function boundedRecordSize(value: unknown, maximum: number): number {
  const record = asRecord(value);
  if (!record) return 0;
  let count = 0;
  for (const key in record) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    count += 1;
    if (count > maximum) break;
  }
  return count;
}

function forEachRecordBounded(
  record: UnknownRecord | null,
  maximum: number,
  callback: (value: unknown, key: string) => void,
): void {
  if (!record) return;
  let count = 0;
  for (const key in record) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    count += 1;
    if (count > maximum) return;
    callback(record[key], key);
  }
}

function boundedArrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function stringLimit(role: string | undefined, limits: Readonly<GeometryLabComplexityLimits>): number {
  if (idRole(role)) return limits.maxIdChars;
  if (labelRole(role)) return limits.maxLabelChars;
  return limits.maxStringChars;
}

function idRole(role: string | undefined): boolean {
  return role === 'id' || role === 'ids' || role?.endsWith('Id') === true || role?.endsWith('Ids') === true;
}

function labelRole(role: string | undefined): boolean {
  return role === 'label' || role === 'title';
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
      } else {
        bytes += 3;
      }
    } else bytes += 3;
    if (bytes > maximum) return maximum + 1;
  }
  return bytes;
}

function jsonStringByteLengthUpTo(value: string, maximum: number): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x22 || code === 0x5c) bytes += 2;
    else if (code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d) bytes += 2;
    else if (code <= 0x1f) bytes += 6;
    else if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = index + 1 < value.length ? value.charCodeAt(index + 1) : -1;
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 6;
    } else if (code >= 0xdc00 && code <= 0xdfff) bytes += 6;
    else bytes += 3;
    if (bytes > maximum) return maximum + 1;
  }
  return bytes;
}

function saturatingAdd(first: number, second: number, ceiling: number): number {
  if (first >= ceiling || second >= ceiling || first > ceiling - second) return ceiling;
  return first + second;
}

function saturatingMultiply(first: number, second: number, ceiling: number): number {
  if (first <= 0 || second <= 0) return 0;
  if (first >= ceiling || second >= ceiling || first > Math.floor(ceiling / second)) return ceiling;
  return first * second;
}

function currentPath(path: string, key: string): string {
  if (!path) return key;
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

function recordSuffix(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
}

function asRecord(value: unknown): UnknownRecord | null {
  return isPlainRecord(value) ? value : null;
}

function isPlainRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function complexityResult(collector: ComplexityCollector): GeometryLabComplexityResult {
  return collector.issues.length === 0
    ? { ok: true, issues: [] }
    : { ok: false, issues: collector.issues };
}

function throwComplexity(code: string, message: string, issues: GeometryLabComplexityIssue[]): never {
  throw new KleinSdkError(code, message, issues as unknown as JsonValue);
}

function formatCount(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString('en-US') : String(value);
}
