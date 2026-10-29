import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCommonsImages, pickPlaces } from './surroundings.mjs';

const row = (id, kind, label, km, links, image = null) => ({
  item: { value: `http://www.wikidata.org/entity/${id}` },
  kind: { value: `http://www.wikidata.org/entity/${kind}` },
  label: { value: label },
  dist: { value: String(km) },
  links: { value: String(links) },
  ...(image && { image: { value: `http://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image)}` } }),
});

test('picks well-known places close by, each once, with a cap per sort', () => {
  const places = pickPlaces([
    row('Q1', 'Q33506', 'Museum A', 2, 10),
    row('Q1', 'Q570116', 'Museum A', 2, 10),
    row('Q2', 'Q33506', 'Museum B', 3, 9),
    row('Q3', 'Q207694', 'Museum C', 1, 8),
    row('Q4', 'Q43501', 'GaiaZOO', 12, 12, 'Gaia zoo.jpg'),
    row('Q5', 'Q38720', 'Molen', 1, 2),
    row('Q6', 'Q38720', 'Andere molen', 1, 2),
  ]);
  assert.deepEqual(
    places.map((place) => place.name),
    ['Museum A', 'Museum C', 'GaiaZOO', 'Molen'],
  );
  assert.equal(places.find((place) => place.name === 'GaiaZOO').imageFile, 'Gaia zoo.jpg');
  assert.equal(places[1].kind, 'Kunstmuseum');
});

test("credits each photo's maker and license, and skips photos without a license", () => {
  const images = parseCommonsImages({
    query: {
      pages: {
        1: {
          title: 'File:Gaia zoo.jpg',
          imageinfo: [{ thumburl: 'https://upload.wikimedia.org/thumb.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Gaia_zoo.jpg', extmetadata: { Artist: { value: '<a href="//x">Romaine</a>' }, LicenseShortName: { value: 'CC0' } } }],
        },
        2: { title: 'File:Unknown.jpg', imageinfo: [{ thumburl: 'https://upload.wikimedia.org/u.jpg', extmetadata: {} }] },
      },
    },
  });
  assert.deepEqual([...images.keys()], ['Gaia zoo.jpg']);
  assert.deepEqual(images.get('Gaia zoo.jpg'), {
    url: 'https://upload.wikimedia.org/thumb.jpg',
    page: 'https://commons.wikimedia.org/wiki/File:Gaia_zoo.jpg',
    author: 'Romaine',
    license: 'CC0',
  });
});
