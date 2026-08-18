import type {
  ValidationIssue,
  ValidationResult,
} from '../core/index.js';
import {
  ASSESSMENT_ASSISTANCE_CATEGORIES,
  ASSESSMENT_ASSISTANCE_PROVIDERS,
  ASSESSMENT_COLLABORATION_MODES,
  ASSESSMENT_CONTENT_BLOCK_TYPES,
  ASSESSMENT_CONTRACT_VERSION,
  ASSESSMENT_ENVIRONMENTS,
  ASSESSMENT_INTERACTION_TYPES,
  ASSESSMENT_OPPORTUNITY_ROLES,
  ASSESSMENT_PHOTO_MEDIA_TYPES,
  ASSESSMENT_RESOURCE_POLICIES,
  ASSESSMENT_RESPONSE_STATES,
  ASSESSMENT_STAKES,
  ASSESSMENT_SUPERVISION_MODES,
  ASSESSMENT_TOOL_KEYS,
  LEARNER_SAFE_FORBIDDEN_FIELDS,
} from './types.js';
import type {
  AssessmentAssistanceContextV1,
  AssessmentAtomicResponseV1,
  AssessmentChoiceOptionV1,
  AssessmentContentBlockV1,
  AssessmentDeliveryContextV1,
  AssessmentInteractionV1,
  AssessmentResponseV1,
  LearnerSafeAssessmentItemV1,
} from './types.js';

type UnknownRecord = Record<string, unknown>;

const CONTENT_BLOCK_BASE_KEYS = ['id', 'schemaVersion', 'type', 'locale'] as const;
const INTERACTION_BASE_KEYS = [
  'id',
  'schemaVersion',
  'type',
  'required',
  'contentBlockIds',
] as const;
const RESPONSE_BASE_KEYS = ['schemaVersion', 'type', 'interactionId', 'state'] as const;

function isRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !('value' in descriptor)) return false;
    }
    if (
      prototype === Object.prototype
      && LEARNER_SAFE_FORBIDDEN_FIELDS.some(
        field => field in value && !Object.hasOwn(value, field),
      )
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isPlainJsonArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  try {
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== value.length + 1 || !ownKeys.includes('length')) return false;
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !('value' in descriptor)) return false;
    }
    return !LEARNER_SAFE_FORBIDDEN_FIELDS.some(
      field => field in value && !Object.hasOwn(value, field),
    );
  } catch {
    return false;
  }
}

function addIssue(issues: ValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function hasOnlyKeys(
  record: UnknownRecord,
  allowedKeys: readonly string[],
  path: string,
  issues: ValidationIssue[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      addIssue(issues, `${path}.${key}`, 'Unknown field.');
    }
  }
}

function requireRecord(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): UnknownRecord | undefined {
  if (!isRecord(value)) {
    addIssue(issues, path, 'Expected a plain JSON object with enumerable data fields.');
    return undefined;
  }
  return value;
}

function requireString(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  options: { allowEmpty?: boolean } = {},
): value is string {
  if (typeof value !== 'string') {
    addIssue(issues, path, 'Expected a string.');
    return false;
  }
  if (!options.allowEmpty && value.trim().length === 0) {
    addIssue(issues, path, 'Expected a non-empty string.');
    return false;
  }
  return true;
}

function requireBoolean(value: unknown, path: string, issues: ValidationIssue[]): value is boolean {
  if (typeof value !== 'boolean') {
    addIssue(issues, path, 'Expected a boolean.');
    return false;
  }
  return true;
}

function requireFiniteNumber(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    addIssue(issues, path, 'Expected a finite number.');
    return false;
  }
  return true;
}

function requireInteger(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  minimum: number,
): value is number {
  if (!requireFiniteNumber(value, path, issues)) return false;
  if (!Number.isInteger(value) || value < minimum) {
    addIssue(issues, path, `Expected an integer greater than or equal to ${minimum}.`);
    return false;
  }
  return true;
}

function requireEnum<T extends string>(
  value: unknown,
  values: readonly T[],
  path: string,
  issues: ValidationIssue[],
): value is T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    addIssue(issues, path, `Expected one of: ${values.join(', ')}.`);
    return false;
  }
  return true;
}

function requireArray(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): readonly unknown[] | undefined {
  if (!isPlainJsonArray(value)) {
    addIssue(issues, path, 'Expected a plain JSON array without extra fields.');
    return undefined;
  }
  return value;
}

function validateStringArray(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  options: { allowEmptyArray?: boolean; allowEmptyStrings?: boolean } = {},
): value is readonly string[] {
  const array = requireArray(value, path, issues);
  if (!array) return false;
  let valid = true;
  if (!options.allowEmptyArray && array.length === 0) {
    addIssue(issues, path, 'Expected at least one entry.');
    valid = false;
  }
  array.forEach((entry, index) => {
    if (!requireString(entry, `${path}[${index}]`, issues, {
      allowEmpty: options.allowEmptyStrings === true,
    })) {
      valid = false;
    }
  });
  return valid;
}

function validateUniqueStrings(
  values: readonly string[],
  path: string,
  issues: ValidationIssue[],
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      addIssue(issues, `${path}[${index}]`, `Duplicate value "${value}".`);
    }
    seen.add(value);
  });
}

function validateSchemaVersion(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== ASSESSMENT_CONTRACT_VERSION) {
    addIssue(
      issues,
      path,
      `Expected assessment schema version ${ASSESSMENT_CONTRACT_VERSION}.`,
    );
  }
}

function validateContentBlockBase(
  record: UnknownRecord,
  path: string,
  issues: ValidationIssue[],
): void {
  requireString(record.id, `${path}.id`, issues);
  validateSchemaVersion(record.schemaVersion, `${path}.schemaVersion`, issues);
  requireEnum(record.type, ASSESSMENT_CONTENT_BLOCK_TYPES, `${path}.type`, issues);
  requireString(record.locale, `${path}.locale`, issues);
}

function validateOptionalString(
  record: UnknownRecord,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (key in record) requireString(record[key], `${path}.${key}`, issues);
}

function validateContentBlock(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): value is AssessmentContentBlockV1 {
  const record = requireRecord(value, path, issues);
  if (!record) return false;
  validateContentBlockBase(record, path, issues);

  switch (record.type) {
    case 'paragraph':
      hasOnlyKeys(record, [...CONTENT_BLOCK_BASE_KEYS, 'text'], path, issues);
      requireString(record.text, `${path}.text`, issues);
      break;
    case 'heading':
      hasOnlyKeys(record, [...CONTENT_BLOCK_BASE_KEYS, 'level', 'text'], path, issues);
      if (
        !requireInteger(record.level, `${path}.level`, issues, 1)
        || (record.level as number) > 6
      ) {
        if (typeof record.level === 'number' && record.level > 6) {
          addIssue(issues, `${path}.level`, 'Expected a heading level from 1 through 6.');
        }
      }
      requireString(record.text, `${path}.text`, issues);
      break;
    case 'list': {
      hasOnlyKeys(record, [...CONTENT_BLOCK_BASE_KEYS, 'style', 'items'], path, issues);
      requireEnum(record.style, ['ordered', 'unordered'] as const, `${path}.style`, issues);
      validateStringArray(record.items, `${path}.items`, issues);
      break;
    }
    case 'table': {
      hasOnlyKeys(
        record,
        [...CONTENT_BLOCK_BASE_KEYS, 'caption', 'headers', 'rows'],
        path,
        issues,
      );
      validateOptionalString(record, 'caption', path, issues);
      const headersValid = validateStringArray(record.headers, `${path}.headers`, issues);
      const rows = requireArray(record.rows, `${path}.rows`, issues);
      if (rows) {
        rows.forEach((row, rowIndex) => {
          const rowPath = `${path}.rows[${rowIndex}]`;
          if (validateStringArray(row, rowPath, issues) && headersValid) {
            if (row.length !== (record.headers as readonly unknown[]).length) {
              addIssue(issues, rowPath, 'Row length must match the header count.');
            }
          }
        });
      }
      break;
    }
    case 'inline_math':
    case 'display_math':
      hasOnlyKeys(
        record,
        [...CONTENT_BLOCK_BASE_KEYS, 'latex', 'accessibleText'],
        path,
        issues,
      );
      requireString(record.latex, `${path}.latex`, issues);
      requireString(record.accessibleText, `${path}.accessibleText`, issues);
      break;
    case 'image':
      hasOnlyKeys(
        record,
        [...CONTENT_BLOCK_BASE_KEYS, 'assetId', 'altText', 'caption'],
        path,
        issues,
      );
      requireString(record.assetId, `${path}.assetId`, issues);
      requireString(record.altText, `${path}.altText`, issues);
      validateOptionalString(record, 'caption', path, issues);
      break;
    case 'pdf_reference': {
      hasOnlyKeys(
        record,
        [...CONTENT_BLOCK_BASE_KEYS, 'assetId', 'accessibleLabel', 'pageRange'],
        path,
        issues,
      );
      requireString(record.assetId, `${path}.assetId`, issues);
      requireString(record.accessibleLabel, `${path}.accessibleLabel`, issues);
      if ('pageRange' in record) {
        const pageRange = requireRecord(record.pageRange, `${path}.pageRange`, issues);
        if (pageRange) {
          hasOnlyKeys(pageRange, ['start', 'end'], `${path}.pageRange`, issues);
          const startValid = requireInteger(
            pageRange.start,
            `${path}.pageRange.start`,
            issues,
            1,
          );
          const endValid = requireInteger(pageRange.end, `${path}.pageRange.end`, issues, 1);
          if (
            startValid
            && endValid
            && (pageRange.end as number) < (pageRange.start as number)
          ) {
            addIssue(issues, `${path}.pageRange.end`, 'End page must not precede start page.');
          }
        }
      }
      break;
    }
    case 'audio':
      hasOnlyKeys(
        record,
        [...CONTENT_BLOCK_BASE_KEYS, 'assetId', 'accessibleLabel', 'transcriptAssetId'],
        path,
        issues,
      );
      requireString(record.assetId, `${path}.assetId`, issues);
      requireString(record.accessibleLabel, `${path}.accessibleLabel`, issues);
      validateOptionalString(record, 'transcriptAssetId', path, issues);
      break;
    case 'video':
      hasOnlyKeys(
        record,
        [...CONTENT_BLOCK_BASE_KEYS, 'assetId', 'accessibleLabel', 'captionsAssetId'],
        path,
        issues,
      );
      requireString(record.assetId, `${path}.assetId`, issues);
      requireString(record.accessibleLabel, `${path}.accessibleLabel`, issues);
      validateOptionalString(record, 'captionsAssetId', path, issues);
      break;
    case 'callout':
      hasOnlyKeys(
        record,
        [...CONTENT_BLOCK_BASE_KEYS, 'tone', 'title', 'text'],
        path,
        issues,
      );
      requireEnum(record.tone, ['info', 'note', 'warning'] as const, `${path}.tone`, issues);
      validateOptionalString(record, 'title', path, issues);
      requireString(record.text, `${path}.text`, issues);
      break;
    case 'code':
      hasOnlyKeys(
        record,
        [...CONTENT_BLOCK_BASE_KEYS, 'code', 'language', 'accessibleLabel'],
        path,
        issues,
      );
      requireString(record.code, `${path}.code`, issues);
      validateOptionalString(record, 'language', path, issues);
      requireString(record.accessibleLabel, `${path}.accessibleLabel`, issues);
      break;
    case 'shared_stimulus_reference':
      hasOnlyKeys(
        record,
        [...CONTENT_BLOCK_BASE_KEYS, 'stimulusId', 'stimulusVersion'],
        path,
        issues,
      );
      requireString(record.stimulusId, `${path}.stimulusId`, issues);
      requireInteger(record.stimulusVersion, `${path}.stimulusVersion`, issues, 1);
      break;
    case 'tool_starter':
      hasOnlyKeys(
        record,
        [
          ...CONTENT_BLOCK_BASE_KEYS,
          'toolKey',
          'snapshotAssetId',
          'accessibleLabel',
        ],
        path,
        issues,
      );
      requireEnum(record.toolKey, ASSESSMENT_TOOL_KEYS, `${path}.toolKey`, issues);
      requireString(record.snapshotAssetId, `${path}.snapshotAssetId`, issues);
      requireString(record.accessibleLabel, `${path}.accessibleLabel`, issues);
      break;
    case 'horizontal_rule':
      hasOnlyKeys(record, CONTENT_BLOCK_BASE_KEYS, path, issues);
      break;
    default:
      hasOnlyKeys(record, CONTENT_BLOCK_BASE_KEYS, path, issues);
  }

  return issues.length === 0;
}

function validateChoiceOptions(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): value is readonly AssessmentChoiceOptionV1[] {
  const options = requireArray(value, path, issues);
  if (!options) return false;
  if (options.length < 2) {
    addIssue(issues, path, 'Expected at least two options.');
  }
  const optionIds: string[] = [];
  options.forEach((option, index) => {
    const optionPath = `${path}[${index}]`;
    const record = requireRecord(option, optionPath, issues);
    if (!record) return;
    hasOnlyKeys(record, ['id', 'label', 'accessibleLabel'], optionPath, issues);
    if (requireString(record.id, `${optionPath}.id`, issues)) {
      optionIds.push(record.id);
    }
    requireString(record.label, `${optionPath}.label`, issues);
    validateOptionalString(record, 'accessibleLabel', optionPath, issues);
  });
  validateUniqueStrings(optionIds, path, issues);
  return issues.length === 0;
}

function validateInteractionBase(
  record: UnknownRecord,
  path: string,
  issues: ValidationIssue[],
): void {
  requireString(record.id, `${path}.id`, issues);
  validateSchemaVersion(record.schemaVersion, `${path}.schemaVersion`, issues);
  requireEnum(record.type, ASSESSMENT_INTERACTION_TYPES, `${path}.type`, issues);
  requireBoolean(record.required, `${path}.required`, issues);
  if (validateStringArray(record.contentBlockIds, `${path}.contentBlockIds`, issues)) {
    validateUniqueStrings(record.contentBlockIds, `${path}.contentBlockIds`, issues);
  }
}

function validateInteraction(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): value is AssessmentInteractionV1 {
  const initialIssueCount = issues.length;
  const record = requireRecord(value, path, issues);
  if (!record) return false;
  validateInteractionBase(record, path, issues);

  switch (record.type) {
    case 'choice_single':
      hasOnlyKeys(
        record,
        [...INTERACTION_BASE_KEYS, 'options', 'shuffle'],
        path,
        issues,
      );
      validateChoiceOptions(record.options, `${path}.options`, issues);
      requireBoolean(record.shuffle, `${path}.shuffle`, issues);
      break;
    case 'choice_multiple': {
      hasOnlyKeys(
        record,
        [
          ...INTERACTION_BASE_KEYS,
          'options',
          'shuffle',
          'minSelections',
          'maxSelections',
        ],
        path,
        issues,
      );
      const optionsValid = validateChoiceOptions(record.options, `${path}.options`, issues);
      requireBoolean(record.shuffle, `${path}.shuffle`, issues);
      const minValid = requireInteger(
        record.minSelections,
        `${path}.minSelections`,
        issues,
        0,
      );
      const maxValid = requireInteger(
        record.maxSelections,
        `${path}.maxSelections`,
        issues,
        1,
      );
      if (
        minValid
        && maxValid
        && (record.minSelections as number) > (record.maxSelections as number)
      ) {
        addIssue(issues, `${path}.maxSelections`, 'Maximum must be at least the minimum.');
      }
      if (
        optionsValid
        && maxValid
        && (record.maxSelections as number) > (record.options as readonly unknown[]).length
      ) {
        addIssue(issues, `${path}.maxSelections`, 'Maximum exceeds the option count.');
      }
      break;
    }
    case 'boolean':
      hasOnlyKeys(
        record,
        [...INTERACTION_BASE_KEYS, 'trueLabel', 'falseLabel'],
        path,
        issues,
      );
      requireString(record.trueLabel, `${path}.trueLabel`, issues);
      requireString(record.falseLabel, `${path}.falseLabel`, issues);
      break;
    case 'short_text':
      hasOnlyKeys(record, [...INTERACTION_BASE_KEYS, 'maxLength'], path, issues);
      requireInteger(record.maxLength, `${path}.maxLength`, issues, 1);
      break;
    case 'numeric': {
      hasOnlyKeys(
        record,
        [
          ...INTERACTION_BASE_KEYS,
          'allowDecimal',
          'allowNegative',
          'unitMode',
          'allowedUnits',
        ],
        path,
        issues,
      );
      requireBoolean(record.allowDecimal, `${path}.allowDecimal`, issues);
      requireBoolean(record.allowNegative, `${path}.allowNegative`, issues);
      const unitModeValid = requireEnum(
        record.unitMode,
        ['none', 'optional', 'required'] as const,
        `${path}.unitMode`,
        issues,
      );
      const allowedUnits = record.allowedUnits;
      const unitsValid = validateStringArray(
        allowedUnits,
        `${path}.allowedUnits`,
        issues,
        { allowEmptyArray: true },
      );
      if (unitsValid) validateUniqueStrings(allowedUnits, `${path}.allowedUnits`, issues);
      if (
        unitModeValid
        && record.unitMode === 'required'
        && Array.isArray(record.allowedUnits)
        && record.allowedUnits.length === 0
      ) {
        addIssue(issues, `${path}.allowedUnits`, 'Required units need at least one allowed unit.');
      }
      if (
        unitModeValid
        && record.unitMode === 'none'
        && Array.isArray(record.allowedUnits)
        && record.allowedUnits.length > 0
      ) {
        addIssue(issues, `${path}.allowedUnits`, 'Unit-free responses cannot list allowed units.');
      }
      break;
    }
    case 'math_collection':
      hasOnlyKeys(
        record,
        [...INTERACTION_BASE_KEYS, 'collectionKind', 'maxLength'],
        path,
        issues,
      );
      // The shape belongs to the question. `(1, 2)` is a vector in one and an
      // open interval in another, and only this says which was asked.
      requireEnum(
        record.collectionKind,
        ['set', 'vector', 'interval', 'matrix'] as const,
        `${path}.collectionKind`,
        issues,
      );
      requireInteger(record.maxLength, `${path}.maxLength`, issues, 1);
      break;
    case 'math_expression':
      hasOnlyKeys(
        record,
        [...INTERACTION_BASE_KEYS, 'entryMode', 'maxLength'],
        path,
        issues,
      );
      requireEnum(
        record.entryMode,
        ['math_keyboard', 'latex', 'both'] as const,
        `${path}.entryMode`,
        issues,
      );
      requireInteger(record.maxLength, `${path}.maxLength`, issues, 1);
      break;
    case 'extended_text':
      hasOnlyKeys(
        record,
        [...INTERACTION_BASE_KEYS, 'maxLength', 'format'],
        path,
        issues,
      );
      requireInteger(record.maxLength, `${path}.maxLength`, issues, 1);
      if (record.format !== 'plain_text') {
        addIssue(issues, `${path}.format`, 'Only plain_text is safe in contract version 1.');
      }
      break;
    case 'file_photo': {
      hasOnlyKeys(
        record,
        [
          ...INTERACTION_BASE_KEYS,
          'maxFiles',
          'maxBytesPerFile',
          'acceptedMediaTypes',
        ],
        path,
        issues,
      );
      requireInteger(record.maxFiles, `${path}.maxFiles`, issues, 1);
      requireInteger(record.maxBytesPerFile, `${path}.maxBytesPerFile`, issues, 1);
      const mediaTypes = requireArray(
        record.acceptedMediaTypes,
        `${path}.acceptedMediaTypes`,
        issues,
      );
      if (mediaTypes) {
        if (mediaTypes.length === 0) {
          addIssue(issues, `${path}.acceptedMediaTypes`, 'Expected at least one media type.');
        }
        mediaTypes.forEach((mediaType, index) => {
          requireEnum(
            mediaType,
            ASSESSMENT_PHOTO_MEDIA_TYPES,
            `${path}.acceptedMediaTypes[${index}]`,
            issues,
          );
        });
        if (mediaTypes.every((entry): entry is string => typeof entry === 'string')) {
          validateUniqueStrings(mediaTypes, `${path}.acceptedMediaTypes`, issues);
        }
      }
      break;
    }
    case 'tool_snapshot':
      hasOnlyKeys(
        record,
        [
          ...INTERACTION_BASE_KEYS,
          'toolKey',
          'starterSnapshotAssetId',
          'readOnlyStarter',
        ],
        path,
        issues,
      );
      requireEnum(record.toolKey, ASSESSMENT_TOOL_KEYS, `${path}.toolKey`, issues);
      if (record.starterSnapshotAssetId !== null) {
        requireString(
          record.starterSnapshotAssetId,
          `${path}.starterSnapshotAssetId`,
          issues,
        );
      }
      requireBoolean(record.readOnlyStarter, `${path}.readOnlyStarter`, issues);
      break;
    case 'composite':
      hasOnlyKeys(
        record,
        [...INTERACTION_BASE_KEYS, 'childInteractionIds'],
        path,
        issues,
      );
      if (
        validateStringArray(
          record.childInteractionIds,
          `${path}.childInteractionIds`,
          issues,
        )
      ) {
        validateUniqueStrings(
          record.childInteractionIds,
          `${path}.childInteractionIds`,
          issues,
        );
      }
      break;
    default:
      hasOnlyKeys(record, INTERACTION_BASE_KEYS, path, issues);
  }

  return issues.length === initialIssueCount;
}

function validateResponseBase(
  record: UnknownRecord,
  path: string,
  issues: ValidationIssue[],
): void {
  validateSchemaVersion(record.schemaVersion, `${path}.schemaVersion`, issues);
  requireEnum(record.type, ASSESSMENT_INTERACTION_TYPES, `${path}.type`, issues);
  requireString(record.interactionId, `${path}.interactionId`, issues);
  requireEnum(record.state, ASSESSMENT_RESPONSE_STATES, `${path}.state`, issues);
}

function validateAtomicResponse(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): value is AssessmentAtomicResponseV1 {
  const initialIssueCount = issues.length;
  const record = requireRecord(value, path, issues);
  if (!record) return false;
  validateResponseBase(record, path, issues);

  switch (record.type) {
    case 'choice_single':
      hasOnlyKeys(record, [...RESPONSE_BASE_KEYS, 'selectedOptionId'], path, issues);
      if (
        record.selectedOptionId !== null
        && typeof record.selectedOptionId !== 'string'
      ) {
        addIssue(issues, `${path}.selectedOptionId`, 'Expected a string or null.');
      } else if (typeof record.selectedOptionId === 'string') {
        requireString(record.selectedOptionId, `${path}.selectedOptionId`, issues);
      }
      break;
    case 'choice_multiple':
      hasOnlyKeys(record, [...RESPONSE_BASE_KEYS, 'selectedOptionIds'], path, issues);
      if (
        validateStringArray(
          record.selectedOptionIds,
          `${path}.selectedOptionIds`,
          issues,
          { allowEmptyArray: true },
        )
      ) {
        validateUniqueStrings(
          record.selectedOptionIds,
          `${path}.selectedOptionIds`,
          issues,
        );
      }
      break;
    case 'boolean':
      hasOnlyKeys(record, [...RESPONSE_BASE_KEYS, 'value'], path, issues);
      if (record.value !== null && typeof record.value !== 'boolean') {
        addIssue(issues, `${path}.value`, 'Expected a boolean or null.');
      }
      break;
    case 'short_text':
      hasOnlyKeys(record, [...RESPONSE_BASE_KEYS, 'raw'], path, issues);
      requireString(record.raw, `${path}.raw`, issues, { allowEmpty: true });
      break;
    case 'numeric':
      hasOnlyKeys(
        record,
        [...RESPONSE_BASE_KEYS, 'raw', 'parsedValue', 'unit'],
        path,
        issues,
      );
      requireString(record.raw, `${path}.raw`, issues, { allowEmpty: true });
      if (record.parsedValue !== null) {
        requireFiniteNumber(record.parsedValue, `${path}.parsedValue`, issues);
      }
      if (record.unit !== null) {
        requireString(record.unit, `${path}.unit`, issues);
      }
      break;
    case 'math_collection':
      hasOnlyKeys(record, [...RESPONSE_BASE_KEYS, 'raw'], path, issues);
      requireString(record.raw, `${path}.raw`, issues, { allowEmpty: true });
      break;
    case 'math_expression':
      hasOnlyKeys(record, [...RESPONSE_BASE_KEYS, 'raw', 'latex'], path, issues);
      requireString(record.raw, `${path}.raw`, issues, { allowEmpty: true });
      if (record.latex !== null) {
        requireString(record.latex, `${path}.latex`, issues, { allowEmpty: true });
      }
      break;
    case 'extended_text':
      hasOnlyKeys(record, [...RESPONSE_BASE_KEYS, 'text'], path, issues);
      requireString(record.text, `${path}.text`, issues, { allowEmpty: true });
      break;
    case 'file_photo':
      hasOnlyKeys(record, [...RESPONSE_BASE_KEYS, 'artifactIds'], path, issues);
      if (
        validateStringArray(record.artifactIds, `${path}.artifactIds`, issues, {
          allowEmptyArray: true,
        })
      ) {
        validateUniqueStrings(record.artifactIds, `${path}.artifactIds`, issues);
      }
      break;
    case 'tool_snapshot':
      hasOnlyKeys(
        record,
        [...RESPONSE_BASE_KEYS, 'snapshotArtifactId'],
        path,
        issues,
      );
      if (record.snapshotArtifactId !== null) {
        requireString(
          record.snapshotArtifactId,
          `${path}.snapshotArtifactId`,
          issues,
        );
      }
      break;
    case 'composite':
      addIssue(issues, `${path}.type`, 'Nested composite responses are not supported.');
      break;
    default:
      hasOnlyKeys(record, RESPONSE_BASE_KEYS, path, issues);
  }

  return issues.length === initialIssueCount;
}

function validateResponse(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): value is AssessmentResponseV1 {
  const initialIssueCount = issues.length;
  const record = requireRecord(value, path, issues);
  if (!record) return false;
  if (record.type !== 'composite') {
    return validateAtomicResponse(record, path, issues);
  }

  validateResponseBase(record, path, issues);
  hasOnlyKeys(record, [...RESPONSE_BASE_KEYS, 'childResponses'], path, issues);
  const childResponses = requireArray(record.childResponses, `${path}.childResponses`, issues);
  if (childResponses) {
    const ids: string[] = [];
    childResponses.forEach((response, index) => {
      if (
        validateAtomicResponse(
          response,
          `${path}.childResponses[${index}]`,
          issues,
        )
        && isRecord(response)
        && typeof response.interactionId === 'string'
      ) {
        ids.push(response.interactionId);
      }
    });
    validateUniqueStrings(ids, `${path}.childResponses`, issues);
  }
  return issues.length === initialIssueCount;
}

function validateDeliveryContext(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): value is AssessmentDeliveryContextV1 {
  const initialIssueCount = issues.length;
  const record = requireRecord(value, path, issues);
  if (!record) return false;
  hasOnlyKeys(
    record,
    [
      'kind',
      'schemaVersion',
      'opportunityRole',
      'stakes',
      'supervision',
      'resourcePolicy',
      'collaborationMode',
      'environment',
      'learningTransitionAllowed',
    ],
    path,
    issues,
  );
  if (record.kind !== 'assessment_delivery_context') {
    addIssue(issues, `${path}.kind`, 'Expected assessment_delivery_context.');
  }
  validateSchemaVersion(record.schemaVersion, `${path}.schemaVersion`, issues);
  requireEnum(
    record.opportunityRole,
    ASSESSMENT_OPPORTUNITY_ROLES,
    `${path}.opportunityRole`,
    issues,
  );
  requireEnum(record.stakes, ASSESSMENT_STAKES, `${path}.stakes`, issues);
  requireEnum(
    record.supervision,
    ASSESSMENT_SUPERVISION_MODES,
    `${path}.supervision`,
    issues,
  );
  requireEnum(
    record.resourcePolicy,
    ASSESSMENT_RESOURCE_POLICIES,
    `${path}.resourcePolicy`,
    issues,
  );
  requireEnum(
    record.collaborationMode,
    ASSESSMENT_COLLABORATION_MODES,
    `${path}.collaborationMode`,
    issues,
  );
  requireEnum(
    record.environment,
    ASSESSMENT_ENVIRONMENTS,
    `${path}.environment`,
    issues,
  );
  requireBoolean(
    record.learningTransitionAllowed,
    `${path}.learningTransitionAllowed`,
    issues,
  );
  return issues.length === initialIssueCount;
}

function validateAssistanceContext(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): value is AssessmentAssistanceContextV1 {
  const initialIssueCount = issues.length;
  const record = requireRecord(value, path, issues);
  if (!record) return false;
  hasOnlyKeys(
    record,
    ['kind', 'schemaVersion', 'categories', 'providedBy', 'durationMs'],
    path,
    issues,
  );
  if (record.kind !== 'assessment_assistance_context') {
    addIssue(issues, `${path}.kind`, 'Expected assessment_assistance_context.');
  }
  validateSchemaVersion(record.schemaVersion, `${path}.schemaVersion`, issues);
  const categories = requireArray(record.categories, `${path}.categories`, issues);
  const validCategories: string[] = [];
  if (categories) {
    if (categories.length === 0) {
      addIssue(issues, `${path}.categories`, 'Expected at least one assistance category.');
    }
    categories.forEach((category, index) => {
      if (
        requireEnum(
          category,
          ASSESSMENT_ASSISTANCE_CATEGORIES,
          `${path}.categories[${index}]`,
          issues,
        )
      ) {
        validCategories.push(category);
      }
    });
    validateUniqueStrings(validCategories, `${path}.categories`, issues);
    if (validCategories.includes('none') && validCategories.length > 1) {
      addIssue(issues, `${path}.categories`, '"none" cannot be combined with assistance.');
    }
  }
  const providerValid = requireEnum(
    record.providedBy,
    ASSESSMENT_ASSISTANCE_PROVIDERS,
    `${path}.providedBy`,
    issues,
  );
  if (providerValid && validCategories.length > 0) {
    const noAssistance = validCategories.length === 1 && validCategories[0] === 'none';
    if (noAssistance && record.providedBy !== 'none') {
      addIssue(issues, `${path}.providedBy`, 'No assistance must use provider "none".');
    }
    if (!noAssistance && record.providedBy === 'none') {
      addIssue(issues, `${path}.providedBy`, 'Recorded assistance needs a provider.');
    }
  }
  if ('durationMs' in record) {
    requireInteger(record.durationMs, `${path}.durationMs`, issues, 0);
  }
  return issues.length === initialIssueCount;
}

function findForbiddenLearnerFields(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      findForbiddenLearnerFields(entry, `${path}[${index}]`, issues);
    });
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if ((LEARNER_SAFE_FORBIDDEN_FIELDS as readonly string[]).includes(key)) {
      addIssue(issues, `${path}.${key}`, 'Forbidden learner-facing answer or scoring field.');
    }
    findForbiddenLearnerFields(child, `${path}.${key}`, issues);
  }
}

function validateLearnerSafeItem(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): value is LearnerSafeAssessmentItemV1 {
  const initialIssueCount = issues.length;
  findForbiddenLearnerFields(value, path, issues);
  const record = requireRecord(value, path, issues);
  if (!record) return false;
  hasOnlyKeys(
    record,
    [
      'kind',
      'schemaVersion',
      'itemId',
      'itemVersion',
      'itemInstanceId',
      'sequence',
      'locale',
      'title',
      'contentBlocks',
      'interactions',
      'deliveryContext',
    ],
    path,
    issues,
  );
  if (record.kind !== 'learner_safe_assessment_item') {
    addIssue(issues, `${path}.kind`, 'Expected learner_safe_assessment_item.');
  }
  validateSchemaVersion(record.schemaVersion, `${path}.schemaVersion`, issues);
  requireString(record.itemId, `${path}.itemId`, issues);
  requireInteger(record.itemVersion, `${path}.itemVersion`, issues, 1);
  requireString(record.itemInstanceId, `${path}.itemInstanceId`, issues);
  requireInteger(record.sequence, `${path}.sequence`, issues, 1);
  requireString(record.locale, `${path}.locale`, issues);
  requireString(record.title, `${path}.title`, issues);

  const blocks = requireArray(record.contentBlocks, `${path}.contentBlocks`, issues);
  const blockIds: string[] = [];
  if (blocks) {
    if (blocks.length === 0) {
      addIssue(issues, `${path}.contentBlocks`, 'Expected at least one content block.');
    }
    blocks.forEach((block, index) => {
      validateContentBlock(block, `${path}.contentBlocks[${index}]`, issues);
      if (isRecord(block) && typeof block.id === 'string') blockIds.push(block.id);
    });
    validateUniqueStrings(blockIds, `${path}.contentBlocks`, issues);
  }

  const interactions = requireArray(record.interactions, `${path}.interactions`, issues);
  const interactionRecords: UnknownRecord[] = [];
  const interactionIds: string[] = [];
  if (interactions) {
    if (interactions.length === 0) {
      addIssue(issues, `${path}.interactions`, 'Expected at least one interaction.');
    }
    interactions.forEach((interaction, index) => {
      validateInteraction(interaction, `${path}.interactions[${index}]`, issues);
      if (isRecord(interaction)) {
        interactionRecords.push(interaction);
        if (typeof interaction.id === 'string') interactionIds.push(interaction.id);
      }
    });
    validateUniqueStrings(interactionIds, `${path}.interactions`, issues);
  }

  const knownBlockIds = new Set(blockIds);
  const interactionsById = new Map(
    interactionRecords
      .filter((interaction): interaction is UnknownRecord & { id: string } => {
        return typeof interaction.id === 'string';
      })
      .map(interaction => [interaction.id, interaction]),
  );
  interactionRecords.forEach((interaction, index) => {
    if (Array.isArray(interaction.contentBlockIds)) {
      interaction.contentBlockIds.forEach((blockId, referenceIndex) => {
        if (typeof blockId === 'string' && !knownBlockIds.has(blockId)) {
          addIssue(
            issues,
            `${path}.interactions[${index}].contentBlockIds[${referenceIndex}]`,
            `Unknown content block "${blockId}".`,
          );
        }
      });
    }
    if (interaction.type === 'composite' && Array.isArray(interaction.childInteractionIds)) {
      interaction.childInteractionIds.forEach((childId, childIndex) => {
        if (typeof childId !== 'string') return;
        const child = interactionsById.get(childId);
        const childPath = `${path}.interactions[${index}].childInteractionIds[${childIndex}]`;
        if (!child) {
          addIssue(issues, childPath, `Unknown child interaction "${childId}".`);
        } else if (child === interaction) {
          addIssue(issues, childPath, 'A composite cannot contain itself.');
        } else if (child.type === 'composite') {
          addIssue(issues, childPath, 'Nested composite interactions are not supported.');
        }
      });
    }
  });

  validateDeliveryContext(record.deliveryContext, `${path}.deliveryContext`, issues);
  return issues.length === initialIssueCount;
}

function result<T>(value: unknown, issues: ValidationIssue[]): ValidationResult<T> {
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: value as T };
}

export function validateAssessmentContentBlockV1(
  value: unknown,
): ValidationResult<AssessmentContentBlockV1> {
  const issues: ValidationIssue[] = [];
  validateContentBlock(value, '$', issues);
  return result(value, issues);
}

export function isAssessmentContentBlockV1(
  value: unknown,
): value is AssessmentContentBlockV1 {
  return validateAssessmentContentBlockV1(value).ok;
}

export function validateAssessmentInteractionV1(
  value: unknown,
): ValidationResult<AssessmentInteractionV1> {
  const issues: ValidationIssue[] = [];
  validateInteraction(value, '$', issues);
  return result(value, issues);
}

export function isAssessmentInteractionV1(
  value: unknown,
): value is AssessmentInteractionV1 {
  return validateAssessmentInteractionV1(value).ok;
}

export function validateAssessmentResponseV1(
  value: unknown,
): ValidationResult<AssessmentResponseV1> {
  const issues: ValidationIssue[] = [];
  validateResponse(value, '$', issues);
  return result(value, issues);
}

export function isAssessmentResponseV1(value: unknown): value is AssessmentResponseV1 {
  return validateAssessmentResponseV1(value).ok;
}

export function validateAssessmentDeliveryContextV1(
  value: unknown,
): ValidationResult<AssessmentDeliveryContextV1> {
  const issues: ValidationIssue[] = [];
  validateDeliveryContext(value, '$', issues);
  return result(value, issues);
}

export function isAssessmentDeliveryContextV1(
  value: unknown,
): value is AssessmentDeliveryContextV1 {
  return validateAssessmentDeliveryContextV1(value).ok;
}

export function validateAssessmentAssistanceContextV1(
  value: unknown,
): ValidationResult<AssessmentAssistanceContextV1> {
  const issues: ValidationIssue[] = [];
  validateAssistanceContext(value, '$', issues);
  return result(value, issues);
}

export function isAssessmentAssistanceContextV1(
  value: unknown,
): value is AssessmentAssistanceContextV1 {
  return validateAssessmentAssistanceContextV1(value).ok;
}

export function validateLearnerSafeAssessmentItemV1(
  value: unknown,
): ValidationResult<LearnerSafeAssessmentItemV1> {
  const issues: ValidationIssue[] = [];
  validateLearnerSafeItem(value, '$', issues);
  return result(value, issues);
}

export function isLearnerSafeAssessmentItemV1(
  value: unknown,
): value is LearnerSafeAssessmentItemV1 {
  return validateLearnerSafeAssessmentItemV1(value).ok;
}

export function assertLearnerSafeAssessmentItemV1(
  value: unknown,
): asserts value is LearnerSafeAssessmentItemV1 {
  const validation = validateLearnerSafeAssessmentItemV1(value);
  if (!validation.ok) {
    const summary = validation.issues
      .map(issue => `${issue.path}: ${issue.message}`)
      .join('; ');
    throw new TypeError(`Invalid learner-safe assessment item: ${summary}`);
  }
}

/** Exercise-oriented alias for callers using the learning-content vocabulary. */
export const isLearnerSafeExerciseItemV1 = isLearnerSafeAssessmentItemV1;

/** Exercise-oriented alias for callers using the learning-content vocabulary. */
export const validateLearnerSafeExerciseItemV1 = validateLearnerSafeAssessmentItemV1;

/** Exercise-oriented alias for callers using the learning-content vocabulary. */
export const assertLearnerSafeExerciseItemV1 = assertLearnerSafeAssessmentItemV1;
