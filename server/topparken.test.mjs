import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availabilityParams, parseFacilityNames, parseLeafletCoordinates, toOffer } from './topparken.mjs';

test('asks for holiday homes for the whole party', () => {
  const params = new URLSearchParams(
    availabilityParams({ arrival: '2026-11-06', departure: '2026-11-09', adults: 2, children: 2, pets: 1 }),
  );
  assert.equal(params.get('StartDate'), '2026-11-06');
  assert.equal(params.get('EndDate'), '2026-11-09');
  assert.equal(params.get('HolidayType'), '1');
  assert.equal(params.get('Adults'), '2');
  assert.equal(params.get('Children'), '2');
  assert.equal(params.get('Pets'), '1');
});

test('turns a park result into an offer with a namespaced code', () => {
  const offer = toOffer({
    id: 1524,
    name: 'Résidence Valkenburg',
    cheapestCost: 385.5,
    location: { province: 'Limburg', city: 'Schin op Geul', country: 'Nederland' },
    image: { url: 'https://www.topparken.nl/media/valkenburg.jpg?width=640&height=230' },
    parkLink: { url: 'https://www.topparken.nl/vakantieparken/residence-valkenburg' },
    accommodationsLink: { url: 'https://www.topparken.nl/vakantieparken/residence-valkenburg/vakantiehuizen' },
  });
  assert.deepEqual(offer, {
    park: {
      code: 'topparken:1524',
      provider: 'topparken',
      name: 'Résidence Valkenburg',
      region: 'Limburg',
      city: 'Schin op Geul',
      country: 'NL',
      url: 'https://www.topparken.nl/vakantieparken/residence-valkenburg',
      pricesUrl: 'https://www.topparken.nl/vakantieparken/residence-valkenburg/vakantiehuizen',
      imageUrl: 'https://www.topparken.nl/media/valkenburg.jpg?width=640&height=230',
      lat: null,
      lng: null,
    },
    priceCents: 38550,
    accommodationCode: null,
  });
});

test('reads the map pin from a park page', () => {
  const html = `<script> data['leaflet'] = {
                latitude: 52.088151599999996,
                longitude: 5.6690337,
                name: 'Lunteren',
            }</script>`;
  assert.deepEqual(parseLeafletCoordinates(html), { lat: 52.088151599999996, lng: 5.6690337 });
  assert.equal(parseLeafletCoordinates('<html></html>'), null);
});

test('reads the facility labels under "Faciliteiten op het park", not the menu links elsewhere', () => {
  const pill = (name) => `<li class="w-fit"> <div class="rounded-full py-1 px-3 border border-surface-300"> <p> ${name} </p> </div> </li>`;
  const html = `<nav><a>Vakantiehuis met sauna</a></nav>
    <h2>Faciliteiten op het park</h2><ul>${pill('Buitenzwembad')}${pill('Caf&#xE9; / Bar')}</ul>
    <h2>Accommodaties</h2><ul>${pill('Wellness vakantiehuis')}</ul>`;
  assert.deepEqual(parseFacilityNames(html), ['Buitenzwembad', 'Café / Bar']);
  assert.deepEqual(parseFacilityNames('<p>no facilities</p>'), []);
});
