// Public pages per park and per weekend: what search engines find, and where visitors from there land. Built after
// each round from the two-person overview and kept as finished HTML, so the Worker serves one with a single query and
// hardly any CPU. They carry the app's stylesheet but not its script: fast, readable without JavaScript, and every
// price on them leads to the provider through the tracked booking link.
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
const SITE_NAME = 'Weekendje weg';

const PAGE_PATH = /^\/(?:parken|weekenden|park\/[a-z0-9-]+|weekend\/\d{4}-\d{2}-\d{2}|privacy|sitemap\.xml|robots\.txt)$/;
/** Whether a path is one of these pages (or their sitemap and robots.txt) rather than the app. */
export const isPagePath = (pathname) => PAGE_PATH.test(pathname);

export const weekendPath = (arrival) => `/weekend/${arrival}`;

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

/** "Landal Gulpen": the brand in front, unless the park's name already carries it. */
const fullName = (park) => {
  const brand = brandName(park.brand);
  return park.name.toLowerCase().includes(brand.toLowerCase()) ? park.name : `${brand} ${park.name}`;
};
const placeOf = (park) => [park.city, countryName(park.country)].filter(Boolean).join(', ');
const cheapestOf = (weekends) => weekends.reduce((best, weekend) => (!best || weekend.priceCents < best.priceCents ? weekend : best), null);
const discountPercent = (weekend) => Math.round((weekend.discount ?? 0) * 100);
const stay = (weekend) => `${nights(weekend)} nachten · ${partyLabel(PAGE_PARTY)} · incl. toeslagen`;

const link = 'font-medium text-accent hover:underline';

function compared(weekend) {
  if (weekend.discount == null) return '';
  const percent = discountPercent(weekend);
  if (percent > 0) {
    return html`<span class="rounded-full bg-good-wash px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-good-ink">${percent}% onder normaal</span>`;
  }
  return html`<span class="text-xs whitespace-nowrap text-ink-muted">${percent === 0 ? 'normale prijs' : `${-percent}% boven normaal`}</span>`;
}

function bookButton(park, weekend, source) {
  const provider = providerName(park.provider);
  return html`<a href="${trackedBookingUrl(park, weekend, PAGE_PARTY, source)}" target="_blank" rel="sponsored noopener" class="inline-flex shrink-0 items-center justify-center rounded-lg bg-accent px-4 py-2 font-semibold text-on-accent shadow-sm transition hover:bg-accent-hover">Boek bij ${provider}<span class="sr-only"> (opent ${provider} in een nieuw tabblad)</span></a>`;
}

const breadcrumb = (href, label) =>
  html`<nav aria-label="Kruimelpad" class="text-sm text-ink-secondary"><a href="${href}" class="${link}">${label}</a> ›</nav>`;

function rating(park) {
  const { rating: score, ratingCount } = park.googleRating ?? {};
  if (!score) return '';
  const count = ratingCount ? ` (${ratingCount.toLocaleString('nl-NL')} recensies)` : '';
  return html`<span><span aria-hidden="true" class="text-star">★</span> ${score.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} op Google${count}</span>`;
}

function parkPage(park, { pathOf, nearby, updated }) {
  const name = fullName(park);
  const place = placeOf(park);
  const cheapest = cheapestOf(park.weekends);
  const facilities = facilityGroups()
    .flatMap((group) => group.options)
    .filter((option) => park.facilities?.includes(option.id))
    .map((option) => option.name);
  const appLink = `/?${new URLSearchParams({ search: park.name, minDiscountPercent: '0' })}`;

  const weekendRow = (weekend) => {
    const advice = ['book', 'wait'].includes(weekend.advice?.verdict) ? weekend.advice : null;
    return html`<li class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div class="min-w-0 basis-full sm:basis-0 sm:flex-1">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1"><a href="${weekendPath(weekend.arrival)}" class="${link}">${formatWeekend(weekend)}</a> ${compared(weekend)}</p>
        ${advice && html`<p class="mt-1 text-sm ${advice.verdict === 'book' ? 'text-good-ink' : 'text-ink-secondary'}">${verdictLabel(advice.verdict)}: ${reasonText(advice.reasons[0] ?? {})}</p>`}
      </div>
      <p class="flex-1 text-lg font-bold tabular-nums sm:flex-none">${formatEuros(weekend.priceCents)}</p>
      ${bookButton(park, weekend, 'parkpagina')}
    </li>`;
  };

  const nearbyRow = ({ park: other, km }) => {
    const from = cheapestOf(other.weekends);
    return html`<li class="py-2"><a href="${pathOf(other)}" class="${link}">${fullName(other)}</a> <span class="text-sm text-ink-secondary">· ${km} km · ${from ? `vanaf ${formatEuros(from.priceCents)}` : 'geen plek'}</span></li>`;
  };

  const body = html`
    ${breadcrumb('/parken', 'Alle parken')}
    <h1 class="mt-2 text-3xl font-bold tracking-tight">${name}</h1>
    <p class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-ink-secondary">${place && html`<span>${place}</span>`}<span>bij ${providerName(park.provider)}</span>${rating(park)}</p>
    ${park.imageUrl && html`<img src="${park.imageUrl}" alt="${name}" class="mt-5 aspect-[2/1] w-full rounded-2xl bg-line object-cover sm:aspect-[3/1]" />`}
    ${
      cheapest
        ? html`<section aria-labelledby="cheapest" class="mt-6 flex flex-col gap-4 rounded-2xl bg-surface p-5 ring-1 ring-line sm:flex-row sm:items-center">
            <div class="flex-1">
              <h2 id="cheapest" class="text-sm font-medium text-ink-secondary">Goedkoopste weekend voor ${partyLabel(PAGE_PARTY)}</h2>
              <p class="mt-1 font-semibold">${formatWeekend(cheapest)}</p>
              <p class="mt-1 flex flex-wrap items-center gap-2"><span class="text-3xl font-bold tabular-nums">${formatEuros(cheapest.priceCents)}</span> ${compared(cheapest)}</p>
              <p class="text-xs text-ink-secondary">${stay(cheapest)}</p>
            </div>
            ${bookButton(park, cheapest, 'parkpagina')}
          </section>
          <section aria-labelledby="weekends" class="mt-8">
            <h2 id="weekends" class="text-xl font-semibold">Prijzen per weekend</h2>
            <p class="mt-1 text-sm text-ink-secondary">Vrijdag tot maandag voor ${partyLabel(PAGE_PARTY)}: het goedkoopste huisje van het park, inclusief toeslagen. Bijgewerkt op ${updated}.</p>
            <ul class="mt-2 divide-y divide-line">${park.weekends.map(weekendRow)}</ul>
          </section>`
        : html`<p class="mt-6 rounded-2xl bg-surface p-5 ring-1 ring-line">Voor ${partyLabel(PAGE_PARTY)} vonden we bij ${name} geen vrij weekend in de komende maanden. Bekijk de parken in de buurt, of <a href="/" class="${link}">zoek een ander weekend</a>.</p>`
    }
    <p class="mt-6 text-sm"><a href="${appLink}" class="${link}">Met meer personen, kinderen of een hond? Bekijk ${name} voor jouw gezelschap</a></p>
    ${
      facilities.length > 0 &&
      html`<section aria-labelledby="facilities" class="mt-8">
        <h2 id="facilities" class="text-xl font-semibold">Faciliteiten</h2>
        <ul class="mt-3 flex flex-wrap gap-2">${facilities.map((facility) => html`<li class="rounded-full bg-surface px-3 py-1 text-sm ring-1 ring-line">${facility}</li>`)}</ul>
      </section>`
    }
    ${
      nearby.length > 0 &&
      html`<section aria-labelledby="nearby" class="mt-8">
        <h2 id="nearby" class="text-xl font-semibold">Parken in de buurt</h2>
        <ul class="mt-2 divide-y divide-line">${nearby.map(nearbyRow)}</ul>
      </section>`
    }`;

  return {
    path: pathOf(park),
    title: `${name}: weekendprijzen en aanbiedingen`,
    description: cheapest
      ? `Weekendje weg naar ${name}${place ? ` in ${place}` : ''}? Vanaf ${formatEuros(cheapest.priceCents)} voor ${partyLabel(PAGE_PARTY)} (${formatWeekend(cheapest)}). Zie de prijs van elk weekend en of je nu moet boeken of kunt wachten.`
      : `Weekendje weg naar ${name}${place ? ` in ${place}` : ''}: de prijzen per weekend voor ${partyLabel(PAGE_PARTY)}, bijgewerkt na elke prijsronde.`,
    image: park.imageUrl ?? null,
    body: body.text,
  };
}

function weekendPage(weekend, offers, { pathOf, previous, next, updated }) {
  const sorted = [...offers].sort((a, b) => a.weekend.priceCents - b.weekend.priceCents);
  const deals = offers
    .filter(({ weekend: offer }) => (offer.discount ?? 0) >= DEAL_SHARE)
    .sort((a, b) => b.weekend.discount - a.weekend.discount);
  const range = weekendRange(weekend);
  const from = formatEuros(sorted[0].weekend.priceCents);
  const dealCount = deals.length === 1 ? '1 park is' : `${deals.length} parken zijn`;
  const appLink = `/?${new URLSearchParams({ from: weekend.arrival, to: weekend.arrival, minDiscountPercent: '0' })}`;

  const dealCard = ({ park, weekend: offer }) =>
    html`<li class="flex flex-col gap-2 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <a href="${pathOf(park)}" class="${link}">${fullName(park)}</a>
      <span class="text-sm text-ink-secondary">${placeOf(park)}</span>
      <p class="mt-auto flex flex-wrap items-center gap-2"><span class="text-2xl font-bold tabular-nums">${formatEuros(offer.priceCents)}</span> ${compared(offer)}</p>
      ${park.baselineCents && html`<p class="text-xs text-ink-secondary">normaal ${formatEuros(park.baselineCents)}</p>`}
      ${bookButton(park, offer, 'weekendpagina')}
    </li>`;

  const offerRow = ({ park, weekend: offer }) =>
    html`<li class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div class="min-w-0 basis-full sm:basis-0 sm:flex-1">
        <a href="${pathOf(park)}" class="${link}">${fullName(park)}</a>
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-secondary">${placeOf(park)} ${compared(offer)}</p>
      </div>
      <p class="flex-1 text-lg font-bold tabular-nums sm:flex-none">${formatEuros(offer.priceCents)}</p>
      ${bookButton(park, offer, 'weekendpagina')}
    </li>`;

  const neighbour = (other, label) =>
    other && html`<a href="${weekendPath(other.arrival)}" class="${link}">${label} ${formatWeekend(other)}</a>`;

  const body = html`
    ${breadcrumb('/weekenden', 'Alle weekenden')}
    <h1 class="mt-2 text-3xl font-bold tracking-tight">Weekendje weg ${range}</h1>
    <p class="mt-2 max-w-2xl text-ink-secondary">${offers.length} vakantieparken hebben nog plek van ${formatWeekend(weekend)} voor ${partyLabel(PAGE_PARTY)}, vanaf ${from}. ${deals.length > 0 && `${dealCount} minstens ${Math.round(DEAL_SHARE * 100)}% goedkoper dan normaal.`}</p>
    ${
      deals.length > 0 &&
      html`<section aria-labelledby="deals" class="mt-6">
        <h2 id="deals" class="text-xl font-semibold">Grootste buitenkansjes</h2>
        <ul class="mt-3 grid gap-4 sm:grid-cols-3">${deals.slice(0, TOP_DEALS).map(dealCard)}</ul>
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
    image: null,
    body: body.text,
  };
}

function parksIndex(parks, { pathOf }) {
  const byCountry = Map.groupBy(parks, (park) => countryName(park.country) || 'Overig');
  const countries = [...byCountry].sort((a, b) => b[1].length - a[1].length);
  const parkRow = (park) => {
    const from = cheapestOf(park.weekends);
    return html`<li class="py-1.5"><a href="${pathOf(park)}" class="${link}">${fullName(park)}</a> <span class="text-sm text-ink-secondary">${park.city && `· ${park.city} `}· ${from ? `vanaf ${formatEuros(from.priceCents)}` : 'geen plek'}</span></li>`;
  };
  const body = html`
    <h1 class="text-3xl font-bold tracking-tight">Alle vakantieparken</h1>
    <p class="mt-2 max-w-2xl text-ink-secondary">${parks.length} parken van Landal, Topparken en Molecaten, met de laagste weekendprijs voor ${partyLabel(PAGE_PARTY)} (vrijdag tot maandag).</p>
    ${countries.map(
      ([country, list]) => html`<section class="mt-8">
        <h2 class="text-xl font-semibold">${country}</h2>
        <ul class="mt-2 columns-1 gap-8 sm:columns-2">${[...list].sort((a, b) => fullName(a).localeCompare(fullName(b), 'nl')).map(parkRow)}</ul>
      </section>`,
    )}`;
  return {
    path: '/parken',
    title: 'Alle vakantieparken: weekendprijzen bij Landal, Topparken en Molecaten',
    description: `${parks.length} vakantieparken in Nederland en daarbuiten, elk met de laagste prijs voor een weekendje weg en de prijs van elk komend weekend.`,
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

/**
 * Every page: one per park (also those without a free weekend, so their address stays), one per weekend, and the
 * lists of both.
 * @param parks the two-person overview's parks, with their weekends and advice
 * @param allParks every known park by code, as db.parks() gives them
 * @param computedAt when the prices were put together
 */
export function buildPages({ parks, allParks, computedAt }) {
  const priced = new Map(parks.map((park) => [park.code, park]));
  const everyPark = [...allParks.values()].map(
    (info) => priced.get(info.code) ?? { ...info, weekends: [], brand: parkBrand(info), facilities: [], googleRating: null },
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
    parks.flatMap((park) => park.weekends.map((weekend) => ({ park, weekend }))),
    (offer) => offer.weekend.arrival,
  );
  const weekends = [...offersByArrival.keys()].sort().map((arrival) => {
    const offers = offersByArrival.get(arrival);
    return { weekend: offers[0].weekend, offers };
  });

  return [
    parksIndex(everyPark, { pathOf }),
    weekendsIndex(weekends),
    ...everyPark.map((park) => parkPage(park, { pathOf, nearby: nearbyOf(park), updated })),
    ...weekends.map(({ weekend, offers }, index) =>
      weekendPage(weekend, offers, {
        pathOf,
        previous: weekends[index - 1]?.weekend,
        next: weekends[index + 1]?.weekend,
        updated,
      }),
    ),
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
