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
const soldOut = { code: 'SDT', provider: 'landal', name: 'Vakantiepark Søhøjlandet', city: 'Gjern', country: 'DK', lat: 56.2, lng: 9.7, url: 'https://www.landal.nl/parken/sohojlandet' };
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

test('one page per park with something to tell, per weekend, per country, region and theme with three parks, and the lists', () => {
  assert.deepEqual(pages.map((page) => page.path).sort(), [
    '/land/nederland',
    '/last-minute',
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
  assert.match(body, />Zwemmen<\/h3>/);
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
  assert.equal(page.title, 'Vakantiepark Limburg: alle parken met weekendprijzen');
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
  assert.match(page.body, /25% voordeliger/);
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

test('the last-minute page shows the coming weekends, the biggest deals first', () => {
  const page = pageAt('/last-minute');
  assert.equal(page.title, 'Last minute vakantiepark: weekendje weg dit of volgend weekend');
  assert.match(page.body, /Eerstvolgende weekend: vr 6 nov – ma 9 nov/);
  assert.match(page.body, /Het weekend daarna: vr 13 nov – ma 16 nov/);
  assert.doesNotMatch(page.body, /4 dec/);
  const first = page.body.slice(page.body.indexOf('Eerstvolgende'), page.body.indexOf('Het weekend daarna'));
  assert.ok(first.indexOf('Gulpen') < first.indexOf('Hoogduin'), 'the 25% deal before the cheaper park without one');
  assert.match(page.body, /from=lastminute/);
});

test('areas people search for get a page: Texel by its villages, the Veluwe by where it lies', () => {
  const at = (code, name, city, region, lat, lng) => ({ code, provider: 'landal', name, city, region, country: 'NL', lat, lng });
  const island = [
    at('T1', 'Beach Park Texel', 'De Koog', 'Noordzee/Wadden (NL)', 53.1, 4.76),
    at('T2', 'Sluftervallei', 'De Cocksdorp', 'Noordzee/Wadden (NL)', 53.15, 4.85),
    at('T3', 'Kustpark Texel', 'De Koog', 'Noordzee/Wadden (NL)', 53.09, 4.76),
    at('A1', 'Ameland', 'Hollum', 'Noordzee/Wadden (NL)', 53.44, 5.63),
  ];
  const veluwe = [
    at('V1', 'Miggelenberg', 'Hoenderloo', 'Gelderland (NL)', 52.12, 5.87),
    at('V2', 'Rabbit Hill', 'Nieuw Milligen', 'Gelderland (NL)', 52.22, 5.78),
    at('V3', 'Coldenhove', 'Eerbeek', 'Gelderland', 52.1, 6.06),
    at('G1', 'Stroombroek', 'Braamt', 'Gelderland (NL)', 51.93, 6.25),
  ];
  const all = [...island, ...veluwe];
  const built = buildPages({
    parks: [],
    allParks: new Map(all.map((park) => [park.code, park])),
    computedAt: '2026-10-29T06:39:10.572Z',
    details: { facilitiesOf: () => ['bos'] },
  });
  const paths = built.map((page) => page.path);
  assert.ok(paths.includes('/regio/texel') && paths.includes('/regio/veluwe') && paths.includes('/regio/waddeneilanden'));
  assert.ok(!paths.includes('/regio/ameland'), 'one park is no page');
  const texel = built.find((page) => page.path === '/regio/texel');
  assert.match(texel.body, /Op Texel liggen 3 vakantieparken/);
  assert.equal(texel.title, 'Vakantiepark Texel: alle parken met weekendprijzen');
  const veluwePage = built.find((page) => page.path === '/regio/veluwe').body;
  assert.match(veluwePage, /Miggelenberg/);
  assert.doesNotMatch(veluwePage, /Stroombroek/, 'Braamt lies in the Achterhoek, not on the Veluwe');
  // The park's own page leads to the most specific region first.
  assert.match(built.find((page) => page.path === '/park/sluftervallei').body, /Kruimelpad[^]*?\/regio\/texel/);
});

test("the family theme shows four people's prices and books for four", () => {
  const family = (code, name, facilities) => ({ code, provider: 'landal', name, city: 'Ergens', country: 'NL', lat: 52, lng: 5, facilities });
  const kids = [
    family('K1', 'Speelpark Een', ['speeltuin', 'kinderboerderij']),
    family('K2', 'Speelpark Twee', ['zwemparadijs', 'kinderclub']),
    family('K3', 'Speelpark Drie', ['speeltuin', 'peuterbad']),
    family('K4', 'Rustpark', ['speeltuin']),
  ];
  const forFour = kids.map((park) => ({ ...park, brand: 'landal', weekends: [weekend('2026-11-06', '2026-11-09', 52000, 0.1)] }));
  const built = buildPages({
    parks: [],
    allParks: new Map(kids.map((park) => [park.code, park])),
    computedAt: '2026-10-29T06:39:10.572Z',
    details: { facilitiesOf: (code) => kids.find((park) => park.code === code).facilities, parksOf: (key) => (key === 'a4-c0' ? forFour : null) },
  });
  const page = built.find((entry) => entry.path === '/thema/vakantiepark-met-kinderen');
  assert.equal(page.title, 'Vakantiepark met kinderen: weekendje weg met de laagste prijzen');
  assert.match(page.body, /€\s520/);
  assert.match(page.body, /vr 6 nov – ma 9 nov · 4 personen/);
  assert.match(page.body, /party=a4-c0/);
  assert.doesNotMatch(page.body, /Rustpark/, 'one children\'s facility is not enough');
});

test('the hot tub page shows the hot tub series: its accommodation, price and booking link, and nothing without it', () => {
  const spa = (code, name) => ({ code, provider: 'landal', name, city: 'Ergens', country: 'NL', lat: 52, lng: 5 });
  const parks = [spa('H1', 'Wellnesspark Een'), spa('H2', 'Wellnesspark Twee'), spa('H3', 'Wellnesspark Drie'), spa('H4', 'Gewoon Park')];
  const withTub = parks.slice(0, 3).map((park) => ({
    ...park,
    brand: 'landal',
    accommodations: { tub4: { name: 'Wellness Lodge 4', facts: [], photos: ['https://landal.test/tub.jpg'] } },
    weekends: [weekend('2026-11-06', '2026-11-09', 61000, null, { accommodationCode: 'tub4' })],
  }));
  const build = (parksOf) =>
    buildPages({
      parks: [],
      allParks: new Map(parks.map((park) => [park.code, park])),
      computedAt: '2026-10-29T06:39:10.572Z',
      details: { facilitiesOf: () => ['bos'], parksOf },
    });
  const page = build((key) => (key === 'a2-c0-f9266.16402' ? withTub : null)).find((entry) => entry.path === '/thema/huisje-met-hottub');
  assert.equal(page.title, 'Huisje met hottub of jacuzzi: weekendje weg met de laagste prijzen');
  assert.match(page.body, /Wellness Lodge 4/);
  assert.match(page.body, /src="https:\/\/landal.test\/tub.jpg"/);
  assert.match(page.body, /party=a2-c0-f9266.16402/);
  assert.doesNotMatch(page.body, /Gewoon Park/);
  assert.ok(!build(() => null).some((entry) => entry.path === '/thema/huisje-met-hottub'), 'no series, no page');
});

test('the dog page shows the pet series for two people and a pet, and books for them', () => {
  const park = (code, name) => ({ code, provider: 'landal', name, city: 'Ergens', country: 'NL', lat: 52, lng: 5 });
  const parks = [park('D1', 'Hondenpark Een'), park('D2', 'Hondenpark Twee'), park('D3', 'Hondenpark Drie')];
  const withPet = parks.map((entry) => ({ ...entry, brand: 'landal', accommodations: {}, weekends: [weekend('2026-11-06', '2026-11-09', 33000, null)] }));
  const built = buildPages({
    parks: [],
    allParks: new Map(parks.map((entry) => [entry.code, entry])),
    computedAt: '2026-10-29T06:39:10.572Z',
    details: { facilitiesOf: () => ['bos'], parksOf: (key) => (key === 'a2-c0-p1' ? withPet : null) },
  });
  const page = built.find((entry) => entry.path === '/thema/vakantiepark-met-hond');
  assert.match(page.body, /vr 6 nov – ma 9 nov · 2 personen en 1 huisdier/);
  assert.match(page.body, /party=a2-c0-p1/);
});

test('list pages put the biggest deal first, and show that weekend on the card', () => {
  const at = (code, name, weekends) => ({ code, provider: 'landal', name, city: 'Ergens', region: 'Drenthe (NL)', country: 'NL', lat: 52.8, lng: 6.5, brand: 'landal', baselineCents: 40000, facilities: ['bos'], accommodations: {}, weekends });
  const cheap = at('C1', 'Goedkoop Park', [weekend('2026-11-06', '2026-11-09', 20000, 0.04)]);
  const deal = at('C2', 'Kansjespark', [weekend('2026-11-06', '2026-11-09', 26000, 0.05), weekend('2026-11-13', '2026-11-16', 28000, 0.3)]);
  const full = at('C3', 'Vol Park', []);
  const built = buildPages({
    parks: [cheap, deal],
    allParks: new Map([cheap, deal, full].map(({ weekends, ...info }) => [info.code, info])),
    computedAt: '2026-10-29T06:39:10.572Z',
    details: { facilitiesOf: () => ['bos'] },
  });
  const body = built.find((page) => page.path === '/regio/drenthe').body;
  assert.match(body, /Grootste korting eerst/);
  assert.ok(body.indexOf('Kansjespark') < body.indexOf('Goedkoop Park') && body.indexOf('Goedkoop Park') < body.indexOf('Vol Park'));
  const dealCard = body.slice(body.indexOf('Kansjespark'), body.indexOf('Goedkoop Park'));
  // The sticker sits on the photo, above the name.
  assert.ok(body.indexOf('30% voordeliger') < body.indexOf('Kansjespark'));
  assert.match(dealCard, /€\s280/);
  assert.match(dealCard, /vr 13 nov – ma 16 nov/);
});

test('a park page always has a booking link in view: the bar with the cheapest weekend, or the park at its provider', () => {
  const priced = pageAt('/park/vakantiepark-gulpen').body;
  const bar = priced.slice(priced.lastIndexOf('sticky bottom-3'));
  assert.match(bar, /€\s300/);
  assert.match(bar, /25% voordeliger/);
  assert.match(bar, /href="\/api\/go\?url=[^"]+from=parkbalk[^"]*" target="_blank" rel="sponsored noopener"/);
  const full = pageAt('/park/vakantiepark-sohojlandet').body;
  assert.match(full, /href="\/api\/go\?url=https%3A%2F%2Fwww\.landal\.nl%2Fparken%2Fsohojlandet&#38;park=SDT&#38;from=parkbalk"/);
  assert.match(full, /Bekijk bij Landal/);
});

test('every list page keeps its best deal in view, named, with a booking link of its own', () => {
  for (const [path, source] of [
    ['/weekend/2026-11-06', 'weekendbalk'],
    ['/regio/limburg', 'regiobalk'],
    ['/land/nederland', 'regiobalk'],
    ['/last-minute', 'lastminutebalk'],
    ['/parken', 'overzichtbalk'],
    ['/weekenden', 'overzichtbalk'],
  ]) {
    const body = pageAt(path).body;
    const bar = body.slice(body.lastIndexOf('sticky bottom-3'));
    assert.match(bar, /Vakantiepark Gulpen/, path);
    assert.match(bar, /25% voordeliger/, path);
    assert.match(bar, new RegExp(`from=${source}`), path);
  }
});
