import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeGeometryInvariants,
  RELATIVE_TOLERANCE,
} from '../../dist/geometry-lab/index.js';

/**
 * What a construction can be marked on.
 *
 * The arithmetic here is not the interesting part — the tolerance is. A child
 * drags a point until two segments look equal; whether that counts is a
 * judgement somebody has to make, and these tests are where it is written
 * down. Everything is relative to the size of the figure, so the same
 * construction drawn small and drawn large is marked the same way.
 */

function snapshot(points, entities = {}) {
  return {
    version: 1,
    instrument: 'geometry-lab',
    scene: {
      scene2d: {
        kind: 'geometry-lab-2d',
        points: Object.fromEntries(
          Object.entries(points).map(([label, [x, y]]) => [
            label,
            { id: label, kind: 'point2d', label, x, y },
          ]),
        ),
        entities,
        constraints: {},
      },
      scene3d: { kind: 'geometry-lab-3d', points: {}, entities: {}, workPlanes: {} },
      links: [],
    },
    appState: {},
  };
}

function segment(id, from, to) {
  return { id, kind: 'segment', pointIds: [from, to] };
}

test('states which segments a construction made equal', () => {
  const report = computeGeometryInvariants(snapshot(
    { A: [0, 0], B: [4, 0], C: [10, 0], D: [14, 0] },
    { s1: segment('s1', 'A', 'B'), s2: segment('s2', 'C', 'D') },
  ));

  assert.equal(report.toolKey, 'geometry-lab');
  assert.ok(report.invariants.includes('equal-segments:AB,CD'));
});

test('does not state an equality the construction does not have', () => {
  const report = computeGeometryInvariants(snapshot(
    { A: [0, 0], B: [4, 0], C: [10, 0], D: [17, 0] },
    { s1: segment('s1', 'A', 'B'), s2: segment('s2', 'C', 'D') },
  ));

  assert.ok(!report.invariants.includes('equal-segments:AB,CD'));
});

test('finds a right angle, and the perpendicular that goes with it', () => {
  const report = computeGeometryInvariants(snapshot(
    { A: [0, 10], B: [0, 0], C: [10, 0] },
    { s1: segment('s1', 'B', 'A'), s2: segment('s2', 'B', 'C') },
  ));

  assert.ok(report.invariants.includes('right-angle:ABC'));
  assert.ok(report.invariants.includes('perpendicular:AB,BC'));
});

test('finds collinearity and the midpoint on it', () => {
  const report = computeGeometryInvariants(snapshot(
    { A: [0, 0], M: [5, 0], B: [10, 0] },
  ));

  assert.ok(report.invariants.includes('collinear:A,B,M'));
  assert.ok(report.invariants.includes('midpoint:M,AB'));
});

test('a point placed on a circle is stated to be on it', () => {
  const report = computeGeometryInvariants(snapshot(
    { O: [0, 0], P: [5, 0], Q: [0, 7] },
    { c: { id: 'c', kind: 'circle', centerId: 'O', radius: 5 } },
  ));

  assert.ok(report.invariants.includes('point-on-circle:P,circle(O)'));
  assert.ok(!report.invariants.includes('point-on-circle:Q,circle(O)'));
});

/**
 * The same construction, drawn at two scales, must be marked the same way.
 * Comparing absolutely would pass a sloppy small figure and fail a careful
 * large one.
 */
test('judges by the size of the figure rather than by absolute distance', () => {
  const small = computeGeometryInvariants(snapshot(
    { A: [0, 0], B: [1, 0], C: [5, 0], D: [6.0005, 0] },
    { s1: segment('s1', 'A', 'B'), s2: segment('s2', 'C', 'D') },
  ));
  const large = computeGeometryInvariants(snapshot(
    { A: [0, 0], B: [1000, 0], C: [5000, 0], D: [6000.5, 0] },
    { s1: segment('s1', 'A', 'B'), s2: segment('s2', 'C', 'D') },
  ));

  // The same proportional error, and therefore the same verdict.
  assert.equal(
    small.invariants.includes('equal-segments:AB,CD'),
    large.invariants.includes('equal-segments:AB,CD'),
  );
});

test('a hand-placed point within tolerance still counts', () => {
  const wobble = 6 * RELATIVE_TOLERANCE * 0.5;
  const report = computeGeometryInvariants(snapshot(
    { A: [0, 0], B: [4, 0], C: [10, 0], D: [14 + wobble, 0] },
    { s1: segment('s1', 'A', 'B'), s2: segment('s2', 'C', 'D') },
  ));

  assert.ok(report.invariants.includes('equal-segments:AB,CD'));
});

test('reports the tolerance it judged at, so a mark can be explained', () => {
  const report = computeGeometryInvariants(snapshot({ A: [0, 0], B: [1, 1] }));
  assert.equal(report.relativeTolerance, RELATIVE_TOLERANCE);
});

/**
 * Absence means "not established", which is not the same as false — and is why
 * the scorer treats a snapshot with no invariants as unscored rather than as a
 * wrong construction.
 */
test('an empty figure establishes nothing rather than asserting anything', () => {
  const report = computeGeometryInvariants(snapshot({}));
  assert.deepEqual(report.invariants, []);
});

test('a figure of one point establishes nothing', () => {
  const report = computeGeometryInvariants(snapshot({ A: [3, 4] }));
  assert.deepEqual(report.invariants, []);
});

/** An exam is not the place to discover that marking is cubic in the points. */
test('stays bounded on a large construction and says it was truncated', () => {
  const many = {};
  for (let index = 0; index < 60; index += 1) {
    many[`P${index}`] = [index, 0];
  }
  const startedAt = Date.now();
  const report = computeGeometryInvariants(snapshot(many));

  assert.ok(Date.now() - startedAt < 2000);
  assert.equal(report.truncated, true);
  assert.ok(report.invariants.length <= 200);
});

test('the same figure always reports the same facts in the same order', () => {
  const figure = snapshot(
    { A: [0, 10], B: [0, 0], C: [10, 0] },
    { s1: segment('s1', 'B', 'A'), s2: segment('s2', 'B', 'C') },
  );
  const first = computeGeometryInvariants(figure).invariants;

  for (let run = 0; run < 10; run += 1) {
    assert.deepEqual(computeGeometryInvariants(figure).invariants, first);
  }
});

/**
 * The server establishes these facts independently, from the same coordinates,
 * because an exam device is the candidate's and cannot be believed about its
 * own construction. This copy exists so an author can see what their model
 * construction produces while they write a mark scheme.
 *
 * Two implementations of one judgement is a divergence risk, and this is the
 * fixture that catches it: the same figures, with the facts written out, so a
 * change on either side that alters a name or a tolerance fails here and in
 * `GeometryInvariantsTest` together.
 */
test('agrees with the marking engine on the shared fixtures', () => {
  const cases = [
    {
      points: { A: [0, 0], B: [4, 0], C: [10, 0], D: [14, 0] },
      entities: { s1: segment('s1', 'A', 'B'), s2: segment('s2', 'C', 'D') },
      expect: ['equal-segments:AB,CD', 'parallel:AB,CD'],
    },
    {
      points: { A: [0, 10], B: [0, 0], C: [10, 0] },
      entities: { s1: segment('s1', 'B', 'A'), s2: segment('s2', 'B', 'C') },
      expect: ['right-angle:ABC', 'perpendicular:AB,BC'],
    },
    {
      points: { A: [0, 0], M: [5, 0], B: [10, 0] },
      entities: {},
      expect: ['collinear:A,B,M', 'midpoint:M,AB'],
    },
    {
      points: { O: [0, 0], P: [5, 0] },
      entities: { c: { id: 'c', kind: 'circle', centerId: 'O', radius: 5 } },
      expect: ['point-on-circle:P,circle(O)'],
    },
  ];

  for (const { points, entities, expect } of cases) {
    const report = computeGeometryInvariants(snapshot(points, entities));
    for (const fact of expect) {
      assert.ok(
        report.invariants.includes(fact),
        `expected ${fact} in ${JSON.stringify(report.invariants)}`,
      );
    }
  }
});
