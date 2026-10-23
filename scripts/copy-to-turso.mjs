// Copies the local price database to Turso, so the history collected so far comes along. Safe to run again: rows
// are replaced, not doubled. Usage: npm run storage:copy [-- path/to/other.db]
import { existsSync } from 'node:fs';
import { connect, connectFile, LOCAL_DATABASE_FILE } from '../server/connect.mjs';
import { insertRows, migrate } from '../server/db.mjs';

// Parents before children, so the price rows find their parks and rounds.
const TABLES = [
  'parks',
  'google_ratings',
  'scans',
  'prices',
  'facilities',
  'park_facilities',
  'park_facility_names',
  'accommodations',
  'parties',
  'alerts',
  'alert_deliveries',
  'settings',
  'overviews',
];
const ROWS_PER_READ = 2000;
const STATEMENTS_PER_BATCH = 20;

const sourceFile = process.argv[2] ?? LOCAL_DATABASE_FILE;
if (!existsSync(sourceFile)) {
  console.log(`Nothing to copy: ${sourceFile} does not exist.`);
  process.exit(0);
}
const target = connect();
if (target.where !== 'Turso') {
  console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are not in .env.local; run scripts/setup-turso.sh first.');
  process.exit(1);
}
const { client: source } = connectFile(sourceFile);
// Both get the current layout, so every column has a place on the other side.
await migrate(source);
await migrate(target.client);

const roundsIn = async (client) =>
  new Map((await client.execute('SELECT id, started_at FROM scans')).rows.map((row) => [row.id, row.started_at]));
const [localRounds, remoteRounds] = await Promise.all([roundsIn(source), roundsIn(target.client)]);
const foreign = [...remoteRounds].filter(([id, startedAt]) => localRounds.get(id) !== startedAt);
if (foreign.length) {
  console.error(`Turso already has ${foreign.length} price round(s) that are not in ${sourceFile}.`);
  console.error('Copying now would mix up the two histories, so nothing was copied.');
  process.exit(1);
}

for (const table of TABLES) {
  const columns = (await source.execute(`PRAGMA table_info(${table})`)).rows.map((column) => column.name);
  let copied = 0;
  for (let offset = 0; ; offset += ROWS_PER_READ) {
    const { rows } = await source.execute({
      sql: `SELECT ${columns.join(', ')} FROM ${table} ORDER BY rowid LIMIT ? OFFSET ?`,
      args: [ROWS_PER_READ, offset],
    });
    if (!rows.length) break;
    const statements = insertRows('INSERT OR REPLACE', table, columns, rows.map((row) => columns.map((column) => row[column])));
    for (let start = 0; start < statements.length; start += STATEMENTS_PER_BATCH) {
      await target.client.batch(statements.slice(start, start + STATEMENTS_PER_BATCH), 'write');
    }
    copied += rows.length;
  }
  console.log(`${table}: ${copied} rows`);
}

source.close();
target.client.close();
console.log('Copied to Turso. From now on the app and the background job use Turso.');
