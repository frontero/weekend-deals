import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeAccommodation, describePartyShort, describeTravelParty } from './stay.js';

test('describes the travel party in plain Dutch', () => {
  assert.equal(describeTravelParty({ adults: 1, children: 0, pets: 0 }), '1 volwassene');
  assert.equal(describeTravelParty({ adults: 2, children: 2, pets: 0 }), '2 volwassenen en 2 kinderen');
  assert.equal(describeTravelParty({ adults: 2, children: 1, pets: 1 }), '2 volwassenen, 1 kind en 1 huisdier');
});

test('lists the accommodation features, with "of" inside any-of groups', () => {
  const groups = [
    { name: 'Type', anyOf: true, options: [{ id: 'b', name: 'Bungalow' }, { id: 'l', name: 'Lodge' }, { id: 'v', name: 'Villa' }] },
    { name: 'Features', anyOf: false, options: [{ id: 's', name: 'Sauna' }, { id: 'h', name: 'Open haard' }] },
  ];
  assert.deepEqual(describeAccommodation(['b', 'l', 's', 'h'], groups), ['Bungalow of Lodge', 'Sauna', 'Open haard']);
  assert.deepEqual(describeAccommodation([], groups), []);
});

test('names the party of a price in short', () => {
  assert.equal(describePartyShort({ adults: 2, children: 0, pets: 0 }), '2 volw.');
  assert.equal(describePartyShort({ adults: 4, children: 2, pets: 1 }), '4 volw. + 2 kind. + 1 huisdier');
});
