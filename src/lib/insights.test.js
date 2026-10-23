import assert from 'node:assert/strict';
import { test } from 'node:test';
import { priceInsight, weekendLevels } from './insights.js';

const weekend = (arrival, priceCents) => ({ arrival, departure: arrival, priceCents });

test('labels weekends as cheap, typical or expensive against the middle weekend price', () => {
  const levels = weekendLevels([
    { arrival: 'a', medianCents: 30000 },
    { arrival: 'b', medianCents: 26000 },
    { arrival: 'c', medianCents: 30500 },
    { arrival: 'd', medianCents: 36000 },
  ]);
  assert.deepEqual(
    levels.map((item) => item.level),
    ['typical', 'low', 'typical', 'high'],
  );
  assert.equal(levels[1].share, -0.14);
});

test('places a weekend price within the park\'s usual price band', () => {
  const park = {
    weekends: [
      weekend('1', 20000),
      weekend('2', 30000),
      weekend('3', 30000),
      weekend('4', 32000),
      weekend('5', 34000),
      weekend('6', 60000),
    ],
  };
  const insight = priceInsight(park, park.weekends[0]);
  assert.equal(insight.level, 'low');
  assert.equal(insight.typicalLowCents, 30000);
  assert.equal(insight.typicalHighCents, 33500);
  assert.equal(insight.minCents, 20000);
  assert.equal(insight.maxCents, 60000);
  assert.equal(insight.position, 0);
  assert.equal(priceInsight(park, park.weekends[3]).level, 'typical');
  assert.equal(priceInsight(park, park.weekends[5]).level, 'high');
});

test('judges against the park\'s normal price, like the deal badge does', () => {
  const park = {
    baselineCents: 35100,
    weekends: [weekend('1', 25800), weekend('2', 26500), weekend('3', 35100), weekend('4', 36000), weekend('5', 82700)],
  };
  const insight = priceInsight(park, park.weekends[1]);
  assert.equal(insight.typicalLowCents, 26500);
  assert.equal(insight.level, 'low');
});

test('has no insight for a park with too few weekends', () => {
  assert.equal(priceInsight({ weekends: [weekend('1', 20000), weekend('2', 30000)] }, weekend('1', 20000)), null);
});
