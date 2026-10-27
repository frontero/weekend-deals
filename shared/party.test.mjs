import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupKey, parseGroupKey, partyLabel, partyOf, seriesFor, STANDARD_PARTIES } from './party.mjs';

const party = (adults, children, extra = {}) => ({ adults, children, pets: 0, accommodationFeatures: [], ...extra });

test('follows 2, 3, 4, 5, 6, 8, 10 and 12 people ahead of time', () => {
  assert.deepEqual(STANDARD_PARTIES.map(groupKey), ['a2-c0', 'a3-c0', 'a4-c0', 'a5-c0', 'a6-c0', 'a8-c0', 'a10-c0', 'a12-c0']);
});

test('lists the prices of the smallest size that fits everyone, children counted as people', () => {
  assert.equal(groupKey(seriesFor(party(4, 2))), 'a6-c0');
  assert.equal(groupKey(seriesFor(party(2, 2, { pets: 1 }))), 'a4-c0');
  assert.equal(groupKey(seriesFor(party(1, 0))), 'a2-c0');
  assert.equal(groupKey(seriesFor(party(5, 2))), 'a8-c0');
  assert.equal(groupKey(seriesFor(party(6, 4))), 'a10-c0');
  // Larger parties than the largest size get its prices; their own price comes live per park.
  assert.equal(partyLabel(seriesFor(party(10, 4))), '12 personen');
});

test('reads a party back from its group key', () => {
  for (const original of [party(2, 2), party(4, 2, { pets: 1 }), party(2, 0, { accommodationFeatures: ['9266.16393', '9266.16402'] })]) {
    assert.deepEqual(parseGroupKey(groupKey(original)), original);
  }
  assert.equal(parseGroupKey('a2-c2; DROP TABLE prices'), null);
});

test('keeps only the party fields of the settings', () => {
  assert.deepEqual(partyOf({ adults: 2, children: 1, pets: 0, accommodationFeatures: [], weeksAhead: 16 }), party(2, 1));
});
