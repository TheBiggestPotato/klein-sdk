/**
 * Geometry Lab benchmark harness (plan task 0.1).
 *
 * <p>Every performance claim in `GEOMETRY_LAB_PLAN.md` is currently unverifiable:
 * `tests/geometry-lab/phase6-render-performance.test.mjs` asserts structural
 * bounds, not elapsed time or heap growth. This module measures the hot paths
 * the plan's Phase 0 sets out to fix, so the fixes can be shown to work and
 * cannot silently regress afterwards.
 *
 * <p><b>Two kinds of number, and only one of them is portable.</b> Elapsed
 * milliseconds depend on the machine; a baseline recorded on a laptop says
 * nothing on a CI runner. So every timing is also reported normalized against a
 * calibration workload measured in the same process, and it is the normalized
 * figure that is gated. Retained heap, by contrast, is the same allocation on
 * every machine, which is why the plan calls it the primary signal.
 *
 * <p><b>Growth exponents are the real gate.</b> Phase 0 is about turning O(N^2)
 * into O(N), and a scaling exponent measured across two sizes in one process is
 * close to machine-independent - far more robust than any absolute threshold.
 * `drag-fanout` exists precisely to expose the quadratic that tasks 0.3 and 0.4
 * remove.
 *
 * Usage:
 *   node --expose-gc scripts/geometry-lab-bench.mjs
 *   node --expose-gc scripts/geometry-lab-bench.mjs --update-baseline
 *   node --expose-gc scripts/geometry-lab-bench.mjs --json
 *
 * `--expose-gc` is optional but strongly preferred: without it, retained-heap
 * figures include uncollected garbage and are reported as unreliable rather
 * than quietly wrong.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  computeGeometryInvariants,
  createGeometryLab,
  renderGeometryLabSvg3D,
} from '../dist/geometry-lab/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const BASELINE_PATH = join(HERE, '..', 'benchmarks', 'geometry-lab-baseline.json');

/**
 * Regression tolerances. Timing is normalized but still noisy on shared
 * runners, so it is given real room; retained heap is deterministic and is held
 * tight. A growth exponent is allowed a small absolute margin rather than a
 * ratio, because the interesting range (1.0 linear to 2.0 quadratic) is narrow.
 */
export const DEFAULT_TOLERANCES = Object.freeze({
  normalizedTime: 1.6,
  retainedHeap: 1.15,
  growthExponent: 0.25,
});

/**
 * Retentions below this are not gated. A tens-of-kilobytes figure swings by
 * more than the heap tolerance purely on where the collector happened to stop,
 * so gating it would flake without ever catching anything: the retention this
 * plan cares about - the megabytes finding P2 leaves behind on a fan-out drag -
 * is two orders of magnitude above the noise.
 */
export const MIN_GATED_HEAP_BYTES = 1024 * 1024;

/** Sizes every scaling case is measured at. The ratio between them sets the exponent. */
export const SCALING_SIZES = Object.freeze([100, 400]);

/* -------------------------------------------------------------------------- */
/* Scene generators                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Deterministic coordinates. A seeded generator rather than `Math.random`, so a
 * baseline recorded today describes the same figure a year from now.
 */
function coordinate(index, axis) {
  const seed = (index * 2654435761 + axis * 40503) >>> 0;
  return ((seed % 20000) / 1000) - 10;
}

/**
 * Chain topology: derived midpoints each depending on their own pair of source
 * points. Dragging one source moves exactly one derived point, so this is the
 * ordinary case and should scale linearly. It does not, quite - the full-scene
 * recompute (finding P1) makes every drag proportional to total scene size even
 * though only one object changed.
 */
export function buildChainScene(pointCount) {
  const lab = createGeometryLab();
  const deltas = [];
  for (let index = 0; index < pointCount; index += 1) {
    deltas.push({
      op: 'addPoint2D',
      point: { id: `p${index}`, kind: 'point2d', x: coordinate(index, 0), y: coordinate(index, 1) },
    });
  }
  for (let index = 0; index + 1 < pointCount; index += 2) {
    deltas.push({
      op: 'addPoint2D',
      point: {
        id: `m${index}`,
        kind: 'point2d',
        x: 0,
        y: 0,
        construction: { kind: 'midpoint', sourceIds: [`p${index}`, `p${index + 1}`] },
      },
    });
  }
  lab.applyDelta({ op: 'batch', deltas });
  return { lab, dragId: 'p0' };
}

/**
 * Fan-out topology: every derived midpoint depends on one shared hub point.
 * Dragging the hub invalidates all of them at once, which is the case where
 * finding P2 bites - `updateGeometryPointPosition` copies the whole `points`
 * record once per moved object, so k moved points in a scene of N cost O(k*N).
 *
 * <p>This is not a contrived shape. A pencil of lines through a point, a circle
 * of constructions around a centre, and a polygon's vertices driven by one
 * control point all have it.
 */
export function buildFanoutScene(spokeCount) {
  const lab = createGeometryLab();
  const deltas = [{ op: 'addPoint2D', point: { id: 'hub', kind: 'point2d', x: 0, y: 0 } }];
  for (let index = 0; index < spokeCount; index += 1) {
    deltas.push({
      op: 'addPoint2D',
      point: { id: `p${index}`, kind: 'point2d', x: coordinate(index, 2), y: coordinate(index, 3) },
    });
  }
  for (let index = 0; index < spokeCount; index += 1) {
    deltas.push({
      op: 'addPoint2D',
      point: {
        id: `m${index}`,
        kind: 'point2d',
        x: 0,
        y: 0,
        construction: { kind: 'midpoint', sourceIds: ['hub', `p${index}`] },
      },
    });
  }
  lab.applyDelta({ op: 'batch', deltas });
  return { lab, dragId: 'hub' };
}

/** A 3D scene of points and segments, for the snapshot, delta and export paths. */
export function build3DScene(pointCount) {
  const lab = createGeometryLab();
  const pointIds = [];
  for (let index = 0; index < pointCount; index += 1) {
    pointIds.push(lab.addPoint3D({
      x: coordinate(index, 4),
      y: coordinate(index, 5),
      z: coordinate(index, 6),
    }));
  }
  for (let index = 0; index + 1 < pointIds.length; index += 2) {
    lab.addSegment3D(pointIds[index], pointIds[index + 1]);
  }
  return { lab, pointIds };
}

/**
 * A scene dominated by sampled surface meshes.
 *
 * <p>Added after task 0.10, which found that moving one unrelated point in a
 * scene like this cost 28.7 ms - and that none of the cases above could see it,
 * because they are all made of points and segments. Mesh entities are where the
 * per-edit whole-snapshot passes actually hurt: a single 96x96 surface holds
 * 9,216 vertex objects, so an edit that rescans the snapshot pays for all of
 * them however small the edit was.
 */
export function buildSurfaceScene(surfaceCount) {
  const lab = createGeometryLab();
  for (let index = 0; index < surfaceCount; index += 1) {
    lab.addSurfaceZ({
      xRange: [-5, 5],
      yRange: [-5, 5],
      xSamples: 96,
      ySamples: 96,
      input: `z = sin(x) * cos(y) + ${index}`,
      z: (x, y) => Math.sin(x) * Math.cos(y) + index,
    });
  }
  // The point being dragged depends on nothing and nothing depends on it, so
  // whatever this case measures is overhead rather than real recomputation.
  const dragId = lab.addPoint3D({ x: 0, y: 0, z: 0 });
  return { lab, dragId };
}

/**
 * A work plane with many line-plane intersections hanging off it.
 *
 * <p>Phase 1's shape: dragging one of the plane's defining points has to
 * recompute the plane and then every intersection derived from it, in
 * dependency order, inside the same commit. Before Phase 1 those intersections
 * were free points and cost nothing to "recompute" - they simply stopped being
 * true - so this case only became measurable once they became real.
 */
export function buildDynamicPlaneScene(dependentCount) {
  const lab = createGeometryLab();
  const corners = [
    lab.addPoint3D({ x: 0, y: 0, z: 0 }),
    lab.addPoint3D({ x: 1, y: 0, z: 0 }),
    lab.addPoint3D({ x: 0, y: 1, z: 0 }),
  ];
  const plane = lab.addWorkPlaneByThreePoints(corners);
  for (let index = 0; index < dependentCount; index += 1) {
    const x = coordinate(index, 7);
    const y = coordinate(index, 8);
    const line = lab.addLine3D(
      lab.addPoint3D({ x, y, z: -5 }),
      lab.addPoint3D({ x, y, z: 5 }),
    );
    lab.addLinePlaneIntersection(line, plane);
  }
  return { lab, dragId: corners[2] };
}

/**
 * Solids sliced by one shared, movable plane.
 *
 * <p>Each section is recut from its solid on every commit, and its owned vertex
 * points are repositioned with it. The plan expected these meshes to be baked
 * and to need lazy regeneration; they are not, and this case is what says so.
 */
export function buildSlicedSolidsScene(sectionCount) {
  const lab = createGeometryLab();
  const corners = [
    lab.addPoint3D({ x: 0, y: 0, z: 0 }),
    lab.addPoint3D({ x: 1, y: 0, z: 0 }),
    lab.addPoint3D({ x: 0, y: 1, z: 0 }),
  ];
  const plane = lab.addWorkPlaneByThreePoints(corners);
  for (let index = 0; index < sectionCount; index += 1) {
    lab.addCrossSection(lab.addPolyhedron('cube', { x: index * 8, y: 0, z: 0 }, 4), plane);
  }
  return { lab, corners };
}

/**
 * A chain of segments held together by twenty constraints.
 *
 * <p>The relaxation solver is the classic way a geometry tool loses its frame
 * budget: it nudges points until they stop moving, and an over-constrained
 * figure never stops. This case exists to keep the iteration cap honest -
 * dragging one end must stay inside the drag budget no matter how tangled the
 * constraint set is.
 */
export function buildConstrainedScene(constraintCount) {
  const lab = createGeometryLab({ initialView: '2d' });
  const points = [lab.addPoint2D({ x: 0, y: 0 })];
  for (let index = 1; index <= constraintCount; index += 1) {
    points.push(lab.addPoint2D({ x: index * 3, y: coordinate(index, 9) }));
    lab.addSegment2D(points[index - 1], points[index]);
    lab.addConstraint2D({ kind: 'fixedLength', pointIds: [points[index - 1], points[index]], length: 3 });
  }
  return { lab, dragId: points[points.length - 1] };
}

/** A 2D figure sized for the invariant reporter, whose own cap is 24 points. */
export function buildInvariantScene(pointCount) {
  const lab = createGeometryLab();
  const deltas = [];
  for (let index = 0; index < pointCount; index += 1) {
    const angle = (index / pointCount) * Math.PI * 2;
    deltas.push({
      op: 'addPoint2D',
      point: {
        id: `p${index}`,
        kind: 'point2d',
        label: String.fromCharCode(65 + (index % 26)),
        x: Math.cos(angle) * 5,
        y: Math.sin(angle) * 5,
      },
    });
  }
  for (let index = 0; index + 1 < pointCount; index += 2) {
    deltas.push({
      op: 'addEntity2D',
      entity: { id: `s${index}`, kind: 'segment', pointIds: [`p${index}`, `p${index + 1}`] },
    });
  }
  lab.applyDelta({ op: 'batch', deltas });
  return lab;
}

/* -------------------------------------------------------------------------- */
/* Measurement                                                                */
/* -------------------------------------------------------------------------- */

const hasGc = typeof globalThis.gc === 'function';

function collect() {
  if (hasGc) {
    globalThis.gc();
    globalThis.gc();
  }
}

/**
 * Median rather than mean. One scheduler hiccup in a hundred samples should not
 * move the number a gate is read from, and on a shared CI runner there is
 * always at least one.
 */
function median(values) {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * A fixed workload used to express every timing as a multiple of this machine's
 * own speed. Deliberately dull integer and float arithmetic: no allocation, no
 * library calls, nothing a JIT can eliminate, and no dependence on the SDK -
 * otherwise the calibration would move whenever the code under test does.
 */
export function calibrate() {
  const run = (offset) => {
    let accumulator = offset;
    for (let index = 1; index <= 2000000; index += 1) {
      accumulator += Math.sqrt(index + accumulator % 3) / (index + 1);
    }
    return accumulator;
  };
  // The result is fed back in and finally consumed, so V8 cannot decide the
  // loop is dead and optimize the calibration away - which would make every
  // normalized timing meaningless in a way nothing else here would reveal.
  let sink = 0;
  for (let warmup = 0; warmup < 3; warmup += 1) sink = run(sink) % 1;
  const samples = [];
  for (let sample = 0; sample < 7; sample += 1) {
    const started = process.hrtime.bigint();
    sink = run(sink) % 1;
    samples.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  calibrationSink = sink;
  return median(samples);
}

/** Kept live so the calibration loop's result is genuinely observed. */
export let calibrationSink = 0;

/**
 * Times one operation and reports the heap it leaves behind.
 *
 * <p>`retainedHeapBytes` is measured with a collection on both sides, so it is
 * what the operation actually holds on to. `churnHeapBytes` is the growth
 * across the sample loop without collecting, which approximates allocation
 * pressure - if a GC fires mid-loop the figure comes out low, so it can produce
 * a false pass but never a false failure. It is reported, never gated.
 */
export function measure(operation, { warmup = 5, samples = 25 } = {}) {
  // One counter across warmup and samples, never restarted: cases that add
  // objects derive ids from it, and a restart would collide with what warmup
  // already inserted.
  let invocation = 0;
  for (let index = 0; index < warmup; index += 1) operation(invocation += 1);

  collect();
  const heapBefore = process.memoryUsage().heapUsed;

  const timings = [];
  for (let index = 0; index < samples; index += 1) {
    const started = process.hrtime.bigint();
    operation(invocation += 1);
    timings.push(Number(process.hrtime.bigint() - started) / 1e6);
  }

  const churnHeapBytes = process.memoryUsage().heapUsed - heapBefore;
  collect();
  const retainedHeapBytes = process.memoryUsage().heapUsed - heapBefore;

  return {
    medianMs: median(timings),
    minMs: Math.min(...timings),
    churnHeapBytes: Math.max(0, churnHeapBytes),
    retainedHeapBytes: Math.max(0, retainedHeapBytes),
  };
}

/**
 * The exponent e in cost proportional to N^e, from two measured sizes.
 * 1.0 is linear, 2.0 quadratic. This is the number Phase 0 has to move.
 */
export function growthExponent(smallSize, smallCost, largeSize, largeCost) {
  if (smallCost <= 0 || largeCost <= 0 || smallSize <= 0 || largeSize <= smallSize) return null;
  return Math.log(largeCost / smallCost) / Math.log(largeSize / smallSize);
}

/* -------------------------------------------------------------------------- */
/* Cases                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Each case names the plan finding it measures, so a regression report points
 * at the paragraph explaining it rather than at a bare number.
 *
 * `budgetMs` is the Section 3 target the plan commits to, not today's value.
 * Cases are expected to exceed it until Phase 0 lands; the gate compares
 * against the recorded baseline, while the budget is reported alongside so the
 * distance left to cover stays visible.
 */
export const CASES = [
  {
    id: 'drag-chain-500',
    title: 'Drag one point, 500-object chain scene',
    findings: ['P1', 'P2', 'P3', 'P4'],
    budgetMs: 4,
    run() {
      const { lab, dragId } = buildChainScene(500);
      return (index) => lab.applyDelta({ op: 'updatePoint', id: dragId, changes: { x: index * 0.01 } });
    },
  },
  {
    id: 'drag-fanout-400',
    title: 'Drag a hub with 400 dependents',
    findings: ['P2', 'P3'],
    budgetMs: 4,
    run() {
      const { lab, dragId } = buildFanoutScene(400);
      return (index) => lab.applyDelta({ op: 'updatePoint', id: dragId, changes: { x: index * 0.01 } });
    },
  },
  {
    id: 'drag-mesh-4-surfaces',
    title: 'Move one unrelated point in a 4-surface scene (36,864 vertices)',
    findings: ['P11'],
    budgetMs: 4,
    run() {
      const { lab, dragId } = buildSurfaceScene(4);
      return (index) => lab.applyDelta({ op: 'updatePoint', id: dragId, changes: { x: index * 0.01 } });
    },
  },
  {
    id: 'snapshot-read-mesh',
    title: 'getSnapshot() on a 4-surface scene',
    findings: ['P6'],
    budgetMs: 4,
    run() {
      const { lab } = buildSurfaceScene(4);
      return () => lab.getSnapshot();
    },
  },
  {
    id: 'drag-plane-10-dependents',
    title: 'Drag a work plane carrying 10 line-plane intersections',
    findings: [],
    budgetMs: 4,
    run() {
      const { lab, dragId } = buildDynamicPlaneScene(10);
      return (index) => lab.applyDelta({ op: 'updatePoint', id: dragId, changes: { z: (index % 20) * 0.05 } });
    },
  },
  {
    id: 'drag-plane-3-cross-sections',
    title: 'Drag a plane slicing three solids, recutting each section',
    findings: [],
    budgetMs: 4,
    run() {
      const { lab, corners } = buildSlicedSolidsScene(3);
      // All three corners together, so the plane translates rather than tilting:
      // a tilt steep enough to miss the furthest solid would empty that section,
      // and an empty section is a rejected edit rather than a slow one.
      return (index) => {
        const z = ((index % 20) - 10) * 0.05;
        lab.applyDelta({
          op: 'batch',
          deltas: corners.map(id => ({ op: 'updatePoint', id, changes: { z } })),
        });
      };
    },
  },
  {
    id: 'drag-20-constraints',
    title: 'Drag one end of a chain held by 20 fixed-length constraints',
    findings: [],
    budgetMs: 4,
    run() {
      const { lab, dragId } = buildConstrainedScene(20);
      return (index) => lab.applyDelta({
        op: 'updatePoint',
        id: dragId,
        changes: { x: 60 + (index % 10), y: (index % 7) - 3 },
      });
    },
  },
  {
    id: 'delta-roundtrip-500',
    title: 'Single add delta onto a 500-point 3D scene',
    findings: ['P5'],
    budgetMs: 0.5,
    run() {
      const { lab } = build3DScene(500);
      return (index) => lab.applyDelta({
        op: 'addPoint3D',
        point: { id: `bench${index}`, kind: 'point3d', x: index, y: 0, z: 0 },
      });
    },
  },
  {
    id: 'snapshot-read-500',
    title: 'getSnapshot() on a 500-point 3D scene',
    findings: ['P6'],
    budgetMs: 0.5,
    run() {
      const { lab } = build3DScene(500);
      return () => lab.getSnapshot();
    },
  },
  {
    id: 'export-svg-500',
    title: 'SVG render of a 500-point 3D scene',
    findings: [],
    budgetMs: 16,
    run() {
      const { lab } = build3DScene(500);
      const snapshot = lab.getSnapshot();
      // The renderer directly rather than `export()`, which is async and would
      // fold promise scheduling into a figure meant to be the render itself.
      return () => renderGeometryLabSvg3D(snapshot, { format: 'svg' }, {});
    },
  },
  {
    id: 'invariants-24',
    // Kept at twenty-four after the cap was raised, so the number stays
    // comparable with every baseline taken before bucketing.
    title: 'computeGeometryInvariants over 24 points',
    findings: ['P9'],
    budgetMs: 8,
    run() {
      const lab = buildInvariantScene(24);
      const snapshot = lab.getSnapshot();
      return () => computeGeometryInvariants(snapshot);
    },
  },
  {
    id: 'invariants-cap',
    // A figure at the raised cap, dense enough that the scan gives up at the
    // fact bound: the worst case marking can be asked for.
    title: 'computeGeometryInvariants at the 128-point cap',
    findings: ['P9'],
    budgetMs: 8,
    run() {
      const lab = buildInvariantScene(128);
      const snapshot = lab.getSnapshot();
      return () => computeGeometryInvariants(snapshot);
    },
  },
];

/** Scaling cases, measured at two sizes to produce a growth exponent. */
export const SCALING_CASES = [
  {
    id: 'scale-drag-chain',
    title: 'Drag cost against scene size (chain)',
    findings: ['P1'],
    targetExponent: 0.2,
    build: (size) => {
      const { lab, dragId } = buildChainScene(size);
      return (index) => lab.applyDelta({ op: 'updatePoint', id: dragId, changes: { x: index * 0.01 } });
    },
  },
  {
    id: 'scale-drag-fanout',
    title: 'Drag cost against dependent count (fan-out)',
    findings: ['P2', 'P3'],
    targetExponent: 1.1,
    build: (size) => {
      const { lab, dragId } = buildFanoutScene(size);
      return (index) => lab.applyDelta({ op: 'updatePoint', id: dragId, changes: { x: index * 0.01 } });
    },
  },
  {
    id: 'scale-snapshot-heap',
    title: 'Retained snapshot heap against scene size',
    findings: ['P8'],
    targetExponent: 1.1,
    build: (size) => {
      const { lab } = build3DScene(size);
      const held = [];
      return () => {
        held.length = 0;
        held.push(lab.getSnapshot());
      };
    },
  },
];

/* -------------------------------------------------------------------------- */
/* Runner                                                                     */
/* -------------------------------------------------------------------------- */

/** Runs every case and returns a result document suitable for a baseline file. */
export function runBenchmarks({ samples = 25, warmup = 5 } = {}) {
  const calibrationMs = calibrate();

  const cases = {};
  for (const testCase of CASES) {
    const operation = testCase.run();
    const measured = measure(operation, { samples, warmup });
    cases[testCase.id] = {
      title: testCase.title,
      findings: testCase.findings,
      budgetMs: testCase.budgetMs,
      medianMs: round(measured.medianMs, 4),
      normalizedTime: round(measured.medianMs / calibrationMs, 5),
      retainedHeapBytes: measured.retainedHeapBytes,
      churnHeapBytes: measured.churnHeapBytes,
      withinBudget: measured.medianMs <= testCase.budgetMs,
    };
  }

  const scaling = {};
  const [smallSize, largeSize] = SCALING_SIZES;
  for (const testCase of SCALING_CASES) {
    const small = measure(testCase.build(smallSize), { samples, warmup });
    const large = measure(testCase.build(largeSize), { samples, warmup });
    const timeExponent = growthExponent(smallSize, small.medianMs, largeSize, large.medianMs);
    const heapExponent = growthExponent(
      smallSize,
      small.retainedHeapBytes,
      largeSize,
      large.retainedHeapBytes,
    );
    scaling[testCase.id] = {
      title: testCase.title,
      findings: testCase.findings,
      targetExponent: testCase.targetExponent,
      sizes: [smallSize, largeSize],
      smallMs: round(small.medianMs, 4),
      largeMs: round(large.medianMs, 4),
      timeExponent: timeExponent === null ? null : round(timeExponent, 3),
      heapExponent: heapExponent === null ? null : round(heapExponent, 3),
      meetsTarget: timeExponent !== null && timeExponent <= testCase.targetExponent,
    };
  }

  return {
    schema: 1,
    calibrationMs: round(calibrationMs, 4),
    gcAvailable: hasGc,
    samples,
    cases,
    scaling,
  };
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/* -------------------------------------------------------------------------- */
/* Baseline comparison                                                        */
/* -------------------------------------------------------------------------- */

export function readBaseline() {
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
}

export function writeBaseline(results) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
}

/**
 * Compares a run against the committed baseline.
 *
 * <p>Timing is compared normalized, never in milliseconds, so a slower runner
 * does not read as a regression. Retained heap is compared directly, because
 * the same code allocates the same bytes everywhere - and is skipped entirely
 * when the process has no `--expose-gc`, since without a collection the figure
 * is uncollected garbage rather than retention.
 */
export function compareToBaseline(results, baseline, tolerances = DEFAULT_TOLERANCES) {
  const regressions = [];
  const compareHeap = results.gcAvailable && baseline.gcAvailable;

  for (const [id, current] of Object.entries(results.cases)) {
    const previous = baseline.cases?.[id];
    if (!previous) continue;

    ratioCheck(regressions, {
      id,
      metric: 'normalizedTime',
      current: current.normalizedTime,
      previous: previous.normalizedTime,
      tolerance: tolerances.normalizedTime,
      findings: current.findings,
    });

    if (compareHeap && previous.retainedHeapBytes >= MIN_GATED_HEAP_BYTES) {
      ratioCheck(regressions, {
        id,
        metric: 'retainedHeapBytes',
        current: current.retainedHeapBytes,
        previous: previous.retainedHeapBytes,
        tolerance: tolerances.retainedHeap,
        findings: current.findings,
      });
    }
  }

  for (const [id, current] of Object.entries(results.scaling)) {
    const previous = baseline.scaling?.[id];
    if (!previous || previous.timeExponent === null || current.timeExponent === null) continue;
    const allowed = previous.timeExponent + tolerances.growthExponent;
    if (current.timeExponent > allowed) {
      regressions.push({
        id,
        metric: 'timeExponent',
        current: current.timeExponent,
        previous: previous.timeExponent,
        allowed: round(allowed, 3),
        findings: current.findings,
      });
    }
  }

  return { ok: regressions.length === 0, regressions };
}

function ratioCheck(regressions, { id, metric, current, previous, tolerance, findings }) {
  if (!(previous > 0)) return;
  const ratio = current / previous;
  if (ratio <= tolerance) return;
  regressions.push({
    id,
    metric,
    current,
    previous,
    ratio: round(ratio, 3),
    allowed: tolerance,
    findings,
  });
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function report(results) {
  const lines = [];
  lines.push('Geometry Lab benchmark');
  lines.push(`  calibration ${results.calibrationMs.toFixed(2)} ms  ·  samples ${results.samples}  ·  gc ${results.gcAvailable ? 'available' : 'UNAVAILABLE (heap figures unreliable, rerun with --expose-gc)'}`);
  lines.push('');
  lines.push('  case                          median      budget   status   retained    findings');
  for (const [id, entry] of Object.entries(results.cases)) {
    lines.push([
      `  ${id.padEnd(28)}`,
      `${entry.medianMs.toFixed(3).padStart(8)} ms`,
      `${String(entry.budgetMs).padStart(6)} ms`,
      entry.withinBudget ? '   ok  ' : '  OVER ',
      formatBytes(entry.retainedHeapBytes).padStart(10),
      `  ${entry.findings.join(' ')}`,
    ].join(' '));
  }
  lines.push('');
  lines.push('  scaling                       exponent   target   status   findings');
  for (const [id, entry] of Object.entries(results.scaling)) {
    const exponent = entry.timeExponent === null ? 'n/a' : entry.timeExponent.toFixed(2);
    lines.push([
      `  ${id.padEnd(28)}`,
      exponent.padStart(8),
      `${String(entry.targetExponent).padStart(8)}`,
      entry.meetsTarget ? '   ok  ' : '  OVER ',
      `  ${entry.findings.join(' ')}`,
    ].join(' '));
  }
  return lines.join('\n');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const args = new Set(process.argv.slice(2));
  const results = runBenchmarks();

  if (args.has('--json')) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  } else {
    process.stdout.write(`${report(results)}\n`);
  }

  if (args.has('--update-baseline')) {
    writeBaseline(results);
    process.stdout.write(`\nBaseline written to ${BASELINE_PATH}\n`);
  } else if (args.has('--check')) {
    const comparison = compareToBaseline(results, readBaseline());
    if (!comparison.ok) {
      process.stdout.write('\nRegressions against baseline:\n');
      for (const regression of comparison.regressions) {
        process.stdout.write(
          `  ${regression.id} ${regression.metric}: ${regression.current} vs ${regression.previous} (allowed ${regression.allowed})\n`,
        );
      }
      process.exitCode = 1;
    } else {
      process.stdout.write('\nNo regressions against baseline.\n');
    }
  }
}
