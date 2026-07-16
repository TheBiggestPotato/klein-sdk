import type { Vector3 } from '../core/index.js';
import type { EquationAxis3D } from './types.js';
import {
  GEOMETRY_LAB_MAX_SURFACE_PROBE_EVALUATIONS,
  GEOMETRY_LAB_MAX_SURFACE_GRID_SAMPLES,
  GEOMETRY_LAB_MAX_SURFACE_SAMPLES_PER_AXIS,
  GEOMETRY_LAB_SURFACE_CONTINUITY_SUBDIVISIONS,
} from './complexity.js';

/** One independent axis of a rectangular surface-sampling grid. */
export interface SurfaceSamplingAxis3D {
  axis: EquationAxis3D;
  range: readonly [number, number];
  samples: number;
}

/**
 * Dimensionless convergence thresholds for the dyadic continuity probes.
 * Larger ratios are more tolerant and therefore reject fewer cells.
 */
export interface SurfaceDiscontinuityPolicy3D {
  /** Largest fine-level jump allowed as a fraction of the sampled line amplitude. */
  maxAdjacentJumpRatio: number;
  /** Largest fine/coarse difference ratio allowed before a feature is considered persistent. */
  maxDifferencePersistenceRatio: number;
  /** Multiplier applied to machine epsilon when ignoring line-local roundoff noise. */
  roundoffToleranceFactor: number;
}

export const DEFAULT_SURFACE_DISCONTINUITY_POLICY_3D: Readonly<SurfaceDiscontinuityPolicy3D> = Object.freeze({
  maxAdjacentJumpRatio: 0.5,
  maxDifferencePersistenceRatio: 0.75,
  roundoffToleranceFactor: 128,
});

// Five dyadic levels leave 32 sub-intervals inside each persisted grid cell.
// That is deep enough for the local increments of the supported smooth test
// surfaces to decay, while remaining bounded and deterministic.
const CONTINUITY_SUBDIVISIONS = GEOMETRY_LAB_SURFACE_CONTINUITY_SUBDIVISIONS;

export interface RectangularSurfaceSamplingInput3D {
  /** The first axis changes fastest in the row-major grid. */
  first: SurfaceSamplingAxis3D;
  second: SurfaceSamplingAxis3D;
  dependentAxis: EquationAxis3D;
  /**
   * Receives a fresh x/y/z record for every evaluation. A thrown error or a
   * non-finite return value invalidates only that sample or probe.
   */
  evaluate: (variables: Record<EquationAxis3D, number>) => number;
  discontinuityPolicy?: Partial<SurfaceDiscontinuityPolicy3D>;
}

export type SurfaceGridSampleValidity3D = 'finite' | 'non-finite' | 'evaluation-error';

/** Row-major provenance for the compact finite-only vertex array. */
export interface SurfaceSamplingGrid3D {
  columns: number;
  rows: number;
  /** Compact vertex index for each requested grid sample, or null when invalid. */
  vertexIndices: Array<number | null>;
  /** Convenience validity mask parallel to vertexIndices. */
  valid: boolean[];
  /** Distinguishes non-finite evaluator results from evaluator exceptions. */
  validity: SurfaceGridSampleValidity3D[];
  /** Finite dependent values, or null for invalid samples. */
  dependentValues: Array<number | null>;
}

export type SurfaceQuadFace3D = [number, number, number, number];

export interface SurfaceSamplingDiagnostics3D {
  requestedSampleCount: number;
  finiteSampleCount: number;
  nonFiniteSampleCount: number;
  evaluationErrorSampleCount: number;
  probeSampleCount: number;
  invalidProbeCount: number;
  acceptedCellCount: number;
  rejectedInvalidCornerCellCount: number;
  rejectedInvalidProbeCellCount: number;
  rejectedDiscontinuityCellCount: number;
}

export interface SampledRectangularSurface3D {
  /** Contains only vertices whose three coordinates are finite. */
  vertices: Vector3[];
  /** Quad indices always refer to vertices and never cross a rejected cell. */
  faces: SurfaceQuadFace3D[];
  grid: SurfaceSamplingGrid3D;
  diagnostics: SurfaceSamplingDiagnostics3D;
}

interface EvaluatedDependentValue {
  validity: SurfaceGridSampleValidity3D;
  value: number | null;
}

type SurfaceProbeCoordinate3D = readonly [firstFineIndex: number, secondFineIndex: number];

interface SurfaceProbeLine3D {
  start: SurfaceProbeCoordinate3D;
  end: SurfaceProbeCoordinate3D;
}

type SurfaceProbeLineResult = 'continuous' | 'invalid' | 'discontinuous';

interface SurfaceLineDifferenceMetrics {
  maximumFirstDifference: number;
  maximumSecondDifference: number;
}

interface ResolvedSamplingInput {
  first: SurfaceSamplingAxis3D;
  second: SurfaceSamplingAxis3D;
  dependentAxis: EquationAxis3D;
  evaluate: RectangularSurfaceSamplingInput3D['evaluate'];
  policy: SurfaceDiscontinuityPolicy3D;
}

/** Returns the row-major offset for a requested grid coordinate. */
export function surfaceGridIndex3D(firstIndex: number, secondIndex: number, firstSamples: number): number {
  return secondIndex * firstSamples + firstIndex;
}

/**
 * Samples an explicit rectangular surface without letting an isolated pole or
 * domain error abort the whole mesh.
 *
 * Dyadic probes along each cell boundary and both centerlines compare how first
 * and second differences decay under refinement. This gives poles between grid
 * samples and finite jumps the same bounded rejection policy while retaining
 * steep smooth surfaces. The sampler does not attempt symbolic discontinuity
 * analysis; features narrower than the probe spacing or avoiding every probe
 * line may still require a denser grid or caller-side domain splitting.
 */
export function sampleRectangularSurface3D(input: RectangularSurfaceSamplingInput3D): SampledRectangularSurface3D {
  const resolved = resolveInput(input);
  const { first, second, dependentAxis, evaluate, policy } = resolved;
  const requestedSampleCount = first.samples * second.samples;
  const probeGridCapacity = ((first.samples - 1) * CONTINUITY_SUBDIVISIONS + 1)
    * ((second.samples - 1) * CONTINUITY_SUBDIVISIONS + 1);
  if (!Number.isSafeInteger(requestedSampleCount) || !Number.isSafeInteger(probeGridCapacity)) {
    throw new RangeError('Surface sample grid is too large.');
  }
  if (
    first.samples > GEOMETRY_LAB_MAX_SURFACE_SAMPLES_PER_AXIS
    || second.samples > GEOMETRY_LAB_MAX_SURFACE_SAMPLES_PER_AXIS
  ) {
    throw new RangeError(
      `Surface sample axes cannot exceed ${GEOMETRY_LAB_MAX_SURFACE_SAMPLES_PER_AXIS} samples.`,
    );
  }
  if (requestedSampleCount > GEOMETRY_LAB_MAX_SURFACE_GRID_SAMPLES) {
    throw new RangeError(
      `Surface sample grid cannot exceed ${GEOMETRY_LAB_MAX_SURFACE_GRID_SAMPLES} requested samples.`,
    );
  }

  const vertices: Vector3[] = [];
  const vertexIndices: Array<number | null> = [];
  const valid: boolean[] = [];
  const validity: SurfaceGridSampleValidity3D[] = [];
  const dependentValues: Array<number | null> = [];
  let nonFiniteSampleCount = 0;
  let evaluationErrorSampleCount = 0;

  for (let secondIndex = 0; secondIndex < second.samples; secondIndex += 1) {
    const secondValue = valueAtGridIndex(second.range, second.samples, secondIndex);
    for (let firstIndex = 0; firstIndex < first.samples; firstIndex += 1) {
      const firstValue = valueAtGridIndex(first.range, first.samples, firstIndex);
      const evaluated = evaluateDependentValue(
        evaluate,
        first.axis,
        firstValue,
        second.axis,
        secondValue,
      );
      validity.push(evaluated.validity);
      dependentValues.push(evaluated.value);

      if (evaluated.value === null) {
        vertexIndices.push(null);
        valid.push(false);
        if (evaluated.validity === 'evaluation-error') evaluationErrorSampleCount += 1;
        else nonFiniteSampleCount += 1;
        continue;
      }

      vertexIndices.push(vertices.length);
      valid.push(true);
      vertices.push(vectorFromAxes(
        first.axis,
        firstValue,
        second.axis,
        secondValue,
        dependentAxis,
        evaluated.value,
      ));
    }
  }

  const numericalTolerance = samplingNumericalTolerance(
    first,
    second,
    dependentValues,
    policy.roundoffToleranceFactor,
  );
  const probeCache = new Map<number, EvaluatedDependentValue>();
  const probeWidth = (first.samples - 1) * CONTINUITY_SUBDIVISIONS + 1;
  let probeSampleCount = 0;
  let invalidProbeCount = 0;
  const probeAt = (firstFineIndex: number, secondFineIndex: number): EvaluatedDependentValue => {
    if (firstFineIndex % CONTINUITY_SUBDIVISIONS === 0 && secondFineIndex % CONTINUITY_SUBDIVISIONS === 0) {
      const firstIndex = firstFineIndex / CONTINUITY_SUBDIVISIONS;
      const secondIndex = secondFineIndex / CONTINUITY_SUBDIVISIONS;
      const offset = surfaceGridIndex3D(firstIndex, secondIndex, first.samples);
      const sampleValidity = validity[offset];
      if (sampleValidity !== undefined) {
        return { validity: sampleValidity, value: dependentValues[offset] ?? null };
      }
    }

    const key = secondFineIndex * probeWidth + firstFineIndex;
    const cached = probeCache.get(key);
    if (cached !== undefined) return cached;

    if (probeSampleCount >= GEOMETRY_LAB_MAX_SURFACE_PROBE_EVALUATIONS) {
      throw new RangeError(
        `Surface continuity probing exceeds the hard limit of ${GEOMETRY_LAB_MAX_SURFACE_PROBE_EVALUATIONS} evaluations.`,
      );
    }

    const firstValue = interpolateRange(
      first.range,
      firstFineIndex / (CONTINUITY_SUBDIVISIONS * (first.samples - 1)),
    );
    const secondValue = interpolateRange(
      second.range,
      secondFineIndex / (CONTINUITY_SUBDIVISIONS * (second.samples - 1)),
    );
    const evaluated = evaluateDependentValue(evaluate, first.axis, firstValue, second.axis, secondValue);
    probeCache.set(key, evaluated);
    probeSampleCount += 1;
    if (evaluated.value === null) invalidProbeCount += 1;
    return evaluated;
  };

  const faces: SurfaceQuadFace3D[] = [];
  let rejectedInvalidCornerCellCount = 0;
  let rejectedInvalidProbeCellCount = 0;
  let rejectedDiscontinuityCellCount = 0;

  for (let secondIndex = 0; secondIndex < second.samples - 1; secondIndex += 1) {
    for (let firstIndex = 0; firstIndex < first.samples - 1; firstIndex += 1) {
      const aOffset = surfaceGridIndex3D(firstIndex, secondIndex, first.samples);
      const bOffset = surfaceGridIndex3D(firstIndex + 1, secondIndex, first.samples);
      const cOffset = surfaceGridIndex3D(firstIndex + 1, secondIndex + 1, first.samples);
      const dOffset = surfaceGridIndex3D(firstIndex, secondIndex + 1, first.samples);
      const aIndex = vertexIndices[aOffset];
      const bIndex = vertexIndices[bOffset];
      const cIndex = vertexIndices[cOffset];
      const dIndex = vertexIndices[dOffset];

      if (
        typeof aIndex !== 'number'
        || typeof bIndex !== 'number'
        || typeof cIndex !== 'number'
        || typeof dIndex !== 'number'
      ) {
        rejectedInvalidCornerCellCount += 1;
        continue;
      }

      const firstFineIndex = firstIndex * CONTINUITY_SUBDIVISIONS;
      const secondFineIndex = secondIndex * CONTINUITY_SUBDIVISIONS;
      const nextFirstFineIndex = firstFineIndex + CONTINUITY_SUBDIVISIONS;
      const nextSecondFineIndex = secondFineIndex + CONTINUITY_SUBDIVISIONS;
      const middleFirstFineIndex = firstFineIndex + CONTINUITY_SUBDIVISIONS / 2;
      const middleSecondFineIndex = secondFineIndex + CONTINUITY_SUBDIVISIONS / 2;
      const lines: SurfaceProbeLine3D[] = [
        { start: [firstFineIndex, secondFineIndex], end: [nextFirstFineIndex, secondFineIndex] },
        { start: [nextFirstFineIndex, secondFineIndex], end: [nextFirstFineIndex, nextSecondFineIndex] },
        { start: [firstFineIndex, nextSecondFineIndex], end: [nextFirstFineIndex, nextSecondFineIndex] },
        { start: [firstFineIndex, secondFineIndex], end: [firstFineIndex, nextSecondFineIndex] },
        { start: [firstFineIndex, middleSecondFineIndex], end: [nextFirstFineIndex, middleSecondFineIndex] },
        { start: [middleFirstFineIndex, secondFineIndex], end: [middleFirstFineIndex, nextSecondFineIndex] },
      ];
      let lineResult: SurfaceProbeLineResult = 'continuous';
      for (const line of lines) {
        lineResult = classifySurfaceProbeLine(line, probeAt, numericalTolerance, policy);
        if (lineResult !== 'continuous') break;
      }
      if (lineResult === 'invalid') {
        rejectedInvalidProbeCellCount += 1;
        continue;
      }
      if (lineResult === 'discontinuous') {
        rejectedDiscontinuityCellCount += 1;
        continue;
      }

      faces.push([aIndex, bIndex, cIndex, dIndex]);
    }
  }

  return {
    vertices,
    faces,
    grid: {
      columns: first.samples,
      rows: second.samples,
      vertexIndices,
      valid,
      validity,
      dependentValues,
    },
    diagnostics: {
      requestedSampleCount,
      finiteSampleCount: vertices.length,
      nonFiniteSampleCount,
      evaluationErrorSampleCount,
      probeSampleCount,
      invalidProbeCount,
      acceptedCellCount: faces.length,
      rejectedInvalidCornerCellCount,
      rejectedInvalidProbeCellCount,
      rejectedDiscontinuityCellCount,
    },
  };
}

function resolveInput(input: RectangularSurfaceSamplingInput3D): ResolvedSamplingInput {
  assertSamplingAxis(input.first, 'first');
  assertSamplingAxis(input.second, 'second');
  if (!isEquationAxis3D(input.dependentAxis)) {
    throw new RangeError('Surface dependent axis must be x, y, or z.');
  }
  if (new Set<EquationAxis3D>([input.first.axis, input.second.axis, input.dependentAxis]).size !== 3) {
    throw new RangeError('Surface sampling axes must be three distinct coordinate axes.');
  }
  if (typeof input.evaluate !== 'function') throw new TypeError('Surface evaluator must be a function.');

  return {
    first: input.first,
    second: input.second,
    dependentAxis: input.dependentAxis,
    evaluate: input.evaluate,
    policy: resolvePolicy(input.discontinuityPolicy),
  };
}

function assertSamplingAxis(axis: SurfaceSamplingAxis3D, label: string): void {
  if (!isEquationAxis3D(axis.axis)) {
    throw new RangeError(`Surface ${label} axis must be x, y, or z.`);
  }
  const [minimum, maximum] = axis.range;
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) {
    throw new RangeError(`Surface ${label} axis range must contain two increasing finite numbers.`);
  }
  if (!Number.isFinite(maximum - minimum)) {
    throw new RangeError(`Surface ${label} axis range span must be finite.`);
  }
  if (!Number.isSafeInteger(axis.samples) || axis.samples < 2) {
    throw new RangeError(`Surface ${label} axis sample count must be a safe integer of at least 2.`);
  }
}

function isEquationAxis3D(value: unknown): value is EquationAxis3D {
  return value === 'x' || value === 'y' || value === 'z';
}

function resolvePolicy(overrides: Partial<SurfaceDiscontinuityPolicy3D> | undefined): SurfaceDiscontinuityPolicy3D {
  const policy: SurfaceDiscontinuityPolicy3D = {
    maxAdjacentJumpRatio: overrides?.maxAdjacentJumpRatio
      ?? DEFAULT_SURFACE_DISCONTINUITY_POLICY_3D.maxAdjacentJumpRatio,
    maxDifferencePersistenceRatio: overrides?.maxDifferencePersistenceRatio
      ?? DEFAULT_SURFACE_DISCONTINUITY_POLICY_3D.maxDifferencePersistenceRatio,
    roundoffToleranceFactor: overrides?.roundoffToleranceFactor
      ?? DEFAULT_SURFACE_DISCONTINUITY_POLICY_3D.roundoffToleranceFactor,
  };
  if (
    !Number.isFinite(policy.maxAdjacentJumpRatio)
    || policy.maxAdjacentJumpRatio <= 0
    || policy.maxAdjacentJumpRatio > 1
  ) {
    throw new RangeError('Surface discontinuity policy maxAdjacentJumpRatio must be in (0, 1].');
  }
  if (
    !Number.isFinite(policy.maxDifferencePersistenceRatio)
    || policy.maxDifferencePersistenceRatio <= 0
    || policy.maxDifferencePersistenceRatio > 1
  ) {
    throw new RangeError('Surface discontinuity policy maxDifferencePersistenceRatio must be in (0, 1].');
  }
  if (!Number.isFinite(policy.roundoffToleranceFactor) || policy.roundoffToleranceFactor <= 0) {
    throw new RangeError('Surface discontinuity policy roundoffToleranceFactor must be positive and finite.');
  }
  return policy;
}

function evaluateDependentValue(
  evaluate: RectangularSurfaceSamplingInput3D['evaluate'],
  firstAxis: EquationAxis3D,
  firstValue: number,
  secondAxis: EquationAxis3D,
  secondValue: number,
): EvaluatedDependentValue {
  const variables: Record<EquationAxis3D, number> = { x: 0, y: 0, z: 0 };
  variables[firstAxis] = firstValue;
  variables[secondAxis] = secondValue;
  let value: number;
  try {
    value = evaluate(variables);
  } catch {
    return { validity: 'evaluation-error', value: null };
  }
  return typeof value === 'number' && Number.isFinite(value)
    ? { validity: 'finite', value }
    : { validity: 'non-finite', value: null };
}

function vectorFromAxes(
  firstAxis: EquationAxis3D,
  firstValue: number,
  secondAxis: EquationAxis3D,
  secondValue: number,
  dependentAxis: EquationAxis3D,
  dependentValue: number,
): Vector3 {
  const vector: Vector3 = { x: 0, y: 0, z: 0 };
  vector[firstAxis] = firstValue;
  vector[secondAxis] = secondValue;
  vector[dependentAxis] = dependentValue;
  return vector;
}

function valueAtGridIndex(range: readonly [number, number], samples: number, index: number): number {
  if (index === 0) return range[0];
  if (index === samples - 1) return range[1];
  return interpolateRange(range, index / (samples - 1));
}

function interpolateRange(range: readonly [number, number], ratio: number): number {
  return range[0] * (1 - ratio) + range[1] * ratio;
}

function samplingNumericalTolerance(
  first: SurfaceSamplingAxis3D,
  second: SurfaceSamplingAxis3D,
  values: Array<number | null>,
  roundoffToleranceFactor: number,
): number {
  const finiteMagnitudes = values
    .filter((value): value is number => typeof value === 'number')
    .map(value => Math.abs(value))
    .sort((a, b) => a - b);
  const medianMagnitude = finiteMagnitudes.length > 0
    ? finiteMagnitudes[Math.floor((finiteMagnitudes.length - 1) / 2)] ?? 0
    : 0;
  const coordinateScale = Math.max(
    1,
    Math.abs(first.range[0]),
    Math.abs(first.range[1]),
    Math.abs(second.range[0]),
    Math.abs(second.range[1]),
    medianMagnitude,
  );
  return coordinateScale * Number.EPSILON * roundoffToleranceFactor;
}

function classifySurfaceProbeLine(
  line: SurfaceProbeLine3D,
  probeAt: (firstFineIndex: number, secondFineIndex: number) => EvaluatedDependentValue,
  numericalTolerance: number,
  policy: SurfaceDiscontinuityPolicy3D,
): SurfaceProbeLineResult {
  const values: number[] = [];
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (let index = 0; index <= CONTINUITY_SUBDIVISIONS; index += 1) {
    const ratio = index / CONTINUITY_SUBDIVISIONS;
    const firstFineIndex = line.start[0] + (line.end[0] - line.start[0]) * ratio;
    const secondFineIndex = line.start[1] + (line.end[1] - line.start[1]) * ratio;
    const evaluated = probeAt(firstFineIndex, secondFineIndex);
    if (evaluated.value === null) return 'invalid';
    values.push(evaluated.value);
    minimum = Math.min(minimum, evaluated.value);
    maximum = Math.max(maximum, evaluated.value);
  }

  const amplitude = maximum - minimum;
  if (!Number.isFinite(amplitude)) return 'discontinuous';
  const lineTolerance = Math.max(
    numericalTolerance,
    Math.max(1, Math.abs(minimum), Math.abs(maximum))
      * Number.EPSILON
      * policy.roundoffToleranceFactor,
  );
  if (amplitude <= lineTolerance) return 'continuous';

  // A differentiable curve's largest first difference approaches half its
  // previous value under dyadic refinement, and its second difference decays
  // faster. A finite jump persists at the same size; a pole usually persists,
  // grows, or becomes non-finite. Comparing the final two levels avoids using
  // absolute slope/curvature and therefore remains direction and scale aware.
  const coarse = surfaceLineDifferenceMetrics(values, 2);
  const fine = surfaceLineDifferenceMetrics(values, 1);
  const persistentConcentratedJump = coarse.maximumFirstDifference > lineTolerance
    && fine.maximumFirstDifference
      >= coarse.maximumFirstDifference * policy.maxDifferencePersistenceRatio - lineTolerance
    && fine.maximumFirstDifference >= amplitude * policy.maxAdjacentJumpRatio - lineTolerance;
  const persistentCurvatureImpulse = coarse.maximumSecondDifference > lineTolerance
    && fine.maximumSecondDifference
      >= coarse.maximumSecondDifference * policy.maxDifferencePersistenceRatio - lineTolerance;
  return persistentConcentratedJump || persistentCurvatureImpulse ? 'discontinuous' : 'continuous';
}

function surfaceLineDifferenceMetrics(values: readonly number[], stride: 1 | 2): SurfaceLineDifferenceMetrics {
  const differences: number[] = [];
  let maximumFirstDifference = 0;
  for (let index = 0; index + stride < values.length; index += stride) {
    const first = values[index];
    const second = values[index + stride];
    if (first === undefined || second === undefined) continue;
    const difference = second - first;
    differences.push(difference);
    maximumFirstDifference = Math.max(maximumFirstDifference, Math.abs(difference));
  }

  let maximumSecondDifference = 0;
  for (let index = 1; index < differences.length; index += 1) {
    const previous = differences[index - 1];
    const current = differences[index];
    if (previous === undefined || current === undefined) continue;
    maximumSecondDifference = Math.max(maximumSecondDifference, Math.abs(current - previous));
  }
  return { maximumFirstDifference, maximumSecondDifference };
}
