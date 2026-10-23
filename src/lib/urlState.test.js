import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readQuery, writeQuery } from './urlState.js';

const defaults = { minDiscountPercent: 20, country: '', maxPriceEuros: null, facilities: [], minRating: 0, sort: 'deal' };

test('only writes what differs from the defaults', () => {
  const query = writeQuery({ ...defaults, country: 'NL', facilities: ['9299.16301', '9284.16380'] }, defaults);
  assert.equal(query, 'country=NL&facilities=9299.16301%2C9284.16380');
  assert.equal(writeQuery(defaults, defaults), '');
});

test('reads values back with the types of the defaults', () => {
  const state = readQuery('?minDiscountPercent=30&maxPriceEuros=400&facilities=a%2Cb&minRating=4.3&bogus=1', defaults);
  assert.deepEqual(state, { ...defaults, minDiscountPercent: 30, maxPriceEuros: 400, facilities: ['a', 'b'], minRating: 4.3 });
});

test('ignores values that do not parse', () => {
  assert.deepEqual(readQuery('?minDiscountPercent=lots', defaults), defaults);
});
