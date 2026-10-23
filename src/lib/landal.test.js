import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accommodationUrl, parkMapUrl, weekendUrl } from './landal.js';

const park = { pricesUrl: 'https://www.landal.nl/parken/x/prijzen-en-beschikbaarheid' };
const weekend = { arrival: '2026-11-06', departure: '2026-11-09' };
const party = { adults: 2, children: 0, pets: 0, accommodationFeatures: [] };
const filterOf = (url) => JSON.parse(atob(url.split('#filter:')[1]));

test('opens the park with the weekend selected, cheapest first', () => {
  assert.deepEqual(filterOf(weekendUrl(park, weekend, party)), { a: '06-11-2026', d: '09-11-2026', so: 2, s: '3' });
});

test('opens the park on Google Maps: its own place when matched, otherwise its coordinates', () => {
  assert.equal(parkMapUrl({ googleRating: { mapsUrl: 'https://maps.google.com/?cid=1' } }), 'https://maps.google.com/?cid=1');
  assert.equal(
    parkMapUrl({ name: 'Marissa Resort', lat: 52.54, lng: 8.37, googleRating: null }),
    'https://www.google.com/maps/search/?api=1&query=52.54%2C8.37',
  );
  assert.equal(parkMapUrl({ name: 'Nowhere', lat: null, lng: null }), null);
});

test('carries the accommodation features so Landal shows the same kind of accommodation', () => {
  const features = { ...party, accommodationFeatures: ['9266.16393', '9266.16402'] };
  assert.equal(filterOf(weekendUrl(park, weekend, features)).f, '9266.16393|9266.16402');
});

test('carries the travel party, so Landal prices the stay for the same people', () => {
  const url = new URL(accommodationUrl('https://www.landal.nl/parken/rabbit-hill/accommodaties/12l', weekend, { adults: 6, children: 4, pets: 1 }));
  assert.equal(url.pathname, '/parken/rabbit-hill/accommodaties/12l');
  assert.deepEqual(Object.fromEntries(url.searchParams), { adults: '6', children: '4', pets: '1' });
  assert.deepEqual(filterOf(url.href), { a: '06-11-2026', d: '09-11-2026', so: 2, s: '3' });
  // Landal only reads counts above zero.
  assert.deepEqual(Object.fromEntries(new URL(weekendUrl(park, weekend, party)).searchParams), { adults: '2' });
});
