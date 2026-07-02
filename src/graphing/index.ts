import { createStubInstrument } from '../core/index.js';
import type { InstrumentOptions, InstrumentSnapshot, KleinInstrument, View2D } from '../core/index.js';
import type { MathNode } from '../math/index.js';

/** Tool ids for the 2D graphing calculator. */
export type GraphingTool =
  | 'select'
  | 'pan'
  | 'zoom'
  | 'point'
  | 'trace'
  | 'tangent'
  | 'intersection'
  | 'root'
  | 'slider';

/** Graph viewport in both generic pan/zoom terms and math-coordinate bounds. */
export interface GraphViewport extends View2D {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** Persisted expression row in the graphing calculator. */
export interface GraphExpression {
  id: string;
  kind: 'explicit' | 'implicit' | 'parametric' | 'polar' | 'inequality';
  ast: MathNode;
  color: string;
  visible: boolean;
  domain?: [number, number];
}

/** Labeled point plotted in graph coordinates. */
export interface GraphPoint {
  id: string;
  x: number;
  y: number;
  label?: string;
  color?: string;
}

/** Persisted graphing scene: expression rows, free points, and display order. */
export interface GraphingScene {
  expressions: Record<string, GraphExpression>;
  points: Record<string, GraphPoint>;
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
};

/** Graphing edit operations for expression rows, points, and viewport changes. */
export type GraphingDelta =
  | { op: 'addExpression'; expression: GraphExpression }
  | { op: 'updateExpression'; id: string; changes: Partial<GraphExpression> }
  | { op: 'delete'; ids: string[] }
  | { op: 'addPoint'; point: GraphPoint }
  | { op: 'updatePoint'; id: string; changes: Partial<GraphPoint> }
  | { op: 'setViewport'; viewport: GraphViewport }
  | { op: 'batch'; deltas: GraphingDelta[] };

/** Graphing factory options layered over the common instrument options. */
export type GraphingOptions = InstrumentOptions<GraphingSnapshot, GraphingDelta>;

/** Creates the default empty graphing document with a -10..10 viewport. */
export function createEmptyGraphingSnapshot(): GraphingSnapshot {
  return {
    version: 1,
    instrument: 'graphing',
    scene: {
      expressions: {},
      points: {},
      order: [],
    },
    appState: {
      viewport: {
        x: 0,
        y: 0,
        zoom: 1,
        xMin: -10,
        xMax: 10,
        yMin: -10,
        yMax: 10,
      },
      activeTool: 'select',
    },
  };
}

/** Creates the current graphing calculator scaffold instrument. */
export function createGraphingCalculator(
  options: GraphingOptions = {},
): KleinInstrument<GraphingSnapshot, GraphingDelta, GraphingTool> {
  return createStubInstrument({
    kind: 'graphing',
    initialSnapshot: createEmptyGraphingSnapshot(),
    defaultTool: 'select',
    options,
  });
}
