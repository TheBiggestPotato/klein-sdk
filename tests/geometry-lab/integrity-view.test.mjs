/**
 * Integrity checking on the lean dependency view (plan task 0.9).
 *
 * <p>The integrity scan reads three of the dependency graph's twelve indexes,
 * so it now builds only those three. That is a safety check made cheaper, which
 * is the kind of change that goes wrong quietly: a scan that stops reporting a
 * dangling reference looks exactly like a scan with nothing to report.
 *
 * <p>So the tests come in two halves. First, the lean view must agree with the
 * full graph on everything it claims to carry, over valid and corrupt scenes
 * alike. Second - and this is the half that matters - every class of corruption
 * must still be *detected*, which a happy-path corpus would never establish.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGeometryLabDependencyGraph,
  buildGeometryLabIntegrityView,
  geometryLabDependencyKey,
} from '../../dist/geometry-lab/dependencies.js';
import { getGeometryLabInvariantIssues } from '../../dist/geometry-lab/invariants.js';
import { createGeometryLab } from '../../dist/geometry-lab/index.js';

/** A valid snapshot rich enough to exercise most node and edge kinds. */
function richSnapshot() {
  const lab = createGeometryLab();
  const a = lab.addPoint3D({ x: 0, y: 0, z: 0, label: 'A' });
  const b = lab.addPoint3D({ x: 4, y: 0, z: 0, label: 'B' });
  const c = lab.addPoint3D({ x: 0, y: 3, z: 0, label: 'C' });
  lab.addSegment3D(a, b);
  lab.addLine3D(b, c);
  lab.addWorkPlaneByThreePoints([a, b, c]);
  lab.addPointPlaneDistanceMeasurement(a, 'xy');
  const cube = lab.addPolyhedron('cube', { x: 0, y: 0, z: 0 }, 2);
  lab.addVolumeMeasurement(cube);
  lab.createUnfoldedNet(cube);
  lab.applyDelta({
    op: 'batch',
    deltas: [
      { op: 'addPoint2D', point: { id: 'q1', kind: 'point2d', x: 0, y: 0 } },
      { op: 'addPoint2D', point: { id: 'q2', kind: 'point2d', x: 6, y: 0 } },
      { op: 'addPoint2D', point: { id: 'q3', kind: 'point2d', x: 3, y: 0, construction: { kind: 'midpoint', sourceIds: ['q1', 'q2'] } } },
      { op: 'addEntity2D', entity: { id: 'seg2d', kind: 'segment', pointIds: ['q1', 'q2'] } },
    ],
  });
  return lab.getSnapshot();
}

const VALID = richSnapshot();
const corrupt = (mutate) => {
  const copy = JSON.parse(JSON.stringify(VALID));
  mutate(copy);
  return copy;
};

/** Each entry corrupts the snapshot in one way the scan is expected to catch. */
const CORRUPTIONS = [
  ['entity referencing missing points', (s) => {
    s.scene.scene2d.entities.broken = { id: 'broken', kind: 'segment', pointIds: ['ghost1', 'ghost2'] };
  }],
  ['construction referencing a missing source', (s) => {
    s.scene.scene2d.points.orphan = { id: 'orphan', kind: 'point2d', x: 0, y: 0, construction: { kind: 'midpoint', sourceIds: ['ghost', 'q1'] } };
  }],
  ['missing required xy work plane', (s) => {
    delete s.scene.scene3d.workPlanes.xy;
  }],
  ['active work plane that does not exist', (s) => {
    s.appState.activeWorkPlaneId = 'no-such-plane';
  }],
  ['a dependency cycle', (s) => {
    s.scene.scene2d.points.cycA = { id: 'cycA', kind: 'point2d', x: 0, y: 0, construction: { kind: 'midpoint', sourceIds: ['cycB', 'q1'] } };
    s.scene.scene2d.points.cycB = { id: 'cycB', kind: 'point2d', x: 0, y: 0, construction: { kind: 'midpoint', sourceIds: ['cycA', 'q1'] } };
  }],
  ['an id duplicated across collections', (s) => {
    s.scene.scene3d.points.q1 = { id: 'q1', kind: 'point3d', x: 1, y: 1, z: 1 };
  }],
  ['measurement targeting a missing object', (s) => {
    s.scene.scene3d.measurements.mBad = { id: 'mBad', targetId: 'ghost', kind: 'volume', value: 1 };
  }],
  ['net referencing a missing solid', (s) => {
    s.scene.scene3d.nets.nBad = { id: 'nBad', solidId: 'ghost-solid', faces: [] };
  }],
  ['link referencing missing objects', (s) => {
    s.scene.links.push({ id: 'linkBad', kind: 'netToSolid', sourceId: 'ghost-net', targetId: 'ghost-solid' });
  }],
  ['selection referencing a missing object', (s) => {
    s.appState.selected = [{ kind: 'point3d', id: 'ghost' }];
  }],
  ['a non-finite coordinate', (s) => {
    s.scene.scene2d.points.q1.x = null;
  }],
];

/* -------------------------------------------------------------------------- */
/* The lean view agrees with the full graph                                   */
/* -------------------------------------------------------------------------- */

function assertViewMatchesGraph(snapshot, label) {
  const graph = buildGeometryLabDependencyGraph(snapshot);
  const view = buildGeometryLabIntegrityView(snapshot);

  assert.deepEqual(
    view.sortedKeys,
    Object.keys(graph.nodesByKey).sort(),
    `${label}: node keys`,
  );
  for (const key of view.sortedKeys) {
    assert.deepEqual(view.nodesByKey[key], graph.nodesByKey[key], `${label}: node ${key}`);
    // The view omits empty adjacency entries, which its only consumer reads as
    // `?? []`; comparing through the same default keeps that explicit.
    assert.deepEqual(
      view.dependenciesByKey[key] ?? [],
      graph.dependenciesByKey[key] ?? [],
      `${label}: dependencies of ${key}`,
    );
  }
  assert.deepEqual(view.ownershipConflicts, graph.ownershipConflicts, `${label}: ownership conflicts`);
}

test('lean view matches the full graph on a valid scene', () => {
  assertViewMatchesGraph(VALID, 'valid');
});

for (const [label, mutate] of CORRUPTIONS) {
  test(`lean view matches the full graph with ${label}`, () => {
    assertViewMatchesGraph(corrupt(mutate), label);
  });
}

/* -------------------------------------------------------------------------- */
/* Corruption is still detected                                               */
/* -------------------------------------------------------------------------- */

test('a valid snapshot reports no integrity issues', () => {
  assert.deepEqual(getGeometryLabInvariantIssues(VALID), []);
});

for (const [label, mutate] of CORRUPTIONS) {
  test(`integrity scan still reports ${label}`, () => {
    const issues = getGeometryLabInvariantIssues(corrupt(mutate));
    assert.ok(
      issues.length > 0,
      `${label} produced no issue - a cheaper scan that stops reporting looks exactly like a clean scene`,
    );
    for (const issue of issues) {
      assert.equal(typeof issue.path, 'string');
      assert.ok(issue.path.length > 0, 'every issue names where it was found');
      assert.equal(typeof issue.message, 'string');
    }
  });
}

test('a cycle is reported as a cycle, not merely as some issue', () => {
  const issues = getGeometryLabInvariantIssues(corrupt((s) => {
    s.scene.scene2d.points.cycA = { id: 'cycA', kind: 'point2d', x: 0, y: 0, construction: { kind: 'midpoint', sourceIds: ['cycB', 'q1'] } };
    s.scene.scene2d.points.cycB = { id: 'cycB', kind: 'point2d', x: 0, y: 0, construction: { kind: 'midpoint', sourceIds: ['cycA', 'q1'] } };
  }));
  assert.ok(
    issues.some(issue => issue.message.includes('Cyclic Geometry Lab dependency')),
    'cycle detection runs off the lean view and must still fire',
  );
});

/* -------------------------------------------------------------------------- */
/* The dependency key fast path                                               */
/* -------------------------------------------------------------------------- */

test('dependency keys are unchanged for ids that need URI encoding', () => {
  const ids = [
    '', 'plain', 'p_1', 'a-b.c!d~e*f\'g(h)',
    'weird id/with%chars', 'unicode-éè', 'x y', 'a+b', 'a&b', 'a=b', '100%', 'a\\b', 'a/b?c#d',
  ];
  for (const id of ids) {
    assert.equal(
      geometryLabDependencyKey({ collection: 'point2d', id }),
      `point2d:${encodeURIComponent(id)}`,
      `key for ${JSON.stringify(id)}`,
    );
  }
});

test('ids needing encoding still participate in the graph and the scan', () => {
  const snapshot = corrupt((s) => {
    s.scene.scene2d.points['weird id/with%chars'] = { id: 'weird id/with%chars', kind: 'point2d', x: 1, y: 1 };
    s.scene.scene2d.points['unicode-éè'] = { id: 'unicode-éè', kind: 'point2d', x: 2, y: 2 };
  });
  const view = buildGeometryLabIntegrityView(snapshot);
  assert.ok(view.sortedKeys.includes(`point2d:${encodeURIComponent('weird id/with%chars')}`));
  assert.ok(view.sortedKeys.includes(`point2d:${encodeURIComponent('unicode-éè')}`));
  assert.deepEqual(getGeometryLabInvariantIssues(snapshot), [], 'those points are valid, just awkwardly named');
});
