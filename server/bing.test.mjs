import assert from 'node:assert/strict';
import { test } from 'node:test';
import { updateBing } from './bing.mjs';

const NOW = Date.parse('2026-11-24T10:00:00Z');
const date = (day) => `/Date(${Date.parse(`${day}T08:00:00Z`)}-0700)/`;
const ANSWERS = {
  GetUserSites: [{ Url: 'https://example.com/', IsVerified: true }, { Url: 'https://parkjeweg.nl/', IsVerified: true }],
  GetRankAndTrafficStats: [{ Date: date('2026-11-22'), Clicks: 2, Impressions: 40 }, { Date: date('2026-11-21'), Clicks: 1, Impressions: 30 }, { Date: date('2026-09-01'), Clicks: 9, Impressions: 900 }],
  GetQueryStats: [
    { Date: date('2026-11-14'), Query: 'roompot zeeland', Clicks: 1, Impressions: 10, AvgImpressionPosition: 8, AvgClickPosition: 3 },
    { Date: date('2026-11-21'), Query: 'roompot zeeland', Clicks: 0, Impressions: 30, AvgImpressionPosition: 4, AvgClickPosition: 0 },
    { Date: date('2026-11-21'), Query: 'landal drenthe', Clicks: 0, Impressions: 5, AvgImpressionPosition: 12, AvgClickPosition: 0 },
    { Date: date('2026-08-01'), Query: 'oud', Clicks: 5, Impressions: 500, AvgImpressionPosition: 1, AvgClickPosition: 1 },
  ],
  GetPageStats: [{ Date: date('2026-11-21'), Query: 'https://parkjeweg.nl/last-minute', Clicks: 1, Impressions: 7, AvgImpressionPosition: 6, AvgClickPosition: 6 }],
  GetLinkCounts: { TotalPages: 1, Links: [{ Url: 'https://parkjeweg.nl/parken', Count: 2 }, { Url: 'https://parkjeweg.nl/', Count: 5 }] },
  GetCrawlStats: [{ Date: date('2026-11-20'), CrawledPages: 10 }, { Date: date('2026-11-23'), CrawledPages: 120, InIndex: 80, InLinks: 7, CrawlErrors: 1, Code4xx: 2, Code5xx: 0 }],
  GetKeywordStats: [{ Date: date('2026-11-15'), Query: 'roompot zeeland', Impressions: 300, BroadImpressions: 900 }, { Date: date('2026-11-08'), Query: 'roompot zeeland', Impressions: 200, BroadImpressions: 700 }],
};

function bing(calls, broken = []) {
  return async (url) => {
    const { pathname, searchParams } = new URL(url);
    const method = pathname.split('/').at(-1);
    calls.push([method, Object.fromEntries(searchParams)]);
    return broken.includes(method) ? Response.json({ Message: 'no' }, { status: 400 }) : Response.json({ d: ANSWERS[method] });
  };
}
const store = (state = null) => ({ bing: async () => state, saveBing: async (next) => (state = next), get state() { return state; } });

test("reads this site's figures of the last four weeks, added up per search and page", async () => {
  const calls = [];
  const db = store();
  assert.equal(await updateBing(db, 'key-1', { fetcher: bing(calls), now: NOW, searches: ['roompot zeeland'] }), 6);
  assert.ok(calls.every(([, params]) => params.apikey === 'key-1'));
  assert.equal(calls[1][1].siteUrl, 'https://parkjeweg.nl/');
  assert.deepEqual(calls.at(-1), ['GetKeywordStats', { q: 'roompot zeeland', country: 'nl', language: 'nl-NL', apikey: 'key-1' }]);
  assert.deepEqual(db.state.days, [{ day: '2026-11-21', clicks: 1, impressions: 30 }, { day: '2026-11-22', clicks: 2, impressions: 40 }]);
  assert.deepEqual(db.state.queries, [
    { label: 'roompot zeeland', clicks: 1, impressions: 40, position: 5 },
    { label: 'landal drenthe', clicks: 0, impressions: 5, position: 12 },
  ]);
  assert.deepEqual(db.state.pages, [{ label: '/last-minute', clicks: 1, impressions: 7, position: 6 }]);
  assert.deepEqual(db.state.links, { total: 7, more: false, pages: [{ path: '/', count: 5 }, { path: '/parken', count: 2 }] });
  assert.deepEqual(db.state.crawl, { day: '2026-11-23', crawled: 120, inIndex: 80, inLinks: 7, errors: 1, notFound: 2, failed: 0 });
  assert.deepEqual(db.state.sizes, [{ query: 'roompot zeeland', exact: 500, broad: 1600, weeks: 2 }]);
});

test('reads once a day, and a part that fails keeps what was read before', async () => {
  const db = store({ checkedAt: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(), queries: [{ label: 'eerder' }] });
  assert.equal(await updateBing(db, 'k', { fetcher: () => assert.fail('not due'), now: NOW }), null);
  const later = NOW + 24 * 60 * 60 * 1000;
  assert.equal(await updateBing(db, 'k', { fetcher: bing([], ['GetQueryStats']), now: later }), 4);
  assert.deepEqual(db.state.queries, [{ label: 'eerder' }]);
  assert.equal(db.state.checkedAt, new Date(later).toISOString());
});

test('an error never repeats the key, and a site Bing does not know stops the read', async () => {
  const db = store();
  await assert.rejects(updateBing(db, 'secret-key', { fetcher: async () => Response.json({ Message: 'InvalidApiKey' }, { status: 400 }), now: NOW }), (error) => /Bing GetUserSites answered 400: InvalidApiKey/.test(error.message) && !error.message.includes('secret-key'));
  await assert.rejects(updateBing(db, 'k', { fetcher: async () => Response.json({ d: [{ Url: 'https://example.com/' }] }), now: NOW }), /no verified site/);
  assert.equal(db.state, null);
});
