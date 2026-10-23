import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatEuros, wholeEuros } from './format.js';

test('rounds prices up to whole euros, as Landal shows them', () => {
  assert.equal(wholeEuros(145220), 1453);
  assert.equal(wholeEuros(145200), 1452);
  assert.match(formatEuros(145220), /^€\s1\.453$/);
});
