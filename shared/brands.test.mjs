import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parkBrand } from './brands.mjs';

test('takes the brand from the name the park has on Google', () => {
  assert.equal(parkBrand({ provider: 'landal', placeName: 'Roompot De Katjeskelder', brandCode: 'LGP' }), 'roompot');
  assert.equal(parkBrand({ provider: 'landal', placeName: 'Summio Parc Heihaas' }), 'summio');
  assert.equal(parkBrand({ provider: 'landal', placeName: 'Dormio Strand Resort Nieuwvliet-Bad' }), 'dormio');
  assert.equal(parkBrand({ provider: 'landal', placeName: 'Rockingham Forest Park - Landal' }), 'landal');
  assert.equal(parkBrand({ provider: 'topparken', placeName: 'TopParken Resort Veluwe' }), 'topparken');
});

test('falls back to Landal\'s brand code, then to the provider', () => {
  assert.equal(parkBrand({ provider: 'landal', placeName: 'Waterpark Zwartkruis', brandCode: 'RGP' }), 'roompot');
  assert.equal(parkBrand({ provider: 'landal', placeName: 'Bosch en Zee', brandCode: 'LGP' }), 'landal');
  assert.equal(parkBrand({ provider: 'landal', placeName: null, brandCode: 'HSN' }), 'hofvansaksen');
  assert.equal(parkBrand({ provider: 'molecaten', placeName: null }), 'molecaten');
  assert.equal(parkBrand({ provider: undefined }), 'landal');
});
