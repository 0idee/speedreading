import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultStaircaseState, updateStaircase, staircaseDirectionFromScore } from './adaptive-staircase.js';

test('1-up/3-down produces harder only after 3 successes', () => {
  let s = defaultStaircaseState({ nDown: 3, stepSize: 1 });
  let out = updateStaircase(s, 'harder', { nDown: 3 });
  s = out.state;
  assert.equal(out.direction, 'none');

  out = updateStaircase(s, 'harder', { nDown: 3 });
  s = out.state;
  assert.equal(out.direction, 'none');

  out = updateStaircase(s, 'harder', { nDown: 3 });
  assert.equal(out.direction, 'harder');
});

test('inversions reduce step size', () => {
  let s = defaultStaircaseState({ nDown: 2, stepSize: 1 });
  s = updateStaircase(s, 'harder', { nDown: 2 }).state;
  s = updateStaircase(s, 'harder', { nDown: 2 }).state; // harder output
  s = updateStaircase(s, 'easier', { nDown: 2 }).state; // inversion 1
  const out = updateStaircase(s, 'harder', { nDown: 2 });
  assert.ok(out.state.stepSize <= 1);
});

test('direction from score uses threshold', () => {
  assert.equal(staircaseDirectionFromScore(0.9, { successThreshold: 0.8 }), 'harder');
  assert.equal(staircaseDirectionFromScore(0.5, { successThreshold: 0.8 }), 'easier');
});
