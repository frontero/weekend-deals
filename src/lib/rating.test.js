import assert from 'node:assert/strict';
import { test } from 'node:test';
import { starFills } from './rating.js';

test('fills five stars in proportion to the rating', () => {
  assert.deepEqual(starFills(4.3), [1, 1, 1, 1, 0.3]);
  assert.deepEqual(starFills(5), [1, 1, 1, 1, 1]);
  assert.deepEqual(starFills(0), [0, 0, 0, 0, 0]);
});
