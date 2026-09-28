/**
 * Constraint solving in the Lab (plan tasks 3.2 and 3.3).
 *
 * <p>`scene2d.constraints` has been part of the model from the start - typed,
 * validated, persisted, cascaded on delete - and nothing ever enforced it. A
 * segment declared to be five units long could be dragged to any length at all,
 * so the constraint was a note in the file rather than a fact about the figure.
 *
 * <p>The solver was not written here: it already existed in the Geometry
 * Calculator, reading nothing Calculator-specific, so it moved to geometry-core
 * and both instruments now share it. That move is covered by a differential run
 * over every constraint kind; what these tests cover is the Lab actually
 * enforcing them, and the iteration cap holding when a figure cannot settle.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeometryLab } from '../../dist/geometry-lab/index.js';

const round = (value) => Math.round(value * 1e6) / 1e6;

function segment(lab, first, second) {
  const points = lab.peekSnapshot().scene.scene2d.points;
  return round(Math.hypot(points[second].x - points[first].x, points[second].y - points[first].y));
}

function pair(x = 5) {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0 });
  const b = lab.addPoint2D({ x, y: 0 });
  lab.addSegment2D(a, b);
  return { lab, a, b };
}

/* -------------------------------------------------------------------------- */
/* Constraints hold                                                           */
/* -------------------------------------------------------------------------- */

test('a fixed length survives a drag that would break it', () => {
  const { lab, a, b } = pair();
  lab.addConstraint2D({ kind: 'fixedLength', pointIds: [a, b], length: 5 });
  assert.equal(segment(lab, a, b), 5);

  lab.applyDelta({ op: 'updatePoint', id: b, changes: { x: 12, y: 0 } });
  assert.equal(segment(lab, a, b), 5, 'dragging B out to 12 must snap it back to 5');

  lab.applyDelta({ op: 'updatePoint', id: b, changes: { x: 0, y: 9 } });
  assert.equal(segment(lab, a, b), 5, 'and in any direction');
});

test('a constraint holds however the edit arrives', () => {
  // The point of enforcing in canonicalization rather than in one method: a raw
  // delta from a collaborating peer is subject to the same rule.
  const { lab, a, b } = pair();
  lab.addConstraint2D({ kind: 'fixedLength', pointIds: [a, b], length: 5 });
  lab.applyDelta({ op: 'updatePoint', id: b, changes: { x: 40, y: 40 } }, { emit: false, meta: { source: 'remote' } });
  assert.equal(segment(lab, a, b), 5);
});

test('equal-length ties two segments together', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0 });
  const b = lab.addPoint2D({ x: 3, y: 0 });
  const c = lab.addPoint2D({ x: 0, y: 5 });
  const d = lab.addPoint2D({ x: 7, y: 5 });
  lab.addSegment2D(a, b);
  lab.addSegment2D(c, d);
  lab.addConstraint2D({ kind: 'equalLength', segments: [[a, b], [c, d]] });
  assert.equal(segment(lab, a, b), segment(lab, c, d));
});

test('equal-radius ties two circles together', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const centreA = lab.addPoint2D({ x: 0, y: 0 });
  const rimA = lab.addPoint2D({ x: 3, y: 0 });
  const centreB = lab.addPoint2D({ x: 20, y: 0 });
  const rimB = lab.addPoint2D({ x: 27, y: 0 });
  const first = lab.addCircle2D(centreA, rimA);
  const second = lab.addCircle2D(centreB, rimB);
  lab.addConstraint2D({ kind: 'equalRadius', circleIds: [first, second] });

  const entities = lab.peekSnapshot().scene.scene2d.entities;
  assert.equal(round(entities[first].radius), round(entities[second].radius));
});

test('a disabled constraint is not enforced', () => {
  const { lab, a, b } = pair();
  lab.addConstraint2D({ kind: 'fixedLength', pointIds: [a, b], length: 5, enabled: false });
  lab.applyDelta({ op: 'updatePoint', id: b, changes: { x: 12, y: 0 } });
  assert.equal(segment(lab, a, b), 12, 'switched off means switched off');
});

test('a constraint survives a round trip through JSON', () => {
  const { lab, a, b } = pair();
  lab.addConstraint2D({ kind: 'fixedLength', pointIds: [a, b], length: 5 });
  const saved = JSON.parse(JSON.stringify(lab.getSnapshot()));

  const reopened = createGeometryLab();
  reopened.loadSnapshot(saved);
  reopened.applyDelta({ op: 'updatePoint', id: b, changes: { x: 30, y: 0 } });
  assert.equal(segment(reopened, a, b), 5, 'a reopened figure is still constrained');
});

/* -------------------------------------------------------------------------- */
/* The cap                                                                    */
/* -------------------------------------------------------------------------- */

test('a contradictory figure settles instead of spinning', () => {
  // Two lengths that cannot both hold. The solver must give up after its
  // iteration cap rather than chase the figure forever, which is the failure
  // mode that costs an interactive tool its frame budget.
  const { lab, a, b } = pair();
  lab.addConstraint2D({ kind: 'fixedLength', pointIds: [a, b], length: 4 });
  lab.addConstraint2D({ kind: 'fixedLength', pointIds: [a, b], length: 9 });

  const started = Date.now();
  lab.applyDelta({ op: 'updatePoint', id: b, changes: { x: 30, y: 30 } });
  assert.ok(Date.now() - started < 1000, 'the edit completed rather than hanging');

  const length = segment(lab, a, b);
  assert.ok(Number.isFinite(length), 'and left a finite figure behind');
});

test('a long constraint chain stays responsive', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const points = [lab.addPoint2D({ x: 0, y: 0 })];
  for (let index = 1; index <= 20; index += 1) {
    points.push(lab.addPoint2D({ x: index * 3, y: 0 }));
    lab.addSegment2D(points[index - 1], points[index]);
    lab.addConstraint2D({ kind: 'fixedLength', pointIds: [points[index - 1], points[index]], length: 3 });
  }

  const started = Date.now();
  for (let step = 0; step < 20; step += 1) {
    lab.applyDelta({ op: 'updatePoint', id: points[20], changes: { x: 60 + step, y: step } });
  }
  assert.ok(Date.now() - started < 2000, 'twenty drags over twenty constraints');
  assert.equal(segment(lab, points[19], points[20]), 3, 'and the last link still holds');
});

/* -------------------------------------------------------------------------- */
/* Refusals and lifecycle                                                     */
/* -------------------------------------------------------------------------- */

test('a constraint naming something missing is refused', () => {
  const { lab, a } = pair();
  assert.throws(
    () => lab.addConstraint2D({ kind: 'fixedLength', pointIds: [a, 'ghost'], length: 5 }),
    error => error.code === 'invalid_constraint_reference',
  );
});

test('a removed constraint stops being enforced', () => {
  const { lab, a, b } = pair();
  const id = lab.addConstraint2D({ kind: 'fixedLength', pointIds: [a, b], length: 5 });
  lab.applyDelta({ op: 'updatePoint', id: b, changes: { x: 12, y: 0 } });
  assert.equal(segment(lab, a, b), 5);

  lab.removeConstraint2D(id);
  lab.applyDelta({ op: 'updatePoint', id: b, changes: { x: 12, y: 0 } });
  assert.equal(segment(lab, a, b), 12);
});

test('deleting a constrained point removes the constraint with it', () => {
  const { lab, a, b } = pair();
  const id = lab.addConstraint2D({ kind: 'fixedLength', pointIds: [a, b], length: 5 });
  lab.remove(b);
  assert.equal(
    (lab.peekSnapshot().scene.scene2d.constraints ?? {})[id],
    undefined,
    'a constraint cannot outlive what it constrains',
  );
});

test('undo removes a constraint and restores the unconstrained figure', () => {
  const { lab, a, b } = pair();
  lab.addConstraint2D({ kind: 'fixedLength', pointIds: [a, b], length: 5 });
  lab.undo();

  lab.applyDelta({ op: 'updatePoint', id: b, changes: { x: 12, y: 0 } });
  assert.equal(segment(lab, a, b), 12, 'the constraint is gone, so the drag stands');
});
