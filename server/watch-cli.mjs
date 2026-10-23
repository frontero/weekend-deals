import { connect } from './connect.mjs';
import { openDatabase } from './db.mjs';
import { createWatcher } from './watch.mjs';

// One price-watch run when one is due: what GitHub runs every ten minutes, next to the price rounds.
// Usage: node server/watch-cli.mjs
const log = (line) => console.log(`${new Date().toISOString()} ${line}`);

const { client, where } = connect();
const db = await openDatabase(client);
if (!(await createWatcher(db, { log }).runIfDue())) log(`no watch due (${where})`);
db.close();
