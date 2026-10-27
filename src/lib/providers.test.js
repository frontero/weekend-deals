import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bookingUrl, providerName, trackedBookingUrl } from './providers.js';

const weekend = { arrival: '2026-11-06', departure: '2026-11-09' };
const settings = { adults: 2, children: 1, pets: 1, accommodationFeatures: [] };

test('Landal parks open on Landal with the weekend and party selected', () => {
  const url = new URL(bookingUrl({ provider: 'landal', pricesUrl: 'https://www.landal.nl/parken/x/prijzen-en-beschikbaarheid' }, weekend, settings));
  assert.equal(url.pathname, '/parken/x/prijzen-en-beschikbaarheid');
  assert.equal(url.searchParams.get('children'), '1');
  assert.ok(url.hash.startsWith('#filter:'));
});

test('Landal opens the page of the accommodation behind the price, with the weekend selected', () => {
  const park = {
    provider: 'landal',
    pricesUrl: 'https://www.landal.nl/parken/hunzepark/prijzen-en-beschikbaarheid',
    accommodations: { '281CHLA': { url: 'https://www.landal.nl/parken/hunzepark/accommodaties/lariks-6' } },
  };
  const url = new URL(bookingUrl(park, { ...weekend, accommodationCode: '281CHLA' }, settings));
  assert.equal(`${url.origin}${url.pathname}`, 'https://www.landal.nl/parken/hunzepark/accommodaties/lariks-6');
  assert.equal(url.searchParams.get('adults'), '2');
  assert.deepEqual(JSON.parse(atob(url.hash.slice('#filter:'.length))), { a: '06-11-2026', d: '09-11-2026', so: 2, s: '3' });
  // Without its details, the park's price page.
  assert.ok(bookingUrl(park, { ...weekend, accommodationCode: 'other' }, settings).startsWith(park.pricesUrl));
});

test('Topparken parks open their holiday homes for the weekend and party', () => {
  const url = new URL(bookingUrl({ provider: 'topparken', pricesUrl: 'https://www.topparken.nl/vakantieparken/x/vakantiehuizen' }, weekend, settings));
  assert.equal(url.pathname, '/vakantieparken/x/vakantiehuizen');
  assert.equal(url.searchParams.get('startDate'), '2026-11-06');
  assert.equal(url.searchParams.get('endDate'), '2026-11-09');
  assert.equal(url.searchParams.get('holidayType'), '1');
  assert.equal(url.searchParams.get('adults'), '2');
  assert.equal(url.searchParams.get('children'), '1');
  assert.equal(url.searchParams.get('pets'), '1');
});

test('Molecaten parks open the search for that park, weekend and party', () => {
  const url = bookingUrl({ provider: 'molecaten', code: 'molecaten:4006', pricesUrl: 'https://www.molecaten.nl/zoek-boek' }, weekend, settings);
  const [base, hash] = url.split('#searchState=');
  const state = JSON.parse(decodeURIComponent(hash));
  assert.equal(base, 'https://www.molecaten.nl/zoek-boek');
  assert.deepEqual(state.parks, ['4006']);
  assert.deepEqual(state.arrivaldate, ['20261106']);
  assert.deepEqual(state.duration, ['3']);
  assert.deepEqual(state.numberofpeople, ['3']);
  assert.deepEqual(state.pet, ['True']);
});

test('a direct link for that weekend wins over the park-level link', () => {
  const direct = 'https://www.molecaten.nl/de-koerberg/vakantiehuisje/x?ad=20261023&vd=20261026&ap=4&hd=False';
  const park = { provider: 'molecaten', code: 'molecaten:4009', pricesUrl: 'https://www.molecaten.nl/zoek-boek' };
  assert.equal(bookingUrl(park, { ...weekend, bookingUrl: direct }, settings), direct);
});

test('a provider without a date link falls back to the park page', () => {
  assert.equal(bookingUrl({ provider: 'unknown', url: 'https://example.org/park' }, weekend, settings), 'https://example.org/park');
});

test('names providers for the screen', () => {
  assert.equal(providerName('landal'), 'Landal');
  assert.equal(providerName(undefined), 'Landal');
  assert.equal(providerName('molecaten'), 'Molecaten');
  assert.equal(providerName('something'), 'something');
});

test('hands out booking links through the tracked link, with where it was clicked', () => {
  const park = { code: 'HRK', provider: 'landal', pricesUrl: 'https://www.landal.nl/parken/x/prijzen-en-beschikbaarheid' };
  const tracked = new URL(trackedBookingUrl(park, weekend, settings, 'kaartje'), 'https://site.example');
  assert.equal(tracked.pathname, '/api/go');
  assert.equal(tracked.searchParams.get('url'), bookingUrl(park, weekend, settings));
  assert.deepEqual(
    ['park', 'arrival', 'from', 'party'].map((name) => tracked.searchParams.get(name)),
    ['HRK', weekend.arrival, 'kaartje', 'a2-c1-p1'],
  );
});
