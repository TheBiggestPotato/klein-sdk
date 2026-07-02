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

/** Shared math kernel facade. The current implementation is a scaffold, not a full parser/CAS yet. */
export interface MathCore {
  parse(input: string): MathParseResult;
  format(node: MathNode, format?: 'plain' | 'latex'): string;
  evaluate(node: MathNode, options?: MathEvaluateOptions): MathValue;
}

/** Creates the initial math-core facade; real parser/evaluator work will replace these stubs. */
export function createMathCore(): MathCore {
  return {
    parse(input) {
      return { ast: { kind: 'symbol', name: input.trim() }, warnings: [] };
    },
    format(node) {
      if (node.kind === 'symbol') {
        return node.name;
      }
      if (node.kind === 'number') {
        return node.value;
      }
      return JSON.stringify(node);
    },
    evaluate(node) {
      if (node.kind === 'number') {
        return Number(node.value);
      }
      throw new Error('Math evaluation is not implemented yet.');
    },
  };
}
