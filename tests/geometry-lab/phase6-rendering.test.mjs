import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEmptyGeometryLabSnapshot,
  renderGeometryLabSvg3D,
} from '../../dist/geometry-lab/index.js';

const WIDTH = 640;
const HEIGHT = 480;

function cameraSnapshot(overrides = {}) {
  const snapshot = createEmptyGeometryLabSnapshot();
  snapshot.appState.view3d = {
    position: [0, 0, 10],
    target: [0, 0, 0],
    up: [0, 1, 0],
    fov: 90,
    zoom: 1,
    projection: 'perspective',
    ...overrides,
  };
  return snapshot;
}

function point(id, x, y, z, options = {}) {
  return { id, kind: 'point3d', x, y, z, ...options };
}

function surface(id, color, z) {
  return {
    id,
    kind: 'surface3d',
    surfaceKind: 'parametric',
    color,
    vertices: [
      { x: -1, y: -1, z },
      { x: 1, y: -1, z },
      { x: 1, y: 1, z },
      { x: -1, y: 1, z },
    ],
    faces: [[0, 1, 2, 3]],
  };
}

function render(snapshot, options = {}) {
  return renderGeometryLabSvg3D(snapshot, {
    format: 'svg',
    width: WIDTH,
    height: HEIGHT,
    includeMeasurements: false,
    // These tests are about paint order and camera framing, and compare whole
    // SVG strings as a proxy for both. Per-object descriptions name objects,
    // and two figures built in different orders name theirs differently, so
    // leaving them in would make the proxy answer a different question.
    describeObjects: false,
    ...options,
  });
}

function circleForColor(svg, color) {
  const escaped = color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`<circle cx="([^"]+)" cy="([^"]+)" r="3\\.5" fill="${escaped}"/>`).exec(svg);
  assert.ok(match, `Expected a point circle with color ${color}.`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

function approximately(actual, expected, tolerance = 1e-3) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be within ${tolerance} of ${expected}.`);
}

test('perspective projection uses the configured vertical field of view', () => {
  const snapshot = cameraSnapshot({ fov: 30 });
  snapshot.scene.scene3d.points.sample = point('sample', 1, 0, 0, { color: '#101010' });

  const narrow = circleForColor(render(snapshot), '#101010');
  snapshot.appState.view3d.fov = 90;
  const wide = circleForColor(render(snapshot), '#101010');

  const narrowFocal = (HEIGHT / 2) / Math.tan(Math.PI / 12);
  approximately(narrow.x, WIDTH / 2 + narrowFocal / 10);
  approximately(wide.x, WIDTH / 2 + (HEIGHT / 2) / 10);
  assert.ok(narrow.x > wide.x);
});

test('perspective foreshortens with depth while orthographic projection does not', () => {
  const snapshot = cameraSnapshot();
  snapshot.scene.scene3d.points.near = point('near', 1, 0, 5, { color: '#aa0000' });
  snapshot.scene.scene3d.points.far = point('far', 1, 0, 0, { color: '#0000aa' });

  const perspective = render(snapshot);
  const perspectiveNear = circleForColor(perspective, '#aa0000');
  const perspectiveFar = circleForColor(perspective, '#0000aa');
  assert.ok(perspectiveNear.x - WIDTH / 2 > perspectiveFar.x - WIDTH / 2);

  snapshot.appState.view3d.projection = 'orthographic';
  const orthographic = render(snapshot);
  const orthographicNear = circleForColor(orthographic, '#aa0000');
  const orthographicFar = circleForColor(orthographic, '#0000aa');
  approximately(orthographicNear.x, orthographicFar.x);
});

test('near-plane clipping omits behind-camera geometry and clips crossing segments and polygons', () => {
  const snapshot = cameraSnapshot();
  snapshot.scene.scene3d.points.behind = point('behind', 0, 0, 11, { color: '#111111', label: 'BEHIND_POINT' });
  snapshot.scene.scene3d.points.crossA = point('crossA', -1, 0, 9, { hidden: true });
  snapshot.scene.scene3d.points.crossB = point('crossB', 1, 0, 11, { hidden: true });
  snapshot.scene.scene3d.points.backA = point('backA', -1, 0, 11, { hidden: true });
  snapshot.scene.scene3d.points.backB = point('backB', 1, 0, 12, { hidden: true });
  snapshot.scene.scene3d.entities.crossing = {
    id: 'crossing',
    kind: 'segment',
    pointIds: ['crossA', 'crossB'],
    color: '#12ab34',
  };
  snapshot.scene.scene3d.entities.behind = {
    id: 'behind-segment',
    kind: 'segment',
    pointIds: ['backA', 'backB'],
    color: '#ab1234',
  };
  snapshot.scene.scene3d.entities.crossingFace = {
    id: 'crossing-face',
    kind: 'surface3d',
    surfaceKind: 'parametric',
    color: '#3456ab',
    vertices: [
      { x: -1, y: -1, z: 9 },
      { x: 1, y: -1, z: 9 },
      { x: 0, y: 1, z: 11 },
    ],
    faces: [[0, 1, 2]],
  };
  snapshot.scene.scene3d.entities.behindFace = {
    id: 'behind-face',
    kind: 'surface3d',
    surfaceKind: 'parametric',
    color: '#654321',
    vertices: [
      { x: -1, y: -1, z: 11 },
      { x: 1, y: -1, z: 11 },
      { x: 0, y: 1, z: 12 },
    ],
    faces: [[0, 1, 2]],
  };

  const svg = render(snapshot);
  assert.doesNotMatch(svg, /BEHIND_POINT|#ab1234|#654321/);
  assert.match(svg, /#12ab34/);
  assert.match(svg, /#3456ab/);
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

test('filled primitives are painted globally from far to near regardless of insertion order', () => {
  const near = surface('near', '#cc1100', 5);
  const far = surface('far', '#0011cc', 0);

  for (const entities of [{ near, far }, { far, near }]) {
    const snapshot = cameraSnapshot();
    snapshot.scene.scene3d.entities = entities;
    const svg = render(snapshot);
    const farIndex = svg.indexOf('fill="#0011cc"');
    const nearIndex = svg.indexOf('fill="#cc1100"');
    assert.ok(farIndex >= 0 && nearIndex >= 0);
    assert.ok(farIndex < nearIndex, 'The far face must be serialized before the near face.');
  }
});

test('painter ordering is face-level rather than entity-level', () => {
  const snapshot = cameraSnapshot();
  snapshot.scene.scene3d.entities.layered = {
    id: 'layered',
    kind: 'surface3d',
    surfaceKind: 'parametric',
    color: '#445566',
    vertices: [
      { x: -1, y: -1, z: 5 },
      { x: 1, y: -1, z: 5 },
      { x: 1, y: 1, z: 5 },
      { x: -1, y: 1, z: 5 },
      { x: -1, y: -1, z: 0 },
      { x: 1, y: -1, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: -1, y: 1, z: 0 },
    ],
    // Deliberately authored near-first to ensure rendering does not trust face order.
    faces: [[0, 1, 2, 3], [4, 5, 6, 7]],
  };

  const polygons = [...render(snapshot).matchAll(/<polygon points="([^"]+)" fill="#445566"/g)];
  assert.equal(polygons.length, 2);
  const firstX = Number(polygons[0][1].split(/[ ,]/)[0]);
  const secondX = Number(polygons[1][1].split(/[ ,]/)[0]);
  assert.ok(Math.abs(firstX - WIDTH / 2) < Math.abs(secondX - WIDTH / 2), 'The smaller far face should be painted first.');
});

test('equal-depth primitive ordering is stable', () => {
  const snapshot = cameraSnapshot();
  snapshot.scene.scene3d.entities = {
    first: surface('first', '#112233', 0),
    second: surface('second', '#332211', 0),
  };

  const svg = render(snapshot);
  assert.ok(svg.indexOf('fill="#112233"') < svg.indexOf('fill="#332211"'));

  const reversed = cameraSnapshot();
  reversed.scene.scene3d.entities = {
    second: surface('second', '#332211', 0),
    first: surface('first', '#112233', 0),
  };
  assert.equal(render(reversed), svg);
});

test('extreme finite zoom is clamped to a renderable camera scale', () => {
  const snapshot = cameraSnapshot({ zoom: 1e308 });
  snapshot.scene.scene3d.points.target = point('target', 0, 0, 0, { color: '#123abc' });
  const svg = render(snapshot);
  assert.match(svg, /#123abc/);
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

test('hidden outlier points do not affect camera framing', () => {
  const snapshot = cameraSnapshot();
  snapshot.scene.scene3d.points.visible = point('visible', 1, 0, 0, { color: '#abcdef' });
  const before = render(snapshot);

  snapshot.scene.scene3d.points.outlier = point('outlier', 1_000_000, 0, 0, { hidden: true });
  const after = render(snapshot);
  assert.equal(after, before);
});

test('camera basis fallbacks are deterministic for parallel up vectors and coincident targets', () => {
  const parallel = cameraSnapshot({ up: [0, 0, -1] });
  parallel.scene.scene3d.points.sample = point('sample', 1, 0, 0, { color: '#900090' });
  const parallelSvg = render(parallel);
  assert.deepEqual(circleForColor(parallelSvg, '#900090'), circleForColor(render(parallel), '#900090'));
  assert.doesNotMatch(parallelSvg, /NaN|Infinity/);

  const coincident = cameraSnapshot({ position: [0, 0, 0], target: [0, 0, 0], up: [0, 0, 0] });
  coincident.scene.scene3d.points.sample = point('sample', -2, 2, -1.5, { color: '#009090' });
  const coincidentSvg = render(coincident);
  assert.match(coincidentSvg, /#009090/);
  assert.equal(coincidentSvg, render(coincident));
  assert.doesNotMatch(coincidentSvg, /NaN|Infinity/);
});

test('translating the camera, target, and geometry together preserves projection', () => {
  const original = cameraSnapshot();
  original.scene.scene3d.points.sample = point('sample', 1, 2, 0, { color: '#246824' });
  const projected = circleForColor(render(original), '#246824');

  const offset = 1_000_000;
  const translated = cameraSnapshot({
    position: [offset, offset, offset + 10],
    target: [offset, offset, offset],
  });
  translated.scene.scene3d.points.sample = point('sample', offset + 1, offset + 2, offset, { color: '#246824' });
  assert.deepEqual(circleForColor(render(translated), '#246824'), projected);
});

test('measurement UI is serialized after depth-sorted world geometry', () => {
  const snapshot = cameraSnapshot();
  snapshot.scene.scene3d.entities.face = surface('face', '#778899', 0);
  snapshot.scene.scene3d.measurements.measurement = {
    id: 'measurement',
    targetId: 'face',
    kind: 'area',
    value: 4,
    label: 'overlay measurement',
  };

  const svg = render(snapshot, { includeMeasurements: true });
  assert.ok(svg.indexOf('fill="#778899"') < svg.indexOf('overlay measurement'));
});
