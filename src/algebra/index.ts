import { createStubInstrument } from '../core/index.js';
import type { InstrumentOptions, InstrumentSnapshot, KleinInstrument } from '../core/index.js';
import type { MathNode } from '../math/index.js';

/** Tool ids for the Algebra Lab step engine UI. */
export type AlgebraTool = 'select' | 'simplify' | 'expand' | 'factor' | 'solve' | 'substitute';

/** One explainable algebra transformation from a before AST to an after AST. */
export interface AlgebraStep {
  id: string;
  ruleId: string;
  before: MathNode;
  after: MathNode;
  explanationKey: string;
  explanationParams?: Record<string, string | number>;
}

/** One algebra notebook entry, including input, optional result, and generated steps. */
export interface AlgebraEntry {
  id: string;
  input: MathNode;
  result?: MathNode;
  steps: AlgebraStep[];
  createdAt: number;
}

/** Persisted Algebra Lab scene. `order` preserves notebook ordering. */
export interface AlgebraScene {
  entries: Record<string, AlgebraEntry>;
  order: string[];
}

/** UI state for Algebra Lab, including teacher-facing answer visibility mode. */
export interface AlgebraAppState {
  selectedEntryId?: string;
  activeTool?: AlgebraTool;
  teacherMode?: 'hints' | 'steps' | 'answers';
}

/** Versioned Algebra Lab snapshot. */
export type AlgebraSnapshot = InstrumentSnapshot<AlgebraScene, AlgebraAppState> & {
  version: 1;
  instrument: 'algebra';
};

/** Algebra Lab edit operations for entries and teacher mode. */
export type AlgebraDelta =
  | { op: 'addEntry'; entry: AlgebraEntry }
  | { op: 'updateEntry'; id: string; changes: Partial<AlgebraEntry> }
  | { op: 'delete'; ids: string[] }
  | { op: 'setTeacherMode'; mode: AlgebraAppState['teacherMode'] }
  | { op: 'batch'; deltas: AlgebraDelta[] };

/** Algebra Lab factory options layered over the common instrument options. */
export type AlgebraOptions = InstrumentOptions<AlgebraSnapshot, AlgebraDelta>;

/** Creates the default empty Algebra Lab document. */
export function createEmptyAlgebraSnapshot(): AlgebraSnapshot {
  return {
    version: 1,
    instrument: 'algebra',
    scene: {
      entries: {},
      order: [],
    },
    appState: {
      activeTool: 'select',
      teacherMode: 'steps',
    },
  };
}

/** Creates the current Algebra Lab scaffold instrument. */
export function createAlgebraLab(
  options: AlgebraOptions = {},
): KleinInstrument<AlgebraSnapshot, AlgebraDelta, AlgebraTool> {
  return createStubInstrument({
    kind: 'algebra',
    initialSnapshot: createEmptyAlgebraSnapshot(),
    defaultTool: 'select',
    options,
  });
}
