import { createStubInstrument } from '../core/index.js';
import type { InstrumentOptions, InstrumentSnapshot, KleinInstrument } from '../core/index.js';
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

/** Creates the current scientific calculator scaffold instrument. */
export function createScientificCalculator(
  options: CalculatorOptions = {},
): KleinInstrument<CalculatorSnapshot, CalculatorDelta, CalculatorTool> {
  return createStubInstrument({
    kind: 'calculator',
    initialSnapshot: createEmptyCalculatorSnapshot(),
    defaultTool: 'input',
    options,
  });
}
