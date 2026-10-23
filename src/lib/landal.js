import { toLandalDate } from '../../shared/weekends.mjs';

// Landal leaves the region empty for some parks, which leaves only "(DE)".
export function parkLocation({ city, region }) {
  const trimmedRegion = region?.trim();
  if (trimmedRegion?.startsWith('(')) return [city, trimmedRegion].filter(Boolean).join(' ');
  return [city, trimmedRegion].filter(Boolean).join(', ');
}

/** Google Maps at the park: the matched Google place (reviews, photos), else a pin on Landal's coordinates. */
export function parkMapUrl(park) {
  if (park.googleRating?.mapsUrl) return park.googleRating.mapsUrl;
  if (park.lat == null || park.lng == null) return null;
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: `${park.lat},${park.lng}` })}`;
}

// Landal's pages read the stay from the address: `#filter:` and the base64 of this JSON.
const stayFilter = ({ arrival, departure }) => ({ a: toLandalDate(arrival), d: toLandalDate(departure), so: 2, s: '3' });

/**
 * Landal takes the travel party from `?adults=&children=&pets=` and remembers it; without one it prices for the
 * accommodation's full capacity, which costs more than the app shows. Only counts above zero are read.
 */
function stayLink(url, filter, { adults, children = 0, pets = 0 }) {
  const link = new URL(url);
  for (const [name, amount] of Object.entries({ adults, children, pets })) {
    if (amount > 0) link.searchParams.set(name, String(amount));
  }
  link.hash = `filter:${btoa(JSON.stringify(filter))}`;
  return link.href;
}

/** Opens the park's price page on Landal for the weekend, party and accommodation features, cheapest first. */
export function weekendUrl(park, weekend, party) {
  const filter = stayFilter(weekend);
  if (party.accommodationFeatures?.length) filter.f = party.accommodationFeatures.join('|');
  return stayLink(park.pricesUrl, filter, party);
}

/** Opens one accommodation's own page on Landal for the weekend and party, which shows that stay's price. */
export const accommodationUrl = (url, weekend, party) => stayLink(url, stayFilter(weekend), party);
