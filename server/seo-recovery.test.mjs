import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RECOVERY_BASELINE, RECOVERY_DIP, searchCalendarStart, seoRecoveryReport } from './seo-recovery.mjs';
import { updateSeoRecoverySearch } from './search-console.mjs';

test('uses Pacific day boundaries on both daylight saving transitions', () => {
  assert.equal(searchCalendarStart('2026-03-08'), '2026-03-08T08:00:00.000Z');
  assert.equal(searchCalendarStart('2026-03-09'), '2026-03-09T07:00:00.000Z');
  assert.equal(searchCalendarStart('2026-11-01'), '2026-11-01T07:00:00.000Z');
  assert.equal(searchCalendarStart('2026-11-02'), '2026-11-02T08:00:00.000Z');
});

test('uses finalized page totals and reuses the two reference periods when newer totals arrive', async () => {
  let stored = null;
  const periods = [];
  const db = {
    seoSearchRecovery: async () => stored,
    saveSeoSearchRecovery: async (data) => { stored = data; },
  };
  const fetcher = async (_url, { body }) => {
    const { dimensions, startDate, endDate, dataState } = JSON.parse(body);
    assert.deepEqual(dimensions, ['page']);
    assert.equal(dataState, 'final');
    periods.push([startDate, endDate]);
    return Response.json({ rows: [
      { keys: ['https://parkjeweg.nl/park/test'], impressions: 10 },
      { keys: ['https://parkjeweg.nl/cijfers'], impressions: 99 },
    ] });
  };
  const update = (day) => updateSeoRecoverySearch(db, 'token', { days: [{ day }], checkedAt: day }, { fetcher });
  await update('2026-11-25');
  await update('2026-11-29');
  assert.deepEqual(periods, [['2026-11-20', '2026-11-22'], ['2026-11-23', '2026-11-25'], ['2026-11-27', '2026-11-29']]);
  assert.deepEqual(stored.recent.pages, { '/park/test': 10 });
});

test('ranks lost impressions by page and keeps absent crawl days separate from zero requests', async () => {
  const search = {
    checkedAt: '2026-12-02T08:00:00Z',
    baseline: { ...RECOVERY_BASELINE, pages: { '/park/een': 30, '/regio/twee': 10, '/land/drie': 10 } },
    dip: { ...RECOVERY_DIP, pages: { '/park/een': 4 } },
    recent: { start: '2026-11-27', end: '2026-11-29', pages: { '/regio/twee': 30, '/land/drie': 6 } },
  };
  const zero = { visits: { parks: 0, regions: 0 }, sampled: false };
  const db = {
    seoSearchRecovery: async () => search,
    seoCrawlDays: async () => ({
      '2026-11-23': zero, '2026-11-24': zero, '2026-11-25': zero,
      '2026-11-29': { visits: { parks: 2, regions: 1 }, sampled: true },
    }),
  };
  const report = await seoRecoveryReport(db);
  assert.equal(report.afterDip, true);
  assert.deepEqual(report.biggestLosses, [
    { path: '/park/een', before: 30, dip: 4, recent: 0 },
    { path: '/land/drie', before: 10, dip: 0, recent: 6 },
  ]);
  assert.deepEqual(report.periods[1].visits, { parks: 0, regions: 0 });
  assert.equal(report.periods[2].visits, null);
  assert.deepEqual(report.periods[2].impressions, { parks: 0, regions: 36 });
});
