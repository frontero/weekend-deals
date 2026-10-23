import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { after, test } from 'node:test';
import { connectFile } from './connect.mjs';
import { openDatabase } from './db.mjs';

const directory = mkdtempSync(join(tmpdir(), 'weekend-deals-'));
after(() => rmSync(directory, { recursive: true, force: true }));

const clientFor = (name) => connectFile(join(directory, name)).client;
const open = (name) => openDatabase(clientFor(name));

/** A database file in an older layout, which openDatabase has to bring up to date. */
async function oldDatabase(name, sql) {
  const client = clientFor(name);
  await client.executeMultiple(sql);
  return openDatabase(client);
}

const filterGroups = {
  park: [{ name: 'Zwempret', anyOf: false, options: [{ id: '9299.16301', name: 'Overdekt zwembad' }] }],
  accommodation: [{ name: 'Accommodatie type', anyOf: true, options: [{ id: '9290.16337', name: 'Bungalow' }] }],
};

test('upgrades the first facilities schema and keeps the park facility mapping', async () => {
  const db = await oldDatabase(
    'old.db',
    `
    CREATE TABLE facilities (id TEXT PRIMARY KEY, name TEXT NOT NULL, group_name TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE park_facilities (
      park_code TEXT NOT NULL,
      facility_id TEXT NOT NULL REFERENCES facilities (id),
      PRIMARY KEY (park_code, facility_id)
    );
    INSERT INTO facilities VALUES ('9299.16301', 'Overdekt zwembad', 'Zwempret', 0);
    INSERT INTO park_facilities VALUES ('HDL', '9299.16301');
  `,
  );
  await db.replaceFacilityDefinitions(filterGroups);
  await db.replaceFacilityDefinitions(filterGroups);

  assert.deepEqual((await db.facilitiesByPark()).get('HDL'), ['9299.16301']);
  assert.equal((await db.facilityGroups('accommodation'))[0].anyOf, true);
  db.close();
});

const offer = (code, lat) => ({
  park: { code, name: code, region: null, city: null, country: 'NL', url: null, pricesUrl: null, reviewScore: null, imageUrl: null, lat, lng: lat ? 5 : null },
  priceCents: 20000,
  accommodationCode: 'x',
  bookingUrl: `https://example.org/${code}`,
});
const november = { arrival: '2026-11-06', departure: '2026-11-09' };

test('adds the direct booking link to a prices table from before it was stored', async () => {
  const db = await oldDatabase(
    'prices.db',
    `CREATE TABLE prices (scan_id INTEGER NOT NULL, park_code TEXT NOT NULL, arrival TEXT NOT NULL,
    departure TEXT NOT NULL, price_cents INTEGER NOT NULL, accommodation_code TEXT,
    PRIMARY KEY (scan_id, park_code, arrival))`,
  );
  const scanId = await db.startScan('a2-c0');
  await db.savePrices(scanId, november, [offer('MOL', 52.4)]);
  assert.equal((await db.priceSummaries('a2-c0', '2026-01-01'))[0].bookingUrl, 'https://example.org/MOL');
  db.close();
});

test('keeps accommodation details and tells which ones a round still lacks', async () => {
  const db = await open('accommodations.db');
  const scanId = await db.startScan('a2-c0');
  const lariks = { code: 'x', name: 'Lariks 6', url: 'https://example.org/lariks', facts: ['42 m²'], photos: ['https://cdn/1.jpg'] };
  // Molecaten-style: the details come with the price.
  await db.savePrices(scanId, november, [offer('HRK', 52.9), { ...offer('MOL', 52.4), accommodation: { ...lariks, name: 'Petrea' } }]);

  assert.deepEqual(await db.missingAccommodations(scanId, 'landal'), [
    { parkCode: 'HRK', code: 'x', arrival: '2026-11-06', departure: '2026-11-09' },
  ]);
  await db.saveAccommodations('HRK', [lariks]);
  assert.deepEqual(await db.missingAccommodations(scanId, 'landal'), []);

  const accommodations = await db.accommodations();
  assert.deepEqual(accommodations.get('HRK').x, {
    name: 'Lariks 6',
    url: 'https://example.org/lariks',
    facts: ['42 m²'],
    photos: ['https://cdn/1.jpg'],
  });
  assert.equal(accommodations.get('MOL').x.name, 'Petrea');
  db.close();
});

test('adds coordinates to a parks table from before they were stored', async () => {
  const db = await oldDatabase(
    'parks.db',
    `CREATE TABLE parks (code TEXT PRIMARY KEY, name TEXT NOT NULL, region TEXT, city TEXT, country TEXT,
    url TEXT, prices_url TEXT, review_score REAL, image_url TEXT)`,
  );
  const scanId = await db.startScan('a2-c0');
  await db.savePrices(scanId, november, [offer('HDL', 52.9)]);
  assert.equal((await db.parks()).get('HDL').lat, 52.9);
  db.close();
});

test('remembers which provider a park belongs to; parks from before default to Landal', async () => {
  const db = await oldDatabase(
    'providers.db',
    `CREATE TABLE parks (code TEXT PRIMARY KEY, name TEXT NOT NULL, region TEXT, city TEXT, country TEXT,
    url TEXT, prices_url TEXT, review_score REAL, image_url TEXT, lat REAL, lng REAL);
    INSERT INTO parks (code, name) VALUES ('HDL', 'Hunzedal');`,
  );
  const scanId = await db.startScan('a2-c0');
  const europarcs = offer('europarcs:bh', 52.2);
  europarcs.park.provider = 'europarcs';
  await db.savePrices(scanId, november, [europarcs]);

  const parks = await db.parks();
  const [summary] = await db.priceSummaries('a2-c0', '2026-01-01');
  assert.equal(parks.get('HDL').provider, 'landal');
  assert.equal(parks.get('europarcs:bh').provider, 'europarcs');
  assert.equal(summary.provider, 'europarcs');
  assert.equal(summary.bookingUrl, 'https://example.org/europarcs:bh');
  assert.equal((await db.parksNeedingRatings('2026-01-01T00:00:00Z'))[0].provider, 'europarcs');
  db.close();
});

test('asks for Google ratings of located parks that have none or an old one', async () => {
  const db = await open('ratings.db');
  const scanId = await db.startScan('a2-c0');
  await db.savePrices(scanId, november, [offer('NEW', 52.1), offer('OLD', 52.2), offer('FRESH', 52.3), offer('NOWHERE', null)]);
  await db.saveGoogleRating('OLD', { placeId: 'p', placeName: 'Old', rating: 4, ratingCount: 10, mapsUrl: 'u' }, '2026-08-01T00:00:00Z');
  await db.saveGoogleRating('FRESH', null, '2026-10-20T00:00:00Z');

  const due = (await db.parksNeedingRatings('2026-09-22T00:00:00Z')).map((park) => park.code);
  assert.deepEqual(due.sort(), ['NEW', 'OLD']);
  const ratings = await db.googleRatings();
  assert.deepEqual(ratings.get('OLD'), { rating: 4, ratingCount: 10, mapsUrl: 'u', placeName: 'Old' });
  assert.equal(ratings.get('FRESH'), undefined);
  db.close();
});

test('a price only moves when the same accommodation changed price, not when another one became the cheapest', async () => {
  const db = await open('flip-flop.db');
  const weekend = { arrival: '2027-01-15', departure: '2027-01-18' };
  const scan = async (startedAt, accommodationCode, priceCents) => {
    await db.savePrices(await db.startScan('a2-c0', startedAt), weekend, [
      { ...offer('FKT', 52.9), accommodationCode, priceCents },
    ]);
  };
  // Landal's search shows one or the other as the cheapest, round after round.
  await scan('2026-10-20T08:00:00Z', '2-4B1', 29500);
  await scan('2026-10-21T08:00:00Z', '2-4B3', 35500);
  await scan('2026-10-25T08:00:00Z', '2-4B1', 29500);
  await scan('2026-10-26T08:00:00Z', '2-4B3', 35500);
  await scan('2026-10-30T08:00:00Z', '2-4B1', 29500);

  const [summary] = await db.priceSummaries('a2-c0', '2026-01-01', '2026-10-27T08:00:00Z');
  assert.equal(summary.priceCents, 29500);
  assert.equal(summary.highestCents, 29500);
  assert.equal(summary.observations, 3);
  // Compared with the same accommodation a few days earlier, not with the other one.
  assert.equal(summary.referenceCents, 29500);
  assert.equal(summary.referenceAt, '2026-10-25T08:00:00Z');
  db.close();
});

test('tells per weekend how its price moved and returns its history', async () => {
  const db = await open('history.db');
  const weekend = { arrival: '2026-12-11', departure: '2026-12-14' };
  const scan = async (startedAt, priceCents) => {
    await db.savePrices(await db.startScan('a2-c0', startedAt), weekend, [{ ...offer('HDL', 52.9), priceCents }]);
  };
  await scan('2026-10-20T08:00:00Z', 30000);
  await scan('2026-10-25T08:00:00Z', 32000);
  await scan('2026-10-30T08:00:00Z', 28000);

  const [summary] = await db.priceSummaries('a2-c0', '2026-01-01', '2026-10-27T08:00:00Z');
  assert.equal(summary.priceCents, 28000);
  assert.equal(summary.lowestCents, 28000);
  assert.equal(summary.highestCents, 32000);
  assert.equal(summary.firstObservedAt, '2026-10-20T08:00:00Z');
  assert.equal(summary.observedAt, '2026-10-30T08:00:00Z');
  assert.equal(summary.referenceCents, 32000);
  assert.equal(summary.referenceAt, '2026-10-25T08:00:00Z');

  assert.deepEqual(
    (await db.priceHistory('a2-c0', 'HDL', '2026-12-11')).map((point) => point.priceCents),
    [30000, 32000, 28000],
  );
  assert.deepEqual(
    (await db.availability('a2-c0', '2026-01-01')).map((row) => [row.provider, row.arrival, row.parkCount]),
    [
      ['landal', '2026-12-11', 1],
      ['landal', '2026-12-11', 1],
      ['landal', '2026-12-11', 1],
    ],
  );
  db.close();
});

test('counts Google requests per month', async () => {
  const db = await open('budget.db');
  await db.countGoogleRequest('2026-10');
  await db.countGoogleRequest('2026-10');
  assert.equal(await db.googleRequests('2026-10'), 2);
  assert.equal(await db.googleRequests('2026-11'), 0);
  db.close();
});

test('replaces park facilities without touching the definitions', async () => {
  const db = await open('new.db');
  await db.replaceFacilityDefinitions(filterGroups);
  await db.replaceParkFacilities(new Map([['9299.16301', new Set(['HDL', 'LOO'])]]));
  await db.replaceFacilityDefinitions(filterGroups);

  assert.deepEqual([...(await db.facilitiesByPark()).keys()].sort(), ['HDL', 'LOO']);
  assert.equal((await db.facilityGroups('park'))[0].options[0].name, 'Overdekt zwembad');
  assert.ok(await db.facilitiesUpdatedAt());
  db.close();
});

test('stores many park facilities in a few statements', async () => {
  const db = await open('many.db');
  const codes = new Set(Array.from({ length: 250 }, (_, index) => `P${index}`));
  await db.replaceParkFacilities(new Map([['9299.16301', codes]]));
  assert.equal((await db.facilitiesByPark()).size, 250);
  db.close();
});

test('keeps the precomputed overview, the round progress and scan requests for other processes', async () => {
  const db = await open('overview.db');
  assert.equal(await db.overviewParks('a2-c0'), null);

  const parks = [{ code: 'HDL' }];
  await db.saveOverview('a2-c0', { computedAt: '2026-10-22T12:00:00Z', meta: '{"providers":[]}', parks: gzipSync(JSON.stringify(parks)) });
  await db.saveCollectorStatus({ running: true, phase: 'prices', heartbeatAt: '2026-10-22T12:00:00Z' });
  await db.requestScan({ requestedAt: '2026-10-22T12:01:00Z' });

  assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(await db.overviewParks('a2-c0')))), parks);
  assert.equal(await db.overviewComputedAt('a2-c0'), '2026-10-22T12:00:00Z');
  const inputs = await db.statusInputs();
  assert.equal(inputs.settings.adults, 2);
  assert.equal(inputs.collector.phase, 'prices');
  assert.equal(inputs.scanRequestedAt, '2026-10-22T12:01:00Z');
  assert.deepEqual(inputs.overviews, [{ groupKey: 'a2-c0', computedAt: '2026-10-22T12:00:00Z', meta: '{"providers":[]}' }]);

  await db.clearScanRequest();
  assert.equal(await db.scanRequestedAt(), null);
  db.close();
});

test("keeps other providers' facility names per park, replacing only the parks read again", async () => {
  const db = await open('facility-names.db');
  await db.replaceFacilityNames(new Map([['topparken:1', ['Buitenzwembad', 'Kidsclub']], ['molecaten:2', ['WiFi']]]));
  await db.replaceFacilityNames(new Map([['topparken:1', ['Buitenzwembad', 'Buitenzwembad']]]));
  const names = await db.facilityNamesByPark();
  assert.deepEqual(names.get('topparken:1'), ['Buitenzwembad']);
  assert.deepEqual(names.get('molecaten:2'), ['WiFi']);
  assert.ok(await db.facilityNamesUpdatedAt());
  db.close();
});

test('keeps what a round changed and its price levels, and knows which finished rounds still lack them', async () => {
  const db = await open('scan-changes.db');
  const since = '2026-10-01T00:00:00Z';
  const weekend = { arrival: '2026-11-13', departure: '2026-11-16' };
  const first = await db.startScan('a2-c0', '2026-10-22T06:45:00Z');
  await db.savePrices(first, weekend, [offer('HRK', 52.9)]);
  await db.finishScan(first);
  const second = await db.startScan('a2-c0', '2026-10-22T18:00:00Z');
  await db.savePrices(second, weekend, [{ ...offer('HRK', 52.9), priceCents: 18000 }]);
  await db.finishScan(second);
  // Still running: no summary until it finishes.
  await db.startScan('a2-c0', '2026-10-23T06:45:00Z');

  assert.deepEqual(await db.scansToSummarize({ since, limit: 10 }), [
    { scanId: second, previousScanId: first },
    { scanId: first, previousScanId: null },
  ]);
  assert.deepEqual((await db.scanRows(second)).map((row) => [row.parkCode, row.priceCents, row.provider]), [['HRK', 18000, 'landal']]);

  // A summary from before price levels were kept is made again.
  await db.saveScanChanges(second, first, { prices: 1, down: 1 });
  assert.deepEqual((await db.scansToSummarize({ since, limit: 10 })).map((row) => row.scanId), [second, first]);
  const stats = { all: [1, 18000, 18000, 18000, 18000], weekends: {}, parks: {}, providers: { landal: 1 } };
  await db.saveScanChanges(second, first, { prices: 1, down: 1 }, stats);
  assert.deepEqual((await db.scansToSummarize({ since, limit: 10 })).map((row) => row.scanId), [first]);
  // Rounds from before the admin page's window are left alone.
  assert.deepEqual(await db.scansToSummarize({ since: '2026-10-22T12:00:00Z', limit: 10 }), []);

  const [running, latest] = await db.rounds(2);
  assert.equal(running.finishedAt, null);
  assert.deepEqual(latest.changes, { prices: 1, down: 1 });
  assert.deepEqual((await db.roundStats('a2-c0', since)).map((round) => [round.id, round.changes.down, round.stats.all[0]]), [
    [second, 1, 1],
  ]);
  db.close();
});

test("puts a park's and a weekend's price history together as JSON", async () => {
  const db = await open('histories.db');
  const since = '2026-10-01T00:00:00Z';
  const november = { arrival: '2026-11-13', departure: '2026-11-16' };
  const priced = (code, priceCents, accommodationCode = 'x') => ({ ...offer(code, 52.9), priceCents, accommodationCode });
  const first = await db.startScan('a2-c0', '2026-10-22T06:45:00Z');
  await db.savePrices(first, november, [priced('HRK', 30000), priced('KWW', 50000)]);
  await db.finishScan(first);
  const second = await db.startScan('a2-c0', '2026-10-22T18:00:00Z');
  await db.savePrices(second, november, [priced('HRK', 27000, 'y')]);
  await db.finishScan(second);
  // Another size's prices stay out.
  const other = await db.startScan('a4-c0', '2026-10-22T19:00:00Z');
  await db.savePrices(other, november, [priced('HRK', 99000)]);
  await db.finishScan(other);
  await db.saveAccommodations('HRK', [{ code: 'y', name: 'Lariks 6', url: 'https://example.org/y', facts: [], photos: ['p.jpg'] }]);

  const park = await db.parkHistory('HRK', 'a2-c0', since);
  assert.equal(JSON.parse(park.park).name, 'HRK');
  assert.deepEqual(JSON.parse(park.accommodations), { y: { name: 'Lariks 6', url: 'https://example.org/y', photo: 'p.jpg' } });
  assert.deepEqual(JSON.parse(park.rows), [
    ['2026-10-22T06:45:00Z', '2026-11-13', 30000, 'x'],
    ['2026-10-22T18:00:00Z', '2026-11-13', 27000, 'y'],
  ]);
  assert.equal((await db.parkHistory('NOPE', 'a2-c0', since)).park, null);

  const weekend = await db.weekendHistory('2026-11-13', 'a2-c0', since);
  assert.equal(JSON.parse(weekend.latestAt), '2026-10-22T18:00:00Z');
  const parks = Object.fromEntries(JSON.parse(weekend.parks).map(([code, ...rest]) => [code, rest]));
  assert.deepEqual(parks.HRK, [30000, '2026-10-22T06:45:00Z', 27000, '2026-10-22T18:00:00Z', 27000, 30000, 2]);
  // Last seen in the first round: no longer free.
  assert.deepEqual(parks.KWW, [50000, '2026-10-22T06:45:00Z', 50000, '2026-10-22T06:45:00Z', 50000, 50000, 1]);
  db.close();
});

test('a scan request can name party sizes; one for all sizes covers the others', async () => {
  const db = await open('scan-request.db');
  assert.deepEqual(await db.scanRequest(), { requestedAt: null, parties: [] });

  await db.requestScan({ parties: ['a2-c0'], requestedAt: '2026-10-23T10:00:00Z' });
  await db.requestScan({ parties: ['a3-c0', 'a2-c0'], requestedAt: '2026-10-23T10:01:00Z' });
  assert.deepEqual(await db.scanRequest(), { requestedAt: '2026-10-23T10:01:00Z', parties: ['a2-c0', 'a3-c0'] });

  await db.requestScan({ requestedAt: '2026-10-23T10:02:00Z' });
  await db.requestScan({ parties: ['a4-c0'], requestedAt: '2026-10-23T10:03:00Z' });
  assert.deepEqual((await db.scanRequest()).parties, []);

  await db.clearScanRequest();
  assert.deepEqual(await db.scanRequest(), { requestedAt: null, parties: [] });
  db.close();
});

test('keeps price-watch runs with their changes, and the prices to compare the next run with', async () => {
  const db = await open('watch.db');
  assert.deepEqual(await db.watchState(), { lastAt: null, claimedAt: null, snapshot: null });

  await db.claimWatch('2026-10-23T04:00:00Z');
  assert.equal((await db.watchState()).claimedAt, '2026-10-23T04:00:00Z');
  const snapshot = { searches: [{ key: 'landal|HRK|2026-10-30', provider: 'landal', ok: true }], prices: { a: 1 } };
  const change = { provider: 'landal', park: 'HRK', accommodation: '4A', arrival: '2026-10-30', oldCents: 30000, newCents: 28000 };
  await db.saveWatchRun({ at: '2026-10-23T04:00:30Z', summary: { landal: { compared: 1, up: 0, down: 1 } }, changes: [change], snapshot });
  await db.saveWatchRun({ at: '2026-10-23T04:30:30Z', summary: { landal: { compared: 1, up: 0, down: 0 } }, changes: [], snapshot: null });

  const state = await db.watchState();
  assert.deepEqual(state, { lastAt: '2026-10-23T04:30:30Z', claimedAt: null, snapshot });
  assert.deepEqual((await db.watchRuns('2026-10-01')).map((run) => [run.at, run.summary.landal.down]), [
    ['2026-10-23T04:00:30Z', 1],
    ['2026-10-23T04:30:30Z', 0],
  ]);
  assert.deepEqual(await db.watchChanges('2026-10-01'), [{ at: '2026-10-23T04:00:30Z', ...change }]);
  db.close();
});

test('knows per party size when it last succeeded and how often it was tried lately', async () => {
  const db = await open('attempts.db');
  const ok = await db.startScan('a2-c0', '2026-10-23T04:45:00Z');
  await db.finishScan(ok);
  const failed = await db.startScan('a2-c0', '2026-10-23T16:00:00Z');
  await db.finishScan(failed, 'Server database capacity temporarily exceeded');
  // Interrupted: never finished.
  await db.startScan('a2-c0', '2026-10-23T16:30:00Z');

  const a2 = (await db.followedParties()).find((party) => party.key === 'a2-c0');
  assert.deepEqual([a2.lastStartedAt, a2.lastSucceededAt], ['2026-10-23T16:30:00Z', '2026-10-23T04:45:00Z']);
  assert.deepEqual(await db.scanStartsSince('2026-10-23T16:00:00Z'), { 'a2-c0': 2 });
  db.close();
});
