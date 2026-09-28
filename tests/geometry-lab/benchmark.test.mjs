/**
 * Gate for the Geometry Lab benchmark harness (plan task 0.1).
 *
 * <p>Two kinds of test live here on purpose. The fast ones check the harness
 * itself - a benchmark that silently measures nothing passes every regression
 * check it is ever asked to make, which is the failure mode worth guarding
 * against. The slow one is the actual gate against the committed baseline.
 *
 * <p>The gate compares normalized time, never milliseconds, so a slower CI
 * runner does not read as a regression. Set `KLEIN_SKIP_BENCH=1` to skip it on
 * a machine too noisy to measure on; the harness tests still run.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CASES,
  DEFAULT_TOLERANCES,
  MIN_GATED_HEAP_BYTES,
  SCALING_CASES,
  SCALING_SIZES,
  buildChainScene,
  buildFanoutScene,
  buildInvariantScene,
  build3DScene,
  compareToBaseline,
  growthExponent,
  tolerancesForEnvironment,
  timeGateApplies,
  measure,
  readBaseline,
  runBenchmarks,
} from '../../scripts/geometry-lab-bench.mjs';

/* -------------------------------------------------------------------------- */
/* The harness itself                                                         */
/* -------------------------------------------------------------------------- */

test('chain scene builds the requested points and links derived midpoints', () => {
  const { lab, dragId } = buildChainScene(50);
  const scene = lab.getSnapshot().scene.scene2d;
  assert.equal(Object.keys(scene.points).length, 75, '50 sources plus 25 midpoints');
  assert.equal(scene.points[dragId].kind, 'point2d');
  assert.equal(scene.points.m0.construction.kind, 'midpoint');
});

test('chain scene recomputes a derived point when its source moves', () => {
  const { lab } = buildChainScene(4);
  const before = lab.getSnapshot().scene.scene2d.points.m0;
  lab.applyDelta({ op: 'updatePoint', id: 'p0', changes: { x: before.x + 100 } });
  const after = lab.getSnapshot().scene.scene2d.points.m0;
  assert.notEqual(after.x, before.x, 'the benchmark must exercise a live recompute, not a static scene');
});

test('fan-out scene makes every derived point depend on the hub', () => {
  const { lab, dragId } = buildFanoutScene(30);
  const scene = lab.getSnapshot().scene.scene2d;
  assert.equal(Object.keys(scene.points).length, 61, 'hub plus 30 sources plus 30 midpoints');
  for (let index = 0; index < 30; index += 1) {
    assert.deepEqual(scene.points[`m${index}`].construction.sourceIds, [dragId, `p${index}`]);
  }
});

test('fan-out drag moves every dependent, which is what makes it the O(k*N) case', () => {
  const { lab, dragId } = buildFanoutScene(20);
  const before = lab.getSnapshot().scene.scene2d;
  lab.applyDelta({ op: 'updatePoint', id: dragId, changes: { x: 500 } });
  const after = lab.getSnapshot().scene.scene2d;
  for (let index = 0; index < 20; index += 1) {
    assert.notEqual(
      after[`m${index}`]?.x ?? after.points[`m${index}`].x,
      before.points[`m${index}`].x,
      `dependent m${index} did not move`,
    );
  }
});

test('3D scene builds points and segments', () => {
  const { lab, pointIds } = build3DScene(40);
  const scene = lab.getSnapshot().scene.scene3d;
  assert.equal(pointIds.length, 40);
  assert.equal(Object.keys(scene.points).length, 40);
  assert.equal(Object.values(scene.entities).filter(entity => entity.kind === 'segment').length, 20);
});

test('invariant scene produces facts for the reporter to find', async () => {
  const { computeGeometryInvariants } = await import('../../dist/geometry-lab/index.js');
  const report = computeGeometryInvariants(buildInvariantScene(12).getSnapshot());
  assert.equal(report.toolKey, 'geometry-lab');
  assert.ok(report.invariants.length > 0, 'a benchmark over an empty result measures nothing');
});

test('scene generators are deterministic', () => {
  const first = JSON.stringify(buildChainScene(20).lab.getSnapshot().scene.scene2d.points);
  const second = JSON.stringify(buildChainScene(20).lab.getSnapshot().scene.scene2d.points);
  assert.equal(first, second, 'a baseline is only meaningful if the figure is the same every run');
});

test('measure passes a monotonic counter across warmup and samples', () => {
  const seen = [];
  measure((invocation) => seen.push(invocation), { warmup: 3, samples: 4 });
  assert.equal(seen.length, 7);
  assert.deepEqual(seen, [...seen].sort((a, b) => a - b));
  assert.equal(new Set(seen).size, 7, 'ids derived from the counter would otherwise collide');
});

test('measure reports a positive median for real work', () => {
  const result = measure(() => {
    let total = 0;
    for (let index = 0; index < 50000; index += 1) total += index;
    return total;
  }, { warmup: 2, samples: 5 });
  assert.ok(result.medianMs > 0);
  assert.ok(result.minMs <= result.medianMs);
});

test('growthExponent recovers known exponents', () => {
  assert.equal(Math.round(growthExponent(100, 1, 400, 4) * 100) / 100, 1);
  assert.equal(Math.round(growthExponent(100, 1, 400, 16) * 100) / 100, 2);
  assert.equal(growthExponent(100, 0, 400, 4), null, 'zero cost cannot yield an exponent');
  assert.equal(growthExponent(400, 1, 100, 4), null, 'sizes must increase');
});

test('every case and scaling case declares a budget the report can read', () => {
  for (const testCase of CASES) {
    assert.ok(testCase.id && testCase.title, 'a case needs an id and a title');
    assert.ok(testCase.budgetMs > 0, `${testCase.id} has no budget`);
    assert.equal(typeof testCase.run, 'function');
  }
  for (const testCase of SCALING_CASES) {
    assert.ok(testCase.targetExponent > 0, `${testCase.id} has no target exponent`);
    assert.equal(typeof testCase.build, 'function');
  }
  assert.equal(SCALING_SIZES.length, 2, 'an exponent needs exactly two sizes');
});

test('committed baseline covers every case the harness measures', () => {
  const baseline = readBaseline();
  assert.equal(baseline.schema, 1);
  for (const testCase of CASES) {
    assert.ok(baseline.cases[testCase.id], `baseline is missing case ${testCase.id}`);
    assert.ok(
      baseline.cases[testCase.id].normalizedTime > 0,
      `baseline for ${testCase.id} has no normalized time to compare against`,
    );
  }
  for (const testCase of SCALING_CASES) {
    assert.ok(baseline.scaling[testCase.id], `baseline is missing scaling case ${testCase.id}`);
  }
});

test('compareToBaseline flags a slowdown beyond tolerance and ignores one inside it', () => {
  const baseline = {
    gcAvailable: true,
    cases: { sample: { normalizedTime: 1, retainedHeapBytes: 1_000_000, findings: [] } },
    scaling: {},
  };
  const within = {
    gcAvailable: true,
    cases: { sample: { normalizedTime: 1.4, retainedHeapBytes: 1_050_000, findings: [] } },
    scaling: {},
  };
  const beyond = {
    gcAvailable: true,
    cases: { sample: { normalizedTime: 2.5, retainedHeapBytes: 1_000_000, findings: [] } },
    scaling: {},
  };
  assert.equal(compareToBaseline(within, baseline).ok, true);
  const failed = compareToBaseline(beyond, baseline);
  assert.equal(failed.ok, false);
  assert.equal(failed.regressions[0].metric, 'normalizedTime');
});

test('compareToBaseline flags heap growth and a worsening growth exponent', () => {
  const baseline = {
    gcAvailable: true,
    cases: { sample: { normalizedTime: 1, retainedHeapBytes: 8_000_000, findings: [] } },
    scaling: { grow: { timeExponent: 1.2, findings: [] } },
  };
  const heavier = {
    gcAvailable: true,
    cases: { sample: { normalizedTime: 1, retainedHeapBytes: 11_000_000, findings: [] } },
    scaling: { grow: { timeExponent: 1.2, findings: [] } },
  };
  const steeper = {
    gcAvailable: true,
    cases: { sample: { normalizedTime: 1, retainedHeapBytes: 8_000_000, findings: [] } },
    scaling: { grow: { timeExponent: 1.9, findings: [] } },
  };
  assert.equal(compareToBaseline(heavier, baseline).regressions[0].metric, 'retainedHeapBytes');
  assert.equal(compareToBaseline(steeper, baseline).regressions[0].metric, 'timeExponent');
});

test('compareToBaseline ignores heap swings too small to measure reliably', () => {
  const small = MIN_GATED_HEAP_BYTES - 1;
  const baseline = {
    gcAvailable: true,
    cases: { sample: { normalizedTime: 1, retainedHeapBytes: small, findings: [] } },
    scaling: {},
  };
  const doubled = {
    gcAvailable: true,
    cases: { sample: { normalizedTime: 1, retainedHeapBytes: small * 2, findings: [] } },
    scaling: {},
  };
  assert.equal(
    compareToBaseline(doubled, baseline).ok,
    true,
    'collector placement moves small retentions more than the tolerance does',
  );
});

test('compareToBaseline skips heap when the run had no gc to trust', () => {
  const baseline = {
    gcAvailable: true,
    cases: { sample: { normalizedTime: 1, retainedHeapBytes: 1_000_000, findings: [] } },
    scaling: {},
  };
  const noGc = {
    gcAvailable: false,
    cases: { sample: { normalizedTime: 1, retainedHeapBytes: 40_000_000, findings: [] } },
    scaling: {},
  };
  assert.equal(compareToBaseline(noGc, baseline).ok, true, 'uncollected garbage is not a heap regression');
});

test('tolerances leave time looser than heap, since only heap is deterministic', () => {
  assert.ok(DEFAULT_TOLERANCES.normalizedTime > DEFAULT_TOLERANCES.retainedHeap);
});

/* -------------------------------------------------------------------------- */
/* The gate                                                                   */
/* -------------------------------------------------------------------------- */

test('benchmarks show no regression against the committed baseline', { skip: skipReason() }, () => {
  const results = runBenchmarks();
  // On the machine the baseline came from, time is gated too; anywhere else
  // only the portable signals are, and the times are printed to be read.
  const comparison = compareToBaseline(results, readBaseline(), tolerancesForEnvironment());
  if (!timeGateApplies()) {
    const drift = Object.entries(results.cases)
      .map(([id, current]) => [id, current.normalizedTime, readBaseline().cases?.[id]?.normalizedTime])
      .filter(([, , previous]) => previous > 0)
      .map(([id, current, previous]) => `${id} ${(current / previous).toFixed(2)}x`)
      .join(', ');
    console.log(`time not gated here (CI); normalized drift vs baseline: ${drift}`);
  }

  const detail = comparison.regressions
    .map(entry => `${entry.id} ${entry.metric}: ${entry.current} vs baseline ${entry.previous} (allowed ${entry.allowed})`
      + (entry.findings?.length ? ` [${entry.findings.join(' ')}]` : ''))
    .join('\n  ');

  assert.equal(comparison.ok, true, comparison.ok ? '' : `Geometry Lab performance regressed:\n  ${detail}`);
});

function skipReason() {
  if (process.env.KLEIN_SKIP_BENCH === '1') return 'KLEIN_SKIP_BENCH=1';
  return false;
}
