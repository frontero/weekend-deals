import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alertMessage, cleanSearch, newOrCheaper, NTFY_SERVER, sendNotification } from './alerts.mjs';

const deal = (code, priceCents, discount = 0.3) => ({
  park: { code, name: `Park ${code}` },
  weekend: { arrival: '2026-11-13', departure: '2026-11-16', priceCents, discount },
});

test('keeps only the known filters, and the home only roughly', () => {
  const search = cleanSearch({
    minDiscountPercent: 20,
    brands: ['landal', 3],
    parks: ['HRK', { $ne: 1 }],
    search: 'veluwe',
    origin: { lat: 52.09073, lng: 5.12142, label: 'Domplein 1, Utrecht' },
    maxDistanceKm: 50,
    sort: 'price',
    evil: { $where: 1 },
  });
  assert.deepEqual(search, {
    minDiscountPercent: 20,
    search: 'veluwe',
    brands: ['landal'],
    maxDistanceKm: 50,
    parks: ['HRK'],
    origin: { lat: 52.09, lng: 5.12 },
  });
});

test('tells about new deals and clearly cheaper ones, not the same price coming back', () => {
  const told = new Map([
    ['A|2026-11-13', 40000],
    ['B|2026-11-13', 30000],
  ]);
  const news = newOrCheaper([deal('A', 39500), deal('B', 29000), deal('C', 50000)], told);
  assert.deepEqual(news.map((item) => item.park.code), ['B', 'C']);
});

test('one message lists the best deals and links to the search', () => {
  const alert = { label: '20%+ onder normaal · Max € 500', query: 'maxPriceEuros=500' };
  const message = alertMessage(alert, [deal('A', 42900, 0.31)], 'https://weekend-deals.example.workers.dev');
  assert.equal(message.title, 'Buitenkansje: Park A');
  assert.match(message.message, /^Park A · vr 13 nov – ma 16 nov · €\s429 \(31% onder normaal\)/);
  assert.match(message.message, /Alarm: 20%\+ onder normaal · Max € 500$/);
  assert.equal(message.click, 'https://weekend-deals.example.workers.dev/?maxPriceEuros=500');

  const many = alertMessage(alert, Array.from({ length: 7 }, (_, index) => deal(`P${index}`, 30000)), null);
  assert.equal(many.title, '7 nieuwe buitenkansjes');
  assert.match(many.message, /en nog 2 meer/);
  assert.equal(many.click, undefined);
});

test('sends to the topic on ntfy and reports a refusal', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: calls.length === 1, status: 429 };
  };
  await sendNotification('weekendjeweg-abcdefghijklmnop', { title: 'T', message: 'M' }, fetchImpl);
  assert.deepEqual(calls[0], { url: NTFY_SERVER, body: { topic: 'weekendjeweg-abcdefghijklmnop', title: 'T', message: 'M' } });
  await assert.rejects(sendNotification('weekendjeweg-abcdefghijklmnop', {}, fetchImpl), /429/);
});

test('a message opens the best deal at the provider through the tracked link', () => {
  const app = 'https://weekend-deals.example.workers.dev';
  const park = { code: 'HRK', name: 'Park HRK', provider: 'landal', pricesUrl: 'https://www.landal.nl/parken/hrk/prijzen-en-beschikbaarheid' };
  const best = { park, weekend: { arrival: '2026-11-13', departure: '2026-11-16', priceCents: 30000, discount: 0.3 } };
  const alert = { label: 'Park HRK', query: '', partyKey: 'a2-c0', party: null };

  const one = alertMessage(alert, [best], app);
  const book = new URL(one.click);
  assert.equal(book.pathname, '/api/go');
  assert.equal(new URL(book.searchParams.get('url')).host, 'www.landal.nl');
  assert.deepEqual([book.searchParams.get('park'), book.searchParams.get('from')], ['HRK', 'alarm']);
  assert.deepEqual(one.actions.map((action) => action.label), ['Boek Park HRK bij Landal']);

  const two = alertMessage(alert, [best, deal('B', 40000)], app);
  assert.equal(two.click, `${app}/`);
  assert.deepEqual(two.actions.map((action) => action.label), ['Boek Park HRK bij Landal', 'Alle kansjes bekijken']);
});
