/**
 * Renders the pictures in the README with nothing but the SDK.
 *
 * Every image under examples/gallery/ is produced here from the public entry
 * points: build a document through the instrument or runtime API, then ask it
 * for SVG. Run `npm run build && node examples/render-gallery.mjs` to refresh
 * them; if a renderer changes, the pictures change with it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGraphingCalculator } from '../dist/graphing/index.js';
import { createGeometryLabRuntime, renderGeometryLabSvg3D } from '../dist/geometry-lab/index.js';
import { createWhiteboard, exportWhiteboardSvg } from '../dist/whiteboard/index.js';

const out = join(dirname(fileURLToPath(import.meta.url)), 'gallery');
mkdirSync(out, { recursive: true });

// ── Graphing calculator ───────────────────────────────────────────────────
// Expressions are typed the way a student types them; sliders are variables
// the expressions can use; points are plain coordinates.
const graphing = createGraphingCalculator({ samples: 240 });
graphing.addExpression('y = x^2 - 4', { label: 'Parabola', color: '#2563eb' });
graphing.addExpression('y = 2 sin(x)', { label: 'Sinus', color: '#d97706' });
graphing.addSlider('a', { value: 1, min: -3, max: 3, step: 0.5 });
graphing.addExpression('y = a * x + 1', { label: 'Dreapta', color: '#16a34a' });
graphing.addPoint(2, 0, { label: 'A' });
graphing.addPoint(-2, 0, { label: 'B' });
const graphingSvg = await graphing.export({ format: 'svg', width: 720, height: 440, includeGrid: true });
writeFileSync(join(out, 'graphing.svg'), graphingSvg.data);

// ── Geometry Lab (3D) ─────────────────────────────────────────────────────
// The runtime is command-driven: a host sends commands, the runtime answers
// with the deltas it produced, and the snapshot is what gets saved.
const lab = createGeometryLabRuntime({ initialView: '3d' });
lab.execute({ type: 'addCube', payload: { center: { x: -2.2, y: 0, z: 1 }, size: 2, color: '#2563eb' } });
lab.execute({ type: 'addSphere', payload: { center: { x: 2.2, y: 0, z: 1 }, radius: 1.1, color: '#d97706' } });
lab.execute({ type: 'addSurfaceZ', payload: { preset: 'saddle', xRange: [-4, 4], yRange: [-4, 4], samples: 20, color: '#16a34a' } });
lab.execute({ type: 'setCameraPreset', payload: { preset: 'isometric', distance: 14 } });
const labSvg = renderGeometryLabSvg3D(lab.getSnapshot(), { format: 'svg', width: 720, height: 440 });
writeFileSync(join(out, 'geometry-lab.svg'), labSvg);

// ── Whiteboard ────────────────────────────────────────────────────────────
// Elements are plain JSON; the same objects travel as collaboration deltas.
const board = createWhiteboard();
const add = (element) => board.applyDelta({ op: 'add', element });
add({ id: 'frame', type: 'frame', title: 'Aria triunghiului', x: 20, y: 20, width: 680, height: 400, color: '#94a3b8' });
add({ id: 'tri', type: 'shape', shape: 'triangle', x: 80, y: 90, width: 260, height: 220, strokeColor: '#2563eb', strokeWidth: 3, fillColor: '#dbeafe' });
add({ id: 'h', type: 'line', variant: 'line', x: 210, y: 90, dx: 0, dy: 220, color: '#d97706', width: 2, dashed: true });
add({ id: 'b', type: 'line', variant: 'doubleArrow', x: 80, y: 330, dx: 260, dy: 0, color: '#16a34a', width: 2 });
add({ id: 't-b', type: 'text', text: 'b', x: 200, y: 340, color: '#16a34a', fontSize: 20, width: 40, bold: true });
add({ id: 't-h', type: 'text', text: 'h', x: 218, y: 190, color: '#d97706', fontSize: 20, width: 40, bold: true });
add({ id: 'formula', type: 'sticky', text: 'A = b · h / 2', x: 400, y: 100, width: 240, height: 110, color: '#fef3c7' });
add({ id: 'note', type: 'text', text: 'Înălțimea cade perpendicular pe bază.', x: 400, y: 240, color: '#334155', fontSize: 18, width: 260 });
add({ id: 'ok', type: 'stamp', stamp: 'check', x: 620, y: 330, width: 40, height: 40, color: '#16a34a' });
writeFileSync(join(out, 'whiteboard.svg'), exportWhiteboardSvg(board.getSnapshot(), { width: 720, height: 440 }));

console.log(`Wrote ${out}/graphing.svg, geometry-lab.svg, whiteboard.svg`);
