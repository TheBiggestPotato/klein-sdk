import { createStubInstrument } from '../core/index.js';
import type { InstrumentOptions, InstrumentSnapshot, KleinInstrument } from '../core/index.js';

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
};

/** Probability explorer edit operations. */
export type ProbabilityDelta =
  | { op: 'addDistribution'; distribution: DistributionModel }
  | { op: 'updateDistribution'; id: string; changes: Partial<DistributionModel> }
  | { op: 'delete'; ids: string[] }
  | { op: 'batch'; deltas: ProbabilityDelta[] };

/** Probability factory options layered over the common instrument options. */
export type ProbabilityOptions = InstrumentOptions<ProbabilitySnapshot, ProbabilityDelta>;

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

/** Creates the current probability explorer scaffold instrument. */
export function createProbabilityExplorer(
  options: ProbabilityOptions = {},
): KleinInstrument<ProbabilitySnapshot, ProbabilityDelta, ProbabilityTool> {
  return createStubInstrument({
    kind: 'probability',
    initialSnapshot: createEmptyProbabilitySnapshot(),
    defaultTool: 'distribution',
    options,
  });
}
