import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGeometryLab,
  sampleRectangularSurface3D,
} from '../../dist/geometry-lab/index.js';

function sample(evaluate, samples = 5) {
  return sampleRectangularSurface3D({
    first: { axis: 'x', range: [-1, 1], samples },
    second: { axis: 'y', range: [-1, 1], samples },
    dependentAxis: 'z',
    evaluate,
  });
}

function bridgesFirstAxis(sampled, split) {
  return sampled.faces.some(face => {
    const xs = face.map(index => sampled.vertices[index].x);
    return Math.min(...xs) < split && Math.max(...xs) > split;
  });
}

test('surface sampling exposes a validity mask and compact finite-only indices', () => {
  const sampled = sample(({ x }) => {
    if (x === 0) return Number.NaN;
    return 1 / x;
  });

  assert.equal(sampled.grid.valid.length, 25);
  assert.equal(sampled.grid.valid.filter(Boolean).length, 20);
  assert.equal(sampled.grid.vertexIndices.filter(index => index === null).length, 5);
  assert.equal(sampled.vertices.length, 20);
  assert.ok(sampled.vertices.every(vertex => Object.values(vertex).every(Number.isFinite)));
  assert.equal(sampled.diagnostics.nonFiniteSampleCount, 5);
  assert.ok(sampled.faces.every(face => face.every(index => index >= 0 && index < sampled.vertices.length)));
});

test('surface probes isolate evaluator errors and reject a pole between grid samples', () => {
  const sampled = sample(({ x }) => {
    if (x === 0) throw new RangeError('pole');
    return 1 / x;
  }, 4);

  assert.ok(sampled.vertices.length > 0);
  assert.ok(sampled.diagnostics.invalidProbeCount > 0);
  const bridgesPole = sampled.faces.some(face => {
    const xs = face.map(index => sampled.vertices[index].x);
    return Math.min(...xs) < 0 && Math.max(...xs) > 0;
  });
  assert.equal(bridgesPole, false);
});

test('smooth steep surfaces retain their complete mesh', () => {
  const sampled = sample(({ x, y }) => Math.exp(10 * x) + y, 6);

  assert.equal(sampled.vertices.length, 36);
  assert.equal(sampled.faces.length, 25);
  assert.equal(sampled.diagnostics.rejectedDiscontinuityCellCount, 0);
});

test('finite step discontinuities do not receive bridging faces', () => {
  for (const samples of [4, 8]) {
    const centered = sample(({ x }) => Math.sign(x), samples);
    assert.equal(bridgesFirstAxis(centered, 0), false, `centered step with ${samples} samples`);
    assert.ok(centered.faces.length > 0);
  }

  const shifted = sample(({ x }) => Math.sign(x - 0.1), 5);
  assert.equal(bridgesFirstAxis(shifted, 0.1), false);
  assert.ok(shifted.faces.length > 0);
});

test('same-sign poles do not receive bridging faces', () => {
  for (const samples of [4, 5]) {
    const sampled = sample(({ x }) => 1 / ((x - 0.1) ** 2), samples);
    assert.equal(bridgesFirstAxis(sampled, 0.1), false, `same-sign pole with ${samples} samples`);
    assert.ok(sampled.faces.length > 0);
  }
});

test('smooth periodic and curved surfaces retain every cell', () => {
  const periodic = sample(({ x }) => Math.sin(2 * Math.PI * x), 5);
  assert.equal(periodic.faces.length, 16);

  const oscillating = sample(({ x }) => Math.sin(20 * x), 8);
  assert.equal(oscillating.faces.length, 49);

  const parabola = sample(({ x }) => 100 * (1 - x * x), 4);
  assert.equal(parabola.faces.length, 9);
});

test('surface continuity is independent of an unused anisotropic axis range', () => {
  const sampled = sampleRectangularSurface3D({
    first: { axis: 'x', range: [-1, 1], samples: 4 },
    second: { axis: 'y', range: [-0.001, 0.001], samples: 4 },
    dependentAxis: 'z',
    evaluate: ({ x }) => x * x,
  });

  assert.equal(sampled.vertices.length, 16);
  assert.equal(sampled.faces.length, 9);
  assert.equal(sampled.diagnostics.rejectedDiscontinuityCellCount, 0);
});

test('callback-based z-surfaces isolate invalid samples instead of aborting creation', () => {
  const lab = createGeometryLab();
  const id = lab.addSurfaceZ({
    xRange: [-1, 1],
    yRange: [-1, 1],
    xSamples: 5,
    ySamples: 5,
    z(x) {
      if (x === 0) throw new RangeError('undefined');
      return 1 / x;
    },
  });
  const surface = lab.getSnapshot().scene.scene3d.entities[id];

  assert.equal(surface.kind, 'surface3d');
  assert.equal(surface.vertices.length, 20);
  assert.ok(surface.faces.every(face => face.every(index => Number.isInteger(index))));
});
