import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lastDays, leadCurve, leadPoints, momentGrid, parkGrid, percentChange, spanDays } from './analysis.js';

test('keeps the items of the last days before the newest one', () => {
  const items = [{ at: '2026-10-01T06:45:00Z' }, { at: '2026-10-20T06:45:00Z' }, { at: '2026-10-23T06:45:00Z' }];
  assert.deepEqual(lastDays(items, 7).map((item) => item.at.slice(8, 10)), ['20', '23']);
  assert.equal(lastDays(items, null).length, 3);
  assert.equal(percentChange(20000, 18000), -10);
  assert.equal(percentChange(null, 18000), null);
  assert.equal(spanDays(items), 22);
});

test('lays weekends of different seasons side by side by their run-up', () => {
  const weekends = [
    {
      arrival: '2026-11-13',
      series: [
        ['2026-10-30T06:00:00', 10, 1, 2, 40000, 4],
        ['2026-11-12T06:00:00', 5, 1, 2, 60000, 4],
        // After the weekend began: not part of its run-up.
        ['2026-11-15T06:00:00', 1, 1, 2, 99000, 4],
      ],
    },
  ];
  const points = leadPoints(weekends);
  assert.deepEqual(points.map((point) => [point.days, point.share]), [[14, 100], [1, 50]]);
  // 40000 and 60000 against their average of 66333 (all three rounds count for the usual level).
  assert.deepEqual(points.map((point) => point.index), [60.3, 90.5]);

  const curve = leadCurve(points);
  assert.deepEqual(curve.map((week) => [week.from, week.value, week.count]), [[0, 90.5, 1], [14, 60.3, 1]]);
  assert.deepEqual(leadCurve(points, 'share').map((week) => week.value), [50, 100]);
});

test('finds when in the week prices change', () => {
  const round = (at, compared, down, up) => ({ at, compared, down, up, swapped: 0 });
  const grid = momentGrid([
    round('2026-10-23T06:45:00', 100, 10, 5),
    round('2026-10-30T06:45:00', 100, 20, 5),
    round('2026-10-24T18:00:00', 100, 1, 1),
    // The first round of a size compares nothing.
    round('2026-10-24T06:45:00', 0, 0, 0),
  ]);
  const friday = grid.find((cell) => cell.weekday === 4 && cell.hour === 6);
  assert.deepEqual([friday.rounds, friday.changed, friday.dropped], [2, 20, 15]);
  assert.equal(grid.length, 2);
});

test("lays out a park's prices per weekend and round", () => {
  const grid = parkGrid([
    ['2026-10-22T06:45:00Z', '2026-11-13', 30000, 'a'],
    ['2026-10-22T06:45:00Z', '2026-11-20', 32000, 'a'],
    ['2026-10-22T18:00:00Z', '2026-11-13', 28000, 'b'],
  ]);
  assert.deepEqual(grid.weekends, ['2026-11-13', '2026-11-20']);
  const [first, second] = grid.perWeekend;
  assert.deepEqual([first.changes, first.swaps, first.lowest, first.current.cents], [1, 1, 28000, 28000]);
  // Not free in the latest round.
  assert.equal(second.current, null);
});
