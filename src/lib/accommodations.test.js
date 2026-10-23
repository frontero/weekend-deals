import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accommodationFor, accommodationSummary, photosFor } from './accommodations.js';

const lariks = {
  name: 'Lariks 6',
  url: 'https://www.landal.nl/parken/hunzepark/accommodaties/lariks-6',
  facts: ['42 m²', 'Vrijstaand', 'Drie slaapkamers'],
  photos: ['https://cdn/1?t=cw800'],
};
const park = { imageUrl: 'https://cdn/park.jpg', accommodations: { '281CHLA': lariks } };

test('finds the accommodation behind a weekend price', () => {
  assert.equal(accommodationFor(park, { accommodationCode: '281CHLA' }), lariks);
  assert.equal(accommodationFor(park, { accommodationCode: 'unknown' }), null);
  assert.equal(accommodationFor({ imageUrl: null }, { accommodationCode: '281CHLA' }), null);
});

test('sums an accommodation up as its name and first facts', () => {
  assert.equal(accommodationSummary(lariks), 'Lariks 6 · 42 m² · Vrijstaand');
  assert.equal(accommodationSummary(lariks, 3), 'Lariks 6 · 42 m² · Vrijstaand · Drie slaapkamers');
  assert.equal(accommodationSummary({ name: null, facts: [] }), '');
  assert.equal(accommodationSummary(null), '');
});

test('shows the accommodation photos, else the park photo', () => {
  assert.deepEqual(photosFor(park, { accommodationCode: '281CHLA' }), lariks.photos);
  assert.deepEqual(photosFor(park, { accommodationCode: 'unknown' }), ['https://cdn/park.jpg']);
  assert.deepEqual(photosFor({ imageUrl: null }, {}), []);
});
