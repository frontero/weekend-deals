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
  assert.deepEqual(['/', '/park/hunzedal', '/weekend/2026-12-04', '/regio/veluwe', '/feestdag/kerst', '/iets'].map(pageKind), ['home', 'park', 'weekend', 'regio', 'feestdag', 'other']);
  assert.equal(deviceOf(BROWSER), 'mobiel');
  assert.equal(deviceOf('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)'), 'tablet');
  assert.equal(deviceOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'desktop');
});

test('a server page view carries its kind, path and source', () => {
  const point = pageViewPoint(request('/park/hunzedal?utm_source=pinterest', { headers: { Referer: 'https://www.pinterest.com/' } }), 'abcd1234');
  assert.deepEqual(point, {
    indexes: ['abcd1234'],
    blobs: ['view', 'park', '', '/park/hunzedal', 'pinterest', 'mobiel', ''],
    doubles: [0, 0, 0],
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
      { name: 'empty', key: 'filters', value: 'brands,facilities,weekend' },
      { name: 'speed', key: 'load', number: 1840 },
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
      ['empty', 'filters', 'brands,facilities,weekend', '/', ''],
      ['speed', 'load', '', '/', ''],
    ],
  );
  assert.equal(points[2].doubles[0], 3);
  assert.equal(points[4].doubles[0], 1840);
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
  const arrival = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const query = new URLSearchParams({ url: 'https://www.landal.nl/', park: 'HOT', from: 'kaartje', arrival, price: '284', off: '53' });
  assert.equal((await handle(request(`/api/go?${query}`))).status, 302);
  assert.deepEqual(points.map((point) => point.blobs.slice(0, 4)), [['click', 'landal', 'HOT', 'kaartje']]);
  assert.deepEqual(points[0].doubles, [284, 53, 3], 'the price and discount seen, and how many weeks ahead');
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
  assert.equal(statements.length, 12);
  assert.ok(statements.every((sql) => sql.includes(`FROM parkjeweg_events WHERE timestamp >= toDateTime('${report.since} 00:00:00')`)));

  const failing = createApiHandler(db, { ...admin, queryEvents: async () => Promise.reject(new Error('Analytics Engine answered 422: unknown table')) });
  const response = await get(failing);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { configured: true, error: 'Analytics Engine answered 422: unknown table' });
  db.close();
});

test('a query added later that fails leaves the rest of the report standing', async () => {
  const query = async (sql) => (sql.includes("blob1 = 'speed'") ? Promise.reject(new Error('unknown function')) : sql.includes('double3 AS weeks') ? [{ weeks: '3', clicks: '2' }] : []);
  const report = await trafficReport(query, { days: 7, now: Date.parse('2026-11-18T12:00:00Z') });
  assert.deepEqual(report.speed, []);
  assert.deepEqual(report.clickWeeks, [{ weeks: 3, clicks: 2 }]);
});

test('a remark with the answer to "did you find it" is kept for the admin, and nothing without one or from another site', async () => {
  const db = await openDatabase(connectFile(join(directory, 'feedback.db')).client);
  const handle = createApiHandler(db, { isAdmin: () => true, queryEvents: async () => [] });
  const post = (body, headers = {}) => handle(request('/api/feedback', { method: 'POST', body: JSON.stringify(body), headers }));

  assert.equal((await post({ found: 'nee', comment: '  Ik miste Center Parcs  ', path: '/feestdag/kerst' })).status, 204);
  assert.equal((await post({ found: 'nee', comment: '   ' })).status, 400);
  assert.equal((await post({ found: 'misschien', comment: 'x' })).status, 400);
  await post({ found: 'ja', comment: 'spam' }, { 'Sec-Fetch-Site': 'cross-site' });
  await post({ found: 'ja', comment: 'x'.repeat(900), path: 'javascript:alert(1)' });

  const { feedback } = await (await handle(request('/api/admin/traffic'))).json();
  assert.deepEqual(feedback.map(({ found, path, comment }) => [found, path, comment.length]), [['ja', '/', 500], ['nee', '/feestdag/kerst', 21]]);
  db.close();
});

test('a day shows what each visitor did, in order, the busiest visitor first', async () => {
  const { client } = connectFile(join(directory, 'day.db'));
  const db = await openDatabase(client);
  await client.execute(`INSERT INTO parks (code, name) VALUES ('HOT', 'Hof van Saksen')`);
  const statements = [];
  const row = (timestamp, visitor, name, key, value, path, source = '') => ({ timestamp, visitor, name, key, value, path, source, device: 'mobiel', country: 'NL', number: '0' });
  const queryEvents = async (sql) => {
    statements.push(sql);
    return [
      row('2026-11-19 08:00:01', 'aaaa1111', 'view', 'home', '', '/', 'google'),
      row('2026-11-19 08:00:09', 'bbbb2222', 'view', 'park', '', '/park/hof-van-saksen', 'direct'),
      row('2026-11-19 08:00:20', 'aaaa1111', 'park', 'cards', 'HOT', '/'),
      row('2026-11-19 08:01:02', 'aaaa1111', 'click', 'landal', 'HOT', 'kaartje'),
    ];
  };
  const handle = createApiHandler(db, { isAdmin: () => true, queryEvents });
  const body = await (await handle(request('/api/admin/traffic/day?day=2026-11-19'))).json();
  assert.deepEqual(body.visitors.map((visitor) => [visitor.visitor, visitor.source, visitor.steps.map((step) => step.name)]), [
    ['aaaa1111', 'google', ['view', 'park', 'click']],
    ['bbbb2222', 'direct', ['view']],
  ]);
  assert.equal(body.visitors[0].steps[0].at, '2026-11-19T08:00:01Z');
  assert.deepEqual(body.parkNames, { HOT: 'Hof van Saksen' });
  assert.match(statements[0], /timestamp >= toDateTime\('2026-11-19 00:00:00'\) AND timestamp < toDateTime\('2026-11-20 00:00:00'\)/);
  assert.equal((await handle(request("/api/admin/traffic/day?day=2026-11-19'%20OR%201=1"))).status, 400, 'only a date gets into the query');
  db.close();
});

test('the report tells per source and per landing page who clicked through, and what the clicks were worth', async () => {
  const query = async (sql) => {
    if (sql.includes('blob2 AS kind, blob5 AS source')) {
      return [
        { timestamp: '2026-11-18 08:00:00', visitor: 'aaaa', kind: 'feestdag', source: 'google' },
        { timestamp: '2026-11-18 08:01:00', visitor: 'aaaa', kind: 'home', source: 'intern' },
        { timestamp: '2026-11-18 09:00:00', visitor: 'bbbb', kind: 'home', source: 'direct' },
        { timestamp: '2026-11-18 10:00:00', visitor: 'cccc', kind: 'park', source: 'google' },
      ];
    }
    if (sql.includes('AS priced')) {
      return [
        { day: '2026-11-18', visitor: 'aaaa', parks: '2', clicks: '1', priced: '1', euros: '284' },
        { day: '2026-11-18', visitor: 'bbbb', parks: '0', clicks: '0', priced: '0', euros: '0' },
        { day: '2026-11-18', visitor: 'cccc', parks: '1', clicks: '0', priced: '0', euros: '0' },
      ];
    }
    return [];
  };
  const report = await trafficReport(query, { days: 7, now: Date.parse('2026-11-18T12:00:00Z') });
  assert.deepEqual(report.bySource, [
    { source: 'google', visitors: 2, parkVisitors: 2, clickers: 1 },
    { source: 'direct', visitors: 1, parkVisitors: 0, clickers: 0 },
  ]);
  assert.deepEqual(report.byLanding.map((row) => [row.kind, row.visitors, row.clickers]), [['feestdag', 1, 1], ['home', 1, 0], ['park', 1, 0]]);
  assert.deepEqual(report.clickValue, [{ day: '2026-11-18', clicks: 1, euros: 284 }]);
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
