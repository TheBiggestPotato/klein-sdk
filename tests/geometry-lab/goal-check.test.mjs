/**
 * Marking a construction against what it was asked to be (plan task 4.1).
 *
 * <p>`computeGeometryInvariants` states what a figure is. It cannot teach,
 * because it never says what is absent - and absence is the whole of a hint.
 *
 * <p>Two things make this more than a set difference, and they are what the
 * tests below are mostly about: a mark scheme is written by a person and will
 * not spell a fact the way the reporter's loop nesting happens to, and a fact
 * that fell off the end of a truncated report has not been checked, so calling
 * it missing would send a child to fix something already right.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkGeometryGoal,
  computeGeometryInvariants,
  createGeometryLab,
} from '../../dist/geometry-lab/index.js';

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

const segment = (id, from, to) => ({ id, kind: 'segment', pointIds: [from, to] });

/** M is the midpoint of AB; the segment CD is perpendicular to AB through M. */
function perpendicularBisector() {
  return snapshot(
    { A: [-4, 0], B: [4, 0], M: [0, 0], C: [0, -3], D: [0, 3] },
    {
      s1: segment('s1', 'A', 'M'),
      s2: segment('s2', 'M', 'B'),
      s3: segment('s3', 'A', 'B'),
      s4: segment('s4', 'C', 'D'),
    },
  );
}

/* -------------------------------------------------------------------------- */
/* Saying what is absent                                                      */
/* -------------------------------------------------------------------------- */

test('names the fact the construction is missing', () => {
  // Equal halves, but nothing perpendicular: the commonest half-built answer.
  const figure = snapshot(
    { A: [-4, 0], B: [4, 0], M: [0, 0], C: [2, 3], D: [6, 3] },
    {
      s1: segment('s1', 'A', 'M'),
      s2: segment('s2', 'M', 'B'),
      s3: segment('s3', 'A', 'B'),
      s4: segment('s4', 'C', 'D'),
    },
  );
  const result = checkGeometryGoal(figure, ['equal-segments:AM,BM', 'perpendicular:AB,CD']);

  assert.equal(result.satisfied, false);
  assert.deepEqual(result.met, ['equal-segments:AM,BM']);
  assert.deepEqual(result.missing, ['perpendicular:AB,CD']);
  assert.equal(result.incomplete, false);
});

test('a complete construction satisfies its goal', () => {
  const result = checkGeometryGoal(perpendicularBisector(), [
    'equal-segments:AM,BM',
    'perpendicular:AB,CD',
    'midpoint:M,AB',
  ]);

  assert.equal(result.satisfied, true);
  assert.deepEqual(result.missing, []);
  assert.equal(result.met.length, 3);
});

test('an empty goal is satisfied by anything, and asks for nothing', () => {
  const result = checkGeometryGoal(perpendicularBisector(), []);
  assert.equal(result.satisfied, true);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.extra, [], 'nothing is named, so nothing is in scope');
});

test('the tolerance a mark was given at is reported with it', () => {
  const result = checkGeometryGoal(perpendicularBisector(), ['midpoint:M,AB']);
  assert.equal(result.relativeTolerance, computeGeometryInvariants(perpendicularBisector()).relativeTolerance);
});

/* -------------------------------------------------------------------------- */
/* A goal is written by a person                                              */
/* -------------------------------------------------------------------------- */

test('a fact spelled the other way round is the same fact', () => {
  const figure = perpendicularBisector();
  // Every one of these is how a teacher might write it, and none is the
  // spelling the reporter's loops emit.
  for (const spelling of [
    'equal-segments:BM,AM',
    'equal-segments:MA,MB',
    'equal-segments:MB,MA',
    'equal-segments:BM,MA',
  ]) {
    const result = checkGeometryGoal(figure, [spelling]);
    assert.equal(result.satisfied, true, `${spelling} should mark the same fact`);
    assert.deepEqual(result.met, [spelling], 'and is echoed back in the mark scheme spelling');
  }
});

test('an angle read backwards is the same angle', () => {
  const figure = perpendicularBisector();
  assert.equal(checkGeometryGoal(figure, ['right-angle:AMC']).satisfied, true);
  assert.equal(checkGeometryGoal(figure, ['right-angle:CMA']).satisfied, true);
  assert.equal(checkGeometryGoal(figure, ['right-angle:MAC']).satisfied, false, 'a different vertex is a different angle');
});

test('collinear points in any order, and a midpoint pair either way round', () => {
  const figure = perpendicularBisector();
  assert.equal(checkGeometryGoal(figure, ['collinear:B,M,A']).satisfied, true);
  assert.equal(checkGeometryGoal(figure, ['collinear:M,A,B']).satisfied, true);
  assert.equal(checkGeometryGoal(figure, ['midpoint:M,BA']).satisfied, true);
});

test('parallel and perpendicular are unordered in both arguments', () => {
  const figure = snapshot(
    { A: [0, 0], B: [4, 0], C: [0, 2], D: [4, 2] },
    { s1: segment('s1', 'A', 'B'), s2: segment('s2', 'C', 'D') },
  );
  assert.equal(checkGeometryGoal(figure, ['parallel:CD,AB']).satisfied, true);
  assert.equal(checkGeometryGoal(figure, ['parallel:DC,BA']).satisfied, true);
});

test('a goal naming a fact the figure does not have is not quietly reworded', () => {
  const figure = perpendicularBisector();
  const result = checkGeometryGoal(figure, ['equal-segments:AB,CD']);
  assert.equal(result.satisfied, false);
  assert.deepEqual(result.missing, ['equal-segments:AB,CD'], 'echoed exactly as written');
});

test('a vocabulary this does not know is compared literally rather than guessed', () => {
  const figure = perpendicularBisector();
  const result = checkGeometryGoal(figure, ['concyclic:A,B,C,D', 'tangent:AB,circle(M)']);
  assert.deepEqual(result.missing, ['concyclic:A,B,C,D', 'tangent:AB,circle(M)']);
  assert.equal(result.satisfied, false);
});

test('a name that can be read two ways is refused rather than guessed', () => {
  // The grammar runs point names together with no separator, which is fine for
  // the single letters a mark scheme uses and ambiguous in general: with points
  // called B, C, BC and CA in one figure, the segment written `BCA` is either
  // B-CA or BC-A. The two readings are different segments, so guessing would
  // credit the wrong one.
  const figure = snapshot(
    { A: [0, 0], B: [10, 0], C: [10, 6], BC: [0, 6], CA: [4, 9] },
    { s1: segment('s1', 'BC', 'A'), s2: segment('s2', 'B', 'C') },
  );
  const report = computeGeometryInvariants(figure);
  // The reporter spells the BC-A segment `ABC`, sorting its ends.
  assert.ok(report.invariants.includes('equal-segments:ABC,BC'), report.invariants.join(' '));

  // Written the reporter's way it marks; written the ambiguous way it does not,
  // and says so rather than crediting B-CA instead.
  assert.equal(checkGeometryGoal(figure, ['equal-segments:ABC,BC']).satisfied, true);
  assert.deepEqual(
    checkGeometryGoal(figure, ['equal-segments:BCA,BC']).missing,
    ['equal-segments:BCA,BC'],
  );
});

/* -------------------------------------------------------------------------- */
/* Absent is not the same as unchecked                                        */
/* -------------------------------------------------------------------------- */

test('a truncated report cannot call a fact missing', () => {
  // More points than the reporter will scan, so its answer is bounded and it
  // says so. A fact it never reached must not be reported as absent.
  const many = {};
  for (let index = 0; index < 240; index += 1) {
    many[`P${index}`] = [Math.cos(index * 1.7) * 37, Math.sin(index * 2.3) * 41];
  }
  const figure = snapshot(many);
  assert.equal(computeGeometryInvariants(figure).truncated, true);

  const result = checkGeometryGoal(figure, ['right-angle:P0P1P2']);
  assert.equal(result.satisfied, false);
  assert.equal(result.incomplete, true, 'the answer is "not established", not "wrong"');
});

test('a satisfied goal is satisfied even when the report was truncated', () => {
  // Truncation can only hide facts, so everything asked for having been found
  // is a complete answer whatever else was skipped.
  const many = { A: [-4, 0], B: [0, 0], C: [4, 0] };
  for (let index = 0; index < 240; index += 1) {
    many[`P${index}`] = [Math.cos(index * 1.7) * 37, Math.sin(index * 2.3) * 41];
  }
  const figure = snapshot(many);
  assert.equal(computeGeometryInvariants(figure).truncated, true);

  const result = checkGeometryGoal(figure, ['collinear:A,B,C']);
  assert.equal(result.satisfied, true);
  assert.equal(result.incomplete, false);
});

/* -------------------------------------------------------------------------- */
/* Extra                                                                      */
/* -------------------------------------------------------------------------- */

test('extra names relations between the goal own objects, not the whole figure', () => {
  const result = checkGeometryGoal(perpendicularBisector(), ['equal-segments:AM,BM']);

  assert.ok(result.extra.includes('midpoint:M,AB'), 'about A, B and M, which the goal names');
  assert.ok(
    result.extra.every(fact => !fact.includes('C') && !fact.includes('D')),
    'C and D are not part of this exercise',
  );
  assert.ok(!result.extra.includes('equal-segments:AM,BM'), 'what was asked for is not extra');
});

/* -------------------------------------------------------------------------- */
/* On the instrument                                                          */
/* -------------------------------------------------------------------------- */

test('the Lab marks its own figure', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: -4, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 4, y: 0, label: 'B' });
  const m = lab.addMidpoint2D(a, b, { label: 'M' });
  lab.addSegment2D(a, m);
  lab.addSegment2D(m, b);

  assert.equal(lab.checkGoal(['equal-segments:AM,BM']).satisfied, true);
  assert.deepEqual(lab.checkGoal(['perpendicular:AM,BM']).missing, ['perpendicular:AM,BM']);
  assert.ok(lab.getInvariants().invariants.includes('midpoint:M,AB'));
});

test('a construction that becomes wrong when dragged stops satisfying its goal', () => {
  // The point of checking a live figure rather than a picture of one.
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: -4, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 4, y: 0, label: 'B' });
  const c = lab.addPoint2D({ x: 0, y: 5, label: 'C' });
  lab.addSegment2D(a, c);
  lab.addSegment2D(b, c);
  assert.equal(lab.checkGoal(['equal-segments:AC,BC']).satisfied, true, 'isosceles as drawn');

  lab.applyDelta({ op: 'updatePoint', id: b, changes: { x: 9, y: 0 } });
  assert.equal(lab.checkGoal(['equal-segments:AC,BC']).satisfied, false, 'and not after the drag');
});

/* -------------------------------------------------------------------------- */
/* The vocabulary added with bucketing (plan task 4.3)                        */
/* -------------------------------------------------------------------------- */

test('the new relations are spelled the same however a mark scheme writes them', () => {
  const figure = snapshot(
    {
      A: [0, 0], B: [3, 0], C: [0, 4],
      D: [10, 0], E: [13, 0], F: [10, 4],
      M: [1.5, 0],
    },
    {
      s1: segment('s1', 'A', 'B'),
      s2: segment('s2', 'A', 'C'),
      t1: { id: 't1', kind: 'polygon', pointIds: ['A', 'B', 'C'] },
      t2: { id: 't2', kind: 'polygon', pointIds: ['D', 'E', 'F'] },
    },
  );
  const holds = (goal) => checkGeometryGoal(figure, [goal]).satisfied;

  assert.ok(holds('point-on:M,AB'), 'M is on the segment AB');
  assert.ok(holds('point-on:M,BA'), 'and the ends of that segment are unordered');

  assert.ok(holds('congruent:ABC,DEF'));
  assert.ok(holds('congruent:DEF,ABC'), 'the two triangles are unordered');
  assert.ok(holds('congruent:CBA,FED'), 'and so are the corners of each');

  assert.ok(holds('similar:BAC,EDF'));
  assert.ok(holds('equal-area:CAB,FDE'));
});

test('equal angles read either way round', () => {
  const figure = snapshot(
    { A: [0, 0], B: [4, 0], C: [2, 3], D: [20, 0], E: [24, 0], F: [22, 3] },
    {
      s1: segment('s1', 'A', 'B'), s2: segment('s2', 'A', 'C'),
      s3: segment('s3', 'D', 'E'), s4: segment('s4', 'D', 'F'),
    },
  );
  for (const spelling of ['equal-angles:BAC,EDF', 'equal-angles:CAB,EDF', 'equal-angles:FDE,BAC']) {
    assert.equal(checkGeometryGoal(figure, [spelling]).satisfied, true, spelling);
  }
  assert.equal(
    checkGeometryGoal(figure, ['equal-angles:ABC,EDF']).satisfied,
    false,
    'a different vertex is a different angle',
  );
});

test('a tangent is named by its line and the circle it touches', () => {
  const figure = snapshot(
    { O: [0, 0], A: [-8, 5], B: [8, 5] },
    { s1: segment('s1', 'A', 'B'), c1: { id: 'c1', kind: 'circle', centerId: 'O', radius: 5 } },
  );
  assert.ok(checkGeometryGoal(figure, ['tangent:AB,circle(O)']).satisfied);
  assert.ok(checkGeometryGoal(figure, ['tangent:BA,circle(O)']).satisfied, 'the line ends are unordered');
});

test('a polygon name that could be read at two corner counts is refused', () => {
  // Same rule as a two-point name: with points B, C and BC in one figure,
  // `BCBC` is either a triangle or a quadrilateral, and guessing would credit
  // a different polygon from the one the author meant.
  const names = { B: [0, 0], C: [6, 0], BC: [0, 8], D: [20, 0], E: [26, 0], F: [20, 8] };
  const figure = snapshot(names, {
    t1: { id: 't1', kind: 'polygon', pointIds: ['B', 'C', 'BC'] },
    t2: { id: 't2', kind: 'polygon', pointIds: ['D', 'E', 'F'] },
  });
  assert.ok(checkGeometryGoal(figure, ['congruent:BBCC,DEF']).satisfied, 'the sorted spelling marks');
  assert.deepEqual(
    checkGeometryGoal(figure, ['congruent:BCBC,DEF']).missing,
    ['congruent:BCBC,DEF'],
    'and the ambiguous one is refused rather than guessed',
  );
});

test('a relation that holds of every subset marks when a mark scheme names fewer', () => {
  const figure = snapshot(
    { O: [0, 0], A: [10, 0], B: [0, 10], C: [-10, 0], D: [0, -10] },
    { c1: { id: 'c1', kind: 'circle', centerId: 'O', radius: 10 } },
  );
  assert.equal(checkGeometryGoal(figure, ['concyclic:A,B,C,D']).satisfied, true);
  assert.equal(checkGeometryGoal(figure, ['concyclic:A,B,C']).satisfied, true, 'three of the four');
  assert.equal(checkGeometryGoal(figure, ['concyclic:D,B,A']).satisfied, true, 'in any order');
  assert.equal(checkGeometryGoal(figure, ['concyclic:A,B,O']).satisfied, false, 'the centre is not on it');
});

test('collinearity is subset-closed too, and always was', () => {
  const figure = snapshot({ A: [0, 0], B: [1, 1], C: [2, 2], D: [5, 0] });
  assert.equal(checkGeometryGoal(figure, ['collinear:A,B,C']).satisfied, true);
  assert.equal(checkGeometryGoal(figure, ['collinear:A,C,D']).satisfied, false);
});
