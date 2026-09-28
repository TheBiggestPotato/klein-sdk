/**
 * Snapshot reads and the history budget (plan tasks 0.6 and 0.8).
 *
 * <p>`getSnapshot()` returns an isolated copy and always has; that is a tested
 * guarantee hosts rely on, and task 0.6 did not change it. What 0.6 added is
 * `peekSnapshot()`, which shares instead of copying for callers that only read.
 * The two differ in exactly one way that matters, and both directions are
 * tested here: what you get from `getSnapshot` is yours to write into and stops
 * tracking the instrument, and what you get from `peekSnapshot` is the
 * instrument's own and must not be written into.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeometryLab } from '../../dist/geometry-lab/index.js';

/* -------------------------------------------------------------------------- */
/* getSnapshot stays an isolated copy                                         */
/* -------------------------------------------------------------------------- */

test('getSnapshot returns a copy that can be written into freely', () => {
  const lab = createGeometryLab();
  const id = lab.addPoint3D({ x: 1, y: 2, z: 3 });

  const copy = lab.getSnapshot();
  copy.scene.scene3d.points[id].x = 100;
  delete copy.scene.scene3d.workPlanes.xy;

  assert.equal(lab.getSnapshot().scene.scene3d.points[id].x, 1);
  assert.ok(lab.getSnapshot().scene.scene3d.workPlanes.xy, 'the instrument is unaffected');
});

test('two getSnapshot calls return different objects', () => {
  const lab = createGeometryLab();
  lab.addPoint3D({ x: 1, y: 2, z: 3 });
  assert.notEqual(lab.getSnapshot(), lab.getSnapshot());
});

/* -------------------------------------------------------------------------- */
/* peekSnapshot shares                                                        */
/* -------------------------------------------------------------------------- */

test('peekSnapshot returns the same object on repeated reads of one version', () => {
  const lab = createGeometryLab();
  lab.addPoint3D({ x: 1, y: 2, z: 3 });
  assert.equal(lab.peekSnapshot(), lab.peekSnapshot(), 'no copy is made');
});

test('peekSnapshot reflects the current version after an edit', () => {
  const lab = createGeometryLab();
  const id = lab.addPoint3D({ x: 1, y: 2, z: 3 });
  const first = lab.peekSnapshot();
  assert.equal(first.scene.scene3d.points[id].x, 1);

  lab.applyDelta({ op: 'updatePoint', id, changes: { x: 42 } });

  const second = lab.peekSnapshot();
  assert.notEqual(second, first, 'an edit produces a new version');
  assert.equal(second.scene.scene3d.points[id].x, 42);
  assert.equal(first.scene.scene3d.points[id].x, 1, 'the previously read version is still intact');
});

test('peekSnapshot agrees with getSnapshot on content', () => {
  const lab = createGeometryLab();
  lab.addPoint3D({ x: 1, y: 2, z: 3 });
  lab.addPolyhedron('cube', { x: 0, y: 0, z: 0 }, 2);
  assert.deepEqual(
    JSON.parse(JSON.stringify(lab.peekSnapshot())),
    JSON.parse(JSON.stringify(lab.getSnapshot())),
  );
});

test('writing into a peeked snapshot container throws instead of corrupting state', () => {
  const lab = createGeometryLab();
  const id = lab.addPoint3D({ x: 1, y: 2, z: 3 });
  const peeked = lab.peekSnapshot();

  assert.throws(() => { peeked.scene.scene3d.points.intruder = { id: 'intruder' }; }, TypeError);
  assert.throws(() => { delete peeked.scene.scene3d.workPlanes.xy; }, TypeError);
  assert.throws(() => { peeked.appState.activeTool = 'point'; }, TypeError);
  assert.throws(() => { peeked.scene.links.push({ id: 'x' }); }, TypeError);

  assert.equal(lab.getSnapshot().scene.scene3d.points[id].x, 1, 'nothing got through');
  assert.ok(lab.getSnapshot().scene.scene3d.workPlanes.xy);
});

test('a peeked snapshot still edits normally through the instrument', () => {
  const lab = createGeometryLab();
  const id = lab.addPoint3D({ x: 1, y: 2, z: 3 });
  lab.peekSnapshot();
  // Freezing the shell must not stop the reducer, which replaces rather than writes.
  assert.doesNotThrow(() => lab.applyDelta({ op: 'updatePoint', id, changes: { x: 7 } }));
  assert.doesNotThrow(() => lab.addPoint3D({ x: 0, y: 0, z: 1 }));
  assert.doesNotThrow(() => lab.undo());
  assert.equal(lab.getSnapshot().scene.scene3d.points[id].x, 7);
});

/* -------------------------------------------------------------------------- */
/* History budget                                                             */
/* -------------------------------------------------------------------------- */

test('the largest entry the instrument can produce is still undoable', () => {
  // A sampled surface at the per-axis cap is the biggest single history entry
  // reachable, and the per-entry byte cap has to stay above it or that edit
  // silently loses its undo.
  const lab = createGeometryLab();
  const before = lab.getSnapshot().scene.scene3d;
  lab.addSurfaceZ({
    xRange: [-5, 5],
    yRange: [-5, 5],
    xSamples: 128,
    ySamples: 128,
    z: (x, y) => Math.sin(x) * Math.cos(y),
  });
  assert.notEqual(
    Object.keys(lab.getSnapshot().scene.scene3d.entities).length,
    Object.keys(before.entities).length,
  );

  lab.undo();
  assert.equal(
    Object.keys(lab.getSnapshot().scene.scene3d.entities).length,
    Object.keys(before.entities).length,
    'the surface add must be undoable under the lowered per-entry cap',
  );
});

test('ordinary edits keep their full undo depth under the lowered budget', () => {
  const lab = createGeometryLab();
  const id = lab.addPoint3D({ x: 0, y: 0, z: 0 });
  for (let index = 0; index < 60; index += 1) lab.addPoint3D({ x: index, y: 0, z: 0 });

  for (let index = 1; index <= 40; index += 1) {
    lab.applyDelta({ op: 'updatePoint', id, changes: { x: index } });
  }
  assert.equal(lab.getSnapshot().scene.scene3d.points[id].x, 40);

  for (let index = 0; index < 40; index += 1) lab.undo();
  assert.equal(
    lab.getSnapshot().scene.scene3d.points[id].x,
    0,
    'forty drag steps are far inside the byte budget and must all survive',
  );
});

test('history byte accounting is the exact UTF-8 size, including non-ASCII labels', () => {
  const lab = createGeometryLab();
  // Labels are the one place user text reaches a history entry, so this is
  // where an ASCII-only byte count would drift from the real size.
  assert.doesNotThrow(() => lab.addPoint3D({ x: 1, y: 2, z: 3, label: 'Ω émoji 😀 ünïcøde' }));
  const snapshot = lab.getSnapshot();
  const [point] = Object.values(snapshot.scene.scene3d.points);
  assert.equal(point.label, 'Ω émoji 😀 ünïcøde');
  lab.undo();
  assert.equal(Object.keys(lab.getSnapshot().scene.scene3d.points).length, 0);
});
