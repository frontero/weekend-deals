import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analysePrices, median } from './analysis.mjs';

const weekend = (parkCode, arrival, priceCents, extra = {}) => ({
  parkCode,
  arrival,
  departure: arrival,
  priceCents,
  typicalCents: priceCents,
  highestCents: priceCents,
  accommodationCode: 'x',
  observations: 1,
  scanId: 1,
  ...extra,
});

test('median handles odd and even lists', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 3);
  assert.equal(median([]), null);
});

test('baseline is the median of the typical weekend prices of a park', () => {
  const { parks } = analysePrices(
    [
      weekend('A', '2026-11-06', 30000),
      weekend('A', '2026-11-13', 31000),
      weekend('A', '2026-11-20', 29000),
      weekend('A', '2026-11-27', 18000),
    ],
    '2026-10-22',
  );
  assert.equal(parks[0].baselineCents, 29500);
});

test('discount compares the latest price with the baseline', () => {
  const { parks } = analysePrices(
    [
      weekend('A', '2026-11-06', 30000),
      weekend('A', '2026-11-13', 30000),
      weekend('A', '2026-11-20', 30000),
      weekend('A', '2026-11-27', 30000, { priceCents: 21000 }),
    ],
    '2026-10-22',
  );
  const cheap = parks[0].weekends.find((item) => item.arrival === '2026-11-27');
  assert.equal(cheap.discount, 0.3);
});

test('needs at least four weekends before it trusts a baseline', () => {
  const { parks } = analysePrices(
    [weekend('A', '2026-11-06', 30000), weekend('A', '2026-11-13', 20000), weekend('A', '2026-11-20', 30000)],
    '2026-10-22',
  );
  assert.equal(parks[0].baselineCents, null);
  assert.equal(parks[0].weekends[1].discount, null);
});

test('past weekends count for the baseline but are not offered', () => {
  const { parks } = analysePrices(
    [
      weekend('A', '2026-09-04', 30000),
      weekend('A', '2026-09-11', 30000),
      weekend('A', '2026-09-18', 30000),
      weekend('A', '2026-11-06', 24000),
    ],
    '2026-10-22',
  );
  assert.equal(parks[0].baselineCents, 30000);
  assert.deepEqual(
    parks[0].weekends.map((item) => item.arrival),
    ['2026-11-06'],
  );
});

test('a weekend missing from the latest scan of that weekend is no longer offered', () => {
  const { parks } = analysePrices(
    [weekend('A', '2026-11-06', 20000, { scanId: 1 }), weekend('B', '2026-11-06', 25000, { scanId: 2 })],
    '2026-10-22',
  );
  const parkA = parks.find((park) => park.code === 'A');
  assert.deepEqual(parkA.weekends, []);
});

test('keeps the provider\'s direct link for each weekend', () => {
  const { parks } = analysePrices(
    [weekend('A', '2026-11-06', 20000, { bookingUrl: 'https://example.org/house?ad=20261106' })],
    '2026-10-22',
  );
  assert.equal(parks[0].weekends[0].bookingUrl, 'https://example.org/house?ad=20261106');
});

test('a provider that failed in the newest scan does not hide its parks', () => {
  const { parks } = analysePrices(
    [
      weekend('A', '2026-11-06', 20000, { scanId: 2, provider: 'landal' }),
      weekend('B', '2026-11-06', 25000, { scanId: 1, provider: 'europarcs' }),
    ],
    '2026-10-22',
  );
  assert.equal(parks.find((park) => park.code === 'B').weekends.length, 1);
});

test('market shows the median latest price per upcoming weekend', () => {
  const { market } = analysePrices(
    [
      weekend('A', '2026-11-06', 20000),
      weekend('B', '2026-11-06', 30000),
      weekend('C', '2026-11-06', 40000),
      weekend('A', '2026-11-13', 50000),
    ],
    '2026-10-22',
  );
  assert.deepEqual(market, [
    { arrival: '2026-11-06', departure: '2026-11-06', medianCents: 30000, parkCount: 3 },
    { arrival: '2026-11-13', departure: '2026-11-13', medianCents: 50000, parkCount: 1 },
  ]);
});
