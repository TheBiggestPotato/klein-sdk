import type { ApplyDeltaOptions, DeltaMeta, ExportOptions, ExportResult, JsonValue, LoadOptions, Vector2, View2D } from '../core/index.js';
import { KleinSdkError, createIdFactory } from '../core/index.js';
import { svgToPngBlob } from '../export/index.js';
import type { AngleEntity, ArcEntity, CircleEntity, ConicEntity, GeometryConstraint, GeometryConstraintSummary, GeometryDependencyGraph, GeometryEntity, GeometryEntityDisplay, GeometryLineEquation, GeometryObjectPanelOptions, GeometryObjectPanelRow, GeometryObjectSummary, GeometryObjectSummaryOptions, GeometryPoint2D, GeometryRelationMarkerEntity, LineEntity, LocusEntity, ParametricCurveEntity, PolygonEntity, RayEntity, SegmentEntity, VectorEntity } from '../geometry-core/index.js';
import { geometryAdjustSegmentLength as adjustSegmentLength, buildAngleBisector2D, buildCircleByCenterPoint2D, buildCircleThroughPoints2D, buildConstructedLine2D, buildGeometryDependencyGraph, buildGeometryObjectPanelRows, buildIntersection2D, buildLineThroughPoints2D, buildMidpoint2D, constrainGeometryScene, distance2D, geometryCircleTangentPoint2D, geometryEntityPointIds, geometryIntersectionPoints2D, geometryObjectDependencies, geometryLineConstraintPointIds as lineConstraintPointIds, lineEquationFrom2DPoints, midpoint2D, recomputeGeometryScene, geometrySegmentLength as segmentLength, geometrySetCircleRadius as setCircleRadius, geometrySetPointOnAngle as setPointOnAngle, geometrySetPointPosition as setPointPosition, summarizeGeometryConstraints, summarizeGeometryObjects } from '../geometry-core/index.js';
import { KLEIN_MONO_FONT_STACK, KLEIN_UI_FONT_STACK } from '../theme/index.js';
import { DEFAULT_WIDTH, GEOMETRY_TOOL_CATALOG, HIT_TOLERANCE_PX, POINT_RADIUS_PX } from './constants.js';
import { makeGeometryConstraint, validateGeometryConstraint } from './constraints.js';
import { clipLineToBounds, clipRayToBounds, entityLineEquation, helperPointsForEquation, lineEquationFromEntityPoints, lineEquationFromPoints, normalizeCircleEquation, normalizeLineEquation, parseGeometryCircleEquation, parseGeometryLineEquation, sameGeometryLineEquation } from './equations.js';
import { angleMeasureDegrees, angleMeasureForEntityDegrees, angleSweep, clamp, classifyTriangle, isCyclicQuadrilateral, lineLineIntersection, normalizeAngleDelta, normalizeAngleOptions, normalizeVector, normalizeVertexIndex, polygonCentroid, regularPolygonCoordinates, sampleConic, sampleParametricCurve, shapeCoordinates, uniqueStrings, worldRectFromPoints } from './geometry-math.js';
import { geometrySceneToPdfBlob } from './render-pdf.js';
import { geometrySceneToSvg } from './render-svg.js';
import { isIntersectableEntity, isLineLike, isPoint2D, orderedEntities, point2D } from './scene.js';
import { addDuplicatedPoint, cloneSelection, duplicateGeometryEntity, geometryDisplayEditChanges, moveSelectionCommitDeltas, normalizeEntityOrder, normalizeSelection, polygonSideCountEditDeltas, previewMoveSelection, reflectionMapper, selectionCenter, selectionFromItems, selectionHasItem, selectionItems, selectionItemsInWorldRect, selectionKey, selectionTransformTargets, toggleSelectionItem, transformTargetDeltas } from './selection.js';
import { hitTestGeometryCalculator, isSampledCurveEntity, relationMarkerAnchor, relationMarkerLabel, resolveGeometrySnap, sampledCurveSegments } from './snap.js';
import { applyGeometryCalculatorDelta, changedIdsFromDeltas, chooseGridStep, clampGeometryZoom, cloneSnapSettings, cloneSnapshot, createEmptyGeometryCalculatorSnapshot, deltaAddedEntityId, effectiveSnapSettings, finiteNumber, formatGridLabel, geometrySceneUpdateDeltas, geometrySnapshotJson, geometryWorldToScreen, isCornerOriginView, isMajorGridLine, normalizeSnapshot, parseGeometryCalculatorSnapshotJson, positiveNumber, screenToGeometryWorld } from './snapshot.js';
import { applyGeometryCalculatorTheme, colorWithAlpha, drawArrowHead, emptyStateStyle, geometryObjectFilters, geometryThemeFromPalette, inputStyle, readNumberInput, resolveGeometryCalculatorTheme, toolPreviewText, withEntityStyle, withPointStyle } from './theme.js';
import type { AngleCreationOptions, DragState, GeometryAngleOptions, GeometryCalculator, GeometryCalculatorDelta, GeometryCalculatorOptions, GeometryCalculatorScene, GeometryCalculatorSelectable, GeometryCalculatorSelection, GeometryCalculatorSnapshot, GeometryCalculatorTheme, GeometryCalculatorThemeInput, GeometryCalculatorTool, GeometryCheckpoint, GeometryCircleEquation, GeometryConicOptions, GeometryConstraintDraft, GeometryHistoryEntry, GeometryLocusOptions, GeometryObjectEditOptions, GeometryObjectGroup, GeometryParametricCurveOptions, GeometryReflectionAxis, GeometryRelationMarkerKind, GeometryShapeKind, GeometrySnapSettings, GeometrySnapSettingsPatch, GeometryStyleOptions, GeometryTriangleClassification, HitTarget, ShapeCreationOptions, SnapMarker, WorldBounds } from './types.js';

/** Creates the framework-independent 2D geometry calculator. */
export function createGeometryCalculator(
  options: GeometryCalculatorOptions = {},
): GeometryCalculator {
  const instrument = new GeometryCalculatorInstrument(options);
  if (options.container) {
    instrument.mount(options.container);
  }
  return instrument;
}


export class GeometryCalculatorInstrument implements GeometryCalculator {
  readonly id: string;
  readonly kind = 'geometry';

  #ids = createIdFactory();
  #snapshot: GeometryCalculatorSnapshot;
  #options: GeometryCalculatorOptions;
  #deltaListeners = new Set<(delta: GeometryCalculatorDelta, meta: DeltaMeta) => void>();
  #theme: GeometryCalculatorTheme;
  #container: HTMLElement | undefined;
  #root: HTMLDivElement | undefined;
  #canvas: HTMLCanvasElement | undefined;
  #ctx: CanvasRenderingContext2D | undefined;
  #resizeObserver: ResizeObserver | undefined;
  #contextMenuEl: HTMLDivElement | undefined;
  #commandPaletteEl: HTMLDivElement | undefined;
  #toolTooltipEl: HTMLDivElement | undefined;
  #objectPanelEl: HTMLDivElement | undefined;
  #historyPanelEl: HTMLDivElement | undefined;
  #undoStack: GeometryCalculatorSnapshot[] = [];
  #redoStack: GeometryCalculatorSnapshot[] = [];
  #checkpoints: GeometryCheckpoint[] = [];
  #objectSearchQuery = '';
  #objectTypeFilters = new Set<string>();
  #drag: DragState | null = null;
  #hoverWorld: Vector2 | null = null;
  #snapMarker: SnapMarker | null = null;
  #viewInitialized = false;
  #toolButtons: HTMLButtonElement[] = [];
  #statusEl: HTMLDivElement | undefined;
  #pendingLineStartId: string | null = null;
  #draftPolygonPointIds: string[] = [];
  #draftAnglePointIds: string[] = [];
  #draftAngleEntityIds: string[] = [];
  #draftCirclePointIds: string[] = [];
  #pendingReferenceEntityId: string | null = null;
  #pendingCircleCenterId: string | null = null;
  #angleRadius = 0.7;
  #angleOrientation: 'interior' | 'exterior' = 'interior';

  constructor(options: GeometryCalculatorOptions) {
    this.id = this.#ids.next('geometry');
    this.#options = options;
    this.#theme = resolveGeometryCalculatorTheme(options.theme ?? geometryThemeFromPalette(options.palette));
    const snapshotOptions: Parameters<typeof createEmptyGeometryCalculatorSnapshot>[0] = {};
    if (options.unitSize !== undefined) snapshotOptions.unitSize = options.unitSize;
    if (options.gridMajorEvery !== undefined) snapshotOptions.gridMajorEvery = options.gridMajorEvery;
    if (options.snapToGrid !== undefined) snapshotOptions.snapToGrid = options.snapToGrid;
    if (options.initialTool !== undefined) snapshotOptions.activeTool = options.initialTool;
    this.#snapshot = cloneSnapshot(
      options.initialSnapshot
        ?? createEmptyGeometryCalculatorSnapshot(snapshotOptions),
    );
  }

  get canvas(): HTMLCanvasElement | null {
    return this.#canvas ?? null;
  }

  mount(container: HTMLElement): void {
    this.destroy();
    this.#container = container;
    container.dataset.kleinInstrument = this.kind;

    const root = document.createElement('div');
    root.className = 'klein-geometry-calculator';
    root.dataset.kleinTheme = this.#theme.colorScheme;
    applyGeometryCalculatorTheme(root, this.#theme);
    Object.assign(root.style, {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      minHeight: '420px',
      background: 'var(--kgc-background)',
      border: '1px solid var(--kgc-border)',
      borderRadius: '8px',
      overflow: 'hidden',
      color: 'var(--kgc-text)',
      colorScheme: this.#theme.colorScheme,
      fontFamily: KLEIN_UI_FONT_STACK,
      userSelect: 'none',
    });

    if (this.#options.showControls !== false) {
      root.append(this.#createControls());
    }

    const workArea = document.createElement('div');
    Object.assign(workArea.style, {
      display: 'flex',
      flex: '1 1 auto',
      minHeight: '320px',
      minWidth: '0',
      overflow: 'hidden',
      flexWrap: 'wrap',
      background: 'var(--kgc-canvas)',
    });

    const canvasWrap = document.createElement('div');
    Object.assign(canvasWrap.style, {
      position: 'relative',
      flex: '1 1 520px',
      minHeight: '320px',
      minWidth: '280px',
      background: 'var(--kgc-canvas)',
    });

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', 'Geometry canvas');
    canvas.tabIndex = 0;
    Object.assign(canvas.style, {
      display: 'block',
      width: '100%',
      height: '100%',
      cursor: this.#cursorForTool(this.#snapshot.appState.activeTool),
      touchAction: 'none',
      background: 'var(--kgc-canvas)',
      userSelect: 'none',
    });
    canvas.addEventListener('pointerdown', this.#onPointerDown);
    canvas.addEventListener('pointermove', this.#onPointerMove);
    canvas.addEventListener('pointerup', this.#onPointerUp);
    canvas.addEventListener('pointercancel', this.#onPointerCancel);
    canvas.addEventListener('contextmenu', this.#onContextMenu);
    canvas.addEventListener('wheel', this.#onWheel, { passive: false });
    canvas.addEventListener('keydown', this.#onKeyDown);
    document.addEventListener('pointerdown', this.#onDocumentPointerDown, true);

    canvasWrap.append(canvas);
    workArea.append(canvasWrap);
    if (this.#options.showControls !== false) {
      workArea.append(this.#createSidePanel());
    }
    root.append(workArea);

    const status = document.createElement('div');
    Object.assign(status.style, {
      minHeight: '28px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '5px 10px',
      borderTop: '1px solid var(--kgc-border)',
      background: 'var(--kgc-surface)',
      color: 'var(--kgc-muted-text)',
      fontSize: '12px',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    });
    root.append(status);

    container.replaceChildren(root);
    this.#root = root;
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d') ?? undefined;
    this.#statusEl = status;

    if (typeof ResizeObserver !== 'undefined') {
      this.#resizeObserver = new ResizeObserver(() => this.#resizeCanvas());
      this.#resizeObserver.observe(canvasWrap);
    }
    window.addEventListener('resize', this.#resizeCanvas);
    this.#resizeCanvas();
    this.#updateToolbarState();
    this.#setStatus(this.#statusForTool());
    this.#render();
  }

  destroy(): void {
    window.removeEventListener('resize', this.#resizeCanvas);
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = undefined;

    if (this.#canvas) {
      this.#canvas.removeEventListener('pointerdown', this.#onPointerDown);
      this.#canvas.removeEventListener('pointermove', this.#onPointerMove);
      this.#canvas.removeEventListener('pointerup', this.#onPointerUp);
      this.#canvas.removeEventListener('pointercancel', this.#onPointerCancel);
      this.#canvas.removeEventListener('contextmenu', this.#onContextMenu);
      this.#canvas.removeEventListener('wheel', this.#onWheel);
      this.#canvas.removeEventListener('keydown', this.#onKeyDown);
    }
    document.removeEventListener('pointerdown', this.#onDocumentPointerDown, true);
    this.#hideContextMenu();
    this.#hideCommandPalette();
    this.#hideToolTooltip();

    if (this.#container?.dataset.kleinInstrument === this.kind) {
      delete this.#container.dataset.kleinInstrument;
    }
    this.#root?.remove();
    this.#container = undefined;
    this.#root = undefined;
    this.#canvas = undefined;
    this.#ctx = undefined;
    this.#statusEl = undefined;
    this.#objectPanelEl = undefined;
    this.#historyPanelEl = undefined;
    this.#toolButtons = [];
    this.#drag = null;
  }

  getSnapshot(): GeometryCalculatorSnapshot {
    return cloneSnapshot(this.#snapshot);
  }

  subscribeDelta(listener: (delta: GeometryCalculatorDelta, meta: DeltaMeta) => void): () => void {
    this.#deltaListeners.add(listener);
    return () => this.#deltaListeners.delete(listener);
  }

  loadSnapshot(snapshot: GeometryCalculatorSnapshot, options: LoadOptions = {}): void {
    const currentView = this.#snapshot.appState.view;
    this.#snapshot = normalizeSnapshot(snapshot);
    if (options.preserveView) {
      this.#snapshot = {
        ...this.#snapshot,
        appState: { ...this.#snapshot.appState, view: currentView },
      };
    }
    this.#undoStack = [];
    this.#redoStack = [];
    this.#cancelDrafts();
    this.#viewInitialized = false;
    this.#resizeCanvas();
    this.#updateToolbarState();
    this.#syncPanels();
    this.#render();
  }

  importJson(input: string | JsonValue, options: LoadOptions = {}): void {
    this.loadSnapshot(parseGeometryCalculatorSnapshotJson(input), options);
  }

  createCheckpoint(name = `Checkpoint ${this.#checkpoints.length + 1}`): string {
    const checkpoint: GeometryCheckpoint = {
      id: this.#ids.next('checkpoint'),
      name,
      createdAt: Date.now(),
      snapshot: cloneSnapshot(this.#snapshot),
    };
    this.#checkpoints = [checkpoint, ...this.#checkpoints].slice(0, 24);
    this.#syncPanels();
    return checkpoint.id;
  }

  restoreCheckpoint(id: string): void {
    const checkpoint = this.#checkpoints.find(candidate => candidate.id === id);
    if (!checkpoint) {
      throw new KleinSdkError('missing_checkpoint', `Checkpoint ${id} does not exist.`);
    }
    this.#undoStack.push(cloneSnapshot(this.#snapshot));
    this.#redoStack = [];
    this.#snapshot = cloneSnapshot(checkpoint.snapshot);
    this.#cancelDrafts();
    this.#syncPanels();
    this.#render();
  }

  getCheckpoints(): GeometryCheckpoint[] {
    return this.#checkpoints.map(checkpoint => ({
      ...checkpoint,
      snapshot: cloneSnapshot(checkpoint.snapshot),
    }));
  }

  getHistoryEntries(): GeometryHistoryEntry[] {
    const entries: GeometryHistoryEntry[] = [];
    if (this.#undoStack.length) {
      entries.push({
        id: 'undo-latest',
        kind: 'undo',
        label: `Previous version (${this.#undoStack.length})`,
      });
    }
    if (this.#redoStack.length) {
      entries.push({
        id: 'redo-latest',
        kind: 'redo',
        label: `Redo version (${this.#redoStack.length})`,
      });
    }
    for (const checkpoint of this.#checkpoints) {
      entries.push({
        id: `checkpoint:${checkpoint.id}`,
        kind: 'checkpoint',
        label: checkpoint.name,
        createdAt: checkpoint.createdAt,
        checkpointId: checkpoint.id,
      });
    }
    return entries;
  }

  applyDelta(delta: GeometryCalculatorDelta, options: ApplyDeltaOptions = {}): void {
    const commitOptions: {
      emit?: boolean;
      meta?: Partial<DeltaMeta>;
      recordHistory?: boolean;
    } = {
      emit: options.emit ?? true,
      recordHistory: options.meta?.source !== 'remote' && options.meta?.source !== 'history',
    };
    if (options.meta !== undefined) commitOptions.meta = options.meta;
    this.#commitDelta(delta, commitOptions);
  }

  setTool(tool: GeometryCalculatorTool): void {
    this.#commitDelta({ op: 'setTool', tool }, { emit: false, recordHistory: false });
    this.#cancelDrafts();
    if (this.#canvas) this.#canvas.style.cursor = this.#cursorForTool(tool);
    this.#updateToolbarState();
    this.#setStatus(this.#statusForTool());
    this.#render();
  }

  undo(): void {
    const previous = this.#undoStack.pop();
    if (!previous) return;
    this.#redoStack.push(cloneSnapshot(this.#snapshot));
    this.#snapshot = previous;
    this.#emitSnapshotReplacement('history');
    this.#cancelDrafts();
    this.#syncPanels();
    this.#render();
  }

  redo(): void {
    const next = this.#redoStack.pop();
    if (!next) return;
    this.#undoStack.push(cloneSnapshot(this.#snapshot));
    this.#snapshot = next;
    this.#emitSnapshotReplacement('history');
    this.#cancelDrafts();
    this.#syncPanels();
    this.#render();
  }

  async export(options: ExportOptions): Promise<ExportResult> {
    if (options.format === 'json') {
      return {
        format: 'json',
        mimeType: 'application/json',
        data: geometrySnapshotJson(this.#snapshot, options.includeAppState !== false),
      };
    }

    if (options.format === 'svg') {
      const size = this.#exportSize(options);
      return {
        format: 'svg',
        mimeType: 'image/svg+xml',
        data: geometrySceneToSvg(this.#snapshot, size, options),
      };
    }

    if (options.format === 'png' || options.format === 'thumbnail') {
      const size = this.#exportSize(options, options.format === 'thumbnail');
      const svg = geometrySceneToSvg(this.#snapshot, size, options);
      const blob = await svgToPngBlob(svg, size);
      return { format: options.format, mimeType: 'image/png', data: blob } as ExportResult;
    }

    if (options.format === 'pdf') {
      const size = this.#exportSize(options);
      return {
        format: 'pdf',
        mimeType: 'application/pdf',
        data: geometrySceneToPdfBlob(
          this.#snapshot,
          size,
          options,
          this.#snapshot.metadata?.title ?? 'Klein Geometry Export',
        ),
      };
    }

    throw new KleinSdkError(
      'unsupported_export',
      `Geometry calculator does not support ${options.format} export yet.`,
    );
  }

  #exportSize(options: ExportOptions, thumbnail = false): { width: number; height: number } {
    const current = this.#logicalCanvasSize();
    return {
      width: Math.max(1, Math.round(options.width ?? (thumbnail ? 320 : current.width))),
      height: Math.max(1, Math.round(options.height ?? (thumbnail ? 200 : current.height))),
    };
  }

  screenToWorld(point: Vector2): Vector2 {
    return screenToGeometryWorld(point, this.#snapshot.appState.view, this.#snapshot.appState.grid.unitSize);
  }

  worldToScreen(point: Vector2): Vector2 {
    return geometryWorldToScreen(point, this.#snapshot.appState.view, this.#snapshot.appState.grid.unitSize);
  }

  getDependencyGraph(): GeometryDependencyGraph {
    return buildGeometryDependencyGraph(this.#snapshot.scene);
  }

  getObjectDependencies(objectId: string): string[] {
    return geometryObjectDependencies(this.#snapshot.scene, objectId);
  }

  getObjectSummaries(options: GeometryObjectSummaryOptions = {}): GeometryObjectSummary[] {
    return summarizeGeometryObjects(this.#snapshot.scene, {
      order: this.#snapshot.scene.order,
      ...options,
    });
  }

  getObjectPanelRows(options: GeometryObjectPanelOptions = {}): GeometryObjectPanelRow[] {
    return buildGeometryObjectPanelRows(this.#snapshot.scene, {
      order: this.#snapshot.scene.order,
      ...options,
    });
  }

  getConstraints(): GeometryConstraint[] {
    return Object.values(this.#snapshot.scene.constraints ?? {}).map(constraint => ({ ...constraint }));
  }

  getConstraintSummaries(): GeometryConstraintSummary[] {
    return summarizeGeometryConstraints(this.#snapshot.scene);
  }

  getTheme(): GeometryCalculatorTheme {
    return { ...this.#theme };
  }

  setTheme(theme: GeometryCalculatorThemeInput): void {
    this.#theme = resolveGeometryCalculatorTheme(theme);
    if (this.#root) {
      this.#root.dataset.kleinTheme = this.#theme.colorScheme;
      this.#root.style.colorScheme = this.#theme.colorScheme;
      applyGeometryCalculatorTheme(this.#root, this.#theme);
    }
    this.#updateToolbarState();
    this.#syncPanels();
    this.#render();
  }

  getSnapSettings(): GeometrySnapSettings {
    return cloneSnapSettings(this.#snapshot.appState.grid.snapping);
  }

  setSnapSettings(settings: GeometrySnapSettingsPatch): void {
    this.#commitDelta({
      op: 'setGrid',
      grid: { snapping: settings },
    }, { recordHistory: false });
  }

  getSelection(): GeometryCalculatorSelection | null {
    return cloneSelection(this.#snapshot.appState.selected);
  }

  select(selection: GeometryCalculatorSelection | null): void {
    this.#select(selection);
  }

  selectObjects(items: GeometryCalculatorSelectable[]): void {
    this.#select(selectionFromItems(items));
  }

  addToSelection(item: GeometryCalculatorSelectable): void {
    this.#select(selectionFromItems([...selectionItems(this.#snapshot.appState.selected), item]));
  }

  toggleSelection(item: GeometryCalculatorSelectable): void {
    this.#select(toggleSelectionItem(this.#snapshot.appState.selected, item));
  }

  clearSelection(): void {
    this.#select(null);
  }

  deleteSelection(): void {
    this.#assertWritable();
    const ids = selectionItems(this.#snapshot.appState.selected).map(item => item.id);
    if (!ids.length) return;
    this.#commitDelta({ op: 'delete', ids });
  }

  duplicateSelection(offset: Vector2 = { x: 0.45, y: -0.45 }): string[] {
    this.#assertWritable();
    const selection = this.#snapshot.appState.selected;
    const items = selectionItems(selection);
    if (!items.length) return [];

    const pointIdMap = new Map<string, string>();
    const entityIds: string[] = [];
    const deltas: GeometryCalculatorDelta[] = [];
    const createdSelection: GeometryCalculatorSelectable[] = [];
    const createdIds: string[] = [];

    for (const item of items) {
      if (item.kind === 'point') {
        const point = point2D(this.#snapshot.scene, item.id);
        if (point) addDuplicatedPoint(point, pointIdMap, deltas, this.#ids, offset, createdSelection, createdIds);
        continue;
      }

      const entity = this.#snapshot.scene.entities[item.id];
      if (!entity) continue;
      entityIds.push(entity.id);
      for (const pointId of geometryEntityPointIds(entity)) {
        const point = point2D(this.#snapshot.scene, pointId);
        if (point) addDuplicatedPoint(point, pointIdMap, deltas, this.#ids, offset, createdSelection, createdIds);
      }
    }

    for (const entityId of entityIds) {
      const entity = this.#snapshot.scene.entities[entityId];
      if (!entity) continue;
      const duplicate = duplicateGeometryEntity(entity, pointIdMap, this.#ids, offset);
      if (!duplicate) continue;
      deltas.push({ op: 'addEntity', entity: duplicate });
      createdSelection.push({ kind: 'entity', id: duplicate.id });
      createdIds.push(duplicate.id);
    }

    if (!deltas.length) return [];
    deltas.push({ op: 'setSelection', selection: selectionFromItems(createdSelection) });
    this.#commitDelta({ op: 'batch', deltas });
    return createdIds;
  }

  translateSelection(delta: Vector2): void {
    this.#commitSelectionTransform(point => ({
      x: point.x + delta.x,
      y: point.y + delta.y,
    }));
  }

  rotateSelection(angleDegrees: number, center?: Vector2): void {
    if (!Number.isFinite(angleDegrees)) {
      throw new KleinSdkError('invalid_transform', 'Rotation angle must be finite.');
    }
    const origin = center ?? selectionCenter(this.#snapshot.scene, this.#snapshot.appState.selected);
    if (!origin) return;
    const radians = (angleDegrees * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    this.#commitSelectionTransform(point => {
      const x = point.x - origin.x;
      const y = point.y - origin.y;
      return {
        x: origin.x + x * cos - y * sin,
        y: origin.y + x * sin + y * cos,
      };
    });
  }

  scaleSelection(factor: number | Vector2, center?: Vector2): void {
    const scale = typeof factor === 'number' ? { x: factor, y: factor } : factor;
    if (!Number.isFinite(scale.x) || !Number.isFinite(scale.y)) {
      throw new KleinSdkError('invalid_transform', 'Scale factor must be finite.');
    }
    const origin = center ?? selectionCenter(this.#snapshot.scene, this.#snapshot.appState.selected);
    if (!origin) return;
    this.#commitSelectionTransform(point => ({
      x: origin.x + (point.x - origin.x) * scale.x,
      y: origin.y + (point.y - origin.y) * scale.y,
    }));
  }

  reflectSelection(axis: GeometryReflectionAxis): void {
    const reflector = reflectionMapper(axis);
    this.#commitSelectionTransform(reflector);
  }

  setSelectionLocked(locked: boolean): void {
    this.#commitSelectionDisplayChanges({ locked });
  }

  setSelectionHidden(hidden: boolean): void {
    this.#commitSelectionDisplayChanges({ hidden });
  }

  bringSelectionForward(): void {
    this.#reorderSelection('forward');
  }

  sendSelectionBackward(): void {
    this.#reorderSelection('backward');
  }

  bringSelectionToFront(): void {
    this.#reorderSelection('front');
  }

  sendSelectionToBack(): void {
    this.#reorderSelection('back');
  }

  groupSelection(label?: string): string {
    this.#assertWritable();
    const items = selectionItems(this.#snapshot.appState.selected);
    if (items.length < 2) {
      throw new KleinSdkError('invalid_group', 'Choose at least two objects to create a group.');
    }
    const group: GeometryObjectGroup = {
      id: this.#ids.next('group'),
      items,
      createdAt: Date.now(),
    };
    if (label !== undefined) group.label = label;
    this.#commitDelta({ op: 'addGroup', group });
    return group.id;
  }

  ungroupSelection(groupId?: string): string[] {
    this.#assertWritable();
    const selectedItems = selectionItems(this.#snapshot.appState.selected);
    const selectedKeys = new Set(selectedItems.map(selectionKey));
    const ids = groupId
      ? [groupId]
      : Object.values(this.#snapshot.appState.groups)
        .filter(group => group.items.some(item => selectedKeys.has(selectionKey(item))))
        .map(group => group.id);
    if (!ids.length) return [];
    this.#commitDelta({ op: 'deleteGroup', ids });
    return ids;
  }

  getGroups(): GeometryObjectGroup[] {
    return Object.values(this.#snapshot.appState.groups).map(group => ({
      ...group,
      items: [...group.items],
    }));
  }

  resetView(): void {
    const size = this.#logicalCanvasSize();
    this.setView({ x: size.width / 2, y: size.height / 2, zoom: 1 });
  }

  setView(view: Partial<View2D>): void {
    const current = this.#snapshot.appState.view;
    const next = {
      x: finiteNumber(view.x, current.x),
      y: finiteNumber(view.y, current.y),
      zoom: clampGeometryZoom(finiteNumber(view.zoom, current.zoom)),
    };
    this.#snapshot = applyGeometryCalculatorDelta(this.#snapshot, { op: 'setView', view: next });
    this.#render();
  }

  addPoint(point: Vector2 & GeometryStyleOptions): string {
    this.#assertWritable();
    const created = this.#makePoint(point.x, point.y, point);
    this.#commitDelta({ op: 'addPoint', point: created });
    this.#select({ kind: 'point', id: created.id });
    return created.id;
  }

  addMidpoint(firstPointId: string, secondPointId: string, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    this.#requireDistinctPoints(firstPointId, secondPointId);
    const first = this.#requirePoint2D(firstPointId);
    const second = this.#requirePoint2D(secondPointId);
    // The record is shaped by the shared builder; the theme, the selection and
    // the delta shape below are this instrument's own conventions.
    const built = buildMidpoint2D(this.#snapshot.scene, first.id, second.id, prefix => this.#ids.next(prefix));
    if (!built) throw new KleinSdkError('invalid_midpoint', 'A midpoint needs two distinct points.');
    const point = withPointStyle(built.points[0] as GeometryPoint2D, style);
    this.#commitDelta({ op: 'addPoint', point: { ...point, locked: true } });
    this.#select({ kind: 'point', id: point.id });
    return point.id;
  }

  addIntersection(
    firstEntityId: string,
    secondEntityId: string,
    style: GeometryStyleOptions = {},
    index = 0,
  ): string {
    this.#assertWritable();
    this.#requireDistinctEntities(firstEntityId, secondEntityId);
    const first = this.#requireIntersectableEntity(firstEntityId);
    const second = this.#requireIntersectableEntity(secondEntityId);
    const built = buildIntersection2D(this.#snapshot.scene, first.id, second.id, prefix => this.#ids.next(prefix), index);
    if (!built) {
      throw new KleinSdkError('no_intersection', 'The selected objects do not intersect in a usable point.');
    }
    const created = withPointStyle(built.points[0] as GeometryPoint2D, style);
    this.#commitDelta({ op: 'addPoint', point: { ...created, locked: true } });
    this.#select({ kind: 'point', id: created.id });
    return created.id;
  }

  addIntersections(firstEntityId: string, secondEntityId: string, style: GeometryStyleOptions = {}): string[] {
    this.#assertWritable();
    this.#requireDistinctEntities(firstEntityId, secondEntityId);
    const first = this.#requireIntersectableEntity(firstEntityId);
    const second = this.#requireIntersectableEntity(secondEntityId);
    const points = geometryIntersectionPoints2D(this.#snapshot.scene, first.id, second.id);
    if (points.length === 0) {
      throw new KleinSdkError('no_intersection', 'The selected objects do not intersect in a usable point.');
    }

    const created = points.map((point, index) => withPointStyle({
      id: this.#ids.next('p'),
      kind: 'point2d',
      x: point.x,
      y: point.y,
      locked: true,
      construction: { kind: 'intersection', sourceIds: [first.id, second.id], index },
    }, style));

    this.#commitDelta({
      op: 'batch',
      deltas: created.map(point => ({ op: 'addPoint' as const, point: { ...point, locked: true } })),
    });
    this.#select({ kind: 'point', id: created[0]?.id ?? '' });
    return created.map(point => point.id);
  }

  addParallelLine(sourceEntityId: string, throughPointId: string, style: GeometryStyleOptions = {}): string {
    return this.#addConstructedLine('parallelLine', sourceEntityId, throughPointId, style);
  }

  addPerpendicularLine(sourceEntityId: string, throughPointId: string, style: GeometryStyleOptions = {}): string {
    return this.#addConstructedLine('perpendicularLine', sourceEntityId, throughPointId, style);
  }

  addTangentLines(circleEntityId: string, throughPointId: string, style: GeometryStyleOptions = {}): string[] {
    this.#assertWritable();
    const circle = this.#requireCircleEntity(circleEntityId);
    const through = this.#requirePoint2D(throughPointId);
    const created: Array<{ helper: GeometryPoint2D; entity: LineEntity }> = [];
    const equations: GeometryLineEquation[] = [];

    for (const branch of [-1, 1] as const) {
      const helperPosition = geometryCircleTangentPoint2D(this.#snapshot.scene, circle.id, through.id, branch);
      if (!helperPosition) continue;
      const equation = lineEquationFrom2DPoints(through, helperPosition);
      if (!equation || equations.some(existing => sameGeometryLineEquation(existing, equation))) continue;
      equations.push(equation);
      const helper: GeometryPoint2D = {
        id: this.#ids.next('p'),
        kind: 'point2d',
        x: helperPosition.x,
        y: helperPosition.y,
        color: style.color ?? this.#theme.drawColor,
        hidden: true,
        locked: true,
      };
      const entity = withEntityStyle<LineEntity>({
        id: this.#ids.next('line'),
        kind: 'line',
        pointIds: [through.id, helper.id],
        equation,
        construction: {
          kind: 'tangentLine',
          circleId: circle.id,
          throughPointId: through.id,
          branch,
        },
      }, style, this.#theme.drawColor);
      created.push({ helper, entity });
    }

    if (created.length === 0) {
      throw new KleinSdkError('invalid_tangent', 'A tangent needs a point on or outside the circle.');
    }

    this.#commitDelta({
      op: 'batch',
      deltas: created.flatMap(item => [
        { op: 'addPoint' as const, point: item.helper },
        { op: 'addEntity' as const, entity: item.entity },
      ]),
    });
    this.#select({ kind: 'entity', id: created[0]?.entity.id ?? '' });
    return created.map(item => item.entity.id);
  }

  addAngleBisectorByPoints(
    pointIds: [string, string, string],
    style: GeometryStyleOptions = {},
  ): string {
    this.#assertWritable();
    for (const pointId of pointIds) this.#requirePoint2D(pointId);
    this.#requirePoint2D(pointIds[1]);
    const built = buildAngleBisector2D(this.#snapshot.scene, pointIds, prefix => this.#ids.next(prefix));
    if (!built) {
      throw new KleinSdkError('invalid_angle_bisector', 'Choose three non-degenerate points.');
    }
    // The builder leaves the helper unstyled; the Calculator paints it so that
    // an unhidden helper matches the line it defines.
    const helper: GeometryPoint2D = {
      ...(built.points[0] as GeometryPoint2D),
      color: style.color ?? this.#theme.drawColor,
    };
    const entity = withEntityStyle<LineEntity>(
      built.entities[0] as LineEntity,
      style,
      this.#theme.drawColor,
    );
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: helper },
        { op: 'addEntity', entity },
      ],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addLineByPoints(firstPointId: string, secondPointId: string, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    this.#requireDistinctPoints(firstPointId, secondPointId);
    const first = this.#requirePoint2D(firstPointId);
    const second = this.#requirePoint2D(secondPointId);
    const built = buildLineThroughPoints2D(this.#snapshot.scene, first.id, second.id, prefix => this.#ids.next(prefix));
    if (!built) throw new KleinSdkError('invalid_line', 'A line needs two distinct points.');
    const entity = withEntityStyle<LineEntity>(built.entities[0] as LineEntity, style, this.#theme.drawColor);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addLineByCoordinates(first: Vector2, second: Vector2, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    const firstPoint = this.#makePoint(first.x, first.y, style);
    const secondPoint = this.#makePoint(second.x, second.y, style);
    if (distance2D(firstPoint, secondPoint) < 1e-12) {
      throw new KleinSdkError('degenerate_line', 'A line needs two distinct coordinates.');
    }
    const entity = withEntityStyle<LineEntity>({
      id: this.#ids.next('line'),
      kind: 'line',
      pointIds: [firstPoint.id, secondPoint.id],
      equation: lineEquationFromPoints(firstPoint, secondPoint),
      construction: { kind: 'lineThroughPoints', sourceIds: [firstPoint.id, secondPoint.id] },
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: firstPoint },
        { op: 'addPoint', point: secondPoint },
        { op: 'addEntity', entity },
      ],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addLineByEquation(equation: string | GeometryLineEquation, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    const parsed = typeof equation === 'string' ? parseGeometryLineEquation(equation) : normalizeLineEquation(equation);
    const [first, second] = helperPointsForEquation(parsed, this.#ids, style.color ?? this.#theme.drawColor);
    const entity = withEntityStyle<LineEntity>({
      id: this.#ids.next('line'),
      kind: 'line',
      pointIds: [first.id, second.id],
      equation: parsed,
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: first },
        { op: 'addPoint', point: second },
        { op: 'addEntity', entity },
      ],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addRayByPoints(firstPointId: string, secondPointId: string, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    this.#requireDistinctPoints(firstPointId, secondPointId);
    const entity = withEntityStyle<RayEntity>({
      id: this.#ids.next('ray'),
      kind: 'ray',
      pointIds: [firstPointId, secondPointId],
    }, style, this.#theme.drawColor);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addRayByCoordinates(first: Vector2, second: Vector2, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    const firstPoint = this.#makePoint(first.x, first.y, style);
    const secondPoint = this.#makePoint(second.x, second.y, style);
    if (distance2D(firstPoint, secondPoint) < 1e-12) {
      throw new KleinSdkError('degenerate_ray', 'A ray needs two distinct coordinates.');
    }
    const entity = withEntityStyle<RayEntity>({
      id: this.#ids.next('ray'),
      kind: 'ray',
      pointIds: [firstPoint.id, secondPoint.id],
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: firstPoint },
        { op: 'addPoint', point: secondPoint },
        { op: 'addEntity', entity },
      ],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addSegmentByPoints(firstPointId: string, secondPointId: string, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    this.#requireDistinctPoints(firstPointId, secondPointId);
    const entity = withEntityStyle<SegmentEntity>({
      id: this.#ids.next('seg'),
      kind: 'segment',
      pointIds: [firstPointId, secondPointId],
    }, style, this.#theme.drawColor);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addSegmentByCoordinates(first: Vector2, second: Vector2, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    const firstPoint = this.#makePoint(first.x, first.y, style);
    const secondPoint = this.#makePoint(second.x, second.y, style);
    if (distance2D(firstPoint, secondPoint) < 1e-12) {
      throw new KleinSdkError('degenerate_segment', 'A segment needs two distinct coordinates.');
    }
    const entity = withEntityStyle<SegmentEntity>({
      id: this.#ids.next('seg'),
      kind: 'segment',
      pointIds: [firstPoint.id, secondPoint.id],
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: firstPoint },
        { op: 'addPoint', point: secondPoint },
        { op: 'addEntity', entity },
      ],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addVectorByPoints(firstPointId: string, secondPointId: string, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    this.#requireDistinctPoints(firstPointId, secondPointId);
    const entity = withEntityStyle<VectorEntity>({
      id: this.#ids.next('vec'),
      kind: 'vector',
      pointIds: [firstPointId, secondPointId],
    }, style, this.#theme.drawColor);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addVectorByCoordinates(first: Vector2, second: Vector2, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    const firstPoint = this.#makePoint(first.x, first.y, style);
    const secondPoint = this.#makePoint(second.x, second.y, style);
    if (distance2D(firstPoint, secondPoint) < 1e-12) {
      throw new KleinSdkError('degenerate_vector', 'A vector needs two distinct coordinates.');
    }
    const entity = withEntityStyle<VectorEntity>({
      id: this.#ids.next('vec'),
      kind: 'vector',
      pointIds: [firstPoint.id, secondPoint.id],
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: firstPoint },
        { op: 'addPoint', point: secondPoint },
        { op: 'addEntity', entity },
      ],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addPolygon(pointIds: string[], style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    if (pointIds.length < 3) {
      throw new KleinSdkError('invalid_polygon', 'A closed polygon needs at least three points.');
    }
    for (const pointId of pointIds) this.#requirePoint2D(pointId);
    const entity = withEntityStyle<PolygonEntity>({
      id: this.#ids.next('poly'),
      kind: 'polygon',
      pointIds: [...pointIds],
      fillColor: style.fillColor ?? colorWithAlpha(style.color ?? style.strokeColor ?? this.#theme.drawColor, 0.12),
    }, style, this.#theme.drawColor);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addPolygonByCoordinates(points: Vector2[], style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    if (points.length < 3) {
      throw new KleinSdkError('invalid_polygon', 'A closed polygon needs at least three coordinates.');
    }
    const createdPoints = points.map(point => this.#makePoint(point.x, point.y, style));
    const entity = withEntityStyle<PolygonEntity>({
      id: this.#ids.next('poly'),
      kind: 'polygon',
      pointIds: createdPoints.map(point => point.id),
      fillColor: style.fillColor ?? colorWithAlpha(style.color ?? style.strokeColor ?? this.#theme.drawColor, 0.12),
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        ...createdPoints.map(point => ({ op: 'addPoint' as const, point })),
        { op: 'addEntity', entity },
      ],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addLocus(points: Vector2[], options: GeometryLocusOptions = {}): string {
    this.#assertWritable();
    if (points.length < 2) {
      throw new KleinSdkError('invalid_locus', 'A locus/path needs at least two coordinates.');
    }
    const cleaned = points.map(point => {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        throw new KleinSdkError('invalid_locus', 'Locus/path coordinates must be finite numbers.');
      }
      return { x: point.x, y: point.y };
    });
    const base: LocusEntity = {
      id: this.#ids.next('locus'),
      kind: 'locus',
      points: cleaned,
    };
    if (options.closed !== undefined) base.closed = options.closed;
    const entity = withEntityStyle(base, options, this.#theme.drawColor);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addCircle(centerPointId: string, radius: number, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    this.#requirePoint2D(centerPointId);
    if (!Number.isFinite(radius) || radius <= 0) {
      throw new KleinSdkError('invalid_circle', 'Circle radius must be a positive number.');
    }
    const entity = withEntityStyle<CircleEntity>({
      id: this.#ids.next('circle'),
      kind: 'circle',
      centerId: centerPointId,
      radius,
      fillColor: style.fillColor ?? colorWithAlpha(style.color ?? this.#theme.drawColor, 0.1),
    }, style, this.#theme.drawColor);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addCircleByCenterPoint(
    centerPointId: string,
    radiusPointId: string,
    style: GeometryStyleOptions = {},
  ): string {
    this.#assertWritable();
    this.#requireDistinctPoints(centerPointId, radiusPointId);
    this.#requirePoint2D(centerPointId);
    this.#requirePoint2D(radiusPointId);
    const built = buildCircleByCenterPoint2D(
      this.#snapshot.scene,
      centerPointId,
      radiusPointId,
      prefix => this.#ids.next(prefix),
    );
    if (!built) {
      throw new KleinSdkError('invalid_circle', 'Circle radius must be a positive number.');
    }
    const entity = withEntityStyle<CircleEntity>({
      ...(built.entities[0] as CircleEntity),
      fillColor: style.fillColor ?? colorWithAlpha(style.color ?? this.#theme.drawColor, 0.1),
    }, style, this.#theme.drawColor);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addCircleThroughPoints(pointIds: [string, string, string], style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    for (const pointId of pointIds) this.#requirePoint2D(pointId);
    const built = buildCircleThroughPoints2D(this.#snapshot.scene, pointIds, prefix => this.#ids.next(prefix));
    if (!built) {
      throw new KleinSdkError('invalid_circle', 'Choose three non-collinear points.');
    }
    // The circle's own recomputation already carries its centre along, so the
    // builder leaves the centre bare. The Calculator additionally records the
    // centre as a circumcentre, which is what makes it show up as derived from
    // the three points in the object panel and the dependency cascade.
    const center = withPointStyle({
      ...(built.points[0] as GeometryPoint2D),
      construction: { kind: 'circumcenter', pointIds },
    }, style);
    const entity = withEntityStyle<CircleEntity>({
      ...(built.entities[0] as CircleEntity),
      centerId: center.id,
      fillColor: style.fillColor ?? colorWithAlpha(style.color ?? this.#theme.drawColor, 0.1),
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: { ...center, hidden: true, locked: true } },
        { op: 'addEntity', entity },
      ],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addCircleByCoordinates(center: Vector2, radius: number, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    const point = this.#makePoint(center.x, center.y, style);
    const entity = withEntityStyle<CircleEntity>({
      id: this.#ids.next('circle'),
      kind: 'circle',
      centerId: point.id,
      radius,
      fillColor: style.fillColor ?? colorWithAlpha(style.color ?? this.#theme.drawColor, 0.1),
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [{ op: 'addPoint', point }, { op: 'addEntity', entity }],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addCircleByEquation(equation: string | GeometryCircleEquation, style: GeometryStyleOptions = {}): string {
    const parsed = typeof equation === 'string' ? parseGeometryCircleEquation(equation) : normalizeCircleEquation(equation);
    const nextStyle: GeometryStyleOptions = { ...style };
    if (nextStyle.label === undefined && parsed.input !== undefined) nextStyle.label = parsed.input;
    return this.addCircleByCoordinates(parsed.center, parsed.radius, nextStyle);
  }

  addArcByPoints(
    centerPointId: string,
    startPointId: string,
    endPointId: string,
    style: GeometryStyleOptions = {},
  ): string {
    this.#assertWritable();
    this.#requireDistinctPoints(centerPointId, startPointId);
    this.#requireDistinctPoints(centerPointId, endPointId);
    const center = this.#requirePoint2D(centerPointId);
    const start = this.#requirePoint2D(startPointId);
    const end = this.#requirePoint2D(endPointId);
    if (distance2D(center, start) <= 1e-12 || distance2D(center, end) <= 1e-12) {
      throw new KleinSdkError('degenerate_arc', 'An arc needs a center and two distinct radius points.');
    }
    const entity = withEntityStyle<ArcEntity>({
      id: this.#ids.next('arc'),
      kind: 'arc',
      centerId: center.id,
      startId: start.id,
      endId: end.id,
    }, style, this.#theme.drawColor);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addArcByCoordinates(center: Vector2, start: Vector2, end: Vector2, style: GeometryStyleOptions = {}): string {
    this.#assertWritable();
    const centerPoint = this.#makePoint(center.x, center.y, style);
    const startPoint = this.#makePoint(start.x, start.y, style);
    const endPoint = this.#makePoint(end.x, end.y, style);
    if (distance2D(centerPoint, startPoint) <= 1e-12 || distance2D(centerPoint, endPoint) <= 1e-12) {
      throw new KleinSdkError('degenerate_arc', 'An arc needs a center and two distinct radius coordinates.');
    }
    const entity = withEntityStyle<ArcEntity>({
      id: this.#ids.next('arc'),
      kind: 'arc',
      centerId: centerPoint.id,
      startId: startPoint.id,
      endId: endPoint.id,
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: centerPoint },
        { op: 'addPoint', point: startPoint },
        { op: 'addPoint', point: endPoint },
        { op: 'addEntity', entity },
      ],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addConic(options: GeometryConicOptions): string {
    this.#assertWritable();
    const sampled = sampleConic(options);
    const base: ConicEntity = {
      id: this.#ids.next('conic'),
      kind: 'conic',
      conicKind: options.kind,
      points: sampled.points,
    };
    if (sampled.closed !== undefined) base.closed = sampled.closed;
    if (sampled.segments) base.segments = sampled.segments;
    if (sampled.equation) base.equation = sampled.equation;
    if (sampled.center) base.center = sampled.center;
    if (Number.isFinite(options.rotationDegrees)) base.rotationDegrees = options.rotationDegrees as number;
    const entity = withEntityStyle(base, options, this.#theme.drawColor);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addEllipse(
    center: Vector2,
    radiusX: number,
    radiusY: number,
    rotationDegrees = 0,
    style: GeometryStyleOptions = {},
  ): string {
    return this.addConic({ ...style, kind: 'ellipse', center, radiusX, radiusY, rotationDegrees });
  }

  addParabola(
    vertex: Vector2,
    focalLength: number,
    rotationDegrees = 0,
    style: GeometryStyleOptions = {},
  ): string {
    return this.addConic({ ...style, kind: 'parabola', vertex, focalLength, rotationDegrees });
  }

  addHyperbola(
    center: Vector2,
    radiusX: number,
    radiusY: number,
    rotationDegrees = 0,
    style: GeometryStyleOptions = {},
  ): string {
    return this.addConic({ ...style, kind: 'hyperbola', center, radiusX, radiusY, rotationDegrees });
  }

  addParametricCurve(options: GeometryParametricCurveOptions): string {
    this.#assertWritable();
    const sampled = sampleParametricCurve(options);
    const base: ParametricCurveEntity = {
      id: this.#ids.next('curve'),
      kind: 'parametricCurve',
      points: sampled.points,
    };
    if (sampled.closed !== undefined) base.closed = sampled.closed;
    if (sampled.parameter) base.parameter = sampled.parameter;
    const entity = withEntityStyle(base, options, this.#theme.drawColor);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addShape(kind: GeometryShapeKind, center: Vector2, options: ShapeCreationOptions = {}): string {
    const coordinates = shapeCoordinates(kind, center, options);
    return this.addPolygonByCoordinates(coordinates, options);
  }

  addRegularPolygonBySideCount(
    center: Vector2,
    sides: number,
    radius = 2,
    style: GeometryStyleOptions = {},
  ): string {
    return this.addPolygonByCoordinates(
      regularPolygonCoordinates(center, clamp(Math.round(sides), 3, 64), positiveNumber(radius, 2), -Math.PI / 2),
      style,
    );
  }

  addRegularPolygonByCenterAndVertex(
    centerPointId: string,
    vertexPointId: string,
    sides: number,
    style: GeometryStyleOptions = {},
  ): string {
    this.#assertWritable();
    this.#requireDistinctPoints(centerPointId, vertexPointId);
    const center = this.#requirePoint2D(centerPointId);
    const vertex = this.#requirePoint2D(vertexPointId);
    const count = clamp(Math.round(sides), 3, 64);
    const radius = distance2D(center, vertex);
    if (!Number.isFinite(radius) || radius <= 1e-12) {
      throw new KleinSdkError('invalid_polygon', 'Regular polygon needs a center and a distinct vertex.');
    }
    const startAngle = Math.atan2(vertex.y - center.y, vertex.x - center.x);
    const coordinates = regularPolygonCoordinates(center, count, radius, startAngle);
    const createdPoints = coordinates.slice(1).map(point => this.#makePoint(point.x, point.y, style));
    const entity = withEntityStyle<PolygonEntity>({
      id: this.#ids.next('poly'),
      kind: 'polygon',
      pointIds: [vertexPointId, ...createdPoints.map(point => point.id)],
      fillColor: style.fillColor ?? colorWithAlpha(style.color ?? style.strokeColor ?? this.#theme.drawColor, 0.12),
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        ...createdPoints.map(point => ({ op: 'addPoint' as const, point })),
        { op: 'addEntity', entity },
      ],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addRegularPolygonByCenterAndVertexCoordinates(
    center: Vector2,
    vertex: Vector2,
    sides: number,
    style: GeometryStyleOptions = {},
  ): string {
    this.#assertWritable();
    const centerPoint = this.#makePoint(center.x, center.y, { ...style, hidden: true, locked: true });
    const vertexPoint = this.#makePoint(vertex.x, vertex.y, style);
    const radius = distance2D(centerPoint, vertexPoint);
    if (!Number.isFinite(radius) || radius <= 1e-12) {
      throw new KleinSdkError('invalid_polygon', 'Regular polygon needs a center and a distinct vertex.');
    }
    const count = clamp(Math.round(sides), 3, 64);
    const startAngle = Math.atan2(vertexPoint.y - centerPoint.y, vertexPoint.x - centerPoint.x);
    const coordinates = regularPolygonCoordinates(centerPoint, count, radius, startAngle);
    const rest = coordinates.slice(1).map(point => this.#makePoint(point.x, point.y, style));
    const entity = withEntityStyle<PolygonEntity>({
      id: this.#ids.next('poly'),
      kind: 'polygon',
      pointIds: [vertexPoint.id, ...rest.map(point => point.id)],
      fillColor: style.fillColor ?? colorWithAlpha(style.color ?? style.strokeColor ?? this.#theme.drawColor, 0.12),
    }, style, this.#theme.drawColor);
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: centerPoint },
        { op: 'addPoint', point: vertexPoint },
        ...rest.map(point => ({ op: 'addPoint' as const, point })),
        { op: 'addEntity', entity },
      ],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  setPolygonVertex(polygonId: string, vertexIndex: number, coordinates: Vector2): void {
    this.#assertWritable();
    const entity = this.#requirePolygonEntity(polygonId);
    const pointId = entity.pointIds[normalizeVertexIndex(vertexIndex, entity.pointIds.length)];
    if (!pointId) return;
    const scene = setPointPosition(this.#snapshot.scene, pointId, coordinates);
    const deltas = geometrySceneUpdateDeltas(this.#snapshot.scene, constrainGeometryScene(scene, [pointId]));
    if (deltas.length) this.#commitDelta({ op: 'batch', deltas });
  }

  insertPolygonVertex(
    polygonId: string,
    vertexIndex: number,
    coordinates: Vector2,
    style: GeometryStyleOptions = {},
  ): string {
    this.#assertWritable();
    const entity = this.#requirePolygonEntity(polygonId);
    const point = this.#makePoint(coordinates.x, coordinates.y, style);
    const index = clamp(Math.round(vertexIndex), 0, entity.pointIds.length);
    const pointIds = [...entity.pointIds.slice(0, index), point.id, ...entity.pointIds.slice(index)];
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point },
        { op: 'updateEntity', id: entity.id, changes: { pointIds } },
      ],
    });
    this.#select({ kind: 'point', id: point.id });
    return point.id;
  }

  removePolygonVertex(polygonId: string, vertexIndex: number): string {
    this.#assertWritable();
    const entity = this.#requirePolygonEntity(polygonId);
    if (entity.pointIds.length <= 3) {
      throw new KleinSdkError('invalid_polygon', 'A polygon must keep at least three vertices.');
    }
    const index = normalizeVertexIndex(vertexIndex, entity.pointIds.length);
    const removedId = entity.pointIds[index];
    if (!removedId) throw new KleinSdkError('invalid_polygon', 'Polygon vertex does not exist.');
    const pointIds = entity.pointIds.filter((_, candidateIndex) => candidateIndex !== index);
    this.#commitDelta({ op: 'updateEntity', id: entity.id, changes: { pointIds } });
    this.#select({ kind: 'entity', id: entity.id });
    return removedId;
  }

  addPolygonSideConstraints(polygonId: string, length?: number): string[] {
    this.#assertWritable();
    const entity = this.#requirePolygonEntity(polygonId);
    const result: string[] = [];
    for (let index = 0; index < entity.pointIds.length; index += 1) {
      const firstId = entity.pointIds[index];
      const secondId = entity.pointIds[(index + 1) % entity.pointIds.length];
      if (!firstId || !secondId) continue;
      const currentLength = segmentLength(this.#snapshot.scene, [firstId, secondId]);
      result.push(this.addConstraint({
        kind: 'fixedLength',
        pointIds: [firstId, secondId],
        length: positiveNumber(length, currentLength),
        label: `side ${index + 1}`,
      }));
    }
    return result;
  }

  addPolygonAngleConstraints(polygonId: string, degrees?: number): string[] {
    this.#assertWritable();
    const entity = this.#requirePolygonEntity(polygonId);
    const result: string[] = [];
    for (let index = 0; index < entity.pointIds.length; index += 1) {
      const previousId = entity.pointIds[(index - 1 + entity.pointIds.length) % entity.pointIds.length];
      const vertexId = entity.pointIds[index];
      const nextId = entity.pointIds[(index + 1) % entity.pointIds.length];
      if (!previousId || !vertexId || !nextId) continue;
      const previous = this.#requirePoint2D(previousId);
      const vertex = this.#requirePoint2D(vertexId);
      const next = this.#requirePoint2D(nextId);
      result.push(this.addConstraint({
        kind: 'fixedAngle',
        pointIds: [previousId, vertexId, nextId],
        degrees: positiveNumber(degrees, angleMeasureDegrees(previous, vertex, next)),
        label: `angle ${index + 1}`,
      }));
    }
    return result;
  }

  detectTriangleType(polygonId: string): GeometryTriangleClassification {
    const entity = this.#requirePolygonEntity(polygonId);
    return classifyTriangle(this.#snapshot.scene, entity);
  }

  isCyclicQuadrilateral(polygonId: string, tolerance = 1e-6): boolean {
    const entity = this.#requirePolygonEntity(polygonId);
    return isCyclicQuadrilateral(this.#snapshot.scene, entity, tolerance);
  }

  addCongruenceMarker(targetIds: string[], label = 'congruent', style: GeometryStyleOptions = {}): string {
    return this.#addRelationMarker('congruence', targetIds, label, style);
  }

  addSimilarityMarker(targetIds: string[], label = 'similar', style: GeometryStyleOptions = {}): string {
    return this.#addRelationMarker('similarity', targetIds, label, style);
  }

  addCyclicQuadrilateralMarker(polygonId: string, style: GeometryStyleOptions = {}): string {
    const cyclic = this.isCyclicQuadrilateral(polygonId);
    return this.#addRelationMarker(
      'cyclicQuadrilateral',
      [polygonId],
      cyclic ? 'cyclic' : 'not cyclic',
      style,
    );
  }

  addTriangleTypeMarker(polygonId: string, style: GeometryStyleOptions = {}): string {
    const classification = this.detectTriangleType(polygonId);
    return this.#addRelationMarker(
      'triangleType',
      [polygonId],
      `${classification.sideType}, ${classification.angleType}`,
      style,
    );
  }

  addAngleByPoints(pointIds: [string, string, string], style: GeometryAngleOptions = {}): string {
    this.#assertWritable();
    for (const pointId of pointIds) this.#requirePoint2D(pointId);
    const angleOptions = normalizeAngleOptions(style);
    const entity = withEntityStyle<AngleEntity>({
      id: this.#ids.next('angle'),
      kind: 'angle',
      pointIds,
      radius: angleOptions.radius,
      orientation: angleOptions.orientation,
      color: style.color ?? '#f97316',
    }, style, '#f97316');
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addAngleBetweenEntities(
    firstEntityId: string,
    secondEntityId: string,
    style: GeometryAngleOptions = {},
  ): string {
    this.#assertWritable();
    const delta = this.#angleBetweenEntitiesDelta(firstEntityId, secondEntityId, style);
    const angleId = deltaAddedEntityId(delta, 'angle');
    if (!angleId) {
      throw new KleinSdkError('invalid_angle', 'The selected lines do not intersect in a usable angle.');
    }
    this.#commitDelta(delta);
    this.#select({ kind: 'entity', id: angleId });
    return angleId;
  }

  addAngleAt(options: AngleCreationOptions): string {
    this.#assertWritable();
    if (!Number.isFinite(options.degrees) || options.degrees <= 0 || options.degrees >= 360) {
      throw new KleinSdkError('invalid_angle', 'Angle degrees must be between 0 and 360.');
    }
    const length = positiveNumber(options.armLength, 2);
    const angleOptions = normalizeAngleOptions(options);
    const start = ((options.startDegrees ?? 0) * Math.PI) / 180;
    const end = start + (options.degrees * Math.PI) / 180;
    const first = this.#makePoint(
      options.vertex.x + Math.cos(start) * length,
      options.vertex.y + Math.sin(start) * length,
      options,
    );
    const vertex = this.#makePoint(options.vertex.x, options.vertex.y, options);
    const second = this.#makePoint(
      options.vertex.x + Math.cos(end) * length,
      options.vertex.y + Math.sin(end) * length,
      options,
    );
    const entity = withEntityStyle<AngleEntity>({
      id: this.#ids.next('angle'),
      kind: 'angle',
      pointIds: [first.id, vertex.id, second.id],
      radius: angleOptions.radius,
      orientation: angleOptions.orientation,
      color: options.color ?? '#f97316',
    }, options, '#f97316');
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: first },
        { op: 'addPoint', point: vertex },
        { op: 'addPoint', point: second },
        { op: 'addEntity', entity },
      ],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  addConstraint(constraint: GeometryConstraintDraft): string {
    this.#assertWritable();
    const created = makeGeometryConstraint(constraint, this.#ids.next('constraint'), this.#snapshot.scene);
    this.#commitDelta({ op: 'addConstraint', constraint: created });
    return created.id;
  }

  editObject(id: string, edits: GeometryObjectEditOptions): void {
    this.#assertWritable();
    let working = this.#snapshot;
    const deltas: GeometryCalculatorDelta[] = [];
    const pushScene = (scene: GeometryCalculatorScene): void => {
      const sceneDeltas = geometrySceneUpdateDeltas(working.scene, scene);
      if (!sceneDeltas.length) return;
      deltas.push(...sceneDeltas);
      working = applyGeometryCalculatorDelta(working, { op: 'batch', deltas: sceneDeltas });
    };

    const point = point2D(working.scene, id);
    if (point) {
      const changes = geometryDisplayEditChanges<GeometryPoint2D>(edits);
      if (Object.keys(changes).length > 0) {
        deltas.push({ op: 'updatePoint', id, changes });
        working = applyGeometryCalculatorDelta(working, { op: 'updatePoint', id, changes });
      }
      if (edits.coordinates) {
        pushScene(setPointPosition(working.scene, id, edits.coordinates));
      }
    } else {
      const entity = working.scene.entities[id];
      if (!entity) {
        throw new KleinSdkError('missing_object', `Object ${id} does not exist.`);
      }

      const changes = geometryDisplayEditChanges<GeometryEntity>(edits);
      if (Object.keys(changes).length > 0) {
        deltas.push({ op: 'updateEntity', id, changes });
        working = applyGeometryCalculatorDelta(working, { op: 'updateEntity', id, changes });
      }

      if (edits.length !== undefined) {
        const pointIds = lineConstraintPointIds(working.scene, id);
        if (!pointIds) {
          throw new KleinSdkError('invalid_edit', 'Length editing needs a line, ray, segment, or vector.');
        }
        pushScene(adjustSegmentLength(working.scene, pointIds, edits.length, new Set([pointIds[1]])));
      }

      if (edits.radius !== undefined) {
        pushScene(setCircleRadius(working.scene, id, edits.radius));
      }

      if (edits.angleDegrees !== undefined) {
        const current = working.scene.entities[id];
        if (current?.kind !== 'angle') {
          throw new KleinSdkError('invalid_edit', 'Angle editing needs an angle object.');
        }
        const [firstId, vertexId, secondId] = current.pointIds;
        const first = point2D(working.scene, firstId);
        const vertex = point2D(working.scene, vertexId);
        const second = point2D(working.scene, secondId);
        if (first && vertex && second) {
          pushScene(setPointOnAngle(working.scene, {
            moveId: secondId,
            anchor: vertex,
            base: first,
            current: second,
            degrees: edits.angleDegrees,
          }));
        }
      }

      if (edits.sides !== undefined) {
        const sideDeltas = polygonSideCountEditDeltas(working.scene, id, edits.sides, this.#ids);
        if (sideDeltas.length) {
          deltas.push(...sideDeltas);
          working = applyGeometryCalculatorDelta(working, { op: 'batch', deltas: sideDeltas });
        }
      }
    }

    if (!deltas.length) return;
    const constrainedScene = constrainGeometryScene(working.scene, changedIdsFromDeltas(deltas));
    const constrainedDeltas = geometrySceneUpdateDeltas(working.scene, constrainedScene);
    this.#commitDelta({ op: 'batch', deltas: [...deltas, ...constrainedDeltas] });
  }

  updateConstraint(id: string, changes: Partial<GeometryConstraint>): void {
    this.#assertWritable();
    const current = this.#snapshot.scene.constraints?.[id];
    if (!current) {
      throw new KleinSdkError('missing_constraint', `Constraint ${id} does not exist.`);
    }
    const next = { ...current, ...changes, id } as GeometryConstraint;
    validateGeometryConstraint(next, this.#snapshot.scene);
    this.#commitDelta({ op: 'updateConstraint', id, changes: next });
  }

  deleteConstraints(ids: string[]): void {
    this.#assertWritable();
    this.#commitDelta({ op: 'deleteConstraint', ids });
  }

  #addRelationMarker(
    relationKind: GeometryRelationMarkerKind,
    targetIds: string[],
    label: string,
    style: GeometryStyleOptions,
  ): string {
    this.#assertWritable();
    const targets = uniqueStrings(targetIds);
    if (!targets.length) {
      throw new KleinSdkError('invalid_marker', 'A relation marker needs at least one target.');
    }
    for (const targetId of targets) {
      if (!this.#snapshot.scene.points[targetId] && !this.#snapshot.scene.entities[targetId]) {
        throw new KleinSdkError('invalid_marker', `Marker target ${targetId} does not exist.`);
      }
    }
    const entity = withEntityStyle<GeometryRelationMarkerEntity>({
      id: this.#ids.next('marker'),
      kind: 'relationMarker',
      relationKind,
      targetIds: targets,
      text: label,
      label,
      color: style.color ?? this.#theme.angle,
    }, style, this.#theme.angle);
    this.#commitDelta({ op: 'addEntity', entity });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  #commitSelectionTransform(mapPoint: (point: Vector2) => Vector2): void {
    this.#assertWritable();
    const targets = selectionTransformTargets(this.#snapshot.scene, this.#snapshot.appState.selected);
    const deltas = transformTargetDeltas(this.#snapshot.scene, targets, mapPoint);
    if (!deltas.length) return;
    const direct = applyGeometryCalculatorDelta(this.#snapshot, { op: 'batch', deltas });
    const constrainedScene = constrainGeometryScene(direct.scene, changedIdsFromDeltas(deltas));
    const constrainedDeltas = geometrySceneUpdateDeltas(this.#snapshot.scene, constrainedScene);
    if (!constrainedDeltas.length) return;
    this.#commitDelta({ op: 'batch', deltas: constrainedDeltas });
  }

  #commitSelectionDisplayChanges(changes: Pick<GeometryStyleOptions, 'hidden' | 'locked'>): void {
    this.#assertWritable();
    const deltas: GeometryCalculatorDelta[] = [];
    const seen = new Set<string>();
    for (const item of selectionItems(this.#snapshot.appState.selected)) {
      if (seen.has(selectionKey(item))) continue;
      seen.add(selectionKey(item));
      if (item.kind === 'point' && point2D(this.#snapshot.scene, item.id)) {
        deltas.push({ op: 'updatePoint', id: item.id, changes });
      }
      if (item.kind === 'entity' && this.#snapshot.scene.entities[item.id]) {
        deltas.push({ op: 'updateEntity', id: item.id, changes });
      }
    }
    if (!deltas.length) return;
    this.#commitDelta({ op: 'batch', deltas });
  }

  #reorderSelection(mode: 'forward' | 'backward' | 'front' | 'back'): void {
    this.#assertWritable();
    const selectedIds = new Set(
      selectionItems(this.#snapshot.appState.selected)
        .filter((item): item is Extract<GeometryCalculatorSelectable, { kind: 'entity' }> => item.kind === 'entity')
        .map(item => item.id),
    );
    if (!selectedIds.size) return;

    const order = normalizeEntityOrder(this.#snapshot.scene.order, this.#snapshot.scene.entities);
    if (mode === 'front') {
      this.#commitDelta({ op: 'setOrder', order: [...order.filter(id => !selectedIds.has(id)), ...order.filter(id => selectedIds.has(id))] });
      return;
    }
    if (mode === 'back') {
      this.#commitDelta({ op: 'setOrder', order: [...order.filter(id => selectedIds.has(id)), ...order.filter(id => !selectedIds.has(id))] });
      return;
    }

    const next = [...order];
    if (mode === 'forward') {
      for (let index = next.length - 2; index >= 0; index -= 1) {
        const id = next[index];
        const after = next[index + 1];
        if (id && after && selectedIds.has(id) && !selectedIds.has(after)) {
          next[index] = after;
          next[index + 1] = id;
        }
      }
    } else {
      for (let index = 1; index < next.length; index += 1) {
        const id = next[index];
        const before = next[index - 1];
        if (id && before && selectedIds.has(id) && !selectedIds.has(before)) {
          next[index] = before;
          next[index - 1] = id;
        }
      }
    }
    this.#commitDelta({ op: 'setOrder', order: next });
  }

  #addConstructedLine(
    constructionKind: 'parallelLine' | 'perpendicularLine',
    sourceEntityId: string,
    throughPointId: string,
    style: GeometryStyleOptions,
  ): string {
    this.#assertWritable();
    const source = this.#requireLineLikeEntity(sourceEntityId);
    const through = this.#requirePoint2D(throughPointId);
    // Called for its refusals: a source whose points have gone missing is a
    // `missing_point`, which the builder cannot distinguish from any other
    // reason for having no equation.
    entityLineEquation(this.#snapshot.scene, source);
    const built = buildConstructedLine2D(
      this.#snapshot.scene,
      constructionKind,
      source.id,
      through.id,
      prefix => this.#ids.next(prefix),
    );
    if (!built) {
      throw new KleinSdkError('invalid_line_equation', 'Line equation must have a finite x or y coefficient.');
    }
    const helper: GeometryPoint2D = {
      ...(built.points[0] as GeometryPoint2D),
      color: style.color ?? this.#theme.drawColor,
    };
    const entity = withEntityStyle<LineEntity>(
      built.entities[0] as LineEntity,
      style,
      this.#theme.drawColor,
    );
    this.#commitDelta({
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: helper },
        { op: 'addEntity', entity },
      ],
    });
    this.#select({ kind: 'entity', id: entity.id });
    return entity.id;
  }

  #commitDelta(
    delta: GeometryCalculatorDelta,
    options: {
      emit?: boolean;
      meta?: Partial<DeltaMeta>;
      recordHistory?: boolean;
    } = {},
  ): void {
    const recordHistory = options.recordHistory ?? true;
    if (recordHistory) {
      this.#undoStack.push(cloneSnapshot(this.#snapshot));
      this.#redoStack = [];
    }

    this.#snapshot = applyGeometryCalculatorDelta(this.#snapshot, delta);
    this.#snapshot = {
      ...this.#snapshot,
      metadata: {
        ...this.#snapshot.metadata,
        updatedAt: Date.now(),
      },
    };

    if (options.emit !== false) {
      this.#emitDelta(delta, this.#deltaMeta(options.meta));
    }
    this.#updateToolbarState();
    this.#syncPanels();
    this.#render();
  }

  #deltaMeta(meta: Partial<DeltaMeta> | undefined): DeltaMeta {
    const result: DeltaMeta = {
      id: meta?.id ?? this.#ids.next('delta'),
      createdAt: meta?.createdAt ?? Date.now(),
      source: meta?.source ?? 'local',
    };
    if (meta?.actorId) result.actorId = meta.actorId;
    return result;
  }

  #emitDelta(delta: GeometryCalculatorDelta, meta: DeltaMeta): void {
    const listeners = [
      ...(this.#options.onDelta ? [this.#options.onDelta] : []),
      ...this.#deltaListeners,
    ];
    for (const listener of listeners) {
      try {
        listener(structuredClone(delta), { ...meta });
      } catch (error) {
        const sdkError = error instanceof KleinSdkError
          ? error
          : new KleinSdkError('geometry_observer_failed', error instanceof Error ? error.message : 'A geometry delta observer failed.');
        try {
          this.#options.onError?.(sdkError);
        } catch {
          // Error observers are isolated from committed geometry transactions.
        }
      }
    }
  }

  #emitSnapshotReplacement(source: DeltaMeta['source']): void {
    const snapshot = this.#snapshot;
    const deltas: GeometryCalculatorDelta[] = [{ op: 'clear' }];
    for (const point of Object.values(snapshot.scene.points)) {
      if (point.kind === 'point2d') {
        deltas.push({ op: 'addPoint', point: structuredClone(point) });
      }
    }
    for (const entity of Object.values(snapshot.scene.entities)) {
      deltas.push({ op: 'addEntity', entity: structuredClone(entity) });
    }
    for (const constraint of Object.values(snapshot.scene.constraints ?? {})) {
      deltas.push({ op: 'addConstraint', constraint: structuredClone(constraint) });
    }
    for (const group of Object.values(snapshot.appState.groups)) {
      deltas.push({ op: 'addGroup', group: structuredClone(group) });
    }
    deltas.push(
      { op: 'setOrder', order: [...snapshot.scene.order] },
      { op: 'setTool', tool: snapshot.appState.activeTool },
      { op: 'setSelection', selection: structuredClone(snapshot.appState.selected) },
      { op: 'setView', view: { ...snapshot.appState.view } },
      { op: 'setGrid', grid: structuredClone(snapshot.appState.grid) },
    );
    this.#emitDelta({ op: 'batch', deltas }, this.#deltaMeta({ source }));
  }

  #assertWritable(): void {
    if (this.#options.readOnly) {
      throw new KleinSdkError('read_only', 'This geometry calculator is read-only.');
    }
  }

  #createControls(): HTMLDivElement {
    const controls = document.createElement('div');
    Object.assign(controls.style, {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr)',
      gap: '6px',
      padding: '8px',
      borderBottom: '1px solid var(--kgc-border)',
      background: 'var(--kgc-surface)',
    });

    const actionRow = document.createElement('div');
    Object.assign(actionRow.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
      alignItems: 'center',
    });
    const toolSearchInput = document.createElement('input');
    toolSearchInput.type = 'search';
    toolSearchInput.placeholder = 'Search tools';
    toolSearchInput.setAttribute('aria-label', 'Search tools');
    Object.assign(toolSearchInput.style, inputStyle('150px'));
    actionRow.append(
      this.#button('Undo', () => this.undo(), 'Restore the previous version. Ctrl or Cmd + Z.'),
      this.#button('Redo', () => this.redo(), 'Restore the next version. Ctrl or Cmd + Shift + Z, or Ctrl + Y.'),
      this.#button('Checkpoint', () => this.#promptCheckpoint(), 'Name and save the current construction state.'),
      this.#button('Commands', () => this.#showCommandPalette(), 'Open command palette. Ctrl or Cmd + K.'),
      this.#labelled('tools', toolSearchInput),
    );
    controls.append(actionRow);

    const toolRow = document.createElement('div');
    Object.assign(toolRow.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
      alignItems: 'center',
      overflowX: 'auto',
      paddingBottom: '2px',
    });

    const renderToolButtons = (): void => {
      const query = toolSearchInput.value.trim().toLowerCase();
      toolRow.replaceChildren();
      this.#toolButtons = [];
      for (const item of GEOMETRY_TOOL_CATALOG) {
        const searchable = `${item.label} ${item.tool} ${item.description} ${item.shortcut ?? ''}`.toLowerCase();
        if (query && !searchable.includes(query)) continue;
        const shortcut = item.shortcut ? ` Shortcut: ${item.shortcut}.` : '';
        const button = this.#button(item.label, () => this.setTool(item.tool), `${item.description}${shortcut}`);
        button.dataset.tool = item.tool;
        button.dataset.preview = item.description;
        this.#attachToolTooltip(button, item);
        this.#toolButtons.push(button);
        toolRow.append(button);
      }
      this.#updateToolbarState();
    };
    toolSearchInput.addEventListener('input', renderToolButtons);
    renderToolButtons();
    controls.append(toolRow);

    const commandRow = document.createElement('div');
    Object.assign(commandRow.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
      alignItems: 'center',
    });

    const xInput = this.#numberInput('x', '0');
    const yInput = this.#numberInput('y', '0');
    const x2Input = this.#numberInput('x2', '1');
    const y2Input = this.#numberInput('y2', '0');
    commandRow.append(
      this.#labelled('x', xInput),
      this.#labelled('y', yInput),
      this.#labelled('x2', x2Input),
      this.#labelled('y2', y2Input),
      this.#button('Add point', () => {
        const x = readNumberInput(xInput);
        const y = readNumberInput(yInput);
        this.addPoint({ x, y });
      }),
      this.#button('Add segment', () => {
        this.addSegmentByCoordinates(
          { x: readNumberInput(xInput), y: readNumberInput(yInput) },
          { x: readNumberInput(x2Input), y: readNumberInput(y2Input) },
        );
      }),
      this.#button('Add ray', () => {
        this.addRayByCoordinates(
          { x: readNumberInput(xInput), y: readNumberInput(yInput) },
          { x: readNumberInput(x2Input), y: readNumberInput(y2Input) },
        );
      }),
      this.#button('Add vector', () => {
        this.addVectorByCoordinates(
          { x: readNumberInput(xInput), y: readNumberInput(yInput) },
          { x: readNumberInput(x2Input), y: readNumberInput(y2Input) },
        );
      }),
      this.#button('Add line pts', () => {
        this.addLineByCoordinates(
          { x: readNumberInput(xInput), y: readNumberInput(yInput) },
          { x: readNumberInput(x2Input), y: readNumberInput(y2Input) },
        );
      }),
    );

    const equationInput = document.createElement('input');
    equationInput.type = 'text';
    equationInput.placeholder = 'y = 2x + 1';
    Object.assign(equationInput.style, inputStyle('150px'));
    commandRow.append(
      this.#labelled('line', equationInput),
      this.#button('Add equation', () => {
        this.addLineByEquation(equationInput.value);
      }),
    );

    const circleEquationInput = document.createElement('input');
    circleEquationInput.type = 'text';
    circleEquationInput.placeholder = '(x-1)^2+(y+2)^2=9';
    Object.assign(circleEquationInput.style, inputStyle('190px'));
    const radiusInput = this.#numberInput('r', '1');
    commandRow.append(
      this.#labelled('circle', circleEquationInput),
      this.#button('Add circle eq', () => {
        this.addCircleByEquation(circleEquationInput.value);
      }),
      this.#labelled('r', radiusInput),
      this.#button('Add circle', () => {
        this.addCircleByCoordinates(
          { x: readNumberInput(xInput), y: readNumberInput(yInput) },
          readNumberInput(radiusInput),
        );
      }),
    );

    const conicSelect = document.createElement('select');
    for (const conic of ['ellipse', 'parabola', 'hyperbola'] satisfies ConicEntity['conicKind'][]) {
      const option = document.createElement('option');
      option.value = conic;
      option.textContent = conic;
      conicSelect.append(option);
    }
    Object.assign(conicSelect.style, inputStyle('112px'));
    const rxInput = this.#numberInput('rx', '2');
    const ryInput = this.#numberInput('ry', '1');
    const rotationInput = this.#numberInput('rot', '0');
    commandRow.append(
      this.#labelled('conic', conicSelect),
      this.#labelled('rx/p', rxInput),
      this.#labelled('ry', ryInput),
      this.#labelled('rot', rotationInput),
      this.#button('Add conic', () => {
        const kind = conicSelect.value as ConicEntity['conicKind'];
        const origin = { x: readNumberInput(xInput), y: readNumberInput(yInput) };
        const rotation = readNumberInput(rotationInput);
        if (kind === 'parabola') {
          this.addParabola(origin, readNumberInput(rxInput), rotation);
        } else if (kind === 'hyperbola') {
          this.addHyperbola(origin, readNumberInput(rxInput), readNumberInput(ryInput), rotation);
        } else {
          this.addEllipse(origin, readNumberInput(rxInput), readNumberInput(ryInput), rotation);
        }
      }),
    );

    const paramXInput = document.createElement('input');
    paramXInput.type = 'text';
    paramXInput.placeholder = 'cos(t)';
    paramXInput.value = 'cos(t)';
    Object.assign(paramXInput.style, inputStyle('98px'));
    const paramYInput = document.createElement('input');
    paramYInput.type = 'text';
    paramYInput.placeholder = 'sin(t)';
    paramYInput.value = 'sin(t)';
    Object.assign(paramYInput.style, inputStyle('98px'));
    const tMinInput = this.#numberInput('t min', '0');
    const tMaxInput = this.#numberInput('t max', String(Math.PI * 2));
    commandRow.append(
      this.#labelled('x(t)', paramXInput),
      this.#labelled('y(t)', paramYInput),
      this.#labelled('t0', tMinInput),
      this.#labelled('t1', tMaxInput),
      this.#button('Add curve', () => {
        this.addParametricCurve({
          xExpression: paramXInput.value,
          yExpression: paramYInput.value,
          tMin: readNumberInput(tMinInput),
          tMax: readNumberInput(tMaxInput),
          samples: 160,
        });
      }),
    );

    const shapeSelect = document.createElement('select');
    for (const shape of ['triangle', 'rectangle', 'square', 'regularPolygon', 'parallelogram'] satisfies GeometryShapeKind[]) {
      const option = document.createElement('option');
      option.value = shape;
      option.textContent = shape;
      shapeSelect.append(option);
    }
    Object.assign(shapeSelect.style, inputStyle('142px'));
    const sizeInput = this.#numberInput('size', '2');
    const sidesInput = this.#numberInput('sides', '6');
    commandRow.append(
      this.#labelled('shape', shapeSelect),
      this.#labelled('size', sizeInput),
      this.#labelled('sides', sidesInput),
      this.#button('Add shape', () => {
        const shape = shapeSelect.value as GeometryShapeKind;
        this.addShape(shape, { x: readNumberInput(xInput), y: readNumberInput(yInput) }, {
          size: readNumberInput(sizeInput),
          sides: Math.max(3, Math.round(readNumberInput(sidesInput))),
        });
      }),
      this.#button('Regular c/v', () => {
        this.addRegularPolygonByCenterAndVertexCoordinates(
          { x: readNumberInput(xInput), y: readNumberInput(yInput) },
          { x: readNumberInput(x2Input), y: readNumberInput(y2Input) },
          Math.max(3, Math.round(readNumberInput(sidesInput))),
        );
      }),
      this.#button('Finish polygon', () => this.#finishPolygonDraft()),
      this.#button('Cancel', () => {
        this.#cancelDrafts();
        this.#render();
      }),
      this.#button('Reset view', () => this.resetView()),
      this.#button('Clear', () => {
        this.#commitDelta({ op: 'clear' });
        this.#cancelDrafts();
      }),
    );

    controls.append(commandRow);
    const angleRow = document.createElement('div');
    Object.assign(angleRow.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
      alignItems: 'center',
    });
    const angleRadiusInput = this.#numberInput('angle radius', String(this.#angleRadius));
    angleRadiusInput.min = '0.1';
    angleRadiusInput.step = '0.1';
    angleRadiusInput.addEventListener('change', () => {
      try {
        this.#angleRadius = positiveNumber(readNumberInput(angleRadiusInput), 0.7);
      } catch (error) {
        this.#handleError(error);
      }
    });
    angleRow.append(
      this.#labelled('angle r', angleRadiusInput),
      this.#checkbox('exterior angle', this.#angleOrientation === 'exterior', checked => {
        this.#angleOrientation = checked ? 'exterior' : 'interior';
      }),
    );
    controls.append(angleRow);

    const snapRow = document.createElement('div');
    Object.assign(snapRow.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
      alignItems: 'center',
    });
    const snap = this.#snapshot.appState.grid.snapping;
    const strengthInput = this.#numberInput('snap strength', String(snap.strength));
    strengthInput.min = '0.1';
    strengthInput.max = '3';
    strengthInput.step = '0.05';
    strengthInput.addEventListener('change', () => {
      try {
        this.setSnapSettings({ strength: readNumberInput(strengthInput) });
      } catch (error) {
        this.#handleError(error);
      }
    });
    snapRow.append(
      this.#checkbox('snap', snap.enabled, checked => this.setSnapSettings({ enabled: checked })),
      this.#checkbox('grid', snap.modes.grid, checked => this.setSnapSettings({ modes: { grid: checked } })),
      this.#checkbox('points', snap.modes.points, checked => this.setSnapSettings({ modes: { points: checked } })),
      this.#checkbox('mid', snap.modes.midpoints, checked => this.setSnapSettings({ modes: { midpoints: checked } })),
      this.#checkbox('intersections', snap.modes.intersections, checked => this.setSnapSettings({ modes: { intersections: checked } })),
      this.#checkbox('axes', snap.modes.axes, checked => this.setSnapSettings({ modes: { axes: checked } })),
      this.#checkbox('angles', snap.modes.angles, checked => this.setSnapSettings({ modes: { angles: checked } })),
      this.#checkbox('edges', snap.modes.shapeEdges, checked => this.setSnapSettings({ modes: { shapeEdges: checked } })),
      this.#checkbox('markers', snap.showMarkers, checked => this.setSnapSettings({ showMarkers: checked })),
      this.#labelled('strength', strengthInput),
    );
    controls.append(snapRow);

    const editRow = document.createElement('div');
    Object.assign(editRow.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
      alignItems: 'center',
    });
    const objectInput = document.createElement('input');
    objectInput.type = 'text';
    objectInput.placeholder = 'selected id';
    Object.assign(objectInput.style, inputStyle('118px'));
    const editXInput = this.#numberInput('edit x', '0');
    const editYInput = this.#numberInput('edit y', '0');
    const editLengthInput = this.#numberInput('length', '1');
    const editRadiusInput = this.#numberInput('radius', '1');
    const editAngleInput = this.#numberInput('angle', '90');
    const editSidesInput = this.#numberInput('sides', '6');
    const selectedObjectId = (): string => {
      const explicit = objectInput.value.trim();
      if (explicit) return explicit;
      const item = selectionItems(this.#snapshot.appState.selected)[0];
      if (!item) throw new KleinSdkError('missing_selection', 'Choose an object first.');
      return item.id;
    };
    editRow.append(
      this.#labelled('id', objectInput),
      this.#labelled('x', editXInput),
      this.#labelled('y', editYInput),
      this.#button('Set xy', () => this.editObject(selectedObjectId(), {
        coordinates: { x: readNumberInput(editXInput), y: readNumberInput(editYInput) },
      })),
      this.#labelled('len', editLengthInput),
      this.#button('Set len', () => this.editObject(selectedObjectId(), { length: readNumberInput(editLengthInput) })),
      this.#labelled('rad', editRadiusInput),
      this.#button('Set rad', () => this.editObject(selectedObjectId(), { radius: readNumberInput(editRadiusInput) })),
      this.#labelled('ang', editAngleInput),
      this.#button('Set ang', () => this.editObject(selectedObjectId(), { angleDegrees: readNumberInput(editAngleInput) })),
      this.#labelled('sides', editSidesInput),
      this.#button('Set sides', () => this.editObject(selectedObjectId(), {
        sides: Math.max(3, Math.round(readNumberInput(editSidesInput))),
      })),
      this.#button('Duplicate', () => this.duplicateSelection()),
      this.#button('Group', () => this.groupSelection()),
      this.#button('Ungroup', () => this.ungroupSelection()),
      this.#button('Lock', () => this.setSelectionLocked(true)),
      this.#button('Unlock', () => this.setSelectionLocked(false)),
      this.#button('Hide', () => this.setSelectionHidden(true)),
      this.#button('Front', () => this.bringSelectionToFront()),
      this.#button('Back', () => this.sendSelectionToBack()),
      this.#button('Delete', () => this.deleteSelection()),
    );
    controls.append(editRow);
    return controls;
  }

  #createSidePanel(): HTMLDivElement {
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      flex: '0 1 320px',
      minWidth: '260px',
      maxWidth: '360px',
      maxHeight: '100%',
      display: 'grid',
      gridTemplateRows: 'minmax(0, 1fr) auto',
      gap: '8px',
      padding: '8px',
      borderLeft: '1px solid var(--kgc-border)',
      background: 'var(--kgc-surface)',
      overflow: 'auto',
    });

    this.#objectPanelEl = document.createElement('div');
    this.#historyPanelEl = document.createElement('div');
    panel.append(this.#objectPanelEl, this.#historyPanelEl);
    this.#syncPanels();
    return panel;
  }

  #syncPanels(): void {
    this.#renderObjectPanel();
    this.#renderHistoryPanel();
  }

  #renderObjectPanel(): void {
    const panel = this.#objectPanelEl;
    if (!panel) return;
    panel.replaceChildren();
    Object.assign(panel.style, {
      display: 'grid',
      gap: '8px',
      alignContent: 'start',
      minWidth: '0',
    });

    const title = document.createElement('div');
    title.textContent = 'Objects';
    Object.assign(title.style, {
      fontSize: '12px',
      fontWeight: '750',
      letterSpacing: '0',
      color: 'var(--kgc-text)',
    });

    const search = document.createElement('input');
    search.type = 'search';
    search.value = this.#objectSearchQuery;
    search.placeholder = 'Search objects';
    search.setAttribute('aria-label', 'Search objects');
    Object.assign(search.style, inputStyle('100%'));
    search.addEventListener('input', () => {
      this.#objectSearchQuery = search.value;
      this.#renderObjectPanel();
    });

    const filters = document.createElement('div');
    Object.assign(filters.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '4px',
    });
    for (const filter of geometryObjectFilters()) {
      const active = this.#objectTypeFilters.size === 0 || this.#objectTypeFilters.has(filter.id);
      const button = this.#panelButton(filter.label, () => {
        if (this.#objectTypeFilters.size === 0) {
          for (const candidate of geometryObjectFilters()) this.#objectTypeFilters.add(candidate.id);
        }
        if (this.#objectTypeFilters.has(filter.id)) this.#objectTypeFilters.delete(filter.id);
        else this.#objectTypeFilters.add(filter.id);
        if (this.#objectTypeFilters.size === geometryObjectFilters().length) this.#objectTypeFilters.clear();
        this.#renderObjectPanel();
      });
      button.setAttribute('aria-pressed', String(active));
      button.style.background = active ? 'var(--kgc-button-active-bg)' : 'var(--kgc-button-bg)';
      button.style.color = active ? 'var(--kgc-button-active-text)' : 'var(--kgc-button-text)';
      filters.append(button);
    }

    panel.append(title, search, filters);

    const rows = this.getObjectPanelRows({ includeHidden: true })
      .filter(row => this.#objectRowMatches(row));
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.textContent = this.#objectSearchQuery.trim()
        ? 'No matching objects.'
        : 'No objects yet. Add a point or shape to start.';
      Object.assign(empty.style, emptyStateStyle());
      panel.append(empty);
      return;
    }

    const tree = document.createElement('div');
    tree.setAttribute('role', 'tree');
    Object.assign(tree.style, {
      display: 'grid',
      gap: '6px',
      minWidth: '0',
    });

    const groups = [
      { label: 'Points', rows: rows.filter(row => row.kind === 'point') },
      { label: 'Objects', rows: rows.filter(row => row.kind === 'entity') },
    ];
    for (const group of groups) {
      if (!group.rows.length) continue;
      const groupLabel = document.createElement('div');
      groupLabel.textContent = `${group.label} (${group.rows.length})`;
      Object.assign(groupLabel.style, {
        marginTop: '4px',
        color: 'var(--kgc-muted-text)',
        fontSize: '11px',
        fontWeight: '750',
      });
      tree.append(groupLabel);
      for (const row of group.rows) tree.append(this.#objectRow(row));
    }
    panel.append(tree);
  }

  #objectRowMatches(row: GeometryObjectPanelRow): boolean {
    const query = this.#objectSearchQuery.trim().toLowerCase();
    if (query) {
      const text = `${row.id} ${row.label} ${row.displayKind} ${row.constructionLabel ?? ''}`.toLowerCase();
      if (!text.includes(query)) return false;
    }
    if (this.#objectTypeFilters.size === 0) return true;
    if (row.kind === 'point') return this.#objectTypeFilters.has('point');
    if (this.#objectTypeFilters.has(row.geometryKind)) return true;
    if ((row.geometryKind === 'conic' || row.geometryKind === 'parametricCurve') && this.#objectTypeFilters.has('curve')) return true;
    return false;
  }

  #objectRow(row: GeometryObjectPanelRow): HTMLDivElement {
    const item = document.createElement('div');
    item.setAttribute('role', 'treeitem');
    item.tabIndex = 0;
    const selected = selectionHasItem(this.#snapshot.appState.selected, { kind: row.kind, id: row.id });
    Object.assign(item.style, {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto auto',
      gap: '6px',
      alignItems: 'center',
      minWidth: '0',
      padding: '6px',
      border: `1px solid ${selected ? this.#theme.accent : this.#theme.border}`,
      borderRadius: '6px',
      background: selected ? this.#theme.buttonActiveBackground : this.#theme.surfaceRaised,
      color: selected ? this.#theme.buttonActiveText : this.#theme.text,
      cursor: 'pointer',
    });
    const selectRow = (): void => this.#select({ kind: row.kind, id: row.id });
    item.addEventListener('click', selectRow);
    item.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectRow();
      }
    });

    const main = document.createElement('div');
    Object.assign(main.style, {
      display: 'grid',
      gap: '3px',
      minWidth: '0',
    });
    const labelInput = document.createElement('input');
    labelInput.value = row.label;
    labelInput.setAttribute('aria-label', `Rename ${row.label}`);
    Object.assign(labelInput.style, {
      ...inputStyle('100%'),
      minWidth: '0',
      height: '26px',
      fontWeight: '650',
    });
    labelInput.addEventListener('click', event => event.stopPropagation());
    labelInput.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Enter') labelInput.blur();
    });
    labelInput.addEventListener('change', () => {
      this.editObject(row.id, { label: labelInput.value });
    });
    const meta = document.createElement('div');
    meta.textContent = `${row.displayKind}  ${row.id}`;
    if (row.constructionLabel) meta.textContent += `  ${row.constructionLabel}`;
    Object.assign(meta.style, {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      color: selected ? 'inherit' : 'var(--kgc-muted-text)',
      fontSize: '11px',
    });
    main.append(labelInput, meta);

    const hideButton = this.#panelButton(row.hidden ? 'Show' : 'Hide', () => {
      this.editObject(row.id, { hidden: !row.hidden });
    });
    const lockButton = this.#panelButton(row.locked ? 'Unlock' : 'Lock', () => {
      this.editObject(row.id, { locked: !row.locked });
    });
    hideButton.addEventListener('click', event => event.stopPropagation());
    lockButton.addEventListener('click', event => event.stopPropagation());
    item.append(main, hideButton, lockButton);
    return item;
  }

  #renderHistoryPanel(): void {
    const panel = this.#historyPanelEl;
    if (!panel) return;
    panel.replaceChildren();
    Object.assign(panel.style, {
      display: 'grid',
      gap: '6px',
      paddingTop: '8px',
      borderTop: '1px solid var(--kgc-border)',
    });
    const title = document.createElement('div');
    title.textContent = 'History';
    Object.assign(title.style, {
      fontSize: '12px',
      fontWeight: '750',
      color: 'var(--kgc-text)',
    });
    const actions = document.createElement('div');
    Object.assign(actions.style, {
      display: 'flex',
      gap: '4px',
      flexWrap: 'wrap',
    });
    actions.append(
      this.#panelButton('Undo', () => this.undo()),
      this.#panelButton('Redo', () => this.redo()),
      this.#panelButton('Checkpoint', () => this.#promptCheckpoint()),
    );
    panel.append(title, actions);
    const entries = this.getHistoryEntries();
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.textContent = 'No saved checkpoints yet.';
      Object.assign(empty.style, emptyStateStyle());
      panel.append(empty);
      return;
    }
    for (const entry of entries) {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: '6px',
        alignItems: 'center',
        minWidth: '0',
      });
      const label = document.createElement('div');
      label.textContent = entry.createdAt
        ? `${entry.label}  ${new Date(entry.createdAt).toLocaleTimeString()}`
        : entry.label;
      Object.assign(label.style, {
        minWidth: '0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: 'var(--kgc-muted-text)',
        fontSize: '11px',
      });
      const restore = this.#panelButton(entry.kind === 'redo' ? 'Redo' : 'Restore', () => {
        if (entry.kind === 'undo') this.undo();
        else if (entry.kind === 'redo') this.redo();
        else if (entry.checkpointId) this.restoreCheckpoint(entry.checkpointId);
      });
      row.append(label, restore);
      panel.append(row);
    }
  }

  #panelButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-label', label);
    Object.assign(button.style, {
      minHeight: '26px',
      padding: '0 8px',
      border: '1px solid var(--kgc-button-border)',
      borderRadius: '6px',
      background: 'var(--kgc-button-bg)',
      color: 'var(--kgc-button-text)',
      font: `650 11px/1 ${KLEIN_UI_FONT_STACK}`,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    });
    button.addEventListener('click', () => {
      try {
        onClick();
      } catch (error) {
        this.#handleError(error);
      }
    });
    return button;
  }

  #promptCheckpoint(): void {
    const fallback = `Checkpoint ${this.#checkpoints.length + 1}`;
    const name = window.prompt('Checkpoint name', fallback);
    if (name === null) return;
    this.createCheckpoint(name.trim() || fallback);
  }

  #showCommandPalette(): void {
    this.#hideCommandPalette();
    const overlay = document.createElement('div');
    this.#commandPaletteEl = overlay;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Command palette');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '1000000',
      display: 'grid',
      placeItems: 'start center',
      paddingTop: '10vh',
      background: 'rgba(15, 23, 42, 0.22)',
    });

    const palette = document.createElement('div');
    Object.assign(palette.style, {
      width: 'min(560px, calc(100vw - 24px))',
      maxHeight: '70vh',
      display: 'grid',
      gap: '8px',
      padding: '10px',
      border: `1px solid ${this.#theme.border}`,
      borderRadius: '8px',
      background: this.#theme.surfaceRaised,
      color: this.#theme.text,
      boxShadow: '0 24px 70px rgba(15, 23, 42, 0.28)',
    });
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Search commands or tools';
    input.setAttribute('aria-label', 'Search commands or tools');
    Object.assign(input.style, inputStyle('100%'));
    const list = document.createElement('div');
    Object.assign(list.style, {
      display: 'grid',
      gap: '5px',
      overflow: 'auto',
    });
    palette.append(input, list);
    overlay.append(palette);
    document.body.append(overlay);

    const render = (): void => {
      const query = input.value.trim().toLowerCase();
      list.replaceChildren();
      const commands = this.#commandPaletteItems()
        .filter(command => `${command.label} ${command.detail}`.toLowerCase().includes(query));
      if (!commands.length) {
        const empty = document.createElement('div');
        empty.textContent = 'No matching commands.';
        Object.assign(empty.style, emptyStateStyle());
        list.append(empty);
        return;
      }
      for (const command of commands.slice(0, 18)) {
        const button = document.createElement('button');
        button.type = 'button';
        Object.assign(button.style, {
          display: 'grid',
          gap: '2px',
          width: '100%',
          minHeight: '44px',
          padding: '7px 9px',
          border: '1px solid var(--kgc-button-border)',
          borderRadius: '6px',
          background: 'var(--kgc-button-bg)',
          color: 'var(--kgc-button-text)',
          textAlign: 'left',
          cursor: 'pointer',
        });
        const label = document.createElement('span');
        label.textContent = command.label;
        Object.assign(label.style, { fontWeight: '750', fontSize: '12px' });
        const detail = document.createElement('span');
        detail.textContent = command.detail;
        Object.assign(detail.style, { color: 'var(--kgc-muted-text)', fontSize: '11px' });
        button.append(label, detail);
        button.addEventListener('click', () => {
          this.#hideCommandPalette();
          command.run();
        });
        list.append(button);
      }
    };
    input.addEventListener('input', render);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) this.#hideCommandPalette();
    });
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.#hideCommandPalette();
      }
      if (event.key === 'Enter') {
        const first = list.querySelector('button');
        if (first instanceof HTMLButtonElement) {
          event.preventDefault();
          first.click();
        }
      }
    });
    render();
    input.focus();
  }

  #hideCommandPalette(): void {
    this.#commandPaletteEl?.remove();
    this.#commandPaletteEl = undefined;
  }

  #commandPaletteItems(): Array<{ label: string; detail: string; run: () => void }> {
    const commands: Array<{ label: string; detail: string; run: () => void }> = GEOMETRY_TOOL_CATALOG.map(item => ({
      label: `Tool: ${item.label}`,
      detail: item.shortcut ? `${item.description} Shortcut: ${item.shortcut}.` : item.description,
      run: () => this.setTool(item.tool),
    }));
    commands.push(
      { label: 'Undo', detail: 'Restore the previous version.', run: () => this.undo() },
      { label: 'Redo', detail: 'Restore the next version.', run: () => this.redo() },
      { label: 'Create checkpoint', detail: 'Name and save the current construction state.', run: () => this.#promptCheckpoint() },
      { label: 'Restore previous version', detail: 'Use the undo stack to restore the last version.', run: () => this.undo() },
      { label: 'Reset view', detail: 'Center the origin and reset zoom.', run: () => this.resetView() },
      { label: 'Duplicate selection', detail: 'Duplicate the currently selected objects.', run: () => this.duplicateSelection() },
      { label: 'Delete selection', detail: 'Delete the currently selected objects.', run: () => this.deleteSelection() },
    );
    return commands;
  }

  #attachToolTooltip(
    button: HTMLButtonElement,
    item: (typeof GEOMETRY_TOOL_CATALOG)[number],
  ): void {
    const show = (): void => {
      this.#hideToolTooltip();
      const rect = button.getBoundingClientRect();
      const tooltip = document.createElement('div');
      this.#toolTooltipEl = tooltip;
      Object.assign(tooltip.style, {
        position: 'fixed',
        left: `${Math.min(rect.left, window.innerWidth - 260)}px`,
        top: `${rect.bottom + 8}px`,
        zIndex: '1000001',
        width: '240px',
        display: 'grid',
        gap: '6px',
        padding: '8px',
        border: `1px solid ${this.#theme.border}`,
        borderRadius: '8px',
        background: this.#theme.surfaceRaised,
        color: this.#theme.text,
        boxShadow: '0 16px 40px rgba(15, 23, 42, 0.22)',
        pointerEvents: 'none',
      });
      const title = document.createElement('div');
      title.textContent = item.shortcut ? `${item.label} (${item.shortcut})` : item.label;
      Object.assign(title.style, { fontSize: '12px', fontWeight: '800' });
      const preview = document.createElement('div');
      preview.textContent = toolPreviewText(item.tool);
      Object.assign(preview.style, {
        minHeight: '34px',
        display: 'grid',
        placeItems: 'center',
        border: '1px solid var(--kgc-border)',
        borderRadius: '6px',
        background: 'var(--kgc-canvas)',
        color: 'var(--kgc-accent)',
        font: `700 12px/1.2 ${KLEIN_MONO_FONT_STACK}`,
        letterSpacing: '0',
      });
      const description = document.createElement('div');
      description.textContent = item.description;
      Object.assign(description.style, { fontSize: '11px', color: 'var(--kgc-muted-text)', lineHeight: '1.35' });
      tooltip.append(title, preview, description);
      document.body.append(tooltip);
    };
    button.addEventListener('mouseenter', show);
    button.addEventListener('focus', show);
    button.addEventListener('mouseleave', () => this.#hideToolTooltip());
    button.addEventListener('blur', () => this.#hideToolTooltip());
  }

  #hideToolTooltip(): void {
    this.#toolTooltipEl?.remove();
    this.#toolTooltipEl = undefined;
  }

  #button(label: string, onClick: () => void, tooltip?: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-label', tooltip ? `${label}. ${tooltip}` : label);
    if (tooltip) button.title = tooltip;
    Object.assign(button.style, {
      minHeight: '30px',
      padding: '0 10px',
      border: '1px solid var(--kgc-button-border)',
      borderRadius: '6px',
      background: 'var(--kgc-button-bg)',
      color: 'var(--kgc-button-text)',
      font: `600 12px/1 ${KLEIN_UI_FONT_STACK}`,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    });
    button.addEventListener('click', () => {
      try {
        onClick();
      } catch (error) {
        this.#handleError(error);
      }
    });
    return button;
  }

  #numberInput(label: string, value: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.value = value;
    input.setAttribute('aria-label', label);
    Object.assign(input.style, inputStyle('64px'));
    return input;
  }

  #checkbox(label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLLabelElement {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    Object.assign(input.style, {
      margin: '0',
      accentColor: 'var(--kgc-accent)',
    });
    input.addEventListener('change', () => {
      try {
        onChange(input.checked);
      } catch (error) {
        this.#handleError(error);
      }
    });
    const wrapper = document.createElement('label');
    Object.assign(wrapper.style, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      minHeight: '28px',
      color: 'var(--kgc-muted-text)',
      fontSize: '12px',
      fontWeight: '650',
      userSelect: 'none',
    });
    const text = document.createElement('span');
    text.textContent = label;
    wrapper.append(input, text);
    return wrapper;
  }

  #labelled(label: string, control: HTMLElement): HTMLLabelElement {
    const wrapper = document.createElement('label');
    Object.assign(wrapper.style, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      color: 'var(--kgc-muted-text)',
      fontSize: '12px',
      fontWeight: '650',
    });
    const text = document.createElement('span');
    text.textContent = label;
    wrapper.append(text, control);
    return wrapper;
  }

  #handleError(error: unknown): void {
    if (error instanceof KleinSdkError) {
      this.#options.onError?.(error);
      this.#setStatus(error.message);
      return;
    }
    const message = error instanceof Error ? error.message : 'Unknown geometry error.';
    const sdkError = new KleinSdkError('geometry_error', message);
    this.#options.onError?.(sdkError);
    this.#setStatus(message);
  }

  #resizeCanvas = (): void => {
    if (!this.#canvas || !this.#ctx) return;
    const rect = this.#canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width || this.#container?.clientWidth || 800);
    const height = Math.max(1, rect.height || 420);
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (this.#canvas.width !== pixelWidth || this.#canvas.height !== pixelHeight) {
      this.#canvas.width = pixelWidth;
      this.#canvas.height = pixelHeight;
      this.#ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    if (!this.#viewInitialized && isCornerOriginView(this.#snapshot.appState.view)) {
      this.#snapshot = applyGeometryCalculatorDelta(this.#snapshot, {
        op: 'setView',
        view: {
          x: width / 2,
          y: height / 2,
          zoom: clampGeometryZoom(this.#snapshot.appState.view.zoom),
        },
      });
      this.#viewInitialized = true;
    }
    this.#render();
  };

  #onPointerDown = (event: PointerEvent): void => {
    if (!this.#canvas) return;
    this.#canvas.focus();
    const screen = this.#eventScreen(event);
    const world = this.#eventWorld(event);
    const tool = this.#snapshot.appState.activeTool;
    this.#hoverWorld = world;

    if (event.button === 1 || tool === 'pan') {
      event.preventDefault();
      this.#canvas.setPointerCapture(event.pointerId);
      this.#drag = {
        kind: 'pan',
        pointerId: event.pointerId,
        startScreen: { x: event.clientX, y: event.clientY },
        startView: this.#snapshot.appState.view,
      };
      return;
    }

    if (event.button !== 0) return;

    if ((tool === 'select' || tool === 'move') && !this.#options.readOnly) {
      event.preventDefault();
      const hit = this.#hitTest(world);
      const additive = event.shiftKey || event.metaKey || event.ctrlKey;

      if (!hit) {
        this.#canvas.setPointerCapture(event.pointerId);
        this.#drag = {
          kind: 'marquee',
          pointerId: event.pointerId,
          additive,
          startSelection: additive ? cloneSelection(this.#snapshot.appState.selected) : null,
          screen,
          startWorld: world,
          currentWorld: world,
        };
        this.#render();
        return;
      }

      if (additive) {
        this.#select(toggleSelectionItem(this.#snapshot.appState.selected, hit.selection), false);
        this.#render();
        return;
      }

      const wasSelected = selectionHasItem(this.#snapshot.appState.selected, hit.selection);
      if (!wasSelected) this.#select(hit.selection, false);
      const activeSelection = this.#snapshot.appState.selected;
      const useSelectionDrag = selectionItems(activeSelection).length > 1 || hit.selection.kind === 'entity';
      if (useSelectionDrag) {
        const selectionDrag = this.#makeMoveSelectionDrag(event.pointerId, world, activeSelection);
        if (selectionDrag) {
          this.#canvas.setPointerCapture(event.pointerId);
          this.#drag = selectionDrag;
          return;
        }
      }

      if (hit.selection.kind === 'point') {
        const point = this.#requirePoint2D(hit.selection.id);
        if (point.locked) {
          this.#render();
          return;
        }
        this.#canvas.setPointerCapture(event.pointerId);
        this.#drag = {
          kind: 'movePoint',
          pointerId: event.pointerId,
          pointId: point.id,
          startSnapshot: cloneSnapshot(this.#snapshot),
          startWorld: world,
          original: point,
        };
        return;
      }
      this.#render();
    }

    if (this.#contextMenuEl) this.#hideContextMenu();
    this.#canvas.setPointerCapture(event.pointerId);
    this.#drag = { kind: 'press', pointerId: event.pointerId, screen, world };
  };

  #onPointerMove = (event: PointerEvent): void => {
    if (!this.#canvas) return;
    const world = this.#eventWorld(event);
    this.#hoverWorld = world;

    if (!this.#drag) {
      const tool = this.#snapshot.appState.activeTool;
      if (tool !== 'select' && tool !== 'move' && tool !== 'pan' && tool !== 'remove') {
        this.#snapWorld(world, [], event);
      } else {
        this.#snapMarker = null;
      }
      this.#render();
      return;
    }

    if (this.#drag.kind === 'pan') {
      const dx = event.clientX - this.#drag.startScreen.x;
      const dy = event.clientY - this.#drag.startScreen.y;
      this.setView({
        x: this.#drag.startView.x + dx,
        y: this.#drag.startView.y + dy,
      });
      return;
    }

    if (this.#drag.kind === 'movePoint') {
      const dx = world.x - this.#drag.startWorld.x;
      const dy = world.y - this.#drag.startWorld.y;
      const next = this.#snapWorld({
        x: this.#drag.original.x + dx,
        y: this.#drag.original.y + dy,
      }, [this.#drag.pointId], event);
      const points = {
        ...this.#drag.startSnapshot.scene.points,
        [this.#drag.pointId]: { ...this.#drag.original, x: next.x, y: next.y },
      };
      this.#snapshot = {
        ...this.#drag.startSnapshot,
        scene: constrainGeometryScene(
          recomputeGeometryScene({ ...this.#drag.startSnapshot.scene, points }),
          [this.#drag.pointId],
        ),
      };
      this.#render();
      return;
    }

    if (this.#drag.kind === 'moveSelection') {
      const dx = world.x - this.#drag.startWorld.x;
      const dy = world.y - this.#drag.startWorld.y;
      this.#snapshot = previewMoveSelection(this.#drag.startSnapshot, this.#drag, { x: dx, y: dy });
      this.#render();
      return;
    }

    if (this.#drag.kind === 'marquee') {
      this.#drag = { ...this.#drag, currentWorld: world };
      this.#render();
      return;
    }

    this.#render();
  };

  #onPointerUp = (event: PointerEvent): void => {
    if (!this.#canvas || !this.#drag || this.#drag.pointerId !== event.pointerId) return;
    this.#canvas.releasePointerCapture(event.pointerId);

    const drag = this.#drag;
    this.#drag = null;

    if (drag.kind === 'movePoint') {
      const moved = this.#snapshot;
      this.#snapshot = drag.startSnapshot;
      const deltas = geometrySceneUpdateDeltas(drag.startSnapshot.scene, moved.scene);
      if (deltas.length) {
        this.#commitDelta({ op: 'batch', deltas });
      } else {
        this.#render();
      }
      return;
    }

    if (drag.kind === 'moveSelection') {
      const moved = this.#snapshot;
      this.#snapshot = drag.startSnapshot;
      const deltas = moveSelectionCommitDeltas(moved, drag);
      if (deltas.length) {
        this.#commitDelta({ op: 'batch', deltas });
      } else {
        this.#render();
      }
      return;
    }

    if (drag.kind === 'marquee') {
      const upScreen = this.#eventScreen(event);
      if (distance2D(upScreen, drag.screen) <= 4) {
        this.#select(drag.additive ? drag.startSelection : null);
        return;
      }
      const marqueeItems = selectionItemsInWorldRect(this.#snapshot.scene, worldRectFromPoints(drag.startWorld, this.#eventWorld(event)));
      const nextItems = drag.additive
        ? [...selectionItems(drag.startSelection), ...marqueeItems]
        : marqueeItems;
      this.#select(selectionFromItems(nextItems));
      return;
    }

    if (drag.kind === 'pan') {
      this.#render();
      return;
    }

    const upScreen = this.#eventScreen(event);
    if (distance2D(upScreen, drag.screen) <= 4) {
      try {
        this.#handleCanvasClick(this.#eventWorld(event), event);
      } catch (error) {
        this.#handleError(error);
      }
    }
    this.#render();
  };

  #onPointerCancel = (event: PointerEvent): void => {
    if (this.#drag?.pointerId === event.pointerId) {
      if (this.#drag.kind === 'movePoint' || this.#drag.kind === 'moveSelection') {
        this.#snapshot = this.#drag.startSnapshot;
      }
      this.#drag = null;
      this.#render();
    }
  };

  #onWheel = (event: WheelEvent): void => {
    if (!this.#canvas) return;
    event.preventDefault();
    const rect = this.#canvas.getBoundingClientRect();
    const view = this.#snapshot.appState.view;
    if (event.ctrlKey || event.metaKey) {
      const mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const nextZoom = clampGeometryZoom(view.zoom * Math.pow(0.999, event.deltaY));
      const scale = nextZoom / view.zoom;
      this.setView({
        zoom: nextZoom,
        x: mouse.x - scale * (mouse.x - view.x),
        y: mouse.y - scale * (mouse.y - view.y),
      });
      return;
    }
    this.setView({ x: view.x - event.deltaX, y: view.y - event.deltaY });
  };

  #onContextMenu = (event: MouseEvent): void => {
    if (!this.#canvas || this.#options.readOnly) return;
    event.preventDefault();
    const world = this.#mouseWorld(event);
    const hit = this.#hitTest(world);
    if (!hit) {
      this.#hideContextMenu();
      return;
    }
    if (!selectionHasItem(this.#snapshot.appState.selected, hit.selection)) {
      this.#select(hit.selection, false);
    }
    this.#showContextMenu({ x: event.clientX, y: event.clientY });
    this.#render();
  };

  #onDocumentPointerDown = (event: PointerEvent): void => {
    if (!this.#contextMenuEl) return;
    if (event.target instanceof Node && this.#contextMenuEl.contains(event.target)) return;
    this.#hideContextMenu();
  };

  #onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && key === 'k') {
      event.preventDefault();
      this.#showCommandPalette();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && key === 'y') {
      event.preventDefault();
      this.redo();
      return;
    }
    const shortcuts: Record<string, GeometryCalculatorTool> = {
      v: 'select',
      m: 'pan',
      p: 'point',
      s: 'segment',
      l: 'line',
      r: 'ray',
      u: 'vector',
      g: 'polygon',
      c: 'circle',
      k: 'conic',
      q: 'parametricCurve',
      a: 'angle',
      x: 'remove',
    };
    if ((key === 'delete' || key === 'backspace') && this.#snapshot.appState.selected) {
      event.preventDefault();
      this.deleteSelection();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && key === 'd') {
      event.preventDefault();
      this.duplicateSelection();
      return;
    }
    const tool = shortcuts[key];
    if (tool) {
      event.preventDefault();
      this.setTool(tool);
      return;
    }
    if (key === 'escape') {
      this.#hideContextMenu();
      this.#cancelDrafts();
      this.#render();
      return;
    }
    if (key === 'enter' && this.#draftPolygonPointIds.length >= 3) {
      this.#finishPolygonDraft();
    }
  };

  #handleCanvasClick(world: Vector2, event: PointerEvent): void {
    if (this.#options.readOnly) return;
    const tool = this.#snapshot.appState.activeTool;
    const hit = this.#hitTest(world);

    if (tool === 'select' || tool === 'move') {
      this.#select(hit?.selection ?? null);
      return;
    }

    if (tool === 'remove') {
      if (hit) this.#commitDelta({ op: 'delete', ids: [hit.selection.id] });
      this.#select(null);
      return;
    }

    if (tool === 'point' || tool === 'pointOnObject') {
      const placed = this.#snapWorld(world, [], event);
      this.addPoint({ x: placed.x, y: placed.y });
      return;
    }

    if (tool === 'midpoint') {
      const pointId = this.#findOrCreatePoint(world, hit, event);
      if (!this.#pendingLineStartId) {
        this.#pendingLineStartId = pointId;
        this.#select({ kind: 'point', id: pointId });
        this.#setStatus('Choose the second point for the midpoint.');
        return;
      }
      if (this.#pendingLineStartId === pointId) return;
      const midpointId = this.addMidpoint(this.#pendingLineStartId, pointId);
      this.#pendingLineStartId = null;
      this.#select({ kind: 'point', id: midpointId });
      return;
    }

    if (tool === 'intersect') {
      if (hit?.selection.kind !== 'entity' || !this.#isIntersectableEntity(hit.selection.id)) {
        this.#setStatus('Choose a line, ray, segment, circle, or polygon.');
        return;
      }
      if (!this.#pendingReferenceEntityId) {
        this.#pendingReferenceEntityId = hit.selection.id;
        this.#select({ kind: 'entity', id: hit.selection.id });
        this.#setStatus('Choose the second intersecting object.');
        return;
      }
      if (this.#pendingReferenceEntityId === hit.selection.id) return;
      const pointIds = this.addIntersections(this.#pendingReferenceEntityId, hit.selection.id);
      this.#pendingReferenceEntityId = null;
      this.#select({ kind: 'point', id: pointIds[0] ?? '' });
      return;
    }

    if (tool === 'parallel' || tool === 'perpendicular') {
      if (!this.#pendingReferenceEntityId) {
        if (hit?.selection.kind !== 'entity' || !this.#isLineLikeEntity(hit.selection.id)) {
          this.#setStatus('Choose the source line, ray, or segment.');
          return;
        }
        this.#pendingReferenceEntityId = hit.selection.id;
        this.#select({ kind: 'entity', id: hit.selection.id });
        this.#setStatus('Choose a point the new line should pass through.');
        return;
      }
      const pointId = this.#findOrCreatePoint(world, hit, event);
      const lineId = tool === 'parallel'
        ? this.addParallelLine(this.#pendingReferenceEntityId, pointId)
        : this.addPerpendicularLine(this.#pendingReferenceEntityId, pointId);
      this.#pendingReferenceEntityId = null;
      this.#select({ kind: 'entity', id: lineId });
      return;
    }

    if (tool === 'tangent') {
      if (!this.#pendingReferenceEntityId) {
        if (hit?.selection.kind !== 'entity' || !this.#isCircleEntity(hit.selection.id)) {
          this.#setStatus('Choose a circle.');
          return;
        }
        this.#pendingReferenceEntityId = hit.selection.id;
        this.#select({ kind: 'entity', id: hit.selection.id });
        this.#setStatus('Choose a point on or outside the circle.');
        return;
      }
      const pointId = this.#findOrCreatePoint(world, hit, event);
      const lineIds = this.addTangentLines(this.#pendingReferenceEntityId, pointId);
      this.#pendingReferenceEntityId = null;
      this.#select({ kind: 'entity', id: lineIds[0] ?? '' });
      return;
    }

    if (tool === 'angleBisector') {
      const pointId = this.#findOrCreatePoint(world, hit, event);
      this.#draftAnglePointIds.push(pointId);
      if (this.#draftAnglePointIds.length === 3) {
        const [first, vertex, second] = this.#draftAnglePointIds;
        this.#draftAnglePointIds = [];
        if (first && vertex && second) {
          const lineId = this.addAngleBisectorByPoints([first, vertex, second]);
          this.#select({ kind: 'entity', id: lineId });
        }
      } else {
        this.#setStatus('Choose three points: arm, vertex, arm.');
      }
      return;
    }

    if (tool === 'segment' || tool === 'line' || tool === 'ray' || tool === 'vector') {
      const pointId = this.#findOrCreatePoint(world, hit, event);
      if (!this.#pendingLineStartId) {
        this.#pendingLineStartId = pointId;
        this.#select({ kind: 'point', id: pointId });
        this.#setStatus('Choose the second point.');
        return;
      }
      if (this.#pendingLineStartId === pointId) return;
      const entity = this.#makeLineLikeEntity(tool, this.#pendingLineStartId, pointId);
      this.#pendingLineStartId = null;
      this.#commitDelta({ op: 'addEntity', entity });
      this.#select({ kind: 'entity', id: entity.id });
      return;
    }

    if (tool === 'polygon') {
      const pointId = this.#findOrCreatePoint(world, hit, event);
      const firstId = this.#draftPolygonPointIds[0];
      if (firstId && pointId === firstId && this.#draftPolygonPointIds.length >= 3) {
        this.#finishPolygonDraft();
        return;
      }
      if (!this.#draftPolygonPointIds.includes(pointId)) {
        this.#draftPolygonPointIds.push(pointId);
      }
      this.#setStatus(this.#draftPolygonPointIds.length >= 3 ? 'Click the first point or press Enter to close.' : 'Add at least three polygon points.');
      return;
    }

    if (tool === 'circle') {
      const pointId = this.#findOrCreatePoint(world, hit, event);
      if (!this.#pendingCircleCenterId) {
        this.#pendingCircleCenterId = pointId;
        this.#select({ kind: 'point', id: pointId });
        this.#setStatus('Choose a radius point.');
        return;
      }
      const centerId = this.#pendingCircleCenterId;
      this.#pendingCircleCenterId = null;
      this.addCircleByCenterPoint(centerId, pointId);
      return;
    }

    if (tool === 'circleThroughPoints') {
      const pointId = this.#findOrCreatePoint(world, hit, event);
      if (!this.#draftCirclePointIds.includes(pointId)) {
        this.#draftCirclePointIds.push(pointId);
      }
      if (this.#draftCirclePointIds.length === 3) {
        const [first, second, third] = this.#draftCirclePointIds;
        this.#draftCirclePointIds = [];
        if (first && second && third) {
          const circleId = this.addCircleThroughPoints([first, second, third]);
          this.#select({ kind: 'entity', id: circleId });
        }
      } else {
        this.#setStatus('Choose three non-collinear points.');
      }
      return;
    }

    if (tool === 'arc') {
      const pointId = this.#findOrCreatePoint(world, hit, event);
      if (!this.#draftCirclePointIds.includes(pointId)) {
        this.#draftCirclePointIds.push(pointId);
      }
      if (this.#draftCirclePointIds.length === 3) {
        const [center, start, end] = this.#draftCirclePointIds;
        this.#draftCirclePointIds = [];
        if (center && start && end) {
          const arcId = this.addArcByPoints(center, start, end);
          this.#select({ kind: 'entity', id: arcId });
        }
      } else {
        this.#setStatus('Choose center, start point, then end point.');
      }
      return;
    }

    if (tool === 'angle') {
      if (hit?.selection.kind === 'entity' && this.#isLineLikeEntity(hit.selection.id)) {
        this.#draftAngleEntityIds.push(hit.selection.id);
        if (this.#draftAngleEntityIds.length >= 2) {
          const [firstId, secondId] = this.#draftAngleEntityIds;
          this.#draftAngleEntityIds = [];
          if (firstId && secondId) {
            this.addAngleBetweenEntities(firstId, secondId, {
              radius: this.#angleRadius,
              orientation: this.#angleOrientation,
            });
          }
        } else {
          this.#setStatus('Choose the second intersecting line or segment.');
        }
        return;
      }

      const pointId = this.#findOrCreatePoint(world, hit, event);
      this.#draftAnglePointIds.push(pointId);
      if (this.#draftAnglePointIds.length === 3) {
        const [a, vertex, c] = this.#draftAnglePointIds;
        this.#draftAnglePointIds = [];
        if (a && vertex && c) {
          this.addAngleByPoints([a, vertex, c], {
            radius: this.#angleRadius,
            orientation: this.#angleOrientation,
          });
        }
      } else {
        this.#setStatus('Choose three points: arm, vertex, arm.');
      }
      return;
    }

    if (tool === 'conic') {
      this.addEllipse(this.#snapWorld(world, [], event), 2, 1);
      return;
    }

    if (tool === 'parametricCurve') {
      const origin = this.#snapWorld(world, [], event);
      const points = Array.from({ length: 96 }, (_, index) => {
        const t = (index * Math.PI * 2) / 96;
        return { x: origin.x + Math.cos(t), y: origin.y + Math.sin(t) };
      });
      this.addParametricCurve({ points, closed: true, label: 'x(t), y(t)' });
      return;
    }

    if (tool === 'triangle' || tool === 'rectangle' || tool === 'square' || tool === 'regularPolygon') {
      const shapeOptions: ShapeCreationOptions = { size: 2 };
      if (tool === 'regularPolygon') shapeOptions.sides = 6;
      this.addShape(tool, this.#snapWorld(world, [], event), shapeOptions);
    }

    void event;
  }

  #findOrCreatePoint(world: Vector2, hit: HitTarget, event?: PointerEvent): string {
    if (hit?.selection.kind === 'point') return hit.selection.id;
    const placed = this.#snapWorld(world, [], event);
    const point = this.#makePoint(placed.x, placed.y);
    this.#commitDelta({ op: 'addPoint', point });
    return point.id;
  }

  #makePoint(x: number, y: number, style: GeometryStyleOptions = {}): GeometryPoint2D {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new KleinSdkError('invalid_point', 'Point coordinates must be finite numbers.');
    }
    const point: GeometryPoint2D = {
      id: this.#ids.next('p'),
      kind: 'point2d',
      x,
      y,
    };
    return withPointStyle(point, style);
  }

  #makeLineLikeEntity(
    tool: GeometryCalculatorTool,
    firstPointId: string,
    secondPointId: string,
  ): SegmentEntity | LineEntity | RayEntity | VectorEntity {
    this.#requireDistinctPoints(firstPointId, secondPointId);
    if (tool === 'line') {
      // Called for their refusals, which the builder folds into a single null.
      this.#requirePoint2D(firstPointId);
      this.#requirePoint2D(secondPointId);
      // The same builder the `addLineByPoints` API path uses, so a line drawn
      // with the tool and a line added through the API cannot differ.
      const built = buildLineThroughPoints2D(
        this.#snapshot.scene,
        firstPointId,
        secondPointId,
        prefix => this.#ids.next(prefix),
      );
      if (!built) throw new KleinSdkError('degenerate_line', 'A line needs two distinct points.');
      return withEntityStyle<LineEntity>(built.entities[0] as LineEntity, {}, this.#theme.drawColor);
    }
    if (tool === 'ray') {
      return withEntityStyle<RayEntity>({
        id: this.#ids.next('ray'),
        kind: 'ray',
        pointIds: [firstPointId, secondPointId],
      }, {}, this.#theme.drawColor);
    }
    if (tool === 'vector') {
      return withEntityStyle<VectorEntity>({
        id: this.#ids.next('vec'),
        kind: 'vector',
        pointIds: [firstPointId, secondPointId],
      }, {}, this.#theme.drawColor);
    }
    return withEntityStyle<SegmentEntity>({
      id: this.#ids.next('seg'),
      kind: 'segment',
      pointIds: [firstPointId, secondPointId],
    }, {}, this.#theme.drawColor);
  }

  #finishPolygonDraft(): void {
    if (this.#draftPolygonPointIds.length < 3) {
      this.#setStatus('A polygon needs at least three points.');
      return;
    }
    const id = this.addPolygon(this.#draftPolygonPointIds);
    this.#draftPolygonPointIds = [];
    this.#select({ kind: 'entity', id });
  }

  #cancelDrafts(): void {
    this.#pendingLineStartId = null;
    this.#draftPolygonPointIds = [];
    this.#draftAnglePointIds = [];
    this.#draftAngleEntityIds = [];
    this.#draftCirclePointIds = [];
    this.#pendingReferenceEntityId = null;
    this.#pendingCircleCenterId = null;
    this.#drag = null;
    this.#snapMarker = null;
    this.#setStatus(this.#statusForTool());
  }

  #select(selection: GeometryCalculatorSelection | null, emit = true): void {
    const normalized = normalizeSelection(selection);
    this.#snapshot = applyGeometryCalculatorDelta(this.#snapshot, { op: 'setSelection', selection: normalized });
    if (emit) {
      this.#emitDelta({ op: 'setSelection', selection: normalized }, this.#deltaMeta(undefined));
    }
    this.#syncPanels();
    this.#render();
  }

  #makeMoveSelectionDrag(
    pointerId: number,
    startWorld: Vector2,
    selection: GeometryCalculatorSelection | null,
  ): Extract<DragState, { kind: 'moveSelection' }> | null {
    const targets = selectionTransformTargets(this.#snapshot.scene, selection);
    if (!targets.pointIds.length && !targets.locusEntityIds.length) return null;
    const originalPoints: Record<string, GeometryPoint2D> = {};
    for (const pointId of targets.pointIds) {
      const point = point2D(this.#snapshot.scene, pointId);
      if (point) originalPoints[pointId] = point;
    }
    const locusPoints: Record<string, Vector2[]> = {};
    for (const entityId of targets.locusEntityIds) {
      const entity = this.#snapshot.scene.entities[entityId];
      if (isSampledCurveEntity(entity)) locusPoints[entityId] = entity.points.map(point => ({ ...point }));
    }
    return {
      kind: 'moveSelection',
      pointerId,
      startSnapshot: cloneSnapshot(this.#snapshot),
      startWorld,
      pointIds: targets.pointIds,
      originalPoints,
      locusPoints,
    };
  }

  #showContextMenu(position: Vector2): void {
    this.#hideContextMenu();
    const menu = document.createElement('div');
    this.#contextMenuEl = menu;
    Object.assign(menu.style, {
      position: 'fixed',
      left: `${position.x}px`,
      top: `${position.y}px`,
      zIndex: '999999',
      minWidth: '158px',
      padding: '5px',
      border: `1px solid ${this.#theme.border}`,
      borderRadius: '8px',
      background: this.#theme.surfaceRaised,
      boxShadow: '0 14px 30px rgba(15, 23, 42, 0.18)',
      color: this.#theme.text,
      font: `500 12px/1.2 ${KLEIN_UI_FONT_STACK}`,
      userSelect: 'none',
    });
    const appendAction = (label: string, action: () => void): void => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      Object.assign(button.style, {
        display: 'block',
        width: '100%',
        minHeight: '28px',
        padding: '0 9px',
        border: '0',
        borderRadius: '6px',
        background: 'transparent',
        color: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
        font: 'inherit',
      });
      button.addEventListener('mouseenter', () => {
        button.style.background = this.#theme.buttonActiveBackground;
        button.style.color = this.#theme.buttonActiveText;
      });
      button.addEventListener('mouseleave', () => {
        button.style.background = 'transparent';
        button.style.color = 'inherit';
      });
      button.addEventListener('click', () => {
        try {
          action();
        } catch (error) {
          this.#handleError(error);
        } finally {
          this.#hideContextMenu();
        }
      });
      menu.append(button);
    };
    appendAction('Duplicate', () => this.duplicateSelection());
    appendAction('Lock', () => this.setSelectionLocked(true));
    appendAction('Unlock', () => this.setSelectionLocked(false));
    appendAction('Hide', () => this.setSelectionHidden(true));
    appendAction('Bring to front', () => this.bringSelectionToFront());
    appendAction('Send to back', () => this.sendSelectionToBack());
    appendAction('Delete', () => this.deleteSelection());
    document.body.append(menu);
  }

  #hideContextMenu(): void {
    this.#contextMenuEl?.remove();
    this.#contextMenuEl = undefined;
  }

  #eventScreen(event: PointerEvent): Vector2 {
    const rect = this.#canvas?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  #eventWorld(event: PointerEvent): Vector2 {
    const rect = this.#canvas?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return screenToGeometryWorld(
      { x: event.clientX, y: event.clientY },
      this.#snapshot.appState.view,
      this.#snapshot.appState.grid.unitSize,
      rect,
    );
  }

  #mouseWorld(event: MouseEvent): Vector2 {
    const rect = this.#canvas?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return screenToGeometryWorld(
      { x: event.clientX, y: event.clientY },
      this.#snapshot.appState.view,
      this.#snapshot.appState.grid.unitSize,
      rect,
    );
  }

  #snapWorld(
    world: Vector2,
    excludePointIds: string[] = [],
    event?: Pick<PointerEvent, 'altKey' | 'shiftKey'>,
  ): Vector2 {
    const settings = effectiveSnapSettings(this.#snapshot.appState.grid.snapping, event);
    if (!settings.enabled) {
      this.#snapMarker = null;
      return world;
    }
    const snap = resolveGeometrySnap(this.#snapshot.scene, world, {
      toleranceWorld: this.#worldHitTolerance(),
      gridStep: 1,
      excludePointIds,
      settings,
    });
    this.#snapMarker = settings.showMarkers ? snap.marker : null;
    return snap.point;
  }

  #worldHitTolerance(): number {
    const grid = this.#snapshot.appState.grid;
    return HIT_TOLERANCE_PX / (grid.unitSize * this.#snapshot.appState.view.zoom);
  }

  #hitTest(world: Vector2): HitTarget {
    return hitTestGeometryCalculator(this.#snapshot.scene, world, this.#worldHitTolerance());
  }

  #requirePoint2D(id: string): GeometryPoint2D {
    const point = this.#snapshot.scene.points[id];
    if (!point || point.kind !== 'point2d') {
      throw new KleinSdkError('missing_point', `Point ${id} does not exist.`);
    }
    return point;
  }

  #requireDistinctPoints(firstPointId: string, secondPointId: string): void {
    if (firstPointId === secondPointId) {
      throw new KleinSdkError('degenerate_entity', 'Choose two distinct points.');
    }
    this.#requirePoint2D(firstPointId);
    this.#requirePoint2D(secondPointId);
  }

  #requireDistinctEntities(firstEntityId: string, secondEntityId: string): void {
    if (firstEntityId === secondEntityId) {
      throw new KleinSdkError('degenerate_entity', 'Choose two distinct objects.');
    }
  }

  #requireLineLikeEntity(id: string): SegmentEntity | LineEntity | RayEntity {
    const entity = this.#snapshot.scene.entities[id];
    if (!entity || !isLineLike(entity)) {
      throw new KleinSdkError('invalid_line_reference', 'Choose a line, ray, or segment.');
    }
    return entity;
  }

  #requireIntersectableEntity(id: string): GeometryEntity {
    const entity = this.#snapshot.scene.entities[id];
    if (!entity || !isIntersectableEntity(entity)) {
      throw new KleinSdkError('invalid_intersection_reference', 'Choose a line, ray, segment, circle, or polygon.');
    }
    return entity;
  }

  #requireCircleEntity(id: string): CircleEntity {
    const entity = this.#snapshot.scene.entities[id];
    if (!entity || entity.kind !== 'circle') {
      throw new KleinSdkError('invalid_circle_reference', 'Choose a circle.');
    }
    return entity;
  }

  #requirePolygonEntity(id: string): PolygonEntity {
    const entity = this.#snapshot.scene.entities[id];
    if (!entity || entity.kind !== 'polygon') {
      throw new KleinSdkError('invalid_polygon_reference', 'Choose a polygon.');
    }
    if (entity.pointIds.length < 3) {
      throw new KleinSdkError('invalid_polygon', 'A polygon needs at least three vertices.');
    }
    return entity;
  }

  #isLineLikeEntity(id: string): boolean {
    const entity = this.#snapshot.scene.entities[id];
    return entity?.kind === 'segment' || entity?.kind === 'line' || entity?.kind === 'ray';
  }

  #isCircleEntity(id: string): boolean {
    return this.#snapshot.scene.entities[id]?.kind === 'circle';
  }

  #isIntersectableEntity(id: string): boolean {
    const entity = this.#snapshot.scene.entities[id];
    return Boolean(entity && isIntersectableEntity(entity));
  }

  #angleBetweenEntitiesDelta(
    firstEntityId: string,
    secondEntityId: string,
    style: GeometryAngleOptions,
  ): GeometryCalculatorDelta {
    const first = this.#snapshot.scene.entities[firstEntityId];
    const second = this.#snapshot.scene.entities[secondEntityId];
    if (!first || !second || !isLineLike(first) || !isLineLike(second)) {
      throw new KleinSdkError('invalid_angle', 'Angles can be marked between lines, rays, or segments.');
    }

    const firstLine = entityLineEquation(this.#snapshot.scene, first);
    const secondLine = entityLineEquation(this.#snapshot.scene, second);
    const vertexPoint = lineLineIntersection(firstLine, secondLine);
    if (!vertexPoint) {
      throw new KleinSdkError('parallel_lines', 'Parallel lines do not form an intersection angle.');
    }

    const shared = first.pointIds.find(pointId => second.pointIds.includes(pointId));
    if (shared) {
      const firstArm = first.pointIds.find(pointId => pointId !== shared);
      const secondArm = second.pointIds.find(pointId => pointId !== shared);
      if (firstArm && secondArm) {
        const angleOptions = normalizeAngleOptions(style);
        const entity = withEntityStyle<AngleEntity>({
          id: this.#ids.next('angle'),
          kind: 'angle',
          pointIds: [firstArm, shared, secondArm],
          radius: angleOptions.radius,
          orientation: angleOptions.orientation,
          color: style.color ?? '#f97316',
        }, style, '#f97316');
        return { op: 'addEntity', entity };
      }
    }

    const color = style.color ?? '#f97316';
    const vertex = this.#makePoint(vertexPoint.x, vertexPoint.y, { color });
    const firstArm = this.#makePointAlongLine(first, vertexPoint, 1.5, color);
    const secondArm = this.#makePointAlongLine(second, vertexPoint, 1.5, color);
    const angleOptions = normalizeAngleOptions(style);
    const angle = withEntityStyle<AngleEntity>({
      id: this.#ids.next('angle'),
      kind: 'angle',
      pointIds: [firstArm.id, vertex.id, secondArm.id],
      radius: angleOptions.radius,
      orientation: angleOptions.orientation,
      color,
    }, style, '#f97316');
    return {
      op: 'batch',
      deltas: [
        { op: 'addPoint', point: vertex },
        { op: 'addPoint', point: firstArm },
        { op: 'addPoint', point: secondArm },
        { op: 'addEntity', entity: angle },
      ],
    };
  }

  #makePointAlongLine(
    entity: SegmentEntity | LineEntity | RayEntity,
    vertex: Vector2,
    distance: number,
    color: string,
  ): GeometryPoint2D {
    const [aId, bId] = entity.pointIds;
    const a = this.#requirePoint2D(aId);
    const b = this.#requirePoint2D(bId);
    const direction = normalizeVector({ x: b.x - a.x, y: b.y - a.y }) ?? { x: 1, y: 0 };
    const firstCandidate = { x: vertex.x + direction.x * distance, y: vertex.y + direction.y * distance };
    const secondCandidate = { x: vertex.x - direction.x * distance, y: vertex.y - direction.y * distance };
    const farEndpoint = distance2D(vertex, a) >= distance2D(vertex, b) ? a : b;
    const useFirst = distance2D(firstCandidate, farEndpoint) <= distance2D(secondCandidate, farEndpoint);
    return this.#makePoint(useFirst ? firstCandidate.x : secondCandidate.x, useFirst ? firstCandidate.y : secondCandidate.y, {
      color,
      hidden: true,
      locked: true,
    });
  }

  #cursorForTool(tool: GeometryCalculatorTool): string {
    if (tool === 'pan') return 'grab';
    if (tool === 'select' || tool === 'move') return 'default';
    if (tool === 'remove') return 'not-allowed';
    return 'crosshair';
  }

  #statusForTool(): string {
    const tool = this.#snapshot.appState.activeTool;
    if (tool === 'point') return 'Click the canvas or enter x/y coordinates to place a point.';
    if (tool === 'midpoint') return 'Choose two points to create a linked midpoint.';
    if (tool === 'intersect') return 'Choose two intersecting lines, rays, segments, circles, or polygons.';
    if (tool === 'line') return 'Choose two points, or add a line from an equation.';
    if (tool === 'parallel') return 'Choose a source line, then a point for the parallel line.';
    if (tool === 'perpendicular') return 'Choose a source line, then a point for the perpendicular line.';
    if (tool === 'tangent') return 'Choose a circle, then a point on or outside it.';
    if (tool === 'angleBisector') return 'Choose three points: arm, vertex, arm.';
    if (tool === 'segment') return 'Choose two points to draw a segment.';
    if (tool === 'ray') return 'Choose the ray endpoint, then a point showing its direction.';
    if (tool === 'vector') return 'Choose the vector tail, then the vector head.';
    if (tool === 'polygon') return 'Click vertices, then click the first vertex or press Enter to close.';
    if (tool === 'circle') return 'Choose a center point, then a radius point.';
    if (tool === 'circleThroughPoints') return 'Choose three non-collinear points.';
    if (tool === 'arc') return 'Choose center, start point, then end point for the arc.';
    if (tool === 'conic') return 'Click to place a default ellipse, or use the conic controls.';
    if (tool === 'parametricCurve') return 'Click to place a sampled unit curve, or use x(t), y(t) controls.';
    if (tool === 'angle') return 'Choose three points, or choose two intersecting lines or segments. Use angle radius/exterior controls.';
    if (tool === 'pan') return 'Drag or use the wheel to move through the canvas. Ctrl-wheel zooms.';
    return 'Origin (0,0) starts centered. Coordinates are in grid units.';
  }

  #setStatus(message: string): void {
    if (this.#statusEl) {
      const view = this.#snapshot.appState.view;
      this.#statusEl.textContent = `${message}  |  zoom ${view.zoom.toFixed(2)}x`;
    }
  }

  #updateToolbarState(): void {
    const activeTool = this.#snapshot.appState.activeTool;
    for (const button of this.#toolButtons) {
      const active = button.dataset.tool === activeTool;
      button.style.background = active ? 'var(--kgc-button-active-bg)' : 'var(--kgc-button-bg)';
      button.style.borderColor = active ? 'var(--kgc-button-active-bg)' : 'var(--kgc-button-border)';
      button.style.color = active ? 'var(--kgc-button-active-text)' : 'var(--kgc-button-text)';
    }
    if (this.#canvas) this.#canvas.style.cursor = this.#cursorForTool(activeTool);
    this.#setStatus(this.#statusForTool());
  }

  #logicalCanvasSize(): { width: number; height: number } {
    const rect = this.#canvas?.getBoundingClientRect();
    return {
      width: Math.max(1, rect?.width ?? 800),
      height: Math.max(1, rect?.height ?? 420),
    };
  }

  #render(): void {
    const ctx = this.#ctx;
    const canvas = this.#canvas;
    if (!ctx || !canvas) return;

    const { width, height } = this.#logicalCanvasSize();
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = this.#theme.canvas;
    ctx.fillRect(0, 0, width, height);

    this.#drawGrid(ctx, width, height);
    this.#drawEntities(ctx);
    this.#drawDrafts(ctx);
    this.#drawPoints(ctx);
    this.#setStatus(this.#statusForTool());
  }

  #drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const { view, grid } = this.#snapshot.appState;
    const scale = grid.unitSize * view.zoom;
    const bounds = this.#worldBounds(width, height);
    const step = chooseGridStep(scale);
    const minorColor = this.#theme.gridMinor;
    const majorColor = this.#theme.gridMajor;
    const axisColor = this.#theme.axis;

    ctx.save();
    ctx.lineCap = 'butt';
    ctx.font = `11px ${KLEIN_UI_FONT_STACK}`;
    ctx.fillStyle = this.#theme.gridLabel;

    const startX = Math.floor(bounds.minX / step) * step;
    const endX = Math.ceil(bounds.maxX / step) * step;
    for (let x = startX; x <= endX + 1e-9; x += step) {
      const screen = geometryWorldToScreen({ x, y: 0 }, view, grid.unitSize);
      const major = isMajorGridLine(x, grid.majorEvery);
      ctx.strokeStyle = Math.abs(x) < 1e-9 ? axisColor : major ? majorColor : minorColor;
      ctx.lineWidth = Math.abs(x) < 1e-9 ? 1.5 : major ? 1 : 0.6;
      ctx.beginPath();
      ctx.moveTo(screen.x, 0);
      ctx.lineTo(screen.x, height);
      ctx.stroke();
      if (grid.labels && major && Math.abs(x) > 1e-9) {
        ctx.fillText(formatGridLabel(x), screen.x + 4, clamp(view.y + 14, 14, height - 4));
      }
    }

    const startY = Math.floor(bounds.minY / step) * step;
    const endY = Math.ceil(bounds.maxY / step) * step;
    for (let y = startY; y <= endY + 1e-9; y += step) {
      const screen = geometryWorldToScreen({ x: 0, y }, view, grid.unitSize);
      const major = isMajorGridLine(y, grid.majorEvery);
      ctx.strokeStyle = Math.abs(y) < 1e-9 ? axisColor : major ? majorColor : minorColor;
      ctx.lineWidth = Math.abs(y) < 1e-9 ? 1.5 : major ? 1 : 0.6;
      ctx.beginPath();
      ctx.moveTo(0, screen.y);
      ctx.lineTo(width, screen.y);
      ctx.stroke();
      if (grid.labels && major && Math.abs(y) > 1e-9) {
        ctx.fillText(formatGridLabel(y), clamp(view.x + 4, 4, width - 30), screen.y - 4);
      }
    }

    const origin = geometryWorldToScreen({ x: 0, y: 0 }, view, grid.unitSize);
    ctx.fillStyle = this.#theme.text;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText('0,0', origin.x + 6, origin.y - 6);
    ctx.restore();
  }

  #drawEntities(ctx: CanvasRenderingContext2D): void {
    const entities = orderedEntities(this.#snapshot.scene);
    for (const entity of entities) {
      if (entity.hidden) continue;
      switch (entity.kind) {
        case 'polygon':
          this.#drawPolygon(ctx, entity);
          break;
        case 'locus':
          this.#drawLocus(ctx, entity);
          break;
        case 'conic':
        case 'parametricCurve':
          this.#drawSampledCurve(ctx, entity);
          break;
        case 'relationMarker':
          this.#drawRelationMarker(ctx, entity);
          break;
        case 'circle':
          this.#drawCircle(ctx, entity);
          break;
        case 'line':
          this.#drawLine(ctx, entity);
          break;
        case 'segment':
          this.#drawSegment(ctx, entity);
          break;
        case 'ray':
          this.#drawRay(ctx, entity);
          break;
        case 'vector':
          this.#drawSegment(ctx, entity, true);
          break;
        case 'angle':
          this.#drawAngle(ctx, entity);
          break;
        case 'arc':
          this.#drawArc(ctx, entity);
          break;
        default:
          break;
      }
    }
  }

  #drawPoints(ctx: CanvasRenderingContext2D): void {
    for (const point of Object.values(this.#snapshot.scene.points)) {
      if (point.kind !== 'point2d' || point.hidden) continue;
      const screen = this.worldToScreen(point);
      const selectedPoint = selectionHasItem(this.#snapshot.appState.selected, { kind: 'point', id: point.id });
      ctx.save();
      ctx.fillStyle = point.color ?? this.#theme.pointColor;
      ctx.strokeStyle = selectedPoint ? this.#theme.selection : this.#theme.canvas;
      ctx.lineWidth = selectedPoint ? 3 : 2;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, selectedPoint ? POINT_RADIUS_PX + 2 : POINT_RADIUS_PX, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (point.label) {
        ctx.font = `600 12px ${KLEIN_UI_FONT_STACK}`;
        ctx.fillStyle = this.#theme.text;
        ctx.fillText(point.label, screen.x + 8, screen.y - 8);
      }
      ctx.restore();
    }
  }

  #drawPolygon(ctx: CanvasRenderingContext2D, entity: PolygonEntity): void {
    const points = entity.pointIds.map(id => point2D(this.#snapshot.scene, id)).filter(isPoint2D);
    if (points.length < 3) return;
    const selected = selectionHasItem(this.#snapshot.appState.selected, { kind: 'entity', id: entity.id });
    const firstPoint = points[0];
    if (!firstPoint) return;
    ctx.save();
    ctx.beginPath();
    const first = this.worldToScreen(firstPoint);
    ctx.moveTo(first.x, first.y);
    for (const point of points.slice(1)) {
      const screen = this.worldToScreen(point);
      ctx.lineTo(screen.x, screen.y);
    }
    ctx.closePath();
    ctx.fillStyle = entity.fillColor ?? this.#theme.fill;
    ctx.fill();
    ctx.strokeStyle = selected ? this.#theme.selection : entity.strokeColor ?? entity.color ?? this.#theme.drawColor;
    ctx.lineWidth = selected ? 4 : entity.width ?? DEFAULT_WIDTH;
    ctx.stroke();
    this.#drawEntityLabel(ctx, entity, polygonCentroid(points));
    ctx.restore();
  }

  #drawLocus(ctx: CanvasRenderingContext2D, entity: LocusEntity): void {
    if (entity.points.length < 2) return;
    const selected = selectionHasItem(this.#snapshot.appState.selected, { kind: 'entity', id: entity.id });
    const firstPoint = entity.points[0];
    if (!firstPoint) return;
    ctx.save();
    ctx.beginPath();
    const first = this.worldToScreen(firstPoint);
    ctx.moveTo(first.x, first.y);
    for (const point of entity.points.slice(1)) {
      const screen = this.worldToScreen(point);
      ctx.lineTo(screen.x, screen.y);
    }
    if (entity.closed) {
      ctx.closePath();
      if (entity.fillColor) {
        ctx.fillStyle = entity.fillColor;
        ctx.fill();
      }
    }
    ctx.strokeStyle = selected ? this.#theme.selection : entity.strokeColor ?? entity.color ?? this.#theme.drawColor;
    ctx.lineWidth = selected ? 4 : entity.width ?? DEFAULT_WIDTH;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    this.#drawEntityLabel(ctx, entity, polygonCentroid(entity.points));
    ctx.restore();
  }

  #drawCircle(ctx: CanvasRenderingContext2D, entity: CircleEntity): void {
    const center = point2D(this.#snapshot.scene, entity.centerId);
    if (!center || entity.radius <= 0) return;
    const screen = this.worldToScreen(center);
    const radius = entity.radius * this.#snapshot.appState.grid.unitSize * this.#snapshot.appState.view.zoom;
    const selected = selectionHasItem(this.#snapshot.appState.selected, { kind: 'entity', id: entity.id });
    ctx.save();
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = entity.fillColor ?? colorWithAlpha(entity.color ?? this.#theme.drawColor, 0.1);
    ctx.fill();
    ctx.strokeStyle = selected ? this.#theme.selection : entity.color ?? this.#theme.drawColor;
    ctx.lineWidth = selected ? 4 : entity.width ?? DEFAULT_WIDTH;
    ctx.stroke();
    this.#drawEntityLabel(ctx, entity, { x: center.x + entity.radius * 0.7, y: center.y + entity.radius * 0.7 });
    ctx.restore();
  }

  #drawLine(ctx: CanvasRenderingContext2D, entity: LineEntity): void {
    const equation = entity.equation ?? lineEquationFromEntityPoints(this.#snapshot.scene, entity);
    if (!equation) return;
    const size = this.#logicalCanvasSize();
    const clipped = clipLineToBounds(equation, this.#worldBounds(size.width, size.height));
    if (!clipped) return;
    this.#strokeWorldLine(ctx, clipped[0], clipped[1], entity, false);
  }

  #drawSegment(ctx: CanvasRenderingContext2D, entity: SegmentEntity | VectorEntity, arrow = false): void {
    const a = point2D(this.#snapshot.scene, entity.pointIds[0]);
    const b = point2D(this.#snapshot.scene, entity.pointIds[1]);
    if (!a || !b) return;
    this.#strokeWorldLine(ctx, a, b, entity, arrow);
  }

  #drawRay(ctx: CanvasRenderingContext2D, entity: RayEntity): void {
    const a = point2D(this.#snapshot.scene, entity.pointIds[0]);
    const b = point2D(this.#snapshot.scene, entity.pointIds[1]);
    if (!a || !b) return;
    const size = this.#logicalCanvasSize();
    const clipped = clipRayToBounds(a, b, this.#worldBounds(size.width, size.height));
    if (!clipped) return;
    this.#strokeWorldLine(ctx, clipped[0], clipped[1], entity, false);
  }

  #drawAngle(ctx: CanvasRenderingContext2D, entity: AngleEntity): void {
    const a = point2D(this.#snapshot.scene, entity.pointIds[0]);
    const vertex = point2D(this.#snapshot.scene, entity.pointIds[1]);
    const c = point2D(this.#snapshot.scene, entity.pointIds[2]);
    if (!a || !vertex || !c) return;
    const sa = this.worldToScreen(a);
    const sv = this.worldToScreen(vertex);
    const sc = this.worldToScreen(c);
    const selected = selectionHasItem(this.#snapshot.appState.selected, { kind: 'entity', id: entity.id });
    const radius = positiveNumber(entity.radius, 0.7) * this.#snapshot.appState.grid.unitSize * this.#snapshot.appState.view.zoom;
    const start = Math.atan2(sa.y - sv.y, sa.x - sv.x);
    const end = Math.atan2(sc.y - sv.y, sc.x - sv.x);
    const delta = angleSweep(start, end, entity.orientation);
    ctx.save();
    ctx.strokeStyle = selected ? this.#theme.selection : entity.color ?? this.#theme.angle;
    ctx.lineWidth = selected ? 4 : entity.width ?? 2.5;
    ctx.beginPath();
    ctx.arc(sv.x, sv.y, radius, start, start + delta, delta < 0);
    ctx.stroke();
    const mid = start + delta / 2;
    const labelPoint = {
      x: vertex.x + Math.cos(-mid) * (positiveNumber(entity.radius, 0.7) + 0.35),
      y: vertex.y + Math.sin(-mid) * (positiveNumber(entity.radius, 0.7) + 0.35),
    };
    const label = entity.label ?? `${angleMeasureForEntityDegrees(a, vertex, c, entity).toFixed(1)} deg`;
    this.#drawTextAtWorld(ctx, labelPoint, label, this.#theme.angleText);
    ctx.restore();
  }

  #drawSampledCurve(ctx: CanvasRenderingContext2D, entity: ConicEntity | ParametricCurveEntity): void {
    const segments = sampledCurveSegments(entity);
    if (!segments.length) return;
    const selected = selectionHasItem(this.#snapshot.appState.selected, { kind: 'entity', id: entity.id });
    ctx.save();
    ctx.strokeStyle = selected ? this.#theme.selection : entity.strokeColor ?? entity.color ?? this.#theme.drawColor;
    ctx.lineWidth = selected ? 4 : entity.width ?? DEFAULT_WIDTH;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const segment of segments) {
      if (segment.length < 2) continue;
      const firstPoint = segment[0];
      if (!firstPoint) continue;
      const first = this.worldToScreen(firstPoint);
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (const point of segment.slice(1)) {
        const screen = this.worldToScreen(point);
        ctx.lineTo(screen.x, screen.y);
      }
      if (entity.closed) ctx.closePath();
      if (entity.closed && entity.fillColor) {
        ctx.fillStyle = entity.fillColor;
        ctx.fill();
      }
      ctx.stroke();
    }
    const labelPoint = entity.kind === 'conic' && entity.center ? entity.center : polygonCentroid(entity.points);
    this.#drawEntityLabel(ctx, entity, labelPoint);
    ctx.restore();
  }

  #drawRelationMarker(ctx: CanvasRenderingContext2D, entity: GeometryRelationMarkerEntity): void {
    const anchor = relationMarkerAnchor(this.#snapshot.scene, entity);
    if (!anchor) return;
    const selected = selectionHasItem(this.#snapshot.appState.selected, { kind: 'entity', id: entity.id });
    const label = entity.text ?? entity.label ?? relationMarkerLabel(entity.relationKind);
    this.#drawTextAtWorld(ctx, anchor, label, selected ? this.#theme.selection : entity.color ?? this.#theme.angleText);
  }

  #drawArc(ctx: CanvasRenderingContext2D, entity: ArcEntity): void {
    const center = point2D(this.#snapshot.scene, entity.centerId);
    const start = point2D(this.#snapshot.scene, entity.startId);
    const end = point2D(this.#snapshot.scene, entity.endId);
    if (!center || !start || !end) return;
    const screenCenter = this.worldToScreen(center);
    const radius = distance2D(center, start) * this.#snapshot.appState.grid.unitSize * this.#snapshot.appState.view.zoom;
    const screenStart = this.worldToScreen(start);
    const screenEnd = this.worldToScreen(end);
    const startAngle = Math.atan2(screenStart.y - screenCenter.y, screenStart.x - screenCenter.x);
    const endAngle = Math.atan2(screenEnd.y - screenCenter.y, screenEnd.x - screenCenter.x);
    const delta = normalizeAngleDelta(endAngle - startAngle);
    const selected = selectionHasItem(this.#snapshot.appState.selected, { kind: 'entity', id: entity.id });
    ctx.save();
    ctx.strokeStyle = selected ? this.#theme.selection : entity.color ?? this.#theme.drawColor;
    ctx.lineWidth = selected ? 4 : entity.width ?? DEFAULT_WIDTH;
    ctx.beginPath();
    ctx.arc(screenCenter.x, screenCenter.y, radius, startAngle, startAngle + delta, delta < 0);
    ctx.stroke();
    ctx.restore();
  }

  #drawDrafts(ctx: CanvasRenderingContext2D): void {
    const hover = this.#hoverWorld;
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = this.#theme.draft;
    ctx.lineWidth = 1.5;

    if (hover && this.#pendingLineStartId) {
      const start = point2D(this.#snapshot.scene, this.#pendingLineStartId);
      if (start) this.#strokeWorldLine(ctx, start, hover, { color: this.#theme.draft }, false);
    }

    if (this.#draftPolygonPointIds.length) {
      const points = this.#draftPolygonPointIds.map(id => point2D(this.#snapshot.scene, id)).filter(isPoint2D);
      if (hover) points.push(hover as GeometryPoint2D);
      if (points.length >= 2) {
        for (let index = 0; index < points.length - 1; index += 1) {
          const current = points[index];
          const next = points[index + 1];
          if (current && next) this.#strokeWorldLine(ctx, current, next, { color: this.#theme.draft }, false);
        }
      }
    }

    if (hover && this.#pendingCircleCenterId) {
      const center = point2D(this.#snapshot.scene, this.#pendingCircleCenterId);
      if (center) {
        const screen = this.worldToScreen(center);
        const radius = distance2D(center, hover) * this.#snapshot.appState.grid.unitSize * this.#snapshot.appState.view.zoom;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (hover && this.#snapshot.appState.activeTool === 'arc' && this.#draftCirclePointIds.length >= 1) {
      const center = point2D(this.#snapshot.scene, this.#draftCirclePointIds[0] ?? '');
      const start = point2D(this.#snapshot.scene, this.#draftCirclePointIds[1] ?? '');
      if (center && !start) {
        this.#strokeWorldLine(ctx, center, hover, { color: this.#theme.draft }, false);
      } else if (center && start) {
        const screenCenter = this.worldToScreen(center);
        const radius = distance2D(center, start) * this.#snapshot.appState.grid.unitSize * this.#snapshot.appState.view.zoom;
        const screenStart = this.worldToScreen(start);
        const screenEnd = this.worldToScreen(hover);
        const startAngle = Math.atan2(screenStart.y - screenCenter.y, screenStart.x - screenCenter.x);
        const endAngle = Math.atan2(screenEnd.y - screenCenter.y, screenEnd.x - screenCenter.x);
        const delta = normalizeAngleDelta(endAngle - startAngle);
        ctx.beginPath();
        ctx.arc(screenCenter.x, screenCenter.y, radius, startAngle, startAngle + delta, delta < 0);
        ctx.stroke();
      }
    }

    if (this.#drag?.kind === 'marquee') {
      const start = this.worldToScreen(this.#drag.startWorld);
      const end = this.worldToScreen(this.#drag.currentWorld);
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const width = Math.abs(end.x - start.x);
      const height = Math.abs(end.y - start.y);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = this.#theme.selection;
      ctx.fillStyle = colorWithAlpha(this.#theme.selection, 0.1);
      ctx.lineWidth = 1.5;
      ctx.fillRect(x, y, width, height);
      ctx.strokeRect(x, y, width, height);
    }

    if (this.#snapMarker && this.#snapshot.appState.grid.snapping.showMarkers) {
      const screen = this.worldToScreen(this.#snapMarker.point);
      ctx.setLineDash([]);
      ctx.strokeStyle = this.#theme.selection;
      ctx.fillStyle = this.#theme.selection;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(screen.x - 7, screen.y);
      ctx.lineTo(screen.x + 7, screen.y);
      ctx.moveTo(screen.x, screen.y - 7);
      ctx.lineTo(screen.x, screen.y + 7);
      ctx.stroke();
      this.#drawTextAtWorld(ctx, {
        x: this.#snapMarker.point.x,
        y: this.#snapMarker.point.y,
      }, this.#snapMarker.label, this.#theme.selection);
    }

    ctx.restore();
  }

  #strokeWorldLine(
    ctx: CanvasRenderingContext2D,
    a: Vector2,
    b: Vector2,
    style: Partial<GeometryEntityDisplay>,
    arrow: boolean,
  ): void {
    const sa = this.worldToScreen(a);
    const sb = this.worldToScreen(b);
    const selected = 'id' in style && typeof style.id === 'string' && selectionHasItem(this.#snapshot.appState.selected, { kind: 'entity', id: style.id });
    ctx.save();
    ctx.strokeStyle = selected ? this.#theme.selection : style.color ?? style.strokeColor ?? this.#theme.drawColor;
    ctx.lineWidth = selected ? 4 : style.width ?? DEFAULT_WIDTH;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
    if (arrow) {
      drawArrowHead(ctx, sa, sb, ctx.strokeStyle.toString());
    }
    if (style.label) {
      this.#drawTextAtWorld(ctx, midpoint2D(a, b), style.label, this.#theme.text);
    }
    ctx.restore();
  }

  #drawEntityLabel(ctx: CanvasRenderingContext2D, entity: GeometryEntityDisplay, point: Vector2): void {
    if (entity.label) this.#drawTextAtWorld(ctx, point, entity.label, this.#theme.text);
  }

  #drawTextAtWorld(ctx: CanvasRenderingContext2D, point: Vector2, text: string, color: string): void {
    const screen = this.worldToScreen(point);
    ctx.save();
    ctx.font = `600 12px ${KLEIN_UI_FONT_STACK}`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.#theme.textHalo;
    ctx.strokeText(text, screen.x + 6, screen.y - 6);
    ctx.fillStyle = color;
    ctx.fillText(text, screen.x + 6, screen.y - 6);
    ctx.restore();
  }

  #worldBounds(width: number, height: number): WorldBounds {
    const view = this.#snapshot.appState.view;
    const unitSize = this.#snapshot.appState.grid.unitSize;
    const topLeft = screenToGeometryWorld({ x: 0, y: 0 }, view, unitSize);
    const bottomRight = screenToGeometryWorld({ x: width, y: height }, view, unitSize);
    return {
      minX: Math.min(topLeft.x, bottomRight.x),
      maxX: Math.max(topLeft.x, bottomRight.x),
      minY: Math.min(topLeft.y, bottomRight.y),
      maxY: Math.max(topLeft.y, bottomRight.y),
    };
  }
}

