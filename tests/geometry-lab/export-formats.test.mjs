/**
 * PDF, PNG and LaTeX (plan task 5.4).
 *
 * <p>All three are the *same* figure written three ways, which is the point of
 * the refactor underneath them: the renderers reduce a scene to four shapes -
 * filled path, open path, disc, text - and each format is a serializer over
 * those. A PDF drawn from its own reading of the scene would drift from the SVG
 * the first time either changed, and "the print does not match the screen" is a
 * bug nobody can reproduce from a description. So the test that matters most
 * here compares coordinates between two of them.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGeometryLab,
  renderGeometryLabLatex,
  renderGeometryLabPdf,
  renderGeometryLabSvg2D,
} from '../../dist/geometry-lab/index.js';

const SIZE = { width: 300, height: 220 };

function triangle() {
  const lab = createGeometryLab({ initialView: '2d' });
  lab.applyDelta({ op: 'setAppState', changes: { view2d: { x: 0, y: 0, zoom: 20 } } });
  const a = lab.addPoint2D({ x: -4, y: 0, label: 'A' });
  const b = lab.addPoint2D({ x: 4, y: 0, label: 'B' });
  const c = lab.addPoint2D({ x: 0, y: 5, label: 'C' });
  lab.addPolygon2D([a, b, c]);
  const ab = lab.addSegment2D(a, b);
  return { lab, a, b, c, ab };
}

/** Every path in an SVG, as arrays of screen coordinates. */
const svgPaths = (svg) => [...svg.matchAll(/points="([^"]+)"/g)]
  .map(match => match[1].split(' ').map(pair => pair.split(',').map(Number)));

/** Every path in a PDF, flipped back into screen coordinates. */
function pdfPaths(pdf, height) {
  const paths = [];
  let current = null;
  for (const line of pdf.split('\n')) {
    const move = /^([-\d.]+) ([-\d.]+) m$/.exec(line);
    const draw = /^([-\d.]+) ([-\d.]+) l$/.exec(line);
    if (move) { current = [[Number(move[1]), height - Number(move[2])]]; paths.push(current); }
    else if (draw && current) current.push([Number(draw[1]), height - Number(draw[2])]);
    else if (!draw) current = null;
  }
  return paths;
}

/* -------------------------------------------------------------------------- */
/* One figure, three files                                                    */
/* -------------------------------------------------------------------------- */

test('the PDF draws the figure at the same coordinates as the SVG', () => {
  const { lab } = triangle();
  const snapshot = lab.getSnapshot();
  const drawn = svgPaths(renderGeometryLabSvg2D(snapshot, { format: 'svg', ...SIZE }, {}));
  const printed = pdfPaths(renderGeometryLabPdf(snapshot, SIZE, {}), SIZE.height);

  assert.ok(drawn.length >= 2, 'the figure has paths to compare');
  for (const path of drawn) {
    const match = printed.find(candidate => candidate.length === path.length
      && candidate.every((point, index) => Math.abs(point[0] - path[index][0]) < 0.01
        && Math.abs(point[1] - path[index][1]) < 0.01));
    assert.ok(match, `no PDF path matches the SVG path starting at ${path[0]}`);
  }
});

test('the LaTeX draws the figure at the same coordinates too', () => {
  const { lab } = triangle();
  const snapshot = lab.getSnapshot();
  const drawn = svgPaths(renderGeometryLabSvg2D(snapshot, { format: 'svg', ...SIZE }, {}));
  const latex = renderGeometryLabLatex(snapshot, SIZE, {});

  for (const path of drawn) {
    const written = path.map(([x, y]) => `(${x}pt, ${y}pt)`).join(' -- ');
    assert.ok(latex.includes(written), `the TikZ picture is missing the path at ${path[0]}`);
  }
});

/* -------------------------------------------------------------------------- */
/* A file the rest of the world can open                                      */
/* -------------------------------------------------------------------------- */

test('the PDF is a structurally complete document', () => {
  const pdf = renderGeometryLabPdf(triangle().lab.getSnapshot(), SIZE, {});
  assert.ok(pdf.startsWith('%PDF-1.4'), 'a header');
  assert.ok(pdf.trimEnd().endsWith('%%EOF'), 'and an end');
  assert.ok(pdf.includes('/Type /Catalog'), 'a catalogue');
  assert.ok(pdf.includes(`/MediaBox [0 0 ${SIZE.width} ${SIZE.height}]`), 'at the size asked for');
  assert.ok(pdf.includes('stream\n') && pdf.includes('endstream'), 'a content stream');

  // The cross-reference table is what a reader uses to find the objects, and a
  // wrong offset makes the file unopenable rather than merely wrong.
  const xref = pdf.indexOf('xref\n');
  assert.ok(xref > 0);
  const startxref = Number(/startxref\n(\d+)/.exec(pdf)[1]);
  assert.equal(startxref, xref, 'startxref points at the table');
  const offsets = [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map(match => Number(match[1]));
  assert.equal(offsets.length, 5, 'one per object');
  for (const [index, offset] of offsets.entries()) {
    assert.ok(pdf.startsWith(`${index + 1} 0 obj`, offset), `object ${index + 1} is not where the table says`);
  }
});

test('the PDF fills a translucent polygon with a flat colour, since the picture is the same', () => {
  // Real transparency needs a graphics-state dictionary per distinct alpha,
  // which is a lot of file for one thing. Mixing against the background gives
  // the same picture wherever the shape is not overlapping something else.
  const pdf = renderGeometryLabPdf(triangle().lab.getSnapshot(), SIZE, {});
  assert.ok(/[\d.]+ [\d.]+ [\d.]+ rg/.test(pdf), 'a fill colour is set');
  assert.ok(!pdf.includes('/GS'), 'and no graphics-state dictionary is needed');
});

test('a point is drawn as a disc rather than a square', () => {
  const pdf = renderGeometryLabPdf(triangle().lab.getSnapshot(), SIZE, {});
  // Four Bezier arcs. PDF has no circle operator, and a square where the
  // screen shows a disc would be a different drawing.
  assert.ok([...pdf.matchAll(/^[-\d. ]+ c$/gm)].length >= 4);
});

test('an empty figure still produces an openable file', () => {
  const lab = createGeometryLab({ initialView: '2d' });
  const pdf = renderGeometryLabPdf(lab.getSnapshot(), SIZE, {});
  assert.ok(pdf.startsWith('%PDF-1.4'));
  assert.ok(pdf.trimEnd().endsWith('%%EOF'));
});

test('a 3D figure prints as well as a plane one', () => {
  const lab = createGeometryLab();
  lab.addPolyhedron('cube', { x: 0, y: 0, z: 0 }, 2);
  const pdf = renderGeometryLabPdf(lab.getSnapshot(), SIZE, {});
  assert.ok(pdf.includes(' m\n'), 'the solid is drawn');
  assert.ok(pdf.trimEnd().endsWith('%%EOF'));
});

/* -------------------------------------------------------------------------- */
/* LaTeX                                                                      */
/* -------------------------------------------------------------------------- */

test('the LaTeX names the package it needs and defines the colours it uses', () => {
  const latex = renderGeometryLabLatex(triangle().lab.getSnapshot(), SIZE, {});
  assert.ok(latex.startsWith('% Needs \\usepackage{tikz}'), 'a paste that fails silently helps nobody');
  const defined = new Set([...latex.matchAll(/\\definecolor\{(\w+)\}/g)].map(match => match[1]));
  for (const used of latex.matchAll(/\{(kleinColor\d+)\}|\[(kleinColor\d+)/g)) {
    const name = used[1] ?? used[2];
    assert.ok(defined.has(name), `${name} is used and never defined`);
  }
  assert.ok(latex.includes('\\begin{tikzpicture}') && latex.includes('\\end{tikzpicture}'));
});

test('measurements come out as a table', () => {
  const { lab, ab } = triangle();
  lab.addLengthMeasurement2D(ab, 'AB');
  const latex = renderGeometryLabLatex(lab.getSnapshot(), SIZE, {});
  assert.ok(latex.includes('\\begin{tabular}{ll}'));
  assert.ok(latex.includes('AB & $8\\;\\mathrm{u}$'), latex.slice(latex.indexOf('\\begin{tabular}')));
});

test('a unit is set as mathematics, not escaped as text', () => {
  // `u^2` through the text escaper is a literal caret where a superscript was
  // meant, and degrees want the symbol rather than the letters.
  const { lab } = triangle();
  const polygon = Object.values(lab.peekSnapshot().scene.scene2d.entities).find(entity => entity.kind === 'polygon');
  lab.addAreaMeasurement2D(polygon.id, 'area');
  const latex = renderGeometryLabLatex(lab.getSnapshot(), SIZE, {});
  assert.ok(latex.includes('\\mathrm{u}^{2}'), latex.slice(latex.indexOf('\\begin{tabular}')));
  assert.ok(!latex.includes('textasciicircum'));
});

test('a label that reads as an expression is set as one', () => {
  const { lab, ab } = triangle();
  lab.addLengthMeasurement2D(ab, 'x^2 + 1');
  const latex = renderGeometryLabLatex(lab.getSnapshot(), SIZE, {});
  assert.ok(latex.includes('$x^{2} + 1$'), 'through the shared parser and formatter');
});

test('a label that is not an expression is left as text', () => {
  const { lab, ab } = triangle();
  lab.addLengthMeasurement2D(ab, 'base');
  const latex = renderGeometryLabLatex(lab.getSnapshot(), SIZE, {});
  assert.ok(latex.includes('base & $'), 'a plain word set as maths would be italic nonsense');
  assert.ok(!latex.includes('$base$'));
});

test('LaTeX special characters in a label do not break the file', () => {
  const { lab } = triangle();
  lab.addPoint2D({ x: 1, y: 1, label: 'a_b & c%' });
  const latex = renderGeometryLabLatex(lab.getSnapshot(), SIZE, {});
  assert.ok(latex.includes('a\\_b \\& c\\%'));
});

/* -------------------------------------------------------------------------- */
/* Through the instrument                                                     */
/* -------------------------------------------------------------------------- */

test('export offers pdf and latex, and says what it cannot do', async () => {
  const { lab } = triangle();
  const pdf = await lab.export({ format: 'pdf', ...SIZE });
  assert.equal(pdf.mimeType, 'application/pdf');
  assert.ok(pdf.data instanceof Blob);

  const latex = await lab.export({ format: 'latex', ...SIZE });
  assert.equal(latex.mimeType, 'application/x-latex');
  assert.ok(latex.data.includes('tikzpicture'));

  await assert.rejects(
    () => lab.export({ format: 'csv' }),
    error => error.code === 'unsupported_export' && error.message.includes('csv'),
  );
});

test('PNG says it needs a browser rather than producing an empty image', async () => {
  // There is no canvas in Node, and a silent blank PNG would be worse than a
  // refusal a host can act on.
  const { lab } = triangle();
  await assert.rejects(
    () => lab.export({ format: 'png', ...SIZE }),
    error => error.code === 'unsupported_export' && /browser/i.test(error.message),
  );
});
