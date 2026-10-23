import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildWatchStats, chanceOfRandom, compareWatch, dutchTime, nextSnapshot } from './watch.mjs';

const search = (key, ok = true) => ({ key, provider: key.split('|')[0], ok });

test('compares two runs only where both searches succeeded', () => {
  const previous = {
    searches: [search('landal|HRK|2026-10-30'), search('topparken|all|2026-10-30')],
    prices: { 'landal|HRK|2026-10-30|HRK|4A': 30000, 'landal|HRK|2026-10-30|HRK|6B': 40000, 'topparken|all|2026-10-30|topparken:1|': 50000 },
  };
  const current = {
    searches: [search('landal|HRK|2026-10-30'), search('topparken|all|2026-10-30', false)],
    prices: { 'landal|HRK|2026-10-30|HRK|4A': 28000, 'landal|HRK|2026-10-30|HRK|8C': 60000 },
  };
  const { summary, changes } = compareWatch(previous, current);
  assert.deepEqual(summary.landal, { searches: 1, failed: 0, compared: 1, up: 0, down: 1, in: 1, out: 1 });
  // Topparken failed this time: its missing price is no change.
  assert.deepEqual(summary.topparken, { searches: 1, failed: 1, compared: 0, up: 0, down: 0, in: 0, out: 0 });
  assert.deepEqual(changes, [{ provider: 'landal', park: 'HRK', accommodation: '4A', arrival: '2026-10-30', oldCents: 30000, newCents: 28000 }]);
  // The first run has nothing to compare with.
  assert.equal(compareWatch(null, current).changes.length, 0);
});

test('tells changes bunched in one hour from changes spread at random', () => {
  const spread = Array.from({ length: 24 }, () => ({ compared: 1000, changed: 10 }));
  assert.ok(chanceOfRandom(spread) > 0.5);
  const bunched = Array.from({ length: 24 }, (_, hour) => ({ compared: 1000, changed: hour === 6 ? 200 : 1 }));
  assert.ok(chanceOfRandom(bunched) < 0.001);
  assert.equal(chanceOfRandom([{ compared: 10, changed: 0 }]), null);
});

test('reads moments in Dutch time, also across the change to winter time', () => {
  assert.deepEqual(dutchTime('2026-10-23T04:15:00Z'), { weekday: 4, hour: 6, minute: 15, date: '2026-10-23' });
  assert.deepEqual(dutchTime('2026-10-26T05:15:00Z'), { weekday: 0, hour: 6, minute: 15, date: '2026-10-26' });
});

test('finds the hour a provider usually updates, from runs half an hour apart', () => {
  const runs = [];
  const changes = [];
  // Three days, a run every half hour; Landal changes 30 prices right after 06:00 Dutch time.
  for (let day = 0; day < 3; day += 1) {
    for (let slot = 0; slot < 48; slot += 1) {
      // From Dutch midnight (22:00 UTC in summer time).
      const at = new Date(Date.UTC(2026, 9, 19 + day, 22, 0) + slot * 30 * 60 * 1000).toISOString();
      const isUpdate = dutchTime(at).hour === 6 && dutchTime(at).minute === 30;
      runs.push({ at, summary: { landal: { searches: 15, failed: 0, compared: 200, up: isUpdate ? 10 : 0, down: isUpdate ? 20 : 0, in: 0, out: 0 } } });
      if (isUpdate) changes.push({ at, provider: 'landal', park: 'HRK', accommodation: '4A', arrival: '2026-10-30', oldCents: 1, newCents: 2 });
    }
  }
  const stats = buildWatchStats({ runs, changes, parks: new Map([['HRK', 'Hof van Saksen']]) });
  const landal = stats.providers.landal;
  assert.equal(stats.days, 3);
  assert.equal(landal.enough, true);
  assert.equal(landal.hours[6].changed, 90);
  assert.ok(landal.chanceByHour < 0.001);
  assert.deepEqual(landal.busiest.hours, [6]);
  assert.deepEqual(landal.usual, { hour: 6, days: 3, of: 3 });
  assert.equal(landal.batchShare, 1);
  assert.equal(stats.gaps.length, 0);
  assert.equal(stats.recent[0].parkName, 'Hof van Saksen');
});

test('keeps the last prices of a search that failed, so the next run still sees a change', () => {
  const before = { searches: [search('landal|HRK|2026-10-30'), search('molecaten|NL|2026-10-30')], prices: { 'landal|HRK|2026-10-30|HRK|4A': 1, 'molecaten|NL|2026-10-30|molecaten:a|7': 5 } };
  const failedRun = { searches: [search('landal|HRK|2026-10-30'), search('molecaten|NL|2026-10-30', false)], prices: { 'landal|HRK|2026-10-30|HRK|4A': 2 } };
  const kept = nextSnapshot(before, failedRun);
  assert.deepEqual(kept.prices, { 'landal|HRK|2026-10-30|HRK|4A': 2, 'molecaten|NL|2026-10-30|molecaten:a|7': 5 });
  const after = { searches: [search('landal|HRK|2026-10-30'), search('molecaten|NL|2026-10-30')], prices: { 'landal|HRK|2026-10-30|HRK|4A': 2, 'molecaten|NL|2026-10-30|molecaten:a|7': 6 } };
  assert.equal(compareWatch(kept, after).changes[0].provider, 'molecaten');
  assert.equal(nextSnapshot(before, after), after);
});
