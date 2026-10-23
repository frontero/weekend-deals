import { accommodationFor } from './accommodations.js';
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
