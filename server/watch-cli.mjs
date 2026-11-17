import { checkBudget } from './budget.mjs';
import { connect, databaseBlocked } from './connect.mjs';
import { openDatabase } from './db.mjs';
import { createWatcher } from './watch.mjs';

// One price-watch run when one is due: what GitHub runs every ten minutes, next to the price rounds.
// Usage: node server/watch-cli.mjs
const log = (line) => console.log(`${new Date().toISOString()} ${line}`);

const { client, where } = connect();
if (await databaseBlocked(client)) {
  console.log('::warning::Turso blocks the database until its monthly limit resets; no watch.');
  process.exit(0);
}
// The watch is the first thing to go when the month's database budget runs low (server/budget.mjs).
const budget = await checkBudget();
if (budget.level !== 'normal') {
  console.log(`::warning::Turso: ${budget.percent}% of this month's limit used; no watch.`);
  process.exit(0);
}
const db = await openDatabase(client);
if (!(await createWatcher(db, { log }).runIfDue())) log(`no watch due (${where})`);
db.close();
