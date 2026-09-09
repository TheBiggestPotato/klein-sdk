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

/** An exam is not the place to discover how a figure scales. */
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

/* -------------------------------------------------------------------------- */
/* Bucketing (plan task 4.3)                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Bucketing proposes pairs; the comparison settles them. A scheme that only
 * looked inside a bucket would drop every pair either side of a boundary -
 * silently, and only sometimes, which is the worst way for a marker to be
 * wrong. These walk a pair across the tolerance in steps, so any boundary
 * anywhere gets crossed.
 */
test('a pair is found wherever it falls relative to a bucket edge', () => {
  // Corners at (+/-50, +/-50) fix the figure's size, and so its tolerance, at
  // the diagonal of that box - which every comparison here is relative to.
  const scale = Math.hypot(100, 100);
  const epsilon = scale * RELATIVE_TOLERANCE;
  for (let step = 0; step <= 40; step += 1) {
    // Offsets from nothing up to twice the tolerance, so the walk crosses
    // several bucket boundaries at every phase within one.
    const offset = (step / 20) * epsilon;
    const report = computeGeometryInvariants(snapshot(
      {
        A: [0, 0], B: [40, 0],
        C: [0, 10], D: [40 + offset, 10],
        E: [-50, -50], F: [50, 50],
      },
      { s1: segment('s1', 'A', 'B'), s2: segment('s2', 'C', 'D') },
    ));
    assert.equal(
      report.invariants.includes('equal-segments:AB,CD'),
      offset <= epsilon + 1e-12,
      `offset ${offset} was decided wrongly`,
    );
  }
});

test('two directions either side of a bucket edge are still parallel', () => {
  for (let step = 0; step <= 40; step += 1) {
    const angle = (step / 20) * RELATIVE_TOLERANCE;
    const report = computeGeometryInvariants(snapshot(
      {
        A: [0, 0], B: [40, 0],
        C: [0, 10], D: [40 * Math.cos(angle), 10 + 40 * Math.sin(angle)],
      },
      { l1: { id: 'l1', kind: 'line', pointIds: ['A', 'B'] }, l2: { id: 'l2', kind: 'line', pointIds: ['C', 'D'] } },
    ));
    assert.equal(
      report.invariants.includes('parallel:AB,CD'),
      Math.sin(angle) <= RELATIVE_TOLERANCE + 1e-15,
      `${angle} radians apart was decided wrongly`,
    );
  }
});

test('a construction with a hundred points is still marked', () => {
  // The point of the rewrite: the scans are quadratic rather than cubic, so the
  // cap sits in the low hundreds instead of at twenty-four. The filler points
  // sit on a circle, where no three are anywhere near a line, so what is being
  // shown is the size of the figure and not a flood of incidental facts.
  const many = { A: [-40, 60], B: [40, 60], C: [0, 60] };
  for (let index = 0; index < 100; index += 1) {
    many[`P${index}`] = [Math.cos((index * 2 * Math.PI) / 100) * 50, Math.sin((index * 2 * Math.PI) / 100) * 50];
  }
  const startedAt = Date.now();
  const report = computeGeometryInvariants(snapshot(many));

  assert.ok(Date.now() - startedAt < 500);
  assert.ok(
    report.invariants.includes('midpoint:C,AB'),
    'a figure this size used to be past the cap, which reported nothing about it',
  );
});

/* -------------------------------------------------------------------------- */
/* The vocabulary bucketing paid for                                          */
/* -------------------------------------------------------------------------- */

test('a point lies on an object only over the part that is drawn', () => {
  // A segment, a ray and a line through the same two points are all called AB,
  // so each is asked about in a figure of its own. That shared naming is how
  // the reporter has always named a two-point object, and it is why the extent
  // has to be tested against the object rather than against its name.
  const on = (kind) => {
    const entity = kind === 'segment'
      ? segment('e1', 'A', 'B')
      : { id: 'e1', kind, pointIds: ['A', 'B'] };
    const report = computeGeometryInvariants(snapshot(
      { A: [0, 0], B: [10, 0], M: [5, 0], X: [20, 0], Y: [-20, 0], Z: [5, 4] },
      { e1: entity },
    ));
    return report.invariants.filter(fact => fact.startsWith('point-on:'));
  };

  assert.deepEqual(on('segment'), ['point-on:M,AB'], 'between the ends and nowhere else');
  assert.deepEqual(on('ray').sort(), ['point-on:M,AB', 'point-on:X,AB'], 'and on past B, but not behind A');
  assert.deepEqual(on('line').sort(), ['point-on:M,AB', 'point-on:X,AB', 'point-on:Y,AB'], 'a line has no ends');
  assert.ok(!on('line').includes('point-on:Z,AB'), 'Z is off it entirely');
});

test('a tangent touches, and a line that misses does not', () => {
  const touching = computeGeometryInvariants(snapshot(
    { O: [0, 0], A: [-8, 5], B: [8, 5], C: [-8, 9], D: [8, 9] },
    {
      s1: segment('s1', 'A', 'B'),
      s2: segment('s2', 'C', 'D'),
      c1: { id: 'c1', kind: 'circle', centerId: 'O', radius: 5 },
    },
  ));
  assert.ok(touching.invariants.includes('tangent:AB,circle(O)'), 'y = 5 grazes a circle of radius 5');
  assert.ok(!touching.invariants.includes('tangent:CD,circle(O)'), 'y = 9 misses it');
});

test('a tangent has to touch the part that is drawn', () => {
  // The line through A and B would graze the circle, but the segment stops
  // long before it gets there. Saying otherwise would credit a construction
  // nobody made.
  const report = computeGeometryInvariants(snapshot(
    { O: [0, 0], A: [20, 5], B: [40, 5] },
    { s1: segment('s1', 'A', 'B'), c1: { id: 'c1', kind: 'circle', centerId: 'O', radius: 5 } },
  ));
  assert.ok(!report.invariants.includes('tangent:AB,circle(O)'));
});

test('two angles of the same size', () => {
  // Two isosceles triangles sharing nothing but their shape.
  const report = computeGeometryInvariants(snapshot(
    { A: [0, 0], B: [4, 0], C: [2, 3], D: [20, 0], E: [24, 0], F: [22, 3] },
    {
      s1: segment('s1', 'A', 'B'), s2: segment('s2', 'A', 'C'),
      s3: segment('s3', 'D', 'E'), s4: segment('s4', 'D', 'F'),
    },
  ));
  assert.ok(report.invariants.includes('equal-angles:BAC,EDF'));
});

test('a straight line is not an angle worth calling equal to another', () => {
  const report = computeGeometryInvariants(snapshot(
    { A: [0, 0], B: [4, 0], C: [-4, 0], D: [20, 0], E: [24, 0], F: [16, 0] },
    {
      s1: segment('s1', 'A', 'B'), s2: segment('s2', 'A', 'C'),
      s3: segment('s3', 'D', 'E'), s4: segment('s4', 'D', 'F'),
    },
  ));
  assert.ok(!report.invariants.some(fact => fact.startsWith('equal-angles:')));
});

test('congruent and similar triangles', () => {
  const polygon = (id, pointIds) => ({ id, kind: 'polygon', pointIds });
  const report = computeGeometryInvariants(snapshot(
    {
      A: [0, 0], B: [3, 0], C: [0, 4],
      D: [10, 0], E: [13, 0], F: [10, 4],
      G: [20, 0], H: [26, 0], I: [20, 8],
      J: [40, 0], K: [45, 0], L: [40, 1],
    },
    {
      t1: polygon('t1', ['A', 'B', 'C']),
      t2: polygon('t2', ['D', 'E', 'F']),
      t3: polygon('t3', ['G', 'H', 'I']),
      t4: polygon('t4', ['J', 'K', 'L']),
    },
  ));
  assert.ok(report.invariants.includes('congruent:ABC,DEF'), '3-4-5 twice over');
  assert.ok(report.invariants.includes('similar:ABC,GHI'), 'and 6-8-10 is the same shape');
  assert.ok(!report.invariants.includes('congruent:ABC,GHI'), 'but not the same size');
  assert.ok(!report.invariants.some(fact => fact.startsWith('similar:') && fact.includes('JKL')));
});

test('equal areas, compared against a tolerance in the units of an area', () => {
  const polygon = (id, pointIds) => ({ id, kind: 'polygon', pointIds });
  const report = computeGeometryInvariants(snapshot(
    {
      A: [0, 0], B: [4, 0], C: [4, 3], D: [0, 3],
      E: [10, 0], F: [16, 0], G: [10, 4],
      H: [30, 0], I: [36, 0], J: [30, 2],
    },
    {
      q1: polygon('q1', ['A', 'B', 'C', 'D']),
      t1: polygon('t1', ['E', 'F', 'G']),
      t2: polygon('t2', ['H', 'I', 'J']),
    },
  ));
  assert.ok(report.invariants.includes('equal-area:ABCD,EFG'), 'a 4x3 rectangle and a 6x4 triangle are both 12');
  assert.ok(!report.invariants.includes('equal-area:ABCD,HIJ'), 'a 6x2 triangle is 6');
});

test('a construction is marked the same however large it is drawn', () => {
  // The relations added here are relative to the figure like every other one,
  // so scaling everything up must not change a single fact.
  const polygon = (id, pointIds) => ({ id, kind: 'polygon', pointIds });
  const build = (factor) => snapshot(
    {
      A: [0, 0], B: [3 * factor, 0], C: [0, 4 * factor],
      D: [10 * factor, 0], E: [13 * factor, 0], F: [10 * factor, 4 * factor],
    },
    {
      t1: polygon('t1', ['A', 'B', 'C']),
      t2: polygon('t2', ['D', 'E', 'F']),
      s1: segment('s1', 'A', 'B'),
      s2: segment('s2', 'D', 'E'),
    },
  );
  assert.deepEqual(
    computeGeometryInvariants(build(1000)).invariants,
    computeGeometryInvariants(build(1)).invariants,
  );
});
