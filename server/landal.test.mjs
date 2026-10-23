import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stayParams, toAccommodation, toAccommodationPrice } from './landal.mjs';

const weekend = { arrival: '2026-11-06', departure: '2026-11-09' };

test('asks Landal for the whole travel party, pets included', () => {
  const params = new URLSearchParams(stayParams({ ...weekend, adults: 2, children: 1, pets: 1 }));
  assert.equal(params.get('arrivalDate'), '06-11-2026');
  assert.equal(params.get('travelGroup[0][Amount]'), '2');
  assert.equal(params.get('travelGroup[1][Amount]'), '1');
  assert.equal(params.get('travelGroup[2][Id]'), 'pets');
  assert.equal(params.get('travelGroup[2][Amount]'), '1');
});

test('sends every accommodation feature as its own facet', () => {
  const params = new URLSearchParams(
    stayParams({ ...weekend, adults: 2, children: 0, accommodationFeatures: ['9266.16393', '9266.16402'] }),
  );
  assert.deepEqual(params.getAll('facets[]'), ['9266.16393', '9266.16402']);
});

test('reads an accommodation with its facts and at most eight photos', () => {
  const image = (id) => ({
    imageUrl: `https://cdn/${id}?t=w350`,
    imageUrlLarge: `https://cdn/${id}?t=cw480`,
    retinaImageUrl: `https://cdn/${id}?t=cw800`,
  });
  const accommodation = toAccommodation({
    ParkCode: 'HRK',
    AccommodationCode: '281CHLA',
    AccommodationInfo: {
      Code: '281CHLA',
      Name: 'Lariks 6',
      ParkCode: 'HRK',
      DetailPageLink: { Url: 'https://www.landal.nl/parken/hunzepark/accommodaties/lariks-6' },
      Usps: ['42 m²', 'Vrijstaand', 'Drie slaapkamers'],
      ThumbnailImageUrls: Array.from({ length: 10 }, (_, index) => image(index)),
    },
  });

  assert.equal(accommodation.code, '281CHLA');
  assert.equal(accommodation.parkCode, 'HRK');
  assert.equal(accommodation.name, 'Lariks 6');
  assert.deepEqual(accommodation.facts, ['42 m²', 'Vrijstaand', 'Drie slaapkamers']);
  assert.equal(accommodation.photos.length, 8);
  assert.equal(accommodation.photos[0], 'https://cdn/0?t=cw800');
});

test('reads the total price of one accommodation', () => {
  const price = toAccommodationPrice({
    AccommodationCode: '6B',
    AccommodationInfo: { Code: '6B' },
    PriceInfo: { accommodationCode: '6B', bestRentalPriceInCents: 35900, bestTotalPriceInCents: 44310 },
  });

  assert.deepEqual(price, { code: '6B', priceCents: 44310 });
});
