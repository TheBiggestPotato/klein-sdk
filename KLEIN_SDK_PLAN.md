# Klein SDK Technical Plan

Status: restart plan drafted 2026-06-25.

This plan starts `klein-sdk` from a clean architecture. The target is a framework-independent npm SDK that provides first-party classroom math instruments: GeoGebra-style calculators and tools, a production whiteboard, and a guided Geometry Lab with both a 2D scene and a movable 3D scene.

The SDK must not embed GeoGebra, Klein auth, Klein routing, persistence endpoints, or a specific frontend framework. Host apps own authentication, room creation, storage, and transport. The SDK owns deterministic math, scene models, rendering adapters, tool behavior, snapshot/delta validation, history, export, and optional collaboration adapters that can connect to a host-provided transport.

`klein-tools-sdk` is deprecated. It remains useful only as reference material for behavior and code that should be intentionally replicated inside this repo. New implementation work belongs in `klein-sdk`, and `klein-sdk` must not depend on `klein-tools-sdk`.

## Product Goal

Build a Klein-owned math tool SDK that covers the major GeoGebra tool families while adding a whiteboard and a kid-friendly Geometry Lab.

The product surface should eventually include:

- Whiteboard: freehand work, shapes, text, sticky notes, images later, exports, collaboration-ready deltas.
- Geometry Calculator: dynamic 2D geometry with GeoGebra-style construction tools.
- Geometry Lab: guided 2D and 3D teaching environment for K-12 shape construction, measurement, nets, cross-sections, and spatial reasoning.
- Graphing Calculator: 2D functions, equations, inequalities, points, sliders, tables, intersections, roots, regressions.
- 3D Calculator / 3D Graphing: points, vectors, lines, planes, surfaces, solids, camera controls, measurements.
- CAS / Algebra Lab: symbolic simplification, solving, factoring, derivatives, integrals, systems, matrices, step records.
- Scientific Calculator: exact and decimal arithmetic, fractions, trig/logs, statistics functions, history.
- Probability / Statistics: distributions, interval probabilities, hypothesis tests, confidence intervals, simulations.
- Spreadsheet: formula cells, data tables, plots, regressions, object references.
- Math Workspace: a host-neutral shell that can combine instruments in one lesson or room.
- Legacy bridge: optional GeoGebra import/read-only compatibility where legally safe, but never GeoGebra runtime as the stable SDK contract.

## Non-Goals

- Do not clone GeoGebra code or require GeoGebra runtime.
- Do not ship GPL/AGPL symbolic engines in the default package.
- Do not tie the SDK to React, Vue, Svelte, Next.js, Klein routes, or Klein backend clients.
- Do not make Geometry Lab a CAD system. It teaches geometric construction and spatial reasoning.
- Do not make collaboration transport mandatory. Instruments must work standalone.
- Do not persist pixels as source of truth. Persist validated JSON snapshots.

## Package Shape

Ship one npm package first:

```ts
klein-sdk
```

Use subpath exports to keep boundaries explicit:

```ts
klein-sdk/core
klein-sdk/math
klein-sdk/geometry-core
klein-sdk/whiteboard
klein-sdk/geometry
klein-sdk/geometry-lab
klein-sdk/graphing
klein-sdk/algebra
klein-sdk/calculator
klein-sdk/probability
klein-sdk/spreadsheet
klein-sdk/workspace
klein-sdk/collab
klein-sdk/dom
```

Internally, organize as separate modules with their own tests. If package size or release ownership becomes a problem, these modules can later split into scoped packages without changing the conceptual architecture.

### Framework Independence

The public runtime API should be imperative and DOM-based, not React-based:

```ts
import { createWhiteboard } from 'klein-sdk/whiteboard';

const whiteboard = createWhiteboard({
  container: document.getElementById('tool')!,
  initialSnapshot,
  onDelta: (delta, meta) => transport.send(delta, meta),
});

whiteboard.setTool('pen');
whiteboard.applyDelta(remoteDelta);
const snapshot = whiteboard.getSnapshot();
whiteboard.destroy();
```

Optional adapters can be added later:

- `klein-sdk/dom`: Custom Elements such as `<klein-whiteboard>` and `<klein-geometry-lab>`.
- `@klein-sdk/react` or `klein-sdk/react`: thin adapter only if we decide the main package should expose framework helpers.
- The core instruments must not depend on those adapters.

## Common Instrument Runtime

Every instrument uses the same lifecycle contract:

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

Common runtime modules:

- `ids`: stable id generation, deterministic ids in tests.
- `schema`: runtime validation guards for snapshots and deltas.
- `migrations`: versioned snapshot migrations.
- `deltas`: apply, invert, compose, compact, and validate deltas.
- `history`: undo/redo through inverse deltas, not full snapshot clones.
- `events`: normalized pointer, keyboard, wheel, touch, and pen events.
- `tools`: framework-independent controller interface.
- `selection`: shared selection, handles, multi-select, object navigator.
- `export`: SVG, PNG, JSON, thumbnails, PDF later.
- `i18n`: default English/Romanian labels and host overrides.
- `theme`: CSS variables and renderer-neutral theme tokens.

### Snapshot Rules

- Every snapshot is JSON-only and versioned.
- Every snapshot validates before rendering.
- Unknown future fields are preserved when possible.
- Runtime state that is not lesson content stays in `appState`.
- Camera/view state is not treated as geometry content.
- Imported snapshots are untrusted input.

Base shape:

```ts
interface InstrumentSnapshot<TScene, TAppState = unknown> {
  version: number;
  instrument: string;
  scene: TScene;
  appState?: TAppState;
  metadata?: {
    title?: string;
    locale?: string;
    createdAt?: number;
    updatedAt?: number;
  };
}
```

### Delta Rules

Common delta envelope:

```ts
interface DeltaMeta {
  id: string;
  actorId?: string;
  createdAt: number;
  source: 'local' | 'remote' | 'history' | 'import';
}
```

Rules:

- Local edits emit deltas.
- Remote deltas apply without echo.
- Undo/redo emits inverse deltas so collaborators see the result.
- Batch deltas are atomic.
- Invalid deltas never mutate state.
- Drag operations may update live state, but commit one compact delta or batch on release.

## Tool Controller Architecture

All interactive tools should be controllers, not one large event switch.

```ts
interface ToolController<TState, TDelta, TTool extends string = string> {
  id: TTool;
  labelKey: string;
  cursor: string;
  acceptsHitTarget: boolean;
  onPointerDown(ctx: ToolContext<TState, TDelta>, event: NormalizedPointerEvent): void;
  onPointerMove(ctx: ToolContext<TState, TDelta>, event: NormalizedPointerEvent): void;
  onPointerUp(ctx: ToolContext<TState, TDelta>, event: NormalizedPointerEvent): void;
  onKeyDown?(ctx: ToolContext<TState, TDelta>, event: NormalizedKeyEvent): void;
  onCancel?(ctx: ToolContext<TState, TDelta>): void;
}
```

`ToolContext` exposes:

- current snapshot and app state;
- dispatch local/remote/history deltas;
- hit-test and snap helpers;
- preview layer updates;
- selection updates;
- coordinate transforms;
- commit/cancel gesture hooks;
- accessibility status text.

Each tool controller needs unit tests for pointer-down, pointer-move, pointer-up, cancellation, keyboard behavior, and invalid target handling.

## Rendering Strategy

Use renderer adapters under a stable scene model:

- SVG for editable 2D geometry and whiteboard overlays because it is inspectable and exportable.
- Canvas 2D for dense graph plotting and large freehand surfaces.
- WebGL/Three.js for Geometry Lab 3D and 3D graphing where depth, raycasting, lighting, and camera movement matter.
- HTML overlay for text editors, input rows, object panels, toolbars, and accessible controls.

Renderer rule: math and scene mutation live in pure modules; renderers are views over snapshots plus transient app state.

## Whiteboard

Purpose: general classroom scratch work and lesson annotation.

### Whiteboard Features

Core v1:

- Infinite pan/zoom board.
- Select, lasso, move, delete, duplicate.
- Pen, highlighter, eraser.
- Rectangle, ellipse, triangle, polygon.
- Line, arrow, double-arrow.
- Text, sticky note, teacher prompt.
- Grid/dot-grid/blank backgrounds.
- Color, width, opacity, fill, stroke style.
- Undo/redo.
- Keyboard shortcuts.
- Touch/pen support.
- Export SVG/PNG/JSON.
- Snapshot/delta persistence.
- Collaboration-ready `onDelta` and `applyDelta`.

Post-v1:

- Image import with strict size/type limits.
- PDF/page background import.
- Layers/object list.
- Resize/rotate handles.
- Shape libraries.
- Measurement helpers.
- Comments and teacher feedback markers.

### Whiteboard Scene Model

```ts
interface WhiteboardSnapshot {
  version: 1;
  instrument: 'whiteboard';
  scene: {
    elements: Record<string, WhiteboardElement>;
    order: string[];
  };
  appState?: {
    view?: View2D;
    selectedIds?: string[];
    activeTool?: WhiteboardTool;
  };
}
```

Element families:

- Freehand strokes.
- Basic shapes.
- Lines/arrows.
- Text/sticky/prompt.
- Media later.
- Measurement annotations later.

Important behavior:

- Non-select drawing tools start on top of existing elements.
- Select and eraser are the only tools that consume existing element hits.
- Lines and arrows keep a fixed origin while dragging across all quadrants.
- Previews never mutate committed scene state.

## Math Core

`math-core` is the shared kernel for graphing, CAS, calculators, probability, spreadsheet formulas, and command input.

Core responsibilities:

- Tokenizer and parser for classroom infix input.
- AST types for numbers, symbols, units, functions, equations, inequalities, vectors, matrices, lists.
- Numeric evaluator with bounded execution.
- Exact rational arithmetic where feasible.
- Decimal approximation with precision settings.
- Formatting to plain text and LaTeX.
- Domain checks and friendly validation errors.
- Structural equality and normalization.
- Safe command registry.
- Deterministic random source for tests/simulations.
- Bounded recursion, AST size, iteration count, and graph sample count.

Initial grammar:

- integers, decimals, fractions;
- variables/constants;
- `+`, `-`, `*`, `/`, `^`;
- parentheses;
- functions: `sqrt`, `abs`, `sin`, `cos`, `tan`, inverse trig, `ln`, `log`;
- equations and inequalities;
- lists and points;
- vectors/matrices after scalar algebra stabilizes.

No user-provided JavaScript execution.

## GeoGebra-Style Tool Coverage

The SDK should cover GeoGebra as a family of focused instruments, not one oversized monolith.

### Geometry Calculator

Dynamic 2D construction environment. This is closer to GeoGebra Geometry than Geometry Lab; it is precise and tool-rich. Geometry Lab reuses its engine but presents guided teaching workflows.

Tool groups:

- Move/select: move object, move graphics view, freehand pen.
- Points: point, point on object, attach/detach point, intersection, midpoint/center, complex point later.
- Lines: line, segment, segment with given length, ray, polyline, vector, vector from point.
- Special lines: perpendicular, parallel, perpendicular bisector, angle bisector, tangent, polar/diameter, locus.
- Polygons: polygon, regular polygon, rigid polygon, vector polygon later.
- Circles/arcs: circle by center-point, center-radius, compass, circle through 3 points, semicircle, arc, sector.
- Conics: ellipse, hyperbola, parabola, conic through 5 points.
- Measurements: angle, distance/length, area, slope, coordinates, relation check.
- Transformations: reflect about line/point/circle, rotate, translate, dilate, shear/stretch later.
- Controls: slider, checkbox, button, input box as safe SDK controls.
- Media/annotations: text, image later, table later.
- Custom tools/macros: user-defined construction templates stored as safe JSON.

### Graphing Calculator

2D graphing scope:

- Explicit functions `y = f(x)`.
- Equations and implicit curves.
- Inequalities and shaded regions.
- Parametric and polar curves.
- Points, lists, sequences.
- Sliders and animatable parameters.
- Piecewise definitions.
- Tables of values.
- Roots, extrema, intercepts, intersections.
- Tangent/normal lines.
- Regression models.
- Trace and evaluate-at-point.
- Axes/grid/theme controls.
- Export image/SVG/JSON.

Architecture:

- `graphing-core`: viewport math, sampling, discontinuity detection, roots/intersections, regression.
- `graphing`: DOM instrument with Canvas curve renderer and SVG/HTML overlay for labels and handles.

### 3D Calculator / 3D Graphing

Separate from Geometry Lab. Geometry Lab teaches solids and manipulation; 3D graphing visualizes mathematical objects.

Scope:

- Movable camera: orbit, pan, zoom, ViewCube, standard views, frame selected/all.
- Axes, grid planes, coordinates.
- Points, vectors, lines, rays, segments.
- Planes and plane intersections.
- Curves in 3D.
- Surfaces: `z = f(x, y)`, parametric surfaces, implicit surfaces later.
- Solids for graphing context.
- Contours, color gradients, transparent surfaces.
- Measurements: distance, angle, vector components.
- Export PNG/JSON.

Renderer: WebGL/Three.js with an SVG/Canvas fallback only for degraded display.

### CAS / Algebra Lab

Scope:

- Simplify, expand, factor basics.
- Solve linear and quadratic equations.
- Systems of equations.
- Substitution and evaluation.
- Derivatives and integrals.
- Matrices and vectors.
- Exact/approx output.
- Step-by-step explanation records.
- Teacher mode: show hints, hide direct answer, require next step.

Design:

- `algebra-core` owns rewrite rules and step validation.
- `algebra` owns the UI, history, expression editor, and step explorer.
- Do not promise a full CAS until the rule engine has strong golden tests and numeric equivalence checks.

### Scientific Calculator

Scope:

- Arithmetic, fractions, exact/decimal toggle.
- Powers, roots, trig/logs.
- Degree/radian mode.
- Percent, factorial, combinations/permutations.
- Mean, standard deviation, random values.
- Variables/memory.
- History and copy/export.

This is the smallest first `math-core` consumer and should ship before CAS.

### Probability / Statistics

Scope:

- Distributions: normal, t, chi-square, F, binomial, Poisson, uniform.
- Interval probabilities and inverse probabilities.
- Descriptive statistics from lists/spreadsheet ranges.
- Hypothesis tests.
- Confidence intervals.
- Regression summaries.
- Simulation tools: coin, dice, random sample, bootstrap later.

### Spreadsheet

Scope:

- Cells, formulas, ranges.
- References to math objects where useful.
- CSV import/export.
- Sort/filter basics.
- Data tables for graphing.
- Scatterplots, box plots, histograms.
- Regression handoff to graphing.

Spreadsheet formulas should reuse `math-core`; they should not execute arbitrary JS.

## Geometry Lab

Geometry Lab is a guided K-12 learning environment, not just a precise construction calculator. It should take most requirements from the old `klein-tools-sdk` Geometry Lab plan, but restart with a cleaner engine and a true movable 3D space.

### Geometry Lab Principles

- Younger students first.
- Large targets and visible handles.
- Guided construction modes instead of abstract command lists.
- Every edit is reversible.
- Colors are semantic teaching aids: angle colors, plane colors, face colors, hidden/visible portions.
- 2D and 3D scenes live in one snapshot and can be linked.
- JSON scenes can be saved, shared, replayed, and migrated.
- Pure geometry math is unit-tested before UI integration.

### Geometry Lab Snapshot

New shape:

```ts
interface GeometryLabSnapshot {
  version: 1;
  instrument: 'geometry-lab';
  scene: {
    scene2d: GeometryScene2D;
    scene3d: GeometryScene3D;
    links: GeometrySceneLink[];
  };
  appState?: {
    activeView: '2d' | '3d' | 'split';
    view2d: View2D;
    view3d: GeometryCamera3DState;
    activeTool?: GeometryLabTool;
    activeWorkPlaneId?: string;
    selected?: GeometrySelection[];
    panels?: GeometryPanelState;
  };
}
```

Why both scenes instead of only `mode`: students should be able to build a 2D net, fold/extrude it into a 3D solid, inspect both, and return without losing either scene. The UI can still present 2D, 3D, or split views.

### Geometry Lab 2D Scene

Features:

- Infinite measurable canvas with grid and axes.
- Points, segments, rays, lines, vectors.
- Polygons, regular polygons, shape stamps.
- Circles, arcs, sectors.
- Angle markers.
- Labels attached to semantic anchors.
- Color/styling for points, lines, angles, regions.
- Hide portions of segments, edges, fills.
- Cut polygons and segments.
- Scale, rotate, translate, reflect.
- Numeric input for coordinates, lengths, radii, angles, polygon side counts.
- Smart snapping: vertices, midpoints, intersections, grid, angle increments.
- Dynamic constructions: midpoint, point-on-segment, perpendicular, parallel, perpendicular bisector, angle bisector, circle through points, triangle centers later.
- Measurements summary: length, perimeter, area, radius, circumference, angles.
- Touch gestures: pinch zoom, two-finger pan.
- Export SVG/PNG/JSON.

K-12 roadmap:

- Elementary/middle: shape stamps, symmetry, tessellation, transformations, area/fraction shading.
- High school: conics, loci, triangle centers, theorem activities, vectors.

### Geometry Lab 3D Scene

Requirement: the 3D interaction model is a movable 3D space, not a fixed 3D point. The user orbits, pans, zooms, changes work planes, selects/raycasts objects, and manipulates solids in world space.

Core model:

```ts
interface GeometryScene3D {
  points: Record<string, Point3D>;
  entities: Record<string, GeometryEntity3D>;
  workPlanes: Record<string, WorkPlane3D>;
  measurements: Record<string, Measurement3D>;
}
```

Movable-space behavior:

- Camera is in `appState.view3d`, not geometry content.
- Orbit, pan, zoom, cursor-centered zoom.
- ViewCube / orientation gizmo.
- Standard views: front, back, left, right, top, bottom, isometric.
- Frame selected and frame all.
- Perspective/orthographic toggle.
- z-up right-handed coordinate system.
- Ground grid, axis triad, corner gnomon.
- Active work plane: ground XY, selected face, or custom plane through 3 points.
- New points/shapes are placed on the active work plane using raycasting.
- Transform gizmos support translate/rotate/scale on X/Y/Z, XY/YZ/XZ planes, and screen space.
- Snapping uses vertices, edge midpoints, face centers, axes, work-plane grid, and inferred parallel/perpendicular guides.

3D features:

- Points, vectors, segments, lines, planes.
- Solids gallery: cube, cuboid, tetrahedron, prisms, pyramids, cylinder, cone, sphere, hemisphere, Platonic solids, lathe/revolution solids, free convex polyhedron.
- Parametric solids with dimensions, radius, height, side counts, segments.
- Push-pull extrusion from a 2D polygon or selected face.
- Move/add/remove vertices where topology remains valid.
- Face/edge/vertex selection and sub-selection.
- Label vertices, edges, faces, planes, angles.
- Color faces, edges, planes, cross-sections.
- Hide faces/edges/vertices without deleting.
- Plane cuts and cross-sections.
- Nets/unfolding with hinge metadata and optional fold animation.
- Measurements: edge lengths, face areas, surface area, volume, dihedral angles, Euler characteristic.
- Object navigator/layers panel for solids, faces, vertices, sections, nets.
- Export current 3D view as PNG and scene as JSON; SVG fallback export where possible.

Renderer:

- Primary: WebGL/Three.js, code-split and lazy loaded.
- Fallback: simplified SVG/Canvas projected view for no-WebGL environments.
- The scene model remains renderer-independent.

### Geometry Lab Delta

Use semantic operations where possible:

```ts
type GeometryLabDelta =
  | { op: 'addPoint2D'; point: Point2D }
  | { op: 'addPoint3D'; point: Point3D }
  | { op: 'updatePoint'; id: string; changes: Partial<Point2D | Point3D> }
  | { op: 'addEntity2D'; entity: GeometryEntity2D }
  | { op: 'addEntity3D'; entity: GeometryEntity3D }
  | { op: 'updateEntity'; id: string; changes: unknown }
  | { op: 'delete'; ids: string[] }
  | { op: 'setSceneLink'; link: GeometrySceneLink }
  | { op: 'clear2D' }
  | { op: 'clear3D' }
  | { op: 'clearAll' }
  | { op: 'batch'; deltas: GeometryLabDelta[] };
```

Camera changes should not emit scene deltas by default. Hosts may opt into shared view state separately.

## Math Workspace

The workspace combines instruments without making them depend on each other.

Features:

- Add/remove instrument panels.
- Split layout and tabs.
- Shared lesson metadata.
- Shared asset library.
- Cross-instrument links: graph expression copied into whiteboard; 2D net linked to 3D solid; spreadsheet data linked to graphing.
- Snapshot composed of child instrument snapshots.
- Collaboration presence routed per instrument.

## Platform Integration Targets

Teams and Google Classroom support should be built as hosted web-app embeds over the SDK, not as platform code inside the math engines.

Shared SDK support:

- `klein-sdk/embed`: normalized launch context, embed URL builder/parser, and iframe `postMessage` bridge types.
- `klein-sdk/integrations/teams`: Teams tab URL and manifest template helpers.
- `klein-sdk/integrations/google-classroom`: Classroom add-on iframe URL and route config helpers.

Repository scaffolding:

- `apps/web-host`: placeholder for the HTTPS app that renders SDK instruments in iframe-compatible routes.
- `integrations/teams`: Teams manifest template and implementation notes.
- `integrations/google-classroom`: Classroom add-on route template and implementation notes.

Teams model:

- render the SDK web host inside personal/configurable Teams tabs;
- keep Teams SSO, Teams JavaScript SDK usage, tab configuration save, and app installation metadata in the host app;
- pass only a normalized launch context into SDK instruments.

Google Classroom model:

- render the SDK web host through Classroom add-on iframes: attachment discovery, teacher view, student view, student work review, and link upgrade;
- keep Google OAuth, Classroom API calls, add-on token exchange, attachment creation, student work loading, and grade passback in the host app;
- persist SDK snapshots as student work or assignment activity state.

Slack can later be a launch/share/notification integration, but Teams and Google Classroom are the first iframe-hosting targets.

## Collaboration Boundary

The SDK provides a generic adapter, but the host provides the transport:

```ts
interface CollaborationTransport<TSnapshot, TDelta> {
  connect(): Promise<void>;
  disconnect(): void;
  sendDelta(delta: TDelta, meta: DeltaMeta): void;
  sendSnapshot(snapshot: TSnapshot): void;
  onDelta(handler: (delta: TDelta, meta: DeltaMeta) => void): void;
  onSnapshot(handler: (snapshot: TSnapshot) => void): void;
  onPresence?(handler: (presence: PresenceEvent) => void): void;
}
```

Rules:

- Tool packages do not know WebSocket URLs, tokens, users, room slugs, or persistence endpoints.
- Host apps own auth and authorization.
- Collaboration wrappers replay snapshots/deltas through the public instrument API.
- Server-side sanitation is still required in the host backend.
- Presence/cursors are optional and never part of the persisted scene.

## Persistence

Host platforms persist validated snapshots and optionally append deltas.

Recommended strategy:

- Save snapshots periodically and on room close.
- Append deltas for audit/replay when needed.
- Compact delta logs into snapshots server-side.
- Store SDK version and snapshot version.
- Reject or quarantine invalid imported snapshots.

## Import / Export

Core exports:

- JSON snapshot.
- SVG for 2D scenes and whiteboard.
- PNG for whiteboard, graphing, and 3D current view.
- CSV for spreadsheet/statistics.
- LaTeX/plain text for expressions.

Later:

- PDF.
- thumbnails.
- selected-object export.
- simple GeoGebra importers if licensing and format terms are acceptable.

Security:

- Imported JSON is untrusted.
- Text renders as text, never HTML.
- No `dangerouslySetInnerHTML` equivalent.
- Image/media import must cap file size, dimensions, MIME type, and URL schemes.

## Accessibility and Localization

Minimum:

- Keyboard shortcuts for every core tool.
- Configurable shortcuts.
- ARIA labels for controls.
- Focusable scene surfaces.
- Keyboard panning/orbit/zoom.
- Reduced-motion support.
- Non-color axis/selection cues.
- Default English and Romanian labels.
- Host label override API.

## Testing Strategy

Unit tests:

- snapshot validation and migrations;
- delta apply/invert/compose/compact;
- every tool controller;
- geometry math, hit-testing, snapping, constructions;
- 3D mesh generation, transforms, raycast helpers, work planes, cross-sections, nets;
- math parser/evaluator/formatter;
- algebra rewrite rules with golden tests;
- graph sampling, discontinuity handling, intersections;
- probability distributions and statistics;
- spreadsheet formulas and range references.

Integration tests:

- standalone mount/destroy for each instrument;
- local delta emission;
- remote delta apply without echo;
- undo/redo across fake peers;
- import invalid snapshot rejection;
- export smoke tests;
- keyboard/touch/pointer workflows.

Browser smoke tests:

- Chrome, Safari, Firefox.
- Mouse, trackpad, touch/pen.
- No-WebGL fallback.
- Large scenes.
- Reduced motion.

## Performance Guardrails

- Use pure data transforms with structural sharing.
- Avoid full snapshot clones during drag.
- Batch gesture commits.
- Memoize heavy geometry measurements.
- Graph sampling is adaptive and bounded.
- 3D uses demand-driven render loop where possible.
- Dispose generated WebGL geometry/materials.
- Cap entities, AST nodes, samples, spreadsheet cells, and imported JSON size.

## Dependency Policy

Allowed by default:

- TypeScript.
- Small MIT/ISC/Apache utilities.
- Three.js for WebGL rendering if kept renderer-only and lazy loaded.
- A small parser helper only if auditable and permissively licensed.

Avoid:

- GeoGebra runtime.
- GPL/AGPL CAS or math engines.
- large drawing frameworks with licensing/product constraints.
- networking clients inside instruments.
- framework dependencies in core modules.

## Implementation Phases

### Phase 0 - Repository Reset

- Replace the demo custom element with SDK skeleton.
- Add TypeScript build that supports subpath exports.
- Add test runner and CI scripts.
- Add `core` runtime modules: ids, validation, deltas, history, tools, events, export types.
- Add docs for host-neutral boundaries and dependency policy.

### Phase 1 - Whiteboard V1

- Build the framework-independent whiteboard instrument.
- Implement tool controllers for select, pen, highlighter, eraser, shapes, lines/arrows, text, sticky.
- Add snapshot/delta validation.
- Add undo/redo through inverse deltas.
- Add SVG/PNG/JSON export.
- Add standalone example.

### Phase 2 - Geometry Core + Geometry Calculator V1

- Add geometry-core with points, lines, segments, rays, vectors, polygons, circles, arcs, conics.
- Add dynamic construction dependency graph.
- Add snap and hit-test engine.
- Add measurement engine.
- Add transform tools.
- Add geometry calculator DOM instrument.

### Phase 3 - Geometry Lab 2D

- Build guided Geometry Lab 2D on top of geometry-core.
- Add shape stamps, numeric fields, object navigator, labels, colors, hide/cut, measurement panel.
- Add 2D scene export/import.
- Add K-12 workflow smoke tests.

### Phase 4 - Geometry Lab 3D Movable Space

- Add 3D scene model with z-up coordinates.
- Add WebGL renderer boundary and no-WebGL fallback.
- Add movable camera, ViewCube, frame all/selected, projection toggle.
- Add raycast selection and hover.
- Add work planes and placement on active plane.
- Add transform gizmos for translate/rotate/scale.
- Add solids gallery, push-pull extrusion, cross-sections, nets, measurements.
- Keep all 3D math in pure tested modules.

### Phase 5 - Math Core + Scientific Calculator

- Implement parser/evaluator/formatter.
- Add exact rational and approximate decimal output.
- Ship scientific calculator with history and snapshot/delta support.

### Phase 6 - Graphing Calculator

- Add graphing-core viewport and sampling.
- Add explicit functions, equations, inequalities, points, sliders, tables.
- Add roots/intersections/extrema.
- Add graph exports and collaboration-ready deltas.

### Phase 7 - Algebra / CAS Lab

- Add algebra-core rewrite rules and step model.
- Add simplify/expand/factor basics.
- Add linear/quadratic solving.
- Add derivatives/integrals after parser/evaluator coverage is strong.
- Add teacher controls for hints vs answers.

### Phase 8 - Probability + Spreadsheet

- Add statistics/probability module.
- Add spreadsheet formula engine reusing math-core.
- Add data-to-graphing handoff.

### Phase 9 - 3D Graphing

- Add math-focused 3D graphing instrument.
- Support points, vectors, lines, planes, surfaces, contours.
- Reuse 3D camera/rendering infrastructure but keep it separate from Geometry Lab object manipulation.

### Phase 10 - Workspace + Collaboration Adapters

- Add workspace composition.
- Add generic collaboration adapters.
- Add examples with fake transport and host-provided WebSocket transport.
- Document backend requirements for per-tool message types and sanitation.

### Phase 11 - GeoGebra Runtime Exit

- Audit old GeoGebra-backed flows.
- Route new sessions to first-party tools.
- Keep legacy rooms readable where required.
- Add optional importers where licensing allows.
- Remove GeoGebra runtime dependencies from active SDK paths.

## Acceptance Criteria

The SDK is viable when:

- It imports into a plain DOM app with no framework.
- Each instrument mounts, unmounts, saves, loads, validates, and exports.
- No first-party instrument imports GeoGebra runtime code.
- Whiteboard core workflows are stable.
- Geometry Lab has both 2D and movable 3D scenes.
- Scientific calculator, graphing, algebra, probability, and spreadsheet cover the first classroom scope.
- All persisted state is validated JSON.
- Deltas can replay into snapshots.
- Collaboration wrappers can apply remote deltas without echo loops.
- Build, typecheck, and tests pass from a clean checkout.

## Immediate Next Steps

1. Decide package name: keep `klein-sdk` or publish as `@kleinmath/sdk`.
2. Replace `src/index.ts` demo custom element with public exports and skeleton module folders.
3. Add `src/core` with `Instrument`, `DeltaMeta`, validation, history, and tool-controller types.
4. Add a minimal whiteboard scene model and one tool controller as the first vertical slice.
5. Add tests before adding more instruments.
6. Keep the old `klein-tools-sdk` geometry-lab code as reference material, not as code to blindly copy.

## Source Material Used

- `/Users/andrei/projects/klein-tools-sdk/TOOLS_SDK_PLAN.md`
- `/Users/andrei/projects/klein-tools-sdk/packages/geometry-lab/IMPROVEMENT_PLAN.md`
- `/Users/andrei/projects/klein-tools-sdk/packages/geometry-lab/src/types.ts`
- GeoGebra public calculator surfaces: `https://www.geogebra.org/graphing`, `https://www.geogebra.org/geometry`, `https://www.geogebra.org/3d`, `https://www.geogebra.org/cas`, `https://www.geogebra.org/scientific`, `https://www.geogebra.org/calculator`, `https://www.geogebra.org/probability`
