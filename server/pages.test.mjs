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
  country: 'NL',
  lat: 50.81,
  lng: 5.89,
  brand: 'landal',
  baselineCents: 40000,
  facilities: ['overdekt-zwembad'],
  googleRating: { rating: 4.3, ratingCount: 1200 },
  accommodations: {},
  weekends: [
    weekend('2026-11-06', '2026-11-09', 30000, 0.25, { advice: { verdict: 'book', reasons: [{ code: 'leaving-soon', days: 3 }] } }),
    weekend('2026-11-13', '2026-11-16', 42000, -0.05),
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
const allParks = new Map([gulpen, hoogduin, soldOut].map(({ weekends, ...info }) => [info.code, info]));

const pages = buildPages({ parks: [gulpen, hoogduin], allParks, computedAt: '2026-10-29T06:39:10.572Z' });
const pageAt = (path) => pages.find((page) => page.path === path);

test('one page per park, also without a free weekend, one per weekend, and both lists', () => {
  assert.deepEqual(pages.map((page) => page.path).sort(), [
    '/park/hoogduin-b',
    '/park/vakantiepark-gulpen',
    '/park/vakantiepark-sohojlandet',
    '/parken',
    '/weekend/2026-11-06',
    '/weekend/2026-11-13',
    '/weekenden',
  ]);
  assert.match(pageAt('/park/vakantiepark-sohojlandet').body, /geen vrij weekend/);
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
  for (const path of ['/parken', '/weekenden', '/park/vakantiepark-gulpen', '/weekend/2026-11-06', '/privacy', '/sitemap.xml', '/robots.txt']) {
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
