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
import { partyLabel, STANDARD_PARTIES } from '../shared/party.mjs';

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
// The months' average weekend prices are worth a sentence when the cheapest is at least this much under the dearest.
const MONTH_GAP = 0.1;
const SITE_NAME = 'Weekendje weg';

const PAGE_PATH =
  /^\/(?:parken|weekenden|park\/[a-z0-9-]+|weekend\/\d{4}-\d{2}-\d{2}|regio\/[a-z0-9-]+|thema\/[a-z0-9-]+|privacy|sitemap\.xml|robots\.txt)$/;
/** Whether a path is one of these pages (or their sitemap and robots.txt) rather than the app. */
export const isPagePath = (pathname) => PAGE_PATH.test(pathname);

export const weekendPath = (arrival) => `/weekend/${arrival}`;

/**
 * What people look for in a weekend away, each a page with the parks that have the facility (shared/facilities.mjs).
 * `intro` is the page's own opening; what follows comes from the data.
 */
const THEMES = [
  {
    slug: 'subtropisch-zwemparadijs',
    facility: 'zwemparadijs',
    label: 'Subtropisch zwemparadijs',
    name: 'Vakantieparken met een subtropisch zwemparadijs',
    intro: 'Glijbanen, een golfslagbad en lekker warm water: met een zwemparadijs op het park maakt het weer niet uit. Ideaal voor een weekend met kinderen in de herfst of winter.',
  },
  {
    slug: 'overdekt-zwembad',
    facility: 'overdekt-zwembad',
    label: 'Overdekt zwembad',
    name: 'Vakantieparken met een overdekt zwembad',
    intro: 'Zwemmen bij elk weer, zonder eerst de auto in te hoeven: deze parken hebben een overdekt zwembad.',
  },
  {
    slug: 'aan-zee',
    facility: 'kust',
    label: 'Aan de kust',
    name: 'Vakantieparken aan de kust',
    intro: 'Uitwaaien op het strand en daarna terug naar je eigen huisje: deze parken liggen aan de kust.',
  },
  {
    slug: 'in-het-bos',
    facility: 'bos',
    label: 'In het bos',
    name: 'Vakantieparken in het bos',
    intro: 'Wandelen en fietsen vanaf de voordeur: deze parken liggen in een bosrijke omgeving.',
  },
  {
    slug: 'aan-het-water',
    facility: 'water',
    label: 'Aan het water',
    name: 'Vakantieparken aan het water',
    intro: 'Aan een meer of recreatieplas, voor wie wil vissen, varen of gewoon over het water wil uitkijken.',
  },
  {
    slug: 'in-de-heuvels',
    facility: 'heuvels',
    label: 'In het heuvelland',
    name: 'Vakantieparken in het heuvelland',
    intro: 'Wandelen met uitzicht, tussen glooiende heuvels en dalen.',
  },
  {
    slug: 'in-de-bergen',
    facility: 'bergen',
    label: 'In de bergen',
    name: 'Vakantieparken in de bergen',
    intro: 'Bergen, frisse lucht en in de winter vaak sneeuw: deze parken liggen in de bergen.',
  },
  {
    slug: 'met-sauna',
    facility: 'sauna',
    label: 'Sauna op het park',
    name: 'Vakantieparken met een sauna',
    intro: 'Een weekend dat echt ontspannen is, met een sauna op het park.',
  },
  {
    slug: 'met-kinderboerderij',
    facility: 'kinderboerderij',
    label: 'Kinderboerderij',
    name: 'Vakantieparken met een kinderboerderij',
    intro: 'Dieren voeren en knuffelen zonder het park af te gaan: deze parken hebben een kinderboerderij of dierenweide.',
  },
  {
    slug: 'met-indoor-speelparadijs',
    facility: 'indoor-speelparadijs',
    label: 'Indoor speelparadijs',
    name: 'Vakantieparken met een indoor speelparadijs',
    intro: 'Klimmen, glijden en ravotten, ook als het regent: deze parken hebben een indoor speelparadijs.',
  },
  {
    slug: 'met-kinderclub',
    facility: 'kinderclub',
    label: 'Kinderclub',
    name: 'Vakantieparken met een kinderclub',
    intro: 'Met een kinderclub op het park vermaken de kinderen zich, en hebben jullie even tijd voor elkaar.',
  },
  {
    slug: 'met-bowlingbaan',
    facility: 'bowling',
    label: 'Bowlingbaan',
    name: 'Vakantieparken met een bowlingbaan',
    intro: 'Een avondje bowlen zonder de auto te pakken: deze parken hebben een bowlingbaan.',
  },
  {
    slug: 'vuurwerkvrij',
    facility: 'vuurwerkvrij',
    label: 'Vuurwerkvrij',
    name: 'Vuurwerkvrije vakantieparken',
    intro: 'Oud en nieuw zonder knallen: op deze parken is vuurwerk niet toegestaan. Fijn met jonge kinderen of een hond.',
  },
  {
    slug: 'huisjes-met-privezwembad',
    facility: 'huisjes-met-privezwembad',
    label: 'Huisjes met privézwembad',
    name: 'Vakantieparken met huisjes met een privézwembad',
    intro: 'Een eigen zwembad bij je huisje. Let op: de prijzen hier zijn van het goedkoopste huisje van het park; een huisje met privézwembad is groter en duurder.',
  },
  {
    slug: 'nieuwe-parken',
    facility: 'nieuw-park',
    label: 'Nieuwe parken',
    name: 'Nieuwe vakantieparken',
    intro: 'Alles nog fris en nieuw: deze parken zijn pas geopend.',
  },
];
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
// Regions a provider misspells, as people search for them.
const REGION_SPELLING = { Voralberg: 'Vorarlberg' };
/** "Zeeland" from Landal's "Zeeland (NL)", so the providers' spellings of a region come together. */
export const regionOf = (park) => {
  const region = park.region?.replace(/\s*\([A-Z]{2}\)$/, '').trim();
  return REGION_SPELLING[region] ?? (region || null);
};
const regionPath = (region) => `/regio/${slugify(region)}`;
const placeOf = (park) => [park.city, countryName(park.country)].filter(Boolean).join(', ');
const cheapestOf = (weekends) => weekends.reduce((best, weekend) => (!best || weekend.priceCents < best.priceCents ? weekend : best), null);
const discountPercent = (weekend) => Math.round((weekend.discount ?? 0) * 100);
const stay = (weekend) => `${nights(weekend)} nachten · ${partyLabel(PAGE_PARTY)} · incl. toeslagen`;
const providersOf = (parks) => joinAnd([...new Set(parks.map((park) => providerName(park.provider)))]);

const link = 'font-medium text-accent hover:underline';
const chip = 'rounded-full bg-surface px-3 py-1 text-sm ring-1 ring-line';

function compared(weekend) {
  if (weekend.discount == null) return '';
  const percent = discountPercent(weekend);
  if (percent > 0) {
    return html`<span class="rounded-full bg-good-wash px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-good-ink">${percent}% onder normaal</span>`;
  }
  return html`<span class="text-xs whitespace-nowrap text-ink-muted">${percent === 0 ? 'normale prijs' : `${-percent}% boven normaal`}</span>`;
}

const WEATHER_CREDIT = 'Weersverwachting van MET Norway (yr.no).';

/** Only good weather is ever passed on (see server/weather.mjs); a forecast, and said so. */
const weatherChip = (weather) =>
  weather &&
  html`<span class="rounded-full bg-warning-wash px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-warning-ink" title="${WEATHER_CREDIT}"><span aria-hidden="true">☀</span> Zonnig verwacht, tot ${weather.maxTemp} °C</span>`;

const occasionChips = (occasions) =>
  occasions.map((occasion) => html`<span class="rounded-full bg-accent-wash px-2 py-0.5 text-xs font-medium whitespace-nowrap text-accent">${occasion.label}</span>`);

function bookButton(park, weekend, source) {
  const provider = providerName(park.provider);
  return html`<a href="${trackedBookingUrl(park, weekend, PAGE_PARTY, source)}" target="_blank" rel="sponsored noopener" class="inline-flex shrink-0 items-center justify-center rounded-lg bg-accent px-4 py-2 font-semibold text-on-accent shadow-sm transition hover:bg-accent-hover">Boek bij ${provider}<span class="sr-only"> (opent ${provider} in een nieuw tabblad)</span></a>`;
}

/** @param trail [href, label] pairs leading up to the page */
const breadcrumb = (...trail) =>
  html`<nav aria-label="Kruimelpad" class="text-sm text-ink-secondary">${trail.map(([href, label]) => html`<a href="${href}" class="${link}">${label}</a> › `)}</nav>`;

function rating(park) {
  const { rating: score, ratingCount } = park.googleRating ?? {};
  if (!score) return '';
  const reviews = ratingCount ? ` (${ratingCount.toLocaleString('nl-NL')} recensies)` : '';
  return html`<span><span aria-hidden="true" class="text-star">★</span> ${score.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} op Google${reviews}</span>`;
}

const photo = (src, alt, classes = 'aspect-[3/2]') =>
  html`<img src="${src}" alt="${alt}" loading="lazy" decoding="async" class="${classes} w-full bg-line object-cover" />`;

/** A park as a card on the region and theme pages: photo, place, its cheapest weekend and a way to book it. */
function parkCard(park, { pathOf, source }) {
  const cheapest = cheapestOf(park.weekends);
  return html`<li class="flex flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
    ${park.imageUrl && photo(park.imageUrl, fullName(park))}
    <div class="flex flex-1 flex-col gap-1 p-4">
      <a href="${pathOf(park)}" class="${link}">${fullName(park)}</a>
      <p class="flex flex-wrap gap-x-2 text-sm text-ink-secondary"><span>${placeOf(park)}</span>${rating(park)}</p>
      ${
        cheapest
          ? html`<p class="mt-auto flex flex-wrap items-center gap-2 pt-3"><span class="text-2xl font-bold tabular-nums">${formatEuros(cheapest.priceCents)}</span> ${compared(cheapest)}</p>
            <p class="mb-3 text-xs text-ink-secondary">${formatWeekend(cheapest)} · ${partyLabel(PAGE_PARTY)}</p>
            ${bookButton(park, cheapest, source)}`
          : html`<p class="mt-auto pt-3 text-sm text-ink-secondary">Geen vrij weekend voor ${partyLabel(PAGE_PARTY)} in de komende maanden</p>`
      }
    </div>
  </li>`;
}

/** Parks with a free weekend first, cheapest first. */
const byPrice = (parks) =>
  [...parks].sort((a, b) => (cheapestOf(a.weekends)?.priceCents ?? Infinity) - (cheapestOf(b.weekends)?.priceCents ?? Infinity));

/** The cheapest parks as cards, the others as a list: a page with a hundred cards weighs too much. */
function parkList(parks, { pathOf, source }) {
  const sorted = byPrice(parks);
  const row = (park) => {
    const from = cheapestOf(park.weekends);
    return html`<li class="py-1.5"><a href="${pathOf(park)}" class="${link}">${fullName(park)}</a> <span class="text-sm text-ink-secondary">· ${placeOf(park)} · ${from ? `vanaf ${formatEuros(from.priceCents)}` : 'geen plek'}</span></li>`;
  };
  return html`<ul class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${sorted.slice(0, PARK_CARDS).map((park) => parkCard(park, { pathOf, source }))}</ul>
    ${sorted.length > PARK_CARDS && html`<h2 class="mt-8 text-xl font-semibold">Meer parken</h2><ul class="mt-2 columns-1 gap-8 sm:columns-2">${sorted.slice(PARK_CARDS).map(row)}</ul>`}`;
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
function parkPage(park, { pathOf, nearby, updated, accommodations, places, weekendCount, hasRegionPage, themes: themeOf, occasionsOf }) {
  const name = fullName(park);
  const place = placeOf(park);
  const region = regionOf(park);
  const cheapest = cheapestOf(park.weekends);
  const groups = facilityGroups().map((group) => ({ ...group, options: group.options.filter((option) => park.facilities.includes(option.id)) }));
  const todo = groups.filter((group) => group.options.length && group.name !== SETTING_GROUP && group.name !== GENERAL_GROUP);
  const general = groups.find((group) => group.name === GENERAL_GROUP)?.options ?? [];
  // A fireworks-free park is also one with little; saying both is saying it twice.
  const goodToKnow = general.filter((option) => !(option.id === 'vuurwerkluw' && park.facilities.includes('vuurwerkvrij')));
  const themes = park.facilities.map((id) => themeOf.get(id)).filter(Boolean);
  const shownAccommodations = [...accommodations].sort((a, b) => (sleeps(a) ?? 99) - (sleeps(b) ?? 99)).slice(0, SHOWN_ACCOMMODATIONS);
  const intro = parkIntro(park, { accommodations, weekendCount });
  const appLink = `/?${new URLSearchParams({ search: park.name, minDiscountPercent: '0' })}`;

  const facility = (option) => {
    const theme = themeOf.get(option.id);
    return html`<li>${theme ? html`<a href="${themePath(theme)}" class="${link}">${option.name}</a>` : option.name}</li>`;
  };

  const weekendRow = (weekend) => {
    const advice = ['book', 'wait'].includes(weekend.advice?.verdict) ? weekend.advice : null;
    return html`<li class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div class="min-w-0 basis-full sm:basis-0 sm:flex-1">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1"><a href="${weekendPath(weekend.arrival)}" class="${link}">${formatWeekend(weekend)}</a> ${compared(weekend)} ${weatherChip(weekend.weather)} ${occasionChips(occasionsOf(weekend))}</p>
        ${advice && html`<p class="mt-1 text-sm ${advice.verdict === 'book' ? 'text-good-ink' : 'text-ink-secondary'}">${verdictLabel(advice.verdict)}: ${reasonText(advice.reasons[0] ?? {})}</p>`}
      </div>
      <p class="flex-1 text-lg font-bold tabular-nums sm:flex-none">${formatEuros(weekend.priceCents)}</p>
      ${bookButton(park, weekend, 'parkpagina')}
    </li>`;
  };

  const accommodationCard = (accommodation) => {
    const facts = accommodation.facts.filter((fact) => !/geschikt voor \d+ personen/i.test(fact)).slice(0, 4);
    const people = sleeps(accommodation);
    return html`<li class="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
      ${accommodation.photos[0] && photo(accommodation.photos[0], `${accommodation.name} bij ${name}`)}
      <div class="p-3">
        <h3 class="font-semibold">${accommodation.name}</h3>
        <p class="text-sm text-ink-secondary">${[people && `${people} personen`, ...facts].filter(Boolean).join(' · ')}</p>
      </div>
    </li>`;
  };

  const placeCard = (spot) => {
    const credit = spot.image && [spot.image.author, spot.image.license].filter(Boolean).join(', ');
    // Wikidata often describes a place by its kind alone ("pretpark"): then the kind says it already.
    const description = spot.description && spot.description.toLowerCase() !== spot.kind.toLowerCase() ? spot.description : null;
    return html`<li class="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
      ${spot.image && photo(spot.image.url, spot.name)}
      <div class="p-3">
        <p class="text-xs font-medium tracking-wide text-ink-secondary uppercase">${spot.kind} · ${spot.km.toLocaleString('nl-NL')} km</p>
        <h3 class="font-semibold">${spot.name}</h3>
        ${description && html`<p class="text-sm text-ink-secondary">${description}</p>`}
        ${credit && html`<p class="mt-1 text-xs text-ink-muted">Foto: <a href="${spot.image.page}" class="hover:underline" rel="nofollow">${credit}</a></p>`}
      </div>
    </li>`;
  };

  const nearbyRow = ({ park: other, km }) => {
    const from = cheapestOf(other.weekends);
    return html`<li class="py-2"><a href="${pathOf(other)}" class="${link}">${fullName(other)}</a> <span class="text-sm text-ink-secondary">· ${km} km · ${from ? `vanaf ${formatEuros(from.priceCents)}` : 'geen plek'}</span></li>`;
  };

  const body = html`
    ${breadcrumb(['/parken', 'Alle parken'], ...(hasRegionPage ? [[regionPath(region), region]] : []))}
    <h1 class="mt-2 text-3xl font-bold tracking-tight">${name}</h1>
    <p class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-ink-secondary">${place && html`<span>${place}</span>`}<span>bij ${providerName(park.provider)}</span>${rating(park)}</p>
    ${park.imageUrl && html`<img src="${park.imageUrl}" alt="${name}" class="mt-5 aspect-[2/1] w-full rounded-2xl bg-line object-cover sm:aspect-[3/1]" />`}
    ${
      cheapest
        ? html`<section aria-labelledby="cheapest" class="mt-6 flex flex-col gap-4 rounded-2xl bg-surface p-5 ring-1 ring-line sm:flex-row sm:items-center">
            <div class="flex-1">
              <h2 id="cheapest" class="text-sm font-medium text-ink-secondary">Goedkoopste weekend voor ${partyLabel(PAGE_PARTY)}</h2>
              <p class="mt-1 flex flex-wrap items-center gap-2 font-semibold">${formatWeekend(cheapest)} ${weatherChip(cheapest.weather)} ${occasionChips(occasionsOf(cheapest))}</p>
              <p class="mt-1 flex flex-wrap items-center gap-2"><span class="text-3xl font-bold tabular-nums">${formatEuros(cheapest.priceCents)}</span> ${compared(cheapest)}</p>
              <p class="text-xs text-ink-secondary">${stay(cheapest)}</p>
            </div>
            ${bookButton(park, cheapest, 'parkpagina')}
          </section>`
        : html`<p class="mt-6 rounded-2xl bg-surface p-5 ring-1 ring-line">Voor ${partyLabel(PAGE_PARTY)} vonden we bij ${name} geen vrij weekend in de komende maanden. Bekijk de parken in de buurt, of <a href="/" class="${link}">zoek een ander weekend</a>.</p>`
    }
    ${intro.length > 0 && html`<p class="mt-6 max-w-3xl leading-relaxed">${intro.join(' ')}</p>`}
    ${
      todo.length > 0 &&
      html`<section aria-labelledby="todo" class="mt-8">
        <h2 id="todo" class="text-xl font-semibold">Op het park</h2>
        <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${todo.map(
          (group) => html`<div class="rounded-2xl bg-surface p-4 ring-1 ring-line"><h3 class="font-semibold">${group.name}</h3><ul class="mt-1 space-y-0.5 text-sm text-ink-secondary">${group.options.map(facility)}</ul></div>`,
        )}</div>
        ${goodToKnow.length > 0 && html`<p class="mt-3 text-sm text-ink-secondary">Goed om te weten: ${joinAnd(goodToKnow.map((option) => option.name.toLowerCase()))}.</p>`}
      </section>`
    }
    ${
      places.length > 0 &&
      html`<section aria-labelledby="around" class="mt-8">
        <h2 id="around" class="text-xl font-semibold">In de omgeving</h2>
        <p class="mt-1 text-sm text-ink-secondary">Uitjes binnen 15 kilometer, hemelsbreed gemeten vanaf het park.</p>
        <ul class="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${places.map(placeCard)}</ul>
      </section>`
    }
    ${
      shownAccommodations.length > 0 &&
      html`<section aria-labelledby="stay" class="mt-8">
        <h2 id="stay" class="text-xl font-semibold">Huisjes</h2>
        <ul class="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">${shownAccommodations.map(accommodationCard)}</ul>
        ${accommodations.length > shownAccommodations.length && html`<p class="mt-2 text-sm text-ink-secondary">En nog ${count(accommodations.length - shownAccommodations.length, 'ander soort huisje', 'andere soorten huisjes')}.</p>`}
      </section>`
    }
    ${
      cheapest &&
      html`<section aria-labelledby="weekends" class="mt-8">
        <h2 id="weekends" class="text-xl font-semibold">Prijzen per weekend</h2>
        <p class="mt-1 text-sm text-ink-secondary">Vrijdag tot maandag voor ${partyLabel(PAGE_PARTY)}: het goedkoopste huisje van het park, inclusief toeslagen. Bijgewerkt op ${updated}.</p>
        <ul class="mt-2 divide-y divide-line">${park.weekends.map(weekendRow)}</ul>
        ${park.weekends.some((weekend) => weekend.weather) && html`<p class="text-xs text-ink-muted">${WEATHER_CREDIT}</p>`}
      </section>`
    }
    <p class="mt-6 text-sm"><a href="${appLink}" class="${link}">Met meer personen, kinderen of een hond? Bekijk ${name} voor jouw gezelschap</a></p>
    ${
      nearby.length > 0 &&
      html`<section aria-labelledby="nearby" class="mt-8">
        <h2 id="nearby" class="text-xl font-semibold">Parken in de buurt</h2>
        <ul class="mt-2 divide-y divide-line">${nearby.map(nearbyRow)}</ul>
      </section>`
    }
    ${
      (hasRegionPage || themes.length > 0) &&
      html`<nav aria-label="Meer zoals dit" class="mt-8"><h2 class="text-xl font-semibold">Meer zoals dit</h2><ul class="mt-3 flex flex-wrap gap-2">
        ${hasRegionPage && html`<li><a href="${regionPath(region)}" class="${chip} ${link}">Alle parken in ${region}</a></li>`}
        ${themes.map((theme) => html`<li><a href="${themePath(theme)}" class="${chip} ${link}">${theme.name}</a></li>`)}
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
  const fireworksFree = occasions.some((occasion) => occasion.label === 'Oud en nieuw') && [...themes.values()].find((theme) => theme.facility === 'vuurwerkvrij');
  // Per theme the cheapest park that has it this weekend and is not named for another theme yet.
  const named = new Set();
  const themed = [...themes.values()]
    .map((theme) => {
      const offer = sorted.find(({ park }) => park.facilities.includes(theme.facility) && !named.has(park.code));
      if (offer) named.add(offer.park.code);
      return { theme, offer };
    })
    .filter(({ offer }) => offer);

  const dealCard = ({ park, weekend: offer }) =>
    html`<li class="flex flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
      ${park.imageUrl && photo(park.imageUrl, fullName(park))}
      <div class="flex flex-1 flex-col gap-2 p-4">
        <a href="${pathOf(park)}" class="${link}">${fullName(park)}</a>
        <span class="text-sm text-ink-secondary">${placeOf(park)}</span>
        <p class="mt-auto flex flex-wrap items-center gap-2"><span class="text-2xl font-bold tabular-nums">${formatEuros(offer.priceCents)}</span> ${compared(offer)}</p>
        ${park.baselineCents && html`<p class="text-xs text-ink-secondary">normaal ${formatEuros(park.baselineCents)}</p>`}
        ${offer.weather && html`<p>${weatherChip(offer.weather)}</p>`}
        ${bookButton(park, offer, 'weekendpagina')}
      </div>
    </li>`;

  const offerRow = ({ park, weekend: offer }) =>
    html`<li class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div class="min-w-0 basis-full sm:basis-0 sm:flex-1">
        <a href="${pathOf(park)}" class="${link}">${fullName(park)}</a>
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-secondary">${placeOf(park)} ${compared(offer)} ${weatherChip(offer.weather)}</p>
      </div>
      <p class="flex-1 text-lg font-bold tabular-nums sm:flex-none">${formatEuros(offer.priceCents)}</p>
      ${bookButton(park, offer, 'weekendpagina')}
    </li>`;

  const neighbour = (other, label) =>
    other && html`<a href="${weekendPath(other.arrival)}" class="${link}">${label} ${formatWeekend(other)}</a>`;

  const body = html`
    ${breadcrumb(['/weekenden', 'Alle weekenden'])}
    <h1 class="mt-2 text-3xl font-bold tracking-tight">Weekendje weg ${range}</h1>
    <p class="mt-2 max-w-2xl text-ink-secondary">${offers.length} vakantieparken hebben nog plek van ${formatWeekend(weekend)} voor ${partyLabel(PAGE_PARTY)}, vanaf ${from}. ${deals.length > 0 && `${dealCount} minstens ${Math.round(DEAL_SHARE * 100)}% goedkoper dan normaal.`}</p>
    ${
      (occasions.length > 0 || sunny > 0) &&
      html`<div class="mt-4 flex max-w-2xl flex-col gap-2 rounded-2xl bg-surface p-4 ring-1 ring-line">
        ${occasions.length > 0 && html`<p class="flex flex-wrap items-center gap-2">${occasionChips(occasions)} <span>${occasions.map((occasion) => occasion.text).join(' ')}</span>${fireworksFree && html` <a href="${themePath(fireworksFree)}" class="${link}">Vuurwerkvrije parken</a>`}</p>`}
        ${sunny > 0 && html`<p class="flex flex-wrap items-center gap-2">${weatherChip({ maxTemp: Math.max(...offers.filter((offer) => offer.weekend.weather).map((offer) => offer.weekend.weather.maxTemp)) })} <span>Bij ${count(sunny, 'park', 'parken')} wordt het een zonnig en droog weekend. <span class="text-xs text-ink-muted">${WEATHER_CREDIT}</span></span></p>`}
      </div>`
    }
    ${
      deals.length > 0 &&
      html`<section aria-labelledby="deals" class="mt-6">
        <h2 id="deals" class="text-xl font-semibold">Grootste buitenkansjes</h2>
        <ul class="mt-3 grid gap-4 sm:grid-cols-3">${deals.slice(0, TOP_DEALS).map(dealCard)}</ul>
      </section>`
    }
    ${
      themed.length > 0 &&
      html`<section aria-labelledby="themes" class="mt-8">
        <h2 id="themes" class="text-xl font-semibold">Dit weekend het goedkoopst</h2>
        <ul class="mt-2 grid gap-x-8 sm:grid-cols-2">${themed.map(
          ({ theme, offer }) => html`<li class="border-b border-line py-2"><a href="${themePath(theme)}" class="text-sm text-ink-secondary hover:underline">${theme.label}</a>
            <p class="flex items-baseline justify-between gap-3"><a href="${pathOf(offer.park)}" class="${link}">${fullName(offer.park)}</a> <span class="font-semibold tabular-nums">${formatEuros(offer.weekend.priceCents)}</span></p></li>`,
        )}</ul>
      </section>`
    }
    <section aria-labelledby="all" class="mt-8">
      <h2 id="all" class="text-xl font-semibold">${sorted.length > LISTED_OFFERS ? `De ${LISTED_OFFERS} goedkoopste parken` : 'Alle parken met plek, goedkoopste eerst'}</h2>
      <p class="mt-1 text-sm text-ink-secondary">${stay(weekend)}. Het goedkoopste huisje per park, bijgewerkt op ${updated}.</p>
      <ul class="mt-2 divide-y divide-line">${sorted.slice(0, LISTED_OFFERS).map(offerRow)}</ul>
    </section>
    <p class="mt-6 text-sm"><a href="${appLink}" class="${link}">${sorted.length > LISTED_OFFERS ? `Bekijk alle ${sorted.length} parken van dit weekend, ook voor jouw gezelschap` : 'Met meer personen, kinderen of een hond? Zoek dit weekend voor jouw gezelschap'}</a></p>
    <nav aria-label="Andere weekenden" class="mt-8 flex flex-wrap justify-between gap-4 text-sm">${neighbour(previous, '←')}${neighbour(next, '→')}</nav>`;

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

const placeTile = (spot) =>
  html`<li class="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
    ${spot.image && photo(spot.image.url, spot.name)}
    <div class="p-3"><p class="text-xs font-medium tracking-wide text-ink-secondary uppercase">${spot.kind}</p><h3 class="font-semibold">${spot.name}</h3>
    ${spot.image && html`<p class="mt-1 text-xs text-ink-muted">Foto: <a href="${spot.image.page}" class="hover:underline" rel="nofollow">${[spot.image.author, spot.image.license].filter(Boolean).join(', ')}</a></p>`}</div>
  </li>`;

function listIntro(parks) {
  const priced = parks.filter((park) => park.weekends.length);
  const cheapest = cheapestOf(priced.map((park) => cheapestOf(park.weekends)));
  const deals = priced.filter((park) => park.weekends.some((weekend) => (weekend.discount ?? 0) >= DEAL_SHARE)).length;
  return [
    cheapest && `Een weekendje weg voor ${partyLabel(PAGE_PARTY)} kost er nu vanaf ${formatEuros(cheapest.priceCents)} (${formatWeekend(cheapest)}).`,
    deals > 0 && `${count(deals, 'park heeft', 'parken hebben')} een weekend dat minstens ${Math.round(DEAL_SHARE * 100)}% goedkoper is dan normaal.`,
  ].filter(Boolean);
}

function regionPage(region, parks, { pathOf, surroundings }) {
  const pools = [
    ['zwemparadijs', 'een subtropisch zwemparadijs'],
    ['overdekt-zwembad', 'een overdekt zwembad'],
  ]
    .map(([id, what]) => ({ what, number: parks.filter((park) => park.facilities.includes(id)).length }))
    .filter(({ number }) => number > 0);
  const settings = settingCounts(parks);
  const places = regionPlaces(parks, surroundings);
  const intro = [
    `In ${region} liggen ${parks.length} vakantieparken van ${providersOf(parks)}.`,
    settings.length > 0 && `Daarvan liggen er ${joinAnd(settings)}.`,
    pools.length > 0 &&
      `Bij ${count(pools[0].number, 'park', 'parken')} is er ${pools[0].what}${pools[1] ? `, bij ${pools[1].number} ${pools[1].what}` : ''}.`,
    ...listIntro(parks),
  ].filter(Boolean);
  const body = html`
    ${breadcrumb(['/parken', 'Alle parken'])}
    <h1 class="mt-2 text-3xl font-bold tracking-tight">Vakantieparken in ${region}</h1>
    <p class="mt-2 max-w-3xl leading-relaxed text-ink-secondary">${intro.join(' ')}</p>
    ${parkList(parks, { pathOf, source: 'regiopagina' })}
    ${
      places.length > 0 &&
      html`<section aria-labelledby="todo" class="mt-10">
        <h2 id="todo" class="text-xl font-semibold">Uitjes in ${region}</h2>
        <p class="mt-1 text-sm text-ink-secondary">Wat de meeste parken hier in de buurt hebben.</p>
        <ul class="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-3">${places.map(placeTile)}</ul>
      </section>`
    }`;
  return {
    path: regionPath(region),
    title: `Vakantieparken in ${region}: weekendje weg en buitenkansjes`,
    description: `${parks.length} vakantieparken in ${region} met de prijs van elk komend weekend. ${listIntro(parks)[0] ?? ''}`.trim(),
    image: parks.find((park) => park.imageUrl)?.imageUrl ?? null,
    body: body.text,
  };
}

function themePage(theme, parks, { pathOf, themes }) {
  const regions = [...Map.groupBy(parks.filter(regionOf), regionOf)]
    .filter(([, list]) => list.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3)
    .map(([region]) => region);
  const intro = [
    `We volgen ${count(parks.length, 'park', 'parken')} van ${providersOf(parks)} die hierbij passen.`,
    regions.length > 0 && `De meeste liggen in ${joinAnd(regions)}.`,
    ...listIntro(parks),
  ].filter(Boolean);
  const body = html`
    ${breadcrumb(['/parken', 'Alle parken'])}
    <h1 class="mt-2 text-3xl font-bold tracking-tight">${theme.name}</h1>
    <p class="mt-2 max-w-3xl leading-relaxed">${theme.intro}</p>
    <p class="mt-2 max-w-3xl leading-relaxed text-ink-secondary">${intro.join(' ')}</p>
    ${parkList(parks, { pathOf, source: 'themapagina' })}
    <nav aria-label="Andere thema's" class="mt-10"><h2 class="text-xl font-semibold">Andere thema's</h2><ul class="mt-3 flex flex-wrap gap-2">${[...themes.values()].filter((other) => other !== theme).map(
      (other) => html`<li><a href="${themePath(other)}" class="${chip} ${link}">${other.label}</a></li>`,
    )}</ul></nav>`;
  return {
    path: themePath(theme),
    title: `${theme.name}: weekendje weg met de laagste prijzen`,
    description: `${theme.name}: ${count(parks.length, 'park', 'parken')} met de prijs van elk komend weekend. ${listIntro(parks)[0] ?? ''}`.trim(),
    image: parks.find((park) => park.imageUrl)?.imageUrl ?? null,
    body: body.text,
  };
}

function parksIndex(parks, { pathOf, regions, themes }) {
  const byCountry = Map.groupBy(parks, (park) => countryName(park.country) || 'Overig');
  const countries = [...byCountry].sort((a, b) => b[1].length - a[1].length);
  const parkRow = (park) => {
    const from = cheapestOf(park.weekends);
    return html`<li class="py-1.5"><a href="${pathOf(park)}" class="${link}">${fullName(park)}</a> <span class="text-sm text-ink-secondary">${park.city && `· ${park.city} `}· ${from ? `vanaf ${formatEuros(from.priceCents)}` : 'geen plek'}</span></li>`;
  };
  const chips = (items) =>
    html`<ul class="mt-3 flex flex-wrap gap-2">${items.map(([href, label, number]) => html`<li><a href="${href}" class="${chip} ${link}">${label} <span class="text-ink-secondary">${number}</span></a></li>`)}</ul>`;
  const body = html`
    <h1 class="text-3xl font-bold tracking-tight">Alle vakantieparken</h1>
    <p class="mt-2 max-w-2xl text-ink-secondary">${parks.length} parken van Landal, Topparken en Molecaten, met de laagste weekendprijs voor ${partyLabel(PAGE_PARTY)} (vrijdag tot maandag).</p>
    <section aria-labelledby="regions" class="mt-6"><h2 id="regions" class="text-xl font-semibold">Per regio</h2>${chips(regions.map(([region, list]) => [regionPath(region), region, list.length]))}</section>
    <section aria-labelledby="themes" class="mt-6"><h2 id="themes" class="text-xl font-semibold">Per thema</h2>${chips(themes.map(([theme, list]) => [themePath(theme), theme.label, list.length]))}</section>
    ${countries.map(
      ([country, list]) => html`<section class="mt-8">
        <h2 class="text-xl font-semibold">${country}</h2>
        <ul class="mt-2 columns-1 gap-8 sm:columns-2">${[...list].sort((a, b) => fullName(a).localeCompare(fullName(b), 'nl')).map(parkRow)}</ul>
      </section>`,
    )}`;
  return {
    path: '/parken',
    title: 'Alle vakantieparken: weekendprijzen bij Landal, Topparken en Molecaten',
    description: `${parks.length} vakantieparken in Nederland en daarbuiten, per regio en per thema, elk met de laagste prijs voor een weekendje weg en de prijs van elk komend weekend.`,
    image: null,
    body: body.text,
  };
}

function weekendsIndex(weekends) {
  const row = ({ weekend, offers }) => {
    const cheapest = cheapestOf(offers.map((offer) => offer.weekend));
    const deals = offers.filter((offer) => (offer.weekend.discount ?? 0) >= DEAL_SHARE).length;
    return html`<li class="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
      <a href="${weekendPath(weekend.arrival)}" class="${link}">${formatWeekend(weekend)}</a>
      <span class="text-sm text-ink-secondary">${offers.length} parken · vanaf ${formatEuros(cheapest.priceCents)}${deals > 0 && ` · ${deals} ${deals === 1 ? 'buitenkansje' : 'buitenkansjes'}`}</span>
    </li>`;
  };
  const body = html`
    <h1 class="text-3xl font-bold tracking-tight">Alle weekenden</h1>
    <p class="mt-2 max-w-2xl text-ink-secondary">Elk komend weekend (vrijdag tot maandag) met het aantal vakantieparken dat nog plek heeft voor ${partyLabel(PAGE_PARTY)} en de laagste prijs.</p>
    <ul class="mt-4 divide-y divide-line">${weekends.map(row)}</ul>`;
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
};

/**
 * Every page: one per park, one per weekend, one per region and theme with enough parks, and the lists. A park
 * without a free weekend keeps its page while there is something to tell about it.
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

  const regions = [...Map.groupBy(everyPark.filter(regionOf), regionOf)]
    .filter(([, list]) => list.length >= MIN_LISTED_PARKS)
    .sort((a, b) => b[1].length - a[1].length);
  const regionsWithPage = new Set(regions.map(([region]) => region));
  const themes = THEMES.map((theme) => [theme, everyPark.filter((park) => park.facilities.includes(theme.facility))]).filter(
    ([, list]) => list.length >= MIN_LISTED_PARKS,
  );
  const themeOf = new Map(themes.map(([theme]) => [theme.facility, theme]));

  return [
    parksIndex(everyPark, { pathOf, regions, themes }),
    weekendsIndex(weekends),
    ...everyPark.map((park) =>
      parkPage(park, {
        pathOf,
        nearby: nearbyOf(park),
        updated,
        accommodations: accommodationsOf(park),
        places: details.surroundings.get(park.code) ?? [],
        weekendCount: weekends.length,
        hasRegionPage: regionsWithPage.has(regionOf(park)),
        themes: themeOf,
        occasionsOf: details.occasionsOf,
      }),
    ),
    ...weekends.map(({ weekend, offers }, index) =>
      weekendPage(weekend, offers, {
        pathOf,
        previous: weekends[index - 1]?.weekend,
        next: weekends[index + 1]?.weekend,
        updated,
        themes: themeOf,
        occasions: details.occasionsOf(weekend),
      }),
    ),
    ...regions.map(([region, list]) => regionPage(region, list, { pathOf, surroundings: details.surroundings })),
    ...themes.map(([theme, list]) => themePage(theme, list, { pathOf, themes: themeOf })),
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
        <li>De kaart komt van OpenStreetMap, foto's van de aanbieders en recensies van Google. Zoals bij elke website zien zij je IP-adres.</li>
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
    <meta name="theme-color" content="#f5f4f0" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0d0d0d" media="(prefers-color-scheme: dark)" />
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
      <div class="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <a href="/" class="flex items-center gap-2 font-semibold"><img src="/favicon.svg" alt="" class="size-7" />${SITE_NAME}</a>
        <nav aria-label="Hoofdmenu" class="flex gap-4 text-sm">
          <a href="/weekenden" class="${link}">Weekenden</a>
          <a href="/parken" class="${link}">Parken</a>
        </nav>
        <a href="/" class="ml-auto rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent hover:bg-accent-hover">Zoek een weekend</a>
      </div>
    </header>
    <main class="mx-auto max-w-4xl px-4 py-6 sm:px-6">${new Html(body)}</main>
    <footer class="border-t border-line bg-surface">
      <p class="mx-auto max-w-4xl px-4 py-6 text-sm text-ink-secondary sm:px-6">
        ${SITE_NAME} vergelijkt prijzen van Landal, Topparken en Molecaten. Links naar een aanbieder zijn affiliate-links:
        boek je via zo'n link, dan krijgen wij een vergoeding van de aanbieder. Jij betaalt niets extra, en het bepaalt
        niet welke parken je hier ziet.
      </p>
      <nav aria-label="Over de site" class="mx-auto max-w-4xl px-4 pb-6 text-sm sm:px-6"><a href="/privacy" class="${link}">Privacy</a></nav>
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
