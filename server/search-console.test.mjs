import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';
import { shiftDays } from '../shared/weekends.mjs';
import { accessToken, searchAnalytics, serviceAccount, updateSeoImpressionWeeks } from './search-console.mjs';
import { TRACKED_INDEX_PAGES, trackedIndexRows } from './index-tracking.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const account = { client_email: 'robot@project.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };

test('reads the service account from one base64 line, and tells when the key file is not one', () => {
  const env = { GSC_SERVICE_ACCOUNT: Buffer.from(JSON.stringify(account)).toString('base64') };
  assert.equal(serviceAccount(env).client_email, account.client_email);
  assert.equal(serviceAccount({}), null);
  assert.throws(() => serviceAccount({ GSC_SERVICE_ACCOUNT: Buffer.from('{}').toString('base64') }), /client_email/);
});

test('asks Google for a read-only token with a signed request, and Search Console with that token', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return url.includes('oauth2') ? Response.json({ access_token: 'token-1' }) : Response.json({ rows: [{ keys: ['vakantiepark kerst'], clicks: 3, impressions: 40, ctr: 0.075, position: 8.2 }] });
  };
  const token = await accessToken(account, { fetcher, now: Date.parse('2026-11-19T12:00:00Z') });
  assert.equal(token, 'token-1');
  const [header, claims, signature] = calls[0].init.body.get('assertion').split('.');
  assert.ok(createVerify('RSA-SHA256').update(`${header}.${claims}`).verify(publicKey, signature, 'base64url'), 'signed with the account key');
  const read = JSON.parse(Buffer.from(claims, 'base64url'));
  assert.equal(read.iss, account.client_email);
  assert.equal(read.scope, 'https://www.googleapis.com/auth/webmasters.readonly');
  assert.equal(read.exp - read.iat, 3600);

  const rows = await searchAnalytics(token, { startDate: '2026-11-01', endDate: '2026-11-18', dimensions: ['query'] }, { fetcher });
  assert.equal(rows[0].keys[0], 'vakantiepark kerst');
  assert.equal(calls[1].url, 'https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aparkjeweg.nl/searchAnalytics/query');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer token-1');
  await assert.rejects(searchAnalytics(token, { dimensions: [] }, { fetcher: async () => new Response('no access', { status: 403 }) }), /403: no access/);
});

test("a round's reading stores the search figures, the sitemap state and what Google has of the pages longest unchecked", async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { connectFile } = await import('./connect.mjs');
  const { openDatabase } = await import('./db.mjs');
  const { updateSearchConsole } = await import('./search-console.mjs');
  const directory = mkdtempSync(join(tmpdir(), 'weekend-deals-gsc-'));
  const db = await openDatabase(connectFile(join(directory, 'gsc.db')).client);
  const page = (path) => ({ path, title: path, description: '', image: null, body: '' });
  await db.replacePages([page('/parken'), page('/weekenden'), page('/feestdag/kerst'), page('/land/duitsland')], '2026-11-19T06:00:00.000Z');
  await db.savePageIndex({ path: '/parken', verdict: 'PASS', coverage: 'Ingediend en geïndexeerd', lastCrawl: null, checkedAt: '2026-11-18T06:00:00.000Z' });
  assert.deepEqual(await db.pagesToInspect(2, ['/parken', '/cijfers']), ['/parken', '/feestdag/kerst']);

  const inspected = [];
  const fetcher = async (url, init) => {
    if (url.includes('oauth2')) return Response.json({ access_token: 't' });
    if (url.endsWith('/searchAnalytics/query')) {
      const request = JSON.parse(init.body);
      if (request.dimensions.length === 1) {
        assert.deepEqual(request.dimensions, ['date']);
        assert.equal(request.endDate, '2026-11-18');
        return Response.json({ rows: [{ keys: ['2026-11-17'], clicks: 5, impressions: 70, ctr: 5 / 70, position: 7 }] });
      }
      return Response.json({ rows: [{ keys: ['2026-11-17', 'https://parkjeweg.nl/feestdag/kerst', 'vakantiepark kerst'], clicks: 2, impressions: 30, ctr: 0.07, position: 9 }, { keys: ['2026-11-17', 'https://parkjeweg.nl/', 'parkje weg'], clicks: 1, impressions: 10, ctr: 0.1, position: 1 }] });
    }
    if (url.endsWith('/sitemaps')) return Response.json({ sitemap: [{ path: 'https://parkjeweg.nl/sitemap.xml', lastDownloaded: '2026-11-18T08:58:06Z', errors: '0', warnings: '1', isPending: false }] });
    const { inspectionUrl } = JSON.parse(init.body);
    inspected.push(inspectionUrl);
    if (inspectionUrl === 'https://parkjeweg.nl/land/duitsland') {
      return Response.json({ inspectionResult: { indexStatusResult: { verdict: 'NEUTRAL', coverageState: 'Gecrawld - momenteel niet geïndexeerd', lastCrawlTime: '2026-11-19T00:06:24Z' } } });
    }
    return Response.json({ inspectionResult: { indexStatusResult: { verdict: 'NEUTRAL', coverageState: 'Gevonden, momenteel niet geïndexeerd' } } });
  };
  const read = await updateSearchConsole(db, account, { fetcher, now: Date.parse('2026-11-19T12:00:00Z'), inspections: 3 });
  assert.deepEqual(read, { rows: 2, inspected: 3 });
  assert.deepEqual(inspected, ['https://parkjeweg.nl/feestdag/kerst', 'https://parkjeweg.nl/land/duitsland', 'https://parkjeweg.nl/weekenden'], 'tracked pages first, then the oldest inspections');

  const summary = await db.searchSummary('2026-11-01');
  assert.deepEqual(summary.days, [{ day: '2026-11-17', clicks: 3, impressions: 40, position: 7 }]);
  await db.saveSearchTotals({ checkedAt: '2026-11-18T12:00:00.000Z', days: [] });
  assert.deepEqual(await db.searchTotals(), {
    checkedAt: '2026-11-19T12:00:00.000Z', days: [{ day: '2026-11-17', clicks: 5, impressions: 70 }],
  });
  assert.deepEqual(summary.pages.map((row) => [row.path, row.impressions]), [['/feestdag/kerst', 30], ['/', 10]]);
  assert.equal(summary.queries[0].query, 'vakantiepark kerst');
  assert.equal((await db.searchSitemaps()).sitemaps[0].warnings, 1);
  await db.savePageIndex({ path: '/feestdag/kerst', verdict: 'PASS', coverage: 'Ingediend en geïndexeerd', lastCrawl: null, checkedAt: '2026-11-19T11:00:00.000Z' });
  assert.deepEqual((await db.pageIndex()).map((row) => [row.path, row.verdict]), [['/feestdag/kerst', 'NEUTRAL'], ['/land/duitsland', 'NEUTRAL'], ['/parken', 'PASS'], ['/weekenden', 'NEUTRAL']]);
  await db.saveIndexRequests([
    { path: '/feestdag/kerst', requestedOn: '2026-11-26' },
    { path: '/cijfers', requestedOn: '2026-11-25' },
    { path: '/land/duitsland', requestedOn: '2026-11-27' },
  ]);
  await db.saveIndexRequests([{ path: '/feestdag/kerst', requestedOn: '2026-11-25' }]);
  const germanyPublishedAt = TRACKED_INDEX_PAGES.find(({ path }) => path === '/land/duitsland').publishedAt;
  const laterVisit = new Date(Date.parse(germanyPublishedAt) + 3_600_000).toISOString();
  await db.saveGooglebotCrawls([
    { path: '/land/duitsland', visitedAt: laterVisit, status: 502 },
  ]);
  await db.saveGooglebotCrawls([
    { path: '/land/duitsland', visitedAt: '2026-11-26T11:00:00.000Z', status: 200 },
    { path: '/land/duitsland', visitedAt: laterVisit, status: 200 },
  ]);
  const tracked = trackedIndexRows(await db.pageIndex(), await db.indexRequests(), await db.googlebotCrawls());
  assert.equal(tracked.length, 13);
  assert.deepEqual(tracked.slice(-5).map(({ path, label }) => [path, label]), [
    ['/park/vakantiepark-hoog-vaals', 'Hoog Vaals'],
    ['/park/vakantiepark-de-lommerbergen', 'De Lommerbergen'],
    ['/park/vakantiepark-het-vennenbos', 'Het Vennenbos'],
    ['/regio/overijssel', 'Overijssel'],
    ['/park/weerterbergen', 'Weerterbergen'],
  ]);
  const christmas = tracked.find((row) => row.path === '/feestdag/kerst');
  assert.equal(christmas.requestedOn, '2026-11-26');
  assert.equal(christmas.verdict, 'NEUTRAL');
  assert.equal(christmas.checkedAt, '2026-11-19T12:00:00.000Z');
  assert.deepEqual(tracked.find((row) => row.path === '/cijfers'), {
    path: '/cijfers', label: 'Cijfers', requestedOn: '2026-11-25', verdict: null, coverage: null, lastCrawl: null, checkedAt: null,
    updatedAt: null, googlebot: null, cloudflareAfterUpdate: null, searchAfterUpdate: null, searchComparedToCloudflare: null,
  });
  assert.deepEqual(tracked.find((row) => row.path === '/land/duitsland'), {
    path: '/land/duitsland', label: 'Duitsland', requestedOn: '2026-11-27', verdict: 'NEUTRAL',
    coverage: 'Gecrawld - momenteel niet geïndexeerd', lastCrawl: '2026-11-19T00:06:24Z', checkedAt: '2026-11-19T12:00:00.000Z',
    googlebot: { visitedAt: laterVisit, status: 502 },
    updatedAt: germanyPublishedAt, cloudflareAfterUpdate: true, searchAfterUpdate: false, searchComparedToCloudflare: -1,
  });
  assert.deepEqual(tracked.find((row) => row.path === '/park/hof-van-saksen'), {
    path: '/park/hof-van-saksen', label: 'Hof van Saksen', requestedOn: null, verdict: null, coverage: null, lastCrawl: null, checkedAt: null,
    updatedAt: '2026-11-27T12:27:15.531Z', googlebot: null,
    cloudflareAfterUpdate: null, searchAfterUpdate: null, searchComparedToCloudflare: null,
  });
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

test('compares the reported crawl to the latest update and the observed visit independently', () => {
  const sample = (lastCrawl, visitedAt) => trackedIndexRows(
    [{ path: '/cijfers', lastCrawl }], {},
    { '/cijfers': { visitedAt, status: 200 } },
    [{ path: '/cijfers', computedAt: '2026-11-27T12:30:00Z' }],
  ).find(({ path }) => path === '/cijfers');
  const older = sample('2026-11-27T13:00:00Z', '2026-11-27T13:01:00Z');
  assert.equal(older.cloudflareAfterUpdate, true);
  assert.equal(older.searchAfterUpdate, true);
  assert.equal(older.searchComparedToCloudflare, -1);
  const matching = sample('2026-11-27T13:01:00.123Z', '2026-11-27T13:01:00Z');
  assert.equal(matching.searchComparedToCloudflare, 0);
  assert.equal(sample('2026-11-27T13:01:01Z', '2026-11-27T13:01:00Z').searchComparedToCloudflare, 0);
  assert.equal(sample('2026-11-27T13:01:02Z', '2026-11-27T13:01:00Z').searchComparedToCloudflare, 1);
  const before = sample('2026-11-27T13:00:00Z', '2026-11-27T11:00:00Z');
  assert.equal(before.cloudflareAfterUpdate, false);
  assert.equal(before.searchAfterUpdate, true);
  assert.equal(before.searchComparedToCloudflare, null);
});

test('loads finalized page impressions for the same two complete weeks only once per final day', async () => {
  const calls = [];
  const db = {
    weeks: null,
    seoImpressionWeeks() { return this.weeks; },
    saveSeoImpressionWeeks(weeks) { this.weeks = weeks; },
  };
  const fetcher = async (url, request) => {
    const body = JSON.parse(request.body);
    calls.push(body);
    return Response.json({ rows: [{ keys: ['https://parkjeweg.nl/weekenden'], impressions: 24 }] });
  };
  const days = Array.from({ length: 14 }, (_, index) => ({ day: shiftDays('2026-11-12', index), impressions: 35, clicks: 0 }));
  const checkedAt = '2026-11-27T12:00:00.000Z';
  await updateSeoImpressionWeeks(db, 'token', { checkedAt, days: days.slice(1) }, { fetcher });
  assert.deepEqual(calls, []);
  await updateSeoImpressionWeeks(db, 'token', { checkedAt, days }, { fetcher });
  assert.deepEqual(calls.map(({ startDate, endDate, dataState, dimensions }) => [startDate, endDate, dataState, dimensions]), [
    ['2026-11-12', '2026-11-18', 'final', ['page']], ['2026-11-19', '2026-11-25', 'final', ['page']],
  ]);
  assert.deepEqual(db.weeks, { end: '2026-11-25', checkedAt, previous: { '/weekenden': 24 }, current: { '/weekenden': 24 } });
  await updateSeoImpressionWeeks(db, 'token', { checkedAt, days }, { fetcher });
  assert.equal(calls.length, 2);
});
