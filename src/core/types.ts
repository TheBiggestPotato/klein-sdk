/** Primitive values that can safely round-trip through JSON persistence. */
export type JsonPrimitive = string | number | boolean | null;

/** JSON-compatible value used for snapshots, deltas, metadata, and host messages. */
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

/** JSON object with readonly keys so public APIs treat persisted data as immutable. */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** Basic 2D coordinate in world or screen space, depending on the caller. */
export interface Vector2 {
  x: number;
  y: number;
}

/** Basic 3D coordinate in the SDK's z-up world space. */
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/** Pan and zoom state for any 2D scene surface. */
export interface View2D {
  x: number;
  y: number;
  zoom: number;
}

/** Serializable camera state for movable 3D scenes. Camera state is app state, not geometry content. */
export interface Camera3DState {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  fov: number;
  zoom: number;
  projection: 'perspective' | 'orthographic';
}

/** Base persisted document shape shared by every SDK instrument. */
export interface InstrumentSnapshot<TScene = JsonObject, TAppState = JsonObject> {
  version: number;
  instrument: string;
  scene: TScene;
  appState?: TAppState;
  metadata?: {
    title?: string;
    locale?: string;
    createdAt?: number;
    updatedAt?: number;
  };
}

/** Metadata attached to a local, remote, history, or import delta. */
export interface DeltaMeta {
  id: string;
  actorId?: string;
  createdAt: number;
  source: 'local' | 'remote' | 'history' | 'import';
}

/** Options for replacing an instrument's full snapshot. */
export interface LoadOptions {
  source?: DeltaMeta['source'];
  preserveView?: boolean;
}

/** Options for applying a delta, including whether it should echo through callbacks. */
export interface ApplyDeltaOptions {
  emit?: boolean;
  meta?: Partial<DeltaMeta>;
}

/** Export formats supported by the common instrument contract. */
export type ExportFormat = 'json' | 'svg' | 'png' | 'csv' | 'latex' | 'text';

/** Request object for instrument exports. Format-specific options can be added later. */
export interface ExportOptions {
  format: ExportFormat;
  fileName?: string;
  includeAppState?: boolean;
}

/** Discriminated result returned by instrument export operations. */
export type ExportResult =
  | { format: 'json'; mimeType: 'application/json'; data: JsonValue }
  | { format: 'svg'; mimeType: 'image/svg+xml'; data: string }
  | { format: 'png'; mimeType: 'image/png'; data: Blob }
  | { format: 'csv'; mimeType: 'text/csv'; data: string }
  | { format: 'latex'; mimeType: 'application/x-latex'; data: string }
  | { format: 'text'; mimeType: 'text/plain'; data: string };

/** Common constructor options accepted by framework-independent instrument factories. */
export interface InstrumentOptions<TSnapshot, TDelta> {
  container?: HTMLElement;
  initialSnapshot?: TSnapshot;
  readOnly?: boolean;
  locale?: string;
  labels?: Record<string, string>;
  onDelta?: (delta: TDelta, meta: DeltaMeta) => void;
  onError?: (error: KleinSdkError) => void;
}

/** Runtime lifecycle implemented by every SDK instrument. */
export interface KleinInstrument<TSnapshot, TDelta, TTool extends string = string> {
  readonly id: string;
  readonly kind: string;
  mount(container: HTMLElement): void;
  destroy(): void;
  getSnapshot(): TSnapshot;
  loadSnapshot(snapshot: TSnapshot, options?: LoadOptions): void;
  applyDelta(delta: TDelta, options?: ApplyDeltaOptions): void;
  setTool(tool: TTool): void;
  undo(): void;
  redo(): void;
  export(options: ExportOptions): Promise<ExportResult>;
}

/** Successful runtime validation result. */
export interface ValidationSuccess<T> {
  ok: true;
  value: T;
}

/** Failed runtime validation result with one or more path-specific issues. */
export interface ValidationFailure {
  ok: false;
  issues: ValidationIssue[];
}

/** Common validation result shape used by snapshot and delta guards. */
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/** One validation problem, usually produced while checking imported JSON. */
export interface ValidationIssue {
  path: string;
  message: string;
}

/** SDK-specific error class with stable machine-readable codes. */
export class KleinSdkError extends Error {
  readonly code: string;
  readonly details: JsonValue | undefined;

  constructor(code: string, message: string, details?: JsonValue) {
    super(message);
    this.name = 'KleinSdkError';
    this.code = code;
    this.details = details;
  }
}

/** Pointer event shape normalized before tool controllers see it. */
export interface NormalizedPointerEvent {
  pointerId: number;
  pointerType: 'mouse' | 'pen' | 'touch';
  client: Vector2;
  buttons: number;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/** Keyboard event shape normalized before tool controllers see it. */
export interface NormalizedKeyEvent {
  key: string;
  code: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/** Limited controller-facing API for reading state, dispatching deltas, and showing previews. */
export interface ToolContext<TState, TDelta> {
  getState(): TState;
  dispatch(delta: TDelta, options?: ApplyDeltaOptions): void;
  setPreview(preview: unknown): void;
  clearPreview(): void;
  setStatus(message: string): void;
}

/** Framework-independent interaction controller for one instrument tool. */
export interface ToolController<TState, TDelta, TTool extends string = string> {
  id: TTool;
  labelKey: string;
  cursor: string;
  acceptsHitTarget: boolean;
  onPointerDown(ctx: ToolContext<TState, TDelta>, event: NormalizedPointerEvent): void;
  onPointerMove(ctx: ToolContext<TState, TDelta>, event: NormalizedPointerEvent): void;
  onPointerUp(ctx: ToolContext<TState, TDelta>, event: NormalizedPointerEvent): void;
  onKeyDown?(ctx: ToolContext<TState, TDelta>, event: NormalizedKeyEvent): void;
  onCancel?(ctx: ToolContext<TState, TDelta>): void;
}
