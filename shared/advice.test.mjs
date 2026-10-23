import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availabilityTrends, bookingAdvice } from './advice.mjs';

const base = {
  today: '2026-11-01',
  arrival: '2026-12-11',
  priceCents: 30000,
  lowestCents: 30000,
  highestCents: 30000,
  observations: 8,
  firstObservedAt: '2026-10-22T08:00:00Z',
  referenceCents: 30000,
  referenceAt: '2026-10-28T08:00:00Z',
  availability: { firstCount: 200, latestCount: 196, firstAt: '2026-10-22T08:00:00Z' },
};
const codes = (advice) => advice.reasons.map((reason) => reason.code);

test('without a few days of history there is no advice yet', () => {
  const advice = bookingAdvice({ ...base, referenceCents: null, referenceAt: null, observations: 2 });
  assert.equal(advice.verdict, 'neutral');
  assert.deepEqual(codes(advice), ['too-new']);
});

test('a rising price says book now', () => {
  const advice = bookingAdvice({ ...base, priceCents: 33000, lowestCents: 30000, highestCents: 33000 });
  assert.equal(advice.verdict, 'book');
  assert.equal(advice.trend, 'up');
  assert.deepEqual(advice.reasons[0], { code: 'rising', share: 0.1, since: '2026-10-28T08:00:00Z' });
});

test('a falling price with time left says waiting can pay off', () => {
  const advice = bookingAdvice({ ...base, priceCents: 27000, lowestCents: 27000, highestCents: 30000 });
  assert.equal(advice.verdict, 'wait');
  assert.equal(advice.trend, 'down');
  assert.deepEqual(codes(advice), ['falling']);
});

test('a falling price close to the weekend gives no clear advice', () => {
  const advice = bookingAdvice({ ...base, today: '2026-11-25', priceCents: 27000, lowestCents: 27000, highestCents: 30000 });
  assert.equal(advice.verdict, 'neutral');
  assert.deepEqual(codes(advice), ['falling']);
});

test('a weekend that is filling up says book now, even while the price falls', () => {
  const advice = bookingAdvice({
    ...base,
    priceCents: 27000,
    lowestCents: 27000,
    highestCents: 30000,
    availability: { firstCount: 200, latestCount: 150, firstAt: '2026-10-22T08:00:00Z' },
  });
  assert.equal(advice.verdict, 'book');
  assert.deepEqual(codes(advice), ['selling-out', 'falling']);
  assert.equal(advice.reasons[0].share, 0.25);
});

test('the lowest price seen so far, below earlier prices, says book now', () => {
  const advice = bookingAdvice({ ...base, priceCents: 29400, lowestCents: 29400, highestCents: 31000, referenceCents: 29500 });
  assert.equal(advice.verdict, 'book');
  assert.deepEqual(codes(advice), ['lowest-yet']);
});

test('a weekend within a week says book now', () => {
  const advice = bookingAdvice({ ...base, today: '2026-12-06' });
  assert.equal(advice.verdict, 'book');
  assert.deepEqual(advice.reasons[0], { code: 'leaving-soon', days: 5 });
});

test('summarises per provider and weekend how many parks were offered first and last', () => {
  const trends = availabilityTrends([
    { provider: 'landal', arrival: '2026-12-11', observedAt: '2026-10-20T08:00:00Z', parkCount: 200 },
    { provider: 'molecaten', arrival: '2026-12-11', observedAt: '2026-10-20T08:00:00Z', parkCount: 9 },
    { provider: 'landal', arrival: '2026-12-11', observedAt: '2026-10-25T08:00:00Z', parkCount: 170 },
  ]);
  assert.deepEqual(trends.get('landal|2026-12-11'), { firstCount: 200, latestCount: 170, firstAt: '2026-10-20T08:00:00Z' });
  assert.deepEqual(trends.get('molecaten|2026-12-11'), { firstCount: 9, latestCount: 9, firstAt: '2026-10-20T08:00:00Z' });
});

test('a steady price gives no clear advice', () => {
  const advice = bookingAdvice(base);
  assert.equal(advice.verdict, 'neutral');
  assert.deepEqual(codes(advice), ['stable']);
});
