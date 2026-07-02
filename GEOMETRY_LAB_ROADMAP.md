# Geometry Lab Roadmap

Status: working checklist for the new `klein-sdk/geometry-lab` implementation.

## Source Policy

- `klein-sdk` is the active SDK.
- `klein-tools-sdk` is deprecated.
- Use `klein-tools-sdk` only as reference material for proven behavior, geometry helpers, UI ideas, and tests that should be replicated here.
- Do not add new product work to `klein-tools-sdk`.
- Do not make `klein-sdk` depend on `klein-tools-sdk`.
- When porting behavior from `klein-tools-sdk`, copy the concept intentionally into the `klein-sdk` architecture: framework-independent APIs, deterministic scene models, validated snapshots/deltas, and host-owned persistence.

## Priority 1: Core Geometry Power

- [x] Build a real construction dependency graph.
- [x] Recompute dependent objects when base points move.
- [x] Add object dependency summaries for object panel rendering.
- [x] Add SDK object-panel dependency rows for client rendering after client migration to `klein-sdk`.
- [x] Add intersection tool for lines, rays, and segments.
- [x] Extend intersection tool to circles and polygon edges.
- [x] Add SDK 3D plane intersection helpers for line-plane and plane-plane intersections.
- [x] Add midpoint construction.
- [x] Add perpendicular line construction.
- [x] Add parallel line construction.
- [x] Add angle bisector construction.
- [x] Add circle by center and radius.
- [x] Add circle through 3 points.
- [x] Add tangent line construction.
- [x] Add locus/path support.
- [x] Add serializable object-level constraints: fixed length, fixed angle, parallel lock, perpendicular lock, equal sides, equal radius.

## Priority 2: Selection, Editing, and Transforms

- [ ] Add robust multi-select.
- [ ] Add rectangular marquee selection.
- [ ] Add group and ungroup.
- [ ] Add duplicate selection.
- [ ] Add translate transform.
- [ ] Add rotate transform.
- [ ] Add scale transform.
- [ ] Add reflect over line or axis.
- [ ] Add lock and unlock objects.
- [ ] Add hide and show objects.
- [ ] Add object layer ordering where it matters.
- [ ] Add context menus for selected objects.
- [ ] Add constraint solver/enforcement during point and object dragging.

## Priority 3: Snapping and Precision

- [ ] Split snapping into independent toggles: grid, points, midpoint, intersection, axis, angle, shape edges.
- [ ] Add snap strength settings.
- [ ] Add visible snap marker labels.
- [ ] Add temporary snap override with modifier keys.
- [ ] Add typed coordinate input for points.
- [ ] Add typed equation input for lines.
- [ ] Add typed equation input for circles.
- [ ] Add typed object editing for length, radius, angle, side count, and coordinates.

## Priority 4: 2D Geometry Tools

- [ ] Add rays.
- [ ] Add infinite lines.
- [ ] Add segments.
- [ ] Add vectors.
- [ ] Add circles.
- [ ] Add arcs.
- [ ] Add conics.
- [ ] Add parametric curves.
- [ ] Add regular polygon by side count.
- [ ] Add regular polygon by center and vertex.
- [ ] Add editable polygon vertices.
- [ ] Add polygon side constraints.
- [ ] Add polygon angle constraints.
- [ ] Add triangle type detection.
- [ ] Add congruence markers.
- [ ] Add similarity markers.
- [ ] Add cyclic quadrilateral checks.
- [ ] Improve angle tool: create from 3 points, from 2 intersecting lines, interior/exterior toggle, custom arc radius.

## Priority 5: 3D Geometry Tools

- [ ] Add work planes by 3 points.
- [ ] Add planes by equation.
- [ ] Add plane parallel to another plane.
- [ ] Add plane perpendicular to another plane or line.
- [ ] Add point-plane distance.
- [ ] Add line-plane intersection.
- [ ] Add plane-plane intersection.
- [ ] Add prism tool.
- [ ] Add pyramid tool.
- [ ] Add cylinder tool.
- [ ] Add cone tool.
- [ ] Add sphere tool.
- [ ] Add polyhedra library.
- [ ] Add cross-section slicing with planes.
- [ ] Add unfolded nets for solids.
- [ ] Add volume measurements.
- [ ] Add surface area measurements.
- [ ] Add dihedral angle measurements.
- [ ] Add camera presets: front, top, side, isometric.
- [ ] Add fit selection.
- [ ] Add orbit target controls.

## Priority 6: Export, Import, and Persistence

- [ ] Export clean SVG.
- [ ] Export clean PNG.
- [ ] Export JSON snapshot.
- [ ] Import JSON snapshot.
- [ ] Add export options: background white, transparent, grid on/off, measurements on/off.
- [ ] Add PDF export.
- [ ] Add thumbnail export.
- [ ] Add server storage adapter contract.
- [ ] Add local storage adapter.
- [ ] Add optimistic revisions for server saves.
- [ ] Add snapshot migrations.
- [ ] Add snapshot validation tests.

## Priority 7: Classroom and Team Workflows

- [ ] Add teacher templates with locked starter objects.
- [ ] Add student copy workflow.
- [ ] Add assignment mode.
- [ ] Add teacher review snapshots.
- [ ] Add live collaboration transport adapter.
- [ ] Add collaborative cursors.
- [ ] Add ownership colors.
- [ ] Add comments on objects.
- [ ] Add teacher freeze/unfreeze scene.
- [ ] Add replay of construction history.
- [ ] Add shareable read-only links.
- [ ] Add team editable sessions.
- [ ] Add classroom-scoped sessions.

## Priority 8: UI and Product Polish

- [ ] Redesign object panel as searchable object tree.
- [ ] Add inline rename.
- [ ] Add object type filters.
- [ ] Add visibility and lock toggles in object list.
- [ ] Add command palette.
- [ ] Add tool search.
- [ ] Add richer tooltips with visual previews.
- [ ] Add concise empty states.
- [ ] Add improved mobile toolbar.
- [ ] Add accessible keyboard shortcuts.
- [ ] Add visible undo and redo buttons.
- [ ] Add history panel.
- [ ] Add named checkpoints.
- [ ] Add restore previous version.

## Implementation Order

1. Port the useful geometry model, hit testing, snap logic, export logic, and validation ideas from deprecated `klein-tools-sdk`.
2. Build the dependency graph and construction engine in `klein-sdk/geometry-core`.
3. Make `klein-sdk/geometry-lab` a real instrument on top of that engine.
4. Add 2D construction tools and complete export/import.
5. Add multi-select and transforms.
6. Add 3D planes, solids, cross-sections, and nets.
7. Add classroom/team persistence and replay workflows through host-provided adapters.
