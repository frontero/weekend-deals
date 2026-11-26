import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';
import { accessToken, searchAnalytics, serviceAccount } from './search-console.mjs';
import { trackedIndexRows } from './index-tracking.mjs';

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
  await db.replacePages([page('/parken'), page('/weekenden'), page('/feestdag/kerst')], '2026-11-19T06:00:00.000Z');
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
    return Response.json({ inspectionResult: { indexStatusResult: { verdict: 'NEUTRAL', coverageState: 'Gevonden, momenteel niet geïndexeerd' } } });
  };
  const read = await updateSearchConsole(db, account, { fetcher, now: Date.parse('2026-11-19T12:00:00Z'), inspections: 2 });
  assert.deepEqual(read, { rows: 2, inspected: 2 });
  assert.deepEqual(inspected, ['https://parkjeweg.nl/feestdag/kerst', 'https://parkjeweg.nl/weekenden'], 'never-asked pages first');

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
  assert.deepEqual((await db.pageIndex()).map((row) => [row.path, row.verdict]), [['/feestdag/kerst', 'NEUTRAL'], ['/parken', 'PASS'], ['/weekenden', 'NEUTRAL']]);
  await db.saveIndexRequests([{ path: '/feestdag/kerst', requestedOn: '2026-11-26' }, { path: '/cijfers', requestedOn: '2026-11-25' }]);
  await db.saveIndexRequests([{ path: '/feestdag/kerst', requestedOn: '2026-11-25' }]);
  const tracked = trackedIndexRows(await db.pageIndex(), await db.indexRequests());
  assert.equal(tracked.length, 6);
  const christmas = tracked.find((row) => row.path === '/feestdag/kerst');
  assert.equal(christmas.requestedOn, '2026-11-26');
  assert.equal(christmas.verdict, 'NEUTRAL');
  assert.equal(christmas.checkedAt, '2026-11-19T12:00:00.000Z');
  assert.deepEqual(tracked.find((row) => row.path === '/cijfers'), {
    path: '/cijfers', label: 'Cijfers', requestedOn: '2026-11-25', verdict: null, coverage: null, lastCrawl: null, checkedAt: null,
  });
  db.close();
  rmSync(directory, { recursive: true, force: true });
});
