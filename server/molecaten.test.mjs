import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cheapestPerPark, parseDutchPrice, parseFacilityNames, parseMarkers, searchState } from './molecaten.mjs';

test('reads Dutch prices', () => {
  assert.equal(parseDutchPrice('285,86'), 28586);
  assert.equal(parseDutchPrice('1.069,08'), 106908);
});

test('searches rentals for the whole party, exact dates, cheapest first', () => {
  const state = searchState({ arrival: '2026-11-06', departure: '2026-11-09', adults: 2, children: 2, pets: 1 }, '1', 3);
  assert.deepEqual(state.arrivaldate, ['20261106']);
  assert.deepEqual(state.duration, ['3']);
  assert.deepEqual(state.soonerlater, ['0']);
  assert.deepEqual(state.numberofpeople, ['4']);
  assert.deepEqual(state.pet, ['True']);
  assert.deepEqual(state.holidaytype, ['1']);
  assert.deepEqual(state.country, ['1']);
  assert.deepEqual(state.pagenumber, ['3']);
  assert.deepEqual(state.sortorder, ['PriceLowHigh']);
});

test('reads park pins from the map page', () => {
  const html = `var markers = [
{"ID":1,"name":"Noordduinen","region":"Duin- en Bollenstreek","url":"/noordduinen","coordinates":{"lat":52.21175,"lng":4.409823 } },{"ID":2,"name":"Waterbos","region":"Zuid-Hollandse Eilanden","url":"/waterbos","coordinates":{"lat":51.88257,"lng":4.053441 } }
];`;
  const markers = parseMarkers(html);
  assert.deepEqual(markers.get('noordduinen'), { lat: 52.21175, lng: 4.409823 });
  assert.equal(markers.size, 2);
  // The live page ends the list without a semicolon.
  assert.equal(parseMarkers(html.replace('];', ']\n //]]>')).size, 2);
});

test('keeps the first, cheapest accommodation of every park', () => {
  const rows = [
    { subtitle: 'De Leemkule, Hattem, Veluwe', title: '2 persoons vakantiehuisje Petrea', price: '285,86', url: '/de-leemkule/vakantiehuisje/petrea?ad=1', idobjecttype: 4026, imageurls: ['https://cdn/leemkule.jpg'] },
    { subtitle: 'Noordduinen, Katwijk aan Zee, Duin- en Bollenstreek', price: '323,58', url: '/noordduinen/chalet/waterhoen?ad=1', idobjecttype: 6026, imageurls: [] },
    { subtitle: 'De Leemkule, Hattem, Veluwe', price: '313,88', url: '/de-leemkule/vakantiehuisje/vuursteen?ad=1', idobjecttype: 4027, imageurls: [] },
  ];
  const parks = cheapestPerPark(rows);
  assert.deepEqual(parks, [
    {
      slug: 'de-leemkule',
      name: 'De Leemkule',
      city: 'Hattem',
      region: 'Veluwe',
      priceCents: 28586,
      accommodationCode: '4026',
      imageUrl: 'https://cdn/leemkule.jpg',
      bookingUrl: 'https://www.molecaten.nl/de-leemkule/vakantiehuisje/petrea?ad=1',
      accommodation: {
        code: '4026',
        name: '2 persoons vakantiehuisje Petrea',
        url: 'https://www.molecaten.nl/de-leemkule/vakantiehuisje/petrea',
        facts: [],
        photos: ['https://cdn/leemkule.jpg'],
      },
    },
    {
      slug: 'noordduinen',
      name: 'Noordduinen',
      city: 'Katwijk aan Zee',
      region: 'Duin- en Bollenstreek',
      priceCents: 32358,
      accommodationCode: '6026',
      imageUrl: null,
      bookingUrl: 'https://www.molecaten.nl/noordduinen/chalet/waterhoen?ad=1',
      accommodation: {
        code: '6026',
        name: null,
        url: 'https://www.molecaten.nl/noordduinen/chalet/waterhoen',
        facts: [],
        photos: [],
      },
    },
  ]);
});

test('names each facility by the first part of its item on the facilities page', () => {
  const html = `<li class="menu-item"><a href="/flevostrand">Flevostrand</a></li>
    <h2>Faciliteiten &amp; openingstijden</h2>
    <ul><li> <p> <a href="/eten">Eten &amp; drinken De Koerberg</a> met restaurant en terras. Bekijk de menukaart </p></li>
    <li> <p> Tennisbaan (kunstgras), <a href="#">bekijk de tarieven</a> </p></li>
    <li> <p> Snackbar: Frites, snacks en pizza </p></li></ul>`;
  assert.deepEqual(parseFacilityNames(html), ['Eten & drinken De Koerberg met restaurant en terras', 'Tennisbaan (kunstgras)', 'Snackbar']);
});
