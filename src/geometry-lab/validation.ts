import type { ValidationResult } from '../core/index.js';
import {
  canonicalizeGeometryLabSnapshot as canonicalizeGeometryLabSnapshotBase,
  GeometryLabCanonicalizationError,
} from './canonicalize.js';
import {
  assertGeometryLabSnapshotComplexity,
  preflightGeometryLabDeltaComplexity,
  preflightGeometryLabSnapshotComplexity,
  resolveGeometryLabComplexityLimits,
} from './complexity.js';
import type {
  GeometryLabComplexityIssue,
  GeometryLabComplexityLimits,
} from './complexity.js';
import { canonicalizeEquationSurfaceCaches } from './equations.js';
import { getGeometryLabInvariantIssues } from './invariants.js';
import {
  validateGeometryLabDeltaStrict,
  validateGeometryLabSnapshotStrict,
} from './schema.js';
import type {
  GeometryLabDelta,
  GeometryLabSnapshot,
} from './types.js';

/** Rebuilds all canonical derived state, including equation-surface meshes. */
export function canonicalizeGeometryLabSnapshot(
  snapshot: GeometryLabSnapshot,
  complexityLimits: Partial<GeometryLabComplexityLimits> = {},
): GeometryLabSnapshot {
  assertGeometryLabSnapshotComplexity(snapshot, complexityLimits);
  const canonical = canonicalizeEquationSurfaceCaches(canonicalizeGeometryLabSnapshotBase(snapshot));
  assertGeometryLabSnapshotComplexity(canonical, complexityLimits);
  return canonical;
}

/** Validates both the serialized shape and all cross-record Geometry Lab references. */
export function validateGeometryLabSnapshot(
  value: unknown,
  complexityLimits: Partial<GeometryLabComplexityLimits> = {},
): ValidationResult<GeometryLabSnapshot> {
  const limits = resolveGeometryLabComplexityLimits(complexityLimits);
  const complexity = preflightGeometryLabSnapshotComplexity(value, limits);
  if (!complexity.ok) return complexityValidationFailure(complexity.issues);
  const shape = validateGeometryLabSnapshotStrict(value, limits.maxValidationIssues);
  if (!shape.ok) return boundedValidationFailure(shape.issues, limits.maxValidationIssues);
  let canonical: GeometryLabSnapshot;
  try {
    canonical = canonicalizeGeometryLabSnapshot(shape.value, limits);
  } catch (error) {
    const message = error instanceof GeometryLabCanonicalizationError
      ? `${error.code}: ${error.message}`
      : error instanceof Error ? error.message : 'Unknown canonicalization failure.';
    return { ok: false, issues: [{ path: '', message }] };
  }
  const issues = getGeometryLabInvariantIssues(canonical);
  return issues.length > 0
    ? boundedValidationFailure(issues, limits.maxValidationIssues)
    : { ok: true, value: canonical };
}

/** Validates delta shape after a bounded, non-recursive resource preflight. */
export function validateGeometryLabDelta(
  value: unknown,
  complexityLimits: Partial<GeometryLabComplexityLimits> = {},
): ValidationResult<GeometryLabDelta> {
  const limits = resolveGeometryLabComplexityLimits(complexityLimits);
  const complexity = preflightGeometryLabDeltaComplexity(value, limits);
  if (!complexity.ok) return complexityValidationFailure(complexity.issues);
  const shape = validateGeometryLabDeltaStrict(value, limits.maxValidationIssues);
  return shape.ok ? shape : boundedValidationFailure(shape.issues, limits.maxValidationIssues);
}

function complexityValidationFailure<T>(
  issues: readonly GeometryLabComplexityIssue[],
): ValidationResult<T> {
  return {
    ok: false,
    issues: issues.map(issue => ({ path: issue.path, message: `${issue.code}: ${issue.message}` })),
  };
}

function boundedValidationFailure<T>(
  issues: Array<{ path: string; message: string }>,
  maximum: number,
): ValidationResult<T> {
  return { ok: false, issues: issues.slice(0, maximum) };
}
