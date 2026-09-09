/**
 * A model answer for every exercise that carries a target.
 *
 * <p>An answer key nobody has answered is a guess. Each of these builds the
 * exercise the way it asks to be built - with the construction tools, not by
 * placing points where they look right - so that `exercises.test.mjs` can show
 * the target is reachable, and reachable *as a construction*: every one of
 * these survives the figure being dragged, which is what the exercises marked
 * `requireConstruction` are actually asking for.
 */
import { createGeometryLab } from '../../dist/geometry-lab/index.js';

export const MODEL_ANSWERS = {
  'triangle-detective': () => {
    const lab = createGeometryLab({ initialView: '2d' });
    const a = lab.addPoint2D({ x: 0, y: 6, label: 'A' });
    const b = lab.addPoint2D({ x: -4, y: 0, label: 'B' });
    // C on the circle centred at A through B, so AC equals AB by construction.
    const circle = lab.addCircle2D(a, b);
    const guide = lab.addPoint2D({ x: 5, y: 0, label: 'G' });
    const c = lab.addIntersection2D(circle, lab.addLine2D(b, guide), 1);
    lab.applyDelta({ op: 'updatePoint', id: c, changes: { label: 'C' } });
    lab.addSegment2D(a, b);
    lab.addSegment2D(a, c);
    lab.addSegment2D(b, c);
    return lab;
  },
  'quadrilateral-sorting': () => {
    const lab = createGeometryLab({ initialView: '2d' });
    const a = lab.addPoint2D({ x: 0, y: 0, label: 'A' });
    const b = lab.addPoint2D({ x: 8, y: 0, label: 'B' });
    const ab = lab.addSegment2D(a, b);
    const up = lab.addPerpendicularLine2D(ab, b);
    const height = lab.addPoint2D({ x: 0, y: 5, label: 'H' });
    const across = lab.addParallelLine2D(ab, height);
    const c = lab.addIntersection2D(up, across);
    lab.applyDelta({ op: 'updatePoint', id: c, changes: { label: 'C' } });
    const down = lab.addPerpendicularLine2D(ab, a);
    const d = lab.addIntersection2D(down, across);
    lab.applyDelta({ op: 'updatePoint', id: d, changes: { label: 'D' } });
    lab.addSegment2D(b, c);
    lab.addSegment2D(c, d);
    lab.addSegment2D(a, d);
    return lab;
  },
  'circle-challenge': () => {
    const lab = createGeometryLab({ initialView: '2d' });
    const o = lab.addPoint2D({ x: 0, y: 0, label: 'O' });
    const p = lab.addPoint2D({ x: 6, y: 0, label: 'P' });
    lab.addCircle2D(o, p);
    const q = lab.reflectInPoint2D(p, o);
    lab.applyDelta({ op: 'updatePoint', id: q, changes: { label: 'Q' } });
    const r = lab.rotate2D(p, o, 70);
    lab.applyDelta({ op: 'updatePoint', id: r, changes: { label: 'R' } });
    lab.addSegment2D(p, q);
    lab.addSegment2D(p, r);
    return lab;
  },
  'construction-from-instructions': () => {
    const lab = createGeometryLab({ initialView: '2d' });
    const a = lab.addPoint2D({ x: 0, y: 0, label: 'A' });
    const b = lab.addPoint2D({ x: 6, y: 0, label: 'B' });
    const first = lab.addCircle2D(a, b);
    const second = lab.addCircle2D(b, a);
    const c = lab.addIntersection2D(first, second);
    lab.applyDelta({ op: 'updatePoint', id: c, changes: { label: 'C' } });
    lab.addSegment2D(a, b);
    lab.addSegment2D(a, c);
    lab.addSegment2D(b, c);
    return lab;
  },
  'pythagorean-explorer': () => {
    const lab = createGeometryLab({ initialView: '2d' });
    const a = lab.addPoint2D({ x: 0, y: 0, label: 'A' });
    const b = lab.addPoint2D({ x: 4, y: 0, label: 'B' });
    const ab = lab.addSegment2D(a, b);
    const up = lab.addPerpendicularLine2D(ab, a);
    const far = lab.addPoint2D({ x: 0, y: 3, label: 'F' });
    const c = lab.addIntersection2D(up, lab.addCircle2D(a, far));
    lab.applyDelta({ op: 'updatePoint', id: c, changes: { label: 'C' } });
    lab.addSegment2D(a, c);
    lab.addSegment2D(b, c);
    return lab;
  },
  'triangle-centers': () => {
    const lab = createGeometryLab({ initialView: '2d' });
    const a = lab.addPoint2D({ x: 0, y: 0, label: 'A' });
    const b = lab.addPoint2D({ x: 10, y: 0, label: 'B' });
    const c = lab.addPoint2D({ x: 3, y: 8, label: 'C' });
    lab.addMidpoint2D(b, c, { label: 'P' });
    lab.addMidpoint2D(a, c, { label: 'Q' });
    lab.addMidpoint2D(a, b, { label: 'R' });
    lab.addSegment2D(a, b);
    lab.addSegment2D(b, c);
    lab.addSegment2D(a, c);
    return lab;
  },
  'similar-triangles': () => {
    const lab = createGeometryLab({ initialView: '2d' });
    const a = lab.addPoint2D({ x: 0, y: 0, label: 'A' });
    const b = lab.addPoint2D({ x: 4, y: 0, label: 'B' });
    const c = lab.addPoint2D({ x: 1, y: 3, label: 'C' });
    const triangle = lab.addPolygon2D([a, b, c]);
    const centre = lab.addPoint2D({ x: -6, y: -4, label: 'Z' });
    const image = lab.dilate2D(triangle, centre, 2);
    const vertices = lab.peekSnapshot().scene.scene2d.entities[image].pointIds;
    ['D', 'E', 'F'].forEach((label, index) => {
      lab.applyDelta({ op: 'updatePoint', id: vertices[index], changes: { label } });
    });
    return lab;
  },
  'proof-by-construction': () => {
    const lab = createGeometryLab({ initialView: '2d' });
    const a = lab.addPoint2D({ x: 0, y: 0, label: 'A' });
    const b = lab.addPoint2D({ x: 10, y: 0, label: 'B' });
    const c = lab.addPoint2D({ x: 3, y: 8, label: 'C' });
    const m = lab.addMidpoint2D(a, b, { label: 'M' });
    const n = lab.addMidpoint2D(a, c, { label: 'N' });
    lab.addSegment2D(m, n);
    lab.addSegment2D(b, c);
    lab.addSegment2D(a, b);
    lab.addSegment2D(a, c);
    return lab;
  },
};
