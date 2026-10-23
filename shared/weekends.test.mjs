import assert from 'node:assert/strict';
import { test } from 'node:test';
import { upcomingWeekends } from './weekends.mjs';

test('starts at the next Friday and runs Friday to Monday', () => {
  assert.deepEqual(upcomingWeekends('2026-10-22', 2), [
    { arrival: '2026-10-23', departure: '2026-10-26' },
    { arrival: '2026-10-30', departure: '2026-11-02' },
  ]);
});

test('includes today when today is a Friday', () => {
  assert.deepEqual(upcomingWeekends('2026-10-23', 1), [{ arrival: '2026-10-23', departure: '2026-10-26' }]);
});

test('is not shifted by the daylight saving change', () => {
  const weekends = upcomingWeekends('2026-10-22', 3);
  assert.deepEqual(
    weekends.map((weekend) => weekend.arrival),
    ['2026-10-23', '2026-10-30', '2026-11-06'],
  );
});
