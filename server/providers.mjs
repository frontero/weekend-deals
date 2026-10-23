import { fetchParkAccommodations, fetchWeekendOffers as fetchLandalOffers, quoteStay as quoteLandalStay } from './landal.mjs';
import {
  fetchFacilityNames as fetchMolecatenFacilities,
  fetchWeekendOffers as fetchMolecatenOffers,
  quoteStay as quoteMolecatenStay,
} from './molecaten.mjs';
import {
  fetchFacilityNames as fetchTopparkenFacilities,
  fetchWeekendOffers as fetchTopparkenOffers,
  quoteStay as quoteTopparkenStay,
} from './topparken.mjs';

/**
 * Every provider turns one weekend query ({ arrival, departure, adults, children, pets, accommodationFeatures })
 * into offers: { park: { code, provider, name, region, city, country, url, pricesUrl, reviewScore, imageUrl, lat, lng },
 * priceCents, accommodationCode }. Landal park codes are bare (they predate other providers); the others are
 * prefixed with the provider id, e.g. "europarcs:bad-hulckesteijn".
 * An offer can carry `accommodation: { code, name, url, facts, photos }`; a provider that lists those separately
 * has `fetchAccommodations(parkCode, query)`, which the round calls once per accommodation it has not seen yet.
 * A provider whose park pages list facilities has `fetchFacilityNames(park)`; Landal's come from its search facets.
 * `quoteStay(park, query)` prices one park for an exact party right now: { priceCents, accommodationCode,
 * accommodation, bookingUrl } or null. It runs in the cloud app too, so it may not use anything from Node.
 */
export const PROVIDERS = [
  {
    id: 'landal',
    name: 'Landal',
    brand: 'Landal',
    // The accommodation features are Landal's own filter values.
    supportsAccommodationFeatures: true,
    fetchWeekendOffers: fetchLandalOffers,
    fetchAccommodations: fetchParkAccommodations,
    quoteStay: quoteLandalStay,
  },
  {
    id: 'topparken',
    name: 'Topparken',
    brand: 'Topparken',
    supportsAccommodationFeatures: false,
    fetchWeekendOffers: fetchTopparkenOffers,
    fetchFacilityNames: fetchTopparkenFacilities,
    quoteStay: quoteTopparkenStay,
  },
  {
    id: 'molecaten',
    name: 'Molecaten',
    brand: 'Molecaten',
    supportsAccommodationFeatures: false,
    fetchWeekendOffers: fetchMolecatenOffers,
    fetchFacilityNames: fetchMolecatenFacilities,
    quoteStay: quoteMolecatenStay,
  },
];

export const providerBrand = (id) => PROVIDERS.find((provider) => provider.id === id)?.brand ?? 'Landal';

/** Prices are only comparable when a provider honours the same requirements, so others sit out until it can. */
export function activeProviders(providers, { accommodationFeatures = [] }) {
  return providers.filter((provider) => !accommodationFeatures.length || provider.supportsAccommodationFeatures);
}
