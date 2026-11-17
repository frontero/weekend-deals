import { checkBudget } from './budget.mjs';
import { createCollector } from './collector.mjs';
import { connect, dailyAlarmDue, databaseBlocked } from './connect.mjs';
import { openDatabase } from './db.mjs';
import { createWatcher } from './watch.mjs';

// With --if-due a round only runs when the "refresh every … hours" setting or the cloud app asks for one, so the
// background job can check often without fetching more than the app would.
const onlyIfDue = process.argv.includes('--if-due');
const log = (line) => console.log(`${new Date().toISOString()} ${line}`);

const { client, where } = connect();
if (await databaseBlocked(client)) {
  const alarm = dailyAlarmDue();
  console.log(`::${alarm ? 'error' : 'warning'}::Turso blocks the database until its monthly limit resets; no round.`);
  process.exit(alarm ? 1 : 0);
}
// Before the monthly limit is reached: past 70% only the default prices, past 90% nothing (server/budget.mjs).
const budget = await checkBudget();
if (budget.level !== 'normal') {
  const what = budget.level === 'stop' ? 'no round until next month' : 'only the 2-person prices, no price watch';
  console.log(`::${dailyAlarmDue() ? 'error' : 'warning'}::Turso: ${budget.percent}% of this month's limit used; ${what}.`);
  if (dailyAlarmDue()) process.exitCode = 1;
  if (budget.level === 'stop') process.exit();
}
const db = await openDatabase(client);
const collector = createCollector(db, {
  log,
  essentialOnly: budget.level === 'essential',
  googleApiKey: process.env.GOOGLE_PLACES_API_KEY || null,
  // Price alert messages link to the cloud app, which a phone can open.
  appUrl: process.env.WORKER_URL || null,
});

// A failure outside a round (the database out of reach, say) ends this check with a message instead of a crash; the
// next check comes in ten minutes.
try {
  // The price watch first: it takes half a minute, a round can take an hour.
  if (budget.level === 'normal') await createWatcher(db, { log }).runIfDue();

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
} catch (error) {
  log(`check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  db.close();
}

if (collector.progress.error) {
  console.error(collector.progress.error);
  process.exitCode = 1;
}
