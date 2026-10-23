import { gzipSync } from 'node:zlib';
import { adminWindowStart } from '../shared/admin-stats.mjs';
import { buildWatchStats, compareWatch, nextSnapshot, WATCH_STATS_KEY } from '../shared/watch.mjs';
import { localToday, shiftDays, upcomingWeekends } from '../shared/weekends.mjs';
import { sleep } from './http.mjs';
import { fetchParkAccommodationPrices } from './landal.mjs';
import { parseDutchPrice, search as searchMolecaten } from './molecaten.mjs';
import { fetchCheapestStays } from './topparken.mjs';

// The price watch: every half hour the same few searches at each provider, to learn when they change their prices
// and whether that follows a pattern. Only the changes are kept, with the latest prices to compare the next run with.
// The searches are those of the two-day measurement in October 2026, so its data carries on.

// A run is due this long after the last one; the background job and GitHub check every ten minutes.
const DUE_AFTER_MS = 25 * 60 * 1000;
// A run another process started this recently is still busy.
const CLAIM_MS = 5 * 60 * 1000;
const REQUEST_PAUSE_MS = 400;
const PARTY = { adults: 2, children: 0, pets: 0 };
// Drenthe, the coast, South Limburg, the Moselle and the Austrian Alps.
const LANDAL_PARKS = ['HRK', 'EZE', 'SRG', 'CHM', 'MAM'];
const MOLECATEN_NETHERLANDS = 1;
const MOLECATEN_PAGES = 2;

/** The first weekend at least three days ahead, and those three and eleven weeks after it. */
export function watchWeekends(today = localToday()) {
  const weekends = upcomingWeekends(shiftDays(today, 3), 12);
  return [weekends[0], weekends[3], weekends[11]];
}

/** The searches of one run for one weekend, each giving rows of { park, accommodation, priceCents }. */
function searchesFor(weekend) {
  const query = { ...weekend, ...PARTY };
  return [
    ...LANDAL_PARKS.map((park) => ({
      provider: 'landal',
      search: park,
      fetch: async () =>
        (await fetchParkAccommodationPrices(park, query)).map(({ code, priceCents }) => ({ park, accommodation: code, priceCents })),
    })),
    {
      provider: 'topparken',
      search: 'all',
      // Each park's cheapest stay only, so a change can be repricing or availability.
      fetch: async () =>
        (await fetchCheapestStays(query)).map((offer) => ({ park: offer.park.code, accommodation: '', priceCents: offer.priceCents })),
    },
    {
      provider: 'molecaten',
      search: `NL-pages-1-${MOLECATEN_PAGES}`,
      fetch: async () => {
        const rows = [];
        for (let page = 1; page <= MOLECATEN_PAGES; page += 1) {
          if (page > 1) await sleep(REQUEST_PAUSE_MS);
          rows.push(...((await searchMolecaten(query, MOLECATEN_NETHERLANDS, page)).accoresults ?? []));
        }
        return rows.map((row) => ({
          park: `molecaten:${row.url.split('/')[1]}`,
          accommodation: String(row.idobjecttype),
          priceCents: parseDutchPrice(row.price),
        }));
      },
    },
  ];
}

/** One run over all searches: which succeeded, and every price found keyed for comparison. */
export async function sampleWatch(weekends, log = () => {}) {
  const searches = [];
  const prices = {};
  for (const weekend of weekends) {
    for (const { provider, search, fetch } of searchesFor(weekend)) {
      const key = `${provider}|${search}|${weekend.arrival}`;
      try {
        for (const row of await fetch()) {
          if (row.priceCents) prices[`${key}|${row.park}|${row.accommodation}`] = row.priceCents;
        }
        searches.push({ key, provider, ok: true });
      } catch (error) {
        searches.push({ key, provider, ok: false });
        log(`watch ${key} failed: ${error.message}`);
      }
      await sleep(REQUEST_PAUSE_MS);
    }
  }
  return { searches, prices };
}

export function createWatcher(db, { log = () => {} } = {}) {
  /** The analysis for the admin page, from all runs in the window. */
  async function refreshStats() {
    const since = adminWindowStart();
    const parks = new Map([...(await db.parks()).values()].map((park) => [park.code, park.name]));
    const stats = buildWatchStats({ runs: await db.watchRuns(since), changes: await db.watchChanges(since), parks });
    await db.saveAdminStats(WATCH_STATS_KEY, { computedAt: stats.computedAt, data: gzipSync(JSON.stringify(stats)) });
  }

  /** Runs the watch when half an hour has passed and no other process is at it. Never rejects. */
  async function runIfDue(now = Date.now()) {
    try {
      const state = await db.watchState();
      if (state.lastAt && now - Date.parse(state.lastAt) < DUE_AFTER_MS) return false;
      if (state.claimedAt && now - Date.parse(state.claimedAt) < CLAIM_MS) return false;
      const at = new Date(now).toISOString();
      await db.claimWatch(at);
      const sample = await sampleWatch(watchWeekends(), log);
      const { summary, changes } = compareWatch(state.snapshot, sample);
      await db.saveWatchRun({ at, summary, changes, snapshot: nextSnapshot(state.snapshot, sample) });
      await refreshStats();
      log(`watch: ${changes.length} price changes`);
      return true;
    } catch (error) {
      log(`watch failed: ${error.message}`);
      return false;
    }
  }

  return { runIfDue, refreshStats };
}
