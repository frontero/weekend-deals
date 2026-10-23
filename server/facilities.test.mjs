import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFilterGroups } from './facilities.mjs';

// Same nesting as the live page: one untitled section that holds "Park", "Accommodatie", ….
const options = {
  'facet-categories': [
    {
      title: null,
      categories: [
        { id: '9278', title: 'Indeling', categories: [], options: null },
        {
          id: null,
          title: 'Park',
          categories: [
            {
              title: 'Zwempret',
              categories: [],
              options: [
                { id: '9299.16301', name: 'Overdekt zwembad', tooltipText: '' },
                { id: '9299.16305', name: 'Peuterbad ', tooltipText: '' },
              ],
            },
            { title: 'Kids', categories: [], options: [{ id: '9284.16380', name: 'Indoorspeelplaats' }] },
          ],
        },
        {
          id: null,
          title: 'Accommodatie',
          categories: [
            { title: 'Accommodatie grootte', categories: [], options: [{ id: '9269.18659', name: '1 - 4 personen' }] },
            {
              title: 'Accommodatie type',
              categories: [],
              options: [
                { id: '9290.16337', name: 'Bungalow' },
                { id: '9290.2031353', name: 'Lodge' },
              ],
            },
            { title: 'Kenmerken', categories: [], options: [{ id: '9266.16393', name: 'Sauna' }] },
            {
              title: 'Speciale accommodaties',
              categories: [],
              options: [
                { id: '9289.16533', name: 'Huisdieren toegestaan' },
                { id: '9289.16360', name: 'Huisdiervrije accommodatie' },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const page = `
  <script type="json/options">{"translations": {}}</script>
  <script type="json/options">
    ${JSON.stringify(options)}
  </script>`;

test('reads the park facility groups from the filter options on a Landal page', () => {
  assert.deepEqual(parseFilterGroups(page).park, [
    {
      name: 'Zwempret',
      anyOf: false,
      options: [
        { id: '9299.16301', name: 'Overdekt zwembad' },
        { id: '9299.16305', name: 'Peuterbad' },
      ],
    },
    { name: 'Kids', anyOf: false, options: [{ id: '9284.16380', name: 'Indoorspeelplaats' }] },
  ]);
});

test('reads the accommodation features, minus party size and pets that the travel party covers', () => {
  assert.deepEqual(parseFilterGroups(page).accommodation, [
    {
      name: 'Accommodatie type',
      anyOf: true,
      options: [
        { id: '9290.16337', name: 'Bungalow' },
        { id: '9290.2031353', name: 'Lodge' },
      ],
    },
    { name: 'Kenmerken', anyOf: false, options: [{ id: '9266.16393', name: 'Sauna' }] },
    { name: 'Speciale accommodaties', anyOf: false, options: [{ id: '9289.16360', name: 'Huisdiervrije accommodatie' }] },
  ]);
});

test('fails loudly when Landal changes the page', () => {
  assert.throws(() => parseFilterGroups('<html></html>'), /filters/);
});
