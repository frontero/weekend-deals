// Public pages per park, weekend, region and theme: what search engines find, and where visitors from there land.
// Built after each round from the two-person overview and kept as finished HTML, so the Worker serves one with a
// single query and hardly any CPU. They carry the app's stylesheet but not its script: fast, readable without
// JavaScript, and every price on them leads to the provider through the tracked booking link.
// Every text is put together from this site's own data (prices, facilities, accommodations, surroundings), so no two
// pages say the same and none copies a provider's page.
// No Node imports: the Worker serves these.
import { reasonText, verdictLabel } from '../src/lib/advice.js';
import { brandName } from '../src/lib/brands.js';
import { countryName, formatEuros, formatWeekend, nights } from '../src/lib/format.js';
import { providerName, trackedBookingUrl } from '../src/lib/providers.js';
import { parkBrand } from '../shared/brands.mjs';
import { facilityGroups } from '../shared/facilities.mjs';
import { distanceKm } from '../shared/geo.mjs';
import { groupKey, HOT_TUB_PARTY, parseGroupKey, partyLabel, PET_PARTY, STANDARD_PARTIES } from '../shared/party.mjs';

// Two adults, the app's own default: the most searched-for weekend away.
export const PAGE_PARTY = STANDARD_PARTIES[0];
const NEARBY_PARKS = 6;
const TOP_DEALS = 3;
// A weekend page lists this many parks, cheapest first; with all of them (200+) it weighs a quarter megabyte.
const LISTED_OFFERS = 50;
// A weekend is a deal from this share under the park's normal price, as in the app's default filter.
const DEAL_SHARE = 0.2;
// A region or theme gets a page of its own from this many parks; fewer makes a thin list.
const MIN_LISTED_PARKS = 3;
const SHOWN_ACCOMMODATIONS = 8;
// Region and theme pages show this many parks as cards with photo and booking button, the rest as a short list.
const PARK_CARDS = 12;
const REGION_PLACES = 6;
// The last-minute page: the coming weekends, and per weekend this many parks as cards.
const LAST_MINUTE_WEEKENDS = 2;
const LAST_MINUTE_CARDS = 6;
// The months' average weekend prices are worth a sentence when the cheapest is at least this much under the dearest.
const MONTH_GAP = 0.1;
// Under this many percent from the park's normal price a weekend costs the normal price: no news.
const NOTEWORTHY_PERCENT = 5;
const SITE_NAME = 'Weekendje weg';

const PAGE_PATH =
  /^\/(?:parken|weekenden|park\/[a-z0-9-]+|weekend\/\d{4}-\d{2}-\d{2}|regio\/[a-z0-9-]+|thema\/[a-z0-9-]+|land\/[a-z0-9-]+|last-minute|privacy|sitemap\.xml|robots\.txt)$/;
/** Whether a path is one of these pages (or their sitemap and robots.txt) rather than the app. */
export const isPagePath = (pathname) => PAGE_PATH.test(pathname);

export const weekendPath = (arrival) => `/weekend/${arrival}`;

/**
 * What people search a holiday park by (Google Trends, October 2026), each a page with the parks that have the
 * facilities (shared/facilities.mjs): any one of them, or `minimum` of them. `name` is the search phrase itself;
 * `intro` the page's own opening, what follows comes from the data. A theme with a `party` shows that party size's
 * prices, as its readers travel with more.
 */
const THEMES = [
  {
    slug: 'vakantiepark-met-zwembad',
    facilities: ['overdekt-zwembad', 'zwemparadijs', 'openluchtzwembad'],
    label: 'Zwembad',
    name: 'Vakantiepark met zwembad',
    intro: 'Een zwembad op het park: binnen, buiten of subtropisch, zodat je ook zonder auto kunt zwemmen.',
  },
  {
    slug: 'subtropisch-zwemparadijs',
    facilities: ['zwemparadijs'],
    label: 'Subtropisch zwembad',
    name: 'Vakantiepark met subtropisch zwembad',
    intro: 'Glijbanen, een golfslagbad en lekker warm water: met een zwemparadijs op het park maakt het weer niet uit. Ideaal voor een weekend met kinderen in de herfst of winter.',
  },
  {
    slug: 'overdekt-zwembad',
    facilities: ['overdekt-zwembad'],
    label: 'Binnenzwembad',
    name: 'Vakantiepark met binnenzwembad',
    intro: 'Zwemmen bij elk weer, zonder eerst de auto in te hoeven: deze parken hebben een overdekt zwembad.',
  },
  {
    // Its own price series (FEATURE_PARTIES): the cheapest accommodation with a hot tub, not the park's cheapest.
    slug: 'huisje-met-hottub',
    facilities: [],
    minimum: 0,
    party: groupKey(HOT_TUB_PARTY),
    showStay: true,
    icon: '🛁',
    label: 'Huisje met hottub',
    name: 'Huisje met hottub of jacuzzi',
    intro: 'Na een dag buiten opwarmen in je eigen hottub of buitenbubbelbad, onder de sterren. De prijs is die van het goedkoopste huisje mét hottub op het park, voor 2 personen.',
  },
  {
    // Its own price series too: two people and a pet, only accommodations where it may come.
    slug: 'vakantiepark-met-hond',
    facilities: [],
    minimum: 0,
    party: groupKey(PET_PARTY),
    showStay: true,
    icon: '🐕',
    label: 'Met hond',
    name: 'Vakantiepark met hond',
    intro: 'Je hond mag mee: de prijs is die van het goedkoopste huisje waar een huisdier welkom is, voor 2 personen en 1 huisdier. Bij Landal zit de toeslag voor je hond in de prijs, bij Molecaten betaal je die apart.',
  },
  {
    slug: 'vakantiepark-met-kinderen',
    facilities: ['speeltuin', 'kinderboerderij', 'kinderclub', 'indoor-speelparadijs', 'zwemparadijs', 'peuterbad', 'waterspeeltuin', 'animatie'],
    minimum: 2,
    party: 'a4-c0',
    icon: '👪',
    label: 'Met kinderen',
    name: 'Vakantiepark met kinderen',
    intro: 'Parken waar kinderen zich vermaken: minstens twee van speeltuin, kinderboerderij, kinderclub, zwemparadijs, peuterbad of indoor speelparadijs. De prijzen zijn voor 4 personen.',
  },
  {
    slug: 'aan-zee',
    facilities: ['kust'],
    label: 'Aan zee',
    name: 'Vakantiepark aan zee',
    intro: 'Uitwaaien op het strand en daarna terug naar je eigen huisje: deze parken liggen aan de kust.',
  },
  {
    slug: 'in-het-bos',
    facilities: ['bos'],
    label: 'In het bos',
    name: 'Vakantiepark in het bos',
    intro: 'Wandelen en fietsen vanaf de voordeur: deze parken liggen in een bosrijke omgeving.',
  },
  {
    slug: 'aan-het-water',
    facilities: ['water'],
    label: 'Aan het water',
    name: 'Vakantiepark aan het water',
    intro: 'Aan een meer of recreatieplas, voor wie wil vissen, varen of gewoon over het water wil uitkijken.',
  },
  {
    slug: 'in-de-heuvels',
    facilities: ['heuvels'],
    label: 'In het heuvelland',
    name: 'Vakantiepark in het heuvelland',
    intro: 'Wandelen met uitzicht, tussen glooiende heuvels en dalen.',
  },
  {
    slug: 'in-de-bergen',
    facilities: ['bergen'],
    label: 'In de bergen',
    name: 'Vakantiepark in de bergen',
    intro: 'Bergen, frisse lucht en in de winter vaak sneeuw: deze parken liggen in de bergen.',
  },
  {
    slug: 'met-sauna',
    facilities: ['sauna'],
    label: 'Sauna op het park',
    name: 'Vakantiepark met sauna',
    intro: 'Een weekend dat echt ontspannen is, met een sauna op het park.',
  },
  {
    slug: 'met-kinderboerderij',
    facilities: ['kinderboerderij'],
    label: 'Kinderboerderij',
    name: 'Vakantiepark met kinderboerderij',
    intro: 'Dieren voeren en knuffelen zonder het park af te gaan: deze parken hebben een kinderboerderij of dierenweide.',
  },
  {
    slug: 'met-indoor-speelparadijs',
    facilities: ['indoor-speelparadijs'],
    label: 'Indoor speelparadijs',
    name: 'Vakantiepark met indoor speelparadijs',
    intro: 'Klimmen, glijden en ravotten, ook als het regent: deze parken hebben een indoor speelparadijs.',
  },
  {
    slug: 'met-kinderclub',
    facilities: ['kinderclub'],
    label: 'Kinderclub',
    name: 'Vakantiepark met kinderclub',
    intro: 'Met een kinderclub op het park vermaken de kinderen zich, en hebben jullie even tijd voor elkaar.',
  },
  {
    slug: 'met-bowlingbaan',
    facilities: ['bowling'],
    label: 'Bowlingbaan',
    name: 'Vakantiepark met bowlingbaan',
    intro: 'Een avondje bowlen zonder de auto te pakken: deze parken hebben een bowlingbaan.',
  },
  {
    slug: 'vuurwerkvrij',
    facilities: ['vuurwerkvrij'],
    label: 'Vuurwerkvrij',
    name: 'Vuurwerkvrij vakantiepark',
    intro: 'Oud en nieuw zonder knallen: op deze parken is vuurwerk niet toegestaan. Fijn met jonge kinderen of een hond.',
  },
  {
    slug: 'huisjes-met-privezwembad',
    facilities: ['huisjes-met-privezwembad'],
    label: 'Privézwembad bij het huisje',
    name: 'Vakantiepark met privézwembad bij het huisje',
    intro: 'Een eigen zwembad bij je huisje. Let op: de prijzen hier zijn van het goedkoopste huisje van het park; een huisje met privézwembad is groter en duurder.',
  },
  {
    slug: 'nieuwe-parken',
    facilities: ['nieuw-park'],
    label: 'Nieuwe parken',
    name: 'Nieuwe vakantieparken',
    intro: 'Alles nog fris en nieuw: deze parken zijn pas geopend.',
  },
];
const themeIcon = (theme) => theme.icon ?? FACILITY_ICONS[theme.facilities[0]];
const fitsTheme = (theme, park) => theme.facilities.filter((id) => park.facilities.includes(id)).length >= (theme.minimum ?? 1);
const themePath = (theme) => `/thema/${theme.slug}`;

// Where a park lies, from Landal's tags, in the order a sentence names them.
const SETTINGS = [
  ['kust', 'aan de kust'],
  ['water', 'aan het water'],
  ['bos', 'in een bosrijke omgeving'],
  ['bergen', 'in de bergen'],
  ['skigebied', 'in een skigebied'],
  ['heuvels', 'in het heuvelland'],
  ['landelijk', 'landelijk'],
];
// Facility groups that are something to do; where a park lies goes into its text, the rest is good to know.
const SETTING_GROUP = 'Ligging';
const GENERAL_GROUP = 'Algemeen';

class Html {
  constructor(text) {
    this.text = text;
  }
}
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
const piece = (value) => {
  if (value instanceof Html) return value.text;
  if (Array.isArray(value)) return value.map(piece).join('');
  return value == null || value === false || value === '' ? '' : escapeHtml(value);
};
/** HTML with every value escaped, except nested html`` pieces; lists are joined, empty values left out. */
const html = (strings, ...values) =>
  new Html(strings.reduce((text, string, index) => text + string + (index < values.length ? piece(values[index]) : ''), ''));

export const slugify = (text) =>
  text
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const longDate = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthName = new Intl.DateTimeFormat('nl-NL', { month: 'long', timeZone: 'UTC' });
const updatedAt = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Amsterdam',
});
const day = (isoDate) => new Date(`${isoDate}T00:00:00Z`);
/** "6–9 november 2026", or "30 oktober – 2 november 2026" across months. */
export const weekendRange = ({ arrival, departure }) => longDate.formatRange(day(arrival), day(departure));

/** "a, b en c" */
const joinAnd = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} en ${items.at(-1)}`);
const count = (number, one, many) => `${number} ${number === 1 ? one : many}`;

/** "Landal Gulpen": the brand in front, unless the park's name already carries it. */
const fullName = (park) => {
  const brand = brandName(park.brand);
  return park.name.toLowerCase().includes(brand.toLowerCase()) ? park.name : `${brand} ${park.name}`;
};
// Regions a provider misspells, as people search for them. Wallonië holds Ardennes parks and others: the Ardennes
// ones are found by where they lie (AREAS), the rest by their country.
const REGION_SPELLING = { Voralberg: 'Vorarlberg', 'Wallonië': null, 'Noordzee/Wadden': 'Waddeneilanden' };
/** "Zeeland" from Landal's "Zeeland (NL)", so the providers' spellings of a region come together. */
export const regionOf = (park) => {
  const region = park.region?.replace(/\s*\([A-Z]{2}\)$/, '').trim();
  return region in REGION_SPELLING ? REGION_SPELLING[region] : region || null;
};
const regionPath = (region) => `/regio/${slugify(region)}`;
const countryPath = (country) => `/land/${slugify(countryName(country))}`;

const WADDEN = 'Waddeneilanden';
/** Areas people search for that the providers file under a larger region: by place, or by where a park lies. */
const AREAS = [
  { name: 'Texel', test: (park) => regionOf(park) === WADDEN && ['De Koog', 'De Cocksdorp', 'Den Burg', 'Den Hoorn', 'Oosterend', 'Oudeschild'].includes(park.city) },
  { name: 'Ameland', test: (park) => regionOf(park) === WADDEN && ['Nes', 'Hollum', 'Buren', 'Ballum'].includes(park.city) },
  // The Veluwe's woods and heath, roughly: Gelderland between the Gelderse Vallei, the IJssel and the rivers.
  {
    name: 'Veluwe',
    test: (park) => regionOf(park) === 'Gelderland' && park.lat >= 51.95 && park.lat <= 52.5 && park.lng >= 5.55 && park.lng <= 6.2,
  },
  // The Belgian Ardennes, which Landal files under Ardennen as well as Wallonië.
  { name: 'Ardennen', test: (park) => park.country === 'BE' && park.lat < 50.45 && park.lng > 4.7 },
];
const PREPOSITIONS = { Texel: 'op', Ameland: 'op', Waddeneilanden: 'op de' };
/** "op Texel", "op de Waddeneilanden", "in Zeeland" */
const inPlace = (place) => `${PREPOSITIONS[place] ?? 'in'} ${place}`;
const capitalised = (text) => text.charAt(0).toUpperCase() + text.slice(1);
/** The regions a park belongs to, the most specific first: "Texel" before "Waddeneilanden". */
const regionsOf = (park) => [...new Set([...AREAS.filter((area) => area.test(park)).map((area) => area.name), regionOf(park)].filter(Boolean))];
const placeOf = (park) => [park.city, countryName(park.country)].filter(Boolean).join(', ');
const cheapestOf = (weekends) => weekends.reduce((best, weekend) => (!best || weekend.priceCents < best.priceCents ? weekend : best), null);
const discountPercent = (weekend) => Math.round((weekend.discount ?? 0) * 100);
const stay = (weekend) => `${nights(weekend)} nachten · ${partyLabel(PAGE_PARTY)} · incl. toeslagen`;
const providersOf = (parks) => joinAnd([...new Set(parks.map((park) => providerName(park.provider)))]);

const link = 'font-bold text-accent hover:underline';
const chip = 'inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-sm font-bold ring-2 ring-line transition hover:ring-accent';
const card = 'overflow-hidden rounded-3xl bg-surface ring-1 ring-line';
const sticker = 'inline-block -rotate-3 rounded-full bg-sun px-3 py-1 text-sm font-black whitespace-nowrap text-on-sun shadow-md';

// A picture per facility, outing and section: quicker to take in than words alone.
const FACILITY_ICONS = {
  'overdekt-zwembad': '🏊',
  zwemparadijs: '🌴',
  openluchtzwembad: '☀️',
  peuterbad: '🐥',
  'natuurlijk-zwemwater': '🏞️',
  waterspeeltuin: '💦',
  'huisjes-met-privezwembad': '🏡',
  speeltuin: '🛝',
  'indoor-speelparadijs': '🧗',
  kinderboerderij: '🐐',
  animatie: '🎭',
  kinderclub: '🧸',
  amusementshal: '🕹️',
  restaurant: '🍽️',
  cafe: '☕',
  snackbar: '🍟',
  winkel: '🛒',
  fietsverhuur: '🚲',
  minigolf: '⛳',
  bowling: '🎳',
  vissen: '🎣',
  tennis: '🎾',
  watersport: '🛶',
  golfbaan: '🏌️',
  padel: '🏓',
  squash: '🏸',
  pumptrack: '🚵',
  'jeu-de-boules': '🎯',
  sportveld: '⚽',
  sauna: '🧖',
  wellness: '💆',
  'massage-beauty': '💅',
  fitness: '🏋️',
  zonnebank: '😎',
  wifi: '📶',
  laadpalen: '🔌',
  'nieuw-park': '✨',
  vuurwerkvrij: '🔇',
  vuurwerkluw: '🔕',
  bos: '🌲',
  kust: '🏖️',
  water: '🌊',
  landelijk: '🌾',
  heuvels: '⛰️',
  bergen: '🏔️',
  skigebied: '⛷️',
};
const PLACE_ICONS = {
  Pretpark: '🎢',
  Dierentuin: '🦁',
  Aquarium: '🐠',
  Zwemparadijs: '💦',
  Kasteel: '🏰',
  Paleis: '👑',
  Landhuis: '🏡',
  Vesting: '🛡️',
  Fort: '🛡️',
  Museum: '🖼️',
  Kunstmuseum: '🎨',
  'Historisch museum': '🏺',
  Openluchtmuseum: '🏘️',
  Natuurmuseum: '🦕',
  Techniekmuseum: '⚙️',
  Strand: '🏖️',
  'Nationaal park': '🌳',
  Natuurgebied: '🌿',
  Bos: '🌲',
  Meer: '🛶',
  Uitkijktoren: '🔭',
  Berg: '🏔️',
  Heuvel: '⛰️',
  Grot: '🦇',
  Waterval: '💧',
  Skigebied: '⛷️',
  Molen: '🌬️',
  Bezienswaardigheid: '📍',
};
// Each sort of facility its own soft colour behind the pictures.
const GROUP_TINTS = {
  Zwemmen: 'bg-accent-wash',
  Kinderen: 'bg-sun-wash',
  'Eten en drinken': 'bg-cta-wash',
  'Sport en spel': 'bg-good-wash',
  Wellness: 'bg-accent-wash',
};
const emojiDot = (emoji, tint = 'bg-accent-wash') =>
  emoji && html`<span aria-hidden="true" class="grid size-8 shrink-0 place-items-center rounded-full ${tint} text-base">${emoji}</span>`;
const sectionTitle = (id, emoji, text) =>
  html`<h2 id="${id}" class="flex items-center gap-2 text-2xl font-black"><span aria-hidden="true">${emoji}</span>${text}</h2>`;

/** Landal's photos come in any width; the big one on top of a park's page asks for a sharp one. */
const largePhoto = (url) => url?.replace(/([?&]t=)cw\d+/, '$1cw1600') ?? null;

function compared(weekend) {
  if (weekend.discount == null) return '';
  const percent = discountPercent(weekend);
  // A few percent either way is the normal price; the yellow is kept for real deals.
  if (percent >= NOTEWORTHY_PERCENT) {
    return html`<span class="rounded-full bg-sun px-2.5 py-0.5 text-xs font-black whitespace-nowrap text-on-sun">${percent}% voordeliger</span>`;
  }
  return html`<span class="text-xs font-semibold whitespace-nowrap text-ink-muted">${percent > -NOTEWORTHY_PERCENT ? 'normale prijs' : `${-percent}% boven normaal`}</span>`;
}

/** The discount as a sticker on a photo. */
const photoSticker = (weekend) =>
  weekend && discountPercent(weekend) >= NOTEWORTHY_PERCENT && html`<span class="${sticker} absolute top-3 left-3">${discountPercent(weekend)}% voordeliger</span>`;

const WEATHER_CREDIT = 'Weersverwachting van MET Norway (yr.no).';

/** Only good weather is ever passed on (see server/weather.mjs); a forecast, and said so. */
const weatherChip = (weather) =>
  weather &&
  html`<span class="rounded-full bg-sun-wash px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-warning-ink" title="${WEATHER_CREDIT}"><span aria-hidden="true">☀️</span> Zonnig verwacht, tot ${weather.maxTemp} °C</span>`;

/** @param tint the chip's own colour; on a banner of the same colour it takes the surface instead */
const occasionChips = (occasions, tint = 'bg-accent-wash') =>
  occasions.map((occasion) => html`<span class="rounded-full ${tint} px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-accent">${occasion.label}</span>`);

function bookButton(park, weekend, source, party = PAGE_PARTY) {
  const provider = providerName(park.provider);
  return html`<a href="${trackedBookingUrl(park, weekend, party, source)}" target="_blank" rel="sponsored noopener" class="inline-flex shrink-0 items-center justify-center rounded-full bg-cta px-5 py-2.5 font-extrabold text-on-cta shadow-sm transition hover:bg-cta-hover hover:shadow-md">Boek bij ${provider}<span class="sr-only"> (opent ${provider} in een nieuw tabblad)</span></a>`;
}

/** @param trail [href, label] pairs leading up to the page */
const breadcrumb = (...trail) =>
  html`<nav aria-label="Kruimelpad" class="text-sm font-semibold text-ink-secondary">${trail.map(([href, label]) => html`<a href="${href}" class="${link}">${label}</a> › `)}</nav>`;

function rating(park) {
  const { rating: score, ratingCount } = park.googleRating ?? {};
  if (!score) return '';
  const reviews = ratingCount ? ` (${ratingCount.toLocaleString('nl-NL')} recensies)` : '';
  return html`<span><span aria-hidden="true" class="text-star">★</span> ${score.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} op Google${reviews}</span>`;
}

const photo = (src, alt, classes = 'aspect-[3/2]') =>
  html`<img src="${src}" alt="${alt}" loading="lazy" decoding="async" class="${classes} w-full bg-line object-cover" />`;

/** A colourful banner on top of a list page. */
const banner = (emoji, title, intro, tint = 'bg-accent-wash') =>
  html`<div class="rounded-[2rem] ${tint} p-6 sm:p-8">
    <p aria-hidden="true" class="text-4xl">${emoji}</p>
    <h1 class="mt-2 text-3xl font-black tracking-tight sm:text-5xl">${title}</h1>
    ${intro}
  </div>`;

/** An outing near a park, with its photo (or its picture when it has none) and the photo's credit. */
function placeCard(spot, { showDistance = true } = {}) {
  const credit = spot.image && [spot.image.author, spot.image.license].filter(Boolean).join(', ');
  // Wikidata often describes a place by its kind alone ("pretpark"): then the kind says it already.
  const description = spot.description && spot.description.toLowerCase() !== spot.kind.toLowerCase() ? spot.description : null;
  const emoji = PLACE_ICONS[spot.kind] ?? '📍';
  return html`<li class="${card}">
    <div class="relative">
      ${spot.image ? photo(spot.image.url, spot.name) : html`<div aria-hidden="true" class="grid aspect-[3/2] place-items-center bg-accent-wash text-5xl">${emoji}</div>`}
      <span class="absolute top-3 left-3 rounded-full bg-surface/95 px-3 py-1 text-xs font-extrabold shadow-sm"><span aria-hidden="true">${emoji}</span> ${spot.kind}${showDistance && ` · ${spot.km.toLocaleString('nl-NL')} km`}</span>
    </div>
    <div class="p-4">
      <h3 class="text-lg font-extrabold">${spot.name}</h3>
      ${description && html`<p class="text-sm text-ink-secondary">${description}</p>`}
      ${credit && html`<p class="mt-1 text-xs text-ink-muted">Foto: <a href="${spot.image.page}" class="hover:underline" rel="nofollow">${credit}</a></p>`}
    </div>
  </li>`;
}

/**
 * A park as a card on the region and theme pages: photo, place, its cheapest weekend and a way to book it.
 * @param showStay the accommodation behind the price instead of the park: for a series with a requirement
 */
function parkCard(park, { pathOf, source, party = PAGE_PARTY, showStay = false }) {
  const cheapest = cheapestOf(park.weekends);
  const stay = showStay && cheapest && park.accommodations?.[cheapest.accommodationCode];
  // A name that is only a code ("LU4") tells a visitor nothing; it is left out, the photo stays.
  const image = stay?.photos?.[0] ?? park.imageUrl;
  return html`<li class="${card} flex flex-col transition hover:-translate-y-0.5 hover:shadow-lg">
    <div class="relative">${image && photo(image, stay ? `${stay.name} bij ${fullName(park)}` : fullName(park))}${photoSticker(cheapest)}</div>
    <div class="flex flex-1 flex-col gap-1 p-4">
      <a href="${pathOf(park)}" class="text-lg font-extrabold hover:underline">${fullName(park)}</a>
      <p class="flex flex-wrap gap-x-2 text-sm text-ink-secondary"><span><span aria-hidden="true">📍</span> ${placeOf(park)}</span>${rating(park)}</p>
      ${/[a-z]/.test(stay?.name ?? '') && html`<p class="text-sm font-bold"><span aria-hidden="true">🏡</span> ${stay.name}</p>`}
      ${
        cheapest
          ? html`<p class="mt-auto pt-3 text-3xl font-black tabular-nums">${formatEuros(cheapest.priceCents)}</p>
            <p class="mb-3 text-xs font-semibold text-ink-secondary">${formatWeekend(cheapest)} · ${partyLabel(party)}</p>
            ${bookButton(park, cheapest, source, party)}`
          : html`<p class="mt-auto pt-3 text-sm text-ink-secondary">Geen vrij weekend voor ${partyLabel(party)} in de komende maanden</p>`
      }
    </div>
  </li>`;
}

/** Parks with a free weekend first, cheapest first. */
const byPrice = (parks) =>
  [...parks].sort((a, b) => (cheapestOf(a.weekends)?.priceCents ?? Infinity) - (cheapestOf(b.weekends)?.priceCents ?? Infinity));

/** One park's offer for one weekend as a card: the weekend and last-minute pages. */
const offerCard = ({ park, weekend: offer }, { pathOf, source }) =>
  html`<li class="${card} flex flex-col transition hover:-translate-y-0.5 hover:shadow-lg">
    <div class="relative">${park.imageUrl && photo(park.imageUrl, fullName(park))}${photoSticker(offer)}</div>
    <div class="flex flex-1 flex-col gap-2 p-4">
      <a href="${pathOf(park)}" class="text-lg font-extrabold hover:underline">${fullName(park)}</a>
      <span class="text-sm text-ink-secondary"><span aria-hidden="true">📍</span> ${placeOf(park)}</span>
      <p class="mt-auto flex flex-wrap items-baseline gap-2"><span class="text-3xl font-black tabular-nums">${formatEuros(offer.priceCents)}</span>${park.baselineCents && html`<s class="text-sm text-ink-muted">${formatEuros(park.baselineCents)}</s>`}</p>
      ${offer.weather && html`<p>${weatherChip(offer.weather)}</p>`}
      ${bookButton(park, offer, source)}
    </div>
  </li>`;

/** The cheapest parks as cards, the others as a list: a page with a hundred cards weighs too much. */
function parkList(parks, { pathOf, source, party = PAGE_PARTY, showStay = false }) {
  const sorted = byPrice(parks);
  const row = (park) => {
    const from = cheapestOf(park.weekends);
    return html`<li class="break-inside-avoid py-1.5"><a href="${pathOf(park)}" class="${link}">${fullName(park)}</a> <span class="text-sm text-ink-secondary">· ${placeOf(park)} · ${from ? `vanaf ${formatEuros(from.priceCents)}` : 'geen plek'}</span></li>`;
  };
  return html`<ul class="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">${sorted.slice(0, PARK_CARDS).map((park) => parkCard(park, { pathOf, source, party, showStay }))}</ul>
    ${sorted.length > PARK_CARDS && html`<section aria-labelledby="more" class="mt-10">${sectionTitle('more', '🏕️', 'Meer parken')}<ul class="mt-3 columns-1 gap-8 sm:columns-2">${sorted.slice(PARK_CARDS).map(row)}</ul></section>`}`;
}

/** How many people an accommodation sleeps, from "Geschikt voor 4 personen" or Landal's name ("Timber Lodge 4"). */
function sleeps(accommodation) {
  const fact = accommodation.facts.map((text) => text.match(/geschikt voor (\d+) personen/i)).find(Boolean);
  const named = accommodation.name?.match(/\s(\d{1,2})[A-Z]?$/);
  return Number(fact?.[1] ?? named?.[1]) || null;
}

/** The park in a few sentences: where it lies, what to sleep in, and when a weekend there costs least. */
function parkIntro(park, { accommodations, weekendCount }) {
  const sentences = [];
  const settings = SETTINGS.filter(([id]) => park.facilities.includes(id)).map(([, phrase]) => phrase).slice(0, 2);
  const region = regionOf(park);
  const where = [
    park.city && `bij ${park.city}${region && region !== park.city ? ` (${region})` : ''}`,
    park.country && park.country !== 'NL' && `in ${countryName(park.country)}`,
  ].filter(Boolean);
  if (settings.length || where.length) sentences.push(`${park.name} ligt ${[joinAnd(settings), ...where].filter(Boolean).join(' ')}.`);

  const sizes = accommodations.map(sleeps).filter(Boolean);
  if (accommodations.length > 1) {
    const [least, most] = [Math.min(...sizes), Math.max(...sizes)];
    const range = sizes.length && (least === most ? ` voor ${least} personen` : ` voor ${least} tot ${most} personen`);
    sentences.push(`Je kiest uit ${accommodations.length} soorten huisjes${range || ''}.`);
  }
  const withSauna = accommodations.filter((item) => item.facts.some((fact) => /sauna/i.test(fact))).length;
  if (withSauna) {
    const which = withSauna === accommodations.length ? 'Elk huisje heeft' : withSauna === 1 ? 'Eén daarvan heeft' : `${withSauna} daarvan hebben`;
    sentences.push(`${which} een eigen sauna.`);
  }

  if (park.weekends.length) {
    if (park.baselineCents) sentences.push(`Normaal kost een weekend hier voor ${partyLabel(PAGE_PARTY)} rond ${formatEuros(park.baselineCents)}.`);
    const byMonth = [...Map.groupBy(park.weekends, (weekend) => weekend.arrival.slice(0, 7))].map(([month, weekends]) => ({
      month: monthName.format(day(`${month}-01`)),
      average: weekends.reduce((sum, weekend) => sum + weekend.priceCents, 0) / weekends.length,
    }));
    if (byMonth.length > 1) {
      const sorted = byMonth.sort((a, b) => a.average - b.average);
      const [cheapest, dearest] = [sorted[0], sorted.at(-1)];
      if (cheapest.average <= dearest.average * (1 - MONTH_GAP)) {
        sentences.push(
          `In ${cheapest.month} ben je het voordeligst uit: gemiddeld ${formatEuros(cheapest.average)}, tegen ${formatEuros(dearest.average)} in ${dearest.month}.`,
        );
      }
    }
    sentences.push(`Van de komende ${weekendCount} weekenden ${park.weekends.length === 1 ? 'is er nog 1' : `zijn er nog ${park.weekends.length}`} vrij.`);
  }
  return sentences;
}

/** @param themes the themes that have a page, by facility */
/**
 * @param regionPages the regions the park belongs to that have a page, the most specific first
 * @param themes the themes with a page that list this park; `themeOf` those of a single facility, by that facility
 */
function parkPage(park, { pathOf, nearby, updated, accommodations, places, weekendCount, regionPages, themes: themePages, themeOf, occasionsOf }) {
  const name = fullName(park);
  const place = placeOf(park);
  const region = regionOf(park);
  const cheapest = cheapestOf(park.weekends);
  const groups = facilityGroups().map((group) => ({ ...group, options: group.options.filter((option) => park.facilities.includes(option.id)) }));
  const todo = groups.filter((group) => group.options.length && group.name !== SETTING_GROUP && group.name !== GENERAL_GROUP);
  const general = groups.find((group) => group.name === GENERAL_GROUP)?.options ?? [];
  // A fireworks-free park is also one with little; saying both is saying it twice.
  const goodToKnow = general.filter((option) => !(option.id === 'vuurwerkluw' && park.facilities.includes('vuurwerkvrij')));
  const themes = themePages;
  const shownAccommodations = [...accommodations].sort((a, b) => (sleeps(a) ?? 99) - (sleeps(b) ?? 99)).slice(0, SHOWN_ACCOMMODATIONS);
  const intro = parkIntro(park, { accommodations, weekendCount });
  const appLink = `/?${new URLSearchParams({ search: park.name, minDiscountPercent: '0' })}`;

  const facilityChip = (tint) => (option) => {
    const theme = themeOf.get(option.id);
    return html`<li class="inline-flex items-center gap-2 rounded-full bg-surface py-1 pr-3.5 pl-1 text-sm font-bold ring-2 ring-line">${emojiDot(FACILITY_ICONS[option.id], tint)}${theme ? html`<a href="${themePath(theme)}" class="hover:text-accent hover:underline">${option.name}</a>` : option.name}</li>`;
  };

  const weekendRow = (weekend) => {
    const advice = ['book', 'wait'].includes(weekend.advice?.verdict) ? weekend.advice : null;
    return html`<li class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-surface p-3 pl-4 ring-1 ring-line">
      <div class="min-w-0 basis-full sm:basis-0 sm:flex-1">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1"><a href="${weekendPath(weekend.arrival)}" class="${link}">${formatWeekend(weekend)}</a> ${compared(weekend)} ${weatherChip(weekend.weather)} ${occasionChips(occasionsOf(weekend))}</p>
        ${advice && html`<p class="mt-1 text-sm font-semibold ${advice.verdict === 'book' ? 'text-good-ink' : 'text-ink-secondary'}">${verdictLabel(advice.verdict)}: ${reasonText(advice.reasons[0] ?? {})}</p>`}
      </div>
      <p class="flex-1 text-xl font-black tabular-nums sm:flex-none">${formatEuros(weekend.priceCents)}</p>
      ${bookButton(park, weekend, 'parkpagina')}
    </li>`;
  };

  const accommodationCard = (accommodation) => {
    const facts = accommodation.facts.filter((fact) => !/geschikt voor \d+ personen/i.test(fact)).slice(0, 4);
    const people = sleeps(accommodation);
    return html`<li class="${card}">
      ${accommodation.photos[0] ? photo(accommodation.photos[0], `${accommodation.name} bij ${name}`) : html`<div aria-hidden="true" class="grid aspect-[3/2] place-items-center bg-sun-wash text-4xl">🏡</div>`}
      <div class="p-3">
        <h3 class="font-extrabold">${accommodation.name}</h3>
        ${people && html`<p class="mt-1"><span class="rounded-full bg-accent-wash px-2 py-0.5 text-xs font-bold text-accent">${people} personen</span></p>`}
        <p class="mt-1 text-sm text-ink-secondary">${facts.join(' · ')}</p>
      </div>
    </li>`;
  };

  const nearbyCard = ({ park: other, km }) => {
    const from = cheapestOf(other.weekends);
    return html`<li class="rounded-2xl bg-surface px-4 py-3 ring-1 ring-line"><a href="${pathOf(other)}" class="${link}">${fullName(other)}</a><p class="text-sm text-ink-secondary">${km} km · ${from ? `vanaf ${formatEuros(from.priceCents)}` : 'geen plek'}</p></li>`;
  };

  const body = html`
    ${breadcrumb(['/parken', 'Alle parken'], ...regionPages.slice(0, 1).map((name) => [regionPath(name), name]))}
    ${park.imageUrl && html`<div class="relative mt-3"><img src="${largePhoto(park.imageUrl)}" alt="${name}" class="aspect-[16/9] w-full rounded-[2rem] bg-line object-cover sm:aspect-[5/2]" />${photoSticker(cheapest)}</div>`}
    <h1 class="mt-5 text-4xl font-black tracking-tight sm:text-5xl">${name}</h1>
    <p class="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-semibold text-ink-secondary">${place && html`<span><span aria-hidden="true">📍</span> ${place}</span>`}<span>bij ${providerName(park.provider)}</span>${rating(park)}</p>
    ${
      cheapest
        ? html`<section aria-labelledby="cheapest" class="mt-6 flex flex-col gap-4 rounded-[2rem] bg-accent p-6 text-on-accent sm:flex-row sm:items-center">
            <div class="flex-1">
              <h2 id="cheapest" class="text-sm font-bold">Goedkoopste weekend voor ${partyLabel(PAGE_PARTY)}</h2>
              <p class="mt-1 text-lg font-extrabold">${formatWeekend(cheapest)}</p>
              <p class="mt-1 flex flex-wrap items-center gap-3"><span class="text-5xl font-black tabular-nums">${formatEuros(cheapest.priceCents)}</span> ${compared(cheapest)}</p>
              <p class="mt-1 text-sm font-semibold">${stay(cheapest)}</p>
              ${(cheapest.weather || occasionsOf(cheapest).length > 0) && html`<p class="mt-2 flex flex-wrap gap-1.5">${weatherChip(cheapest.weather)} ${occasionChips(occasionsOf(cheapest))}</p>`}
            </div>
            ${bookButton(park, cheapest, 'parkpagina')}
          </section>`
        : html`<p class="mt-6 rounded-[2rem] bg-sun-wash p-6 font-semibold">Voor ${partyLabel(PAGE_PARTY)} vonden we bij ${name} geen vrij weekend in de komende maanden. Bekijk de parken in de buurt, of <a href="/" class="${link}">zoek een ander weekend</a>.</p>`
    }
    ${intro.length > 0 && html`<p class="mt-8 max-w-3xl text-lg leading-relaxed">${intro.join(' ')}</p>`}
    ${
      todo.length > 0 &&
      html`<section aria-labelledby="todo" class="mt-10">
        ${sectionTitle('todo', '🎈', 'Op het park')}
        <div class="mt-4 space-y-4">${todo.map(
          (group) => html`<div><h3 class="text-sm font-extrabold tracking-wide text-ink-secondary uppercase">${group.name}</h3><ul class="mt-2 flex flex-wrap gap-2">${group.options.map(facilityChip(GROUP_TINTS[group.name]))}</ul></div>`,
        )}</div>
        ${goodToKnow.length > 0 && html`<p class="mt-4 text-sm font-semibold text-ink-secondary">Goed om te weten: ${joinAnd(goodToKnow.map((option) => option.name.toLowerCase()))}.</p>`}
      </section>`
    }
    ${
      places.length > 0 &&
      html`<section aria-labelledby="around" class="mt-10">
        ${sectionTitle('around', '🗺️', 'Uitjes in de buurt')}
        <p class="mt-1 text-sm text-ink-secondary">Binnen 15 kilometer, hemelsbreed gemeten vanaf het park.</p>
        <ul class="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">${places.map((spot) => placeCard(spot))}</ul>
      </section>`
    }
    ${
      shownAccommodations.length > 0 &&
      html`<section aria-labelledby="stay" class="mt-10">
        ${sectionTitle('stay', '🏡', 'Huisjes')}
        <ul class="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">${shownAccommodations.map(accommodationCard)}</ul>
        ${accommodations.length > shownAccommodations.length && html`<p class="mt-2 text-sm text-ink-secondary">En nog ${count(accommodations.length - shownAccommodations.length, 'ander soort huisje', 'andere soorten huisjes')}.</p>`}
      </section>`
    }
    ${
      cheapest &&
      html`<section aria-labelledby="weekends" class="mt-10">
        ${sectionTitle('weekends', '📅', 'Prijzen per weekend')}
        <p class="mt-1 text-sm text-ink-secondary">Vrijdag tot maandag voor ${partyLabel(PAGE_PARTY)}: het goedkoopste huisje van het park, inclusief toeslagen. Bijgewerkt op ${updated}.</p>
        <ul class="mt-4 space-y-2">${park.weekends.map(weekendRow)}</ul>
        ${park.weekends.some((weekend) => weekend.weather) && html`<p class="mt-2 text-xs text-ink-muted">${WEATHER_CREDIT}</p>`}
      </section>`
    }
    <p class="mt-6"><a href="${appLink}" class="inline-flex items-center gap-2 rounded-full bg-sun-wash px-4 py-2 font-bold transition hover:bg-sun hover:text-on-sun"><span aria-hidden="true">👪</span> Met meer personen, kinderen of een hond? Bekijk ${name} voor jouw gezelschap</a></p>
    ${
      nearby.length > 0 &&
      html`<section aria-labelledby="nearby" class="mt-10">
        ${sectionTitle('nearby', '📍', 'Parken in de buurt')}
        <ul class="mt-4 grid gap-2 sm:grid-cols-2">${nearby.map(nearbyCard)}</ul>
      </section>`
    }
    ${
      (regionPages.length > 0 || themes.length > 0) &&
      html`<nav aria-labelledby="more-like" class="mt-10">${sectionTitle('more-like', '✨', 'Meer zoals dit')}<ul class="mt-4 flex flex-wrap gap-2">
        ${regionPages.map((name) => html`<li><a href="${regionPath(name)}" class="${chip}"><span aria-hidden="true">🗺️</span> Alle parken ${inPlace(name)}</a></li>`)}
        ${themes.map((theme) => html`<li><a href="${themePath(theme)}" class="${chip}"><span aria-hidden="true">${themeIcon(theme)}</span> ${theme.name}</a></li>`)}
      </ul></nav>`
    }`;

  return {
    path: pathOf(park),
    title: `${name}: weekendprijzen en aanbiedingen`,
    description: cheapest
      ? `Weekendje weg naar ${name}${place ? ` in ${place}` : ''}? Vanaf ${formatEuros(cheapest.priceCents)} voor ${partyLabel(PAGE_PARTY)} (${formatWeekend(cheapest)}). Zie de prijs van elk weekend, wat er te doen is en of je nu moet boeken.`
      : `${name}${place ? ` in ${place}` : ''}: wat er te doen is op het park en in de omgeving, de huisjes en de weekendprijzen voor ${partyLabel(PAGE_PARTY)}.`,
    image: park.imageUrl ?? null,
    body: body.text,
  };
}

function weekendPage(weekend, offers, { pathOf, previous, next, updated, themes, occasions }) {
  const sorted = [...offers].sort((a, b) => a.weekend.priceCents - b.weekend.priceCents);
  const deals = offers
    .filter(({ weekend: offer }) => (offer.discount ?? 0) >= DEAL_SHARE)
    .sort((a, b) => b.weekend.discount - a.weekend.discount);
  const range = weekendRange(weekend);
  const from = formatEuros(sorted[0].weekend.priceCents);
  const dealCount = deals.length === 1 ? '1 park is' : `${deals.length} parken zijn`;
  const appLink = `/?${new URLSearchParams({ from: weekend.arrival, to: weekend.arrival, minDiscountPercent: '0' })}`;
  const sunny = offers.filter((offer) => offer.weekend.weather).length;
  const fireworksFree = occasions.some((occasion) => occasion.label === 'Oud en nieuw') && themes.find((theme) => theme.slug === 'vuurwerkvrij');
  // Per theme the cheapest park that has it this weekend and is not named for another theme yet.
  const named = new Set();
  // Themes with prices of another party size are left out: this page is about two people.
  const themed = themes
    .filter((theme) => !theme.party)
    .map((theme) => {
      const offer = sorted.find(({ park }) => fitsTheme(theme, park) && !named.has(park.code));
      if (offer) named.add(offer.park.code);
      return { theme, offer };
    })
    .filter(({ offer }) => offer);

  const offerRow = ({ park, weekend: offer }) =>
    html`<li class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-surface p-3 pl-4 ring-1 ring-line">
      <div class="min-w-0 basis-full sm:basis-0 sm:flex-1">
        <a href="${pathOf(park)}" class="${link}">${fullName(park)}</a>
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-secondary">${placeOf(park)} ${compared(offer)} ${weatherChip(offer.weather)}</p>
      </div>
      <p class="flex-1 text-xl font-black tabular-nums sm:flex-none">${formatEuros(offer.priceCents)}</p>
      ${bookButton(park, offer, 'weekendpagina')}
    </li>`;

  const neighbour = (other, label) =>
    other && html`<a href="${weekendPath(other.arrival)}" class="${chip}">${label} ${formatWeekend(other)}</a>`;

  const body = html`
    ${breadcrumb(['/weekenden', 'Alle weekenden'])}
    <div class="mt-3 rounded-[2rem] bg-accent-wash p-6 sm:p-8">
      <h1 class="text-3xl font-black tracking-tight sm:text-5xl">Weekendje weg <span class="inline-block -rotate-1 rounded-2xl bg-sun px-2 text-on-sun">${range}</span></h1>
      <p class="mt-3 max-w-2xl font-semibold text-ink-secondary">${offers.length} vakantieparken hebben nog plek van ${formatWeekend(weekend)} voor ${partyLabel(PAGE_PARTY)}, vanaf ${from}. ${deals.length > 0 && `${dealCount} minstens ${Math.round(DEAL_SHARE * 100)}% goedkoper dan normaal.`}</p>
      ${occasions.length > 0 && html`<p class="mt-4 flex flex-wrap items-center gap-2">${occasionChips(occasions, 'bg-surface')} <span class="font-semibold">${occasions.map((occasion) => occasion.text).join(' ')}</span>${fireworksFree && html` <a href="${themePath(fireworksFree)}" class="${link}">Vuurwerkvrije parken</a>`}</p>`}
      ${sunny > 0 && html`<p class="mt-3 flex flex-wrap items-center gap-2">${weatherChip({ maxTemp: Math.max(...offers.filter((offer) => offer.weekend.weather).map((offer) => offer.weekend.weather.maxTemp)) })} <span class="font-semibold">Bij ${count(sunny, 'park', 'parken')} wordt het een zonnig en droog weekend.</span> <span class="text-xs text-ink-muted">${WEATHER_CREDIT}</span></p>`}
    </div>
    ${
      deals.length > 0 &&
      html`<section aria-labelledby="deals" class="mt-10">
        ${sectionTitle('deals', '🎉', 'Grootste buitenkansjes')}
        <ul class="mt-4 grid gap-5 sm:grid-cols-3">${deals.slice(0, TOP_DEALS).map((offer) => offerCard(offer, { pathOf, source: 'weekendpagina' }))}</ul>
      </section>`
    }
    ${
      themed.length > 0 &&
      html`<section aria-labelledby="themes" class="mt-10">
        ${sectionTitle('themes', '🏷️', 'Dit weekend het goedkoopst')}
        <ul class="mt-4 grid gap-2 sm:grid-cols-2">${themed.map(
          ({ theme, offer }) => html`<li class="flex items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line">${emojiDot(themeIcon(theme))}
            <div class="min-w-0 flex-1"><a href="${themePath(theme)}" class="text-sm font-semibold text-ink-secondary hover:underline">${theme.label}</a><p><a href="${pathOf(offer.park)}" class="${link}">${fullName(offer.park)}</a></p></div>
            <span class="text-lg font-black tabular-nums">${formatEuros(offer.weekend.priceCents)}</span></li>`,
        )}</ul>
      </section>`
    }
    <section aria-labelledby="all" class="mt-10">
      ${sectionTitle('all', '💶', sorted.length > LISTED_OFFERS ? `De ${LISTED_OFFERS} goedkoopste parken` : 'Alle parken met plek, goedkoopste eerst')}
      <p class="mt-1 text-sm text-ink-secondary">${stay(weekend)}. Het goedkoopste huisje per park, bijgewerkt op ${updated}.</p>
      <ul class="mt-4 space-y-2">${sorted.slice(0, LISTED_OFFERS).map(offerRow)}</ul>
    </section>
    <p class="mt-6"><a href="${appLink}" class="inline-flex items-center gap-2 rounded-full bg-sun-wash px-4 py-2 font-bold transition hover:bg-sun hover:text-on-sun"><span aria-hidden="true">🔎</span> ${sorted.length > LISTED_OFFERS ? `Bekijk alle ${sorted.length} parken van dit weekend, ook voor jouw gezelschap` : 'Met meer personen, kinderen of een hond? Zoek dit weekend voor jouw gezelschap'}</a></p>
    <nav aria-label="Andere weekenden" class="mt-10 flex flex-wrap justify-between gap-4">${neighbour(previous, '←')}${neighbour(next, '→')}</nav>`;

  return {
    path: weekendPath(weekend.arrival),
    title: `Weekendje weg ${range}: vakantieparken met plek`,
    description: `${offers.length} vakantieparken van Landal, Topparken en Molecaten met plek van ${formatWeekend(weekend)}, voor ${partyLabel(PAGE_PARTY)} vanaf ${from}.${deals.length > 0 ? ` ${dealCount} minstens ${Math.round(DEAL_SHARE * 100)}% goedkoper dan normaal.` : ''}`,
    image: deals[0]?.park.imageUrl ?? null,
    body: body.text,
  };
}

/** "3 aan de kust en 2 in het bos", for the parks of a region. */
function settingCounts(parks) {
  return SETTINGS.map(([id, phrase]) => ({ phrase, number: parks.filter((park) => park.facilities.includes(id)).length }))
    .filter(({ number }) => number > 0)
    .sort((a, b) => b.number - a.number)
    .slice(0, 2)
    .map(({ phrase, number }) => `${number} ${phrase}`);
}

/** The places people visit from more of a region's parks first. */
function regionPlaces(parks, surroundings) {
  const seen = new Map();
  for (const park of parks) {
    for (const spot of surroundings.get(park.code) ?? []) {
      const known = seen.get(spot.id);
      seen.set(spot.id, { spot, parks: (known?.parks ?? 0) + 1 });
    }
  }
  return [...seen.values()]
    .sort((a, b) => b.parks - a.parks || Number(Boolean(b.spot.image)) - Number(Boolean(a.spot.image)))
    .slice(0, REGION_PLACES)
    .map(({ spot }) => spot);
}

function listIntro(parks, party = PAGE_PARTY) {
  const priced = parks.filter((park) => park.weekends.length);
  const cheapest = cheapestOf(priced.map((park) => cheapestOf(park.weekends)));
  const deals = priced.filter((park) => park.weekends.some((weekend) => (weekend.discount ?? 0) >= DEAL_SHARE)).length;
  return [
    cheapest && `Een weekendje weg voor ${partyLabel(party)} kost er nu vanaf ${formatEuros(cheapest.priceCents)} (${formatWeekend(cheapest)}).`,
    deals > 0 && `${count(deals, 'park heeft', 'parken hebben')} een weekend dat minstens ${Math.round(DEAL_SHARE * 100)}% goedkoper is dan normaal.`,
  ].filter(Boolean);
}

/**
 * A region's or a country's page: its parks, what they offer and the outings around them.
 * @param place where, as a sentence names it: "op Texel", "in Duitsland"
 * @param links [href, label, count] of the regions inside a country
 */
function placePage(name, parks, { path, place, emoji, pathOf, surroundings, links = [] }) {
  const pools = [
    ['zwemparadijs', 'een subtropisch zwemparadijs'],
    ['overdekt-zwembad', 'een overdekt zwembad'],
  ]
    .map(([id, what]) => ({ what, number: parks.filter((park) => park.facilities.includes(id)).length }))
    .filter(({ number }) => number > 0);
  const settings = settingCounts(parks);
  const places = regionPlaces(parks, surroundings);
  const intro = [
    `${capitalised(place)} liggen ${parks.length} vakantieparken van ${providersOf(parks)}.`,
    settings.length > 0 && `Daarvan liggen er ${joinAnd(settings)}.`,
    pools.length > 0 &&
      `Bij ${count(pools[0].number, 'park', 'parken')} is er ${pools[0].what}${pools[1] ? `, bij ${pools[1].number} ${pools[1].what}` : ''}.`,
    ...listIntro(parks),
  ].filter(Boolean);
  const preposition = place.slice(0, place.length - name.length).trim();
  const body = html`
    ${breadcrumb(['/parken', 'Alle parken'])}
    <div class="mt-3">${banner(emoji, html`Vakantieparken ${preposition} <span class="inline-block -rotate-1 rounded-2xl bg-sun px-2 text-on-sun">${name}</span>`, html`<p class="mt-3 max-w-3xl leading-relaxed font-semibold text-ink-secondary">${intro.join(' ')}</p>`)}</div>
    ${links.length > 0 && html`<ul class="mt-6 flex flex-wrap gap-2">${links.map(([href, label, number]) => html`<li><a href="${href}" class="${chip}"><span aria-hidden="true">📍</span> ${label} <span class="text-ink-muted">${number}</span></a></li>`)}</ul>`}
    ${parkList(parks, { pathOf, source: 'regiopagina' })}
    ${
      places.length > 0 &&
      html`<section aria-labelledby="todo" class="mt-10">
        ${sectionTitle('todo', '🎡', `Uitjes ${place}`)}
        <p class="mt-1 text-sm text-ink-secondary">Wat de meeste parken hier in de buurt hebben.</p>
        <ul class="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">${places.map((spot) => placeCard(spot, { showDistance: false }))}</ul>
      </section>`
    }`;
  return {
    path,
    // People search "vakantiepark Zeeland", not "weekendje weg Zeeland" (Google Trends): the title starts with it.
    title: `Vakantiepark ${name}: alle parken met weekendprijzen`,
    description: `${parks.length} vakantieparken ${place} met de prijs van elk komend weekend. ${listIntro(parks)[0] ?? ''}`.trim(),
    image: parks.find((park) => park.imageUrl)?.imageUrl ?? null,
    body: body.text,
  };
}

/** @param parks the parks that fit the theme, with the prices of the theme's party size */
function themePage(theme, parks, { pathOf, themes, party }) {
  const regions = [...Map.groupBy(parks.filter(regionOf), regionOf)]
    .filter(([, list]) => list.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3)
    .map(([region]) => region);
  const intro = [
    `We volgen ${count(parks.length, 'park', 'parken')} van ${providersOf(parks)} die hierbij passen.`,
    regions.length > 0 && `De meeste liggen in ${joinAnd(regions)}.`,
    ...listIntro(parks, party),
  ].filter(Boolean);
  const body = html`
    ${breadcrumb(['/parken', 'Alle parken'])}
    <div class="mt-3">${banner(themeIcon(theme), theme.name, html`<p class="mt-3 max-w-3xl text-lg leading-relaxed font-semibold">${theme.intro}</p><p class="mt-2 max-w-3xl leading-relaxed text-ink-secondary">${intro.join(' ')}</p>`, 'bg-sun-wash')}</div>
    ${parkList(parks, { pathOf, source: 'themapagina', party, showStay: theme.showStay })}
    <nav aria-labelledby="other-themes" class="mt-10">${sectionTitle('other-themes', '✨', "Andere thema's")}<ul class="mt-4 flex flex-wrap gap-2">${themes.filter((other) => other !== theme).map(
      (other) => html`<li><a href="${themePath(other)}" class="${chip}"><span aria-hidden="true">${themeIcon(other)}</span> ${other.label}</a></li>`,
    )}</ul></nav>`;
  return {
    path: themePath(theme),
    title: `${theme.name}: weekendje weg met de laagste prijzen`,
    description: `${theme.name}: ${count(parks.length, 'park', 'parken')} met de prijs van elk komend weekend. ${listIntro(parks, party)[0] ?? ''}`.trim(),
    image: parks.find((park) => park.imageUrl)?.imageUrl ?? null,
    body: body.text,
  };
}

/** The coming weekends with room, the biggest deals first: for whoever wants to go away now. */
function lastMinutePage(weekends, { pathOf, occasionsOf }) {
  const soon = weekends.slice(0, LAST_MINUTE_WEEKENDS);
  const section = ({ weekend, offers }, index) => {
    // The biggest deals first, then the cheapest: a weekend without deals still shows its best prices.
    const shown = [...offers]
      .sort((a, b) => discountPercent(b.weekend) - discountPercent(a.weekend) || a.weekend.priceCents - b.weekend.priceCents)
      .slice(0, LAST_MINUTE_CARDS);
    const sunny = offers.filter((offer) => offer.weekend.weather).length;
    const occasions = occasionsOf(weekend);
    return html`<section aria-labelledby="soon-${index}" class="mt-10">
      ${sectionTitle(`soon-${index}`, index === 0 ? '⏰' : '📅', `${index === 0 ? 'Eerstvolgende weekend' : 'Het weekend daarna'}: ${formatWeekend(weekend)}`)}
      <p class="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-secondary">${offers.length} parken met plek, vanaf ${formatEuros(cheapestOf(offers.map((offer) => offer.weekend)).priceCents)}. ${occasionChips(occasions)}${sunny > 0 && html` <span>Bij ${count(sunny, 'park', 'parken')} zonnig verwacht.</span>`}</p>
      <ul class="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">${shown.map((offer) => offerCard(offer, { pathOf, source: 'lastminute' }))}</ul>
      <p class="mt-4"><a href="${weekendPath(weekend.arrival)}" class="${chip}">Alle ${offers.length} parken van dit weekend →</a></p>
    </section>`;
  };
  const body = html`
    ${banner('⏰', html`Last minute <span class="inline-block -rotate-1 rounded-2xl bg-sun px-2 text-on-sun">vakantiepark</span>`, html`<p class="mt-3 max-w-3xl leading-relaxed font-semibold text-ink-secondary">Zin om er snel tussenuit te gaan? Dit zijn de vakantieparken die de komende weekenden nog plek hebben voor ${partyLabel(PAGE_PARTY)}, de grootste buitenkansjes eerst. Bijgewerkt na elke prijsronde.</p>`)}
    ${soon.map(section)}
    ${soon.some(({ offers }) => offers.some((offer) => offer.weekend.weather)) && html`<p class="mt-4 text-xs text-ink-muted">${WEATHER_CREDIT}</p>`}`;
  const [first] = soon;
  return {
    path: '/last-minute',
    title: 'Last minute vakantiepark: weekendje weg dit of volgend weekend',
    description: first
      ? `Last minute een weekendje weg: ${first.offers.length} vakantieparken met plek van ${formatWeekend(first.weekend)}, vanaf ${formatEuros(cheapestOf(first.offers.map((offer) => offer.weekend)).priceCents)} voor ${partyLabel(PAGE_PARTY)}.`
      : 'Last minute een weekendje weg: de vakantieparken die de komende weekenden nog plek hebben.',
    image: first ? ([...first.offers].sort((a, b) => discountPercent(b.weekend) - discountPercent(a.weekend))[0]?.park.imageUrl ?? null) : null,
    body: body.text,
  };
}

function parksIndex(parks, { pathOf, regions, themes, countries: countryPages }) {
  const byCountry = Map.groupBy(parks, (park) => countryName(park.country) || 'Overig');
  const countries = [...byCountry].sort((a, b) => b[1].length - a[1].length);
  const parkRow = (park) => {
    const from = cheapestOf(park.weekends);
    return html`<li class="break-inside-avoid py-1.5"><a href="${pathOf(park)}" class="${link}">${fullName(park)}</a> <span class="text-sm text-ink-secondary">${park.city && `· ${park.city} `}· ${from ? `vanaf ${formatEuros(from.priceCents)}` : 'geen plek'}</span></li>`;
  };
  const chips = (items) =>
    html`<ul class="mt-4 flex flex-wrap gap-2">${items.map(([href, emoji, label, number]) => html`<li><a href="${href}" class="${chip}"><span aria-hidden="true">${emoji}</span> ${label} <span class="text-ink-muted">${number}</span></a></li>`)}</ul>`;
  const body = html`
    ${banner('🏕️', 'Alle vakantieparken', html`<p class="mt-3 max-w-2xl font-semibold text-ink-secondary">${parks.length} parken van Landal, Topparken en Molecaten, met de laagste weekendprijs voor ${partyLabel(PAGE_PARTY)} (vrijdag tot maandag).</p><p class="mt-4"><a href="/last-minute" class="${chip}"><span aria-hidden="true">⏰</span> Last minute: de komende weekenden</a></p>`)}
    <section aria-labelledby="themes" class="mt-10">${sectionTitle('themes', '✨', 'Per thema')}${chips(themes.map(([theme, list]) => [themePath(theme), themeIcon(theme), theme.label, list.length]))}</section>
    <section aria-labelledby="countries" class="mt-10">${sectionTitle('countries', '🌍', 'Per land')}${chips(countryPages.map(([country, list]) => [countryPath(country), '📍', countryName(country), list.length]))}</section>
    <section aria-labelledby="regions" class="mt-10">${sectionTitle('regions', '🗺️', 'Per regio')}${chips(regions.map(([region, list]) => [regionPath(region), '📍', region, list.length]))}</section>
    ${countries.map(
      ([country, list]) => html`<section class="mt-10">
        <h2 class="text-2xl font-black">${country}</h2>
        <ul class="mt-2 columns-1 gap-8 sm:columns-2">${[...list].sort((a, b) => fullName(a).localeCompare(fullName(b), 'nl')).map(parkRow)}</ul>
      </section>`,
    )}`;
  return {
    path: '/parken',
    title: 'Alle vakantieparken: weekendprijzen bij Landal, Topparken en Molecaten',
    description: `${parks.length} vakantieparken in Nederland en daarbuiten, per land, regio en thema, elk met de laagste prijs voor een weekendje weg en de prijs van elk komend weekend.`,
    image: null,
    body: body.text,
  };
}

function weekendsIndex(weekends) {
  const row = ({ weekend, offers }) => {
    const cheapest = cheapestOf(offers.map((offer) => offer.weekend));
    const deals = offers.filter((offer) => (offer.weekend.discount ?? 0) >= DEAL_SHARE).length;
    return html`<li class="flex flex-col gap-1 rounded-3xl bg-surface p-4 ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-lg">
      <a href="${weekendPath(weekend.arrival)}" class="text-lg font-extrabold hover:underline">${formatWeekend(weekend)}</a>
      <p class="text-sm text-ink-secondary">${offers.length} parken met plek</p>
      <p class="mt-1 flex flex-wrap items-center gap-2"><span class="text-2xl font-black tabular-nums">vanaf ${formatEuros(cheapest.priceCents)}</span>${deals > 0 && html`<span class="rounded-full bg-sun px-2.5 py-0.5 text-xs font-black text-on-sun">${deals} ${deals === 1 ? 'buitenkansje' : 'buitenkansjes'}</span>`}</p>
    </li>`;
  };
  const body = html`
    ${banner('📅', 'Alle weekenden', html`<p class="mt-3 max-w-2xl font-semibold text-ink-secondary">Elk komend weekend (vrijdag tot maandag) met het aantal vakantieparken dat nog plek heeft voor ${partyLabel(PAGE_PARTY)} en de laagste prijs.</p><p class="mt-4"><a href="/last-minute" class="${chip}"><span aria-hidden="true">⏰</span> Last minute: de komende weekenden</a></p>`)}
    <ul class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${weekends.map(row)}</ul>`;
  return {
    path: '/weekenden',
    title: 'Weekendje weg: alle komende weekenden met prijzen',
    description: 'Elk komend weekend bij Landal, Topparken en Molecaten: hoeveel vakantieparken nog plek hebben, de laagste prijs en de buitenkansjes.',
    image: null,
    body: body.text,
  };
}

const NO_DETAILS = {
  facilitiesOf: () => [],
  accommodations: new Map(),
  surroundings: new Map(),
  ratings: new Map(),
  occasionsOf: () => [],
  // Another party size's overview, by group key, for themes that show its prices.
  parksOf: () => null,
};

/**
 * Every page: one per park, one per weekend, one per country, region and theme with enough parks, the last-minute
 * page and the lists. A park without a free weekend keeps its page while there is something to tell about it.
 * @param parks the two-person overview's parks, with their weekends and advice
 * @param allParks every known park by code, as db.parks() gives them
 * @param computedAt when the prices were put together
 * @param details what the pages tell beyond prices, for every park: see pageDetails in server/overview.mjs
 */
export function buildPages({ parks, allParks, computedAt, details: given = {} }) {
  const details = { ...NO_DETAILS, ...given };
  const priced = new Map(parks.map((park) => [park.code, park]));
  // Accommodations by name: a provider can list a few with the same name, which to a reader is one sort.
  const accommodationsOf = (park) => [
    ...new Map(
      Object.values(details.accommodations.get(park.code) ?? {})
        .filter((item) => item.name)
        .map((item) => [item.name.toLowerCase(), item]),
    ).values(),
  ];
  const everyPark = [...allParks.values()]
    .map((info) => {
      const park = priced.get(info.code);
      if (park) return { ...park, facilities: park.facilities?.length ? park.facilities : details.facilitiesOf(info.code) };
      const placeName = details.ratings.get(info.code)?.placeName;
      return {
        ...info,
        weekends: [],
        brand: parkBrand({ ...info, placeName }),
        facilities: details.facilitiesOf(info.code),
        googleRating: details.ratings.get(info.code) ?? null,
      };
    })
    // Without prices, facilities, accommodations or surroundings a page would say next to nothing.
    .filter(
      (park) =>
        park.weekends.length || park.facilities.length || accommodationsOf(park).length || details.surroundings.get(park.code)?.length,
    );
  const paths = new Map();
  const taken = new Set();
  for (const park of everyPark) {
    let slug = slugify(park.name);
    if (taken.has(slug)) slug = `${slug}-${slugify(park.code)}`;
    taken.add(slug);
    paths.set(park.code, `/park/${slug}`);
  }
  const pathOf = (park) => paths.get(park.code);
  const updated = updatedAt.format(new Date(computedAt));

  const located = everyPark.filter((park) => park.lat != null && park.lng != null);
  const nearbyOf = (park) =>
    park.lat == null
      ? []
      : located
          .filter((other) => other.code !== park.code)
          .map((other) => ({ park: other, km: distanceKm(park, other) }))
          .sort((a, b) => a.km - b.km)
          .slice(0, NEARBY_PARKS);

  const offersByArrival = Map.groupBy(
    everyPark.flatMap((park) => park.weekends.map((weekend) => ({ park, weekend }))),
    (offer) => offer.weekend.arrival,
  );
  const weekends = [...offersByArrival.keys()].sort().map((arrival) => {
    const offers = offersByArrival.get(arrival);
    return { weekend: offers[0].weekend, offers };
  });

  const enough = ([, list]) => list.length >= MIN_LISTED_PARKS;
  const bySize = (a, b) => b[1].length - a[1].length;
  const regionLists = new Map();
  for (const park of everyPark) {
    for (const region of regionsOf(park)) regionLists.set(region, [...(regionLists.get(region) ?? []), park]);
  }
  const regions = [...regionLists].filter(enough).sort(bySize);
  const regionsWithPage = new Set(regions.map(([region]) => region));
  const countries = [...Map.groupBy(everyPark.filter((park) => park.country), (park) => park.country)].filter(enough).sort(bySize);

  // A theme with a party of its own lists that party's overview, where its parks have a page; none before it has one.
  const facilitiesOf = new Map(everyPark.map((park) => [park.code, park.facilities]));
  const themeParks = (theme) => {
    if (!theme.party) return everyPark.filter((park) => fitsTheme(theme, park));
    const own = details.parksOf(theme.party) ?? [];
    return own
      .filter((park) => pathOf(park))
      .map((park) => ({ ...park, facilities: facilitiesOf.get(park.code) ?? [] }))
      .filter((park) => fitsTheme(theme, park));
  };
  const themes = THEMES.map((theme) => [theme, themeParks(theme)]).filter(enough);
  const themePages = themes.map(([theme]) => theme);
  const themeCodes = new Map(themes.map(([theme, list]) => [theme, new Set(list.map((park) => park.code))]));
  // A facility's own theme, for linking the facility where a park lists it.
  const themeOf = new Map(themePages.filter((theme) => theme.facilities.length === 1).map((theme) => [theme.facilities[0], theme]));
  const partyOf = (key) => (key && parseGroupKey(key)) || PAGE_PARTY;

  return [
    parksIndex(everyPark, { pathOf, regions, themes, countries }),
    weekendsIndex(weekends),
    lastMinutePage(weekends, { pathOf, occasionsOf: details.occasionsOf }),
    ...everyPark.map((park) =>
      parkPage(park, {
        pathOf,
        nearby: nearbyOf(park),
        updated,
        accommodations: accommodationsOf(park),
        places: details.surroundings.get(park.code) ?? [],
        weekendCount: weekends.length,
        regionPages: regionsOf(park).filter((region) => regionsWithPage.has(region)),
        themes: themePages.filter((theme) => themeCodes.get(theme).has(park.code)),
        themeOf,
        occasionsOf: details.occasionsOf,
      }),
    ),
    ...weekends.map(({ weekend, offers }, index) =>
      weekendPage(weekend, offers, {
        pathOf,
        previous: weekends[index - 1]?.weekend,
        next: weekends[index + 1]?.weekend,
        updated,
        themes: themePages,
        occasions: details.occasionsOf(weekend),
      }),
    ),
    ...regions.map(([region, list]) =>
      placePage(region, list, { path: regionPath(region), place: inPlace(region), emoji: '🗺️', pathOf, surroundings: details.surroundings }),
    ),
    ...countries.map(([country, list]) =>
      placePage(countryName(country), list, {
        path: countryPath(country),
        place: `in ${countryName(country)}`,
        emoji: '🌍',
        pathOf,
        surroundings: details.surroundings,
        links: regions
          .filter(([, parksOf]) => parksOf.every((park) => park.country === country))
          .map(([region, parksOf]) => [regionPath(region), region, parksOf.length]),
      }),
    ),
    ...themes.map(([theme, list]) => themePage(theme, list, { pathOf, themes: themePages, party: partyOf(theme.party) })),
  ];
}

const NOT_FOUND = {
  title: 'Pagina niet gevonden',
  description: 'Deze pagina bestaat niet (meer).',
  image: null,
  body: html`<h1 class="text-3xl font-bold tracking-tight">Deze pagina bestaat niet (meer)</h1>
    <p class="mt-3 text-ink-secondary">Misschien is het weekend al voorbij. Bekijk <a href="/weekenden" class="${link}">de komende weekenden</a> of <a href="/parken" class="${link}">alle parken</a>.</p>`.text,
};

const heading = 'mt-8 text-lg font-semibold';
const listing = 'mt-2 list-disc space-y-1 pl-5';

/** What the site keeps and who else sees something. Questions go to contact@ the site's own domain (Email Routing). */
const privacyPage = (hostname) => ({
  title: 'Privacy',
  description: `Wat ${SITE_NAME} bewaart en wie er verder iets ziet: geen account, geen trackingcookies, geen persoonsgegevens bij klikken.`,
  image: null,
  body: html`<h1 class="text-3xl font-bold tracking-tight">Privacy</h1>
    <div class="mt-3 max-w-2xl text-ink-secondary">
      <p>${SITE_NAME} is een website van een particulier. Je hebt geen account nodig. We gebruiken geen trackingcookies en geen bezoekersstatistieken.</p>
      <h2 class="${heading} text-ink">Wat we bewaren</h2>
      <ul class="${listing}">
        <li>Klik je door naar een aanbieder, dan bewaren we welk park, welk weekend, vanaf welke pagina, voor hoeveel personen en wanneer. Niet wie je bent en niet je IP-adres.</li>
        <li>Zet je een prijsalarm aan, dan bewaren we je zoekopdracht, je gezelschap en de willekeurige code van je meldingen. Zoek je op afstand, dan ook je plek, afgerond op ongeveer een kilometer. Verwijder je het alarm, dan is het weg.</li>
      </ul>
      <h2 class="${heading} text-ink">Wat in je browser blijft</h2>
      <p class="mt-2">Je gezelschap, je thuisadres, de code van je prijsalarm en licht of donker staan alleen in je eigen browser. Wis je de websitegegevens, dan zijn ze weg.</p>
      <h2 class="${heading} text-ink">Wie er verder iets ziet</h2>
      <ul class="${listing}">
        <li>Een adres dat je intypt, zoeken we via onze server op bij PDOK (de overheid) of OpenStreetMap. Wij bewaren het niet.</li>
        <li>De kaart komt van OpenStreetMap, foto's van de aanbieders en van Wikimedia, en recensies van Google. Zoals bij elke website zien zij je IP-adres.</li>
        <li>Prijsalarmen gaan via ntfy.sh naar de ntfy-app op je telefoon.</li>
        <li>Klik je door naar een aanbieder, dan kan die aanbieder of een affiliate-netwerk zoals TradeTracker of Awin een cookie plaatsen. Daarmee zien zij dat je boeking via ons kwam. Daarvoor geldt hun privacybeleid.</li>
        <li>De site draait bij Cloudflare. Cloudflare verwerkt technische gegevens zoals je IP-adres om de site te leveren en te beveiligen.</li>
      </ul>
      <h2 class="${heading} text-ink">Vragen</h2>
      <p class="mt-2">Mail naar <a href="mailto:contact@${hostname}" class="${link}">contact@${hostname}</a>.</p>
    </div>`.text,
});

/** A stored page as a whole document, with the site's header and footer around it. */
export function pageDocument({ title, description, image, body }, { url, stylesheet }) {
  return html`<!doctype html>
<html lang="nl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${url}" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <meta name="theme-color" content="#fffaf0" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0e1b29" media="(prefers-color-scheme: dark)" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="nl_NL" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${url}" />
    ${image && html`<meta property="og:image" content="${image}" />`}
    ${stylesheet && html`<link rel="stylesheet" href="${stylesheet}" />`}
    <script>
      // A theme chosen in the app (see src/composables/useTheme.js), applied before the first paint.
      try {
        const theme = localStorage.getItem('weekend-deals:theme');
        if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
      } catch {}
    </script>
  </head>
  <body>
    <header class="border-b border-line bg-surface">
      <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <a href="/" class="flex items-center gap-2 text-lg font-black"><span aria-hidden="true" class="grid size-9 -rotate-6 place-items-center rounded-full bg-sun text-lg shadow-sm">🏡</span>${SITE_NAME}</a>
        <nav aria-label="Hoofdmenu" class="flex gap-4 text-sm">
          <a href="/weekenden" class="${link}">Weekenden</a>
          <a href="/parken" class="${link}">Parken</a>
          <a href="/last-minute" class="${link}">Last minute</a>
        </nav>
        <a href="/" class="ml-auto rounded-full bg-cta px-4 py-2 text-sm font-extrabold text-on-cta shadow-sm transition hover:bg-cta-hover">Zoek een weekend</a>
      </div>
    </header>
    <main class="mx-auto max-w-5xl px-4 py-6 sm:px-6">${new Html(body)}</main>
    <footer class="mt-16 rounded-t-[2.5rem] bg-accent-wash">
      <p class="mx-auto max-w-5xl px-4 pt-8 pb-4 text-sm font-semibold text-ink-secondary sm:px-6">
        ${SITE_NAME} vergelijkt prijzen van Landal, Topparken en Molecaten. Links naar een aanbieder zijn affiliate-links:
        boek je via zo'n link, dan krijgen wij een vergoeding van de aanbieder. Jij betaalt niets extra, en het bepaalt
        niet welke parken je hier ziet.
      </p>
      <nav aria-label="Over de site" class="mx-auto flex max-w-5xl gap-4 px-4 pb-8 text-sm sm:px-6"><a href="/weekenden" class="${link}">Alle weekenden</a><a href="/parken" class="${link}">Alle parken</a><a href="/last-minute" class="${link}">Last minute</a><a href="/privacy" class="${link}">Privacy</a></nav>
    </footer>
  </body>
</html>
`.text;
}

export const robots = (origin) => `User-agent: *
Disallow: /api/
Disallow: /beheer
Sitemap: ${origin}/sitemap.xml
`;

/** @param pages { path, computedAt } per stored page */
export function sitemap(origin, pages) {
  const entry = ({ path, computedAt }) =>
    html`<url><loc>${origin}${path}</loc>${computedAt && html`<lastmod>${computedAt.slice(0, 10)}</lastmod>`}</url>`;
  return html`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[{ path: '/' }, ...pages].map(entry)}
</urlset>
`.text;
}

const headers = (type) => ({ 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'public, max-age=600' });

/**
 * Serves a page path (see isPagePath), the sitemap or robots.txt.
 * @param stylesheet the app's built stylesheet, so the pages look like the app
 */
export async function servePage(db, request, { stylesheet }) {
  const { origin, hostname, pathname } = new URL(request.url);
  if (pathname === '/robots.txt') return new Response(robots(origin), { headers: headers('text/plain') });
  if (pathname === '/sitemap.xml') return new Response(sitemap(origin, await db.pagePaths()), { headers: headers('application/xml') });
  const page = pathname === '/privacy' ? privacyPage(hostname) : await db.page(pathname);
  return new Response(pageDocument(page ?? NOT_FOUND, { url: `${origin}${pathname}`, stylesheet }), {
    status: page ? 200 : 404,
    headers: headers('text/html'),
  });
}
