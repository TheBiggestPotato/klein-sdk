/**
 * Surfaces given as an equation (plan task 6.4).
 *
 * <p>What the instrument had was explicit surfaces - `z = f(x, y)`, a height
 * over a rectangle - which is a real restriction rather than a notational one.
 * A sphere is not the graph of a function, and neither is a torus. So the tests
 * that matter most are the ones about shapes a height field cannot be: a closed
 * one, one with a hole in it, and one in two pieces.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compileImplicitSurface3D,
  createGeometryLab,
  isosurfaceEvaluationCount,
  isosurfaceResolutionWithin,
  marchIsosurface3D,
} from '../../dist/geometry-lab/index.js';

const box = (half) => ({ x: [-half, half], y: [-half, half], z: [-half, half] });

/** How many triangles each edge of a mesh belongs to. */
function edgeSharing(surface) {
  const counts = new Map();
  for (const face of surface.faces) {
    for (let index = 0; index < face.length; index += 1) {
      const a = face[index];
      const b = face[(index + 1) % face.length];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

const onBoundary = (point, bounds) => ['x', 'y', 'z'].some(axis =>
  Math.abs(point[axis] - bounds[axis][0]) < 1e-9 || Math.abs(point[axis] - bounds[axis][1]) < 1e-9);

/* -------------------------------------------------------------------------- */
/* Shapes a height field cannot be                                            */
/* -------------------------------------------------------------------------- */

test('a sphere comes out with every vertex the right distance from the centre', () => {
  const surface = marchIsosurface3D({
    field: (x, y, z) => x * x + y * y + z * z - 9,
    bounds: box(5),
    resolution: 20,
  });
  assert.ok(surface.faces.length > 1000);
  for (const vertex of surface.vertices) {
    const radius = Math.hypot(vertex.x, vertex.y, vertex.z);
    // The grid is half a unit across, and a vertex is placed by interpolating
    // along one of its edges, so this is the accuracy the sampling allows.
    assert.ok(Math.abs(radius - 3) < 0.05, `a vertex at radius ${radius}`);
  }
});

test('a closed surface comes out closed', () => {
  // The reason for cutting cubes into tetrahedra rather than using the
  // 256-case table: a tetrahedron has no face with four corners, so there is
  // no ambiguous case to resolve differently in neighbouring cells, and no
  // hole where two of them disagreed.
  const surface = marchIsosurface3D({
    field: (x, y, z) => x * x + y * y + z * z - 9,
    bounds: box(5),
    resolution: 16,
  });
  for (const [edge, count] of edgeSharing(surface)) {
    assert.equal(count, 2, `edge ${edge} belongs to ${count} triangles rather than two`);
  }
});

test('a torus has a hole in it, which no height field can', () => {
  const surface = marchIsosurface3D({
    field: (x, y, z) => { const ring = Math.hypot(x, y) - 3; return ring * ring + z * z - 1; },
    bounds: { x: [-5, 5], y: [-5, 5], z: [-2, 2] },
    resolution: 20,
  });
  assert.ok(surface.faces.length > 1000);
  for (const count of edgeSharing(surface).values()) assert.equal(count, 2, 'and it is closed');
  // Nothing passes near the axis, which is what having a hole means.
  const nearest = Math.min(...surface.vertices.map(v => Math.hypot(v.x, v.y)));
  assert.ok(nearest > 1.5, `something reached ${nearest} from the axis`);
});

test('a surface in two pieces comes out in two pieces, open only where the box cuts it', () => {
  const bounds = { x: [-4, 4], y: [-3, 3], z: [-3, 3] };
  const surface = marchIsosurface3D({
    field: (x, y, z) => x * x - y * y - z * z - 1,
    bounds,
    resolution: 16,
  });
  const open = [...edgeSharing(surface).entries()].filter(([, count]) => count === 1);
  assert.ok(open.length > 0, 'the sheets run out of the box');
  for (const [edge] of open) {
    const [a, b] = edge.split('-').map(Number);
    assert.ok(
      onBoundary(surface.vertices[a], bounds) && onBoundary(surface.vertices[b], bounds),
      'an open edge that is not on the wall of the box would be a hole in the algorithm',
    );
  }
  assert.ok(surface.vertices.some(v => v.x > 0) && surface.vertices.some(v => v.x < 0), 'both sheets');
});

test('a level other than zero picks a different surface', () => {
  const field = (x, y, z) => x * x + y * y + z * z;
  const surface = marchIsosurface3D({ field, bounds: box(5), resolution: 16, level: 16 });
  for (const vertex of surface.vertices) {
    assert.ok(Math.abs(Math.hypot(vertex.x, vertex.y, vertex.z) - 4) < 0.05);
  }
});

test('an equation satisfied nowhere in the box produces nothing rather than nonsense', () => {
  const surface = marchIsosurface3D({
    field: (x, y, z) => x * x + y * y + z * z - 900,
    bounds: box(5),
    resolution: 8,
  });
  assert.deepEqual(surface.faces, []);
  assert.deepEqual(surface.vertices, []);
});

test('a hole in the domain takes out its own cells, not the whole surface', () => {
  // 1/x is undefined on a whole plane through the box. The corners there are
  // dropped and the rest of the shape still draws.
  const surface = marchIsosurface3D({
    field: (x, y, z) => 1 / x + y * y + z * z - 4,
    bounds: { x: [-3, 3], y: [-3, 3], z: [-3, 3] },
    resolution: 12,
  });
  assert.ok(surface.faces.length > 0, 'something was still drawn');
  for (const vertex of surface.vertices) {
    assert.ok(Number.isFinite(vertex.x) && Number.isFinite(vertex.y) && Number.isFinite(vertex.z));
  }
});

/* -------------------------------------------------------------------------- */
/* The budget                                                                 */
/* -------------------------------------------------------------------------- */

test('the cost is the corners of the grid, and it is cubic', () => {
  assert.equal(isosurfaceEvaluationCount(1), 8);
  assert.equal(isosurfaceEvaluationCount(10), 1331);
  assert.equal(isosurfaceEvaluationCount(20), 9261);
});

test('a grid past the budget is refused before it is sampled', () => {
  let calls = 0;
  assert.throws(
    () => marchIsosurface3D({
      field: () => { calls += 1; return 0; },
      bounds: box(5),
      resolution: 40,
      maxEvaluations: 1000,
    }),
    error => error.code === 'surface_probe_budget_exceeded',
  );
  assert.equal(calls, 0, 'and not one evaluation was spent finding out');
});

test('the best resolution a budget allows can be asked for', () => {
  // So a host can ask for the best surface a limit allows instead of guessing.
  for (const budget of [1000, 50_000, 300_000]) {
    const resolution = isosurfaceResolutionWithin(budget);
    assert.ok(isosurfaceEvaluationCount(resolution) <= budget, `${resolution} is too fine for ${budget}`);
    assert.ok(isosurfaceEvaluationCount(resolution + 1) > budget, `${resolution} is not the best ${budget} allows`);
  }
  assert.equal(isosurfaceResolutionWithin(4), 0, 'and a budget too small for one cell buys nothing');
});

test('the report says how many evaluations were spent', () => {
  const surface = marchIsosurface3D({ field: (x) => x, bounds: box(1), resolution: 4 });
  assert.equal(surface.evaluations, 125);
});

/* -------------------------------------------------------------------------- */
/* Reading the equation                                                       */
/* -------------------------------------------------------------------------- */

test('an equation becomes the field that is zero on it', () => {
  const compiled = compileImplicitSurface3D('x^2 + y^2 + z^2 = 9');
  assert.equal(compiled.field(3, 0, 0), 0);
  assert.equal(compiled.field(0, 0, 0), -9);
  assert.equal(compiled.input, 'x^2 + y^2 + z^2 = 9');
});

test('a bare expression is read as "this is zero"', () => {
  const compiled = compileImplicitSurface3D('x^2 + y^2 - z^2 - 1');
  assert.equal(compiled.field(1, 0, 0), 0);
});

test('a name nothing will supply is refused rather than evaluated to nothing everywhere', () => {
  assert.throws(() => compileImplicitSurface3D('x^2 + w = 1'), error => error.code === 'invalid_equation');
  assert.throws(() => compileImplicitSurface3D('wobble(x) = 1'), error => error.code === 'invalid_equation');
});

test('constants and the usual functions are allowed', () => {
  const compiled = compileImplicitSurface3D('sin(x) + sqrt(y^2) + z = pi');
  assert.ok(Number.isFinite(compiled.field(0, 1, 1)));
});

test('an empty or doubly-equal equation is refused', () => {
  assert.throws(() => compileImplicitSurface3D('  '), error => error.code === 'invalid_equation');
  assert.throws(() => compileImplicitSurface3D('x = 1 = 2'), error => error.code === 'unsupported_equation');
  assert.throws(() => compileImplicitSurface3D('x ='), error => error.code === 'invalid_equation');
});

test('an expression that is undefined at a point gives nothing there, not an error', () => {
  const compiled = compileImplicitSurface3D('1/x = 1');
  assert.ok(Number.isNaN(compiled.field(0, 0, 0)));
  assert.equal(compiled.field(1, 0, 0), 0);
});

/* -------------------------------------------------------------------------- */
/* Through the instrument                                                     */
/* -------------------------------------------------------------------------- */

test('the Lab draws a sphere from its equation', () => {
  const lab = createGeometryLab();
  const id = lab.addImplicitSurface3D({ input: 'x^2 + y^2 + z^2 = 9', resolution: 20 });
  const entity = lab.peekSnapshot().scene.scene3d.entities[id];
  assert.equal(entity.surfaceKind, 'implicit');
  assert.equal(entity.input, 'x^2 + y^2 + z^2 = 9');
  assert.ok(entity.faces.length > 1000);
  for (const vertex of entity.vertices) {
    assert.ok(Math.abs(Math.hypot(vertex.x, vertex.y, vertex.z) - 3) < 0.06);
  }
});

test('the box has to be a box', () => {
  const lab = createGeometryLab();
  assert.throws(
    () => lab.addImplicitSurface3D({ input: 'x^2 + y^2 + z^2 = 9', domain: { x: [5, -5] } }),
    error => error.code === 'invalid_surface_domain',
  );
});

test('asking for more detail than the budget allows is refused with the number', () => {
  const lab = createGeometryLab();
  assert.throws(
    () => lab.addImplicitSurface3D({ input: 'x^2 + y^2 + z^2 = 9', resolution: 400 }),
    error => error.code === 'geometry_lab_input_too_complex',
  );
});

test('a surface with nothing in the box is refused with something to do about it', () => {
  const lab = createGeometryLab();
  assert.throws(
    () => lab.addImplicitSurface3D({ input: 'x^2 + y^2 + z^2 = 900' }),
    error => error.code === 'invalid_surface' && /larger domain/.test(error.message),
  );
});

test('an implicit surface survives a round trip through JSON', () => {
  const lab = createGeometryLab();
  const id = lab.addImplicitSurface3D({ input: 'x^2 + y^2 + z^2 = 4', resolution: 10 });
  const saved = JSON.parse(JSON.stringify(lab.getSnapshot()));

  const reopened = createGeometryLab();
  reopened.loadSnapshot(saved);
  const entity = reopened.peekSnapshot().scene.scene3d.entities[id];
  assert.equal(entity.surfaceKind, 'implicit');
  assert.equal(entity.faces.length, lab.peekSnapshot().scene.scene3d.entities[id].faces.length);
});

test('it draws, and it is described like any other surface', async () => {
  const lab = createGeometryLab();
  lab.addImplicitSurface3D({ input: 'x^2 + y^2 + z^2 = 9', resolution: 10 });
  const svg = (await lab.export({ format: 'svg', width: 200, height: 160 })).data;
  assert.ok(svg.includes('<polygon'), 'the mesh reached the renderer');
  assert.ok(lab.describe().includes('surface in space'));
});
