import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPages, isPagePath, servePage } from './pages.mjs';

const weekend = (arrival, departure, priceCents, discount, extra = {}) => ({
  arrival,
  departure,
  priceCents,
  discount,
  bookingUrl: `https://www.landal.nl/boeken?aankomst=${arrival}`,
  advice: { verdict: 'neutral', reasons: [] },
  ...extra,
});

const gulpen = {
  code: 'GPN',
  provider: 'landal',
  name: 'Vakantiepark Gulpen',
  city: 'Gulpen',
  region: 'Limburg (NL)',
  country: 'NL',
  lat: 50.81,
  lng: 5.89,
  brand: 'landal',
  baselineCents: 40000,
  facilities: ['overdekt-zwembad', 'heuvels', 'wifi'],
  googleRating: { rating: 4.3, ratingCount: 1200 },
  accommodations: {},
  weekends: [
    weekend('2026-11-06', '2026-11-09', 30000, 0.25, { advice: { verdict: 'book', reasons: [{ code: 'leaving-soon', days: 3 }] } }),
    weekend('2026-11-13', '2026-11-16', 42000, -0.05, { weather: { maxTemp: 14 } }),
    weekend('2026-12-04', '2026-12-07', 52000, -0.3),
  ],
};
// A name straight from a provider, with markup in it.
const hoogduin = {
  code: 'molecaten:6006',
  provider: 'molecaten',
  name: 'Hoogduin <b>',
  city: 'Cadzand',
  country: 'NL',
  lat: 51.37,
  lng: 3.38,
  brand: 'molecaten',
  pricesUrl: 'https://www.molecaten.nl/zoeken',
  baselineCents: null,
  facilities: [],
  googleRating: null,
  accommodations: {},
  weekends: [{ ...weekend('2026-11-06', '2026-11-09', 25000, null), bookingUrl: null }],
};
const soldOut = { code: 'SDT', provider: 'landal', name: 'Vakantiepark Søhøjlandet', city: 'Gjern', country: 'DK', lat: 56.2, lng: 9.7 };
// Nothing known about it but its name: no page.
const bare = { code: 'BAR', provider: 'landal', name: 'Kaal Park', city: 'Ergens', country: 'NL', lat: 52, lng: 5 };
const limburg = (code, name) => ({ code, provider: 'landal', name, city: 'Valkenburg', region: 'Limburg', country: 'NL', lat: 50.86, lng: 5.83 });
const allParks = new Map(
  [gulpen, hoogduin, soldOut, bare, limburg('VKB', 'Valkenburg Heuvelland'), limburg('MHR', 'Mheerbos')].map(({ weekends, ...info }) => [info.code, info]),
);
const valkenier = {
  id: 'Q1',
  name: 'De Valkenier',
  kind: 'Pretpark',
  km: 7.9,
  description: 'pretpark',
  image: { url: 'https://upload.wikimedia.org/valkenier.jpg', page: 'https://commons.wikimedia.org/wiki/File:Valkenier.jpg', author: 'Kleon3', license: 'CC BY-SA 3.0' },
};
const details = {
  facilitiesOf: (code) => ({ VKB: ['heuvels', 'overdekt-zwembad'], MHR: ['bos'] })[code] ?? [],
  accommodations: new Map([
    [
      'GPN',
      {
        timber4: { name: 'Timber Lodge 4', facts: ['55 m²', 'Vrijstaand', 'Geschikt voor 4 personen'], photos: ['https://landal.test/timber.jpg'] },
        villa8: { name: 'Villa 8', facts: ['120 m²', 'Sauna', 'Geschikt voor 8 personen'], photos: [] },
      },
    ],
  ]),
  surroundings: new Map([
    ['GPN', [valkenier]],
    ['SDT', [{ ...valkenier, id: 'Q2', name: 'Himmelbjerget', kind: 'Heuvel', image: null }]],
    ['VKB', [valkenier]],
  ]),
  ratings: new Map(),
  occasionsOf: ({ arrival }) => (arrival === '2026-11-13' ? [{ label: 'Herfstvakantie Zuid', text: 'Het is herfstvakantie in regio Zuid.' }] : []),
};

const pages = buildPages({ parks: [gulpen, hoogduin], allParks, computedAt: '2026-10-29T06:39:10.572Z', details });
const pageAt = (path) => pages.find((page) => page.path === path);

test('one page per park with something to tell, per weekend, per region and theme with three parks, and the lists', () => {
  assert.deepEqual(pages.map((page) => page.path).sort(), [
    '/park/hoogduin-b',
    '/park/mheerbos',
    '/park/vakantiepark-gulpen',
    '/park/vakantiepark-sohojlandet',
    '/park/valkenburg-heuvelland',
    '/parken',
    '/regio/limburg',
    '/weekend/2026-11-06',
    '/weekend/2026-11-13',
    '/weekend/2026-12-04',
    '/weekenden',
  ]);
  assert.match(pageAt('/park/vakantiepark-sohojlandet').body, /geen vrij weekend/);
  assert.match(pageAt('/park/vakantiepark-sohojlandet').body, /Himmelbjerget/);
});

test("a park page tells where it lies, what to sleep in and when it is cheapest, each once", () => {
  const body = pageAt('/park/vakantiepark-gulpen').body;
  assert.match(body, /Vakantiepark Gulpen ligt in het heuvelland bij Gulpen \(Limburg\)\./);
  assert.match(body, /Je kiest uit 2 soorten huisjes voor 4 tot 8 personen\. Eén daarvan heeft een eigen sauna\./);
  assert.match(body, /Normaal kost een weekend hier voor 2 personen rond €\s400\./);
  assert.match(body, /In november ben je het voordeligst uit: gemiddeld €\s360, tegen €\s520 in december\./);
  assert.match(body, /Van de komende 3 weekenden zijn er nog 3 vrij\./);
  assert.match(body, /<h3 class="font-semibold">Zwemmen<\/h3>/);
  assert.match(body, /Goed om te weten: gratis wifi\./);
  assert.match(body, /alt="Timber Lodge 4 bij Landal Vakantiepark Gulpen"/);
  assert.match(body, /Pretpark · 7,9 km/);
  assert.match(body, /Foto: <a href="https:\/\/commons.wikimedia.org\/wiki\/File:Valkenier.jpg"[^>]*>Kleon3, CC BY-SA 3.0<\/a>/);
  assert.match(body, /href="\/regio\/limburg"/);
  // Where it lies is said in its text, not again as something to do.
  assert.doesNotMatch(body, /In het heuvelland/);
  assert.equal(body.match(/>De Valkenier</g).length, 1);
});

test('a weekend shows good weather and what makes it special, on the park and on its own page', () => {
  const park = pageAt('/park/vakantiepark-gulpen').body;
  assert.match(park, /Zonnig verwacht, tot 14 °C/);
  assert.match(park, />Herfstvakantie Zuid</);
  assert.match(park, /Weersverwachting van MET Norway/);
  const page = pageAt('/weekend/2026-11-13').body;
  assert.match(page, /Het is herfstvakantie in regio Zuid\./);
  assert.match(page, /Bij 1 park wordt het een zonnig en droog weekend\./);
  assert.doesNotMatch(pageAt('/weekend/2026-11-06').body, /Zonnig verwacht/);
});

test('a region page lists its parks with photos and booking, and the outings most of them have nearby', () => {
  const page = pageAt('/regio/limburg');
  assert.equal(page.title, 'Vakantieparken in Limburg: weekendje weg en buitenkansjes');
  assert.match(page.body, /In Limburg liggen 3 vakantieparken van Landal\. Daarvan liggen er 2 in het heuvelland en 1 in een bosrijke omgeving\. Bij 2 parken is er een overdekt zwembad\./);
  assert.match(page.body, /from=regiopagina/);
  assert.match(page.body, /Uitjes in Limburg/);
  assert.ok(page.body.indexOf('Vakantiepark Gulpen') < page.body.indexOf('Mheerbos'), 'parks with a free weekend first');
});

test('a park page shows its cheapest weekend and books through the tracked link', () => {
  const page = pageAt('/park/vakantiepark-gulpen');
  assert.equal(page.title, 'Landal Vakantiepark Gulpen: weekendprijzen en aanbiedingen');
  assert.match(page.description, /Vanaf €\s300 voor 2 personen/);
  assert.match(page.body, /href="\/api\/go\?url=[^"]+from=parkpagina/);
  assert.match(page.body, /rel="sponsored noopener"/);
  assert.match(page.body, /Nu boeken: Vertrek over 3 dagen/);
  assert.match(page.body, /25% onder normaal/);
  assert.match(page.body, /Overdekt zwembad/);
  assert.match(page.body, /href="\/park\/hoogduin-b"/);
});

test('a weekend page lists the parks cheapest first, with the biggest deals on top', () => {
  const page = pageAt('/weekend/2026-11-06');
  assert.equal(page.title, 'Weekendje weg 6–9 november 2026: vakantieparken met plek');
  assert.match(page.body, /Grootste buitenkansjes/);
  assert.match(page.body, /from=weekendpagina/);
  const all = page.body.slice(page.body.indexOf('Alle parken met plek'));
  assert.ok(all.indexOf('Hoogduin') < all.indexOf('Gulpen'));
  assert.match(page.body, /href="\/weekend\/2026-11-13"/);
});

test("providers' names are escaped", () => {
  const body = pageAt('/weekend/2026-11-06').body;
  assert.match(body, /Hoogduin &#60;b&#62;/);
  assert.doesNotMatch(body, /<b>/);
});

test('only page paths go to the pages', () => {
  for (const path of ['/parken', '/weekenden', '/park/vakantiepark-gulpen', '/weekend/2026-11-06', '/regio/limburg', '/thema/aan-zee', '/privacy', '/sitemap.xml', '/robots.txt']) {
    assert.ok(isPagePath(path), path);
  }
  for (const path of ['/', '/beheer', '/park/', '/park/Gulpen', '/weekend/6-november', '/api/go', '/parken/x']) {
    assert.ok(!isPagePath(path), path);
  }
});

test('serves a stored page in the site frame, a 404 page, the sitemap and robots.txt', async () => {
  const stored = pageAt('/parken');
  const db = {
    page: async (path) => (path === '/parken' ? stored : null),
    pagePaths: async () => [{ path: '/parken', computedAt: '2026-10-29T06:39:10.572Z' }],
  };
  const serve = (path) => servePage(db, new Request(`https://weekendjeweg.test${path}`), { stylesheet: '/assets/index-abc.css' });

  const page = await serve('/parken');
  assert.equal(page.status, 200);
  const text = await page.text();
  assert.match(text, /<link rel="stylesheet" href="\/assets\/index-abc.css" \/>/);
  assert.match(text, /<link rel="canonical" href="https:\/\/weekendjeweg.test\/parken" \/>/);
  assert.match(text, /affiliate-links/);
  assert.doesNotMatch(text, /<script type="module"/);

  assert.equal((await serve('/park/weg')).status, 404);
  const privacy = await (await serve('/privacy')).text();
  assert.match(privacy, /niet je IP-adres/);
  assert.match(privacy, /mailto:contact@weekendjeweg.test/);
  assert.match(await (await serve('/sitemap.xml')).text(), /<loc>https:\/\/weekendjeweg.test\/parken<\/loc><lastmod>2026-10-29<\/lastmod>/);
  assert.match(await (await serve('/robots.txt')).text(), /Disallow: \/api\//);
});
