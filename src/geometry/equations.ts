import type { Vector2 } from '../core/index.js';
import { KleinSdkError, createIdFactory } from '../core/index.js';
import type { GeometryConicEquation, GeometryLineEquation, GeometryPoint2D, LineEntity, RayEntity, SegmentEntity } from '../geometry-core/index.js';
import { distance2D, lineEquationFrom2DPoints } from '../geometry-core/index.js';
import { farthestPair, normalizeVector, pointWithinBounds, uniquePoints } from './geometry-math.js';
import { point2D } from './scene.js';
import type { CirclePolynomial, GeometryCalculatorScene, GeometryCircleEquation, LinearExpression, WorldBounds } from './types.js';

/** Parses common line equation forms into `a*x + b*y + c = 0`. */
export function parseGeometryLineEquation(input: string): GeometryLineEquation {
  const raw = input.trim();
  if (!raw) {
    throw new KleinSdkError('invalid_line_equation', 'Line equation cannot be empty.');
  }

  const normalized = raw
    .replace(/\u2212/g, '-')
    .replace(/\s+/g, '')
    .toLowerCase();
  const parts = normalized.split('=');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new KleinSdkError(
      'invalid_line_equation',
      'Use a linear equation such as y=2x+1, x=3, or 2x+3y-4=0.',
      raw,
    );
  }

  const left = parseLinearExpression(parts[0]);
  const right = parseLinearExpression(parts[1]);
  return normalizeLineEquation({
    a: left.a - right.a,
    b: left.b - right.b,
    c: left.c - right.c,
    input: raw,
  });
}


/** Parses common circle equation forms into center-radius form. */
export function parseGeometryCircleEquation(input: string): GeometryCircleEquation {
  const raw = input.trim();
  if (!raw) {
    throw new KleinSdkError('invalid_circle_equation', 'Circle equation cannot be empty.');
  }
  const normalized = raw
    .replace(/\u2212/g, '-')
    .replace(/\*\*/g, '^')
    .replace(/\s+/g, '')
    .toLowerCase();

  const centerRadius = parseCenterRadiusCircleEquation(normalized, raw);
  if (centerRadius) return centerRadius;

  const parts = normalized.split('=');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new KleinSdkError(
      'invalid_circle_equation',
      'Use a circle equation such as (x-1)^2+(y+2)^2=9 or x^2+y^2-2x+4y-4=0.',
      raw,
    );
  }

  const left = parseCirclePolynomial(parts[0], 1);
  const right = parseCirclePolynomial(parts[1], -1);
  const x2 = left.x2 + right.x2;
  const y2 = left.y2 + right.y2;
  const x = left.x + right.x;
  const y = left.y + right.y;
  const c = left.c + right.c;
  if (Math.abs(x2 - y2) > 1e-9 || Math.abs(x2) < 1e-12) {
    throw new KleinSdkError('invalid_circle_equation', 'Circle equation must have matching x^2 and y^2 coefficients.', raw);
  }
  const center = {
    x: -x / (2 * x2),
    y: -y / (2 * x2),
  };
  const radiusSquared = (x * x + y * y) / (4 * x2 * x2) - c / x2;
  if (!Number.isFinite(radiusSquared) || radiusSquared <= 0) {
    throw new KleinSdkError('invalid_circle_equation', 'Circle equation radius must be positive.', raw);
  }
  return normalizeCircleEquation({ center, radius: Math.sqrt(radiusSquared), input: raw });
}


export function normalizeCircleEquation(equation: GeometryCircleEquation): GeometryCircleEquation {
  if (!Number.isFinite(equation.center.x) || !Number.isFinite(equation.center.y)) {
    throw new KleinSdkError('invalid_circle_equation', 'Circle center must be finite.');
  }
  if (!Number.isFinite(equation.radius) || equation.radius <= 0) {
    throw new KleinSdkError('invalid_circle_equation', 'Circle radius must be positive.');
  }
  const result: GeometryCircleEquation = {
    center: { x: equation.center.x, y: equation.center.y },
    radius: equation.radius,
  };
  if (equation.input !== undefined) result.input = equation.input;
  return result;
}


/** Returns a normalized line equation through two distinct 2D points. */
export function lineEquationFromPoints(a: Vector2, b: Vector2): GeometryLineEquation {
  const equation = lineEquationFrom2DPoints(a, b);
  if (!equation) {
    throw new KleinSdkError('degenerate_line', 'A line needs two distinct points.');
  }
  return equation;
}


export function parseCenterRadiusCircleEquation(normalized: string, raw: string): GeometryCircleEquation | null {
  const match = normalized.match(/^\(?x(?<x>[+-](?:\d+(?:\.\d+)?|\.\d+))?\)?\^2\+\(?y(?<y>[+-](?:\d+(?:\.\d+)?|\.\d+))?\)?\^2=(?<rhs>.+)$/);
  if (!match?.groups) return null;
  const xOffset = match.groups.x ? parseScalar(match.groups.x) : 0;
  const yOffset = match.groups.y ? parseScalar(match.groups.y) : 0;
  return normalizeCircleEquation({
    center: { x: -xOffset, y: -yOffset },
    radius: parseCircleRadiusInput(match.groups.rhs ?? ''),
    input: raw,
  });
}


export function parseCircleRadiusInput(input: string): number {
  const squared = input.match(/^(?<base>[+-]?(?:\d+(?:\.\d+)?|\.\d+))\^2$/);
  if (squared?.groups?.base) return Math.abs(parseScalar(squared.groups.base));
  const value = parseScalar(input);
  if (value <= 0) {
    throw new KleinSdkError('invalid_circle_equation', 'Circle radius squared must be positive.');
  }
  return Math.sqrt(value);
}


export function parseCirclePolynomial(input: string, sign: 1 | -1): CirclePolynomial {
  const compact = input.replace(/\*/g, '');
  const terms = compact.match(/[+-]?[^+-]+/g);
  if (!terms?.length) {
    throw new KleinSdkError('invalid_circle_equation', `Invalid expression: ${input}`);
  }
  const result: CirclePolynomial = { x2: 0, y2: 0, x: 0, y: 0, c: 0 };
  for (const term of terms) {
    const termSign = (term.startsWith('-') ? -1 : 1) * sign;
    const unsigned = term.replace(/^[+-]/, '');
    if (!unsigned) continue;
    if (unsigned.includes('xy')) {
      throw new KleinSdkError('invalid_circle_equation', `Unsupported circle term: ${term}`);
    }
    if (unsigned.endsWith('x^2')) {
      result.x2 += termSign * parsePowerCoefficient(unsigned, 'x');
    } else if (unsigned.endsWith('y^2')) {
      result.y2 += termSign * parsePowerCoefficient(unsigned, 'y');
    } else if (unsigned.endsWith('x')) {
      result.x += termSign * parseCoefficient(unsigned, 'x');
    } else if (unsigned.endsWith('y')) {
      result.y += termSign * parseCoefficient(unsigned, 'y');
    } else {
      result.c += termSign * parseScalar(unsigned);
    }
  }
  return result;
}


export function parsePowerCoefficient(term: string, variable: 'x' | 'y'): number {
  const suffix = `${variable}^2`;
  if (!term.endsWith(suffix)) {
    throw new KleinSdkError('invalid_circle_equation', `Invalid quadratic term: ${term}`);
  }
  const coefficient = term.slice(0, -suffix.length);
  return coefficient ? parseScalar(coefficient) : 1;
}


export function parseLinearExpression(input: string): LinearExpression {
  const compact = input.replace(/\*/g, '');
  const terms = compact.match(/[+-]?[^+-]+/g);
  if (!terms?.length) {
    throw new KleinSdkError('invalid_line_equation', `Invalid expression: ${input}`);
  }
  const result: LinearExpression = { a: 0, b: 0, c: 0 };
  for (const term of terms) {
    const sign = term.startsWith('-') ? -1 : 1;
    const unsigned = term.replace(/^[+-]/, '');
    if (!unsigned) continue;
    if (unsigned.includes('x')) {
      result.a += sign * parseCoefficient(unsigned, 'x');
    } else if (unsigned.includes('y')) {
      result.b += sign * parseCoefficient(unsigned, 'y');
    } else {
      result.c += sign * parseScalar(unsigned);
    }
  }
  return result;
}


export function parseCoefficient(term: string, variable: 'x' | 'y'): number {
  if ((term.match(/[xy]/g) ?? []).length !== 1 || !term.endsWith(variable)) {
    throw new KleinSdkError('invalid_line_equation', `Invalid linear term: ${term}`);
  }
  const coefficient = term.slice(0, -1);
  return coefficient ? parseScalar(coefficient) : 1;
}


export function parseScalar(input: string): number {
  if (input.includes('/')) {
    const [numerator, denominator] = input.split('/');
    const n = Number(numerator);
    const d = Number(denominator);
    if (Number.isFinite(n) && Number.isFinite(d) && Math.abs(d) > 1e-12) return n / d;
  }
  const value = Number(input);
  if (!Number.isFinite(value)) {
    throw new KleinSdkError('invalid_line_equation', `Invalid number in equation: ${input}`);
  }
  return value;
}


export type ScalarEvaluator = (t: number) => number;


export interface ExpressionToken {
  type: 'number' | 'identifier' | 'operator' | 'paren' | 'comma';
  value: string;
}


export function compileScalarExpression(input: string): ScalarEvaluator {
  const tokens = tokenizeScalarExpression(input);
  let index = 0;

  const peek = (): ExpressionToken | undefined => tokens[index];
  const consume = (): ExpressionToken | undefined => tokens[index++];
  const match = (value: string): boolean => {
    if (peek()?.value !== value) return false;
    index += 1;
    return true;
  };

  const parseExpression = (): ScalarEvaluator => {
    let left = parseTerm();
    while (peek()?.value === '+' || peek()?.value === '-') {
      const operator = consume()?.value;
      const right = parseTerm();
      const previous = left;
      left = operator === '+'
        ? t => previous(t) + right(t)
        : t => previous(t) - right(t);
    }
    return left;
  };

  const parseTerm = (): ScalarEvaluator => {
    let left = parsePower();
    while (peek()?.value === '*' || peek()?.value === '/') {
      const operator = consume()?.value;
      const right = parsePower();
      const previous = left;
      left = operator === '*'
        ? t => previous(t) * right(t)
        : t => previous(t) / right(t);
    }
    return left;
  };

  const parsePower = (): ScalarEvaluator => {
    const left = parseUnary();
    if (!match('^')) return left;
    const right = parsePower();
    return t => Math.pow(left(t), right(t));
  };

  const parseUnary = (): ScalarEvaluator => {
    if (match('+')) return parseUnary();
    if (match('-')) {
      const value = parseUnary();
      return t => -value(t);
    }
    return parsePrimary();
  };

  const parsePrimary = (): ScalarEvaluator => {
    const token = consume();
    if (!token) {
      throw new KleinSdkError('invalid_expression', `Invalid expression: ${input}`);
    }
    if (token.type === 'number') {
      const value = Number(token.value);
      return () => value;
    }
    if (token.value === '(') {
      const expression = parseExpression();
      if (!match(')')) {
        throw new KleinSdkError('invalid_expression', `Missing ")" in expression: ${input}`);
      }
      return expression;
    }
    if (token.type === 'identifier') {
      const name = token.value.toLowerCase();
      if (match('(')) {
        const args: ScalarEvaluator[] = [];
        if (!match(')')) {
          do {
            args.push(parseExpression());
          } while (match(','));
          if (!match(')')) {
            throw new KleinSdkError('invalid_expression', `Missing ")" in function call: ${input}`);
          }
        }
        return t => evaluateScalarFunction(name, args.map(arg => arg(t)));
      }
      if (name === 't') return t => t;
      if (name === 'pi') return () => Math.PI;
      if (name === 'e') return () => Math.E;
      throw new KleinSdkError('invalid_expression', `Unknown symbol: ${token.value}`);
    }
    throw new KleinSdkError('invalid_expression', `Unexpected token: ${token.value}`);
  };

  const evaluator = parseExpression();
  if (index < tokens.length) {
    throw new KleinSdkError('invalid_expression', `Unexpected token: ${tokens[index]?.value}`);
  }
  return evaluator;
}


export function tokenizeScalarExpression(input: string): ExpressionToken[] {
  const tokens: ExpressionToken[] = [];
  let index = 0;
  const source = input.replace(/\u2212/g, '-').replace(/\*\*/g, '^');
  while (index < source.length) {
    const char = source[index];
    if (!char) break;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && /[0-9.eE+-]/.test(source[index] ?? '')) {
        const current = source[index] ?? '';
        const previous = source[index - 1] ?? '';
        if ((current === '+' || current === '-') && previous.toLowerCase() !== 'e') break;
        index += 1;
      }
      const value = source.slice(start, index);
      if (!Number.isFinite(Number(value))) {
        throw new KleinSdkError('invalid_expression', `Invalid number: ${value}`);
      }
      tokens.push({ type: 'number', value });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index] ?? '')) index += 1;
      tokens.push({ type: 'identifier', value: source.slice(start, index) });
      continue;
    }
    if ('+-*/^'.includes(char)) {
      tokens.push({ type: 'operator', value: char });
      index += 1;
      continue;
    }
    if (char === '(' || char === ')') {
      tokens.push({ type: 'paren', value: char });
      index += 1;
      continue;
    }
    if (char === ',') {
      tokens.push({ type: 'comma', value: char });
      index += 1;
      continue;
    }
    throw new KleinSdkError('invalid_expression', `Unsupported character: ${char}`);
  }
  return tokens;
}


export function evaluateScalarFunction(name: string, args: number[]): number {
  const unary = (fn: (value: number) => number): number => {
    if (args.length !== 1) throw new KleinSdkError('invalid_expression', `${name} expects one argument.`);
    return fn(args[0] as number);
  };
  switch (name) {
    case 'sin':
      return unary(Math.sin);
    case 'cos':
      return unary(Math.cos);
    case 'tan':
      return unary(Math.tan);
    case 'asin':
      return unary(Math.asin);
    case 'acos':
      return unary(Math.acos);
    case 'atan':
      return unary(Math.atan);
    case 'sqrt':
      return unary(Math.sqrt);
    case 'abs':
      return unary(Math.abs);
    case 'log':
    case 'ln':
      return unary(Math.log);
    case 'exp':
      return unary(Math.exp);
    case 'floor':
      return unary(Math.floor);
    case 'ceil':
      return unary(Math.ceil);
    case 'round':
      return unary(Math.round);
    case 'min':
      if (args.length < 1) throw new KleinSdkError('invalid_expression', 'min expects at least one argument.');
      return Math.min(...args);
    case 'max':
      if (args.length < 1) throw new KleinSdkError('invalid_expression', 'max expects at least one argument.');
      return Math.max(...args);
    case 'pow':
      if (args.length !== 2) throw new KleinSdkError('invalid_expression', 'pow expects two arguments.');
      return Math.pow(args[0] as number, args[1] as number);
    default:
      throw new KleinSdkError('invalid_expression', `Unsupported function: ${name}`);
  }
}


export function normalizeLineEquation(equation: GeometryLineEquation): GeometryLineEquation {
  const magnitude = Math.hypot(equation.a, equation.b);
  if (!Number.isFinite(magnitude) || magnitude < 1e-12 || !Number.isFinite(equation.c)) {
    throw new KleinSdkError('invalid_line_equation', 'Line equation must have a finite x or y coefficient.');
  }
  const normalized: GeometryLineEquation = {
    a: equation.a / magnitude,
    b: equation.b / magnitude,
    c: equation.c / magnitude,
  };
  if (equation.input !== undefined) normalized.input = equation.input;
  return normalized;
}


export function sameGeometryLineEquation(first: GeometryLineEquation, second: GeometryLineEquation): boolean {
  const sameDirection = Math.abs(first.a - second.a) <= 1e-9
    && Math.abs(first.b - second.b) <= 1e-9
    && Math.abs(first.c - second.c) <= 1e-9;
  const oppositeDirection = Math.abs(first.a + second.a) <= 1e-9
    && Math.abs(first.b + second.b) <= 1e-9
    && Math.abs(first.c + second.c) <= 1e-9;
  return sameDirection || oppositeDirection;
}


export function helperPointsForEquation(
  equation: GeometryLineEquation,
  ids: ReturnType<typeof createIdFactory>,
  color: string,
): [GeometryPoint2D, GeometryPoint2D] {
  let first: Vector2;
  let second: Vector2;
  if (Math.abs(equation.b) >= Math.abs(equation.a)) {
    first = { x: -2, y: solveLineY(equation, -2) };
    second = { x: 2, y: solveLineY(equation, 2) };
  } else {
    first = { x: solveLineX(equation, -2), y: -2 };
    second = { x: solveLineX(equation, 2), y: 2 };
  }
  return [
    { id: ids.next('p'), kind: 'point2d', x: first.x, y: first.y, color, hidden: true, locked: true },
    { id: ids.next('p'), kind: 'point2d', x: second.x, y: second.y, color, hidden: true, locked: true },
  ];
}


export function solveLineY(equation: GeometryLineEquation, x: number): number {
  return -(equation.a * x + equation.c) / equation.b;
}


export function solveLineX(equation: GeometryLineEquation, y: number): number {
  return -(equation.b * y + equation.c) / equation.a;
}


export function projectPointToLineEquation(point: Vector2, equation: GeometryLineEquation): Vector2 {
  const distance = equation.a * point.x + equation.b * point.y + equation.c;
  return {
    x: point.x - equation.a * distance,
    y: point.y - equation.b * distance,
  };
}


export function conicEquationFromQuadratic(
  center: Vector2,
  rotation: number,
  localX2: number,
  localY2: number,
  constant: number,
): GeometryConicEquation {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const a = cos * cos * localX2 + sin * sin * localY2;
  const b = 2 * cos * sin * (localX2 - localY2);
  const c = sin * sin * localX2 + cos * cos * localY2;
  const d = -2 * a * center.x - b * center.y;
  const e = -b * center.x - 2 * c * center.y;
  const f = a * center.x * center.x + b * center.x * center.y + c * center.y * center.y + constant;
  return { a, b, c, d, e, f };
}


export function parabolaEquation(vertex: Vector2, rotation: number, focalLength: number): GeometryConicEquation {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const a = cos * cos;
  const b = 2 * cos * sin;
  const c = sin * sin;
  const d = -2 * a * vertex.x - b * vertex.y + 4 * focalLength * sin;
  const e = -b * vertex.x - 2 * c * vertex.y - 4 * focalLength * cos;
  const f = a * vertex.x * vertex.x
    + b * vertex.x * vertex.y
    + c * vertex.y * vertex.y
    - 4 * focalLength * sin * vertex.x
    + 4 * focalLength * cos * vertex.y;
  return { a, b, c, d, e, f };
}


export function lineEquationFromEntityPoints(scene: GeometryCalculatorScene, entity: LineEntity): GeometryLineEquation | null {
  const a = point2D(scene, entity.pointIds[0]);
  const b = point2D(scene, entity.pointIds[1]);
  if (!a || !b) return null;
  return lineEquationFromPoints(a, b);
}


export function entityLineEquation(
  scene: GeometryCalculatorScene,
  entity: SegmentEntity | LineEntity | RayEntity,
): GeometryLineEquation {
  if (entity.kind === 'line' && entity.equation) return entity.equation;
  const a = point2D(scene, entity.pointIds[0]);
  const b = point2D(scene, entity.pointIds[1]);
  if (!a || !b) {
    throw new KleinSdkError('missing_point', 'Line entity references missing points.');
  }
  return lineEquationFromPoints(a, b);
}


export function clipLineToBounds(equation: GeometryLineEquation, bounds: WorldBounds): [Vector2, Vector2] | null {
  const candidates: Vector2[] = [];
  if (Math.abs(equation.b) > 1e-12) {
    for (const x of [bounds.minX, bounds.maxX]) {
      const y = solveLineY(equation, x);
      if (y >= bounds.minY - 1e-9 && y <= bounds.maxY + 1e-9) candidates.push({ x, y });
    }
  }
  if (Math.abs(equation.a) > 1e-12) {
    for (const y of [bounds.minY, bounds.maxY]) {
      const x = solveLineX(equation, y);
      if (x >= bounds.minX - 1e-9 && x <= bounds.maxX + 1e-9) candidates.push({ x, y });
    }
  }
  const unique = uniquePoints(candidates);
  if (unique.length < 2) return null;
  return farthestPair(unique);
}


export function clipRayToBounds(a: Vector2, b: Vector2, bounds: WorldBounds): [Vector2, Vector2] | null {
  const equation = lineEquationFromPoints(a, b);
  const clipped = clipLineToBounds(equation, bounds);
  if (!clipped) return null;
  const direction = normalizeVector({ x: b.x - a.x, y: b.y - a.y });
  if (!direction) return null;
  const forward = clipped.filter(point => ((point.x - a.x) * direction.x + (point.y - a.y) * direction.y) >= -1e-9);
  if (pointWithinBounds(a, bounds)) {
    if (!forward.length) return null;
    return [a, forward.reduce((best, point) => distance2D(a, point) > distance2D(a, best) ? point : best, forward[0] as Vector2)];
  }
  if (forward.length >= 2) return farthestPair(forward);
  return null;
}

