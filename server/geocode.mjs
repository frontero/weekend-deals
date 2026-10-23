// Turns a typed address into coordinates. The Dutch government's PDOK location server knows every Dutch address;
// OpenStreetMap's Nominatim covers the rest. Both are free; Nominatim asks for an identifying User-Agent and light use,
// which one lookup per search is.
const PDOK_URL = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'weekend-deals/0.1 (personal use)';
const MAX_PLACES = 6;

const POINT = /POINT\(([-\d.]+) ([-\d.]+)\)/;

export function parsePdok(json) {
  return (json.response?.docs ?? [])
    .map((doc) => {
      const [, lng, lat] = doc.centroide_ll?.match(POINT) ?? [];
      return lat ? { label: doc.weergavenaam, lat: Number(lat), lng: Number(lng) } : null;
    })
    .filter(Boolean);
}

export function parseNominatim(json) {
  return (Array.isArray(json) ? json : []).map((place) => ({
    label: place.display_name,
    lat: Number(place.lat),
    lng: Number(place.lon),
  }));
}

export function mergePlaces(first, second, limit = MAX_PLACES) {
  const seen = new Set();
  return [...first, ...second]
    .filter((place) => !seen.has(place.label) && seen.add(place.label))
    .slice(0, limit);
}

async function getJson(url, params) {
  const response = await fetch(`${url}?${new URLSearchParams(params)}`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'nl' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`);
  return response.json();
}

export async function geocode(query) {
  const [pdok, nominatim] = await Promise.allSettled([
    getJson(PDOK_URL, { q: query, rows: '3', fl: 'weergavenaam,type,centroide_ll', fq: 'type:(adres OR postcode OR woonplaats OR weg OR gemeente)' }),
    getJson(NOMINATIM_URL, { q: query, format: 'jsonv2', limit: '3' }),
  ]);
  if (pdok.status === 'rejected' && nominatim.status === 'rejected') throw pdok.reason;
  return mergePlaces(
    pdok.status === 'fulfilled' ? parsePdok(pdok.value) : [],
    nominatim.status === 'fulfilled' ? parseNominatim(nominatim.value) : [],
  );
}
