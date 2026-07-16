import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_GEOMETRY_LAB_COMPLEXITY_LIMITS,
  GEOMETRY_LAB_MAX_SURFACE_PROBE_EVALUATIONS,
  assertGeometryLabDeltaComplexity,
  assertGeometryLabExportOutputComplexity,
  assertGeometryLabExportRequestComplexity,
  assertGeometryLabJsonInputComplexity,
  assertGeometryLabSnapshotComplexity,
  preflightGeometryLabDeltaComplexity,
  preflightGeometryLabExportOutputComplexity,
  preflightGeometryLabExportRequestComplexity,
  preflightGeometryLabJsonInputComplexity,
  preflightGeometryLabSnapshotComplexity,
  resolveGeometryLabComplexityLimits,
  createEmptyGeometryLabSnapshot,
  createGeometryLab,
  parseGeometryLabSnapshotJson,
  sampleRectangularSurface3D,
  validateGeometryLabCommand,
  validateGeometryLabDelta,
} from '../../dist/geometry-lab/index.js';

function issueCodes(result) {
  return result.ok ? [] : result.issues.map(issue => issue.code);
}

test('complexity defaults are immutable, resolvable, and reject invalid profiles', () => {
  assert.equal(DEFAULT_GEOMETRY_LAB_COMPLEXITY_LIMITS.maxJsonBytes, 16 * 1024 * 1024);
  assert.equal(DEFAULT_GEOMETRY_LAB_COMPLEXITY_LIMITS.maxHistoryEntries, 100);
  assert.equal(
    DEFAULT_GEOMETRY_LAB_COMPLEXITY_LIMITS.maxSamplerProbeEvaluations,
    GEOMETRY_LAB_MAX_SURFACE_PROBE_EVALUATIONS,
  );
  assert.equal(Object.isFrozen(DEFAULT_GEOMETRY_LAB_COMPLEXITY_LIMITS), true);

  const resolved = resolveGeometryLabComplexityLimits({ maxPointRecords: 12 });
  assert.equal(resolved.maxPointRecords, 12);
  assert.equal(resolved.maxEntities3D, DEFAULT_GEOMETRY_LAB_COMPLEXITY_LIMITS.maxEntities3D);
  assert.equal(Object.isFrozen(resolved), true);

  assert.throws(
    () => resolveGeometryLabComplexityLimits({ madeUpLimit: 1 }),
    error => error?.code === 'invalid_geometry_lab_complexity_limits',
  );
  assert.throws(
    () => resolveGeometryLabComplexityLimits({ maxPointRecords: 0 }),
    error => error?.code === 'invalid_geometry_lab_complexity_limits',
  );
  assert.throws(
    () => resolveGeometryLabComplexityLimits({
      maxSamplerProbeEvaluations: GEOMETRY_LAB_MAX_SURFACE_PROBE_EVALUATIONS + 1,
    }),
    error => error?.code === 'invalid_geometry_lab_complexity_limits',
  );
});

test('raw JSON byte preflight is UTF-8 aware and throws a stable code before parsing', () => {
  assert.deepEqual(preflightGeometryLabJsonInputComplexity('😀', { maxJsonBytes: 4 }), { ok: true, issues: [] });
  const tooLarge = preflightGeometryLabJsonInputComplexity('😀😀', { maxJsonBytes: 7 });
  assert.equal(tooLarge.ok, false);
  assert.deepEqual(issueCodes(tooLarge), ['json_bytes']);
  assert.throws(
    () => assertGeometryLabJsonInputComplexity('😀😀', { maxJsonBytes: 7 }),
    error => error?.code === 'geometry_lab_json_too_large',
  );
});

test('snapshot preflight budgets records, cached meshes, authored grids, and issue count', () => {
  const snapshot = createEmptyGeometryLabSnapshot();
  snapshot.scene.scene3d.points.a = { id: 'a', kind: 'point3d', x: 0, y: 0, z: 0 };
  snapshot.scene.scene3d.points.b = { id: 'b', kind: 'point3d', x: 1, y: 0, z: 0 };
  snapshot.scene.scene3d.entities.surface = {
    id: 'surface',
    kind: 'surface3d',
    surfaceKind: 'z-function',
    vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }],
    faces: [[0, 1, 2]],
    samples: { x: 129, y: 2 },
  };

  const result = preflightGeometryLabSnapshotComplexity(snapshot, {
    maxPointRecords: 1,
    maxSurfaceVerticesPerEntity: 2,
    maxSurfaceFaceIndicesPerEntity: 2,
    maxSurfaceSamplesPerAxis: 128,
    maxSamplerGridSamples: 128,
  });
  assert.equal(result.ok, false);
  assert.ok(issueCodes(result).includes('point_records'));
  assert.ok(issueCodes(result).includes('surface_vertices'));
  assert.ok(issueCodes(result).includes('surface_face_indices'));
  assert.ok(issueCodes(result).includes('surface_samples'));
  assert.ok(issueCodes(result).includes('sampler_grid_samples'));
  assert.throws(
    () => assertGeometryLabSnapshotComplexity(snapshot, { maxPointRecords: 1 }),
    error => error?.code === 'geometry_lab_snapshot_too_complex',
  );

  const bounded = preflightGeometryLabSnapshotComplexity(snapshot, {
    maxPointRecords: 1,
    maxValidationIssues: 2,
  });
  assert.equal(bounded.ok, false);
  assert.equal(bounded.issues.length, 2);
});

test('compact equation surfaces consume their canonical sample-grid budget', () => {
  const snapshot = createEmptyGeometryLabSnapshot();
  snapshot.scene.scene3d.entities.equation = {
    id: 'equation',
    kind: 'surface3d',
    surfaceKind: 'equation',
    input: 'z=x+y',
    dependentAxis: 'z',
    vertices: [],
    faces: [],
    samples: { x: 128, y: 128 },
  };

  assert.equal(preflightGeometryLabSnapshotComplexity(snapshot).ok, true);
  const rejected = preflightGeometryLabSnapshotComplexity(snapshot, { maxSamplerGridSamples: 16_383 });
  assert.equal(rejected.ok, false);
  assert.ok(issueCodes(rejected).includes('sampler_grid_samples'));

  snapshot.scene.scene3d.entities.equation.samples = { x: 4, y: 4, z: 129 };
  const inferred = preflightGeometryLabSnapshotComplexity(snapshot);
  assert.equal(inferred.ok, false);
  assert.ok(issueCodes(inferred).includes('sampler_grid_samples'));

  delete snapshot.scene.scene3d.entities.equation.samples;
  const defaultGrid = preflightGeometryLabSnapshotComplexity(snapshot, { maxSamplerGridSamples: 56 * 56 - 1 });
  assert.equal(defaultGrid.ok, false);
  assert.ok(issueCodes(defaultGrid).includes('sampler_grid_samples'));
});

test('delta preflight bounds nesting, operations, patches, deletes, and circular inputs', () => {
  const nested = {
    op: 'batch',
    deltas: [{
      op: 'batch',
      deltas: [{
        op: 'batch',
        deltas: [{ op: 'delete', ids: ['a', 'b', 'c'] }],
      }],
    }],
  };
  const result = preflightGeometryLabDeltaComplexity(nested, {
    maxBatchDepth: 2,
    maxDeltaOperations: 3,
    maxDeleteIds: 2,
  });
  assert.equal(result.ok, false);
  assert.ok(issueCodes(result).includes('delta_operations'));
  assert.ok(issueCodes(result).includes('batch_depth'));

  const patches = preflightGeometryLabDeltaComplexity({
    op: 'historyPatch',
    patches: [{}, {}],
  }, { maxHistoryPatches: 1 });
  assert.equal(patches.ok, false);
  assert.ok(issueCodes(patches).includes('history_patches'));

  const circular = { op: 'batch', deltas: [] };
  circular.deltas.push(circular);
  const cycle = preflightGeometryLabDeltaComplexity(circular);
  assert.equal(cycle.ok, false);
  assert.ok(issueCodes(cycle).includes('traversal_cycle'));
  assert.throws(
    () => assertGeometryLabDeltaComplexity(circular),
    error => error?.code === 'geometry_lab_delta_too_complex',
  );
});

test('export preflight bounds dimensions, visible primitives, references, and final bytes', () => {
  const snapshot = createEmptyGeometryLabSnapshot();
  snapshot.scene.scene3d.entities.surface = {
    id: 'surface',
    kind: 'surface3d',
    surfaceKind: 'z-function',
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 0, y: 1, z: 0 },
    ],
    faces: [[0, 1, 2], [0, 2, 3]],
  };
  const result = preflightGeometryLabExportRequestComplexity(
    { format: 'svg', width: 20, height: 20, scale: 3 },
    snapshot,
    {
      maxExportWidth: 10,
      maxExportHeight: 10,
      maxExportPixelArea: 100,
      maxExportScale: 2,
      maxExportPrimitives: 8,
      maxExportVertexReferences: 10,
    },
  );
  assert.equal(result.ok, false);
  assert.ok(issueCodes(result).includes('export_dimension'));
  assert.ok(issueCodes(result).includes('export_pixel_area'));
  assert.ok(issueCodes(result).includes('export_scale'));
  assert.ok(issueCodes(result).includes('export_primitives'));
  assert.ok(issueCodes(result).includes('export_vertex_references'));
  assert.throws(
    () => assertGeometryLabExportRequestComplexity({ format: 'svg', width: 20, height: 20 }, snapshot, { maxExportWidth: 10 }),
    error => error?.code === 'geometry_lab_export_too_complex',
  );

  assert.equal(preflightGeometryLabExportOutputComplexity('1234', { maxExportBytes: 4 }).ok, true);
  assert.equal(preflightGeometryLabExportOutputComplexity('12345', { maxExportBytes: 4 }).ok, false);
  assert.throws(
    () => assertGeometryLabExportOutputComplexity('12345', { maxExportBytes: 4 }),
    error => error?.code === 'geometry_lab_export_too_complex',
  );
});

test('the normal maximum surface grid stays below the unique-probe hard ceiling', () => {
  const sampled = sampleRectangularSurface3D({
    first: { axis: 'x', range: [-1, 1], samples: 128 },
    second: { axis: 'y', range: [-1, 1], samples: 128 },
    dependentAxis: 'z',
    evaluate: ({ x, y }) => x + y,
  });
  assert.equal(sampled.vertices.length, 16_384);
  assert.ok(sampled.diagnostics.probeSampleCount < GEOMETRY_LAB_MAX_SURFACE_PROBE_EVALUATIONS);
});

test('instrument boundaries enforce custom scene, input, history, and export budgets atomically', async () => {
  const lab = createGeometryLab({
    complexityLimits: {
      maxPointRecords: 1,
      maxStringChars: 16,
      maxExportWidth: 640,
      maxExportHeight: 640,
      maxExportPixelArea: 640 * 640,
      maxHistoryEntries: 2,
    },
    historyLimit: 2,
  });
  const retainedId = lab.addPoint3D({ x: 0, y: 0, z: 0 });
  assert.throws(
    () => lab.addPoint3D({ x: 1, y: 0, z: 0 }),
    error => error?.code === 'geometry_lab_snapshot_too_complex',
  );
  assert.deepEqual(Object.keys(lab.getSnapshot().scene.scene3d.points), [retainedId]);

  assert.throws(
    () => lab.addEquationSurface3D({ input: 'z=1234567890123456' }),
    error => error?.code === 'geometry_lab_input_too_complex',
  );
  await assert.rejects(
    () => lab.export({ format: 'svg', width: 641, height: 480 }),
    error => error?.code === 'geometry_lab_export_too_complex',
  );
  assert.throws(
    () => createGeometryLab({
      complexityLimits: { maxHistoryEntries: 1 },
      historyLimit: 2,
    }),
    error => error?.code === 'invalid_history_limit',
  );
  assert.throws(
    () => parseGeometryLabSnapshotJson(' '.repeat(101), { maxJsonBytes: 100 }),
    error => error?.code === 'geometry_lab_json_too_large',
  );
});

test('schema issue counts, commands, partial updates, and aliased batches stay bounded', () => {
  const malformedPatches = validateGeometryLabDelta({
    op: 'historyPatch',
    patches: Array.from({ length: 200 }, () => ({})),
  }, { maxValidationIssues: 5 });
  assert.equal(malformedPatches.ok, false);
  assert.equal(malformedPatches.issues.length, 5);

  const command = validateGeometryLabCommand({
    type: 'delete',
    payload: Array.from({ length: 10_001 }, (_, index) => `id-${index}`),
  });
  assert.equal(command.ok, false);
  assert.ok(command.issues.some(issue => issue.message.includes('delete_ids')));

  const samplesUpdate = preflightGeometryLabDeltaComplexity({
    op: 'updateEntity',
    id: 'surface',
    changes: { samples: { x: 1_000_000, y: 1_000_000 } },
  });
  assert.equal(samplesUpdate.ok, false);
  assert.ok(issueCodes(samplesUpdate).includes('surface_samples'));

  const referencesUpdate = preflightGeometryLabDeltaComplexity({
    op: 'updateEntity',
    id: 'polygon',
    changes: { pointIds: Array.from({ length: 10_000 }, (_, index) => `p-${index}`) },
  });
  assert.equal(referencesUpdate.ok, false);
  assert.ok(issueCodes(referencesUpdate).includes('solid_points'));

  const leaf = { op: 'clear2D' };
  const child = { op: 'batch', deltas: Array(100).fill(leaf) };
  const aliased = { op: 'batch', deltas: Array(100).fill(child) };
  const aliasedResult = preflightGeometryLabDeltaComplexity(aliased, { maxDeltaOperations: 500 });
  assert.equal(aliasedResult.ok, false);
  assert.ok(issueCodes(aliasedResult).includes('delta_operations'));
});

test('sampler, probe, JSON-escape, and rendered-output hard limits reject before amplification', async () => {
  assert.throws(
    () => sampleRectangularSurface3D({
      first: { axis: 'x', range: [0, 1], samples: 129 },
      second: { axis: 'y', range: [0, 1], samples: 2 },
      dependentAxis: 'z',
      evaluate: ({ x, y }) => x + y,
    }),
    RangeError,
  );

  const probeBounded = createGeometryLab({
    complexityLimits: { maxSamplerProbeEvaluations: 1 },
  });
  assert.throws(
    () => probeBounded.addEquationSurface3D({ input: 'z=x+y', samples: 4 }),
    error => error?.code === 'geometry_lab_input_too_complex',
  );

  const escaped = preflightGeometryLabSnapshotComplexity(
    { value: '\u0000'.repeat(20) },
    { maxJsonBytes: 100 },
  );
  assert.equal(escaped.ok, false);
  assert.ok(issueCodes(escaped).includes('json_bytes'));

  assert.equal(preflightGeometryLabExportRequestComplexity(
    { format: 'json', width: 100_000, height: 100_000 },
    undefined,
    { maxExportWidth: 10, maxExportHeight: 10, maxExportPixelArea: 100 },
  ).ok, true);
  const tinySvg = preflightGeometryLabExportRequestComplexity(
    { format: 'svg', width: 1, height: 1 },
    createEmptyGeometryLabSnapshot(),
    { maxExportPixelArea: 100 },
  );
  assert.equal(tinySvg.ok, false);
  assert.ok(issueCodes(tinySvg).includes('export_pixel_area'));

  const curveSnapshot = createEmptyGeometryLabSnapshot();
  curveSnapshot.scene.scene3d.entities.curve = {
    id: 'curve',
    kind: 'curve3d',
    points: Array.from({ length: 20 }, (_, index) => ({ x: index, y: 0, z: 0 })),
    parameter: { tMin: 0, tMax: 1, samples: 20 },
  };
  const curveExport = preflightGeometryLabExportRequestComplexity(
    { format: 'svg', width: 640, height: 480 },
    curveSnapshot,
    { maxExportPrimitives: 8 },
  );
  assert.equal(curveExport.ok, false);
  assert.ok(issueCodes(curveExport).includes('export_primitives'));

  const outputBounded = createGeometryLab({ complexityLimits: { maxExportBytes: 20_000 } });
  outputBounded.addSurfaceZ({
    xRange: [-1, 1],
    yRange: [-1, 1],
    xSamples: 8,
    ySamples: 8,
    z: (x, y) => x + y,
  }, { color: '&'.repeat(1_000) });
  await assert.rejects(
    () => outputBounded.export({ format: 'svg', width: 640, height: 480 }),
    error => error?.code === 'geometry_lab_export_too_complex',
  );
});

test('surface mesh and remaining-scene budgets reject before evaluating callbacks', () => {
  let evaluations = 0;
  const perEntityBounded = createGeometryLab({
    complexityLimits: { maxSurfaceVerticesPerEntity: 10 },
  });
  assert.throws(
    () => perEntityBounded.addSurfaceZ({
      xRange: [-1, 1],
      yRange: [-1, 1],
      xSamples: 8,
      ySamples: 8,
      z: (x, y) => {
        evaluations += 1;
        return x + y;
      },
    }),
    error => error?.code === 'geometry_lab_input_too_complex',
  );
  assert.equal(evaluations, 0);

  const faceBounded = createGeometryLab({
    complexityLimits: { maxSurfaceFacesPerEntity: 50 },
  });
  assert.throws(
    () => faceBounded.addSurfaceZ({
      xRange: [-1, 1],
      yRange: [-1, 1],
      xSamples: 8,
      ySamples: 8,
      z: (x, y) => {
        evaluations += 1;
        return x + y;
      },
    }),
    error => error?.code === 'geometry_lab_input_too_complex',
  );
  assert.equal(evaluations, 0);

  const sceneBounded = createGeometryLab({
    complexityLimits: {
      maxSurfaceVerticesPerEntity: 64,
      maxSurfaceVerticesTotal: 100,
    },
  });
  sceneBounded.addSurfaceZ({
    xRange: [-1, 1],
    yRange: [-1, 1],
    xSamples: 8,
    ySamples: 8,
    z: (x, y) => x + y,
  });
  assert.throws(
    () => sceneBounded.addSurfaceZ({
      xRange: [-1, 1],
      yRange: [-1, 1],
      xSamples: 8,
      ySamples: 8,
      z: (x, y) => {
        evaluations += 1;
        return x - y;
      },
    }),
    error => error?.code === 'geometry_lab_input_too_complex',
  );
  assert.equal(evaluations, 0);
});
