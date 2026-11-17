import assert from 'node:assert/strict';
import { test } from 'node:test';
import { budgetLevel, checkBudget, tursoUsage } from './budget.mjs';

const reads = (rowsRead) => ({ rowsRead, rowsWritten: 0 });

test('holds back at 70% of a limit and stops at 90%', () => {
  const late = new Date('2026-12-28T12:00:00Z');
  assert.equal(budgetLevel(reads(300_000_000), late), 'normal');
  assert.equal(budgetLevel(reads(350_000_000), late), 'essential');
  assert.equal(budgetLevel({ rowsRead: 0, rowsWritten: 7_500_000 }, late), 'essential');
  assert.equal(budgetLevel(reads(450_000_000), late), 'stop');
  assert.equal(budgetLevel(null, late), 'normal');
});

test('holds back early when the pace would reach the stop share before the month ends', () => {
  // 20% used a third into the month heads for 60%; 40% heads for 120%.
  assert.equal(budgetLevel(reads(100_000_000), new Date('2026-12-11T00:00:00Z')), 'normal');
  assert.equal(budgetLevel(reads(200_000_000), new Date('2026-12-11T00:00:00Z')), 'essential');
  // On the first day a busy start says too little.
  assert.equal(budgetLevel(reads(30_000_000), new Date('2026-12-01T12:00:00Z')), 'normal');
});

test('reads the organisation usage from Turso and leaves it out without a token', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, auth: options.headers.Authorization });
    return Response.json({ organization: { uuid: 'x', usage: { rows_read: 12, rows_written: 3 } } });
  };
  assert.deepEqual(await tursoUsage({ org: 'weekenddeals', token: 't' }, fetchImpl), { rowsRead: 12, rowsWritten: 3 });
  assert.deepEqual(calls, [{ url: 'https://api.turso.tech/v1/organizations/weekenddeals/usage', auth: 'Bearer t' }]);
  assert.equal(await tursoUsage({ org: 'weekenddeals', token: '' }, fetchImpl), null);
  await assert.rejects(tursoUsage({ org: 'o', token: 't' }, async () => new Response('', { status: 401 })), /401/);
});

test('a job runs as usual when the usage cannot be read', async () => {
  const lines = [];
  assert.deepEqual(await checkBudget({}, (line) => lines.push(line)), { level: 'normal', percent: null });
  assert.equal(lines.length, 0);
});
