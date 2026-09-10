import { KleinSdkError } from '../core/index.js';
import type { Vector3 } from '../core/index.js';
import {
  evaluateMathNode,
  isSupportedMathConstant,
  isSupportedMathFunction,
  parseMath,
} from '../math/index.js';
import type { MathNode } from '../math/index.js';

/**
 * Surfaces given as an equation the whole of space has to satisfy.
 *
 * <p>What the instrument had was *explicit* surfaces - `z = f(x, y)`, a height
 * over a rectangle - which is a real restriction rather than a notational one:
 * a sphere is not the graph of a function, and neither is a torus, a
 * hyperboloid or anything else with two sheets or a hole in it. `x² + y² + z² =
 * 9` was answered with "use an explicit equation such as z = x² + y²", which is
 * to say, use a different shape.
 *
 * <p>An implicit surface is where a field is zero. So the field is sampled on a
 * grid and the zero set is walked out of it - the standard idea, with one
 * deliberate difference described below.
 */

/**
 * Turns `x^2 + y^2 + z^2 = 9` into the field that is zero on it.
 *
 * <p>An equation is two expressions that have to agree, so the field is their
 * difference: where `left - right` is zero is exactly where the equation holds.
 * That is the whole of the translation, and it is why an implicit surface can
 * be any shape at all where an explicit one has to be a graph.
 *
 * <p>Only `x`, `y` and `z` are free. The parser knows constants like `pi` and
 * the usual functions, and anything else is a name nothing will ever supply, so
 * it is refused here rather than evaluated to a silent `NaN` across the whole
 * grid.
 */
export function compileImplicitSurface3D(input: string): {
  readonly input: string;
  readonly expression: string;
  readonly field: ScalarField3D;
} {
  const trimmed = input.trim();
  if (!trimmed) throw new KleinSdkError('invalid_equation', 'An implicit surface needs an equation.');
  const sides = trimmed.split('=').map((part) => part.trim());
  if (sides.length > 2) {
    throw new KleinSdkError('unsupported_equation', 'An implicit surface has one equals sign.');
  }
  if (sides.some((part) => part === '')) {
    throw new KleinSdkError('invalid_equation', 'Both sides of an equation are required.');
  }
  // A bare expression is read as "this is zero", which is how a field is
  // usually written down in the first place.
  const expression = sides.length === 2 ? `(${sides[0]}) - (${sides[1]})` : trimmed;

  let node: MathNode;
  try {
    node = parseMath(expression).ast;
  } catch (error) {
    throw error instanceof KleinSdkError
      ? error
      : new KleinSdkError('invalid_equation', 'That equation could not be read.');
  }
  assertOnlySpatialSymbols(node);

  return {
    input: trimmed,
    expression,
    field: (x, y, z) => {
      let value: unknown;
      try {
        value = evaluateMathNode(node, { variables: { x, y, z } });
      } catch {
        // A division by zero or a root of a negative is a hole in the domain,
        // not a broken surface: the corner is dropped and the rest still draws.
        return Number.NaN;
      }
      return typeof value === 'number' ? value : Number.NaN;
    },
  };
}

/** Refuses a name nothing will supply, rather than evaluating it to NaN everywhere. */
function assertOnlySpatialSymbols(node: MathNode): void {
  if (node.kind === 'number') return;
  if (node.kind === 'symbol') {
    const name = node.name;
    if (name !== 'x' && name !== 'y' && name !== 'z' && !isSupportedMathConstant(name)) {
      throw new KleinSdkError(
        'invalid_equation',
        `An implicit surface is a function of x, y and z; "${name}" is not one of them.`,
      );
    }
    return;
  }
  if (node.kind === 'unary') { assertOnlySpatialSymbols(node.argument); return; }
  if (node.kind === 'binary') {
    assertOnlySpatialSymbols(node.left);
    assertOnlySpatialSymbols(node.right);
    return;
  }
  if (node.kind === 'functionCall') {
    if (!isSupportedMathFunction(node.name)) {
      throw new KleinSdkError('invalid_equation', `Unsupported function "${node.name}".`);
    }
    for (const argument of node.args) assertOnlySpatialSymbols(argument);
    return;
  }
  // An equation inside an equation, a vector, a matrix: all real nodes the
  // parser can make and none of them a number at a point in space.
  throw new KleinSdkError('unsupported_equation', 'An implicit surface is an expression in x, y and z.');
}

/** A scalar field over space: the surface is where this is zero. */
export type ScalarField3D = (x: number, y: number, z: number) => number;

export interface IsosurfaceBounds3D {
  readonly x: readonly [number, number];
  readonly y: readonly [number, number];
  readonly z: readonly [number, number];
}

export interface IsosurfaceInput3D {
  readonly field: ScalarField3D;
  readonly bounds: IsosurfaceBounds3D;
  /** Cells along each axis. The field is evaluated at `(resolution + 1)³` corners. */
  readonly resolution: number;
  /** The level to extract; zero unless a caller wants a different contour. */
  readonly level?: number;
  /** Refused past this many field evaluations, rather than run. */
  readonly maxEvaluations?: number;
}

export interface Isosurface3D {
  readonly vertices: Vector3[];
  readonly faces: number[][];
  /** How many times the field was evaluated, which is what the budget bounds. */
  readonly evaluations: number;
  /** Corners where the field was not a finite number, and which were skipped. */
  readonly nonFiniteSamples: number;
}

/** How many field evaluations a grid of this resolution costs. */
export function isosurfaceEvaluationCount(resolution: number): number {
  const corners = Math.max(1, Math.floor(resolution)) + 1;
  return corners * corners * corners;
}

/**
 * The largest resolution whose corner grid fits in a budget.
 *
 * <p>So that a host can ask for the best surface a limit allows instead of
 * guessing a number and being refused. Cubic, so a budget eight times larger
 * buys twice the detail - which is worth knowing before choosing one.
 */
export function isosurfaceResolutionWithin(maxEvaluations: number): number {
  if (!Number.isFinite(maxEvaluations) || maxEvaluations < 8) return 0;
  return Math.max(1, Math.floor(Math.cbrt(maxEvaluations)) - 1);
}

/**
 * Walks the surface where the field is zero.
 *
 * <p><b>Tetrahedra rather than cubes, deliberately.</b> The textbook algorithm
 * classifies each cube's eight corners into one of 256 cases and looks the
 * triangles up in a table. Fifteen of those cases are *ambiguous*: two corners
 * of a face are positive and two negative, and the table cannot say whether
 * they join across the face or not. Neighbouring cells resolving that
 * differently leave a hole in the surface, and the standard fix is another few
 * hundred entries of disambiguation table. Splitting each cube into six
 * tetrahedra removes the ambiguity instead of tabulating it: a tetrahedron has
 * four corners and no face with four of them, so there is nothing to be
 * ambiguous about, and the whole case analysis is "one corner apart from the
 * other three" or "two and two". It makes about twice as many triangles for a
 * surface that cannot have holes in it, which for a figure a student rotates is
 * the right way round.
 */
export function marchIsosurface3D(input: IsosurfaceInput3D): Isosurface3D {
  const resolution = Math.max(1, Math.floor(input.resolution));
  const level = input.level ?? 0;
  const evaluations = isosurfaceEvaluationCount(resolution);
  if (input.maxEvaluations !== undefined && evaluations > input.maxEvaluations) {
    throw new KleinSdkError(
      'surface_probe_budget_exceeded',
      `Sampling this surface would evaluate the equation ${evaluations} times, past the limit of ${input.maxEvaluations}.`,
    );
  }

  const corners = resolution + 1;
  const step = {
    x: (input.bounds.x[1] - input.bounds.x[0]) / resolution,
    y: (input.bounds.y[1] - input.bounds.y[0]) / resolution,
    z: (input.bounds.z[1] - input.bounds.z[0]) / resolution,
  };

  // The field is evaluated once per corner into a flat typed array, not once
  // per tetrahedron: every interior corner belongs to eight cells and to
  // dozens of tetrahedra, so evaluating on demand would call a parsed
  // expression tens of times for one number.
  const values = new Float64Array(corners * corners * corners);
  let nonFiniteSamples = 0;
  for (let iz = 0; iz < corners; iz += 1) {
    for (let iy = 0; iy < corners; iy += 1) {
      for (let ix = 0; ix < corners; ix += 1) {
        const value = input.field(
          input.bounds.x[0] + ix * step.x,
          input.bounds.y[0] + iy * step.y,
          input.bounds.z[0] + iz * step.z,
        ) - level;
        const finite = Number.isFinite(value);
        if (!finite) nonFiniteSamples += 1;
        values[(iz * corners + iy) * corners + ix] = finite ? value : Number.NaN;
      }
    }
  }

  const vertices: Vector3[] = [];
  const faces: number[][] = [];
  // Vertices are shared between triangles by remembering the edge each one was
  // cut from. A surface of ten thousand triangles has about half as many
  // distinct vertices, and a mesh that repeated them would cost twice the
  // memory and render with visible seams where the normals disagreed.
  const cut = new Map<string, number>();

  const at = (ix: number, iy: number, iz: number): number =>
    values[(iz * corners + iy) * corners + ix] as number;
  const position = (ix: number, iy: number, iz: number): Vector3 => ({
    x: input.bounds.x[0] + ix * step.x,
    y: input.bounds.y[0] + iy * step.y,
    z: input.bounds.z[0] + iz * step.z,
  });

  const corner: Corner[] = new Array(4);
  for (let iz = 0; iz < resolution; iz += 1) {
    for (let iy = 0; iy < resolution; iy += 1) {
      for (let ix = 0; ix < resolution; ix += 1) {
        for (const tetrahedron of CUBE_TETRAHEDRA) {
          let usable = true;
          for (let index = 0; index < 4; index += 1) {
            const offset = CUBE_CORNERS[tetrahedron[index] as number] as readonly [number, number, number];
            const x = ix + offset[0];
            const y = iy + offset[1];
            const z = iz + offset[2];
            const value = at(x, y, z);
            // A corner the equation could not be evaluated at - a hole in the
            // domain, a division by zero - takes its tetrahedron out rather
            // than the whole surface: the rest of the shape is still true.
            if (Number.isNaN(value)) { usable = false; break; }
            corner[index] = { x, y, z, value };
          }
          if (!usable) continue;
          emitTetrahedron(corner, cut, vertices, faces, position);
        }
      }
    }
  }

  return { vertices, faces, evaluations, nonFiniteSamples };
}

/* -------------------------------------------------------------------------- */
/* One tetrahedron                                                            */
/* -------------------------------------------------------------------------- */

interface Corner {
  x: number;
  y: number;
  z: number;
  value: number;
}

/**
 * The triangles inside one tetrahedron, of which there are at most two.
 *
 * <p>Four corners, each above or below the level, so sixteen sign patterns -
 * and after discarding the two where every corner agrees, and pairing each
 * remaining case with its own negation, there are only two shapes: one corner
 * cut off from the other three, which is a triangle, and two against two, which
 * is a quadrilateral drawn as two triangles. That is the whole case analysis,
 * against 256 entries for cubes.
 */
function emitTetrahedron(
  corner: readonly Corner[],
  cut: Map<string, number>,
  vertices: Vector3[],
  faces: number[][],
  position: (x: number, y: number, z: number) => Vector3,
): void {
  let pattern = 0;
  for (let index = 0; index < 4; index += 1) {
    if ((corner[index] as Corner).value < 0) pattern |= 1 << index;
  }
  // All four on one side: the surface does not pass through here.
  if (pattern === 0 || pattern === 0b1111) return;

  const edges = TETRAHEDRON_CASES[pattern] as readonly (readonly [number, number])[];
  const cutPoints: number[] = [];
  for (const [from, to] of edges) {
    cutPoints.push(vertexOnEdge(
      corner[from] as Corner,
      corner[to] as Corner,
      cut,
      vertices,
      position,
    ));
  }
  faces.push([cutPoints[0] as number, cutPoints[1] as number, cutPoints[2] as number]);
  // A quadrilateral, fanned from its first corner - which is only correct
  // because the table lists its edges in rim order.
  if (cutPoints.length === 4) {
    faces.push([cutPoints[0] as number, cutPoints[2] as number, cutPoints[3] as number]);
  }
}

/**
 * Where along an edge the field crosses zero, remembered so both sides of it
 * share one vertex.
 *
 * <p>Placed by linear interpolation between the two corner values rather than
 * at the midpoint. The midpoint is what makes a sphere look like a cut gem: the
 * surface is only ever as accurate as the grid, and interpolating recovers most
 * of what the grid threw away for the cost of one division.
 */
function vertexOnEdge(
  from: Corner,
  to: Corner,
  cut: Map<string, number>,
  vertices: Vector3[],
  position: (x: number, y: number, z: number) => Vector3,
): number {
  // Keyed on the two grid corners in a fixed order, so the same edge reached
  // from either of the cells sharing it gives back the same vertex.
  const first = `${from.x},${from.y},${from.z}`;
  const second = `${to.x},${to.y},${to.z}`;
  const key = first < second ? `${first}|${second}` : `${second}|${first}`;
  const existing = cut.get(key);
  if (existing !== undefined) return existing;

  const span = to.value - from.value;
  const t = Math.abs(span) < 1e-12 ? 0.5 : Math.min(1, Math.max(0, -from.value / span));
  const start = position(from.x, from.y, from.z);
  const end = position(to.x, to.y, to.z);
  const index = vertices.length;
  vertices.push({
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
    z: start.z + (end.z - start.z) * t,
  });
  cut.set(key, index);
  return index;
}

/** The eight corners of a cell, as offsets from its low corner. */
const CUBE_CORNERS: readonly (readonly [number, number, number])[] = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];

/**
 * Six tetrahedra filling the cell, all sharing the diagonal from corner 0 to
 * corner 6.
 *
 * <p>The same diagonal in every cell, which is what makes neighbouring cells
 * agree on the faces they share - a decomposition that alternated would leave
 * the surface split along the seams between cells.
 */
const CUBE_TETRAHEDRA: readonly (readonly [number, number, number, number])[] = [
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
  [0, 5, 1, 6],
];

/**
 * Which edges the surface crosses, per sign pattern of the four corners.
 *
 * <p>Bit `i` set means corner `i` is below the level. Two entries are empty -
 * every corner on one side, so the surface misses this tetrahedron. Eight cut
 * off a single corner and give a triangle. Six separate two corners from two
 * and give a quadrilateral, whose edges are listed **in order round its rim**:
 * consecutive cut edges share a corner of the tetrahedron, which is what makes
 * them adjacent on the quad, and listing them in any other order draws a bow
 * tie instead of a face.
 *
 * <p>A pattern and its complement cut exactly the same edges - swapping which
 * side is "inside" does not move the surface - so the table is symmetric, and
 * that is the cheapest check that it is right.
 */
const TETRAHEDRON_CASES: readonly (readonly (readonly [number, number])[])[] = [
  [],                                            // 0000: no crossing
  [[0, 1], [0, 2], [0, 3]],                      // 0001: corner 0 alone
  [[1, 0], [1, 2], [1, 3]],                      // 0010: corner 1 alone
  [[0, 2], [0, 3], [1, 3], [1, 2]],              // 0011: 0,1 against 2,3
  [[2, 0], [2, 1], [2, 3]],                      // 0100: corner 2 alone
  [[0, 1], [0, 3], [2, 3], [2, 1]],              // 0101: 0,2 against 1,3
  [[0, 1], [0, 2], [3, 2], [3, 1]],              // 0110: 1,2 against 0,3
  [[3, 0], [3, 1], [3, 2]],                      // 0111: corner 3 alone
  [[3, 0], [3, 1], [3, 2]],                      // 1000: corner 3 alone
  [[0, 1], [0, 2], [3, 2], [3, 1]],              // 1001: 0,3 against 1,2
  [[0, 1], [0, 3], [2, 3], [2, 1]],              // 1010: 1,3 against 0,2
  [[2, 0], [2, 1], [2, 3]],                      // 1011: corner 2 alone
  [[0, 2], [0, 3], [1, 3], [1, 2]],              // 1100: 2,3 against 0,1
  [[1, 0], [1, 2], [1, 3]],                      // 1101: corner 1 alone
  [[0, 1], [0, 2], [0, 3]],                      // 1110: corner 0 alone
  [],                                            // 1111: no crossing
];
