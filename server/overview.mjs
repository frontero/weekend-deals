import { gzipSync } from 'node:zlib';
import { availabilityTrends, bookingAdvice } from '../shared/advice.mjs';
import { analysePrices } from '../shared/analysis.mjs';
import { parkBrand } from '../shared/brands.mjs';
import { accommodationGroups, facilityGroups, parkFacilities } from '../shared/facilities.mjs';
import { groupKey } from '../shared/party.mjs';
import { localToday, shiftDays } from '../shared/weekends.mjs';
import { buildPages, PAGE_PARTY } from './pages.mjs';
import { PROVIDERS } from './providers.mjs';

// Half a year of weekends feeds each park's normal price.
const BASELINE_LOOKBACK_DAYS = 182;
// The booking advice compares today's price with the price from at least this many days ago.
const TREND_REFERENCE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

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
  ] = await Promise.all([
    db.priceSummaries(key, fromArrival, referenceBefore),
    db.availability(key, today),
    db.parks(),
    db.facilitiesByPark(),
    db.facilityNamesByPark(),
    db.googleRatings(),
    db.providerErrors(),
    db.accommodations(),
  ]);
  const { parks } = analysePrices(summaries, today);
  const availability = availabilityTrends(availabilityRows);
  const withAdvice = (provider) => (weekend) => ({
    ...weekend,
    advice: bookingAdvice({ ...weekend, today, availability: availability.get(`${provider}|${weekend.arrival}`) }),
  });
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
    },
    parks: parks
      .filter((park) => park.weekends.length)
      .map((park) => {
        const info = parkInfo.get(park.code);
        const googleRating = googleRatings.get(park.code) ?? null;
        return {
          ...info,
          ...park,
          weekends: park.weekends.map(withAdvice(info?.provider ?? 'landal')),
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
  const [landal, names, accommodations, surroundings, ratings] = await Promise.all([
    db.facilitiesByPark(),
    db.facilityNamesByPark(),
    db.accommodations(),
    db.surroundings(),
    db.googleRatings(),
  ]);
  const facilitiesOf = (code) => parkFacilities({ landal: landal.get(code) ?? [], names: names.get(code) ?? [] });
  return { facilitiesOf, accommodations, surroundings, ratings };
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
