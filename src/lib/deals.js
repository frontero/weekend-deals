import { toFacilityId } from '../../shared/facilities.mjs';
import { distanceKm } from '../../shared/geo.mjs';

// Smaller drops are day-to-day noise in Landal's "from" price.
const MIN_DROP_SHARE = 0.05;

export function filterParks(
  parks,
  { country = '', search = '', facilities: chosen = [], minRating = 0, providers = [], brands = [], maxDistanceKm = null, parks: codes = [] },
) {
  const needle = search.trim().toLowerCase();
  // Links and price alerts from before the app's own filter list name Landal's ids.
  const facilities = chosen.map(toFacilityId).filter(Boolean);
  return parks.filter(
    (park) =>
      (!codes.length || codes.includes(park.code)) &&
      (!maxDistanceKm || (park.distanceKm != null && park.distanceKm <= maxDistanceKm)) &&
      (!brands.length || brands.includes(park.brand)) &&
      (!providers.length || providers.includes(park.provider)) &&
      (!country || park.country === country) &&
      (!needle || [park.name, park.region, park.city].some((value) => value?.toLowerCase().includes(needle))) &&
      facilities.every((facility) => park.facilities?.includes(facility)) &&
      (!minRating || (park.googleRating?.rating ?? 0) >= minRating),
  );
}

/** Adds to each facility option how many of the given parks have it. */
export function countFacilities(groups, parks) {
  const counts = new Map();
  for (const facility of parks.flatMap((park) => park.facilities ?? [])) {
    counts.set(facility, (counts.get(facility) ?? 0) + 1);
  }
  return groups.map((group) => ({
    ...group,
    options: group.options.map((option) => ({ ...option, count: counts.get(option.id) ?? 0 })),
  }));
}

export function priceDrop(weekend) {
  const dropCents = weekend.highestCents - weekend.priceCents;
  return dropCents >= weekend.highestCents * MIN_DROP_SHARE ? dropCents : 0;
}

// Weekends without a normal price to compare with (a park followed for too few weekends) sort after all others.
const discountOf = (deal) => deal.weekend.discount ?? -Infinity;
const byDiscount = (a, b) => discountOf(b) - discountOf(a) || 0;

/** @param minDiscount share below the park's normal price; 0 turns the discount filter off, showing every weekend */
export function findDeals(parks, { minDiscount, maxPriceEuros = null, ...parkFilters }) {
  return filterParks(parks, parkFilters)
    .flatMap((park) =>
      park.weekends
        .filter((weekend) => minDiscount <= 0 || (weekend.discount !== null && weekend.discount >= minDiscount))
        .filter((weekend) => !maxPriceEuros || weekend.priceCents <= maxPriceEuros * 100)
        .map((weekend) => ({ park, weekend, dropCents: priceDrop(weekend) })),
    )
    .sort(byDiscount);
}

/**
 * The deals a search finds: what the screen lists, and what a price alert watches for, worked out the same way.
 * @param search the filters of the address bar, plus the home `origin` ({ lat, lng }) and `maxDistanceKm`
 */
export function searchDeals(parks, { origin = null, maxDistanceKm = null, from = '', to = '', minDiscountPercent = 0, ...filters }) {
  const located = parks.map((park) => ({
    ...park,
    distanceKm: origin && park.lat != null ? distanceKm(origin, park) : null,
  }));
  return findDeals(withinDates(located, from, to), { ...filters, maxDistanceKm, minDiscount: minDiscountPercent / 100 });
}

/** Parks narrowed to the weekends arriving from `from` up to `to`; parks without one drop out. No dates: all. */
export function withinDates(parks, from, to) {
  if (!from) return parks;
  const last = to || from;
  return parks
    .map((park) => ({
      ...park,
      weekends: park.weekends.filter((weekend) => weekend.arrival >= from && weekend.arrival <= last),
    }))
    .filter((park) => park.weekends.length);
}

const DEAL_ORDER = {
  deal: byDiscount,
  price: (a, b) => a.weekend.priceCents - b.weekend.priceCents,
  rating: (a, b) => (b.park.googleRating?.rating ?? 0) - (a.park.googleRating?.rating ?? 0),
  date: (a, b) => a.weekend.arrival.localeCompare(b.weekend.arrival),
  // Parks without a distance (no home address, or no coordinates) go last.
  distance: (a, b) => (a.park.distanceKm ?? Infinity) - (b.park.distanceKm ?? Infinity),
};

export function sortDeals(deals, sort) {
  return [...deals].sort(DEAL_ORDER[sort] ?? DEAL_ORDER.deal);
}

/**
 * One card per park: its first deal in the chosen order, with the park's other weekends that also qualify, so a
 * screenful shows more parks instead of the same park for several weekends.
 */
export function onePerPark(deals) {
  const byPark = new Map();
  for (const deal of deals) {
    const first = byPark.get(deal.park.code);
    if (first) first.otherWeekends.push(deal.weekend);
    else byPark.set(deal.park.code, { ...deal, otherWeekends: [] });
  }
  return [...byPark.values()];
}

/** The weekend furthest below the park's normal price, or the cheapest one while there is no normal price yet. */
export function bestWeekend(park) {
  const score = (weekend) => weekend.discount ?? -weekend.priceCents;
  return park.weekends.reduce((best, weekend) => (score(weekend) > score(best) ? weekend : best));
}
