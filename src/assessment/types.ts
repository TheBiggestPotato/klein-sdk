import type { KleinToolKey } from '../core/index.js';

/** Current major version for the assessment JSON contracts. */
export const ASSESSMENT_CONTRACT_VERSION = 1 as const;

export type AssessmentContractVersion = typeof ASSESSMENT_CONTRACT_VERSION;

/** Canonical first-party tool keys; legacy aliases are normalized before this boundary. */
export const ASSESSMENT_TOOL_KEYS = [
  'graphing',
  'geometry-lab',
  'scientific',
  'probability',
  'whiteboard',
] as const satisfies readonly Exclude<KleinToolKey, 'graphing-3d'>[];

export type AssessmentToolKey = (typeof ASSESSMENT_TOOL_KEYS)[number];

export const ASSESSMENT_CONTENT_BLOCK_TYPES = [
  'paragraph',
  'heading',
  'list',
  'table',
  'inline_math',
  'display_math',
  'image',
  'pdf_reference',
  'audio',
  'video',
  'callout',
  'code',
  'shared_stimulus_reference',
  'tool_starter',
  'horizontal_rule',
] as const;

export type AssessmentContentBlockType = (typeof ASSESSMENT_CONTENT_BLOCK_TYPES)[number];

export const ASSESSMENT_INTERACTION_TYPES = [
  'choice_single',
  'choice_multiple',
  'boolean',
  'short_text',
  'numeric',
  'math_expression',
  'extended_text',
  'file_photo',
  'tool_snapshot',
  'composite',
] as const;

export type AssessmentInteractionType = (typeof ASSESSMENT_INTERACTION_TYPES)[number];

export const ASSESSMENT_RESPONSE_STATES = [
  'empty',
  'draft',
  'saved',
  'submitted',
] as const;

export type AssessmentResponseState = (typeof ASSESSMENT_RESPONSE_STATES)[number];

export const ASSESSMENT_OPPORTUNITY_ROLES = [
  'learning',
  'diagnostic_measurement',
  'placement',
  'summative_measurement',
] as const;

export type AssessmentOpportunityRole = (typeof ASSESSMENT_OPPORTUNITY_ROLES)[number];

export const ASSESSMENT_STAKES = ['none', 'low', 'medium', 'high'] as const;

export type AssessmentStakes = (typeof ASSESSMENT_STAKES)[number];

export const ASSESSMENT_SUPERVISION_MODES = [
  'none',
  'in_person',
  'remote_live',
  'record_review',
] as const;

export type AssessmentSupervision = (typeof ASSESSMENT_SUPERVISION_MODES)[number];

export const ASSESSMENT_RESOURCE_POLICIES = ['closed', 'limited', 'open'] as const;

export type AssessmentResourcePolicy = (typeof ASSESSMENT_RESOURCE_POLICIES)[number];

export const ASSESSMENT_COLLABORATION_MODES = [
  'independent',
  'peer',
  'volunteer',
  'teacher',
] as const;

export type AssessmentCollaborationMode = (typeof ASSESSMENT_COLLABORATION_MODES)[number];

export const ASSESSMENT_ENVIRONMENTS = [
  'open_web',
  'casa_class',
  'casa_exam_room',
  'remote',
] as const;

export type AssessmentEnvironment = (typeof ASSESSMENT_ENVIRONMENTS)[number];

export const ASSESSMENT_ASSISTANCE_CATEGORIES = [
  'none',
  'general_encouragement',
  'instruction_repeated',
  'metacognitive_prompt',
  'concept_hint',
  'worked_example',
  'step_by_step_guidance',
  'answer_revealed',
  'technical_help',
  'reading_or_accessibility_support',
] as const;

export type AssessmentAssistanceCategory = (typeof ASSESSMENT_ASSISTANCE_CATEGORIES)[number];

export const ASSESSMENT_ASSISTANCE_PROVIDERS = [
  'none',
  'peer',
  'volunteer',
  'teacher',
  'system',
] as const;

export type AssessmentAssistanceProvider = (typeof ASSESSMENT_ASSISTANCE_PROVIDERS)[number];

/**
 * Keys that are never legal on a learner-facing item surface.
 *
 * The optional-never mapping prevents structurally typed values carrying a
 * known secret from being assigned to these public contracts. Runtime
 * validators also scan imported JSON for these keys.
 */
export const LEARNER_SAFE_FORBIDDEN_FIELDS = [
  'answer',
  'answers',
  'answerKey',
  'answer_key',
  'correctAnswer',
  'correctAnswers',
  'correct_answer',
  'correct_answers',
  'correctResponse',
  'correctResponses',
  'modelAnswer',
  'solution',
  'solutions',
  'scoring',
  'scoringKey',
  'scoringRules',
  'scoring_rules',
  'score',
  'points',
  'maxScore',
  'max_score',
  'weight',
  'grading',
  'gradingRules',
  'rubric',
  'markingScheme',
  'marking_scheme',
  'grader',
  'scorer',
  'authorTests',
  'author_tests',
  'rationale',
  'feedback',
] as const;

export type LearnerSafeForbiddenField = (typeof LEARNER_SAFE_FORBIDDEN_FIELDS)[number];

export type LearnerSafeForbiddenFields = {
  readonly [Field in LearnerSafeForbiddenField]?: never;
};

interface AssessmentContentBlockBaseV1 extends LearnerSafeForbiddenFields {
  readonly id: string;
  readonly schemaVersion: AssessmentContractVersion;
  readonly type: AssessmentContentBlockType;
  readonly locale: string;
}

export interface AssessmentParagraphBlockV1 extends AssessmentContentBlockBaseV1 {
  readonly type: 'paragraph';
  readonly text: string;
}

export interface AssessmentHeadingBlockV1 extends AssessmentContentBlockBaseV1 {
  readonly type: 'heading';
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly text: string;
}

export interface AssessmentListBlockV1 extends AssessmentContentBlockBaseV1 {
  readonly type: 'list';
  readonly style: 'ordered' | 'unordered';
  readonly items: readonly string[];
}

export interface AssessmentTableBlockV1 extends AssessmentContentBlockBaseV1 {
  readonly type: 'table';
  readonly caption?: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface AssessmentInlineMathBlockV1 extends AssessmentContentBlockBaseV1 {
  readonly type: 'inline_math';
  readonly latex: string;
  readonly accessibleText: string;
}

export interface AssessmentDisplayMathBlockV1 extends AssessmentContentBlockBaseV1 {
  readonly type: 'display_math';
  readonly latex: string;
  readonly accessibleText: string;
}

export interface AssessmentImageBlockV1 extends AssessmentContentBlockBaseV1 {
  readonly type: 'image';
  readonly assetId: string;
  readonly altText: string;
  readonly caption?: string;
}

export interface AssessmentPdfPageRangeV1 extends LearnerSafeForbiddenFields {
  readonly start: number;
  readonly end: number;
}

export interface AssessmentPdfReferenceBlockV1 extends AssessmentContentBlockBaseV1 {
  readonly type: 'pdf_reference';
  readonly assetId: string;
  readonly accessibleLabel: string;
  readonly pageRange?: AssessmentPdfPageRangeV1;
}

export interface AssessmentAudioBlockV1 extends AssessmentContentBlockBaseV1 {
  readonly type: 'audio';
  readonly assetId: string;
  readonly accessibleLabel: string;
  readonly transcriptAssetId?: string;
}

export interface AssessmentVideoBlockV1 extends AssessmentContentBlockBaseV1 {
  readonly type: 'video';
  readonly assetId: string;
  readonly accessibleLabel: string;
  readonly captionsAssetId?: string;
}

export interface AssessmentCalloutBlockV1 extends AssessmentContentBlockBaseV1 {
  readonly type: 'callout';
  readonly tone: 'info' | 'note' | 'warning';
  readonly title?: string;
  readonly text: string;
}

export interface AssessmentCodeBlockV1 extends AssessmentContentBlockBaseV1 {
  readonly type: 'code';
  readonly code: string;
  readonly language?: string;
  readonly accessibleLabel: string;
}

export interface AssessmentSharedStimulusReferenceBlockV1 extends AssessmentContentBlockBaseV1 {
  readonly type: 'shared_stimulus_reference';
  readonly stimulusId: string;
  readonly stimulusVersion: number;
}

export interface AssessmentToolStarterBlockV1 extends AssessmentContentBlockBaseV1 {
  readonly type: 'tool_starter';
  readonly toolKey: AssessmentToolKey;
  readonly snapshotAssetId: string;
  readonly accessibleLabel: string;
}

export interface AssessmentHorizontalRuleBlockV1 extends AssessmentContentBlockBaseV1 {
  readonly type: 'horizontal_rule';
}

type AssessmentContentBlockShapeV1 =
  | AssessmentParagraphBlockV1
  | AssessmentHeadingBlockV1
  | AssessmentListBlockV1
  | AssessmentTableBlockV1
  | AssessmentInlineMathBlockV1
  | AssessmentDisplayMathBlockV1
  | AssessmentImageBlockV1
  | AssessmentPdfReferenceBlockV1
  | AssessmentAudioBlockV1
  | AssessmentVideoBlockV1
  | AssessmentCalloutBlockV1
  | AssessmentCodeBlockV1
  | AssessmentSharedStimulusReferenceBlockV1
  | AssessmentToolStarterBlockV1
  | AssessmentHorizontalRuleBlockV1;

export type AssessmentContentBlockV1 = AssessmentContentBlockShapeV1 & LearnerSafeForbiddenFields;

export interface AssessmentChoiceOptionV1 extends LearnerSafeForbiddenFields {
  readonly id: string;
  readonly label: string;
  readonly accessibleLabel?: string;
}

interface AssessmentInteractionBaseV1 extends LearnerSafeForbiddenFields {
  readonly id: string;
  readonly schemaVersion: AssessmentContractVersion;
  readonly type: AssessmentInteractionType;
  readonly required: boolean;
  readonly contentBlockIds: readonly string[];
}

export interface AssessmentSingleChoiceInteractionV1 extends AssessmentInteractionBaseV1 {
  readonly type: 'choice_single';
  readonly options: readonly AssessmentChoiceOptionV1[];
  readonly shuffle: boolean;
}

export interface AssessmentMultipleChoiceInteractionV1 extends AssessmentInteractionBaseV1 {
  readonly type: 'choice_multiple';
  readonly options: readonly AssessmentChoiceOptionV1[];
  readonly shuffle: boolean;
  readonly minSelections: number;
  readonly maxSelections: number;
}

export interface AssessmentBooleanInteractionV1 extends AssessmentInteractionBaseV1 {
  readonly type: 'boolean';
  readonly trueLabel: string;
  readonly falseLabel: string;
}

export interface AssessmentShortTextInteractionV1 extends AssessmentInteractionBaseV1 {
  readonly type: 'short_text';
  readonly maxLength: number;
}

export interface AssessmentNumericInteractionV1 extends AssessmentInteractionBaseV1 {
  readonly type: 'numeric';
  readonly allowDecimal: boolean;
  readonly allowNegative: boolean;
  readonly unitMode: 'none' | 'optional' | 'required';
  readonly allowedUnits: readonly string[];
}

export interface AssessmentMathExpressionInteractionV1 extends AssessmentInteractionBaseV1 {
  readonly type: 'math_expression';
  readonly entryMode: 'math_keyboard' | 'latex' | 'both';
  readonly maxLength: number;
}

export interface AssessmentExtendedTextInteractionV1 extends AssessmentInteractionBaseV1 {
  readonly type: 'extended_text';
  readonly maxLength: number;
  readonly format: 'plain_text';
}

export const ASSESSMENT_PHOTO_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AssessmentPhotoMediaType = (typeof ASSESSMENT_PHOTO_MEDIA_TYPES)[number];

export interface AssessmentFilePhotoInteractionV1 extends AssessmentInteractionBaseV1 {
  readonly type: 'file_photo';
  readonly maxFiles: number;
  readonly maxBytesPerFile: number;
  readonly acceptedMediaTypes: readonly AssessmentPhotoMediaType[];
}

export interface AssessmentToolSnapshotInteractionV1 extends AssessmentInteractionBaseV1 {
  readonly type: 'tool_snapshot';
  readonly toolKey: AssessmentToolKey;
  readonly starterSnapshotAssetId: string | null;
  readonly readOnlyStarter: boolean;
}

export interface AssessmentCompositeInteractionV1 extends AssessmentInteractionBaseV1 {
  readonly type: 'composite';
  readonly childInteractionIds: readonly string[];
}

type AssessmentInteractionShapeV1 =
  | AssessmentSingleChoiceInteractionV1
  | AssessmentMultipleChoiceInteractionV1
  | AssessmentBooleanInteractionV1
  | AssessmentShortTextInteractionV1
  | AssessmentNumericInteractionV1
  | AssessmentMathExpressionInteractionV1
  | AssessmentExtendedTextInteractionV1
  | AssessmentFilePhotoInteractionV1
  | AssessmentToolSnapshotInteractionV1
  | AssessmentCompositeInteractionV1;

export type AssessmentInteractionV1 = AssessmentInteractionShapeV1 & LearnerSafeForbiddenFields;

interface AssessmentResponseBaseV1 extends LearnerSafeForbiddenFields {
  readonly schemaVersion: AssessmentContractVersion;
  readonly type: AssessmentInteractionType;
  readonly interactionId: string;
  readonly state: AssessmentResponseState;
}

export interface AssessmentSingleChoiceResponseV1 extends AssessmentResponseBaseV1 {
  readonly type: 'choice_single';
  readonly selectedOptionId: string | null;
}

export interface AssessmentMultipleChoiceResponseV1 extends AssessmentResponseBaseV1 {
  readonly type: 'choice_multiple';
  readonly selectedOptionIds: readonly string[];
}

export interface AssessmentBooleanResponseV1 extends AssessmentResponseBaseV1 {
  readonly type: 'boolean';
  readonly value: boolean | null;
}

export interface AssessmentShortTextResponseV1 extends AssessmentResponseBaseV1 {
  readonly type: 'short_text';
  readonly raw: string;
}

export interface AssessmentNumericResponseV1 extends AssessmentResponseBaseV1 {
  readonly type: 'numeric';
  readonly raw: string;
  readonly parsedValue: number | null;
  readonly unit: string | null;
}

export interface AssessmentMathExpressionResponseV1 extends AssessmentResponseBaseV1 {
  readonly type: 'math_expression';
  readonly raw: string;
  readonly latex: string | null;
}

export interface AssessmentExtendedTextResponseV1 extends AssessmentResponseBaseV1 {
  readonly type: 'extended_text';
  readonly text: string;
}

export interface AssessmentFilePhotoResponseV1 extends AssessmentResponseBaseV1 {
  readonly type: 'file_photo';
  readonly artifactIds: readonly string[];
}

export interface AssessmentToolSnapshotResponseV1 extends AssessmentResponseBaseV1 {
  readonly type: 'tool_snapshot';
  readonly snapshotArtifactId: string | null;
}

export type AssessmentAtomicResponseV1 = (
  | AssessmentSingleChoiceResponseV1
  | AssessmentMultipleChoiceResponseV1
  | AssessmentBooleanResponseV1
  | AssessmentShortTextResponseV1
  | AssessmentNumericResponseV1
  | AssessmentMathExpressionResponseV1
  | AssessmentExtendedTextResponseV1
  | AssessmentFilePhotoResponseV1
  | AssessmentToolSnapshotResponseV1
) & LearnerSafeForbiddenFields;

export interface AssessmentCompositeResponseV1 extends AssessmentResponseBaseV1 {
  readonly type: 'composite';
  readonly childResponses: readonly AssessmentAtomicResponseV1[];
}

export type AssessmentResponseV1 = (
  | AssessmentAtomicResponseV1
  | AssessmentCompositeResponseV1
) & LearnerSafeForbiddenFields;

export interface AssessmentDeliveryContextV1 extends LearnerSafeForbiddenFields {
  readonly kind: 'assessment_delivery_context';
  readonly schemaVersion: AssessmentContractVersion;
  readonly opportunityRole: AssessmentOpportunityRole;
  readonly stakes: AssessmentStakes;
  readonly supervision: AssessmentSupervision;
  readonly resourcePolicy: AssessmentResourcePolicy;
  readonly collaborationMode: AssessmentCollaborationMode;
  readonly environment: AssessmentEnvironment;
  readonly learningTransitionAllowed: boolean;
}

export interface AssessmentAssistanceContextV1 extends LearnerSafeForbiddenFields {
  readonly kind: 'assessment_assistance_context';
  readonly schemaVersion: AssessmentContractVersion;
  readonly categories: readonly AssessmentAssistanceCategory[];
  readonly providedBy: AssessmentAssistanceProvider;
  readonly durationMs?: number;
}

interface LearnerSafeAssessmentItemShapeV1 extends LearnerSafeForbiddenFields {
  readonly kind: 'learner_safe_assessment_item';
  readonly schemaVersion: AssessmentContractVersion;
  readonly itemId: string;
  readonly itemVersion: number;
  readonly itemInstanceId: string;
  readonly sequence: number;
  readonly locale: string;
  readonly title: string;
  readonly contentBlocks: readonly AssessmentContentBlockV1[];
  readonly interactions: readonly AssessmentInteractionV1[];
  readonly deliveryContext: AssessmentDeliveryContextV1;
}

/**
 * Candidate-facing item DTO. Scoring, answers, rubrics, author tests, and
 * feedback belong in separately authorized server-side contracts.
 */
export type LearnerSafeAssessmentItemV1 =
  LearnerSafeAssessmentItemShapeV1 & LearnerSafeForbiddenFields;

/** Naming alias for learning-content callers that use "exercise". */
export type LearnerSafeExerciseItemV1 = LearnerSafeAssessmentItemV1;
