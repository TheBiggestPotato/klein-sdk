# Changelog

Versions follow [semantic versioning](https://semver.org). Below 1.0.0 a minor
version may change the surface; every such change is listed here.

## 0.2.0 — 2026-09-28

The first tagged release. Everything the Klein client runs on is in it: five
tools, the classroom, exam, assessment, storage, collaboration and embedding
contracts, and a Geometry Lab that is a construction tool rather than a viewer.

### Geometry Lab

- **Constructions in the plane.** Points, segments, rays, vectors, lines,
  polygons, angles, midpoints, intersections, parallels, perpendiculars, angle
  bisectors, circles, and circles through three points — each carrying its
  dependencies, so moving a parent moves everything built on it.
- **Constructions in space.** Work planes (by three points, by equation, parallel
  or perpendicular to another), line–plane and plane–plane intersections,
  cross-sections, solids, sampled `z = f(x, y)` surfaces, explicit equation
  surfaces, and implicit surfaces through `compileImplicitSurface3D`.
- **Transformations and constraints.** `translate2D`, `translateBy2D`,
  `reflectInLine2D`, `reflectInPoint2D`, `rotate2D` and `dilate2D` as live
  constructions, not one-off edits; `addConstraint2D` and `removeConstraint2D`
  for constraints solved on every edit.
- **Sliders, traces and loci.** `addSlider2D` with `setSliderValue2D`,
  `startTrace2D`/`stopTrace2D`/`getTrace2D` for a bounded trace of a moving
  point, and `addDynamicLocus2D` for a locus that follows the construction
  rather than recording pixels.
- **Measurements, exactly.** Distances, angles, areas, volumes and surface areas,
  reported exactly where the figure allows it (`2√5`, not `4.4721`).
- **A learning layer.** `GEOMETRY_EXERCISE_BANK` ships 24 exercises as data;
  `learnerGeometryExercise` strips the answer, `markGeometryExercise` reports
  which criteria are met and separates what was constructed from what merely
  looks true at these coordinates, `nextGeometryHint` releases hints one rung at
  a time, `checkGeometryGoal` answers a single target, and
  `detectGeometryConjectures` moves the free points to tell an invariant from a
  coincidence.
- **Output and access.** `renderGeometryLabSvg2D` and `renderGeometryLabSvg3D`
  with per-object roles and a figure description in `<title>`/`<desc>`,
  `describeGeometryLabFigure` for the same figure in prose,
  `geometryConstructionProtocol` for how it was built, `renderGeometryLabLatex`
  and `renderGeometryLabPdf` for documents and printing, `unfoldSolidNet` and
  `foldSolidNet` for a solid's net, and `createGeometryKeyboardSession` for
  constructing without a pointer.
- **Performance held to a baseline.** `npm run bench:geometry-lab` measures what a
  lesson does — dragging a point with dependents, a plane carrying ten, a chain
  held by twenty constraints — and `bench:geometry-lab:check` fails when one
  regresses. The recompute path now stages edits in one buffer, shares records
  instead of deep-copying them, and caches mesh checks on the arrays.

### Everything else in this release

- Graphing calculator, scientific calculator, probability explorer and
  whiteboard runtimes, each with snapshots, deltas, validation, undo history and
  SVG/JSON/CSV export.
- `klein-sdk/tools`: one registry, `createKleinToolRuntime`, and alias
  normalisation for the room keys Klein hosts use.
- `klein-sdk/collab`: a WebSocket transport that serialises by revision, bounds
  its offline queue, resumes from the last applied revision and checkpoints on
  demand; in-memory transports for tests; two-way bindings for instruments and
  runtimes.
- `klein-sdk/assessment`: contract v1 with a learner-safe item DTO that is
  rejected if it carries an answer key, a solution, a rubric or feedback, plus
  canonical fixtures.
- `klein-sdk/classroom`, `/exam`, `/persistence`, `/embed` and the Teams and
  Google Classroom helpers.

### Packaging

- The published package is `dist`, `apps`, `fixtures`, `integrations` and the
  README. Working documents no longer ship with it or live in the repository.
- The README is a guide rather than a list: what the SDK is, what it renders
  (pictures produced by the SDK itself, regenerated with `npm run gallery`), and
  a walkthrough whose examples are run against the built package before release.

### Upgrading from the 0.1.0 tarball

The version moved to 0.2.0 because the 0.1.0 name already refers to a tarball
built before this work. A host that vendors the artifact should update the file
name, the dependency and the lockfile integrity together — in klein-client that
is `vendor/klein-sdk-0.2.0.tgz`, `package.json`, `package-lock.json` and
`scripts/refresh-vendor-sdk.mjs`.

No documented export was removed or renamed.
