import { toLandalDate } from '../shared/weekends.mjs';
import { fetchWithRetry, sleep } from './http.mjs';

const SEARCH_URL = 'https://www.landal.nl/nl/api/destinations/parksAvailabilities/search';
// The same search within one park, one result per accommodation.
const ACCOMMODATIONS_URL = 'https://www.landal.nl/nl/api/destinations/accommodationsAvailabilities/search';
const PAGE_SIZE = 9;
// Keep the load on Landal low: one request at a time with a pause in between.
const REQUEST_PAUSE_MS = 400;
const STAY_TYPE_FIXED_DATES = '915';
// A card shows a few photos to swipe through; the rest are on Landal's page.
const MAX_PHOTOS = 8;

async function fetchPage(url, params, offset) {
  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: new URLSearchParams([['parkInfoLevel', '0'], ...params, ['paginationOffset', String(offset)]]),
  });
  const json = await response.json();
  return json.searchResult ?? {};
}

/** Walks every result page of a search. `params` are [name, value] pairs; names may repeat. */
async function searchAll(url, params, { items, total: totalKey }) {
  const results = [];
  let total = Infinity;

  for (let offset = 0; offset < total; offset += PAGE_SIZE) {
    const result = await fetchPage(url, params, offset);
    const page = result[items] ?? [];
    total = result[totalKey] ?? 0;
    if (!page.length) break;
    results.push(...page);
    if (offset + PAGE_SIZE < total) await sleep(REQUEST_PAUSE_MS);
  }

  return results;
}

const searchParks = (params) =>
  searchAll(SEARCH_URL, [['searchType', '1'], ...params], { items: 'parks', total: 'totalNrOfParks' });

/**
 * With pets in the party Landal only offers accommodations where they are allowed and adds the pet surcharge.
 * Accommodation features make the price that of the cheapest accommodation that has them.
 */
export function stayParams({ arrival, departure, adults, children, pets = 0, accommodationFeatures = [] }) {
  return [
    ['sortOption', '2'],
    ['defaultStayType', STAY_TYPE_FIXED_DATES],
    ['stayType', STAY_TYPE_FIXED_DATES],
    ['arrivalDate', toLandalDate(arrival)],
    ['departureDate', toLandalDate(departure)],
    ['travelGroup[0][Id]', '18-120'],
    ['travelGroup[0][Amount]', String(adults)],
    ['travelGroup[1][Id]', '3-17'],
    ['travelGroup[1][Amount]', String(children)],
    ['travelGroup[2][Id]', 'pets'],
    ['travelGroup[2][Amount]', String(pets)],
    ...accommodationFeatures.map((id) => ['facets[]', id]),
  ];
}

const parkCode = (result) => result.ParkCode ?? result.ParkInfo?.ParkCode ?? null;

function toOffer(result) {
  const info = result.ParkInfo ?? {};
  const price = result.PriceInfo ?? {};
  const code = parkCode(result);
  const position = result.MarkersViewModel?.markers?.[0]?.position;
  return {
    park: {
      code,
      provider: 'landal',
      name: info.ParkName ?? code,
      region: info.Region ?? null,
      city: info.City ?? null,
      country: info.CountryCode ?? null,
      url: info.ParkDetailPageLink?.Url ?? null,
      pricesUrl: info.AccommodationsForParkPageLink?.Url ?? null,
      reviewScore: info.ReviewLabel?.HasLabel ? info.ReviewLabel.Score : null,
      imageUrl: info.ThumbnailImageUrls?.[0]?.imageUrlLarge ?? null,
      lat: position?.lat ?? null,
      lng: position?.lng ?? null,
      brandCode: info.Brand ?? null,
    },
    priceCents: price.bestTotalPriceInCents ?? null,
    accommodationCode: price.accommodationCode ?? null,
  };
}

/** Cheapest total price (all surcharges included) per park for one stay. */
export async function fetchWeekendOffers(query) {
  const offers = new Map();
  for (const offer of (await searchParks(stayParams(query))).map(toOffer)) {
    if (offer.park.code && offer.priceCents) offers.set(offer.park.code, offer);
  }
  return [...offers.values()];
}

/** An accommodation as Landal's in-park search lists it: name, a few facts ("42 m²", "Drie slaapkamers") and photos. */
export function toAccommodation(result) {
  const info = result.AccommodationInfo ?? {};
  return {
    parkCode: info.ParkCode ?? result.ParkCode ?? null,
    code: info.Code ?? result.AccommodationCode ?? null,
    name: info.Name ?? null,
    url: info.DetailPageLink?.Url ?? null,
    facts: info.Usps ?? [],
    // 800 pixels wide: sharp on a card on a high-resolution screen, one size keeps the stored list small.
    photos: (info.ThumbnailImageUrls ?? [])
      .map((image) => image.retinaImageUrl ?? image.imageUrlLarge)
      .filter(Boolean)
      .slice(0, MAX_PHOTOS),
  };
}

/** One accommodation's total price for the stay, all surcharges included. */
export function toAccommodationPrice(result) {
  return {
    code: result.AccommodationInfo?.Code ?? result.AccommodationCode ?? null,
    priceCents: result.PriceInfo?.bestTotalPriceInCents ?? null,
  };
}

const searchParkAccommodations = (parkCode, query) =>
  searchAll(ACCOMMODATIONS_URL, [['searchType', '3'], ['selectedParkCode', parkCode], ...stayParams(query)], {
    items: 'accommodations',
    total: 'totalNrOfAccommodations',
  });

/** Every accommodation a park has available for one stay; a stay where a code was the cheapest one lists it. */
export async function fetchParkAccommodations(parkCode, query) {
  const results = await searchParkAccommodations(parkCode, query);
  return results.map(toAccommodation).filter((accommodation) => accommodation.code);
}

/** The price of every accommodation a park has available for one stay. */
export async function fetchParkAccommodationPrices(parkCode, query) {
  const results = await searchParkAccommodations(parkCode, query);
  return results.map(toAccommodationPrice).filter((accommodation) => accommodation.code && accommodation.priceCents);
}

/**
 * One park's cheapest accommodation for a stay and an exact party, asked right now: the party decides which
 * accommodations fit and what they cost. Null when nothing fits that party.
 */
export async function quoteStay(park, query) {
  const stays = (await searchParkAccommodations(park.code, query))
    .map((result) => ({ ...toAccommodationPrice(result), accommodation: toAccommodation(result) }))
    .filter((stay) => stay.code && stay.priceCents);
  if (!stays.length) return null;
  const cheapest = stays.reduce((best, stay) => (stay.priceCents < best.priceCents ? stay : best));
  return { priceCents: cheapest.priceCents, accommodationCode: cheapest.code, accommodation: cheapest.accommodation, bookingUrl: null };
}

/** Codes of all parks that have a facility, e.g. "9299.16301" for an indoor pool. */
export async function fetchParksWithFacility(facilityId) {
  const parks = await searchParks([
    ['sortOption', '0'],
    ['facets[]', facilityId],
  ]);
  return new Set(parks.map(parkCode).filter(Boolean));
}
