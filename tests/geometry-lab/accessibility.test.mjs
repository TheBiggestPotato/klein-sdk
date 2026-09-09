/**
 * What the figure says to somebody who cannot see it (plan tasks 5.1 and 5.2).
 *
 * <p>Before this the whole drawing was one label - `aria-label="Klein 3D
 * calculator scene"` - and the text export was a census: `points: 7,
 * entities: 4`. Both tell a student how much they are missing and nothing else.
 *
 * <p>Almost nothing here is new geometry. The steps come from the construction
 * protocol and the facts from the invariant reporter; what these tests cover is
 * that they reach a reader in English, that the SVG carries them per object
 * rather than once for the picture, and that the file stays valid while doing
 * it.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGeometryLab,
  describeGeometryInvariant,
  describeGeometryLabFigure,
  geometryLabFigureSummary,
} from '../../dist/geometry-lab/index.js';

/** A perpendicular bisector: a construction with a helper point inside it. */
function bisected() {
  const lab = createGeometryLab({ initialView: '2d' });
  const a = lab.addPoint2D({ x: -4, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 4, y: 0, label: 'B' });
  const ab = lab.addSegment2D(a, b);
  const m = lab.addMidpoint2D(a, b, { label: 'M' });
  lab.addPerpendicularLine2D(ab, m);
  return { lab, a, b, ab, m };
}

const svgOf = async (lab, options = {}) =>
  (await lab.export({ format: 'svg', width: 240, height: 180, ...options })).data;

/* -------------------------------------------------------------------------- */
/* The figure in words                                                        */
/* -------------------------------------------------------------------------- */

test('the text export describes the figure instead of counting it', async () => {
  const { lab } = bisected();
  const text = (await lab.export({ format: 'text' })).data;

  assert.ok(text.includes('Construct M, the midpoint of A and B.'), 'how it was built');
  assert.ok(text.includes('M is the midpoint of AB.'), 'and what that establishes');
  assert.ok(!text.includes('points: '), 'the census is gone');
});

test('the description has the four things a reader needs, in order', () => {
  const { lab, ab } = bisected();
  lab.addLengthMeasurement2D(ab, 'AB');
  const text = lab.describe();

  const order = ['A figure with', 'How it was built:', 'What it establishes:', 'Measurements:']
    .map(heading => text.indexOf(heading));
  assert.ok(order.every(index => index >= 0), `a section is missing from:\n${text}`);
  assert.deepEqual(order.slice().sort((left, right) => left - right), order, 'and they are in that order');
  assert.ok(text.includes('AB: 8 u'));
});

test('every fact the instrument can state has an English sentence', () => {
  // A vocabulary this file has not been taught still reaches the reader, so
  // the guard is that nothing comes back looking like an id.
  const kinds = [
    'equal-segments:AB,CD', 'parallel:AB,CD', 'perpendicular:AB,CD', 'right-angle:ABC',
    'collinear:A,B,C', 'midpoint:M,AB', 'point-on-circle:P,circle(O)', 'concyclic:A,B,C,D',
    'point-on:P,AB', 'tangent:AB,circle(O)', 'equal-angles:ABC,DEF', 'congruent:ABC,DEF',
    'similar:ABC,DEF', 'equal-area:ABCD,EFG', 'point-on-plane:P,plane(base)',
    'coplanar:A,B,C,D', 'parallel-planes:plane(a),plane(b)',
    'perpendicular-planes:plane(a),plane(b)', 'perpendicular-to-plane:AB,plane(a)',
    'parallel-to-plane:AB,plane(a)', 'skew:AB,CD',
  ];
  for (const fact of kinds) {
    const sentence = describeGeometryInvariant(fact);
    assert.ok(sentence.endsWith('.'), `${fact} is not a sentence: ${sentence}`);
    assert.ok(!sentence.startsWith(fact.slice(0, fact.indexOf(':') + 1)), `${fact} was not translated: ${sentence}`);
    assert.ok(!sentence.includes('('), `${fact} left a wrapper in: ${sentence}`);
  }
});

test('a vocabulary the describer does not know is passed through, not mangled', () => {
  assert.equal(describeGeometryInvariant('inscribed:cube,sphere'), 'inscribed:cube,sphere');
});

test('the summary counts what is drawn, not what is stored', () => {
  const { lab } = bisected();
  // Four objects are visible; the constructed line's helper point is not one of
  // them, and neither is a point the student chose to hide.
  assert.equal(geometryLabFigureSummary(lab.getSnapshot()), 'A figure with 1 line, 3 points and 1 segment in the plane.');

  lab.addPoint2D({ x: 9, y: 9, label: 'Z', hidden: true });
  assert.equal(
    geometryLabFigureSummary(lab.getSnapshot()),
    'A figure with 1 line, 3 points and 1 segment in the plane.',
    'a hidden point is not something to tell a reader about',
  );
});

test('an empty figure says so', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  assert.equal(geometryLabFigureSummary(lab.getSnapshot()), 'An empty figure.');
  assert.ok(lab.describe().includes('An empty figure.'));
});

test('a description says when it is partial rather than looking complete', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  for (let index = 0; index < 200; index += 1) {
    lab.addPoint2D({ x: index * 3, y: 0, label: `P${index}` });
  }
  assert.ok(lab.describe().includes('the list of facts above is partial'));
});

test('a figure in space is described too', () => {
  const lab = createGeometryLab();
  lab.addPolyhedron('cube', { x: 0, y: 0, z: 0 }, 2);
  const text = lab.describe();
  assert.ok(text.includes('1 cube in space'), text.split('\n')[2]);
  assert.ok(text.includes('Add cube 1.'));
});

/* -------------------------------------------------------------------------- */
/* The drawing, per object                                                    */
/* -------------------------------------------------------------------------- */

test('each drawn object carries its own name and how it was made', async () => {
  const svg = await svgOf(bisected().lab);
  assert.ok(svg.includes('<title id="'), 'objects are titled');
  assert.ok(svg.includes('>Point A</title>'));
  assert.ok(svg.includes('>Segment AB</title>'));
  assert.ok(svg.includes('>Construct M, the midpoint of A and B.</desc>'));
  assert.ok(svg.includes('role="graphics-symbol"'));
});

test('the root stops claiming to be a leaf once it has structure inside it', async () => {
  const svg = await svgOf(bisected().lab);
  assert.ok(svg.includes('role="graphics-document"'), 'an image has no parts');
  assert.ok(svg.includes('<desc id="klein-figure-desc">A figure with'), 'and it summarises itself');
  assert.ok(svg.includes('aria-label="Klein 2D geometry scene"'), 'the old label stays for anything older');
});

test('no element id is used twice, however many pieces an object is drawn in', async () => {
  // A curve is a run of segments and a solid a sheaf of faces, and they are
  // depth-sorted, so an object's pieces are not next to each other. Repeating
  // its id on each piece would make the file invalid rather than accessible.
  const lab = createGeometryLab({ initialView: '2d' });
  const centre = lab.addPoint2D({ x: 0, y: 0, label: 'O' });
  const rim = lab.addPoint2D({ x: 5, y: 0, label: 'P' });
  lab.addCircle2D(centre, rim);
  lab.addPolygon2D([centre, rim, lab.addPoint2D({ x: 0, y: 5, label: 'Q' })]);

  const svg = await svgOf(lab);
  const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map(match => match[1]);
  assert.ok(ids.length > 4);
  assert.equal(new Set(ids).size, ids.length, 'ids repeat');
});

test('every aria-labelledby points at an id that exists', async () => {
  const lab = createGeometryLab();
  lab.addPolyhedron('cube', { x: 0, y: 0, z: 0 }, 2);
  lab.addPoint3D({ x: 4, y: 0, z: 0, label: 'A' });
  const svg = await svgOf(lab);

  const ids = new Set([...svg.matchAll(/ id="([^"]+)"/g)].map(match => match[1]));
  for (const match of svg.matchAll(/aria-labelledby="([^"]+)"/g)) {
    for (const reference of match[1].split(' ')) {
      assert.ok(ids.has(reference), `${reference} is referenced and never defined`);
    }
  }
});

test('an object keeps its element ids when an unrelated object is added', async () => {
  // Otherwise a diff of two exports is a diff of everything, and nobody reads
  // one of those.
  const { lab } = bisected();
  const before = await svgOf(lab);
  const stem = /id="(k[a-z0-9]+)t">Point A</.exec(before);
  assert.ok(stem, 'A has a stem');

  lab.addPoint2D({ x: 9, y: 9, label: 'Z' });
  const after = await svgOf(lab);
  assert.ok(after.includes(`id="${stem[1]}t">Point A<`), 'A was renumbered by something else arriving');
});

test('descriptions can be turned off, and then the root is a picture again', async () => {
  const svg = await svgOf(bisected().lab, { describeObjects: false });
  assert.ok(svg.includes('role="img"'));
  assert.ok(!svg.includes('<title'));
  assert.ok(!svg.includes('graphics-symbol'));
});

/* -------------------------------------------------------------------------- */
/* Reaching it with a keyboard                                                */
/* -------------------------------------------------------------------------- */

test('an exported figure adds no tab stops to the page it lands in', async () => {
  // A hundred-object figure embedded in a document would otherwise be a hundred
  // stops to tab past before reaching anything else on the page.
  const svg = await svgOf(bisected().lab);
  assert.ok(!svg.includes('tabindex'));
});

test('a figure asked to be focusable is reachable, one stop per object', async () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const centre = lab.addPoint2D({ x: 0, y: 0, label: 'O' });
  const rim = lab.addPoint2D({ x: 5, y: 0, label: 'P' });
  // A circle is drawn as sixty-four line segments and must still be one stop.
  lab.addCircle2D(centre, rim);

  const svg = await svgOf(lab, { focusableObjects: true });
  const stops = [...svg.matchAll(/tabindex="0"/g)].length;
  // The figure's own title is `klein-figure-title`, which this does not match.
  const objects = [...svg.matchAll(/<title id="k[a-z0-9]+t">/g)].length;
  assert.equal(stops, objects, 'an object is one thing to arrive at, not one per line drawn');
  assert.equal(stops, 3, 'two points and a circle');
});

test('the focus order is the order the figure is painted in, and is stable', async () => {
  // Tab order in SVG is document order, and document order is paint order. The
  // only way to override it is a positive `tabindex`, which would hijack the
  // tab order of the whole page the figure lands in - so the order is back to
  // front, which is deterministic, rather than the order the figure was built.
  const { lab } = bisected();
  const reached = async () => {
    const svg = await svgOf(lab, { focusableObjects: true });
    return [...svg.matchAll(/tabindex="0"><title id="k[a-z0-9]+t">([^<]+)</g)].map(match => match[1]);
  };
  const order = await reached();
  assert.deepEqual(order, ['Line 1', 'Segment AB', 'Point A', 'Point B', 'Midpoint M']);
  assert.deepEqual(await reached(), order, 'and the same figure gives the same order');
});

test('focus is off unless descriptions are on, since there would be nothing to announce', async () => {
  const svg = await svgOf(bisected().lab, { describeObjects: false, focusableObjects: true });
  assert.ok(!svg.includes('tabindex'));
});
