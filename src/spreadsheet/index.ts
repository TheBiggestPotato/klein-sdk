import { createStubInstrument } from '../core/index.js';
import type { InstrumentOptions, InstrumentSnapshot, KleinInstrument } from '../core/index.js';
import type { MathNode, MathValue } from '../math/index.js';

/** Tool ids for spreadsheet interaction modes. */
export type SpreadsheetTool = 'select' | 'editCell' | 'fill' | 'chart';

/** One spreadsheet cell with raw input, optional parsed formula, and cached value. */
export interface SpreadsheetCell {
  id: string;
  address: string;
  input: string;
  formula?: MathNode;
  value?: MathValue;
}

/** Persisted spreadsheet scene with a sheet registry and active sheet pointer. */
export interface SpreadsheetScene {
  cells: Record<string, SpreadsheetCell>;
  sheets: Record<string, { id: string; name: string; cellIds: string[] }>;
  activeSheetId: string;
}

/** UI state for the spreadsheet surface. */
export interface SpreadsheetAppState {
  activeTool?: SpreadsheetTool;
  selectedAddress?: string;
}

/** Versioned spreadsheet snapshot. */
export type SpreadsheetSnapshot = InstrumentSnapshot<SpreadsheetScene, SpreadsheetAppState> & {
  version: 1;
  instrument: 'spreadsheet';
};

/** Spreadsheet edit operations for cells and sheets. */
export type SpreadsheetDelta =
  | { op: 'setCell'; cell: SpreadsheetCell }
  | { op: 'clearCells'; addresses: string[] }
  | { op: 'addSheet'; id: string; name: string }
  | { op: 'renameSheet'; id: string; name: string }
  | { op: 'deleteSheet'; id: string }
  | { op: 'batch'; deltas: SpreadsheetDelta[] };

/** Spreadsheet factory options layered over the common instrument options. */
export type SpreadsheetOptions = InstrumentOptions<SpreadsheetSnapshot, SpreadsheetDelta>;

/** Creates the default empty spreadsheet with one sheet. */
export function createEmptySpreadsheetSnapshot(): SpreadsheetSnapshot {
  return {
    version: 1,
    instrument: 'spreadsheet',
    scene: {
      cells: {},
      sheets: {
        sheet1: { id: 'sheet1', name: 'Sheet 1', cellIds: [] },
      },
      activeSheetId: 'sheet1',
    },
    appState: {
      activeTool: 'select',
    },
  };
}

/** Creates the current spreadsheet scaffold instrument. */
export function createSpreadsheet(
  options: SpreadsheetOptions = {},
): KleinInstrument<SpreadsheetSnapshot, SpreadsheetDelta, SpreadsheetTool> {
  return createStubInstrument({
    kind: 'spreadsheet',
    initialSnapshot: createEmptySpreadsheetSnapshot(),
    defaultTool: 'select',
    options,
  });
}
