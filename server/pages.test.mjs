import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addressKind, buildPages, isPagePath, serveNotFound, servePage, serveUnavailable, upcomingHolidayStays, upcomingOccasionLinks } from './pages.mjs';

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
    '/feestdag/carnaval',
    '/feestdag/hemelvaart',
    '/feestdag/kerst',
    '/feestdag/oud-en-nieuw',
    '/feestdag/pasen',
    '/feestdag/pinksteren',
    '/land/nederland',
    '/last-minute',
    '/merk/landal',
    '/merk/landal/limburg',
    '/park/hoogduin-b',
    '/park/mheerbos',
    '/park/vakantiepark-gulpen',
    '/park/vakantiepark-sohojlandet',
    '/park/valkenburg-heuvelland',
    '/parken',
    '/regio/limburg',
    '/vakantie/herfstvakantie',
    '/vakantie/kerstvakantie',
    '/vakantie/meivakantie',
    '/vakantie/voorjaarsvakantie',
    '/vakantie/zomervakantie',
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
  // The credit the photo's license asks for, at the end of the page rather than under the photo.
  assert.match(body, /<summary[^>]*>Fotobronnen<\/summary>[^]*De Valkenier: <a href="https:\/\/commons.wikimedia.org\/wiki\/File:Valkenier.jpg"[^>]*>Kleon3, CC BY-SA 3.0<\/a>/);
  assert.doesNotMatch(body, /Foto: /);
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
  assert.match(page.body, /Heuvels, vakwerkhuizen en het Bourgondische leven/);
  // Its figures as tiles: parks, from what price, deals, where they lie, pools.
  for (const [value, label] of [['3', 'parken'], ['1', 'park minstens 20% onder normaal'], ['2', 'in het heuvelland'], ['2', 'met binnenzwembad']]) {
    assert.match(page.body, new RegExp(`>${value}</span><span[^>]*>${label}<`), label);
  }
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

test('a card says when its price was last seen at the provider, in Dutch time', () => {
  const seen = { ...gulpen, weekends: [weekend('2026-11-06', '2026-11-09', 30000, 0.25, { observedAt: '2026-10-29T05:57:00.000Z' })] };
  const built = buildPages({ parks: [seen], allParks, computedAt: '2026-10-29T06:39:10.572Z', details });
  const at = (path) => built.find((page) => page.path === path).body;
  assert.match(at('/weekend/2026-11-06'), /Prijs gecontroleerd op 29 oktober[^<]*06:57/);
  assert.match(at('/regio/limburg'), /Prijs gecontroleerd op 29 oktober/);
  assert.doesNotMatch(pageAt('/weekend/2026-11-06').body, /Prijs gecontroleerd/, 'nothing without a time');
});

test('a park page tells search engines its lowest and highest weekend price', () => {
  const [, json] = pageAt('/park/vakantiepark-gulpen').body.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"Product".*?)<\/script>/);
  const data = JSON.parse(json);
  assert.equal(data.name, 'Weekendje weg bij Landal Vakantiepark Gulpen');
  assert.deepEqual(data.offers, {
    '@type': 'AggregateOffer',
    priceCurrency: 'EUR',
    lowPrice: '300.00',
    highPrice: '520.00',
    offerCount: 3,
    availability: 'https://schema.org/InStock',
    url: 'https://parkjeweg.nl/park/vakantiepark-gulpen',
  });
  assert.doesNotMatch(pageAt('/park/vakantiepark-sohojlandet').body, /"@type":"Product"/, 'nothing without a free weekend');
});

test("a park's large photo is asked for first and in a width that fits the screen", () => {
  const built = buildPages({ parks: [{ ...gulpen, imageUrl: 'https://photos.test/gulpen-3x2?t=cw500' }, { ...hoogduin, imageUrl: 'https://molecaten.test/hoogduin.jpg' }], allParks, computedAt: '2026-10-29T06:39:10.572Z', details });
  const at = (path) => built.find((page) => page.path === path).body;
  assert.match(at('/park/vakantiepark-gulpen'), /<img src="https:\/\/photos.test\/gulpen-3x2\?t=cw1200" srcset="https:\/\/photos.test\/gulpen-3x2\?t=cw480 480w, [^"]*cw800 800w, [^"]*cw1200 1200w" sizes="[^"]+" alt="Landal Vakantiepark Gulpen" fetchpriority="high"/);
  assert.match(at('/park/hoogduin-b'), /<img src="https:\/\/molecaten.test\/hoogduin.jpg" alt="[^"]+" fetchpriority="high"/, 'one width where the provider serves one');
});

test("providers' names are escaped", () => {
  const body = pageAt('/weekend/2026-11-06').body;
  assert.match(body, /Hoogduin &#60;b&#62;/);
  assert.doesNotMatch(body, /<b>/);
});

test('only page paths go to the pages', () => {
  for (const path of ['/parken', '/weekenden', '/park/vakantiepark-gulpen', '/weekend/2026-11-06', '/regio/limburg', '/thema/aan-zee', '/feestdag/kerst', '/vakantie/voorjaarsvakantie', '/privacy', '/zo-werkt-het', '/sitemap.xml', '/robots.txt']) {
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
  // No other site may show the page in a frame.
  assert.equal(page.headers.get('Content-Security-Policy'), "frame-ancestors 'none'");
  const text = await page.text();
  assert.match(text, /<link rel="stylesheet" href="\/assets\/index-abc.css" \/>/);
  assert.match(text, /<link rel="canonical" href="https:\/\/weekendjeweg.test\/parken" \/>/);
  assert.match(text, /affiliate-links/);
  assert.doesNotMatch(text, /<script type="module"/);
  assert.match(text, /<form data-feedback hidden[^]*Heb je gevonden wat je zocht\?/);
  assert.match(text, /add\('read', 'half'\)[^]*replace\(\/\[\^\\p\{L\}/, 'the counting script, with its regular expression intact');

  assert.equal((await serve('/park/weg')).status, 404);
  const privacy = await (await serve('/privacy')).text();
  assert.match(privacy, /niet je IP-adres/);
  assert.match(privacy, /mailto:contact@weekendjeweg.test/);
  assert.match(await (await serve('/sitemap.xml')).text(), /<loc>https:\/\/weekendjeweg.test\/parken<\/loc><lastmod>2026-10-29<\/lastmod>/);
  assert.match(await (await serve('/robots.txt')).text(), /Disallow: \/api\//);
  const how = await serve('/zo-werkt-het');
  assert.equal(how.status, 200);
  assert.match(await how.text(), /middelste weekendprijs[^]*minstens 20% onder de normale prijs[^]*affiliate-links/);
  assert.match(await (await serve('/sitemap.xml')).text(), /<loc>https:\/\/weekendjeweg.test\/zo-werkt-het<\/loc>/);
});

test('the last-minute page shows the coming weekends, the biggest deals first', () => {
  const page = pageAt('/last-minute');
  assert.equal(page.title, 'Last minute vakantiepark: dit of volgend weekend weg');
  assert.match(page.body, /Eerstvolgende weekend: vr 6 nov – ma 9 nov/);
  assert.match(page.body, /Het weekend daarna: vr 13 nov – ma 16 nov/);
  assert.doesNotMatch(page.body, /4 dec/);
  const first = page.body.slice(page.body.indexOf('Eerstvolgende'), page.body.indexOf('Het weekend daarna'));
  assert.ok(first.indexOf('Gulpen') < first.indexOf('Hoogduin'), 'the 25% deal before the cheaper park without one');
  assert.match(page.body, /from=lastminute/);
});

test('a brand has a list of its parks, and one per region where that is a list of its own', () => {
  const brand = pageAt('/merk/landal');
  assert.equal(brand.title, 'Landal vakantieparken: alle parken met weekendprijzen');
  assert.match(brand.body, /Vakantieparken van <span[^>]*>Landal<\/span>/);
  assert.match(brand.body, /href="\/merk\/landal\/limburg"/);
  assert.doesNotMatch(brand.body, /Uitjes/);
  const place = pageAt('/merk/landal/limburg');
  assert.equal(place.title, 'Landal Limburg: alle parken met weekendprijzen');
  assert.match(place.body, /Landal in <span[^>]*>Limburg<\/span>/);
  assert.match(place.body, /href="\/regio\/limburg"[^>]*>.*Alle parken in Limburg/);
  assert.match(place.body, /from=merkpagina/);
  assert.doesNotMatch(place.body, /Hoogduin/);
  assert.match(place.description, /vakantieparken van Landal in Limburg/);
  assert.match(pageAt('/regio/limburg').body, /href="\/merk\/landal\/limburg"/);
  assert.match(pageAt('/parken').body, /Per merk[^]*href="\/merk\/landal"/);
  assert.equal(pageAt('/merk/landal/nederland'), undefined, 'the same parks as the Limburg list');
  assert.ok(isPagePath('/merk/roompot/zeeland') && isPagePath('/merk/roompot') && !isPagePath('/merk/roompot/zeeland/x'));
});

test('the last-minute page says how many parks have room and gives tips', () => {
  const page = pageAt('/last-minute');
  assert.match(page.body, /Voor vr 6 nov – ma 9 nov hebben nog 2 parken plek, waarvan 1 onder zijn normale weekendprijs\. De grootste korting is 25% bij [^.]*Gulpen/);
  assert.match(page.body, /Zo boek je een last minute vakantiepark/);
});

test('a holiday page lists the stay the parks rent out for it, cheapest first, and the park and weekend pages point to it', () => {
  const festive = {
    ...gulpen,
    facilities: [...gulpen.facilities, 'vuurwerkvrij'],
    weekends: [weekend('2026-12-25', '2026-12-28', 61000, 0.1), weekend('2027-01-08', '2027-01-11', 30000, null)],
  };
  const offer = (code, priceCents, bookingUrl = null) => ({ code, priceCents, accommodationCode: null, bookingUrl });
  const holidayStays = [
    {
      slug: 'kerst',
      arrival: '2026-12-24',
      departure: '2026-12-28',
      // A park without a page of its own is left out.
      offers: [offer('GPN', 72000, 'https://www.landal.nl/boeken?kerst'), offer('molecaten:6006', 51000, 'https://www.molecaten.nl/boek?x=1'), offer('GONE', 10000)],
    },
    { slug: 'oud-en-nieuw', arrival: '2026-12-31', departure: '2027-01-04', fetchedAt: '2026-11-18T05:57:00.000Z', offers: [offer('GPN', 64000, 'https://www.landal.nl/boeken?oud')] },
    { slug: 'hemelvaart', arrival: '2027-05-05', departure: '2027-05-10', offers: [offer('GPN', 88000, 'https://www.landal.nl/boeken?hemelvaart')] },
  ];
  const built = buildPages({ parks: [festive, hoogduin], allParks, computedAt: '2026-11-18T06:00:00.000Z', details: { ...details, holidayStays } });
  const at = (path) => built.find((page) => page.path === path);

  const christmas = at('/feestdag/kerst');
  assert.equal(christmas.title, 'Vakantiepark met kerst 2026: parken met plek en prijzen');
  assert.match(christmas.body, /style="background: linear-gradient\(160deg, #0d3b2c[^"]*; color: #ffffff"/, 'its own colours');
  assert.match(christmas.body, /<svg aria-hidden="true"[^>]*viewBox="0 0 1200 120"/, 'and its own drawing');
  assert.match(
    christmas.body,
    /2 vakantieparken hebben nog plek van kerstavond tot de maandag erna \(do 24 dec – ma 28 dec, 4 nachten\) voor 2 personen, vanaf €\s510\. Zo verhuren de meeste parken het met kerst/,
  );
  const all = christmas.body.slice(christmas.body.indexOf('Alle parken met plek'));
  assert.ok(all.indexOf('Hoogduin') < all.indexOf('Gulpen'), 'cheapest first');
  assert.match(christmas.body, /from=feestdagpagina/);
  assert.match(christmas.body, /molecaten\.nl%2Fboek/, "the provider's own link for the stay");
  assert.doesNotMatch(christmas.body, /<s /, 'no normal price to strike through');
  assert.match(christmas.body, /href="\/feestdag\/oud-en-nieuw"/);

  const newYear = at('/feestdag/oud-en-nieuw');
  assert.equal(newYear.title, 'Oud en nieuw 2026 op een vakantiepark: parken en prijzen');
  assert.match(newYear.body, /1 vakantiepark heeft nog plek van oudejaarsdag tot de maandag erna \(do 31 dec – ma 4 jan, 4 nachten\)/);
  assert.match(newYear.body, /<\/span>Vuurwerkvrij vakantiepark<\/h2>/, 'the parks without fireworks');
  assert.match(newYear.body, /Prijs gecontroleerd op 18 november[^<]*06:57/, 'when the stay was asked');

  const ascension = at('/feestdag/hemelvaart');
  assert.match(ascension.body, /1 vakantiepark heeft nog plek van de woensdag voor Hemelvaart tot de maandag erna \(wo 5 mei – ma 10 mei\) voor 2 personen, vanaf €\s880\./);
  assert.match(ascension.body, /Het lange weekend: wo 5 mei – ma 10 mei/);
  assert.match(at('/weekenden').body, /href="\/feestdag\/hemelvaart"/);

  const park = at('/park/vakantiepark-gulpen').body;
  assert.match(park, /href="\/feestdag\/kerst" [^>]*><span aria-hidden="true">🎄<\/span> Kerst 2026<\/a><p[^>]*>do 24 dec – ma 28 dec · 4 nachten<\/p>/);
  assert.match(park, /€\s720/);
  assert.match(at('/weekend/2026-12-25').body, /href="\/feestdag\/kerst"/);
  assert.doesNotMatch(at('/weekend/2027-01-08').body, /feestdag/);
  assert.match(at('/weekenden').body, /href="\/feestdag\/oud-en-nieuw"/);
});

test('a holiday page keeps its address: before its prices are in, when no park has room, and after it', () => {
  assert.match(pageAt('/feestdag/kerst').body, /De prijzen van kerstavond tot de maandag erna \(do 24 dec – ma 28 dec, 4 nachten\) komen hier zodra we ze ophalen; nu lopen ze tot en met vr 4 dec – ma 7 dec\./);
  assert.doesNotMatch(pageAt('/weekenden').body, /feestdag/, 'the lists point to it once it has prices');

  const pathAt = (built, path) => built.find((page) => page.path === path);
  const holidayStays = [{ slug: 'kerst', arrival: '2026-12-24', departure: '2026-12-28', offers: [] }];
  const full = buildPages({ parks: [gulpen], allParks, computedAt: '2026-11-18T06:00:00.000Z', details: { ...details, holidayStays } });
  assert.match(pathAt(full, '/feestdag/kerst').body, /Van kerstavond tot de maandag erna \(do 24 dec – ma 28 dec, 4 nachten\) vonden we bij de parken die we volgen geen plek meer/);

  const after = buildPages({ parks: [gulpen], allParks, computedAt: '2026-12-26T06:00:00.000Z', details });
  assert.equal(pathAt(after, '/feestdag/kerst').title, 'Vakantiepark met kerst 2027: parken met plek en prijzen');
  assert.match(pathAt(after, '/feestdag/kerst').body, /vr 24 dec – ma 27 dec, 3 nachten/);
  assert.doesNotMatch(pathAt(after, '/feestdag/kerst').body, /Zo verhuren/, 'a stay from Friday to Monday is the usual weekend');
  assert.equal(pathAt(after, '/feestdag/oud-en-nieuw').title, 'Oud en nieuw 2026 op een vakantiepark: parken en prijzen');
});

test('the spring holiday and carnival pages show their weekends, region by region, and those weekends point to them', () => {
  const february = {
    ...gulpen,
    weekends: [
      weekend('2027-02-05', '2027-02-08', 39000, null),
      weekend('2027-02-12', '2027-02-15', 45000, null),
      weekend('2027-02-19', '2027-02-22', 47000, null),
      weekend('2027-02-26', '2027-03-01', 41000, null),
    ],
  };
  const OCCASIONS = {
    '2027-02-05': [{ label: 'Carnaval', text: 'Het is carnaval: in Limburg en Brabant is het feest, elders is het juist rustig.' }],
    '2027-02-12': [{ label: 'Voorjaarsvakantie Zuid', text: 'Het is voorjaarsvakantie in regio Zuid.' }],
    '2027-02-19': [{ label: 'Voorjaarsvakantie Noord/Midden', text: 'Het is voorjaarsvakantie in regio Noord en Midden.' }],
  };
  const built = buildPages({
    parks: [february, { ...hoogduin, weekends: [{ ...weekend('2027-02-12', '2027-02-15', 33000, null), bookingUrl: null }] }],
    allParks,
    computedAt: '2026-11-18T06:00:00.000Z',
    details: { ...details, occasionsOf: ({ arrival }) => OCCASIONS[arrival] ?? [] },
  });
  const at = (path) => built.find((page) => page.path === path);

  const spring = at('/vakantie/voorjaarsvakantie');
  assert.equal(spring.title, 'Vakantiepark voorjaarsvakantie 2027: parken en prijzen');
  assert.match(spring.body, /2 vakantieparken hebben plek in 2 weekenden van vrijdag tot maandag voor 2 personen, vanaf €\s330\./);
  assert.match(spring.body, /vr 12 feb – ma 15 feb[^]*>Voorjaarsvakantie Zuid</, 'each weekend says which region is free');
  assert.match(spring.body, /vr 19 feb – ma 22 feb/);
  assert.doesNotMatch(spring.body, /vr 26 feb/);
  assert.match(spring.body, /from=vakantiepagina/);

  const carnival = at('/feestdag/carnaval');
  assert.equal(carnival.title, 'Vakantiepark met carnaval 2027: parken met plek en prijzen');
  assert.match(carnival.body, /1 vakantiepark heeft nog plek van vr 5 feb – ma 8 feb voor 2 personen, vanaf €\s390\./);
  assert.match(carnival.body, /href="\/vakantie\/voorjaarsvakantie"/);

  assert.match(at('/weekend/2027-02-12').body, /href="\/vakantie\/voorjaarsvakantie"/);
  assert.match(at('/weekend/2027-02-05').body, /href="\/feestdag\/carnaval"/);
  assert.doesNotMatch(at('/weekend/2027-02-26').body, /vakantie\/|feestdag\//);
  assert.match(at('/weekenden').body, /href="\/feestdag\/carnaval"/);
  assert.match(pageAt('/vakantie/voorjaarsvakantie').body, /De prijzen voor de voorjaarsvakantie 2027 komen hier zodra we ze ophalen/);
});

test('the rounds collect the stay of each coming holiday: from its eve to the Monday after, three nights at least', () => {
  assert.deepEqual(upcomingHolidayStays('2026-11-18'), [
    { slug: 'kerst', arrival: '2026-12-24', departure: '2026-12-28' },
    { slug: 'oud-en-nieuw', arrival: '2026-12-31', departure: '2027-01-04' },
    // Easter and Whitsun: from the Friday before to the Tuesday after.
    { slug: 'pasen', arrival: '2027-03-26', departure: '2027-03-30' },
    { slug: 'pinksteren', arrival: '2027-05-14', departure: '2027-05-18' },
    // Ascension: its long weekend besides the ordinary one, from the Wednesday before to the Monday after.
    { slug: 'hemelvaart', arrival: '2027-05-05', departure: '2027-05-10' },
  ]);
  assert.deepEqual(upcomingHolidayStays('2027-01-02').slice(0, 2), [
    { slug: 'kerst', arrival: '2027-12-24', departure: '2027-12-27' },
    { slug: 'oud-en-nieuw', arrival: '2027-12-31', departure: '2028-01-03' },
  ]);
  const easterPage = pageAt('/feestdag/pasen');
  assert.equal(easterPage.title, 'Vakantiepark met Pasen 2027: parken met plek en prijzen');
  assert.match(easterPage.body, /De prijzen van Goede Vrijdag tot de dinsdag na Pasen \(vr 26 mrt – di 30 mrt, 4 nachten\) komen hier zodra we ze ophalen[^<]*Zo verhuren de meeste parken het met Pasen/);
  assert.equal(pageAt('/feestdag/hemelvaart').title, 'Vakantiepark met Hemelvaart 2027: parken met plek en prijzen');
  assert.equal(pageAt('/vakantie/herfstvakantie').title, 'Vakantiepark herfstvakantie 2026: parken met plek en prijzen');
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
  assert.match(texel.body, /Het grootste Waddeneiland/);
  assert.match(texel.body, />3<\/span><span[^>]*>parken</);
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
  assert.equal(page.title, 'Vakantiepark met kinderen: laagste weekendprijzen');
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
  assert.equal(page.title, 'Huisje met hottub of jacuzzi: laagste weekendprijzen');
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
  assert.match(body, /<option value="deal">Grootste korting<\/option>/);
  assert.doesNotMatch(body, /<div class="relative">0<\/div>/, 'no stray zero from a park without clicks');
  assert.ok(body.indexOf('Kansjespark') < body.indexOf('Goedkoop Park') && body.indexOf('Goedkoop Park') < body.indexOf('Vol Park'));
  const dealCard = body.slice(body.indexOf('Kansjespark'), body.indexOf('Goedkoop Park'));
  // The sticker sits on the photo, above the name.
  assert.ok(body.indexOf('30% voordeliger') < body.indexOf('>Landal Kansjespark<'));
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

test('parks clicked through to often this week are marked popular, with what that means', () => {
  const built = buildPages({ parks: [gulpen, hoogduin], allParks, computedAt: '2026-10-29T06:39:10.572Z', details: { ...details, popular: new Map([['GPN', 7]]) } });
  const park = built.find((page) => page.path === '/park/vakantiepark-gulpen').body;
  assert.match(park, /Populair deze week/);
  assert.match(park, /title="Veel aangeklikt op Parkje weg in de afgelopen 7 dagen\."/);
  const quiet = built.find((page) => page.path === '/park/hoogduin-b').body;
  assert.doesNotMatch(quiet, /Populair/);
  assert.doesNotMatch(quiet, /<\/span>0<\/p>/, 'no stray zero after the rating');
  const hub = built.find((page) => page.path === '/parken').body;
  assert.match(hub, /id="popular"[^]*Vakantiepark Gulpen[^]*from=populair/);
  assert.doesNotMatch(pageAt('/parken').body, /Populair deze week/, 'no popular parks, no section');
});

test('a page while the database is out of reach says so and still links to the providers', async () => {
  const response = serveUnavailable(new Request('https://parkjeweg.test/park/x'), { stylesheet: null });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Retry-After'), '3600');
  const text = await response.text();
  assert.match(text, /Even geen prijzen/);
  assert.match(text, /href="\/api\/go\?url=https%3A%2F%2Fwww\.landal\.nl%2F&#38;from=storing" target="_blank" rel="sponsored noopener"/);
});

test('a page tells search engines its trail, ending at the page itself', () => {
  const json = pageAt('/park/vakantiepark-gulpen').body.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1];
  const items = JSON.parse(json).itemListElement;
  assert.deepEqual(items[0], { '@type': 'ListItem', position: 1, name: 'Alle parken', item: 'https://parkjeweg.nl/parken' });
  assert.equal(items.at(-1).item, undefined);
  assert.match(items.at(-1).name, /Gulpen/);
});

test('the check of the pages finds what search engines stumble over, and nothing on a sound page', async () => {
  const { auditPages } = await import('./seo.mjs');
  const text = Array(130).fill('woord').join(' ');
  const sound = { path: '/parken', title: 'Alle parken', description: 'x'.repeat(100), body: `<h1>Parken</h1><p>${text}</p><a href="/park/a">a</a><img src="a.jpg" alt="Park A" />` };
  const broken = {
    path: '/park/a',
    title: 'Een titel die veel te lang is om nog in een zoekresultaat van Google te passen',
    description: 'Kort',
    body: '<h1>A</h1><h1>B</h1><a href="/park/weg">weg</a><a href="/api/go?url=x">boek</a><a href="/zo-werkt-het">hoe</a><img src="b.jpg" /><script type="application/ld+json">{oeps</script>',
  };
  const twin = { ...sound, path: '/weekenden' };
  const audit = auditPages([sound, broken, twin], '2026-11-19T06:00:00.000Z');
  assert.equal(audit.pages, 3);
  assert.deepEqual(audit.issues.filter((issue) => issue.path === '/park/a').map((issue) => issue.kind), ['title-long', 'description-short', 'heading-count', 'link-dead', 'data-invalid', 'image-alt', 'thin']);
  assert.equal(audit.issues.find((issue) => issue.kind === 'link-dead').detail, '/park/weg');
  assert.deepEqual(audit.counts['title-double'], 2);
  assert.deepEqual(auditPages([sound, { ...broken, title: 'Park A', description: 'y'.repeat(100), body: `<h1>A</h1><p>${text}</p>` }]).issues, []);
});

test('the app points to the holidays and seasons that come first', () => {
  assert.deepEqual(upcomingOccasionLinks('2026-11-19').map((link) => link.path), ['/feestdag/kerst', '/feestdag/oud-en-nieuw', '/vakantie/kerstvakantie', '/vakantie/voorjaarsvakantie']);
  assert.deepEqual(upcomingOccasionLinks('2027-04-01', 2), [
    { path: '/feestdag/pinksteren', emoji: '🌼', label: 'Pinksteren' },
    { path: '/vakantie/meivakantie', emoji: '☀️', label: 'Meivakantie' },
  ]);
});

test('an address without a file is the app, a page with a slash too many, or not found with a status of its own', async () => {
  assert.equal(addressKind('/'), 'app');
  assert.equal(addressKind('/beheer/seo'), 'app');
  assert.deepEqual(addressKind('/weekenden/'), { redirect: '/weekenden' });
  assert.deepEqual(addressKind('/park/vakantiepark-gulpen//'), { redirect: '/park/vakantiepark-gulpen' });
  assert.equal(addressKind('/bestaat-niet'), 'missing');
  assert.equal(addressKind('/bestaat-niet/'), 'missing');
  assert.equal(addressKind('/beheerder'), 'missing');
  const response = serveNotFound(new Request('https://parkjeweg.nl/bestaat-niet'), { stylesheet: '/assets/index.css' });
  assert.equal(response.status, 404);
  assert.match(await response.text(), /Deze pagina bestaat niet/);
});
