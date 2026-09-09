/**
 * Exercises as data, and the hint ladder (plan tasks 4.5 and 4.6).
 *
 * <p>The bank was prose: good content with no way to say what a correct answer
 * establishes, what to say to a child who is stuck, or what to give them next.
 * These tests are mostly about the two claims that migration makes and prose
 * could not: that every answer key is reachable, and that a hint responds to
 * the figure in front of the student rather than to a counter.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GEOMETRY_EXERCISE_BANK,
  createGeometryLab,
  geometryExercise,
  geometryExerciseProgress,
  learnerGeometryExercise,
  markGeometryExercise,
  nextGeometryHint,
} from '../../dist/geometry-lab/index.js';
import { MODEL_ANSWERS } from './exercise-models.mjs';

const targeted = GEOMETRY_EXERCISE_BANK.filter(exercise => exercise.target.length > 0);

/* -------------------------------------------------------------------------- */
/* Every key is reachable                                                     */
/* -------------------------------------------------------------------------- */

test('every exercise with a target has a model answer that satisfies it', () => {
  // An answer key nobody has answered is a guess.
  assert.ok(targeted.length >= 8, 'the bank should have real keys, not none');
  for (const exercise of targeted) {
    const build = MODEL_ANSWERS[exercise.id];
    assert.ok(build, `${exercise.id} has a target and no model answer`);
    const mark = markGeometryExercise(exercise, build().getSnapshot());
    assert.equal(mark.satisfied, true, `${exercise.id} is not satisfied: missing ${mark.missing.join(' ')}`);
    assert.deepEqual(mark.coincidental, [], `${exercise.id} was only true where it was left`);
  }
});

test('the model answers survive being dragged, which is what a construction means', () => {
  for (const exercise of targeted.filter(entry => entry.requireConstruction === true)) {
    const lab = MODEL_ANSWERS[exercise.id]();
    const report = lab.detectConjectures();
    for (const fact of exercise.target) {
      assert.ok(
        report.invariant.includes(fact),
        `${exercise.id}: ${fact} did not survive - the model answer draws rather than constructs`,
      );
    }
  }
});

test('an empty figure satisfies no exercise that asks for anything', () => {
  const empty = createGeometryLab({ initialView: '2d' }).getSnapshot();
  for (const exercise of targeted) {
    const mark = markGeometryExercise(exercise, empty);
    assert.equal(mark.satisfied, false, `${exercise.id} marked an empty figure correct`);
    assert.equal(mark.points, 0);
  }
});

test('an open activity is not scored, and says so rather than scoring zero', () => {
  const garden = geometryExercise('shape-garden');
  const mark = markGeometryExercise(garden, createGeometryLab({ initialView: '2d' }).getSnapshot());
  assert.equal(mark.satisfied, null, 'there is no invariant that says a garden is finished');
  assert.equal(mark.pointsAwaitingJudgement, mark.maxPoints, 'all of it is for a person to judge');
});

/* -------------------------------------------------------------------------- */
/* Drawn is not constructed                                                   */
/* -------------------------------------------------------------------------- */

test('a figure dragged into the right shape does not pass a construction exercise', () => {
  // The whole point of marking on invariants that survive movement: this
  // triangle is equilateral to eleven decimal places and is not a construction.
  const exercise = geometryExercise('construction-from-instructions');
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 6, y: 0, label: 'B' });
  const c = lab.addPoint2D({ x: 3, y: Math.sqrt(27), label: 'C' });
  lab.addSegment2D(a, b);
  lab.addSegment2D(a, c);
  lab.addSegment2D(b, c);

  const drawn = markGeometryExercise(exercise, lab.getSnapshot());
  assert.equal(drawn.satisfied, false, 'it looks right and it is not an answer');
  assert.ok(drawn.coincidental.length > 0, 'and the mark says why');

  const built = markGeometryExercise(exercise, MODEL_ANSWERS[exercise.id]().getSnapshot());
  assert.equal(built.satisfied, true, 'the constructed version passes');
});

test('an exercise that does not ask for a construction accepts a correct drawing', () => {
  const exercise = geometryExercise('triangle-detective');
  assert.notEqual(exercise.requireConstruction, true);
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 5, label: 'A' });
  const b = lab.addPoint2D({ x: -4, y: 0, label: 'B' });
  const c = lab.addPoint2D({ x: 4, y: 0, label: 'C' });
  lab.addSegment2D(a, b);
  lab.addSegment2D(a, c);
  assert.equal(markGeometryExercise(exercise, lab.getSnapshot()).satisfied, true);
});

/* -------------------------------------------------------------------------- */
/* The hint ladder                                                            */
/* -------------------------------------------------------------------------- */

test('a hint speaks to what is missing, not to what is already there', () => {
  const exercise = geometryExercise('proof-by-construction');
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 10, y: 0, label: 'B' });
  const c = lab.addPoint2D({ x: 3, y: 8, label: 'C' });
  // M is built; N is not.
  lab.addMidpoint2D(a, b, { label: 'M' });

  const hint = lab.nextHint(exercise);
  assert.equal(hint.forInvariant, 'midpoint:N,AC', 'the student already has M');
});

test('the ladder walks up as hints are used', () => {
  const exercise = geometryExercise('construction-from-instructions');
  const lab = createGeometryLab({ initialView: '2d' });
  lab.addPoint2D({ x: 0, y: 0, label: 'A' });
  lab.addPoint2D({ x: 6, y: 0, label: 'B' });

  const given = [];
  const rungs = [];
  for (let step = 0; step < 3; step += 1) {
    const hint = lab.nextHint(exercise, given);
    rungs.push(hint.rung);
    given.push(hint.text);
  }
  assert.deepEqual(rungs, [1, 2, 3], 'gentlest first');
});

test('a finished figure is offered encouragement rather than the answer again', () => {
  const exercise = geometryExercise('proof-by-construction');
  const lab = MODEL_ANSWERS['proof-by-construction']();
  const hint = lab.nextHint(exercise);
  assert.equal(hint.forInvariant, undefined, 'nothing is missing, so no rung about a missing fact');
});

test('a spent ladder gives nothing rather than repeating itself', () => {
  const exercise = geometryExercise('triangle-detective');
  const lab = createGeometryLab({ initialView: '2d' });
  const all = exercise.hints.map(hint => hint.text);
  assert.equal(nextGeometryHint(exercise, lab.getSnapshot(), all), null);
});

test('hints are ordered and every fact-tied hint names a fact the exercise asks for', () => {
  for (const exercise of GEOMETRY_EXERCISE_BANK) {
    assert.ok(exercise.hints.length > 0, `${exercise.id} has no hints`);
    const rungs = exercise.hints.map(hint => hint.rung);
    assert.deepEqual(rungs, rungs.slice().sort((left, right) => left - right), `${exercise.id} hints are out of order`);
    for (const hint of exercise.hints) {
      if (hint.forInvariant === undefined) continue;
      assert.ok(
        exercise.target.includes(hint.forInvariant),
        `${exercise.id} hints at ${hint.forInvariant}, which it never asks for`,
      );
    }
  }
});

/* -------------------------------------------------------------------------- */
/* What a learner may see                                                     */
/* -------------------------------------------------------------------------- */

test('the learner projection carries no answer key and no unspent hint', () => {
  const exercise = geometryExercise('proof-by-construction');
  const task = learnerGeometryExercise(exercise);
  const serialized = JSON.stringify(task);

  assert.equal(task.hints.length, 0);
  assert.equal(task.hintsRemaining, exercise.hints.length);
  assert.equal(serialized.includes('midpoint:M,AB'), false, 'the key must not reach the page');
  for (const hint of exercise.hints) {
    assert.equal(serialized.includes(hint.text), false, `an unspent hint leaked: ${hint.text}`);
  }
  assert.equal(task.title, exercise.title, 'but the exercise itself is all there');
  assert.deepEqual(task.task, exercise.task);
});

test('a released hint is included and the rest are not', () => {
  const exercise = geometryExercise('construction-from-instructions');
  const first = exercise.hints[0].text;
  const task = learnerGeometryExercise(exercise, [first]);

  assert.deepEqual(task.hints, [first]);
  assert.equal(task.hintsRemaining, exercise.hints.length - 1);
  assert.equal(JSON.stringify(task).includes(exercise.hints[1].text), false);
});

test('no rubric criterion leaks the key it is decided by', () => {
  // The learner projection drops the rubric entirely; this pins that rather
  // than trusting the shape of the object.
  for (const exercise of GEOMETRY_EXERCISE_BANK) {
    const serialized = JSON.stringify(learnerGeometryExercise(exercise));
    for (const fact of exercise.target) {
      assert.equal(serialized.includes(fact), false, `${exercise.id} leaked ${fact}`);
    }
  }
});

/* -------------------------------------------------------------------------- */
/* The bank                                                                   */
/* -------------------------------------------------------------------------- */

test('the bank carries every exercise the markdown pack had', () => {
  assert.equal(GEOMETRY_EXERCISE_BANK.length, 24);
  const ids = GEOMETRY_EXERCISE_BANK.map(exercise => exercise.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const exercise of GEOMETRY_EXERCISE_BANK) {
    assert.ok(exercise.task.length > 0, `${exercise.id} has no task`);
    assert.ok(exercise.tools.length > 0, `${exercise.id} names no tools`);
    assert.ok(exercise.rubric.length > 0, `${exercise.id} has no rubric`);
    assert.ok(exercise.goal.length > 0, `${exercise.id} has no goal`);
  }
});

test('every prerequisite names an exercise that exists and comes before it', () => {
  const seen = new Set();
  for (const exercise of GEOMETRY_EXERCISE_BANK) {
    for (const id of exercise.prerequisites ?? []) {
      assert.ok(geometryExercise(id), `${exercise.id} requires ${id}, which is not in the bank`);
      assert.ok(seen.has(id), `${exercise.id} requires ${id}, which comes after it`);
    }
    seen.add(exercise.id);
  }
});

test('progress unlocks the next exercise and not the one after', () => {
  const progress = geometryExerciseProgress(GEOMETRY_EXERCISE_BANK, [
    { exerciseId: 'angle-hunt', satisfied: true },
    { exerciseId: 'triangle-detective', satisfied: false },
  ]);
  assert.ok(progress.completed.includes('angle-hunt'));
  assert.ok(progress.inProgress.includes('triangle-detective'));
  assert.ok(progress.available.includes('shape-garden'), 'anything with no prerequisite is open');
  assert.ok(progress.locked.includes('quadrilateral-sorting'), 'which waits on the unfinished one');
});

test('a failed attempt does not undo a successful one', () => {
  const progress = geometryExerciseProgress(GEOMETRY_EXERCISE_BANK, [
    { exerciseId: 'angle-hunt', satisfied: true },
    { exerciseId: 'angle-hunt', satisfied: false },
  ]);
  assert.ok(progress.completed.includes('angle-hunt'));
});

test('every exercise ends up in exactly one bucket', () => {
  const progress = geometryExerciseProgress(GEOMETRY_EXERCISE_BANK, []);
  const total = progress.completed.length + progress.inProgress.length
    + progress.available.length + progress.locked.length;
  assert.equal(total, GEOMETRY_EXERCISE_BANK.length);
});
