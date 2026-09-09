# Geometry Lab Plan

Last updated: 2026-09-07

Goal: take `klein-sdk/geometry-lab` from a serializable scene model with a static
renderer to a state-of-the-art dynamic geometry and learning tool, without
regressing time or memory on the interaction path.

Status legend: `[ ]` not started, `[~]` in progress, `[x]` done.

## Progress

| Phase | Done | Tasks | Notes |
| --- | --: | --: | --- |
| 0 - Performance foundation | 10 | 12 | **Complete.** 0.3 and 0.7 closed on evidence as not worth doing; 0.12 added and landed |
| 1 - Make 3D dynamic | 6 | 6 | Complete. Intersections and cross-sections are live; cascade verified |
| 2 - Close the 2D gap | 5 | 5 | Complete |
| 3 - Transformations and constraints | 3 | 3 | **Complete.** Transformations are live constructions; constraints are enforced |
| 4 - The learning layer | 7 | 7 | Complete |
| 5 - Accessibility and output | 2 | 5 | 5.1 and 5.2 landed; 5.5 is a scope decision, not an implementation |
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

**The 3D scene is not dynamic geometry.** `addLinePlaneIntersection` computed a
point and stored it as a free `GeometryPoint3D`; move the plane and the
"intersection" stayed where it was. Not a missing feature - a figure that
silently becomes false, which in a teaching tool is worse than an error.

**Fixed by Phase 1.** Line-plane and plane-plane intersections follow their
sources; a construction whose sources move into a degenerate arrangement fails
the edit rather than leaving a stale position; and cross-sections may now change
shape as their plane travels through a solid instead of rejecting the edit.

Two things the original wording got wrong, both found by measuring rather than
reading. 3D midpoints always did recompute, so the gap was narrower than stated.
And cross-sections were never baked either - they recut on every commit, and
what blocked them was an identity rule, not staleness.

**The Lab has no 2D API.** Every method on the instrument was 3D, while
`GeometryLabTool` declared `point`, `segment`, `polygon`, `circle`, `angle`,
`midpoint`, `perpendicular`, `parallel` and `bisector`. A host could only
hand-build raw deltas - and had to write the `construction` metadata itself, or
the result would not follow its sources.

**Fixed.** Task 2.2 gave the Lab fourteen construction methods on shared
builders in geometry-core, so it and the Calculator cannot drift about what a
construction means; task 2.3 gave 2D scenes a renderer and an export; task 2.4
gave them measurements; task 2.1 finished by migrating the Calculator onto the
same builders, so there is now one implementation of each construction.

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

`getSnapshot()` deep-clones the whole snapshot - 0.51 ms on a 500-point scene,
11.86 ms and 6.6 MB on a four-surface one. Any host reading state per frame paid
a full copy per frame.

**Addressed by task 0.6** with `peekSnapshot()`. `getSnapshot()` keeps its
tested isolation contract, so the fast path is opt-in rather than a swap.

### P7. History entries sized for the worst case

`maxHistoryEntries: 100`, `maxHistoryEntryBytes: 16 MiB`,
`maxHistoryBytes: 32 MiB` (`complexity.ts:67`). A single entry may be 16 MiB,
and entries are serialized JSON patches.

### P11. Per-edit cost scales with mesh size

Moving one unrelated point in a four-surface scene cost 28.7 ms, 62% of it the
generic untrusted-input JSON walk inside the complexity assertion. This is the
finding P8 was reaching for, and it is much larger than the storage format.

**Closed by tasks 0.10 and 0.11.** 0.10 took the complexity scan from 17.9 ms to
0.32 ms and schema validation from 7.0 ms to 0.01 ms; 0.11 found that the
surface entity objects are rebuilt on every delta while their mesh arrays are
reattached by reference, and moved the remaining caches onto the arrays. The
edit is now **0.78 ms, down from 28.7 ms - 37x** - and inside budget. The
benchmark carries `drag-mesh-4-surfaces`, so this can no longer hide.

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
  recompute's 0.28-0.85 ms out of a drag, so a small share of it.

  **Re-measured after 0.9, 0.10, 0.11 and 0.12, and closed.** The per-delta
  overhead those tasks removed was large enough that scoping might have started
  to pay; it does not. Scoped is still 1.37x-2.10x slower at every size tested,
  because the cost is intrinsic: building the reverse index calls
  `geometryObjectDependencies` for every object and allocates per object, while
  the full walk's per-object cost for the common case is a property read and an
  early return. **Not doing this.**

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
- [x] **0.6 Structural-sharing reads.** Added `peekSnapshot()`, which returns the
  instrument's own snapshot instead of copying it (P6). Its containers are
  frozen, so a caller writing into one throws rather than silently corrupting
  instrument state; freezing is shallow because deep-freezing a four-surface
  scene costs 30 ms, which would defeat the point.

  **Done additively, not as the swap the task described.** The task was to
  change `getSnapshot()` itself. That turned out to break a deliberately tested
  contract - `phase3-boundaries` asserts that what `getSnapshot` returns can be
  written into freely without affecting the instrument - and six tests failed.
  The contract is worth keeping, so `getSnapshot()` is unchanged and the fast
  path is opt-in.

  **Result:** `peekSnapshot()` is effectively free where `getSnapshot()` is
  0.51 ms on a 500-point scene and **11.86 ms and 6.6 MB on a four-surface
  scene** - a cost every host redrawing from state was paying per frame, for
  isolation it never used.
- [x] **0.12 Canonicalization shares records instead of deep-copying them.**
  *Found while closing the phase.* Canonicalization built its working copy with
  `JSON.parse(JSON.stringify(...))`, so every point, entity and plane was a new
  object on every edit. That defeated the identity caches from tasks 0.10 and
  0.11 for everything except mesh arrays: each edit re-validated and re-scanned
  an entire scene that had not changed.

  Owned callers now get a *structural* copy - record containers copied, record
  objects shared. Canonicalization never writes into a record, it replaces one,
  so sharing is safe; the two places that did write in place (a work plane's
  resolved `through` origin, and legacy edge-id migration on selections) now own
  what they write. The strip-clone-reattach dance that preserved meshes is gone
  too: sharing an entity keeps its mesh for free. Untrusted input still takes
  the JSON round trip, where the copy is a boundary rather than an optimisation.

  | Case | Before | After |
  | --- | --: | --: |
  | `drag-chain-500` | 3.64 ms | **2.44 ms** |
  | `drag-fanout-400` | 5.50 ms | 4.70 ms |
  | `drag-mesh-4-surfaces` | 0.78 ms | **0.39 ms** |
  | `delta-roundtrip-500` | 3.56 ms | 2.33 ms |
  | `snapshot-read-500` | 0.49 ms | 0.39 ms |

  Verified against all three differential corpora - 169 graph/invariant/cascade
  records, 29 schema validations, 58 complexity scans - identical in each, plus
  tests that a held snapshot is untouched by later edits and that undo still
  restores exactly.

- [ ] **0.7 Packed mesh storage.** Move `SurfaceEntity3D.vertices`,
  `CurveEntity3D.points` and solid mesh points to `Float64Array` behind an
  accessor, with JSON serialization unchanged so persisted snapshots keep their
  current shape (P8). Do this before Phase 1.4 adds mesh regeneration.
- [x] **0.8 History budget.** `maxHistoryEntryBytes` 16 MiB → 4 MiB,
  `maxHistoryBytes` 32 MiB → 8 MiB (P7), sized against measurement rather than
  round numbers: the largest single entry the instrument can produce is a
  sampled surface at the per-axis cap, **1.51 MB**, so the old per-entry cap was
  ten times beyond anything reachable and 4 MiB keeps every reachable edit
  undoable. 100 drag steps on a 61-point scene total 42 KB, so 8 MiB holds
  roughly 19,000 ordinary edits. The trade is explicit: mesh-heavy sessions keep
  a shallower undo stack than at 32 MiB.

  The "store patches structurally" half was already true - `changes` are
  structured objects, and only the size accounting serialized.

  **A failed optimisation, recorded because the number is counter-intuitive.**
  `new TextEncoder().encode(json).byteLength` allocates a full 1.5 MB buffer to
  read a length, so counting bytes in a loop looked free. It is **17x slower**
  (2.41 ms against 0.14 ms): the native encoder beats a per-character JavaScript
  loop over 1.5 million characters by far more than the allocation costs. The
  loop was reverted. Hoisting the encoder to module scope was the part worth
  keeping, and is a real 10% on entry creation.

- [ ] **0.7 Packed mesh storage.** *Blocked as written - needs re-scoping.*
  `SurfaceEntity3D.vertices` as `Vector3[]` costs 56 B/vertex against 24 for a
  packed `Float64Array`, and `faces: number[][]` costs 88 B/face against 16 for
  a `Uint32Array`. The win is real, but "behind an accessor, with JSON
  serialization unchanged" is not achievable locally, because the snapshot's
  JSON-serializability is load-bearing in five places:

  - Five internal deep clones use `JSON.parse(JSON.stringify(...))`
    (`canonicalize.ts` x2, `history.ts`, `reducer.ts` x2). A typed array comes
    back as `{"0":1,"1":2,…}`, silently corrupting the mesh.
  - `Array.isArray` gates in `schema.ts` and `complexity.ts` are false for typed
    arrays.
  - JSON export, persisted files and collaboration deltas all carry the current
    `[{x,y,z},…]` shape, so changing it is a format migration for every saved
    scene and every peer.

  Doing it properly means a typed-array-aware clone, a serializer pair at the
  JSON boundary, validators taught both representations, and a migration - a
  change to the persistence and collaboration contracts, not an optimisation.

  **Closed as not worth it, on evidence.** The reason to want packed meshes was
  per-edit cost, and tasks 0.10, 0.11 and 0.12 removed that by other means:
  `drag-mesh-4-surfaces` went 28.7 ms → **0.39 ms** without touching the storage
  format. What remains is resident scene size - roughly 5 MB against 1.4 MB for
  four surfaces - which no measured budget is missing. Reopen it if resident
  memory ever becomes the constraint; do not reopen it for speed.

- [x] **0.10 Stop rescanning meshes on every edit.** Two caches, both keyed by
  object identity, both remembering only *clean* results so every failure is
  still reported at exactly the path and in exactly the order it was before.

  - `scanUnknownJson` in `complexity.ts` memoizes any subtree of 64 nodes or
    more that scanned cleanly. Reuse requires the same limits profile, and the
    cached totals must still fit inside every running limit - otherwise the
    subtree is re-walked so the issue lands at the right path. To make profile
    comparison an identity check, `resolveGeometryLabComplexityLimits` now
    returns the same resolved object for the same overrides object.
  - `recordMap` in `schema.ts` memoizes records that passed a given validator.
    One change covers points, entities, work planes, measurements and nets in
    both scenes. The id-versus-key check stays outside the cache, because it
    depends on where a record is filed rather than on the record.

  **Result**, on a four-surface scene (36,864 vertices):

  | Stage | Before | After |
  | --- | --: | --: |
  | `assertGeometryLabSnapshotComplexity` | 17.88 ms | 0.32 ms |
  | `validateGeometryLabSnapshotStrict` | 7.02 ms | 0.01 ms |
  | `getGeometryLabInvariantIssues` | 3.15 ms | 3.18 ms |
  | whole `applyDelta` | 28.7 ms | 10.6 ms |

  Verified against the previous build over two corpora: 58 complexity scans
  covering repeat scans, eleven limit profiles interleaved with the default, a
  shared limits object, shared subtrees, cycles and deep/wide/long violations
  (462 limit hits in total); and 29 schema validations covering valid records,
  every corruption class, differing issue budgets, and one record object filed
  under both a matching and a mismatching key. Identical in both.

  **The benchmark had no mesh case, which is why none of this was visible.**
  Added `drag-mesh-4-surfaces` and `snapshot-read-mesh`, so this class of cost
  is now gated rather than discovered by accident.

  **Not finished.** `applyDelta` on that scene is 10.6 ms against a 4 ms budget,
  and the named stages now account for only 3.5 ms of it. The remaining ~7 ms is
  in the instrument wrapper, is not history (measured with history disabled: no
  change), and needs its own profile. Tracked as task 0.11.

- [x] **0.11 Cache mesh checks on the arrays, not the entities.** Profiled
  first, and the profile named something none of the guesses had: **the surface
  entity objects are rebuilt on every delta**, so all three of task 0.10's
  identity caches missed on them.

  `cloneSnapshot(snapshot, reuseSurfaceMeshCaches: true)` in `canonicalize.ts`
  strips the meshes, JSON-clones what is left, and reattaches the original
  vertex and face arrays by reference. The arrays survive an edit; the entity
  objects holding them do not. So an entity-keyed cache can never hit, while an
  array-keyed one always does - and the arrays are the only part big enough to
  matter.

  Three caches moved onto the arrays: `vector3Array` and `faceIndexArray` in
  `schema.ts`, and the vertex and face walks in `checkSurface`
  (`invariants.ts`). The face cache additionally records the vertex count it was
  cleared against, because the out-of-bounds check depends on it - the same face
  array against a shorter vertex array is a different question, and is
  re-checked. There is a test for exactly that.

  **Result:** `drag-mesh-4-surfaces` **10.6 ms → 0.78 ms**, and inside its 4 ms
  budget. End to end that case is 28.7 ms → 0.78 ms, **37x**.

  Verified against the previous build over both corpora - 29 schema validations
  and 169 graph, invariant and cascade records across 13 scenes, 11 of them
  deliberately corrupt - identical in both.

  One thing this did not do: `snapshot-read-mesh` is 11.6 ms, which is
  `getSnapshot()` deep-cloning by design. `peekSnapshot()` from task 0.6 is the
  answer for hosts that only read, and the case is kept in the benchmark to keep
  the cost of the isolation contract visible.
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

- [x] **1.1 3D construction kinds.** Added `linePlaneIntersection` and
  `planePlaneIntersection` to `GeometryConstruction`, with their source ids,
  schema validation, dependency edges and labels. A plane-plane intersection is
  modelled as two constructed endpoints (`end: 0 | 1`) spanning the line, so the
  existing `lineThroughPoints` entity between them needed no new machinery.

  **Correction to the verdict.** This plan opened by saying no 3D point carries
  a construction. That was not quite right: 3D **midpoints already recomputed**,
  in topological order with cycle detection, and every other kind was explicitly
  rejected as "not deterministically supported". The machinery existed; what was
  missing is that the instrument never produced anything but midpoints. The rest
  - cross sections, solid vertices, `perpendicularFromPoint` - is still open.
- [x] **1.2 3D recompute.** `canonicalizePointConstructions3D` and
  `canonicalizeWorkPlanes` were two passes, points then planes. That ordering
  only held while the sole 3D construction was a midpoint, which depends on
  points alone. It cannot survive intersections, because the dependency runs
  **both ways** - a work plane can be defined by three points, and a point can
  be defined as where a line meets that plane. Replaced by
  `canonicalizeConstructions3D`, one walk visiting each object after whatever it
  is built from, in either collection, with cycle detection across both kinds.

  Two subtleties the existing tests caught, both worth recording:

  - The stored plane equation is `n . x + d = 0`, so the plane sits at
    `n . x = -d`. Getting that backwards put intersections on the wrong side.
  - Tolerances must be **relative**. Conditioning the line-plane test on an
    un-normalized direction called a line whose defining points are a picometre
    apart parallel to everything; conditioning plane-plane on `1 - cos^2`
    rejected planes meeting at a shallow but perfectly well-defined angle. The
    plane-plane formulation now mirrors `geometryPlanePlaneIntersection3D` in
    geometry-core exactly, so canonicalization computes the position the
    instrument computed on creation.
- [x] **1.3 Migration.** No script and no marker needed after all: a point with
  no `construction` is a free point, which is exactly what every previously
  persisted snapshot contains, so old scenes load and behave identically. Tested
  directly. Relinking an old baked figure to its sources stays a client-side
  offer if it is ever wanted; nothing in the format forces it.
- [x] **1.4 Cross-sections may change shape.** *The task's premise was wrong
  twice, and the real defect was elsewhere.*

  It assumed section meshes are baked and need lazy regeneration behind a dirty
  flag. They are not baked - `canonicalizeCrossSections` recuts every section
  from its solid and plane on every commit - and the cost is not a problem:
  `drag-plane-3-cross-sections` measures **1.48 ms** against the 4 ms budget.
  Debouncing would have added a frame of staleness and a dirty-flag protocol to
  fix something that was never slow.

  What actually failed was topology. Each vertex carries a persistent point
  identity, and there was no rule for matching four old identities onto six new
  ones, so any edit that changed the section's shape was **rejected** as
  `cross_section_topology_changed`. That is precisely the classroom activity -
  slide the plane through a cube and watch the square become a hexagon - and it
  was the one thing the model forbade.

  The rule now: keep the identities that still have a vertex, name new ones
  deterministically from the section id, drop the surplus. Deterministic because
  canonicalization must be a pure function of the snapshot - collaborating peers
  replay the same delta and have to agree on the ids. Loop alignment, which
  rotates and reflects the recut loop to match existing identities, still runs
  when the count is unchanged and is skipped when it changes, since there is no
  correspondence left to preserve. A section slid clear of its solid is still
  rejected: a section with nothing to cut is not a section.

      flat cut          4 vertices, area 16
      tilted            4 vertices, area 22.6
      on the diagonal   6 vertices, area 20.8
      flat again        4 vertices, area 16
- [x] **1.5 Cascade correctness.** No new code was needed: cascade reads
  `geometryConstructionSourceIds`, which task 1.1 extended, so the new edges
  were carried the moment the construction kinds existed. Verified rather than
  assumed - deleting a plane removes the sections it cuts and the intersections
  on it while leaving the solid; deleting a source line removes the point
  derived from it; deleting either plane of a plane-plane intersection removes
  the line and both endpoints; deleting a source point cascades through the
  plane to the section; and a section deleted after it grew takes the vertex
  points it acquired with it.
- [x] **1.6 Perf gate.** `drag-plane-10-dependents` drags a plane carrying ten
  line-plane intersections, each of which must be recomputed in dependency order
  inside the commit: **0.41 ms** against the 4 ms budget. The case only became
  measurable once the intersections became real - before Phase 1 they were free
  points that cost nothing to leave wrong.

Exit criteria: moving a source object updates every derived 3D object; no baked
value is ever displayed as if it were live.

## Phase 2 - close the 2D gap

- [x] **2.1 Share, do not duplicate.** *Done. The missing half turned out to
  be smaller than the task assumed.*

  The task read as though the Calculator held the 2D construction mathematics
  and the Lab needed a copy. It does not: `midpoint2D`,
  `geometryCircleTangentPoint2D`, `geometryCircumcircle2D`,
  `lineEquationFrom2DPoints` and the rest already live in geometry-core and are
  already shared. What the Calculator's methods add around them is id
  generation, theme colours, selection, its own delta shape and its own error
  codes - all genuinely local.

  What *was* duplicable is the step in between: turning a construction into the
  records it adds, including the hidden helper point that gives a constructed
  line its direction and the `construction` metadata that makes the result
  follow its sources. That is now a set of pure builders in geometry-core -
  `buildMidpoint2D`, `buildIntersection2D`, `buildConstructedLine2D`,
  `buildAngleBisector2D`, `buildCircleByCenterPoint2D`,
  `buildCircleThroughPoints2D`, `buildLineThroughPoints2D` - which take a scene
  and an id allocator and return records for the caller to commit however it
  commits things.

  Both instruments now use them. The Calculator's `addMidpoint`,
  `addLineByPoints`, `addIntersection`, `addAngleBisectorByPoints`,
  `addCircleByCenterPoint`, `addCircleThroughPoints`, `#addConstructedLine` and
  the interactive line tool all build their records through the shared builders
  and then apply what is genuinely local on top: theme colour on a helper point,
  the fill alpha on a circle, the `circumcenter` record the Calculator keeps on
  a circumcircle's centre, and its own error codes. Net -46 lines, and
  `constructedLineEquation` and `helperPointForLineEquation` are gone.

  Verified by a 113-capture differential over eight construction kinds by six
  style variants, plus multi-result constructions, a chained figure, and drags
  after each. The first version of that harness recorded which refusals threw
  which code but not what happened *afterwards*, which is exactly where moving
  an id allocation behind a validity check would show up - a refusal that used
  to consume an id and no longer does shifts every id after it. Adding a
  freshly created point after each of thirteen refusals closed that hole. Before
  and after are byte-identical across all 113.

  Three sites keep their own construction records, for reasons rather than
  neglect:

  - `addIntersections` solves the intersection once and maps the whole result
    list. `buildIntersection2D` takes one index and re-solves per call, so
    routing through it would solve the same problem once per result.
  - `addLineByCoordinates` creates its two endpoints in the same batch as the
    line. The builders read points from the scene, and these are not in it yet.
  - `addTangentLines` has no builder to move to: the Lab does not offer
    tangents, so a `buildTangentLine2D` would have exactly one caller. Worth
    writing when the Lab grows the tool, not before.

  All three write a typed member of the `GeometryConstruction` union, so a
  change to the shape of a construction record is a compile error at these
  sites rather than a silent drift.
- [x] **2.2 Lab 2D methods** for every tool `GeometryLabTool` declares:
  `addPoint2D`, `addSegment2D`, `addRay2D`, `addVector2D`, `addLine2D`,
  `addPolygon2D`, `addAngle2D`, `addMidpoint2D`, `addIntersection2D`,
  `addParallelLine2D`, `addPerpendicularLine2D`, `addAngleBisector2D`,
  `addCircle2D`, `addCircleThroughPoints2D`.

  Every one of them produces **live** geometry, which is the part that was
  really missing: a host could always push a raw `addPoint2D` delta, but only by
  writing the `construction` metadata itself, and without that the point sits
  where it was put instead of following its sources. Drag B and the midpoint of
  AB moves; turn AB and its perpendicular turns; the foot of a perpendicular
  slides with the point it is dropped from; a perpendicular bisector settles
  behind its own midpoint in one commit.

  Helper points stay hidden and deliberately do **not** take the caller's style,
  so a labelled construction does not put scaffolding in the object list. A
  construction that cannot be built throws and leaves nothing behind.
- [x] **2.3 2D renderer.** `renderGeometryLabSvg2D` draws points, segments,
  rays, vectors, lines, polygons, circles, arcs, conics, parametric curves, loci
  and angle marks, and `export({ format: 'svg' })` now reaches it.

  Deliberately not a camera pipeline: a 2D scene has a pan and a zoom, so
  world-to-screen is an offset and a scale, and the painter's problem the 3D
  renderer solves does not arise. Depth sorting is replaced by a fixed paint
  order - fills, curves, lines, then points and labels - so a vertex is never
  buried under the polygon it defines. Infinite lines are clipped to the
  viewport with Liang-Barsky rather than extended a long way, which keeps
  coordinates inside the viewBox instead of writing 2,400-unit spans into a
  640-unit picture.

  **Which renderer runs needed care.** `activeView` defaults to `'2d'`, so
  routing on it alone turned every existing 3D export blank - four tests caught
  that. The view is now corroborated by the scene actually holding 2D content,
  which preserves the old behaviour exactly: a snapshot with nothing 2D in it
  still renders as 3D, as it always did.
- [x] **2.4 2D measurements.** `Measurement2D` and a `scene2d.measurements`
  collection, with six sources: distance between points, segment length,
  point-line distance, angle, polygon area and polygon perimeter. Committed as a
  source and recomputed by canonicalization, exactly like the 3D ones, so a
  measurement tracks the figure instead of recording what it happened to be.

  The collection is **optional**, and deliberately stays absent rather than
  serializing as `{}` when a scene has none - so every snapshot written before
  this keeps its exact shape and needs no migration. An existing `clear2D` test
  caught the first attempt at that.

  A new collection has to be joined to more places than it looks: the reducer,
  the history record list *and* the history-patch validator's own list, the
  dependency graph, the id-uniqueness scan, the invariant reference check, the
  schema, and `clear2D`. Two of those were missed until a test found them - undo
  failed on an unknown history collection, and a measurement id could collide
  with a point. Both now have tests of their own.
- [x] **2.5 Missing 3D measurements.** Added point-point distance, point-line
  distance, line-line angle, line-plane angle, and line-line distance - the last
  covering skew, parallel and intersecting lines alike, since parallel lines
  have no common perpendicular and fall back to a point-to-line measure.

  Two details worth stating: a line-line angle is undirected, so reversing a
  line's defining points cannot turn 45 degrees into 135; and a line-plane angle
  is measured from the plane rather than from its normal, so a vertical line
  against the xy plane reads 90 and a line lying in it reads 0.

## Phase 3 - transformations and constraints

- [x] **3.1 Transformations.** Translation (by a vector or a fixed offset),
  rotation about a point, reflection in a line and in a point, and dilation -
  as the `transformedPoint` construction kind, applied to a point or to any
  vertex-defined entity through `transform2D` and five named shorthands.

  **The transform's parameters are objects, not numbers.** A rotation names a
  centre *point*; a reflection names a mirror *line*; a translation can name a
  *vector*. So the image follows two things at once: drag the original and the
  image follows, drag the mirror and the whole reflected figure sweeps around.
  That is the difference between a transformation tool and a one-off edit, and
  it is the entire reason to do this on a screen rather than on paper. A matrix
  would have frozen the numbers at the moment the transformation was applied.

      triangle              [[1,2],  [4,2],  [1,5]]
      reflected in the x axis  [[1,-2], [4,-2], [1,-5]]
      mirror tilted to y = x   [[2,1],  [2,4],  [5,1]]

  Images of images chain and settle in one commit. A circle is **refused**
  rather than transformed: its radius is not a vertex list, so mapping vertices
  would silently lose it, and it needs a rule of its own.

  Note the Calculator's own `rotateSelection`, `reflectSelection` and friends
  remain one-off coordinate edits. They are a different operation - moving what
  you selected - and are not replaced by this.

- [x] **3.2 Constraint solving.** `scene2d.constraints` was typed, validated,
  persisted and cascaded from the start, and nothing ever enforced it - a
  segment declared five units long could be dragged to any length, so a
  constraint was a note in the file rather than a fact about the figure.

  **Nothing needed writing.** `constrainGeometryScene` already existed in the
  Calculator, already capped at six relaxation passes, and read no
  Calculator-specific field - so it moved to geometry-core generic over any
  `GeometryScene`, and both instruments share it. The Calculator's own
  behaviour is unchanged, verified by a differential over **114 snapshots
  across nine scenarios** covering every constraint kind, an over-constrained
  figure, a disabled constraint and a locked point.

  The Lab also had no way to *add* one: no delta, no method. Added
  `addConstraint2D` / `removeConstraint2D` and their deltas. Enforcement lives
  in canonicalization rather than in the method, so a constraint holds however
  the edit arrives - including a raw delta from a collaborating peer.

  One honest limitation: canonicalization sees a finished snapshot, not the edit
  that produced it, so no changed-id hint is passed. The solver's deterministic
  fallback applies, which means the Lab does not yet prefer to hold still the
  point a user is dragging the way the Calculator does. Deterministic is what a
  canonical form needs; the nicety is not yet there.
- [x] **3.3 Perf gate.** `drag-20-constraints` drags one end of a chain held by
  twenty fixed-length constraints: **0.27 ms** against the 4 ms budget. The
  relaxation loop is the classic way a geometry tool loses its frame budget, so
  this case exists to keep the iteration cap honest.

## Phase 4 - the learning layer

Highest pedagogical return per unit of work, and 4.1 is the smallest diff in
this document.

- [x] **4.1 Goal checking.** `checkGeometryGoal(snapshot, targetInvariants)`
  returning `{ satisfied, met, missing, extra, incomplete, relativeTolerance }`,
  on `GeometryLab` as `checkGoal`, with `getInvariants` alongside it. This one
  function turns the existing invariant reporter from a marker into a tutor:
  "you have `equal-segments:AM,BM`, you have not made `AB` and `CD`
  perpendicular".

  It looks like a set difference and is not, for two reasons that are most of
  the code:

  - **A goal is written by a person.** A mark scheme says
    `equal-segments:MB,AM`; the reporter emits `equal-segments:AM,BM`. Both name
    one fact. The reporter's spellings are canonical only by accident of how its
    loops are nested, so both sides go through the same canonicaliser - which
    has to know, per kind, which arguments are unordered and which are point
    names run together with no separator. That grammar is ambiguous in general
    (with points `B`, `C`, `BC` and `CA` in one figure, `BCA` is either `B-CA`
    or `BC-A`), so a name that reads two ways is **refused and compared
    literally** rather than guessed. Guessing would credit the wrong segment.
  - **Absent is not false.** The reporter bounds its own work and says so. A
    fact that fell off a truncated report has not been checked, and calling it
    missing would send a child to fix something already right, so the result
    carries `incomplete`. Truncation can only hide facts, so a goal with nothing
    missing is satisfied whatever else was skipped.

  `extra` is scoped to relations between the objects the goal itself names. Any
  figure satisfies dozens of incidental relations and a tutor reciting them is
  noise; a relation between the very points the exercise is about is usually how
  the child got there.

  Cost: linear in the report (bounded at 200 facts) and in the goal, about
  0.6 us per invariant - 0.05 ms on a 78-fact figure, 0.10 ms on a 152-fact one,
  and 8% of the reporter's own scan at its 24-point cap. It takes an
  already-computed report as an optional third argument, because the scan is the
  expensive half and a caller holding one must not pay twice. The first version
  parsed every id twice, once for its canonical spelling and once for the
  objects it names, which cost more than the scan it sits on; both now come from
  one parse behind a memo.

  **Not done: "consume it in `src/assessment`", because that module forbids
  it.** `src/assessment/index.ts` says it "intentionally contains no delivery
  engine, proctoring runtime, scoring logic, or answer keys", and this is not
  just a comment - `LEARNER_SAFE_FORBIDDEN_FIELDS` maps `answer`, `scoring`,
  `rubric`, `markingScheme` and thirty more to `never` on every item type, and
  `learner-safe-contract.test.ts` asserts at type level that they cannot be
  assigned. A target invariant set is an answer key. The module has no
  authoring-side item type to put one on, only `LearnerSafeAssessmentItemV1`.
  The split the invariant reporter already documents is the right one and is
  the one now implemented: the instrument states which facts hold and which are
  absent, and the scorer - outside this SDK - holds the key and calls
  `checkGeometryGoal`. Giving assessment a geometry answer key needs an
  authoring-side contract that does not exist yet, and that is a decision about
  the assessment module rather than about the Lab.
- [x] **4.2 Construction protocol.** `geometryConstructionProtocol(snapshot)`,
  on the Lab as `getConstructionProtocol` and `formatConstructionProtocol`. A
  numbered step list read out of the `construction` provenance already in the
  model, so it costs no snapshot memory and nothing at edit time:

  ```
  1. Place A at (-4, 0).
  2. Place B at (4, 0).
  3. Join A and B with segment AB.
  4. Construct M, the midpoint of A and B.
  5. Draw line 1, the line through M perpendicular to AB.
  ```

  Three decisions carry it.

  - **Machinery is not a step.** Hidden *and* locked together is the signature
    every builder gives an object it creates on the caller's behalf: the helper
    point that gives a constructed line its direction, the centre a circle
    through three points is drawn about. No student ever placed one, so listing
    them would describe the instrument's working rather than the child's. Hidden
    *alone* is a styling choice about the student's own point, and that point is
    still a step they took. The count of what was folded away is reported.
  - **A point is introduced where it is first used.** The model has no
    timestamps, so no reading of it recovers the true order; ordering by
    collection would put every point at the top, which does not read as a
    protocol. Depth-first post-order over the provenance edges, driven from the
    objects that use other objects, pulls each point in at the moment it is
    first needed - which for a figure built in one session reproduces the real
    build order, and for any other figure is a stated rule rather than a guess.
  - **`replayable` is a property, not a promise.** True when every step's
    sources precede it, which is exactly what a replay needs and exactly what a
    cycle breaks. A figure with circular provenance - which the integrity check
    forbids, so only a hand-made snapshot has one - still lists every object and
    says `replayable: false`, because a protocol of a broken figure is a
    diagnostic.

  It is a protocol of the figure as it *stands*, not a log: delete an object and
  its step goes, undo and it returns. That is the honest limit of deriving
  rather than recording, and it is the right trade - a log has to be kept correct
  through undo, collaborative merges and reloads, and this cannot go stale
  because there is nothing to go stale. Covers 2D fully, and in 3D covers
  solids, work planes, cross-sections and the two plane-intersection
  constructions; a solid's own mesh points are machinery, not sources.
- [x] **4.3 Invariant vocabulary - algorithmically, not by adding loops.**
  *Bucketing and the 2D vocabulary; 3D landed as 4.3b below.*

  The nested scans are gone. Every relation here is "two measurements agree to
  within a tolerance", so each quantity - length, direction, angle, area, a
  triangle's shortest side, a triangle's side ratio - is quantized into buckets
  one tolerance wide (`tolerance-buckets.ts`). Two values that agree cannot land
  more than a bucket apart, so only pairs inside a bucket and across one
  boundary are tested. **The neighbour is not optional**, exactly as the task
  said: without it every pair either side of a boundary is missed, silently and
  only sometimes.

  Bucketing *proposes* pairs; each is then put through the same comparison the
  exhaustive version used, so this changed what is looked at and not what is
  true. Proved by an 85-figure differential built to sit on the boundary - pairs
  placed at 0, 0.25, 0.5, 0.9, 0.99, 1, 1.01, 1.1, 2 and 3 times the tolerance,
  for lengths, directions, angles and circle radii, plus degenerate,
  dangling-reference, far-from-origin, tiny and non-finite figures. **Every
  established fact is identical** across all 85. Two tests walk a pair across
  the tolerance in fortieths so a boundary is crossed at every phase within a
  bucket.

  Measured, and not uniformly a win:

  | figure | before | after | |
  | --- | --- | --- | --- |
  | 6-12 points, few objects | 0.010-0.036 ms | 0.018-0.048 ms | **1.3-2.0x slower** |
  | 16-24 points | 0.11-0.25 ms | 0.09-0.20 ms | 1.2-1.3x faster |
  | 20 points, 190 segments | 3.53 ms | 0.74 ms | 4.8x faster |
  | 40 points, 780 segments | 20.3 ms | 3.07 ms | 6.6x faster |
  | 60 points, 1770 segments | 91.2 ms | 8.68 ms | 10.5x faster |

  A small figure is slower, because bucketing's fixed cost is not repaid until
  there are enough pairs to skip. Tens of microseconds on a figure that is
  marked once rather than per frame, and the alternative - a second exhaustive
  path below a threshold - is two implementations of the same comparisons and
  the drift that comes with them. Stated rather than hidden. The first version
  was worse: reusing one bucket set across vertices instead of allocating one
  per vertex, and walking pairs through a callback instead of a generator, took
  the small-figure penalty from 2.1x to 1.7x and everything else down by a
  quarter.

  `MAX_POINTS` rose from **24 to 128** - the number is measured, not chosen: the
  densest figure the benchmark builds costs 4.8 ms at 128 and would exceed the
  harness's 8 ms budget at 160. Two new bounds keep that affordable. Facts stop
  being *found* at four times the number that can be reported, so a figure with
  a reasonable number of them is reported exactly as before and only a figure
  already far past what can be stated is affected. And the incidence and
  tangency scans - the two relations that are a point against an object rather
  than two measurements agreeing, and so have no quantity to bucket on - carry a
  work budget, because the fact bound does not stop them: a thousand segments
  that no point lies on cost a thousand tests to find out. Both make the report
  say it was truncated, which is what every bound here does.

  New vocabulary, each with its own tolerance story: `point-on` (incidence,
  tested against the part of the object that is drawn, so a segment whose
  *extension* would pass through a point is not credited), `tangent` (same
  extent rule), `equal-angles` (over angles the figure shows - a vertex and two
  points joined to it - compared as angles rather than through a sine, so the
  tolerance is the arcsine one directly), `congruent` and `similar` (bucketed on
  the shortest side and on the shortest-to-longest ratio), and `equal-area`
  (compared against the figure's size *squared* times the relative tolerance,
  because an area is a length squared). Goal checking (4.1) learned to
  canonicalise all six.

  **Not done, with reasons.**

  - *Concyclic.* **Superseded by 4.3b, which added it.** The objection here was
    that a maximal-set fact would not match an author asking about part of it;
    4.3b needed the same shape for `coplanar` and answered it properly, by
    teaching goal checking that some relations hold of every subset. Points
    concyclic on a circle that is *not* drawn are still out: finding those is a
    search over triples for the circumcircle they span, which is the cubic cost
    this task exists to remove.
  - *Ratio.* `ratio:AB,CD=2` carries a value inside the id. Every fact in this
    vocabulary is a boolean whose id names only objects, and both the goal
    checker's canonicaliser and the mark-scheme grammar assume that. Worth doing
    with a grammar that has somewhere to put a number, not by smuggling one in.
- [x] **4.3b 3D invariant vocabulary.** `gradable-invariants-3d.ts`, folded
  into the same report: `point-on-plane`, `coplanar`, `parallel-planes`,
  `perpendicular-planes`, `perpendicular-to-plane`, `parallel-to-plane` and
  `skew`. The shared primitives - tolerances, the fact bound, the work budget,
  the naming rule - moved to `invariant-support.ts` so the two passes cannot
  drift on what a tolerance means or what a point is called.

  Three things really are different in space, which is what the split was for.

  - **Its own vocabulary, and that is load-bearing rather than modest.** Naming
    a 3D segment `AB` the way the plane pass names a 2D one would make
    `parallel:AB,CD` mean either scene, and a mark scheme could not say which
    figure it was asking about. Every kind here exists only in space, so the
    names resolve. A figure with content in both scenes gets both sets of facts
    and no ambiguous one.
  - **Its own scale.** A snapshot can hold a millimetre-wide plane figure beside
    a kilometre-wide solid; measuring one against the other's yardstick would
    mark a correct construction wrong. A test builds exactly that figure.
  - **Its own idea of whose points these are.** A cube brings eight mesh
    vertices and a sphere brings 266. Nobody placed them, and marking them would
    bury a figure's real facts under its triangulation, so they are skipped the
    same way the construction protocol skips machinery. Marking a sphere scene
    costs 0.036 ms; a dense spatial figure - twenty planes, fifty-nine lines -
    costs 0.34 ms, gated as `invariants-3d`.

  **A claim in the earlier version of this entry was wrong.** It said skewness
  would be "a direction bucket lookup rather than a scan". It is not: bucketing
  finds pairs whose measurements *agree*, and skewness is what is left when they
  disagree in two ways at once, which almost every pair does. Bucketing does the
  parallel test that rules pairs out; the rest is a scan under the same work
  budget the incidence scans carry.

  **`concyclic` is reinstated, and `coplanar` is why.** 4.3 left concyclic out
  because a maximal set - `concyclic:A,B,C,D,E` - is a fact no mark scheme could
  name, since an author asking about four of the five would not match. Coplanar
  has exactly the same shape, and rather than drop it too, goal checking learned
  that some relations hold of every subset: `collinear`, `concyclic` and
  `coplanar` now match by containment, so the maximal set is stated once and an
  author names whichever part of it their question is about. That mechanism is
  what removed the objection, so the earlier decision no longer stands and the
  fact is back.

  **`inscribed` is not here, for a reason about the model rather than about
  effort.** It is not one relation but a family - a solid whose vertices lie on
  another's surface, a solid whose faces touch another's - each needing its own
  definition. And a solid here is a mesh: the "surface" of a sphere is a
  polyhedral approximation, so a tolerance story for touching it would be a
  story about how finely it was sampled rather than about the geometry. That is
  a decision about the solid model, and it should be made there.
- [x] **4.4 Conjecture detection.** `detectGeometryConjectures(snapshot,
  options?)`, on the Lab as `detectConjectures`. Perturbs the free points,
  recomputes the figure through the same canonicalisation an edit goes through -
  constraints and all - and keeps only the facts that hold in every
  configuration. A constructed midpoint follows its ends through all of them; a
  point nudged until the halves looked equal comes apart on the first sample.

  Decisions worth stating:

  - **A free point is one with no construction and no lock.** A constructed
    point is not free - it goes where its rule sends it - and a locked point is
    a given of the problem rather than something the student arranged. A figure
    where *nothing* is free reports `movedPoints: 0` and every fact as
    invariant, which is true for the trivial reason and is why the count is in
    the report.
  - **The nudge has to be much larger than the tolerance.** A fact is
    established at one part in a thousand of the figure, so a perturbation of
    that order leaves a near-coincidence sitting inside it and calls it a
    construction. The default spread is fifty times the tolerance - large enough
    to break a coincidence, small enough to leave the figure recognisable. A
    test shows the failure directly rather than asserting it in a comment.
  - **Three outcomes, not two.** A fact absent from a sample whose own marking
    was *truncated* has not been shown to come apart; it was never looked for.
    Those are `unsettled` rather than `coincidental`, the same discipline 4.1
    applies to a truncated goal check. On a dense figure most facts land there -
    at 48 points, 141 of 200 - which is the honest limit of marking a figure
    that holds more facts than can be reported.
  - **Deterministic.** A seeded generator rather than `Math.random`, because a
    mark that changes between two runs of the same submission is not a mark.

  Costs 10-14x a single marking - eight recomputations of the whole figure plus
  eight markings - which is 0.5 ms on a six-point figure and 11 ms on a
  forty-eight-point one. That is why it is a method a host calls when a marker
  asks a question, and the documentation says so: an idle callback, a worker, a
  "check" button, never a drag.
- [x] **4.5 Machine-readable exercises.** `GEOMETRY_EXERCISE_BANK` in
  `exercise-bank.ts`: all twenty-four exercises as typed objects, with the
  target invariant set, the tools in scope, a hint ladder and a mark scheme.
  `markGeometryExercise` marks a figure against one; `learnerGeometryExercise`
  is the projection safe to send a student; `geometryExerciseProgress` sequences
  the bank on prerequisites. On the Lab as `markExercise` and `nextHint`.

  **The keys are verified, not asserted.** An answer key nobody has answered is
  a guess, so `exercise-models.mjs` builds a model answer for every exercise
  that carries one - built with the construction tools rather than by placing
  points where they look right - and the tests check each is marked correct,
  *and* that every fact in it survives the figure being dragged. Writing them is
  what caught the targets that were unreachable as first written.

  **Two things changed in the content, deliberately.** Several tasks now say
  which letters to use: a fact is named for the points it is about, so "mark the
  midpoint of each side" cannot be marked when nothing said what they were
  called - and labelling is a good instruction anyway. And **most exercises have
  no target**, which is a statement rather than an omission: "build a shape
  garden" is a real activity and there is no invariant that says a garden is
  finished. Inventing facts to make those look markable would make marking wrong
  rather than wide. Eight have real keys; every 3D exercise is open because the
  3D vocabulary is 4.3b.

  **An exercise carries an answer key, so nothing here goes near
  `src/assessment`** - the same boundary 4.1 ran into. `learnerGeometryExercise`
  is the split: the prompt, the tools and the hints actually asked for, with the
  key and the unspent ladder left on the server. A test serializes the
  projection of every exercise in the bank and asserts no target fact and no
  unspent hint appears in it, because "the client only shows one rung" is not a
  security property.

  The exercises that are about *constructing* rather than drawing carry
  `requireConstruction`, and marking them runs 4.4: a triangle dragged to be
  equilateral to eleven decimal places is marked wrong, and the mark says which
  facts held only where the figure was left. That is 4.1, 4.3 and 4.4 doing one
  job together, and it is the thing none of them could do alone.
- [x] **4.6 Hint ladder.** `nextGeometryHint(exercise, snapshot, released)`.
  Chosen from the figure rather than from a counter: the goal check says which
  facts are absent, and the gentlest unspent rung tied to one of them is what a
  student gets. A child who has the equal halves but not the right angle is told
  about the right angle. When nothing is missing it falls back to a rung tied to
  no fact - general encouragement - and when the ladder is spent it returns
  nothing rather than repeating itself. Ladders run from "M has to stay halfway
  along AB when you drag A - does it?" up to "use the midpoint tool on A and B
  rather than placing a point that looks central".

## Phase 5 - accessibility and output

School deployment makes this a compliance question as well as a pedagogical one,
and a good textual description of a figure is transformative for exactly the
students who currently get nothing.

- [x] **5.1 Structured SVG semantics.** Every drawn object now carries a
  `<title>` naming it and a `<desc>` saying how it was made, inside a
  `role="graphics-symbol"` group; the root is `role="graphics-document"` rather
  than `role="img"`, because an image is a leaf and saying a leaf has structure
  inside it is a contradiction a screen reader resolves by ignoring one of them.
  The old `aria-label` stays for anything that does not know the graphics roles.

  The descriptions are **read out of the construction protocol**, not written
  again: a picture whose account of itself disagreed with the figure's would be
  worse than one with none.

  Three details that took measuring or thinking:

  - **A label is written once even though an object is drawn many times.** A
    circle is sixty-four segments and a solid a sheaf of faces, and they are
    depth-sorted, so an object's pieces are not next to each other and cannot be
    one group. The name and sentence go on whichever piece is painted first and
    the rest point at them with `aria-labelledby`; repeating the id would make
    the file invalid rather than accessible. A test asserts no id appears twice
    and that every reference resolves.
  - **Element ids are keyed to their own object, not to position.** The first
    version numbered them by step, so adding one unrelated point renumbered
    every element in the file and a diff of two exports was a diff of
    everything. They are now a short hash of the object's own id, with an exact
    collision suffix rather than a probable one.
  - **Focus order is paint order, and that is a limit rather than a choice.**
    Tab order in SVG is document order, and the only way to override it is a
    positive `tabindex`, which hijacks the tab order of the whole page the
    figure lands in. So it is back to front: deterministic, which is what a
    keyboard user needs, but not the order the figure was built in. Walking it
    in construction order needs roving-tabindex handling, which is the
    interaction layer 5.5 is a decision about.

  `focusableObjects` is **off by default** and on for `mount()`: a mounted
  figure is the thing being navigated, while an exported one usually lands in a
  page with its own tab order that does not want a hundred more stops in it.

  Cost, measured: descriptions roughly double render time and triple file size -
  a 500-object 3D export goes from 2.03 ms to 3.91 ms, and a 400-object 2D
  figure from 33 KB to 106 KB, which is 0.6% of the 16 MiB export bound. On by
  default, because accessibility that is off by default does not happen, and
  `describeObjects: false` is there for a host that wants the smaller file. The
  benchmark now measures both, as `export-svg-500` and `export-svg-500-plain`,
  so a change that slows the *drawing* is still caught while the described
  number moves for reasons of its own.
- [x] **5.2 A real text export.** `describeGeometryLabFigure`, on the Lab as
  `describe()` and behind `export({ format: 'text' })`. The census is gone; what
  comes back is what the figure holds, how it was built, what it establishes and
  what has been measured. As the task predicted, almost none of it is new work -
  the steps are the 4.2 protocol and the facts are the 4.3 reporter, and what
  this adds is English and an order:

  ```
  A figure with 1 line, 3 points and 1 segment in the plane.

  How it was built:
  1. Place A at (-4, 0).
  ...
  What it establishes:
  - M is the midpoint of AB.
  - AB is perpendicular to the line through M.
  ```

  Two decisions. The description **says when it is partial** rather than looking
  complete, because a truncated report read aloud as a finished list is worse
  than no list. And the one-sentence summary **counts what is drawn, not what is
  stored**: it is what a reader gets *instead of* seeing the figure, so telling
  them about an object the student hid would be worse than saying nothing. How
  it was built is a separate section, and a hidden step still appears there.

  **Writing it found two faults in the invariant reporter**, which is the value
  of making something read aloud. It marked the instrument's own helper points -
  the hidden one that gives a constructed line its direction - so a figure's
  facts included `right-angle:AMp_2iv9tqm1hyqr4_479b39...`, unreadable and
  unnameable by any mark scheme. And an object with such a point at one end was
  named after it. Helper points are now skipped for marking and naming while
  still being measured through - a constructed line has no direction without its
  helper - so `perpendicular:AB,line(M)` is stated, and reads as "AB is
  perpendicular to the line through M". The 85-figure differential is unchanged.
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
