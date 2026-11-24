import { groupKey } from '../../shared/party.mjs';
import { parkBrand } from '../../shared/brands.mjs';
import { accommodationFor } from './accommodations.js';
import { brandName } from './brands.js';
import { nights } from './format.js';
import { accommodationUrl as landalAccommodationUrl, weekendUrl as landalWeekendUrl } from './landal.js';

function topparkenWeekendUrl(park, { arrival, departure }, { adults, children = 0, pets = 0 }) {
  const params = new URLSearchParams({
    startDate: arrival,
    endDate: departure,
    holidayType: '1',
    adults: String(adults),
    children: String(children),
    pets: String(pets),
  });
  return `${park.pricesUrl}?${params}`;
}

// Molecaten's search page reads its whole search, park included, from the address hash.
function molecatenWeekendUrl(park, weekend, { adults, children = 0, pets = 0 }) {
  const state = {
    culturecode: ['nl-NL'],
    parks: [park.code.split(':')[1]],
    holidaytype: ['1'],
    arrivaldate: [weekend.arrival.replaceAll('-', '')],
    soonerlater: ['0'],
    duration: [String(nights(weekend))],
    numberofpeople: [String(adults + children)],
    pet: [pets ? 'True' : 'False'],
    sortorder: ['PriceLowHigh'],
    pagenumber: ['1'],
  };
  return `${park.pricesUrl}#searchState=${encodeURIComponent(JSON.stringify(state))}`;
}

// Per provider: its name on screen, a link that opens the park with the weekend selected, and where it has them,
// a link that opens one accommodation's page for the weekend.
const PROVIDERS = {
  landal: {
    name: 'Landal',
    weekendUrl: landalWeekendUrl,
    accommodationUrl: (accommodation, weekend, settings) => landalAccommodationUrl(accommodation.url, weekend, settings),
  },
  topparken: { name: 'Topparken', weekendUrl: topparkenWeekendUrl },
  molecaten: { name: 'Molecaten', weekendUrl: molecatenWeekendUrl },
};

// Parks saved before there were several providers have none; they are Landal parks.
const providerOf = (id) => PROVIDERS[id ?? 'landal'];

export const providerName = (id) => providerOf(id)?.name ?? id;

/** A park can carry a different brand from the site that handles its bookings. */
export function bookingBrandNote(park) {
  const brand = brandName(park.brand ?? parkBrand(park));
  const provider = providerName(park.provider);
  if (brand === provider) {
    return '';
  }

  return `Dit park van ${brand} boek je via ${provider}.`;
}

// The providers' own sites, so a visitor can still book while our prices are out of reach.
const HOMES = { landal: 'https://www.landal.nl/', topparken: 'https://www.topparken.nl/', molecaten: 'https://www.molecaten.nl/' };

/** Every provider's home page through /api/go, for when there are no prices to show. */
export const providerHomeLinks = (source) =>
  Object.entries(HOMES).map(([id, url]) => ({ name: providerName(id), href: `/api/go?${new URLSearchParams({ url, from: source })}` }));

/**
 * Where to book this weekend for this party: the provider's own link to that weekend's cheapest accommodation when
 * it gave one, else that accommodation's page with the dates, else a link built for the park and dates, else the
 * park page.
 */
export function bookingUrl(park, weekend, settings) {
  if (weekend.bookingUrl) return weekend.bookingUrl;
  const provider = providerOf(park.provider);
  const accommodation = accommodationFor(park, weekend);
  if (accommodation?.url && provider?.accommodationUrl) return provider.accommodationUrl(accommodation, weekend, settings);
  return provider?.weekendUrl ? provider.weekendUrl(park, weekend, settings) : park.url;
}

/**
 * The booking link as the site hands it out: through /api/go, which counts the click and adds the affiliate link.
 * @param source where on the page it was clicked, for the admin page's click counts
 */
export function trackedBookingUrl(park, weekend, settings, source) {
  const params = new URLSearchParams({ url: bookingUrl(park, weekend, settings), park: park.code, arrival: weekend.arrival, from: source });
  if (settings) params.set('party', groupKey(settings));
  // For the counts only (server/events.mjs): what the visitor saw when they clicked.
  if (weekend.priceCents) params.set('price', String(Math.round(weekend.priceCents / 100)));
  if (weekend.discount != null) params.set('off', String(Math.round(weekend.discount * 100)));
  return `/api/go?${params}`;
}
