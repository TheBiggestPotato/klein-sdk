import type {
  ApplyDeltaOptions,
  ApplyResult,
  CommandResult,
  DeltaMeta,
  ExportOptions,
  ExportResult,
  InstrumentOptions,
  JsonValue,
  KleinInstrument,
  KleinToolKey,
  KleinToolRuntime,
  LoadOptions,
  ToolCommand,
  ToolEventListener,
  ValidationResult,
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

/** Configuration for adapting an existing KleinInstrument into the shared v0 runtime contract. */
export interface InstrumentRuntimeConfig<TSnapshot, TDelta, TCommand, TTool extends string = string> {
  toolKey: KleinToolKey;
  instrument: KleinInstrument<TSnapshot, TDelta, TTool>;
  validateSnapshot?: (snapshot: unknown) => ValidationResult<TSnapshot>;
  validateDelta?: (delta: unknown) => ValidationResult<TDelta>;
  execute?: (
    instrument: KleinInstrument<TSnapshot, TDelta, TTool>,
    command: TCommand,
  ) => CommandResult;
}

type RuntimeToolEvent<TSnapshot, TDelta, TCommand> = Parameters<
  ToolEventListener<TSnapshot, TDelta, TCommand>
>[0];

/** Wraps any current SDK instrument with the shared tool runtime API used by classroom/exam/collab. */
export function createInstrumentRuntime<
  TSnapshot,
  TDelta,
  TCommand extends ToolCommand = ToolCommand,
  TTool extends string = string,
>(
  config: InstrumentRuntimeConfig<TSnapshot, TDelta, TCommand, TTool>,
): KleinToolRuntime<TSnapshot, TDelta, TCommand> {
  const listeners = new Set<ToolEventListener<TSnapshot, TDelta, TCommand>>();

  const emit = (event: RuntimeToolEvent<TSnapshot, TDelta, TCommand>): void => {
    for (const listener of listeners) {
      try {
        listener(cloneToolEvent(event));
      } catch {
        // Subscriber failures are isolated so one observer cannot interrupt the runtime or its peers.
      }
    }
  };

  const validateSnapshot = config.validateSnapshot ?? passValidation<TSnapshot>;
  const validateDelta = config.validateDelta ?? passValidation<TDelta>;

  return {
    toolKey: config.toolKey,
    getSnapshot() {
      return config.instrument.getSnapshot();
    },
    loadSnapshot(snapshot: TSnapshot) {
      try {
        const validation = validateSnapshot(snapshot);
        if (!validation.ok) {
          throw validationError(
            'invalid_snapshot',
            'Snapshot validation failed.',
            validation.issues,
          );
        }
        config.instrument.loadSnapshot(validation.value, { source: 'remote' });
        emit({ type: 'snapshot-loaded', snapshot: validation.value });
      } catch (error) {
        const sdkError = toSdkError(error, 'snapshot_load_failed');
        emit({ type: 'error', error: sdkError });
        throw sdkError;
      }
    },
    applyDelta(delta: TDelta, meta) {
      try {
        const validation = validateDelta(delta);
        if (!validation.ok) {
          throw validationError('invalid_delta', 'Delta validation failed.', validation.issues);
        }
        const applyOptions: ApplyDeltaOptions = { emit: (meta?.source ?? 'local') === 'local' };
        if (meta) applyOptions.meta = meta;
        const applied = config.instrument.applyDelta(validation.value, applyOptions);
        const result: ApplyResult = {
          ok: true,
          changed: typeof applied === 'boolean' ? applied : true,
        };
        emitDeltaApplied(emit, validation.value, result, meta);
        return result;
      } catch (error) {
        const result: ApplyResult = { ok: false, error: toSdkError(error, 'delta_apply_failed') };
        emitDeltaApplied(emit, delta, result, meta);
        return result;
      }
    },
    execute(command: TCommand) {
      let result: CommandResult;
      try {
        result = config.execute
          ? config.execute(config.instrument, command)
          : executeDefaultCommand(config.instrument, command);
      } catch (error) {
        result = { ok: false, error: toSdkError(error, 'command_failed') };
      }
      emit({ type: 'command-executed', command, result });
      return result;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    validateSnapshot,
    validateDelta,
  };
}

function emitDeltaApplied<TSnapshot, TDelta, TCommand>(
  emit: (event: RuntimeToolEvent<TSnapshot, TDelta, TCommand>) => void,
  delta: TDelta,
  result: ApplyResult,
  meta: DeltaMeta | undefined,
): void {
  const event: RuntimeToolEvent<TSnapshot, TDelta, TCommand> = {
    type: 'delta-applied',
    delta,
    result,
  };
  if (meta !== undefined) event.meta = meta;
  emit(event);
}

function cloneToolEvent<TSnapshot, TDelta, TCommand>(
  event: RuntimeToolEvent<TSnapshot, TDelta, TCommand>,
): RuntimeToolEvent<TSnapshot, TDelta, TCommand> {
  if (event.type === 'error') {
    return {
      ...event,
      error: cloneSdkError(event.error),
      ...(event.meta === undefined ? {} : { meta: cloneSafely(event.meta) }),
    };
  }
  if (event.type === 'delta-applied' && !event.result.ok) {
    return {
      ...event,
      delta: cloneSafely(event.delta),
      result: { ok: false, error: cloneSdkError(event.result.error) },
      ...(event.meta === undefined ? {} : { meta: cloneSafely(event.meta) }),
    };
  }
  if (event.type === 'command-executed' && !event.result.ok) {
    return {
      ...event,
      command: cloneSafely(event.command),
      result: { ok: false, error: cloneSdkError(event.result.error) },
      ...(event.meta === undefined ? {} : { meta: cloneSafely(event.meta) }),
    };
  }
  return cloneSafely(event);
}

function cloneSdkError(error: KleinSdkError): KleinSdkError {
  if (error.details === undefined) return new KleinSdkError(error.code, error.message);
  return new KleinSdkError(error.code, error.message, cloneSafely(error.details));
}

function cloneSafely<TValue>(value: TValue): TValue {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

function validationError(
  code: string,
  message: string,
  issues: readonly { path: string; message: string }[],
): KleinSdkError {
  return new KleinSdkError(
    code,
    message,
    issues.map(issue => ({ path: issue.path, message: issue.message })),
  );
}

function executeDefaultCommand<TSnapshot, TDelta, TCommand extends ToolCommand, TTool extends string>(
  instrument: KleinInstrument<TSnapshot, TDelta, TTool>,
  command: TCommand,
): CommandResult {
  try {
    switch (command.type) {
      case 'undo':
        instrument.undo();
        return { ok: true };
      case 'redo':
        instrument.redo();
        return { ok: true };
      case 'setTool': {
        const tool = command.payload;
        if (typeof tool !== 'string') {
          throw new KleinSdkError('invalid_command', 'setTool command payload must be a tool id string.');
        }
        instrument.setTool(tool as TTool);
        return { ok: true };
      }
      case 'getSnapshot':
        return { ok: true, payload: instrument.getSnapshot() as JsonValue };
      default:
        throw new KleinSdkError('unsupported_command', `Unsupported command "${command.type}".`, {
          commandType: command.type,
        });
    }
  } catch (error) {
    return { ok: false, error: toSdkError(error, 'command_failed') };
  }
}

function passValidation<TValue>(value: unknown): ValidationResult<TValue> {
  return { ok: true, value: value as TValue };
}

function toSdkError(error: unknown, fallbackCode: string): KleinSdkError {
  if (error instanceof KleinSdkError) return error;
  if (error instanceof Error) return new KleinSdkError(fallbackCode, error.message);
  return new KleinSdkError(fallbackCode, 'SDK runtime operation failed.', String(error));
}
