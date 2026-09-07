/**
 * Complexity-scan and schema-validation caches (plan task 0.10).
 *
 * <p>Both caches remember that a particular object passed a particular check,
 * so that re-pricing an edit does not re-walk every vertex of a mesh that did
 * not change. Both are therefore safety machinery made faster, and the failure
 * they could introduce is the quiet one: a limit that stops being enforced, or
 * an invalid record that stops being reported, looks exactly like a clean
 * scene.
 *
 * <p>So the cases below are mostly violations. Each one is checked twice, and
 * interleaved with a clean check of the same object, because a cache that
 * confuses "seen before" with "fine" fails precisely on the second look.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  preflightGeometryLabSnapshotComplexity,
  resolveGeometryLabComplexityLimits,
} from '../../dist/geometry-lab/complexity.js';
import { validateGeometryLabSnapshotStrict } from '../../dist/geometry-lab/schema.js';
import { getGeometryLabInvariantIssues } from '../../dist/geometry-lab/invariants.js';
import { createGeometryLab } from '../../dist/geometry-lab/index.js';

function meshSnapshot() {
  const lab = createGeometryLab();
  for (let index = 0; index < 2; index += 1) {
    lab.addSurfaceZ({
      xRange: [-5, 5],
      yRange: [-5, 5],
      xSamples: 32,
      ySamples: 32,
      input: `z = sin(x) + ${index}`,
      z: (x, y) => Math.sin(x) * Math.cos(y) + index,
    });
  }
  lab.addPolyhedron('cube', { x: 0, y: 0, z: 0 }, 2);
  for (let index = 0; index < 10; index += 1) lab.addPoint3D({ x: index, y: 0, z: 0 });
  return lab.getSnapshot();
}

const MESH = meshSnapshot();
const clone = () => JSON.parse(JSON.stringify(MESH));

/* -------------------------------------------------------------------------- */
/* Complexity scanning                                                        */
/* -------------------------------------------------------------------------- */

test('a clean snapshot stays clean however many times it is scanned', () => {
  for (let pass = 0; pass < 4; pass += 1) {
    assert.equal(preflightGeometryLabSnapshotComplexity(MESH, {}).ok, true, `pass ${pass}`);
  }
});

test('a tight profile still reports on an object already scanned as clean', () => {
  // The dangerous ordering: scan clean first, so the cache is warm, then scan
  // the very same object under limits it cannot satisfy.
  assert.equal(preflightGeometryLabSnapshotComplexity(MESH, {}).ok, true);

  for (const overrides of [
    { maxTraversalNodes: 500 },
    { maxJsonBytes: 4096 },
    { maxTraversalDepth: 3 },
    { maxArrayItems: 10 },
    { maxObjectProperties: 3 },
    { maxSurfaceVerticesTotal: 100 },
    { maxPointRecords: 2 },
  ]) {
    const tight = preflightGeometryLabSnapshotComplexity(MESH, overrides);
    assert.equal(tight.ok, false, `expected ${JSON.stringify(overrides)} to be exceeded`);
    assert.ok(tight.issues.length > 0);
    // And the clean profile is unaffected by having just failed.
    assert.equal(preflightGeometryLabSnapshotComplexity(MESH, {}).ok, true);
  }
});

test('repeating a tight scan reports the same issues both times', () => {
  const overrides = { maxTraversalNodes: 500 };
  const first = preflightGeometryLabSnapshotComplexity(MESH, overrides);
  const second = preflightGeometryLabSnapshotComplexity(MESH, overrides);
  assert.deepEqual(second, first);
});

test('a shared limits object gives the same answer on every call', () => {
  const shared = { maxTraversalNodes: 800 };
  const results = [0, 1, 2].map(() => preflightGeometryLabSnapshotComplexity(MESH, shared));
  assert.deepEqual(results[1], results[0]);
  assert.deepEqual(results[2], results[0]);
  assert.equal(results[0].ok, false);
});

test('a circular reference is reported every time, never cached as clean', () => {
  const cyclic = { a: { b: {} } };
  cyclic.a.b.back = cyclic;
  for (let pass = 0; pass < 3; pass += 1) {
    const result = preflightGeometryLabSnapshotComplexity(cyclic, {});
    assert.equal(result.ok, false, `pass ${pass}`);
  }
});

test('the same large subtree in two places is counted in both', () => {
  const leaf = { pts: Array.from({ length: 300 }, (_, i) => ({ x: i, y: i, z: i })) };
  const once = preflightGeometryLabSnapshotComplexity({ one: leaf }, { maxTraversalNodes: 1500 });
  const twice = preflightGeometryLabSnapshotComplexity({ one: leaf, two: leaf }, { maxTraversalNodes: 1500 });
  assert.equal(once.ok, true, 'one copy fits');
  assert.equal(twice.ok, false, 'two copies must be counted twice and exceed the node budget');
});

/* -------------------------------------------------------------------------- */
/* Schema validation                                                          */
/* -------------------------------------------------------------------------- */

test('a valid snapshot validates on every pass', () => {
  for (let pass = 0; pass < 4; pass += 1) {
    assert.equal(validateGeometryLabSnapshotStrict(MESH, 100).ok, true, `pass ${pass}`);
  }
});

test('corrupting a record after it validated cleanly is still caught', () => {
  // The record objects here are the very ones just validated as part of MESH,
  // so this is the case a naive object-keyed cache gets wrong.
  assert.equal(validateGeometryLabSnapshotStrict(MESH, 100).ok, true);

  const corruptions = [
    ['a non-finite coordinate', (s) => { const k = Object.keys(s.scene.scene3d.points)[0]; s.scene.scene3d.points[k].x = null; }],
    ['a missing coordinate', (s) => { const k = Object.keys(s.scene.scene3d.points)[0]; delete s.scene.scene3d.points[k].z; }],
    ['an unknown property', (s) => { const k = Object.keys(s.scene.scene3d.points)[0]; s.scene.scene3d.points[k].bogus = 1; }],
    ['the wrong kind', (s) => { const k = Object.keys(s.scene.scene3d.points)[0]; s.scene.scene3d.points[k].kind = 'point2d'; }],
    ['a broken surface vertex', (s) => {
      const surface = Object.values(s.scene.scene3d.entities).find(e => e.kind === 'surface3d');
      surface.vertices[4].z = 'nope';
    }],
    ['surface vertices that are not an array', (s) => {
      const surface = Object.values(s.scene.scene3d.entities).find(e => e.kind === 'surface3d');
      surface.vertices = 'nope';
    }],
  ];

  for (const [label, mutate] of corruptions) {
    const broken = clone();
    mutate(broken);
    const result = validateGeometryLabSnapshotStrict(broken, 100);
    assert.equal(result.ok, false, `${label} was not reported`);
    assert.ok(result.issues.length > 0);
    assert.equal(validateGeometryLabSnapshotStrict(broken, 100).ok, false, `${label} passed on a second look`);
    assert.equal(validateGeometryLabSnapshotStrict(MESH, 100).ok, true, `${label} contaminated the clean snapshot`);
  }
});

test('a record whose id disagrees with its key is caught even when the record itself is fine', () => {
  // The id/key check is deliberately outside the cache, because it depends on
  // where the record is filed and not only on the record.
  const shared = { id: 'shared', kind: 'point3d', x: 1, y: 2, z: 3 };

  const filedCorrectly = clone();
  filedCorrectly.scene.scene3d.points.shared = shared;
  assert.equal(validateGeometryLabSnapshotStrict(filedCorrectly, 100).ok, true);

  const filedWrong = clone();
  filedWrong.scene.scene3d.points.somethingElse = shared;
  const result = validateGeometryLabSnapshotStrict(filedWrong, 100);
  assert.equal(result.ok, false, 'the same record under the wrong key must still be reported');
  assert.ok(result.issues.some(i => i.message.includes('to match key')));

  assert.equal(validateGeometryLabSnapshotStrict(filedCorrectly, 100).ok, true, 'and the correct filing still passes');
});

test('the issue budget still truncates after a cached clean pass', () => {
  assert.equal(validateGeometryLabSnapshotStrict(MESH, 100).ok, true);
  const broken = clone();
  const keys = Object.keys(broken.scene.scene3d.points);
  broken.scene.scene3d.points[keys[0]].x = null;
  broken.scene.scene3d.points[keys[1]].y = null;
  assert.equal(validateGeometryLabSnapshotStrict(broken, 1).issues.length, 1);
});

/* -------------------------------------------------------------------------- */
/* Mesh array caches (task 0.11)                                              */
/* -------------------------------------------------------------------------- */

test('a broken vertex is reported however many times the mesh is checked', () => {
  const broken = clone();
  const surface = Object.values(broken.scene.scene3d.entities).find(e => e.kind === 'surface3d');
  surface.vertices[7].y = null;
  for (let pass = 0; pass < 3; pass += 1) {
    assert.equal(getGeometryLabInvariantIssues(broken).length > 0, true, `pass ${pass}`);
    assert.equal(validateGeometryLabSnapshotStrict(broken, 100).ok, false, `pass ${pass}`);
  }
});

test('an out-of-bounds face index is reported', () => {
  const broken = clone();
  const surface = Object.values(broken.scene.scene3d.entities).find(e => e.kind === 'surface3d');
  surface.faces[3] = [0, 1, surface.vertices.length + 50];
  const issues = getGeometryLabInvariantIssues(broken);
  assert.ok(issues.some(i => i.message.includes('out of bounds')));
});

test('the same face array against a shorter vertex array is re-checked', () => {
  // The face cache records the vertex count it was cleared against, because the
  // bounds check depends on it. Sharing one face array between a long mesh and
  // a truncated one is the case that catches a cache which forgets that.
  const ok = clone();
  const surface = Object.values(ok.scene.scene3d.entities).find(e => e.kind === 'surface3d');
  const sharedFaces = surface.faces;
  const fullVertices = surface.vertices;

  surface.faces = sharedFaces;
  surface.vertices = fullVertices;
  assert.deepEqual(getGeometryLabInvariantIssues(ok), [], 'the full mesh is sound');

  const truncated = clone();
  const other = Object.values(truncated.scene.scene3d.entities).find(e => e.kind === 'surface3d');
  other.faces = sharedFaces;
  other.vertices = fullVertices.slice(0, 4);
  const issues = getGeometryLabInvariantIssues(truncated);
  assert.ok(
    issues.some(i => i.message.includes('out of bounds')),
    'the same faces against fewer vertices must be re-checked, not cleared by the cache',
  );

  assert.deepEqual(getGeometryLabInvariantIssues(ok), [], 'and the sound mesh is still sound');
});

test('mesh checks survive an edit that rebuilds the surface object', () => {
  // Canonicalization rebuilds every entity object per delta while reattaching
  // the same mesh arrays, which is exactly why these caches key on the arrays.
  const lab = createGeometryLab();
  lab.addSurfaceZ({
    xRange: [-5, 5], yRange: [-5, 5], xSamples: 24, ySamples: 24,
    input: 'z = sin(x)', z: (x, y) => Math.sin(x) * Math.cos(y),
  });
  const id = lab.addPoint3D({ x: 0, y: 0, z: 0 });

  const first = lab.peekSnapshot().scene.scene3d.entities;
  const surfaceKey = Object.keys(first).find(k => first[k].kind === 'surface3d');
  const verticesBefore = first[surfaceKey].vertices;

  lab.applyDelta({ op: 'updatePoint', id, changes: { x: 5 } });

  const second = lab.peekSnapshot().scene.scene3d.entities;
  assert.notEqual(second[surfaceKey], first[surfaceKey], 'the entity object is rebuilt');
  assert.equal(second[surfaceKey].vertices, verticesBefore, 'the mesh array is reattached, not rebuilt');
  assert.deepEqual(getGeometryLabInvariantIssues(lab.peekSnapshot()), []);
});

/* -------------------------------------------------------------------------- */
/* End to end                                                                 */
/* -------------------------------------------------------------------------- */

test('a mesh scene still rejects edits that would breach its caps', () => {
  const lab = createGeometryLab({ complexityLimits: { maxPointRecords: 4 } });
  let added = 0;
  let code = null;
  try {
    for (let index = 0; index < 20; index += 1) {
      lab.addPoint3D({ x: index, y: 0, z: 0 });
      added += 1;
    }
  } catch (error) {
    code = error.code;
  }
  assert.equal(added, 4);
  assert.equal(code, 'geometry_lab_snapshot_too_complex');
});

test('editing a mesh scene leaves its meshes intact', () => {
  const lab = createGeometryLab();
  lab.addSurfaceZ({
    xRange: [-5, 5], yRange: [-5, 5], xSamples: 32, ySamples: 32,
    input: 'z = sin(x)', z: (x, y) => Math.sin(x) * Math.cos(y),
  });
  const id = lab.addPoint3D({ x: 0, y: 0, z: 0 });
  const before = lab.getSnapshot();
  const surfaceBefore = Object.values(before.scene.scene3d.entities).find(e => e.kind === 'surface3d');

  for (let index = 0; index < 5; index += 1) {
    lab.applyDelta({ op: 'updatePoint', id, changes: { x: index } });
  }

  const after = lab.getSnapshot();
  const surfaceAfter = Object.values(after.scene.scene3d.entities).find(e => e.kind === 'surface3d');
  assert.deepEqual(surfaceAfter, surfaceBefore, 'unrelated edits must not disturb the mesh');
  assert.equal(after.scene.scene3d.points[id].x, 4);
});
