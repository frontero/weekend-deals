import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDuration, groupRounds, sizeLabel } from './rounds.js';

const scan = (id, groupKey, startedAt, finishedAt, changes = null, error = null) => ({
  id,
  groupKey,
  startedAt: `2026-10-23T${startedAt}:00Z`,
  finishedAt: finishedAt && `2026-10-23T${finishedAt}:00Z`,
  error,
  changes,
});
const changes = (down, up, biggest = []) => ({ prices: 100, compared: 90, down, up, swapped: 0, appeared: 0, gone: 0, biggest });

test('scans that follow each other form one round; a long pause starts the next', () => {
  // Newest first, as the API sends them.
  const history = [
    scan(4, 'a4-c0', '16:10', null),
    scan(3, 'a2-c0', '16:00', '16:10', changes(1, 0)),
    scan(2, 'a4-c0', '04:55', '05:05', changes(2, 3)),
    scan(1, 'a2-c0', '04:45', '04:55', changes(1, 1)),
  ];
  const [evening, morning] = groupRounds(history, { running: true });
  assert.deepEqual(evening.scans.map((item) => [item.id, item.state]), [[3, 'done'], [4, 'running']]);
  assert.equal(evening.state, 'running');
  assert.equal(evening.finishedAt, null);
  assert.deepEqual([morning.totals.down, morning.totals.up, morning.totals.prices], [3, 4, 200]);
  assert.equal(morning.finishedAt, '2026-10-23T05:05:00Z');

  // The same scan, once its process stopped, was interrupted.
  assert.equal(groupRounds(history, { running: false })[0].state, 'interrupted');
});

test('a round shows its largest price moves over all sizes, with the size they were for', () => {
  const move = (parkCode, oldCents, newCents) => ({ parkCode, parkName: parkCode, arrival: '2026-11-13', oldCents, newCents, kind: 'repriced' });
  const [round] = groupRounds([
    scan(2, 'a4-c2', '04:55', '05:05', changes(1, 0, [move('KWW', 50000, 42000)])),
    scan(1, 'a2-c0', '04:45', '04:55', changes(0, 1, [move('HRK', 30000, 31000)])),
  ]);
  assert.deepEqual(round.biggest.map((item) => [item.parkCode, item.size]), [['KWW', '4 volw. + 2 kind.'], ['HRK', '2 personen']]);
});

test('a failed scan marks its round, which then has no totals', () => {
  const [round] = groupRounds([scan(1, 'a2-c0', '04:45', '04:46', null, 'Landal answered 500')]);
  assert.equal(round.state, 'failed');
  assert.equal(round.totals, null);
});

test('labels sizes and durations', () => {
  assert.equal(sizeLabel('a6-c0'), '6 personen');
  assert.equal(formatDuration('2026-10-23T04:45:00Z', '2026-10-23T05:27:00Z'), '42 min');
  assert.equal(formatDuration('2026-10-23T04:45:00Z', '2026-10-23T05:50:00Z'), '1 u 5 min');
});
