import { createCollector } from './collector.mjs';
import { openDatabase } from './db.mjs';
import { createApiHandler } from './handler.mjs';

const AUTO_SCAN_CHECK_MS = 15 * 60 * 1000;

/**
 * The API on the Mac: the shared routes, plus a collector that fetches prices while the server runs.
 * @param autoScan false serves the routes only, without fetching anything (the smoke test before a deploy)
 */
export async function createApi({ client, googleApiKey = null, appUrl = null, autoScan = true, log = () => {} }) {
  const db = await openDatabase(client);
  const collector = createCollector(db, { log, googleApiKey, appUrl });

  if (autoScan) {
    // The settings screen needs the accommodation features before any price round has run.
    if (!(await db.facilityGroups('accommodation')).length) {
      collector.refreshDefinitions().catch((error) => log(`filter definitions failed: ${error.message}`));
    }
    // A freshly added Google key should not wait for the next price round, nor details a stopped round missed.
    collector
      .collectRatings()
      .then(() => collector.collectAccommodations())
      .then(() => collector.refreshOverviewIfStale())
      .then(() => collector.summarizeRounds());
  }

  const runIfDue = async () => {
    try {
      if (await collector.isDue()) collector.collect();
    } catch (error) {
      log(`round check failed: ${error.message}`);
    }
  };
  const timer = autoScan ? setInterval(runIfDue, AUTO_SCAN_CHECK_MS) : null;
  if (autoScan) runIfDue();

  const handle = createApiHandler(db, {
    googleApiKey,
    live: () => collector.progress,
    // Right away, or after the round in progress here; while the background job is busy, it picks this up next.
    // Without auto scan this process fetches nothing: the request waits for the background job.
    onScanRequested: () => autoScan && (collector.progress.running ? collector.collect() : runIfDue()),
    // Only the owner reaches the server on the Mac.
    isAdmin: () => true,
  });

  function close() {
    clearInterval(timer);
    collector
      .cancel()
      .catch((error) => log(`stop not saved: ${error.message}`))
      .finally(() => db.close());
  }

  return { handle, close };
}
