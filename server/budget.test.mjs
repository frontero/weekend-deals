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

test("uses the plan's own limits and billing period", () => {
  const paid = { ...reads(505_000_000), limits: { rowsRead: 2_500_000_000, rowsWritten: 25_000_000 } };
  const period = { periodStart: '2026-11-17T10:00:00Z', periodEnd: '2026-12-17T10:00:00Z' };
  // Over the free limit, but a fifth of a paid plan's, early in its period.
  assert.equal(budgetLevel({ ...paid, ...period }, new Date('2026-11-18T10:00:00Z')), 'normal');
  // Half the paid limit a fifth into the period heads for 250%.
  assert.equal(budgetLevel({ ...paid, rowsRead: 1_250_000_000, ...period }, new Date('2026-11-23T10:00:00Z')), 'essential');
});

test('reads the usage, plan and period from Turso, and leaves them out without a token', async () => {
  const answers = {
    usage: { organization: { uuid: 'x', usage: { rows_read: 12, rows_written: 3 } } },
    subscription: { subscription: { plan: 'developer', current_billing_period_start: '2026-11-17T10:00:00Z', current_billing_period_end: '2026-12-17T10:00:00Z' } },
    plans: { plans: [{ name: 'starter', quotas: { rowsRead: 5, rowsWritten: 1 } }, { name: 'developer', quotas: { rowsRead: 2_500_000_000, rowsWritten: 25_000_000 } }] },
  };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(options.headers.Authorization);
    return Response.json(answers[url.split('/').at(-1)]);
  };
  assert.deepEqual(await tursoUsage({ org: 'weekenddeals', token: 't' }, fetchImpl), {
    rowsRead: 12,
    rowsWritten: 3,
    limits: { rowsRead: 2_500_000_000, rowsWritten: 25_000_000 },
    periodStart: '2026-11-17T10:00:00Z',
    periodEnd: '2026-12-17T10:00:00Z',
  });
  assert.deepEqual(calls, ['Bearer t', 'Bearer t', 'Bearer t']);
  assert.equal(await tursoUsage({ org: 'weekenddeals', token: '' }, fetchImpl), null);
  await assert.rejects(tursoUsage({ org: 'o', token: 't' }, async () => new Response('', { status: 401 })), /401/);
});

test('a job runs as usual when the usage cannot be read', async () => {
  const lines = [];
  assert.deepEqual(await checkBudget({}, (line) => lines.push(line)), { level: 'normal', percent: null });
  assert.equal(lines.length, 0);
});
