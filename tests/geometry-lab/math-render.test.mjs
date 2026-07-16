import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compileEquationSurface3D,
  createGeometryLab,
} from '../../dist/geometry-lab/index.js';

function evaluateEquation(input, variables = {}) {
  const compiled = compileEquationSurface3D(input);
  return compiled.evaluate({ x: 0, y: 0, z: 0, ...variables });
}

function equationSurface(lab, id) {
  const entity = lab.getSnapshot().scene.scene3d.entities[id];
  assert.ok(entity, `Expected equation surface ${id} to exist.`);
  assert.equal(entity.kind, 'surface3d');
  assert.equal(entity.surfaceKind, 'equation');
  return entity;
}

test('equation compiler evaluates explicit dependent-axis expressions', () => {
  const compiled = compileEquationSurface3D('y = x^2 + z^2');

  assert.equal(compiled.dependentAxis, 'y');
  assert.equal(compiled.evaluate({ x: 2, y: 0, z: 3 }), 13);
});

test('equation compiler supports function notation, implicit multiplication, and right-associative powers', () => {
  assert.equal(evaluateEquation('f(u, v) = 2u + sin(v)', { x: 2, y: Math.PI / 2 }), 5);
  assert.equal(evaluateEquation('z = 2^3^2'), 512);
});

test('equation surfaces persist the requested grid, domain, and evaluated vertices', () => {
  const lab = createGeometryLab();
  const id = lab.addEquationSurface3D({
    input: 'y = x^2 + z^2',
    xRange: [-1, 1],
    zRange: [-2, 2],
    samples: 4,
  });
  const surface = equationSurface(lab, id);

  assert.equal(surface.dependentAxis, 'y');
  assert.equal(surface.vertices.length, 16);
  assert.equal(surface.faces.length, 9);
  assert.deepEqual(surface.domain, { x: [-1, 1], z: [-2, 2] });
  assert.deepEqual(surface.samples, { x: 4, z: 4 });
  assert.deepEqual(surface.vertices[0], { x: -1, y: 5, z: -2 });
  assert.deepEqual(surface.vertices.at(-1), { x: 1, y: 5, z: 2 });
});

test('editing an equation re-infers a newly declared dependent axis', () => {
  const lab = createGeometryLab();
  const id = lab.addEquationSurface3D({ input: 'z = x', samples: 4 });

  lab.updateEquationSurface3D(id, { input: 'y = x + z', samples: 4 });
  const surface = equationSurface(lab, id);

  assert.equal(surface.dependentAxis, 'y');
  assert.ok(surface.vertices.every(vertex => vertex.y === vertex.x + vertex.z));
});

test('generic deltas and snapshot loads rebuild equation meshes from authored input', () => {
  const lab = createGeometryLab();
  const id = lab.addEquationSurface3D({ input: 'z = x', samples: 4 });

  lab.applyDelta({ op: 'updateEntity', id, changes: { input: 'z = 10' } });
  let surface = equationSurface(lab, id);
  assert.ok(surface.vertices.every(vertex => vertex.z === 10));

  const stale = lab.getSnapshot();
  stale.scene.scene3d.entities[id].input = 'z = -7';
  stale.scene.scene3d.entities[id].vertices = [{ x: 0, y: 0, z: 999 }];
  stale.scene.scene3d.entities[id].faces = [];
  const restored = createGeometryLab({ initialSnapshot: stale });
  surface = equationSurface(restored, id);
  assert.equal(surface.vertices.length, 16);
  assert.ok(surface.vertices.every(vertex => vertex.z === -7));
});

test('unary minus binds after exponentiation', () => {
  assert.equal(evaluateEquation('z = -x^2', { x: 2 }), -4);
  assert.equal(evaluateEquation('z = (-x)^2', { x: 2 }), 4);
  assert.equal(evaluateEquation('z = 2^-2'), 0.25);
  assert.equal(evaluateEquation('z = -2^2^2'), -16);
});

test('a coordinate axis may be the complete right-hand side', () => {
  const compiled = compileEquationSurface3D('z = x');

  assert.equal(compiled.dependentAxis, 'z');
  assert.equal(compiled.evaluate({ x: 2, y: 0, z: 0 }), 2);
  assert.equal(compileEquationSurface3D('z = x', 'z').dependentAxis, 'z');
  assert.throws(() => compileEquationSurface3D('z = x', 'x'));
});

test('an equation surface rejects dependent-axis references on its right-hand side', () => {
  assert.throws(() => compileEquationSurface3D('z = z + 1'));
  assert.throws(() => compileEquationSurface3D('y = sin(y)'));
  assert.throws(() => compileEquationSurface3D('x + z = z'));
});

test('log is base ten while ln is the natural logarithm', () => {
  assert.ok(Math.abs(evaluateEquation('z = log(100)') - 2) < 1e-12);
  assert.ok(Math.abs(evaluateEquation('z = log(1000)') - 3) < 1e-12);
  assert.ok(Math.abs(evaluateEquation('z = log(8, 2)') - 3) < 1e-12);
  assert.ok(Math.abs(evaluateEquation('z = ln(e)') - 1) < 1e-12);
});

test('sampling 1/x is not dependent on odd versus even sample parity', () => {
  const sample = samples => {
    const lab = createGeometryLab();
    const id = lab.addEquationSurface3D({
      input: 'z = 1/x',
      xRange: [-1, 1],
      yRange: [-1, 1],
      samples,
    });
    return equationSurface(lab, id);
  };

  assert.ok(sample(4).vertices.length > 0);
  assert.ok(sample(5).vertices.length > 0);
});

test('sampling 1/x does not create faces across its discontinuity', () => {
  const lab = createGeometryLab();
  const id = lab.addEquationSurface3D({
    input: 'z = 1/x',
    xRange: [-1, 1],
    yRange: [-1, 1],
    samples: 4,
  });
  const surface = equationSurface(lab, id);
  const bridgesDiscontinuity = surface.faces.some(face => {
    const xs = face.map(index => surface.vertices[index]?.x).filter(Number.isFinite);
    return xs.length >= 3 && Math.min(...xs) < 0 && Math.max(...xs) > 0;
  });

  assert.equal(bridgesDiscontinuity, false);
});

test('a prism extruded parallel to its base has zero volume', () => {
  const lab = createGeometryLab();
  const id = lab.addPrism([
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1, y: 1, z: 0 },
    { x: 0, y: 1, z: 0 },
  ], { x: 1, y: 0, z: 0 });

  assert.equal(lab.measureVolume(id), 0);
});

test('generated cube edges have stable unique IDs', () => {
  const lab = createGeometryLab();
  const id = lab.addPolyhedron('cube');
  const solid = lab.getSnapshot().scene.scene3d.entities[id];

  assert.equal(solid.kind, 'solid');
  assert.ok(Array.isArray(solid.edges));
  assert.equal(solid.edges.length, 12);
  assert.equal(new Set(solid.edges.map(edge => edge.id)).size, solid.edges.length);
});

test('changing perspective FOV changes SVG projection', async () => {
  const lab = createGeometryLab();
  lab.addPoint3D({ x: 2, y: 1, z: 1 });

  const initialView = lab.getSnapshot().appState.view3d;
  lab.applyDelta({ op: 'setView3D', view: { ...initialView, fov: 25 } });
  const narrow = await lab.export({ format: 'svg', width: 640, height: 480, includeMeasurements: false });

  const narrowView = lab.getSnapshot().appState.view3d;
  lab.applyDelta({ op: 'setView3D', view: { ...narrowView, fov: 100 } });
  const wide = await lab.export({ format: 'svg', width: 640, height: 480, includeMeasurements: false });

  assert.notEqual(narrow.data, wide.data);
});

test('hidden outlier points do not change visible SVG framing', async () => {
  const lab = createGeometryLab();
  lab.addPoint3D({ x: 0, y: 0, z: 0 });
  lab.addPoint3D({ x: 1, y: 0, z: 0 });
  const before = await lab.export({ format: 'svg', width: 640, height: 480, includeMeasurements: false });

  lab.addPoint3D({ x: 1_000_000, y: 0, z: 0, hidden: true });
  const after = await lab.export({ format: 'svg', width: 640, height: 480, includeMeasurements: false });

  assert.equal(after.data, before.data);
});
