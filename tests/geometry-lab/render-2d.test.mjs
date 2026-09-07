/**
 * 2D rendering and export (plan task 2.3).
 *
 * <p>The Lab has always carried a `scene2d`, and since task 2.2 a full API for
 * building one - but the only renderer was the 3D one, so a 2D figure could be
 * constructed and never looked at. `export({ format: 'svg' })` on a 2D scene
 * returned the 3D renderer's picture of an empty 3D scene: a blank image of the
 * wrong thing.
 *
 * <p>Which renderer runs is decided by {@link rendersTwoDimensionalScene}, and
 * the subtlety worth testing is that `activeView` defaults to `'2d'`. Routing on
 * the view alone would have turned every existing 3D export blank, so the view
 * has to be corroborated by the scene actually holding 2D content.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeometryLab, renderGeometryLabSvg2D } from '../../dist/geometry-lab/index.js';

/** Triangle ABC at a known zoom, so screen coordinates are predictable. */
function figure(view = { x: 0, y: 0, zoom: 40 }) {
  const lab = createGeometryLab({ initialView: '2d' });
  lab.applyDelta({ op: 'setAppState', changes: { view2d: view } });
  const a = lab.addPoint2D({ x: -4, y: -2, label: 'A' });
  const b = lab.addPoint2D({ x: 4, y: -2, label: 'B' });
  const c = lab.addPoint2D({ x: 1, y: 3, label: 'C' });
  return { lab, a, b, c };
}

const svg = (lab, options = {}) => renderGeometryLabSvg2D(lab.peekSnapshot(), { format: 'svg', width: 640, height: 480, ...options });

/* -------------------------------------------------------------------------- */
/* It draws, and it draws the right thing                                     */
/* -------------------------------------------------------------------------- */

test('a 2D scene renders as SVG rather than nothing', () => {
  const { lab, a, b, c } = figure();
  lab.addPolygon2D([a, b, c]);
  const output = svg(lab);
  assert.ok(output.startsWith('<svg'));
  assert.ok(output.includes('Klein 2D geometry scene'), 'and says which scene it is');
  assert.ok(output.includes('<polygon'), 'the polygon is drawn');
});

test('world coordinates land where the view puts them', () => {
  const { lab, a, b, c } = figure();
  lab.addPolygon2D([a, b, c]);
  // Centre of a 640x480 view is (320, 240); y grows upward in the scene and
  // downward in SVG, so A(-4,-2) is (320 - 160, 240 + 80).
  assert.ok(svg(lab).includes('points="160,320 480,320 360,120"'));
});

test('panning and zooming move the figure', () => {
  const { lab, a, b, c } = figure({ x: 0, y: 0, zoom: 20 });
  lab.addPolygon2D([a, b, c]);
  assert.ok(svg(lab).includes('points="240,280 400,280 340,180"'), 'half the zoom, half the offsets');

  lab.applyDelta({ op: 'setAppState', changes: { view2d: { x: -4, y: -2, zoom: 40 } } });
  assert.ok(svg(lab).includes('320,240'), 'panning to A puts A at the centre');
});

test('every entity kind the 2D scene can hold is drawn', () => {
  const { lab, a, b, c } = figure();
  lab.addPolygon2D([a, b, c]);
  lab.addSegment2D(a, c);
  lab.addLine2D(a, b);
  lab.addRay2D(a, c);
  lab.addVector2D(b, c);
  lab.addCircleThroughPoints2D([a, b, c]);
  lab.addAngle2D([a, c, b]);
  const output = svg(lab);
  assert.ok(output.includes('<polygon'), 'polygon');
  // Circles, arcs and angle marks are all sampled into polylines, so the count
  // rises with each of them rather than each needing its own element type.
  assert.ok((output.match(/<polyline/g) ?? []).length >= 6, 'lines, curves and marks');
});

test('points are drawn with their labels', () => {
  const { lab } = figure();
  const output = svg(lab);
  for (const label of ['A', 'B', 'C']) {
    assert.ok(output.includes(`>${label}<`), `label ${label} is drawn`);
  }
  assert.equal((output.match(/<circle/g) ?? []).length, 3, 'one dot per point');
});

test('hidden objects are not drawn', () => {
  const { lab, a, b, c } = figure();
  const ab = lab.addLine2D(a, b);
  // A constructed perpendicular carries a hidden helper point, which must not
  // appear as a fourth dot.
  lab.addPerpendicularLine2D(ab, c);
  assert.equal((svg(lab).match(/<circle/g) ?? []).length, 3, 'the direction helper stays out of the picture');
});

test('an infinite line is clipped to the viewport', () => {
  const { lab, a, b } = figure();
  lab.addLine2D(a, b);
  const output = svg(lab);
  for (const [, x, y] of output.matchAll(/polyline points="(-?[\d.]+),(-?[\d.]+)/g)) {
    assert.ok(Number(x) >= -1 && Number(x) <= 641, `x ${x} is inside the viewBox`);
    assert.ok(Number(y) >= -1 && Number(y) <= 481, `y ${y} is inside the viewBox`);
  }
});

test('a ray starts at its own first point', () => {
  const { lab, a, c } = figure();
  lab.addRay2D(a, c);
  // A is at (160, 320); the ray is clipped only at the far end.
  assert.ok(svg(lab).includes('polyline points="160,320'));
});

test('the background is honoured, transparent included', () => {
  const { lab } = figure();
  assert.ok(svg(lab, { background: '#eeeeee' }).includes('fill="#eeeeee"'));
  assert.ok(svg(lab, { background: 'transparent' }).includes('fill="transparent"'));
});

/* -------------------------------------------------------------------------- */
/* Which renderer runs                                                        */
/* -------------------------------------------------------------------------- */

test('export renders the 2D scene when the Lab holds one', async () => {
  const { lab, a, b, c } = figure();
  lab.addPolygon2D([a, b, c]);
  const result = await lab.export({ format: 'svg', width: 320, height: 240 });
  assert.equal(result.format, 'svg');
  assert.ok(result.data.includes('Klein 2D geometry scene'));
});

test('a 3D scene still exports as 3D, even though activeView defaults to 2d', async () => {
  // The regression this guards: activeView is '2d' out of the box, so routing
  // on it alone turned every 3D export into a blank 2D picture.
  const lab = createGeometryLab();
  assert.equal(lab.peekSnapshot().appState.activeView, '2d');
  lab.addPoint3D({ x: 0, y: 0, z: 0 });
  lab.addPolyhedron('cube', { x: 0, y: 0, z: 0 }, 2);

  const result = await lab.export({ format: 'svg' });
  assert.ok(result.data.includes('Klein 3D calculator scene'), 'a scene with no 2D content is still 3D');
});

test('an explicit 3D view wins over 2D content', async () => {
  const { lab, a, b, c } = figure();
  lab.addPolygon2D([a, b, c]);
  lab.addPolyhedron('cube', { x: 0, y: 0, z: 0 }, 2);
  lab.applyDelta({ op: 'setAppState', changes: { activeView: '3d' } });

  const result = await lab.export({ format: 'svg' });
  assert.ok(result.data.includes('Klein 3D calculator scene'));
});

test('an empty 2D scene does not claim the renderer', async () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const result = await lab.export({ format: 'svg' });
  assert.ok(result.data.includes('Klein 3D calculator scene'), 'nothing 2D to draw means nothing changed');
});

/* -------------------------------------------------------------------------- */
/* Bounds                                                                     */
/* -------------------------------------------------------------------------- */

test('degenerate geometry is skipped rather than emitted as NaN', () => {
  const { lab, a } = figure();
  // A line through two coincident points has no direction to draw along.
  lab.applyDelta({
    op: 'addEntity2D',
    entity: { id: 'degenerate', kind: 'segment', pointIds: [a, a] },
  });
  const output = svg(lab);
  assert.equal(output.includes('NaN'), false);
  assert.equal(output.includes('Infinity'), false);
});

test('the export byte budget is enforced', () => {
  const { lab, a, b, c } = figure();
  lab.addPolygon2D([a, b, c]);
  assert.throws(
    () => renderGeometryLabSvg2D(lab.peekSnapshot(), { format: 'svg' }, { maxExportBytes: 64 }),
    error => error.code === 'geometry_lab_export_too_complex',
  );
});
