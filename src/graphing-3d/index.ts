import type {
  KleinToolRuntime,
  ValidationResult,
} from '../core/index.js';
import {
  applyGeometryLabDelta,
  createEmptyGeometryLabSnapshot,
  createGeometryLab,
  createGeometryLabRuntime,
  parseGeometryLabSnapshotJson,
  validateGeometryLabDelta,
  validateGeometryLabSnapshot,
} from '../geometry-lab/index.js';
import type {
  GeometryLab,
  GeometryLabCameraPayload,
  GeometryLabCommand,
  GeometryLabDelta,
  GeometryLabEquationSurfacePayload,
  GeometryLabMeasurementPayload,
  GeometryLabOptions,
  GeometryLabPointPayload,
  GeometryLabSegmentPayload,
  GeometryLabSnapshot,
  GeometryLabSolidPayload,
  GeometryLabStylePayload,
  GeometryLabSurfacePayload,
  GeometryLabTool,
  GeometryLabVectorPayload,
} from '../geometry-lab/index.js';

/** @deprecated Use GeometryLabTool from `klein-sdk/geometry-lab`. */
export type Graphing3DTool = GeometryLabTool;
/** @deprecated Use GeometryLabDelta from `klein-sdk/geometry-lab`. */
export type Graphing3DDelta = GeometryLabDelta;
/** @deprecated Use GeometryLabOptions from `klein-sdk/geometry-lab`. */
export type Graphing3DOptions = GeometryLabOptions;
/** @deprecated Use GeometryLabSnapshot from `klein-sdk/geometry-lab`. */
export type Graphing3DSnapshot = GeometryLabSnapshot;
/** @deprecated Use GeometryLab from `klein-sdk/geometry-lab`. */
export type Graphing3DCalculator = GeometryLab;

// Preserve the legacy names while deriving their shape from the owning Geometry Lab API.
export interface Graphing3DVectorPayload extends GeometryLabVectorPayload {}
export interface Graphing3DStylePayload extends GeometryLabStylePayload {}
export interface Graphing3DPointPayload extends GeometryLabPointPayload {}
export interface Graphing3DSegmentPayload extends GeometryLabSegmentPayload {}
export interface Graphing3DSolidPayload extends GeometryLabSolidPayload {}
export interface Graphing3DSurfacePayload extends GeometryLabSurfacePayload {}
export interface Graphing3DEquationSurfacePayload extends GeometryLabEquationSurfacePayload {}
export interface Graphing3DCameraPayload extends GeometryLabCameraPayload {}
export interface Graphing3DMeasurementPayload extends GeometryLabMeasurementPayload {}

type Graphing3DCommandType =
  | 'undo'
  | 'redo'
  | 'setTool'
  | 'getSnapshot'
  | 'addPoint3D'
  | 'addSegment3D'
  | 'addCube'
  | 'addSphere'
  | 'addSurfaceZ'
  | 'addEquationSurface3D'
  | 'setCameraPreset'
  | 'addVolumeMeasurement'
  | 'addSurfaceAreaMeasurement';

/** The historical Graphing 3D command subset, now owned and executed by Geometry Lab. */
export type Graphing3DCommand = Extract<GeometryLabCommand, { type: Graphing3DCommandType }>;

export {
  applyGeometryLabDelta as applyGraphing3DDelta,
  parseGeometryLabSnapshotJson as parseGraphing3DSnapshotJson,
  validateGeometryLabSnapshot as validateGraphing3DSnapshot,
};

export function createEmptyGraphing3DSnapshot(): Graphing3DSnapshot {
  const snapshot = createEmptyGeometryLabSnapshot();
  return {
    ...snapshot,
    appState: {
      ...snapshot.appState,
      activeView: '3d',
      activeTool: 'orbit',
    },
  };
}

/** Validates with the same strict schema and resource budgets as Geometry Lab. */
export function validateGraphing3DDelta(value: unknown): ValidationResult<Graphing3DDelta> {
  return validateGeometryLabDelta(value);
}

export function createGraphing3DCalculator(options: Graphing3DOptions = {}): Graphing3DCalculator {
  return createGeometryLab({
    initialView: '3d',
    ...options,
  });
}

/**
 * Adapts the Geometry Lab runtime while retaining the historical runtime key.
 * Command execution, validation, complexity limits, and event behavior all remain Geometry Lab-owned.
 */
export function createGraphing3DRuntime(
  options: Graphing3DOptions = {},
): KleinToolRuntime<Graphing3DSnapshot, Graphing3DDelta, Graphing3DCommand> {
  const runtime = createGeometryLabRuntime({
    initialView: '3d',
    ...options,
  });
  return {
    ...runtime,
    toolKey: 'graphing-3d',
  } as KleinToolRuntime<Graphing3DSnapshot, Graphing3DDelta, Graphing3DCommand>;
}
