// Measures at what time of day Landal, Topparken and Molecaten change their prices: the same few searches every half
// hour for two days, every accommodation's price stored in data/update-timing.db (apart from the app's database).
// Usage: node scripts/update-timing.mjs on|off|status|run|report
//   on      sample every half hour until 48 hours after the first sample (a launchd agent that removes itself then)
//   off     stop early
//   status  how far the measurement is
//   run     take one sample now (what the agent runs)
//   report  when prices changed, per provider and hour of the day
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { sleep } from '../server/http.mjs';
import { fetchParkAccommodationPrices } from '../server/landal.mjs';
import { parseDutchPrice, search as searchMolecaten } from '../server/molecaten.mjs';
import { fetchCheapestStays } from '../server/topparken.mjs';
import { localToday, shiftDays, upcomingWeekends } from '../shared/weekends.mjs';
import { buildReport } from './update-timing-report.mjs';

const LABEL = 'local.weekend-deals.update-timing';
// Keeps the Mac from sleeping while on mains power, so the night is measured too.
const AWAKE_LABEL = `${LABEL}.awake`;
const DURATION_MS = 48 * 60 * 60 * 1000;
const REQUEST_PAUSE_MS = 400;
const PARTY = { adults: 2, children: 0, pets: 0 };
// Drenthe, the coast, South Limburg, the Moselle and the Austrian Alps.
const LANDAL_PARKS = ['HRK', 'EZE', 'SRG', 'CHM', 'MAM'];
const MOLECATEN_NETHERLANDS = 1;
const MOLECATEN_PAGES = 2;

const project = fileURLToPath(new URL('..', import.meta.url));
const dataDir = join(project, 'data');
const logFile = join(dataDir, 'update-timing.log');
const reportFile = join(dataDir, 'update-timing-report.txt');
const launchAgents = join(homedir(), 'Library', 'LaunchAgents');
const plistFile = (label) => join(launchAgents, `${label}.plist`);
const service = (label) => `gui/${process.getuid()}/${label}`;

const escapeXml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function plist(label, args, schedule) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((arg) => `    <string>${escapeXml(arg)}</string>`).join('\n')}
  </array>
  <key>WorkingDirectory</key><string>${escapeXml(project)}</string>
${schedule}  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${escapeXml(logFile)}</string>
  <key>StandardErrorPath</key><string>${escapeXml(logFile)}</string>
</dict>
</plist>
`;
}

// On the hour and the half hour; after the Mac wakes, launchd runs a missed one once.
const HALF_HOURLY = `  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Minute</key><integer>0</integer></dict>
    <dict><key>Minute</key><integer>30</integer></dict>
  </array>
`;

const launchctl = (...args) => execFileSync('launchctl', args, { stdio: 'pipe' }).toString();
const isLoaded = (label) => {
  try {
    launchctl('print', service(label));
    return true;
  } catch {
    return false;
  }
};

function install(label, args, schedule = '') {
  mkdirSync(launchAgents, { recursive: true });
  writeFileSync(plistFile(label), plist(label, args, schedule));
  if (isLoaded(label)) launchctl('bootout', service(label));
  launchctl('bootstrap', `gui/${process.getuid()}`, plistFile(label));
}

// The sampler's own agent goes last: booting it out ends this process when the agent runs it.
function turnOff() {
  for (const label of [AWAKE_LABEL, LABEL]) {
    if (existsSync(plistFile(label))) rmSync(plistFile(label));
    if (isLoaded(label)) launchctl('bootout', service(label));
  }
}

function openDatabase() {
  mkdirSync(dataDir, { recursive: true });
  return createClient({ url: `file:${join(dataDir, 'update-timing.db')}` });
}

async function migrate(db) {
  await db.batch(
    [
      'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
      // One row per search per run, also when it failed, so a missing accommodation can be told from a failed request.
      `CREATE TABLE IF NOT EXISTS searches (
        sampled_at TEXT NOT NULL, provider TEXT NOT NULL, search TEXT NOT NULL, arrival TEXT NOT NULL,
        results INTEGER, error TEXT,
        PRIMARY KEY (sampled_at, provider, search, arrival))`,
      // Topparken only gives each park's cheapest stay: its accommodation is ''.
      `CREATE TABLE IF NOT EXISTS samples (
        sampled_at TEXT NOT NULL, provider TEXT NOT NULL, search TEXT NOT NULL, park TEXT NOT NULL,
        accommodation TEXT NOT NULL, arrival TEXT NOT NULL, price_cents INTEGER NOT NULL,
        PRIMARY KEY (sampled_at, provider, park, accommodation, arrival))`,
    ],
    'write',
  );
}

async function readMeta(db) {
  const { rows } = await db.execute('SELECT key, value FROM meta');
  return Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value)]));
}

const writeMeta = (db, values) =>
  db.batch(
    Object.entries(values).map(([key, value]) => ({
      sql: 'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
      args: [key, JSON.stringify(value)],
    })),
    'write',
  );

// The weekends stay fixed for the whole measurement: the first one after it ends, and about four and twelve weeks out.
function chooseWeekends() {
  const weekends = upcomingWeekends(shiftDays(localToday(), 3), 12);
  return [weekends[0], weekends[3], weekends[11]];
}

/** The searches of one run, each turning into rows of { park, accommodation, priceCents }. */
function searchesFor(weekend) {
  const query = { ...weekend, ...PARTY };
  return [
    ...LANDAL_PARKS.map((park) => ({
      provider: 'landal',
      search: park,
      fetch: async () =>
        (await fetchParkAccommodationPrices(park, query)).map(({ code, priceCents }) => ({
          park,
          accommodation: code,
          priceCents,
        })),
    })),
    {
      provider: 'topparken',
      search: 'all',
      fetch: async () =>
        (await fetchCheapestStays(query)).map((offer) => ({
          park: offer.park.code,
          accommodation: '',
          priceCents: offer.priceCents,
        })),
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

async function sample(db, weekends) {
  const sampledAt = new Date().toISOString();
  let prices = 0;
  let failed = 0;

  for (const weekend of weekends) {
    for (const { provider, search, fetch } of searchesFor(weekend)) {
      const key = [sampledAt, provider, search, weekend.arrival];
      try {
        const rows = await fetch();
        await db.batch(
          [
            { sql: 'INSERT INTO searches VALUES (?, ?, ?, ?, ?, NULL)', args: [...key, rows.length] },
            ...rows.map((row) => ({
              sql: 'INSERT OR IGNORE INTO samples VALUES (?, ?, ?, ?, ?, ?, ?)',
              args: [sampledAt, provider, search, row.park, row.accommodation, weekend.arrival, row.priceCents],
            })),
          ],
          'write',
        );
        prices += rows.length;
      } catch (error) {
        await db.execute({ sql: 'INSERT INTO searches VALUES (?, ?, ?, ?, NULL, ?)', args: [...key, error.message] });
        failed += 1;
      }
      await sleep(REQUEST_PAUSE_MS);
    }
  }

  const seconds = Math.round((Date.now() - Date.parse(sampledAt)) / 1000);
  console.log(`${sampledAt} sampled ${prices} prices, ${failed} searches failed, ${seconds} s`);
}

async function finish(db) {
  writeFileSync(reportFile, `${await buildReport(db)}\n`);
  console.log(`${new Date().toISOString()} measurement over; report in ${reportFile}`);
  turnOff();
}

const db = openDatabase();
await migrate(db);
let meta = await readMeta(db);
// The first sample fixes the weekends and starts the 48 hours.
if (['on', 'run'].includes(process.argv[2]) && !meta.endsAt) {
  const startedAt = new Date().toISOString();
  const endsAt = new Date(Date.parse(startedAt) + DURATION_MS).toISOString();
  await writeMeta(db, { startedAt, endsAt, weekends: chooseWeekends(), parks: LANDAL_PARKS });
  meta = await readMeta(db);
}
const running = Date.now() < Date.parse(meta.endsAt);

switch (process.argv[2]) {
  case 'on': {
    if (!running) {
      console.log(`The measurement ended at ${meta.endsAt}; remove data/update-timing.db to start a new one.`);
      break;
    }
    install(LABEL, [process.execPath, 'scripts/update-timing.mjs', 'run'], HALF_HOURLY);
    // Half an hour beyond the end, so the run that removes both agents still finds the Mac awake.
    const awakeSeconds = Math.round((Date.parse(meta.endsAt) - Date.now()) / 1000) + 1800;
    install(AWAKE_LABEL, ['/usr/bin/caffeinate', '-s', '-t', String(awakeSeconds)]);
    console.log(`Sampling every half hour until ${new Date(meta.endsAt).toLocaleString('nl-NL')}. Log: ${logFile}`);
    break;
  }
  case 'off':
    turnOff();
    console.log('Sampling off.');
    break;
  case 'run':
    if (running) await sample(db, meta.weekends);
    else await finish(db);
    break;
  case 'status': {
    const { rows } = await db.execute(
      `SELECT COUNT(DISTINCT sampled_at) AS runs, MAX(sampled_at) AS last,
        SUM(error IS NOT NULL) AS failed, COUNT(*) AS searches FROM searches`,
    );
    const { runs, last, failed, searches } = rows[0];
    console.log(
      meta.endsAt
        ? `${meta.startedAt} → ${meta.endsAt}: ${runs} runs, last ${last}; ${failed ?? 0} of ${searches} searches failed. ` +
            `Sampling: ${isLoaded(LABEL) ? 'on' : 'off'}, keeping awake: ${isLoaded(AWAKE_LABEL) ? 'on' : 'off'}.`
        : 'No measurement started.',
    );
    break;
  }
  case 'report':
    console.log(await buildReport(db));
    break;
  default:
    console.log('Usage: node scripts/update-timing.mjs on|off|status|run|report');
}
