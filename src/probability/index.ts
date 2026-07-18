import { createIdFactory, createInstrumentRuntime, KleinSdkError } from '../core/index.js';
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
} from '../core/index.js';

/** Tool ids for probability and statistics workflows. */
export type ProbabilityTool = 'distribution' | 'interval' | 'test' | 'simulation';

/** Supported distribution families planned for the probability explorer. */
export type DistributionKind =
  | 'normal'
  | 't'
  | 'chiSquare'
  | 'f'
  | 'binomial'
  | 'poisson'
  | 'uniform';

/** Persisted distribution configuration. Parameter names depend on the distribution kind. */
export interface DistributionModel {
  id: string;
  kind: DistributionKind;
  parameters: Record<string, number>;
}

/** Persisted probability scene. */
export interface ProbabilityScene {
  distributions: Record<string, DistributionModel>;
  order: string[];
}

/** UI state for probability/statistics tools. */
export interface ProbabilityAppState {
  activeTool?: ProbabilityTool;
  selectedId?: string;
}

/** Versioned probability explorer snapshot. */
export type ProbabilitySnapshot = InstrumentSnapshot<ProbabilityScene, ProbabilityAppState> & {
  version: 1;
  instrument: 'probability';
  appState: ProbabilityAppState;
};

/** Probability explorer edit operations. */
export type ProbabilityDelta =
  | { op: 'addDistribution'; distribution: DistributionModel }
  | { op: 'updateDistribution'; id: string; changes: Partial<DistributionModel> }
  | { op: 'delete'; ids: string[] }
  | { op: 'setTool'; tool: ProbabilityTool }
  | { op: 'setSelection'; id: string | null }
  | { op: 'batch'; deltas: ProbabilityDelta[] };

/** Probability factory options layered over the common instrument options. */
export type ProbabilityOptions = InstrumentOptions<ProbabilitySnapshot, ProbabilityDelta>;

export interface DistributionEvaluation {
  x: number;
  density?: number;
  cumulative?: number;
  mean?: number;
  variance?: number;
}

export interface ProbabilityExplorer extends KleinInstrument<ProbabilitySnapshot, ProbabilityDelta, ProbabilityTool> {
  addDistribution(model: Omit<DistributionModel, 'id'> & { id?: string }): string;
  updateDistribution(id: string, changes: Partial<DistributionModel>): void;
  evaluateDistribution(id: string, x: number): DistributionEvaluation;
}

type HistoryEntry = {
  before: ProbabilitySnapshot;
  after: ProbabilitySnapshot;
};

/** Creates the default empty probability explorer document. */
export function createEmptyProbabilitySnapshot(): ProbabilitySnapshot {
  return {
    version: 1,
    instrument: 'probability',
    scene: {
      distributions: {},
      order: [],
    },
    appState: {
      activeTool: 'distribution',
    },
  };
}

export function validateProbabilitySnapshot(value: unknown): ValidationResult<ProbabilitySnapshot> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: '', message: 'Probability snapshot must be an object.' }] };
  }
  if (value.version !== 1) issues.push({ path: 'version', message: 'Probability snapshot version must be 1.' });
  if (value.instrument !== 'probability') issues.push({ path: 'instrument', message: 'Snapshot instrument must be probability.' });
  if (!isRecord(value.scene)) {
    issues.push({ path: 'scene', message: 'Probability scene must be an object.' });
  } else {
    if (!isRecord(value.scene.distributions)) issues.push({ path: 'scene.distributions', message: 'Distributions must be an object.' });
    if (!Array.isArray(value.scene.order)) issues.push({ path: 'scene.order', message: 'Order must be an array.' });
  }
  if (!isRecord(value.appState)) {
    issues.push({ path: 'appState', message: 'Probability appState must be an object.' });
  }
  return issues.length
    ? { ok: false, issues }
    : { ok: true, value: value as unknown as ProbabilitySnapshot };
}

export function validateProbabilityDelta(value: unknown): ValidationResult<ProbabilityDelta> {
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: '', message: 'Probability delta must be an object.' }] };
  }
  const ops: Array<ProbabilityDelta['op']> = [
    'addDistribution',
    'updateDistribution',
    'delete',
    'setTool',
    'setSelection',
    'batch',
  ];
  if (!ops.includes(value.op as ProbabilityDelta['op'])) {
    return { ok: false, issues: [{ path: 'op', message: 'Probability delta op is unsupported.' }] };
  }
  return { ok: true, value: value as ProbabilityDelta };
}

export function applyProbabilityDelta(
  snapshot: ProbabilitySnapshot,
  delta: ProbabilityDelta,
): ProbabilitySnapshot {
  const next = cloneSnapshot(snapshot);
  switch (delta.op) {
    case 'addDistribution':
      next.scene.distributions[delta.distribution.id] = sanitizeDistribution(delta.distribution);
      if (!next.scene.order.includes(delta.distribution.id)) next.scene.order.push(delta.distribution.id);
      next.appState.selectedId = delta.distribution.id;
      return normalizeProbabilitySnapshot(next);
    case 'updateDistribution': {
      const existing = next.scene.distributions[delta.id];
      if (!existing) throw new KleinSdkError('missing_distribution', `Unknown distribution "${delta.id}".`, { id: delta.id });
      next.scene.distributions[delta.id] = sanitizeDistribution({ ...existing, ...delta.changes, id: delta.id });
      return normalizeProbabilitySnapshot(next);
    }
    case 'delete':
      for (const id of delta.ids) {
        delete next.scene.distributions[id];
      }
      next.scene.order = next.scene.order.filter(id => !delta.ids.includes(id));
      if (next.appState.selectedId && delta.ids.includes(next.appState.selectedId)) {
        delete next.appState.selectedId;
      }
      return normalizeProbabilitySnapshot(next);
    case 'setTool':
      next.appState.activeTool = delta.tool;
      return normalizeProbabilitySnapshot(next);
    case 'setSelection':
      if (delta.id !== null && next.scene.distributions[delta.id]) {
        next.appState.selectedId = delta.id;
      } else {
        delete next.appState.selectedId;
      }
      return normalizeProbabilitySnapshot(next);
    case 'batch':
      return delta.deltas.reduce(applyProbabilityDelta, next);
  }
}

export function evaluateDistributionModel(model: DistributionModel, x: number): DistributionEvaluation {
  const value = finite(x, 'Distribution x value must be finite.');
  const stats = distributionStats(model);
  const result: DistributionEvaluation = { x: value };
  if (stats.mean !== undefined) result.mean = stats.mean;
  if (stats.variance !== undefined) result.variance = stats.variance;

  switch (model.kind) {
    case 'normal': {
      const mean = numberParam(model, 'mean', 0);
      const sd = positiveParam(model, 'sd', 1);
      result.density = normalPdf(value, mean, sd);
      result.cumulative = normalCdf(value, mean, sd);
      return result;
    }
    case 'binomial': {
      const n = Math.max(0, Math.floor(numberParam(model, 'n', 1)));
      const p = clamp(numberParam(model, 'p', 0.5), 0, 1);
      const k = Math.floor(value);
      result.density = k >= 0 && k <= n ? combination(n, k) * p ** k * (1 - p) ** (n - k) : 0;
      result.cumulative = sumIntegers(0, Math.min(k, n), i => combination(n, i) * p ** i * (1 - p) ** (n - i));
      return result;
    }
    case 'poisson': {
      const lambda = positiveParam(model, 'lambda', 1);
      const k = Math.floor(value);
      result.density = k >= 0 ? Math.exp(-lambda) * lambda ** k / factorial(k) : 0;
      result.cumulative = sumIntegers(0, Math.max(0, k), i => Math.exp(-lambda) * lambda ** i / factorial(i));
      return result;
    }
    case 'uniform': {
      const min = numberParam(model, 'min', 0);
      const max = Math.max(min, numberParam(model, 'max', 1));
      result.density = value >= min && value <= max && max > min ? 1 / (max - min) : 0;
      result.cumulative = value <= min ? 0 : value >= max ? 1 : (value - min) / (max - min);
      return result;
    }
    default:
      return result;
  }
}

/** Creates the probability explorer instrument. */
export function createProbabilityExplorer(
  options: ProbabilityOptions = {},
): ProbabilityExplorer {
  return new ProbabilityExplorerImpl(options);
}

/** Creates the shared v0 runtime wrapper for probability/statistics. */
export function createProbabilityRuntime(
  options: ProbabilityOptions = {},
): KleinToolRuntime<ProbabilitySnapshot, ProbabilityDelta, ToolCommand> {
  return createInstrumentRuntime({
    toolKey: 'probability',
    instrument: createProbabilityExplorer(options),
    validateSnapshot: validateProbabilitySnapshot,
    validateDelta: validateProbabilityDelta,
  });
}

class ProbabilityExplorerImpl implements ProbabilityExplorer {
  readonly id: string;
  readonly kind = 'probability';

  readonly #ids = createIdFactory();
  readonly #options: ProbabilityOptions;
  readonly #deltaListeners = new Set<(delta: ProbabilityDelta, meta: DeltaMeta) => void>();
  #snapshot: ProbabilitySnapshot;
  #undoStack: HistoryEntry[] = [];
  #redoStack: HistoryEntry[] = [];
  #container: HTMLElement | undefined;

  constructor(options: ProbabilityOptions) {
    this.#options = options;
    this.id = this.#ids.next('probability');
    this.#snapshot = normalizeProbabilitySnapshot(options.initialSnapshot ?? createEmptyProbabilitySnapshot());
    if (options.container) this.mount(options.container);
  }

  mount(container: HTMLElement): void {
    this.destroy();
    this.#container = container;
    container.dataset.kleinInstrument = 'probability';
    this.render();
  }

  destroy(): void {
    if (this.#container?.dataset.kleinInstrument === 'probability') {
      delete this.#container.dataset.kleinInstrument;
    }
    if (this.#container) this.#container.innerHTML = '';
    this.#container = undefined;
  }

  getSnapshot(): ProbabilitySnapshot {
    return cloneSnapshot(this.#snapshot);
  }

  subscribeDelta(listener: (delta: ProbabilityDelta, meta: DeltaMeta) => void): () => void {
    this.#deltaListeners.add(listener);
    return () => this.#deltaListeners.delete(listener);
  }

  loadSnapshot(snapshot: ProbabilitySnapshot, _options?: LoadOptions): void {
    this.#snapshot = normalizeProbabilitySnapshot(snapshot);
    this.#undoStack = [];
    this.#redoStack = [];
    this.render();
  }

  applyDelta(delta: ProbabilityDelta, options: ApplyDeltaOptions = {}): void {
    const source = options.meta?.source ?? 'remote';
    const commitOptions: { emit: boolean; source: DeltaMeta['source']; recordHistory: boolean; meta?: Partial<DeltaMeta> } = {
      emit: options.emit ?? false,
      source,
      recordHistory: source === 'local',
    };
    if (options.meta) commitOptions.meta = options.meta;
    this.commitDelta(delta, commitOptions);
  }

  setTool(tool: ProbabilityTool): void {
    this.#snapshot.appState.activeTool = tool;
    this.render();
  }

  addDistribution(model: Omit<DistributionModel, 'id'> & { id?: string }): string {
    const distribution = sanitizeDistribution({
      ...model,
      id: model.id ?? this.#ids.next('dist'),
    });
    this.commitDelta({ op: 'addDistribution', distribution }, { emit: true, source: 'local', recordHistory: true });
    return distribution.id;
  }

  updateDistribution(id: string, changes: Partial<DistributionModel>): void {
    this.commitDelta({ op: 'updateDistribution', id, changes }, { emit: true, source: 'local', recordHistory: true });
  }

  evaluateDistribution(id: string, x: number): DistributionEvaluation {
    const distribution = this.#snapshot.scene.distributions[id];
    if (!distribution) throw new KleinSdkError('missing_distribution', `Unknown distribution "${id}".`, { id });
    return evaluateDistributionModel(distribution, x);
  }

  undo(): void {
    const entry = this.#undoStack.pop();
    if (!entry) return;
    const previous = cloneSnapshot(this.#snapshot);
    this.#snapshot = cloneSnapshot(entry.before);
    this.#redoStack.push(entry);
    this.emitSnapshotReplacement(previous, this.#snapshot, 'history');
    this.render();
  }

  redo(): void {
    const entry = this.#redoStack.pop();
    if (!entry) return;
    const previous = cloneSnapshot(this.#snapshot);
    this.#snapshot = cloneSnapshot(entry.after);
    this.#undoStack.push(entry);
    this.emitSnapshotReplacement(previous, this.#snapshot, 'history');
    this.render();
  }

  async export(options: ExportOptions): Promise<ExportResult> {
    if (options.format === 'json') {
      return {
        format: 'json',
        mimeType: 'application/json',
        data: cloneSnapshot(this.#snapshot) as unknown as JsonValue,
      };
    }
    if (options.format === 'csv') {
      return {
        format: 'csv',
        mimeType: 'text/csv',
        data: [
          'id,kind,parameters',
          ...this.#snapshot.scene.order
            .map(id => this.#snapshot.scene.distributions[id])
            .filter((model): model is DistributionModel => Boolean(model))
            .map(model => `${csv(model.id)},${csv(model.kind)},${csv(JSON.stringify(model.parameters))}`),
        ].join('\n'),
      };
    }
    throw new KleinSdkError('unsupported_export', `Probability explorer does not support ${options.format} export yet.`);
  }

  private commitDelta(
    delta: ProbabilityDelta,
    options: { emit: boolean; source: DeltaMeta['source']; recordHistory: boolean; meta?: Partial<DeltaMeta> },
  ): void {
    if (this.#options.readOnly && options.source !== 'remote' && options.source !== 'import') {
      throw new KleinSdkError('readonly', 'Probability explorer is read-only.');
    }
    const before = cloneSnapshot(this.#snapshot);
    this.#snapshot = applyProbabilityDelta(this.#snapshot, delta);
    if (options.recordHistory) {
      this.#undoStack.push({ before, after: cloneSnapshot(this.#snapshot) });
      this.#redoStack = [];
    }
    if (options.emit) this.emit(delta, options.source, options.meta);
    this.render();
  }

  private emitSnapshotReplacement(
    previous: ProbabilitySnapshot,
    snapshot: ProbabilitySnapshot,
    source: DeltaMeta['source'],
  ): void {
    const deltas: ProbabilityDelta[] = [
      { op: 'delete', ids: Object.keys(previous.scene.distributions) },
    ];
    for (const id of snapshot.scene.order) {
      const distribution = snapshot.scene.distributions[id];
      if (distribution) {
        deltas.push({ op: 'addDistribution', distribution: structuredClone(distribution) });
      }
    }
    deltas.push(
      { op: 'setTool', tool: snapshot.appState.activeTool ?? 'distribution' },
      { op: 'setSelection', id: snapshot.appState.selectedId ?? null },
    );
    this.emit({ op: 'batch', deltas }, source);
  }

  private emit(delta: ProbabilityDelta, source: DeltaMeta['source'], meta?: Partial<DeltaMeta>): void {
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
        const sdkError = error instanceof KleinSdkError
          ? error
          : new KleinSdkError('probability_observer_failed', error instanceof Error ? error.message : 'A probability delta observer failed.');
        try {
          this.#options.onError?.(sdkError);
        } catch {
          // Error observers are isolated from committed probability transactions.
        }
      }
    }
  }

  private render(): void {
    if (!this.#container) return;
    const rows = this.#snapshot.scene.order
      .map(id => this.#snapshot.scene.distributions[id])
      .filter((model): model is DistributionModel => Boolean(model))
      .map(model => `<li><strong>${escapeHtml(model.kind)}</strong> <code>${escapeHtml(JSON.stringify(model.parameters))}</code></li>`)
      .join('');
    this.#container.innerHTML = `<div class="kprob-root"><ol>${rows}</ol></div>`;
  }
}

function normalizeProbabilitySnapshot(snapshot: ProbabilitySnapshot): ProbabilitySnapshot {
  const next = cloneSnapshot(snapshot);
  next.version = 1;
  next.instrument = 'probability';
  next.scene = next.scene ?? { distributions: {}, order: [] };
  next.scene.distributions = isRecord(next.scene.distributions) ? next.scene.distributions as Record<string, DistributionModel> : {};
  next.scene.order = Array.isArray(next.scene.order)
    ? next.scene.order.filter(id => typeof id === 'string' && Boolean(next.scene.distributions[id]))
    : [];
  for (const id of Object.keys(next.scene.distributions)) {
    if (!next.scene.order.includes(id)) next.scene.order.push(id);
  }
  next.appState = next.appState ?? { activeTool: 'distribution' };
  next.appState.activeTool = next.appState.activeTool ?? 'distribution';
  if (next.appState.selectedId && !next.scene.distributions[next.appState.selectedId]) {
    delete next.appState.selectedId;
  }
  return next;
}

function sanitizeDistribution(model: DistributionModel): DistributionModel {
  if (!model.id.trim()) throw new KleinSdkError('invalid_distribution', 'Distribution id cannot be empty.');
  const parameters: Record<string, number> = {};
  for (const [key, value] of Object.entries(model.parameters ?? {})) {
    parameters[key] = finite(value, `Distribution parameter "${key}" must be finite.`);
  }
  return {
    id: model.id,
    kind: model.kind,
    parameters,
  };
}

function distributionStats(model: DistributionModel): { mean?: number; variance?: number } {
  switch (model.kind) {
    case 'normal': {
      const mean = numberParam(model, 'mean', 0);
      const sd = positiveParam(model, 'sd', 1);
      return { mean, variance: sd ** 2 };
    }
    case 'binomial': {
      const n = Math.max(0, Math.floor(numberParam(model, 'n', 1)));
      const p = clamp(numberParam(model, 'p', 0.5), 0, 1);
      return { mean: n * p, variance: n * p * (1 - p) };
    }
    case 'poisson': {
      const lambda = positiveParam(model, 'lambda', 1);
      return { mean: lambda, variance: lambda };
    }
    case 'uniform': {
      const min = numberParam(model, 'min', 0);
      const max = Math.max(min, numberParam(model, 'max', 1));
      return { mean: (min + max) / 2, variance: (max - min) ** 2 / 12 };
    }
    default:
      return {};
  }
}

function normalPdf(x: number, mean: number, sd: number): number {
  const z = (x - mean) / sd;
  return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
}

function normalCdf(x: number, mean: number, sd: number): number {
  return 0.5 * (1 + erf((x - mean) / (sd * Math.SQRT2)));
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const value = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * value);
  const approximation = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-value * value);
  return sign * approximation;
}

function numberParam(model: DistributionModel, key: string, fallback: number): number {
  return finite(model.parameters[key] ?? fallback, `Distribution parameter "${key}" must be finite.`);
}

function positiveParam(model: DistributionModel, key: string, fallback: number): number {
  return Math.max(Number.EPSILON, numberParam(model, key, fallback));
}

function finite(value: number, message: string): number {
  if (!Number.isFinite(value)) throw new KleinSdkError('invalid_number', message);
  return value;
}

function factorial(value: number): number {
  let result = 1;
  for (let index = 2; index <= value; index += 1) result *= index;
  return result;
}

function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  return factorial(n) / (factorial(k) * factorial(n - k));
}

function sumIntegers(start: number, end: number, fn: (value: number) => number): number {
  let result = 0;
  for (let value = start; value <= end; value += 1) result += fn(value);
  return result;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function csv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function cloneSnapshot<T>(snapshot: T): T {
  return JSON.parse(JSON.stringify(snapshot)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
