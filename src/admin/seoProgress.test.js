import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shiftDays } from '../../shared/weekends.mjs';
import { searchProgress } from './seoProgress.js';

const daysFrom = (start, days, impressions, clicks) => Array.from({ length: days }, (_, offset) => ({
  day: shiftDays(start, offset), impressions, clicks,
}));

test('compares two equally long periods of Google site totals, with CTR based on their totals', () => {
  const previous = daysFrom('2026-11-08', 7, 20, 1);
  const current = daysFrom('2026-11-15', 6, 10, 0);
  const last = { day: '2026-11-21', impressions: 40, clicks: 10 };
  const progress = searchProgress([last, ...previous, ...current], 7);
  assert.deepEqual([progress.start, progress.end, progress.previousStart, progress.previousEnd], ['2026-11-15', '2026-11-21', '2026-11-08', '2026-11-14']);
  assert.deepEqual(progress.current, { impressions: 100, clicks: 10, ctr: 0.1 });
  assert.deepEqual(progress.previous, { impressions: 140, clicks: 7, ctr: 0.05 });
});

test('an absent day holds back the comparison, while a reported zero day counts as available', () => {
  const days = daysFrom('2026-10-01', 56, 0, 0);
  assert.deepEqual(searchProgress(days, 28).previous, { impressions: 0, clicks: 0, ctr: null });
  const partial = searchProgress(days.filter((row) => row.day !== '2026-10-28'), 28);
  assert.equal(partial.currentRows.length, 28);
  assert.equal(partial.previousAvailable, 27);
  assert.equal(partial.previous, null);
  assert.equal(searchProgress([], 7), null);
});
