import { createStubInstrument } from '../core/index.js';
import type { InstrumentOptions, InstrumentSnapshot, KleinInstrument, View2D } from '../core/index.js';

/** Tool ids for the general classroom whiteboard. */
export type WhiteboardTool =
  | 'select'
  | 'pan'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'rectangle'
  | 'ellipse'
  | 'triangle'
  | 'polygon'
  | 'line'
  | 'arrow'
  | 'text'
  | 'sticky';

/** All persisted whiteboard element variants. */
export type WhiteboardElement =
  | StrokeElement
  | ShapeElement
  | LineElement
  | TextElement
  | StickyElement;

/** Common placement and locking fields shared by every whiteboard element. */
export interface WhiteboardElementBase {
  id: string;
  type: string;
  x: number;
  y: number;
  locked?: boolean;
}

/** Freehand stroke or highlighter path. */
export interface StrokeElement extends WhiteboardElementBase {
  type: 'stroke';
  points: Array<{ x: number; y: number; pressure?: number }>;
  color: string;
  width: number;
  opacity: number;
}

/** Basic closed shape with optional fill. */
export interface ShapeElement extends WhiteboardElementBase {
  type: 'shape';
  shape: 'rectangle' | 'ellipse' | 'triangle' | 'polygon';
  width: number;
  height: number;
  strokeColor: string;
  fillColor?: string;
}

/** Line-like element. `dx` and `dy` preserve the original drag origin across quadrants. */
export interface LineElement extends WhiteboardElementBase {
  type: 'line';
  variant: 'line' | 'arrow' | 'doubleArrow';
  dx: number;
  dy: number;
  color: string;
  width: number;
}

/** Plain text element rendered as text, never HTML. */
export interface TextElement extends WhiteboardElementBase {
  type: 'text';
  text: string;
  color: string;
  fontSize: number;
}

/** Sticky note element for prompts, notes, and informal working space. */
export interface StickyElement extends WhiteboardElementBase {
  type: 'sticky';
  text: string;
  color: string;
  width: number;
  height: number;
}

/** Persisted whiteboard scene graph. `order` controls draw order. */
export interface WhiteboardScene {
  elements: Record<string, WhiteboardElement>;
  order: string[];
}

/** Non-content whiteboard UI state. Hosts may choose whether to persist this. */
export interface WhiteboardAppState {
  view: View2D;
  selectedIds?: string[];
  activeTool?: WhiteboardTool;
}

/** Versioned whiteboard snapshot ready for persistence, replay, and collaboration. */
export type WhiteboardSnapshot = InstrumentSnapshot<WhiteboardScene, WhiteboardAppState> & {
  version: 1;
  instrument: 'whiteboard';
};

/** Whiteboard edit operations. Real implementation will validate and invert these for history. */
export type WhiteboardDelta =
  | { op: 'add'; element: WhiteboardElement }
  | { op: 'update'; id: string; changes: Partial<WhiteboardElement> }
  | { op: 'delete'; ids: string[] }
  | { op: 'reorder'; order: string[] }
  | { op: 'clear' }
  | { op: 'batch'; deltas: WhiteboardDelta[] };

/** Whiteboard factory options layered over the common instrument options. */
export type WhiteboardOptions = InstrumentOptions<WhiteboardSnapshot, WhiteboardDelta> & {
  dotGrid?: boolean;
  backgroundColor?: string;
};

/** Creates the default empty whiteboard document. */
export function createEmptyWhiteboardSnapshot(): WhiteboardSnapshot {
  return {
    version: 1,
    instrument: 'whiteboard',
    scene: {
      elements: {},
      order: [],
    },
    appState: {
      view: { x: 0, y: 0, zoom: 1 },
      activeTool: 'select',
    },
  };
}

/** Creates the current whiteboard scaffold instrument. Rendering and delta logic are still pending. */
export function createWhiteboard(
  options: WhiteboardOptions = {},
): KleinInstrument<WhiteboardSnapshot, WhiteboardDelta, WhiteboardTool> {
  return createStubInstrument({
    kind: 'whiteboard',
    initialSnapshot: createEmptyWhiteboardSnapshot(),
    defaultTool: 'select',
    options,
  });
}
