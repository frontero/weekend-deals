import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { connectFile } from './connect.mjs';
import { openDatabase } from './db.mjs';
import { clientEventPoints, countsAsVisit, deviceOf, isPageView, pageKind, pageViewPoint, trafficSource } from './events.mjs';
import { createApiHandler } from './handler.mjs';
import { analyticsQuery, trafficReport } from './traffic.mjs';

const directory = mkdtempSync(join(tmpdir(), 'weekend-deals-events-'));
after(() => rmSync(directory, { recursive: true, force: true }));

const BROWSER = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const request = (path, { method = 'GET', headers = {}, body } = {}) =>
  new Request(`https://parkjeweg.nl${path}`, { method, body, headers: { 'User-Agent': BROWSER, 'CF-Connecting-IP': '198.51.100.7', ...headers } });

test('names where a visit came from: campaign, known sites, other hosts, direct and the site itself', () => {
  assert.equal(trafficSource('https://www.google.nl/', 'parkjeweg.nl'), 'google');
  assert.equal(trafficSource('https://l.facebook.com/', 'parkjeweg.nl'), 'facebook');
  assert.equal(trafficSource('https://t.co/abc', 'parkjeweg.nl'), 'x');
  assert.equal(trafficSource('https://www.kampeerforum.nl/topic/1', 'parkjeweg.nl'), 'kampeerforum.nl');
  assert.equal(trafficSource('', 'parkjeweg.nl'), 'direct');
  assert.equal(trafficSource('https://parkjeweg.nl/park/x', 'parkjeweg.nl'), 'intern');
  assert.equal(trafficSource('https://www.google.nl/', 'parkjeweg.nl', 'Nieuwsbrief'), 'nieuwsbrief');
  assert.equal(trafficSource('https://www.google.nl/', 'parkjeweg.nl', '<script>'), 'google');
});

test('counts people in browsers, not crawlers, empty user agents or the admin', () => {
  assert.equal(countsAsVisit(request('/')), true);
  assert.equal(countsAsVisit(request('/', { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' } })), false);
  assert.equal(countsAsVisit(request('/', { headers: { 'User-Agent': '' } })), false);
  assert.equal(countsAsVisit(request('/', { headers: { Cookie: 'theme=dark; CF_Authorization=abc' } })), false);
  assert.equal(isPageView(request('/park/x')), false, 'a fetch without navigation is no page view');
  assert.equal(isPageView(request('/park/x', { headers: { 'Sec-Fetch-Mode': 'navigate' } })), true);
});

test('tells page kinds and devices apart', () => {
  assert.deepEqual(['/', '/park/hunzedal', '/weekend/2026-12-04', '/regio/veluwe', '/iets'].map(pageKind), ['home', 'park', 'weekend', 'regio', 'other']);
  assert.equal(deviceOf(BROWSER), 'mobiel');
  assert.equal(deviceOf('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)'), 'tablet');
  assert.equal(deviceOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'desktop');
});

test('a server page view carries its kind, path and source', () => {
  const point = pageViewPoint(request('/park/hunzedal?utm_source=pinterest', { headers: { Referer: 'https://www.pinterest.com/' } }), 'abcd1234');
  assert.deepEqual(point, {
    indexes: ['abcd1234'],
    blobs: ['view', 'park', '', '/park/hunzedal', 'pinterest', 'mobiel', ''],
    doubles: [0],
  });
});

test('keeps only known events with short plain values from a batch', () => {
  const body = JSON.stringify({
    path: '/',
    referrer: 'https://www.bing.com/',
    events: [
      { name: 'view' },
      { name: 'filter', key: 'brands', value: 'landal,roompot' },
      { name: 'park', key: 'cards', value: 'HOT', number: 3 },
      { name: 'click', key: 'landal', value: 'HOT' },
      { name: 'filter', key: 'search', value: 'Kerkstraat 1 <b>' },
      { name: 'sort', key: { nested: true } },
      { name: 'park', key: 'cards', value: 'x'.repeat(65) },
    ],
  });
  const points = clientEventPoints(request('/api/events', { method: 'POST' }), 'abcd1234', body);
  assert.deepEqual(
    points.map((point) => point.blobs.slice(0, 5)),
    [
      ['view', 'home', '', '/', 'bing'],
      ['filter', 'brands', 'landal,roompot', '/', ''],
      ['park', 'cards', 'HOT', '/', ''],
    ],
  );
  assert.equal(points[2].doubles[0], 3);
  assert.deepEqual(clientEventPoints(request('/api/events'), null, 'not json'), []);
  assert.deepEqual(clientEventPoints(request('/api/events'), null, JSON.stringify({ events: Array(40).fill({ name: 'more' }) })).length, 30);
});

test('POST /events counts a batch with the visitor of the day, and nothing from other sites or crawlers', async () => {
  const db = await openDatabase(connectFile(join(directory, 'events.db')).client);
  const points = [];
  const handle = createApiHandler(db, { recordEvent: (point) => points.push(point) });
  const batch = JSON.stringify({ path: '/', events: [{ name: 'view' }, { name: 'mode', key: 'map' }] });
  const post = (headers = {}) => handle(request('/api/events', { method: 'POST', body: batch, headers }));

  assert.equal((await post()).status, 204);
  assert.equal(points.length, 2);
  assert.match(points[0].indexes[0], /^[0-9a-f]{8}$/);
  assert.equal(points[1].indexes[0], points[0].indexes[0]);

  await post({ 'Sec-Fetch-Site': 'cross-site' });
  await post({ 'User-Agent': 'curl/8.0' });
  assert.equal(points.length, 2);
  assert.equal((await createApiHandler(db)(request('/api/events', { method: 'POST', body: batch }))).status, 204, 'without a store it answers all the same');
  db.close();
});

test('a click through to a provider is counted with its park and place on the site', async () => {
  const db = await openDatabase(connectFile(join(directory, 'click-event.db')).client);
  const points = [];
  const handle = createApiHandler(db, { recordEvent: (point) => points.push(point) });
  const query = new URLSearchParams({ url: 'https://www.landal.nl/', park: 'HOT', from: 'kaartje' });
  assert.equal((await handle(request(`/api/go?${query}`))).status, 302);
  assert.deepEqual(points.map((point) => point.blobs.slice(0, 4)), [['click', 'landal', 'HOT', 'kaartje']]);
  db.close();
});

test('the admin traffic report says when it cannot read, and names the parks it reports', async () => {
  const { client } = connectFile(join(directory, 'traffic.db'));
  const db = await openDatabase(client);
  await client.execute(`INSERT INTO parks (code, name) VALUES ('HOT', 'Hof van Saksen')`);
  const admin = { isAdmin: () => true };
  const get = (handle) => handle(request('/api/admin/traffic?days=7'));

  assert.deepEqual(await (await get(createApiHandler(db, admin))).json(), { configured: false });

  const statements = [];
  const queryEvents = async (sql) => {
    statements.push(sql);
    if (sql.includes('blob3 AS value')) return [{ name: 'park', key: 'cards', value: 'HOT', visitors: '4' }];
    if (sql.includes('GROUP BY day')) return [{ day: '2026-11-18', visitors: '10', views: '25', clicks: '3', parkVisitors: '6', clickers: '2' }];
    return [];
  };
  const report = await (await get(createApiHandler(db, { ...admin, queryEvents }))).json();
  assert.equal(report.configured, true);
  assert.deepEqual(report.days, [{ day: '2026-11-18', visitors: 10, views: 25, clicks: 3, parkVisitors: 6, clickers: 2 }]);
  assert.deepEqual(report.parkNames, { HOT: 'Hof van Saksen' });
  assert.equal(statements.length, 7);
  assert.ok(statements.every((sql) => sql.includes(`FROM parkjeweg_events WHERE timestamp >= toDateTime('${report.since} 00:00:00')`)));

  const failing = createApiHandler(db, { ...admin, queryEvents: async () => Promise.reject(new Error('Analytics Engine answered 422: unknown table')) });
  const response = await get(failing);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { configured: true, error: 'Analytics Engine answered 422: unknown table' });
  db.close();
});

test('the report starts at the first day of the period', async () => {
  const report = await trafficReport(async () => [], { days: 7, now: Date.parse('2026-11-18T12:00:00Z') });
  assert.equal(report.since, '2026-11-12');
});

test('asks Analytics Engine with the read token, and fails loudly on an error', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return init.body.startsWith('BAD') ? new Response('no such column', { status: 422 }) : Response.json({ data: [{ n: '1' }] });
  };
  const query = analyticsQuery({ accountId: 'acc', token: 'secret', fetcher });
  assert.deepEqual(await query('SELECT 1'), [{ n: '1' }]);
  assert.equal(calls[0].url, 'https://api.cloudflare.com/client/v4/accounts/acc/analytics_engine/sql');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer secret');
  assert.equal(calls[0].init.body, 'SELECT 1 FORMAT JSON');
  await assert.rejects(query('BAD'), /422: no such column/);
});
