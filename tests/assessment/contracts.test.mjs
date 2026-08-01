import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ASSESSMENT_ASSISTANCE_CATEGORIES,
  ASSESSMENT_CONTENT_BLOCK_TYPES,
  ASSESSMENT_INTERACTION_TYPES,
  assertLearnerSafeAssessmentItemV1,
  isAssessmentAssistanceContextV1,
  isAssessmentContentBlockV1,
  isAssessmentDeliveryContextV1,
  isAssessmentInteractionV1,
  isAssessmentResponseV1,
  isLearnerSafeAssessmentItemV1,
  validateLearnerSafeAssessmentItemV1,
} from '../../dist/assessment/index.js';
import {
  ASSESSMENT_CONTRACT_VERSION as ROOT_ASSESSMENT_CONTRACT_VERSION,
  isLearnerSafeExerciseItemV1,
} from '../../dist/index.js';

const itemFixtureUrl = new URL(
  '../../fixtures/assessment/v1/learner-safe-item.json',
  import.meta.url,
);
const responsesFixtureUrl = new URL(
  '../../fixtures/assessment/v1/responses.json',
  import.meta.url,
);

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

test('canonical learner-safe item covers every v1 content block and interaction', async () => {
  const item = await readJson(itemFixtureUrl);
  const validation = validateLearnerSafeAssessmentItemV1(item);

  assert.equal(validation.ok, true, validation.ok ? undefined : JSON.stringify(validation.issues));
  assert.equal(isLearnerSafeAssessmentItemV1(item), true);
  assert.equal(isLearnerSafeExerciseItemV1(item), true);
  assert.doesNotThrow(() => assertLearnerSafeAssessmentItemV1(item));

  assert.deepEqual(
    [...new Set(item.contentBlocks.map(block => block.type))].sort(),
    [...ASSESSMENT_CONTENT_BLOCK_TYPES].sort(),
  );
  assert.deepEqual(
    [...new Set(item.interactions.map(interaction => interaction.type))].sort(),
    [...ASSESSMENT_INTERACTION_TYPES].sort(),
  );
  assert.equal(item.contentBlocks.every(isAssessmentContentBlockV1), true);
  assert.equal(item.interactions.every(isAssessmentInteractionV1), true);
  assert.equal(isAssessmentDeliveryContextV1(item.deliveryContext), true);
  assert.equal(ROOT_ASSESSMENT_CONTRACT_VERSION, 1);
});

test('canonical response fixtures cover every v1 interaction type', async () => {
  const responses = await readJson(responsesFixtureUrl);

  assert.equal(responses.every(isAssessmentResponseV1), true);
  assert.deepEqual(
    [...new Set(responses.map(response => response.type))].sort(),
    [...ASSESSMENT_INTERACTION_TYPES].sort(),
  );
});

test('learner-safe validation rejects answer and scoring data at any depth', async () => {
  const item = await readJson(itemFixtureUrl);
  const withAnswerKey = structuredClone(item);
  withAnswerKey.answerKey = { interaction: 'option-b' };

  const topLevelValidation = validateLearnerSafeAssessmentItemV1(withAnswerKey);
  assert.equal(topLevelValidation.ok, false);
  assert.equal(
    topLevelValidation.issues.some(issue => issue.path === '$.answerKey'),
    true,
  );

  const withNestedScoring = structuredClone(item);
  withNestedScoring.interactions[0].scoring = { points: 2 };
  const nestedValidation = validateLearnerSafeAssessmentItemV1(withNestedScoring);
  assert.equal(nestedValidation.ok, false);
  assert.equal(
    nestedValidation.issues.some(
      issue => issue.path === '$.interactions[0].scoring',
    ),
    true,
  );
  assert.throws(
    () => assertLearnerSafeAssessmentItemV1(withNestedScoring),
    /Forbidden learner-facing answer or scoring field/,
  );
});

test('strict contracts reject unknown fields and unsafe public asset URLs', async () => {
  const item = await readJson(itemFixtureUrl);
  const withUnknownField = structuredClone(item);
  withUnknownField.contentBlocks[0].html = '<script>alert(1)</script>';
  assert.equal(isLearnerSafeAssessmentItemV1(withUnknownField), false);

  const withPublicUrl = structuredClone(item);
  const image = withPublicUrl.contentBlocks.find(block => block.type === 'image');
  image.url = 'https://untrusted.example/image.png';
  assert.equal(isLearnerSafeAssessmentItemV1(withPublicUrl), false);

  const withInheritedAnswer = structuredClone(item);
  Object.setPrototypeOf(withInheritedAnswer, { answerKey: 'option-b' });
  assert.equal(isLearnerSafeAssessmentItemV1(withInheritedAnswer), false);

  const withHiddenScoring = structuredClone(item);
  Object.defineProperty(withHiddenScoring.interactions[0], 'scoring', {
    value: { points: 2 },
    enumerable: false,
  });
  assert.equal(isLearnerSafeAssessmentItemV1(withHiddenScoring), false);

  const withArrayMetadata = structuredClone(item);
  withArrayMetadata.interactions.scoring = { points: 2 };
  assert.equal(isLearnerSafeAssessmentItemV1(withArrayMetadata), false);
});

test('item graph validation rejects duplicate IDs and dangling references', async () => {
  const item = await readJson(itemFixtureUrl);
  const duplicate = structuredClone(item);
  duplicate.contentBlocks[1].id = duplicate.contentBlocks[0].id;
  assert.equal(isLearnerSafeAssessmentItemV1(duplicate), false);

  const dangling = structuredClone(item);
  dangling.interactions[0].contentBlockIds = ['missing-block'];
  assert.equal(isLearnerSafeAssessmentItemV1(dangling), false);

  const nestedComposite = structuredClone(item);
  nestedComposite.interactions.at(-1).childInteractionIds = [
    nestedComposite.interactions.at(-1).id,
  ];
  assert.equal(isLearnerSafeAssessmentItemV1(nestedComposite), false);
});

test('tool snapshots use supported Klein keys and opaque artifact references', async () => {
  const item = await readJson(itemFixtureUrl);
  const toolInteraction = item.interactions.find(
    interaction => interaction.type === 'tool_snapshot',
  );
  const toolResponse = (await readJson(responsesFixtureUrl)).find(
    response => response.type === 'tool_snapshot',
  );

  assert.equal(isAssessmentInteractionV1(toolInteraction), true);
  assert.equal(isAssessmentResponseV1(toolResponse), true);
  assert.equal(
    isAssessmentInteractionV1({
      ...toolInteraction,
      starterSnapshotAssetId: null,
      readOnlyStarter: false,
    }),
    true,
  );

  assert.equal(
    isAssessmentInteractionV1({ ...toolInteraction, toolKey: 'remote-iframe' }),
    false,
  );
  assert.equal(
    isAssessmentInteractionV1({ ...toolInteraction, toolKey: 'graphing-3d' }),
    false,
  );
  assert.equal(
    isAssessmentResponseV1({
      ...toolResponse,
      snapshotUrl: 'https://untrusted.example/snapshot.json',
    }),
    false,
  );
});

test('assistance contexts keep no-assistance distinct from supported help', () => {
  const none = {
    kind: 'assessment_assistance_context',
    schemaVersion: 1,
    categories: ['none'],
    providedBy: 'none',
  };
  assert.equal(isAssessmentAssistanceContextV1(none), true);

  const supported = {
    kind: 'assessment_assistance_context',
    schemaVersion: 1,
    categories: ['metacognitive_prompt', 'technical_help'],
    providedBy: 'volunteer',
    durationMs: 45000,
  };
  assert.equal(isAssessmentAssistanceContextV1(supported), true);
  assert.equal(
    supported.categories.every(category => ASSESSMENT_ASSISTANCE_CATEGORIES.includes(category)),
    true,
  );

  assert.equal(
    isAssessmentAssistanceContextV1({
      ...supported,
      categories: ['none', 'concept_hint'],
    }),
    false,
  );
  assert.equal(
    isAssessmentAssistanceContextV1({
      ...supported,
      providedBy: 'none',
    }),
    false,
  );
});
