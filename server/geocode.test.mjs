import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergePlaces, parseNominatim, parsePdok } from './geocode.mjs';

test('reads Dutch addresses from the PDOK location server', () => {
  const places = parsePdok({
    response: {
      docs: [
        { type: 'adres', weergavenaam: 'Domplein 1, 3512JC Utrecht', centroide_ll: 'POINT(5.12202874 52.09119067)' },
        { type: 'woonplaats', weergavenaam: 'Amersfoort, Amersfoort, Utrecht', centroide_ll: 'POINT(5.389 52.168)' },
      ],
    },
  });
  assert.deepEqual(places[0], { label: 'Domplein 1, 3512JC Utrecht', lat: 52.09119067, lng: 5.12202874 });
  assert.equal(places.length, 2);
});

test('reads places from OpenStreetMap Nominatim', () => {
  const places = parseNominatim([
    { display_name: 'Stadhuis Antwerpen, 1, Grote Markt, Antwerpen, België', lat: '51.2213112', lon: '4.3991737' },
  ]);
  assert.deepEqual(places, [{ label: 'Stadhuis Antwerpen, 1, Grote Markt, Antwerpen, België', lat: 51.2213112, lng: 4.3991737 }]);
});

test('lists PDOK first, drops duplicates and keeps the list short', () => {
  const a = { label: 'A', lat: 1, lng: 1 };
  const b = { label: 'B', lat: 2, lng: 2 };
  const merged = mergePlaces([a, b], [{ ...a }, { label: 'C', lat: 3, lng: 3 }], 3);
  assert.deepEqual(merged.map((place) => place.label), ['A', 'B', 'C']);
});
