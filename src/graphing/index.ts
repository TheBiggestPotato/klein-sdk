import { createIdFactory, createInstrumentRuntime, KleinSdkError } from '../core/index.js';
import { KLEIN_UI_FONT_STACK } from '../theme/index.js';
import type {
  ApplyDeltaOptions,
  DeltaMeta,
  ExportOptions,
  ExportResult,
  InstrumentOptions,
  InstrumentSnapshot,
  JsonValue,
  KleinInstrument,
  KleinToolRuntime,
  LoadOptions,
  ToolCommand,
  ValidationIssue,
  ValidationResult,
  View2D,
} from '../core/index.js';
import {
  evaluateMathNumber,
  evaluateMathResidual,
  formatMathNode,
  parseMath,
} from '../math/index.js';
import type { MathEvaluateOptions, MathNode, MathValue } from '../math/index.js';

/** Tool ids for the 2D graphing calculator. */
export type GraphingTool =
  | 'select'
  | 'pan'
  | 'zoom'
  | 'expression'
  | 'point'
  | 'table'
  | 'trace'
  | 'tangent'
  | 'intersection'
  | 'root'
  | 'extremum'
  | 'integral'
  | 'regression'
  | 'slider';

/** Graph viewport in both generic pan/zoom terms and math-coordinate bounds. */
export interface GraphViewport extends View2D {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export type GraphExpressionKind = 'explicit' | 'implicit' | 'parametric' | 'polar' | 'inequality';

/** Persisted expression row in the graphing calculator. */
export interface GraphExpression {
  id: string;
  kind: GraphExpressionKind;
  ast: MathNode;
  color: string;
  visible: boolean;
  domain?: [number, number];
  input?: string;
  label?: string;
}

/** Labeled point plotted in graph coordinates. */
export interface GraphPoint {
  id: string;
  x: number;
  y: number;
  label?: string;
  color?: string;
}

/** Numeric slider value available as a variable in graph expressions. */
export interface GraphSlider {
  id: string;
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  color?: string;
  visible?: boolean;
}

/** Persisted graphing scene: expression rows, free points, sliders, and display order. */
export interface GraphingScene {
  expressions: Record<string, GraphExpression>;
  points: Record<string, GraphPoint>;
  sliders: Record<string, GraphSlider>;
  order: string[];
}

/** UI state for graphing, including viewport and current selection. */
export interface GraphingAppState {
  viewport: GraphViewport;
  activeTool?: GraphingTool;
  selectedIds?: string[];
}

/** Versioned graphing calculator snapshot. */
export type GraphingSnapshot = InstrumentSnapshot<GraphingScene, GraphingAppState> & {
  version: 1;
  instrument: 'graphing';
  appState: GraphingAppState;
};

/** Graphing edit operations for expression rows, points, sliders, and viewport changes. */
export type GraphingDelta =
  | { op: 'addExpression'; expression: GraphExpression; index?: number }
  | { op: 'updateExpression'; id: string; changes: Partial<GraphExpression> }
  | { op: 'addPoint'; point: GraphPoint; index?: number }
  | { op: 'updatePoint'; id: string; changes: Partial<GraphPoint> }
  | { op: 'addSlider'; slider: GraphSlider; index?: number }
  | { op: 'updateSlider'; id: string; changes: Partial<GraphSlider> }
  | { op: 'delete'; ids: string[] }
  | { op: 'setViewport'; viewport: GraphViewport }
  | { op: 'setTool'; tool: GraphingTool }
  | { op: 'setSelection'; ids: string[] }
  | { op: 'setOrder'; order: string[] }
  | { op: 'clear' }
  | { op: 'batch'; deltas: GraphingDelta[] };

/** Graphing factory options layered over the common instrument options. */
export type GraphingOptions = InstrumentOptions<GraphingSnapshot, GraphingDelta> & {
  samples?: number;
  showGrid?: boolean;
};

export interface GraphExpressionInputOptions {
  id?: string;
  kind?: GraphExpressionKind;
  color?: string;
  visible?: boolean;
  domain?: [number, number];
  label?: string;
}

export interface GraphSliderInputOptions {
  id?: string;
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  color?: string;
  visible?: boolean;
}

export interface GraphPointInputOptions {
  id?: string;
  label?: string;
  color?: string;
}

export interface GraphSamplePoint {
  x: number;
  y: number;
}

export interface GraphPlotSegment {
  expressionId: string;
  points: GraphSamplePoint[];
}

export interface GraphPlotOptions {
  samples?: number;
  variables?: Record<string, MathValue>;
  angleMode?: 'degrees' | 'radians';
}

export interface GraphAnalysisPoint {
  x: number;
  y: number;
  kind: 'root' | 'intersection';
  expressionIds: string[];
}

export interface ParsedGraphExpression {
  kind: GraphExpressionKind;
  ast: MathNode;
  warnings: string[];
}

export interface GraphEvaluationOptions {
  angleMode?: 'degrees' | 'radians';
}

export interface GraphingCalculator extends KleinInstrument<GraphingSnapshot, GraphingDelta, GraphingTool> {
  importJson(input: string | JsonValue, options?: LoadOptions): void;
  addExpression(input: string, options?: GraphExpressionInputOptions): string;
  updateExpression(id: string, changes: Partial<GraphExpression> | string): void;
  addPoint(x: number, y: number, options?: GraphPointInputOptions): string;
  addSlider(name: string, options?: GraphSliderInputOptions): string;
  setSliderValue(idOrName: string, value: number): void;
  setViewport(viewport: GraphViewport): void;
  evaluateExpression(id: string, variable: number, variables?: Record<string, MathValue>): number;
  sampleExpression(id: string, options?: GraphPlotOptions): GraphPlotSegment[];
  getPlotSamples(options?: GraphPlotOptions): GraphPlotSegment[];
  findRoots(id: string, options?: GraphPlotOptions): GraphAnalysisPoint[];
  findIntersections(firstExpressionId: string, secondExpressionId: string, options?: GraphPlotOptions): GraphAnalysisPoint[];
}

type HistoryEntry = {
  before: GraphingSnapshot;
  after: GraphingSnapshot;
};

const DEFAULT_VIEWPORT: GraphViewport = {
  x: 0,
  y: 0,
  zoom: 1,
  xMin: -10,
  xMax: 10,
  yMin: -10,
  yMax: 10,
};

const DEFAULT_COLORS = [
  '#3157d5',
  '#d43f4b',
  '#16845f',
  '#dd6b20',
  '#7754d8',
  '#0f8f9f',
  '#d53f8c',
  '#5f6c7d',
];

const DEFAULT_SAMPLE_COUNT = 320;
const ROOT_EPSILON = 1e-8;

/** Creates the default empty graphing document with a -10..10 viewport. */
export function createEmptyGraphingSnapshot(): GraphingSnapshot {
  return {
    version: 1,
    instrument: 'graphing',
    scene: {
      expressions: {},
      points: {},
      sliders: {},
      order: [],
    },
    appState: {
      viewport: { ...DEFAULT_VIEWPORT },
      activeTool: 'select',
      selectedIds: [],
    },
  };
}

/** Parses untrusted JSON input into a validated graphing snapshot. */
export function parseGraphingSnapshotJson(input: string | JsonValue): GraphingSnapshot {
  const value = typeof input === 'string' ? parseJson(input) : input;
  const validation = validateGraphingSnapshot(value);
  if (!validation.ok) {
    throw new KleinSdkError(
      'invalid_graphing_snapshot',
      'Graphing snapshot is invalid.',
      validationIssuesToJson(validation.issues),
    );
  }
  return normalizeGraphingSnapshot(validation.value);
}

/** Validates the persisted graphing snapshot shape. */
export function validateGraphingSnapshot(value: unknown): ValidationResult<GraphingSnapshot> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: '', message: 'Snapshot must be an object.' }] };
  }
  if (value.version !== 1) issues.push({ path: 'version', message: 'Graphing snapshot version must be 1.' });
  if (value.instrument !== 'graphing') issues.push({ path: 'instrument', message: 'Snapshot instrument must be graphing.' });
  if (!isRecord(value.scene)) {
    issues.push({ path: 'scene', message: 'Graphing scene must be an object.' });
  } else {
    if (!isRecord(value.scene.expressions)) issues.push({ path: 'scene.expressions', message: 'Expressions must be an object.' });
    if (!isRecord(value.scene.points)) issues.push({ path: 'scene.points', message: 'Points must be an object.' });
    if (value.scene.sliders !== undefined && !isRecord(value.scene.sliders)) {
      issues.push({ path: 'scene.sliders', message: 'Sliders must be an object when present.' });
    }
    if (!Array.isArray(value.scene.order)) issues.push({ path: 'scene.order', message: 'Order must be an array.' });
  }
  if (!isRecord(value.appState)) {
    issues.push({ path: 'appState', message: 'Graphing appState must be an object.' });
  } else if (!isRecord(value.appState.viewport)) {
    issues.push({ path: 'appState.viewport', message: 'Graphing viewport must be an object.' });
  }
  return issues.length
    ? { ok: false, issues }
    : { ok: true, value: value as unknown as GraphingSnapshot };
}

/** Validates the graphing delta envelope before it is accepted from a host or collaborator. */
export function validateGraphingDelta(value: unknown): ValidationResult<GraphingDelta> {
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: '', message: 'Graphing delta must be an object.' }] };
  }
  const validOps: Array<GraphingDelta['op']> = [
    'addExpression',
    'updateExpression',
    'addPoint',
    'updatePoint',
    'addSlider',
    'updateSlider',
    'delete',
    'setViewport',
    'setTool',
    'setSelection',
    'setOrder',
    'clear',
    'batch',
  ];
  if (!validOps.includes(value.op as GraphingDelta['op'])) {
    return { ok: false, issues: [{ path: 'op', message: 'Graphing delta op is unsupported.' }] };
  }
  return { ok: true, value: value as GraphingDelta };
}

/** Parses a user expression and classifies it for graphing. */
export function parseGraphExpression(input: string, options: { kind?: GraphExpressionKind } = {}): ParsedGraphExpression {
  const parsed = parseMath(input);
  if (options.kind) {
    return { kind: options.kind, ast: parsed.ast, warnings: parsed.warnings };
  }

  if (parsed.ast.kind === 'equation') {
    const functionDefinition = graphFunctionDefinition(parsed.ast.left, parsed.ast.right)
      ?? graphFunctionDefinition(parsed.ast.right, parsed.ast.left);
    if (functionDefinition) {
      return {
        kind: 'explicit',
        ast: functionDefinition.ast,
        warnings: [
          ...parsed.warnings,
          `Interpreted ${functionDefinition.name}(${functionDefinition.parameter}) as an explicit graph.`,
        ],
      };
    }
    if (isSymbol(parsed.ast.left, 'y')) {
      return { kind: 'explicit', ast: parsed.ast.right, warnings: parsed.warnings };
    }
    if (isSymbol(parsed.ast.right, 'y')) {
      return { kind: 'explicit', ast: parsed.ast.left, warnings: parsed.warnings };
    }
    return { kind: 'implicit', ast: parsed.ast, warnings: parsed.warnings };
  }

  if (parsed.ast.kind === 'inequality') {
    return { kind: 'inequality', ast: parsed.ast, warnings: parsed.warnings };
  }

  return { kind: 'explicit', ast: parsed.ast, warnings: parsed.warnings };
}

function graphFunctionDefinition(left: MathNode, right: MathNode): { name: string; parameter: string; ast: MathNode } | null {
  if (left.kind !== 'functionCall' || left.args.length !== 1) return null;
  const [parameter] = left.args;
  if (!parameter || parameter.kind !== 'symbol') return null;
  const parameterName = parameter.name;
  const sampledNames = new Set(['x', 't', 'theta']);
  return {
    name: left.name,
    parameter: parameterName,
    ast: sampledNames.has(parameterName) ? right : replaceMathSymbol(right, parameterName, 'x'),
  };
}

function replaceMathSymbol(node: MathNode, from: string, to: string): MathNode {
  switch (node.kind) {
    case 'number':
      return node;
    case 'symbol':
      return node.name === from ? { ...node, name: to } : node;
    case 'unary':
      return { ...node, argument: replaceMathSymbol(node.argument, from, to) };
    case 'binary':
      return { ...node, left: replaceMathSymbol(node.left, from, to), right: replaceMathSymbol(node.right, from, to) };
    case 'functionCall':
      return { ...node, args: node.args.map(arg => replaceMathSymbol(arg, from, to)) };
    case 'equation':
      return { ...node, left: replaceMathSymbol(node.left, from, to), right: replaceMathSymbol(node.right, from, to) };
    case 'inequality':
      return { ...node, left: replaceMathSymbol(node.left, from, to), right: replaceMathSymbol(node.right, from, to) };
    case 'vector':
      return { ...node, values: node.values.map(value => replaceMathSymbol(value, from, to)) };
    case 'matrix':
      return { ...node, rows: node.rows.map(row => row.map(value => replaceMathSymbol(value, from, to))) };
  }
}

/** Applies a graphing delta to a snapshot and returns a normalized clone. */
export function applyGraphingCalculatorDelta(
  snapshot: GraphingSnapshot,
  delta: GraphingDelta,
): GraphingSnapshot {
  const next = cloneSnapshot(snapshot);
  applyGraphingDeltaMutable(next, delta);
  return normalizeGraphingSnapshot(next);
}

/** Evaluates a graph expression for the supplied variable value. */
export function evaluateGraphExpression(
  expression: GraphExpression,
  variable: number,
  variables: Record<string, MathValue> = {},
  options: GraphEvaluationOptions = {},
): number {
  const evaluationVariables: Record<string, MathValue> = {
    ...variables,
    x: variable,
    t: variable,
    theta: variable,
  };

  if (expression.kind === 'implicit' || expression.kind === 'inequality') {
    return evaluateMathResidual(expression.ast, mathEvaluateOptions(evaluationVariables, options.angleMode));
  }

  return evaluateMathNumber(expression.ast, mathEvaluateOptions(evaluationVariables, options.angleMode));
}

/** Samples graphable expression types into SVG/canvas-friendly polyline segments. */
export function sampleGraphExpression(
  expression: GraphExpression,
  viewport: GraphViewport,
  options: GraphPlotOptions = {},
): GraphPlotSegment[] {
  if (!expression.visible) return [];
  if (expression.kind === 'implicit' || expression.kind === 'inequality') return [];

  const samples = positiveInteger(options.samples, DEFAULT_SAMPLE_COUNT);
  const variables = options.variables ?? {};
  const domain = expression.domain ?? (expression.kind === 'parametric' || expression.kind === 'polar'
    ? [0, Math.PI * 2]
    : [viewport.xMin, viewport.xMax]);
  const start = Math.max(domain[0], expression.kind === 'explicit' ? viewport.xMin : domain[0]);
  const end = Math.min(domain[1], expression.kind === 'explicit' ? viewport.xMax : domain[1]);
  if (!(end > start)) return [];

  const segments: GraphPlotSegment[] = [];
  let current: GraphSamplePoint[] = [];
  let previous: GraphSamplePoint | null = null;
  const maxJump = Math.max(1, viewport.yMax - viewport.yMin) * 4;

  for (let index = 0; index <= samples; index += 1) {
    const parameter = start + (end - start) * (index / samples);
    const point = evaluatePlotPoint(expression, parameter, variables, options);

    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      pushSegment(segments, expression.id, current);
      current = [];
      previous = null;
      continue;
    }

    if (previous && Math.abs(point.y - previous.y) > maxJump) {
      pushSegment(segments, expression.id, current);
      current = [];
    }

    current.push(point);
    previous = point;
  }

  pushSegment(segments, expression.id, current);
  return segments;
}

/** Finds approximate roots for an explicit graph expression over the viewport/domain. */
export function findGraphRoots(
  expression: GraphExpression,
  viewport: GraphViewport,
  options: GraphPlotOptions = {},
): GraphAnalysisPoint[] {
  if (expression.kind !== 'explicit' || !expression.visible) return [];
  const variables = options.variables ?? {};
  const domain = expression.domain ?? [viewport.xMin, viewport.xMax];
  const start = Math.max(domain[0], viewport.xMin);
  const end = Math.min(domain[1], viewport.xMax);
  const samples = positiveInteger(options.samples, DEFAULT_SAMPLE_COUNT);
  const roots: GraphAnalysisPoint[] = [];
  let previousX = start;
  let previousY = safeEvaluate(expression, previousX, variables, options);

  for (let index = 1; index <= samples; index += 1) {
    const x = start + (end - start) * (index / samples);
    const y = safeEvaluate(expression, x, variables, options);
    if (previousY === null || y === null) {
      previousX = x;
      previousY = y;
      continue;
    }
    if (Math.abs(previousY) < ROOT_EPSILON) {
      addUniqueAnalysisPoint(roots, { x: previousX, y: 0, kind: 'root', expressionIds: [expression.id] });
    } else if (previousY * y < 0) {
      const root = bisectRoot(expression, previousX, x, variables, options);
      addUniqueAnalysisPoint(roots, { x: root, y: 0, kind: 'root', expressionIds: [expression.id] });
    }
    previousX = x;
    previousY = y;
  }

  return roots;
}

/** Finds approximate intersections between two explicit graph expressions. */
export function findGraphIntersections(
  first: GraphExpression,
  second: GraphExpression,
  viewport: GraphViewport,
  options: GraphPlotOptions = {},
): GraphAnalysisPoint[] {
  if (first.kind !== 'explicit' || second.kind !== 'explicit' || !first.visible || !second.visible) return [];
  const variables = options.variables ?? {};
  const firstDomain = first.domain ?? [viewport.xMin, viewport.xMax];
  const secondDomain = second.domain ?? [viewport.xMin, viewport.xMax];
  const start = Math.max(firstDomain[0], secondDomain[0], viewport.xMin);
  const end = Math.min(firstDomain[1], secondDomain[1], viewport.xMax);
  if (!(end > start)) return [];

  const samples = positiveInteger(options.samples, DEFAULT_SAMPLE_COUNT);
  const intersections: GraphAnalysisPoint[] = [];
  let previousX = start;
  let previousDifference = safeDifference(first, second, previousX, variables, options);

  for (let index = 1; index <= samples; index += 1) {
    const x = start + (end - start) * (index / samples);
    const difference = safeDifference(first, second, x, variables, options);
    if (previousDifference === null || difference === null) {
      previousX = x;
      previousDifference = difference;
      continue;
    }
    if (Math.abs(previousDifference) < ROOT_EPSILON || previousDifference * difference < 0) {
      const intersectionX = bisectIntersection(first, second, previousX, x, variables, options);
      const y = safeEvaluate(first, intersectionX, variables, options);
      if (y !== null) {
        addUniqueAnalysisPoint(intersections, {
          x: intersectionX,
          y,
          kind: 'intersection',
          expressionIds: [first.id, second.id],
        });
      }
    }
    previousX = x;
    previousDifference = difference;
  }

  return intersections;
}

/** Creates a standalone graphing calculator instrument. */
export function createGraphingCalculator(
  options: GraphingOptions = {},
): GraphingCalculator {
  return new GraphingCalculatorImpl(options);
}

/** Creates the shared v0 runtime wrapper for the graphing calculator. */
export function createGraphingRuntime(
  options: GraphingOptions = {},
): KleinToolRuntime<GraphingSnapshot, GraphingDelta, ToolCommand> {
  return createInstrumentRuntime({
    toolKey: 'graphing',
    instrument: createGraphingCalculator(options),
    validateSnapshot: validateGraphingSnapshot,
    validateDelta: validateGraphingDelta,
  });
}

class GraphingCalculatorImpl implements GraphingCalculator {
  readonly id: string;
  readonly kind = 'graphing';

  readonly #ids = createIdFactory();
  readonly #options: GraphingOptions;
  readonly #deltaListeners = new Set<(delta: GraphingDelta, meta: DeltaMeta) => void>();
  #snapshot: GraphingSnapshot;
  #undoStack: HistoryEntry[] = [];
  #redoStack: HistoryEntry[] = [];
  #container: HTMLElement | undefined;
  #root: HTMLDivElement | undefined;

  constructor(options: GraphingOptions) {
    this.#options = options;
    this.id = this.#ids.next('graphing');
    this.#snapshot = normalizeGraphingSnapshot(options.initialSnapshot ?? createEmptyGraphingSnapshot());
    if (options.container) this.mount(options.container);
  }

  mount(container: HTMLElement): void {
    this.destroy();
    this.#container = container;
    container.dataset.kleinInstrument = 'graphing';
    const root = document.createElement('div');
    root.className = 'kg-root';
    root.innerHTML = this.renderHtml();
    this.#root = root;
    container.append(root);
  }

  destroy(): void {
    this.#root?.remove();
    this.#root = undefined;
    if (this.#container?.dataset.kleinInstrument === 'graphing') {
      delete this.#container.dataset.kleinInstrument;
    }
    this.#container = undefined;
  }

  getSnapshot(): GraphingSnapshot {
    return cloneSnapshot(this.#snapshot);
  }

  subscribeDelta(listener: (delta: GraphingDelta, meta: DeltaMeta) => void): () => void {
    this.#deltaListeners.add(listener);
    return () => this.#deltaListeners.delete(listener);
  }

  loadSnapshot(snapshot: GraphingSnapshot, options?: LoadOptions): void {
    const previousViewport = options?.preserveView ? this.#snapshot.appState.viewport : undefined;
    this.#snapshot = normalizeGraphingSnapshot(snapshot);
    if (previousViewport) {
      this.#snapshot.appState = { ...this.#snapshot.appState, viewport: previousViewport };
    }
    this.#undoStack = [];
    this.#redoStack = [];
    this.render();
  }

  importJson(input: string | JsonValue, options?: LoadOptions): void {
    this.loadSnapshot(parseGraphingSnapshotJson(input), options);
  }

  applyDelta(delta: GraphingDelta, options: ApplyDeltaOptions = {}): void {
    const source = options.meta?.source ?? 'remote';
    const meta = options.meta;
    const commitOptions: { emit: boolean; source: DeltaMeta['source']; recordHistory: boolean; meta?: Partial<DeltaMeta> } = {
      emit: options.emit ?? false,
      source,
      recordHistory: source === 'local',
    };
    if (meta) commitOptions.meta = meta;
    this.commitDelta(delta, commitOptions);
  }

  setTool(tool: GraphingTool): void {
    this.commitLocal({ op: 'setTool', tool }, false);
  }

  undo(): void {
    const entry = this.#undoStack.pop();
    if (!entry) return;
    this.#snapshot = cloneSnapshot(entry.before);
    this.#redoStack.push({ before: cloneSnapshot(entry.before), after: cloneSnapshot(entry.after) });
    this.emitSnapshotReplacement('history');
    this.render();
  }

  redo(): void {
    const entry = this.#redoStack.pop();
    if (!entry) return;
    this.#snapshot = cloneSnapshot(entry.after);
    this.#undoStack.push({ before: cloneSnapshot(entry.before), after: cloneSnapshot(entry.after) });
    this.emitSnapshotReplacement('history');
    this.render();
  }

  async export(options: ExportOptions): Promise<ExportResult> {
    if (options.format === 'json') {
      const snapshot = cloneSnapshot(this.#snapshot);
      if (options.includeAppState === false) {
        const { appState: _appState, ...withoutAppState } = snapshot;
        return { format: 'json', mimeType: 'application/json', data: withoutAppState as unknown as JsonValue };
      }
      return { format: 'json', mimeType: 'application/json', data: snapshot as unknown as JsonValue };
    }
    if (options.format === 'svg') {
      return {
        format: 'svg',
        mimeType: 'image/svg+xml',
        data: exportGraphingSvg(this.#snapshot, options, this.plotOptions()),
      };
    }
    if (options.format === 'csv') {
      return {
        format: 'csv',
        mimeType: 'text/csv',
        data: exportGraphingCsv(this.#snapshot, this.plotOptions()),
      };
    }
    if (options.format === 'text') {
      return {
        format: 'text',
        mimeType: 'text/plain',
        data: this.#snapshot.scene.order
          .map(id => this.#snapshot.scene.expressions[id])
          .filter((expression): expression is GraphExpression => Boolean(expression))
          .map(expression => expression.input ?? formatMathNode(expression.ast))
          .join('\n'),
      };
    }
    throw new KleinSdkError('unsupported_export', `Graphing calculator does not support ${options.format} export yet.`);
  }

  addExpression(input: string, options: GraphExpressionInputOptions = {}): string {
    const parsed = parseGraphExpression(input, options);
    const expression: GraphExpression = {
      id: options.id ?? this.#ids.next('expr'),
      kind: parsed.kind,
      ast: parsed.ast,
      color: options.color ?? nextColor(this.#snapshot.scene.order.length),
      visible: options.visible ?? true,
      input,
    };
    if (options.domain) expression.domain = sanitizeDomain(options.domain);
    if (options.label) expression.label = options.label;
    this.commitLocal({ op: 'addExpression', expression }, true);
    return expression.id;
  }

  updateExpression(id: string, changes: Partial<GraphExpression> | string): void {
    if (typeof changes === 'string') {
      const existing = this.requireExpression(id);
      const parseOptions: { kind?: GraphExpressionKind } = {};
      if (existing.kind !== 'explicit') parseOptions.kind = existing.kind;
      const parsed = parseGraphExpression(changes, parseOptions);
      this.commitLocal({
        op: 'updateExpression',
        id,
        changes: {
          kind: parsed.kind,
          ast: parsed.ast,
          input: changes,
        },
      }, true);
      return;
    }
    this.commitLocal({ op: 'updateExpression', id, changes }, true);
  }

  addPoint(x: number, y: number, options: GraphPointInputOptions = {}): string {
    const point: GraphPoint = {
      id: options.id ?? this.#ids.next('point'),
      x: finite(x, 'Point x must be finite.'),
      y: finite(y, 'Point y must be finite.'),
    };
    if (options.label) point.label = options.label;
    if (options.color) point.color = options.color;
    this.commitLocal({ op: 'addPoint', point }, true);
    return point.id;
  }

  addSlider(name: string, options: GraphSliderInputOptions = {}): string {
    const slider: GraphSlider = {
      id: options.id ?? this.#ids.next('slider'),
      name: sanitizeSliderName(name),
      value: finite(options.value ?? 1, 'Slider value must be finite.'),
      min: finite(options.min ?? -10, 'Slider minimum must be finite.'),
      max: finite(options.max ?? 10, 'Slider maximum must be finite.'),
      step: positive(options.step, 0.1),
      visible: options.visible ?? true,
    };
    if (slider.max < slider.min) {
      throw new KleinSdkError('invalid_slider', 'Slider max must be greater than or equal to min.');
    }
    slider.value = clamp(slider.value, slider.min, slider.max);
    if (options.color) slider.color = options.color;
    this.commitLocal({ op: 'addSlider', slider }, true);
    return slider.id;
  }

  setSliderValue(idOrName: string, value: number): void {
    const slider = this.findSlider(idOrName);
    const nextValue = clamp(finite(value, 'Slider value must be finite.'), slider.min, slider.max);
    this.commitLocal({ op: 'updateSlider', id: slider.id, changes: { value: nextValue } }, true);
  }

  setViewport(viewport: GraphViewport): void {
    this.commitLocal({ op: 'setViewport', viewport: sanitizeViewport(viewport) }, false);
  }

  evaluateExpression(id: string, variable: number, variables: Record<string, MathValue> = {}): number {
    return evaluateGraphExpression(
      this.requireExpression(id),
      variable,
      { ...this.sliderVariables(), ...variables },
    );
  }

  sampleExpression(id: string, options: GraphPlotOptions = {}): GraphPlotSegment[] {
    return sampleGraphExpression(
      this.requireExpression(id),
      this.#snapshot.appState.viewport,
      this.withSliderVariables(options),
    );
  }

  getPlotSamples(options: GraphPlotOptions = {}): GraphPlotSegment[] {
    const plotOptions = this.withSliderVariables(options);
    const segments: GraphPlotSegment[] = [];
    for (const id of this.#snapshot.scene.order) {
      const expression = this.#snapshot.scene.expressions[id];
      if (!expression) continue;
      segments.push(...sampleGraphExpression(expression, this.#snapshot.appState.viewport, plotOptions));
    }
    return segments;
  }

  findRoots(id: string, options: GraphPlotOptions = {}): GraphAnalysisPoint[] {
    return findGraphRoots(
      this.requireExpression(id),
      this.#snapshot.appState.viewport,
      this.withSliderVariables(options),
    );
  }

  findIntersections(firstExpressionId: string, secondExpressionId: string, options: GraphPlotOptions = {}): GraphAnalysisPoint[] {
    return findGraphIntersections(
      this.requireExpression(firstExpressionId),
      this.requireExpression(secondExpressionId),
      this.#snapshot.appState.viewport,
      this.withSliderVariables(options),
    );
  }

  private commitLocal(delta: GraphingDelta, recordHistory: boolean): void {
    if (this.#options.readOnly) {
      throw new KleinSdkError('readonly', 'Graphing calculator is read-only.');
    }
    this.commitDelta(delta, {
      emit: true,
      source: 'local',
      recordHistory,
    });
  }

  private commitDelta(
    delta: GraphingDelta,
    options: { emit: boolean; source: DeltaMeta['source']; recordHistory: boolean; meta?: Partial<DeltaMeta> },
  ): void {
    const before = cloneSnapshot(this.#snapshot);
    this.#snapshot = applyGraphingCalculatorDelta(this.#snapshot, delta);
    if (options.recordHistory) {
      this.#undoStack.push({ before, after: cloneSnapshot(this.#snapshot) });
      this.#redoStack = [];
    }
    if (options.emit) this.emit(delta, options.source, options.meta);
    this.render();
  }

  private emit(delta: GraphingDelta, source: DeltaMeta['source'], meta?: Partial<DeltaMeta>): void {
    const eventMeta: DeltaMeta = {
      id: meta?.id ?? this.#ids.next('delta'),
      createdAt: meta?.createdAt ?? Date.now(),
      source,
    };
    if (meta?.actorId !== undefined) eventMeta.actorId = meta.actorId;
    const listeners = [
      ...(this.#options.onDelta ? [this.#options.onDelta] : []),
      ...this.#deltaListeners,
    ];
    for (const listener of listeners) {
      try {
        listener(structuredClone(delta), { ...eventMeta });
      } catch (error) {
        this.#notifyObserverError(error);
      }
    }
  }

  #notifyObserverError(error: unknown): void {
    const sdkError = error instanceof KleinSdkError
      ? error
      : new KleinSdkError('graphing_observer_failed', error instanceof Error ? error.message : 'A graphing delta observer failed.');
    try {
      this.#options.onError?.(sdkError);
    } catch {
      // Error observers are isolated from committed graphing transactions.
    }
  }

  private emitSnapshotReplacement(source: DeltaMeta['source']): void {
    const snapshot = this.#snapshot;
    const deltas: GraphingDelta[] = [{ op: 'clear' }];
    for (const id of snapshot.scene.order) {
      const expression = snapshot.scene.expressions[id];
      if (expression) {
        deltas.push({ op: 'addExpression', expression: structuredClone(expression) });
        continue;
      }
      const point = snapshot.scene.points[id];
      if (point) {
        deltas.push({ op: 'addPoint', point: structuredClone(point) });
        continue;
      }
      const slider = snapshot.scene.sliders[id];
      if (slider) deltas.push({ op: 'addSlider', slider: structuredClone(slider) });
    }
    deltas.push(
      { op: 'setOrder', order: [...snapshot.scene.order] },
      { op: 'setViewport', viewport: { ...snapshot.appState.viewport } },
      { op: 'setTool', tool: snapshot.appState.activeTool ?? 'select' },
      { op: 'setSelection', ids: [...(snapshot.appState.selectedIds ?? [])] },
    );
    this.emit({ op: 'batch', deltas }, source);
  }

  private requireExpression(id: string): GraphExpression {
    const expression = this.#snapshot.scene.expressions[id];
    if (!expression) throw new KleinSdkError('missing_expression', `Unknown graph expression "${id}".`, { id });
    return expression;
  }

  private findSlider(idOrName: string): GraphSlider {
    const direct = this.#snapshot.scene.sliders[idOrName];
    if (direct) return direct;
    const byName = Object.values(this.#snapshot.scene.sliders).find(slider => slider.name === idOrName);
    if (!byName) throw new KleinSdkError('missing_slider', `Unknown slider "${idOrName}".`, { idOrName });
    return byName;
  }

  private sliderVariables(): Record<string, MathValue> {
    const variables: Record<string, MathValue> = {};
    for (const slider of Object.values(this.#snapshot.scene.sliders)) {
      variables[slider.name] = slider.value;
    }
    return variables;
  }

  private withSliderVariables(options: GraphPlotOptions): GraphPlotOptions {
    const next: GraphPlotOptions = {
      ...options,
      variables: {
        ...this.sliderVariables(),
        ...(options.variables ?? {}),
      },
    };
    const samples = options.samples ?? this.#options.samples;
    if (samples !== undefined) next.samples = samples;
    return next;
  }

  private plotOptions(): GraphPlotOptions {
    const options: GraphPlotOptions = {};
    if (this.#options.samples !== undefined) options.samples = this.#options.samples;
    return this.withSliderVariables(options);
  }

  private render(): void {
    if (!this.#root) return;
    this.#root.innerHTML = this.renderHtml();
  }

  private renderHtml(): string {
    const svg = exportGraphingSvg(this.#snapshot, { format: 'svg', width: 640, height: 420, includeGrid: true }, this.plotOptions());
    const rows = this.#snapshot.scene.order
      .map(id => this.#snapshot.scene.expressions[id])
      .filter((expression): expression is GraphExpression => Boolean(expression))
      .map(expression => `<li style="color:${escapeAttribute(expression.color)}">${escapeHtml(expression.input ?? formatMathNode(expression.ast))}</li>`)
      .join('');
    return `<div class="kg-canvas">${svg}</div><ol class="kg-expressions">${rows}</ol>`;
  }
}

function applyGraphingDeltaMutable(snapshot: GraphingSnapshot, delta: GraphingDelta): void {
  switch (delta.op) {
    case 'addExpression':
      snapshot.scene.expressions[delta.expression.id] = sanitizeExpression(delta.expression);
      insertOrderedId(snapshot.scene.order, delta.expression.id, delta.index);
      return;
    case 'updateExpression': {
      const existing = snapshot.scene.expressions[delta.id];
      if (!existing) throw new KleinSdkError('missing_expression', `Unknown graph expression "${delta.id}".`, { id: delta.id });
      snapshot.scene.expressions[delta.id] = sanitizeExpression({ ...existing, ...delta.changes, id: delta.id });
      return;
    }
    case 'addPoint':
      snapshot.scene.points[delta.point.id] = sanitizePoint(delta.point);
      insertOrderedId(snapshot.scene.order, delta.point.id, delta.index);
      return;
    case 'updatePoint': {
      const existing = snapshot.scene.points[delta.id];
      if (!existing) throw new KleinSdkError('missing_point', `Unknown graph point "${delta.id}".`, { id: delta.id });
      snapshot.scene.points[delta.id] = sanitizePoint({ ...existing, ...delta.changes, id: delta.id });
      return;
    }
    case 'addSlider':
      snapshot.scene.sliders[delta.slider.id] = sanitizeSlider(delta.slider);
      insertOrderedId(snapshot.scene.order, delta.slider.id, delta.index);
      return;
    case 'updateSlider': {
      const existing = snapshot.scene.sliders[delta.id];
      if (!existing) throw new KleinSdkError('missing_slider', `Unknown slider "${delta.id}".`, { id: delta.id });
      snapshot.scene.sliders[delta.id] = sanitizeSlider({ ...existing, ...delta.changes, id: delta.id });
      return;
    }
    case 'delete':
      for (const id of delta.ids) {
        delete snapshot.scene.expressions[id];
        delete snapshot.scene.points[id];
        delete snapshot.scene.sliders[id];
      }
      snapshot.scene.order = snapshot.scene.order.filter(id => !delta.ids.includes(id));
      snapshot.appState.selectedIds = (snapshot.appState.selectedIds ?? []).filter(id => !delta.ids.includes(id));
      return;
    case 'setViewport':
      snapshot.appState.viewport = sanitizeViewport(delta.viewport);
      return;
    case 'setTool':
      snapshot.appState.activeTool = delta.tool;
      return;
    case 'setSelection':
      snapshot.appState.selectedIds = [...delta.ids];
      return;
    case 'setOrder':
      snapshot.scene.order = delta.order.filter(id => (
        Boolean(snapshot.scene.expressions[id])
        || Boolean(snapshot.scene.points[id])
        || Boolean(snapshot.scene.sliders[id])
      ));
      return;
    case 'clear':
      snapshot.scene.expressions = {};
      snapshot.scene.points = {};
      snapshot.scene.sliders = {};
      snapshot.scene.order = [];
      snapshot.appState.selectedIds = [];
      return;
    case 'batch':
      for (const child of delta.deltas) applyGraphingDeltaMutable(snapshot, child);
      return;
  }
}

function exportGraphingSvg(
  snapshot: GraphingSnapshot,
  exportOptions: ExportOptions,
  plotOptions: GraphPlotOptions,
): string {
  const width = positiveInteger(exportOptions.width, 800);
  const height = positiveInteger(exportOptions.height, 520);
  const viewport = snapshot.appState.viewport;
  const background = exportOptions.background === 'transparent' ? undefined : exportOptions.background ?? '#ffffff';
  const includeGrid = exportOptions.includeGrid ?? true;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Klein graphing calculator export">`,
  ];
  if (background) parts.push(`<rect width="100%" height="100%" fill="${escapeAttribute(background)}"/>`);
  if (includeGrid) parts.push(renderGrid(viewport, width, height));
  parts.push(renderAxes(viewport, width, height));

  for (const id of snapshot.scene.order) {
    const expression = snapshot.scene.expressions[id];
    if (!expression?.visible) continue;
    const segments = sampleGraphExpression(expression, viewport, plotOptions);
    for (const segment of segments) {
      if (segment.points.length < 2) continue;
      const points = segment.points
        .map(point => `${xToScreen(point.x, viewport, width).toFixed(2)},${yToScreen(point.y, viewport, height).toFixed(2)}`)
        .join(' ');
      parts.push(`<polyline points="${points}" fill="none" stroke="${escapeAttribute(expression.color)}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
  }

  for (const id of snapshot.scene.order) {
    const point = snapshot.scene.points[id];
    if (!point) continue;
    const color = point.color ?? '#172033';
    const cx = xToScreen(point.x, viewport, width);
    const cy = yToScreen(point.y, viewport, height);
    parts.push(`<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="4" fill="${escapeAttribute(color)}"/>`);
    if (point.label) {
      parts.push(`<text x="${(cx + 7).toFixed(2)}" y="${(cy - 7).toFixed(2)}" fill="${escapeAttribute(color)}" font-family="${escapeAttribute(KLEIN_UI_FONT_STACK)}" font-size="12">${escapeHtml(point.label)}</text>`);
    }
  }

  parts.push('</svg>');
  return parts.join('');
}

function exportGraphingCsv(snapshot: GraphingSnapshot, plotOptions: GraphPlotOptions): string {
  const rows = ['expressionId,input,x,y'];
  for (const id of snapshot.scene.order) {
    const expression = snapshot.scene.expressions[id];
    if (!expression) continue;
    for (const segment of sampleGraphExpression(expression, snapshot.appState.viewport, plotOptions)) {
      for (const point of segment.points) {
        rows.push([
          csvCell(expression.id),
          csvCell(expression.input ?? formatMathNode(expression.ast)),
          String(point.x),
          String(point.y),
        ].join(','));
      }
    }
  }
  return rows.join('\n');
}

function renderGrid(viewport: GraphViewport, width: number, height: number): string {
  const parts: string[] = ['<g stroke="#e6e9ef" stroke-width="1">'];
  const xStep = niceGridStep(viewport.xMax - viewport.xMin);
  const yStep = niceGridStep(viewport.yMax - viewport.yMin);
  for (let x = Math.ceil(viewport.xMin / xStep) * xStep; x <= viewport.xMax; x += xStep) {
    const screenX = xToScreen(x, viewport, width);
    parts.push(`<line x1="${screenX.toFixed(2)}" y1="0" x2="${screenX.toFixed(2)}" y2="${height}"/>`);
  }
  for (let y = Math.ceil(viewport.yMin / yStep) * yStep; y <= viewport.yMax; y += yStep) {
    const screenY = yToScreen(y, viewport, height);
    parts.push(`<line x1="0" y1="${screenY.toFixed(2)}" x2="${width}" y2="${screenY.toFixed(2)}"/>`);
  }
  parts.push('</g>');
  return parts.join('');
}

function renderAxes(viewport: GraphViewport, width: number, height: number): string {
  const parts = ['<g stroke="#6b7280" stroke-width="1.5">'];
  if (viewport.yMin <= 0 && viewport.yMax >= 0) {
    const y = yToScreen(0, viewport, height);
    parts.push(`<line x1="0" y1="${y.toFixed(2)}" x2="${width}" y2="${y.toFixed(2)}"/>`);
  }
  if (viewport.xMin <= 0 && viewport.xMax >= 0) {
    const x = xToScreen(0, viewport, width);
    parts.push(`<line x1="${x.toFixed(2)}" y1="0" x2="${x.toFixed(2)}" y2="${height}"/>`);
  }
  parts.push('</g>');
  return parts.join('');
}

function evaluatePlotPoint(
  expression: GraphExpression,
  parameter: number,
  variables: Record<string, MathValue>,
  options: GraphPlotOptions,
): GraphSamplePoint | null {
  try {
    if (expression.kind === 'explicit') {
      return { x: parameter, y: evaluateGraphExpression(expression, parameter, variables, options) };
    }
    if (expression.kind === 'polar') {
      const radius = evaluateGraphExpression(expression, parameter, variables, options);
      return { x: radius * Math.cos(parameter), y: radius * Math.sin(parameter) };
    }
    if (expression.kind === 'parametric') {
      if (expression.ast.kind !== 'vector' || expression.ast.values.length < 2) return null;
      const evaluationVariables = { ...variables, t: parameter };
      return {
        x: evaluateMathNumber(
          expression.ast.values[0] as MathNode,
          mathEvaluateOptions(evaluationVariables, options.angleMode),
        ),
        y: evaluateMathNumber(
          expression.ast.values[1] as MathNode,
          mathEvaluateOptions(evaluationVariables, options.angleMode),
        ),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function safeEvaluate(
  expression: GraphExpression,
  x: number,
  variables: Record<string, MathValue>,
  options: GraphPlotOptions,
): number | null {
  try {
    const value = evaluateGraphExpression(expression, x, variables, options);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function safeDifference(
  first: GraphExpression,
  second: GraphExpression,
  x: number,
  variables: Record<string, MathValue>,
  options: GraphPlotOptions,
): number | null {
  const firstValue = safeEvaluate(first, x, variables, options);
  const secondValue = safeEvaluate(second, x, variables, options);
  return firstValue === null || secondValue === null ? null : firstValue - secondValue;
}

function bisectRoot(
  expression: GraphExpression,
  left: number,
  right: number,
  variables: Record<string, MathValue>,
  options: GraphPlotOptions,
): number {
  let a = left;
  let b = right;
  let fa = safeEvaluate(expression, a, variables, options) ?? 0;
  for (let iteration = 0; iteration < 48; iteration += 1) {
    const mid = (a + b) / 2;
    const fm = safeEvaluate(expression, mid, variables, options) ?? 0;
    if (Math.abs(fm) < ROOT_EPSILON) return mid;
    if (fa * fm <= 0) {
      b = mid;
    } else {
      a = mid;
      fa = fm;
    }
  }
  return (a + b) / 2;
}

function bisectIntersection(
  first: GraphExpression,
  second: GraphExpression,
  left: number,
  right: number,
  variables: Record<string, MathValue>,
  options: GraphPlotOptions,
): number {
  let a = left;
  let b = right;
  let fa = safeDifference(first, second, a, variables, options) ?? 0;
  for (let iteration = 0; iteration < 48; iteration += 1) {
    const mid = (a + b) / 2;
    const fm = safeDifference(first, second, mid, variables, options) ?? 0;
    if (Math.abs(fm) < ROOT_EPSILON) return mid;
    if (fa * fm <= 0) {
      b = mid;
    } else {
      a = mid;
      fa = fm;
    }
  }
  return (a + b) / 2;
}

function addUniqueAnalysisPoint(points: GraphAnalysisPoint[], point: GraphAnalysisPoint): void {
  if (points.some(existing => Math.abs(existing.x - point.x) < 1e-5 && Math.abs(existing.y - point.y) < 1e-5)) {
    return;
  }
  points.push(point);
}

function pushSegment(segments: GraphPlotSegment[], expressionId: string, points: GraphSamplePoint[]): void {
  if (points.length >= 2) segments.push({ expressionId, points });
}

function normalizeGraphingSnapshot(snapshot: GraphingSnapshot): GraphingSnapshot {
  const scene = snapshot.scene ?? createEmptyGraphingSnapshot().scene;
  const normalized: GraphingSnapshot = {
    version: 1,
    instrument: 'graphing',
    scene: {
      expressions: {},
      points: {},
      sliders: {},
      order: [],
    },
    appState: {
      viewport: sanitizeViewport(snapshot.appState?.viewport ?? DEFAULT_VIEWPORT),
      activeTool: snapshot.appState?.activeTool ?? 'select',
      selectedIds: [...(snapshot.appState?.selectedIds ?? [])],
    },
  };
  if (snapshot.metadata) normalized.metadata = { ...snapshot.metadata };
  for (const [id, expression] of Object.entries(scene.expressions ?? {})) {
    normalized.scene.expressions[id] = sanitizeExpression({ ...expression, id });
  }
  for (const [id, point] of Object.entries(scene.points ?? {})) {
    normalized.scene.points[id] = sanitizePoint({ ...point, id });
  }
  for (const [id, slider] of Object.entries(scene.sliders ?? {})) {
    normalized.scene.sliders[id] = sanitizeSlider({ ...slider, id });
  }
  const ordered = new Set<string>();
  for (const id of scene.order ?? []) {
    if (normalized.scene.expressions[id] || normalized.scene.points[id] || normalized.scene.sliders[id]) {
      normalized.scene.order.push(id);
      ordered.add(id);
    }
  }
  for (const id of Object.keys(normalized.scene.expressions)) {
    if (!ordered.has(id)) normalized.scene.order.push(id);
  }
  for (const id of Object.keys(normalized.scene.points)) {
    if (!ordered.has(id)) normalized.scene.order.push(id);
  }
  for (const id of Object.keys(normalized.scene.sliders)) {
    if (!ordered.has(id)) normalized.scene.order.push(id);
  }
  return normalized;
}

function sanitizeExpression(expression: GraphExpression): GraphExpression {
  if (!expression.id.trim()) throw new KleinSdkError('invalid_expression', 'Expression id cannot be empty.');
  const next: GraphExpression = {
    id: expression.id,
    kind: expression.kind,
    ast: expression.ast,
    color: expression.color || nextColor(0),
    visible: expression.visible ?? true,
  };
  if (expression.domain) next.domain = sanitizeDomain(expression.domain);
  if (expression.input !== undefined) next.input = expression.input;
  if (expression.label !== undefined) next.label = expression.label;
  return next;
}

function sanitizePoint(point: GraphPoint): GraphPoint {
  if (!point.id.trim()) throw new KleinSdkError('invalid_point', 'Point id cannot be empty.');
  const next: GraphPoint = {
    id: point.id,
    x: finite(point.x, 'Point x must be finite.'),
    y: finite(point.y, 'Point y must be finite.'),
  };
  if (point.label !== undefined) next.label = point.label;
  if (point.color !== undefined) next.color = point.color;
  return next;
}

function sanitizeSlider(slider: GraphSlider): GraphSlider {
  const min = finite(slider.min, 'Slider minimum must be finite.');
  const max = finite(slider.max, 'Slider maximum must be finite.');
  if (max < min) throw new KleinSdkError('invalid_slider', 'Slider max must be greater than or equal to min.');
  const next: GraphSlider = {
    id: slider.id,
    name: sanitizeSliderName(slider.name),
    value: clamp(finite(slider.value, 'Slider value must be finite.'), min, max),
    min,
    max,
    step: positive(slider.step, 0.1),
  };
  if (slider.color !== undefined) next.color = slider.color;
  if (slider.visible !== undefined) next.visible = slider.visible;
  return next;
}

function sanitizeViewport(viewport: GraphViewport): GraphViewport {
  const xMin = finite(viewport.xMin, 'Viewport xMin must be finite.');
  const xMax = finite(viewport.xMax, 'Viewport xMax must be finite.');
  const yMin = finite(viewport.yMin, 'Viewport yMin must be finite.');
  const yMax = finite(viewport.yMax, 'Viewport yMax must be finite.');
  if (!(xMax > xMin) || !(yMax > yMin)) {
    throw new KleinSdkError('invalid_viewport', 'Viewport bounds must have positive width and height.');
  }
  return {
    x: finite(viewport.x, 'Viewport x must be finite.'),
    y: finite(viewport.y, 'Viewport y must be finite.'),
    zoom: positive(viewport.zoom, 1),
    xMin,
    xMax,
    yMin,
    yMax,
  };
}

function sanitizeDomain(domain: [number, number]): [number, number] {
  const start = finite(domain[0], 'Domain start must be finite.');
  const end = finite(domain[1], 'Domain end must be finite.');
  if (!(end > start)) throw new KleinSdkError('invalid_domain', 'Expression domain end must be greater than start.');
  return [start, end];
}

function sanitizeSliderName(name: string): string {
  const trimmed = name.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
    throw new KleinSdkError('invalid_slider', 'Slider name must be a valid symbol name.', { name });
  }
  return trimmed;
}

function mathEvaluateOptions(
  variables: Record<string, MathValue>,
  angleMode?: 'degrees' | 'radians',
): MathEvaluateOptions {
  const options: MathEvaluateOptions = { variables };
  if (angleMode !== undefined) options.angleMode = angleMode;
  return options;
}

function validationIssuesToJson(issues: ValidationIssue[]): JsonValue {
  return issues.map(issue => ({
    path: issue.path,
    message: issue.message,
  }));
}

function insertOrderedId(order: string[], id: string, index?: number): void {
  const existing = order.indexOf(id);
  if (existing >= 0) order.splice(existing, 1);
  if (index === undefined || index < 0 || index >= order.length) {
    order.push(id);
  } else {
    order.splice(index, 0, id);
  }
}

function isSymbol(node: MathNode, name: string): boolean {
  return node.kind === 'symbol' && node.name.toLowerCase() === name.toLowerCase();
}

function xToScreen(x: number, viewport: GraphViewport, width: number): number {
  return (x - viewport.xMin) / (viewport.xMax - viewport.xMin) * width;
}

function yToScreen(y: number, viewport: GraphViewport, height: number): number {
  return height - (y - viewport.yMin) / (viewport.yMax - viewport.yMin) * height;
}

function niceGridStep(span: number): number {
  const rough = span / 10;
  const exponent = Math.floor(Math.log10(rough));
  const base = 10 ** exponent;
  const normalized = rough / base;
  if (normalized < 1.5) return base;
  if (normalized < 3.5) return base * 2;
  if (normalized < 7.5) return base * 5;
  return base * 10;
}

function nextColor(index: number): string {
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length] ?? DEFAULT_COLORS[0] as string;
}

function finite(value: number, message: string): number {
  if (!Number.isFinite(value)) throw new KleinSdkError('invalid_number', message);
  return value;
}

function positive(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Math.max(8, Math.floor(positive(value, fallback)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseJson(input: string): JsonValue {
  try {
    return JSON.parse(input) as JsonValue;
  } catch (error) {
    throw new KleinSdkError('invalid_json', 'Graphing snapshot JSON could not be parsed.', String(error));
  }
}

function cloneSnapshot(snapshot: GraphingSnapshot): GraphingSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as GraphingSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("'", '&#39;');
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
