import { fetchWithRetry, sleep, textOf } from './http.mjs';

const SEARCH_URL = 'https://www.molecaten.nl/Services/Search.asmx/GetSearchAvailability';
const MAP_URL = 'https://www.molecaten.nl/zoek-op-de-kaart';
const SITE = 'https://www.molecaten.nl';
// The search takes one country at a time.
const COUNTRIES = { 1: 'NL', 2: 'HU' };
// Rentals only: no caravans, furnished tents, camping cabins or group stays.
const RENTALS = ['Chalet', 'Vakantiehuisje', 'Strandhuisje', 'Appartement'];
const REQUEST_PAUSE_MS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;
// A card shows a few photos to swipe through; the rest are on Molecaten's page.
const MAX_PHOTOS = 8;

let markersBySlug = null;

const compactDate = (isoDate) => isoDate.replaceAll('-', '');
const nights = ({ arrival, departure }) => Math.round((Date.parse(departure) - Date.parse(arrival)) / DAY_MS);

export const parseDutchPrice = (price) => Math.round(Number(price.replaceAll('.', '').replace(',', '.')) * 100);

/**
 * The search counts heads, not ages, and filters on pets without pricing them in: Molecaten's pet fee
 * (a few euros a night plus cleaning) is not in its prices.
 */
export function searchState({ arrival, departure, adults, children = 0, pets = 0 }, country, page, parks = []) {
  return {
    culturecode: ['nl-NL'],
    country: [String(country)],
    themes: [],
    parks: parks.map(String),
    holidaytype: ['1'],
    accommodations: RENTALS,
    arrivaldate: [compactDate(arrival)],
    soonerlater: ['0'],
    duration: [String(nights({ arrival, departure }))],
    numberofpeople: [String(adults + children)],
    pet: [pets ? 'True' : 'False'],
    sortorder: ['PriceLowHigh'],
    pagenumber: [String(page)],
    trigger: [],
    pricemin: [],
    pricemax: [],
  };
}

/**
 * The facilities on a park's facilities page, one per item, e.g. "Buitenzwembad met kinderbad en zonneterras".
 * An item's first sentence names it; prices and opening hours follow after a comma, colon or full stop.
 */
export function parseFacilityNames(html) {
  const start = html.indexOf('Faciliteiten &amp; openingstijden');
  const section = start < 0 ? html : html.slice(start);
  return [...section.matchAll(/<li[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map((match) => textOf(match[1]).split(/[,:.]/)[0].trim())
    .filter(Boolean);
}

/** Each park has its own facilities page next to its main page. */
export async function fetchFacilityNames(park) {
  return park.url ? parseFacilityNames(await (await fetchWithRetry(`${park.url}/faciliteiten`)).text()) : [];
}

const COUNTRY_IDS = Object.fromEntries(Object.entries(COUNTRIES).map(([id, code]) => [code, id]));

/**
 * One park's cheapest accommodation for a stay and an exact party, asked right now; null when nothing fits.
 * Parks known by their numeric id are searched alone; a park known by its slug is picked from its country's results.
 */
export async function quoteStay(park, query) {
  const id = park.code.split(':')[1];
  const slug = park.url?.split('/').pop();
  // Results come cheapest first, so the park's first row is its price: stop at the page that has it.
  for (let page = 1, pages = 1; page <= pages; page += 1) {
    const result = await search(query, COUNTRY_IDS[park.country] ?? '1', page, /^\d+$/.test(id) ? [id] : []);
    pages = result.meta?.paging?.totalpages ?? 0;
    const stay = cheapestPerPark(result.accoresults ?? []).find((candidate) => candidate.slug === slug);
    if (stay) {
      const { priceCents, accommodationCode, accommodation, bookingUrl } = stay;
      return { priceCents, accommodationCode, accommodation, bookingUrl };
    }
    if (page < pages) await sleep(REQUEST_PAUSE_MS);
  }
  return null;
}

export function parseMarkers(html) {
  // The pins hold no nested arrays, so the list ends at the first "]".
  const [, json] = html.match(/var markers = (\[[\s\S]*?\])/) ?? [];
  const markers = json ? JSON.parse(json) : [];
  return new Map(markers.map((marker) => [marker.url.replace(/^\//, ''), marker.coordinates]));
}

/** Results come one row per accommodation, cheapest first, so a park's first row is its cheapest. */
export function cheapestPerPark(rows) {
  const parks = new Map();
  for (const row of rows) {
    const slug = row.url.split('/')[1];
    if (!slug || parks.has(slug)) continue;
    const [name, city = null, region = null] = row.subtitle.split(', ');
    parks.set(slug, {
      slug,
      name,
      city,
      region,
      priceCents: parseDutchPrice(row.price),
      accommodationCode: String(row.idobjecttype),
      imageUrl: row.imageurls?.[0] ?? null,
      // The accommodation's own page with the dates, party and pet choice already filled in.
      bookingUrl: `${SITE}${row.url}`,
      accommodation: {
        code: String(row.idobjecttype),
        name: row.title ?? null,
        url: `${SITE}${row.url.split('?')[0]}`,
        facts: [],
        photos: (row.imageurls ?? []).slice(0, MAX_PHOTOS),
      },
    });
  }
  return [...parks.values()];
}

/** One page of results: one row per accommodation, cheapest first. */
export async function search(query, country, page, parks = []) {
  const params = new URLSearchParams({ ia: 'True', searchState: JSON.stringify(searchState(query, country, page, parks)) });
  const response = await fetchWithRetry(`${SEARCH_URL}?${params}`, { headers: { Accept: 'application/json' } });
  return response.json();
}

async function loadMarkers() {
  markersBySlug ??= parseMarkers(await (await fetchWithRetry(MAP_URL)).text());
  return markersBySlug;
}

export async function fetchWeekendOffers(query) {
  const markers = await loadMarkers();
  const offers = [];

  for (const [country, countryCode] of Object.entries(COUNTRIES)) {
    const rows = [];
    const parkIds = new Map();
    for (let page = 1, pages = 1; page <= pages; page += 1) {
      const result = await search(query, country, page);
      pages = result.meta?.paging?.totalpages ?? 0;
      rows.push(...(result.accoresults ?? []));
      for (const theme of result.filteroptions?.countries?.flatMap((item) => item.themes ?? []) ?? []) {
        for (const park of theme.parks ?? []) parkIds.set(park.name, park.value);
      }
      await sleep(REQUEST_PAUSE_MS);
    }

    for (const park of cheapestPerPark(rows)) {
      // The numeric id opens the park in Molecaten's own search; the slug is the fallback.
      const id = parkIds.get(park.name) ?? park.slug;
      offers.push({
        park: {
          code: `molecaten:${id}`,
          provider: 'molecaten',
          name: park.name,
          region: park.region,
          city: park.city,
          country: countryCode,
          url: `${SITE}/${park.slug}`,
          pricesUrl: `${SITE}/zoek-boek`,
          imageUrl: park.imageUrl,
          lat: markers.get(park.slug)?.lat ?? null,
          lng: markers.get(park.slug)?.lng ?? null,
        },
        priceCents: park.priceCents,
        accommodationCode: park.accommodationCode,
        bookingUrl: park.bookingUrl,
        accommodation: park.accommodation,
      });
    }
  }

  return offers;
}
