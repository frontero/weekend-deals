import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monthGrid, pickRange, rangeDays } from './calendar.js';

test('lays out a month in weeks starting on Monday', () => {
  const weeks = monthGrid('2026-11');
  assert.equal(weeks[0][0].date, '2026-10-26');
  assert.equal(weeks[0][0].inMonth, false);
  assert.equal(weeks[0][6].date, '2026-11-01');
  assert.equal(weeks[0][6].inMonth, true);
  assert.equal(weeks.at(-1)[6].date, '2026-12-06');
  assert.ok(weeks.every((week) => week.length === 7));
});

test('the first click starts a range, the second closes it', () => {
  let range = pickRange({ from: '', to: '', complete: true }, '2026-11-06');
  assert.deepEqual(range, { from: '2026-11-06', to: '2026-11-06', complete: false });
  range = pickRange(range, '2026-11-27');
  assert.deepEqual(range, { from: '2026-11-06', to: '2026-11-27', complete: true });
});

test('an earlier second click starts over from there', () => {
  const range = pickRange({ from: '2026-11-20', to: '2026-11-20', complete: false }, '2026-11-06');
  assert.deepEqual(range, { from: '2026-11-06', to: '2026-11-06', complete: false });
});

test('a click after a finished range starts a new one', () => {
  const range = pickRange({ from: '2026-11-06', to: '2026-11-27', complete: true }, '2026-12-04');
  assert.deepEqual(range, { from: '2026-12-04', to: '2026-12-04', complete: false });
});

test('a range covers every day from the first Friday to the last Monday', () => {
  const days = rangeDays('2026-11-06', '2026-11-13');
  assert.equal(days.size, 11);
  assert.ok(days.has('2026-11-06') && days.has('2026-11-16'));
  assert.equal(rangeDays('', '').size, 0);
});
