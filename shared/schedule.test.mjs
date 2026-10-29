import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lastScheduledRound, nextScheduledRound, roundFor } from './schedule.mjs';

const at = (day, time) => new Date(`2026-10-${day}T${time}:00`);

test('the last round time is the latest scheduled one that has passed, also from the evening before', () => {
  assert.deepEqual(lastScheduledRound('twice-daily', at(23, '07:10')), at(23, '06:45'));
  assert.deepEqual(lastScheduledRound('twice-daily', at(23, '18:00')), at(23, '18:00'));
  assert.deepEqual(lastScheduledRound('twice-daily', at(23, '05:30')), at(22, '18:00'));
  assert.deepEqual(lastScheduledRound('daily', at(23, '05:30')), at(22, '06:45'));
});

test('without a schedule, rounds only run on request', () => {
  assert.equal(lastScheduledRound('manual', at(23, '12:00')), null);
});

test('the next round is later today, or the first one tomorrow', () => {
  assert.deepEqual(nextScheduledRound('twice-daily', at(23, '12:00')), at(23, '18:00'));
  assert.deepEqual(nextScheduledRound('twice-daily', at(23, '18:00')), at(24, '06:45'));
  assert.deepEqual(nextScheduledRound('daily', at(23, '05:00')), at(23, '06:45'));
  assert.equal(nextScheduledRound('manual', at(23, '12:00')), null);
});

test('a series with a requirement takes its prices from the morning round only', () => {
  const evening = new Date(2026, 9, 29, 20, 0);
  const hotTub = { adults: 2, children: 0, accommodationFeatures: ['9266.16402'] };
  const couple = { adults: 2, children: 0, accommodationFeatures: [] };
  assert.equal(roundFor(couple, 'twice-daily', evening).getHours(), 18);
  assert.equal(roundFor(hotTub, 'twice-daily', evening).getHours(), 6);
  assert.equal(roundFor(hotTub, 'manual', evening), null);
});
