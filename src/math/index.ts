import { KleinSdkError } from '../core/index.js';
import type { JsonObject } from '../core/index.js';

/** Union of expression AST nodes shared by calculators, graphing, algebra, and spreadsheet formulas. */
export type MathNode =
  | NumberNode
  | SymbolNode
  | UnaryNode
  | BinaryNode
  | FunctionCallNode
  | EquationNode
  | InequalityNode
  | VectorNode
  | MatrixNode;

/** Exact textual number node; keeping the string preserves fractions/decimals before evaluation. */
export interface NumberNode {
  kind: 'number';
  value: string;
}

/** Variable, constant, or named object reference. */
export interface SymbolNode {
  kind: 'symbol';
  name: string;
}

/** Unary prefix operation such as `-x`. */
export interface UnaryNode {
  kind: 'unary';
  operator: '+' | '-';
  argument: MathNode;
}

/** Binary arithmetic operation. */
export interface BinaryNode {
  kind: 'binary';
  operator: '+' | '-' | '*' | '/' | '^';
  left: MathNode;
  right: MathNode;
}

/** Safe named function call such as `sqrt(x)` or `sin(x)`. */
export interface FunctionCallNode {
  kind: 'functionCall';
  name: string;
  args: MathNode[];
}

/** Equality relation used by algebra, graphing, and CAS workflows. */
export interface EquationNode {
  kind: 'equation';
  left: MathNode;
  right: MathNode;
}

/** Inequality relation used by graphing and algebra workflows. */
export interface InequalityNode {
  kind: 'inequality';
  operator: '<' | '<=' | '>' | '>=';
  left: MathNode;
  right: MathNode;
}

/** Ordered vector expression. */
export interface VectorNode {
  kind: 'vector';
  values: MathNode[];
}

/** Matrix expression stored row-major. */
export interface MatrixNode {
  kind: 'matrix';
  rows: MathNode[][];
}

/** Evaluated math value. This stays conservative until exact rational/unit types are added. */
export type MathValue = number | string | MathValue[] | JsonObject;

/** Parser result with warnings for recoverable or ambiguous input. */
export interface MathParseResult {
  ast: MathNode;
  warnings: string[];
}

/** Evaluation controls shared by calculator, graphing, spreadsheet, and algebra modules. */
export interface MathEvaluateOptions {
  variables?: Record<string, MathValue>;
  angleMode?: 'degrees' | 'radians';
  maxIterations?: number;
}

/** Shared math kernel facade used by calculators, graphing, algebra, and spreadsheet formulas. */
export interface MathCore {
  parse(input: string): MathParseResult;
  format(node: MathNode, format?: 'plain' | 'latex'): string;
  evaluate(node: MathNode, options?: MathEvaluateOptions): MathValue;
}

type TokenKind =
  | 'number'
  | 'identifier'
  | 'operator'
  | 'leftParen'
  | 'rightParen'
  | 'leftBracket'
  | 'rightBracket'
  | 'comma'
  | 'semicolon'
  | 'eof';

interface Token {
  kind: TokenKind;
  value: string;
  index: number;
}

const EOF_TOKEN: Token = { kind: 'eof', value: '', index: -1 };
const RELATION_OPERATORS = new Set(['=', '<', '<=', '>', '>=']);
const DEFAULT_ANGLE_MODE: Required<Pick<MathEvaluateOptions, 'angleMode'>>['angleMode'] = 'radians';
const SUPPORTED_MATH_FUNCTIONS = new Set([
  'abs', 'acos', 'arccos', 'asin', 'arcsin', 'atan', 'arctan', 'atan2', 'cbrt', 'ceil',
  'cos', 'exp', 'floor', 'hypot', 'ln', 'log', 'max', 'min', 'mod', 'pow', 'round',
  'sign', 'sin', 'sqrt', 'tan',
]);
const SUPPORTED_MATH_CONSTANTS = new Set(['e', 'pi', 'tau']);

/** Reports whether the shared evaluator implements a named scalar function. */
export function isSupportedMathFunction(name: string): boolean {
  return SUPPORTED_MATH_FUNCTIONS.has(name.trim().toLowerCase());
}

/** Reports whether the shared evaluator implements a named scalar constant. */
export function isSupportedMathConstant(name: string): boolean {
  return SUPPORTED_MATH_CONSTANTS.has(name.trim().toLowerCase());
}

/** Creates the math-core facade with parser, formatter, and numeric evaluator. */
export function createMathCore(): MathCore {
  return {
    parse: parseMath,
    format: formatMathNode,
    evaluate: evaluateMathNode,
  };
}

/** Parses a math expression into the shared AST. */
export function parseMath(input: string): MathParseResult {
  const parser = new Parser(input);
  return parser.parse();
}

/** Formats a shared AST as plain text or simple LaTeX. */
export function formatMathNode(node: MathNode, format: 'plain' | 'latex' = 'plain'): string {
  return formatNode(node, format, 0);
}

/** Evaluates a math AST using a safe named-function registry. */
export function evaluateMathNode(node: MathNode, options: MathEvaluateOptions = {}): MathValue {
  return evaluateNode(node, options);
}

/** Evaluates a math AST and requires the final value to be a finite number. */
export function evaluateMathNumber(node: MathNode, options: MathEvaluateOptions = {}): number {
  const value = evaluateMathNode(node, options);
  return requireFiniteNumber(value, 'Expression did not evaluate to a finite number.');
}

/** Returns the left-minus-right residual for an equation or numeric expression. */
export function evaluateMathResidual(node: MathNode, options: MathEvaluateOptions = {}): number {
  if (node.kind === 'equation') {
    return evaluateMathNumber(node.left, options) - evaluateMathNumber(node.right, options);
  }
  if (node.kind === 'inequality') {
    return evaluateMathNumber(node.left, options) - evaluateMathNumber(node.right, options);
  }
  return evaluateMathNumber(node, options);
}

class Parser {
  readonly #tokens: Token[];
  #cursor = 0;

  constructor(input: string) {
    this.#tokens = tokenize(input);
  }

  parse(): MathParseResult {
    const ast = this.#parseRelation();
    this.#expect('eof');
    return { ast, warnings: [] };
  }

  #parseRelation(): MathNode {
    const left = this.#parseExpression();
    const next = this.#peek();
    if (next.kind !== 'operator' || !RELATION_OPERATORS.has(next.value)) {
      return left;
    }
    this.#advance();
    const right = this.#parseExpression();
    if (next.value === '=') {
      return { kind: 'equation', left, right };
    }
    return {
      kind: 'inequality',
      operator: next.value as InequalityNode['operator'],
      left,
      right,
    };
  }

  #parseExpression(): MathNode {
    return this.#parseAdditive();
  }

  #parseAdditive(): MathNode {
    let node = this.#parseMultiplicative();
    while (this.#matchOperator('+') || this.#matchOperator('-')) {
      const operator = this.#previous().value as BinaryNode['operator'];
      const right = this.#parseMultiplicative();
      node = { kind: 'binary', operator, left: node, right };
    }
    return node;
  }

  #parseMultiplicative(): MathNode {
    let node = this.#parseUnary();
    while (true) {
      if (this.#matchOperator('*') || this.#matchOperator('/')) {
        const operator = this.#previous().value as BinaryNode['operator'];
        const right = this.#parseUnary();
        node = { kind: 'binary', operator, left: node, right };
        continue;
      }
      if (this.#isImplicitMultiplicationStart(this.#peek())) {
        const right = this.#parseUnary();
        node = { kind: 'binary', operator: '*', left: node, right };
        continue;
      }
      break;
    }
    return node;
  }

  #parsePower(): MathNode {
    const left = this.#parsePrimary();
    if (!this.#matchOperator('^')) return left;
    const right = this.#parseUnary();
    return { kind: 'binary', operator: '^', left, right };
  }

  #parseUnary(): MathNode {
    if (this.#matchOperator('+') || this.#matchOperator('-')) {
      const operator = this.#previous().value as UnaryNode['operator'];
      return { kind: 'unary', operator, argument: this.#parseUnary() };
    }
    return this.#parsePower();
  }

  #parsePrimary(): MathNode {
    if (this.#match('number')) {
      return { kind: 'number', value: normalizeNumberText(this.#previous().value) };
    }

    if (this.#match('identifier')) {
      const name = this.#previous().value;
      if (this.#match('leftParen')) {
        const args: MathNode[] = [];
        if (!this.#check('rightParen')) {
          do {
            args.push(this.#parseRelation());
          } while (this.#match('comma'));
        }
        this.#expect('rightParen');
        return { kind: 'functionCall', name, args };
      }
      return { kind: 'symbol', name };
    }

    if (this.#match('leftParen')) {
      const expression = this.#parseRelation();
      this.#expect('rightParen');
      return expression;
    }

    if (this.#match('leftBracket')) {
      return this.#parseBracketLiteral();
    }

    const token = this.#peek();
    throw parseError(token, `Unexpected token "${token.value || token.kind}".`);
  }

  #parseBracketLiteral(): MathNode {
    const rows: MathNode[][] = [];
    let currentRow: MathNode[] = [];

    if (this.#match('rightBracket')) {
      return { kind: 'vector', values: [] };
    }

    while (true) {
      currentRow.push(this.#parseRelation());

      if (this.#match('comma')) continue;
      if (this.#match('semicolon')) {
        rows.push(currentRow);
        currentRow = [];
        continue;
      }
      this.#expect('rightBracket');
      rows.push(currentRow);
      break;
    }

    if (rows.length > 1) {
      return { kind: 'matrix', rows };
    }

    const onlyRow = rows[0] ?? [];
    if (onlyRow.length > 0 && onlyRow.every(item => item.kind === 'vector')) {
      return {
        kind: 'matrix',
        rows: onlyRow.map(item => (item as VectorNode).values),
      };
    }

    return { kind: 'vector', values: onlyRow };
  }

  #isImplicitMultiplicationStart(token: Token): boolean {
    return token.kind === 'number'
      || token.kind === 'identifier'
      || token.kind === 'leftParen'
      || token.kind === 'leftBracket';
  }

  #match(kind: TokenKind): boolean {
    if (!this.#check(kind)) return false;
    this.#advance();
    return true;
  }

  #matchOperator(operator: string): boolean {
    const token = this.#peek();
    if (token.kind !== 'operator' || token.value !== operator) return false;
    this.#advance();
    return true;
  }

  #expect(kind: TokenKind): Token {
    if (this.#check(kind)) return this.#advance();
    const token = this.#peek();
    throw parseError(token, `Expected ${kind}, found "${token.value || token.kind}".`);
  }

  #check(kind: TokenKind): boolean {
    return this.#peek().kind === kind;
  }

  #advance(): Token {
    if (this.#cursor < this.#tokens.length) this.#cursor += 1;
    return this.#previous();
  }

  #peek(): Token {
    return this.#tokens[this.#cursor] ?? EOF_TOKEN;
  }

  #previous(): Token {
    return this.#tokens[this.#cursor - 1] ?? EOF_TOKEN;
  }
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index] ?? '';
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (isNumberStart(input, index)) {
      const start = index;
      index = readNumber(input, index);
      tokens.push({ kind: 'number', value: input.slice(start, index), index: start });
      continue;
    }

    if (isIdentifierStart(char)) {
      const start = index;
      index += 1;
      while (index < input.length && isIdentifierPart(input[index] ?? '')) index += 1;
      tokens.push({ kind: 'identifier', value: input.slice(start, index), index: start });
      continue;
    }

    if (char === '(') {
      tokens.push({ kind: 'leftParen', value: char, index });
      index += 1;
      continue;
    }
    if (char === ')') {
      tokens.push({ kind: 'rightParen', value: char, index });
      index += 1;
      continue;
    }
    if (char === '[') {
      tokens.push({ kind: 'leftBracket', value: char, index });
      index += 1;
      continue;
    }
    if (char === ']') {
      tokens.push({ kind: 'rightBracket', value: char, index });
      index += 1;
      continue;
    }
    if (char === ',') {
      tokens.push({ kind: 'comma', value: char, index });
      index += 1;
      continue;
    }
    if (char === ';') {
      tokens.push({ kind: 'semicolon', value: char, index });
      index += 1;
      continue;
    }

    if ('+-*/^='.includes(char)) {
      tokens.push({ kind: 'operator', value: char, index });
      index += 1;
      continue;
    }

    if (char === '<' || char === '>') {
      const start = index;
      index += 1;
      if (input[index] === '=') index += 1;
      tokens.push({ kind: 'operator', value: input.slice(start, index), index: start });
      continue;
    }

    throw new KleinSdkError('math_parse_error', `Unexpected character "${char}" at index ${index}.`, { index });
  }

  tokens.push({ kind: 'eof', value: '', index: input.length });
  return tokens;
}

function readNumber(input: string, start: number): number {
  let index = start;
  while (index < input.length && /\d/.test(input[index] ?? '')) index += 1;
  if (input[index] === '.') {
    index += 1;
    while (index < input.length && /\d/.test(input[index] ?? '')) index += 1;
  }
  const exponent = input[index];
  if (exponent === 'e' || exponent === 'E') {
    const exponentStart = index;
    index += 1;
    if (input[index] === '+' || input[index] === '-') index += 1;
    const digitStart = index;
    while (index < input.length && /\d/.test(input[index] ?? '')) index += 1;
    if (digitStart === index) return exponentStart;
  }
  return index;
}

function isNumberStart(input: string, index: number): boolean {
  const char = input[index] ?? '';
  const next = input[index + 1] ?? '';
  return /\d/.test(char) || (char === '.' && /\d/.test(next));
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_]/.test(char);
}

function isIdentifierPart(char: string): boolean {
  return /[A-Za-z0-9_]/.test(char);
}

function normalizeNumberText(value: string): string {
  if (value.startsWith('.')) return `0${value}`;
  return value;
}

function parseError(token: Token, message: string): KleinSdkError {
  return new KleinSdkError('math_parse_error', message, { index: token.index });
}

function evaluateNode(node: MathNode, options: MathEvaluateOptions): MathValue {
  switch (node.kind) {
    case 'number':
      return Number(node.value);
    case 'symbol':
      return evaluateSymbol(node.name, options);
    case 'unary': {
      const value = requireFiniteNumber(evaluateNode(node.argument, options), `Unary ${node.operator} expects a number.`);
      return node.operator === '-' ? -value : value;
    }
    case 'binary':
      return evaluateBinary(node, options);
    case 'functionCall':
      return evaluateFunctionCall(node, options);
    case 'equation': {
      const left = evaluateNode(node.left, options);
      const right = evaluateNode(node.right, options);
      const leftNumber = requireFiniteNumber(left, 'Equation left side must evaluate to a number.');
      const rightNumber = requireFiniteNumber(right, 'Equation right side must evaluate to a number.');
      return {
        left: leftNumber,
        right: rightNumber,
        residual: leftNumber - rightNumber,
        equal: Math.abs(leftNumber - rightNumber) < 1e-9,
      };
    }
    case 'inequality': {
      const left = requireFiniteNumber(evaluateNode(node.left, options), 'Inequality left side must evaluate to a number.');
      const right = requireFiniteNumber(evaluateNode(node.right, options), 'Inequality right side must evaluate to a number.');
      return {
        left,
        right,
        operator: node.operator,
        satisfied: compareInequality(left, right, node.operator),
      };
    }
    case 'vector':
      return node.values.map(value => evaluateNode(value, options));
    case 'matrix':
      return node.rows.map(row => row.map(value => evaluateNode(value, options)));
  }
}

function evaluateSymbol(name: string, options: MathEvaluateOptions): MathValue {
  const key = name.trim();
  const lower = key.toLowerCase();
  if (lower === 'pi') return Math.PI;
  if (lower === 'e') return Math.E;
  if (lower === 'tau') return Math.PI * 2;
  if (options.variables && Object.prototype.hasOwnProperty.call(options.variables, key)) {
    return options.variables[key] as MathValue;
  }
  throw new KleinSdkError('math_unknown_symbol', `Unknown symbol "${name}".`, { symbol: name });
}

function evaluateBinary(node: BinaryNode, options: MathEvaluateOptions): number {
  const left = requireFiniteNumber(evaluateNode(node.left, options), `Operator ${node.operator} expects numeric operands.`);
  const right = requireFiniteNumber(evaluateNode(node.right, options), `Operator ${node.operator} expects numeric operands.`);
  switch (node.operator) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      return left / right;
    case '^':
      return left ** right;
  }
}

function evaluateFunctionCall(node: FunctionCallNode, options: MathEvaluateOptions): number {
  const name = node.name.toLowerCase();
  const args = node.args.map(arg => requireFiniteNumber(
    evaluateNode(arg, options),
    `Function ${node.name} expects numeric arguments.`,
  ));
  const angleMode = options.angleMode ?? DEFAULT_ANGLE_MODE;
  const toRadians = (value: number): number => angleMode === 'degrees' ? value * Math.PI / 180 : value;
  const fromRadians = (value: number): number => angleMode === 'degrees' ? value * 180 / Math.PI : value;

  switch (name) {
    case 'sin':
      expectArity(name, args, 1);
      return Math.sin(toRadians(args[0] as number));
    case 'cos':
      expectArity(name, args, 1);
      return Math.cos(toRadians(args[0] as number));
    case 'tan':
      expectArity(name, args, 1);
      return Math.tan(toRadians(args[0] as number));
    case 'asin':
    case 'arcsin':
      expectArity(name, args, 1);
      return fromRadians(Math.asin(args[0] as number));
    case 'acos':
    case 'arccos':
      expectArity(name, args, 1);
      return fromRadians(Math.acos(args[0] as number));
    case 'atan':
    case 'arctan':
      expectArity(name, args, 1);
      return fromRadians(Math.atan(args[0] as number));
    case 'sqrt':
      expectArity(name, args, 1);
      return Math.sqrt(args[0] as number);
    case 'cbrt':
      expectArity(name, args, 1);
      return Math.cbrt(args[0] as number);
    case 'abs':
      expectArity(name, args, 1);
      return Math.abs(args[0] as number);
    case 'ln':
      expectArity(name, args, 1);
      return Math.log(args[0] as number);
    case 'log':
      if (args.length === 1) return Math.log10(args[0] as number);
      if (args.length === 2) return Math.log(args[0] as number) / Math.log(args[1] as number);
      throw invalidArity(name, '1 or 2', args.length);
    case 'exp':
      expectArity(name, args, 1);
      return Math.exp(args[0] as number);
    case 'floor':
      expectArity(name, args, 1);
      return Math.floor(args[0] as number);
    case 'ceil':
      expectArity(name, args, 1);
      return Math.ceil(args[0] as number);
    case 'round':
      expectArity(name, args, 1);
      return Math.round(args[0] as number);
    case 'sign':
      expectArity(name, args, 1);
      return Math.sign(args[0] as number);
    case 'min':
      expectMinimumArity(name, args, 1);
      return Math.min(...args);
    case 'max':
      expectMinimumArity(name, args, 1);
      return Math.max(...args);
    case 'pow':
      expectArity(name, args, 2);
      return (args[0] as number) ** (args[1] as number);
    case 'mod':
      expectArity(name, args, 2);
      return (args[0] as number) % (args[1] as number);
    case 'hypot':
      expectMinimumArity(name, args, 1);
      return Math.hypot(...args);
    case 'atan2':
      expectArity(name, args, 2);
      return fromRadians(Math.atan2(args[0] as number, args[1] as number));
    default:
      throw new KleinSdkError('math_unknown_function', `Unknown function "${node.name}".`, { function: node.name });
  }
}

function compareInequality(left: number, right: number, operator: InequalityNode['operator']): boolean {
  switch (operator) {
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '>':
      return left > right;
    case '>=':
      return left >= right;
  }
}

function requireFiniteNumber(value: MathValue, message: string): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(number)) {
    throw new KleinSdkError('math_evaluation_error', message);
  }
  return number;
}

function expectArity(name: string, args: number[], expected: number): void {
  if (args.length !== expected) throw invalidArity(name, String(expected), args.length);
}

function expectMinimumArity(name: string, args: number[], expected: number): void {
  if (args.length < expected) {
    throw new KleinSdkError(
      'math_function_arity',
      `Function ${name} expects at least ${expected} argument(s), received ${args.length}.`,
      { function: name, expected, actual: args.length },
    );
  }
}

function invalidArity(name: string, expected: string, actual: number): KleinSdkError {
  return new KleinSdkError(
    'math_function_arity',
    `Function ${name} expects ${expected} argument(s), received ${actual}.`,
    { function: name, expected, actual },
  );
}

function formatNode(node: MathNode, format: 'plain' | 'latex', parentPrecedence: number): string {
  switch (node.kind) {
    case 'number':
      return node.value;
    case 'symbol':
      if (format === 'latex' && node.name.toLowerCase() === 'pi') return '\\pi';
      return node.name;
    case 'unary': {
      const value = `${node.operator}${formatNode(node.argument, format, precedence(node))}`;
      return maybeParenthesize(value, precedence(node), parentPrecedence);
    }
    case 'binary':
      return formatBinary(node, format, parentPrecedence);
    case 'functionCall':
      return formatFunctionCall(node, format);
    case 'equation':
      return `${formatNode(node.left, format, 0)} = ${formatNode(node.right, format, 0)}`;
    case 'inequality':
      return `${formatNode(node.left, format, 0)} ${node.operator} ${formatNode(node.right, format, 0)}`;
    case 'vector':
      return `[${node.values.map(value => formatNode(value, format, 0)).join(', ')}]`;
    case 'matrix':
      if (format === 'latex') {
        const rows = node.rows.map(row => row.map(value => formatNode(value, format, 0)).join(' & ')).join(' \\\\ ');
        return `\\begin{bmatrix}${rows}\\end{bmatrix}`;
      }
      return `[${node.rows.map(row => row.map(value => formatNode(value, format, 0)).join(', ')).join('; ')}]`;
  }
}

function formatBinary(node: BinaryNode, format: 'plain' | 'latex', parentPrecedence: number): string {
  const own = precedence(node);
  if (format === 'latex' && node.operator === '/') {
    return `\\frac{${formatNode(node.left, format, 0)}}{${formatNode(node.right, format, 0)}}`;
  }
  if (format === 'latex' && node.operator === '^') {
    const value = `${formatNode(node.left, format, 5)}^{${formatNode(node.right, format, 0)}}`;
    return maybeParenthesize(value, own, parentPrecedence);
  }
  const operator = format === 'latex' && node.operator === '*' ? '\\cdot' : node.operator;
  const left = formatNode(node.left, format, node.operator === '^' ? 5 : own);
  const right = formatNode(node.right, format, node.operator === '^' ? own : own + 1);
  return maybeParenthesize(`${left} ${operator} ${right}`, own, parentPrecedence);
}

function formatFunctionCall(node: FunctionCallNode, format: 'plain' | 'latex'): string {
  if (format === 'latex' && node.name.toLowerCase() === 'sqrt' && node.args.length === 1) {
    return `\\sqrt{${formatNode(node.args[0] as MathNode, format, 0)}}`;
  }
  const args = node.args.map(arg => formatNode(arg, format, 0)).join(', ');
  return `${node.name}(${args})`;
}

function precedence(node: MathNode): number {
  if (node.kind === 'unary') return 4;
  if (node.kind !== 'binary') return 5;
  if (node.operator === '+' || node.operator === '-') return 1;
  if (node.operator === '*' || node.operator === '/') return 2;
  return 3;
}

function maybeParenthesize(value: string, ownPrecedence: number, parentPrecedence: number): string {
  return ownPrecedence < parentPrecedence ? `(${value})` : value;
}
