import type {
  AssessmentChoiceOptionV1,
  AssessmentDeliveryContextV1,
  AssessmentPdfPageRangeV1,
  LearnerSafeAssessmentItemV1,
  LearnerSafeForbiddenField,
} from './types.js';

type LearnerItemWithoutForbiddenFields =
  Omit<LearnerSafeAssessmentItemV1, LearnerSafeForbiddenField>;

type UnsafeItemWithAnswer = LearnerItemWithoutForbiddenFields & {
  readonly answer: string;
};

type UnsafeItemWithScoring = LearnerItemWithoutForbiddenFields & {
  readonly scoring: {
    readonly maxPoints: number;
  };
};

declare const unsafeItemWithAnswer: UnsafeItemWithAnswer;
declare const unsafeItemWithScoring: UnsafeItemWithScoring;
declare const unsafeOption: Omit<
  AssessmentChoiceOptionV1,
  LearnerSafeForbiddenField
> & {
  readonly correctAnswer: boolean;
};
declare const unsafePageRange: Omit<
  AssessmentPdfPageRangeV1,
  LearnerSafeForbiddenField
> & {
  readonly scoring: { readonly points: number };
};
declare const unsafeDeliveryContext: Omit<
  AssessmentDeliveryContextV1,
  LearnerSafeForbiddenField
> & {
  readonly answerKey: string;
};

// @ts-expect-error Learner-facing items must not carry an answer.
const learnerItemWithAnswer: LearnerSafeAssessmentItemV1 = unsafeItemWithAnswer;

// @ts-expect-error Learner-facing items must not carry scoring rules.
const learnerItemWithScoring: LearnerSafeAssessmentItemV1 = unsafeItemWithScoring;

// @ts-expect-error Nested choice options must not carry correctness.
const learnerChoiceOption: AssessmentChoiceOptionV1 = unsafeOption;

// @ts-expect-error Nested PDF ranges must not carry scoring data.
const learnerPageRange: AssessmentPdfPageRangeV1 = unsafePageRange;

// @ts-expect-error Nested delivery context must not carry an answer key.
const learnerDeliveryContext: AssessmentDeliveryContextV1 = unsafeDeliveryContext;

void learnerItemWithAnswer;
void learnerItemWithScoring;
void learnerChoiceOption;
void learnerPageRange;
void learnerDeliveryContext;
