import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUserRating,
  computeItemRating,
  expectedScore,
  updateUserRating,
  selectNextItem,
  buildSpanItemPool,
} from './elo.js';

test('normalizeUserRating provides defaults and clamps', () => {
  const d = normalizeUserRating({});
  assert.equal(d.R_user, 1000);
  assert.equal(d.RD_user, 250);

  const c = normalizeUserRating({ R_user: 99999, RD_user: 1 });
  assert.equal(c.R_user, 3000);
  assert.equal(c.RD_user, 60);
});

test('computeItemRating grows with length and charset complexity', () => {
  const easy = computeItemRating({ length: 3, charset: { az: true } });
  const hard = computeItemRating({ length: 12, charset: { az: true, AZ: true, n09: true, us: true } });
  assert.ok(hard > easy);
});

test('expectedScore around 0.5 for equal ratings', () => {
  const e = expectedScore(1000, 200, 1000);
  assert.ok(Math.abs(e - 0.5) < 1e-9);
});

test('updateUserRating increases after good score and reduces RD', () => {
  const next = updateUserRating({ R_user: 1000, RD_user: 250, R_item: 1050, score: 1 });
  assert.ok(next.R_user > 1000);
  assert.ok(next.RD_user <= 250);
});

test('updateUserRating decreases after poor score', () => {
  const next = updateUserRating({ R_user: 1200, RD_user: 180, R_item: 1000, score: 0 });
  assert.ok(next.R_user < 1200);
});

test('selectNextItem returns item close to user rating', () => {
  const pool = buildSpanItemPool();
  const item = selectNextItem({ userRating: { R_user: 1000, RD_user: 120 }, itemPool: pool });
  assert.ok(item);
  assert.ok(Number.isFinite(item.R_item));
});

test('selectNextItem edge: empty pool -> null', () => {
  const item = selectNextItem({ userRating: { R_user: 1000, RD_user: 250 }, itemPool: [] });
  assert.equal(item, null);
});
