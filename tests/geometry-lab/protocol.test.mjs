/**
 * The construction protocol (plan task 4.2).
 *
 * <p>A drawing shows what a student ended up with; a protocol shows what they
 * did. Nothing is stored to produce it - every derived object already carries
 * the rule that made it, which is what makes the figure dynamic in the first
 * place - so these tests are mostly about whether that provenance is enough to
 * read back as a sequence somebody could follow.
 *
 * <p>Two properties carry the weight. Every step's sources come before it,
 * which is what "replayable" means and what a cycle would break. And the
 * machinery the instrument creates on the caller's behalf - the hidden helper
 * that gives a constructed line its direction - is not a step, because no
 * student ever placed one.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeometryLab, geometryConstructionProtocol } from '../../dist/geometry-lab/index.js';

/** A perpendicular bisector, built the way a lesson asks for it. */
function bisected() {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: -4, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 4, y: 0, label: 'B' });
  const ab = lab.addSegment2D(a, b);
  const m = lab.addMidpoint2D(a, b, { label: 'M' });
  const perpendicular = lab.addPerpendicularLine2D(ab, m);
  return { lab, a, b, ab, m, perpendicular };
}

const lines = (lab) => lab.formatConstructionProtocol().split('\n');

/* -------------------------------------------------------------------------- */
/* What it reads like                                                         */
/* -------------------------------------------------------------------------- */

test('a construction reads back as the steps that made it', () => {
  const { lab } = bisected();
  assert.deepEqual(lines(lab), [
    '1. Place A at (-4, 0).',
    '2. Place B at (4, 0).',
    '3. Join A and B with segment AB.',
    '4. Construct M, the midpoint of A and B.',
    '5. Draw line 1, the line through M perpendicular to AB.',
  ]);
});

test('a point is introduced where it is first used, not all of them at the top', () => {
  // The model has no timestamps, so no reading of it recovers the true order.
  // This is the stated rule instead, and it is the one that reads as a protocol.
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 4, y: 0, label: 'B' });
  lab.addSegment2D(a, b);
  const c = lab.addPoint2D({ x: 0, y: 3, label: 'C' });
  lab.addSegment2D(a, c);

  assert.deepEqual(lines(lab), [
    '1. Place A at (0, 0).',
    '2. Place B at (4, 0).',
    '3. Join A and B with segment AB.',
    '4. Place C at (0, 3).',
    '5. Join A and C with segment AC.',
  ]);
});

test('a point nothing is built on comes last rather than being left out', () => {
  const { lab } = bisected();
  lab.addPoint2D({ x: 9, y: 9, label: 'D' });
  const protocol = lab.getConstructionProtocol();
  const last = protocol.steps[protocol.steps.length - 1];
  assert.equal(last.summary, 'Place D at (9, 9).');
  assert.deepEqual(last.sourceIds, [], 'nothing depends on it, so nothing had to come first');
});

test('an unlabelled object is given a name a person can read', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0 });
  const b = lab.addPoint2D({ x: 4, y: 0 });
  lab.addSegment2D(a, b);

  assert.deepEqual(lines(lab), [
    '1. Place P1 at (0, 0).',
    '2. Place P2 at (4, 0).',
    '3. Join P1 and P2 with segment P1P2.',
  ], 'an id reads as p2_36a2falqxd35x_74df19_2, which no teacher can mark from');
});

test('every construction kind the instrument can make has wording', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 6, y: 0, label: 'B' });
  const c = lab.addPoint2D({ x: 3, y: 5, label: 'C' });
  const ab = lab.addSegment2D(a, b);
  const bc = lab.addSegment2D(b, c);
  lab.addMidpoint2D(a, b, { label: 'M' });
  lab.addLine2D(a, c);
  lab.addParallelLine2D(ab, c);
  lab.addPerpendicularLine2D(ab, c);
  lab.addAngleBisector2D([a, b, c]);
  lab.addCircle2D(a, b);
  lab.addCircleThroughPoints2D([a, b, c]);
  lab.addIntersection2D(ab, bc);
  lab.reflectInPoint2D(c, a);
  lab.rotate2D(c, a, 90);
  lab.dilate2D(c, a, 2);

  for (const step of lab.getConstructionProtocol().steps) {
    assert.ok(step.summary.length > 0, `${step.operation} has no wording`);
    assert.ok(
      !step.summary.includes('undefined') && !/_[0-9a-f]{8,}/.test(step.summary),
      `${step.operation} leaked an id or a hole: ${step.summary}`,
    );
  }
});

test('a transformation says what was done and to what', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 3, y: 0, label: 'A' });
  const o = lab.addPoint2D({ x: 0, y: 0, label: 'O' });
  lab.rotate2D(a, o, 90);
  const rotation = lab.getConstructionProtocol().steps.find(step => step.operation === 'transformedPoint');
  assert.equal(rotation.summary, 'Rotate A about O through 90°, giving P1.');
});

test('a constraint is a step, because it is part of how the figure was built', () => {
  const { lab, a, b } = bisected();
  lab.addConstraint2D({ kind: 'fixedLength', pointIds: [a, b], length: 8 });
  const step = lab.getConstructionProtocol().steps.find(entry => entry.kind === 'constrain');
  assert.equal(step.summary, 'Fix AB at 8.');
});

test('a switched-off constraint says so', () => {
  const { lab, a, b } = bisected();
  lab.addConstraint2D({ kind: 'fixedLength', pointIds: [a, b], length: 8, enabled: false });
  const step = lab.getConstructionProtocol().steps.find(entry => entry.kind === 'constrain');
  assert.equal(step.summary, 'Fix AB at 8 (switched off).');
});

/* -------------------------------------------------------------------------- */
/* Machinery is not a step                                                    */
/* -------------------------------------------------------------------------- */

test('the hidden helper a constructed line needs is not a step', () => {
  const { lab } = bisected();
  const protocol = lab.getConstructionProtocol();
  assert.equal(protocol.omitted, 1, 'the perpendicular line has one helper point');
  assert.ok(
    protocol.steps.every(step => step.kind !== 'place' || step.name === 'A' || step.name === 'B'),
    'no third point was placed',
  );
});

test('the centre of a circle through three points is not a step either', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 6, y: 0, label: 'B' });
  const c = lab.addPoint2D({ x: 3, y: 5, label: 'C' });
  lab.addCircleThroughPoints2D([a, b, c]);

  const protocol = lab.getConstructionProtocol();
  assert.equal(protocol.omitted, 1);
  assert.equal(
    protocol.steps[protocol.steps.length - 1].summary,
    'Draw circle 1, the circle through A, B and C.',
    'the student drew a circle, not a centre',
  );
});

test('a point the student hid is still a step they took', () => {
  // Hidden and locked together is the instrument creating something on the
  // caller's behalf. Hidden alone is a styling choice about their own point.
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0, label: 'A', hidden: true });
  lab.addPoint2D({ x: 4, y: 0, label: 'B' });
  const protocol = lab.getConstructionProtocol();
  assert.equal(protocol.omitted, 0);
  assert.ok(protocol.steps.some(step => step.objectId === a));
});

/* -------------------------------------------------------------------------- */
/* Replayable                                                                 */
/* -------------------------------------------------------------------------- */

test('a step never depends on one that comes after it', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 6, y: 0, label: 'B' });
  const c = lab.addPoint2D({ x: 3, y: 5, label: 'C' });
  const ab = lab.addSegment2D(a, b);
  const m = lab.addMidpoint2D(a, b, { label: 'M' });
  lab.addPerpendicularLine2D(ab, m);
  lab.addCircleThroughPoints2D([a, b, c]);
  lab.rotate2D(c, m, 45);
  lab.addConstraint2D({ kind: 'fixedLength', pointIds: [a, b], length: 6 });

  const protocol = lab.getConstructionProtocol();
  assert.equal(protocol.replayable, true);

  const seen = new Set();
  const known = new Set(protocol.steps.map(step => step.objectId));
  for (const step of protocol.steps) {
    for (const sourceId of step.sourceIds) {
      // A source that is not a step at all is folded-away machinery.
      if (!known.has(sourceId)) continue;
      assert.ok(seen.has(sourceId), `step ${step.number} uses ${sourceId} before it exists`);
    }
    seen.add(step.objectId);
  }
});

test('the numbering is the order, with no gaps', () => {
  const { lab } = bisected();
  const protocol = lab.getConstructionProtocol();
  assert.deepEqual(protocol.steps.map(step => step.number), protocol.steps.map((_, index) => index + 1));
});

/* -------------------------------------------------------------------------- */
/* Derived, not recorded                                                      */
/* -------------------------------------------------------------------------- */

test('the protocol follows a deletion, because it is read rather than logged', () => {
  const { lab, perpendicular } = bisected();
  assert.equal(lab.getConstructionProtocol().steps.length, 5);

  lab.remove(perpendicular);
  const after = lab.getConstructionProtocol();
  assert.equal(after.steps.length, 4, 'a step that was undone is not in the figure, so it is not in the protocol');
  assert.ok(!lab.formatConstructionProtocol().includes('perpendicular'));
});

test('undo puts the step back', () => {
  const { lab, perpendicular } = bisected();
  lab.remove(perpendicular);
  lab.undo();
  assert.equal(lab.getConstructionProtocol().steps.length, 5);
});

test('a protocol survives a round trip through JSON', () => {
  const { lab } = bisected();
  const before = lab.formatConstructionProtocol();
  const saved = JSON.parse(JSON.stringify(lab.getSnapshot()));

  const reopened = createGeometryLab();
  reopened.loadSnapshot(saved);
  assert.equal(reopened.formatConstructionProtocol(), before);
});

test('dragging a point changes where it was placed and nothing else', () => {
  const { lab, a } = bisected();
  lab.applyDelta({ op: 'updatePoint', id: a, changes: { x: -9, y: 2 } });
  const after = lines(lab);
  assert.equal(after[0], '1. Place A at (-9, 2).');
  assert.equal(after[4], '5. Draw line 1, the line through M perpendicular to AB.', 'the rule did not change');
});

test('an empty figure has an empty protocol', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const protocol = lab.getConstructionProtocol();
  assert.deepEqual(protocol.steps, []);
  assert.equal(protocol.replayable, true);
  assert.equal(lab.formatConstructionProtocol(), '');
});

test('the plane every scene starts with is not a step', () => {
  // A 2D figure would otherwise end with a line about a plane nobody added.
  const { lab } = bisected();
  assert.ok(!lab.formatConstructionProtocol().includes('plane'));
});

/* -------------------------------------------------------------------------- */
/* Three dimensions                                                           */
/* -------------------------------------------------------------------------- */

test('a solid, a plane and a cut read back as three steps', () => {
  const lab = createGeometryLab();
  const cube = lab.addPolyhedron('cube', { x: 0, y: 0, z: 0 }, 2);
  const plane = lab.addWorkPlaneByEquation({ a: 0, b: 0, c: 1, d: -0.5 }, { label: 'cut' });
  lab.addCrossSection(cube, plane);

  assert.deepEqual(lines(lab), [
    '1. Add cube 1.',
    '2. Add plane cut from its equation.',
    '3. Cut cube 1 with cut, giving cross-section 1.',
  ]);
  assert.ok(lab.getConstructionProtocol().omitted > 0, "the cube's own mesh points are not steps");
});

test('a 3D intersection names the line and the plane it meets', () => {
  const lab = createGeometryLab();
  const plane = lab.addWorkPlaneByEquation({ a: 0, b: 0, c: 1, d: -1 }, { label: 'p' });
  const a = lab.addPoint3D({ x: 0, y: 0, z: 0, label: 'A' });
  const b = lab.addPoint3D({ x: 3, y: 0, z: 3, label: 'B' });
  lab.addLinePlaneIntersection(lab.addSegment3D(a, b), plane);

  const step = lab.getConstructionProtocol().steps.find(entry => entry.operation === 'linePlaneIntersection');
  assert.equal(step.summary, 'Construct P1 where AB meets p.');
});

/* -------------------------------------------------------------------------- */
/* A broken figure                                                            */
/* -------------------------------------------------------------------------- */

test('provenance that points at itself is reported, not spun on', () => {
  // The integrity check forbids this, so it can only arrive in a hand-made
  // snapshot - and a protocol of a broken figure is a diagnostic, so it says
  // so rather than throwing or stalling.
  const broken = {
    version: 1,
    instrument: 'geometry-lab',
    scene: {
      scene2d: {
        kind: 'geometry-lab-2d',
        points: {
          A: { id: 'A', kind: 'point2d', label: 'A', x: 0, y: 0, construction: { kind: 'midpoint', sourceIds: ['B', 'B'] } },
          B: { id: 'B', kind: 'point2d', label: 'B', x: 1, y: 0, construction: { kind: 'midpoint', sourceIds: ['A', 'A'] } },
        },
        entities: {},
        constraints: {},
      },
      scene3d: { kind: 'geometry-lab-3d', points: {}, entities: {}, workPlanes: {}, measurements: {}, nets: {} },
      links: [],
    },
    appState: {},
  };
  const protocol = geometryConstructionProtocol(broken);
  assert.equal(protocol.replayable, false);
  assert.equal(protocol.steps.length, 2, 'and still lists everything, because it is a diagnostic');
});
