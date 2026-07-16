# GeoGebra-Style v0 SDK Implementation Plan

Status: implementation in progress. Last progress update: 2026-07-14.

## Progress Ledger

- [x] SDK v0 foundation: shared `KleinToolRuntime`, storage adapter, collab envelope, classroom runtime, exam module, embed mode updates.
- [x] SDK tool coverage started: graphing runtime wrapper, Geometry Lab runtime, legacy graphing-3d facade, scientific calculator runtime, probability runtime, whiteboard runtime exports.
- [x] SDK tool registry/factory: `klein-sdk/tools` plus top-level exports for `KLEIN_V0_TOOLS`, `createKleinToolRuntime`, and client room alias normalization.
- [x] SDK smoke coverage: `npm run test:v0` added and passing locally with graphing/phase smoke scripts.
- [x] SDK docs/package docs updated for narrowed v0 scope, supported tool exports, `ToolHost` guidance, and deployment gates.
- [x] Client `ToolHost` slice implemented in `/Users/andrei/projects/klein-client`: standalone v0 tool sessions route through `klein-sdk/tools`, public tool navigation is narrowed, and `npm run build` passes.
- [x] External `/projects/klein-tests` SDK suite covers v0 registry aliases, kept tool runtimes, classroom runtime, exam hooks, embed launch verification, and collab messages.
- [x] Reference backend slice implemented in `/Users/andrei/projects/klein-server`: classroom/exam schema, entities, repositories, services, controllers, and integration tests.
- [x] Reference websocket slice implemented in `/Users/andrei/projects/klein-server`: generic `tool` envelope for `delta`, `snapshot`, `presence`, `classroom-event`, and `exam-event`, while preserving legacy whiteboard/geogebra messages.
- [x] Client classroom/exam slice implemented in `/Users/andrei/projects/klein-client`: class list/detail, assignment authoring, student work launch/editor, review comments/return, exam runtime/status/submission routes, and navbar entry.
- [x] Classroom monitor slice implemented across reference server/client: assignment work listing, review links, live-session create/list endpoints, and freeze/unfreeze controls.
- [x] Geometry Lab 3D slice implemented: Geometry Lab owns the 3D surface, legacy `graphing-3d` aliases resolve to Geometry Lab, equation surfaces such as `y = x^2 + z^2` are sampled into persisted meshes, and sphere/surface defaults use smoother meshes.
- [x] External `/projects/klein-tests` browser coverage started for classroom/exam client routes with mocked auth/classroom/student-work/exam APIs, including object-lock assignment authoring, 3D student-work rendering/autosave; `npm run test:classroom` passes on Chromium.
- [x] Whiteboard hardening SDK slice complete: stronger snapshot/delta guards, tool metadata, collaboration delta compaction, presence/comment contracts, frame SVG exports, embedded calculator cards, and large-board smoke coverage.
- [x] Reference backend verification: Java/Maven unit and Docker-backed integration tests pass locally after starting Docker Desktop.
- [x] Client classroom/review/exam surfaces have role-aware navigation polish, lock-aware review/student surfaces, and REST-derived classroom live presence monitoring.
- [x] Client Geometry Lab multi-save slice implemented in `/Users/andrei/projects/klein-client`: `/instrumente/geometrie-lab` lists named saves, `/instrumente/geometrie-lab/:slug` opens the full Geometry Lab editor, problem launches still open directly, and browser coverage verifies listing/creation.
- [x] Client Geometry Lab 3D equation slice implemented and localized in `/Users/andrei/projects/klein-client`: the full Geometry Lab editor exposes an equation tool, persists equation surfaces as mesh entities, renders them in SVG/WebGL, uses smoother sphere defaults, removes the standalone 3D calculator card, and redirects legacy `/instrumente/geometrie-3d` URLs to Geometry Lab.
- [x] Client Geometry Lab 2D graphing consolidation implemented and localized in `/Users/andrei/projects/klein-client`: the equation tool now works in 2D and 3D, 2D equations sample smooth function curves with root/extremum markers, the equation composer shares the inspector workspace, explicit 2D line/intersection tools are available, sphere mesh defaults were reduced, the standalone graphing calculator card was removed, and legacy `/instrumente/calculator-grafic` URLs redirect to Geometry Lab.
- [x] Geometry Lab formula engine localized in `/Users/andrei/projects/klein-client`: 2D and 3D equations now share structured formula parsing/validation, GeoGebra-style math typography, formatted formula previews/labels, formula metadata in saved curve/surface entities, and reusable host exports for compile/validate/diagnostics.
- [x] Geometry Lab formula editor localized in `/Users/andrei/projects/klein-client`: the equation entry field is now a math-rendered editable control, so typed input such as `x^2`, `sqrt(x)`, and `pi` is displayed inline as `x²`, `√(x)`, and `π` while preserving validation and saved formula metadata.
- [x] Geometry Lab formula statement engine completed in `/Users/andrei/projects/klein-client`: authored text is preserved independently from canonical interpretation, KaTeX supplies professional HTML/MathML previews, arbitrary function and variable names are supported, point/line/segment/circle commands create native scene objects, affine equations become native lines, implicit 2D equations become curves, and implicit 3D equations are contoured into indexed smooth-normal meshes. A focused 25-case smoke suite and desktop/mobile browser verification cover precedence, aliases, arbitrary-variable binding, diagnostics, caret insertion, native deltas, and nonblank 3D output.
- [x] Client tool-workspace UX polish localized in `/Users/andrei/projects/klein-client`: tool routes suppress document scrolling and the global footer, the equation editor has no placeholder copy, tablet/mobile equation mode reserves keyboard space, and the workspace avoids toolbar/object/status overlap.
- [x] Geometry Lab professional workspace redesign localized in `/Users/andrei/projects/klein-client`: a narrow command rail replaces the always-expanded tool card, advanced tools use contextual drawers, the SVG/WebGL canvas is measured as a dedicated center stage, the object inspector is docked and collapsible, equations reuse the inspector with a tabbed math keyboard, 3D navigation is compact, and save/import/export/reset actions are consolidated in the host command bar. Client typecheck and production build pass.
- [x] Deployment blocker pass completed across `/Users/andrei/projects/klein-client` and `/Users/andrei/projects/klein-server`: admin uploads now include auth cookies and refresh retry, websocket origins use the configured allow-list, origin-less websocket handshakes are disabled by default, dirty whiteboard/GeoGebra rooms flush periodically with retry, and deploy docs now include Caddy TLS plus backup policy.
- [x] Deployment readiness re-audit completed on 2026-07-10: current SDK/client builds and SDK contract tests pass, vendored SDK hashes match, worktree counts are refreshed, and the plan now distinguishes external-preview blockers from post-v0 polish. The audit reopened CI branch triggers, empty public API URL handling, stale deployment instructions, proxy-aware rate limiting, and isolated restore verification as required release work.
- [x] Classroom/exam hardening pass completed across `/Users/andrei/projects/klein-tests` and `/Users/andrei/projects/klein-client`: opt-in live-backend smoke coverage now exercises real classroom assignment/student/review APIs, exam event/submission APIs, and generic websocket presence with live tickets; `ToolHost` lifecycle callbacks were stabilized after browser coverage exposed a remount loop.
- [x] Manual classroom/exam testability pass completed across `/Users/andrei/projects/klein-server` and `/Users/andrei/projects/klein-client`: local dev seed data now creates teacher/student/reviewer/admin accounts, a demo classroom, a published graphing assignment, student work, and a demo exam session; the client auth page exposes local demo quick-fill buttons and `/exam` exposes a manual exam launcher.
- [x] Release-configuration hardening completed locally across `/Users/andrei/projects/klein-tests`, `/Users/andrei/projects/klein-client`, and `/Users/andrei/projects/klein-server`: test CI now targets `master` and includes mobile/typecheck outcomes, blank public API URLs normalize to same-origin `/api`, stale package deployment instructions were replaced, deployment uses immutable per-service tags with rollback support, and target-host provisioning/env/verification helpers are checked in.
- [x] Local deployment recovery verification completed on 2026-07-11: an authenticated upload survived an API restart and matched byte-for-byte; `backup.sh` plus isolated `restore-smoke.sh` restored a 23-table Postgres database without touching the active Compose project.
- [x] Shared SDK theming completed across `/Users/andrei/projects/klein-sdk` and `/Users/andrei/projects/klein-client`: `klein-sdk/theme` exposes framework-independent semantic palette tokens, the native geometry/whiteboard DOM tools accept host palettes, and the client Geometry Lab/whiteboard adapters inherit Klein's active orange/teal/slate light or dark theme while accepting explicit host overrides.
- [x] SDK collaboration reliability completed: `klein-sdk/collab` now exposes a framework-independent revisioned WebSocket transport with bounded message/byte queues, serialized mutations, replay resume, resync handling, exponential reconnect backoff, snapshot checkpoints, and PostgreSQL-confirmed `persisted` acknowledgements. `npm run test:v0` includes and passes the deterministic fake-socket reliability suite.
- [x] Reference relay Phase 3 hardening completed: bounded rooms/connections/replay/outbound queues, UTF-8 payload limits, rate limiting, heartbeat and idle eviction, service separation, backend timeouts, retry/backoff with dirty-state retention, shutdown flush, persistence health/metrics, expiring durable-checkpoint waiters, revision CAS persistence, and reconnect replay are in place. Verification passes with 27 relay tests, 130 PostgreSQL-backed server tests, the SDK reliability smoke, the client production build, and 5 mocked classroom/exam browser flows.
- [x] Reference backend Phase 4 security-perimeter hardening completed: purpose-separated access/WebSocket JWT keys and claims, bounded single-use collaboration tickets, refresh-token families with deterministic replay revocation and active-session caps, exact browser-origin enforcement, trusted-proxy-aware endpoint rate limits, constant-time rotatable internal secrets, fixed security errors/headers, and loopback-only service ports are in place. Verification passes with 72 server unit/security tests, 150 PostgreSQL-backed server tests, 29 relay tests, and Flyway V1-V16 migration coverage.
- [x] Reference backend Phase 5 service/API hardening completed: classroom routes are split across focused controllers and management/student-work/live-session services, replay/mapping/locked-object/slug/JSON responsibilities are explicit, API failures use stable Problem Details, collection queries are bounded and deterministic with fetch plans, Open EntityManager in View is disabled, request validation is complete, and Flyway V17 adds supporting indexes. Verification passes with 77 server unit tests, 160 full PostgreSQL-backed server tests, 29 relay tests, SDK/client builds, and 5 mocked classroom/exam browser flows.
- [x] Reference backend Phase 6 quality/operations hardening completed: Java/Maven and JaCoCo floors, request correlation, liveness/readiness, Prometheus metrics, graceful shutdown, production image health checks, deployment validation, manual serialized deploys, and cross-repository CI gates are implemented. Verification passes with 79 API unit tests, 164 full PostgreSQL-backed server tests, 32 relay tests, fresh-database backend image smoke, and a healthy production client image.
- [x] Final client artifact verification caught and fixed blank `NEXT_PUBLIC_COLLAB_URL` handling: all collaboration surfaces now share validated URL normalization, release CI requires `wss://`, the deployment-config suite covers 12 cases, and all 5 mocked classroom/exam browser flows pass against the corrected production image.
- [x] Final local live-backend CI rehearsal passes all 3 contracts against disposable PostgreSQL and the production API/relay images: assignment-submit-review, exam integrity/submission, and ticketed generic WebSocket presence.
- [~] Target-host deployment verification is prepared, not executed: provision the selected VM and DNS, install real secrets, then run Caddy HTTPS/WSS/cookie/upload checks and the live classroom/exam/collab suite against staging.
- [ ] Run the opt-in live-backend classroom/exam/collab suite against Java-backed staging services before public deployment.
- [ ] Client standalone scientific calculator and probability calculator should be standardized on the same named persistent save/session model as whiteboard and Geometry Lab.
- [ ] Geometry Lab still needs graphing-mode slider variables, reflect-about-line, and translate-by-vector as first-class 2D tools.
- [ ] External `/projects/klein-tests` still needs staging live-backend cross-browser UI coverage; its CI topology and real Java/PostgreSQL backend contract job are implemented locally.

This plan narrows the earlier broad GeoGebra-style roadmap to the tools Klein actually wants to keep for deployment:

- Geometry Lab 2D graphing mode
- Geometry Lab 3D mode
- Scientific Calculator
- Probability / Statistics Calculator
- Classroom collaboration flows
- Exam-mode-compatible host hooks
- Whiteboard

Explicit v0 non-goals:

- CAS / Algebra Calculator
- Spreadsheet
- Full Calculator Suite / Classic workspace shell
- `.ggb` export or runtime compatibility
- Device-level exam lockdown inside the SDK

The SDK must remain framework-independent TypeScript. Hosts may use React, Next.js, Vue, Svelte, vanilla DOM, iframe embeds, Microsoft Teams, or Google Classroom, but the SDK cannot require any one of those frameworks.

## Reference Product Surfaces

The plan uses GeoGebra only as a feature reference, not as an implementation source:

- Calculator Suite: <https://www.geogebra.org/calculator>
- Graphing Calculator: <https://www.geogebra.org/graphing>
- 3D Calculator: <https://www.geogebra.org/3d>
- Scientific Calculator: <https://www.geogebra.org/scientific>
- Probability surface in Classic: <https://www.geogebra.org/probability>
- Classroom: <https://www.geogebra.org/classroom>
- Classroom tutorial: <https://www.geogebra.org/m/hncrgruu>
- Exam Mode: <https://www.geogebra.org/exam>

## Current SDK State

Implemented or substantially started:

- `klein-sdk/graphing`: real standalone graphing runtime with expressions, sliders, points, evaluation, sampling, roots, intersections, JSON/SVG/CSV export, and collaboration smoke tests. This remains a compatibility/headless SDK surface while the public client graphing experience moves into Geometry Lab.
- `klein-sdk/whiteboard`: real DOM/SVG whiteboard with tools, history, JSON/SVG/PNG export, and deltas.
- `klein-sdk/geometry-lab`: real 2D/3D scene model, semantic deltas, solids, sampled surfaces/curves, explicit equation surfaces, measurements, JSON export, shared runtime wrapper, and no-dependency SVG rendering/export.
- `klein-sdk/graphing-3d`: legacy compatibility facade over Geometry Lab for existing imports and launch aliases.
- `klein-sdk/scientific` / `klein-sdk/calculator`: deterministic scientific calculator runtime with history, deltas, validation, evaluation, JSON/text export, and shared runtime wrapper.
- `klein-sdk/probability`: probability/statistics runtime with distribution state, deltas, validation, basic distribution evaluation, JSON/CSV export, and shared runtime wrapper.
- `klein-sdk/collab`: host-owned collaboration contracts, in-memory transport, generic SDK collaboration envelopes, and a revision-aware WebSocket transport with bounded backpressure, resume/reconnect, checkpoints, and durable persistence acknowledgements.
- `klein-sdk/classroom`: data contracts plus `ClassroomRuntime`, policy gates, backend/storage adapter contracts, route constants, comments, freeze, submit, draft save, and replay hooks.
- `klein-sdk/exam`: soft exam-mode controller, profile gates, integrity events, browser watchers, and route constants.
- `klein-sdk/embed`: launch URL and host bridge helpers, including `exam`, `classroom`, `team`, signed/verified launch context, classroom events, and exam events.
- Reference server backend: classroom/exam REST/model slice implemented in `klein-server`; Maven unit and Docker-backed integration verification pass locally.
- Reference websocket backend: generic SDK tool envelope implemented in `klein-server/collab-websocket`; Maven unit and Docker-backed integration verification pass locally.

Not ready:

- The browser/client host now has first-pass standalone, classroom, review, student work, and exam UI wrappers, with named saves for whiteboard and Geometry Lab. Graphing-style equation authoring has been consolidated into Geometry Lab for the public client surface; scientific calculator and probability calculator still need the same named persistent save UX instead of only room/local-session continuity.
- Reference backend verification passes with explicit Homebrew `JAVA_HOME` and Docker Desktop running.
- Geometry Lab 3D mode is now usable as the v0 spatial calculator surface, but not yet a full GeoGebra-style WebGL tool with raycasting, advanced hit testing, implicit contouring, and PNG thumbnails.
- Classroom runtime, backend REST, and first-pass client flows are wired, including assignment work listing, live-session freeze controls, object-lock authoring UX, lock-aware student/review work, server-side locked-object enforcement, role-aware navigation, and REST-derived live presence monitoring. Websocket-backed team cursors/presence still need live-backend hardening.
- Exam mode exists as soft SDK/server/client hooks, but external host lockdown integration and signed-snapshot host verification are not wired yet.
- External `/projects/klein-tests` now covers SDK v0 contracts and first-pass mocked browser classroom/exam/client flows, but not live-backend cross-browser classroom/exam flows.

## v0 Completion Strategy

Build the SDK in this order:

1. Finish shared foundations that every kept tool needs.
2. Keep the SDK Graphing Calculator runtime stable, while moving the public client graphing workflow into Geometry Lab 2D mode.
3. Build Scientific Calculator on the shared math kernel.
4. Fold the 3D calculator surface into Geometry Lab.
5. Build Probability / Statistics on top of the same math and charting foundations.
6. Harden Whiteboard for classroom deployment.
7. Finish Classroom collaboration flows across all kept instruments.
8. Add Exam Mode host hooks and tool restrictions.
9. Package, test, and document the reduced v0 SDK.

This order avoids building feature silos. Geometry Lab graphing, scientific, and probability should share math parsing/evaluation. Graphing compatibility runtime, probability, Geometry Lab, and whiteboard should share export, history, validation, and collaboration behavior.

## Cross-Cutting Foundation Work

### F1. Public v0 Package Scope

Goal: make the package surface match the deployment promise.

Tasks:

- Keep public docs and examples focused on `graphing`, `geometry-lab` or `3d`, `calculator`, `probability`, `whiteboard`, `collab`, `classroom`, `embed`, `persistence`, and `core`.
- Mark `algebra`, `spreadsheet`, and `workspace` as experimental or internal in docs until they are real.
- Keep 3D/spatial authoring under `klein-sdk/geometry-lab`; do not add a separate public `klein-sdk/3d` surface for v0.
- Add package examples for each kept tool.
- Add one top-level "v0 supported tools" table to README.

Acceptance criteria:

- A host can import every v0 tool by subpath.
- No README or example advertises scaffold tools as production ready.
- `npm pack --dry-run` contains the v0 plan, README, dist files, and examples.

### F2. Shared Instrument Runtime

Goal: remove duplicated lifecycle behavior and stop using stubs for kept tools.

Files to add or split:

- `src/core/runtime.ts`
- `src/core/history.ts`
- `src/core/tools.ts`
- `src/core/validation.ts`
- `src/core/export.ts`
- `src/core/permissions.ts`

Runtime responsibilities:

- Snapshot ownership and cloning.
- Snapshot validation before load.
- Delta validation before apply.
- Delta metadata: id, actor, source, timestamp, revision.
- Undo/redo based on inverse deltas where possible.
- Batch deltas.
- Read-only and restricted-mode gates.
- Tool definition registry.
- Export registry.
- Diagnostics and typed errors.

Acceptance criteria:

- Graphing, whiteboard, scientific calculator, probability, and 3D use the runtime.
- Local deltas can be emitted to collaboration transports.
- Remote deltas apply without echo.
- Invalid snapshots and deltas do not mutate state.
- Undo/redo is covered by shared runtime tests.

### F3. Math Kernel

Goal: one safe math core for graphing, scientific calculator, and probability/statistics.

Files to add or split:

- `src/math/ast.ts`
- `src/math/parser.ts`
- `src/math/evaluate.ts`
- `src/math/format.ts`
- `src/math/numeric.ts`
- `src/math/exact.ts`
- `src/math/statistics.ts`
- `src/math/probability.ts`
- `src/math/random.ts`

Required v0 capabilities:

- Arithmetic, unary operators, functions, constants, variables.
- Equality and inequality AST nodes.
- Lists and point lists.
- Piecewise expressions.
- Function calls with a safe registry.
- Degrees/radians handling.
- Exact fractions for calculator output where feasible.
- Decimal output with configurable precision.
- Complex-number type and operations for calculator internals, even if graphing only plots real values.
- Root, intersection, extrema, derivative approximation, integral approximation.
- Summary statistics: count, sum, mean, median, quartiles, variance, sample/population standard deviation, MAD.
- Probability helpers: PDF, CDF, inverse CDF, PMF, random sampling.

Security rules:

- No `eval`.
- No dynamic function constructors.
- No host globals.
- Bounded parser input length.
- Bounded numeric iteration count.
- Typed diagnostics for unsupported or divergent input.

Acceptance criteria:

- Graphing and scientific calculator parse the same expression syntax.
- Probability/statistics uses the same summary-statistics code as scientific calculator.
- Numeric tests have tolerances and known reference cases.
- Malformed expression fuzz tests do not throw uncaught exceptions.

### F4. Renderer and Export Boundaries

Goal: keep models pure and renderers replaceable.

Required adapters:

- SVG/Canvas 2D for graphing.
- SVG/Canvas 2D for whiteboard.
- WebGL/Three.js adapter for 3D.
- SVG/Canvas chart adapter for probability.
- JSON export for all tools.
- SVG export for graphing, probability, and whiteboard.
- PNG/thumbnail export for graphing, probability, 3D, and whiteboard.
- CSV export for graphing tables and probability/statistics tables.

Acceptance criteria:

- Snapshots do not contain DOM nodes, canvas state, WebGL objects, or Three.js objects.
- Export output is generated from snapshot/model state.
- Renderer smoke tests check nonblank output and stable bounds.

### F5. Test Harness

Goal: every v0 tool has the same quality bar.

Add scripts:

- `test:graphing`
- `test:calculator`
- `test:3d`
- `test:probability`
- `test:whiteboard`
- `test:classroom`
- `test:exam`
- `test:v0`

Test categories per tool:

- Pure model tests.
- Snapshot validation tests.
- Delta apply and inverse tests.
- Import/export round-trip tests.
- Collaboration convergence tests.
- Renderer smoke tests.
- Malformed input tests.
- Type-only public API tests.

Acceptance criteria:

- `npm run test:v0` runs all v0 tool smoke tests after `npm run build`.
- CI can run the SDK tests without a browser server.
- Browser-only renderer tests are isolated and can run under Playwright.

## 1. Geometry Lab 2D Graphing And SDK Graphing Compatibility

Module: `klein-sdk/graphing`

Current status: the SDK graphing runtime is partially production-capable and remains available for compatibility/headless consumers. It already has a real instrument, math evaluation, sampling, roots/intersections, JSON/SVG/CSV export, and collaboration smoke tests. The public client no longer exposes a standalone graphing calculator card; graphing-style equation authoring now lives inside Geometry Lab 2D mode.

### v0 Feature Target

Expression and object support:

- Explicit functions: `y = f(x)` and `f(x) = ...`
- Equations in `x` and `y`
- Inequalities with shaded regions
- Parametric curves
- Polar curves
- Piecewise functions
- Domain and range restrictions
- Lists and point lists
- Manual points
- Sliders and variables
- Tables connected to expressions

Analysis support:

- Roots/zeros
- Intersections
- Local extrema
- Trace
- Tangent line
- Numerical derivative
- Definite integral and area shading
- Regression: linear, polynomial, exponential, logarithmic, power
- Basic statistics plots: scatter, histogram, box plot

Host-facing UI metadata:

- Tool definitions for select, pan, zoom, point, expression, slider, table, trace, root, intersection, extremum, tangent, integral, regression, style.
- Expression-row metadata so hosts can render their own rows.
- Keyboard command metadata.

### Implementation Steps

1. Freeze `GraphingSnapshot` v1 or create v2 if breaking fields are needed.
2. Add expression kinds for implicit, inequality, parametric, polar, piecewise, table, and regression.
3. Move evaluator and plotting helpers into smaller engine files.
4. Add adaptive plotting for explicit, parametric, and polar curves.
5. Add marching-squares contouring for implicit equations.
6. Add inequality region rendering.
7. Add domain restriction clipping.
8. Add table model and CSV export for sampled data.
9. Add regression helpers using `math/statistics`.
10. Add analysis objects as persisted derived objects, not transient UI state.
11. Add style model for color, stroke, dash, visibility, labels, and point glyphs.
12. Add tool metadata and host-rendered expression row API.
13. Add collaboration compaction for slider drags and viewport changes.
14. Add Playwright canvas/SVG smoke tests for nonblank plots.

### Acceptance Criteria

- `createGraphingCalculator()` works without a DOM container.
- Mount/destroy works with a DOM container.
- JSON import/export round-trips.
- SVG export contains visible plotted objects for supported expression kinds.
- CSV export includes expression/table data.
- Two in-memory collaborative graphing instruments converge after expression edits and slider drags.
- Invalid expressions produce diagnostics without corrupting the snapshot.
- Existing `scripts/graphing-smoke.mjs` is expanded to cover expression kinds, analysis, export, and collaboration.

## 2. Geometry Lab 3D Mode

Module: `klein-sdk/geometry-lab`

Legacy compatibility alias: `klein-sdk/graphing-3d` remains available for existing consumers, but new host code should use `geometry-lab`.

Current status: the SDK has a 3D scene model, 3D points, lines, segments, work planes, measurements, solids, nets, sampled surfaces/curves, explicit equation surfaces, JSON export, SVG export, a first-class `geometry-lab` runtime, and a legacy `graphing-3d` facade. The reference React Geometry Lab editor also exposes a 3D equation tool, implicit-equation contouring, and smooth indexed mesh rendering for equation surfaces. It is usable as the v0 spatial calculator surface, while SDK-level implicit contouring, advanced hit testing, and PNG thumbnails remain post-v0 hardening.

### v0 Feature Target

3D navigation:

- Orbit
- Pan
- Zoom
- Fit
- Camera presets: front, top, side, isometric
- Perspective/orthographic projection
- Work-plane selection

3D construction:

- Point
- Point on object
- Line
- Segment
- Ray
- Vector
- Polygon
- Plane through three points
- Plane by equation
- Plane parallel/perpendicular
- Sphere by center and point
- Sphere by center and radius
- Cube/cuboid
- Prism
- Pyramid
- Cylinder
- Cone
- Surface `z = f(x, y)`
- Explicit equation surface `x = f(y, z)`, `y = f(x, z)`, or `z = f(x, y)`
- Parametric curve
- Parametric surface
- Intersection point/line/curve
- Cross-section
- Net/unfold for common solids

3D measurements:

- Distance/length
- Area
- Surface area
- Volume
- Angle
- Dihedral angle
- Point-plane distance
- Line-plane and plane-plane intersections

### API Shape

Use Geometry Lab directly:

```ts
import { createGeometryLabRuntime } from 'klein-sdk/geometry-lab';

const lab = createGeometryLabRuntime();
lab.execute({
  type: 'addEquationSurface3D',
  payload: { input: 'y = x^2 + z^2', samples: 56 },
});
```

Required public helpers:

- `createEmptyGeometryLabSnapshot()`
- `validateGeometryLabSnapshot()`
- `parseGeometryLabSnapshotJson()`
- `validateGeometryLabDelta()`
- `createGeometryLab()`
- `createGeometryLabRuntime()`
- `compileEquationSurface3D()`

### Implementation Steps

- [x] Decide whether 3D calculator uses `GeometryLabSnapshot` with `activeView: '3d'` or a narrower `ThreeDCalculatorSnapshot`.
- [x] Add a focused `graphing-3d` wrapper around 3D Geometry Lab behavior.
- [x] Move the public v0 registry from standalone `graphing-3d` to `geometry-lab`, with legacy aliases still supported.
- [x] Add a no-dependency SVG renderer/export adapter for the v0 browser and headless test surface.
- [x] Add basic command controllers for points, segments, solids, surfaces, measurements, and camera presets.
- [x] Add surface mesh generation with bounded resolution.
- [x] Add explicit equation surface sampling for `x = f(y,z)`, `y = f(x,z)`, and `z = f(x,y)`.
- [x] Add parametric curve sampler support.
- [x] Add JSON and SVG export.
- [x] Add the equation-surface tool to the full Geometry Lab editor and render persisted equation meshes in SVG/WebGL.
- [x] Remove the standalone 3D calculator from client navigation and redirect legacy 3D URLs into Geometry Lab.
- [x] Add smoke tests that verify nonblank SVG output and client rendering.
- [ ] Add camera/view collaboration compaction beyond snapshot sync.
- [ ] Add intersection algorithms and persisted intersection entities.
- [ ] Add cross-section generation for cube/cuboid/prism/pyramid/cylinder/cone.
- [ ] Add net generation for common solids beyond the existing solid metadata.
- [ ] Add richer parametric surface samplers.
- [ ] Add contour/marching support for broader implicit equations.
- [ ] Add PNG/thumbnail export.
- [ ] Post-v0: add Three.js/WebGL renderer adapter behind an interface.
- [ ] Post-v0: add raycasting, advanced hit testing, work-plane snapping, and placement.
- [ ] Post-v0: add WebGL renderer tests that verify a nonblank canvas and correct camera framing.

### Acceptance Criteria

- 3D snapshots never contain renderer objects.
- A 3D scene can be created, edited, serialized, loaded, and rendered.
- At least point, segment, plane, cube, sphere, surface, measurement, and camera tools are usable in v0.
- JSON export/import round-trips.
- SVG export works in headless and browser-capable tests.
- PNG/thumbnail export works in browser-capable tests after the WebGL/export adapter lands.
- Two collaborative 3D instruments converge after object and camera deltas.
- Headless tests cover geometry math without Three.js.
- Browser tests cover renderer smoke and hit testing.

## 3. Scientific Calculator

Module: `klein-sdk/calculator`

Current status: scaffold only. `createScientificCalculator()` returns `createStubInstrument`.

### v0 Feature Target

Input and evaluation:

- Arithmetic
- Fractions and mixed numbers
- Decimal mode
- Constants: `pi`, `e`
- Powers and roots
- Logs: `ln`, `log10`, arbitrary-base log if simple
- Trig and inverse trig
- Degrees and radians
- Percent
- Factorial
- Permutations and combinations
- Absolute value
- Rounding
- Random number generation
- Variables `a` through `z`
- Previous answer `ans`

Statistics helpers:

- `mean`
- `median`
- `stdev`
- `stdevp`
- `sum`
- `quartiles`
- `mad`

State:

- History entries
- Reusable results
- Memory slots
- Angle mode
- Output mode
- Precision
- Optional deterministic RNG seed for tests

### Implementation Steps

1. Replace `createStubInstrument` with a runtime-backed `ScientificCalculatorInstrument`.
2. Add `evaluate(input: string): CalculatorEntry` method.
3. Store both source text and parsed AST in history entries where useful.
4. Add exact/decimal formatting.
5. Add angle-mode conversion in math function registry.
6. Add memory deltas.
7. Add history delete/clear deltas.
8. Add keypad/tool metadata for host-rendered calculator UIs.
9. Add JSON export/import.
10. Add text export for history if useful.
11. Add collaboration tests for shared calculator history.

### Acceptance Criteria

- `createScientificCalculator()` works without DOM.
- Calculator can evaluate supported expressions through the public API.
- History, memory, angle mode, and output mode are persisted in snapshots.
- Invalid input creates typed diagnostics, not corrupted entries.
- Undo/redo works for entries and memory changes.
- JSON export/import round-trips.
- `npm run test:calculator` covers arithmetic, trig modes, history, memory, exact/decimal formatting, and collaboration.

## 4. Probability / Statistics Calculator

Module: `klein-sdk/probability`

Current status: scaffold only. `createProbabilityExplorer()` returns `createStubInstrument`.

### v0 Feature Target

Distributions:

- Normal
- Student t
- Chi-square
- F
- Binomial
- Poisson
- Uniform
- Exponential

Probability workflows:

- PDF/PMF at value
- CDF
- Interval probability
- Inverse probability
- Shaded interval graph
- Critical values

Statistics workflows:

- Data table input
- Summary statistics
- Histogram
- Box plot
- Scatter plot
- Linear regression
- One-sample z/t tests
- Two-sample t test
- One-proportion z test
- Two-proportion z test
- Chi-square goodness-of-fit
- Chi-square independence
- Confidence intervals for mean and proportion
- Random sampling and simulation with seed support

### Snapshot Model

Expand `ProbabilityScene` to include:

- `datasets`
- `distributions`
- `calculations`
- `charts`
- `simulations`
- `results`
- `order`

Expand `ProbabilityDelta` to include:

- Add/update/delete dataset.
- Add/update/delete distribution.
- Add/update/delete calculation.
- Add/update/delete chart.
- Run simulation with persisted seed and result summary.
- Set active result.
- Batch.

### Implementation Steps

1. Replace `createStubInstrument` with a runtime-backed `ProbabilityInstrument`.
2. Add probability kernel functions in `math/probability`.
3. Add statistics helpers in `math/statistics`.
4. Add seeded RNG in `math/random`.
5. Add distribution parameter validators.
6. Add CDF/inverse CDF implementations with accuracy tests.
7. Add hypothesis-test workflow objects.
8. Add confidence-interval workflow objects.
9. Add chart model and SVG/PNG renderer.
10. Add CSV import/export for datasets and result tables.
11. Add collaboration tests for datasets, calculations, and simulations.

### Acceptance Criteria

- Distributions produce numerically stable PDF/PMF/CDF values within documented tolerances.
- Inverse CDF returns values that round-trip through CDF within tolerance.
- Datasets and calculation results persist in JSON.
- Charts render from model state and export to SVG.
- CSV import/export round-trips common datasets.
- Simulation output is deterministic when a seed is supplied.
- `npm run test:probability` covers distribution math, inference workflows, charts, CSV, and collaboration.

## 5. Classroom Collaboration Flows

Modules: `klein-sdk/classroom`, `klein-sdk/collab`, `klein-sdk/persistence`, `klein-sdk/integrations`

Current status: contracts exist, but the flows are not yet a cohesive SDK workflow layer.

### v0 Feature Target

Teacher workflows:

- Create template from any kept instrument snapshot.
- Lock starter objects.
- Create assignment from template.
- Start live session.
- Freeze/unfreeze student editing.
- Monitor started/not-started/in-progress/submitted state.
- View live snapshots or thumbnails.
- Ask a class question.
- Hide student names when presenting responses.
- Add co-teacher metadata.
- Review submitted work.
- Return work with comments and score metadata.

Student workflows:

- Create student copy from template.
- Work individually or in a team session.
- Autosave with optimistic revisions.
- Submit work.
- Receive returned work and comments.
- Join live collaboration when enabled.

Shared collaboration behavior:

- Presence
- Cursors
- Selection
- Active tool
- Actor colors
- Permissions
- Replay from delta history
- Read-only share links

### SDK Boundary

The SDK owns:

- Data contracts.
- Permission policy helpers.
- Session ids.
- Snapshot and delta replay helpers.
- Local in-memory collaboration adapters.
- Storage adapter contracts.
- Host integration URL helpers.

The host owns:

- Auth.
- Rosters.
- Network transport.
- Server persistence.
- Push notifications.
- LMS APIs.
- Moderation policy.

### Implementation Steps

1. Add a `ClassroomRuntime` helper that binds an instrument, classroom state, permission policy, storage adapter, and collaboration transport.
2. Add `applyClassroomPolicy()` to gate local deltas before they reach instruments.
3. Add role presets for teacher, student, reviewer, co-teacher, and read-only viewer.
4. Add `createStudentCopyFromAssignment()` with starter-object locking support.
5. Add autosave controller with optimistic revisions.
6. Add replay recorder that stores delta envelopes, not screenshots.
7. Add replay player with seek, step, and range export.
8. Add comment helpers for object-linked and whole-document comments.
9. Add live-monitor helpers that produce lightweight thumbnails or snapshot summaries.
10. Add question/response contracts for multiple-choice and open questions.
11. Add examples for web host, Teams, and Google Classroom launches.

### Acceptance Criteria

- A host can create a teacher template from graphing, 3D, calculator, probability, or whiteboard snapshots.
- A host can create a student copy and enforce locked starter objects.
- Teacher freeze prevents local student deltas before they mutate state.
- Live collaboration works with in-memory transport in tests.
- Replay reconstructs a final snapshot from an initial snapshot plus deltas.
- Autosave detects stale revisions.
- Comments can attach to object ids for all kept instruments.
- `npm run test:classroom` covers template, assignment, student copy, freeze, submit, review, comments, and replay.

## 6. Exam-Mode-Compatible Host Hooks

Module: `klein-sdk/embed`

Optional future module: `klein-sdk/exam` if the schema grows too large for `embed`.

Current status: no dedicated exam mode schema or event stream.

### v0 Principle

The SDK can provide exam-compatible hooks, but it must not claim device-level enforcement. Full lockdown requires the host environment, such as browser kiosk mode, native wrapper, MDM, Safe Exam Browser, or a school-managed testing platform.

### v0 Feature Target

Exam profile:

- Allowed tools.
- Blocked tools.
- Allowed expression features.
- Allowed calculators.
- Read-only starter content.
- Collaboration disabled/enabled.
- Import disabled/enabled.
- Export disabled/enabled.
- Clipboard disabled/enabled where browser APIs permit.
- Time window metadata.
- Locale.
- Student/session identifiers supplied by host.

Runtime restrictions:

- Tool allowlist enforcement.
- Delta allowlist enforcement.
- Snapshot import gate.
- Export gate.
- Collaboration gate.
- Read-only mode.
- Disabled external links.

Integrity events:

- Exam started.
- Exam ended.
- Focus lost/restored.
- Visibility hidden/visible.
- Fullscreen left/entered.
- Network offline/online.
- Clipboard attempt when detectable.
- Import/export attempt.
- Blocked tool attempt.
- Snapshot hash created.

Host hooks:

- `onExamEvent(event)`
- `signSnapshot(snapshot, context)`
- `verifySnapshot(snapshot, signature, context)`
- `requestFullscreen()`
- `requireHostLockdown()`

### Implementation Steps

1. Add `ExamProfile`, `ExamSessionContext`, and `ExamIntegrityEvent` types.
2. Add `createExamPolicy(profile)` to produce core permission gates.
3. Add `applyExamProfile(instrument, policy)` helper.
4. Add per-tool mapping from instrument tools to exam capabilities.
5. Add integrity event monitor for focus, visibility, fullscreen, and network.
6. Add snapshot hashing helper.
7. Add host-owned signing callback interface.
8. Add launch URL support for `mode=exam`.
9. Add bridge messages for exam events.
10. Add tests for blocked tools, blocked export/import, read-only mode, and event emission.

### Acceptance Criteria

- Any kept instrument can be run under an exam profile.
- Blocked tools and blocked deltas fail before mutation.
- Graphing/scientific/probability profiles can be configured independently.
- Exam events are emitted but do not depend on one browser vendor.
- Snapshot hash is deterministic for equivalent JSON.
- The docs clearly state what the SDK can and cannot enforce.
- `npm run test:exam` covers profiles, gates, launch parsing, bridge messages, and integrity events.

## 7. Whiteboard

Module: `klein-sdk/whiteboard`

Current status: real DOM/SVG instrument with tools, history, JSON/SVG/PNG export, and deltas.

### v0 Feature Target

Keep and harden:

- Select
- Pan
- Pen
- Highlighter
- Eraser
- Shapes
- Lines/arrows/connectors
- Text
- Sticky notes
- Image elements
- Stamps
- Frames
- Templates
- Undo/redo
- JSON/SVG/PNG export

Add before deployment:

- Strong snapshot validation.
- Delta validation.
- Tool metadata for host-rendered UI.
- Object comments and presence overlays.
- Frame/page export helpers.
- Embedded graphing/probability snapshot card elements.
- Image asset reference policy, not raw unbounded blobs by default.
- Collaboration compaction for drag/ink.
- Large-board performance budget.
- Accessibility labels and keyboard navigation for core tools.

Post-v0 stretch:

- PDF export.
- Shape recognition.
- Ruler/straightedge.
- Ink smoothing controls.
- Whiteboard templates for specific lessons.

### Implementation Steps

1. Move whiteboard onto shared runtime.
2. Add `validateWhiteboardSnapshot()` and `validateWhiteboardDelta()`.
3. Add element schema guards for every element kind.
4. Add `getWhiteboardToolDefinitions()` with stable ids and shortcuts.
5. Add comment/presence overlay contracts.
6. Add frame/page export helper API.
7. Add embedded snapshot card element for graphing/probability outputs.
8. Add image asset policy: URL/reference ids by default, size-limited data URLs only if enabled.
9. Add stroke and drag delta compaction.
10. Add renderer performance tests with large scenes.

### Acceptance Criteria

- Existing whiteboard behavior remains compatible.
- JSON/SVG/PNG export continues to work.
- Malformed snapshots and deltas are rejected before mutation.
- In-memory collaboration convergence tests pass.
- Comments and presence can be rendered by a host without framework-specific code.
- Large whiteboard smoke test stays within agreed time and memory budget.
- `npm run test:whiteboard` covers tools, validation, export, history, collaboration, and large-board behavior.

## Deployment-Focused Release Phases

### Phase 0 - Scope Lock

Status: mostly complete; docs still need final cleanup.

Tasks:

- [x] Add this v0 plan to docs.
- [x] Mark CAS, spreadsheet, and workspace as out of v0.
- [x] Decide `klein-sdk/3d` subpath versus `geometry-lab` only. Current implementation uses `klein-sdk/geometry-lab`; `klein-sdk/graphing-3d` is compatibility only.
- [x] Decide if v0 docs use "3D Calculator" as product name while the module remains `geometry-lab`. Current product surface is Geometry Lab 3D mode, not a separate calculator.

Exit criteria:

- [x] README and package docs match the kept-tool list.
- [ ] No deployment page advertises unfinished tools.

### Phase 1 - Foundations

Status: mostly complete in SDK; renderer-test hardening remains.

Tasks:

- [x] Shared runtime.
- [x] Math kernel split and hardening started.
- [x] Export registry.
- [x] Permission policy hooks.
- [x] Test harness scripts.

Exit criteria:

- [x] `npm run test:v0` exists.
- [x] Graphing and whiteboard still pass current smoke tests.
- [x] Scientific/probability no longer use stubs once their runtime work starts.

### Phase 2 - Calculator Tools

Status: first runtime pass complete; UI/renderer polish and broader tests remain.

Tasks:

- [x] Keep the SDK Graphing Calculator runtime available for compatibility and headless consumers.
- [x] Fold public client graphing entry points into Geometry Lab 2D mode.
- [x] Build Scientific Calculator.
- [x] Build Probability / Statistics Calculator.

Exit criteria:

- [ ] Graphing, scientific, and probability all support headless use, DOM mount, JSON export/import, collaboration, and smoke tests.

### Phase 3 - Geometry Lab 2D/3D

Status: v0 spatial calculator surface complete inside Geometry Lab, with the public client graphing workflow now consolidated into Geometry Lab 2D mode. The SDK exposes a first-class `geometry-lab` runtime, legacy `graphing-3d` facade, core 3D commands, sampled surfaces/curves, explicit equation surfaces, 2D function-curve sampling, root/extremum markers, explicit 2D lines/intersections, measurement commands, camera presets, snapshot validation, JSON export/import, and no-dependency SVG render/export. The reference React editor now exposes a KaTeX-backed statement editor, native point/line/segment/circle creation, implicit 2D curves, and smooth indexed implicit/explicit 3D equation meshes. Full GeoGebra-grade advanced hit testing, SDK-level implicit contouring, and PNG thumbnails remain post-v0 hardening.

Tasks:

- [x] Add Geometry Lab runtime wrapper for 3D/spatial authoring.
- [x] Retire standalone 3D calculator registry entry in favor of `geometry-lab`.
- [x] Add framework-independent SVG renderer/export adapter.
- [x] Add 3D commands for points, segments, cube, sphere, sampled surfaces, explicit equation surfaces, measurement, and camera preset workflows.
- [x] Wire 3D client quick actions through the shared `ToolHost`.
- [x] Add the equation-surface tool to the full Geometry Lab editor and render persisted equation meshes in SVG/WebGL.
- [x] Remove the standalone 3D calculator from client navigation and redirect legacy 3D URLs into Geometry Lab.
- [x] Add the equation tool to Geometry Lab 2D mode and render sampled function curves with root/extremum markers.
- [x] Add explicit 2D line and intersect tools to Geometry Lab.
- [x] Upgrade equation authoring to a geometry statement engine with preserved authored input, KaTeX output, native point/line/segment/circle deltas, arbitrary identifiers, actionable validation diagnostics, implicit 2D curves, and implicit 3D mesh contouring.
- [x] Remove the standalone graphing calculator from client navigation and redirect legacy graphing URLs into Geometry Lab.
- [x] Add SDK and browser smoke coverage for 3D object creation/rendering/autosave.
- [ ] Post-v0: add a framework-independent Three.js/WebGL renderer adapter inside the SDK package.
- [ ] Post-v0: add raycasting, advanced hit testing, work-plane snapping, PNG thumbnails, and richer 3D object authoring UI.

Exit criteria:

- [x] Geometry Lab 2D/3D mode supports core scene authoring, rendering, JSON export/import, SDK runtime contracts, and classroom/exam host embedding.

### Phase 4 - Classroom and Exam

Status: v0 beta implementation complete across SDK contracts, reference backend code, client routes, mocked browser coverage, role-aware classroom navigation, REST-derived live presence monitoring, Docker-backed server integration verification, and a required real-backend CI contract job. Staging live-backend cross-browser UI verification remains a deployment gate.

Tasks:

- [x] Classroom runtime and permissions.
- [x] Assignment/student-copy/review/replay SDK/backend flows.
- [x] Exam profiles and integrity events.
- [x] Host bridge messages for classroom and exam events.
- [x] Standalone client `ToolHost` route for v0 tools.
- [x] Client classroom authoring/student/review surfaces.
- [x] Client exam launch/status/event surfaces.
- [x] Client assignment work list, review links, live-session create/list, and freeze/unfreeze controls.
- [x] First-pass mocked browser E2E for classroom and exam routes.
- [x] Browser E2E covers graphing student work, 3D student work rendering/autosave, teacher assignment/live-session controls, and exam event/submission flows with mocked APIs.
- [x] Phase 6 hardening: object-lock authoring UI, student-work lock visibility, client snapshot guard, server enforcement, and browser/server coverage.
- [x] Phase 6 hardening: client classroom live presence monitor and richer role-aware work navigation.
- [x] Phase 6 hardening: websocket-backed team cursor/presence verification test coverage added for live backend services.
- [x] Phase 6 hardening: live-backend classroom/exam API smoke coverage added for Java-backed services.
- [x] Phase 6 hardening: wire the live-backend classroom/exam/collab contract suite into CI with PostgreSQL, the Java API, and the collaboration relay.
- [ ] Phase 6 hardening: execute the live-backend suite against HTTPS staging and expand the real-service UI coverage across the release browser matrix.
- [x] Phase 6 hardening: backend integration test verification on a Docker-capable runner.

Exit criteria:

- [x] A host can run graphing, Geometry Lab, scientific, probability, and whiteboard inside assignment and exam modes through the shared SDK runtime and client `ToolHost`.

### Phase 5 - Whiteboard Hardening

Status: v0 SDK hardening complete. The whiteboard has strong snapshot/delta validation, host-rendered tool metadata, delta compaction, presence/comment contracts, frame SVG export helpers, embedded calculator cards, and large-board smoke coverage. Richer threaded comment UI, roster/presence panels, and advanced board authoring controls remain client-side polish.

Tasks:

- [x] Validation.
- [x] Collaboration compaction.
- [x] Presence/comments contracts.
- [x] Frame exports.
- [x] Embedded calculator cards.
- [x] Large-board tests.

Exit criteria:

- [x] Whiteboard is deployable as a classroom-first SDK tool.

### Phase 6 - Packaging and Deployment Gates

Status: packaging, local quality gates, and production-image verification are complete. The SDK and client expose consolidated `test:ci` gates, the client installs a hash-matched vendored SDK tarball, the server enforces integration and JaCoCo floors, and all three runtime images pass health checks. The remaining release work is deliberately deferred worktree review/push plus target-host DNS, TLS, staging, monitoring, and off-host-backup verification.

Tasks:

- [x] Update README and hosted app scaffold notes.
- [x] Add API docs for every v0 subpath.
- [x] Generate local package tarball from clean build.
- [x] Make `npm run build`, `npm run test`, and `npm run test:v0` pass in the SDK workspace.
- [x] Make `/projects/klein-tests` SDK suite cover all v0 tools.
- [x] Align reference server REST model with classroom/exam SDK contracts.
- [x] Verify reference server unit tests with Java/Maven.
- [x] Verify reference server Docker-backed integration tests on a Docker-capable runner.
- [x] Align standalone v0 client sessions with `klein-sdk` package output.
- [x] Vendor SDK release tarballs into `klein-client` so CI/Docker installs do not depend on local sibling paths.
- [x] Restore `klein-client` lint as a working TypeScript gate.
- [x] Add SDK CI for typecheck, v0 smoke, and package dry run.
- [x] Finish `/projects/klein-tests` CI topology: active `master` triggers, explicit cross-repository checkouts, read-only permissions, required mobile results, and a real PostgreSQL/API/relay contract job.
- [x] Make server integration tests a required CI gate.
- [x] Add enforced JaCoCo line/branch floors and a single backend quality-gate command.
- [x] Add client, API, and relay liveness/readiness contracts plus production-image health smoke before publication/deployment.
- [x] Add request correlation, Prometheus exposure, operator alert guidance, and post-deploy endpoint verification.
- [x] Make production deployment manual, serialized, health-waiting, and followed by smoke verification.
- [x] Normalize an empty `NEXT_PUBLIC_API_URL` to `/api` so Docker/GitLab builds cannot silently request `/auth/*` instead of `/api/auth/*`.
- [x] Replace stale `klein-whiteboard-sdk` and private npm-token instructions in `klein-server/deploy/README.md` with the committed `klein-sdk` vendor artifact flow.
- [x] Correct the backup restore runbook so the smoke drill uses isolated restore volumes/project names and cannot run `pg_restore --clean` against the active deployment database; the first local drill restored 23 tables successfully.

Exit criteria:

- [ ] Clean SDK worktree except intended release artifacts.
- [x] Client can install SDK from the release source without local sibling assumptions.
- [x] Server accepts and persists graphing, Geometry Lab, scientific, probability, and whiteboard snapshots.
- [x] SDK tests are part of CI before deployment.
- [x] Deployment env and reverse proxy docs match the actual vendored SDK and same-origin API deployment path.
- [x] Backup/storage policy includes a verified, isolated restore drill for Postgres and uploaded resource files.

## Server and Client Alignment Needed

SDK-only work is not enough for deployment. The host stack must align with the reduced v0 tool list.

Server:

- [x] Add reference classroom/exam schema around `tool_sessions`.
- [x] Add classroom roles and RBAC service logic for teacher, co-teacher, student, reviewer, guest, and admin.
- [x] Add classroom assignment, student work, comments, replay, submit/return, and freeze endpoints.
- [x] Add exam sessions, events, stop, and submission endpoints.
- [x] Add generic collab websocket `tool` envelope while preserving legacy whiteboard/geogebra messages.
- [x] Verify server compile/unit tests with Java/Maven.
- [x] Verify server Docker-backed integration tests once Docker/Testcontainers is available.
- [x] Add/confirm snapshot validators for `calculator`, `probability`, and the final Geometry Lab snapshot shape after server verification.
- [ ] Add migration strategy if graphing snapshot schema moves from v1 to v2.

Client:

- [x] Remove deprecated `@kleinmath/*` package imports and tarballs; temporary host-owned adapters now live in `/Users/andrei/projects/klein-client/components/tool-adapters`.
- [x] Add a shared `ToolHost` that selects graphing, Geometry Lab/legacy 3D aliases, scientific, probability, or whiteboard by `toolKey`.
- [x] Route standalone graphing, scientific, and probability sessions through `ToolHost`; Geometry Lab uses its dedicated saved-session editor.
- [x] Add named multi-save lobby and full saved-session editor route for Geometry Lab.
- [ ] Generalize named persistent saves for standalone graphing, scientific calculator, and probability calculator.
- [x] Hide CAS, spreadsheet, and classic workspace from v0 navigation.
- [x] Add classroom teacher assignment authoring, student work, and review surfaces around the SDK contracts.
- [x] Add classroom monitor controls for assignment work, review links, live-session create/list, and freeze/unfreeze.
- [x] Add exam-mode launch/status/event UI with clear soft-enforcement wording.
- [x] Add object-lock authoring UI and lock-aware `ToolHost`/student-work surfaces.
- [x] Add classroom live-session presence monitor and role-aware classroom navigation polish.
- [ ] Add websocket-backed team cursor/presence verification against live backend.

Tests:

- [x] Extend `klein-tests/tests/sdk` to cover all v0 tools.
- [ ] Add E2E smoke for each deployed tool route.
- [ ] Add classroom flow E2E: teacher creates assignment, student opens copy, student submits, teacher reviews.
- [ ] Add exam mode E2E: profile blocks disallowed tools and emits focus/fullscreen events.

## v0 Definition of Done

The SDK is ready for deployment when all items are true:

- No kept tool uses `createStubInstrument`.
- Graphing, Geometry Lab, scientific, probability, classroom, exam, and whiteboard APIs are documented.
- Every kept tool has snapshot validation, delta validation, JSON export/import, undo/redo, and collaboration smoke coverage.
- Browser-rendered tools have nonblank renderer smoke tests.
- Malformed math/snapshot inputs are rejected safely.
- Exam mode docs state host enforcement limitations.
- Classroom flows work with host-owned auth, storage, and transport.
- `npm run build` passes.
- `npm run test:v0` passes.
- `klein-tests` SDK suite passes against built `dist`.
- Client imports from deployable SDK artifacts.
- Server validates and persists all kept tool snapshots.
- README advertises only deployable v0 tools.

## Deployment Readiness Snapshot - 2026-07-14

Current assessment:

- Feature implementation: approximately 90% of the intended v0 product surface is present.
- Private external preview readiness: approximately 85%. Local production-style Docker verification, enforced quality/coverage gates, runtime image health, upload restart durability, and isolated backup recovery pass; deferred release review and target-host verification remain.
- Public v0 readiness: approximately 70%. Public launch additionally requires HTTPS/domain verification, production guardrail copy, staging smoke/cross-browser coverage, external monitoring, and off-host backup automation.

Green gates confirmed in the latest audit:

- [x] `klein-sdk`: typecheck, v0 build/smoke, and package dry run pass.
- [x] `klein-client`: Geometry Lab formula suite (25 checks), full typecheck, and production build pass.
- [x] `klein-tests`: SDK contract suite (6 tests) and direct TypeScript check pass.
- [x] Client and SDK release tarballs have matching SHA-256 hashes.
- [x] Local production-style Docker deployment, server unit/integration tests, classroom/exam browser smoke, and live API/collab smoke passed in the previous deployment verification run.
- [x] Backend Phase 6 quality profile passes: API 74.47% line / 57.53% branch and relay 43.50% line / 26.89% branch, above enforced floors.
- [x] Fresh PostgreSQL production-image smoke passes for API and relay; the production client image reaches Docker `healthy` through `/healthz`.
- [x] CI definitions now require SDK/client quality gates, backend coverage and image health, and a real PostgreSQL/API/relay classroom-exam collaboration contract job.

Required before the first external preview deployment:

- [ ] Split, review, and commit the four broad release worktrees; use the deployment checklist and current `git status` rather than stale path counts.
- [x] Fix `klein-tests` workflow triggers for the active `master` branch and add typecheck/mobile result coverage.
- [ ] Push the deferred release commits and require green remote SDK, client, server, and tests pipelines before image deployment.
- [x] Treat an empty `NEXT_PUBLIC_API_URL` as `/api`, with a deployment-config regression script; Docker/GitLab build arguments explicitly use `/api`.
- [x] Normalize unset/blank collaboration URLs for local builds, validate `ws://`/`wss://` syntax centrally, and reject missing or non-`wss://` collaboration URLs in release-image CI.
- [x] Update deployment documentation to remove retired SDK/private npm instructions and document the actual committed vendor artifact flow.
- [ ] Choose the preview host and domains, install real secrets, provision DNS, and start the base Compose plus Caddy overlay.
- [ ] Verify target-host HTTPS, secure cookies, CORS, WebSocket upgrade, health endpoints, classroom/exam flows, and upload persistence across a restart.
- [x] Repair and execute an isolated Postgres/uploads backup-and-restore drill before storing real classroom data.

Required before calling the preview a public v0:

- [ ] Add visible beta labeling for classroom/exam and state that browser exam mode is soft instrumentation rather than secure lockdown.
- [ ] Hide or clearly label legacy GeoGebra routes and remove stale GeoGebra-first public metadata/README copy.
- [ ] Run the live classroom/exam/collab suite against the HTTPS staging URLs and complete the cross-browser release matrix.
- [ ] Configure basic uptime/error monitoring and an automated off-host backup schedule, or explicitly accept both as preview limitations.

Not blockers for the initial preview:

- Named persistent saves for scientific and probability calculators.
- SDK-native Three.js renderer, advanced raycasting/hit testing, and PNG thumbnails.
- Signed exam snapshots when the selected exam profile does not require signing.
- Teams and Google Classroom production OAuth/add-on integration.

## Immediate Next Tasks

1. Keep the dirty-worktree review/commit/push work explicitly deferred, as requested. Do not deploy it until that release review is complete.
2. Choose the preview host and domains, then run `provision-ubuntu.sh`, generate real secrets, create `/opt/klein/.env`, and validate it with `validate-env.sh`.
3. Point DNS at the host, run `first-deploy.sh`, and deploy immutable `SERVER_TAG`, `COLLAB_TAG`, and `CLIENT_TAG` values.
4. Run `verify-deployment.sh` and `verify-upload-persistence.sh` through Caddy over HTTPS/WSS, including production cookie and websocket checks.
5. Run `LIVE_BACKEND=1 API_URL=... COLLAB_URL=... LIVE_ORIGIN=... npm run test:classroom:live` against HTTPS staging, then complete the cross-browser UI matrix.
6. Configure encrypted off-host backup retention and repeat `restore-smoke.sh` against the host before storing real classroom data.
7. After the preview is stable, generalize named saves for scientific/probability and add optional signed exam snapshot hooks.
