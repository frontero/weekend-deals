import assert from 'node:assert/strict';
import { test } from 'node:test';
import { announceNewPages, INDEXNOW_KEY } from './indexnow.mjs';

const store = (pages, announced) => ({
  pagePaths: async () => pages.map((path) => ({ path })),
  announcedPages: async () => announced,
  saveAnnouncedPages: async (paths) => (announced = paths),
  get announced() {
    return announced;
  },
});

test('announces only pages not announced before, and forgets pages that are gone', async () => {
  const db = store(['/parken', '/aanbieder/roompot'], ['/parken', '/weekend/2026-01-02']);
  const calls = [];
  const sent = await announceNewPages(db, { fetcher: async (url, options) => (calls.push([url, JSON.parse(options.body)]), new Response(null, { status: 202 })) });
  assert.equal(sent, 1);
  assert.equal(calls[0][0], 'https://api.indexnow.org/indexnow');
  assert.deepEqual(calls[0][1], { host: 'parkjeweg.nl', key: INDEXNOW_KEY, keyLocation: `https://parkjeweg.nl/${INDEXNOW_KEY}.txt`, urlList: ['https://parkjeweg.nl/aanbieder/roompot'] });
  assert.deepEqual(db.announced, ['/parken', '/aanbieder/roompot']);
  assert.equal(await announceNewPages(db, { fetcher: () => assert.fail('nothing new') }), 0);
});

test('a refusal keeps the pages for the next round', async () => {
  const db = store(['/parken'], []);
  await assert.rejects(announceNewPages(db, { fetcher: async () => new Response(null, { status: 403 }) }), /IndexNow answered 403/);
  assert.deepEqual(db.announced, []);
});
