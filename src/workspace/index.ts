import { createStubInstrument } from '../core/index.js';
import type { InstrumentOptions, InstrumentSnapshot, JsonValue, KleinInstrument } from '../core/index.js';

/** Tool ids for the multi-instrument workspace shell. */
export type WorkspaceTool = 'select' | 'addPanel' | 'split' | 'link';

/** One embedded instrument panel inside a composed workspace. */
export interface WorkspacePanel {
  id: string;
  instrument: string;
  snapshot: JsonValue;
  title?: string;
}

/** Cross-panel relationship, such as spreadsheet data linked to a graph. */
export interface WorkspaceLink {
  id: string;
  sourcePanelId: string;
  targetPanelId: string;
  kind: string;
}

/** Persisted workspace scene containing child instrument snapshots. */
export interface WorkspaceScene {
  panels: Record<string, WorkspacePanel>;
  order: string[];
  links: Record<string, WorkspaceLink>;
}

/** UI state for the workspace shell. */
export interface WorkspaceAppState {
  activeTool?: WorkspaceTool;
  selectedPanelId?: string;
}

/** Versioned workspace snapshot. */
export type WorkspaceSnapshot = InstrumentSnapshot<WorkspaceScene, WorkspaceAppState> & {
  version: 1;
  instrument: 'workspace';
};

/** Workspace edit operations for panel composition and cross-panel links. */
export type WorkspaceDelta =
  | { op: 'addPanel'; panel: WorkspacePanel }
  | { op: 'updatePanelSnapshot'; id: string; snapshot: JsonValue }
  | { op: 'deletePanel'; ids: string[] }
  | { op: 'addLink'; link: WorkspaceLink }
  | { op: 'deleteLink'; ids: string[] }
  | { op: 'batch'; deltas: WorkspaceDelta[] };

/** Workspace factory options layered over the common instrument options. */
export type WorkspaceOptions = InstrumentOptions<WorkspaceSnapshot, WorkspaceDelta>;

/** Creates the default empty workspace. */
export function createEmptyWorkspaceSnapshot(): WorkspaceSnapshot {
  return {
    version: 1,
    instrument: 'workspace',
    scene: {
      panels: {},
      order: [],
      links: {},
    },
    appState: {
      activeTool: 'select',
    },
  };
}

/** Creates the current math workspace scaffold instrument. */
export function createMathWorkspace(
  options: WorkspaceOptions = {},
): KleinInstrument<WorkspaceSnapshot, WorkspaceDelta, WorkspaceTool> {
  return createStubInstrument({
    kind: 'workspace',
    initialSnapshot: createEmptyWorkspaceSnapshot(),
    defaultTool: 'select',
    options,
  });
}
