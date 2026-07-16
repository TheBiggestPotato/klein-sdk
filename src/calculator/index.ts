import { createIdFactory, createInstrumentRuntime, KleinSdkError } from '../core/index.js';
import type {
  ApplyDeltaOptions,
  CommandResult,
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
import {
  evaluateMathNode,
  formatMathNode,
  parseMath,
} from '../math/index.js';
import type { MathNode, MathValue } from '../math/index.js';

/** Tool ids for the scientific calculator shell. */
export type CalculatorTool = 'input' | 'history' | 'memory';

/** One calculator history entry. */
export interface CalculatorEntry {
  id: string;
  input: MathNode;
  result?: MathValue;
  createdAt: number;
}

/** Persisted calculator scene: history plus named memory slots. */
export interface CalculatorScene {
  entries: Record<string, CalculatorEntry>;
  order: string[];
  memory: Record<string, MathValue>;
}

/** UI/evaluation settings for the calculator. */
export interface CalculatorAppState {
  activeTool?: CalculatorTool;
  angleMode: 'degrees' | 'radians';
  outputMode: 'exact' | 'decimal';
}

/** Versioned scientific calculator snapshot. */
export type CalculatorSnapshot = InstrumentSnapshot<CalculatorScene, CalculatorAppState> & {
  version: 1;
  instrument: 'calculator';
  appState: CalculatorAppState;
};

/** Calculator edit operations for history, memory, and mode settings. */
export type CalculatorDelta =
  | { op: 'addEntry'; entry: CalculatorEntry }
  | { op: 'delete'; ids: string[] }
  | { op: 'setMemory'; key: string; value: MathValue | null }
  | { op: 'setAngleMode'; angleMode: CalculatorAppState['angleMode'] }
  | { op: 'setOutputMode'; outputMode: CalculatorAppState['outputMode'] }
  | { op: 'clear' };

/** Calculator factory options layered over the common instrument options. */
export type CalculatorOptions = InstrumentOptions<CalculatorSnapshot, CalculatorDelta>;

export interface ScientificCalculator extends KleinInstrument<CalculatorSnapshot, CalculatorDelta, CalculatorTool> {
  calculate(input: string): string;
  clear(): void;
  setAngleMode(angleMode: CalculatorAppState['angleMode']): void;
  setOutputMode(outputMode: CalculatorAppState['outputMode']): void;
}

type HistoryEntry = {
  before: CalculatorSnapshot;
  after: CalculatorSnapshot;
};

/** Creates the default empty calculator state. */
export function createEmptyCalculatorSnapshot(): CalculatorSnapshot {
  return {
    version: 1,
    instrument: 'calculator',
    scene: {
      entries: {},
      order: [],
      memory: {},
    },
    appState: {
      activeTool: 'input',
      angleMode: 'degrees',
      outputMode: 'exact',
    },
  };
}

export function validateCalculatorSnapshot(value: unknown): ValidationResult<CalculatorSnapshot> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: '', message: 'Calculator snapshot must be an object.' }] };
  }
  if (value.version !== 1) issues.push({ path: 'version', message: 'Calculator snapshot version must be 1.' });
  if (value.instrument !== 'calculator') issues.push({ path: 'instrument', message: 'Snapshot instrument must be calculator.' });
  if (!isRecord(value.scene)) {
    issues.push({ path: 'scene', message: 'Calculator scene must be an object.' });
  } else {
    if (!isRecord(value.scene.entries)) issues.push({ path: 'scene.entries', message: 'Calculator entries must be an object.' });
    if (!Array.isArray(value.scene.order)) issues.push({ path: 'scene.order', message: 'Calculator order must be an array.' });
    if (!isRecord(value.scene.memory)) issues.push({ path: 'scene.memory', message: 'Calculator memory must be an object.' });
  }
  if (!isRecord(value.appState)) {
    issues.push({ path: 'appState', message: 'Calculator appState must be an object.' });
  }
  return issues.length
    ? { ok: false, issues }
    : { ok: true, value: value as unknown as CalculatorSnapshot };
}

export function validateCalculatorDelta(value: unknown): ValidationResult<CalculatorDelta> {
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: '', message: 'Calculator delta must be an object.' }] };
  }
  const ops: Array<CalculatorDelta['op']> = [
    'addEntry',
    'delete',
    'setMemory',
    'setAngleMode',
    'setOutputMode',
    'clear',
  ];
  if (!ops.includes(value.op as CalculatorDelta['op'])) {
    return { ok: false, issues: [{ path: 'op', message: 'Calculator delta op is unsupported.' }] };
  }
  return { ok: true, value: value as CalculatorDelta };
}

export function applyCalculatorDelta(
  snapshot: CalculatorSnapshot,
  delta: CalculatorDelta,
): CalculatorSnapshot {
  const next = cloneSnapshot(snapshot);
  switch (delta.op) {
    case 'addEntry':
      next.scene.entries[delta.entry.id] = cloneSnapshot(delta.entry);
      if (!next.scene.order.includes(delta.entry.id)) next.scene.order.push(delta.entry.id);
      next.appState.activeTool = 'history';
      return normalizeCalculatorSnapshot(next);
    case 'delete':
      for (const id of delta.ids) {
        delete next.scene.entries[id];
      }
      next.scene.order = next.scene.order.filter(id => !delta.ids.includes(id));
      return normalizeCalculatorSnapshot(next);
    case 'setMemory':
      if (delta.value === null) delete next.scene.memory[delta.key];
      else next.scene.memory[delta.key] = delta.value;
      return normalizeCalculatorSnapshot(next);
    case 'setAngleMode':
      next.appState.angleMode = delta.angleMode;
      return normalizeCalculatorSnapshot(next);
    case 'setOutputMode':
      next.appState.outputMode = delta.outputMode;
      return normalizeCalculatorSnapshot(next);
    case 'clear':
      next.scene.entries = {};
      next.scene.order = [];
      return normalizeCalculatorSnapshot(next);
  }
}

/** Creates the scientific calculator instrument. */
export function createScientificCalculator(
  options: CalculatorOptions = {},
): ScientificCalculator {
  return new ScientificCalculatorImpl(options);
}

/** Creates the shared v0 runtime wrapper for the scientific calculator. */
export function createScientificCalculatorRuntime(
  options: CalculatorOptions = {},
): KleinToolRuntime<CalculatorSnapshot, CalculatorDelta, ToolCommand> {
  return createInstrumentRuntime({
    toolKey: 'scientific',
    instrument: createScientificCalculator(options),
    validateSnapshot: validateCalculatorSnapshot,
    validateDelta: validateCalculatorDelta,
    execute: (instrument, command) => {
      const calculator = instrument as ScientificCalculator;
      try {
        switch (command.type) {
          case 'calculate': {
            if (typeof command.payload !== 'string') {
              throw new KleinSdkError('invalid_command', 'calculate command payload must be an expression string.');
            }
            return { ok: true, payload: calculator.calculate(command.payload) };
          }
          case 'clear':
            calculator.clear();
            return { ok: true };
          default:
            return executeCalculatorDefaultCommand(calculator, command);
        }
      } catch (error) {
        return { ok: false, error: toSdkError(error, 'calculator_command_failed') };
      }
    },
  });
}

class ScientificCalculatorImpl implements ScientificCalculator {
  readonly id: string;
  readonly kind = 'calculator';

  readonly #ids = createIdFactory();
  readonly #options: CalculatorOptions;
  #snapshot: CalculatorSnapshot;
  #undoStack: HistoryEntry[] = [];
  #redoStack: HistoryEntry[] = [];
  #container: HTMLElement | undefined;

  constructor(options: CalculatorOptions) {
    this.#options = options;
    this.id = this.#ids.next('calculator');
    this.#snapshot = normalizeCalculatorSnapshot(options.initialSnapshot ?? createEmptyCalculatorSnapshot());
    if (options.container) this.mount(options.container);
  }

  mount(container: HTMLElement): void {
    this.destroy();
    this.#container = container;
    container.dataset.kleinInstrument = 'calculator';
    this.render();
  }

  destroy(): void {
    if (this.#container?.dataset.kleinInstrument === 'calculator') {
      delete this.#container.dataset.kleinInstrument;
    }
    if (this.#container) this.#container.innerHTML = '';
    this.#container = undefined;
  }

  getSnapshot(): CalculatorSnapshot {
    return cloneSnapshot(this.#snapshot);
  }

  loadSnapshot(snapshot: CalculatorSnapshot, _options?: LoadOptions): void {
    this.#snapshot = normalizeCalculatorSnapshot(snapshot);
    this.#undoStack = [];
    this.#redoStack = [];
    this.render();
  }

  applyDelta(delta: CalculatorDelta, options: ApplyDeltaOptions = {}): void {
    const commitOptions: { emit: boolean; source: DeltaMeta['source']; recordHistory: boolean; meta?: Partial<DeltaMeta> } = {
      emit: options.emit ?? false,
      source: options.meta?.source ?? 'remote',
      recordHistory: options.meta?.source !== 'history',
    };
    if (options.meta) commitOptions.meta = options.meta;
    this.commitDelta(delta, commitOptions);
  }

  setTool(tool: CalculatorTool): void {
    this.#snapshot.appState.activeTool = tool;
    this.render();
  }

  calculate(input: string): string {
    if (this.#options.readOnly) {
      throw new KleinSdkError('readonly', 'Scientific calculator is read-only.');
    }
    const parsed = parseMath(input);
    const result = evaluateMathNode(parsed.ast, { angleMode: this.#snapshot.appState.angleMode });
    const entry: CalculatorEntry = {
      id: this.#ids.next('entry'),
      input: parsed.ast,
      result,
      createdAt: Date.now(),
    };
    this.commitDelta({ op: 'addEntry', entry }, { emit: true, source: 'local', recordHistory: true });
    return formatMathValue(result, this.#snapshot.appState.outputMode);
  }

  clear(): void {
    this.commitDelta({ op: 'clear' }, { emit: true, source: 'local', recordHistory: true });
  }

  setAngleMode(angleMode: CalculatorAppState['angleMode']): void {
    this.commitDelta({ op: 'setAngleMode', angleMode }, { emit: true, source: 'local', recordHistory: false });
  }

  setOutputMode(outputMode: CalculatorAppState['outputMode']): void {
    this.commitDelta({ op: 'setOutputMode', outputMode }, { emit: true, source: 'local', recordHistory: false });
  }

  undo(): void {
    const entry = this.#undoStack.pop();
    if (!entry) return;
    this.#snapshot = cloneSnapshot(entry.before);
    this.#redoStack.push(entry);
    this.emit({ op: 'clear' }, 'history');
    this.render();
  }

  redo(): void {
    const entry = this.#redoStack.pop();
    if (!entry) return;
    this.#snapshot = cloneSnapshot(entry.after);
    this.#undoStack.push(entry);
    this.emit({ op: 'clear' }, 'history');
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
    if (options.format === 'text') {
      return {
        format: 'text',
        mimeType: 'text/plain',
        data: this.#snapshot.scene.order
          .map(id => this.#snapshot.scene.entries[id])
          .filter((entry): entry is CalculatorEntry => Boolean(entry))
          .map(entry => `${formatMathNode(entry.input)} = ${entry.result === undefined ? '' : formatMathValue(entry.result, this.#snapshot.appState.outputMode)}`)
          .join('\n'),
      };
    }
    throw new KleinSdkError('unsupported_export', `Scientific calculator does not support ${options.format} export yet.`);
  }

  #readonlyDelta(delta: CalculatorDelta): boolean {
    return delta.op !== 'setAngleMode' && delta.op !== 'setOutputMode';
  }

  private commitDelta(
    delta: CalculatorDelta,
    options: { emit: boolean; source: DeltaMeta['source']; recordHistory: boolean; meta?: Partial<DeltaMeta> },
  ): void {
    if (this.#options.readOnly && this.#readonlyDelta(delta)) {
      throw new KleinSdkError('readonly', 'Scientific calculator is read-only.');
    }
    const before = cloneSnapshot(this.#snapshot);
    this.#snapshot = applyCalculatorDelta(this.#snapshot, delta);
    if (options.recordHistory) {
      this.#undoStack.push({ before, after: cloneSnapshot(this.#snapshot) });
      this.#redoStack = [];
    }
    if (options.emit) this.emit(delta, options.source, options.meta);
    this.render();
  }

  private emit(delta: CalculatorDelta, source: DeltaMeta['source'], meta?: Partial<DeltaMeta>): void {
    if (!this.#options.onDelta) return;
    const eventMeta: DeltaMeta = {
      id: meta?.id ?? this.#ids.next('delta'),
      createdAt: meta?.createdAt ?? Date.now(),
      source,
    };
    if (meta?.actorId !== undefined) eventMeta.actorId = meta.actorId;
    this.#options.onDelta(delta, eventMeta);
  }

  private render(): void {
    if (!this.#container) return;
    const rows = this.#snapshot.scene.order
      .map(id => this.#snapshot.scene.entries[id])
      .filter((entry): entry is CalculatorEntry => Boolean(entry))
      .map(entry => `<li><code>${escapeHtml(formatMathNode(entry.input))}</code><span>${entry.result === undefined ? '' : escapeHtml(formatMathValue(entry.result, this.#snapshot.appState.outputMode))}</span></li>`)
      .join('');
    this.#container.innerHTML = `<div class="ksc-root"><ol>${rows}</ol></div>`;
  }
}

function normalizeCalculatorSnapshot(snapshot: CalculatorSnapshot): CalculatorSnapshot {
  const next = cloneSnapshot(snapshot);
  next.version = 1;
  next.instrument = 'calculator';
  next.scene = next.scene ?? { entries: {}, order: [], memory: {} };
  next.scene.entries = isRecord(next.scene.entries) ? next.scene.entries as Record<string, CalculatorEntry> : {};
  next.scene.memory = isRecord(next.scene.memory) ? next.scene.memory as Record<string, MathValue> : {};
  next.scene.order = Array.isArray(next.scene.order)
    ? next.scene.order.filter(id => typeof id === 'string' && Boolean(next.scene.entries[id]))
    : [];
  for (const id of Object.keys(next.scene.entries)) {
    if (!next.scene.order.includes(id)) next.scene.order.push(id);
  }
  next.appState = next.appState ?? { angleMode: 'degrees', outputMode: 'exact' };
  next.appState.angleMode = next.appState.angleMode === 'radians' ? 'radians' : 'degrees';
  next.appState.outputMode = next.appState.outputMode === 'decimal' ? 'decimal' : 'exact';
  next.appState.activeTool = next.appState.activeTool ?? 'input';
  return next;
}

function formatMathValue(value: MathValue, outputMode: CalculatorAppState['outputMode']): string {
  if (typeof value === 'number') {
    return outputMode === 'decimal' ? value.toString() : Number.isInteger(value) ? String(value) : value.toString();
  }
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function executeCalculatorDefaultCommand(
  calculator: ScientificCalculator,
  command: ToolCommand,
): CommandResult {
  switch (command.type) {
    case 'undo':
      calculator.undo();
      return { ok: true };
    case 'redo':
      calculator.redo();
      return { ok: true };
    case 'setTool':
      if (typeof command.payload !== 'string') {
        return {
          ok: false,
          error: new KleinSdkError('invalid_command', 'setTool command payload must be a tool id string.'),
        };
      }
      calculator.setTool(command.payload as CalculatorTool);
      return { ok: true };
    case 'getSnapshot':
      return { ok: true, payload: calculator.getSnapshot() as unknown as JsonValue };
    default:
      return {
        ok: false,
        error: new KleinSdkError('unsupported_command', `Unsupported command "${command.type}".`, {
          commandType: command.type,
        }),
      };
  }
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

function toSdkError(error: unknown, fallbackCode: string): KleinSdkError {
  if (error instanceof KleinSdkError) return error;
  if (error instanceof Error) return new KleinSdkError(fallbackCode, error.message);
  return new KleinSdkError(fallbackCode, 'Scientific calculator operation failed.', String(error));
}
