import { fetchWithRetry, sleep, textOf } from './http.mjs';

// One request returns every park's cheapest stay; HolidayType 1 means rentals (0, the default, is camping).
const AVAILABILITY_URL = 'https://api.topparken.nl/api/parks/getavailabilities';
const HOLIDAY_HOMES = '1';
const REQUEST_PAUSE_MS = 400;
const COUNTRY_CODES = { Nederland: 'NL', België: 'BE', Duitsland: 'DE' };
const LEAFLET = /data\['leaflet'\]\s*=\s*\{\s*latitude:\s*([-\d.]+),\s*longitude:\s*([-\d.]+)/;

// The search has no coordinates; each park page has its map pin. Fetched once per park while the server runs.
const coordinatesByPage = new Map();

/** Children are sent as 3–11; older children only change the tourist tax a little. */
export function availabilityParams({ arrival, departure, adults, children = 0, pets = 0 }) {
  return [
    ['StartDate', arrival],
    ['EndDate', departure],
    ['HolidayType', HOLIDAY_HOMES],
    ['Adults', String(adults)],
    ['Children', String(children)],
    ['Pets', String(pets)],
    ['Culture', 'nl-NL'],
  ];
}

/** `cheapestCost` is the whole stay for the whole party, mandatory costs included (not the deposit). */
export function toOffer(park) {
  return {
    park: {
      code: `topparken:${park.id}`,
      provider: 'topparken',
      name: park.name,
      region: park.location?.province ?? null,
      city: park.location?.city ?? null,
      country: COUNTRY_CODES[park.location?.country] ?? park.location?.country ?? null,
      url: park.parkLink?.url ?? null,
      pricesUrl: park.accommodationsLink?.url ?? null,
      imageUrl: park.image?.url ?? null,
      lat: null,
      lng: null,
    },
    priceCents: Math.round(park.cheapestCost * 100),
    accommodationCode: null,
  };
}

/** The labels under "Faciliteiten op het park" on a park page, e.g. "Verwarmd buitenzwembad", "Kidsclub". */
export function parseFacilityNames(html) {
  const start = html.indexOf('Faciliteiten op het park');
  if (start < 0) return [];
  const rest = html.slice(start);
  const end = rest.slice(1).search(/<h[1-4][\s>]/);
  const section = end < 0 ? rest : rest.slice(0, end + 1);
  return [...section.matchAll(/<li[^>]*>\s*<div[^>]*>\s*<p>([\s\S]*?)<\/p>/g)].map((match) => textOf(match[1])).filter(Boolean);
}

/** Read from the park page, which also carries its map pin. */
export async function fetchFacilityNames(park) {
  return park.url ? parseFacilityNames(await (await fetchWithRetry(park.url)).text()) : [];
}

/** One park's cheapest stay for an exact party, asked right now; null when it has nothing free. */
export async function quoteStay(park, query) {
  const offer = (await fetchCheapestStays(query)).find((candidate) => candidate.park.code === park.code);
  return offer ? { priceCents: offer.priceCents, accommodationCode: null, accommodation: null, bookingUrl: null } : null;
}

export function parseLeafletCoordinates(html) {
  const [, lat, lng] = html.match(LEAFLET) ?? [];
  return lat ? { lat: Number(lat), lng: Number(lng) } : null;
}

async function addCoordinates(offer) {
  const page = offer.park.url;
  if (!page) return;
  if (!coordinatesByPage.has(page)) {
    const html = await (await fetchWithRetry(page)).text();
    coordinatesByPage.set(page, parseLeafletCoordinates(html));
    await sleep(REQUEST_PAUSE_MS);
  }
  Object.assign(offer.park, coordinatesByPage.get(page) ?? {});
}

/** Every park's cheapest stay in one request, without the map pins. */
export async function fetchCheapestStays(query) {
  const response = await fetchWithRetry(`${AVAILABILITY_URL}?${new URLSearchParams(availabilityParams(query))}`, {
    headers: { Accept: 'application/json' },
  });
  // No content: nothing available that weekend.
  if (response.status === 204) return [];
  return ((await response.json()).parks ?? []).filter((park) => park.cheapestCost > 0).map(toOffer);
}

export async function fetchWeekendOffers(query) {
  const offers = await fetchCheapestStays(query);
  for (const offer of offers) await addCoordinates(offer);
  return offers;
}
