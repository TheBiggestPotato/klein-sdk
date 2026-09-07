# Geometry Lab Plan

Last updated: 2026-09-07

Goal: take `klein-sdk/geometry-lab` from a serializable scene model with a static
renderer to a state-of-the-art dynamic geometry and learning tool, without
regressing time or memory on the interaction path.

Status legend: `[ ]` not started, `[~]` in progress, `[x]` done.

## Progress

| Phase | Done | Tasks | Notes |
| --- | --: | --: | --- |
| 0 - Performance foundation | 5 | 9 | 0.1, 0.2, 0.4, 0.5, 0.9 landed; 0.3 measured and declined; 0.6-0.8 open |
| 1 - Make 3D dynamic | 0 | 6 | Blocked on 0.2-0.4 |
| 2 - Close the 2D gap | 0 | 5 | |
| 3 - Transformations and constraints | 0 | 3 | Blocked on 1.1-1.2 |
| 4 - The learning layer | 0 | 6 | 4.1 can start any time |
| 5 - Accessibility and output | 0 | 5 | |
| 6 - Mathematical depth | 0 | 5 | |

Run `npm run bench:geometry-lab` for the current numbers, or
`npm run bench:geometry-lab:check` to compare against the committed baseline.

## Contents

1. [Verdict](#1-verdict)
2. [Performance baseline](#2-performance-baseline)
3. [Measured baseline](#2a-measured-baseline)
4. [Per-delta profile](#2b-per-delta-profile)
5. [Budgets](#3-budgets)
6. [Phase 0 - performance foundation](#phase-0---performance-foundation)
7. [Phase 1 - make 3D dynamic](#phase-1---make-3d-dynamic)
8. [Phase 2 - close the 2D gap](#phase-2---close-the-2d-gap)
9. [Phase 3 - transformations and constraints](#phase-3---transformations-and-constraints)
10. [Phase 4 - the learning layer](#phase-4---the-learning-layer)
11. [Phase 5 - accessibility and output](#phase-5---accessibility-and-output)
12. [Phase 6 - mathematical depth](#phase-6---mathematical-depth)
13. [New complexity limits](#11-new-complexity-limits)
14. [Sequencing and risk](#12-sequencing-and-risk)

## 1. Verdict

Three findings drive everything below.

**The 3D scene is not dynamic geometry.** `canonicalize.ts:89` recomputes
`scene.scene2d` and nothing else. No 3D point or entity carries a
`construction`, so every derived 3D object is baked at creation and never
updated. `addLinePlaneIntersection` (`instrument.ts:802`) computes a point and
stores it as a free `GeometryPoint3D`; move the plane and the "intersection"
stays where it was. The same holds for plane-plane intersections,
cross-sections, solid vertices and nets. This is not a missing feature, it is a
figure that silently becomes false, which in a teaching tool is worse than an
error.

**The Lab has no 2D API.** The `GeometryLab` interface (`types.ts:340`) exposes
roughly forty-five methods and every one is 3D, while `GeometryLabTool` declares
`point`, `segment`, `polygon`, `circle`, `angle`, `midpoint`, `perpendicular`,
`parallel` and `bisector`. A host can only hand-build raw `addPoint2D` and
`addEntity2D` deltas. The construction API those tools need already exists next
door in `GeometryCalculator` (`src/geometry/index.ts`).

**The learning layer is one good idea, wired to nothing.**
`computeGeometryInvariants` (`gradable-invariants.ts:80`) is well designed:
tolerance relative to figure size, stated rather than hidden, absence meaning
"not established" rather than false. But nothing in `src/assessment` or
`src/exam` references it, `GeometryLab` does not expose it, and it only reports
facts that hold - so it can mark, but it cannot hint.

## 2. Performance baseline

Found by reading the hot paths. Task 0.1 has since measured them - see
[Section 2a](#2a-measured-baseline). None of it matters at twenty objects. All
of it matters the moment there is a drag loop, a class of thirty collaborating,
or a five-hundred-object figure.

### P1. Full-scene recompute on every delta

`canonicalize.ts:89` calls `recomputeGeometryScene(scene2d)`, which visits
**every** point and entity, not only the derived ones, on every committed delta.
Moving one point costs a full-scene pass.

**Overstated as written, and closed.** Measured, that pass is 0.12 ms of a
4.8 ms drag on 500 objects. Scoping it was tried and is *slower* than leaving it
alone - see task 0.3 - because building the reverse index costs more than the
walk it avoids. The O(N) growth a drag really shows comes from the per-delta
whole-snapshot passes in [Section 2b](#2b-per-delta-profile), not from here.

### P2. Whole-record copy per recomputed object

`updateGeometryPointPosition` (`geometry-core/index.ts:1141`) spreads the entire
`points` record for each object it touches. Recomputing k objects in a scene of
N points allocates O(k·N). Combined with P1, where k grows with N, a single edit
is **O(N²) allocation**.

### P3. Dependency graph rebuilt on every query

`geometryDependentsOf` called `buildGeometryDependencyGraph` on every
invocation - a full O(V+E) rebuild. Inside it, `existing.includes(id)` scanned
linearly and `dependentsById[sourceId] = [...existing, id]` reallocated the
array per edge, making edge insertion O(d) time and O(d) garbage, so O(d²) per
node.

**Fixed by task 0.2**, 6.1x on the quadratic shape. Note this was never on the
drag path, since the drag path does not consult the graph; it is the object
panel, delete planning and `getDependencyGraph()` that pay it.

### P4. Quadratic breadth-first traversal

`geometryDependentsOf` used `queue.shift()`, which is O(n) on a JavaScript
array, so the traversal was O(n²). **Fixed by task 0.2** with an index cursor.

### P5. Repeated full-snapshot complexity traversals

`assertGeometryLabSnapshotComplexity` walks up to `maxTraversalNodes`
(2,000,000). It ran twice inside `canonicalizeGeometryLabBoundary` and a third
time on the public path at `reducer.ts:141`.

**Understated as written.** Profiling for task 0.5 found five full passes per
delta, not three, and the complexity assertion is not the largest of them - the
cross-record integrity scan is. See [Section 2b](#2b-per-delta-profile).

Task 0.5 removed one assertion from the owned path. Task 0.9 then made the
integrity scan 2.3x cheaper - by not building the nine graph indexes it never
reads, rather than by making it incremental, so it remains a full pass with no
staleness risk. Four full passes per delta remain; they are simply much cheaper
ones.

### P6. Deep clone on every snapshot read

`getSnapshot()` (`instrument.ts:489`) deep-clones the whole snapshot. Any host
reading state per frame pays a full copy per frame.

### P7. History entries sized for the worst case

`maxHistoryEntries: 100`, `maxHistoryEntryBytes: 16 MiB`,
`maxHistoryBytes: 32 MiB` (`complexity.ts:67`). A single entry may be 16 MiB,
and entries are serialized JSON patches.

### P8. Mesh geometry stored as object arrays

`SurfaceEntity3D.vertices` is `Vector3[]` and `CurveEntity3D.points` is
`Vector3[]`. At `maxSurfaceVerticesTotal: 131_072`, that is 131k three-property
objects - roughly an order of magnitude more heap, and far more GC pressure,
than a packed typed array of the same numbers.

### P9. Invariant computation is cubic

`computeGeometryInvariants` runs a triple nested loop over points
(`gradable-invariants.ts:150-188`) and a pairwise loop over segments. That is
why `MAX_POINTS = 24`. Any expansion of the vocabulary multiplies a cubic, and
conjecture detection (Phase 4.4) needs to run the whole computation many times
over.

### P10. No timing or allocation gate

`tests/geometry-lab/phase6-render-performance.test.mjs` asserts structural
*bounds*, not elapsed time or heap growth. There is no benchmark harness and no
regression gate, so every fix below is currently unverifiable.

## 2a. Measured baseline

Recorded 2026-09-07 by `npm run bench:geometry-lab`, committed to
`benchmarks/geometry-lab-baseline.json`. Machine-specific milliseconds are shown
for scale; the gate compares the normalized figures stored alongside them.

| Case | Median | Budget | Retained | Churn/op | Findings |
| --- | --: | --: | --: | --: | --- |
| `drag-chain-500` | 5.34 ms | 4 ms | 0.20 MB | 1.40 MB | P1 P2 P3 P4 |
| `drag-fanout-400` | **29.19 ms** | 4 ms | **9.17 MB** | 1.73 MB | P2 P3 |
| `delta-roundtrip-500` | **5.53 ms** | 0.5 ms | — | 1.16 MB | P5 |
| `snapshot-read-500` | 0.53 ms | 0.5 ms | — | 0.37 MB | P6 |
| `export-svg-500` | 1.94 ms | 16 ms | — | 1.14 MB | — |
| `invariants-24` | 0.28 ms | 8 ms | 0.05 MB | 0.29 MB | P9 |

| Scaling case | Exponent | Target | Findings |
| --- | --: | --: | --- |
| `scale-drag-chain` | 0.93 | 0.20 | P1 |
| `scale-drag-fanout` | **1.76** | 1.10 | P2 P3 |
| `scale-snapshot-heap` | 1.32 | 1.10 | P8 |

Since task 0.4, `drag-fanout-400` reads 7.49 ms and `scale-drag-fanout` 0.97.
The table above is kept as recorded so the starting point stays legible; the
committed baseline file tracks current numbers.

What the numbers settle:

- **P2 is real and quadratic.** `scale-drag-fanout` measures an exponent of
  1.76 across 100 and 400 dependents - four times the dependents costs 10.7
  times the work. A single fan-out drag retains 9.17 MB.
- **P1 is real but linear, not quadratic.** `scale-drag-chain` measures 0.93:
  drag cost tracks *total scene size* even when one point moved, which is the
  full-scene recompute. The exponent is right; the problem is that it should be
  near zero. Task 0.3 is what takes it there.
- **Three budgets are already missed at 500 objects**, before any feature in
  this plan is added: the chain drag by 1.3x, the fan-out drag by 7.3x, and the
  delta round trip by 11x.
- **`delta-roundtrip-500` at 5.53 ms against a 0.5 ms budget is the surprise.**
  Adding one point to a 500-point scene should be near-free. It is not, because
  of the three full-snapshot traversals of finding P5 - which makes task 0.5,
  originally scoped as tidying, worth more than its position in the list
  suggests.
- **Allocation churn is roughly 1-1.7 MB per single operation** across every
  edit path, against a budget of 2 MB per *second* of dragging. At 60 fps that
  is about fifty times the budget.

Churn is reported but never gated: it is measured without collecting, so a GC
firing mid-loop reads low. It can produce a false pass, never a false failure.

## 2b. Per-delta profile

Measured on a 500-point 3D scene while implementing task 0.5, because the task
was scoped from a budget miss rather than from a profile. Stages inside
`reduceOwnedGeometryLabDelta`, which totalled 2.55 ms of a 3.12 ms
`applyDelta`:

| Stage | Cost | Share | Notes |
| --- | --: | --: | --- |
| `getGeometryLabInvariantIssues` | 0.98 ms | 38% | Full cross-record integrity scan. **2.3x cheaper after task 0.9** |
| `assertSnapshotComplexity` x2 | 0.77 ms | 30% | One removed by task 0.5 |
| `validateGeometryLabSnapshotStrict` | 0.32 ms | 12% | Full shape validation. Still untouched |
| `canonicalizeGeometryLabSnapshot` | 0.32 ms | 12% | Includes the 2D recompute |
| `diffGeometryLabHistory` | 0.06 ms | 2% | |

Task 0.9 profiled one level deeper and found 88% of the integrity scan was the
dependency graph build, not the per-record checks the task had assumed - which
is why it was solved by building fewer indexes rather than by making a safety
check incremental.

Every one of these is a full pass over the whole snapshot, run on every edit, to
check things that only changed locally. That is finding P5, and it is larger
than P5 was written to be: not three traversals but five, and the most expensive
is the integrity scan rather than the complexity assertion task 0.5 removed.

The consequence for the plan is task 0.9 below. The integrity scan is a safety
check, so making it incremental is not a free win - it is the difference between
catching a dangling reference and shipping one - which is why it is scoped as
its own task with its own equivalence testing rather than folded into 0.5.

## 3. Budgets

Adopted targets. Phase 0.1 turns them into asserted gates.

| Budget | Target | Rationale |
| --- | --- | --- |
| Model update per drag frame, 500-object scene | ≤ 4 ms | Leaves ~12 ms of a 16.7 ms frame for render |
| Steady-state allocation, 1 s continuous drag | ≤ 2 MB | Keeps young-generation GC out of the drag |
| Invariant computation, 200 points | ≤ 8 ms | Allows an idle-time recheck without a visible stall |
| Conjecture sampling, 16 perturbations | ≤ 120 ms | Off the interaction path, inside one idle slice |
| Snapshot heap, per object average | ≤ 2 KB | 5,000 objects stays under ~10 MB |
| History total | ≤ 8 MB for 100 entries | Down from the current 32 MiB ceiling |
| Delta round trip, single point move | ≤ 0.5 ms | Collaboration echo must not compound with drag cost |

Measure on a mid-range 2020 laptop equivalent, not the dev machine. Gate on
ratio against a committed baseline with tolerance, never on absolute wall-clock,
or CI will flake.

## Phase 0 - performance foundation

Prerequisite for everything else: Phases 1-4 all add work to the same hot paths,
and landing them on today's O(N²) edit would make the tool slower with every
feature. Nothing here is user-visible.

- [x] **0.1 Benchmark harness.** `scripts/geometry-lab-bench.mjs` (harness and
  CLI), `tests/geometry-lab/benchmark.test.mjs` (gate),
  `benchmarks/geometry-lab-baseline.json` (committed baseline). Wired into
  `test:ci` and `test:geometry-lab`, both now running under `--expose-gc`.
  See [Section 2a](#2a-measured-baseline) for what it measured.
- [x] **0.2 Dependency graph.** Edge insertion was `includes` followed by
  `[...existing, id]` - O(d) time and a fresh array per edge, so O(d²) on a
  heavily depended-on object, which is exactly what a dragged control point is.
  It now pushes, and the dedup scan was redundant anyway since an object's
  dependency list is already unique and each id is visited once (P3). The
  traversal uses an index cursor instead of `queue.shift()` (P4). Graphs are
  cached in a `WeakMap` keyed by the scene's own identity, so a cache entry can
  never outlive the scene it describes; the public
  `buildGeometryDependencyGraph` still returns a fresh graph, because the
  instrument hands it straight to hosts that may mutate it.

  **Result**, worst on the quadratic shape: `buildGeometryDependencyGraph` on a
  1,600-dependent hub 2.95 ms → 0.49 ms (6.1x), and the growth across 400 →
  1,600 dependents falls from 7.5x to 2.3x. `geometryDependentsOf` 11x-54x.
  `summarizeGeometryObjects` on 2,000 objects 0.75 ms → 0.35 ms (2.2x), which
  is the object panel. Graph, traversals and summaries verified identical to
  the previous build, including raw ordering.

- [ ] **0.3 Scoped recompute.** *Not done - measurement says do not.* The task
  was to call `recomputeGeometryDependents` instead of `recomputeGeometryScene`
  in canonicalization. Measured both ways on a fresh scene per call, as a real
  drag has, **after** 0.2 had made the graph cheaper:

  | Scene | Full | Scoped | |
  | --- | --: | --: | --- |
  | chain 500 | 0.28 ms | 0.37 ms | 1.35x slower |
  | chain 2,000 | 0.85 ms | 1.19 ms | 1.40x slower |
  | fan-out 500 | 0.38 ms | 0.81 ms | 2.13x slower |
  | fan-out 2,000 | 1.19 ms | 2.21 ms | 1.85x slower |

  Scoping costs more than it saves: building the reverse index calls
  `geometryObjectDependencies` for every object and allocates an array per
  object, while the full recompute's per-object cost for the common case - an
  object with no `construction` - is a property read and an early return. Paying
  O(V+E) with allocation to avoid O(N) without it is a bad trade at every size
  tested.

  It could only pay if the graph were maintained incrementally across deltas
  rather than rebuilt per scene, and even then the ceiling is the full
  recompute's 0.28-0.85 ms out of a ~4.8 ms drag, so 6-16%. Task 0.9 is worth
  more than that and carries less risk, since a stale dependency graph produces
  wrong geometry silently. **Revisit only after 0.9, and only with incremental
  graph maintenance.**

  This also corrects finding P1: the full-scene recompute is not what makes a
  drag scale with scene size. At 500 objects it is 0.12 ms of a 4.8 ms drag.
  The O(N) growth comes from the per-delta whole-snapshot passes in
  [Section 2b](#2b-per-delta-profile).
- [x] **0.4 Mutable staging buffer.** The recompute walk now carries one draft
  that holds the caller's scene until the first real write, then takes a single
  shallow copy and mutates that (P2). Two properties are preserved and tested: a
  pass that changes nothing returns the identical object, and the input scene is
  never mutated - undo, history and collaboration all depend on old snapshots
  staying as they were. **Result:** `drag-fanout-400` 29.19 ms → 7.49 ms
  (3.9x), and its growth exponent 1.76 → 0.97, which meets the 1.1 target. The
  quadratic is gone. Chain-drag allocation halved, 1.40 → 0.71 MB per drag.
  Verified byte-identical against the previous build across every construction
  kind, six drags and two degenerate configurations.
- [x] **0.5 Trust the owned path.** The owned path now skips the
  pre-canonicalization complexity traversal: its input is a bounded snapshot
  plus a bounded delta, so the result is within a constant factor of the limit
  and the post-canonicalization assertion still holds the real bound (P5).
  **Result:** `delta-roundtrip-500` 5.48 ms → 4.57 ms, 17%. Tests cover the
  property traded against - a scene still cannot grow past its cap one bounded
  delta at a time, and an untrusted snapshot arriving from outside is still
  fully checked on load.

  **Correction.** When 2a was written this was called one of the two largest
  wins in the phase, reasoning from the 11x budget miss rather than from a
  profile. Profiling the path shows the assertion was never the bulk of it -
  see [Section 2b](#2b-per-delta-profile). It is a real 17%, not a
  transformation, and the delta path is still 9x over budget.
- [ ] **0.6 Structural-sharing reads.** The reducer is already copy-on-write, so
  `getSnapshot()` can return a frozen reference instead of a deep clone (P6).
  Keep the cloning variant available as `getSnapshotCopy()` for hosts that
  mutate what they receive.
- [ ] **0.7 Packed mesh storage.** Move `SurfaceEntity3D.vertices`,
  `CurveEntity3D.points` and solid mesh points to `Float64Array` behind an
  accessor, with JSON serialization unchanged so persisted snapshots keep their
  current shape (P8). Do this before Phase 1.4 adds mesh regeneration.
- [ ] **0.8 History budget.** Lower `maxHistoryEntryBytes` and `maxHistoryBytes`
  toward the Section 3 targets, and store patches structurally rather than as
  serialized JSON where the diff is small (P7).
- [x] **0.9 Cheaper integrity checking.** *Added after the task 0.5 profile, and
  solved differently from how it was scoped.*

  The task assumed per-record reference checking was the expensive part, and
  proposed scoping it to the records a delta touched - accepting that deletes
  would still need a full pass, and that a safety check made incremental can
  fail silently. Profiling first showed the premise was wrong: **88% of
  `getGeometryLabInvariantIssues` was `buildGeometryLabDependencyGraph`**, and
  the per-record checks were 0.25 ms of 2.0 ms. So none of that risk was
  necessary.

  What the scan actually needs from the graph is three things: node paths for
  issue messages, forward adjacency for cycle detection, and ownership
  conflicts. The full graph materialises twelve indexes - six adjacency records
  with an array per node, two sorted edge lists, two id-keyed views - and the
  scan reads none of the other nine. `buildGeometryLabIntegrityView` builds only
  those three, from the same population code as the full graph so the two cannot
  drift. Two further fixes: `finish()` sorted the same key list six times per
  graph and now sorts once, the edge comparators compare field by field instead
  of building two strings per comparison, and `geometryLabDependencyKey` skips
  `encodeURIComponent` for ids that would come back unchanged.

  **The scan is still a full pass over every record. Nothing was made
  incremental, so there is no staleness risk and no class of corruption that can
  now slip through.**

  **Result:** `getGeometryLabInvariantIssues` 2.3x across all sizes (2.02 ms →
  0.88 ms at 500 objects, 9.05 → 3.89 at 2,000). The full graph build is 1.4x
  faster too, which delete planning and the object panel also get.
  `drag-chain-500` 4.80 ms → 3.71 ms, **the first edit path inside its budget**;
  `delta-roundtrip-500` 4.57 → 3.20 ms.

  Verified by dumping the full graph, every invariant issue and twelve cascade
  plans per scene across 13 scenes - 11 of them deliberately corrupt, one per
  class the scan detects - and diffing against the previous build: identical.
  The key fast path was checked exhaustively against `encodeURIComponent` over
  24,588 ids. Tests assert both halves: the lean view agrees with the full graph
  on valid *and* corrupt scenes, and every corruption class is still reported -
  the half a happy-path corpus would never establish, since a scan that stops
  reporting looks exactly like a clean scene.

  Not done, and left for later: `validateGeometryLabSnapshotStrict` is 0.32 ms
  of a delta and untouched.

Exit criteria: benchmark gate green in CI; single-point drag on a 500-object
scene inside the 4 ms and 2 MB budgets; `scale-drag-chain` at or below 0.2 and
`scale-drag-fanout` at or below 1.1.

Working with the harness:

```
npm run bench:geometry-lab          # measure and report
npm run bench:geometry-lab:check    # compare against the committed baseline
npm run bench:geometry-lab:update   # re-record the baseline after a real change
```

The gate also runs as part of `test:geometry-lab` and `test:ci`. It compares
normalized time rather than milliseconds, so a slower runner is not a
regression; retained heap is compared directly but only above 1 MB, below which
collector placement moves the figure more than the tolerance does. Re-record the
baseline in the same commit as any change that legitimately moves it, and say in
the commit message which numbers moved and why. `KLEIN_SKIP_BENCH=1` skips the
gate without skipping the harness's own tests.

## Phase 1 - make 3D dynamic

The correctness fix. Depends on Phase 0.2-0.4, because it multiplies the number
of derived objects on the recompute path.

- [ ] **1.1 3D construction kinds.** Extend `GeometryConstruction`
  (`geometry-core/index.ts:7`) with `linePlaneIntersection`,
  `planePlaneIntersection`, `crossSection`, `solidVertex`,
  `perpendicularFromPoint`, and the 3D forms of `midpoint` and `intersection`.
- [ ] **1.2 3D recompute.** Add the 3D counterpart of `recomputeGeometryObject`,
  running through the same scoped and incremental machinery from Phase 0, so 3D
  gets the optimized path from day one rather than a second slow implementation.
- [ ] **1.3 Migration.** Existing baked snapshots load unchanged: a point with no
  `construction` stays free. No breaking change, no migration script. Record a
  `constructionVersion` marker so the client can offer "relink this figure".
- [ ] **1.4 Lazy mesh regeneration.** Cross-sections and solids keep baked
  meshes, but store their generator parameters and a dirty flag; regenerate on
  read, not on every delta. A dragged plane with three dependent cross-sections
  must stay inside the drag budget, which means the regeneration cannot be
  synchronous per frame for large meshes - debounce to the frame boundary and
  render the previous mesh until the new one is ready.
- [ ] **1.5 Cascade correctness.** `planGeometryLabCascadeDeletion`
  (`dependencies.ts:268`) already models delete policies; extend it to the new
  construction edges so deleting a plane does the right thing to everything
  derived from it.
- [ ] **1.6 Perf gate.** Add a benchmark case: drag a work plane with ten
  dependents, assert the drag budget.

Exit criteria: moving a source object updates every derived 3D object; no baked
value is ever displayed as if it were live.

## Phase 2 - close the 2D gap

- [ ] **2.1 Share, do not duplicate.** The Lab's `scene2d` is already a
  `GeometryScene`. Extract the construction operations in `src/geometry` into
  pure functions over `GeometryScene` in `geometry-core`, and have both the
  Calculator and the Lab call them. Avoids a second implementation and a second
  set of bugs. This is a refactor with no behaviour change and should land
  behind the existing Calculator tests.
- [ ] **2.2 Semantic 2D deltas and Lab methods** for every tool
  `GeometryLabTool` already declares.
- [ ] **2.3 2D renderer.** `renderGeometryLabSvg3D` (`renderers.ts:101`) reads
  only `scene3d`; the 2D scene is never rendered or exported. Add the 2D
  renderer and include both in export, respecting `maxExportPrimitives`.
- [ ] **2.4 2D measurements.** Add a `Measurement2D` record mirroring
  `Measurement3D`: length, angle, area, perimeter, distance.
- [ ] **2.5 Missing 3D measurements.** `MeasurementSource3D` covers four cases.
  Add angle between lines, line-plane angle, point-line distance, skew-line
  distance and 3D segment length.

## Phase 3 - transformations and constraints

- [ ] **3.1 Transformation deltas.** `reflect`, `rotate`, `translate`, `dilate`,
  in 2D and 3D, with a `transform` construction kind so images stay live under
  the Phase 1 recompute. The tools `scale`, `rotate`, `stamp` and `cut` are
  already declared in `GeometryLabTool` with no implementation behind them, and
  `GEOMETRY_LAB_EXERCISES.md` already asks students to mirror a figure by hand.
- [ ] **3.2 Constraint solving.** `GeometryConstraint` is modelled in
  `geometry-core`, `enforceGeometryConstraint` exists at
  `src/geometry/index.ts:6348`, the Lab persists and validates
  `scene2d.constraints`, and nothing solves them. Wire the existing local
  enforcement in. **Cap iterations per frame** and report non-convergence
  rather than spinning - an uncapped relaxation loop is the classic way a
  geometry tool drops frames.
- [ ] **3.3 Perf gate.** Benchmark a twenty-constraint figure under drag.

## Phase 4 - the learning layer

Highest pedagogical return per unit of work, and 4.1 is the smallest diff in
this document.

- [ ] **4.1 Goal checking.** `checkGeometryGoal(snapshot, targetInvariants)`
  returning `{ satisfied, missing, extra }`. This one function turns the
  existing invariant reporter from a marker into a tutor: "you were asked for a
  perpendicular bisector; you have `equal-segments:AM,MB` but not
  `perpendicular:AB,l`". Expose it on `GeometryLab` and consume it in
  `src/assessment`, which today has no geometry-specific scoring at all.
- [ ] **4.2 Construction protocol.** A numbered, labelled, replayable step list
  built from the `construction` provenance already in the model. `history.ts`
  stores compare-and-set JSON patches for undo and collaboration, and
  `getHistoryEntries()` in the Calculator (`src/geometry/index.ts:1422`) returns
  strings like "Previous version (3)" - neither is a construction protocol. This
  is what lets a teacher see *how* a student built the figure, and what turns a
  drawing into a proof artifact. Derived, not stored, so it costs no snapshot
  memory.
- [ ] **4.3 Invariant vocabulary - algorithmically, not by adding loops.**
  Missing today: concyclic, tangency, congruent and similar triangles, equal
  angles, incidence, ratio, area equality, and every 3D relation (coplanar,
  skew, perpendicular-to-plane, inscribed). Adding these to the current O(P³)
  structure is not affordable (P9). Replace the nested scans with **canonical
  bucketing**: quantize each measured quantity - length, direction, angle - into
  hash buckets sized by the relative tolerance, then compare only within a
  bucket and its neighbours. Equal-segments drops from O(S²) toward O(S), and
  `MAX_POINTS` can rise from 24 into the low hundreds inside budget. The
  neighbour check is not optional: quantizing at tolerance ε without it misses
  every pair that straddles a bucket boundary.
- [ ] **4.4 Conjecture detection.** Perturb the free points k times, recompute,
  and keep only the invariants that survive every sample. This is what separates
  "true by construction" from "true because the student dragged it there", which
  the current single-configuration check cannot distinguish - the module's own
  documentation is candid that tolerance is the hard part. Depends on 4.3 being
  sub-cubic. Run off the interaction path, in an idle callback or a worker,
  never per frame.
- [ ] **4.5 Machine-readable exercises.** `GEOMETRY_LAB_EXERCISES.md` is good
  content in a dead format: not machine-readable, not tagged to standards, not
  linked to invariants, no hint ladder, no mastery sequencing, no attempt
  tracking. Define an exercise as a typed object - target invariant set, allowed
  tools, hint ladder, rubric - and migrate the bank into it.
- [ ] **4.6 Hint ladder.** Built on 4.1 and 4.5: from "check the distance from M
  to each end" up to "use the compass tool on A".

## Phase 5 - accessibility and output

School deployment makes this a compliance question as well as a pedagogical one,
and a good textual description of a figure is transformative for exactly the
students who currently get nothing.

- [ ] **5.1 Structured SVG semantics.** Today there is one generic
  `aria-label="Klein 3D calculator scene"` (`renderers.ts:213`). Add per-object
  `<title>` and `<desc>`, roles, and a deterministic focus order.
- [ ] **5.2 A real text export.** `geometryLabSummaryText`
  (`instrument.ts:1611`) returns an object census - `points: 7, entities: 4`.
  Replace it with a description of the figure: named objects, their relations,
  and their measurements. Reuse the Phase 4.2 protocol and the 4.3 invariants,
  so this costs little once those exist.
- [ ] **5.3 Keyboard construction path.** Every tool reachable without a
  pointer.
- [ ] **5.4 Export formats.** PNG and PDF (PNG is already flagged unchecked in
  `GEOGEBRA_V0_SDK_IMPLEMENTATION_PLAN.md`), LaTeX for labels and measurements
  via the existing `formatMathNode(node, 'latex')`.
- [ ] **5.5 Interaction layer decision.** `mount()` sets `innerHTML` to static
  SVG (`instrument.ts:1424`) and registers no event listeners: no hit testing,
  no snapping, no drag. The working Lab exists only inside klein-client.
  Decide explicitly whether the SDK ships an interaction layer - without one it
  cannot be embedded by a third party as a usable tool. If yes, hit testing must
  be spatially indexed, not a linear scan per pointer move.

## Phase 6 - mathematical depth

- [ ] **6.1 Sliders, trace, dynamic locus.** `slider` appears exactly once in
  the entire codebase - as an enum member at `src/geometry/index.ts:184`.
  `addLocus` takes a static `Vector2[]`, not a driver point. These gate most of
  conics, envelopes and optimisation. **Memory:** a trace is unbounded by
  nature; use a fixed-capacity ring buffer (2,048 points) over a packed typed
  array, never an append-forever list.
- [ ] **6.2 Exact arithmetic for measurements.** `src/math` parses, formats and
  evaluates; there is no simplification, no symbolic differentiation, no
  solving. Every measurement is a float, so the tool can say `4.4721` but never
  `2√5`. A narrow exact-value layer for surds and rationals covers most school
  geometry without a full CAS, and it lifts the ceiling on what any feedback can
  say.
- [ ] **6.3 Multi-representation linking.** `spreadsheet`, `graphing` and
  `geometry-lab` are separate instruments with no binding: a cell cannot track
  segment AB as it is dragged. Build push-based on the existing delta bus, never
  polling.
- [ ] **6.4 Implicit surfaces in the SDK.** Marching cubes honouring
  `maxSamplerProbeEvaluations`. Currently unchecked in the v0 plan and present
  only in the client.
- [ ] **6.5 Net folding animation.** `GeometrySceneLink` already declares a
  `netToSolid` kind with nothing animating it, and the fold is the moment nets
  actually make sense to a student.

## 11. New complexity limits

The codebase's discipline is that everything is bounded
(`GeometryLabComplexityLimits`, `complexity.ts:18`). These additions keep the new
work inside it. Note that `MAX_POINTS` and `MAX_INVARIANTS` currently live as
module constants in `gradable-invariants.ts` rather than in the limits object,
so hosts cannot tune them.

| Limit | Covers |
| --- | --- |
| `maxPoints2D`, `maxEntities2D` | Phase 2; only `maxPointRecords` and `maxEntities3D` exist today |
| `maxConstraints`, `maxSolverIterationsPerFrame` | Phase 3.2 - the frame-drop guard |
| `maxInvariantPoints`, `maxInvariantSegments`, `maxInvariantsReported` | Phase 4.3; migrate the existing module constants here |
| `maxConjectureSamples` | Phase 4.4 |
| `maxTracePoints`, `maxSliderSamples` | Phase 6.1 |
| `maxConstructionProtocolSteps` | Phase 4.2 |
| `maxTransformChainDepth` | Phase 3.1 - bounds recompute depth on chained images |
| `maxRecomputeNodes` | Phases 0.3 and 1.2 - bounds one recompute pass |

## 12. Sequencing and risk

**Order.** Phase 0 first and alone; it is the only phase whose value is entirely
in what comes after it. Then Phase 1, because a tool that displays false figures
should not gain features first. Phase 2 and Phase 4.1 can run in parallel - they
touch different files, and 4.1 is small enough to land inside another phase's
cycle. Phases 3, 5 and 6 are schedulable against product priority.

**If only five things get done:** 0.1 benchmark gate, 0.4 mutable staging
buffer, 1.1-1.2 3D constructions, 4.1 goal checking, 4.2 construction protocol.
That set fixes the correctness hole, removes the quadratic edit, and turns the
existing invariant work into a tutor.

**Risks.**

- *Phase 2.1 refactor scope.* Extracting the Calculator's construction API into
  shared functions touches a 9,000-line file. Mitigation: pure extraction with
  no behaviour change, landed behind existing Calculator tests before any Lab
  code calls it.
- *Phase 0.6 frozen snapshots.* Returning a shared reference instead of a clone
  is a semantic change for any host that mutates what `getSnapshot()` returns.
  Mitigation: freeze in development builds so violations fail loudly, and keep
  `getSnapshotCopy()`.
- *Phase 4.3 bucketing tolerance.* Bucketed comparison at tolerance ε silently
  misses boundary-straddling pairs without neighbour checks. Mitigation: keep
  the existing brute-force implementation as a test oracle and assert the two
  agree on every fixture.
- *Phase 1.4 mesh regeneration under drag.* Regenerating a large cross-section
  mesh synchronously will blow the frame budget. Mitigation: debounce to the
  frame boundary, render the previous mesh meanwhile, and gate it in the
  benchmark.
- *Benchmark flake.* Absolute wall-clock assertions in CI will flake.
  Mitigation: ratio against a committed baseline with tolerance, and treat heap
  deltas as the primary signal since they are far more stable than timings.
