import { KleinSdkError } from '../core/index.js';
import {
  evaluateMathNode,
  isSupportedMathConstant,
  isSupportedMathFunction,
  parseMath,
} from '../math/index.js';
import type { MathNode } from '../math/index.js';
import { sampleRectangularSurface3D } from './surface-sampling.js';
import type {
  CompiledEquationSurface3D,
  EquationAxis3D,
  EquationSurfaceInput3D,
  GeometryLabSnapshot,
  GeometryLabStyleOptions,
  SurfaceEntity3D,
} from './types.js';

const AXES_3D: readonly EquationAxis3D[] = ['x', 'y', 'z'] as const;

/** Compiles a supported explicit 3D equation into its dependent-axis evaluator. */
export function compileEquationSurface3D(
  input: string,
  dependentAxis?: EquationAxis3D,
): CompiledEquationSurface3D {
  const trimmed = input.trim();
  if (!trimmed) throw new KleinSdkError('invalid_equation', 'Equation surface input is required.');
  if (dependentAxis !== undefined && !AXES_3D.includes(dependentAxis)) {
    throw new KleinSdkError('invalid_equation_axis', 'Equation dependent axis must be x, y, or z.');
  }
  const parts = trimmed.split('=').map(part => part.trim());
  if (parts.length > 2) throw new KleinSdkError('unsupported_equation', 'Equation surfaces support one equals sign.');
  if (parts.some(part => !part)) throw new KleinSdkError('invalid_equation', 'Both sides of an equation are required.');

  let axis = dependentAxis;
  let expression = trimmed;
  if (parts.length === 2) {
    const signature = parseEquationFunctionSignature(parts[0] as string);
    if (signature) {
      axis ??= 'z';
      const independentAxes = AXES_3D.filter(candidate => candidate !== axis);
      if (signature.parameters.length > independentAxes.length) {
        throw new KleinSdkError('unsupported_equation', '3D equation functions support at most two parameters.');
      }
      expression = replaceEquationIdentifiers(
        parts[1] as string,
        Object.fromEntries(signature.parameters.map((parameter, index) => [parameter, independentAxes[index] as string])),
      );
    } else {
      const leftAxis = equationAxis(parts[0]);
      const rightAxis = equationAxis(parts[1]);
      const equationDependentAxis = leftAxis ?? rightAxis;
      if (!equationDependentAxis) {
        throw new KleinSdkError('unsupported_equation', 'Use an explicit equation such as z = x^2 + y^2 or y = x^2 + z^2.');
      }
      if (dependentAxis !== undefined && dependentAxis !== equationDependentAxis) {
        throw new KleinSdkError(
          'invalid_equation_axis',
          `Equation declares ${equationDependentAxis} as dependent, which conflicts with dependentAxis ${dependentAxis}.`,
        );
      }
      axis = equationDependentAxis;
      expression = leftAxis ? parts[1] as string : parts[0] as string;
    }
  } else {
    axis ??= 'z';
  }

  if (!axis || !AXES_3D.includes(axis)) {
    throw new KleinSdkError('invalid_equation_axis', 'Equation dependent axis must be x, y, or z.');
  }
  expression = replaceEquationIdentifiers(expression, {});
  let node: MathNode;
  try {
    node = parseMath(expression).ast;
  } catch (error) {
    throw translateEquationMathError(error, 'invalid_equation');
  }
  validateEquationMathNode(node, axis);
  return {
    input: trimmed,
    expression,
    dependentAxis: axis,
    evaluate: variables => {
      let value;
      try {
        value = evaluateMathNode(node, { variables });
      } catch (error) {
        throw translateEquationMathError(error, 'invalid_equation');
      }
      if (typeof value !== 'number') {
        throw new KleinSdkError('invalid_equation', 'Equation surface expression must evaluate to a number.');
      }
      return value;
    },
  };
}

/** Creates the compact authored entity sampled later by canonicalization. */
export function makeAuthoredEquationSurface3D(
  id: string,
  input: EquationSurfaceInput3D,
  style: GeometryLabStyleOptions,
): SurfaceEntity3D {
  return prepareEquationSurface3D(id, input, style).entity;
}

/** Merges an equation edit with the authored domain and grid of its existing entity. */
export function mergeEquationSurfaceInput(
  input: EquationSurfaceInput3D,
  existing: SurfaceEntity3D,
): EquationSurfaceInput3D {
  const merged: EquationSurfaceInput3D = { input: input.input };
  const dependentAxis = input.dependentAxis ?? explicitlyDeclaredEquationAxis(input.input) ?? existing.dependentAxis;
  if (dependentAxis !== undefined) merged.dependentAxis = dependentAxis;
  const xRange = input.xRange ?? existing.domain?.x;
  const yRange = input.yRange ?? existing.domain?.y;
  const zRange = input.zRange ?? existing.domain?.z;
  if (xRange !== undefined) merged.xRange = xRange;
  if (yRange !== undefined) merged.yRange = yRange;
  if (zRange !== undefined) merged.zRange = zRange;
  const existingSamples = Math.max(existing.samples?.x ?? 0, existing.samples?.y ?? 0, existing.samples?.z ?? 0);
  merged.samples = (input.samples ?? existingSamples) || 56;
  return merged;
}

/** Rebuilds deterministic equation meshes from their compact authored state. */
export function canonicalizeEquationSurfaceCaches(
  snapshot: GeometryLabSnapshot,
  entityIds?: ReadonlySet<string>,
): GeometryLabSnapshot {
  const entities = snapshot.scene.scene3d.entities;
  for (const [id, entity] of Object.entries(entities)) {
    if (entityIds && !entityIds.has(id)) continue;
    if (entity.kind !== 'surface3d' || entity.surfaceKind !== 'equation') continue;
    if (entity.input === undefined) {
      throw new KleinSdkError(
        'invalid_equation_surface',
        `Equation surface "${id}" has no authored input and cannot be rebuilt safely.`,
      );
    }
    const input: EquationSurfaceInput3D = { input: entity.input };
    const dependentAxis = explicitlyDeclaredEquationAxis(entity.input) ?? entity.dependentAxis;
    if (dependentAxis !== undefined) input.dependentAxis = dependentAxis;
    if (entity.domain?.x !== undefined) input.xRange = entity.domain.x;
    if (entity.domain?.y !== undefined) input.yRange = entity.domain.y;
    if (entity.domain?.z !== undefined) input.zRange = entity.domain.z;
    const samples = Math.max(entity.samples?.x ?? 0, entity.samples?.y ?? 0, entity.samples?.z ?? 0);
    if (samples > 0) input.samples = samples;
    const style: GeometryLabStyleOptions = {};
    if (entity.label !== undefined) style.label = entity.label;
    if (entity.color !== undefined) style.color = entity.color;
    if (entity.hidden !== undefined) style.hidden = entity.hidden;
    if (entity.locked !== undefined) style.locked = entity.locked;
    entities[id] = makeEquationSurface3D(id, input, style);
  }
  return snapshot;
}

function makeEquationSurface3D(
  id: string,
  input: EquationSurfaceInput3D,
  style: GeometryLabStyleOptions,
): SurfaceEntity3D {
  const prepared = prepareEquationSurface3D(id, input, style);
  const { compiled, firstAxis, secondAxis, firstRange, secondRange, samples } = prepared;
  const sampled = sampleRectangularSurface3D({
    first: { axis: firstAxis, range: firstRange, samples },
    second: { axis: secondAxis, range: secondRange, samples },
    dependentAxis: compiled.dependentAxis,
    evaluate: compiled.evaluate,
  });
  if (!sampled.vertices.length || !sampled.faces.length) {
    throw new KleinSdkError(
      'invalid_surface',
      sampled.vertices.length
        ? 'Equation did not produce any connected finite surface cells.'
        : 'Equation did not produce any finite surface samples.',
    );
  }
  prepared.entity.vertices = sampled.vertices;
  prepared.entity.faces = sampled.faces;
  return prepared.entity;
}

function prepareEquationSurface3D(
  id: string,
  input: EquationSurfaceInput3D,
  style: GeometryLabStyleOptions,
): {
  entity: SurfaceEntity3D;
  compiled: CompiledEquationSurface3D;
  firstAxis: EquationAxis3D;
  secondAxis: EquationAxis3D;
  firstRange: [number, number];
  secondRange: [number, number];
  samples: number;
} {
  const compiled = compileEquationSurface3D(input.input, input.dependentAxis);
  const independentAxes = AXES_3D.filter(axis => axis !== compiled.dependentAxis);
  const firstAxis = independentAxes[0] as EquationAxis3D;
  const secondAxis = independentAxes[1] as EquationAxis3D;
  const firstRange = equationAxisRange(input, firstAxis);
  const secondRange = equationAxisRange(input, secondAxis);
  const samples = clampInt(input.samples ?? 56, 4, 128);
  const entity = withEquationStyle({
    id,
    kind: 'surface3d',
    surfaceKind: 'equation',
    dependentAxis: compiled.dependentAxis,
    input: compiled.input,
    vertices: [],
    faces: [],
    domain: {
      [firstAxis]: firstRange,
      [secondAxis]: secondRange,
    },
    samples: {
      [firstAxis]: samples,
      [secondAxis]: samples,
    },
  }, style);
  return { entity, compiled, firstAxis, secondAxis, firstRange, secondRange, samples };
}

function explicitlyDeclaredEquationAxis(input: string): EquationAxis3D | null {
  const parts = input.split('=').map(part => part.trim());
  if (parts.length !== 2 || /^\s*[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)\s*$/.test(parts[0] ?? '')) return null;
  return equationAxis(parts[0]) ?? equationAxis(parts[1]);
}

function equationAxisRange(input: EquationSurfaceInput3D, axis: EquationAxis3D): [number, number] {
  if (axis === 'x') return normalizedRange(input.xRange, [-3, 3]);
  if (axis === 'y') return normalizedRange(input.yRange, [-3, 3]);
  return normalizedRange(input.zRange, [-3, 3]);
}

function normalizedRange(value: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) return fallback;
  const min = finiteNumberOr(value[0], fallback[0]);
  const max = finiteNumberOr(value[1], fallback[1]);
  return max > min ? [min, max] : fallback;
}

function finiteNumberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)));
}

function withEquationStyle(entity: SurfaceEntity3D, style: GeometryLabStyleOptions): SurfaceEntity3D {
  const next = { ...entity };
  if (style.label !== undefined) next.label = style.label;
  if (style.color !== undefined) next.color = style.color;
  if (style.hidden !== undefined) next.hidden = style.hidden;
  if (style.locked !== undefined) next.locked = style.locked;
  return next;
}

function parseEquationFunctionSignature(input: string): { name: string; parameters: string[] } | null {
  const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*$/.exec(input);
  if (!match) return null;
  const name = (match[1] ?? '').toLowerCase();
  if (!name || equationAxis(name) || isSupportedMathFunction(name) || isSupportedMathConstant(name)) {
    throw new KleinSdkError('unsupported_equation', 'Equation function name must not be an axis, constant, or built-in function.');
  }
  const rawParameters = (match[2] ?? '').trim();
  if (!rawParameters) throw new KleinSdkError('unsupported_equation', 'Equation function notation requires parameters.');
  const parameters = rawParameters.split(',').map(parameter => parameter.trim().toLowerCase());
  if (parameters.some(parameter => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(parameter))) {
    throw new KleinSdkError('unsupported_equation', 'Equation function parameters must be valid identifiers.');
  }
  if (new Set(parameters).size !== parameters.length) {
    throw new KleinSdkError('unsupported_equation', 'Equation function parameters must be unique.');
  }
  return { name, parameters };
}

function replaceEquationIdentifiers(input: string, replacements: Record<string, string>): string {
  return input.replace(/[A-Za-z_][A-Za-z0-9_]*/g, identifier => {
    const normalized = identifier.toLowerCase();
    return replacements[normalized] ?? normalized;
  });
}

function equationAxis(value: string | undefined): EquationAxis3D | null {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'x' || normalized === 'y' || normalized === 'z' ? normalized : null;
}

function validateEquationMathNode(node: MathNode, dependentAxis: EquationAxis3D): void {
  switch (node.kind) {
    case 'number':
      return;
    case 'symbol': {
      const name = node.name.toLowerCase();
      if (name === dependentAxis) {
        throw new KleinSdkError(
          'unsupported_equation',
          `Equation surface ${dependentAxis} must not reference its dependent axis on the other side of the equation.`,
        );
      }
      if (AXES_3D.includes(name as EquationAxis3D) || isSupportedMathConstant(name)) return;
      throw new KleinSdkError('invalid_equation_variable', `Unknown equation variable "${node.name}".`);
    }
    case 'unary':
      validateEquationMathNode(node.argument, dependentAxis);
      return;
    case 'binary':
      validateEquationMathNode(node.left, dependentAxis);
      validateEquationMathNode(node.right, dependentAxis);
      return;
    case 'functionCall':
      if (!isSupportedMathFunction(node.name)) {
        throw new KleinSdkError('invalid_equation_function', `Unknown equation function "${node.name}".`);
      }
      node.args.forEach(argument => validateEquationMathNode(argument, dependentAxis));
      return;
    default:
      throw new KleinSdkError('unsupported_equation', 'Equation surfaces require a scalar arithmetic expression.');
  }
}

function translateEquationMathError(error: unknown, fallbackCode: string): KleinSdkError {
  if (!(error instanceof KleinSdkError)) {
    return new KleinSdkError(fallbackCode, error instanceof Error ? error.message : String(error));
  }
  const code = error.code === 'math_parse_error'
    ? 'invalid_equation'
    : error.code === 'math_unknown_symbol'
      ? 'invalid_equation_variable'
      : error.code === 'math_unknown_function' || error.code === 'math_function_arity'
        ? 'invalid_equation_function'
        : error.code;
  return new KleinSdkError(code, error.message, error.details);
}
