import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accommodationGroups, FACILITY_GROUPS, facilityGroups, parkFacilities, toFacilityId } from './facilities.mjs';

test('near-duplicate Landal facilities become one filter; distinct ones stay apart', () => {
  assert.deepEqual(parkFacilities({ landal: ['9280.16405'] }), ['winkel']);
  assert.deepEqual(parkFacilities({ landal: ['9280.16404', '9280.16405'] }), ['winkel']);
  assert.deepEqual(parkFacilities({ landal: ['9284.2031478'] }), ['kinderclub']);
  assert.deepEqual(parkFacilities({ landal: ['9299.16301', '9299.16303'] }), ['overdekt-zwembad', 'zwemparadijs']);
});

test('a fireworks-free park also counts as one with few fireworks', () => {
  assert.deepEqual(parkFacilities({ landal: ['9271.2370673'] }), ['vuurwerkvrij', 'vuurwerkluw']);
  assert.deepEqual(parkFacilities({ landal: ['9271.2162635'] }), ['vuurwerkluw']);
});

test("reads Topparken's and Molecaten's own names into the same filters", () => {
  const topparken = ['Buitenzwembad', 'Kinderbad (buiten)', 'Speeltuin (buiten)', 'Kidsclub', 'Animatieprogramma (schoolvakanties)', 'Hondenspeeltuin', 'Gameroom', 'Café / Bar'];
  assert.deepEqual(parkFacilities({ names: topparken }), [
    'openluchtzwembad',
    'peuterbad',
    'speeltuin',
    'animatie',
    'kinderclub',
    'amusementshal',
    'cafe',
  ]);
  const molecaten = ['Buitenzwembad met kinderbad en zonneterras', 'Tafeltennis', 'Tennisbaan (kunstgras)', 'Indoor speeltuin', 'Midgetgolfbaan', 'WiFi'];
  assert.deepEqual(parkFacilities({ names: molecaten }), [
    'openluchtzwembad',
    'peuterbad',
    'indoor-speelparadijs',
    'minigolf',
    'tennis',
    'wifi',
  ]);
});

test("matches Molecaten's other spellings and rentals", () => {
  assert.deepEqual(parkFacilities({ names: ['Jeu-de-boules', 'Voetbal', 'Stadsfiets', 'Waterfietsen', 'Hondenspeeltuin', 'Tafeltennis'] }), [
    'fietsverhuur',
    'watersport',
    'jeu-de-boules',
    'sportveld',
  ]);
});

test('every Landal id belongs to a known filter, and old ids in links and alerts still work', () => {
  assert.equal(toFacilityId('9280.16405'), 'winkel');
  assert.equal(toFacilityId('winkel'), 'winkel');
  assert.equal(toFacilityId('9271.2162636'), null);
  const ids = FACILITY_GROUPS.flatMap((group) => group.options.map((option) => option.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(Object.keys(facilityGroups()[0].options[0]), ['id', 'name']);
});

test('accommodation requirements say they are about the accommodation itself', () => {
  const [group] = accommodationGroups([{ name: 'Kenmerken', options: [{ id: '9266.16393', name: 'Sauna' }, { id: '9266.16404', name: 'Ligbad' }] }]);
  assert.deepEqual(group.options.map((option) => option.name), ['Sauna in het huisje', 'Ligbad']);
});
