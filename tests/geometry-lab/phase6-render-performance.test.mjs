import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGeometryLab,
  estimateGeometryLabSurfaceProbeEvaluations,
} from '../../dist/geometry-lab/index.js';

class FakeDocument {
  createElement() {
    return new FakeElement(this);
  }
}

class FakeElement {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument;
    this.dataset = {};
    this.className = '';
    this.innerHTML = '';
    this.children = [];
    this.parentNode = null;
  }

  appendChild(child) {
    child.remove();
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }
}

const FIT_WIDTH = 960;
const FIT_HEIGHT = 640;

function cameraDistance(view) {
  return Math.hypot(
    view.position[0] - view.target[0],
    view.position[1] - view.target[1],
    view.position[2] - view.target[2],
  );
}

function renderedPoint(svg, color) {
  const escaped = color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`<circle cx="([^"]+)" cy="([^"]+)" r="3\\.5" fill="${escaped}"/>`).exec(svg);
  assert.ok(match, `Expected rendered point ${color}.`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

function assertInsideFitViewport(point) {
  assert.ok(point.x >= 0 && point.x <= FIT_WIDTH, `Expected x=${point.x} inside the fitted viewport.`);
  assert.ok(point.y >= 0 && point.y <= FIT_HEIGHT, `Expected y=${point.y} inside the fitted viewport.`);
}

test('mount and destroy preserve host-owned DOM children', () => {
  const document = new FakeDocument();
  const host = new FakeElement(document);
  const sentinel = new FakeElement(document);
  sentinel.innerHTML = 'host content';
  host.appendChild(sentinel);

  const lab = createGeometryLab({ container: host });
  assert.equal(host.children.length, 2);
  assert.equal(host.children[0], sentinel);
  const root = host.children[1];
  assert.equal(root.dataset.kleinInstrument, 'geometry-lab');
  assert.match(root.innerHTML, /^<svg/);

  lab.addPoint3D({ x: 1, y: 2, z: 3 });
  assert.equal(host.children[0], sentinel);
  assert.match(root.innerHTML, /<circle/);

  lab.destroy();
  assert.deepEqual(host.children, [sentinel]);
  assert.equal(sentinel.innerHTML, 'host content');
});

test('camera fitting excludes hidden-only outliers from visible bounds', () => {
  const fit = withOutlier => {
    const lab = createGeometryLab();
    lab.addPoint3D({ x: 0, y: 0, z: 0 });
    lab.addPoint3D({ x: 2, y: 1, z: 0 });
    if (withOutlier) lab.addPoint3D({ x: 1_000_000, y: 0, z: 0, hidden: true });
    lab.fitSelection();
    return lab.getSnapshot().appState.view3d;
  };
  assert.deepEqual(fit(true), fit(false));
});

test('camera fitting honors narrow and wide perspective fields of view', async () => {
  const fitAtFov = async fov => {
    const lab = createGeometryLab();
    const colors = ['#a10000', '#00a100', '#0000a1', '#a100a1'];
    lab.addPoint3D({ x: -1, y: 0, z: 0, color: colors[0] });
    lab.addPoint3D({ x: 1, y: 0, z: 0, color: colors[1] });
    lab.addPoint3D({ x: 0, y: -1, z: 0, color: colors[2] });
    lab.addPoint3D({ x: 0, y: 1, z: 0, color: colors[3] });
    const current = lab.getSnapshot().appState.view3d;
    lab.applyDelta({
      op: 'setView3D',
      view: {
        ...current,
        position: [0, 0, 10],
        target: [0, 0, 0],
        up: [0, 1, 0],
        projection: 'perspective',
        fov,
      },
    });
    lab.fitSelection();
    const view = lab.getSnapshot().appState.view3d;
    const exported = await lab.export({
      format: 'svg',
      width: FIT_WIDTH,
      height: FIT_HEIGHT,
      includeMeasurements: false,
    });
    for (const color of colors) assertInsideFitViewport(renderedPoint(exported.data, color));
    return cameraDistance(view);
  };

  const narrowDistance = await fitAtFov(10);
  const wideDistance = await fitAtFov(120);
  assert.ok(narrowDistance > wideDistance, 'A narrow FOV must move the camera farther from the target.');
});

test('camera fitting preserves orthographic depth invariance and near-plane visibility', async () => {
  const lab = createGeometryLab();
  lab.addPoint3D({ x: 1, y: 0, z: -1, color: '#105090' });
  lab.addPoint3D({ x: 1, y: 0, z: 1, color: '#901050' });
  lab.addPoint3D({ x: 0, y: -2, z: 0, color: '#509010' });
  lab.addPoint3D({ x: 0, y: 2, z: 0, color: '#905010' });
  const current = lab.getSnapshot().appState.view3d;
  lab.applyDelta({
    op: 'setView3D',
    view: {
      ...current,
      position: [0, 0, 10],
      target: [0, 0, 0],
      up: [0, 1, 0],
      projection: 'orthographic',
      fov: 8,
    },
  });
  lab.fitSelection();

  const exported = await lab.export({
    format: 'svg',
    width: FIT_WIDTH,
    height: FIT_HEIGHT,
    includeMeasurements: false,
  });
  const behindTarget = renderedPoint(exported.data, '#105090');
  const inFrontOfTarget = renderedPoint(exported.data, '#901050');
  assertInsideFitViewport(behindTarget);
  assertInsideFitViewport(inFrontOfTarget);
  assert.equal(behindTarget.x, inFrontOfTarget.x);
  assert.equal(behindTarget.y, inFrontOfTarget.y);
  assert.equal(lab.getSnapshot().appState.view3d.projection, 'orthographic');
});

test('local semantic history obeys the configured entry bound', () => {
  const lab = createGeometryLab({ historyLimit: 2 });
  const firstId = lab.addPoint3D({ x: 1, y: 0, z: 0 });
  const secondId = lab.addPoint3D({ x: 2, y: 0, z: 0 });
  const thirdId = lab.addPoint3D({ x: 3, y: 0, z: 0 });

  lab.undo();
  lab.undo();
  lab.undo();
  let points = lab.getSnapshot().scene.scene3d.points;
  assert.ok(points[firstId]);
  assert.equal(points[secondId], undefined);
  assert.equal(points[thirdId], undefined);

  lab.redo();
  lab.redo();
  lab.redo();
  points = lab.getSnapshot().scene.scene3d.points;
  assert.ok(points[firstId]);
  assert.ok(points[secondId]);
  assert.ok(points[thirdId]);

  assert.throws(
    () => createGeometryLab({ historyLimit: -1 }),
    error => error?.code === 'invalid_history_limit',
  );

  const byteBounded = createGeometryLab({ historyByteLimit: 1 });
  const retainedId = byteBounded.addPoint3D({ x: 1, y: 2, z: 3 });
  byteBounded.undo();
  assert.ok(byteBounded.getSnapshot().scene.scene3d.points[retainedId]);
});

test('deterministic equation meshes are compact in JSON, transport, and history', async () => {
  const outbound = [];
  const leader = createGeometryLab({
    actorId: 'phase6-leader',
    onDelta(delta, meta) {
      outbound.push({ delta: structuredClone(delta), meta: structuredClone(meta) });
    },
  });
  const surfaceId = leader.addEquationSurface3D({ input: 'z=x+y', samples: 8 });
  const created = outbound.shift();
  assert.equal(created.delta.op, 'addEntity3D');
  assert.deepEqual(created.delta.entity.vertices, []);
  assert.deepEqual(created.delta.entity.faces, []);

  const follower = createGeometryLab({ actorId: 'phase6-follower' });
  follower.applyDelta(created.delta, { emit: false, meta: { ...created.meta, source: 'remote' } });
  assert.deepEqual(follower.getSnapshot(), leader.getSnapshot());

  const exported = await leader.export({ format: 'json' });
  const compactSurface = exported.data.scene.scene3d.entities[surfaceId];
  assert.deepEqual(compactSurface.vertices, []);
  assert.deepEqual(compactSurface.faces, []);
  const restored = createGeometryLab({ initialSnapshot: exported.data });
  assert.equal(restored.getSnapshot().scene.scene3d.entities[surfaceId].vertices.length, 64);

  leader.updateEquationSurface3D(surfaceId, { input: 'z=x-y', samples: 8 });
  outbound.length = 0;
  leader.undo();
  assert.equal(outbound[0].delta.op, 'historyPatch');
  const entityPatch = outbound[0].delta.patches.find(
    patch => patch.ref.collection === 'entity3d' && patch.ref.id === surfaceId,
  );
  assert.ok(entityPatch);
  assert.deepEqual(entityPatch.expected.value.vertices, []);
  assert.deepEqual(entityPatch.next.value.vertices, []);
});

test('unrelated edits do not resample unchanged equation meshes', () => {
  const originalSin = Math.sin;
  let evaluations = 0;
  Math.sin = value => {
    evaluations += 1;
    return originalSin(value);
  };
  try {
    const lab = createGeometryLab();
    const surfaceId = lab.addEquationSurface3D({ input: 'z=sin(x)+y', samples: 8 });
    assert.equal(evaluations, 8 * 8 + estimateGeometryLabSurfaceProbeEvaluations(8, 8));

    evaluations = 0;
    lab.addPoint3D({ x: 1, y: 2, z: 3 });
    assert.equal(evaluations, 0);

    lab.updateEquationSurface3D(surfaceId, { input: 'z=sin(x)-y', samples: 8 });
    assert.equal(evaluations, 8 * 8 + estimateGeometryLabSurfaceProbeEvaluations(8, 8));
  } finally {
    Math.sin = originalSin;
  }
});

test('unrelated edits do not clone sampled surface or curve buffers, even with history disabled', () => {
  const lab = createGeometryLab({ historyLimit: 0 });
  lab.addSurfaceZ({
    xRange: [-1, 1],
    yRange: [-1, 1],
    xSamples: 8,
    ySamples: 8,
    z: (x, y) => x + y,
  });
  lab.addParametricCurve3D({
    tRange: [0, 1],
    samples: 32,
    point: t => ({ x: t, y: t * t, z: 0 }),
  });

  const originalStructuredClone = globalThis.structuredClone;
  let sampledBufferClones = 0;
  globalThis.structuredClone = value => {
    if (value?.kind === 'surface3d' || value?.kind === 'curve3d') sampledBufferClones += 1;
    return originalStructuredClone(value);
  };
  try {
    lab.addPoint3D({ x: 2, y: 3, z: 4 });
    assert.equal(sampledBufferClones, 0);
  } finally {
    globalThis.structuredClone = originalStructuredClone;
  }
});
