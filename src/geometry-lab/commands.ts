import { KleinSdkError } from '../core/index.js';
import type {
  CommandResult,
  JsonObject,
  JsonValue,
  KleinInstrument,
  ValidationResult,
  Vector3,
} from '../core/index.js';
import {
  preflightGeometryLabCommandComplexity,
  resolveGeometryLabComplexityLimits,
} from './complexity.js';
import type {
  GeometryLabComplexityIssue,
  GeometryLabComplexityLimits,
} from './complexity.js';
import { validateGeometryLabCommandStrict } from './schema.js';
import type {
  EquationSurfaceInput3D,
  GeometryLab,
  GeometryLabCommand,
  GeometryLabDeletePayload,
  GeometryLabDelta,
  GeometryLabEquationSurfacePayload,
  GeometryLabSnapshot,
  GeometryLabTool,
} from './types.js';

/** Validates a command's resource use and strict discriminated-union shape. */
export function validateGeometryLabCommandInput(
  value: unknown,
  complexityLimits: Partial<GeometryLabComplexityLimits> = {},
): ValidationResult<GeometryLabCommand> {
  const limits = resolveGeometryLabComplexityLimits(complexityLimits);
  const complexity = preflightGeometryLabCommandComplexity(value, limits);
  if (!complexity.ok) return complexityValidationFailure(complexity.issues);
  const shape = validateGeometryLabCommandStrict(value, limits.maxValidationIssues);
  return shape.ok ? shape : { ok: false, issues: shape.issues.slice(0, limits.maxValidationIssues) };
}

/** Public Geometry Lab command validator; the Input alias remains for internal compatibility. */
export const validateGeometryLabCommand = validateGeometryLabCommandInput;

/** Executes one validated host command against a Geometry Lab instrument. */
export function executeGeometryLabCommand(
  instrument: KleinInstrument<GeometryLabSnapshot, GeometryLabDelta, GeometryLabTool>,
  command: GeometryLabCommand,
  complexityLimits: Partial<GeometryLabComplexityLimits> = {},
): CommandResult {
  const lab = instrument as GeometryLab;
  const validation = validateGeometryLabCommandInput(command, complexityLimits);
  if (!validation.ok) {
    return {
      ok: false,
      error: new KleinSdkError(
        'invalid_command',
        'Geometry Lab command is invalid or unsupported.',
        validation.issues as unknown as JsonValue,
      ),
    };
  }
  command = validation.value;
  try {
    switch (command.type) {
      case 'addPoint3D': {
        const payload = command.payload;
        const id = lab.addPoint3D({
          x: finite(payload.x, 'x'),
          y: finite(payload.y, 'y'),
          z: finite(payload.z, 'z'),
          ...stylePayload(payload),
        });
        return { ok: true, payload: id };
      }
      case 'addSegment3D': {
        const payload = command.payload;
        const id = lab.addSegment3D(payload.firstPointId, payload.secondPointId, stylePayload(payload));
        return { ok: true, payload: id };
      }
      case 'addLine3D': {
        const payload = command.payload;
        const id = lab.addLine3D(payload.firstPointId, payload.secondPointId, stylePayload(payload));
        return { ok: true, payload: id };
      }
      case 'addCube': {
        const payload = command.payload ?? {};
        const id = lab.addPolyhedron(
          'cube',
          vectorPayload(payload.center, { x: 0, y: 0, z: 0 }),
          numberPayload(payload.size, 2),
          stylePayload(payload),
        );
        return { ok: true, payload: id };
      }
      case 'addSphere': {
        const payload = command.payload ?? {};
        const id = lab.addSphere(
          vectorPayload(payload.center, { x: 0, y: 0, z: 0 }),
          numberPayload(payload.radius, 1),
          stylePayload(payload),
        );
        return { ok: true, payload: id };
      }
      case 'addSurfaceZ': {
        const payload = command.payload ?? {};
        const preset = payload.preset === 'saddle' || payload.preset === 'wave' ? payload.preset : 'paraboloid';
        const samples = Math.max(4, Math.min(96, Math.round(numberPayload(payload.samples, 48))));
        const id = lab.addSurfaceZ({
          xRange: rangePayload(payload.xRange, [-3, 3]),
          yRange: rangePayload(payload.yRange, [-3, 3]),
          xSamples: samples,
          ySamples: samples,
          input: preset,
          z: surfacePreset(preset),
        }, stylePayload(payload));
        return { ok: true, payload: id };
      }
      case 'addEquationSurface3D': {
        const payload = command.payload;
        const id = lab.addEquationSurface3D(equationSurfaceInputPayload(payload), stylePayload(payload));
        return { ok: true, payload: id };
      }
      case 'updateEquationSurface3D': {
        const payload = command.payload;
        lab.updateEquationSurface3D(payload.id, equationSurfaceInputPayload(payload), stylePayload(payload));
        return { ok: true, payload: payload.id };
      }
      case 'delete': {
        const ids = deletePayloadIds(command.payload);
        lab.remove(ids);
        return { ok: true, payload: ids };
      }
      case 'setCameraPreset': {
        const payload = command.payload;
        if (typeof payload === 'string') {
          lab.setCameraPreset(payload);
          return { ok: true };
        }
        lab.setCameraPreset(payload.preset, typeof payload.distance === 'number' ? payload.distance : undefined);
        return { ok: true };
      }
      case 'addVolumeMeasurement': {
        const id = lab.addVolumeMeasurement(
          command.payload.solidId,
          typeof command.payload.label === 'string' ? command.payload.label : undefined,
        );
        return { ok: true, payload: id };
      }
      case 'addSurfaceAreaMeasurement': {
        const id = lab.addSurfaceAreaMeasurement(
          command.payload.solidId,
          typeof command.payload.label === 'string' ? command.payload.label : undefined,
        );
        return { ok: true, payload: id };
      }
      default:
        return executeDefaultGeometryLabCommand(lab, command);
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof KleinSdkError
        ? error
        : new KleinSdkError(
          'geometry_lab_command_failed',
          error instanceof Error ? error.message : String(error),
        ),
    };
  }
}

function executeDefaultGeometryLabCommand(
  instrument: GeometryLab,
  command: GeometryLabCommand,
): CommandResult {
  switch (command.type) {
    case 'undo':
      instrument.undo();
      return { ok: true };
    case 'redo':
      instrument.redo();
      return { ok: true };
    case 'setTool':
      if (typeof command.payload !== 'string') {
        throw new KleinSdkError('invalid_command', 'setTool payload must be a tool id string.');
      }
      instrument.setTool(command.payload as GeometryLabTool);
      return { ok: true };
    case 'getSnapshot':
      return { ok: true, payload: instrument.getSnapshot() as unknown as JsonObject };
    default:
      throw new KleinSdkError('unsupported_command', `Unsupported Geometry Lab command "${command.type}".`);
  }
}

function complexityValidationFailure<T>(
  issues: readonly GeometryLabComplexityIssue[],
): ValidationResult<T> {
  return {
    ok: false,
    issues: issues.map(issue => ({ path: issue.path, message: `${issue.code}: ${issue.message}` })),
  };
}

function stylePayload(payload: JsonObject): { label?: string; color?: string } {
  const style: { label?: string; color?: string } = {};
  if (typeof payload.label === 'string') style.label = payload.label;
  if (typeof payload.color === 'string') style.color = payload.color;
  return style;
}

function vectorPayload(value: unknown, fallback: Vector3): Vector3 {
  if (!isRecord(value)) return fallback;
  return {
    x: finiteNumberOr(value.x, fallback.x),
    y: finiteNumberOr(value.y, fallback.y),
    z: finiteNumberOr(value.z, fallback.z),
  };
}

function rangePayload(value: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) return fallback;
  const min = finiteNumberOr(value[0], fallback[0]);
  const max = finiteNumberOr(value[1], fallback[1]);
  return max > min ? [min, max] : fallback;
}

function rangePayloadOrUndefined(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const min = typeof value[0] === 'number' && Number.isFinite(value[0]) ? value[0] : undefined;
  const max = typeof value[1] === 'number' && Number.isFinite(value[1]) ? value[1] : undefined;
  return min !== undefined && max !== undefined && max > min ? [min, max] : undefined;
}

function equationSurfaceInputPayload(payload: GeometryLabEquationSurfacePayload): EquationSurfaceInput3D {
  const input: EquationSurfaceInput3D = { input: payload.input };
  if (payload.dependentAxis !== undefined) input.dependentAxis = payload.dependentAxis;
  const xRange = rangePayloadOrUndefined(payload.xRange);
  const yRange = rangePayloadOrUndefined(payload.yRange);
  const zRange = rangePayloadOrUndefined(payload.zRange);
  if (xRange) input.xRange = xRange;
  if (yRange) input.yRange = yRange;
  if (zRange) input.zRange = zRange;
  if (typeof payload.samples === 'number') input.samples = payload.samples;
  return input;
}

function deletePayloadIds(payload: string | string[] | GeometryLabDeletePayload): string[] {
  if (typeof payload === 'string') return payload ? [payload] : [];
  if (Array.isArray(payload)) {
    return payload.filter((id): id is string => typeof id === 'string' && id.length > 0);
  }
  const ids = Array.isArray(payload.ids)
    ? payload.ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  if (typeof payload.id === 'string' && payload.id.length > 0) ids.push(payload.id);
  if (!ids.length) {
    throw new KleinSdkError('invalid_command', 'delete payload must contain an id or ids.');
  }
  return [...new Set(ids)];
}

function numberPayload(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new KleinSdkError('invalid_number', `Geometry Lab ${label} must be finite.`);
  }
  return value;
}

function finiteNumberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function surfacePreset(preset: 'paraboloid' | 'saddle' | 'wave'): (x: number, y: number) => number {
  if (preset === 'saddle') return (x, y) => (x * x - y * y) / 5;
  if (preset === 'wave') return (x, y) => Math.sin(x) + Math.cos(y);
  return (x, y) => (x * x + y * y) / 6;
}
