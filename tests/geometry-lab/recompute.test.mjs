/**
 * Derived-geometry recompute behaviour (plan task 0.4).
 *
 * <p>The recompute walk builds one mutable draft and publishes it at the end,
 * rather than rebuilding the scene once per object it moves. That removes the
 * quadratic on a fan-out drag, and it introduces exactly one hazard worth
 * testing hard: a draft that leaked, or that was taken from the caller's own
 * records, would mutate a snapshot someone else still holds. Undo, history and
 * collaboration all depend on old snapshots staying exactly as they were.
 *
 * <p>The other property locked in here is identity. A pass that changes nothing
 * returns the very same object it was given - callers compare by identity to
 * decide whether anything happened, so allocating a fresh equal object would be
 * a correctness bug, not just a wasted allocation.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeometryLab } from '../../dist/geometry-lab/index.js';
import {
  recomputeGeometryDependents,
  recomputeGeometryScene,
} from '../../dist/geometry-core/index.js';

function scene(points, entities = {}) {
  return { points, entities };
}

function point(id, x, y, construction) {
  return { id, kind: 'point2d', x, y, ...(construction ? { construction } : {}) };
}

function midpoint(id, first, second) {
  return point(id, 0, 0, { kind: 'midpoint', sourceIds: [first, second] });
}

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

test('a pass that changes nothing returns the identical scene object', () => {
  const input = scene({ A: point('A', 0, 0), B: point('B', 4, 0) });
  assert.equal(recomputeGeometryScene(input), input, 'callers compare by identity to detect change');
});

test('a scene whose derived points are already correct is returned unchanged', () => {
  const input = scene({
    A: point('A', 0, 0),
    B: point('B', 4, 2),
    M: { ...midpoint('M', 'A', 'B'), x: 2, y: 1 },
  });
  assert.equal(recomputeGeometryScene(input), input);
});

test('a pass that changes something returns a new object', () => {
  const input = scene({ A: point('A', 0, 0), B: point('B', 4, 2), M: midpoint('M', 'A', 'B') });
  const result = recomputeGeometryScene(input);
  assert.notEqual(result, input);
  assert.deepEqual({ x: result.points.M.x, y: result.points.M.y }, { x: 2, y: 1 });
});

/* -------------------------------------------------------------------------- */
/* The draft must never escape into the caller's scene                        */
/* -------------------------------------------------------------------------- */

test('recompute does not mutate the scene it was given', () => {
  const input = scene({ A: point('A', 0, 0), B: point('B', 4, 2), M: midpoint('M', 'A', 'B') });
  const before = structuredClone(input);
  recomputeGeometryScene(input);
  assert.deepEqual(input, before, 'the input scene must survive a recompute untouched');
});

test('recompute does not mutate the records it was given', () => {
  const points = { A: point('A', 0, 0), B: point('B', 4, 2), M: midpoint('M', 'A', 'B') };
  const input = scene(points);
  const result = recomputeGeometryScene(input);
  assert.notEqual(result.points, points, 'the draft must copy the record, not write through to it');
  assert.equal(points.M.x, 0, 'the original derived point must keep its stale value');
  assert.equal(result.points.M.x, 2);
});

test('a snapshot taken before an edit is unaffected by the edit', () => {
  const lab = createGeometryLab();
  lab.applyDelta({
    op: 'batch',
    deltas: [
      { op: 'addPoint2D', point: point('A', 0, 0) },
      { op: 'addPoint2D', point: point('B', 10, 0) },
      { op: 'addPoint2D', point: midpoint('M', 'A', 'B') },
    ],
  });

  const earlier = lab.getSnapshot();
  const earlierMidpoint = earlier.scene.scene2d.points.M.x;
  assert.equal(earlierMidpoint, 5);

  lab.applyDelta({ op: 'updatePoint', id: 'B', changes: { x: 100 } });

  assert.equal(earlier.scene.scene2d.points.M.x, 5, 'the held snapshot must not have moved');
  assert.equal(lab.getSnapshot().scene.scene2d.points.M.x, 50);
});

test('undo restores the earlier positions of derived points', () => {
  const lab = createGeometryLab();
  lab.applyDelta({
    op: 'batch',
    deltas: [
      { op: 'addPoint2D', point: point('A', 0, 0) },
      { op: 'addPoint2D', point: point('B', 10, 0) },
      { op: 'addPoint2D', point: midpoint('M', 'A', 'B') },
    ],
  });
  lab.applyDelta({ op: 'updatePoint', id: 'B', changes: { x: 30 } });
  assert.equal(lab.getSnapshot().scene.scene2d.points.M.x, 15);

  lab.undo();
  assert.equal(lab.getSnapshot().scene.scene2d.points.M.x, 5, 'undo must restore the derived position too');
});

/* -------------------------------------------------------------------------- */
/* Correctness of the walk itself                                             */
/* -------------------------------------------------------------------------- */

test('a fan of dependents on one source all follow it', () => {
  const points = { hub: point('hub', 0, 0) };
  for (let index = 0; index < 40; index += 1) {
    points[`p${index}`] = point(`p${index}`, index * 2, 10);
    points[`m${index}`] = midpoint(`m${index}`, 'hub', `p${index}`);
  }
  const settled = recomputeGeometryScene(scene(points));
  const moved = { ...settled, points: { ...settled.points, hub: { ...settled.points.hub, x: 100, y: 100 } } };
  const result = recomputeGeometryDependents(moved, ['hub']);

  for (let index = 0; index < 40; index += 1) {
    assert.equal(result.points[`m${index}`].x, (100 + index * 2) / 2, `m${index} x`);
    assert.equal(result.points[`m${index}`].y, (100 + 10) / 2, `m${index} y`);
  }
});

test('chained derived points settle in dependency order within one pass', () => {
  // M is the midpoint of A and B; N is the midpoint of A and M. N can only be
  // right if M was recomputed first, in the same pass.
  const input = scene({
    A: point('A', 0, 0),
    B: point('B', 8, 0),
    M: midpoint('M', 'A', 'B'),
    N: midpoint('N', 'A', 'M'),
  });
  const result = recomputeGeometryScene(input);
  assert.equal(result.points.M.x, 4);
  assert.equal(result.points.N.x, 2, 'the second-order midpoint must see the recomputed first');
});

test('a dependency cycle terminates instead of recursing forever', () => {
  const input = scene({
    A: point('A', 0, 0),
    P: midpoint('P', 'A', 'Q'),
    Q: midpoint('Q', 'A', 'P'),
  });
  assert.doesNotThrow(() => recomputeGeometryScene(input));
});

test('a derived point with a missing source is left alone', () => {
  const input = scene({ A: point('A', 3, 3), M: midpoint('M', 'A', 'missing') });
  const result = recomputeGeometryScene(input);
  assert.equal(result.points.M.x, 0, 'an unresolvable construction must not invent a position');
});

test('recomputeGeometryDependents touches only what depends on the change', () => {
  const input = scene({
    A: point('A', 0, 0),
    B: point('B', 10, 0),
    M: midpoint('M', 'A', 'B'),
    X: point('X', 7, 7),
    Y: point('Y', 9, 9),
    // Deliberately stale, and not downstream of B, so this pass must not fix it.
    Z: midpoint('Z', 'X', 'Y'),
  });
  const result = recomputeGeometryDependents(input, ['B']);
  assert.equal(result.points.M.x, 5, 'the dependent of the changed point is recomputed');
  assert.equal(result.points.Z.x, 0, 'an unrelated stale point stays stale in a scoped pass');
});
