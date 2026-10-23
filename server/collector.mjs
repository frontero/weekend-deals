import { scanChanges, SHOWN_ROUNDS } from '../shared/scan-changes.mjs';
import { lastScheduledRound } from '../shared/schedule.mjs';
import { localToday, upcomingWeekends } from '../shared/weekends.mjs';
import { checkAlerts } from './alert-check.mjs';
import { fetchFilterGroups } from './facilities.mjs';
import { fetchGoogleRating, MONTHLY_GOOGLE_BUDGET } from './google.mjs';
import { sleep } from './http.mjs';
import { fetchParksWithFacility } from './landal.mjs';
import { overviewIsStale, refreshOverview } from './overview.mjs';
import { activeProviders, PROVIDERS, providerBrand } from './providers.mjs';
import { roundInProgress } from './status.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
// Park facilities hardly change, and mapping them costs a few hundred requests.
const FACILITIES_MAX_AGE_MS = 7 * DAY_MS;
// Park pages are read one at a time, with a pause in between, like the price searches.
const FACILITY_PAGE_PAUSE_MS = 400;
// Google's terms allow keeping place data for 30 days.
const RATING_MAX_AGE_MS = 30 * DAY_MS;
// Other processes see the progress this often; every step would be a write over the network.
const PROGRESS_WRITE_MS = 5000;
// One search usually lists all of a park's accommodations; a second weekend catches most of the rest.
const MAX_ACCOMMODATION_SEARCHES_PER_PARK = 2;

const currentMonth = () => new Date().toISOString().slice(0, 7);

/** @param appUrl where a price alert's message leads, e.g. the cloud app; without it the message has no link */
export function createCollector(db, { log = () => {}, googleApiKey = null, appUrl = null } = {}) {
  const progress = { running: false, phase: null, done: 0, total: 0, startedAt: null, error: null };
  let rerunRequested = false;
  // Set when the server stops; the database is closed by then, so no more writes.
  let cancelled = false;
  let progressWrittenAt = 0;
  // Set when accommodation details came in, which every overview shows.
  let detailsAdded = false;

  function throwIfCancelled() {
    if (cancelled) throw new Error('Collector stopped');
  }

  async function writeProgress(force = false) {
    if (cancelled || (!force && Date.now() - progressWrittenAt < PROGRESS_WRITE_MS)) return;
    progressWrittenAt = Date.now();
    await db.saveCollectorStatus({ ...progress, heartbeatAt: new Date().toISOString() });
  }

  async function startPhase(phase, total) {
    Object.assign(progress, { phase, done: 0, total });
    await writeProgress(true);
  }

  async function step() {
    progress.done += 1;
    await writeProgress();
  }

  const followedParties = () => db.followedParties();

  /**
   * The party sizes a round collects: all of them when someone asked for a round, otherwise the ones someone named,
   * the ones never collected and the ones not collected since the last scheduled round time. New sizes first: the
   * screen has nothing to show for them yet.
   */
  async function partiesToCollect({ everything, requested = [] }) {
    const scheduled = lastScheduledRound((await db.getSettings()).rounds);
    const due = (party) =>
      everything ||
      requested.includes(party.key) ||
      !party.collected ||
      (scheduled !== null && Date.parse(party.lastStartedAt) < scheduled.getTime());
    return (await followedParties()).filter(due).sort((a, b) => Number(a.collected) - Number(b.collected));
  }

  /** One request: the names of all park facilities and accommodation features. */
  async function refreshDefinitions() {
    const groups = await fetchFilterGroups();
    throwIfCancelled();
    await db.replaceFacilityDefinitions(groups);
    return groups;
  }

  async function refreshFacilities() {
    const groups = await refreshDefinitions();
    const updatedAt = await db.facilitiesUpdatedAt();
    if (updatedAt && Date.now() - Date.parse(updatedAt) < FACILITIES_MAX_AGE_MS) return;

    const options = groups.park.flatMap((group) => group.options);
    await startPhase('facilities', options.length);

    const parksByFacility = new Map();
    for (const option of options) {
      parksByFacility.set(option.id, await fetchParksWithFacility(option.id));
      throwIfCancelled();
      await step();
    }
    await db.replaceParkFacilities(parksByFacility);
    log(`facilities: ${options.length} mapped`);
  }

  /** Other providers list a park's facilities on its own page: one request per park, weekly like Landal's. */
  async function refreshFacilityNames() {
    const updatedAt = await db.facilityNamesUpdatedAt();
    if (updatedAt && Date.now() - Date.parse(updatedAt) < FACILITIES_MAX_AGE_MS) return;
    const readers = new Map(PROVIDERS.filter((provider) => provider.fetchFacilityNames).map((provider) => [provider.id, provider]));
    const parks = [...(await db.parks()).values()].filter((park) => readers.has(park.provider));
    if (!parks.length) return;

    await startPhase('facilities', parks.length);
    const namesByPark = new Map();
    for (const park of parks) {
      try {
        namesByPark.set(park.code, await readers.get(park.provider).fetchFacilityNames(park));
      } catch (error) {
        if (cancelled) throw error;
        log(`${park.code} facilities failed: ${error.message}`);
      }
      throwIfCancelled();
      await sleep(FACILITY_PAGE_PAUSE_MS);
      await step();
    }
    await db.replaceFacilityNames(namesByPark);
    log(`facility pages: ${namesByPark.size} of ${parks.length} parks read`);
  }

  /** One scan for one party. A provider failing costs only its own prices; the scan fails only if all fail. */
  async function collectParty({ key, party, providers }, weekends, failures) {
    const scanId = await db.startScan(key);
    const failed = new Set();
    try {
      for (const weekend of weekends) {
        for (const provider of providers) {
          try {
            const offers = await provider.fetchWeekendOffers({ ...party, ...weekend });
            throwIfCancelled();
            await db.savePrices(scanId, weekend, offers);
            log(`${key} ${weekend.arrival} ${provider.id}: ${offers.length} parks`);
          } catch (error) {
            if (cancelled) throw error;
            failures.set(provider.id, error.message);
            failed.add(provider.id);
            log(`${key} ${weekend.arrival} ${provider.id} failed: ${error.message}`);
          }
          await step();
        }
      }
      if (failed.size === providers.length) throw new Error(failures.get(providers[0].id));
      await db.finishScan(scanId);
      return scanId;
    } catch (error) {
      if (!cancelled) await db.finishScan(scanId, error.message);
      throw error;
    }
  }

  /** @returns [{ scanId, party }] for the scans this round made */
  async function collectPrices(parties) {
    const settings = await db.getSettings();
    const weekends = upcomingWeekends(localToday(), settings.weeksAhead);
    const plans = parties.map((followed) => ({ ...followed, providers: activeProviders(PROVIDERS, followed.party) }));
    await startPhase('prices', plans.reduce((total, plan) => total + weekends.length * plan.providers.length, 0));
    const failures = new Map();
    const scans = [];
    try {
      for (const plan of plans) scans.push({ scanId: await collectParty(plan, weekends, failures), party: plan.party });
      return scans;
    } finally {
      if (!cancelled) await db.setProviderErrors(Object.fromEntries(failures));
    }
  }

  /** The latest finished scan of every followed party: the prices the screen shows. */
  async function latestScans() {
    const scanIds = await db.lastFinishedScans();
    return (await followedParties())
      .filter(({ key }) => scanIds.has(key))
      .map(({ key, party }) => ({ scanId: scanIds.get(key), party }));
  }

  /** Per park, the accommodations behind shown prices whose details are not known yet. */
  async function accommodationJobs(scans) {
    const jobs = [];
    for (const { scanId, party } of scans) {
      for (const provider of PROVIDERS.filter((candidate) => candidate.fetchAccommodations)) {
        const byPark = Map.groupBy(await db.missingAccommodations(scanId, provider.id), (row) => row.parkCode);
        for (const [parkCode, rows] of byPark) jobs.push({ provider, party, parkCode, rows });
      }
    }
    return jobs;
  }

  /**
   * Names, facts and photos of the accommodations behind the shown prices, for providers that list them apart.
   * They hardly change, so each is fetched once; details a stopped round missed are fetched by the next one.
   * Extra, like the ratings: a failing park is only logged.
   */
  async function refreshAccommodations(jobs) {
    if (!jobs.length) return;
    await startPhase('accommodations', jobs.length);

    // A search for another party may already have listed an accommodation in this round.
    const found = new Set();
    for (const { provider, party, parkCode, rows } of jobs) {
      const wanted = new Set(rows.map((row) => row.code).filter((code) => !found.has(`${parkCode}|${code}`)));
      let searches = 0;
      try {
        // A search lists what is free that weekend, so search a weekend where a missing one had the price.
        for (const { code, arrival, departure } of rows) {
          if (!wanted.has(code) || searches === MAX_ACCOMMODATION_SEARCHES_PER_PARK) continue;
          searches += 1;
          const accommodations = await provider.fetchAccommodations(parkCode, { ...party, arrival, departure });
          throwIfCancelled();
          await db.saveAccommodations(parkCode, accommodations);
          detailsAdded ||= accommodations.length > 0;
          for (const accommodation of accommodations) {
            wanted.delete(accommodation.code);
            found.add(`${parkCode}|${accommodation.code}`);
          }
        }
      } catch (error) {
        if (cancelled) throw error;
        log(`${parkCode} accommodations failed: ${error.message}`);
      }
      await step();
    }
    log(`accommodations: ${jobs.length} parks looked up`);
  }

  const ratingsCutoff = () => new Date(Date.now() - RATING_MAX_AGE_MS).toISOString();

  async function ratingsDue() {
    return Boolean(googleApiKey) && (await db.parksNeedingRatings(ratingsCutoff())).length > 0;
  }

  /** Google ratings are extra: a failure is remembered for the screen, never thrown. */
  async function refreshRatings() {
    if (!googleApiKey) return;
    const month = currentMonth();
    const budget = Math.max(0, MONTHLY_GOOGLE_BUDGET - (await db.googleRequests(month)));
    const parks = (await db.parksNeedingRatings(ratingsCutoff())).slice(0, budget);
    if (!parks.length) return;

    await startPhase('ratings', parks.length);
    try {
      for (const park of parks) {
        // A park can take two requests, so stop while both still fit in the budget.
        if ((await db.googleRequests(month)) >= MONTHLY_GOOGLE_BUDGET - 1) break;
        const rating = await fetchGoogleRating(park, googleApiKey, {
          onRequest: () => db.countGoogleRequest(month),
          brand: providerBrand(park.provider),
        });
        throwIfCancelled();
        await db.saveGoogleRating(park.code, rating);
        await step();
      }
      await db.setGoogleError(null);
      log(`google ratings: ${progress.done} looked up`);
    } catch (error) {
      if (cancelled) throw error;
      await db.setGoogleError(error.message);
      log(`google ratings failed: ${error.message}`);
    }
  }

  /** Rebuilds the screen's data of each collected party whose data is missing or outdated. */
  async function updateOverviews() {
    if (cancelled) return;
    // New accommodation details go into every overview, also of parties this round did not collect.
    const rebuildAll = detailsAdded;
    detailsAdded = false;
    try {
      for (const { party, collected } of await followedParties()) {
        // A size without prices yet has nothing to show.
        if (collected && (rebuildAll || (await overviewIsStale(db, party)))) {
          await refreshOverview(db, { googleEnabled: Boolean(googleApiKey), party });
        }
      }
    } catch (error) {
      log(`overview failed: ${error.message}`);
    }
  }

  /** What each recent round changed, for the admin page; extra, so a failure is only logged. Never rejects. */
  async function summarizeRounds() {
    if (cancelled) return;
    try {
      for (const { scanId, previousScanId } of await db.scansWithoutChanges(SHOWN_ROUNDS)) {
        const previous = previousScanId === null ? [] : await db.scanRows(previousScanId);
        throwIfCancelled();
        await db.saveScanChanges(scanId, previousScanId, scanChanges(await db.scanRows(scanId), previous));
      }
    } catch (error) {
      if (!cancelled) log(`round changes failed: ${error.message}`);
    }
  }

  async function run(steps) {
    Object.assign(progress, {
      running: true,
      phase: null,
      done: 0,
      total: 0,
      startedAt: new Date().toISOString(),
      error: null,
    });
    try {
      await writeProgress(true);
      await steps();
    } catch (error) {
      progress.error = error.message;
      log(`scan failed: ${error.message}`);
    } finally {
      Object.assign(progress, { running: false, phase: null });
      await writeProgress(true).catch((error) => log(`progress not saved: ${error.message}`));
      await updateOverviews();
      await summarizeRounds();
      if (!cancelled) await checkAlerts(db, { appUrl, log }).catch((error) => log(`alerts failed: ${error.message}`));
    }
  }

  /** Never rejects: callers fire and forget. */
  async function collect() {
    if (cancelled) return;
    if (progress.running) {
      rerunRequested = true;
      return;
    }

    await run(async () => {
      // Whoever asked for a round gets this one: with every size, or with the ones they named.
      const request = await db.scanRequest();
      await db.clearScanRequest();
      const everything = request.requestedAt !== null && !request.parties.length;
      const parties = await partiesToCollect({ everything, requested: request.parties });
      // Prices matter more than facilities, so a facility failure must not block them.
      await refreshFacilities().catch((error) => log(`facilities failed: ${error.message}`));
      throwIfCancelled();
      await refreshFacilityNames().catch((error) => log(`facility pages failed: ${error.message}`));
      throwIfCancelled();
      if (parties.length) await collectPrices(parties);
      await refreshAccommodations(await accommodationJobs(await latestScans())).catch((error) =>
        log(`accommodations failed: ${error.message}`),
      );
      throwIfCancelled();
      await refreshRatings();
    });

    if (rerunRequested && !cancelled) {
      rerunRequested = false;
      await collect();
    }
  }

  /** Only the accommodation details that are missing, e.g. after a round was stopped halfway. Never rejects. */
  async function collectAccommodations() {
    let jobs;
    try {
      if (cancelled || progress.running) return;
      jobs = await accommodationJobs(await latestScans());
    } catch (error) {
      log(`accommodations check failed: ${error.message}`);
      return;
    }
    if (jobs.length) await run(() => refreshAccommodations(jobs));
  }

  /** Only the Google ratings, e.g. right after an API key was added. Never rejects. */
  async function collectRatings() {
    try {
      if (cancelled || progress.running || !(await ratingsDue())) return;
    } catch (error) {
      log(`google ratings check failed: ${error.message}`);
      return;
    }
    await run(refreshRatings);
  }

  /** Rebuilds the screen's data when it is missing or outdated. Never rejects. */
  async function refreshOverviewIfStale() {
    if (!progress.running) await updateOverviews();
  }

  /** Stops all writes; a round in progress is first marked as interrupted, for the screens that show it. */
  async function cancel() {
    if (cancelled) return;
    cancelled = true;
    if (!progress.running) return;
    const interrupted = { ...progress, running: false, phase: null, error: 'Round interrupted' };
    await db.saveCollectorStatus({ ...interrupted, heartbeatAt: new Date().toISOString() });
  }

  /**
   * A round is due when the cloud app asked for one, a party size has not been collected yet, or a scheduled round
   * time (06:45 and 18:00 by default) passed since a size's last round.
   */
  async function isDue() {
    if (progress.running) return false;
    // The app and the background job each collect; while one is busy, the other waits for its next check.
    if (roundInProgress(await db.collectorStatus())) return false;
    if (await db.scanRequestedAt()) return true;
    return (await partiesToCollect({ everything: false })).length > 0;
  }

  return {
    progress,
    collect,
    collectRatings,
    collectAccommodations,
    summarizeRounds,
    refreshDefinitions,
    refreshOverviewIfStale,
    isDue,
    cancel,
  };
}
