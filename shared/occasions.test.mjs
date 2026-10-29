import assert from 'node:assert/strict';
import { test } from 'node:test';
import { easter, weekendOccasions } from './occasions.mjs';

const labels = (weekend, holidays) => weekendOccasions(weekend, holidays).map((occasion) => occasion.label);

test('finds Easter', () => {
  assert.equal(easter(2026), '2026-04-05');
  assert.equal(easter(2027), '2027-03-28');
});

test('a public holiday on the Monday saves a day off', () => {
  const [pentecost] = weekendOccasions({ arrival: '2027-05-14', departure: '2027-05-17' });
  assert.equal(pentecost.label, 'Pinksteren');
  assert.equal(pentecost.text, 'Eerste pinksterdag valt in dit weekend. Tweede pinksterdag valt op maandag: daarvoor hoef je geen vrij te nemen.');
});

test("names Valentine's Day, Mother's Day, carnival and New Year's Eve, and nothing on an ordinary weekend", () => {
  assert.deepEqual(labels({ arrival: '2027-02-12', departure: '2027-02-15' }), ['Valentijnsweekend']);
  // In 2027 Mother's Day falls in the weekend after Ascension Day.
  assert.deepEqual(labels({ arrival: '2027-05-07', departure: '2027-05-10' }), ['Moederdag', 'Na Hemelvaart']);
  assert.deepEqual(labels({ arrival: '2027-02-05', departure: '2027-02-08' }), ['Carnaval']);
  assert.deepEqual(labels({ arrival: '2027-12-31', departure: '2028-01-03' }), ['Oud en nieuw', 'Nieuwjaarsdag']);
  assert.deepEqual(labels({ arrival: '2026-11-06', departure: '2026-11-09' }), []);
});

test('school holidays per region, or all of the Netherlands', () => {
  const holidays = [
    { name: 'Herfstvakantie', region: 'midden', start: '2026-10-17', end: '2026-10-25' },
    { name: 'Herfstvakantie', region: 'zuid', start: '2026-10-17', end: '2026-10-25' },
    { name: 'Herfstvakantie', region: 'noord', start: '2026-10-10', end: '2026-10-18' },
    { name: 'Kerstvakantie', region: 'heel Nederland', start: '2026-12-19', end: '2027-01-03' },
  ];
  assert.deepEqual(weekendOccasions({ arrival: '2026-10-23', departure: '2026-10-26' }, holidays), [
    { label: 'Herfstvakantie Midden/Zuid', text: 'Het is herfstvakantie in regio Midden en Zuid.' },
  ]);
  assert.deepEqual(labels({ arrival: '2026-12-25', departure: '2026-12-28' }, holidays), ['Kerst', 'Kerstvakantie']);
});
