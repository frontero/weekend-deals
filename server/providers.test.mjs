import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeProviders } from './providers.mjs';

const landal = { id: 'landal', supportsAccommodationFeatures: true };
const other = { id: 'other', supportsAccommodationFeatures: false };

test('every provider takes part without accommodation requirements', () => {
  assert.deepEqual(activeProviders([landal, other], { accommodationFeatures: [] }), [landal, other]);
});

test('only providers that understand accommodation requirements take part when some are set', () => {
  assert.deepEqual(activeProviders([landal, other], { accommodationFeatures: ['9266.16393'] }), [landal]);
});
