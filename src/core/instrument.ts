import type {
  ApplyDeltaOptions,
  ExportOptions,
  ExportResult,
  InstrumentOptions,
  JsonValue,
  KleinInstrument,
  LoadOptions,
} from './types.js';
import { KleinSdkError } from './types.js';
import { createIdFactory } from './ids.js';

/** Configuration for placeholder instruments used while each real engine is built out. */
export interface StubInstrumentConfig<TSnapshot, TDelta, TTool extends string> {
  kind: string;
  initialSnapshot: TSnapshot;
  defaultTool: TTool;
  options?: InstrumentOptions<TSnapshot, TDelta>;
}

/**
 * Creates a minimal instrument that can mount, load snapshots, return snapshots, and export JSON.
 * Delta application, undo/redo, and non-JSON exports intentionally throw until the real tool exists.
 */
export function createStubInstrument<TSnapshot, TDelta, TTool extends string>(
  config: StubInstrumentConfig<TSnapshot, TDelta, TTool>,
): KleinInstrument<TSnapshot, TDelta, TTool> {
  const ids = createIdFactory();
  let snapshot = config.options?.initialSnapshot ?? config.initialSnapshot;
  let container: HTMLElement | undefined = config.options?.container;
  let activeTool = config.defaultTool;

  return {
    id: ids.next(config.kind),
    kind: config.kind,
    mount(nextContainer) {
      container = nextContainer;
      container.dataset.kleinInstrument = config.kind;
    },
    destroy() {
      if (container?.dataset.kleinInstrument === config.kind) {
        delete container.dataset.kleinInstrument;
      }
      container = undefined;
    },
    getSnapshot() {
      return snapshot;
    },
    loadSnapshot(nextSnapshot: TSnapshot, _options?: LoadOptions) {
      snapshot = nextSnapshot;
    },
    applyDelta(_delta: TDelta, _options?: ApplyDeltaOptions) {
      throw new KleinSdkError(
        'not_implemented',
        `${config.kind} delta application is not implemented yet.`,
      );
    },
    setTool(tool: TTool) {
      activeTool = tool;
      void activeTool;
    },
    undo() {
      throw new KleinSdkError('not_implemented', `${config.kind} undo is not implemented yet.`);
    },
    redo() {
      throw new KleinSdkError('not_implemented', `${config.kind} redo is not implemented yet.`);
    },
    async export(options: ExportOptions): Promise<ExportResult> {
      if (options.format === 'json') {
        return {
          format: 'json',
          mimeType: 'application/json',
          data: snapshot as unknown as JsonValue,
        };
      }

      throw new KleinSdkError(
        'not_implemented',
        `${config.kind} ${options.format} export is not implemented yet.`,
      );
    },
  };
}
