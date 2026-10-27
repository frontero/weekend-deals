import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distanceMetres, fetchPlaceReviews, pickPlace, ratingQueries, searchBody } from './google.mjs';

const park = { code: 'NBD', name: 'Strand Resort Nieuwvliet-Bad', city: 'Nieuwvliet', lat: 51.3851, lng: 3.4497 };

const place = (name, latitude, longitude, extra = {}) => ({
  id: `id-${name}`,
  displayName: { text: name },
  location: { latitude, longitude },
  rating: 4.3,
  userRatingCount: 1234,
  googleMapsUri: `https://maps.google.com/?cid=${name}`,
  ...extra,
});
const noReviews = { rating: undefined, userRatingCount: undefined };

test('measures distances in metres', () => {
  const metres = distanceMetres({ lat: 52.0, lng: 5.0 }, { lat: 52.01, lng: 5.0 });
  assert.ok(metres > 1100 && metres < 1120, String(metres));
});

test('takes the most relevant place that lies at the park', () => {
  const picked = pickPlace(
    [place('Somewhere else', 52.0, 5.0), place('Landal Strand Resort Nieuwvliet-Bad', 51.386, 3.451)],
    park,
  );
  assert.deepEqual(picked, {
    placeId: 'id-Landal Strand Resort Nieuwvliet-Bad',
    placeName: 'Landal Strand Resort Nieuwvliet-Bad',
    rating: 4.3,
    ratingCount: 1234,
    mapsUrl: 'https://maps.google.com/?cid=Landal Strand Resort Nieuwvliet-Bad',
  });
});

test('finds nothing when every place is too far away', () => {
  assert.equal(pickPlace([place('Other park', 51.5, 3.6)], park), null);
});

test('skips towns, streets and single cabins, which have no reviews', () => {
  const picked = pickPlace(
    [place('Nieuwvliet', 51.385, 3.45, noReviews), place('Roompot Strand Resort', 51.3852, 3.4498)],
    park,
  );
  assert.equal(picked.placeName, 'Roompot Strand Resort');
  assert.equal(pickPlace([place('Nieuwvliet', 51.385, 3.45, noReviews)], park), null);
});

test('trusts an identical name further away, because Landal pins can be off', () => {
  const pinnedFar = { ...park, name: 'Hafendorf Rheinsberg', lat: 53.0, lng: 12.6 };
  const sameName = place('Hafendorf Rheinsberg', 53.1, 12.9);
  const otherName = place('Sunday Resort Hafendorf Rheinsberg Hotel', 53.1, 12.9);
  assert.equal(pickPlace([otherName, sameName], pinnedFar).placeName, 'Hafendorf Rheinsberg');
  assert.equal(pickPlace([otherName], pinnedFar), null);
});

test('searches with the brand first, so a park named after its town is not the town', () => {
  assert.deepEqual(ratingQueries({ name: 'Zandvoort', city: 'Zandvoort' }), ['Landal Zandvoort, Zandvoort', 'Zandvoort, Zandvoort']);
  assert.deepEqual(ratingQueries({ name: 'Landal Kasteeldomein', city: 'Kasterlee' }), ['Landal Kasteeldomein, Kasterlee']);
});

test('uses the brand of the park\'s own provider', () => {
  assert.deepEqual(ratingQueries({ name: 'Park Zandvoort', city: 'Zandvoort' }, 'EuroParcs'), [
    'EuroParcs Park Zandvoort, Zandvoort',
    'Park Zandvoort, Zandvoort',
  ]);
  assert.deepEqual(ratingQueries({ name: 'EuroParcs Bad Hulckesteijn', city: 'Nijkerk' }, 'EuroParcs'), [
    'EuroParcs Bad Hulckesteijn, Nijkerk',
  ]);
});

test('biases the search to the park location', () => {
  assert.deepEqual(searchBody('Landal Zandvoort, Zandvoort', park), {
    textQuery: 'Landal Zandvoort, Zandvoort',
    locationBias: { circle: { center: { latitude: 51.3851, longitude: 3.4497 }, radius: 2000 } },
  });
});

test("reads a place's reviews with what Google requires to show next to them", async () => {
  let asked;
  const fetchImpl = async (url, options) => {
    asked = { url, options };
    return Response.json({
      googleMapsUri: 'https://maps.google.com/?cid=1',
      reviews: [
        {
          rating: 4,
          relativePublishTimeDescription: '2 weken geleden',
          text: { text: 'Mooi park', languageCode: 'nl' },
          originalText: { text: 'Schöner Park', languageCode: 'de' },
          authorAttribution: { displayName: 'Anna', uri: 'https://maps.google.com/contrib/1', photoUri: 'https://lh3/a.jpg' },
          googleMapsUri: 'https://maps.google.com/review/1',
          visitDate: { year: 2026, month: 8 },
        },
      ],
    });
  };
  const result = await fetchPlaceReviews('ChIJabc', 'key', fetchImpl);
  assert.equal(asked.url, 'https://places.googleapis.com/v1/places/ChIJabc?languageCode=nl');
  assert.equal(asked.options.headers['X-Goog-FieldMask'], 'reviews,googleMapsUri');
  assert.deepEqual(result, {
    mapsUrl: 'https://maps.google.com/?cid=1',
    reviews: [
      {
        author: 'Anna',
        authorUrl: 'https://maps.google.com/contrib/1',
        photoUrl: 'https://lh3/a.jpg',
        rating: 4,
        when: '2 weken geleden',
        visited: { year: 2026, month: 8 },
        text: 'Mooi park',
        translatedFrom: 'de',
        url: 'https://maps.google.com/review/1',
      },
    ],
  });
});
