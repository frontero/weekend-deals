import { gunzipSync, gzipSync } from 'node:zlib';
import { availabilityTrends, bookingAdvice } from '../shared/advice.mjs';
import { analysePrices } from '../shared/analysis.mjs';
import { parkBrand } from '../shared/brands.mjs';
import { accommodationGroups, facilityGroups, parkFacilities } from '../shared/facilities.mjs';
import { weekendOccasions } from '../shared/occasions.mjs';
import { FEATURE_PARTIES, groupKey } from '../shared/party.mjs';
import { localToday, shiftDays } from '../shared/weekends.mjs';
import { buildPages, PAGE_PARTY } from './pages.mjs';
import { PROVIDERS } from './providers.mjs';
import { goodWeekendWeather } from './weather.mjs';

// Half a year of weekends feeds each park's normal price.
const BASELINE_LOOKBACK_DAYS = 182;
// The booking advice compares today's price with the price from at least this many days ago.
const TREND_REFERENCE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const FAMILY_KEY = 'a4-c0';
// "Populair deze week": parks visitors clicked through to the provider at least this often in the last days. A
// threshold, so a handful of clicks makes nothing popular.
const POPULAR_DAYS = 7;
const POPULAR_MIN_CLICKS = 5;
const POPULAR_LIMIT = 12;
const popularParks = (db) =>
  db.popularParks(new Date(Date.now() - POPULAR_DAYS * DAY_MS).toISOString(), { minimum: POPULAR_MIN_CLICKS, limit: POPULAR_LIMIT });
// A forecast older than this is no forecast any more.
const WEATHER_MAX_AGE_MS = DAY_MS;

/** The screen's data for one travel party: every park with its weekends, deals and advice. */
export async function buildOverview(db, { googleEnabled, party }) {
  const key = groupKey(party);
  const today = localToday();
  const fromArrival = shiftDays(today, -BASELINE_LOOKBACK_DAYS);
  const referenceBefore = new Date(Date.now() - TREND_REFERENCE_DAYS * DAY_MS).toISOString();
  // Availability only matters for weekends still ahead, which also keeps the rows read down.
  const [
    summaries,
    availabilityRows,
    parkInfo,
    facilitiesByPark,
    facilityNamesByPark,
    googleRatings,
    providerErrors,
    accommodations,
    weather,
    { holidays },
    popular,
  ] = await Promise.all([
    db.priceSummaries(key, fromArrival, referenceBefore),
    db.availability(key, today),
    db.parks(),
    db.facilitiesByPark(),
    db.facilityNamesByPark(),
    db.googleRatings(),
    db.providerErrors(),
    db.accommodations(),
    db.parkWeather(new Date(Date.now() - WEATHER_MAX_AGE_MS).toISOString()),
    db.schoolHolidays(),
    popularParks(db),
  ]);
  const { parks } = analysePrices(summaries, today);
  const availability = availabilityTrends(availabilityRows);
  // Good weather only: a forecast of rain sells no weekend, so it is left out rather than shown.
  const withAdvice = (provider, code) => (weekend) => ({
    ...weekend,
    advice: bookingAdvice({ ...weekend, today, availability: availability.get(`${provider}|${weekend.arrival}`) }),
    weather: goodWeekendWeather(weather.get(code) ?? [], weekend) ?? undefined,
  });
  const arrivals = [...new Map(parks.flatMap((park) => park.weekends).map((weekend) => [weekend.arrival, weekend])).values()];
  // Only the accommodations behind a shown price: the whole list is downloaded on every new overview.
  const accommodationsFor = (park) => {
    const known = accommodations.get(park.code) ?? {};
    const codes = park.weekends.map((weekend) => weekend.accommodationCode).filter((code) => known[code]);
    return Object.fromEntries(codes.map((code) => [code, known[code]]));
  };

  return {
    key,
    meta: {
      google: { enabled: googleEnabled, error: await db.googleError() },
      // Visitors hear of a provider only when none of its searches worked; a few failures are for the admin page.
      providers: PROVIDERS.map(({ id, name }) => {
        const failure = providerErrors[id];
        const complete = failure && (failure.total == null || failure.failed >= failure.total);
        return { id, name, error: complete ? failure.error : null };
      }),
      facilityGroups: facilityGroups(),
      accommodationGroups: accommodationGroups(await db.facilityGroups('accommodation')),
      lastScan: await db.lastScan(key),
      // Parks visitors clicked through to most this week, most first.
      popular: [...popular.keys()],
      // Per weekend what makes it special: a long weekend, Valentine's Day, the school holidays.
      occasions: Object.fromEntries(
        arrivals.map((weekend) => [weekend.arrival, weekendOccasions(weekend, holidays)]).filter(([, list]) => list.length),
      ),
    },
    parks: parks
      .filter((park) => park.weekends.length)
      .map((park) => {
        const info = parkInfo.get(park.code);
        const googleRating = googleRatings.get(park.code) ?? null;
        return {
          ...info,
          ...park,
          weekends: park.weekends.map(withAdvice(info?.provider ?? 'landal', park.code)),
          brand: parkBrand({ provider: info?.provider, placeName: googleRating?.placeName, brandCode: info?.brandCode }),
          // The app's own filters, from Landal's facets or another provider's park page.
          facilities: parkFacilities({
            landal: facilitiesByPark.get(park.code) ?? [],
            names: facilityNamesByPark.get(park.code) ?? [],
          }),
          googleRating,
          accommodations: accommodationsFor(park),
        };
      }),
  };
}

/** What the public pages tell about every park beyond its prices, also of parks without a free weekend. */
async function pageDetails(db) {
  // Themes with prices of their own party, from that party's latest overview: four people, and the hot tub series.
  const themeKeys = [FAMILY_KEY, ...FEATURE_PARTIES.map(groupKey)];
  const [landal, names, accommodations, surroundings, ratings, { holidays }, popular, ...themeOverviews] = await Promise.all([
    db.facilitiesByPark(),
    db.facilityNamesByPark(),
    db.accommodations(),
    db.surroundings(),
    db.googleRatings(),
    db.schoolHolidays(),
    popularParks(db),
    ...themeKeys.map((key) => db.overviewParks(key)),
  ]);
  const facilitiesOf = (code) => parkFacilities({ landal: landal.get(code) ?? [], names: names.get(code) ?? [] });
  const occasionsOf = (weekend) => weekendOccasions(weekend, holidays);
  const themeParks = new Map(themeKeys.map((key, index) => [key, themeOverviews[index] ? JSON.parse(gunzipSync(themeOverviews[index])) : null]));
  const parksOf = (key) => themeParks.get(key) ?? null;
  return { facilitiesOf, accommodations, surroundings, ratings, occasionsOf, parksOf, popular };
}

export async function refreshOverview(db, { googleEnabled, party }) {
  const computedAt = new Date().toISOString();
  const { key, meta, parks } = await buildOverview(db, { googleEnabled, party });
  await db.saveOverview(key, { computedAt, meta: JSON.stringify(meta), parks: gzipSync(JSON.stringify(parks)) });
  if (key === groupKey(PAGE_PARTY)) {
    const pages = buildPages({ parks, allParks: await db.parks(), computedAt, details: await pageDetails(db) });
    await db.replacePages(pages, computedAt);
  }
}

/**
 * Missing, older than the party's last finished round, or from an earlier day (advice counts days, and past weekends
 * drop off).
 */
export async function overviewIsStale(db, party) {
  const [computedAt, lastScan] = await Promise.all([db.overviewComputedAt(groupKey(party)), db.lastScan(groupKey(party))]);
  if (!computedAt) return true;
  if (lastScan && lastScan.finishedAt > computedAt) return true;
  return localToday(new Date(computedAt)) !== localToday();
}
