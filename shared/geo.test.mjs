import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distanceKm, distanceMetres } from './geo.mjs';

test('measures straight-line distances', () => {
  const metres = distanceMetres({ lat: 52.0, lng: 5.0 }, { lat: 52.01, lng: 5.0 });
  assert.ok(metres > 1100 && metres < 1120, String(metres));
  // Utrecht Dom to Amsterdam Dam is about 35 km.
  assert.equal(distanceKm({ lat: 52.0907, lng: 5.1214 }, { lat: 52.3731, lng: 4.8932 }), 35);
});
