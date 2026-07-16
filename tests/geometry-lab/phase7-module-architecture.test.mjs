import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as rootPublic from '../../dist/index.js';
import * as geometryLabPublic from '../../dist/geometry-lab/index.js';
import { executeGeometryLabCommand } from '../../dist/geometry-lab/commands.js';
import { buildGeometryLabDependencyGraph } from '../../dist/geometry-lab/dependencies.js';
import { compileEquationSurface3D } from '../../dist/geometry-lab/equations.js';
import {
  applyGeometryLabHistoryPatches,
  createGeometryLabHistoryEntry,
  diffGeometryLabHistory,
  geometryLabHistoryDelta,
} from '../../dist/geometry-lab/history.js';
import { createGeometryLab as createGeometryLabDirect } from '../../dist/geometry-lab/instrument.js';
import {
  createEmptyGeometryLabSnapshot,
  reduceGeometryLabDelta,
} from '../../dist/geometry-lab/reducer.js';
import { renderGeometryLabSvg3D } from '../../dist/geometry-lab/renderers.js';
import { validateGeometryLabDeltaStrict } from '../../dist/geometry-lab/schema.js';
import { createRegularPolyhedronMesh3D } from '../../dist/geometry-lab/solids.js';
import {
  validateGeometryLabDelta,
  validateGeometryLabSnapshot,
} from '../../dist/geometry-lab/validation.js';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GEOMETRY_LAB_SOURCE = path.join(REPOSITORY_ROOT, 'src', 'geometry-lab');

const REQUIRED_PHASE7_MODULES = [
  'types.ts',
  'schema.ts',
  'commands.ts',
  'reducer.ts',
  'dependencies.ts',
  'history.ts',
  'equations.ts',
  'solids.ts',
  'renderers.ts',
  'validation.ts',
  'instrument.ts',
];

test('Geometry Lab keeps the required Phase 7 modules behind a thin public barrel', () => {
  for (const file of REQUIRED_PHASE7_MODULES) {
    const absolutePath = path.join(GEOMETRY_LAB_SOURCE, file);
    assert.equal(existsSync(absolutePath), true, `missing Geometry Lab module ${file}`);
    assert.equal(statSync(absolutePath).isFile(), true, `${file} must be a file`);
  }

  const barrel = readFileSync(path.join(GEOMETRY_LAB_SOURCE, 'index.ts'), 'utf8');
  const barrelLines = barrel.split(/\r?\n/u).filter(line => line.trim().length > 0);
  assert.ok(barrelLines.length <= 30, `Geometry Lab barrel grew to ${barrelLines.length} non-empty lines`);
  assert.match(barrel, /export\s+\*\s+from\s+['"]\.\/instrument\.js['"]/u);

  const codeOnly = barrel.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/.*$/gmu, '');
  assert.doesNotMatch(codeOnly, /\b(?:class|function|const|let|var)\b/u);
});

test('Geometry Lab leaf modules never import their public barrel', () => {
  const offenders = readdirSync(GEOMETRY_LAB_SOURCE)
    .filter(file => file.endsWith('.ts') && file !== 'index.ts')
    .filter(file => /['"]\.\/index\.js['"]/u.test(
      readFileSync(path.join(GEOMETRY_LAB_SOURCE, file), 'utf8'),
    ));
  assert.deepEqual(offenders, []);
});

test('root and subpath exports retain the same Geometry Lab factories', () => {
  for (const name of [
    'createGeometryLab',
    'createGeometryLabRuntime',
    'createEmptyGeometryLabSnapshot',
  ]) {
    assert.equal(typeof geometryLabPublic[name], 'function', `${name} must remain public`);
    assert.strictEqual(rootPublic[name], geometryLabPublic[name], `${name} root export drifted`);
  }
  assert.strictEqual(createGeometryLabDirect, geometryLabPublic.createGeometryLab);
});

test('representative extracted modules compose without routing through the barrel', () => {
  const empty = createEmptyGeometryLabSnapshot();
  assert.equal(validateGeometryLabSnapshot(empty).ok, true);

  const addPoint = {
    op: 'addPoint3D',
    point: { id: 'architecture_point', kind: 'point3d', x: 1, y: 2, z: 3 },
  };
  assert.equal(validateGeometryLabDeltaStrict(addPoint).ok, true);
  assert.equal(validateGeometryLabDelta(addPoint).ok, true);

  const reduced = reduceGeometryLabDelta(empty, addPoint);
  assert.equal(reduced.changed, true);
  assert.equal(reduced.snapshot.scene.scene3d.points.architecture_point.z, 3);

  const graph = buildGeometryLabDependencyGraph(reduced.snapshot);
  assert.ok(graph.nodesByKey['point3d:architecture_point']);
  assert.deepEqual(graph.unresolvedDependencies, []);

  const diff = diffGeometryLabHistory(empty, reduced.snapshot);
  const entry = createGeometryLabHistoryEntry(diff);
  assert.ok(entry);
  const undo = geometryLabHistoryDelta(entry, 'undo');
  assert.equal(undo.op, 'historyPatch');
  const undone = applyGeometryLabHistoryPatches(reduced.snapshot, undo.patches);
  assert.equal(undone.scene.scene3d.points.architecture_point, undefined);

  const equation = compileEquationSurface3D('z = x + y');
  assert.equal(equation.evaluate({ x: 2, y: 3, z: 0 }), 5);

  const cube = createRegularPolyhedronMesh3D('cube', { x: 0, y: 0, z: 0 }, 2);
  assert.equal(cube.vertices.length, 8);
  assert.equal(cube.faces.length, 6);

  const svg = renderGeometryLabSvg3D(reduced.snapshot, {
    format: 'svg',
    width: 320,
    height: 240,
  });
  assert.match(svg, /^<svg/u);

  const instrument = createGeometryLabDirect({ actorId: 'phase7-architecture' });
  const command = executeGeometryLabCommand(instrument, {
    type: 'addPoint3D',
    payload: { x: 4, y: 5, z: 6 },
  });
  assert.equal(command.ok, true, command.ok ? undefined : command.error.message);
  assert.equal(Object.keys(instrument.getSnapshot().scene.scene3d.points).length, 1);
});
