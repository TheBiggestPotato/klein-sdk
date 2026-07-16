# Geometry Lab Hardening Plan

Last updated: 2026-07-16

## Status

- Overall: **Complete**
- Current phase: **7 — Module decomposition and compatibility (complete)**
- Geometry Lab test status: **147 passing, 0 TODOs**
- CI status: `npm run test:ci` passes with type checking, build, 147 Geometry Lab tests, and all existing smoke suites.

Status markers: `[x]` complete, `[ ]` pending, `[-]` in progress.

## Initial confirmed risks

These are the historical findings that defined the hardening work; completed phase checklists and the progress log below record their remediation.

### Data integrity and collaboration

- IDs can collide after loading a snapshot and between collaborating clients, silently overwriting objects.
- Snapshot-based undo/redo can erase remote changes and cause peers to diverge.
- Snapshot and delta validation accepts malformed data and unknown operations.
- Exported JSON and caller-owned delta payloads can alias mutable internal state.
- Delete and clear operations can leave dangling references, hidden owned points, measurements, nets, links, and selections.
- Derived values such as solid measurements, work planes, nets, and cross-sections become stale after source edits.
- Commits are not transactional when reduction, rendering, or host callbacks fail.

### Mathematical and rendering correctness

- Equation exponent precedence is incorrect for expressions such as `-x^2`.
- Explicit equations such as `z = x` are rejected, while dependent-axis references can be accepted incorrectly.
- Equation semantics differ from the shared math engine, including `log` behavior.
- A single non-finite surface sample aborts the whole surface; discontinuities are bridged without a validity mask.
- Prism volume, concave polygon area, degenerate-solid handling, and cross-section tolerances need correction.
- Solid edge IDs are not unique.
- Perspective scaling and painter ordering are reversed; camera FOV is ignored.
- Hidden geometry affects visible framing, and large spread-based bounds calculations can overflow the call stack.

### Maintainability and performance

- Most Geometry Lab behavior lives in one large module.
- Equation sampling and the legacy Graphing 3D command layer are duplicated and have already drifted.
- Several advertised options and view modes are unused.
- Mount/destroy operations replace the host container's entire `innerHTML`.
- History stores unbounded full snapshots containing sampled meshes.

## Implementation plan

### 1. Regression guardrails

- [x] Capture the audit and prioritized plan in this document.
- [x] Add a reusable `getGeometryLabInvariantIssues` / `assertGeometryLabInvariants` model checker.
- [x] Add a dedicated `node:test` Geometry Lab test harness.
- [x] Encode every confirmed defect as an executable regression; keep known failures explicitly marked until fixed.
- [x] Add randomized reducer/history sequences that assert model invariants after every operation.
- [x] Run the Geometry Lab suite in `test:ci`.

Exit criteria:

- Every confirmed defect has a stable reproduction.
- Valid generated snapshots pass the invariant checker.
- Dangling references, duplicate IDs, invalid mesh indices, and key/object-ID mismatches are detected.
- Known failures are visible in test output and become normal passing tests as fixes land.

### 2. Identity, history, and collaboration safety

- [x] Replace per-instance counter IDs with collision-resistant actor-scoped IDs.
- [x] Reject duplicate add operations instead of overwriting existing records.
- [x] Replace snapshot undo with semantic forward/inverse history operations.
- [x] Rebase or invalidate local undo/redo entries when remote operations arrive.
- [x] Emit collaborative history operations and add two-peer convergence tests.

### 3. Strict state boundaries and transactions

- [x] Add exhaustive discriminated snapshot, delta, and command validation.
- [x] Validate every public load/apply/execute boundary and reject unsupported operations.
- [x] Clone or canonicalize data at input and output boundaries; freeze snapshots in development tests.
- [x] Make reduction transactional and return `{ snapshot, changed }`.
- [x] Do not record or emit no-op operations.
- [x] Isolate observer failures and route them through `onError`.
- [x] Define explicit trusted synchronization behavior for read-only instruments.
- [x] Make every JSON export mode round-trip through its corresponding importer.

### 4. Dependencies and canonical state

- [x] Define ownership and dependency rules for points, entities, planes, solids, measurements, nets, and links.
- [x] Build a reverse dependency graph.
- [x] Centralize delete and clear behavior with explicit cascade-or-reject policies.
- [x] Keep authored inputs canonical and recompute derived geometry; reject atomically when stable derived identity cannot be preserved.
- [x] Omit practical redundant meshes from JSON persistence and creation deltas; compacting full history patches remains part of Phase 6 history bounds.

### 5. Mathematical correctness

- [x] Reuse the shared math parser/evaluator where possible.
- [x] Fix exponent precedence, axis semantics, logarithms, and dependent-variable validation.
- [x] Add validity masks for sampled surfaces and omit faces spanning invalid samples or discontinuities.
- [x] Validate solid planarity, degeneracy, winding, and self-intersection assumptions.
- [x] Correct prism/pyramid volume and polygon area calculations.
- [x] Fix solid edge identity and scale-aware intersection tolerances.
- [x] Add analytic, property-based, and transformation-invariance tests.

### 6. Rendering and performance

- [x] Implement a conventional camera/view/projection pipeline with FOV and near-plane handling.
- [x] Correct far-to-near ordering or use a renderer with a depth buffer.
- [x] Exclude hidden/orphan geometry from visible bounds.
- [x] Replace spread-based reductions with bounded single-pass calculations.
- [x] Add scene, mesh, input, and export complexity budgets.
- [x] Bound history and avoid cloning full sampled meshes on each edit.
- [x] Render into an SDK-owned DOM root without deleting host content.

### 7. Module decomposition and compatibility

- [x] Split the module into `types`, `schema`, `commands`, `reducer`, `dependencies`, `history`, `equations`, `solids`, `renderers`, and `instrument`.
- [x] Consolidate add/edit equation sampling behind one implementation. *(Completed in Phase 5.)*
- [x] Make `graphing-3d` a thin compatibility adapter over Geometry Lab commands.
- [x] Either implement advertised options/view modes or remove them from the public contract.

## Definition of done

- No duplicate object or sub-object IDs.
- No dangling references after any accepted transaction.
- Import, export, and delta application cannot mutate state through aliases.
- Undo/redo preserves remote operations and two peers converge after interleavings.
- Derived values are current, explicitly invalidated, or the transaction is rejected atomically.
- Mathematical golden tests and scale/transform properties pass.
- Rendering respects camera semantics and configured complexity limits.
- Randomized state-machine tests preserve all invariants.

## Progress log

- **2026-07-15:** Completed the initial read-only audit and reproduced critical ID, history, mutation-aliasing, deletion, formula, solid, and rendering failures.
- **2026-07-15:** Added the exported invariant checker with identity, reference, mesh-index, sub-object-ID, numeric, work-plane, selection, net, measurement, and link checks.
- **2026-07-15:** Added the dedicated Geometry Lab `node:test` suite: 7 active passing tests, a deterministic 120-operation invariant sequence, and 17 executable known-failure TODOs.
- **2026-07-15:** Added `test:geometry-lab` and wired the Geometry Lab suite into `test:ci`. Phase 1 remains in progress while the remaining audited failures receive executable reproductions.
- **2026-07-15:** Completed Phase 2 identity hardening with actor-scoped IDs using a random per-instance replica namespace; local object, instrument, and delta IDs no longer share deterministic counters across peers or reloads.
- **2026-07-15:** Added global duplicate-ID rejection across all Geometry Lab record collections, immutable ID/kind guards for updates, and atomic duplicate rejection for batches.
- **2026-07-15:** Replaced snapshot undo/redo with JSON-safe compare-and-set history patches. Unrelated remote records survive undo/redo, while conflicting remote edits invalidate affected local history entries.
- **2026-07-15:** Added seven Phase 2 collaboration regressions covering actor identity, duplicate conflicts, remote-preserving history, conflict invalidation, clear rebasing, emitted history deltas, and two-peer convergence. Current suite: 16 passing and 15 executable known-failure TODOs.
- **2026-07-15:** Started Phase 3 with a transactional `{ snapshot, changed }` reducer, deep input/output ownership, render-before-commit behavior, no-op suppression, safe undo/redo stack updates, isolated host observers, explicit non-echoing remote synchronization for read-only instruments, and full/content-only JSON round-trips. Seven of ten new Phase 3 boundary tests pass; strict nested snapshot, delta, and command schemas are in progress.
- **2026-07-15:** Completed Phase 3 with exhaustive discriminated schemas for snapshots, entities, constraints, deltas, history patches, and commands; record-key and global identity checks; strict runtime load/apply/execute enforcement; and post-reduction snapshot validation that rejects state-corrupting transactions atomically.
- **2026-07-15:** Hardened the shared runtime with accurate `changed` results, source-aware emission, isolated/cloned subscriber events, and guarded custom commands. Added metadata-source validation so forged sources cannot bypass read-only mode while remote synchronization and local-only camera/tool state remain explicit.
- **2026-07-15:** Promoted the JSON aliasing, content-only round-trip, read-only, and observer regressions from known failures to passing tests. Phase 3 closes at 34 passing Geometry Lab tests and 11 explicitly deferred known failures; full `test:ci` passes.
- **2026-07-15:** Started Phase 4 by specifying ownership and dependency edges across the combined 2D/3D scene, centralizing cascade planning for delete/clear operations, and defining which authored inputs remain canonical versus which derived records are recomputed or invalidated.
- **2026-07-15:** Completed Phase 4 with a typed forward/reverse dependency and ownership graph; transitive cascade planning for every delete and clear path; protected-object rejection; selection pruning; active-plane reset; cycle and multi-owner checks; and dependency-aware history invalidation that prevents local undo from orphaning peer-authored dependents.
- **2026-07-15:** Added deterministic canonicalization at validate/load/import/reducer boundaries. Supported 2D constructions, 3D midpoints, work-plane chains, solid faces/edges/metrics, legacy and source-backed measurements, nets, cross-sections, selections, and active planes now recompute from authored inputs; undefined or unsupported constructions and topology-changing cross-sections reject atomically instead of retaining stale state.
- **2026-07-15:** Added version-1 work-plane migration so legacy parallel/perpendicular planes without persisted through metadata retain their stored origin. Focused regressions also cover dependency cycles, illegal shared ownership, protected XY deletion, undefined 2D intersections, and unsupported 3D construction rules.
- **2026-07-15:** JSON persistence and SDK creation deltas now omit rehydratable solid caches, net layouts, and cross-section meshes while retaining authored topology. Compact snapshots rehydrate without losing edge selections. The unique-edge, solid-cascade, and parallel-prism regressions were promoted to passing tests. Geometry Lab closes Phase 4 at **52 passing tests and 8 executable known-failure TODOs**; full `test:ci` passes.
- **2026-07-15:** Started Phase 5 with parallel audits of equation semantics, discontinuity-aware surface sampling, and solid/intersection geometry, keeping the remaining mathematical regressions executable while their implementations are replaced.
- **2026-07-15:** Replaced Geometry Lab's private equation evaluator with the shared math AST/evaluator. Unary powers, right-associative exponents, base-10 `log`, natural `ln`, explicit dependent axes, dependent-variable rejection, formula edits, and canonical mesh rebuilding now share one tested semantic path.
- **2026-07-15:** Added finite-only rectangular surface sampling with public validity masks and diagnostics. Direction-aware dyadic convergence probes reject invalid samples, steps, and same-sign poles without discarding steep, periodic, anisotropic, or high-curvature smooth surfaces; entities with no connected finite cells reject atomically.
- **2026-07-15:** Added scale-aware polygon and closed-mesh mathematics: Newell area/normals, planarity and degeneracy checks, outward winding repair, disconnected-shell and mesh self-intersection rejection, translation-stable volume, perpendicular prism/pyramid heights, connectivity-preserving concave cross-sections, and deterministic endpoint-derived edge IDs.
- **2026-07-15:** Preserved pre-winding legacy edge selections and cross-section point identities during canonicalization, refreshed derived solid heights, required authored input for equation caches, and added coefficient/coordinate scale invariance coverage. Phase 5 closes at **95 passing tests and 2 Phase 6 TODOs**; full `test:ci` passes.
- **2026-07-15:** Replaced the legacy 3D projection with a conventional camera-space SVG pipeline: vertical FOV, perspective and target-matched orthographic projection, near-plane clipping, deterministic face-level far-to-near ordering, stable equal-depth ties, finite zoom bounds, and measurement overlays are covered by rendering regressions. FOV-aware selection fitting keeps narrow, wide, and orthographic views inside the default viewport.
- **2026-07-15:** Added bounded, UTF-8-aware complexity preflights for parsed/serialized snapshots, deltas, commands, surface grids and probes, validation issues, scene meshes, SVG primitives/references/dimensions, and incremental render output. Public samplers enforce hard allocation ceilings, while prospective per-entity and remaining-scene surface budgets reject before evaluating user callbacks.
- **2026-07-15:** Reworked semantic history to bounded count/byte storage with compact compare-and-set values, deterministic mesh rehydration, and immutable reuse of unchanged surface/curve buffers. Unrelated edits no longer resample or clone cached geometry; JSON, transport, and history omit rehydratable equation meshes.
- **2026-07-15:** Geometry Lab now renders inside an SDK-owned child root and preserves host DOM on mount, rerender, and destroy. Hidden geometry is excluded from fitting, production bounds use single-pass reductions, all Phase 6 tests use the public package entry point, and independent adversarial reviews found no remaining P0/P1 issue. Phase 6 closes at **127 passing tests and 0 TODOs**; full `test:ci` passes.
- **2026-07-16:** Split the former 4,181-line entry module into cycle-free `types`, `validation`, `schema`, `commands`, `reducer`, `dependencies`, `history`, `equations`, `solids`, `renderers`, and `instrument` modules. The public `index.ts` is now a two-line barrel, no leaf imports it, and architecture tests lock the dependency direction and root/subpath export identity.
- **2026-07-16:** Extracted strict command execution, transactional reduction/cascade deletion, compact semantic history, equation compilation/sampling, and pure solid mesh factories with direct module tests. All six solid constructor families retain legacy vertex/face ordering, canonical IDs, parameters, and styles.
- **2026-07-16:** Replaced the duplicated Graphing 3D executor with a 117-line compatibility facade over the Geometry Lab runtime and strict validators. Legacy registry aliases remain 3D-first, inherit complexity limits, and preserve the historical runtime key where directly requested.
- **2026-07-16:** Removed the unused `renderer3d` and `snapEnabled` options and reject them explicitly for JavaScript callers instead of silently ignoring them. `initialView`, `activeView`, `view2d`, and `activeTool` are documented and tested as host-facing state, with initial snapshots retaining precedence.
- **2026-07-16:** Removed stale renamed build artifacts and extraction dead code, compared runtime export keys before/after the barrel move, and completed independent architecture/integration audits with no P0/P1 findings. The hardening program closes at **147 passing tests and 0 TODOs**; full `test:ci` passes.
