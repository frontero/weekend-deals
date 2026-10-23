import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { after, test } from 'node:test';
import { connectFile } from './connect.mjs';
import { openDatabase } from './db.mjs';
import { createApiHandler } from './handler.mjs';

const directory = mkdtempSync(join(tmpdir(), 'weekend-deals-api-'));
after(() => rmSync(directory, { recursive: true, force: true }));

const open = (name) => openDatabase(connectFile(join(directory, name)).client);
const call = (handle, method, path, body) =>
  handle(new Request(`http://localhost/api${path}`, { method, body: body && JSON.stringify(body) }));

test('serves the precomputed park list as stored, and an empty one before the first round', async () => {
  const db = await open('overview.db');
  const handle = createApiHandler(db);
  assert.deepEqual(await (await call(handle, 'GET', '/overview')).json(), []);

  await db.saveOverview('a2-c0', { computedAt: 'x', meta: '{}', parks: gzipSync('[{"code":"HDL"}]') });
  const response = await call(handle, 'GET', '/overview');
  assert.equal(response.headers.get('Content-Encoding'), 'gzip');
  assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer()))), [{ code: 'HDL' }]);
  db.close();
});

test('a scan request is left for the Mac and shown as running', async () => {
  const db = await open('scan.db');
  let started = 0;
  const handle = createApiHandler(db, { onScanRequested: () => (started += 1) });

  const response = await call(handle, 'POST', '/scan');
  assert.equal(response.status, 202);
  assert.equal((await response.json()).scan.phase, 'requested');
  assert.ok(await db.scanRequestedAt());
  assert.equal(started, 1);
  db.close();
});

test('only the fixed party sizes are collected, so every size has prices ready', async () => {
  const db = await open('parties.db');
  const keys = (await db.followedParties()).map((party) => party.key);
  assert.deepEqual(keys, ['a2-c0', 'a3-c0', 'a4-c0', 'a5-c0', 'a6-c0', 'a8-c0']);
  db.close();
});

test('shared settings leave the party of every viewer alone', async () => {
  const db = await open('settings.db');
  const handle = createApiHandler(db);

  const settings = await (await call(handle, 'PUT', '/settings', { rounds: 'daily', children: 2 })).json();
  assert.equal(settings.rounds, 'daily');
  assert.equal(settings.children, 0);
  assert.equal(await db.scanRequestedAt(), null);

  await call(handle, 'PUT', '/settings', { weeksAhead: 26 });
  assert.ok(await db.scanRequestedAt());
  db.close();
});

test('serves the prices of the party size the screen asks for', async () => {
  const db = await open('sizes.db');
  const handle = createApiHandler(db);
  await db.saveOverview('a6-c0', { computedAt: 'a', meta: '{}', parks: gzipSync('[{"code":"SIX"}]') });
  assert.equal((await (await call(handle, 'GET', '/status?party=a6-c0')).json()).shownParty, 'a6-c0');
  const parks = await call(handle, 'GET', '/overview?party=a6-c0');
  assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(await parks.arrayBuffer()))), [{ code: 'SIX' }]);
  db.close();
});

test('a live quote needs a short stay and a known park', async () => {
  const db = await open('quote.db');
  const handle = createApiHandler(db);
  const quote = (body) => call(handle, 'POST', '/quote', { adults: 2, children: 0, ...body });
  assert.equal((await quote({ parkCode: 'HRK', arrival: '2026-11-13', departure: '2026-11-13' })).status, 400);
  assert.equal((await quote({ parkCode: 'HRK', arrival: '2026-11-13', departure: '2026-12-13' })).status, 400);
  assert.equal((await quote({ parkCode: 'HRK', arrival: 'friday', departure: '2026-11-16' })).status, 400);
  assert.equal((await quote({ parkCode: 'NOPE', arrival: '2026-11-13', departure: '2026-11-16' })).status, 404);
  db.close();
});

test('answers unknown routes and failures as JSON', async () => {
  const db = await open('errors.db');
  const handle = createApiHandler(db);
  assert.equal((await call(handle, 'GET', '/nothing')).status, 404);
  db.close();
  const failed = await call(handle, 'GET', '/status');
  assert.equal(failed.status, 500);
  assert.ok((await failed.json()).error);
});

test('a phone sets, lists and removes its own price alerts; its topic is the key', async () => {
  const db = await open('alerts.db');
  const handle = createApiHandler(db);
  const topic = 'weekendjeweg-abcdefghijklmnop';

  assert.equal((await call(handle, 'POST', '/alerts', { topic: 'short' })).status, 400);
  const created = await call(handle, 'POST', '/alerts', {
    topic,
    party: { adults: 4, children: 2 },
    search: { minDiscountPercent: 30, origin: { lat: 52.0907, lng: 5.1214 }, maxDistanceKm: 80 },
    query: 'minDiscountPercent=30',
    label: '30%+ onder normaal',
    seen: [{ parkCode: 'HDL', arrival: '2026-11-13', priceCents: 40000 }],
    primed: true,
  });
  assert.equal(created.status, 201);
  const { id, partyKey } = await created.json();
  // 4 + 2 people watch the list's prices for 6.
  assert.equal(partyKey, 'a6-c0');
  assert.equal((await db.alertDeliveries(id)).get('HDL|2026-11-13'), 40000);

  const listed = await (await call(handle, 'GET', `/alerts?topic=${topic}`)).json();
  assert.deepEqual(listed.map((alert) => alert.label), ['30%+ onder normaal']);
  assert.equal((await (await call(handle, 'GET', '/alerts?topic=weekendjeweg-someoneelse00000')).json()).length, 0);

  assert.equal((await call(handle, 'DELETE', `/alerts?id=${id}&topic=weekendjeweg-someoneelse00000`)).status, 404);
  assert.equal((await call(handle, 'DELETE', `/alerts?id=${id}&topic=${topic}`)).status, 200);
  assert.equal((await db.alerts(topic)).length, 0);
  db.close();
});

test('sends a test message to the phone on request', async (t) => {
  const db = await open('alert-test.db');
  const handle = createApiHandler(db);
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    sent.push({ url, body: JSON.parse(options.body) });
    return new Response('{}');
  });

  const response = await call(handle, 'POST', '/alerts/test', { topic: 'weekendjeweg-abcdefghijklmnop' });
  assert.equal(response.status, 200);
  assert.equal(sent[0].url, 'https://ntfy.sh');
  assert.equal(sent[0].body.topic, 'weekendjeweg-abcdefghijklmnop');
  db.close();
});

test('the admin overview of rounds is only for admins, and the status tells the screen who is one', async () => {
  const db = await open('admin.db');
  const visitor = createApiHandler(db);
  assert.equal((await call(visitor, 'GET', '/admin')).status, 403);
  assert.equal((await (await call(visitor, 'GET', '/status')).json()).admin, false);

  const scanId = await db.startScan('a2-c0');
  await db.finishScan(scanId);
  await db.saveScanChanges(scanId, null, { prices: 0 });
  const admin = createApiHandler(db, { isAdmin: () => true });
  assert.equal((await (await call(admin, 'GET', '/status')).json()).admin, true);
  const body = await (await call(admin, 'GET', '/admin')).json();
  assert.equal(body.rounds, 'twice-daily');
  assert.equal(body.google.budget, 900);
  assert.deepEqual(body.history.map((round) => [round.id, round.groupKey, round.changes]), [[scanId, 'a2-c0', { prices: 0 }]]);
  db.close();
});

test('the admin overview brings what it takes to link each changed park', async () => {
  const db = await open('admin-parks.db');
  const scanId = await db.startScan('a2-c0');
  const offer = (code) => ({ park: { code, name: `Park ${code}`, pricesUrl: `https://example.org/${code}` }, priceCents: 27000, accommodationCode: 'x', bookingUrl: null });
  await db.savePrices(scanId, { arrival: '2026-11-13', departure: '2026-11-16' }, [offer('HRK'), offer('KWW')]);
  await db.finishScan(scanId);
  await db.saveAccommodations('HRK', [{ code: 'x', name: 'Lariks 6', url: 'https://example.org/HRK/x', facts: [], photos: [] }]);
  const move = { parkCode: 'HRK', parkName: 'Park HRK', arrival: '2026-11-13', oldCents: 30000, newCents: 27000, kind: 'repriced', accommodationCode: 'x' };
  await db.saveScanChanges(scanId, null, { prices: 1, biggest: [move] });
  const body = await (await call(createApiHandler(db, { isAdmin: () => true }), 'GET', '/admin')).json();
  assert.deepEqual(Object.keys(body.parks), ['HRK']);
  assert.deepEqual(body.parks.HRK, {
    code: 'HRK',
    provider: 'landal',
    url: null,
    pricesUrl: 'https://example.org/HRK',
    accommodations: { x: { url: 'https://example.org/HRK/x' } },
  });
  db.close();
});

test('a scan request may name the sizes to collect, only ones that are collected', async () => {
  const db = await open('scan-sizes.db');
  const handle = createApiHandler(db);
  assert.equal((await call(handle, 'POST', '/scan', { parties: ['a7-c9'] })).status, 400);
  assert.equal(await db.scanRequestedAt(), null);

  assert.equal((await call(handle, 'POST', '/scan', { parties: ['a2-c0', 'a7-c9'] })).status, 202);
  assert.deepEqual((await db.scanRequest()).parties, ['a2-c0']);
  db.close();
});
