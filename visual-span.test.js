import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSpanProfile,
  normalizeSpanProfile,
  getStageCharset,
  generateSpanStimulus,
  evaluateSpanAttempt,
  updateSpanProgress,
} from './visual-span.js';

test('stage charsets exclude O/o and keep 0', () => {
  const stage1 = getStageCharset(1);
  assert.ok(stage1.includes('0'));
  assert.ok(!stage1.includes('O'));

  const stage2 = getStageCharset(2);
  assert.ok(stage2.includes('0'));
  assert.ok(!stage2.includes('O'));

  const stage3 = getStageCharset(3);
  assert.ok(!stage3.includes('O'));
  assert.ok(!stage3.includes('o'));

  const stage4 = getStageCharset(4);
  assert.ok(stage4.includes('@'));
  assert.ok(stage4.includes('='));
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

test('progression increases length after 3 successes with cooldown', () => {
  let p = defaultSpanProfile();
  p = updateSpanProgress(p, true);
  p = updateSpanProgress(p, true);
  p = updateSpanProgress(p, true);
  assert.equal(p.currentLength, 5);
  assert.equal(p.cooldown, 1);

  const afterCooldownTry = updateSpanProgress(p, true);
  assert.equal(afterCooldownTry.currentLength, 5);
  assert.equal(afterCooldownTry.cooldown, 0);
});

test('progression reduces length on error with min clamp', () => {
  let p = normalizeSpanProfile({ currentLength: 4 });
  p = updateSpanProgress(p, false);
  assert.equal(p.currentLength, 4);

  p = normalizeSpanProfile({ currentLength: 8 });
  p = updateSpanProgress(p, false);
  assert.equal(p.currentLength, 7);
});

test('stage promotion requires two qualifying streaks at L>=10', () => {
  let p = normalizeSpanProfile({ currentStage: 1, currentLength: 10 });

  for(let i=0; i<3; i++) p = updateSpanProgress(p, true);
  assert.equal(p.currentStage, 1);
  assert.equal(p.promotionStreaksAt10, 1);

  for(let i=0; i<3; i++) p = updateSpanProgress(p, true);
  assert.equal(p.currentStage, 2);
  assert.equal(p.currentLength, 8);
});
