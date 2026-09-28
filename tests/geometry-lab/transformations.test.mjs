/**
 * Plane transformations (plan task 3.1).
 *
 * <p>`scale`, `rotate`, `stamp` and `cut` have been declared tools since the
 * model was written with nothing behind any of them, and the exercise bank asks
 * students to mirror a figure by copying it across by hand.
 *
 * <p>The point of doing this on a screen is that an image is a *construction*
 * rather than a copy. Every test below therefore drags something afterwards:
 * the original, so the image follows it, and - the part that matters - the
 * mirror or the centre, so the image sweeps around as the transformation
 * itself changes. A transformation that only ran once would pass none of the
 * second halves.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeometryLab } from '../../dist/geometry-lab/index.js';

const round = (value) => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
};
const at = (lab, id) => {
  const point = lab.peekSnapshot().scene.scene2d.points[id];
  return [round(point.x), round(point.y)];
};
const vertices = (lab, entityId) => {
  const scene = lab.peekSnapshot().scene.scene2d;
  return scene.entities[entityId].pointIds.map(id => [round(scene.points[id].x), round(scene.points[id].y)]);
};

/** A triangle above the x axis, with the x axis available as a mirror. */
function figure() {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: 1, y: 2 });
  const b = lab.addPoint2D({ x: 4, y: 2 });
  const c = lab.addPoint2D({ x: 1, y: 5 });
  const origin = lab.addPoint2D({ x: 0, y: 0 });
  const alongX = lab.addPoint2D({ x: 1, y: 0 });
  return {
    lab, a, b, c, origin, alongX,
    triangle: lab.addPolygon2D([a, b, c]),
    mirror: lab.addLine2D(origin, alongX),
  };
}

/* -------------------------------------------------------------------------- */
/* Each transformation                                                        */
/* -------------------------------------------------------------------------- */

test('reflecting a triangle in the x axis negates its y coordinates', () => {
  const { lab, triangle, mirror } = figure();
  const image = lab.reflectInLine2D(triangle, mirror);
  assert.deepEqual(vertices(lab, image), [[1, -2], [4, -2], [1, -5]]);
});

test('rotating a point about a centre', () => {
  const { lab, origin } = figure();
  const point = lab.addPoint2D({ x: 3, y: 0 });
  assert.deepEqual(at(lab, lab.rotate2D(point, origin, 90)), [0, 3]);
  assert.deepEqual(at(lab, lab.rotate2D(point, origin, 180)), [-3, 0]);
  assert.deepEqual(at(lab, lab.rotate2D(point, origin, -90)), [0, -3]);
});

test('reflecting in a point is a half turn', () => {
  const { lab, origin } = figure();
  const point = lab.addPoint2D({ x: 3, y: 4 });
  assert.deepEqual(at(lab, lab.reflectInPoint2D(point, origin)), [-3, -4]);
});

test('dilating scales the distance from the centre', () => {
  const { lab, origin } = figure();
  const point = lab.addPoint2D({ x: 3, y: -1 });
  assert.deepEqual(at(lab, lab.dilate2D(point, origin, 2)), [6, -2]);
  assert.deepEqual(at(lab, lab.dilate2D(point, origin, 0.5)), [1.5, -0.5]);
  assert.deepEqual(at(lab, lab.dilate2D(point, origin, -1)), [-3, 1], 'a negative factor turns it through the centre');
});

test('translating by a fixed offset and by a vector', () => {
  const { lab } = figure();
  const point = lab.addPoint2D({ x: 3, y: 0 });
  assert.deepEqual(at(lab, lab.translateBy2D(point, 5, -1)), [8, -1]);

  const from = lab.addPoint2D({ x: 0, y: 0 });
  const to = lab.addPoint2D({ x: 2, y: 3 });
  assert.deepEqual(at(lab, lab.translate2D(point, lab.addVector2D(from, to))), [5, 3]);
});

test('a segment transforms into a segment', () => {
  const { lab, a, b, mirror } = figure();
  const image = lab.reflectInLine2D(lab.addSegment2D(a, b), mirror);
  const entity = lab.peekSnapshot().scene.scene2d.entities[image];
  assert.equal(entity.kind, 'segment');
  assert.deepEqual(vertices(lab, image), [[1, -2], [4, -2]]);
});

/* -------------------------------------------------------------------------- */
/* Images are constructions, not copies                                       */
/* -------------------------------------------------------------------------- */

test('the image follows the original', () => {
  const { lab, a, triangle, mirror } = figure();
  const image = lab.reflectInLine2D(triangle, mirror);

  lab.applyDelta({ op: 'updatePoint', id: a, changes: { x: 0, y: 7 } });
  assert.deepEqual(vertices(lab, image)[0], [0, -7], 'moving a vertex moved its image');
});

test('the image follows the mirror', () => {
  // The part that makes this dynamic geometry rather than a one-off edit.
  const { lab, triangle, mirror, alongX } = figure();
  const image = lab.reflectInLine2D(triangle, mirror);
  assert.deepEqual(vertices(lab, image), [[1, -2], [4, -2], [1, -5]]);

  // Tilt the mirror to y = x: reflection now swaps the coordinates.
  lab.applyDelta({ op: 'updatePoint', id: alongX, changes: { x: 1, y: 1 } });
  assert.deepEqual(vertices(lab, image), [[2, 1], [2, 4], [5, 1]]);
});

test('a rotated image follows its centre', () => {
  const { lab, origin } = figure();
  const point = lab.addPoint2D({ x: 3, y: 0 });
  const image = lab.rotate2D(point, origin, 90);
  assert.deepEqual(at(lab, image), [0, 3]);

  lab.applyDelta({ op: 'updatePoint', id: origin, changes: { x: 3, y: 0 } });
  assert.deepEqual(at(lab, image), [3, 0], 'the centre reached the point, so the image did too');
});

test('a translated image follows the vector that moves it', () => {
  const { lab } = figure();
  const point = lab.addPoint2D({ x: 3, y: 0 });
  const from = lab.addPoint2D({ x: 0, y: 0 });
  const to = lab.addPoint2D({ x: 2, y: 3 });
  const image = lab.translate2D(point, lab.addVector2D(from, to));
  assert.deepEqual(at(lab, image), [5, 3]);

  lab.applyDelta({ op: 'updatePoint', id: to, changes: { x: 10, y: 10 } });
  assert.deepEqual(at(lab, image), [13, 10]);
});

test('an image of an image follows both levels', () => {
  const { lab, origin } = figure();
  const point = lab.addPoint2D({ x: 3, y: 0 });
  const once = lab.rotate2D(point, origin, 90);
  const twice = lab.rotate2D(once, origin, 90);
  assert.deepEqual(at(lab, twice), [-3, 0], 'two quarter turns');

  lab.applyDelta({ op: 'updatePoint', id: point, changes: { x: 5, y: 0 } });
  assert.deepEqual(at(lab, once), [0, 5]);
  assert.deepEqual(at(lab, twice), [-5, 0], 'the chain settled in one commit');
});

test('the image records how it was made', () => {
  const { lab, origin } = figure();
  const point = lab.addPoint2D({ x: 3, y: 0 });
  const image = lab.rotate2D(point, origin, 90);
  assert.deepEqual(lab.peekSnapshot().scene.scene2d.points[image].construction, {
    kind: 'transformedPoint',
    sourceId: point,
    transform: { kind: 'rotate', centerPointId: origin, degrees: 90 },
  });
});

test('a transformation survives a round trip through JSON', () => {
  const { lab, triangle, mirror, alongX } = figure();
  const image = lab.reflectInLine2D(triangle, mirror);
  const saved = JSON.parse(JSON.stringify(lab.getSnapshot()));

  const reopened = createGeometryLab();
  reopened.loadSnapshot(saved);
  reopened.applyDelta({ op: 'updatePoint', id: alongX, changes: { x: 1, y: 1 } });
  assert.deepEqual(vertices(reopened, image), [[2, 1], [2, 4], [5, 1]], 'still live after reloading');
});

/* -------------------------------------------------------------------------- */
/* Refusals and cascade                                                       */
/* -------------------------------------------------------------------------- */

test('transforming something that does not exist is refused', () => {
  const { lab, origin, triangle } = figure();
  assert.throws(
    () => lab.rotate2D('ghost', origin, 90),
    error => error.code === 'invalid_transform_target',
  );
  assert.throws(
    () => lab.rotate2D(triangle, 'ghost', 90),
    error => error.code === 'invalid_transform_reference',
  );
});

test('a circle needs its own rule and is refused rather than mangled', () => {
  const { lab, origin, mirror } = figure();
  const rim = lab.addPoint2D({ x: 2, y: 0 });
  const circle = lab.addCircle2D(origin, rim);
  assert.throws(
    () => lab.reflectInLine2D(circle, mirror),
    error => error.code === 'invalid_transform',
    'a radius is not a vertex list, so mapping vertices would silently lose it',
  );
});

test('a zero dilation factor is refused', () => {
  const { lab, origin } = figure();
  const point = lab.addPoint2D({ x: 3, y: 0 });
  assert.throws(() => lab.dilate2D(point, origin, 0), error => error.code !== undefined);
});

test('collapsing the mirror to a point breaks the reflection', () => {
  const { lab, triangle, mirror, alongX, origin } = figure();
  lab.reflectInLine2D(triangle, mirror);
  assert.throws(
    () => lab.applyDelta({ op: 'updatePoint', id: alongX, changes: { x: 0, y: 0 } }),
    error => error.code === 'invalid_delta_result',
    'a mirror with coincident points has no direction to reflect across',
  );
  assert.deepEqual(at(lab, origin), [0, 0], 'and the rejected edit left the figure alone');
});

test('deleting the mirror takes the image with it', () => {
  const { lab, triangle, mirror } = figure();
  const image = lab.reflectInLine2D(triangle, mirror);
  const imagePoints = lab.peekSnapshot().scene.scene2d.entities[image].pointIds;

  lab.remove(mirror);

  const scene = lab.peekSnapshot().scene.scene2d;
  assert.equal(scene.entities[image], undefined, 'the image cannot outlive its mirror');
  for (const id of imagePoints) {
    assert.equal(scene.points[id], undefined, `image vertex ${id} outlived the mirror`);
  }
  assert.ok(scene.entities[triangle], 'but the original is not derived from the mirror');
});

test('deleting a source vertex takes both triangles, and leaves the mirror', () => {
  const { lab, a, triangle, mirror } = figure();
  const image = lab.reflectInLine2D(triangle, mirror);
  const imageVertices = lab.peekSnapshot().scene.scene2d.entities[image].pointIds.slice();

  lab.remove(a);

  const scene = lab.peekSnapshot().scene.scene2d;
  assert.equal(scene.entities[triangle], undefined, 'the original lost a vertex');
  assert.equal(scene.entities[image], undefined, 'and so did its image');
  assert.equal(scene.points[imageVertices[0]], undefined, "A's image went with A");
  assert.ok(scene.entities[mirror], 'the mirror is not derived from the triangle');
});

test('deleting only the polygon leaves the image standing on its vertices', () => {
  // The image is built from the *points*, not from the polygon joining them, so
  // removing the polygon alone leaves every image vertex with a live source.
  // Worth pinning down, because the opposite would also be defensible and this
  // is the behaviour the dependency edges actually describe.
  const { lab, triangle, mirror } = figure();
  const image = lab.reflectInLine2D(triangle, mirror);

  lab.remove(triangle);

  const scene = lab.peekSnapshot().scene.scene2d;
  assert.equal(scene.entities[triangle], undefined);
  assert.ok(scene.entities[image], 'the image still has all three sources');
  assert.deepEqual(vertices(lab, image), [[1, -2], [4, -2], [1, -5]], 'and still tracks them');
});
