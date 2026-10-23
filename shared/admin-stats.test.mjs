import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAdminStats } from './admin-stats.mjs';

const round = (id, startedAt, parks, weekends = {}) => ({
  id,
  startedAt,
  changes: { compared: 10, down: 2, up: 1, swapped: 0, appeared: 0, gone: 1 },
  stats: { all: [3, 100, 150, 200, 250], weekends, parks, providers: { landal: 3 } },
});

test('charts a party size per round, per weekend and per park', () => {
  const rounds = [
    round(1, '2026-10-10T04:45:00Z', { HRK: [2, 30000, 31000], KWW: [1, 50000, 50000] }, { '2026-11-13': [2, 1, 2, 3, 4] }),
    round(2, '2026-10-17T04:45:00Z', { HRK: [2, 28000, 30000] }, { '2026-11-13': [1, 5, 6, 7, 8], '2026-11-20': [1, 9, 9, 9, 9] }),
    round(3, '2026-10-17T16:00:00Z', { HRK: [1, 29000, 29000], KWW: [1, 45000, 45000] }),
  ];
  const parks = new Map([['HRK', { name: 'Park HRK', provider: 'landal', city: 'Ede', country: 'NL' }]]);
  const stats = buildAdminStats({ groupKey: 'a2-c0', rounds, parks, now: new Date('2026-10-18T00:00:00Z') });

  assert.equal(stats.since, '2026-10-10T04:45:00Z');
  assert.deepEqual(stats.rounds.map((item) => [item.id, item.parks, item.down]), [[1, 2, 2], [2, 1, 2], [3, 2, 2]]);
  assert.deepEqual(stats.weekends.map((item) => [item.arrival, item.series.length]), [['2026-11-13', 2], ['2026-11-20', 1]]);

  const hrk = stats.parks.find((park) => park.code === 'HRK');
  assert.deepEqual(
    { weekends: hrk.weekends, min: hrk.min, beforeMin: hrk.beforeMin, lowest: hrk.lowest, highest: hrk.highest, changes: hrk.changes },
    { weekends: 1, min: 29000, beforeMin: 30000, lowest: 28000, highest: 30000, changes: 2 },
  );
  assert.equal(hrk.name, 'Park HRK');
  assert.deepEqual(hrk.spark, [30000, 28000, 29000]);

  // A park without a free weekend in a round has a gap there, and does not count as a price change.
  const kww = stats.parks.find((park) => park.code === 'KWW');
  assert.deepEqual(kww.spark, [50000, null, 45000]);
  assert.equal(kww.changes, 0);
  assert.equal(kww.name, 'KWW');
});

test('has nothing to chart before the first summarised round', () => {
  const stats = buildAdminStats({ groupKey: 'a2-c0', rounds: [], parks: new Map() });
  assert.deepEqual([stats.rounds, stats.weekends, stats.parks, stats.since], [[], [], [], null]);
});
