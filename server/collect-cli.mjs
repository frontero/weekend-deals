import { createCollector } from './collector.mjs';
import { connect } from './connect.mjs';
import { openDatabase } from './db.mjs';
import { createWatcher } from './watch.mjs';

// With --if-due a round only runs when the "refresh every … hours" setting or the cloud app asks for one, so the
// background job can check often without fetching more than the app would.
const onlyIfDue = process.argv.includes('--if-due');
const log = (line) => console.log(`${new Date().toISOString()} ${line}`);

const { client, where } = connect();
const db = await openDatabase(client);
const collector = createCollector(db, {
  log,
  googleApiKey: process.env.GOOGLE_PLACES_API_KEY || null,
  // Price alert messages link to the cloud app, which a phone can open.
  appUrl: process.env.WORKER_URL || null,
});

// The price watch first: it takes half a minute, a round can take an hour.
await createWatcher(db, { log }).runIfDue();

if (onlyIfDue && !(await collector.isDue())) {
  // Fills in accommodation details a stopped round missed, and keeps the advice current on days without a round.
  await collector.collectAccommodations();
  await collector.refreshOverviewIfStale();
  await collector.summarizeRounds();
  log(`no round due (${where})`);
} else {
  log(`round started (${where})`);
  await collector.collect();
}
db.close();

if (collector.progress.error) {
  console.error(collector.progress.error);
  process.exitCode = 1;
}
