import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quantile, scanStats, spread } from './scan-stats.mjs';

const row = (parkCode, arrival, priceCents, provider = 'landal') => ({ parkCode, arrival, priceCents, provider });

test('quartiles interpolate between neighbouring prices', () => {
  assert.equal(quantile([100, 200, 300, 400], 0.5), 250);
  assert.equal(quantile([100, 200, 300, 400, 500], 0.25), 200);
  assert.equal(quantile([], 0.5), null);
  assert.deepEqual(spread([400, 100, 300, 200]), [4, 100, 175, 250, 325]);
});

test('sums up a round per weekend, per park and per provider', () => {
  const stats = scanStats([
    row('HRK', '2026-11-13', 30000),
    row('HRK', '2026-11-20', 34000),
    row('KWW', '2026-11-13', 50000),
    row('topparken:1', '2026-11-13', 40000, 'topparken'),
  ]);
  assert.deepEqual(stats.all, [4, 30000, 33000, 37000, 42500]);
  assert.deepEqual(stats.weekends['2026-11-13'], [3, 30000, 35000, 40000, 45000]);
  assert.deepEqual(stats.weekends['2026-11-20'], [1, 34000, 34000, 34000, 34000]);
  assert.deepEqual(stats.parks.HRK, [2, 30000, 32000]);
  assert.deepEqual(stats.providers, { landal: 3, topparken: 1 });
});
