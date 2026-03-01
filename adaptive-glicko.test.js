import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedScore, updateGlickoLite, selectCandidate, targetItemRating } from './adaptive-glicko.js';

test('expectedScore decreases as R_item increases', () => {
  const e1 = expectedScore(1000, 200, 900);
  const e2 = expectedScore(1000, 200, 1100);
  assert.ok(e1 > e2);
});

test('updateGlickoLite moves rating in correct direction', () => {
  const win = updateGlickoLite({ R_user: 1000, RD_user: 250, R_item: 1050, S: 1 });
  const loss = updateGlickoLite({ R_user: 1000, RD_user: 250, R_item: 950, S: 0 });
  assert.ok(win.R_user > 1000);
  assert.ok(loss.R_user < 1000);
});

test('RD shrinks slightly when surprise is low', () => {
  const E = expectedScore(1000, 250, 1000);
  const out = updateGlickoLite({ R_user: 1000, RD_user: 250, R_item: 1000, S: E });
  assert.ok(out.RD_user < 250);
});

test('selectCandidate picks closest to target rating', () => {
  const itemRating = (x) => x.r;
  const current = { r: 1000, s: 1 };
  const candidates = [{ r: 980, s: 1 }, { r: 1120, s: 2 }, { r: 1080, s: 3 }];
  const picked = selectCandidate({ currentParams: current, candidates, itemRating, targetRating: 1100 });
  assert.equal(picked.r, 1080);
});

test('targetItemRating lowers target by RD margin', () => {
  const tLow = targetItemRating(1000, 100);
  const tHigh = targetItemRating(1000, 300);
  assert.ok(tHigh < tLow);
});
