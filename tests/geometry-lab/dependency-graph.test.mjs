/**
 * Dependency graph construction and traversal (plan task 0.2).
 *
 * <p>The graph is built once per scene and cached by the scene's own identity.
 * Two hazards come with that and are tested here: a cached graph that outlived
 * the scene it describes would drive recomputation from stale edges, and a
 * cached graph handed out to a caller that mutates it would corrupt every later
 * reader. Neither can happen, and these tests are what say so.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGeometryDependencyGraph,
  geometryDependentsOf,
  summarizeGeometryObjects,
} from '../../dist/geometry-core/index.js';

function point(id, x, y, construction) {
  return { id, kind: 'point2d', x, y, ...(construction ? { construction } : {}) };
}

function midpoint(id, first, second) {
  return point(id, 0, 0, { kind: 'midpoint', sourceIds: [first, second] });
}

function scene(points, entities = {}, constraints) {
  return { points, entities, ...(constraints ? { constraints } : {}) };
}

/* -------------------------------------------------------------------------- */
/* Correctness                                                                */
/* -------------------------------------------------------------------------- */

test('a hub reports every dependent, and its dependents report it back', () => {
  const points = { hub: point('hub', 0, 0) };
  for (let index = 0; index < 5; index += 1) {
    points[`p${index}`] = point(`p${index}`, index, 0);
    points[`m${index}`] = midpoint(`m${index}`, 'hub', `p${index}`);
  }
  const graph = buildGeometryDependencyGraph(scene(points));

  assert.deepEqual(
    [...graph.dependentsById.hub].sort(),
    ['m0', 'm1', 'm2', 'm3', 'm4'],
  );
  assert.deepEqual(graph.dependenciesById.m2, ['hub', 'p2']);
  assert.deepEqual(graph.dependentsById.m2, [], 'a leaf has no dependents');
});

test('every id appears in dependentsById, including ones nothing depends on', () => {
  const graph = buildGeometryDependencyGraph(scene({ A: point('A', 0, 0), B: point('B', 1, 1) }));
  assert.deepEqual(graph.dependentsById.A, []);
  assert.deepEqual(graph.dependentsById.B, []);
});

test('an object never depends on itself', () => {
  const graph = buildGeometryDependencyGraph(scene({
    A: point('A', 0, 0),
    // A construction naming its own id must not produce a self-edge.
    S: midpoint('S', 'S', 'A'),
  }));
  assert.equal(graph.dependenciesById.S.includes('S'), false);
});

test('transitive dependents are reported through a chain', () => {
  const input = scene({
    A: point('A', 0, 0),
    B: point('B', 8, 0),
    M: midpoint('M', 'A', 'B'),
    N: midpoint('N', 'A', 'M'),
    P: midpoint('P', 'A', 'N'),
  });
  assert.deepEqual(geometryDependentsOf(input, ['B']).sort(), ['M', 'N', 'P']);
  assert.deepEqual(geometryDependentsOf(input, ['N']).sort(), ['P']);
  assert.deepEqual(geometryDependentsOf(input, ['P']), []);
});

test('a long chain terminates, exercising the cursor traversal', () => {
  const points = { p0: point('p0', 0, 0), p1: point('p1', 1000, 0) };
  let previous = 'p1';
  for (let index = 2; index < 600; index += 1) {
    points[`p${index}`] = midpoint(`p${index}`, 'p0', previous);
    previous = `p${index}`;
  }
  const dependents = geometryDependentsOf(scene(points), ['p1']);
  assert.equal(dependents.length, 598, 'every link in the chain is reached');
});

test('a dependency cycle does not hang the traversal', () => {
  const input = scene({
    A: point('A', 0, 0),
    P: midpoint('P', 'A', 'Q'),
    Q: midpoint('Q', 'A', 'P'),
  });
  assert.deepEqual(geometryDependentsOf(input, ['A']).sort(), ['P', 'Q']);
});

test('entities and constraints participate in the graph', () => {
  const input = scene(
    { A: point('A', 0, 0), B: point('B', 4, 0) },
    { s1: { id: 's1', kind: 'segment', pointIds: ['A', 'B'] } },
    { c1: { id: 'c1', kind: 'fixedLength', pointIds: ['A', 'B'], length: 4 } },
  );
  const graph = buildGeometryDependencyGraph(input);
  assert.deepEqual(graph.dependenciesById.s1, ['A', 'B']);
  assert.deepEqual(graph.dependenciesById.c1, ['A', 'B']);
  assert.deepEqual([...graph.dependentsById.A].sort(), ['c1', 's1']);
});

/* -------------------------------------------------------------------------- */
/* The cache                                                                  */
/* -------------------------------------------------------------------------- */

test('a different scene object gets its own graph, so the cache cannot go stale', () => {
  const first = scene({ A: point('A', 0, 0), B: point('B', 4, 0), M: midpoint('M', 'A', 'B') });
  assert.deepEqual(geometryDependentsOf(first, ['A']), ['M']);

  // Same shape, different edges, and crucially a different object: an edit
  // always produces a new scene, which must never read the previous graph.
  const second = scene({
    A: point('A', 0, 0),
    B: point('B', 4, 0),
    M: midpoint('M', 'A', 'B'),
    N: midpoint('N', 'A', 'M'),
  });
  assert.deepEqual(geometryDependentsOf(second, ['A']).sort(), ['M', 'N']);
  assert.deepEqual(geometryDependentsOf(first, ['A']), ['M'], 'the first scene is unaffected');
});

test('a caller mutating the graph it was given cannot corrupt later readers', () => {
  const input = scene({ A: point('A', 0, 0), B: point('B', 4, 0), M: midpoint('M', 'A', 'B') });

  const handedOut = buildGeometryDependencyGraph(input);
  handedOut.dependentsById.A.push('nonsense');
  handedOut.dependenciesById.M = ['tampered'];

  const fresh = buildGeometryDependencyGraph(input);
  assert.deepEqual(fresh.dependentsById.A, ['M'], 'a public build returns an untouched graph');
  assert.deepEqual(fresh.dependenciesById.M, ['A', 'B']);
  assert.deepEqual(geometryDependentsOf(input, ['A']), ['M'], 'traversal is unaffected too');
});

test('summaries carry the same dependency information as the graph', () => {
  const input = scene({ A: point('A', 0, 0), B: point('B', 4, 0), M: midpoint('M', 'A', 'B') });
  const graph = buildGeometryDependencyGraph(input);
  for (const summary of summarizeGeometryObjects(input)) {
    assert.deepEqual(summary.dependencies, graph.dependenciesById[summary.id] ?? []);
    assert.deepEqual(summary.dependents, graph.dependentsById[summary.id] ?? []);
  }
});
