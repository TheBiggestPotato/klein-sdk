/**
 * Building a figure without a pointer (plan task 5.3).
 *
 * <p>`mount()` writes static SVG and registers no listeners, so until this
 * there was no path to a construction that did not go through pointing at
 * things. What the SDK can own without answering task 5.5 is the *model*: a
 * cursor for "somewhere", a focus for "that one", and a tool that consumes
 * objects in order. These tests drive it with key names, which is all a host
 * has to forward.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GEOMETRY_TOOL_KEYS,
  KEYBOARD_COMPLETABLE_TOOLS,
  createGeometryKeyboardSession,
  createGeometryLab,
} from '../../dist/geometry-lab/index.js';

function session() {
  const lab = createGeometryLab({ initialView: '2d' });
  return { lab, keys: createGeometryKeyboardSession(lab) };
}

/** Places `count` points, each one arrow-step apart, and returns their ids. */
function placePoints(keys, positions) {
  keys.setTool('point');
  const ids = [];
  for (const [x, y] of positions) {
    const at = keys.getState().cursor;
    for (let step = 0; step < Math.abs(x - at.x); step += 1) keys.press(x > at.x ? 'ArrowRight' : 'ArrowLeft');
    for (let step = 0; step < Math.abs(y - at.y); step += 1) keys.press(y > at.y ? 'ArrowUp' : 'ArrowDown');
    ids.push(keys.press('Enter').createdId);
  }
  return ids;
}

/** Focuses `id` by tabbing to it, however far round the figure it is. */
function focus(keys, id) {
  for (let step = 0; step < 64; step += 1) {
    if (keys.getState().focusedId === id) return true;
    keys.press('Tab');
  }
  return keys.getState().focusedId === id;
}

/* -------------------------------------------------------------------------- */
/* A cursor and a focus                                                       */
/* -------------------------------------------------------------------------- */

test('a point is placed where the arrow keys put the cursor', () => {
  const { lab, keys } = session();
  keys.setTool('point');
  keys.press('ArrowRight');
  keys.press('ArrowRight');
  keys.press('ArrowUp');
  const created = keys.press('Enter');

  assert.equal(created.createdId !== undefined, true);
  const point = lab.peekSnapshot().scene.scene2d.points[created.createdId];
  assert.deepEqual([point.x, point.y], [2, 1]);
});

test('the step size is the host to choose', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const keys = createGeometryKeyboardSession(lab, { step: 0.25, cursor: { x: 1, y: 1 } });
  keys.setTool('point');
  keys.press('ArrowRight');
  const id = keys.press('Enter').createdId;
  const point = lab.peekSnapshot().scene.scene2d.points[id];
  assert.deepEqual([point.x, point.y], [1.25, 1]);
});

test('tab walks the objects in the order the figure was built', () => {
  const { keys } = session();
  const [a, b] = placePoints(keys, [[0, 0], [4, 0]]);
  keys.setTool('segment');
  keys.press('Tab');
  keys.press('Enter');
  keys.press('Tab');
  const segment = keys.press('Enter').createdId;

  keys.setTool('select');
  const walked = [];
  for (let step = 0; step < 3; step += 1) walked.push(keys.press('Tab').state.focusedId);
  assert.deepEqual(walked, [a, b, segment], 'points first, then what was built on them');
  assert.equal(keys.press('Tab').state.focusedId, a, 'and it wraps');
});

test('tabbing brings the cursor with it, so the next thing lands where the reader is', () => {
  const { keys } = session();
  placePoints(keys, [[0, 0], [5, 2]]);
  keys.setTool('select');
  keys.press('End');
  assert.deepEqual(keys.getState().cursor, { x: 5, y: 2 });
});

test('moving the cursor away lets go of the object it was on', () => {
  // A focus left behind while the cursor walks off would make the next Enter
  // act somewhere the reader is not.
  const { keys } = session();
  placePoints(keys, [[0, 0]]);
  keys.setTool('select');
  keys.press('Tab');
  assert.notEqual(keys.getState().focusedId, null);
  keys.press('ArrowRight');
  assert.equal(keys.getState().focusedId, null);
});

/* -------------------------------------------------------------------------- */
/* Every tool a keystroke can finish                                          */
/* -------------------------------------------------------------------------- */

test('every tool that says it can be completed from the keyboard can be', () => {
  // The exit criterion, driven rather than asserted.
  const built = {
    segment: ['A', 'B'],
    circle: ['A', 'B'],
    midpoint: ['A', 'B'],
    angle: ['A', 'B', 'C'],
    bisector: ['A', 'B', 'C'],
  };
  for (const [tool, corners] of Object.entries(built)) {
    const { lab, keys } = session();
    const ids = placePoints(keys, [[0, 0], [4, 0], [2, 3]]);
    const named = { A: ids[0], B: ids[1], C: ids[2] };
    keys.setTool(tool);
    let last;
    for (const corner of corners) {
      assert.ok(focus(keys, named[corner]), `${tool}: could not reach ${corner}`);
      last = keys.press('Enter');
    }
    assert.ok(last.createdId, `${tool} did not build anything: ${last.state.status}`);
    assert.ok(
      lab.peekSnapshot().scene.scene2d.entities[last.createdId]
      || lab.peekSnapshot().scene.scene2d.points[last.createdId],
      `${tool} built something that is not in the figure`,
    );
  }
});

test('a polygon is closed by choosing its first corner again', () => {
  const { lab, keys } = session();
  const ids = placePoints(keys, [[0, 0], [4, 0], [2, 3]]);
  keys.setTool('polygon');
  for (const id of ids) {
    focus(keys, id);
    keys.press('Enter');
  }
  assert.ok(keys.getState().status.includes('first one again'), keys.getState().status);
  focus(keys, ids[0]);
  const created = keys.press('Enter');
  assert.ok(created.createdId);
  assert.deepEqual(lab.peekSnapshot().scene.scene2d.entities[created.createdId].pointIds, ids);
});

test('a line tool takes the line first and the point second, and says so', () => {
  const { lab, keys } = session();
  const ids = placePoints(keys, [[0, 0], [4, 0], [2, 3]]);
  keys.setTool('segment');
  focus(keys, ids[0]);
  keys.press('Enter');
  focus(keys, ids[1]);
  const segment = keys.press('Enter').createdId;

  keys.setTool('perpendicular');
  assert.ok(keys.getState().status.includes('line to work from'), keys.getState().status);
  focus(keys, segment);
  keys.press('Enter');
  assert.ok(keys.getState().status.includes('point to draw through'), keys.getState().status);
  focus(keys, ids[2]);
  const built = keys.press('Enter').createdId;
  assert.equal(lab.peekSnapshot().scene.scene2d.entities[built].construction.kind, 'perpendicularLine');
});

test('the tool keys cover every tool the session says it can complete', () => {
  const reachable = new Set(Object.values(GEOMETRY_TOOL_KEYS));
  for (const tool of KEYBOARD_COMPLETABLE_TOOLS) {
    assert.ok(reachable.has(tool), `${tool} has no key, so nobody can select it`);
  }
});

/* -------------------------------------------------------------------------- */
/* Changing a figure once it is built                                         */
/* -------------------------------------------------------------------------- */

test('shift and an arrow moves a point, which is dragging without a pointer', () => {
  const { lab, keys } = session();
  const [a, b] = placePoints(keys, [[0, 0], [4, 0]]);
  keys.setTool('midpoint');
  focus(keys, a);
  keys.press('Enter');
  focus(keys, b);
  const midpoint = keys.press('Enter').createdId;
  const before = lab.peekSnapshot().scene.scene2d.points[midpoint].x;

  keys.setTool('select');
  focus(keys, b);
  keys.press('ArrowRight', { shift: true });
  keys.press('ArrowRight', { shift: true });

  const points = lab.peekSnapshot().scene.scene2d.points;
  assert.equal(points[b].x, 6, 'B moved');
  assert.equal(points[midpoint].x, before + 1, 'and the midpoint followed it, as it would under a mouse');
});

test('shift and an arrow on something that is not a point says what to do instead', () => {
  const { keys } = session();
  const [a, b] = placePoints(keys, [[0, 0], [4, 0]]);
  keys.setTool('segment');
  focus(keys, a);
  keys.press('Enter');
  focus(keys, b);
  const segment = keys.press('Enter').createdId;

  keys.setTool('select');
  focus(keys, segment);
  const result = keys.press('ArrowUp', { shift: true });
  assert.equal(result.handled, true);
  assert.ok(result.state.status.includes('Select a point first'), result.state.status);
});

test('delete removes what the cursor is on', () => {
  const { lab, keys } = session();
  const [a] = placePoints(keys, [[0, 0], [4, 0]]);
  keys.setTool('select');
  focus(keys, a);
  keys.press('Delete');
  assert.equal(lab.peekSnapshot().scene.scene2d.points[a], undefined);
  assert.equal(keys.getState().focusedId, null);
});

test('the hide tool toggles rather than only hiding', () => {
  const { lab, keys } = session();
  const [a] = placePoints(keys, [[0, 0]]);
  keys.setTool('hide');
  focus(keys, a);
  keys.press('Enter');
  assert.equal(lab.peekSnapshot().scene.scene2d.points[a].hidden, true);
  keys.press('Enter');
  assert.equal(lab.peekSnapshot().scene.scene2d.points[a].hidden, false);
});

/* -------------------------------------------------------------------------- */
/* Being told what is going on                                                */
/* -------------------------------------------------------------------------- */

test('the status says what to do next, which is the part that cannot be seen', () => {
  const { keys } = session();
  placePoints(keys, [[0, 0], [4, 0]]);
  assert.ok(keys.setTool('circle').status.includes('Choose 2 more objects'));
  keys.press('Tab');
  assert.ok(keys.press('Enter').state.status.includes('Choose 1 more object'), 'singular when one is left');
});

test('escape abandons a half-built construction without losing the figure', () => {
  const { lab, keys } = session();
  const ids = placePoints(keys, [[0, 0], [4, 0]]);
  keys.setTool('segment');
  focus(keys, ids[0]);
  keys.press('Enter');
  assert.equal(keys.getState().pending.length, 1);

  keys.press('Escape');
  assert.deepEqual(keys.getState().pending, []);
  assert.equal(Object.keys(lab.peekSnapshot().scene.scene2d.points).length, 2, 'the points are still there');
});

test('choosing the same object twice is refused with a reason, not silently', () => {
  const { keys } = session();
  const ids = placePoints(keys, [[0, 0], [4, 0]]);
  keys.setTool('segment');
  focus(keys, ids[0]);
  keys.press('Enter');
  const again = keys.press('Enter');
  assert.ok(again.state.status.includes('already chosen'), again.state.status);
  assert.equal(again.state.pending.length, 1);
});

test('a construction the geometry refuses is a message, not a thrown error', () => {
  // Two points in the same place cannot define a circle. A student who does
  // that should be told, not have their session end.
  const { keys } = session();
  keys.setTool('point');
  keys.press('Enter');
  const second = keys.press('Enter').createdId;
  keys.setTool('circle');
  keys.press('Home');
  keys.press('Enter');
  focus(keys, second);
  const result = keys.press('Enter');

  assert.equal(result.handled, true);
  assert.equal(result.createdId, undefined);
  assert.ok(result.state.status.length > 0);
  assert.deepEqual(result.state.pending, [], 'and the tool starts over');
});

test('an empty figure says so rather than moving nowhere', () => {
  const { keys } = session();
  keys.setTool('select');
  assert.ok(keys.press('Tab').state.status.includes('empty'));
});

/* -------------------------------------------------------------------------- */
/* Staying out of the host's way                                              */
/* -------------------------------------------------------------------------- */

test('a key with a command modifier is left for the host', () => {
  // Undo, save and the browser's own shortcuts are not this session's to take.
  const { keys } = session();
  for (const modifiers of [{ ctrl: true }, { meta: true }]) {
    assert.equal(keys.press('z', modifiers).handled, false);
    assert.equal(keys.press('ArrowRight', modifiers).handled, false);
  }
});

test('a key the session has no use for is reported rather than swallowed', () => {
  const { keys } = session();
  assert.equal(keys.press('F5').handled, false);
  assert.equal(keys.press('/').handled, false);
  assert.equal(keys.press('p').handled, true, 'but a tool key is taken');
});

test('a tool key works in either case', () => {
  const { keys } = session();
  assert.equal(keys.press('P').state.tool, 'point');
  assert.equal(keys.press('s').state.tool, 'segment');
});
