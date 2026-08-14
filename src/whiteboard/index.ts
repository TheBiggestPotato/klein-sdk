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
  KleinToolKey,
  KleinToolRuntime,
  LoadOptions,
  ToolCommand,
  ValidationIssue,
  ValidationResult,
  Vector2,
  View2D,
} from '../core/index.js';
import { applyKleinToolTheme, resolveKleinToolTheme } from '../theme/index.js';
import { KLEIN_MATH_FONT_STACK } from '../theme/index.js';
import type { KleinToolTheme, KleinToolThemeInput } from '../theme/index.js';

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
  | 'diamond'
  | 'polygon'
  | 'line'
  | 'arrow'
  | 'doubleArrow'
  | 'connector'
  | 'text'
  | 'sticky'
  | 'image'
  | 'stamp'
  | 'frame'
  | 'template';

export type WhiteboardShapeKind = 'rectangle' | 'ellipse' | 'triangle' | 'polygon' | 'diamond';
export type WhiteboardLineVariant = 'line' | 'arrow' | 'doubleArrow' | 'connector';
export type WhiteboardStampKind = 'check' | 'star' | 'heart' | 'smile' | 'question' | 'exclamation';
export type WhiteboardTemplateKind = 'brainstorm' | 'kanban' | 'lesson' | 'swot' | 'grid' | 'cornell';

/** All persisted whiteboard element variants. */
export type WhiteboardElement =
  | StrokeElement
  | ShapeElement
  | LineElement
  | TextElement
  | StickyElement
  | ImageElement
  | StampElement
  | FrameElement
  | TemplateElement
  | EmbeddedSnapshotCardElement;

/** Common placement and locking fields shared by every whiteboard element. */
export interface WhiteboardElementBase {
  id: string;
  type: WhiteboardElement['type'];
  x: number;
  y: number;
  rotation?: number;
  locked?: boolean;
  hidden?: boolean;
}

/** Freehand stroke or highlighter path. Points are absolute world coordinates. */
export interface StrokeElement extends Omit<WhiteboardElementBase, 'type'> {
  type: 'stroke';
  tool: 'pen' | 'highlighter';
  points: Array<{ x: number; y: number; pressure?: number }>;
  color: string;
  width: number;
  opacity: number;
}

/** Basic closed shape with optional fill. */
export interface ShapeElement extends Omit<WhiteboardElementBase, 'type'> {
  type: 'shape';
  shape: WhiteboardShapeKind;
  width: number;
  height: number;
  strokeColor: string;
  strokeWidth: number;
  fillColor?: string;
}

/** Line-like element. `dx` and `dy` preserve the original drag origin across quadrants. */
export interface LineElement extends Omit<WhiteboardElementBase, 'type'> {
  type: 'line';
  variant: WhiteboardLineVariant;
  dx: number;
  dy: number;
  color: string;
  width: number;
  dashed?: boolean;
}

/** Plain text element rendered as text, never HTML. */
export interface TextElement extends Omit<WhiteboardElementBase, 'type'> {
  type: 'text';
  text: string;
  color: string;
  fontSize: number;
  width: number;
  bold?: boolean;
}

/** Sticky note element for prompts, notes, and informal working space. */
export interface StickyElement extends Omit<WhiteboardElementBase, 'type'> {
  type: 'sticky';
  text: string;
  color: string;
  width: number;
  height: number;
}

/** Embedded image by URL or data URL. Hosts can upload and rewrite `src` before persistence. */
export interface ImageElement extends Omit<WhiteboardElementBase, 'type'> {
  type: 'image';
  src: string;
  alt?: string;
  width: number;
  height: number;
}

/** Lightweight reaction/sticker marker. */
export interface StampElement extends Omit<WhiteboardElementBase, 'type'> {
  type: 'stamp';
  stamp: WhiteboardStampKind;
  color: string;
  width: number;
  height: number;
}

/** Named frame used for lesson stages, exports, and organization. */
export interface FrameElement extends Omit<WhiteboardElementBase, 'type'> {
  type: 'frame';
  title: string;
  width: number;
  height: number;
  color: string;
}

/** Built-in organizer template. */
export interface TemplateElement extends Omit<WhiteboardElementBase, 'type'> {
  type: 'template';
  template: WhiteboardTemplateKind;
  title: string;
  width: number;
  height: number;
  color: string;
}

export type WhiteboardEmbeddedToolKey = Extract<KleinToolKey, 'graphing' | 'geometry-lab' | 'graphing-3d' | 'scientific' | 'probability'>;

/** Snapshot card for showing calculator output inside a whiteboard without coupling to a renderer. */
export interface EmbeddedSnapshotCardElement extends Omit<WhiteboardElementBase, 'type'> {
  type: 'embed';
  toolKey: WhiteboardEmbeddedToolKey;
  title: string;
  width: number;
  height: number;
  snapshot?: JsonValue;
  summary?: string;
  sourceSessionId?: string;
  revision?: number;
}

/** Persisted whiteboard scene graph. `order` controls draw order. */
export interface WhiteboardScene {
  elements: Record<string, WhiteboardElement>;
  order: string[];
  backgroundColor?: string;
}

export interface WhiteboardStyleState {
  color: string;
  fillColor: string;
  strokeWidth: number;
  fontSize: number;
  stickyColor: string;
  stamp: WhiteboardStampKind;
  template: WhiteboardTemplateKind;
}

/** Non-content whiteboard UI state. Hosts may choose whether to persist this. */
export interface WhiteboardAppState {
  view: View2D;
  selectedIds?: string[];
  activeTool?: WhiteboardTool;
  style?: WhiteboardStyleState;
}

/** Versioned whiteboard snapshot ready for persistence, replay, and collaboration. */
export type WhiteboardSnapshot = Omit<InstrumentSnapshot<WhiteboardScene, WhiteboardAppState>, 'version' | 'instrument' | 'appState'> & {
  version: 1;
  instrument: 'whiteboard';
  appState: WhiteboardAppState;
};

/** Whiteboard edit operations. */
export type WhiteboardDelta =
  | { op: 'add'; element: WhiteboardElement; index?: number }
  | { op: 'update'; id: string; changes: Partial<WhiteboardElement> }
  | { op: 'delete'; ids: string[] }
  | { op: 'reorder'; order: string[] }
  | { op: 'setView'; view: View2D }
  | { op: 'setAppState'; changes: Partial<WhiteboardAppState> }
  | { op: 'clear' }
  | { op: 'batch'; deltas: WhiteboardDelta[] };

export interface WhiteboardFeature {
  id: string;
  label: string;
  status: 'implemented' | 'partial' | 'planned';
  notes?: string;
}

export interface WhiteboardToolDefinition {
  id: WhiteboardTool;
  label: string;
  group: 'navigate' | 'ink' | 'shape' | 'line' | 'content' | 'organize';
  shortcut?: string;
  createsElement: boolean;
  classroomSafe: boolean;
}

export interface WhiteboardSvgExportOptions extends Pick<ExportOptions, 'width' | 'height' | 'background' | 'includeGrid'> {
  padding?: number;
}

export interface WhiteboardFrameExportOptions extends WhiteboardSvgExportOptions {
  includeFrame?: boolean;
}

export interface CreateWhiteboardEmbeddedCardInput {
  id: string;
  toolKey: WhiteboardEmbeddedToolKey;
  title: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  snapshot?: JsonValue;
  summary?: string;
  sourceSessionId?: string;
  revision?: number;
}

export interface WhiteboardObjectComment {
  id: string;
  authorId: string;
  body: string;
  createdAt: number;
  objectId?: string;
  anchor?: Vector2;
  resolvedAt?: number;
}

export interface WhiteboardOverlayBounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WhiteboardPresenceOverlayInput {
  actorId: string;
  displayName?: string;
  color?: string;
  cursor?: Vector2;
  tool?: string;
  selection?: Array<{ kind?: string; id: string }>;
  updatedAt?: number;
}

export interface WhiteboardPresenceOverlay {
  actorId: string;
  updatedAt: number;
  displayName?: string;
  color?: string;
  cursor?: Vector2;
  tool?: string;
  selectionBounds: WhiteboardOverlayBounds[];
}

export interface CompactWhiteboardDeltasOptions {
  compactView?: boolean;
  compactUpdates?: boolean;
  compactInk?: boolean;
  strokePointDistance?: number;
}

/** Whiteboard factory options layered over the common instrument options. */
export type WhiteboardOptions = InstrumentOptions<WhiteboardSnapshot, WhiteboardDelta> & {
  dotGrid?: boolean;
  backgroundColor?: string;
  showToolbar?: boolean;
  enableKeyboardShortcuts?: boolean;
  initialTool?: WhiteboardTool;
  /** Host-owned presentation palette. It is never stored in a snapshot. */
  theme?: KleinToolThemeInput;
};

export interface WhiteboardInstrument extends KleinInstrument<WhiteboardSnapshot, WhiteboardDelta, WhiteboardTool> {
  setView(view: View2D): void;
  setStyle(style: Partial<WhiteboardStyleState>): void;
  addImage(src: string, position?: Vector2, options?: { width?: number; height?: number; alt?: string }): string;
  addTemplate(template: WhiteboardTemplateKind, position?: Vector2): string;
  addEmbeddedCard(input: Omit<CreateWhiteboardEmbeddedCardInput, 'id'> & { id?: string }): string;
  exportFrameSvg(frameId: string, options?: WhiteboardFrameExportOptions): string;
  getToolDefinitions(): WhiteboardToolDefinition[];
  getFeatures(): WhiteboardFeature[];
}

const DEFAULT_VIEW: View2D = { x: 0, y: 0, zoom: 1 };
const DEFAULT_STYLE: WhiteboardStyleState = {
  color: '#172033',
  fillColor: 'transparent',
  strokeWidth: 4,
  fontSize: 22,
  stickyColor: '#fef08a',
  stamp: 'star',
  template: 'brainstorm',
};

const TOOL_LABELS: Record<WhiteboardTool, string> = {
  select: 'Select',
  pan: 'Pan',
  pen: 'Pen',
  highlighter: 'Highlighter',
  eraser: 'Eraser',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  triangle: 'Triangle',
  diamond: 'Diamond',
  polygon: 'Polygon',
  line: 'Line',
  arrow: 'Arrow',
  doubleArrow: 'Double arrow',
  connector: 'Connector',
  text: 'Text',
  sticky: 'Sticky note',
  image: 'Image',
  stamp: 'Stamp',
  frame: 'Frame',
  template: 'Template',
};

const TOOL_SHORTCUTS: Partial<Record<string, WhiteboardTool>> = {
  v: 'select',
  h: 'pan',
  p: 'pen',
  m: 'highlighter',
  e: 'eraser',
  r: 'rectangle',
  o: 'ellipse',
  t: 'text',
  n: 'sticky',
  l: 'line',
  a: 'arrow',
  f: 'frame',
};

const COLORS = ['#172033', '#5f6c7d', '#d43f4b', '#dd6b20', '#d69e2e', '#16845f', '#0f8f9f', '#3157d5', '#7754d8', '#d53f8c'];
const STICKY_COLORS = ['#fef08a', '#bfdbfe', '#bbf7d0', '#fbcfe8', '#e9d5ff', '#fed7aa'];
const WIDTHS = [2, 4, 8, 14, 22];

/** Creates the default empty whiteboard document. */
export function createEmptyWhiteboardSnapshot(): WhiteboardSnapshot {
  return {
    version: 1,
    instrument: 'whiteboard',
    scene: {
      elements: {},
      order: [],
      backgroundColor: '#ffffff',
    },
    appState: {
      view: { ...DEFAULT_VIEW },
      activeTool: 'select',
      selectedIds: [],
      style: { ...DEFAULT_STYLE },
    },
  };
}

export function validateWhiteboardSnapshot(value: unknown): ValidationResult<WhiteboardSnapshot> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: '', message: 'Whiteboard snapshot must be an object.' }] };
  }
  if (value.version !== 1) issues.push({ path: 'version', message: 'Whiteboard snapshot version must be 1.' });
  if (value.instrument !== 'whiteboard') issues.push({ path: 'instrument', message: 'Snapshot instrument must be whiteboard.' });
  if (!isRecord(value.scene)) {
    issues.push({ path: 'scene', message: 'Whiteboard scene must be an object.' });
  } else {
    if (!isRecord(value.scene.elements)) {
      issues.push({ path: 'scene.elements', message: 'Whiteboard elements must be an object.' });
    } else {
      for (const [id, element] of Object.entries(value.scene.elements)) {
        issues.push(...validateWhiteboardElement(element, `scene.elements.${id}`, id));
      }
    }
    if (!Array.isArray(value.scene.order)) {
      issues.push({ path: 'scene.order', message: 'Whiteboard order must be an array.' });
    } else {
      const known = isRecord(value.scene.elements) ? new Set(Object.keys(value.scene.elements)) : new Set<string>();
      const seen = new Set<string>();
      value.scene.order.forEach((id, index) => {
        if (typeof id !== 'string') {
          issues.push({ path: `scene.order.${index}`, message: 'Whiteboard order entries must be element ids.' });
        } else if (!known.has(id)) {
          issues.push({ path: `scene.order.${index}`, message: 'Whiteboard order references an unknown element id.' });
        } else if (seen.has(id)) {
          issues.push({ path: `scene.order.${index}`, message: 'Whiteboard order must not contain duplicate ids.' });
        }
        if (typeof id === 'string') seen.add(id);
      });
    }
    if (value.scene.backgroundColor !== undefined && typeof value.scene.backgroundColor !== 'string') {
      issues.push({ path: 'scene.backgroundColor', message: 'Whiteboard backgroundColor must be a string.' });
    }
  }
  if (!isRecord(value.appState)) {
    issues.push({ path: 'appState', message: 'Whiteboard appState must be an object.' });
  } else {
    if (value.appState.view !== undefined) issues.push(...validateView(value.appState.view, 'appState.view'));
    if (value.appState.activeTool !== undefined && !isWhiteboardTool(value.appState.activeTool)) {
      issues.push({ path: 'appState.activeTool', message: 'Whiteboard activeTool is unsupported.' });
    }
    if (value.appState.selectedIds !== undefined && (!Array.isArray(value.appState.selectedIds) || value.appState.selectedIds.some(id => typeof id !== 'string'))) {
      issues.push({ path: 'appState.selectedIds', message: 'Whiteboard selectedIds must be an array of ids.' });
    }
    if (value.appState.style !== undefined && !isRecord(value.appState.style)) {
      issues.push({ path: 'appState.style', message: 'Whiteboard style must be an object.' });
    }
  }
  return issues.length
    ? { ok: false, issues }
    : { ok: true, value: value as WhiteboardSnapshot };
}

export function validateWhiteboardDelta(value: unknown): ValidationResult<WhiteboardDelta> {
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: '', message: 'Whiteboard delta must be an object.' }] };
  }
  const issues: ValidationIssue[] = [];
  const ops: Array<WhiteboardDelta['op']> = [
    'add',
    'update',
    'delete',
    'reorder',
    'setView',
    'setAppState',
    'clear',
    'batch',
  ];
  if (!ops.includes(value.op as WhiteboardDelta['op'])) {
    return { ok: false, issues: [{ path: 'op', message: 'Whiteboard delta op is unsupported.' }] };
  }
  if (value.op === 'add') {
    issues.push(...validateWhiteboardElement(value.element, 'element'));
    if (value.index !== undefined && !isFiniteNumber(value.index)) issues.push({ path: 'index', message: 'Whiteboard add index must be a number.' });
  } else if (value.op === 'update') {
    if (typeof value.id !== 'string' || !value.id) issues.push({ path: 'id', message: 'Whiteboard update id must be a non-empty string.' });
    if (!isRecord(value.changes)) issues.push({ path: 'changes', message: 'Whiteboard update changes must be an object.' });
    else if (value.changes.type !== undefined) issues.push({ path: 'changes.type', message: 'Whiteboard update cannot change an element type.' });
  } else if (value.op === 'delete') {
    if (!Array.isArray(value.ids) || value.ids.some(id => typeof id !== 'string')) issues.push({ path: 'ids', message: 'Whiteboard delete ids must be an array of strings.' });
  } else if (value.op === 'reorder') {
    if (!Array.isArray(value.order) || value.order.some(id => typeof id !== 'string')) issues.push({ path: 'order', message: 'Whiteboard reorder order must be an array of strings.' });
  } else if (value.op === 'setView') {
    issues.push(...validateView(value.view, 'view'));
  } else if (value.op === 'setAppState') {
    if (!isRecord(value.changes)) issues.push({ path: 'changes', message: 'Whiteboard app state changes must be an object.' });
    else if (value.changes.view !== undefined) issues.push(...validateView(value.changes.view, 'changes.view'));
  } else if (value.op === 'batch') {
    if (!Array.isArray(value.deltas)) {
      issues.push({ path: 'deltas', message: 'Whiteboard batch deltas must be an array.' });
    } else {
      value.deltas.forEach((delta, index) => {
        const result = validateWhiteboardDelta(delta);
        if (!result.ok) issues.push(...result.issues.map(issue => ({ path: `deltas.${index}${issue.path ? `.${issue.path}` : ''}`, message: issue.message })));
      });
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: value as WhiteboardDelta };
}

/** Stable tool metadata for hosts that render their own toolbar around the SDK whiteboard. */
export function getWhiteboardToolDefinitions(): WhiteboardToolDefinition[] {
  const shortcutByTool = new Map<WhiteboardTool, string>();
  for (const [shortcut, tool] of Object.entries(TOOL_SHORTCUTS)) {
    if (tool) shortcutByTool.set(tool, shortcut);
  }
  return (Object.keys(TOOL_LABELS) as WhiteboardTool[]).map(tool => {
    const definition: WhiteboardToolDefinition = {
      id: tool,
      label: TOOL_LABELS[tool],
      group: toolGroup(tool),
      createsElement: createsWhiteboardElement(tool),
      classroomSafe: tool !== 'image',
    };
    const shortcut = shortcutByTool.get(tool);
    if (shortcut) definition.shortcut = shortcut;
    return definition;
  });
}

export function createWhiteboardEmbeddedCardElement(input: CreateWhiteboardEmbeddedCardInput): EmbeddedSnapshotCardElement {
  const element: EmbeddedSnapshotCardElement = {
    id: input.id,
    type: 'embed',
    toolKey: input.toolKey,
    title: input.title,
    x: finite(input.x, 0),
    y: finite(input.y, 0),
    width: positive(input.width, 360),
    height: positive(input.height, 220),
  };
  if (input.snapshot !== undefined) element.snapshot = input.snapshot;
  if (input.summary !== undefined) element.summary = input.summary;
  if (input.sourceSessionId !== undefined) element.sourceSessionId = input.sourceSessionId;
  if (input.revision !== undefined) element.revision = input.revision;
  return element;
}

export function createWhiteboardPresenceOverlay(
  snapshot: WhiteboardSnapshot,
  input: WhiteboardPresenceOverlayInput,
): WhiteboardPresenceOverlay {
  const selectionBounds: WhiteboardOverlayBounds[] = [];
  for (const selection of input.selection ?? []) {
    if (selection.kind && selection.kind !== 'whiteboard-element' && selection.kind !== 'element') continue;
    const element = snapshot.scene.elements[selection.id];
    if (!element) continue;
    selectionBounds.push({ id: selection.id, ...elementBounds(element) });
  }
  const overlay: WhiteboardPresenceOverlay = {
    actorId: input.actorId,
    updatedAt: input.updatedAt ?? Date.now(),
    selectionBounds,
  };
  if (input.displayName !== undefined) overlay.displayName = input.displayName;
  if (input.color !== undefined) overlay.color = input.color;
  if (input.cursor !== undefined) overlay.cursor = input.cursor;
  if (input.tool !== undefined) overlay.tool = input.tool;
  return overlay;
}

export function createWhiteboardObjectComment(input: WhiteboardObjectComment): WhiteboardObjectComment {
  return { ...input };
}

export function compactWhiteboardDeltas(
  deltas: WhiteboardDelta[],
  options: CompactWhiteboardDeltasOptions = {},
): WhiteboardDelta[] {
  const compactView = options.compactView !== false;
  const compactUpdates = options.compactUpdates !== false;
  const compactInk = options.compactInk !== false;
  const strokePointDistance = positive(options.strokePointDistance, 1.4);
  const result: WhiteboardDelta[] = [];

  for (const original of flattenWhiteboardDeltas(deltas)) {
    const delta = compactInk ? compactInkDelta(original, strokePointDistance) : cloneDelta(original);
    if (compactView && delta.op === 'setView') {
      for (let index = result.length - 1; index >= 0; index -= 1) {
        if (result[index]?.op === 'setView') result.splice(index, 1);
      }
      result.push(delta);
      continue;
    }
    if (compactUpdates && delta.op === 'update') {
      const merged = mergeUpdateDelta(result, delta);
      if (merged) continue;
    }
    if (delta.op === 'delete') {
      const remainingIds = removeRedundantDeltasBeforeDelete(result, delta.ids);
      if (remainingIds.length) result.push({ op: 'delete', ids: remainingIds });
      continue;
    }
    result.push(delta);
  }
  return result;
}

export function createCompactedWhiteboardDelta(
  deltas: WhiteboardDelta[],
  options?: CompactWhiteboardDeltasOptions,
): WhiteboardDelta {
  const compacted = compactWhiteboardDeltas(deltas, options);
  return compacted.length === 1 && compacted[0] ? compacted[0] : { op: 'batch', deltas: compacted };
}

export function exportWhiteboardSvg(snapshot: WhiteboardSnapshot, options: WhiteboardSvgExportOptions = {}): string {
  const normalized = normalizeSnapshot(snapshot, {});
  const bounds = contentBounds(normalized);
  const padding = positive(options.padding, 40);
  const width = options.width ?? Math.max(800, Math.ceil(bounds.width + padding * 2));
  const height = options.height ?? Math.max(500, Math.ceil(bounds.height + padding * 2));
  const renderOptions: {
    width: number;
    height: number;
    view: View2D;
    includeGrid?: boolean;
    background?: ExportOptions['background'];
  } = {
    width,
    height,
    view: { x: padding - bounds.x, y: padding - bounds.y, zoom: 1 },
  };
  if (options.includeGrid !== undefined) renderOptions.includeGrid = options.includeGrid;
  if (options.background !== undefined) renderOptions.background = options.background;
  return renderWhiteboardSvgDocument(normalized, renderOptions);
}

export function exportWhiteboardFrameSvg(
  snapshot: WhiteboardSnapshot,
  frameId: string,
  options: WhiteboardFrameExportOptions = {},
): string {
  const normalized = normalizeSnapshot(snapshot, {});
  const frame = normalized.scene.elements[frameId];
  if (!frame || frame.type !== 'frame') {
    throw new KleinSdkError('whiteboard_frame_not_found', 'Whiteboard frame export requires a valid frame element id.', { frameId });
  }
  const padding = positive(options.padding, 24);
  const bounds = {
    x: frame.x - padding,
    y: frame.y - padding,
    width: frame.width + padding * 2,
    height: frame.height + padding * 2,
  };
  const filterOptions: { excludeId?: string } = {};
  if (options.includeFrame === false) filterOptions.excludeId = frameId;
  const filtered = filterSnapshotToBounds(normalized, bounds, filterOptions);
  const width = options.width ?? Math.ceil(bounds.width);
  const height = options.height ?? Math.ceil(bounds.height);
  const renderOptions: {
    width: number;
    height: number;
    view: View2D;
    includeGrid?: boolean;
    background?: ExportOptions['background'];
  } = {
    width,
    height,
    view: { x: -bounds.x, y: -bounds.y, zoom: 1 },
  };
  if (options.includeGrid !== undefined) renderOptions.includeGrid = options.includeGrid;
  if (options.background !== undefined) renderOptions.background = options.background;
  return renderWhiteboardSvgDocument(filtered, renderOptions);
}

/** Microsoft-Whiteboard-inspired capability map for hosts and product planning. */
export function getWhiteboardFeatures(): WhiteboardFeature[] {
  return [
    { id: 'infinite-canvas', label: 'Infinite pan and zoom canvas', status: 'implemented' },
    { id: 'inking', label: 'Pen and highlighter ink', status: 'implemented' },
    { id: 'eraser', label: 'Object eraser', status: 'implemented' },
    { id: 'selection', label: 'Select, move, box select, delete', status: 'implemented' },
    { id: 'shapes', label: 'Rectangles, ellipses, triangles, diamonds, polygons', status: 'implemented' },
    { id: 'connectors', label: 'Lines, arrows, double arrows, connectors', status: 'implemented' },
    { id: 'sticky-notes', label: 'Sticky notes', status: 'implemented' },
    { id: 'text', label: 'Text boxes', status: 'implemented' },
    { id: 'images', label: 'Images by URL/data URL', status: 'implemented' },
    { id: 'stamps', label: 'Reaction stamps', status: 'implemented' },
    { id: 'templates', label: 'Built-in organizer templates', status: 'implemented' },
    { id: 'frames', label: 'Frames / lesson regions', status: 'implemented' },
    { id: 'undo-redo', label: 'Undo and redo', status: 'implemented' },
    { id: 'exports', label: 'JSON, SVG, PNG, thumbnail exports', status: 'implemented' },
    { id: 'collab-deltas', label: 'Serializable deltas for collaboration', status: 'implemented' },
    { id: 'collab-compaction', label: 'Stroke, drag, and viewport delta compaction', status: 'implemented' },
    { id: 'frame-export', label: 'Frame-level SVG export helpers', status: 'implemented' },
    { id: 'embedded-cards', label: 'Embedded calculator snapshot cards', status: 'implemented' },
    { id: 'comments', label: 'Object-linked comment contracts', status: 'partial' },
    { id: 'presence', label: 'Presence overlay contracts', status: 'partial' },
    { id: 'shape-recognition', label: 'Ink beautify / shape recognition', status: 'planned' },
    { id: 'ruler', label: 'Ruler and straightedge tools', status: 'planned' },
  ];
}

/** Creates a framework-independent DOM/SVG whiteboard instrument. */
export function createWhiteboard(options: WhiteboardOptions = {}): WhiteboardInstrument {
  return new DomWhiteboard(options);
}

/** Creates the shared v0 runtime wrapper for the whiteboard. */
export function createWhiteboardRuntime(
  options: WhiteboardOptions = {},
): KleinToolRuntime<WhiteboardSnapshot, WhiteboardDelta, ToolCommand> {
  return createInstrumentRuntime({
    toolKey: 'whiteboard',
    instrument: createWhiteboard(options),
    validateSnapshot: validateWhiteboardSnapshot,
    validateDelta: validateWhiteboardDelta,
  });
}

type HistoryEntry = {
  forward: WhiteboardDelta;
  inverse: WhiteboardDelta;
};

type PointerMode = 'idle' | 'draw' | 'shape' | 'move' | 'pan' | 'box';

type PointerSession = {
  mode: PointerMode;
  pointerId: number;
  start: Vector2;
  last: Vector2;
  points: Array<{ x: number; y: number; pressure?: number }>;
  original: Record<string, WhiteboardElement>;
  liveElement?: WhiteboardElement;
};

class DomWhiteboard implements WhiteboardInstrument {
  readonly id: string;
  readonly kind = 'whiteboard';

  private readonly ids = createIdFactory();
  private readonly options: WhiteboardOptions;
  private readonly deltaListeners = new Set<(delta: WhiteboardDelta, meta: DeltaMeta) => void>();
  private readonly theme: KleinToolTheme;
  private snapshot: WhiteboardSnapshot;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private container: HTMLElement | undefined;
  private root: HTMLDivElement | undefined;
  private svg: SVGSVGElement | undefined;
  private toolbar: HTMLDivElement | undefined;
  private status: HTMLDivElement | undefined;
  private pointer: PointerSession | null = null;
  private spacePressed = false;
  private mounted = false;

  constructor(options: WhiteboardOptions) {
    this.options = options;
    this.theme = resolveKleinToolTheme(options.theme);
    this.id = this.ids.next('whiteboard');
    const initial = options.initialSnapshot ?? createEmptyWhiteboardSnapshot();
    this.snapshot = normalizeSnapshot(initial, options);
    if (options.initialTool) this.snapshot.appState = { ...this.snapshot.appState, activeTool: options.initialTool };
    if (options.container) this.mount(options.container);
  }

  mount(container: HTMLElement): void {
    this.destroy();
    this.container = container;
    this.container.dataset.kleinInstrument = 'whiteboard';
    this.container.innerHTML = '';

    const root = document.createElement('div');
    root.className = 'kwb-root';
    root.dataset.kleinTheme = this.theme.colorScheme;
    applyKleinToolTheme(root, this.theme);
    root.tabIndex = 0;
    root.append(createStyleElement());

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('kwb-canvas');
    svg.setAttribute('role', 'application');
    svg.setAttribute('aria-label', 'Klein Whiteboard');
    root.append(svg);

    const toolbar = document.createElement('div');
    toolbar.className = 'kwb-toolbar';
    if (this.options.showToolbar !== false) root.append(toolbar);

    const status = document.createElement('div');
    status.className = 'kwb-status';
    root.append(status);

    this.root = root;
    this.svg = svg;
    this.toolbar = toolbar;
    this.status = status;
    this.container.append(root);

    svg.addEventListener('pointerdown', this.onPointerDown);
    svg.addEventListener('pointermove', this.onPointerMove);
    svg.addEventListener('pointerup', this.onPointerUp);
    svg.addEventListener('pointercancel', this.onPointerUp);
    svg.addEventListener('wheel', this.onWheel, { passive: false });
    root.addEventListener('keydown', this.onKeyDown);
    root.addEventListener('keyup', this.onKeyUp);

    this.mounted = true;
    this.render();
  }

  destroy(): void {
    if (this.svg) {
      this.svg.removeEventListener('pointerdown', this.onPointerDown);
      this.svg.removeEventListener('pointermove', this.onPointerMove);
      this.svg.removeEventListener('pointerup', this.onPointerUp);
      this.svg.removeEventListener('pointercancel', this.onPointerUp);
      this.svg.removeEventListener('wheel', this.onWheel);
    }
    if (this.root) {
      this.root.removeEventListener('keydown', this.onKeyDown);
      this.root.removeEventListener('keyup', this.onKeyUp);
      this.root.remove();
    }
    if (this.container?.dataset.kleinInstrument === 'whiteboard') {
      delete this.container.dataset.kleinInstrument;
    }
    this.root = undefined;
    this.svg = undefined;
    this.toolbar = undefined;
    this.status = undefined;
    this.container = undefined;
    this.pointer = null;
    this.mounted = false;
  }

  getSnapshot(): WhiteboardSnapshot {
    return cloneSnapshot(this.snapshot);
  }

  subscribeDelta(listener: (delta: WhiteboardDelta, meta: DeltaMeta) => void): () => void {
    this.deltaListeners.add(listener);
    return () => this.deltaListeners.delete(listener);
  }

  loadSnapshot(snapshot: WhiteboardSnapshot, options?: LoadOptions): void {
    const view = options?.preserveView ? this.snapshot.appState?.view : undefined;
    this.snapshot = normalizeSnapshot(snapshot, this.options);
    if (view) this.snapshot.appState = { ...this.snapshot.appState, view };
    this.undoStack = [];
    this.redoStack = [];
    this.render();
  }

  applyDelta(delta: WhiteboardDelta, options: ApplyDeltaOptions = {}): void {
    const commitOptions: { emit: boolean; source: DeltaMeta['source']; recordHistory: boolean; meta?: Partial<DeltaMeta> } = {
      emit: options.emit ?? false,
      source: options.meta?.source ?? 'remote',
      recordHistory: options.meta?.source === 'local',
    };
    if (options.meta) commitOptions.meta = options.meta;
    this.commitDelta(delta, commitOptions);
  }

  setTool(tool: WhiteboardTool): void {
    this.snapshot.appState = { ...this.snapshot.appState, activeTool: tool, selectedIds: tool === 'select' ? this.selectedIds() : [] };
    this.setStatus(TOOL_LABELS[tool]);
    this.render();
  }

  setView(view: View2D): void {
    this.commitDelta({ op: 'setView', view: sanitizeView(view) }, { emit: true, source: 'local', recordHistory: false });
  }

  setStyle(style: Partial<WhiteboardStyleState>): void {
    this.snapshot.appState = {
      ...this.snapshot.appState,
      style: {
        ...this.style(),
        ...style,
      },
    };
    this.renderToolbar();
  }

  addImage(src: string, position: Vector2 = { x: 0, y: 0 }, options: { width?: number; height?: number; alt?: string } = {}): string {
    const element: ImageElement = {
      id: this.ids.next('image'),
      type: 'image',
      x: position.x,
      y: position.y,
      src,
      width: positive(options.width, 320),
      height: positive(options.height, 220),
    };
    if (options.alt) element.alt = options.alt;
    this.commitDelta({ op: 'add', element }, { emit: true, source: 'local', recordHistory: true });
    return element.id;
  }

  addTemplate(template: WhiteboardTemplateKind, position: Vector2 = { x: 0, y: 0 }): string {
    const element = this.createTemplateElement(position, template);
    this.commitDelta({ op: 'add', element }, { emit: true, source: 'local', recordHistory: true });
    return element.id;
  }

  addEmbeddedCard(input: Omit<CreateWhiteboardEmbeddedCardInput, 'id'> & { id?: string }): string {
    const element = createWhiteboardEmbeddedCardElement({
      ...input,
      id: input.id ?? this.ids.next('embed'),
    });
    this.commitDelta({ op: 'add', element }, { emit: true, source: 'local', recordHistory: true });
    return element.id;
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.applyDeltaInternal(entry.inverse);
    this.redoStack.push(entry);
    this.emit(entry.inverse, 'history');
    this.render();
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.applyDeltaInternal(entry.forward);
    this.undoStack.push(entry);
    this.emit(entry.forward, 'history');
    this.render();
  }

  async export(options: ExportOptions): Promise<ExportResult> {
    if (options.format === 'json') {
      const snapshot = cloneSnapshot(this.snapshot);
      if (options.includeAppState === false) {
        const { appState: _appState, ...withoutAppState } = snapshot;
        return { format: 'json', mimeType: 'application/json', data: withoutAppState as unknown as JsonValue };
      }
      return { format: 'json', mimeType: 'application/json', data: snapshot as unknown as JsonValue };
    }
    if (options.format === 'svg') {
      return { format: 'svg', mimeType: 'image/svg+xml', data: exportWhiteboardSvg(this.snapshot, options) };
    }
    if (options.format === 'png' || options.format === 'thumbnail') {
      const data = await svgToPng(exportWhiteboardSvg(this.snapshot, options), options.width ?? 1280, options.height ?? 720, options.scale ?? 1);
      return {
        format: options.format,
        mimeType: 'image/png',
        data,
      };
    }
    throw new KleinSdkError('unsupported_export', `Whiteboard does not support ${options.format} export yet.`);
  }

  exportFrameSvg(frameId: string, options: WhiteboardFrameExportOptions = {}): string {
    return exportWhiteboardFrameSvg(this.snapshot, frameId, options);
  }

  getToolDefinitions(): WhiteboardToolDefinition[] {
    return getWhiteboardToolDefinitions();
  }

  getFeatures(): WhiteboardFeature[] {
    return getWhiteboardFeatures();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.svg || event.button !== 0 && event.button !== 1) return;
    this.root?.focus({ preventScroll: true });
    this.svg.setPointerCapture(event.pointerId);
    const point = this.eventToWorld(event);
    const tool = this.activeTool();
    const hitId = this.hitIdFromEvent(event);

    if (event.button === 1 || this.spacePressed || tool === 'pan') {
      this.pointer = this.createPointerSession('pan', event.pointerId, point, event);
      return;
    }
    if (this.options.readOnly) return;

    if (tool === 'eraser') {
      const target = hitId ?? this.hitTest(point);
      if (target) this.commitDelta({ op: 'delete', ids: [target] }, { emit: true, source: 'local', recordHistory: true });
      this.pointer = this.createPointerSession('draw', event.pointerId, point, event);
      return;
    }

    if (tool === 'select') {
      if (hitId) {
        this.selectForPointer(hitId, event.shiftKey);
        this.pointer = this.createMoveSession(event.pointerId, point, event);
      } else {
        this.setSelected([]);
        this.pointer = this.createPointerSession('box', event.pointerId, point, event);
      }
      this.render();
      return;
    }

    if (tool === 'pen' || tool === 'highlighter') {
      const session = this.createPointerSession('draw', event.pointerId, point, event);
      session.points = [pointWithPressure(point, event.pressure)];
      this.pointer = session;
      return;
    }

    if (isShapeTool(tool) || isLineTool(tool)) {
      this.pointer = this.createPointerSession('shape', event.pointerId, point, event);
      return;
    }

    this.placeInstantElement(tool, point);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.pointer || event.pointerId !== this.pointer.pointerId) return;
    const point = this.eventToWorld(event);
    const session = this.pointer;
    const tool = this.activeTool();

    if (session.mode === 'pan') {
      const view = this.view();
      const dx = event.clientX - session.last.x;
      const dy = event.clientY - session.last.y;
      this.snapshot.appState = { ...this.snapshot.appState, view: { ...view, x: view.x + dx, y: view.y + dy } };
      session.last = { x: event.clientX, y: event.clientY };
      this.render();
      return;
    }

    if (this.options.readOnly) return;

    if (session.mode === 'draw') {
      if (tool === 'eraser') {
        const target = this.hitTest(point);
        if (target) this.commitDelta({ op: 'delete', ids: [target] }, { emit: true, source: 'local', recordHistory: true });
        return;
      }
      session.points.push(pointWithPressure(point, event.pressure));
      session.liveElement = this.createStrokeElement(session.points, tool === 'highlighter');
      this.render();
      return;
    }

    if (session.mode === 'shape') {
      const element = this.createDragElement(tool, session.start, point, event.shiftKey);
      if (element) session.liveElement = element;
      this.render();
      return;
    }

    if (session.mode === 'move') {
      const dx = point.x - session.start.x;
      const dy = point.y - session.start.y;
      for (const [id, original] of Object.entries(session.original)) {
        this.snapshot.scene.elements[id] = moveElement(original, dx, dy);
      }
      this.render();
      return;
    }

    if (session.mode === 'box') {
      session.liveElement = this.createSelectionBox(session.start, point);
      this.render();
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.pointer || event.pointerId !== this.pointer.pointerId) return;
    const session = this.pointer;
    const tool = this.activeTool();
    const point = this.eventToWorld(event);
    this.pointer = null;

    if (session.mode === 'draw' && !this.options.readOnly && (tool === 'pen' || tool === 'highlighter')) {
      if (session.points.length > 1) {
        this.commitDelta({ op: 'add', element: this.createStrokeElement(session.points, tool === 'highlighter') }, { emit: true, source: 'local', recordHistory: true });
      } else {
        this.render();
      }
      return;
    }

    if (session.mode === 'shape' && !this.options.readOnly) {
      const element = this.createDragElement(tool, session.start, point, event.shiftKey);
      if (element && elementSize(element) > 3) {
        this.commitDelta({ op: 'add', element }, { emit: true, source: 'local', recordHistory: true });
      } else {
        this.render();
      }
      return;
    }

    if (session.mode === 'move' && !this.options.readOnly) {
      const updates: WhiteboardDelta[] = [];
      for (const id of Object.keys(session.original)) {
        const current = this.snapshot.scene.elements[id];
        if (current) updates.push({ op: 'update', id, changes: current as Partial<WhiteboardElement> });
      }
      if (updates.length) {
        const forward: WhiteboardDelta = updates.length === 1 && updates[0] ? updates[0] : { op: 'batch', deltas: updates };
        const inverse: WhiteboardDelta = {
          op: 'batch',
          deltas: Object.values(session.original).map(element => ({ op: 'update', id: element.id, changes: element as Partial<WhiteboardElement> })),
        };
        this.undoStack.push({ forward, inverse });
        this.redoStack = [];
        this.emit(forward, 'local');
      }
      this.render();
      return;
    }

    if (session.mode === 'box' && !this.options.readOnly) {
      const box = normalizeRect(session.start, point);
      const selected = this.snapshot.scene.order.filter(id => {
        const element = this.snapshot.scene.elements[id];
        return element ? rectsOverlap(elementBounds(element), box) : false;
      });
      this.setSelected(selected);
    }

    this.render();
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (!this.svg) return;
    const rect = this.svg.getBoundingClientRect();
    const view = this.view();
    if (event.ctrlKey || event.metaKey) {
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const zoom = clamp(view.zoom * Math.pow(0.999, event.deltaY), 0.12, 6);
      const scale = zoom / view.zoom;
      this.snapshot.appState = {
        ...this.snapshot.appState,
        view: {
          zoom,
          x: mx - scale * (mx - view.x),
          y: my - scale * (my - view.y),
        },
      };
    } else {
      this.snapshot.appState = {
        ...this.snapshot.appState,
        view: {
          ...view,
          x: view.x - event.deltaX,
          y: view.y - event.deltaY,
        },
      };
    }
    this.render();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.options.enableKeyboardShortcuts === false) return;
    if (isEditableTarget(event.target)) return;
    if (event.code === 'Space') {
      this.spacePressed = true;
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redo();
      return;
    }
    if (event.key === 'Escape') {
      this.setSelected([]);
      this.render();
      return;
    }
    if (!this.options.readOnly && (event.key === 'Delete' || event.key === 'Backspace')) {
      const selected = this.selectedIds();
      if (selected.length) {
        event.preventDefault();
        this.commitDelta({ op: 'delete', ids: selected }, { emit: true, source: 'local', recordHistory: true });
      }
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const tool = TOOL_SHORTCUTS[event.key.toLowerCase()];
    if (tool) this.setTool(tool);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') this.spacePressed = false;
  };

  private commitDelta(delta: WhiteboardDelta, options: { emit: boolean; source: DeltaMeta['source']; recordHistory: boolean; meta?: Partial<DeltaMeta> }): void {
    const inverse = options.recordHistory ? invertDelta(this.snapshot, delta) : undefined;
    this.applyDeltaInternal(delta);
    if (inverse) {
      this.undoStack.push({ forward: cloneDelta(delta), inverse });
      this.redoStack = [];
    }
    if (options.emit) this.emit(delta, options.source, options.meta);
    this.render();
  }

  private applyDeltaInternal(delta: WhiteboardDelta): void {
    this.snapshot = applyWhiteboardDelta(this.snapshot, delta);
  }

  private emit(delta: WhiteboardDelta, source: DeltaMeta['source'], meta?: Partial<DeltaMeta>): void {
    const deltaMeta: DeltaMeta = {
      id: meta?.id ?? this.ids.next('delta'),
      createdAt: meta?.createdAt ?? Date.now(),
      source,
    };
    if (meta?.actorId) deltaMeta.actorId = meta.actorId;
    const listeners = [
      ...(this.options.onDelta ? [this.options.onDelta] : []),
      ...this.deltaListeners,
    ];
    for (const listener of listeners) {
      try {
        listener(cloneDelta(delta), { ...deltaMeta });
      } catch (error) {
        const sdkError = error instanceof KleinSdkError
          ? error
          : new KleinSdkError('whiteboard_observer_failed', error instanceof Error ? error.message : 'A whiteboard delta observer failed.');
        try {
          this.options.onError?.(sdkError);
        } catch {
          // Error observers are isolated from committed whiteboard transactions.
        }
      }
    }
  }

  private render(): void {
    if (!this.mounted || !this.svg) return;
    const rect = this.svg.getBoundingClientRect();
    const width = Math.max(1, rect.width || this.container?.clientWidth || 1280);
    const height = Math.max(1, rect.height || this.container?.clientHeight || 720);
    const view = this.view();
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.svg.innerHTML = this.renderSvgInner(width, height, true);
    this.renderToolbar();
    this.renderStatus();
  }

  private renderSvgInner(width: number, height: number, interactive: boolean): string {
    const renderOptions: {
      interactive: boolean;
      cursor: string;
      dotGrid: boolean;
      liveElement?: WhiteboardElement;
      selectedIds?: string[];
      backgroundColor?: string;
    } = {
      interactive,
      cursor: interactive ? this.cursor() : 'default',
      dotGrid: this.options.dotGrid !== false,
      selectedIds: this.selectedIds(),
    };
    if (this.pointer?.liveElement) renderOptions.liveElement = this.pointer.liveElement;
    if (this.options.backgroundColor !== undefined) renderOptions.backgroundColor = this.options.backgroundColor;
    return renderWhiteboardSvgInner(this.snapshot, width, height, renderOptions);
  }

  private renderToolbar(): void {
    if (!this.toolbar || this.options.showToolbar === false) return;
    const style = this.style();
    const active = this.activeTool();
    const toolButtons = (Object.keys(TOOL_LABELS) as WhiteboardTool[]).map(tool => (
      `<button type="button" class="kwb-tool ${active === tool ? 'kwb-tool--active' : ''}" data-tool="${tool}" title="${TOOL_LABELS[tool]}">${toolGlyph(tool)}</button>`
    )).join('');
    const colors = COLORS.map(color => `<button type="button" class="kwb-swatch ${style.color === color ? 'kwb-swatch--active' : ''}" data-color="${color}" style="background:${color}" title="${color}"></button>`).join('');
    const sticky = STICKY_COLORS.map(color => `<button type="button" class="kwb-swatch ${style.stickyColor === color ? 'kwb-swatch--active' : ''}" data-sticky="${color}" style="background:${color}" title="${color}"></button>`).join('');
    const widths = WIDTHS.map(width => `<button type="button" class="kwb-width ${style.strokeWidth === width ? 'kwb-width--active' : ''}" data-width="${width}"><span style="height:${Math.min(18, width)}px;background:${style.color}"></span></button>`).join('');
    this.toolbar.innerHTML = `
      <div class="kwb-toolbar__row">${toolButtons}</div>
      <div class="kwb-toolbar__row kwb-toolbar__row--small">
        <button type="button" class="kwb-action" data-action="undo">Undo</button>
        <button type="button" class="kwb-action" data-action="redo">Redo</button>
        <button type="button" class="kwb-action kwb-action--danger" data-action="clear">Clear</button>
      </div>
      <div class="kwb-toolbar__label">Ink</div>
      <div class="kwb-toolbar__row kwb-toolbar__row--palette">${colors}</div>
      <div class="kwb-toolbar__row kwb-toolbar__row--palette">${widths}</div>
      <div class="kwb-toolbar__label">Sticky</div>
      <div class="kwb-toolbar__row kwb-toolbar__row--palette">${sticky}</div>
      <div class="kwb-toolbar__row kwb-toolbar__row--small">
        <button type="button" class="kwb-action" data-action="template">Template</button>
        <button type="button" class="kwb-action" data-action="stamp">Stamp</button>
      </div>
    `;
    this.toolbar.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(button => {
      button.addEventListener('click', () => this.setTool(button.dataset.tool as WhiteboardTool));
    });
    this.toolbar.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(button => {
      button.addEventListener('click', () => this.setStyle({ color: button.dataset.color ?? DEFAULT_STYLE.color }));
    });
    this.toolbar.querySelectorAll<HTMLButtonElement>('[data-sticky]').forEach(button => {
      button.addEventListener('click', () => this.setStyle({ stickyColor: button.dataset.sticky ?? DEFAULT_STYLE.stickyColor }));
    });
    this.toolbar.querySelectorAll<HTMLButtonElement>('[data-width]').forEach(button => {
      button.addEventListener('click', () => this.setStyle({ strokeWidth: Number(button.dataset.width) || DEFAULT_STYLE.strokeWidth }));
    });
    this.toolbar.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => {
      button.addEventListener('click', () => this.handleToolbarAction(button.dataset.action ?? ''));
    });
  }

  private renderStatus(): void {
    if (!this.status) return;
    const view = this.view();
    const count = this.snapshot.scene.order.length;
    const selected = this.selectedIds().length;
    this.status.textContent = `${TOOL_LABELS[this.activeTool()]} | ${Math.round(view.zoom * 100)}% | ${count} objects${selected ? ` | ${selected} selected` : ''}`;
  }

  private handleToolbarAction(action: string): void {
    if (action === 'undo') this.undo();
    else if (action === 'redo') this.redo();
    else if (action === 'clear' && !this.options.readOnly) this.commitDelta({ op: 'clear' }, { emit: true, source: 'local', recordHistory: true });
    else if (action === 'template') this.cycleTemplate();
    else if (action === 'stamp') this.cycleStamp();
  }

  private placeInstantElement(tool: WhiteboardTool, point: Vector2): void {
    if (this.options.readOnly) return;
    let element: WhiteboardElement | null = null;
    if (tool === 'text') {
      const text = window.prompt('Text') ?? '';
      if (!text.trim()) return;
      element = {
        id: this.ids.next('text'),
        type: 'text',
        x: point.x,
        y: point.y,
        text,
        color: this.style().color,
        fontSize: this.style().fontSize,
        width: 260,
      };
    } else if (tool === 'sticky') {
      const text = window.prompt('Sticky note') ?? '';
      element = {
        id: this.ids.next('sticky'),
        type: 'sticky',
        x: point.x,
        y: point.y,
        text,
        color: this.style().stickyColor,
        width: 220,
        height: 170,
      };
    } else if (tool === 'image') {
      const src = window.prompt('Image URL or data URL') ?? '';
      if (!src.trim()) return;
      element = {
        id: this.ids.next('image'),
        type: 'image',
        x: point.x,
        y: point.y,
        src,
        width: 320,
        height: 220,
      };
    } else if (tool === 'stamp') {
      element = {
        id: this.ids.next('stamp'),
        type: 'stamp',
        x: point.x,
        y: point.y,
        stamp: this.style().stamp,
        color: this.style().color,
        width: 72,
        height: 72,
      };
    } else if (tool === 'frame') {
      element = {
        id: this.ids.next('frame'),
        type: 'frame',
        x: point.x,
        y: point.y,
        title: window.prompt('Frame title') ?? 'Frame',
        width: 520,
        height: 320,
        color: this.style().color,
      };
    } else if (tool === 'template') {
      element = this.createTemplateElement(point, this.style().template);
    }
    if (!element) return;
    this.commitDelta({ op: 'add', element }, { emit: true, source: 'local', recordHistory: true });
  }

  private createStrokeElement(points: Array<{ x: number; y: number; pressure?: number }>, highlighter: boolean): StrokeElement {
    return {
      id: this.ids.next('stroke'),
      type: 'stroke',
      tool: highlighter ? 'highlighter' : 'pen',
      x: 0,
      y: 0,
      points: simplifyPoints(points),
      color: this.style().color,
      width: highlighter ? Math.max(10, this.style().strokeWidth * 2.6) : this.style().strokeWidth,
      opacity: highlighter ? 0.36 : 1,
    };
  }

  private createDragElement(tool: WhiteboardTool, start: Vector2, end: Vector2, square: boolean): WhiteboardElement | null {
    const id = this.ids.next(isLineTool(tool) ? 'line' : 'shape');
    if (isLineTool(tool)) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const variant: WhiteboardLineVariant = tool === 'arrow' ? 'arrow' : tool === 'doubleArrow' ? 'doubleArrow' : tool === 'connector' ? 'connector' : 'line';
      return { id, type: 'line', variant, x: start.x, y: start.y, dx, dy, color: this.style().color, width: this.style().strokeWidth };
    }
    if (!isShapeTool(tool)) return null;
    const rect = normalizeRect(start, end);
    if (square) {
      const size = Math.max(rect.width, rect.height);
      rect.width = size;
      rect.height = size;
    }
    const shape: WhiteboardShapeKind = tool === 'polygon' ? 'polygon' : tool;
    const element: ShapeElement = {
      id,
      type: 'shape',
      shape,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      strokeColor: this.style().color,
      strokeWidth: this.style().strokeWidth,
    };
    if (this.style().fillColor !== 'transparent') element.fillColor = this.style().fillColor;
    return element;
  }

  private createSelectionBox(start: Vector2, end: Vector2): ShapeElement {
    const rect = normalizeRect(start, end);
    return {
      id: '__selection_box',
      type: 'shape',
      shape: 'rectangle',
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      strokeColor: '#3157d5',
      strokeWidth: 1,
      fillColor: 'rgba(49,87,213,0.08)',
    };
  }

  private createTemplateElement(position: Vector2, template: WhiteboardTemplateKind): TemplateElement {
    return {
      id: this.ids.next('template'),
      type: 'template',
      x: position.x,
      y: position.y,
      template,
      title: templateLabel(template),
      width: template === 'kanban' ? 720 : 620,
      height: template === 'cornell' ? 520 : 400,
      color: this.style().color,
    };
  }

  private createPointerSession(mode: PointerMode, pointerId: number, point: Vector2, event: PointerEvent): PointerSession {
    return {
      mode,
      pointerId,
      start: point,
      last: { x: event.clientX, y: event.clientY },
      points: [],
      original: {},
    };
  }

  private createMoveSession(pointerId: number, point: Vector2, event: PointerEvent): PointerSession {
    const original: Record<string, WhiteboardElement> = {};
    for (const id of this.selectedIds()) {
      const element = this.snapshot.scene.elements[id];
      if (element && !element.locked) original[id] = cloneElement(element);
    }
    return {
      mode: 'move',
      pointerId,
      start: point,
      last: { x: event.clientX, y: event.clientY },
      points: [],
      original,
    };
  }

  private eventToWorld(event: PointerEvent): Vector2 {
    if (!this.svg) return { x: 0, y: 0 };
    const rect = this.svg.getBoundingClientRect();
    const view = this.view();
    return {
      x: (event.clientX - rect.left - view.x) / view.zoom,
      y: (event.clientY - rect.top - view.y) / view.zoom,
    };
  }

  private hitIdFromEvent(event: PointerEvent): string | null {
    const target = event.target instanceof Element ? event.target.closest<SVGGraphicsElement>('[data-kwb-id]') : null;
    return target?.dataset.kwbId ?? null;
  }

  private hitTest(point: Vector2): string | null {
    const tolerance = 8 / this.view().zoom;
    const ordered = [...this.snapshot.scene.order].reverse();
    for (const id of ordered) {
      const element = this.snapshot.scene.elements[id];
      if (!element || element.hidden || element.locked) continue;
      if (elementContainsPoint(element, point, tolerance)) return id;
    }
    return null;
  }

  private selectForPointer(id: string, additive: boolean): void {
    const current = this.selectedIds();
    if (additive) {
      this.setSelected(current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
    } else {
      this.setSelected(current.includes(id) ? current : [id]);
    }
  }

  private setSelected(ids: string[]): void {
    this.snapshot.appState = {
      ...this.snapshot.appState,
      selectedIds: ids.filter(id => Boolean(this.snapshot.scene.elements[id])),
    };
  }

  private selectedIds(): string[] {
    return this.snapshot.appState?.selectedIds ?? [];
  }

  private activeTool(): WhiteboardTool {
    return this.snapshot.appState?.activeTool ?? 'select';
  }

  private style(): WhiteboardStyleState {
    return { ...DEFAULT_STYLE, ...(this.snapshot.appState?.style ?? {}) };
  }

  private view(): View2D {
    return sanitizeView(this.snapshot.appState?.view ?? DEFAULT_VIEW);
  }

  private cursor(): string {
    if (this.pointer?.mode === 'pan') return 'grabbing';
    switch (this.activeTool()) {
      case 'select': return 'default';
      case 'pan': return 'grab';
      case 'eraser': return 'cell';
      case 'text': return 'text';
      case 'sticky':
      case 'stamp':
      case 'image':
      case 'template':
      case 'frame':
        return 'copy';
      default:
        return 'crosshair';
    }
  }

  private cycleTemplate(): void {
    const templates: WhiteboardTemplateKind[] = ['brainstorm', 'kanban', 'lesson', 'swot', 'grid', 'cornell'];
    const index = templates.indexOf(this.style().template);
    this.setStyle({ template: templates[(index + 1) % templates.length] ?? 'brainstorm' });
    this.setTool('template');
  }

  private cycleStamp(): void {
    const stamps: WhiteboardStampKind[] = ['star', 'check', 'heart', 'smile', 'question', 'exclamation'];
    const index = stamps.indexOf(this.style().stamp);
    this.setStyle({ stamp: stamps[(index + 1) % stamps.length] ?? 'star' });
    this.setTool('stamp');
  }

  private setStatus(message: string): void {
    if (this.status) this.status.textContent = message;
  }

}

export function applyWhiteboardDelta(snapshot: WhiteboardSnapshot, delta: WhiteboardDelta): WhiteboardSnapshot {
  if (delta.op === 'batch') {
    return delta.deltas.reduce(applyWhiteboardDelta, snapshot);
  }
  const next = cloneSnapshot(snapshot);
  if (delta.op === 'add') {
    next.scene.elements[delta.element.id] = cloneElement(delta.element);
    const without = next.scene.order.filter(id => id !== delta.element.id);
    const index = delta.index === undefined ? without.length : clamp(Math.floor(delta.index), 0, without.length);
    without.splice(index, 0, delta.element.id);
    next.scene.order = without;
  } else if (delta.op === 'update') {
    const current = next.scene.elements[delta.id];
    if (current) next.scene.elements[delta.id] = { ...current, ...delta.changes } as WhiteboardElement;
  } else if (delta.op === 'delete') {
    for (const id of delta.ids) delete next.scene.elements[id];
    next.scene.order = next.scene.order.filter(id => !delta.ids.includes(id));
    next.appState = { ...next.appState, selectedIds: (next.appState?.selectedIds ?? []).filter(id => !delta.ids.includes(id)) };
  } else if (delta.op === 'reorder') {
    const known = new Set(Object.keys(next.scene.elements));
    next.scene.order = delta.order.filter(id => known.has(id));
    for (const id of Object.keys(next.scene.elements)) {
      if (!next.scene.order.includes(id)) next.scene.order.push(id);
    }
  } else if (delta.op === 'setView') {
    next.appState = { ...next.appState, view: sanitizeView(delta.view) };
  } else if (delta.op === 'setAppState') {
    next.appState = { ...next.appState, ...delta.changes };
  } else if (delta.op === 'clear') {
    next.scene.elements = {};
    next.scene.order = [];
    next.appState = { ...next.appState, selectedIds: [] };
  }
  next.metadata = { ...(next.metadata ?? {}), updatedAt: Date.now() };
  return next;
}

function invertDelta(snapshot: WhiteboardSnapshot, delta: WhiteboardDelta): WhiteboardDelta {
  if (delta.op === 'batch') {
    let current = cloneSnapshot(snapshot);
    const inverses: WhiteboardDelta[] = [];
    for (const item of delta.deltas) {
      inverses.unshift(invertDelta(current, item));
      current = applyWhiteboardDelta(current, item);
    }
    return { op: 'batch', deltas: inverses };
  }
  if (delta.op === 'add') return { op: 'delete', ids: [delta.element.id] };
  if (delta.op === 'update') {
    const current = snapshot.scene.elements[delta.id];
    if (!current) return { op: 'batch', deltas: [] };
    const changes: Record<string, unknown> = {};
    for (const key of Object.keys(delta.changes)) {
      changes[key] = (current as unknown as Record<string, unknown>)[key];
    }
    return { op: 'update', id: delta.id, changes: changes as Partial<WhiteboardElement> };
  }
  if (delta.op === 'delete') {
    const deltas: WhiteboardDelta[] = [];
    for (const id of delta.ids) {
      const element = snapshot.scene.elements[id];
      if (element) deltas.push({ op: 'add', element, index: snapshot.scene.order.indexOf(id) });
    }
    return { op: 'batch', deltas };
  }
  if (delta.op === 'reorder') return { op: 'reorder', order: [...snapshot.scene.order] };
  if (delta.op === 'setView') return { op: 'setView', view: snapshot.appState?.view ?? DEFAULT_VIEW };
  if (delta.op === 'setAppState') return { op: 'setAppState', changes: snapshot.appState ?? {} };
  return {
    op: 'batch',
    deltas: snapshot.scene.order
      .map(id => snapshot.scene.elements[id])
      .filter((element): element is WhiteboardElement => Boolean(element))
      .map(element => ({ op: 'add', element })),
  };
}

function normalizeSnapshot(snapshot: WhiteboardSnapshot, options: WhiteboardOptions): WhiteboardSnapshot {
  const base = createEmptyWhiteboardSnapshot();
  const scene = snapshot.scene ?? base.scene;
  const elements = { ...(scene.elements ?? {}) };
  const known = new Set(Object.keys(elements));
  const order = (scene.order ?? Object.keys(elements)).filter(id => known.has(id));
  for (const id of Object.keys(elements)) {
    if (!order.includes(id)) order.push(id);
  }
  const backgroundColor = scene.backgroundColor ?? options.backgroundColor ?? base.scene.backgroundColor;
  const normalizedScene: WhiteboardScene = {
    elements,
    order,
  };
  if (backgroundColor) normalizedScene.backgroundColor = backgroundColor;
  return {
    ...base,
    ...cloneSnapshot(snapshot),
    version: 1,
    instrument: 'whiteboard',
    scene: normalizedScene,
    appState: {
      ...base.appState,
      ...(snapshot.appState ?? {}),
      view: sanitizeView(snapshot.appState?.view ?? base.appState?.view ?? DEFAULT_VIEW),
      activeTool: snapshot.appState?.activeTool ?? options.initialTool ?? 'select',
      selectedIds: snapshot.appState?.selectedIds ?? [],
      style: { ...DEFAULT_STYLE, ...(snapshot.appState?.style ?? {}) },
    },
  };
}

function sanitizeView(view: View2D): View2D {
  return {
    x: finite(view.x, 0),
    y: finite(view.y, 0),
    zoom: clamp(finite(view.zoom, 1), 0.12, 6),
  };
}

function renderWhiteboardSvgDocument(
  snapshot: WhiteboardSnapshot,
  options: {
    width: number;
    height: number;
    view: View2D;
    includeGrid?: boolean;
    background?: ExportOptions['background'];
  },
): string {
  const normalized = normalizeSnapshot(snapshot, {});
  normalized.appState = { ...normalized.appState, view: sanitizeView(options.view), selectedIds: [] };
  const innerOptions: {
    interactive: boolean;
    cursor: string;
    dotGrid: boolean;
    backgroundColor?: string;
  } = {
    interactive: false,
    cursor: 'default',
    dotGrid: options.includeGrid !== false,
  };
  if (options.background === 'transparent') innerOptions.backgroundColor = 'transparent';
  else if (typeof options.background === 'string' && options.background !== 'white') innerOptions.backgroundColor = options.background;
  const inner = renderWhiteboardSvgInner(normalized, options.width, options.height, innerOptions);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}">${inner}</svg>`;
}

function renderWhiteboardSvgInner(
  snapshot: WhiteboardSnapshot,
  width: number,
  height: number,
  options: {
    interactive: boolean;
    cursor: string;
    dotGrid: boolean;
    liveElement?: WhiteboardElement;
    selectedIds?: string[];
    backgroundColor?: string;
  },
): string {
  const view = sanitizeView(snapshot.appState?.view ?? DEFAULT_VIEW);
  const bg = options.backgroundColor ?? snapshot.scene.backgroundColor ?? '#ffffff';
  const grid = options.dotGrid ? renderDotGrid(width, height, view) : '';
  const selected = new Set(options.selectedIds ?? []);
  const elements = snapshot.scene.order
    .map(id => snapshot.scene.elements[id])
    .filter((element): element is WhiteboardElement => Boolean(element && !element.hidden))
    .map(element => renderElement(element, selected.has(element.id), view.zoom))
    .join('');
  const live = options.liveElement ? renderLiveElement(options.liveElement, view.zoom) : '';
  return `
    <defs>${ARROW_MARKERS}</defs>
    <rect x="0" y="0" width="${width}" height="${height}" fill="${escapeAttr(bg)}"></rect>
    ${grid}
    <g class="kwb-world" style="cursor:${options.interactive ? options.cursor : 'default'}" transform="translate(${view.x} ${view.y}) scale(${view.zoom})">
      ${elements}
      ${live}
    </g>
  `;
}

function filterSnapshotToBounds(
  snapshot: WhiteboardSnapshot,
  bounds: { x: number; y: number; width: number; height: number },
  options: { excludeId?: string } = {},
): WhiteboardSnapshot {
  const next = cloneSnapshot(snapshot);
  next.scene.elements = {};
  next.scene.order = [];
  for (const id of snapshot.scene.order) {
    if (id === options.excludeId) continue;
    const element = snapshot.scene.elements[id];
    if (!element || element.hidden) continue;
    if (!rectsOverlap(elementBounds(element), bounds)) continue;
    next.scene.elements[id] = cloneElement(element);
    next.scene.order.push(id);
  }
  return next;
}

function flattenWhiteboardDeltas(deltas: WhiteboardDelta[]): WhiteboardDelta[] {
  const result: WhiteboardDelta[] = [];
  for (const delta of deltas) {
    if (delta.op === 'batch') result.push(...flattenWhiteboardDeltas(delta.deltas));
    else result.push(cloneDelta(delta));
  }
  return result;
}

function compactInkDelta(delta: WhiteboardDelta, minDistance: number): WhiteboardDelta {
  if (delta.op !== 'add' || delta.element.type !== 'stroke') return cloneDelta(delta);
  return {
    ...delta,
    element: {
      ...delta.element,
      points: simplifyPointsByDistance(delta.element.points, minDistance),
    },
  };
}

function mergeUpdateDelta(result: WhiteboardDelta[], delta: Extract<WhiteboardDelta, { op: 'update' }>): boolean {
  for (let index = result.length - 1; index >= 0; index -= 1) {
    const current = result[index];
    if (!current) continue;
    if (current.op === 'clear') return true;
    if (current.op === 'delete' && current.ids.includes(delta.id)) return true;
    if (current.op === 'add' && current.element.id === delta.id) {
      result[index] = { ...current, element: { ...current.element, ...delta.changes } as WhiteboardElement };
      return true;
    }
    if (current.op === 'update' && current.id === delta.id) {
      result[index] = { ...current, changes: { ...current.changes, ...delta.changes } };
      return true;
    }
  }
  return false;
}

function removeRedundantDeltasBeforeDelete(result: WhiteboardDelta[], ids: string[]): string[] {
  const remaining = new Set(ids);
  for (let index = result.length - 1; index >= 0; index -= 1) {
    const current = result[index];
    if (!current) continue;
    if (current.op === 'add' && remaining.has(current.element.id)) {
      result.splice(index, 1);
      remaining.delete(current.element.id);
      continue;
    }
    if (current.op === 'update' && remaining.has(current.id)) {
      result.splice(index, 1);
    }
  }
  return [...remaining];
}

function simplifyPointsByDistance(
  points: Array<{ x: number; y: number; pressure?: number }>,
  minDistance: number,
): Array<{ x: number; y: number; pressure?: number }> {
  if (points.length <= 2) return points.map(point => ({ ...point }));
  const result: Array<{ x: number; y: number; pressure?: number }> = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= minDistance) result.push({ ...point });
  }
  const final = points[points.length - 1];
  if (final && result[result.length - 1] !== final) {
    const last = result[result.length - 1];
    if (!last || last.x !== final.x || last.y !== final.y) result.push({ ...final });
  }
  return result;
}

function validateWhiteboardElement(value: unknown, path: string, expectedId?: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return [{ path, message: 'Whiteboard element must be an object.' }];
  if (typeof value.id !== 'string' || !value.id) issues.push({ path: `${path}.id`, message: 'Whiteboard element id must be a non-empty string.' });
  if (expectedId !== undefined && value.id !== expectedId) issues.push({ path: `${path}.id`, message: 'Whiteboard element id must match its scene key.' });
  if (typeof value.type !== 'string') issues.push({ path: `${path}.type`, message: 'Whiteboard element type must be a string.' });
  if (!isFiniteNumber(value.x)) issues.push({ path: `${path}.x`, message: 'Whiteboard element x must be a finite number.' });
  if (!isFiniteNumber(value.y)) issues.push({ path: `${path}.y`, message: 'Whiteboard element y must be a finite number.' });
  if (value.locked !== undefined && typeof value.locked !== 'boolean') issues.push({ path: `${path}.locked`, message: 'Whiteboard locked must be boolean.' });
  if (value.hidden !== undefined && typeof value.hidden !== 'boolean') issues.push({ path: `${path}.hidden`, message: 'Whiteboard hidden must be boolean.' });

  if (value.type === 'stroke') validateStrokeElement(value, path, issues);
  else if (value.type === 'shape') validateShapeElement(value, path, issues);
  else if (value.type === 'line') validateLineElement(value, path, issues);
  else if (value.type === 'text') validateTextElement(value, path, issues);
  else if (value.type === 'sticky') validateStickyElement(value, path, issues);
  else if (value.type === 'image') validateImageElement(value, path, issues);
  else if (value.type === 'stamp') validateStampElement(value, path, issues);
  else if (value.type === 'frame') validateFrameElement(value, path, issues);
  else if (value.type === 'template') validateTemplateElement(value, path, issues);
  else if (value.type === 'embed') validateEmbeddedCardElement(value, path, issues);
  else issues.push({ path: `${path}.type`, message: 'Whiteboard element type is unsupported.' });
  return issues;
}

function validateStrokeElement(value: Record<string, unknown>, path: string, issues: ValidationIssue[]): void {
  if (value.tool !== 'pen' && value.tool !== 'highlighter') issues.push({ path: `${path}.tool`, message: 'Stroke tool must be pen or highlighter.' });
  if (!Array.isArray(value.points) || value.points.length === 0) {
    issues.push({ path: `${path}.points`, message: 'Stroke points must be a non-empty array.' });
  } else {
    value.points.forEach((point, index) => {
      if (!isRecord(point) || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)) issues.push({ path: `${path}.points.${index}`, message: 'Stroke point must include finite x and y.' });
      if (isRecord(point) && point.pressure !== undefined && !isFiniteNumber(point.pressure)) issues.push({ path: `${path}.points.${index}.pressure`, message: 'Stroke pressure must be a finite number.' });
    });
  }
  requireString(value.color, `${path}.color`, issues);
  requirePositiveNumber(value.width, `${path}.width`, issues);
  requireNumber(value.opacity, `${path}.opacity`, issues);
}

function validateShapeElement(value: Record<string, unknown>, path: string, issues: ValidationIssue[]): void {
  if (!['rectangle', 'ellipse', 'triangle', 'polygon', 'diamond'].includes(String(value.shape))) issues.push({ path: `${path}.shape`, message: 'Shape kind is unsupported.' });
  requirePositiveNumber(value.width, `${path}.width`, issues);
  requirePositiveNumber(value.height, `${path}.height`, issues);
  requireString(value.strokeColor, `${path}.strokeColor`, issues);
  requirePositiveNumber(value.strokeWidth, `${path}.strokeWidth`, issues);
  if (value.fillColor !== undefined) requireString(value.fillColor, `${path}.fillColor`, issues);
}

function validateLineElement(value: Record<string, unknown>, path: string, issues: ValidationIssue[]): void {
  if (!['line', 'arrow', 'doubleArrow', 'connector'].includes(String(value.variant))) issues.push({ path: `${path}.variant`, message: 'Line variant is unsupported.' });
  requireNumber(value.dx, `${path}.dx`, issues);
  requireNumber(value.dy, `${path}.dy`, issues);
  requireString(value.color, `${path}.color`, issues);
  requirePositiveNumber(value.width, `${path}.width`, issues);
}

function validateTextElement(value: Record<string, unknown>, path: string, issues: ValidationIssue[]): void {
  requireString(value.text, `${path}.text`, issues);
  requireString(value.color, `${path}.color`, issues);
  requirePositiveNumber(value.fontSize, `${path}.fontSize`, issues);
  requirePositiveNumber(value.width, `${path}.width`, issues);
}

function validateStickyElement(value: Record<string, unknown>, path: string, issues: ValidationIssue[]): void {
  requireString(value.text, `${path}.text`, issues);
  requireString(value.color, `${path}.color`, issues);
  requirePositiveNumber(value.width, `${path}.width`, issues);
  requirePositiveNumber(value.height, `${path}.height`, issues);
}

function validateImageElement(value: Record<string, unknown>, path: string, issues: ValidationIssue[]): void {
  requireString(value.src, `${path}.src`, issues);
  if (value.alt !== undefined) requireString(value.alt, `${path}.alt`, issues);
  requirePositiveNumber(value.width, `${path}.width`, issues);
  requirePositiveNumber(value.height, `${path}.height`, issues);
}

function validateStampElement(value: Record<string, unknown>, path: string, issues: ValidationIssue[]): void {
  if (!['check', 'star', 'heart', 'smile', 'question', 'exclamation'].includes(String(value.stamp))) issues.push({ path: `${path}.stamp`, message: 'Stamp kind is unsupported.' });
  requireString(value.color, `${path}.color`, issues);
  requirePositiveNumber(value.width, `${path}.width`, issues);
  requirePositiveNumber(value.height, `${path}.height`, issues);
}

function validateFrameElement(value: Record<string, unknown>, path: string, issues: ValidationIssue[]): void {
  requireString(value.title, `${path}.title`, issues);
  requirePositiveNumber(value.width, `${path}.width`, issues);
  requirePositiveNumber(value.height, `${path}.height`, issues);
  requireString(value.color, `${path}.color`, issues);
}

function validateTemplateElement(value: Record<string, unknown>, path: string, issues: ValidationIssue[]): void {
  if (!['brainstorm', 'kanban', 'lesson', 'swot', 'grid', 'cornell'].includes(String(value.template))) issues.push({ path: `${path}.template`, message: 'Template kind is unsupported.' });
  requireString(value.title, `${path}.title`, issues);
  requirePositiveNumber(value.width, `${path}.width`, issues);
  requirePositiveNumber(value.height, `${path}.height`, issues);
  requireString(value.color, `${path}.color`, issues);
}

function validateEmbeddedCardElement(value: Record<string, unknown>, path: string, issues: ValidationIssue[]): void {
  if (!['graphing', 'geometry-lab', 'graphing-3d', 'scientific', 'probability'].includes(String(value.toolKey))) issues.push({ path: `${path}.toolKey`, message: 'Embedded card tool key is unsupported.' });
  requireString(value.title, `${path}.title`, issues);
  requirePositiveNumber(value.width, `${path}.width`, issues);
  requirePositiveNumber(value.height, `${path}.height`, issues);
  if (value.snapshot !== undefined && !isJsonValue(value.snapshot)) issues.push({ path: `${path}.snapshot`, message: 'Embedded card snapshot must be JSON-compatible.' });
  if (value.summary !== undefined) requireString(value.summary, `${path}.summary`, issues);
  if (value.sourceSessionId !== undefined) requireString(value.sourceSessionId, `${path}.sourceSessionId`, issues);
  if (value.revision !== undefined && !isFiniteNumber(value.revision)) issues.push({ path: `${path}.revision`, message: 'Embedded card revision must be a number.' });
}

function validateView(value: unknown, path: string): ValidationIssue[] {
  if (!isRecord(value)) return [{ path, message: 'Whiteboard view must be an object.' }];
  const issues: ValidationIssue[] = [];
  requireNumber(value.x, `${path}.x`, issues);
  requireNumber(value.y, `${path}.y`, issues);
  requirePositiveNumber(value.zoom, `${path}.zoom`, issues);
  return issues;
}

function requireString(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== 'string') issues.push({ path, message: 'Expected a string.' });
}

function requireNumber(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isFiniteNumber(value)) issues.push({ path, message: 'Expected a finite number.' });
}

function requirePositiveNumber(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isFiniteNumber(value) || value <= 0) issues.push({ path, message: 'Expected a positive finite number.' });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function isWhiteboardTool(value: unknown): value is WhiteboardTool {
  return typeof value === 'string' && value in TOOL_LABELS;
}

function toolGroup(tool: WhiteboardTool): WhiteboardToolDefinition['group'] {
  if (tool === 'select' || tool === 'pan') return 'navigate';
  if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') return 'ink';
  if (isShapeTool(tool)) return 'shape';
  if (isLineTool(tool)) return 'line';
  if (tool === 'frame' || tool === 'template') return 'organize';
  return 'content';
}

function createsWhiteboardElement(tool: WhiteboardTool): boolean {
  return tool !== 'select' && tool !== 'pan' && tool !== 'eraser';
}

function renderDotGrid(width: number, height: number, view: View2D): string {
  const spacing = 32 * view.zoom;
  const radius = Math.max(0.7, 1.2 * view.zoom);
  const x = positiveModulo(view.x, spacing);
  const y = positiveModulo(view.y, spacing);
  return `
    <defs>
      <pattern id="kwb-grid" x="${x}" y="${y}" width="${spacing}" height="${spacing}" patternUnits="userSpaceOnUse">
        <circle cx="${spacing / 2}" cy="${spacing / 2}" r="${radius}" fill="#d6dde8"></circle>
      </pattern>
    </defs>
    <rect x="0" y="0" width="${width}" height="${height}" fill="url(#kwb-grid)" opacity="0.75"></rect>
  `;
}

function renderElement(element: WhiteboardElement, selected: boolean, zoom: number): string {
  const body = renderElementBody(element, false, zoom);
  const bounds = selected ? renderSelectionBounds(element, zoom) : '';
  return `${body}${bounds}`;
}

function renderLiveElement(element: WhiteboardElement, zoom: number): string {
  return renderElementBody(element, true, zoom);
}

function renderElementBody(element: WhiteboardElement, live: boolean, zoom: number): string {
  const data = live ? '' : `data-kwb-id="${escapeAttr(element.id)}"`;
  const opacity = live ? ' opacity="0.72"' : '';
  if (element.type === 'stroke') {
    return `<path ${data} class="kwb-el" d="${strokePath(element.points)}" fill="none" stroke="${escapeAttr(element.color)}" stroke-width="${element.width}" stroke-linecap="round" stroke-linejoin="round" opacity="${element.opacity}" vector-effect="non-scaling-stroke"></path>`;
  }
  if (element.type === 'shape') {
    const fill = element.fillColor && element.fillColor !== 'transparent' ? element.fillColor : 'transparent';
    const common = `${data} class="kwb-el" fill="${escapeAttr(fill)}" stroke="${escapeAttr(element.strokeColor)}" stroke-width="${element.strokeWidth}" vector-effect="non-scaling-stroke"${opacity}`;
    if (element.shape === 'rectangle') return `<rect ${common} x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="6"></rect>`;
    if (element.shape === 'ellipse') return `<ellipse ${common} cx="${element.x + element.width / 2}" cy="${element.y + element.height / 2}" rx="${Math.abs(element.width / 2)}" ry="${Math.abs(element.height / 2)}"></ellipse>`;
    return `<polygon ${common} points="${shapePoints(element)}"></polygon>`;
  }
  if (element.type === 'line') {
    const markerStart = element.variant === 'doubleArrow' ? ' marker-start="url(#kwb-arrow-start)"' : '';
    const markerEnd = element.variant === 'arrow' || element.variant === 'doubleArrow' || element.variant === 'connector' ? ' marker-end="url(#kwb-arrow-end)"' : '';
    const dash = element.variant === 'connector' || element.dashed ? ' stroke-dasharray="8 8"' : '';
    return `<line ${data} class="kwb-el" x1="${element.x}" y1="${element.y}" x2="${element.x + element.dx}" y2="${element.y + element.dy}" stroke="${escapeAttr(element.color)}" stroke-width="${element.width}" stroke-linecap="round" vector-effect="non-scaling-stroke"${markerStart}${markerEnd}${dash}${opacity}></line>`;
  }
  if (element.type === 'text') {
    return `<text ${data} class="kwb-el kwb-text" x="${element.x}" y="${element.y}" fill="${escapeAttr(element.color)}" font-size="${element.fontSize}" font-weight="${element.bold ? 700 : 500}">${textTspans(element.text, element.x, element.y, element.fontSize, element.width)}</text>`;
  }
  if (element.type === 'sticky') {
    return `<g ${data} class="kwb-el">
      <rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="10" fill="${escapeAttr(element.color)}" stroke="rgba(23,32,51,0.16)" vector-effect="non-scaling-stroke"></rect>
      <path d="M ${element.x + element.width - 34} ${element.y} L ${element.x + element.width} ${element.y + 34} L ${element.x + element.width - 34} ${element.y + 34} Z" fill="rgba(255,255,255,0.36)"></path>
      <text x="${element.x + 16}" y="${element.y + 28}" fill="#172033" font-size="18" font-weight="560">${textTspans(element.text, element.x + 16, element.y + 28, 18, element.width - 32)}</text>
    </g>`;
  }
  if (element.type === 'image') {
    return `<image ${data} class="kwb-el" href="${escapeAttr(element.src)}" x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" preserveAspectRatio="xMidYMid meet"></image>`;
  }
  if (element.type === 'stamp') {
    return `<g ${data} class="kwb-el">
      <circle cx="${element.x + element.width / 2}" cy="${element.y + element.height / 2}" r="${Math.min(element.width, element.height) / 2}" fill="${escapeAttr(element.color)}" opacity="0.12"></circle>
      <circle cx="${element.x + element.width / 2}" cy="${element.y + element.height / 2}" r="${Math.min(element.width, element.height) / 2 - 3}" fill="transparent" stroke="${escapeAttr(element.color)}" stroke-width="${3 / zoom}" vector-effect="non-scaling-stroke"></circle>
      <text x="${element.x + element.width / 2}" y="${element.y + element.height / 2 + 9}" text-anchor="middle" fill="${escapeAttr(element.color)}" font-size="26" font-weight="760">${stampLabel(element.stamp)}</text>
    </g>`;
  }
  if (element.type === 'frame') {
    return `<g ${data} class="kwb-el">
      <rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="14" fill="transparent" stroke="${escapeAttr(element.color)}" stroke-width="${2 / zoom}" stroke-dasharray="12 8" vector-effect="non-scaling-stroke"></rect>
      <text x="${element.x + 16}" y="${element.y - 10}" fill="${escapeAttr(element.color)}" font-size="20" font-weight="650">${escapeText(element.title)}</text>
    </g>`;
  }
  if (element.type === 'embed') {
    const summary = element.summary ?? `${element.toolKey} snapshot`;
    const revision = element.revision !== undefined ? `rev ${element.revision}` : '';
    return `<g ${data} class="kwb-el">
      <rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="12" fill="#ffffff" stroke="#c8d2e2" stroke-width="${1.5 / zoom}" vector-effect="non-scaling-stroke"></rect>
      <rect x="${element.x}" y="${element.y}" width="${element.width}" height="44" rx="12" fill="rgba(49,87,213,0.08)"></rect>
      <text x="${element.x + 16}" y="${element.y + 28}" fill="#172033" font-size="17" font-weight="700">${escapeText(element.title)}</text>
      <text x="${element.x + element.width - 16}" y="${element.y + 28}" text-anchor="end" fill="#5f6c7d" font-size="12" font-weight="650">${escapeText(element.toolKey)}</text>
      <rect x="${element.x + 16}" y="${element.y + 60}" width="${Math.max(1, element.width - 32)}" height="${Math.max(1, element.height - 92)}" rx="8" fill="rgba(95,108,125,0.06)" stroke="rgba(95,108,125,0.16)" vector-effect="non-scaling-stroke"></rect>
      <text x="${element.x + 32}" y="${element.y + 90}" fill="#334155" font-size="15" font-weight="560">${textTspans(summary, element.x + 32, element.y + 90, 15, element.width - 64)}</text>
      <text x="${element.x + 16}" y="${element.y + element.height - 18}" fill="#718096" font-size="12">${escapeText([element.sourceSessionId, revision].filter(Boolean).join(' | '))}</text>
    </g>`;
  }
  return renderTemplate(element, data, zoom);
}

function renderTemplate(element: TemplateElement, data: string, zoom: number): string {
  const x = element.x;
  const y = element.y;
  const w = element.width;
  const h = element.height;
  const stroke = `stroke="${escapeAttr(element.color)}" stroke-width="${1.5 / zoom}" vector-effect="non-scaling-stroke"`;
  const title = `<text x="${x + 18}" y="${y + 30}" fill="${escapeAttr(element.color)}" font-size="20" font-weight="650">${escapeText(element.title)}</text>`;
  const base = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="rgba(255,255,255,0.7)" ${stroke}></rect>${title}`;
  if (element.template === 'kanban') {
    return `<g ${data} class="kwb-el">${base}${[1, 2].map(i => `<line x1="${x + (w * i) / 3}" y1="${y + 48}" x2="${x + (w * i) / 3}" y2="${y + h}" ${stroke}></line>`).join('')}${['To do', 'Doing', 'Done'].map((label, i) => `<text x="${x + 18 + (w * i) / 3}" y="${y + 72}" fill="#5f6c7d" font-size="16">${label}</text>`).join('')}</g>`;
  }
  if (element.template === 'swot') {
    return `<g ${data} class="kwb-el">${base}<line x1="${x}" y1="${y + h / 2}" x2="${x + w}" y2="${y + h / 2}" ${stroke}></line><line x1="${x + w / 2}" y1="${y + 48}" x2="${x + w / 2}" y2="${y + h}" ${stroke}></line>${['Strengths', 'Weaknesses', 'Opportunities', 'Threats'].map((label, i) => `<text x="${x + 18 + (i % 2) * w / 2}" y="${y + 78 + Math.floor(i / 2) * h / 2}" fill="#5f6c7d" font-size="16">${label}</text>`).join('')}</g>`;
  }
  if (element.template === 'cornell') {
    return `<g ${data} class="kwb-el">${base}<line x1="${x + w * 0.32}" y1="${y + 48}" x2="${x + w * 0.32}" y2="${y + h - 88}" ${stroke}></line><line x1="${x}" y1="${y + h - 88}" x2="${x + w}" y2="${y + h - 88}" ${stroke}></line>${['Cues', 'Notes', 'Summary'].map((label, i) => `<text x="${i === 1 ? x + w * 0.35 : x + 18}" y="${i === 2 ? y + h - 58 : y + 78}" fill="#5f6c7d" font-size="16">${label}</text>`).join('')}</g>`;
  }
  if (element.template === 'grid') {
    const lines: string[] = [];
    for (let i = 1; i < 4; i += 1) lines.push(`<line x1="${x}" y1="${y + 48 + (h - 48) * i / 4}" x2="${x + w}" y2="${y + 48 + (h - 48) * i / 4}" ${stroke}></line>`);
    for (let i = 1; i < 4; i += 1) lines.push(`<line x1="${x + w * i / 4}" y1="${y + 48}" x2="${x + w * i / 4}" y2="${y + h}" ${stroke}></line>`);
    return `<g ${data} class="kwb-el">${base}${lines.join('')}</g>`;
  }
  if (element.template === 'lesson') {
    return `<g ${data} class="kwb-el">${base}${['Goal', 'Explore', 'Practice', 'Exit ticket'].map((label, i) => `<rect x="${x + 18}" y="${y + 62 + i * 72}" width="${w - 36}" height="52" rx="8" fill="rgba(49,87,213,0.06)" ${stroke}></rect><text x="${x + 34}" y="${y + 94 + i * 72}" fill="#5f6c7d" font-size="16">${label}</text>`).join('')}</g>`;
  }
  return `<g ${data} class="kwb-el">${base}<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${Math.min(w, h) * 0.18}" fill="rgba(49,87,213,0.08)" ${stroke}></circle>${[0, 1, 2, 3, 4, 5].map(i => {
    const angle = (Math.PI * 2 * i) / 6;
    const cx = x + w / 2 + Math.cos(angle) * w * 0.32;
    const cy = y + h / 2 + Math.sin(angle) * h * 0.28;
    return `<line x1="${x + w / 2}" y1="${y + h / 2}" x2="${cx}" y2="${cy}" ${stroke}></line><circle cx="${cx}" cy="${cy}" r="38" fill="rgba(15,143,159,0.08)" ${stroke}></circle>`;
  }).join('')}</g>`;
}

function renderSelectionBounds(element: WhiteboardElement, zoom: number): string {
  const box = elementBounds(element);
  return `<rect class="kwb-selection" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="none" stroke="#3157d5" stroke-width="${1.5 / zoom}" stroke-dasharray="${6 / zoom} ${5 / zoom}" vector-effect="non-scaling-stroke"></rect>`;
}

function shapePoints(element: ShapeElement): string {
  const x = element.x;
  const y = element.y;
  const w = element.width;
  const h = element.height;
  if (element.shape === 'triangle') return `${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}`;
  if (element.shape === 'diamond') return `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`;
  return Array.from({ length: 6 }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 6;
    return `${x + w / 2 + Math.cos(angle) * w / 2},${y + h / 2 + Math.sin(angle) * h / 2}`;
  }).join(' ');
}

function textTspans(text: string, x: number, y: number, fontSize: number, width: number): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return '';
  const maxChars = Math.max(8, Math.floor(width / (fontSize * 0.55)));
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 10).map((item, index) => `<tspan x="${x}" y="${y + index * fontSize * 1.25}">${escapeText(item)}</tspan>`).join('');
}

function strokePath(points: Array<{ x: number; y: number }>): string {
  if (!points.length) return '';
  const [first, ...rest] = points;
  if (!first) return '';
  return `M ${first.x} ${first.y} ${rest.map(point => `L ${point.x} ${point.y}`).join(' ')}`;
}

function elementBounds(element: WhiteboardElement): { x: number; y: number; width: number; height: number } {
  if (element.type === 'stroke') {
    const xs = element.points.map(point => point.x);
    const ys = element.points.map(point => point.y);
    const pad = element.width / 2 + 3;
    return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, width: Math.max(...xs) - Math.min(...xs) + pad * 2, height: Math.max(...ys) - Math.min(...ys) + pad * 2 };
  }
  if (element.type === 'line') return normalizeRect({ x: element.x, y: element.y }, { x: element.x + element.dx, y: element.y + element.dy }, element.width + 6);
  if (element.type === 'text') return { x: element.x, y: element.y - element.fontSize, width: element.width, height: element.fontSize * 2 };
  return { x: element.x, y: element.y, width: 'width' in element ? element.width : 0, height: 'height' in element ? element.height : 0 };
}

function elementContainsPoint(element: WhiteboardElement, point: Vector2, tolerance: number): boolean {
  if (element.type === 'stroke') {
    for (let i = 1; i < element.points.length; i += 1) {
      const prev = element.points[i - 1];
      const next = element.points[i];
      if (prev && next && distanceToSegment(point, prev, next) <= element.width / 2 + tolerance) return true;
    }
    return false;
  }
  if (element.type === 'line') {
    return distanceToSegment(point, { x: element.x, y: element.y }, { x: element.x + element.dx, y: element.y + element.dy }) <= element.width / 2 + tolerance;
  }
  return pointInRect(point, elementBounds(element), tolerance);
}

function moveElement<T extends WhiteboardElement>(element: T, dx: number, dy: number): T {
  if (element.type === 'stroke') {
    return { ...element, points: element.points.map(point => ({ ...point, x: point.x + dx, y: point.y + dy })) } as T;
  }
  return { ...element, x: element.x + dx, y: element.y + dy };
}

function contentBounds(snapshot: WhiteboardSnapshot): { x: number; y: number; width: number; height: number } {
  const boxes = snapshot.scene.order.map(id => snapshot.scene.elements[id]).filter((element): element is WhiteboardElement => Boolean(element)).map(elementBounds);
  if (!boxes.length) return { x: -400, y: -250, width: 800, height: 500 };
  const minX = Math.min(...boxes.map(box => box.x));
  const minY = Math.min(...boxes.map(box => box.y));
  const maxX = Math.max(...boxes.map(box => box.x + box.width));
  const maxY = Math.max(...boxes.map(box => box.y + box.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function normalizeRect(a: Vector2, b: Vector2, pad = 0): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(a.x, b.x) - pad,
    y: Math.min(a.y, b.y) - pad,
    width: Math.abs(b.x - a.x) + pad * 2,
    height: Math.abs(b.y - a.y) + pad * 2,
  };
}

function rectsOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function pointInRect(point: Vector2, rect: { x: number; y: number; width: number; height: number }, pad: number): boolean {
  return point.x >= rect.x - pad && point.x <= rect.x + rect.width + pad && point.y >= rect.y - pad && point.y <= rect.y + rect.height + pad;
}

function distanceToSegment(point: Vector2, a: Vector2, b: Vector2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq, 0, 1);
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function isShapeTool(tool: WhiteboardTool): tool is WhiteboardShapeKind {
  return tool === 'rectangle' || tool === 'ellipse' || tool === 'triangle' || tool === 'diamond' || tool === 'polygon';
}

function isLineTool(tool: WhiteboardTool): boolean {
  return tool === 'line' || tool === 'arrow' || tool === 'doubleArrow' || tool === 'connector';
}

function elementSize(element: WhiteboardElement): number {
  const box = elementBounds(element);
  return Math.max(box.width, box.height);
}

function simplifyPoints(points: Array<{ x: number; y: number; pressure?: number }>): Array<{ x: number; y: number; pressure?: number }> {
  const result: Array<{ x: number; y: number; pressure?: number }> = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 0.8) result.push(point);
  }
  return result;
}

function pointWithPressure(point: Vector2, pressure: number): { x: number; y: number; pressure?: number } {
  const next: { x: number; y: number; pressure?: number } = { x: point.x, y: point.y };
  if (pressure > 0) next.pressure = pressure;
  return next;
}

function cloneSnapshot(snapshot: WhiteboardSnapshot): WhiteboardSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as WhiteboardSnapshot;
}

function cloneElement<T extends WhiteboardElement>(element: T): T {
  return JSON.parse(JSON.stringify(element)) as T;
}

function cloneDelta(delta: WhiteboardDelta): WhiteboardDelta {
  return JSON.parse(JSON.stringify(delta)) as WhiteboardDelta;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttr(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;');
}

function templateLabel(template: WhiteboardTemplateKind): string {
  return {
    brainstorm: 'Brainstorm',
    kanban: 'Kanban',
    lesson: 'Lesson flow',
    swot: 'SWOT',
    grid: 'Grid',
    cornell: 'Cornell notes',
  }[template];
}

function stampLabel(stamp: WhiteboardStampKind): string {
  return {
    check: 'OK',
    star: '*',
    heart: '<3',
    smile: ':)',
    question: '?',
    exclamation: '!',
  }[stamp];
}

function toolGlyph(tool: WhiteboardTool): string {
  return {
    select: 'V',
    pan: 'H',
    pen: 'P',
    highlighter: 'M',
    eraser: 'E',
    rectangle: 'R',
    ellipse: 'O',
    triangle: 'Tri',
    diamond: 'Dia',
    polygon: 'Poly',
    line: 'L',
    arrow: 'A',
    doubleArrow: '2A',
    connector: 'Con',
    text: 'T',
    sticky: 'N',
    image: 'Img',
    stamp: 'St',
    frame: 'F',
    template: 'Tmp',
  }[tool];
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target instanceof HTMLElement && target.isContentEditable;
}

async function svgToPng(svg: string, width: number, height: number, scale: number): Promise<Blob> {
  if (typeof document === 'undefined') throw new KleinSdkError('export_unavailable', 'PNG export requires a browser document.');
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new KleinSdkError('export_unavailable', 'Canvas 2D is unavailable.');
  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new KleinSdkError('export_failed', 'SVG could not be rendered to PNG.'));
      image.src = url;
    });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new KleinSdkError('export_failed', 'PNG encoding failed.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function createStyleElement(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = WHITEBOARD_CSS;
  return style;
}

const ARROW_MARKERS = `
  <marker id="kwb-arrow-end" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"></path>
  </marker>
  <marker id="kwb-arrow-start" markerWidth="10" markerHeight="10" refX="2" refY="5" orient="auto-start-reverse" markerUnits="strokeWidth">
    <path d="M 10 0 L 0 5 L 10 10 z" fill="context-stroke"></path>
  </marker>
`;

const WHITEBOARD_CSS = `
.kwb-root {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 420px;
  overflow: hidden;
  background: var(--klein-tool-background);
  color: var(--klein-tool-text);
  font-family: var(--klein-tool-font);
  user-select: none;
  touch-action: none;
}
.kwb-canvas {
  width: 100%;
  height: 100%;
  display: block;
  background: var(--klein-tool-canvas);
  touch-action: none;
}
.kwb-el { pointer-events: all; }
.kwb-text {
  font-family: var(--klein-tool-math-font, ${KLEIN_MATH_FONT_STACK});
  dominant-baseline: text-before-edge;
}
.kwb-toolbar {
  position: absolute;
  left: 14px;
  top: 14px;
  width: 254px;
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--klein-tool-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--klein-tool-surface) 90%, transparent);
  box-shadow: var(--klein-tool-shadow);
  backdrop-filter: blur(14px);
  z-index: 5;
}
.kwb-toolbar__row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
}
.kwb-toolbar__row--small { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.kwb-toolbar__row--palette { grid-template-columns: repeat(5, 1fr); }
.kwb-toolbar__label {
  color: var(--klein-tool-muted-text);
  font-size: 11px;
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.kwb-tool,
.kwb-action,
.kwb-swatch,
.kwb-width {
  min-width: 0;
  height: 34px;
  border: 1px solid var(--klein-tool-border);
  border-radius: 8px;
  background: var(--klein-tool-surface-raised);
  color: var(--klein-tool-text);
  font: inherit;
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
}
.kwb-tool:hover,
.kwb-action:hover,
.kwb-width:hover { background: var(--klein-tool-accent-soft); }
.kwb-tool--active,
.kwb-width--active {
  border-color: var(--klein-tool-primary);
  background: var(--klein-tool-primary-soft);
  color: var(--klein-tool-primary);
}
.kwb-action--danger {
  color: var(--klein-tool-danger);
  background: var(--klein-tool-danger-soft);
}
.kwb-swatch {
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px var(--klein-tool-border);
}
.kwb-swatch--active { outline: 2px solid var(--klein-tool-primary); outline-offset: 1px; }
.kwb-width { display: flex; align-items: center; justify-content: center; }
.kwb-width span { width: 22px; border-radius: 999px; display: block; }
.kwb-status {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  max-width: min(680px, calc(100% - 32px));
  padding: 8px 13px;
  border: 1px solid var(--klein-tool-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--klein-tool-surface) 90%, transparent);
  color: var(--klein-tool-muted-text);
  box-shadow: var(--klein-tool-shadow);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  z-index: 4;
}
@media (max-width: 760px) {
  .kwb-toolbar { width: min(238px, calc(100% - 24px)); left: 12px; top: 12px; }
  .kwb-status { display: none; }
}
`;
