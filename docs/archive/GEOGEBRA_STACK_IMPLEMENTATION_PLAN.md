# GeoGebra-Style Stack Implementation Plan

Status: implementation plan drafted 2026-07-04.

This plan defines how Klein SDK will implement GeoGebra-style math tools as independent, framework-neutral TypeScript instruments inside one SDK. Each instrument must be usable by itself through a subpath export, and the workspace shell may compose instruments when a host wants a Calculator Suite or Classic-style experience.

## Product Intent

Build a Klein-owned stack of classroom math instruments with feature parity against the major GeoGebra app families:

- Calculator Suite / Classic workspace
- Graphing Calculator
- Geometry Calculator
- 3D Calculator / 3D Geometry
- CAS / Algebra Calculator
- Scientific Calculator
- Probability / Statistics Calculator
- Spreadsheet
- Notes / Whiteboard
- Classroom/Lesson collaboration flows
- Exam-mode-compatible host hooks

The goal is behavior and workflow parity, not code parity. Klein SDK must not copy GeoGebra source code, assets, names, runtime, file format internals beyond legally safe import/export behavior, or implementation details. The implementation should be clean-room, typed, deterministic, testable, and owned by this SDK.

## Independence Rule

Each GeoGebra-style tool copy is independent:

- Each tool has its own `createX()` factory, snapshot type, delta type, tool ids, validation, import/export, and tests.
- Each tool must run without the workspace shell and without any other instrument mounted.
- Cross-tool composition belongs in `klein-sdk/workspace`, not inside the instruments.
- Shared dependencies are limited to stable SDK foundations: `core`, `math`, `geometry-core`, `collab`, `persistence`, and renderer helpers.
- A host should be able to tree-shake unused instruments by importing only the needed subpath.

Example:

```ts
import { createGraphingCalculator } from 'klein-sdk/graphing';
import { createGeometryCalculator } from 'klein-sdk/geometry';
import { bindCollaboration } from 'klein-sdk/collab';

const graphing = createGraphingCalculator({ container: graphingEl });
const geometry = createGeometryCalculator({ container: geometryEl });

bindCollaboration({ instrument: graphing, transport: graphingTransport });
bindCollaboration({ instrument: geometry, transport: geometryTransport });
```

## Package Shape

Keep one package first, with independent subpath exports:

| Export | Responsibility |
| --- | --- |
| `klein-sdk/core` | Instrument runtime, deltas, validation, history, pointer/key events, exports, ids. |
| `klein-sdk/math` | Parser, AST, evaluator, exact arithmetic, numeric methods, symbolic facade. |
| `klein-sdk/geometry-core` | Pure geometry primitives, dependency graph, constraints, measurements. |
| `klein-sdk/geometry` | 2D Geometry Calculator. |
| `klein-sdk/geometry-lab` | 2D/3D classroom geometry lab and 3D geometry tools. |
| `klein-sdk/graphing` | 2D graphing calculator. |
| `klein-sdk/algebra` | CAS and explainable algebra workflows. |
| `klein-sdk/calculator` | Scientific calculator. |
| `klein-sdk/probability` | Probability and statistics explorer. |
| `klein-sdk/spreadsheet` | Spreadsheet, formula cells, data tables, charts. |
| `klein-sdk/whiteboard` | Notes, ink, frames, templates, and classroom board work. |
| `klein-sdk/workspace` | Calculator Suite / Classic composition shell. |
| `klein-sdk/collab` | Host-provided transport adapters, presence, room binding. |
| `klein-sdk/persistence` | Storage adapters, migrations, optimistic revisions. |
| `klein-sdk/dom` | Optional custom elements. |
| `klein-sdk/embed` | Host launch URLs, iframe metadata, exam/session hooks. |
| `klein-sdk/classroom` | Assignment, review, replay, and teacher workflow contracts. |

## Common Instrument Contract

Every instrument implements the common lifecycle:

```ts
interface KleinInstrument<TSnapshot, TDelta, TTool extends string = string> {
  readonly id: string;
  readonly kind: string;
  mount(container: HTMLElement): void;
  destroy(): void;
  getSnapshot(): TSnapshot;
  loadSnapshot(snapshot: TSnapshot, options?: LoadOptions): void;
  applyDelta(delta: TDelta, options?: ApplyDeltaOptions): void;
  setTool(tool: TTool): void;
  undo(): void;
  redo(): void;
  export(options: ExportOptions): Promise<ExportResult>;
}
```

Every snapshot is JSON-only, versioned, and validated before rendering. Every delta is validated before mutation. Local edits emit deltas. Remote deltas apply without echo. Undo/redo emit inverse deltas so collaborators see the same final scene.

## Shared Foundations

### 1. Runtime Foundation

Implement a reusable `createInstrumentRuntime()` in `core`:

- Snapshot ownership and validation.
- Delta apply/validate/invert/compose/compact.
- Undo/redo stacks based on inverse deltas.
- Batched atomic edits.
- Local/remote/history/import source metadata.
- Tool controller registry.
- Selection model.
- Pointer, keyboard, wheel, touch, and pen normalization.
- Export registry for JSON, SVG, PNG, thumbnail, PDF later.
- Error taxonomy and diagnostics.

Acceptance criteria:

- All instruments stop using stub lifecycle behavior.
- All instruments share one event and history model.
- Invalid snapshots and deltas never mutate state.
- Runtime is DOM-optional, so pure tests can run in Node.

### 2. Math Foundation

Upgrade `math` from a facade into a real kernel:

- Parser for arithmetic, functions, equations, inequalities, vectors, matrices, lists, intervals, and units later.
- Formatter for plain text and LaTeX.
- Numeric evaluator with safe function registry.
- Exact rational arithmetic.
- Decimal mode with precision controls.
- Complex numbers.
- Vector and matrix operations.
- Numeric solving, roots, extrema, derivatives, integrals, regression helpers.
- Symbolic facade for CAS workflows.
- Dependency graph for variables, sliders, spreadsheet cells, and object references.

Acceptance criteria:

- Graphing, calculator, algebra, probability, and spreadsheet use the same AST.
- No `eval`, dynamic function compilation, or untrusted script execution.
- Inputs fail safely with typed diagnostics.

### 3. Rendering Foundation

Use adapters over scene models:

- SVG for editable 2D geometry and whiteboard objects.
- Canvas 2D for dense graph plotting and high-volume ink.
- WebGL/Three.js adapter for 3D geometry and 3D graphing when added.
- HTML overlays for text editors, expression rows, object panels, and accessible controls.

Acceptance criteria:

- Scene mutation stays in pure modules.
- Renderers can be replaced without snapshot format changes.
- Export paths do not depend on pixels as source of truth.

### 4. Collaboration Foundation

Every instrument supports host-owned collaboration:

```ts
interface CollaborativeDeltaEnvelope<TDelta> {
  id: string;
  instrumentId: string;
  actorId: string;
  createdAt: number;
  sequence?: number;
  baseRevision?: number;
  delta: TDelta;
}
```

Required collaboration behavior:

- Host transport is optional.
- Deltas are idempotent by envelope id.
- Remote deltas do not echo back as local edits.
- Presence is separate from persisted lesson content.
- Cursors, selected objects, active tool, and actor color are presence.
- Teacher freeze, permissions, and read-only modes are enforced before local commit.
- Construction/edit replay reads from deltas, not screenshots.

Acceptance criteria:

- Any instrument can bind to `bindCollaboration()`.
- Two local instruments using `InMemoryCollaborationTransport` converge in smoke tests.
- Undo/redo remains collaborative.

### 5. Persistence Foundation

Implement storage-neutral persistence:

- Local storage adapter.
- Server adapter contract with optimistic revisions.
- Snapshot migrations by instrument and version.
- Import validation for untrusted JSON.
- Optional compression outside the public snapshot schema.
- Autosave hooks owned by hosts.

Acceptance criteria:

- Every instrument can save/load through `saveInstrumentSession()` and `loadInstrumentSession()`.
- Revision conflicts are detectable and recoverable.
- Migrations have tests.

## Instrument Plans

## Calculator Suite / Classic Workspace

Module: `klein-sdk/workspace`

Purpose: compose independent instruments into a suite/classic-style experience.

Features:

- Add/remove/reorder instrument panels.
- Split views and tabs.
- Graphing + geometry + CAS + spreadsheet panels in one document.
- Cross-panel links: spreadsheet range to graph, slider to expression, point table to geometry, CAS result to graph.
- Shared object browser for linked objects.
- Shared undo scopes: per panel and workspace-level.
- Page/slide support for lessons.
- Import/export complete workspace JSON.
- Snapshot thumbnails for panel previews.

Tools:

- Select panel.
- Add panel.
- Split panel.
- Link objects.
- Duplicate panel.
- Rename panel.
- Focus/fullscreen panel.
- Export panel.

Implementation steps:

1. Replace stub workspace lifecycle with shared runtime.
2. Add panel registry keyed by instrument kind.
3. Add workspace link validators.
4. Add panel snapshot migration and validation.
5. Add DOM shell adapter with no framework dependency.
6. Add cross-panel update propagation with loop prevention.

## Graphing Calculator

Module: `klein-sdk/graphing`

Purpose: 2D coordinate graphing with expressions, points, tables, sliders, analysis tools, and collaboration.

Core tools:

- Select/move.
- Pan.
- Zoom in/out/fit.
- Expression row.
- Point.
- Table.
- Slider.
- Trace.
- Intersection.
- Root/zero.
- Extremum.
- Tangent.
- Derivative.
- Integral/area.
- Regression.
- Statistics plot.
- Hide/show expression.
- Style expression.

Expression support:

- Explicit functions: `y = f(x)`.
- Implicit equations.
- Inequalities and shaded regions.
- Parametric curves.
- Polar curves.
- Piecewise functions.
- Sequences.
- Lists and point lists.
- Dynamic expressions driven by sliders.
- Domain restrictions.

Analysis support:

- Numeric roots and intersections.
- Local extrema.
- Tangent and normal lines.
- Derivative graph.
- Definite integral area.
- Curve tracing.
- Regression models: linear, polynomial, exponential, logarithmic, power, sinusoidal.

Implementation steps:

1. Define graph scene model v2 with expression rows, sliders, tables, derived objects, and style.
2. Build graph evaluator on `math`.
3. Implement adaptive plotting for explicit and parametric curves.
4. Add implicit contour plotting.
5. Add inequality region renderer.
6. Add numeric analysis helpers.
7. Add expression-row DOM adapter.
8. Add graph export to SVG/PNG/JSON.
9. Add collaborative expression edits and slider movement compaction.

## 2D Geometry Calculator

Modules: `klein-sdk/geometry-core`, `klein-sdk/geometry`

Purpose: dynamic Euclidean geometry with construction dependencies, measurements, transforms, and object editing.

General tools:

- Move/select.
- Point.
- Point on object.
- Attach/detach point.
- Intersect.
- Midpoint/center.
- Object properties.
- Hide/show object.
- Delete.
- Undo/redo.
- Object tree.
- Construction protocol.

Line tools:

- Line through two points.
- Segment.
- Segment with given length.
- Ray.
- Vector.
- Vector from point.
- Polyline.
- Perpendicular line.
- Parallel line.
- Perpendicular bisector.
- Angle bisector.
- Tangents.
- Polar/diameter line.
- Locus/path.

Polygon tools:

- Polygon.
- Regular polygon.
- Rigid polygon.
- Vector polygon.
- Editable vertices.
- Side constraints.
- Angle constraints.
- Congruence markers.
- Similarity markers.

Circle, arc, and conic tools:

- Circle by center and point.
- Circle by center and radius.
- Compass circle.
- Circle through three points.
- Semicircle.
- Arc by center and two points.
- Circumcircular arc.
- Sector.
- Circumcircular sector.
- Ellipse.
- Hyperbola.
- Parabola.
- Conic through five points.

Measurement tools:

- Angle.
- Distance/length.
- Area.
- Slope.
- Coordinates.
- Relation/check property.
- Text label.

Transform tools:

- Reflect over line.
- Reflect over point.
- Rotate around point.
- Translate by vector.
- Dilate from point.
- Scale selection.

Input tools:

- Typed coordinate input.
- Typed line equation.
- Typed circle equation.
- Typed object edit for length, radius, angle, side count, and labels.

Implementation steps:

1. Keep `geometry-core` pure and renderer-free.
2. Convert all tool behavior to `ToolController` implementations.
3. Complete hit testing and snapping as shared helpers.
4. Add construction protocol deltas.
5. Add object property editing and validation.
6. Add SVG renderer and export adapter.
7. Add geometry-specific smoke tests for every tool.

## 3D Calculator / 3D Geometry

Module: `klein-sdk/geometry-lab`, later optional `klein-sdk/graphing-3d` if split is needed.

Purpose: 3D geometry, solids, surfaces, planes, measurements, and spatial reasoning.

3D navigation tools:

- Orbit.
- Pan.
- Zoom.
- Fit selection.
- Camera presets: front, top, side, isometric.
- Projection mode: perspective/orthographic.
- Work-plane selection.

3D construction tools:

- Point.
- Point on object.
- Line.
- Segment.
- Ray.
- Vector.
- Polygon.
- Plane through three points.
- Plane by equation.
- Plane parallel to plane.
- Plane perpendicular to plane or line.
- Sphere by center and point.
- Sphere by center and radius.
- Cube.
- Prism.
- Pyramid.
- Cylinder.
- Cone.
- Polyhedra library.
- Surface from expression.
- Parametric curve.
- Intersection curve/point.
- Cross-section.
- Net/unfold.

3D measurements:

- Length.
- Area.
- Surface area.
- Volume.
- Angle.
- Dihedral angle.
- Point-plane distance.
- Line-plane intersection.
- Plane-plane intersection.

Implementation steps:

1. Preserve current Geometry Lab scene split: 2D scene, 3D scene, links.
2. Add a renderer adapter boundary for WebGL/Three.js without leaking renderer objects into snapshots.
3. Implement raycasting and 3D hit testing.
4. Implement work-plane snapping and placement.
5. Add surface and parametric graphing entities.
6. Add robust solid geometry helpers.
7. Add cross-section and net generation tests.
8. Add 3D export paths: JSON first, image snapshots next, mesh formats later only if needed.

## CAS / Algebra Calculator

Module: `klein-sdk/algebra`

Purpose: symbolic manipulation, exact solving, and explainable algebra steps.

Tools:

- Input.
- Simplify.
- Expand.
- Factor.
- Solve.
- Numeric solve.
- Substitute.
- Derivative.
- Integral.
- Limit.
- Matrix.
- System solver.
- Step-by-step mode.
- Check answer.
- Hint.

Feature scope:

- Exact arithmetic and rational simplification.
- Polynomial expand/factor.
- Equation solving for common school algebra cases.
- Systems of linear equations.
- Matrix operations: determinant, inverse, transpose, row reduction.
- Symbolic derivatives for elementary functions.
- Basic symbolic integrals for common patterns.
- Numeric fallback with explicit diagnostics.
- Step records with rule ids and localized explanations.

Implementation steps:

1. Use the shared `math` AST as the only public expression representation.
2. Implement school-level rewrite rules first.
3. Add a rule engine that records before/after AST and explanation metadata.
4. Keep optional external CAS adapters behind separate opt-in boundaries.
5. Add deterministic tests for each rule family.

## Scientific Calculator

Module: `klein-sdk/calculator`

Purpose: standalone scientific calculator with exact and decimal modes.

Tools:

- Input.
- History.
- Memory.
- Unit/angle mode.
- Function keypad.

Feature scope:

- Exact fractions and mixed numbers.
- Decimal arithmetic.
- Constants: pi, e.
- Powers, roots, logs.
- Trigonometric and inverse trigonometric functions.
- Degrees/radians.
- Percent.
- Factorial.
- Permutations and combinations.
- Random numbers.
- Statistics helpers: sum, mean, median, standard deviation.
- History entries with reusable results.
- Memory slots.

Implementation steps:

1. Replace stub instrument with runtime-backed calculator.
2. Route all input through `math`.
3. Add exact/decimal output formatting.
4. Add keypad metadata for host rendering.
5. Add history and memory delta tests.

## Probability / Statistics Calculator

Module: `klein-sdk/probability`

Purpose: distributions, interval probabilities, statistical inference, and simulations.

Tools:

- Distribution selector.
- Interval probability.
- Inverse probability.
- Test.
- Confidence interval.
- Simulation.
- Data import.

Distributions:

- Normal.
- Student t.
- Chi-square.
- F.
- Binomial.
- Poisson.
- Hypergeometric.
- Uniform.
- Exponential.

Statistics workflows:

- One-sample z/t tests.
- Two-sample tests.
- Proportion tests.
- Chi-square goodness-of-fit.
- Chi-square independence.
- Linear regression inference.
- Confidence intervals.
- Random sampling and simulation.

Implementation steps:

1. Add probability math helpers under `math` or an internal probability kernel.
2. Expand snapshot model for active calculation, distribution parameters, shaded interval, and result records.
3. Implement PDF/CDF/inverse CDF functions with numeric accuracy tests.
4. Add inference workflow state machines.
5. Add graph renderer for distribution curves and shaded regions.

## Spreadsheet

Module: `klein-sdk/spreadsheet`

Purpose: tabular data, formulas, object references, charts, and analysis workflows.

Tools:

- Select cell/range.
- Edit cell.
- Fill handle.
- Format.
- Chart.
- Sort/filter.
- Import data.
- Regression.
- Data analysis.

Feature scope:

- Multiple sheets.
- Cell/range references.
- Formula parser using `math`.
- Dependency graph and recalculation.
- Fill/copy formulas.
- Named ranges.
- Charts: scatter, line, bar, histogram, box plot.
- Data tables connected to graphing expressions.
- Object references to points, measurements, and sliders.
- CSV import/export.

Implementation steps:

1. Replace flat cell model with sheet/range/dependency graph model.
2. Implement formula evaluation with cycle detection.
3. Add range operations and fill deltas.
4. Add chart scene model independent of DOM.
5. Add workspace links to graphing and geometry.

## Notes / Whiteboard

Module: `klein-sdk/whiteboard`

Purpose: general classroom board work and note-taking, similar to a notes surface around math tools.

Tools:

- Select.
- Pan.
- Pen.
- Highlighter.
- Eraser.
- Shapes.
- Lines/arrows/connectors.
- Text.
- Sticky note.
- Image.
- Stamp.
- Frame.
- Template.
- Comment.
- Ruler/straightedge.

Feature scope:

- Infinite canvas.
- Pages/frames.
- Ink and shape objects.
- Math snippets linked to calculator expressions.
- Embedded graph/geometry snapshots.
- Teacher prompts.
- Comments and feedback markers.
- Export to JSON/SVG/PNG/PDF.

Implementation steps:

1. Keep existing DOM/SVG implementation as the first production instrument.
2. Add comments and presence rendering through shared collaboration.
3. Add shape recognition later as an optional feature.
4. Add page/frame export workflows.

## Classroom, Lessons, and Resources

Modules: `klein-sdk/classroom`, `klein-sdk/collab`, `klein-sdk/persistence`, `klein-sdk/integrations`

Purpose: teacher and student workflows around independent instruments.

Features:

- Teacher templates with locked starter content.
- Student copy workflow.
- Assignment mode.
- Teacher review snapshots.
- Live collaboration.
- Collaborative cursors.
- Ownership colors.
- Comments on objects.
- Teacher freeze/unfreeze.
- Construction replay.
- Shareable read-only links.
- Team editable sessions.
- Classroom-scoped sessions.
- Google Classroom and Microsoft Teams launch helpers.

Implementation steps:

1. Keep auth, user management, and network calls in host apps.
2. Add SDK contracts for roles, permissions, and lesson metadata.
3. Add replay event model based on delta history.
4. Add review snapshot helpers.
5. Add integration examples for hosted apps.

## Exam Mode Hooks

Module: `klein-sdk/embed`

Purpose: expose hooks that let a host build restricted exam experiences. The SDK does not claim device-level enforcement.

Features:

- Read-only or restricted tool configurations.
- Disabled collaboration where required.
- Disabled import/export where required.
- Session start/end metadata.
- Integrity events: focus loss, visibility change, fullscreen change, network status.
- Snapshot signing hook owned by host.
- Calculator profile presets.

Implementation steps:

1. Define exam profile schema.
2. Add per-instrument tool allowlists.
3. Add readonly/restricted-mode validation before local deltas commit.
4. Emit integrity events to host.

## Tool Configuration Model

Each instrument exposes tool metadata for host-rendered UI:

```ts
interface ToolDefinition<TTool extends string = string> {
  id: TTool;
  labelKey: string;
  group: string;
  icon?: string;
  shortcut?: string;
  enabledByDefault: boolean;
  requiresSelection?: boolean;
}
```

Hosts can render their own UI while the SDK owns behavior:

```ts
const geometry = createGeometryCalculator({ container });
const tools = geometry.getToolDefinitions();
geometry.setTool('perpendicular');
```

Implementation requirement:

- Tool metadata must be independent of React/Vue/Svelte.
- Tools must have stable ids.
- Hosts can disable tools through options or exam profiles.

## Collaboration Model Per Independent Tool

Every independent instrument gets its own room or document target. A workspace may coordinate multiple targets.

Modes:

- Single-user standalone.
- Shared room per instrument.
- Shared workspace with child instrument streams.
- Teacher broadcast/read-only.
- Student copy with teacher review.

Delta rules:

- Every delta has an id.
- Every delta declares the target instrument.
- Every delta validates against the current snapshot.
- Dragging emits compact final deltas; live pointer movement can be presence.
- Batch deltas are atomic.
- Undo/redo emits inverse deltas.
- Host transport handles networking, auth, retries, and persistence.

Conflict handling:

- For app-state fields such as view and selected tool, last-writer-wins is acceptable.
- For scene objects with stable ids, use field-level patching where possible.
- For destructive edits, validate object existence and permissions.
- For simultaneous edits to the same object, preserve deterministic ordering by delta metadata.
- For future high-conflict text/cell editing, allow CRDT-backed adapters without exposing CRDT types in the base SDK contract.

## Import and Export

Required export support by instrument:

| Instrument | JSON | SVG | PNG | PDF | CSV | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Whiteboard | Yes | Yes | Yes | Planned | No | Page/frame export. |
| Geometry | Yes | Yes | Yes | Planned | No | Construction protocol included in JSON. |
| Geometry Lab / 3D | Yes | Planned | Yes | Planned | No | Mesh export optional later. |
| Graphing | Yes | Yes | Yes | Planned | Data tables | Expressions and analysis objects. |
| Algebra | Yes | LaTeX snippets | Image optional | Planned | No | Step records in JSON. |
| Calculator | Yes | No | Optional | No | No | History export. |
| Probability | Yes | Yes | Yes | Planned | Tables | Distribution result records. |
| Spreadsheet | Yes | Charts | Charts | Planned | Yes | Formula and value export. |
| Workspace | Yes | Composite | Composite | Planned | Delegated | Contains child snapshots. |

GeoGebra file compatibility:

- Best-effort `.ggb` import may be explored only where legally safe.
- Import must produce Klein snapshots, not load GeoGebra runtime.
- Unsupported features should preserve warnings and skip safely.
- Export to `.ggb` is not a near-term goal.

## Implementation Phases

### Phase 0: Parity Matrix and Contracts

- Create a detailed parity checklist for each tool family.
- Mark status: implemented, partial, planned, not applicable.
- Freeze public snapshot and delta naming conventions.
- Define shared runtime interfaces.

Exit criteria:

- Every planned tool has an owner module.
- Every module has clear non-goals.
- No instrument depends on another instrument directly.

### Phase 1: Shared Runtime

- Implement `createInstrumentRuntime()`.
- Move stub instruments onto runtime.
- Add validation helpers.
- Add generic history and delta metadata.
- Add tool definition registry.
- Add common export registry.

Exit criteria:

- Typecheck passes.
- Runtime smoke tests cover local delta, remote delta, undo, redo, export JSON.
- Existing whiteboard and geometry behavior remains compatible.

### Phase 2: Math Kernel

- Implement parser/evaluator MVP.
- Add exact rational numbers.
- Add function registry.
- Add numeric solve/root/intersection helpers.
- Add matrix and vector support.

Exit criteria:

- Calculator can evaluate school-level scientific expressions.
- Graphing can evaluate `f(x)` safely over a domain.
- Spreadsheet can evaluate basic formulas.

### Phase 3: Graphing and Scientific Calculator

- Build graph expression rows and renderer.
- Add sliders and trace.
- Add root/intersection/extremum/tangent tools.
- Replace calculator stub with real history/memory/evaluation.

Exit criteria:

- Graphing and calculator are useful standalone instruments.
- Collaborative deltas converge in smoke tests.

### Phase 4: Geometry Tool Controllers

- Convert geometry behavior into controller units.
- Complete snap and hit-test helpers.
- Add construction protocol.
- Add relation and measurement workflows.

Exit criteria:

- 2D Geometry Calculator covers core classroom geometry workflows.
- Each tool has pointer/keyboard/cancel tests.

### Phase 5: Algebra, Probability, Spreadsheet

- Add CAS rule engine.
- Add probability distribution and inference workflows.
- Add spreadsheet dependency graph and formulas.

Exit criteria:

- Each tool is independently usable.
- All use the shared math AST.
- All support JSON persistence and collaboration deltas.

### Phase 6: 3D Geometry and Surfaces

- Add WebGL/Three.js adapter boundary.
- Add 3D construction tools and work-plane snapping.
- Add surfaces and parametric curves.
- Add cross-sections and nets.

Exit criteria:

- 3D scenes are serializable and collaborative.
- 3D tools avoid renderer-specific state in snapshots.

### Phase 7: Workspace Composition

- Build Calculator Suite / Classic shell.
- Add multi-panel composition.
- Add cross-panel links.
- Add workspace-level save/export.

Exit criteria:

- Host can run a full suite experience while each instrument remains standalone.

### Phase 8: Classroom, Exam, and Integrations

- Add lesson templates, student copies, review snapshots, replay.
- Add exam profiles and restricted tool allowlists.
- Expand Teams and Google Classroom examples.

Exit criteria:

- Host apps can build collaborative classroom flows without SDK-owned auth or backend assumptions.

## Testing Strategy

Each instrument needs:

- Pure model tests for snapshots, deltas, validation, migrations.
- Tool-controller tests for pointer-down, pointer-move, pointer-up, keyboard, cancel, invalid target.
- Renderer smoke tests for nonblank output and stable bounds.
- Collaboration convergence tests with two in-memory clients.
- Import/export round-trip tests.
- Fuzz tests for untrusted snapshot and formula input.
- Accessibility checks for keyboard paths and status text.

Shared test fixtures:

- Deterministic id factory.
- Fixed clock for delta metadata.
- Snapshot fixture builder per instrument.
- Golden SVG/JSON exports for stable outputs.

## Quality Gates

Before a tool family is marked implemented:

- Public types are exported from the package root and subpath.
- Snapshot schema is documented.
- Delta schema is documented.
- Runtime validation rejects malformed data.
- Tool metadata is available to hosts.
- Standalone create/mount/destroy works.
- Collaboration binding works.
- JSON export/import round-trips.
- Typecheck and build pass.
- At least one smoke script exercises the user-facing workflow.

## Near-Term File Work

Recommended first code changes after this plan:

- `src/core/runtime.ts`: shared runtime.
- `src/core/deltas.ts`: validate/invert/compose helpers.
- `src/core/tools.ts`: tool definition and controller registry.
- `src/math/parser.ts`: parser.
- `src/math/evaluate.ts`: evaluator.
- `src/graphing/engine.ts`: graph evaluator and plot sampler.
- `src/calculator/engine.ts`: scientific calculator evaluation/history.
- `src/workspace/registry.ts`: instrument registry and cross-panel links.
- `scripts/geogebra-parity-smoke.mjs`: integration smoke test.

## Open Decisions

- Whether 3D graphing should remain inside `geometry-lab` or split into `klein-sdk/graphing-3d`.
- Whether optional external CAS engines should live in separate packages.
- Whether PDF export belongs in each instrument or in a shared export package.
- How much `.ggb` import compatibility is legally and technically worth supporting.
- Whether CRDT text/cell editing should be built in or kept as an optional adapter.
