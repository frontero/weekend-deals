import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bestWeekend,
  countFacilities,
  filterParks,
  findDeals,
  onePerPark,
  searchDeals,
  sortDeals,
  withinDates,
} from './deals.js';

const park = (code, country, weekends) => ({ code, name: code, country, baselineCents: 30000, weekends });
const weekend = (arrival, priceCents, discount, highestCents = priceCents) => ({
  arrival,
  departure: arrival,
  priceCents,
  discount,
  highestCents,
});

const parks = [
  park('A', 'NL', [weekend('2026-11-06', 18000, 0.4), weekend('2026-11-13', 27000, 0.1)]),
  park('B', 'BE', [weekend('2026-11-06', 22500, 0.25)]),
  park('C', 'NL', [weekend('2026-11-06', 24000, null)]),
];

test('returns weekends at or above the minimum discount, best first', () => {
  const deals = findDeals(parks, { minDiscount: 0.2 });
  assert.deepEqual(
    deals.map((deal) => [deal.park.code, deal.weekend.arrival]),
    [
      ['A', '2026-11-06'],
      ['B', '2026-11-06'],
    ],
  );
});

test('filters on country, maximum price and park name', () => {
  assert.equal(findDeals(parks, { minDiscount: 0.2, country: 'BE' }).length, 1);
  assert.equal(findDeals(parks, { minDiscount: 0.2, maxPriceEuros: 200 }).length, 1);
  assert.equal(findDeals(parks, { minDiscount: 0.2, search: 'b' })[0].park.code, 'B');
});

test("an alert on one park's weekend finds it only at or below its price", () => {
  const watch = { parks: ['A'], from: '2026-11-13', to: '2026-11-13', minDiscountPercent: 0 };
  assert.deepEqual(searchDeals(parks, { ...watch, maxPriceEuros: 270 }).map((deal) => deal.park.code), ['A']);
  assert.deepEqual(searchDeals(parks, { ...watch, maxPriceEuros: 260 }), []);
});

test('only keeps parks that have every selected facility', () => {
  const withFacilities = [
    { ...park('P', 'NL', []), facilities: ['overdekt-zwembad', 'sauna'] },
    { ...park('Q', 'NL', []), facilities: ['overdekt-zwembad'] },
    { ...park('R', 'NL', []), facilities: [] },
  ];
  const codes = (facilities) => filterParks(withFacilities, { facilities }).map((item) => item.code);
  assert.deepEqual(codes([]), ['P', 'Q', 'R']);
  assert.deepEqual(codes(['overdekt-zwembad']), ['P', 'Q']);
  assert.deepEqual(codes(['overdekt-zwembad', 'sauna']), ['P']);
  // Landal's own id, as links and price alerts from before named it.
  assert.deepEqual(codes(['9299.16301']), ['P', 'Q']);
});

test('keeps only parks within the chosen distance; parks without a distance drop out', () => {
  const placed = [
    { ...park('N', 'NL', []), distanceKm: 40 },
    { ...park('F', 'NL', []), distanceKm: 140 },
    { ...park('U', 'NL', []), distanceKm: null },
  ];
  const codes = (maxDistanceKm) => filterParks(placed, { maxDistanceKm }).map((item) => item.code);
  assert.deepEqual(codes(null), ['N', 'F', 'U']);
  assert.deepEqual(codes(100), ['N']);
});

test('sorts deals nearest first', () => {
  const deals = [
    { park: { distanceKm: 90 }, weekend: { discount: 0.3, priceCents: 1, arrival: 'a' } },
    { park: { distanceKm: null }, weekend: { discount: 0.3, priceCents: 1, arrival: 'a' } },
    { park: { distanceKm: 20 }, weekend: { discount: 0.3, priceCents: 1, arrival: 'a' } },
  ];
  assert.deepEqual(
    sortDeals(deals, 'distance').map((deal) => deal.park.distanceKm),
    [20, 90, null],
  );
});

test('keeps only parks of the chosen brands', () => {
  const mixed = [
    { ...park('L', 'NL', []), brand: 'landal' },
    { ...park('R', 'NL', []), brand: 'roompot' },
    { ...park('S', 'NL', []), brand: 'summio' },
  ];
  assert.deepEqual(
    filterParks(mixed, { brands: ['roompot', 'summio'] }).map((item) => item.code),
    ['R', 'S'],
  );
});

test('keeps only parks of the chosen providers', () => {
  const mixed = [
    { ...park('L', 'NL', []), provider: 'landal' },
    { ...park('E', 'NL', []), provider: 'europarcs' },
    { ...park('R', 'NL', []), provider: 'roompot' },
  ];
  const codes = (providers) => filterParks(mixed, { providers }).map((item) => item.code);
  assert.deepEqual(codes([]), ['L', 'E', 'R']);
  assert.deepEqual(codes(['europarcs', 'roompot']), ['E', 'R']);
});

test('a minimum Google rating drops lower rated parks and parks without a rating', () => {
  const rated = [
    { ...park('G', 'NL', []), googleRating: { rating: 4.5 } },
    { ...park('H', 'NL', []), googleRating: { rating: 3.9 } },
    { ...park('I', 'NL', []), googleRating: null },
  ];
  const codes = (minRating) => filterParks(rated, { minRating }).map((item) => item.code);
  assert.deepEqual(codes(0), ['G', 'H', 'I']);
  assert.deepEqual(codes(4), ['G']);
});

test('a chosen period keeps only its weekends, and only parks that offer one', () => {
  const scoped = withinDates(parks, '2026-11-13', '2026-11-13');
  assert.deepEqual(
    scoped.map((item) => [item.code, item.weekends.map((w) => w.arrival)]),
    [['A', ['2026-11-13']]],
  );
  assert.equal(withinDates(parks, '2026-11-06', '2026-11-13')[0].weekends.length, 2);
  assert.equal(withinDates(parks, '', ''), parks);
});

test('sorts deals by deal, price, Google rating or date', () => {
  const deals = [
    { park: { googleRating: { rating: 4.1 } }, weekend: { discount: 0.3, priceCents: 30000, arrival: '2026-11-20' } },
    { park: { googleRating: null }, weekend: { discount: 0.4, priceCents: 25000, arrival: '2026-11-27' } },
    { park: { googleRating: { rating: 4.6 } }, weekend: { discount: 0.2, priceCents: 40000, arrival: '2026-11-06' } },
  ];
  const order = (sort) => sortDeals(deals, sort).map((deal) => deals.indexOf(deal));
  assert.deepEqual(order('deal'), [1, 0, 2]);
  assert.deepEqual(order('price'), [1, 0, 2]);
  assert.deepEqual(order('rating'), [2, 0, 1]);
  assert.deepEqual(order('date'), [2, 0, 1]);
});

test('counts per facility how many of the given parks have it', () => {
  const groups = [{ name: 'Swimming', options: [{ id: 'pool', name: 'Pool' }, { id: 'lake', name: 'Lake' }] }];
  const counted = countFacilities(groups, [{ facilities: ['pool'] }, { facilities: ['pool'] }, { facilities: [] }]);
  assert.deepEqual(counted, [
    {
      name: 'Swimming',
      options: [
        { id: 'pool', name: 'Pool', count: 2 },
        { id: 'lake', name: 'Lake', count: 0 },
      ],
    },
  ]);
});

test('best weekend is the biggest discount, or the cheapest without a baseline', () => {
  assert.equal(bestWeekend(parks[0]).arrival, '2026-11-06');
  const noBaseline = park('E', 'NL', [weekend('2026-11-06', 30000, null), weekend('2026-11-13', 25000, null)]);
  assert.equal(bestWeekend(noBaseline).arrival, '2026-11-13');
});

test('marks a price that dropped since it was first seen', () => {
  const dropped = [park('D', 'NL', [weekend('2026-11-06', 18000, 0.4, 24000)])];
  assert.equal(findDeals(dropped, { minDiscount: 0.2 })[0].dropCents, 6000);
});

test('a search measures distance from home and applies dates, distance and discount like the screen', () => {
  const near = { code: 'N', lat: 52.1, lng: 5.1, facilities: [], weekends: [{ arrival: '2026-11-13', discount: 0.4, priceCents: 30000 }, { arrival: '2026-11-20', discount: 0.4, priceCents: 30000 }] };
  const far = { code: 'F', lat: 50.8, lng: 6.1, facilities: [], weekends: [{ arrival: '2026-11-13', discount: 0.4, priceCents: 30000 }] };
  const cheapish = { code: 'C', lat: 52.1, lng: 5.1, facilities: [], weekends: [{ arrival: '2026-11-13', discount: 0.1, priceCents: 30000 }] };
  const deals = searchDeals([near, far, cheapish], {
    origin: { lat: 52.09, lng: 5.12 },
    maxDistanceKm: 50,
    from: '2026-11-13',
    to: '',
    minDiscountPercent: 20,
  });
  assert.deepEqual(deals.map(({ park, weekend }) => `${park.code} ${weekend.arrival} ${park.distanceKm}`), ['N 2026-11-13 2']);
});

test('shows each park once, at its first deal in the chosen order, with its other qualifying weekends', () => {
  const deal = (code, arrival) => ({ park: { code }, weekend: { arrival } });
  const cards = onePerPark([deal('HDL', '2026-11-06'), deal('KWW', '2026-11-13'), deal('HDL', '2026-12-04'), deal('HDL', '2026-11-20')]);
  assert.deepEqual(
    cards.map((card) => [card.park.code, card.weekend.arrival, card.otherWeekends.map((weekend) => weekend.arrival)]),
    [
      ['HDL', '2026-11-06', ['2026-12-04', '2026-11-20']],
      ['KWW', '2026-11-13', []],
    ],
  );
});

test('a minimum discount of 0 turns the filter off: every weekend, also above normal or without a normal price', () => {
  const parks = [
    { ...park('A', 'NL', [{ arrival: '2026-11-06', priceCents: 30000, discount: 0.25 }]) },
    { ...park('B', 'NL', [{ arrival: '2026-11-06', priceCents: 40000, discount: -0.1 }]) },
    { ...park('C', 'NL', [{ arrival: '2026-11-06', priceCents: 35000, discount: null }]) },
  ];
  const codes = (minDiscount) => findDeals(parks, { minDiscount }).map((deal) => deal.park.code);
  assert.deepEqual(codes(0.1), ['A']);
  // Without a normal price to compare with, a weekend goes last.
  assert.deepEqual(codes(0), ['A', 'B', 'C']);
  assert.deepEqual(sortDeals(findDeals(parks, { minDiscount: 0 }), 'deal').map((deal) => deal.park.code), ['A', 'B', 'C']);
});
