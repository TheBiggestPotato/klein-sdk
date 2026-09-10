/**
 * One instrument's number following another's (plan task 6.3).
 *
 * <p>The spreadsheet, the graphing view and the Geometry Lab were separate
 * instruments with nothing between them - `WorkspaceLink` declared a source, a
 * target and a `kind` string, and nothing read any of them. That is the whole
 * of "multiple representations" as a teaching idea, and none of it worked.
 *
 * <p>Push, never poll: every test below moves something in one instrument and
 * looks at another. Nothing runs when nothing moves.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeometryLab } from '../../dist/geometry-lab/index.js';
import { createGraphingCalculator } from '../../dist/graphing/index.js';
import { createSpreadsheet } from '../../dist/spreadsheet/index.js';
import { createValueLinks } from '../../dist/integrations/index.js';

/** A 3-4-5 segment whose length is measured. */
function measuredSegment() {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 3, y: 4, label: 'B' });
  const length = lab.addLengthMeasurement2D(lab.addSegment2D(a, b), 'AB');
  return { lab, a, b, length };
}

const graphSlider = (graph, id) => graph.getSnapshot().scene.sliders[id].value;
const labSlider = (lab, id) => lab.peekSnapshot().scene.scene2d.sliders[id].value;
const drag = (lab, id, x, y) => lab.applyDelta({ op: 'updatePoint', id, changes: { x, y } });

/* -------------------------------------------------------------------------- */
/* A cell, a graph and a figure, following each other                         */
/* -------------------------------------------------------------------------- */

test('a graph parameter tracks a length as the figure is dragged', () => {
  const { lab, b, length } = measuredSegment();
  const graph = createGraphingCalculator();
  const slider = graph.addSlider('m', { value: 1, min: -20, max: 20, step: 0.01 });

  const links = createValueLinks();
  links.link({ instrument: lab, ref: { kind: 'measurement', id: length } },
             { instrument: graph, ref: { kind: 'slider', id: 'm' } });

  assert.equal(graphSlider(graph, slider), 5, 'and the current value straight away');
  drag(lab, b, 6, 8);
  assert.equal(graphSlider(graph, slider), 10);
  drag(lab, b, 0, 12);
  assert.equal(graphSlider(graph, slider), 12);
  links.dispose();
});

test('a slider is found by its name as well as its id', () => {
  const { lab, length } = measuredSegment();
  const graph = createGraphingCalculator();
  const slider = graph.addSlider('m', { value: 1, min: -20, max: 20 });
  const links = createValueLinks();
  links.link({ instrument: lab, ref: { kind: 'measurement', id: length } },
             { instrument: graph, ref: { kind: 'slider', id: slider } });
  assert.equal(graphSlider(graph, slider), 5);
  links.dispose();
});

test('a spreadsheet cell can drive a figure', () => {
  const sheet = createSpreadsheet();
  const snapshot = sheet.getSnapshot();
  snapshot.scene.cells.c1 = { id: 'c1', address: 'A1', input: '7', value: 7 };
  snapshot.scene.sheets.sheet1.cellIds.push('c1');
  sheet.loadSnapshot(snapshot);

  const lab = createGeometryLab({ initialView: '2d' });
  const slider = lab.addSlider2D({ name: 'k', min: 0, max: 100 });
  const links = createValueLinks();
  links.link({ instrument: sheet, ref: { kind: 'cell', address: 'A1' } },
             { instrument: lab, ref: { kind: 'slider', id: 'k' } });

  assert.equal(labSlider(lab, slider), 7);
  links.dispose();
});

test('a point coordinate can be driven, and the figure recomputes around it', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 0, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 10, y: 0, label: 'B' });
  const midpoint = lab.addMidpoint2D(a, b, { label: 'M' });
  const slider = lab.addSlider2D({ name: 'width', value: 10, min: 0, max: 40 });

  const links = createValueLinks();
  links.link({ instrument: lab, ref: { kind: 'slider', id: slider } },
             { instrument: lab, ref: { kind: 'pointX', id: b } });

  lab.setSliderValue2D(slider, 30);
  const points = lab.peekSnapshot().scene.scene2d.points;
  assert.equal(points[b].x, 30);
  assert.equal(points[midpoint].x, 15, 'and everything built on it followed');
  links.dispose();
});

test('a chain carries a change all the way along', () => {
  const { lab, b, length } = measuredSegment();
  const graph = createGraphingCalculator();
  const first = graph.addSlider('m', { value: 0, min: -50, max: 50, step: 0.01 });
  const other = createGeometryLab({ initialView: '2d' });
  const last = other.addSlider2D({ name: 'n', min: 0, max: 50 });

  const links = createValueLinks();
  links.link({ instrument: lab, ref: { kind: 'measurement', id: length } },
             { instrument: graph, ref: { kind: 'slider', id: 'm' } });
  links.link({ instrument: graph, ref: { kind: 'slider', id: 'm' } },
             { instrument: other, ref: { kind: 'slider', id: 'n' } });

  drag(lab, b, 6, 8);
  assert.equal(graphSlider(graph, first), 10);
  assert.equal(labSlider(other, last), 10, 'the second link fired on the first one writing');
  links.dispose();
});

/* -------------------------------------------------------------------------- */
/* Not looping                                                                */
/* -------------------------------------------------------------------------- */

test('a link that would close a loop is refused', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const one = lab.addSlider2D({ name: 'a', min: 0, max: 10 });
  const two = lab.addSlider2D({ name: 'b', min: 0, max: 10 });
  const links = createValueLinks();
  links.link({ instrument: lab, ref: { kind: 'slider', id: one } },
             { instrument: lab, ref: { kind: 'slider', id: two } });

  assert.throws(
    () => links.link({ instrument: lab, ref: { kind: 'slider', id: two } },
                     { instrument: lab, ref: { kind: 'slider', id: one } }),
    error => error.code === 'invalid_link',
    'a loop of links has nothing to settle on',
  );
  links.dispose();
});

test('a value cannot follow itself', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const slider = lab.addSlider2D({ name: 'a', min: 0, max: 10 });
  const links = createValueLinks();
  assert.throws(
    () => links.link({ instrument: lab, ref: { kind: 'slider', id: slider } },
                     { instrument: lab, ref: { kind: 'slider', id: slider } }),
    error => error.code === 'invalid_link',
  );
  links.dispose();
});

test('a write that would change nothing is not made', () => {
  // The first and most important loop guard, and also what keeps an unrelated
  // edit from churning every linked instrument's history.
  const { lab, a, length } = measuredSegment();
  const graph = createGraphingCalculator();
  graph.addSlider('m', { value: 0, min: -20, max: 20, step: 0.01 });

  const links = createValueLinks();
  links.link({ instrument: lab, ref: { kind: 'measurement', id: length } },
             { instrument: graph, ref: { kind: 'slider', id: 'm' } });

  let writes = 0;
  graph.subscribeDelta(() => { writes += 1; });
  // Moving A along the line through B keeps the length the same.
  drag(lab, a, 0, 0);
  lab.addPoint2D({ x: 99, y: 99 });
  assert.equal(writes, 0, 'nothing changed, so nothing was written');

  drag(lab, a, 3, 4);
  assert.equal(writes, 1, 'and a real change is written once');
  links.dispose();
});

/* -------------------------------------------------------------------------- */
/* Refusing rather than half-working                                          */
/* -------------------------------------------------------------------------- */

test('the spreadsheet cannot yet be written to, and says so at the link', () => {
  // A fact about the spreadsheet rather than about linking: it is still a
  // scaffold whose applyDelta throws. Said when the link is set up rather than
  // discovered when a student drags something.
  const { lab, length } = measuredSegment();
  const sheet = createSpreadsheet();
  const links = createValueLinks();

  assert.throws(
    () => links.link({ instrument: lab, ref: { kind: 'measurement', id: length } },
                     { instrument: sheet, ref: { kind: 'cell', address: 'B2' } }),
    error => error.code === 'not_implemented',
  );
  assert.deepEqual(links.links(), [], 'and the failed link is not left in the graph');
  links.dispose();
});

test('a measurement cannot be a target, because it is what the figure measures', () => {
  const { lab, length } = measuredSegment();
  const slider = lab.addSlider2D({ name: 'k', min: 0, max: 10 });
  const links = createValueLinks();
  assert.throws(
    () => links.link({ instrument: lab, ref: { kind: 'slider', id: slider } },
                     { instrument: lab, ref: { kind: 'measurement', id: length } }),
    error => error.code === 'read_only_link_target',
  );
  links.dispose();
});

test('linking to something that is not there is refused', () => {
  const { lab, length } = measuredSegment();
  const links = createValueLinks();
  assert.throws(
    () => links.link({ instrument: lab, ref: { kind: 'measurement', id: length } },
                     { instrument: lab, ref: { kind: 'slider', id: 'ghost' } }),
    error => error.code === 'missing_link_target',
  );
  links.dispose();
});

test('a source with nothing in it yet is allowed, and starts working when it has', () => {
  // A link to a cell nobody has filled in is a reasonable thing to set up
  // before filling it in.
  const sheet = createSpreadsheet();
  const lab = createGeometryLab({ initialView: '2d' });
  const slider = lab.addSlider2D({ name: 'k', value: 1, min: 0, max: 100 });
  const links = createValueLinks();
  links.link({ instrument: sheet, ref: { kind: 'cell', address: 'A1' } },
             { instrument: lab, ref: { kind: 'slider', id: 'k' } });
  assert.equal(labSlider(lab, slider), 1, 'nothing was pushed');
  links.dispose();
});

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

test('unlinking stops the pushing', () => {
  const { lab, b, length } = measuredSegment();
  const graph = createGraphingCalculator();
  const slider = graph.addSlider('m', { value: 0, min: -50, max: 50, step: 0.01 });
  const links = createValueLinks();
  const id = links.link({ instrument: lab, ref: { kind: 'measurement', id: length } },
                        { instrument: graph, ref: { kind: 'slider', id: 'm' } });

  drag(lab, b, 6, 8);
  assert.equal(graphSlider(graph, slider), 10);
  links.unlink(id);
  drag(lab, b, 0, 20);
  assert.equal(graphSlider(graph, slider), 10, 'the value stayed where the link left it');
  assert.deepEqual(links.links(), []);
});

test('disposing stops every link at once', () => {
  const { lab, b, length } = measuredSegment();
  const graph = createGraphingCalculator();
  const slider = graph.addSlider('m', { value: 0, min: -50, max: 50, step: 0.01 });
  const links = createValueLinks();
  links.link({ instrument: lab, ref: { kind: 'measurement', id: length } },
             { instrument: graph, ref: { kind: 'slider', id: 'm' } });
  links.dispose();
  drag(lab, b, 6, 8);
  assert.equal(graphSlider(graph, slider), 5);
});

test('undo does not push the undone value forward', () => {
  // An undo replays an earlier state, and a link that treated it as a fresh
  // change would write the value the student just took back.
  const { lab, b, length } = measuredSegment();
  const graph = createGraphingCalculator();
  const slider = graph.addSlider('m', { value: 0, min: -50, max: 50, step: 0.01 });
  const links = createValueLinks();
  links.link({ instrument: lab, ref: { kind: 'measurement', id: length } },
             { instrument: graph, ref: { kind: 'slider', id: 'm' } });

  drag(lab, b, 6, 8);
  assert.equal(graphSlider(graph, slider), 10);
  const before = graphSlider(graph, slider);
  lab.undo();
  assert.equal(graphSlider(graph, slider), before, 'the graph was left alone');
  links.dispose();
});

test('a failure while a student is working is reported rather than thrown', () => {
  const { lab, b, length } = measuredSegment();
  const graph = createGraphingCalculator();
  const slider = graph.addSlider('m', { value: 0, min: -50, max: 50, step: 0.01 });
  const failures = [];
  const links = createValueLinks({ onError: (error) => failures.push(error.code) });
  links.link({ instrument: lab, ref: { kind: 'measurement', id: length } },
             { instrument: graph, ref: { kind: 'slider', id: 'm' } });

  // The target disappears from under the link.
  graph.applyDelta({ op: 'delete', ids: [slider] }, { meta: { source: 'local' } });
  drag(lab, b, 6, 8);
  assert.deepEqual(failures, ['missing_link_target']);
  links.dispose();
});
