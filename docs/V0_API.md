# Klein SDK v0 API Reference

This document lists the supported v0 subpaths for hosts that embed Klein tools without depending on the Klein client or server.

## Runtime Foundation

### `klein-sdk/tools`

Use this as the default host entry point when the tool is selected dynamically.

Key exports:

- `KLEIN_V0_TOOLS`
- `createKleinToolRuntime(input)`
- `normalizeKleinToolKey(value)`
- `getKleinToolDefinition(value)`
- `isKleinToolKey(value)`
- `requireKleinToolKey(value)`

Supported v0 keys:

- `graphing`
- `geometry-lab`
- `scientific`
- `probability`
- `whiteboard`

Current Klein room aliases such as `geogebra-graphing`, `geogebra-3d`, `geometrie-3d`, `geogebra-scientific`, `geogebra-probability`, and `tabla` normalize into those keys. Legacy 3D aliases normalize to `geometry-lab`.

### `klein-sdk/core`

Shared framework-independent contracts for instruments, tool runtimes, snapshots, deltas, commands, validation, exports, and errors.

Key exports:

- `KleinInstrument`
- `KleinToolRuntime`
- `InstrumentSnapshot`
- `DeltaMeta`
- `ToolCommand`
- `ValidationResult`
- `KleinSdkError`

## Calculators

### `klein-sdk/graphing`

Graphing calculator runtime with expressions, points, sliders, sampling, analysis, validation, JSON/SVG/CSV export, and shared runtime support.

Key exports:

- `createGraphingCalculator(options)`
- `createGraphingRuntime(options)`
- `createEmptyGraphingSnapshot()`
- `validateGraphingSnapshot(snapshot)`
- `validateGraphingDelta(delta)`
- `parseGraphExpression(input)`
- `evaluateGraphExpression(expression, options)`
- `sampleGraphExpression(expression, viewport)`
- `findGraphRoots(expression, viewport)`
- `findGraphIntersections(a, b, viewport)`

### `klein-sdk/geometry-lab`

2D/3D Geometry Lab runtime. The v0 3D surface supports command-created points, segments, cube/sphere solids, sampled `z = f(x, y)` surfaces, explicit equation surfaces such as `y = x^2 + z^2`, measurements, camera presets, validation, JSON import/export, and SVG rendering/export. The SVG renderer uses vertical-FOV perspective or target-matched orthographic projection, near-plane clipping, and stable face-level painter ordering.

`createGeometryLab` accepts `initialView`, `historyLimit`, `historyByteLimit`, and partial `complexityLimits` overrides. `initialView` initializes the host-facing `activeView` state for a new document (`2d`, `3d`, or `split`); an `initialSnapshot` remains authoritative when both are supplied. Defaults bound scene records, sampled meshes, surface probe work, delta nesting, validation output, history memory, and serialized exports; zero history limits disable local undo retention. Renderer selection and pointer snapping are host-owned, so the former no-op `renderer3d` and `snapEnabled` options are not part of the v0 contract and are rejected when passed by JavaScript callers.

The implementation is decomposed behind the public entry point: domain types, strict validation/schema, commands, transactional reduction, dependency/history handling, equations, solids, rendering, and the instrument have one-way module dependencies. `activeView`, `view2d`, and `activeTool` remain persisted host-facing state; the bundled non-interactive DOM preview renders the 3D scene.

Key exports:

- `createGeometryLab(options)`
- `createGeometryLabRuntime(options)`
- `createEmptyGeometryLabSnapshot()`
- `validateGeometryLabSnapshot(snapshot)`
- `validateGeometryLabDelta(delta)`
- `parseGeometryLabSnapshotJson(json)`
- `compileEquationSurface3D(input)`
- `renderGeometryLabSvg3D(snapshot, options, complexityLimits)`
- `resolveGeometryLabComplexityLimits(overrides)`
- `preflightGeometryLabSnapshotComplexity(snapshot, overrides)`
- `preflightGeometryLabDeltaComplexity(delta, overrides)`

### `klein-sdk/graphing-3d`

Legacy compatibility facade backed by Geometry Lab's command runtime and strict validators. New hosts should use `klein-sdk/geometry-lab` and the `geometry-lab` tool key; existing `graphing-3d`, `geogebra-3d`, and `geometrie-3d` launch contexts continue to resolve to Geometry Lab through `klein-sdk/tools`.

Key exports:

- `createGraphing3DCalculator(options)`
- `createGraphing3DRuntime(options)`
- `createEmptyGraphing3DSnapshot()`
- `validateGraphing3DSnapshot(snapshot)`
- `validateGraphing3DDelta(delta)`
- `parseGraphing3DSnapshotJson(json)`

### `klein-sdk/scientific` and `klein-sdk/calculator`

Deterministic scientific calculator runtime with expression evaluation, angle mode, precision settings, history, validation, and JSON/text export.

Key exports:

- `createScientificCalculator(options)`
- `createScientificCalculatorRuntime(options)`
- `createEmptyCalculatorSnapshot()`
- `createEmptyScientificSnapshot()`
- `validateCalculatorSnapshot(snapshot)`
- `validateCalculatorDelta(delta)`
- `applyCalculatorDelta(snapshot, delta)`

### `klein-sdk/probability`

Probability/statistics runtime with distribution state, descriptive data, evaluation helpers, validation, JSON/CSV export, and shared runtime support.

Key exports:

- `createProbabilityExplorer(options)`
- `createProbabilityRuntime(options)`
- `createEmptyProbabilitySnapshot()`
- `validateProbabilitySnapshot(snapshot)`
- `validateProbabilityDelta(delta)`
- `applyProbabilityDelta(snapshot, delta)`
- `evaluateDistributionModel(model)`

## Whiteboard

### `klein-sdk/whiteboard`

Framework-independent DOM/SVG whiteboard with classroom-ready snapshots, validation, deltas, exports, tool metadata, delta compaction, frame exports, presence/comment contracts, and embedded calculator cards.

Key exports:

- `createWhiteboard(options)`
- `createWhiteboardRuntime(options)`
- `createEmptyWhiteboardSnapshot()`
- `validateWhiteboardSnapshot(snapshot)`
- `validateWhiteboardDelta(delta)`
- `applyWhiteboardDelta(snapshot, delta)`
- `getWhiteboardToolDefinitions()`
- `compactWhiteboardDeltas(deltas, options)`
- `createCompactedWhiteboardDelta(deltas, options)`
- `exportWhiteboardSvg(snapshot, options)`
- `exportWhiteboardFrameSvg(snapshot, frameId, options)`
- `createWhiteboardEmbeddedCardElement(input)`
- `createWhiteboardPresenceOverlay(snapshot, input)`
- `createWhiteboardObjectComment(input)`

## Classroom, Exam, Storage, Collaboration, And Embeds

### `klein-sdk/classroom`

Classroom policy/runtime contracts for assignment authoring, student work, review, comments, replay, freeze, backend adapters, and REST route constants.

Key exports:

- `createClassroomPolicy(input)`
- `createClassroomRuntime(input)`
- `CLASSROOM_API_ROUTES`

### `klein-sdk/exam`

Soft exam-mode policy and instrumentation layer. It gates SDK commands and records integrity events, but it does not provide device lockdown by itself.

Key exports:

- `createExamController(input)`
- `watchBrowserExamIntegrity(controller, options)`
- `EXAM_API_ROUTES`

### `klein-sdk/persistence`

Backend-agnostic snapshot storage contract and local in-memory/session adapters.

Key exports:

- `KleinStorageAdapter`
- `createKleinStorageAdapter(adapter)`
- `createLocalStorageSessionAdapter()`

### `klein-sdk/collab`

Host-owned collaboration transport contracts, generic message envelopes, presence helpers, and in-memory transports for tests/examples.

Key exports:

- `CollabMessage`
- `createDeltaMessage(input)`
- `createCollaborationWebSocketTransport(options)`
- `createCollaborationWebSocketUrl(input)`
- `parseCollaborationMessage(value)`
- `bindCollaboration(input)`
- `createInMemoryCollaborationHub()`
- `createInMemoryCollaborationTransport(options)`
- `sendCollaborativeCursor(transport, cursor)`

The WebSocket transport serializes local mutations by revision, bounds its offline queue,
resumes from the last applied revision, and applies exponential reconnect backoff. Hosts
still own ticket acquisition and provide a URL factory so credentials are not stored by
the SDK. A host can provide `snapshotProvider` plus `checkpointEveryDeltas` to create
durable checkpoints; classroom hosts should use a short checkpoint interval.
Call `transport.checkpoint(snapshot)` before submit or navigation when the host needs a
PostgreSQL-confirmed revision rather than an in-memory acknowledgement.
Both pending message count and estimated JSON bytes are bounded (`maxPendingMessages` and
`maxPendingBytes`) so a disconnected host cannot accumulate unbounded memory.

### `klein-sdk/embed`

Launch context parsing, signed launch verification, iframe/host bridge events, and normalized embedded modes.

Key exports:

- `createEmbedUrl(input)`
- `parseEmbedSearchParams(params)`
- `verifyEmbeddedLaunchContext(input)`
- `createEmbedHostBridge(options)`

### `klein-sdk/integrations/teams`

Helpers for Microsoft Teams tab URLs and manifest metadata. The host app still owns Teams JS initialization, SSO, and backend mapping.

Key exports:

- `createTeamsTabUrl(input)`
- `createTeamsManifest(input)`

### `klein-sdk/integrations/google-classroom`

Helpers for Google Classroom add-on/iframe context normalization. The host app still owns OAuth and Classroom API calls.

Key exports:

- `createClassroomIframeUrl(input)`
- `parseGoogleClassroomContext(input)`

## v0 Non-Goals

These exports may exist for development but are not part of the v0 deployment promise:

- `klein-sdk/algebra`
- `klein-sdk/spreadsheet`
- `klein-sdk/workspace`
- legacy GeoGebra-compatible shells
