// Public pages per park, weekend, region and theme: what search engines find, and where visitors from there land.
// Built after each round from the two-person overview and kept as finished HTML, so the Worker serves one with a
// single query and hardly any CPU. They carry the app's stylesheet but not its script: fast, readable without
// JavaScript, and every price on them leads to the provider through the tracked booking link.
// Every text is put together from this site's own data (prices, facilities, accommodations, surroundings), so no two
// pages say the same and none copies a provider's page.
// No Node imports: the Worker serves these.
import { reasonText, verdictLabel } from '../src/lib/advice.js';
import { brandName } from '../src/lib/brands.js';
import { countryName, formatDay, formatEuros, formatWeekend, nights, wholeEuros } from '../src/lib/format.js';
import { bookingBrandNote, providerHomeLinks, providerName, trackedBookingUrl } from '../src/lib/providers.js';
import { parkBrand } from '../shared/brands.mjs';
import { facilityGroups } from '../shared/facilities.mjs';
import { distanceKm } from '../shared/geo.mjs';
import { distanceToDutchBorder, germanComparisonWeekend, germanRegion } from './germany.mjs';
import { OCCASION_ART } from './occasion-art.mjs';
import { DESCRIPTION_MAX, documentTitle, TITLE_MAX } from './seo.mjs';
import { groupKey, HOT_TUB_PARTY, parseGroupKey, partyLabel, PET_PARTY, STANDARD_PARTIES } from '../shared/party.mjs';
import { easter, easterStay } from '../shared/occasions.mjs';
import { localToday, shiftDays } from '../shared/weekends.mjs';

// Two adults, the app's own default: the most searched-for weekend away.
export const PAGE_PARTY = STANDARD_PARTIES[0];
const NEARBY_PARKS = 6;
const TOP_DEALS = 3;
const NEXT_PARK_WEEKENDS = 3;
// A weekend page lists this many parks, cheapest first; with all of them (200+) it weighs a quarter megabyte.
const LISTED_OFFERS = 50;
// A weekend is a deal from this share under the park's normal price, as in the app's default filter.
const DEAL_SHARE = 0.2;
// A region or theme gets a page of its own from this many parks; fewer makes a thin list.
const MIN_LISTED_PARKS = 3;
const SHOWN_ACCOMMODATIONS = 8;
// Region, country and theme pages show this many park cards at first; the rest come with a button.
const SHOWN_PARKS = 24;
const REGION_PLACES = 6;
// The last-minute page: the coming weekends, and per weekend this many parks as cards.
const LAST_MINUTE_WEEKENDS = 2;
const LAST_MINUTE_CARDS = 6;
const LAST_MINUTE_LISTED = 15;
// The months' average weekend prices are worth a sentence when the cheapest is at least this much under the dearest.
const MONTH_GAP = 0.1;
// Under this many percent from the park's normal price a weekend costs the normal price: no news.
const NOTEWORTHY_PERCENT = 5;
const SITE_NAME = 'Parkje weg';
// Where the pages live, for the links search engines read from the structured data.
const SITE_URL = 'https://parkjeweg.nl';

const PAGE_PATH =
  /^\/(?:parken|weekenden|park\/[a-z0-9-]+|weekend\/\d{4}-\d{2}-\d{2}|regio\/[a-z0-9-]+|thema\/[a-z0-9-]+|land\/[a-z0-9-]+|aanbieder\/[a-z0-9-]+(?:\/[a-z0-9-]+)?|feestdag\/[a-z0-9-]+|cijfers|vakantie\/[a-z0-9-]+|last-minute|privacy|zo-werkt-het|sitemap\.xml|robots\.txt)$/;
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

/**
 * Holidays people look for a park for ("vakantiepark kerst"): a page each, at an address that stays from year to
 * year, with the stay the parks rent out for the coming one. The rounds collect that stay apart (server/collector.mjs).
 * @property stay the stay for a year: what most parks of all three providers had room for when asked, where the
 *   ordinary Friday to Monday had far fewer (Christmas and New Year 18-11-2026, Easter and Whitsun 19-11-2026)
 * @property stayName that stay in words
 */
const EASTER_SLUG = 'pasen';
const CHRISTMAS_PATH = '/feestdag/kerst';
const CHRISTMAS_BREAK_PATH = '/vakantie/kerstvakantie';
const HOLIDAYS = [
  {
    slug: 'kerst',
    path: CHRISTMAS_PATH,
    emoji: '🎄',
    name: 'Kerst',
    heading: 'Vakantiepark met kerst',
    title: (year) => `Vakantiepark met kerst ${year}`,
    titleSuffix: 'Vanaf kerstavond',
    stay: (year) => untilMonday(`${year}-12-24`),
    stayName: 'van kerstavond tot de maandag erna',
    intro: 'Vergelijk vakantiehuizen voor de kerstdagen, met aankomst op kerstavond. Je ziet per park de totaalprijs voor het hele kerstverblijf.',
  },
  {
    slug: 'oud-en-nieuw',
    path: '/feestdag/oud-en-nieuw',
    emoji: '🎆',
    name: 'Oud en nieuw',
    heading: 'Oud en nieuw op een vakantiepark',
    title: (year) => `Oud en nieuw ${year} op een vakantiepark`,
    stay: (year) => untilMonday(`${year}-12-31`),
    stayName: 'van oudejaarsdag tot de maandag erna',
    intro: 'Het nieuwe jaar beginnen op een vakantiepark: met familie of vrienden in een huisje, of juist rustig op een park zonder vuurwerk.',
    theme: 'vuurwerkvrij',
  },
  {
    slug: EASTER_SLUG,
    path: '/feestdag/pasen',
    emoji: '🐣',
    name: 'Pasen',
    word: 'Pasen',
    heading: 'Vakantiehuis met Pasen',
    title: (year) => `Vakantiehuis met Pasen ${year}`,
    titleSuffix: 'Prijzen en beschikbaarheid',
    stay: easterStay,
    stayName: 'van Goede Vrijdag tot de dinsdag na Pasen',
    intro: 'Vergelijk vakantiehuizen op een vakantiepark, van Goede Vrijdag tot de dinsdag na Pasen.',
  },
  {
    slug: 'pinksteren',
    path: '/feestdag/pinksteren',
    emoji: '🌼',
    name: 'Pinksteren',
    word: 'Pinksteren',
    heading: 'Vakantiepark met Pinksteren',
    title: (year) => `Vakantiepark met Pinksteren ${year}`,
    stay: (year) => ({ arrival: shiftDays(easter(year), 47), departure: shiftDays(easter(year), 51) }),
    stayName: 'van de vrijdag voor Pinksteren tot de dinsdag erna',
    intro: 'Vergelijk vakantiehuizen voor het lange pinksterweekend, van vrijdag tot dinsdag. Bekijk per land hoeveel parken er plek hebben en wat het goedkoopste verblijf kost.',
  },
];
const MONDAY = 1;
const FRIDAY = 5;
/**
 * From a day to the Monday after, three nights at least: the Christmas and New Year stay.
 * shortcut: seen for 2026 only, when both begin on a Thursday; check again once another year's come within the
 * rounds' reach.
 */
function untilMonday(arrival) {
  const earliest = shiftDays(arrival, 3);
  return { arrival, departure: shiftDays(earliest, (MONDAY - day(earliest).getUTCDay() + 7) % 7) };
}
const holidayStay = (holiday, year) => holiday.stay(year);
/** The coming holiday's year: this year's until its stay has begun, then next year's. */
const holidayYear = (holiday, today) => {
  const year = Number(today.slice(0, 4));
  return [year - 1, year, year + 1].find((candidate) => holidayStay(holiday, candidate).arrival >= today);
};
/** The stays of the coming holidays, which the rounds collect for the holiday pages. */
export const upcomingHolidayStays = (today) => [
  ...HOLIDAYS.map((holiday) => ({ slug: holiday.slug, ...holidayStay(holiday, holidayYear(holiday, today)) })),
  ...SEASONS.filter((season) => season.stay).map((season) => ({ slug: season.slug, ...season.stay(seasonYear(season, today)) })),
];
/**
 * Times people look for a park for that the ordinary weekends cover: a page each, at an address that stays from year
 * to year, with the weekends a weekend occasion (shared/occasions.mjs) marks as theirs.
 * @property matches whether an occasion's label is this one's, e.g. "Voorjaarsvakantie Zuid"
 * @property until the last day (month-day) of the season's time of year; after it the page is about next year
 * @property stay a longer stay parks rent out for it besides the weekends, which the rounds collect like a holiday's
 */
const SEASONS = [
  {
    slug: 'voorjaarsvakantie',
    path: '/vakantie/voorjaarsvakantie',
    emoji: '🌷',
    name: 'Voorjaarsvakantie',
    heading: 'Vakantiepark in de voorjaarsvakantie',
    title: (year) => `Vakantiepark voorjaarsvakantie ${year}`,
    matches: (label) => label.startsWith('Voorjaarsvakantie'),
    until: '03-15',
    intro: 'Kies het weekend waarin jouw schoolregio vrij is. Vergelijk per weekend hoeveel vakantieparken plek hebben en wat je minimaal betaalt voor het hele verblijf.',
  },
  {
    slug: 'carnaval',
    path: '/feestdag/carnaval',
    emoji: '🎭',
    name: 'Carnaval',
    heading: 'Vakantiepark met carnaval',
    title: (year) => `Vakantiepark met carnaval ${year}`,
    matches: (label) => label === 'Carnaval',
    until: '03-15',
    intro: 'Carnaval vieren in Limburg of Brabant, of er juist even tussenuit naar een rustig park.',
  },
  {
    slug: 'meivakantie',
    path: '/vakantie/meivakantie',
    emoji: '☀️',
    name: 'Meivakantie',
    heading: 'Vakantiepark in de meivakantie',
    title: (year) => `Vakantiepark meivakantie ${year}`,
    matches: (label) => label.startsWith('Meivakantie'),
    until: '05-25',
    intro: 'Er even tussenuit in de meivakantie: hieronder per weekend welke parken nog plek hebben en wat het kost.',
  },
  {
    slug: 'hemelvaart',
    path: '/feestdag/hemelvaart',
    emoji: '🚲',
    name: 'Hemelvaart',
    word: 'Hemelvaart',
    heading: 'Vakantiepark met Hemelvaart',
    title: (year) => `Vakantiepark met Hemelvaart ${year}`,
    matches: (label) => label === 'Na Hemelvaart',
    until: '06-10',
    // Asked 19-11-2026: Topparken and Molecaten rent this out rather than the weekend, Landal both.
    stay: (year) => ({ arrival: shiftDays(easter(year), 38), departure: shiftDays(easter(year), 43) }),
    stayName: 'van de woensdag voor Hemelvaart tot de maandag erna',
    intro: 'Hemelvaartsdag valt altijd op donderdag. Hieronder het lange weekend eromheen, en het gewone weekend dat erop volgt, van vrijdag tot maandag.',
  },
  {
    slug: 'herfstvakantie',
    path: '/vakantie/herfstvakantie',
    emoji: '🍂',
    name: 'Herfstvakantie',
    heading: 'Vakantiepark in de herfstvakantie',
    title: (year) => `Vakantiepark herfstvakantie ${year}`,
    matches: (label) => label.startsWith('Herfstvakantie'),
    until: '11-05',
    intro: 'Uitwaaien in de herfstvakantie. Die valt niet overal in dezelfde week: hieronder per weekend welke regio vrij is en welke parken nog plek hebben.',
  },
  {
    slug: 'zomervakantie',
    path: '/vakantie/zomervakantie',
    emoji: '🏖️',
    name: 'Zomervakantie',
    heading: 'Vakantiepark in de zomervakantie',
    title: (year) => `Vakantiepark zomervakantie ${year}`,
    matches: (label) => label.startsWith('Zomervakantie'),
    until: '09-05',
    intro: 'Een lang weekend weg in de zomervakantie. Die begint niet overal tegelijk: hieronder per weekend welke regio vrij is en welke parken nog plek hebben.',
  },
  {
    slug: 'kerstvakantie',
    path: CHRISTMAS_BREAK_PATH,
    emoji: '⛄',
    name: 'Kerstvakantie',
    heading: 'Vakantiepark in de kerstvakantie',
    title: (year) => `Vakantiepark kerstvakantie ${year}`,
    matches: (label) => label.startsWith('Kerstvakantie'),
    // The year the holiday begins in: its January weekends are left to the Christmas and New Year pages.
    until: '12-31',
    intro: 'Kies een weekend van vrijdag tot maandag in de kerstvakantie. Vergelijk de beschikbare parken en totaalprijzen per weekend.',
  },
];
const seasonYear = (season, today) => Number(today.slice(0, 4)) + (today.slice(5) > season.until ? 1 : 0);

// A holiday's or season's name inside a sentence: lower case, but for the ones Dutch writes with a capital.
const inText = (occasion) => occasion.word ?? occasion.name.toLowerCase();
/** The holidays and seasons that come first, for the app to point to under its title: [{ path, emoji, label }]. */
export function upcomingOccasionLinks(today, limit = 4) {
  const dated = [
    ...HOLIDAYS.map((holiday) => [holidayStay(holiday, holidayYear(holiday, today)).arrival, holiday]),
    ...SEASONS.map((season) => [`${seasonYear(season, today)}-${season.until}`, season]),
  ];
  return dated
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, limit)
    .map(([, occasion]) => ({ path: occasion.path, emoji: occasion.emoji, label: occasion.name }));
}

const holidayChip = (holiday) =>
  html`<a href="${holiday.path}" class="${chip}"><span aria-hidden="true">${holiday.emoji}</span> ${holiday.heading}</a>`;

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
/** When a price was last seen at its provider, as a small line under it; nothing for a price without a time. */
const checkedLine = (offer) =>
  offer?.observedAt && html`<p class="text-xs text-ink-muted">Prijs gecontroleerd op ${updatedAt.format(new Date(offer.observedAt))}</p>`;
/** "6–9 november 2026", or "30 oktober – 2 november 2026" across months. */
export const weekendRange = ({ arrival, departure }) => longDate.formatRange(day(arrival), day(departure));

/** "a, b en c" */
// The longest of a title's wordings that a search result still shows in full; the last one if none does.
const fitting = (...titles) => titles.find((title) => title.length <= TITLE_MAX) ?? titles.at(-1);
/** A description cut back to whole sentences that a search result shows in full; as it is when its first is too long. */
function fittingDescription(description) {
  if (description.length <= DESCRIPTION_MAX) return description;
  const sentences = description.match(/[^.?!]+[.?!]+(?=\s|$)\s*/g) ?? [description];
  let kept = '';
  for (const sentence of sentences) {
    if ((kept + sentence).trimEnd().length > DESCRIPTION_MAX) break;
    kept += sentence;
  }
  return kept.trimEnd() || description;
}
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
/** A brand's own list, of all its parks or of those in one region or country: people search "roompot zeeland". */
const brandPath = (brand, place) => `/aanbieder/${slugify(brandName(brand))}${place ? `/${slugify(place)}` : ''}`;

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

/** What makes a region or country worth a weekend, in its own words; its figures follow as tiles. */
const PLACE_INTROS = {
  Zeeland:
    'Strand, duinen en de Deltawerken: Zeeland is dé provincie voor een weekend aan zee. De parken liggen aan de Noordzeekust van Walcheren, Schouwen-Duiveland en Zeeuws-Vlaanderen, of aan de Oosterschelde en het Grevelingenmeer.',
  Veluwe:
    'Het grootste aaneengesloten natuurgebied van Nederland: bossen, heide en stuifzanden, met herten en wilde zwijnen. Ideaal om te wandelen en te fietsen, met Paleis Het Loo en het Kröller-Müller Museum op de Veluwe zelf.',
  Gelderland:
    'De bossen en heide van de Veluwe, de rivieren en boomgaarden van de Betuwe en het coulissenlandschap van de Achterhoek: Gelderland is groot en afwisselend.',
  Drenthe:
    'Rust, ruimte en hunebedden: Drenthe is de provincie van bossen, heidevelden en brinkdorpen. Veel parken liggen op of rond de Hondsrug, met fietspaden vanaf de voordeur.',
  Limburg:
    'Heuvels, vakwerkhuizen en het Bourgondische leven: Zuid-Limburg voelt bijna als buitenland. In Noord- en Midden-Limburg wachten bossen, vennen en de Maas.',
  'Noord-Brabant':
    'Bossen, vennen en heide in de Kempen, de Peel en rond de Loonse en Drunense Duinen, en gezelligheid in de Brabantse dorpen en steden.',
  'Noord-Holland':
    'Duinen, brede stranden en polders: veel parken liggen vlak bij de Noordzeekust, andere aan het IJsselmeer of het Markermeer. Amsterdam en Alkmaar zijn nooit ver.',
  'Zuid-Holland':
    'Strand en duinen aan de kust en veel water op de Zuid-Hollandse eilanden, met steden als Den Haag, Leiden en Rotterdam binnen bereik.',
  Friesland: 'Water, weidse luchten en elf steden: Friesland is het land van meren, zeilen en fietsen langs terpdorpen.',
  Groningen: 'Wierdendorpen, het wad en de stad Groningen: rustig, weids en verrassend gevarieerd.',
  Overijssel:
    'Het glooiende Twente, het Vechtdal en de Sallandse Heuvelrug: Overijssel is bos, heide en kleine rivieren, met Giethoorn als bekendste dorp.',
  Utrecht: 'De Utrechtse Heuvelrug met bossen, landgoederen en kastelen, midden in het land en vanuit heel Nederland goed bereikbaar.',
  Waddeneilanden:
    'Eilandgevoel: na de bootoversteek wachten brede stranden, duinen en vogels. Elk Waddeneiland heeft een eigen karakter, van levendig Texel tot rustig Schiermonnikoog.',
  Texel: 'Het grootste Waddeneiland: strand, duinen, schapen en zeehonden. De boot vanuit Den Helder doet er ongeveer twintig minuten over.',
  Ameland: 'Duinen, brede stranden en vier karakteristieke dorpen. De boot vanuit Holwerd brengt je er in zo’n drie kwartier.',
  Ardennen:
    'Diepe dalen, rivieren en uitgestrekte bossen: de Belgische Ardennen zijn ideaal om te wandelen en te kajakken, met stadjes als Durbuy en La Roche-en-Ardenne.',
  Moezel: 'Wijnranken op steile hellingen, kastelen en het slingerende Moezeldal: een weekend voor wandelaars en wijnliefhebbers.',
  Vorarlberg: 'Het westelijkste deel van Oostenrijk, tussen de Bodensee en de Alpen: in de zomer om te wandelen, in de winter om te skiën.',
  Jutland: 'Het Deense vasteland: lange Noordzeestranden, duinen en veel rust. Met de auto goed te bereiken.',
  Cornwall: 'Ruige kliffen, kleine vissersdorpjes en surfstranden in het zuidwesten van Engeland.',
  'Lake District': 'Meren, bergen en wandelpaden in het noordwesten van Engeland, in een van de mooiste nationale parken van het land.',
  Yorkshire: 'De heidevelden van de Moors, de groene Dales en historische stadjes als York en Whitby in het noorden van Engeland.',
  Nederland:
    'Van de Waddeneilanden tot Zuid-Limburg: in Nederland ben je nooit ver van een vakantiepark. Ideaal voor een weekend zonder lange reis.',
  Duitsland: 'Van Bad Bentheim vlak over de grens tot het Beierse Woud. Vergelijk vakantieparken per streek, zie hoe ver ze van Nederland liggen en bekijk wat hetzelfde weekend kost.',
  België: 'Dichtbij en toch echt weg: de Belgische parken liggen vooral in de Ardennen, met bossen, rivieren en heuvels.',
  Oostenrijk: 'Bergen, meren en frisse lucht: in de winter om te skiën, in de zomer om te wandelen en te fietsen.',
  Denemarken: 'Lange stranden, duinen en hygge: Denemarken is rustig, ruim en kindvriendelijk.',
  'Verenigd Koninkrijk':
    'Van de kliffen van Cornwall tot de meren van het Lake District en de Schotse Hooglanden: verder weg, maar op bijzondere plekken.',
};
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
// A link that stands on its own, in a menu or a row: high enough to hit (24 pixels, WCAG 2.5.8).
const navLink = `${link} inline-flex min-h-6 items-center`;
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
  html`<h2 id="${id}" class="flex scroll-mt-20 items-center gap-2 text-2xl font-black"><span aria-hidden="true">${emoji}</span>${text}</h2>`;

/** Landal's photos come in any width; the big one on top of a park's page asks for a sharp one. */
// Only widths Landal has a name for: any other gets the original back, two thousand pixels wide and close to a megabyte.
const HERO_WIDTHS = [480, 800, 1200];
const largePhoto = (url) => url?.replace(/([?&]t=)cw\d+/, `$1cw${HERO_WIDTHS.at(-1)}`) ?? null;
/**
 * The photo on top of a park's page: asked for first, as it is the largest thing on screen, and in a width that fits
 * the screen where the provider serves widths (a phone took over six seconds for the widest one).
 */
function heroPhoto(url, alt) {
  const sized = /([?&]t=)cw\d+/.test(url);
  const widths = sized && new Html(` srcset="${HERO_WIDTHS.map((width) => `${escapeHtml(url.replace(/([?&]t=)cw\d+/, `$1cw${width}`))} ${width}w`).join(', ')}" sizes="(min-width: 1024px) 976px, 100vw"`);
  return html`<img src="${largePhoto(url)}"${widths} alt="${alt}" fetchpriority="high" class="aspect-[16/9] w-full rounded-[2rem] bg-line object-cover sm:aspect-[5/2]" />`;
}

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

const POPULAR_NOTE = `Veel aangeklikt op ${SITE_NAME} in de afgelopen 7 dagen.`;
/** Parks visitors clicked through to most this week (see popularParks in server/overview.mjs). */
const popularBadge = (park, classes = '') =>
  park.popular > 0 && html`<span class="rounded-full bg-cta-wash px-2.5 py-0.5 text-xs font-extrabold whitespace-nowrap text-ink ${classes}" title="${POPULAR_NOTE}"><span aria-hidden="true">🔥</span> Populair</span>`;

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

const bookingExplanation = (park) => {
  const note = bookingBrandNote(park);
  return note === '' ? '' : html`<p class="text-xs text-ink-secondary">${note}</p>`;
};

const priceComparison = (park) =>
  park.baselineCents > 0 && html`<p class="text-xs text-ink-secondary">Gebruikelijk bij dit park ${formatEuros(park.baselineCents)}</p>`;

/** The provider's own page of a park through the tracked link, for a park without a free weekend to book. */
const trackedParkUrl = (park, source) =>
  (park.url ?? park.pricesUrl) && `/api/go?${new URLSearchParams({ url: park.url ?? park.pricesUrl, park: park.code, from: source })}`;
const ctaLink = (href, label, provider) =>
  html`<a href="${href}" target="_blank" rel="sponsored noopener" class="inline-flex shrink-0 items-center justify-center rounded-full bg-cta px-5 py-2.5 font-extrabold text-on-cta shadow-sm transition hover:bg-cta-hover hover:shadow-md">${label}<span class="sr-only"> (opent ${provider} in een nieuw tabblad)</span></a>`;

/**
 * A booking bar that stays in view at the bottom of the screen while reading a page, and settles at its end: a
 * weekend with its booking link, or the provider's page of a park without a free weekend.
 * @param named whether to name the park: on a page of many parks, the bar holds its best deal
 */
function bookingBar(park, weekend, { source = 'parkbalk', party = PAGE_PARTY, named = false, afterOfferSeen = false } = {}) {
  if (!park) return '';
  const provider = providerName(park.provider);
  const parkUrl = trackedParkUrl(park, source);
  if (!weekend && !parkUrl) return '';
  const bar = 'sticky bottom-3 z-20 mt-10 flex items-center gap-3 rounded-full bg-surface/95 py-2 pr-2 pl-5 shadow-lg ring-1 ring-line backdrop-blur';
  if (!weekend) {
    return html`<div class="${bar}"><p class="min-w-0 flex-1 text-sm font-bold">Andere datums of meer personen?</p>${ctaLink(parkUrl, `Bekijk bij ${provider}`, provider)}</div>`;
  }
  const percent = discountPercent(weekend);
  return html`<div ${afterOfferSeen && new Html('data-last-minute-booking hidden')} class="${bar}">
    <div class="min-w-0 flex-1 leading-tight">
      <p class="flex flex-wrap items-center gap-x-2"><span class="text-xl font-black tabular-nums">${formatEuros(weekend.priceCents)}</span>${percent >= NOTEWORTHY_PERCENT && html`<span class="rounded-full bg-sun px-2 py-0.5 text-xs font-black whitespace-nowrap text-on-sun">${percent}% voordeliger</span>`}</p>
      <p class="truncate text-xs font-semibold text-ink-secondary">${named && html`<span class="font-extrabold text-ink">${fullName(park)}</span> · `}${formatWeekend(weekend)} · ${partyLabel(party)}</p>
    </div>
    ${bookButton(park, weekend, source, party)}
  </div>`;
}

/** The parks visitors clicked through to most this week, as cards; nothing while none reached the threshold. */
function popularSection(parks, { pathOf, id = 'popular' }) {
  const popular = parks.filter((park) => park.popular && park.weekends.length).sort((a, b) => b.popular - a.popular).slice(0, LAST_MINUTE_CARDS);
  if (!popular.length) return '';
  return html`<section aria-labelledby="${id}" class="mt-10">
    ${sectionTitle(id, '🔥', 'Populair deze week')}
    <p class="mt-1 text-sm text-ink-secondary">${POPULAR_NOTE}</p>
    <ul class="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">${popular.map((park) => parkCard(park, { pathOf, source: 'populair' }))}</ul>
  </section>`;
}

/** The best deal among parks for a page's booking bar: its biggest deal, or else its cheapest weekend. */
const bestOf = (parks) => byDeal(parks.filter((park) => park.weekends.length))[0] ?? null;
const bestBar = (parks, options) => {
  const park = bestOf(parks);
  return park ? bookingBar(park, featuredWeekend(park), { ...options, named: true }) : '';
};

// JSON inside a script tag: no HTML escaping, but no "<" that could close the tag either.
const jsonLd = (data) => html`<script type="application/ld+json">${new Html(JSON.stringify(data).replaceAll('<', '\\u003c'))}</script>`;

/**
 * The trail above a page, also as structured data so search results can show it.
 * @param current the page's own name, last in the trail
 * @param trail [href, label] pairs leading up to the page
 */
function breadcrumb(current, ...trail) {
  const items = [...trail.map(([href, name]) => ({ name, item: `${SITE_URL}${href}` })), { name: current }];
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, ...item })),
  };
  return html`<nav aria-label="Kruimelpad" class="text-sm font-semibold text-ink-secondary">${trail.map(([href, label]) => html`<a href="${href}" class="${link}">${label}</a> › `)}</nav>${jsonLd(data)}`;
}

/**
 * A park's weekends as schema.org sees something with a price, so a search result can show "vanaf". No rating: the
 * stars are Google's own, which its rules keep out of a site's markup.
 */
function parkOfferData(park, path) {
  const prices = park.weekends.map((weekend) => weekend.priceCents);
  const amount = (cents) => (cents / 100).toFixed(2);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `Weekendje weg bij ${fullName(park)}`,
    description: `Een weekend van vrijdag tot maandag bij ${fullName(park)}${placeOf(park) ? ` in ${placeOf(park)}` : ''}, voor ${partyLabel(PAGE_PARTY)}, inclusief toeslagen.`,
    image: park.imageUrl ?? undefined,
    brand: { '@type': 'Brand', name: providerName(park.provider) },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'EUR',
      lowPrice: amount(Math.min(...prices)),
      highPrice: amount(Math.max(...prices)),
      offerCount: prices.length,
      availability: 'https://schema.org/InStock',
      url: `${SITE_URL}${path}`,
    },
  };
}

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

/**
 * The banner on top of a holiday's or season's page, in its own colours and drawing (server/occasion-art.mjs).
 * @param status what the page found, under the intro
 */
function occasionBanner(occasion, { year, status, summary = html`<p class="mt-3 max-w-3xl font-semibold opacity-90">${status}</p>` }) {
  const art = OCCASION_ART[occasion.slug];
  return html`<div class="relative overflow-hidden rounded-[2rem] px-6 pt-6 sm:px-8 sm:pt-8" style="background: ${art.background}; color: ${art.ink}">
    <svg aria-hidden="true" class="pointer-events-none absolute inset-0 h-full w-full"><defs><pattern id="occasion-pattern" width="120" height="120" patternUnits="userSpaceOnUse">${new Html(art.pattern)}</pattern></defs><rect width="100%" height="100%" fill="url(#occasion-pattern)" opacity="${art.patternOpacity}" /></svg>
    <div class="relative">
      <h1 class="text-3xl font-black tracking-tight sm:text-5xl">${occasion.heading} <span class="inline-block -rotate-1 rounded-2xl px-2" style="background: ${art.sticker.background}; color: ${art.sticker.ink}">${year}</span></h1>
      <p class="mt-3 max-w-3xl text-lg leading-relaxed font-semibold">${occasion.intro}</p>
      ${summary}
    </div>
    <svg aria-hidden="true" class="relative -mx-6 mt-6 block h-16 w-[calc(100%+3rem)] sm:-mx-8 sm:h-24 sm:w-[calc(100%+4rem)]" viewBox="0 0 1200 120" preserveAspectRatio="xMidYMax slice">${new Html(art.band)}</svg>
  </div>`;
}

/**
 * Who took the outings' photos and under which license, as their CC BY-SA licenses ask: together at the end of the
 * page, folded away, rather than under every photo.
 */
function photoCredits(places) {
  const credited = places.filter((spot) => spot.image);
  if (!credited.length) return '';
  return html`<details class="mt-10 text-xs text-ink-muted">
    <summary class="cursor-pointer py-1 font-semibold">Fotobronnen</summary>
    <ul class="mt-2 space-y-1">${credited.map(
      (spot) => html`<li>${spot.name}: <a href="${spot.image.page}" class="hover:underline" rel="nofollow">${[spot.image.author, spot.image.license].filter(Boolean).join(', ')}</a></li>`,
    )}</ul>
  </details>`;
}

// Wikimedia's thumbnails come in fixed widths: a small one is enough for a photo shown at 5 rem.
const smallPhoto = (url) => url.replace('/500px-', '/250px-');

/** An outing near a park as a compact row: a small photo (or its picture when it has none), what and how far. */
function placeRow(spot, { showDistance = true } = {}) {
  // Wikidata often describes a place by its kind alone ("pretpark"): then the kind says it already.
  const description = spot.description && spot.description.toLowerCase() !== spot.kind.toLowerCase() ? spot.description : null;
  const emoji = PLACE_ICONS[spot.kind] ?? '📍';
  return html`<li class="flex gap-3 rounded-2xl bg-surface p-2 pr-3 ring-1 ring-line">
    ${
      spot.image
        ? html`<img src="${smallPhoto(spot.image.url)}" alt="${spot.name}" loading="lazy" decoding="async" class="size-20 shrink-0 rounded-xl bg-line object-cover" />`
        : html`<div aria-hidden="true" class="grid size-20 shrink-0 place-items-center rounded-xl bg-accent-wash text-3xl">${emoji}</div>`
    }
    <div class="min-w-0 flex-1 py-0.5">
      <p class="text-xs font-extrabold text-ink-secondary"><span aria-hidden="true">${emoji}</span> ${spot.kind}${showDistance && ` · ${spot.km.toLocaleString('nl-NL')} km`}</p>
      <h3 class="leading-snug font-extrabold">${spot.name}</h3>
      ${description && html`<p class="line-clamp-1 text-sm text-ink-secondary">${description}</p>`}
    </div>
  </li>`;
}

/** The weekend a list shows for a park: its biggest deal, or its cheapest weekend when it has no deal. */
const featuredWeekend = (park) => {
  const deal = park.weekends.reduce((best, weekend) => (!best || discountPercent(weekend) > discountPercent(best) ? weekend : best), null);
  return deal && discountPercent(deal) >= NOTEWORTHY_PERCENT ? deal : cheapestOf(park.weekends);
};

/** Biggest deal first, then the cheapest; parks without a free weekend last. */
function byDeal(parks) {
  const keyed = parks.map((park) => {
    const weekend = featuredWeekend(park);
    return { park, deal: weekend && discountPercent(weekend) >= NOTEWORTHY_PERCENT ? discountPercent(weekend) : 0, price: weekend?.priceCents ?? Infinity };
  });
  return keyed.sort((a, b) => b.deal - a.deal || a.price - b.price).map(({ park }) => park);
}

/**
 * A park as a card on the region and theme pages: photo, place, its biggest deal (or cheapest weekend) and a way to
 * book it.
 * @param showStay the accommodation behind the price instead of the park: for a series with a requirement
 */
function parkCard(park, { pathOf, source, party = PAGE_PARTY, showStay = false, hidden = false }) {
  const shown = featuredWeekend(park);
  const cheapest = cheapestOf(park.weekends);
  const stay = showStay && shown && park.accommodations?.[shown.accommodationCode];
  const image = stay?.photos?.[0] ?? park.imageUrl;
  // A name that is only a code ("LU4") tells a visitor nothing; then the photo says it.
  const stayName = /[a-z]/.test(stay?.name ?? '') ? stay.name : null;
  // What the list's sort menu sorts on (see sortScript): the deal and price shown, the rating and the name.
  const sortKeys = {
    'data-deal': shown && discountPercent(shown) >= NOTEWORTHY_PERCENT ? discountPercent(shown) : 0,
    'data-price': cheapest?.priceCents ?? NO_PRICE,
    'data-rating': park.googleRating?.rating ?? 0,
    'data-name': fullName(park),
  };
  return html`<li class="${card} flex flex-col transition hover:-translate-y-0.5 hover:shadow-lg" ${new Html(Object.entries(sortKeys).map(([key, value]) => `${key}="${escapeHtml(value)}"`).join(' '))}${hidden && new Html(' hidden')}>
    <div class="relative">${image && photo(image, stayName ? `${stayName} bij ${fullName(park)}` : fullName(park))}${photoSticker(shown)}${popularBadge(park, 'absolute top-3 right-3 shadow-sm')}</div>
    <div class="flex flex-1 flex-col gap-1 p-4">
      <a href="${pathOf(park)}" class="text-lg font-extrabold hover:underline">${fullName(park)}</a>
      <p class="flex flex-wrap gap-x-2 text-sm text-ink-secondary"><span><span aria-hidden="true">📍</span> ${placeOf(park)}</span>${rating(park)}</p>
      ${stayName && html`<p class="text-sm font-bold"><span aria-hidden="true">🏡</span> ${stayName}</p>`}
      ${
        shown
          ? html`<p class="mt-auto pt-3 text-3xl font-black tabular-nums">${formatEuros(shown.priceCents)}</p>
            ${priceComparison(park)}
            <p class="text-xs font-semibold text-ink-secondary">${formatWeekend(shown)} · ${partyLabel(party)}</p>
            ${checkedLine(shown)}
            ${cheapest !== shown && html`<p class="text-xs font-bold text-ink-secondary">Of vanaf ${formatEuros(cheapest.priceCents)} op ${formatWeekend(cheapest)}</p>`}
            <div class="mt-3 space-y-1">${bookingExplanation(park)}${bookButton(park, shown, source, party)}</div>`
          : html`<p class="mt-auto pt-3 text-sm text-ink-secondary">Geen vrij weekend voor ${partyLabel(party)} in de komende maanden</p>`
      }
    </div>
  </li>`;
}

/** One park's offer for one weekend as a card: the weekend and last-minute pages. */
const offerCard = ({ park, weekend: offer }, { pathOf, source, bookingTrigger = false }) =>
  html`<li class="${card} flex flex-col transition hover:-translate-y-0.5 hover:shadow-lg">
    <div class="relative">${park.imageUrl && photo(park.imageUrl, fullName(park))}${photoSticker(offer)}${popularBadge(park, 'absolute top-3 right-3 shadow-sm')}</div>
    <div class="flex flex-1 flex-col gap-2 p-4">
      <a href="${pathOf(park)}" class="text-lg font-extrabold hover:underline">${fullName(park)}</a>
      <span class="text-sm text-ink-secondary"><span aria-hidden="true">📍</span> ${placeOf(park)}</span>
      <p ${bookingTrigger && new Html('data-last-minute-offer')} class="mt-auto text-3xl font-black tabular-nums">${formatEuros(offer.priceCents)}</p>
      ${priceComparison(park)}
      ${checkedLine(offer)}
      ${offer.weather && html`<p>${weatherChip(offer.weather)}</p>`}
      ${bookingExplanation(park)}
      ${bookButton(park, offer, source)}
    </div>
  </li>`;

/** One park's offer as a row of a long list: the weekend and holiday pages. */
const offerRow = ({ park, weekend: offer }, { pathOf, source }) =>
  html`<li class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-surface p-3 pl-4 ring-1 ring-line">
    <div class="min-w-0 basis-full sm:basis-0 sm:flex-1">
      <a href="${pathOf(park)}" class="${link}">${fullName(park)}</a>
      <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-secondary">${placeOf(park)} ${compared(offer)} ${weatherChip(offer.weather)}</p>
      ${bookingExplanation(park)}
    </div>
    <p class="flex-1 text-xl font-black tabular-nums sm:flex-none">${formatEuros(offer.priceCents)}</p>
    ${bookButton(park, offer, source)}
  </li>`;

// A price no park has, so parks without a free weekend sort last by price.
const NO_PRICE = 999_999_999;

// Sorts a park list in the browser, and shows the rest of it on request. Without JavaScript the list is all there,
// biggest deals first: the noscript style shows the hidden cards and hides the controls.
const sortScript = `(() => {
  const list = document.querySelector('[data-parks]');
  const menu = document.querySelector('[data-sort]');
  const more = document.querySelector('[data-more]');
  let all = false;
  const number = (item, key) => Number(item.dataset[key]);
  const orders = {
    deal: (a, b) => number(b, 'deal') - number(a, 'deal') || number(a, 'price') - number(b, 'price'),
    price: (a, b) => number(a, 'price') - number(b, 'price'),
    rating: (a, b) => number(b, 'rating') - number(a, 'rating') || number(a, 'price') - number(b, 'price'),
    name: (a, b) => a.dataset.name.localeCompare(b.dataset.name, 'nl'),
  };
  const show = () => [...list.children].forEach((item, index) => { item.hidden = !all && index >= ${SHOWN_PARKS}; });
  menu.addEventListener('change', () => { list.append(...[...list.children].sort(orders[menu.value])); show(); });
  more?.addEventListener('click', () => { all = true; show(); more.remove(); });
})();`;

/** The parks as cards, biggest deals first, with a menu to sort them otherwise; the first ones shown, the rest on request. */
function parkList(parks, { pathOf, source, party = PAGE_PARTY, showStay = false }) {
  const sorted = byDeal(parks);
  return html`<div class="mt-8 flex flex-wrap items-center justify-between gap-3" data-sort-controls>
      <p class="font-extrabold">${count(sorted.length, 'park', 'parken')}</p>
      <label class="flex items-center gap-2 text-sm font-bold">Sorteer op
        <select data-sort class="rounded-full bg-surface px-3 py-2 font-bold ring-2 ring-line">
          <option value="deal">Grootste korting</option>
          <option value="price">Laagste prijs</option>
          <option value="rating">Beste beoordeling</option>
          <option value="name">Naam</option>
        </select>
      </label>
    </div>
    <ul data-parks class="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">${sorted.map((park, index) => parkCard(park, { pathOf, source, party, showStay, hidden: index >= SHOWN_PARKS }))}</ul>
    ${sorted.length > SHOWN_PARKS && html`<p class="mt-6 text-center"><button type="button" data-more class="${chip}">Toon alle ${sorted.length} parken</button></p>`}
    <noscript><style>[data-parks] > [hidden] { display: flex !important; } [data-sort-controls] label, [data-more] { display: none !important; }</style></noscript>
    <script>${new Html(sortScript)}</script>`;
}

/** How many people an accommodation sleeps, from "Geschikt voor 4 personen" or Landal's name ("Timber Lodge 4"). */
function sleeps(accommodation) {
  const fact = accommodation.facts.map((text) => text.match(/geschikt voor (\d+) personen/i)).find(Boolean);
  const named = accommodation.name?.match(/\s(\d{1,2})[A-Z]?$/);
  return Number(fact?.[1] ?? named?.[1]) || null;
}

const PARK_INTROS = new Map([
  // https://www.landal.nl/parken/hoog-vaals and /accommodaties/12lt
  [
    'HVS',
    'Hoog Vaals past bij gezinnen die zwemmen willen afwisselen met een wandeling door het Zuid-Limburgse heuvelland. ' +
      'Het binnenbad heeft een glijbaan van 50 meter en een apart peuterbad. ' +
      'Ga je met meerdere generaties weg, dan is er een extra toegankelijke 12-persoonsbungalow met zes slaapkamers, waaronder een aangepaste slaapkamer, en een aangepaste badkamer. ' +
      'Vanuit Vaals kun je naar het Drielandenpunt op de Vaalserberg of een dag naar Aken.',
  ],
  // https://www.landal.nl/parken/de-lommerbergen and /accommodaties/3cn
  [
    'LGN',
    'Met een baby of peuter is De Lommerbergen in Reuver een praktische keuze. ' +
      'De babybungalow is ingericht voor twee volwassenen en één baby en heeft een ledikant, een commode en een babybad. ' +
      'In het subtropische zwemparadijs is het Kids Junglebad er voor de kleintjes. Wie een snellere glijbaan zoekt, vindt er de Hurri Cone en de Duo-Racer. ' +
      'Buiten het park kun je langs de Maas wandelen of Kasteel De Keverberg in Kessel bezoeken.',
  ],
  // https://www.landal.nl/parken/het-vennenbos/dagrecreatie and /accommodaties/4ck
  // https://www.visitbrabant.com/nl/locaties/1730731140/natuurgebied-cartierheide
  [
    'VBS',
    'Als de kinderen vooral veel willen zwemmen, is Het Vennenbos in Hapert een goede keuze. ' +
      'In het subtropische zwemparadijs kun je zwemmen in het golfslagbad, van de donkere Wild Wave-glijbaan gaan of je laten meevoeren op de wildwaterbaan. ' +
      'De 4-persoons kinderbungalow is geschikt voor twee volwassenen en twee kinderen. Er is speelgoed en de kinderen hebben een eigen kamer met stapelbed. ' +
      'Voor een wandeling buiten het park kun je naar de Cartierheide in de Brabantse Kempen.',
  ],
]);

/** Where the park lies and the accommodation options from the park data. */
function parkSettingIntro(park, accommodations) {
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
  return sentences;
}

function parkPriceIntro(park, weekendCount) {
  if (park.weekends.length === 0) {
    return [];
  }
  const sentences = [];
  if ((park.baselineCents ?? 0) > 0) {
    sentences.push(`Normaal kost een weekend hier voor ${partyLabel(PAGE_PARTY)} rond ${formatEuros(park.baselineCents)}.`);
  }
  const byMonth = [...Map.groupBy(park.weekends, (weekend) => weekend.arrival.slice(0, 7))].map(([month, weekends]) => ({
    month: monthName.format(day(`${month}-01`)),
    average: weekends.reduce((sum, weekend) => sum + weekend.priceCents, 0) / weekends.length,
  }));
  if (byMonth.length > 1) {
    const sorted = byMonth.sort((a, b) => a.average - b.average);
    const [cheapest, dearest] = [sorted[0], sorted.at(-1)];
    if (cheapest.average <= dearest.average * (1 - MONTH_GAP)) {
      sentences.push(`In ${cheapest.month} ben je het voordeligst uit: gemiddeld ${formatEuros(cheapest.average)}, tegen ${formatEuros(dearest.average)} in ${dearest.month}.`);
    }
  }
  sentences.push(`Van de komende ${weekendCount} weekenden ${park.weekends.length === 1 ? 'is er nog 1' : `zijn er nog ${park.weekends.length}`} vrij.`);
  return sentences;
}

function parkIntro(park, { accommodations, weekendCount }) {
  const description = PARK_INTROS.get(park.code);
  const prices = parkPriceIntro(park, weekendCount);
  if (description !== undefined) {
    return html`<div class="mt-8 max-w-3xl space-y-3">
      <p id="park-intro" class="text-lg leading-relaxed">${description}</p>
      ${prices.length > 0 && html`<p class="text-base leading-relaxed text-ink-secondary">${prices.join(' ')}</p>`}
    </div>`;
  }
  const sentences = [...parkSettingIntro(park, accommodations), ...prices];
  return sentences.length > 0 && html`<p class="mt-8 max-w-3xl text-lg leading-relaxed">${sentences.join(' ')}</p>`;
}

// Roompot names Landal as the operator. The swimming facilities, bungalow and map are from Landal's park guide.
function weerterbergenChoice() {
  return html`<section aria-labelledby="weerterbergen-gezin" class="mt-5 max-w-3xl space-y-2">
    <p class="leading-relaxed">Op Roompot vind je dit park in Weert als <strong>Roompot Weerterbergen</strong>. Roompot en Landal horen bij dezelfde organisatie en je boekt Weerterbergen bij Landal.</p>
    <h2 id="weerterbergen-gezin" class="text-lg font-extrabold">Weerterbergen met kinderen</h2>
    <p class="leading-relaxed">Het binnenbad heeft een golfslagbad, een glijbaan en een apart peuterbad. Voor een gezin van vier is Waterbungalow 4 een optie met twee slaapkamers en een terras aan het water.</p>
    <p class="text-sm"><a href="https://www.landal.nl/-/media/files/wrg/wrg_plat.pdf" class="${link}">Bekijk de officiële parkplattegrond (pdf)</a> voor de ligging van het zwembad en de huisjes.</p>
  </section>`;
}

function weekendPriceDifference(priceCents, baselineCents) {
  if ((baselineCents ?? 0) <= 0) {
    return null;
  }
  const normalPrice = wholeEuros(baselineCents);
  const difference = wholeEuros(priceCents) - normalPrice;
  if (difference === 0) {
    return 'Gelijk aan de gebruikelijke prijs';
  }
  const amount = formatEuros(Math.abs(difference) * 100);
  const percent = Math.round(Math.abs(difference) / normalPrice * 100);
  const direction = difference < 0 ? 'goedkoper' : 'duurder';
  return `${amount} ${direction} dan gebruikelijk${percent > 0 ? ` (${percent}%)` : ''}`;
}

function nextParkWeekendCard(park, weekend) {
  const difference = weekendPriceDifference(weekend.priceCents, park.baselineCents);
  return html`<li class="flex flex-col gap-1 rounded-2xl bg-surface p-4 ring-1 ring-line">
    <h3 class="font-extrabold">${formatWeekend(weekend)}</h3>
    <p class="text-2xl font-black tabular-nums">${formatEuros(weekend.priceCents)}</p>
    ${difference !== null && html`<p class="text-sm font-semibold text-ink-secondary">${difference}</p>`}
    ${checkedLine(weekend)}
    <div class="mt-auto pt-2">${bookButton(park, weekend, 'parkpagina')}</div>
  </li>`;
}

function nextParkWeekendsSection(park, weekends) {
  const baseline = (park.baselineCents ?? 0) > 0
    ? `De gebruikelijke weekendprijs is ${formatEuros(park.baselineCents)}, gebaseerd op de weekendprijzen die we bij dit park hebben gemeten.`
    : 'Er zijn nog te weinig prijsmetingen om de gebruikelijke weekendprijs te bepalen.';
  return html`<section aria-labelledby="next-park-weekends" class="mt-6">
    ${sectionTitle('next-park-weekends', '📅', 'Eerstvolgende vrije weekenden')}
    <p class="mt-2 max-w-3xl text-sm text-ink-secondary">Totaalprijzen voor ${partyLabel(PAGE_PARTY)} in het goedkoopste beschikbare huisje, vrijdag tot maandag, inclusief toeslagen. ${baseline}</p>
    <ol class="mt-4 grid gap-3 sm:grid-cols-3">${weekends.map((weekend) => nextParkWeekendCard(park, weekend))}</ol>
    <p class="mt-3 text-sm"><a href="#weekends" class="${link}">Bekijk alle weekendprijzen</a></p>
  </section>`;
}

/** @param themes the themes that have a page, by facility */
/**
 * @param regionPages the regions the park belongs to that have a page, the most specific first
 * @param themes the themes with a page that list this park; `themeOf` those of a single facility, by that facility
 */
function parkPage(park, { pathOf, nearby, today, updated, accommodations, places, weekendCount, regionPages, themes: themePages, themeOf, occasionsOf, holidayOffers = [], brandPages = [] }) {
  const name = fullName(park);
  // People search a park by its town too ("roompot breskens"): the title names it when the park's name does not.
  // As a word of its own: "Weerterbergen" does not name Weert.
  const named = park.city && new RegExp(`(^|[^\\p{L}])${park.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'iu').test(name);
  const located = park.city && !named ? `${name} in ${park.city}` : null;
  const place = placeOf(park);
  const region = regionOf(park);
  const cheapest = cheapestOf(park.weekends);
  const nextWeekends = park.code === 'HSN'
    ? park.weekends.filter(({ arrival }) => arrival >= today).sort((first, second) => first.arrival.localeCompare(second.arrival)).slice(0, NEXT_PARK_WEEKENDS)
    : [];
  const showsNextWeekends = nextWeekends.length > 0;
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
    return html`<li class="inline-flex items-center gap-2 rounded-full bg-surface py-1 pr-3.5 pl-1 text-sm font-bold ring-2 ring-line">${emojiDot(FACILITY_ICONS[option.id], tint)}${theme ? html`<a href="${themePath(theme)}" class="inline-flex min-h-6 items-center hover:text-accent hover:underline">${option.name}</a>` : option.name}</li>`;
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
    ${breadcrumb(name, ['/parken', 'Alle parken'], ...regionPages.slice(0, 1).map((region) => [regionPath(region), region]))}
    ${cheapest && jsonLd(parkOfferData(park, pathOf(park)))}
    ${park.imageUrl && html`<div class="relative mt-3">${heroPhoto(park.imageUrl, name)}${photoSticker(cheapest)}</div>`}
    <h1 class="mt-5 text-4xl font-black tracking-tight sm:text-5xl">${name}</h1>
    <p class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-semibold text-ink-secondary">${place && html`<span><span aria-hidden="true">📍</span> ${place}</span>`}<span>bij ${providerName(park.provider)}</span>${rating(park)}${park.popular > 0 && html`<span class="rounded-full bg-cta-wash px-3 py-1 text-sm font-extrabold text-ink" title="${POPULAR_NOTE}"><span aria-hidden="true">🔥</span> Populair deze week</span>`}</p>
    ${park.code === 'WRN' && weerterbergenChoice()}
    ${showsNextWeekends && nextParkWeekendsSection(park, nextWeekends)}
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
        : html`<div class="mt-6 flex flex-col gap-4 rounded-[2rem] bg-sun-wash p-6 sm:flex-row sm:items-center"><p class="flex-1 font-semibold">Voor ${partyLabel(PAGE_PARTY)} vonden we bij ${name} geen vrij weekend in de komende maanden. Kijk bij ${providerName(park.provider)} voor andere datums, bekijk de parken in de buurt, of <a href="/" class="${link}">zoek een ander weekend</a>.</p>${trackedParkUrl(park, 'parkpagina') && ctaLink(trackedParkUrl(park, 'parkpagina'), `Bekijk bij ${providerName(park.provider)}`, providerName(park.provider))}</div>`
    }
    ${intro}
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
        <ul class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">${places.map((spot) => placeRow(spot))}</ul>
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
    ${
      holidayOffers.length > 0 &&
      html`<section aria-labelledby="holidays" class="mt-10">
        ${sectionTitle('holidays', '🎉', 'Met de feestdagen')}
        <p class="mt-1 text-sm text-ink-secondary">Het verblijf dat de meeste parken met de feestdagen verhuren, voor ${partyLabel(PAGE_PARTY)}: het goedkoopste huisje, inclusief toeslagen.</p>
        <ul class="mt-4 space-y-2">${holidayOffers.map(
          ({ holiday, year, weekend }) => html`<li class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-surface p-3 pl-4 ring-1 ring-line">
            <div class="min-w-0 basis-full sm:basis-0 sm:flex-1"><a href="${holiday.path}" class="${link}"><span aria-hidden="true">${holiday.emoji}</span> ${holiday.name} ${year}</a><p class="text-sm text-ink-secondary">${formatWeekend(weekend)} · ${nights(weekend)} nachten</p>${checkedLine(weekend)}</div>
            <p class="flex-1 text-xl font-black tabular-nums sm:flex-none">${formatEuros(weekend.priceCents)}</p>
            ${bookButton(park, weekend, 'parkpagina')}
          </li>`,
        )}</ul>
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
      (regionPages.length > 0 || themes.length > 0 || brandPages.length > 0) &&
      html`<nav aria-labelledby="more-like" class="mt-10">${sectionTitle('more-like', '✨', 'Meer zoals dit')}<ul class="mt-4 flex flex-wrap gap-2">
        ${regionPages.map((name) => html`<li><a href="${regionPath(name)}" class="${chip}"><span aria-hidden="true">🗺️</span> Alle parken ${inPlace(name)}</a></li>`)}
        ${brandPages.map(([href, label]) => html`<li><a href="${href}" class="${chip}"><span aria-hidden="true">🏷️</span> ${label}</a></li>`)}
        ${themes.map((theme) => html`<li><a href="${themePath(theme)}" class="${chip}"><span aria-hidden="true">${themeIcon(theme)}</span> ${theme.name}</a></li>`)}
      </ul></nav>`
    }
    ${photoCredits(places)}
    ${bookingBar(park, cheapest)}`;

  return {
    path: pathOf(park),
    title: showsNextWeekends
      ? `${name}: vrije weekenden en prijzen`
      : fitting(...(located ? [`${located}: weekendprijzen en aanbiedingen`, `${located}: weekendprijzen`, `${located}: prijzen`] : []), `${name}: weekendprijzen en aanbiedingen`, `${name}: prijzen en aanbiedingen`, `${name}: weekendprijzen`, name),
    description: showsNextWeekends
      ? `Bekijk de eerstvolgende vrije weekenden bij ${name} en vergelijk de totaalprijzen voor ${partyLabel(PAGE_PARTY)}.`
      : cheapest
        ? `Weekendje weg naar ${name}${place ? ` in ${place}` : ''}? Vanaf ${formatEuros(cheapest.priceCents)} voor ${partyLabel(PAGE_PARTY)} (${formatWeekend(cheapest)}). Zie de prijs van elk weekend, wat er te doen is en of je nu moet boeken.`
        : `${name}${place ? ` in ${place}` : ''}: wat er te doen is op het park en in de omgeving, de huisjes en de weekendprijzen voor ${partyLabel(PAGE_PARTY)}.`,
    image: park.imageUrl ?? null,
    body: body.text,
  };
}

function weekendPage(weekend, offers, { pathOf, previous, next, updated, themes, occasions, holidays }) {
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

  const neighbour = (other, label) =>
    other && html`<a href="${weekendPath(other.arrival)}" class="${chip}">${label} ${formatWeekend(other)}</a>`;

  const body = html`
    ${breadcrumb(range, ['/weekenden', 'Alle weekenden'])}
    <div class="mt-3 rounded-[2rem] bg-accent-wash p-6 sm:p-8">
      <h1 class="text-3xl font-black tracking-tight sm:text-5xl">Weekendje weg <span class="inline-block -rotate-1 rounded-2xl bg-sun px-2 text-on-sun">${range}</span></h1>
      <p class="mt-3 max-w-2xl font-semibold text-ink-secondary">${count(offers.length, 'vakantiepark heeft', 'vakantieparken hebben')} nog plek van ${formatWeekend(weekend)} voor ${partyLabel(PAGE_PARTY)}, vanaf ${from}. ${deals.length > 0 && `${dealCount} minstens ${Math.round(DEAL_SHARE * 100)}% goedkoper dan normaal.`}</p>
      ${occasions.length > 0 && html`<p class="mt-4 flex flex-wrap items-center gap-2">${occasionChips(occasions, 'bg-surface')} <span class="font-semibold">${occasions.map((occasion) => occasion.text).join(' ')}</span>${fireworksFree && html` <a href="${themePath(fireworksFree)}" class="${link}">Vuurwerkvrije parken</a>`}</p>`}
      ${holidays.length > 0 && html`<p class="mt-4 flex flex-wrap gap-2">${holidays.map(holidayChip)}</p>`}
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
      <ul class="mt-4 space-y-2">${sorted.slice(0, LISTED_OFFERS).map((offer) => offerRow(offer, { pathOf, source: 'weekendpagina' }))}</ul>
    </section>
    <p class="mt-6"><a href="${appLink}" class="inline-flex items-center gap-2 rounded-full bg-sun-wash px-4 py-2 font-bold transition hover:bg-sun hover:text-on-sun"><span aria-hidden="true">🔎</span> ${sorted.length > LISTED_OFFERS ? `Bekijk alle ${sorted.length} parken van dit weekend, ook voor jouw gezelschap` : 'Met meer personen, kinderen of een hond? Zoek dit weekend voor jouw gezelschap'}</a></p>
    <nav aria-label="Andere weekenden" class="mt-10 flex flex-wrap justify-between gap-4">${neighbour(previous, '←')}${neighbour(next, '→')}</nav>
    ${bookingBar((deals[0] ?? sorted[0]).park, (deals[0] ?? sorted[0]).weekend, { source: 'weekendbalk', named: true })}`;

  return {
    path: weekendPath(weekend.arrival),
    title: fitting(`Weekendje weg ${range}: vakantieparken met plek`, `Weekendje weg ${range}: parken met plek`),
    description: `${count(offers.length, 'vakantiepark', 'vakantieparken')} van Landal, Topparken en Molecaten met plek van ${formatWeekend(weekend)}, voor ${partyLabel(PAGE_PARTY)} vanaf ${from}.${deals.length > 0 ? ` ${dealCount} minstens ${Math.round(DEAL_SHARE * 100)}% goedkoper dan normaal.` : ''}`,
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

/**
 * A list page's figures as tiles: how many parks, from what price, how many deals, and for a region where they lie
 * and which have a pool.
 */
function statTiles(parks, { party = PAGE_PARTY, details = true } = {}) {
  const priced = parks.filter((park) => park.weekends.length);
  const cheapest = cheapestOf(priced.map((park) => cheapestOf(park.weekends)));
  const deals = priced.filter((park) => park.weekends.some((weekend) => (weekend.discount ?? 0) >= DEAL_SHARE)).length;
  const counted = (pairs) =>
    pairs
      .map(([id, label]) => [FACILITY_ICONS[id], parks.filter((park) => park.facilities.includes(id)).length, label])
      .filter(([, number]) => number > 0);
  const tiles = [
    ['🏕️', parks.length, parks.length === 1 ? 'park' : 'parken'],
    cheapest && ['💶', formatEuros(cheapest.priceCents), `vanaf, ${formatWeekend(cheapest)} · ${partyLabel(party)}`],
    deals > 0 && ['🔥', deals, `${deals === 1 ? 'park' : 'parken'} minstens ${Math.round(DEAL_SHARE * 100)}% onder normaal`],
    ...(details ? counted(SETTINGS).sort((a, b) => b[1] - a[1]).slice(0, 2) : []),
    ...(details ? counted([['zwemparadijs', 'met subtropisch zwembad'], ['overdekt-zwembad', 'met binnenzwembad']]) : []),
  ].filter(Boolean);
  return html`<ul class="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">${tiles.map(
    ([emoji, value, label]) =>
      html`<li class="flex min-w-0 items-center gap-2 rounded-2xl bg-surface px-3 py-2 ring-1 ring-line"><span aria-hidden="true" class="text-xl">${emoji}</span><span><span class="block text-lg leading-tight font-black tabular-nums">${value}</span><span class="block text-xs font-semibold text-ink-secondary">${label}</span></span></li>`,
  )}</ul>`;
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

function borderDistanceLabel(distance) {
  if (distance === null) {
    return 'Onbekend';
  }
  if (distance < 1) {
    return 'Minder dan 1 km';
  }
  return `${Math.round(distance)} km`;
}

function germanParkRow({ park, distance }, { pathOf, weekend }) {
  const offer = weekend === null ? null : park.weekends.find(({ arrival, departure }) => arrival === weekend.arrival && departure === weekend.departure);
  return html`<tr class="border-b border-line last:border-b-0">
    <th scope="row" class="px-2 py-3 text-left sm:px-4">
      <a href="${pathOf(park)}" class="${link}">${fullName(park)}</a>
      ${park.city && html`<span class="block text-xs font-normal text-ink-secondary">${park.city}</span>`}
    </th>
    <td class="px-2 py-3 text-right tabular-nums sm:px-4">${borderDistanceLabel(distance)}</td>
    ${weekend !== null && html`<td class="px-2 py-3 text-right font-semibold tabular-nums sm:px-4">${offer ? formatEuros(offer.priceCents) : 'Geen prijs'}</td>`}
  </tr>`;
}

function germanRegionRows([region, rows], options) {
  return html`<tbody>
    <tr class="bg-sun-wash"><th scope="rowgroup" colspan="${options.weekend === null ? 2 : 3}" class="px-2 py-2 text-left font-extrabold sm:px-4">${region}</th></tr>
    ${rows.map((row) => germanParkRow(row, options))}
  </tbody>`;
}

function nearestGermanParks(rows, pathOf) {
  const nearest = rows.filter(({ distance }) => distance !== null).slice(0, 3);
  if (nearest.length === 0) {
    return null;
  }
  return html`<h3 class="mt-5 text-base font-extrabold">Dichtst bij de Nederlandse grens</h3>
    <ul class="mt-2 grid gap-2 sm:grid-cols-3">${nearest.map(({ park, distance }) => html`<li class="rounded-2xl bg-surface p-3 ring-1 ring-line">
      <a href="${pathOf(park)}" class="${link}">${fullName(park)}</a>
      <span class="mt-1 block text-sm text-ink-secondary">${borderDistanceLabel(distance)} tot de grens</span>
    </li>`)}</ul>`;
}

function germanyComparison(parks, { pathOf, today }) {
  const weekend = germanComparisonWeekend(parks, today);
  const rows = parks.map((park) => ({ park, distance: distanceToDutchBorder(park) }));
  rows.sort((first, second) => (first.distance ?? Infinity) - (second.distance ?? Infinity) || first.park.name.localeCompare(second.park.name, 'nl'));
  const regions = Map.groupBy(rows, ({ park }) => germanRegion(park));
  const body = html`<section aria-labelledby="vergelijk-duitsland" class="mt-10">
    ${sectionTitle('vergelijk-duitsland', '📍', 'Vergelijk Duitse vakantieparken per streek')}
    <p class="mt-2 max-w-3xl text-sm text-ink-secondary">De afstand is hemelsbreed gemeten tot het dichtstbijzijnde punt van de Nederlandse landgrens. Per streek staan de dichtstbijzijnde parken eerst.</p>
    ${nearestGermanParks(rows, pathOf)}
    <table class="mt-5 w-full border-separate border-spacing-0 overflow-hidden rounded-2xl bg-surface text-sm ring-1 ring-line">
      <caption class="caption-top px-1 pb-3 text-left text-sm text-ink-secondary">${weekend === null ? 'Parken en afstanden per streek.' : `Totaalprijzen voor ${partyLabel(PAGE_PARTY)}, inclusief toeslagen, ${formatWeekend(weekend)}. ‘Geen prijs’ betekent dat we voor dit weekend geen prijs hebben gevonden.`}</caption>
      <thead class="bg-surface"><tr>
        <th scope="col" class="px-2 py-3 text-left sm:px-4">Vakantiepark</th>
        <th scope="col" class="px-2 py-3 text-right sm:px-4">Afstand tot grens</th>
        ${weekend !== null && html`<th scope="col" class="px-2 py-3 text-right sm:px-4">Weekend&shy;prijs</th>`}
      </tr></thead>
      ${[...regions].map((region) => germanRegionRows(region, { pathOf, weekend }))}
    </table>
  </section>`;
  return {
    body,
    title: 'Vakantieparken Duitsland: prijzen per streek en grensafstand',
    description: `Vergelijk ${count(parks.length, 'vakantiepark', 'vakantieparken')} in Duitsland per streek. Bekijk de afstand tot de Nederlandse grens en prijzen voor hetzelfde weekend.`,
  };
}

// https://www.landal.nl/bestemmingen/nederland/overijssel and the three parks' own guides.
const OVERIJSSEL_PARKS = [
  { code: 'OTK', area: 'Twente', reason: 'Wandel of fiets door het Dinkeldal bij Beuningen.' },
  { code: 'OZL', area: 'Weerribben-Wieden', reason: 'Verken het waterrijke natuurgebied vanuit Ossenzijl.' },
  { code: 'TVD', area: 'Sallandse Heuvelrug', reason: 'Loop vanuit Holten naar het bos en de heide rond de Holterberg.' },
];

function overijsselWeekend(choices, today) {
  const available = new Map();
  for (const { park } of choices) {
    for (const weekend of park.weekends) {
      if (weekend.arrival <= today || day(weekend.arrival).getUTCDay() !== 5 || weekend.departure !== shiftDays(weekend.arrival, 3)) {
        continue;
      }
      const entry = available.get(weekend.arrival) ?? { weekend, prices: new Map() };
      entry.prices.set(park.code, weekend.priceCents);
      available.set(weekend.arrival, entry);
    }
  }
  const sorted = [...available.values()].sort((a, b) => a.weekend.arrival.localeCompare(b.weekend.arrival));
  return sorted.find(({ prices }) => prices.size === choices.length) ?? sorted[0] ?? null;
}

function overijsselParkCard({ park, area, reason }, pathOf, selected) {
  const price = selected?.prices.get(park.code);
  return html`<li class="min-w-0 space-y-1 rounded-2xl bg-surface p-4 ring-1 ring-line">
    <h3 class="font-extrabold">${area}</h3>
    <p><a href="${pathOf(park)}" class="${link}">${fullName(park)}</a></p>
    <p class="text-sm text-ink-secondary">${reason}</p>
    ${selected !== null && html`<p class="pt-1 font-extrabold tabular-nums">${price === undefined ? 'Geen prijs gevonden' : formatEuros(price)}</p>`}
  </li>`;
}

function overijsselComparison(parks, { pathOf, today }) {
  const byCode = new Map(parks.map((park) => [park.code, park]));
  const choices = OVERIJSSEL_PARKS.filter(({ code }) => byCode.has(code)).map((choice) => ({ ...choice, park: byCode.get(choice.code) }));
  if (choices.length < 2) {
    return null;
  }
  const selected = overijsselWeekend(choices, today);
  return { body: html`<section aria-labelledby="vergelijk-overijssel" class="mt-8">
    ${sectionTitle('vergelijk-overijssel', '🗺️', 'Vergelijk vakantieparken per streek')}
    <p class="mt-2 text-sm text-ink-secondary">${selected === null
      ? 'Voor deze selectie hebben we nog geen weekendprijs gevonden.'
      : `${formatWeekend(selected.weekend)}. Totaalprijs van het goedkoopste beschikbare huisje voor ${partyLabel(PAGE_PARTY)}, inclusief verplichte toeslagen.`}</p>
    <ul class="mt-4 grid gap-4 md:grid-cols-3">${choices.map((choice) => overijsselParkCard(choice, pathOf, selected))}</ul>
  </section>` };
}

/**
 * A region's or a country's page: its parks, what they offer and the outings around them.
 * @param place where, as a sentence names it: "op Texel", "in Duitsland"
 * @param links [href, label, count] of the regions inside a country
 */
function placePage(name, parks, { path, place, emoji, pathOf, surroundings, links = [], brand = null, comparison = null }) {
  // A brand's list of all its parks has no place, so no outings nearby.
  const places = place ? regionPlaces(parks, surroundings) : [];
  const label = brand && brandName(brand);
  const where = place ?? `van ${label}`;
  const intro = brand
    ? `Alle ${parks.length} vakantieparken van ${label}${place ? ` ${place}` : ''} naast elkaar, met de prijs van elk komend weekend. ${listIntro(parks).join(' ')}`
    : (PLACE_INTROS[name] ?? `Alle vakantieparken ${place}, met de prijs van elk komend weekend.`);
  const preposition = where.slice(0, where.length - name.length).trim();
  const sources = brand ? ['aanbiederpagina', 'aanbiederbalk'] : ['regiopagina', 'regiobalk'];
  const titled = brand && place ? `${label} ${name}` : brand ? `${label} vakantieparken` : `Vakantiepark ${name}`;
  const body = html`
    ${breadcrumb(brand && place ? `${label} ${place}` : name, ['/parken', 'Alle parken'], ...(brand && place ? [[brandPath(brand), label]] : []))}
    <div class="mt-3">${banner(emoji, html`${brand && place ? label : 'Vakantieparken'} ${preposition} <span class="inline-block -rotate-1 rounded-2xl bg-sun px-2 text-on-sun">${name}</span>`, html`<p class="mt-3 max-w-3xl text-lg leading-relaxed font-semibold">${intro}</p>${statTiles(parks)}`)}</div>
    ${comparison?.body}
    ${links.length > 0 && html`<ul class="mt-6 flex flex-wrap gap-2">${links.map(([href, label, number, icon = '📍']) => html`<li><a href="${href}" class="${chip}"><span aria-hidden="true">${icon}</span> ${label} <span class="text-ink-muted">${number}</span></a></li>`)}</ul>`}
    ${parkList(parks, { pathOf, source: sources[0] })}
    ${
      places.length > 0 &&
      html`<section aria-labelledby="todo" class="mt-10">
        ${sectionTitle('todo', '🎡', `Uitjes ${place}`)}
        <p class="mt-1 text-sm text-ink-secondary">Wat de meeste parken hier in de buurt hebben.</p>
        <ul class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">${places.map((spot) => placeRow(spot, { showDistance: false }))}</ul>
      </section>`
    }
    ${photoCredits(places)}
    ${bestBar(parks, { source: sources[1] })}`;
  return {
    path,
    // People search "vakantiepark Zeeland", not "weekendje weg Zeeland" (Google Trends): the title starts with it.
    title: comparison?.title ?? fitting(`${titled}: alle parken met weekendprijzen`, `${titled}: parken en weekendprijzen`, `${titled}: weekendprijzen`, titled),
    description: comparison?.description ?? `${parks.length} vakantieparken ${brand ? `van ${label}${place ? ` ${place}` : ''}` : place} met de prijs van elk komend weekend. ${listIntro(parks)[0] ?? ''}`.trim(),
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
  const where = regions.length > 0 && html`<p class="mt-3 text-sm font-semibold text-ink-secondary">De meeste liggen in ${joinAnd(regions)}.</p>`;
  const body = html`
    ${breadcrumb(theme.name, ['/parken', 'Alle parken'])}
    <div class="mt-3">${banner(themeIcon(theme), theme.name, html`<p class="mt-3 max-w-3xl text-lg leading-relaxed font-semibold">${theme.intro}</p>${statTiles(parks, { party, details: false })}${where}`, 'bg-sun-wash')}</div>
    ${parkList(parks, { pathOf, source: 'themapagina', party, showStay: theme.showStay })}
    <nav aria-labelledby="other-themes" class="mt-10">${sectionTitle('other-themes', '✨', "Andere thema's")}<ul class="mt-4 flex flex-wrap gap-2">${themes.filter((other) => other !== theme).map(
      (other) => html`<li><a href="${themePath(other)}" class="${chip}"><span aria-hidden="true">${themeIcon(other)}</span> ${other.label}</a></li>`,
    )}</ul></nav>
    ${bestBar(parks, { source: 'themabalk', party })}`;
  return {
    path: themePath(theme),
    title: fitting(`${theme.name}: weekendje weg met de laagste prijzen`, `${theme.name}: laagste weekendprijzen`, `${theme.name}: weekendje weg`, theme.name),
    description: `${theme.name}: ${count(parks.length, 'park', 'parken')} met de prijs van elk komend weekend. ${listIntro(parks, party)[0] ?? ''}`.trim(),
    image: parks.find((park) => park.imageUrl)?.imageUrl ?? null,
    body: body.text,
  };
}

const compareOffersByDiscount = (a, b) =>
  discountPercent(b.weekend) - discountPercent(a.weekend) || a.weekend.priceCents - b.weekend.priceCents;

/** One weekend's best offers as cards with a link to all of them: on the last-minute and holiday pages. */
function weekendSection({ weekend, offers }, { id, emoji, title, source, pathOf, occasions, bookingOffer = null }) {
  // The biggest deals first, then the cheapest: a weekend without deals still shows its best prices.
  const shown = [...offers]
    .sort(compareOffersByDiscount)
    .slice(0, LAST_MINUTE_CARDS);
  const sunny = offers.filter((offer) => offer.weekend.weather).length;
  return html`<section aria-labelledby="${id}" class="mt-10">
    ${sectionTitle(id, emoji, title)}
    <p class="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-secondary">${count(offers.length, 'park', 'parken')} met plek, vanaf ${formatEuros(cheapestOf(offers.map((offer) => offer.weekend)).priceCents)}. ${occasionChips(occasions)}${sunny > 0 && html` <span>Bij ${count(sunny, 'park', 'parken')} zonnig verwacht.</span>`}</p>
    <ul class="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">${shown.map((offer) => offerCard(offer, { pathOf, source, bookingTrigger: offer === bookingOffer }))}</ul>
    <p class="mt-4"><a href="${weekendPath(weekend.arrival)}" class="${chip}">${offers.length === 1 ? 'Bekijk dit weekend' : `Alle ${offers.length} parken van dit weekend`} →</a></p>
  </section>`;
}

const FIGURES_PATH = '/cijfers';
const figuresLink = html`<a href="${FIGURES_PATH}" class="${link}">Wanneer zijn vakantieparken het goedkoopst?</a>`;
// A group with fewer prices says too little to name a middle.
const MIN_FIGURE_PRICES = 20;
const SHOWN_REGIONS = 6;
const monthAndYear = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const middle = (numbers) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[half] : Math.round((sorted[half - 1] + sorted[half]) / 2);
};

/**
 * What the collected prices say: when and where a weekend at a holiday park is cheapest. Every figure is the middle
 * (median) of the cheapest weekend prices per park, so a few dear parks do not pull it up. For whoever writes about
 * holiday parks and looks for a number to quote.
 */
function figuresPage(weekends, { regions, brands, occasionsOf, updated, computedAt }) {
  const offers = weekends.flatMap((entry) => entry.offers);
  const group = (name, list, href = null) => ({ name, href, prices: list.length, cents: list.length ? middle(list.map((offer) => offer.weekend.priceCents)) : 0 });
  const enough = (row) => row.prices >= MIN_FIGURE_PRICES;
  const overall = group('Alle parken', offers);

  // A month counts with at least two of its weekends, so the first and last month are not judged by one weekend.
  const months = [...Map.groupBy(weekends, (entry) => entry.weekend.arrival.slice(0, 7))]
    .filter(([, list]) => list.length > 1)
    .map(([month, list]) => group(monthAndYear.format(new Date(`${month}-01T00:00:00Z`)), list.flatMap((entry) => entry.offers)))
    .filter(enough);
  const byPrice = [...months].sort((a, b) => a.cents - b.cents);
  const [cheapMonth, dearMonth] = [byPrice[0], byPrice.at(-1)];
  const monthsDiffer = cheapMonth && dearMonth && cheapMonth !== dearMonth;

  const kindOf = (weekend) => {
    const labels = occasionsOf(weekend).map((occasion) => occasion.label ?? '');
    return labels.some((label) => /vakantie/i.test(label)) ? 'school' : labels.length ? 'special' : 'plain';
  };
  const kinds = Map.groupBy(offers, (offer) => kindOf(offer.weekend));
  const plain = group('Gewoon weekend', kinds.get('plain') ?? []);
  const school = group('Weekend in een schoolvakantie', kinds.get('school') ?? []);
  const occasions = [plain, group('Weekend met een feestdag of bijzondere dag', kinds.get('special') ?? []), school].filter(enough);

  const inList = (list) => {
    const codes = new Set(list.map((park) => park.code));
    return offers.filter((offer) => codes.has(offer.park.code));
  };
  const cheapestFirst = (a, b) => a.cents - b.cents;
  const regionRows = regions.map(([region, list]) => group(region, inList(list), regionPath(region))).filter(enough).sort(cheapestFirst);
  const brandRows = brands.map(([brand, list]) => group(brandName(brand), inList(list), brandPath(brand))).filter(enough).sort(cheapestFirst);
  const shownRegions = regionRows.length > SHOWN_REGIONS * 2 ? [...regionRows.slice(0, SHOWN_REGIONS), ...regionRows.slice(-SHOWN_REGIONS)] : regionRows;

  const perHundred = (number) => Math.round((number / Math.max(offers.length, 1)) * 100);
  const under = offers.filter((offer) => discountPercent(offer.weekend) >= NOTEWORTHY_PERCENT).length;
  const deals = offers.filter((offer) => (offer.weekend.discount ?? 0) >= DEAL_SHARE).length;
  const more = (dear, cheap) => Math.round((dear.cents / cheap.cents - 1) * 100);
  const parkCount = new Set(offers.map((offer) => offer.park.code)).size;
  const span = weekends.length > 0 ? `${formatDay(weekends[0].weekend.arrival)} tot en met ${formatDay(weekends.at(-1).weekend.departure)}` : '';

  // The bars compare the rows of one table; the number beside each bar is what counts.
  const table = (id, first, rows) => {
    const most = Math.max(...rows.map((row) => row.cents), 1);
    const line = (row) => html`<tr class="border-b border-line last:border-0">
      <th scope="row" class="px-4 py-2.5 font-bold">${row.href ? html`<a href="${row.href}" class="${link}">${row.name}</a>` : row.name}</th>
      <td class="px-4 py-2.5 text-right text-base font-black">${formatEuros(row.cents)}</td>
      <td class="hidden px-4 py-2.5 sm:table-cell"><div aria-hidden="true" class="h-3 rounded-r-full bg-accent" style="width:${Math.max(2, Math.round((row.cents / most) * 100))}%"></div></td>
      <td class="px-4 py-2.5 text-right text-ink-secondary">${row.prices.toLocaleString('nl-NL')}</td>
    </tr>`;
    return html`<div class="mt-4 overflow-x-auto rounded-2xl bg-surface ring-1 ring-line">
      <table class="w-full text-left text-sm" aria-labelledby="${id}">
        <thead class="text-ink-secondary"><tr class="border-b border-line"><th scope="col" class="px-4 py-2.5 font-semibold">${first}</th><th scope="col" class="px-4 py-2.5 text-right font-semibold">Middelste prijs</th><th scope="col" class="hidden w-2/5 px-4 py-2.5 font-semibold sm:table-cell"><span class="sr-only">Vergeleken</span></th><th scope="col" class="px-4 py-2.5 text-right font-semibold">Prijzen</th></tr></thead>
        <tbody class="tabular-nums">${rows.map(line)}</tbody>
      </table>
    </div>`;
  };
  const dataset = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Weekendprijzen van vakantieparken',
    description: `De middelste prijs van een weekend (vrijdag tot maandag) voor ${partyLabel(PAGE_PARTY)} op ${parkCount} vakantieparken, per maand, regio en aanbieder.`,
    url: `${SITE_URL}${FIGURES_PATH}`,
    dateModified: computedAt,
    creator: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    isAccessibleForFree: true,
  };
  const answer = monthsDiffer
    ? `In ${cheapMonth.name}. Een weekend voor ${partyLabel(PAGE_PARTY)} kost dan in het midden ${formatEuros(cheapMonth.cents)}. In ${dearMonth.name}, de duurste maand, is dat ${formatEuros(dearMonth.cents)}: ${more(dearMonth, cheapMonth)}% meer.`
    : `Een weekend voor ${partyLabel(PAGE_PARTY)} kost in het midden ${formatEuros(overall.cents)}.`;
  const schoolLine = enough(school) && enough(plain) && `Een weekend in een schoolvakantie kost ${more(school, plain) >= 0 ? `${more(school, plain)}% meer` : `${-more(school, plain)}% minder`} dan een gewoon weekend.`;
  const body = html`
    ${jsonLd(dataset)}
    ${banner(
      '📊',
      html`Wanneer is een vakantiepark het <span class="inline-block -rotate-1 rounded-2xl bg-sun px-2 text-on-sun">goedkoopst</span>?`,
      html`<p class="mt-3 max-w-3xl text-lg leading-relaxed font-semibold">${answer}</p>
        <p class="mt-3 max-w-3xl leading-relaxed text-ink-secondary">Gemeten over ${offers.length.toLocaleString('nl-NL')} weekendprijzen van ${parkCount} vakantieparken, voor de weekenden van ${span}. Bijgewerkt op ${updated}.</p>`,
    )}
    ${
      months.length > 1 &&
      html`<section aria-labelledby="per-month" class="mt-10">
        ${sectionTitle('per-month', '📅', 'Prijs per maand')}
        <p class="mt-1 max-w-3xl text-sm text-ink-secondary">Een weekend van vrijdag tot maandag, drie nachten, voor ${partyLabel(PAGE_PARTY)}, inclusief toeslagen.</p>
        ${table('per-month', 'Maand', months)}
      </section>`
    }
    ${
      occasions.length > 1 &&
      html`<section aria-labelledby="per-kind" class="mt-10">
        ${sectionTitle('per-kind', '🎒', 'Schoolvakantie of niet')}
        ${schoolLine && html`<p class="mt-1 max-w-3xl text-sm text-ink-secondary">${schoolLine}</p>`}
        ${table('per-kind', 'Soort weekend', occasions)}
      </section>`
    }
    ${
      shownRegions.length > 1 &&
      html`<section aria-labelledby="per-region" class="mt-10">
        ${sectionTitle('per-region', '🗺️', regionRows.length > shownRegions.length ? `De ${SHOWN_REGIONS} goedkoopste en ${SHOWN_REGIONS} duurste regio's` : 'Prijs per regio')}
        <p class="mt-1 max-w-3xl text-sm text-ink-secondary">Goedkoopst is ${regionRows[0].name} (${formatEuros(regionRows[0].cents)}), duurst ${regionRows.at(-1).name} (${formatEuros(regionRows.at(-1).cents)}).</p>
        ${table('per-region', 'Regio', shownRegions)}
      </section>`
    }
    ${
      brandRows.length > 1 &&
      html`<section aria-labelledby="per-brand" class="mt-10">
        ${sectionTitle('per-brand', '🏷️', 'Prijs per aanbieder')}
        <p class="mt-1 max-w-3xl text-sm text-ink-secondary">Dit zegt niets over wat je ervoor krijgt: de parken en huisjes verschillen per aanbieder.</p>
        ${table('per-brand', 'Aanbieder', brandRows)}
      </section>`
    }
    <section aria-labelledby="how-often" class="mt-10">
      ${sectionTitle('how-often', '🔥', 'Hoe vaak is een weekend goedkoper dan normaal?')}
      <p class="mt-3 max-w-3xl leading-relaxed text-ink-secondary">Van elke 100 weekendprijzen liggen er ${perHundred(under)} minstens ${NOTEWORTHY_PERCENT}% onder de normale prijs van dat park. ${perHundred(deals)} van de 100 zijn minstens ${Math.round(DEAL_SHARE * 100)}% goedkoper: die noemen wij een buitenkansje. De normale prijs is de middelste weekendprijs van het park zelf.</p>
      <p class="mt-3"><a href="/last-minute" class="${chip}"><span aria-hidden="true">⏰</span> De buitenkansjes van komend weekend</a></p>
    </section>
    <section aria-labelledby="method" class="mt-10">
      ${sectionTitle('method', '🔎', 'Zo zijn de cijfers gemaakt')}
      <ul class="mt-3 max-w-3xl list-disc space-y-2 pl-5 leading-relaxed text-ink-secondary">
        <li>Elke dag vragen we bij de aanbieders op wat elk komend weekend kost, tot ${weekends.length} weekenden vooruit. Per park telt het goedkoopste huisje dat nog vrij is.</li>
        <li>De middelste prijs is de mediaan: de helft van de prijzen ligt eronder, de helft erboven. Een paar dure parken trekken hem dus niet omhoog.</li>
        <li>Een groep met minder dan ${MIN_FIGURE_PRICES} prijzen laten we weg. Maanden die verder weg liggen zitten er nog niet in.</li>
        <li>De cijfers gaan over de parken op deze site, niet over alle vakantieparken.</li>
      </ul>
      <p class="mt-4 max-w-3xl rounded-2xl bg-sun-wash p-4 leading-relaxed"><strong>Deze cijfers overnemen?</strong> Dat mag, met een link naar <a href="${FIGURES_PATH}" class="${link}">parkjeweg.nl/cijfers</a> als bron. De pagina wordt na elke prijsronde bijgewerkt.</p>
      <p class="mt-3"><a href="/zo-werkt-het" class="${link}">Meer over hoe de site werkt</a></p>
    </section>`;
  return {
    path: FIGURES_PATH,
    title: 'Wanneer is een vakantiepark het goedkoopst? De cijfers',
    description: monthsDiffer
      ? `Een weekend op een vakantiepark is het goedkoopst in ${cheapMonth.name}: ${formatEuros(cheapMonth.cents)} voor ${partyLabel(PAGE_PARTY)}, tegen ${formatEuros(dearMonth.cents)} in ${dearMonth.name}. Cijfers per maand, regio en aanbieder.`
      : 'Wat een weekend op een vakantiepark kost, per maand, regio en aanbieder, uit dagelijks verzamelde prijzen.',
    image: null,
    body: body.text,
  };
}

function lastMinuteIntro(first, underCount, bestOffer) {
  const available = first?.offers.length ?? 0;
  return html`<p class="mt-3 max-w-3xl leading-relaxed font-semibold text-ink-secondary">Vakantieparken met plek voor ${partyLabel(PAGE_PARTY)} in de komende weekenden. Bijgewerkt na elke prijsronde.</p>${
    available > 0 && html`<p class="mt-3 max-w-3xl leading-relaxed text-ink-secondary">Voor ${formatWeekend(first.weekend)} ${available === 1 ? 'heeft nog 1 park' : `hebben nog ${available} parken`} plek${underCount > 0 && `, waarvan ${underCount} onder ${underCount === 1 ? 'zijn' : 'hun'} normale weekendprijs`}.${discountPercent(bestOffer.weekend) >= NOTEWORTHY_PERCENT && ` De grootste besparing is ${discountPercent(bestOffer.weekend)}% bij ${fullName(bestOffer.park)}.`}</p>
    <nav aria-label="Last minutes vergelijken" class="mt-4 flex flex-wrap gap-2">
      <a href="#cheapest" class="${chip}">Laagste totaalprijs</a>
      <a href="#soon-0" class="${chip}">Grootste besparing</a>
    </nav>`
  }`;
}

/** The coming weekends with room, the biggest deals first: for whoever wants to go away now. */
function lastMinutePage(weekends, { pathOf, occasionsOf, parks, regions = [], brands = [] }) {
  const soon = weekends.slice(0, LAST_MINUTE_WEEKENDS);
  const [first] = soon;
  const now = first?.offers ?? [];
  const free = new Set(now.map((offer) => offer.park.code));
  const cheapest = [...now].sort((a, b) => a.weekend.priceCents - b.weekend.priceCents).slice(0, LAST_MINUTE_LISTED);
  const underCount = now.filter((offer) => discountPercent(offer.weekend) >= NOTEWORTHY_PERCENT).length;
  const bestOffer = now.reduce((best, offer) => (best === null || compareOffersByDiscount(offer, best) < 0 ? offer : best), null);
  // Where there is still room the coming weekend: a region or brand with one park left is no list.
  const withRoom = (lists, pathTo, nameOf) =>
    lists
      .map(([key, list]) => [pathTo(key), nameOf(key), list.filter((park) => free.has(park.code)).length])
      .filter(([, , number]) => number > 1)
      .sort((a, b) => b[2] - a[2]);
  const places = withRoom(regions, regionPath, (region) => region);
  const labels = withRoom(brands, (brand) => brandPath(brand), brandName);
  const chipList = (items, icon) =>
    html`<ul class="mt-4 flex flex-wrap gap-2">${items.map(([href, label, number]) => html`<li><a href="${href}" class="${chip}"><span aria-hidden="true">${icon}</span> ${label} <span class="text-ink-muted">${number}</span></a></li>`)}</ul>`;
  const section = (entry, index) =>
    weekendSection(entry, {
      id: `soon-${index}`,
      emoji: index === 0 ? '⏰' : '📅',
      title: `${index === 0 ? 'Eerstvolgende weekend' : 'Het weekend daarna'}: ${formatWeekend(entry.weekend)}`,
      source: 'lastminute',
      pathOf,
      occasions: occasionsOf(entry.weekend),
      bookingOffer: index === 0 ? bestOffer : null,
    });
  const body = html`
    ${banner('⏰', html`Last minute <span class="inline-block -rotate-1 rounded-2xl bg-sun px-2 text-on-sun">vakantiepark</span>`, lastMinuteIntro(first, underCount, bestOffer))}
    ${soon.map(section)}
    ${
      cheapest.length > 0 &&
      html`<section aria-labelledby="cheapest" class="mt-10">
        ${sectionTitle('cheapest', '💶', 'Laagste totaalprijs')}
        <p class="mt-1 text-sm text-ink-secondary">${formatWeekend(first.weekend)} · ${stay(first.weekend)}. Het goedkoopste huisje per park, de laagste prijs eerst.</p>
        <ul class="mt-4 space-y-2">${cheapest.map((offer) => offerRow(offer, { pathOf, source: 'lastminutelijst' }))}</ul>
      </section>`
    }
    ${
      places.length > 0 &&
      html`<section aria-labelledby="where" class="mt-10">
        ${sectionTitle('where', '🗺️', 'Last minute per regio')}
        <p class="mt-1 text-sm text-ink-secondary">Het aantal parken dat het eerstvolgende weekend nog plek heeft.</p>
        ${chipList(places, '📍')}
      </section>`
    }
    ${
      labels.length > 0 &&
      html`<section aria-labelledby="whose" class="mt-10">
        ${sectionTitle('whose', '🏷️', 'Last minute per aanbieder')}
        ${chipList(labels, '🏷️')}
      </section>`
    }
    <section aria-labelledby="tips" class="mt-10">
      ${sectionTitle('tips', '💡', 'Zo boek je een last minute vakantiepark')}
      <ul class="mt-3 max-w-3xl list-disc space-y-2 pl-5 leading-relaxed text-ink-secondary">
        <li><strong class="text-ink">Vergelijk met de normale prijs.</strong> Bij elk park staat hoeveel de prijs onder of boven de normale weekendprijs van dat park ligt. Zo zie je of last minute ook echt goedkoper is.</li>
        <li><strong class="text-ink">Kijk ook naar het weekend daarna.</strong> Een week later is er vaak meer keus, en soms is het goedkoper.</li>
        <li><strong class="text-ink">Boek bij het park zelf.</strong> De knop brengt je naar de site van het park. Daar zie je de prijs van dit moment en rond je de boeking af.</li>
      </ul>
      <p class="mt-3"><a href="/zo-werkt-het" class="${link}">Zo werkt het vergelijken</a></p>
    </section>
    ${popularSection(parks, { pathOf })}
    ${soon.some(({ offers }) => offers.some((offer) => offer.weekend.weather)) && html`<p class="mt-4 text-xs text-ink-muted">${WEATHER_CREDIT}</p>`}
    ${bestOffer !== null && bookingBar(bestOffer.park, bestOffer.weekend, { source: 'lastminutebalk', named: true, afterOfferSeen: true })}`;
  return {
    path: '/last-minute',
    title: 'Last minute vakantiepark: dit of volgend weekend weg',
    description: first
      ? `Last minute een weekendje weg: ${first.offers.length} vakantieparken met plek van ${formatWeekend(first.weekend)}, vanaf ${formatEuros(cheapestOf(first.offers.map((offer) => offer.weekend)).priceCents)} voor ${partyLabel(PAGE_PARTY)}.`
      : 'Last minute een weekendje weg: de vakantieparken die de komende weekenden nog plek hebben.',
    image: bestOffer?.park.imageUrl ?? null,
    body: body.text,
  };
}

function holidayStaySummary(period, offers, available, from) {
  const dates = html`<p class="mt-3 text-sm font-bold">${weekendRange(period)} · ${nights(period)} nachten</p>`;
  if (available === 0) {
    const status = offers === null
      ? 'De prijzen voor dit verblijf verschijnen zodra we ze hebben opgehaald.'
      : `Bij de parken die we volgen is er geen plek voor ${partyLabel(PAGE_PARTY)}.`;
    return html`${dates}<p class="mt-2 font-semibold">${status}</p>`;
  }

  return html`${dates}
    <p class="mt-2 font-semibold">
      <span class="block text-2xl font-black tabular-nums">Vanaf ${from} totaal</span>
      <span class="text-sm">Voor ${partyLabel(PAGE_PARTY)}, inclusief verplichte toeslagen</span>
    </p>
    <p class="mt-1 text-sm">${count(available, 'vakantiepark', 'vakantieparken')} met plek</p>
    <a href="#cheapest" class="mt-4 inline-flex rounded-full bg-surface px-4 py-2.5 text-sm font-extrabold text-ink shadow-sm transition hover:bg-hover">Bekijk de goedkoopste huisjes</a>`;
}

function holidayStayDescription(title, period, available, from) {
  const dates = weekendRange(period);
  if (available === 0) {
    return `${title}? Bekijk de verblijfsdata en beschikbaarheid voor ${dates}.`;
  }
  return `${title}? Vergelijk ${count(available, 'vakantiepark', 'vakantieparken')} met plek van ${dates}, vanaf ${from} totaal voor ${partyLabel(PAGE_PARTY)}.`;
}

function holidayCountryComparison(offers, pathOf) {
  const countries = Map.groupBy(offers, ({ park }) => countryName(park.country) || 'Overig');
  const groups = [...countries].sort(([a], [b]) => a.localeCompare(b, 'nl'));
  return html`<section aria-labelledby="pinksteren-per-land" class="mt-8">
    ${sectionTitle('pinksteren-per-land', '🌍', 'Pinksteren per land')}
    <p class="mt-2 text-sm text-ink-secondary">Totaalprijzen voor ${partyLabel(PAGE_PARTY)} voor het hele pinksterweekend.</p>
    <ul class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${groups.map(([country, list]) => {
      const [{ park, weekend }] = list;
      return html`<li class="rounded-2xl bg-surface p-4 ring-1 ring-line">
        <p class="font-extrabold">${country}</p>
        <p class="text-sm text-ink-secondary">${count(list.length, 'park', 'parken')} met plek · vanaf <strong>${formatEuros(weekend.priceCents)}</strong></p>
        <a class="${link}" href="${pathOf(park)}">${fullName(park)}</a>
      </li>`;
    })}</ul>
  </section>`;
}

function occasionAlternative(message, path, label) {
  return html`<p class="mt-5 text-sm text-ink-secondary">${message} <a class="${link}" href="${path}">${label}</a>.</p>`;
}

/**
 * A holiday's page: the stay the parks rent out for its coming date, every park with room cheapest first. Before that
 * stay's prices are in, or when no park has room, it says so and keeps its address.
 * @param period the stay, see holidayStay
 * @param offers [{ park, weekend }] for that stay, or null when the rounds have not looked yet
 * @param lastKnown the last weekend the rounds look ahead to
 */
function holidayPage(holiday, { year, period, offers, lastKnown, pathOf, themes, holidays }) {
  const sorted = [...(offers ?? [])].sort((a, b) => a.weekend.priceCents - b.weekend.priceCents);
  const asParks = sorted.map(({ park, weekend }) => ({ ...park, weekends: [weekend] }));
  const from = sorted.length > 0 && formatEuros(sorted[0].weekend.priceCents);
  const name = `${holiday.name} ${year}`;
  const title = holiday.title(year);
  const isEaster = holiday.slug === EASTER_SLUG;
  const isPinksteren = holiday.slug === 'pinksteren';
  const isChristmas = holiday.path === CHRISTMAS_PATH;
  const hasStaySummary = isEaster || isPinksteren;
  const when = `${formatWeekend(period)}, ${nights(period)} nachten`;
  const theme = holiday.theme && THEMES.find((candidate) => candidate.slug === holiday.theme);
  const quiet = theme ? sorted.filter(({ park }) => fitsTheme(theme, park)) : [];
  const usual = nights(period) === 3 && day(period.arrival).getUTCDay() === FRIDAY;

  let status;
  if (sorted.length) status = `${count(sorted.length, 'vakantiepark heeft', 'vakantieparken hebben')} nog plek ${holiday.stayName} (${when}) voor ${partyLabel(PAGE_PARTY)}, vanaf ${from}.`;
  else if (offers) status = `${capitalised(holiday.stayName)} (${when}) vonden we bij de parken die we volgen geen plek meer voor ${partyLabel(PAGE_PARTY)}.`;
  else status = `De prijzen ${holiday.stayName} (${when}) komen hier zodra we ze ophalen${lastKnown ? `; nu lopen ze tot en met ${formatWeekend(lastKnown)}` : ''}.`;
  const sentences = [status, !usual && `Zo verhuren de meeste parken het met ${inText(holiday)}, in plaats van een weekend van vrijdag tot maandag.`].filter(Boolean);
  const summary = hasStaySummary ? holidayStaySummary(period, offers, sorted.length, from) : undefined;
  const alternate = isChristmas && occasionAlternative('Liever een regulier weekend tijdens de schoolvakantie?', CHRISTMAS_BREAK_PATH, 'Vergelijk weekenden in de kerstvakantie');
  const more = [
    ...holidays.filter((other) => other !== holiday && (isChristmas === false || other.path !== CHRISTMAS_BREAK_PATH)).map((other) => [other.path, other.emoji, other.heading]),
    theme && themes.includes(theme) && [themePath(theme), themeIcon(theme), theme.name],
    ['/weekenden', '📅', 'Alle weekenden'],
  ].filter(Boolean);
  const cards = (list) => html`<ul class="mt-4 grid gap-5 sm:grid-cols-3">${list.slice(0, TOP_DEALS).map((offer) => offerCard(offer, { pathOf, source: 'feestdagpagina' }))}</ul>`;

  const body = html`
    ${breadcrumb(name, ['/weekenden', 'Alle weekenden'])}
    <div class="mt-3">${occasionBanner(holiday, { year, status: sentences.join(' '), summary })}</div>
    ${alternate}
    ${isPinksteren && sorted.length > 0 && holidayCountryComparison(sorted, pathOf)}
    ${sorted.length > 0 && html`<section aria-labelledby="cheapest" class="mt-10">${sectionTitle('cheapest', holiday.emoji, 'Het goedkoopst')}${cards(sorted)}</section>`}
    ${
      quiet.length > 0 &&
      html`<section aria-labelledby="quiet" class="mt-10">
        ${sectionTitle('quiet', themeIcon(theme), theme.name)}
        <p class="mt-1 text-sm text-ink-secondary">${theme.intro}</p>
        ${cards(quiet)}
      </section>`
    }
    ${
      sorted.length > 0 &&
      html`<section aria-labelledby="all" class="mt-10">
        ${sectionTitle('all', '💶', sorted.length > LISTED_OFFERS ? `De ${LISTED_OFFERS} goedkoopste parken` : 'Alle parken met plek, goedkoopste eerst')}
        <p class="mt-1 text-sm text-ink-secondary">${formatWeekend(period)} · ${stay(period)}. Het goedkoopste huisje per park.</p>
        ${checkedLine(sorted[0].weekend)}
        <ul class="mt-4 space-y-2">${sorted.slice(0, LISTED_OFFERS).map((offer) => offerRow(offer, { pathOf, source: 'feestdagpagina' }))}</ul>
      </section>`
    }
    <nav aria-labelledby="more" class="mt-10">${sectionTitle('more', '✨', 'Verder kijken')}<ul class="mt-4 flex flex-wrap gap-2">${more.map(
      ([href, emoji, label]) => html`<li><a href="${href}" class="${chip}"><span aria-hidden="true">${emoji}</span> ${label}</a></li>`,
    )}</ul></nav>
    ${bestBar(asParks, { source: 'feestdagbalk' })}`;
  return {
    path: holiday.path,
    title: holiday.titleSuffix === undefined ? fitting(`${title}: parken met plek en prijzen`, `${title}: parken en prijzen`) : `${title} | ${holiday.titleSuffix}`,
    description: hasStaySummary || isChristmas
      ? holidayStayDescription(title, period, sorted.length, from)
      : sorted.length
        ? `${name} op een vakantiepark: ${count(sorted.length, 'park', 'parken')} met plek ${holiday.stayName}, voor ${partyLabel(PAGE_PARTY)} vanaf ${from}.`
        : `${name} op een vakantiepark: welke parken nog plek hebben ${holiday.stayName}, en wat het kost.`,
    image: bestOf(asParks)?.imageUrl ?? null,
    body: body.text,
  };
}

function schoolHolidayWeekends(matching, { title, emoji, regionsOf }) {
  return html`<section aria-labelledby="kies-weekend" class="mt-8">
    ${sectionTitle('kies-weekend', emoji, title)}
    <p class="mt-2 text-sm text-ink-secondary">Totaalprijzen voor ${partyLabel(PAGE_PARTY)}, van vrijdag tot maandag.</p>
    <ul class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${matching.map(({ weekend, offers }, index) => {
      const cheapest = cheapestOf(offers.map((offer) => offer.weekend));
      const regions = regionsOf(weekend);
      return html`<li class="rounded-2xl bg-surface p-4 ring-1 ring-line">
        <a class="${link} font-extrabold" href="#weekend-${index}">${weekendRange(weekend)}</a>
        ${regions && html`<p class="text-sm font-semibold">${regions}</p>`}
        <p class="text-sm text-ink-secondary">${count(offers.length, 'park', 'parken')} met plek · vanaf <strong>${formatEuros(cheapest.priceCents)}</strong></p>
      </li>`;
    })}</ul>
  </section>`;
}

/**
 * A season's page (see SEASONS): its weekends with their best offers. Before their prices are in it says so and keeps
 * its address.
 * @param matching the season's weekends with room, as on the weekend pages
 * @param others the other holiday and season pages, to point to
 */
function seasonPage(season, { year, matching, long, lastKnown, pathOf, occasionsOf, others }) {
  const longOffers = [...(long?.offers ?? [])].sort((a, b) => a.weekend.priceCents - b.weekend.priceCents);
  const offers = matching.flatMap((entry) => entry.offers);
  const parkCount = new Set(offers.map(({ park }) => park.code)).size;
  const from = offers.length > 0 && formatEuros(cheapestOf(offers.map((offer) => offer.weekend)).priceCents);
  const name = `${season.name} ${year}`;
  const isSpringBreak = season.slug === 'voorjaarsvakantie';
  const isChristmasBreak = season.path === CHRISTMAS_BREAK_PATH;
  const alternate = isChristmasBreak && occasionAlternative('Wil je op de kerstdagen zelf op een park verblijven?', CHRISTMAS_PATH, 'Bekijk het kerstverblijf vanaf kerstavond');
  const comparison = matching.length > 0 && (isSpringBreak || isChristmasBreak) && schoolHolidayWeekends(matching, {
    title: isSpringBreak ? 'Voorjaarsvakantie per schoolregio' : 'Kies je weekend in de kerstvakantie',
    emoji: season.emoji,
    regionsOf: (weekend) => isSpringBreak ? occasionsOf(weekend).filter(({ label }) => season.matches(label)).map(({ text }) => text).join(' ') : '',
  });
  const when = matching.length === 1 ? `nog plek van ${formatWeekend(matching[0].weekend)}` : `plek in ${matching.length} weekenden van vrijdag tot maandag`;
  let status;
  if (matching.length) status = `${count(parkCount, 'vakantiepark heeft', 'vakantieparken hebben')} ${when} voor ${partyLabel(PAGE_PARTY)}, vanaf ${from}.`;
  else if (longOffers.length) status = `${count(longOffers.length, 'vakantiepark heeft', 'vakantieparken hebben')} nog plek ${season.stayName} (${formatWeekend(long.period)}) voor ${partyLabel(PAGE_PARTY)}, vanaf ${formatEuros(longOffers[0].weekend.priceCents)}.`;
  else status = `De prijzen voor ${season.name.endsWith('vakantie') ? 'de ' : ''}${inText(season)} ${year} komen hier zodra we ze ophalen${lastKnown ? `; nu lopen ze tot en met ${formatWeekend(lastKnown)}` : ''}.`;
  const more = [...others.filter((other) => other !== season && (isChristmasBreak === false || other.path !== CHRISTMAS_PATH)).map((other) => [other.path, other.emoji, other.heading]), ['/weekenden', '📅', 'Alle weekenden']];

  const body = html`
    ${breadcrumb(name, ['/weekenden', 'Alle weekenden'])}
    <div class="mt-3">${occasionBanner(season, { year, status })}</div>
    ${alternate}
    ${comparison}
    ${
      longOffers.length > 0 &&
      html`<section aria-labelledby="long" class="mt-10">
        ${sectionTitle('long', season.emoji, `Het lange weekend: ${formatWeekend(long.period)}`)}
        <p class="mt-1 text-sm text-ink-secondary">${capitalised(season.stayName)}: ${stay(long.period)}. Het goedkoopste huisje per park, zonder vergelijking met een normale prijs.</p>
        ${checkedLine(longOffers[0].weekend)}
        <ul class="mt-4 grid gap-5 sm:grid-cols-3">${longOffers.slice(0, TOP_DEALS).map((offer) => offerCard(offer, { pathOf, source: 'vakantiepagina' }))}</ul>
        <ul class="mt-4 space-y-2">${longOffers.slice(TOP_DEALS, LISTED_OFFERS).map((offer) => offerRow(offer, { pathOf, source: 'vakantiepagina' }))}</ul>
      </section>`
    }
    ${matching.map((entry, index) => weekendSection(entry, { id: `weekend-${index}`, emoji: season.emoji, title: formatWeekend(entry.weekend), source: 'vakantiepagina', pathOf, occasions: occasionsOf(entry.weekend) }))}
    <nav aria-labelledby="more" class="mt-10">${sectionTitle('more', '✨', 'Verder kijken')}<ul class="mt-4 flex flex-wrap gap-2">${more.map(
      ([href, emoji, label]) => html`<li><a href="${href}" class="${chip}"><span aria-hidden="true">${emoji}</span> ${label}</a></li>`,
    )}</ul></nav>
    ${bestBar(offers.map(({ park, weekend }) => ({ ...park, weekends: [weekend] })), { source: 'vakantiebalk' })}`;
  return {
    path: season.path,
    title: isChristmasBreak ? `${season.title(year)} | Weekenden en totaalprijzen` : fitting(`${season.title(year)}: parken met plek en prijzen`, `${season.title(year)}: parken en prijzen`),
    description: matching.length
      ? `${name} op een vakantiepark: ${count(matching.length, 'weekend', 'weekenden')} met plek bij ${count(parkCount, 'park', 'parken')} van Landal, Topparken en Molecaten, voor ${partyLabel(PAGE_PARTY)} vanaf ${from}.`
      : longOffers.length
        ? `${name} op een vakantiepark: ${count(longOffers.length, 'park', 'parken')} met plek ${season.stayName}, voor ${partyLabel(PAGE_PARTY)} vanaf ${formatEuros(longOffers[0].weekend.priceCents)}.`
        : `${name} op een vakantiepark: welke parken van Landal, Topparken en Molecaten nog plek hebben, en wat een weekend kost.`,
    image: bestOf(offers.map(({ park, weekend }) => ({ ...park, weekends: [weekend] })))?.imageUrl ?? null,
    body: body.text,
  };
}

function parksIndex(parks, { pathOf, regions, themes, countries: countryPages, brands, holidays }) {
  const byCountry = Map.groupBy(parks, (park) => countryName(park.country) || 'Overig');
  const countries = [...byCountry].sort((a, b) => b[1].length - a[1].length);
  const parkRow = (park) => {
    const from = cheapestOf(park.weekends);
    return html`<li class="break-inside-avoid py-1.5"><a href="${pathOf(park)}" class="${link}">${fullName(park)}</a> <span class="text-sm text-ink-secondary">${park.city && `· ${park.city} `}· ${from ? `vanaf ${formatEuros(from.priceCents)}` : 'geen plek'}</span></li>`;
  };
  const chips = (items) =>
    html`<ul class="mt-4 flex flex-wrap gap-2">${items.map(([href, emoji, label, number]) => html`<li><a href="${href}" class="${chip}"><span aria-hidden="true">${emoji}</span> ${label} <span class="text-ink-muted">${number}</span></a></li>`)}</ul>`;
  const body = html`
    ${banner('🏕️', 'Alle vakantieparken', html`<p class="mt-3 max-w-2xl font-semibold text-ink-secondary">${parks.length} parken van Landal, Topparken en Molecaten, met de laagste weekendprijs voor ${partyLabel(PAGE_PARTY)} (vrijdag tot maandag).</p><p class="mt-4 flex flex-wrap gap-2"><a href="/last-minute" class="${chip}"><span aria-hidden="true">⏰</span> Last minute: de komende weekenden</a>${holidays.map(holidayChip)}</p>`)}
    ${popularSection(parks, { pathOf })}
    <section aria-labelledby="themes" class="mt-10">${sectionTitle('themes', '✨', 'Per thema')}${chips(themes.map(([theme, list]) => [themePath(theme), themeIcon(theme), theme.label, list.length]))}</section>
    <section aria-labelledby="countries" class="mt-10">${sectionTitle('countries', '🌍', 'Per land')}${chips(countryPages.map(([country, list]) => [countryPath(country), '📍', countryName(country), list.length]))}</section>
    <section aria-labelledby="brands" class="mt-10">${sectionTitle('brands', '🏷️', 'Per aanbieder')}${chips(brands.map(([brand, list]) => [brandPath(brand), '🏷️', brandName(brand), list.length]))}</section>
    <section aria-labelledby="regions" class="mt-10">${sectionTitle('regions', '🗺️', 'Per regio')}${chips(regions.map(([region, list]) => [regionPath(region), '📍', region, list.length]))}</section>
    ${countries.map(
      ([country, list]) => html`<section class="mt-10">
        <h2 class="text-2xl font-black">${country}</h2>
        <ul class="mt-2 columns-1 gap-8 sm:columns-2">${[...list].sort((a, b) => fullName(a).localeCompare(fullName(b), 'nl')).map(parkRow)}</ul>
      </section>`,
    )}
    ${bestBar(parks, { source: 'overzichtbalk' })}`;
  return {
    path: '/parken',
    title: 'Alle vakantieparken van Landal, Topparken en Molecaten',
    description: `${parks.length} vakantieparken in Nederland en daarbuiten, per land, regio en thema, elk met de laagste prijs voor een weekendje weg en de prijs van elk komend weekend.`,
    image: null,
    body: body.text,
  };
}

function weekendsIndex(weekends, { parks, pathOf, holidays, easterHoliday }) {
  const easterLink = holidayChip({ ...easterHoliday.holiday, heading: easterHoliday.holiday.title(easterHoliday.year) });
  const otherHolidays = holidays.filter((holiday) => holiday.slug !== EASTER_SLUG);
  const row = ({ weekend, offers }) => {
    const cheapest = cheapestOf(offers.map((offer) => offer.weekend));
    const deals = offers.filter((offer) => (offer.weekend.discount ?? 0) >= DEAL_SHARE).length;
    return html`<li class="flex flex-col gap-1 rounded-3xl bg-surface p-4 ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-lg">
      <a href="${weekendPath(weekend.arrival)}" class="text-lg font-extrabold hover:underline">${formatWeekend(weekend)}</a>
      <p class="text-sm text-ink-secondary">${count(offers.length, 'park', 'parken')} met plek</p>
      <p class="mt-1 flex flex-wrap items-center gap-2"><span class="text-2xl font-black tabular-nums">vanaf ${formatEuros(cheapest.priceCents)}</span>${deals > 0 && html`<span class="rounded-full bg-sun px-2.5 py-0.5 text-xs font-black text-on-sun">${deals} ${deals === 1 ? 'buitenkansje' : 'buitenkansjes'}</span>`}</p>
    </li>`;
  };
  const body = html`
    ${banner('📅', 'Alle weekenden', html`
      <p class="mt-3 max-w-2xl font-semibold text-ink-secondary">Elk komend weekend (vrijdag tot maandag) met het aantal vakantieparken dat nog plek heeft voor ${partyLabel(PAGE_PARTY)} en de laagste prijs.</p>
      <p class="mt-2 max-w-2xl text-ink-secondary">${figuresLink} Vergelijk de weekendprijzen per maand en regio.</p>
      <nav aria-label="Vakantie- en feestdagen" class="mt-4 flex flex-wrap gap-2">${easterLink}<a href="/last-minute" class="${chip}"><span aria-hidden="true">⏰</span> Last minute: de komende weekenden</a>${otherHolidays.map(holidayChip)}</nav>
    `)}
    ${popularSection(parks, { pathOf })}
    <ul class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${weekends.map(row)}</ul>
    ${bestBar(parks, { source: 'overzichtbalk' })}`;
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
  // Clicks this week per popular park.
  popular: new Map(),
  // The holiday stays' prices the rounds collected: [{ arrival, departure, offers: [{ code, priceCents, … }] }].
  holidayStays: [],
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
      const popular = details.popular.get(info.code) ?? 0;
      if (park) return { ...park, popular, facilities: park.facilities?.length ? park.facilities : details.facilitiesOf(info.code) };
      const placeName = details.ratings.get(info.code)?.placeName;
      return {
        ...info,
        weekends: [],
        brand: parkBrand({ ...info, placeName }),
        facilities: details.facilitiesOf(info.code),
        googleRating: details.ratings.get(info.code) ?? null,
        popular,
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
  const localDate = localToday(new Date(computedAt));
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

  const brands = [...Map.groupBy(everyPark.filter((park) => park.brand), (park) => park.brand)].filter(enough).sort(bySize);
  // A brand's parks per region and country, where that is a list of its own: not the brand's whole list again, and not
  // the same parks under a second name.
  const brandPlaces = brands.flatMap(([brand, whole]) => {
    const seen = new Set();
    return [
      ...regions.map(([region, list]) => ({ name: region, place: inPlace(region), general: regionPath(region), list })),
      ...countries.map(([country, list]) => ({ name: countryName(country), place: `in ${countryName(country)}`, general: countryPath(country), list })),
    ]
      .map((entry) => ({ ...entry, brand, list: entry.list.filter((park) => park.brand === brand) }))
      .filter(({ list }) => {
        const key = list.map((park) => park.code).sort().join();
        if (list.length < MIN_LISTED_PARKS || list.length === whole.length || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  });
  const brandLinks = (general) =>
    brandPlaces.filter((entry) => entry.general === general).map(({ brand, name, list }) => [brandPath(brand, name), brandName(brand), list.length, '🏷️']);

  // A park points to its brand's lists it is on: the regions first, its country after, then all of the brand.
  const brandPagesOf = (park) => [
    ...brandPlaces.filter(({ brand, list }) => brand === park.brand && list.includes(park)).map(({ brand, name, place }) => [brandPath(brand, name), `${brandName(brand)} ${place}`]),
    ...brands.filter(([brand]) => brand === park.brand).map(([brand]) => [brandPath(brand), `Alle parken van ${brandName(brand)}`]),
  ];

  // A theme with a party of its own lists that party's overview, where its parks have a page; none before it has one.
  const facilitiesOf = new Map(everyPark.map((park) => [park.code, park.facilities]));
  const themeParks = (theme) => {
    if (!theme.party) return everyPark.filter((park) => fitsTheme(theme, park));
    const own = details.parksOf(theme.party) ?? [];
    return own
      .filter((park) => pathOf(park))
      .map((park) => ({ ...park, facilities: facilitiesOf.get(park.code) ?? [], popular: details.popular.get(park.code) ?? 0 }))
      .filter((park) => fitsTheme(theme, park));
  };
  const themes = THEMES.map((theme) => [theme, themeParks(theme)]).filter(enough);
  const themePages = themes.map(([theme]) => theme);
  const themeCodes = new Map(themes.map(([theme, list]) => [theme, new Set(list.map((park) => park.code))]));
  // A facility's own theme, for linking the facility where a park lists it.
  const themeOf = new Map(themePages.filter((theme) => theme.facilities.length === 1).map((theme) => [theme.facilities[0], theme]));
  const partyOf = (key) => (key && parseGroupKey(key)) || PAGE_PARTY;

  const today = computedAt.slice(0, 10);
  const parkByCode = new Map(everyPark.map((park) => [park.code, park]));
  // A collected stay's offers, like a weekend's but without a normal price to compare with: no other stay is that
  // long or that dear. Null when the rounds have not looked yet.
  const stayOffers = (period) => {
    const collected = details.holidayStays.find((entry) => entry.arrival === period.arrival && entry.departure === period.departure);
    if (!collected) return null;
    return collected.offers
      .map(({ code, priceCents, accommodationCode, bookingUrl }) => ({
        park: parkByCode.get(code),
        weekend: { ...period, priceCents, accommodationCode, bookingUrl, discount: null, observedAt: collected.fetchedAt },
      }))
      .filter((offer) => offer.park);
  };
  const holidays = HOLIDAYS.map((holiday) => {
    const year = holidayYear(holiday, today);
    const period = holidayStay(holiday, year);
    return { holiday, year, period, offers: stayOffers(period) };
  });
  const seasons = SEASONS.map((season) => {
    const year = seasonYear(season, today);
    const matching = weekends.filter(
      ({ weekend }) => weekend.arrival.startsWith(String(year)) && details.occasionsOf(weekend).some((occasion) => season.matches(occasion.label)),
    );
    const period = season.stay?.(year);
    return { season, year, matching, long: period ? { period, offers: stayOffers(period) ?? [] } : null };
  });
  const occasionPages = [...HOLIDAYS, ...SEASONS];
  const holidaysOn = (weekend) => [
    ...holidays.filter(({ period }) => weekend.arrival < period.departure && weekend.departure > period.arrival).map(({ holiday }) => holiday),
    ...seasons.filter(({ matching }) => matching.some((entry) => entry.weekend === weekend)).map(({ season }) => season),
  ];
  const holidayOffersOf = (park) =>
    holidays.flatMap(({ holiday, year, offers }) => offers?.filter((offer) => offer.park === park).map(({ weekend }) => ({ holiday, year, weekend })) ?? []);
  // The lists point to a holiday or season once it has prices.
  const upcoming = [
    ...holidays.filter(({ offers }) => offers?.length).map(({ holiday }) => holiday),
    ...seasons.filter(({ matching, long }) => matching.length || long?.offers.length).map(({ season }) => season),
  ];
  const lastKnown = weekends.at(-1)?.weekend;
  const easterHoliday = holidays.find(({ holiday }) => holiday.slug === EASTER_SLUG);

  return [
    parksIndex(everyPark, { pathOf, regions, themes, countries, brands, holidays: upcoming }),
    weekendsIndex(weekends, { parks: everyPark, pathOf, holidays: upcoming, easterHoliday }),
    ...holidays.map(({ holiday, year, period, offers }) =>
      holidayPage(holiday, { year, period, offers, lastKnown, pathOf, themes: themePages, holidays: occasionPages }),
    ),
    ...seasons.map(({ season, year, matching, long }) => seasonPage(season, { year, matching, long, lastKnown, pathOf, occasionsOf: details.occasionsOf, others: occasionPages })),
    lastMinutePage(weekends, { pathOf, occasionsOf: details.occasionsOf, parks: everyPark, regions, brands }),
    figuresPage(weekends, { regions, brands, occasionsOf: details.occasionsOf, updated, computedAt }),
    ...everyPark.map((park) =>
      parkPage(park, {
        pathOf,
        nearby: nearbyOf(park),
        today: localDate,
        updated,
        accommodations: accommodationsOf(park),
        places: details.surroundings.get(park.code) ?? [],
        weekendCount: weekends.length,
        regionPages: regionsOf(park).filter((region) => regionsWithPage.has(region)),
        themes: themePages.filter((theme) => themeCodes.get(theme).has(park.code)),
        themeOf,
        occasionsOf: details.occasionsOf,
        holidayOffers: holidayOffersOf(park),
        brandPages: brandPagesOf(park),
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
        holidays: holidaysOn(weekend),
      }),
    ),
    ...regions.map(([region, list]) =>
      placePage(region, list, {
        path: regionPath(region),
        place: inPlace(region),
        emoji: '🗺️',
        pathOf,
        surroundings: details.surroundings,
        links: brandLinks(regionPath(region)),
        comparison: region === 'Overijssel' ? overijsselComparison(list, { pathOf, today: localDate }) : null,
      }),
    ),
    ...countries.map(([country, list]) =>
      placePage(countryName(country), list, {
        path: countryPath(country),
        place: `in ${countryName(country)}`,
        emoji: '🌍',
        pathOf,
        surroundings: details.surroundings,
        comparison: country === 'DE' ? germanyComparison(list, { pathOf, today: localDate }) : null,
        links: [
          ...regions
            .filter(([, parksOf]) => parksOf.every((park) => park.country === country))
            .map(([region, parksOf]) => [regionPath(region), region, parksOf.length]),
          ...brandLinks(countryPath(country)),
        ],
      }),
    ),
    ...brands.map(([brand, list]) =>
      placePage(brandName(brand), list, {
        path: brandPath(brand),
        emoji: '🏷️',
        pathOf,
        brand,
        links: brandPlaces.filter((entry) => entry.brand === brand).map(({ name, list: there }) => [brandPath(brand, name), name, there.length]),
      }),
    ),
    ...brandPlaces.map(({ brand, name, place, general, list }) =>
      placePage(name, list, {
        path: brandPath(brand, name),
        place,
        emoji: '🏷️',
        pathOf,
        surroundings: details.surroundings,
        brand,
        links: [
          [general, `Alle parken ${place}`, '', '🗺️'],
          ...brandLinks(general).filter(([href]) => href !== brandPath(brand, name)),
        ],
      }),
    ),
    ...themes.map(([theme, list]) => themePage(theme, list, { pathOf, themes: themePages, party: partyOf(theme.party) })),
  ].map((page) => ({ ...page, description: fittingDescription(page.description) }));
}

const UNAVAILABLE = {
  title: 'Even geen prijzen',
  description: 'De prijzen zijn op dit moment niet bereikbaar.',
  image: null,
  body: html`<h1 class="text-3xl font-bold tracking-tight">Even geen prijzen</h1>
    <p class="mt-3 text-ink-secondary">We kunnen de prijzen nu niet ophalen. Probeer het over een tijdje opnieuw, of kijk direct bij een aanbieder.</p>
    <div class="mt-6 flex flex-wrap gap-3">${providerHomeLinks('storing').map(({ name, href }) => ctaLink(href, `Naar ${name}`, name))}</div>`.text,
};

const NOT_FOUND = {
  title: 'Pagina niet gevonden',
  description: 'Deze pagina bestaat niet (meer).',
  image: null,
  body: html`<h1 class="text-3xl font-bold tracking-tight">Deze pagina bestaat niet (meer)</h1>
    <p class="mt-3 text-ink-secondary">Misschien is het weekend al voorbij. Bekijk <a href="/weekenden" class="${link}">de komende weekenden</a> of <a href="/parken" class="${link}">alle parken</a>.</p>`.text,
};

const heading = 'mt-8 text-lg font-semibold';
const listing = 'mt-2 list-disc space-y-1 pl-5';

/** How the prices come about, what "normal" means and how the site earns: what a careful visitor wants to know first. */
const HOW_PATH = '/zo-werkt-het';
const howPage = () => ({
  title: 'Zo werkt het',
  description: `Hoe ${SITE_NAME} de weekendprijzen van vakantieparken ophaalt, wat de normale prijs is, wanneer iets een buitenkansje heet en hoe de site geld verdient.`,
  image: null,
  body: html`<h1 class="text-3xl font-bold tracking-tight">Zo werkt het</h1>
    <div class="mt-3 max-w-2xl text-ink-secondary">
      <p>${SITE_NAME} vergelijkt wat een weekendje weg kost bij de vakantieparken van Landal, Topparken en Molecaten. Je boekt altijd bij de aanbieder zelf.</p>
      <p class="mt-3 font-semibold text-ink">Je ziet hier de echte prijs van elk weekend, zoals wij die bij de aanbieder zagen. Geen "tot 40% korting" zonder dat erbij staat waarop.</p>
      <h2 class="${heading} text-ink">Waar de prijzen vandaan komen</h2>
      <ul class="${listing}">
        <li>Elke dag vragen we bij de aanbieders op wat elk komend weekend kost, van vrijdag tot maandag. Bij een prijs staat wanneer we die voor het laatst zagen.</li>
        <li>Per park tonen we het goedkoopste huisje dat nog vrij is, voor je hele gezelschap en inclusief de verplichte toeslagen. Een park zonder vrij huisje laten we dat weekend weg.</li>
        <li>De pagina's die je via Google vindt, rekenen met ${partyLabel(PAGE_PARTY)}. Op de <a href="/" class="${link}">zoekpagina</a> stel je je eigen gezelschap in.</li>
        <li>Prijzen kunnen veranderen nadat wij ze zagen. De prijs bij de aanbieder geldt.</li>
      </ul>
      <p class="mt-3">${figuresLink} Bekijk hoe de door ons gemeten weekendprijzen verschillen per maand, regio en aanbieder.</p>
      <h2 id="normale-prijs" class="${heading} scroll-mt-20 text-ink">Wat de gebruikelijke prijs bij een park is</h2>
      <p class="mt-2">De normale prijs van een park is de middelste weekendprijs die we er zelf voor zagen, over het afgelopen half jaar en de komende weekenden. Het is dus geen adviesprijs van de aanbieder. Van een park waarvan we nog te weinig weekenden kennen, tonen we geen normale prijs en geen korting.</p>
      <h2 class="${heading} text-ink">Wanneer iets een buitenkansje is</h2>
      <p class="mt-2">Een weekend heet een buitenkansje als het minstens ${Math.round(DEAL_SHARE * 100)}% onder de normale prijs van dat park ligt. Een doorgestreepte prijs is altijd die normale prijs. We tellen niet af en doen niet alsof iets bijna op is.</p>
      <h2 class="${heading} text-ink">Hoe we geld verdienen</h2>
      <p class="mt-2">Links naar een aanbieder zijn affiliate-links: boek je via zo'n link, dan krijgen wij een vergoeding van de aanbieder. Jij betaalt niets extra. Het bepaalt niet welke parken je ziet en ook niet in welke volgorde.</p>
      <h2 class="${heading} text-ink">Meer weten</h2>
      <p class="mt-2">Wat we bewaren staat op de pagina <a href="/privacy" class="${link}">Privacy</a>. Vragen? Mail naar het adres dat daar staat.</p>
    </div>`.text,
});

/** What the site keeps and who else sees something. Questions go to contact@ the site's own domain (Email Routing). */
const privacyPage = (hostname) => ({
  title: 'Privacy',
  description: `Wat ${SITE_NAME} bewaart en wie er verder iets ziet: geen account, geen trackingcookies, geen IP-adressen.`,
  image: null,
  body: html`<h1 class="text-3xl font-bold tracking-tight">Privacy</h1>
    <div class="mt-3 max-w-2xl text-ink-secondary">
      <p>${SITE_NAME} is een website van een particulier. Je hebt geen account nodig. We gebruiken geen trackingcookies. Wel tellen we anoniem hoeveel mensen de site bezoeken en wat ze gebruiken.</p>
      <h2 class="${heading} text-ink">Wat we bewaren</h2>
      <ul class="${listing}">
        <li>Klik je door naar een aanbieder, dan bewaren we welk park, welk weekend, vanaf welke pagina, voor hoeveel personen en wanneer. Niet wie je bent en niet je IP-adres. Zodat dezelfde bezoeker een park maar één keer per dag populairder maakt, bewaren we een korte code die we maken uit je IP-adres en een sleutel van die dag. Die sleutel vervangen we elke dag; daarna valt de code niet meer terug te leiden.</li>
        <li>We tellen bezoeken: welke pagina, van welke site je kwam, of je op een telefoon, tablet of computer zit, met welke browser en welk formaat scherm, en uit welk land en welke provincie of regio. Die regio schat Cloudflare uit je netwerk; je plaats of adres bewaren we niet. En wat je gebruikt: welke filters, weekenden en parken je kiest, of een zoekopdracht geen park opleverde, hoe ver je een pagina doorleest, hoe snel die laadde en of er iets misging. Klik je door naar een aanbieder, dan tellen we de prijs en de korting die je zag. Nooit wat je in het zoekveld typt en nooit je adres. Een bezoeker is daarbij dezelfde code van één dag als bij klikken. Deze tellingen staan bij Cloudflare, dat ze na drie maanden weggooit.</li>
        <li>Beantwoord je de vraag of je vond wat je zocht, dan tellen we je antwoord. Schrijf je er een opmerking bij, dan bewaren we die tekst met de pagina waar je was en het tijdstip, zonder je bezoekerscode. Zet er dus geen naam of adres in.</li>
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

// On every page of the server: anonymous counts like the app sends (src/lib/track.js, server/events.mjs), and the
// question in the footer. How far down the visitor scrolled, how fast the page came and what broke go off when the
// page is left; the answer is counted at once and a remark is kept for the admin (POST /api/feedback).
const pageScript = `(() => {
  const bookingBar = document.querySelector('[data-last-minute-booking]');
  const featuredOffer = document.querySelector('[data-last-minute-offer]');
  if (bookingBar !== null && featuredOffer !== null && typeof IntersectionObserver === 'function') {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.intersectionRatio === 1) === false) {
        return;
      }
      bookingBar.hidden = false;
      observer.disconnect();
    }, { threshold: 1 });
    observer.observe(featuredOffer);
  }

  // The same switch as the app's (src/composables/useTheme.js): the choice follows the visitor from page to page.
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    const system = matchMedia('(prefers-color-scheme: dark)');
    const root = document.documentElement;
    const isDark = () => (root.dataset.theme ?? (system.matches ? 'dark' : 'light')) === 'dark';
    const show = () => {
      themeToggle.setAttribute('aria-pressed', String(isDark()));
      themeToggle.querySelector('path').setAttribute('d', isDark() ? 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' : 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z');
    };
    show();
    system.addEventListener('change', show);
    themeToggle.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      const chosen = next === (system.matches ? 'dark' : 'light') ? null : next;
      if (chosen) root.dataset.theme = chosen;
      else delete root.dataset.theme;
      try {
        if (chosen) localStorage.setItem('weekend-deals:theme', chosen);
        else localStorage.removeItem('weekend-deals:theme');
      } catch {}
      show();
    });
  }
  const events = [];
  const seen = new Set();
  const add = (name, key, value = '', number = 0) => {
    if (seen.has(name + key)) return;
    seen.add(name + key);
    events.push({ name, key, value, number });
  };
  const send = () => {
    if (!events.length) return;
    const screen = innerWidth < 640 ? 'klein' : innerWidth < 1024 ? 'middel' : 'groot';
    const body = JSON.stringify({ path: location.pathname, screen, events: events.splice(0) });
    navigator.sendBeacon?.('/api/events', new Blob([body], { type: 'application/json' }));
  };
  addEventListener('scroll', () => {
    const depth = (scrollY + innerHeight) / document.documentElement.scrollHeight;
    if (depth > 0.5) add('read', 'half');
    if (depth > 0.9) add('read', 'end');
  }, { passive: true });
  addEventListener('load', () => setTimeout(() => {
    const [navigation] = performance.getEntriesByType('navigation');
    if (navigation && navigation.loadEventEnd) add('speed', 'load', '', Math.round(navigation.loadEventEnd));
  }));
  addEventListener('error', (event) => add('error', 'js1', String(event.message || '').replace(/[^\\p{L}\\p{N} _.,:-]/gu, ' ').slice(0, 64)));
  addEventListener('pagehide', send);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && send());

  const form = document.querySelector('[data-feedback]');
  if (!form) return;
  form.hidden = false;
  const part = (name) => form.querySelector('[data-' + name + ']');
  let found = '';
  for (const button of form.querySelectorAll('[data-answer]')) {
    button.addEventListener('click', () => {
      found = button.dataset.answer;
      add('found', found);
      part('question').hidden = true;
      part('more').hidden = false;
    });
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const comment = form.querySelector('textarea').value.trim();
    if (comment) {
      fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ found, comment, path: location.pathname }) }).catch(() => {});
    }
    part('more').hidden = true;
    part('thanks').hidden = false;
  });
})();`;

/** A stored page as a whole document, with the site's header and footer around it. */
export function pageDocument({ title, description, image, body }, { url, stylesheet }) {
  return html`<!doctype html>
<html lang="nl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${documentTitle(title)}</title>
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
    <meta property="og:image" content="${image ?? `${new URL(url).origin}/og.png`}" />
    <meta name="twitter:card" content="summary_large_image" />
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
    <header class="border-b border-line bg-surface/90 backdrop-blur sm:sticky sm:top-0 sm:z-30">
      <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:gap-x-6 sm:px-6">
        <a href="/" class="flex items-center gap-2 text-lg font-black tracking-tight"><span aria-hidden="true" class="grid size-9 -rotate-6 place-items-center rounded-full bg-sun text-on-sun shadow-sm"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="size-5"><path d="M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9" /></svg></span>${SITE_NAME}</a>
        <nav aria-label="Hoofdmenu" class="order-last flex basis-full gap-4 text-sm sm:order-none sm:basis-auto">
          <a href="/weekenden" class="${navLink}">Weekenden</a>
          <a href="/parken" class="${navLink}">Parken</a>
          <a href="/last-minute" class="${navLink}">Last minute</a>
        </nav>
        <div class="ml-auto flex items-center gap-2">
          <a href="/" class="rounded-full bg-cta px-4 py-2 text-sm font-extrabold text-on-cta shadow-sm transition hover:bg-cta-hover">Zoek<span class="max-sm:sr-only"> een weekend</span></a>
          <button type="button" id="theme-toggle" class="grid size-9 place-items-center rounded-full ring-1 ring-line transition hover:bg-hover" title="Donkere weergave" aria-label="Donkere weergave" aria-pressed="false"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="size-4"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg></button>
        </div>
      </div>
    </header>
    <main class="mx-auto max-w-5xl px-4 py-6 sm:px-6">${new Html(body)}</main>
    <footer class="mt-16 rounded-t-[2.5rem] bg-accent-wash">
      <form data-feedback hidden class="mx-auto max-w-5xl px-4 pt-8 text-sm sm:px-6">
        <div class="max-w-xl rounded-2xl bg-surface p-4 ring-1 ring-line">
          <p class="font-semibold">Heb je gevonden wat je zocht?</p>
          <p data-question class="mt-3 flex gap-2"><button type="button" data-answer="ja" class="${chip}">Ja</button><button type="button" data-answer="nee" class="${chip}">Nee</button></p>
          <div data-more hidden class="mt-3">
            <label for="feedback-comment" class="font-medium">Wat miste je, of wat kan er beter? <span class="font-normal text-ink-secondary">(niet verplicht)</span></label>
            <textarea id="feedback-comment" maxlength="500" rows="3" class="mt-2 block w-full rounded-xl bg-plane p-2 ring-1 ring-field"></textarea>
            <p class="mt-1 text-xs text-ink-secondary">Zet hier geen naam, adres of e-mailadres in.</p>
            <button type="submit" class="mt-3 rounded-full bg-accent px-4 py-1.5 font-bold text-on-accent transition hover:bg-accent-hover">Verstuur</button>
          </div>
          <p data-thanks hidden role="status" class="mt-2 text-ink-secondary">Bedankt, daar hebben we wat aan.</p>
        </div>
      </form>
      <p class="mx-auto max-w-5xl px-4 pt-8 pb-4 text-sm font-semibold text-ink-secondary sm:px-6">
        ${SITE_NAME} vergelijkt prijzen van Landal, Topparken en Molecaten. Links naar een aanbieder zijn affiliate-links:
        boek je via zo'n link, dan krijgen wij een vergoeding van de aanbieder. Jij betaalt niets extra, en het bepaalt
        niet welke parken je hier ziet.
      </p>
      <nav aria-label="Over de site" class="mx-auto flex max-w-5xl flex-wrap gap-x-4 gap-y-2 px-4 pb-8 text-sm sm:px-6"><a href="/weekenden" class="${navLink}">Alle weekenden</a><a href="/parken" class="${navLink}">Alle parken</a><a href="/cijfers" class="${navLink}">Cijfers</a><a href="/last-minute" class="${navLink}">Last minute</a><a href="${HOW_PATH}" class="${navLink}">Zo werkt het</a><a href="/privacy" class="${navLink}">Privacy</a></nav>
    </footer>
    <script>${new Html(pageScript)}</script>
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
${[{ path: '/' }, { path: HOW_PATH }, ...pages].map(entry)}
</urlset>
`.text;
}

// The same as public/_headers gives the app: no other site may show these pages in a frame.
const SECURITY_HEADERS = { 'Content-Security-Policy': "frame-ancestors 'none'", 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff' };
const headers = (type) => ({ 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'public, max-age=600', ...SECURITY_HEADERS });

/**
 * Serves a page path (see isPagePath), the sitemap or robots.txt.
 * @param stylesheet the app's built stylesheet, so the pages look like the app
 */
export async function servePage(db, request, { stylesheet }) {
  const { origin, hostname, pathname } = new URL(request.url);
  if (pathname === '/robots.txt') return new Response(robots(origin), { headers: headers('text/plain') });
  if (pathname === '/sitemap.xml') return new Response(sitemap(origin, await db.pagePaths()), { headers: headers('application/xml') });
  const page = pathname === '/privacy' ? privacyPage(hostname) : pathname === HOW_PATH ? howPage() : await db.page(pathname);
  return new Response(pageDocument(page ?? NOT_FOUND, { url: `${origin}${pathname}`, stylesheet }), {
    status: page ? 200 : 404,
    headers: headers('text/html'),
  });
}

/**
 * What an address is that no file of the built app answers: the app itself (its admin pages live under /beheer), a
 * page's address with a slash too many, which goes to the page, or nothing at all.
 * @returns 'app', { redirect: path } or 'missing'
 */
export function addressKind(pathname) {
  if (pathname === '/' || pathname === '/beheer' || pathname.startsWith('/beheer/')) return 'app';
  const bare = pathname.replace(/\/+$/, '');
  if (bare !== pathname && (bare === '' || isPagePath(bare))) return { redirect: bare || '/' };
  return 'missing';
}

/** The not-found page with its own status, so an address that never existed is not taken for a copy of the search page. */
export function serveNotFound(request, { stylesheet }) {
  const { origin, pathname } = new URL(request.url);
  return new Response(pageDocument(NOT_FOUND, { url: `${origin}${pathname}`, stylesheet }), { status: 404, headers: headers('text/html') });
}

/** A short page instead of an error when the database is out of reach; 503 tells search engines to come back later. */
export function serveUnavailable(request, { stylesheet }) {
  const { origin, pathname } = new URL(request.url);
  return new Response(pageDocument(UNAVAILABLE, { url: `${origin}${pathname}`, stylesheet }), {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '3600', ...SECURITY_HEADERS },
  });
}
