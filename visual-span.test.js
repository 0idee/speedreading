import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSpanProfile,
  normalizeSpanProfile,
  getStageCharset,
  generateSpanStimulus,
  evaluateSpanAttempt,
  spanPartialScore,
  spanItemRating,
  maybePromoteSpanStage,
} from './visual-span.js';

test('stage charsets exclude O/o and keep 0', () => {
  const stage1 = getStageCharset(1);
  assert.ok(stage1.includes('0'));
  assert.ok(!stage1.includes('O'));

  const stage3 = getStageCharset(3);
  assert.ok(!stage3.includes('O'));
  assert.ok(!stage3.includes('o'));
});

test('generator respects stage and length', () => {
  const s = generateSpanStimulus({ stage: 1, length: 6, random: () => 0 });
  assert.equal(s, '000000');
  assert.equal(s.length, 6);
});

test('evaluation trims input and compares exact chars', () => {
  assert.equal(evaluateSpanAttempt('A10', 'A10 '), true);
  assert.equal(evaluateSpanAttempt('A10', 'A1O'), false);
});

test('partial score gives credit for near answers', () => {
  assert.equal(spanPartialScore('1234', '1234'), 1);
  assert.equal(spanPartialScore('1234', '1235'), 0.75);
});

test('item rating gets harder with longer length / lower ms / higher stage', () => {
  const easy = spanItemRating({ length: 4, exposureMs: 800, stage: 1 });
  const hardLen = spanItemRating({ length: 6, exposureMs: 800, stage: 1 });
  const hardMs = spanItemRating({ length: 4, exposureMs: 500, stage: 1 });
  const hardStage = spanItemRating({ length: 4, exposureMs: 800, stage: 2 });
  assert.ok(hardLen > easy);
  assert.ok(hardMs > easy);
  assert.ok(hardStage > easy);
});

test('stage promotion requires stable windows and applies compensation', () => {
  let p = defaultSpanProfile();
  p.profileAdaptive.currentParams = { length: 10, exposureMs: 200, stage: 1 };
  p.profileAdaptive.RD_user = 120;
  p.profileAdaptive.rollingResults = [{S:0.9},{S:0.8},{S:0.85},{S:0.9}];

  p = maybePromoteSpanStage(p);
  assert.equal(p.stageHoldWindows, 1);

  p = maybePromoteSpanStage(p);
  assert.equal(p.profileAdaptive.currentParams.stage, 2);
  assert.ok(p.profileAdaptive.currentParams.length <= 9);
  assert.ok(p.profileAdaptive.currentParams.exposureMs >= 320);
});

test('persistence restart keeps saved adaptive params', () => {
  const p = normalizeSpanProfile({ profileAdaptive: { currentParams: { stage: 3, length: 9, exposureMs: 450 } } });
  assert.equal(p.profileAdaptive.currentParams.stage, 3);
  assert.equal(p.profileAdaptive.currentParams.length, 9);
  assert.equal(p.profileAdaptive.currentParams.exposureMs, 450);
});
