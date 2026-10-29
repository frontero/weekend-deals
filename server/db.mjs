import { groupKey, STANDARD_PARTIES } from '../shared/party.mjs';
import { clampSettings, DEFAULT_SETTINGS } from './settings.mjs';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS parks (
    code TEXT PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT 'landal',
    name TEXT NOT NULL,
    region TEXT,
    city TEXT,
    country TEXT,
    url TEXT,
    prices_url TEXT,
    review_score REAL,
    image_url TEXT,
    lat REAL,
    lng REAL,
    brand_code TEXT
  );
  CREATE TABLE IF NOT EXISTS google_ratings (
    park_code TEXT PRIMARY KEY,
    place_id TEXT,
    place_name TEXT,
    rating REAL,
    rating_count INTEGER,
    maps_url TEXT,
    fetched_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_key TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    error TEXT
  );
  CREATE TABLE IF NOT EXISTS prices (
    scan_id INTEGER NOT NULL REFERENCES scans (id),
    park_code TEXT NOT NULL REFERENCES parks (code),
    arrival TEXT NOT NULL,
    departure TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    accommodation_code TEXT,
    booking_url TEXT,
    PRIMARY KEY (scan_id, park_code, arrival)
  );
  CREATE INDEX IF NOT EXISTS prices_by_weekend ON prices (arrival, park_code);
  CREATE TABLE IF NOT EXISTS facilities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    group_name TEXT NOT NULL,
    kind TEXT NOT NULL,
    any_of INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS park_facilities (
    park_code TEXT NOT NULL,
    facility_id TEXT NOT NULL,
    PRIMARY KEY (park_code, facility_id)
  );
  CREATE TABLE IF NOT EXISTS park_facility_names (
    park_code TEXT NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (park_code, name)
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS accommodations (
    park_code TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT,
    url TEXT,
    facts TEXT NOT NULL,
    photos TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (park_code, code)
  );
  CREATE TABLE IF NOT EXISTS parties (
    group_key TEXT PRIMARY KEY,
    party TEXT NOT NULL,
    standard INTEGER NOT NULL DEFAULT 0,
    used_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    party_key TEXT NOT NULL,
    search TEXT NOT NULL,
    query TEXT NOT NULL,
    label TEXT NOT NULL,
    primed INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS alert_deliveries (
    alert_id TEXT NOT NULL,
    park_code TEXT NOT NULL,
    arrival TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    told_at TEXT NOT NULL,
    PRIMARY KEY (alert_id, park_code, arrival)
  );
  CREATE TABLE IF NOT EXISTS scan_changes (
    scan_id INTEGER PRIMARY KEY,
    previous_scan_id INTEGER,
    summary TEXT NOT NULL,
    stats TEXT
  );
  CREATE INDEX IF NOT EXISTS prices_by_park ON prices (park_code, scan_id);
  CREATE TABLE IF NOT EXISTS watch_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL UNIQUE,
    summary TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS watch_changes (
    run_id INTEGER NOT NULL REFERENCES watch_runs (id),
    provider TEXT NOT NULL,
    park TEXT NOT NULL,
    accommodation TEXT NOT NULL,
    arrival TEXT NOT NULL,
    old_cents INTEGER NOT NULL,
    new_cents INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    provider TEXT NOT NULL,
    park_code TEXT,
    arrival TEXT,
    source TEXT,
    party_key TEXT
  );
  CREATE TABLE IF NOT EXISTS admin_stats (
    group_key TEXT PRIMARY KEY,
    computed_at TEXT NOT NULL,
    data BLOB NOT NULL
  );
  CREATE TABLE IF NOT EXISTS overviews (
    group_key TEXT PRIMARY KEY,
    computed_at TEXT NOT NULL,
    meta TEXT NOT NULL,
    parks BLOB NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pages (
    path TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    image TEXT,
    body TEXT NOT NULL,
    computed_at TEXT NOT NULL
  );
`;

// Latest price per park and weekend, plus how that weekend's price behaved over all scans. The reference is the
// latest observation from before a cut-off (a few days ago), to see which way the price went since.
const PRICE_SUMMARIES = `
  WITH scoped AS (
    SELECT prices.*, scans.started_at AS observed_at
    FROM prices
    JOIN scans ON scans.id = prices.scan_id
    -- Through the size's scans, so only its own prices are read, not those of every size.
    WHERE prices.scan_id IN (SELECT id FROM scans WHERE group_key = ?) AND prices.arrival >= ?
  ),
  -- The accommodation behind the latest price. Which accommodation is cheapest shifts with availability, at times
  -- back and forth between rounds; a price only counts as moving when that same accommodation changed price.
  latest AS (
    SELECT *,
      ROW_NUMBER() OVER weekend_history AS position,
      FIRST_VALUE(accommodation_code) OVER weekend_history AS latest_code
    FROM scoped
    WINDOW weekend_history AS (PARTITION BY park_code, arrival ORDER BY scan_id DESC)
  ),
  ranked AS (
    SELECT *,
      MAX(CASE WHEN accommodation_code IS latest_code THEN price_cents END) OVER weekend AS highest_cents,
      MIN(CASE WHEN accommodation_code IS latest_code THEN price_cents END) OVER weekend AS lowest_cents,
      CAST(ROUND(AVG(price_cents) OVER weekend) AS INTEGER) AS typical_cents,
      COUNT(CASE WHEN accommodation_code IS latest_code THEN 1 END) OVER weekend AS observations,
      MIN(observed_at) OVER weekend AS first_observed_at,
      MAX(CASE WHEN observed_at <= ? AND accommodation_code IS latest_code THEN scan_id END) OVER weekend
        AS reference_scan_id
    FROM latest
    WINDOW weekend AS (PARTITION BY park_code, arrival)
  ),
  referenced AS (
    SELECT *,
      MAX(CASE WHEN scan_id = reference_scan_id THEN price_cents END) OVER weekend AS reference_cents,
      MAX(CASE WHEN scan_id = reference_scan_id THEN observed_at END) OVER weekend AS reference_at
    FROM ranked
    WINDOW weekend AS (PARTITION BY park_code, arrival)
  )
  SELECT
    park_code AS parkCode,
    parks.provider,
    arrival,
    departure,
    price_cents AS priceCents,
    typical_cents AS typicalCents,
    highest_cents AS highestCents,
    lowest_cents AS lowestCents,
    accommodation_code AS accommodationCode,
    booking_url AS bookingUrl,
    observations,
    observed_at AS observedAt,
    first_observed_at AS firstObservedAt,
    reference_cents AS referenceCents,
    reference_at AS referenceAt,
    scan_id AS scanId
  FROM referenced
  JOIN parks ON parks.code = referenced.park_code
  WHERE position = 1
`;

const PRICE_HISTORY = `
  SELECT scans.started_at AS observedAt, prices.price_cents AS priceCents
  FROM prices
  JOIN scans ON scans.id = prices.scan_id
  WHERE scans.group_key = ? AND prices.park_code = ? AND prices.arrival = ?
  ORDER BY prices.scan_id
`;

// How many parks each provider offered for each weekend in each scan; fewer over time means it is filling up.
const AVAILABILITY = `
  SELECT parks.provider, prices.arrival, prices.scan_id AS scanId, scans.started_at AS observedAt,
    COUNT(*) AS parkCount
  FROM prices
  JOIN scans ON scans.id = prices.scan_id
  JOIN parks ON parks.code = prices.park_code
  WHERE prices.scan_id IN (SELECT id FROM scans WHERE group_key = ?) AND prices.arrival >= ?
  GROUP BY parks.provider, prices.arrival, prices.scan_id
  ORDER BY prices.scan_id
`;

const WRITE_SETTING = `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`;

const UPSERT_PARK = `
  INSERT INTO parks (code, provider, name, region, city, country, url, prices_url, review_score, image_url, lat, lng, brand_code)
  VALUES (:code, :provider, :name, :region, :city, :country, :url, :pricesUrl, :reviewScore, :imageUrl, :lat, :lng, :brandCode)
  ON CONFLICT (code) DO UPDATE SET
    provider = excluded.provider, name = excluded.name, region = excluded.region, city = excluded.city,
    country = excluded.country,
    url = excluded.url, prices_url = excluded.prices_url, review_score = excluded.review_score,
    image_url = COALESCE(excluded.image_url, parks.image_url),
    lat = COALESCE(excluded.lat, parks.lat), lng = COALESCE(excluded.lng, parks.lng),
    brand_code = COALESCE(excluded.brand_code, parks.brand_code)
`;

const INSERT_PRICE = `
  INSERT OR REPLACE INTO prices (scan_id, park_code, arrival, departure, price_cents, accommodation_code, booking_url)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`;

// The party sizes that rounds collect ahead of time. Parties chosen before there were fixed sizes stay in the
// table (price alerts and history refer to them) but are no longer collected.
const FOLLOWED_PARTIES = `
  SELECT group_key AS key, party, standard,
    (SELECT MAX(started_at) FROM scans WHERE scans.group_key = parties.group_key) AS lastStartedAt,
    (SELECT MAX(started_at) FROM scans
      WHERE scans.group_key = parties.group_key AND scans.finished_at IS NOT NULL AND scans.error IS NULL) AS lastSucceededAt,
    EXISTS (SELECT 1 FROM scans WHERE scans.group_key = parties.group_key AND scans.finished_at IS NOT NULL) AS collected
  FROM parties
  WHERE standard = 1
  ORDER BY group_key
`;

const ALERT_COLUMNS = `
  alerts.id, alerts.topic, alerts.party_key AS partyKey, parties.party, alerts.search, alerts.query, alerts.label,
  alerts.primed, alerts.created_at AS createdAt
`;

const alertOf = (row) => ({
  ...row,
  party: row.party ? JSON.parse(row.party) : null,
  search: JSON.parse(row.search),
  primed: Boolean(row.primed),
});

const deliveryStatements = (alertId, deals, toldAt) =>
  insertRows(
    'INSERT OR REPLACE',
    'alert_deliveries',
    ['alert_id', 'park_code', 'arrival', 'price_cents', 'told_at'],
    deals.map((deal) => [alertId, deal.parkCode, deal.arrival, deal.priceCents, toldAt]),
  );

// Accommodations of a provider whose prices in a round point at one, but whose details are not known yet.
const MISSING_ACCOMMODATIONS = `
  SELECT prices.park_code AS parkCode, prices.accommodation_code AS code, prices.arrival, prices.departure
  FROM prices
  JOIN parks ON parks.code = prices.park_code
  LEFT JOIN accommodations
    ON accommodations.park_code = prices.park_code AND accommodations.code = prices.accommodation_code
  WHERE prices.scan_id = ? AND parks.provider = ? AND prices.accommodation_code IS NOT NULL
    AND accommodations.code IS NULL
  ORDER BY prices.park_code, prices.arrival
`;

const ACCOMMODATION_COLUMNS = ['park_code', 'code', 'name', 'url', 'facts', 'photos', 'fetched_at'];

const accommodationRow = (parkCode, accommodation, fetchedAt) => [
  parkCode,
  accommodation.code,
  accommodation.name ?? null,
  accommodation.url ?? null,
  JSON.stringify(accommodation.facts ?? []),
  JSON.stringify(accommodation.photos ?? []),
  fetchedAt,
];

// Multi-row inserts keep a few thousand rows to a handful of statements, which matters over the network.
const ROWS_PER_INSERT = 100;

export function insertRows(verb, table, columns, rows) {
  const statements = [];
  const placeholders = `(${columns.map(() => '?').join(', ')})`;
  for (let start = 0; start < rows.length; start += ROWS_PER_INSERT) {
    const chunk = rows.slice(start, start + ROWS_PER_INSERT);
    statements.push({
      sql: `${verb} INTO ${table} (${columns.join(', ')}) VALUES ${chunk.map(() => placeholders).join(', ')}`,
      args: chunk.flat(),
    });
  }
  return statements;
}

async function columnNames(client, table) {
  const { rows } = await client.execute(`PRAGMA table_info(${table})`);
  return rows.map((column) => column.name);
}

/**
 * The first schema only knew park facilities, and its park_facilities referenced them, which blocks replacing the
 * definitions each round. The definitions are fetched again anyway; the costly park mapping is kept.
 */
async function upgradeFacilities(client) {
  const columns = await columnNames(client, 'facilities');
  if (!columns.length || columns.includes('kind')) return;

  await client.executeMultiple(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE facilities;
    CREATE TABLE park_facilities_unlinked (
      park_code TEXT NOT NULL,
      facility_id TEXT NOT NULL,
      PRIMARY KEY (park_code, facility_id)
    );
    INSERT INTO park_facilities_unlinked SELECT park_code, facility_id FROM park_facilities;
    DROP TABLE park_facilities;
    ALTER TABLE park_facilities_unlinked RENAME TO park_facilities;
    PRAGMA foreign_keys = ON;
  `);
}

// Coordinates, providers, brand codes and direct booking links came later; the next price round fills them in,
// and every older park is Landal.
async function addLaterColumns(client) {
  const columns = await columnNames(client, 'parks');
  const priceColumns = await columnNames(client, 'prices');
  const scanChangeColumns = await columnNames(client, 'scan_changes');
  const changes = [];
  if (!columns.includes('lat')) changes.push('ALTER TABLE parks ADD COLUMN lat REAL', 'ALTER TABLE parks ADD COLUMN lng REAL');
  if (!columns.includes('provider')) changes.push(`ALTER TABLE parks ADD COLUMN provider TEXT NOT NULL DEFAULT 'landal'`);
  if (!columns.includes('brand_code')) changes.push('ALTER TABLE parks ADD COLUMN brand_code TEXT');
  if (!priceColumns.includes('booking_url')) changes.push('ALTER TABLE prices ADD COLUMN booking_url TEXT');
  if (!scanChangeColumns.includes('stats')) changes.push('ALTER TABLE scan_changes ADD COLUMN stats TEXT');
  if (changes.length) await client.batch(changes, 'write');
}

/** The party sizes rounds collect; a size added later is collected by the next round. */
async function seedParties(client) {
  const now = new Date().toISOString();
  const rows = STANDARD_PARTIES.map((party) => [groupKey(party), JSON.stringify(party), 1, now]);
  await client.batch(insertRows('INSERT OR IGNORE', 'parties', ['group_key', 'party', 'standard', 'used_at'], rows), 'write');
}

/** Creates missing tables and columns; only the Mac does this, the cloud app expects them to be there. */
export async function migrate(client) {
  if (client.protocol === 'file') {
    // The app and the background job can write at the same time; the second one waits instead of failing.
    await client.execute('PRAGMA journal_mode = WAL');
    await client.execute('PRAGMA busy_timeout = 10000');
  }
  await upgradeFacilities(client);
  await client.executeMultiple(SCHEMA);
  await addLaterColumns(client);
  await seedParties(client);
}

const parkRow = (park) => ({
  code: park.code,
  provider: park.provider ?? 'landal',
  name: park.name,
  region: park.region ?? null,
  city: park.city ?? null,
  country: park.country ?? null,
  url: park.url ?? null,
  pricesUrl: park.pricesUrl ?? null,
  reviewScore: park.reviewScore ?? null,
  imageUrl: park.imageUrl ?? null,
  lat: park.lat ?? null,
  lng: park.lng ?? null,
  brandCode: park.brandCode ?? null,
});

const plain = ({ rows }) => rows.map((row) => ({ ...row }));
const parseJson = (value, fallback) => (value ? JSON.parse(value) : fallback);

/** @param client a libSQL client: a local database file on the Mac, or Turso from the Mac and the cloud. */
export async function openDatabase(client, { runMigrations = true } = {}) {
  if (runMigrations) await migrate(client);

  const all = async (sql, ...args) => plain(await client.execute({ sql, args }));
  const first = async (sql, ...args) => (await all(sql, ...args))[0] ?? null;
  const readSetting = async (key) => (await first(`SELECT value FROM settings WHERE key = ?`, key))?.value ?? null;
  const settingStatement = (key, value) => ({ sql: WRITE_SETTING, args: [key, value] });
  const writeSetting = (key, value) => client.execute(settingStatement(key, value));

  return {
    async getSettings() {
      return clampSettings(parseJson(await readSetting('settings'), DEFAULT_SETTINGS));
    },

    async saveSettings(input) {
      const settings = clampSettings({ ...(await this.getSettings()), ...input });
      await writeSetting('settings', JSON.stringify(settings));
      return settings;
    },

    facilitiesUpdatedAt() {
      return readSetting('facilitiesUpdatedAt');
    },

    /** @param filterGroups `{ park, accommodation }` groups as Landal's filters list them. */
    async replaceFacilityDefinitions(filterGroups) {
      const rows = [];
      for (const [kind, groups] of Object.entries(filterGroups)) {
        for (const group of groups) {
          for (const option of group.options) {
            rows.push([option.id, option.name, group.name, kind, group.anyOf ? 1 : 0, rows.length]);
          }
        }
      }
      await client.batch(
        [
          'DELETE FROM facilities',
          ...insertRows('INSERT', 'facilities', ['id', 'name', 'group_name', 'kind', 'any_of', 'position'], rows),
        ],
        'write',
      );
    },

    /** @param parksByFacility Map of park facility id to the set of park codes that have it. */
    async replaceParkFacilities(parksByFacility) {
      const rows = [...parksByFacility].flatMap(([facilityId, codes]) => [...codes].map((code) => [code, facilityId]));
      await client.batch(
        [
          'DELETE FROM park_facilities',
          ...insertRows('INSERT OR IGNORE', 'park_facilities', ['park_code', 'facility_id'], rows),
          settingStatement('facilitiesUpdatedAt', new Date().toISOString()),
        ],
        'write',
      );
    },

    /** @param rating a matched Google place, or null when Google has no place at the park */
    async saveGoogleRating(parkCode, rating, fetchedAt = new Date().toISOString()) {
      await client.execute({
        sql: `
          INSERT INTO google_ratings (park_code, place_id, place_name, rating, rating_count, maps_url, fetched_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (park_code) DO UPDATE SET
            place_id = excluded.place_id, place_name = excluded.place_name, rating = excluded.rating,
            rating_count = excluded.rating_count, maps_url = excluded.maps_url, fetched_at = excluded.fetched_at
        `,
        args: [
          parkCode,
          rating?.placeId ?? null,
          rating?.placeName ?? null,
          rating?.rating ?? null,
          rating?.ratingCount ?? null,
          rating?.mapsUrl ?? null,
          fetchedAt,
        ],
      });
    },

    async googleRatings() {
      const rows = await all(`
        SELECT park_code AS parkCode, place_name AS placeName, rating, rating_count AS ratingCount, maps_url AS mapsUrl
        FROM google_ratings WHERE rating IS NOT NULL
      `);
      return new Map(rows.map(({ parkCode, ...rating }) => [parkCode, rating]));
    },

    /** Parks with coordinates whose rating is missing or was fetched before `fetchedBefore`, oldest first. */
    parksNeedingRatings(fetchedBefore) {
      return all(
        `
        SELECT parks.code, parks.provider, parks.name, parks.city, parks.lat, parks.lng
        FROM parks LEFT JOIN google_ratings ON google_ratings.park_code = parks.code
        WHERE parks.lat IS NOT NULL AND (google_ratings.fetched_at IS NULL OR google_ratings.fetched_at < ?)
        ORDER BY google_ratings.fetched_at IS NOT NULL, google_ratings.fetched_at
      `,
        fetchedBefore,
      );
    },

    /** @param month "YYYY-MM" */
    /** @param counter which monthly Google budget: the rating lookups, or the review lookups */
    async countGoogleRequest(month, counter = 'googleRequests') {
      await writeSetting(`${counter}:${month}`, String((await this.googleRequests(month, counter)) + 1));
    },

    async googleRequests(month, counter = 'googleRequests') {
      return Number((await readSetting(`${counter}:${month}`)) ?? 0);
    },

    async googlePlaceId(code) {
      return (await first(`SELECT place_id AS placeId FROM google_ratings WHERE park_code = ?`, code))?.placeId ?? null;
    },

    async googleError() {
      return (await readSetting('googleError')) || null;
    },

    async setGoogleError(message) {
      await writeSetting('googleError', message ?? '');
    },

    /** @returns provider id → error message of the last round, for providers that failed */
    /** Per provider that failed in the last round: { error, failed, total } (counts unknown for older rounds). */
    async providerErrors() {
      const errors = parseJson(await readSetting('providerErrors'), {});
      return Object.fromEntries(
        Object.entries(errors).map(([id, value]) => [id, typeof value === 'string' ? { error: value, failed: null, total: null } : value]),
      );
    },

    async setProviderErrors(errors) {
      await writeSetting('providerErrors', JSON.stringify(errors));
    },

    /** @param kind "park" or "accommodation" */
    async facilityGroups(kind) {
      const rows = await all(
        `SELECT id, name, group_name AS groupName, any_of AS anyOf FROM facilities WHERE kind = ? ORDER BY position`,
        kind,
      );
      const groups = new Map();
      for (const { id, name, groupName, anyOf } of rows) {
        if (!groups.has(groupName)) groups.set(groupName, { name: groupName, anyOf: Boolean(anyOf), options: [] });
        groups.get(groupName).options.push({ id, name });
      }
      return [...groups.values()];
    },

    facilityNamesUpdatedAt() {
      return readSetting('facilityNamesUpdatedAt');
    },

    /**
     * Facilities as other providers' park pages name them, e.g. "Verwarmd buitenzwembad".
     * @param namesByPark Map of park code to its names; parks not in it keep theirs
     */
    async replaceFacilityNames(namesByPark) {
      const rows = [...namesByPark].flatMap(([parkCode, names]) => [...new Set(names)].map((name) => [parkCode, name]));
      await client.batch(
        [
          ...[...namesByPark.keys()].map((parkCode) => ({
            sql: `DELETE FROM park_facility_names WHERE park_code = ?`,
            args: [parkCode],
          })),
          ...insertRows('INSERT OR IGNORE', 'park_facility_names', ['park_code', 'name'], rows),
          settingStatement('facilityNamesUpdatedAt', new Date().toISOString()),
        ],
        'write',
      );
    },

    async facilityNamesByPark() {
      const byPark = new Map();
      for (const { parkCode, name } of await all(`SELECT park_code AS parkCode, name FROM park_facility_names`)) {
        if (!byPark.has(parkCode)) byPark.set(parkCode, []);
        byPark.get(parkCode).push(name);
      }
      return byPark;
    },

    async facilitiesByPark() {
      const byPark = new Map();
      for (const { parkCode, facilityId } of await all(
        `SELECT park_code AS parkCode, facility_id AS facilityId FROM park_facilities`,
      )) {
        if (!byPark.has(parkCode)) byPark.set(parkCode, []);
        byPark.get(parkCode).push(facilityId);
      }
      return byPark;
    },

    async startScan(key, startedAt = new Date().toISOString()) {
      const result = await client.execute({
        sql: `INSERT INTO scans (group_key, started_at) VALUES (?, ?)`,
        args: [key, startedAt],
      });
      return Number(result.lastInsertRowid);
    },

    async finishScan(scanId, error = null) {
      await client.execute({
        sql: `UPDATE scans SET finished_at = ?, error = ? WHERE id = ?`,
        args: [new Date().toISOString(), error, scanId],
      });
    },

    /** One round's prices, to compare with the round before it. */
    scanRows(scanId) {
      return all(
        `SELECT prices.park_code AS parkCode, parks.name AS parkName, parks.provider, prices.arrival,
          prices.price_cents AS priceCents, prices.accommodation_code AS accommodationCode, prices.booking_url AS bookingUrl
        FROM prices JOIN parks ON parks.code = prices.park_code WHERE prices.scan_id = ?`,
        scanId,
      );
    },

    /**
     * Successful rounds since `since` without a summary of their changes and price levels yet, newest first, each
     * with the successful round of the same party before it (null for a party's first round). Older rounds are
     * never summarised: the admin page does not reach back further.
     */
    scansToSummarize({ since, limit }) {
      return all(
        `SELECT scans.id AS scanId,
          (SELECT MAX(earlier.id) FROM scans AS earlier
            WHERE earlier.group_key = scans.group_key AND earlier.id < scans.id
              AND earlier.finished_at IS NOT NULL AND earlier.error IS NULL) AS previousScanId
        FROM scans LEFT JOIN scan_changes ON scan_changes.scan_id = scans.id
        WHERE scans.started_at >= ? AND scans.finished_at IS NOT NULL AND scans.error IS NULL
          AND (scan_changes.scan_id IS NULL OR scan_changes.stats IS NULL)
        ORDER BY scans.id DESC LIMIT ?`,
        since,
        limit,
      );
    },

    async saveScanChanges(scanId, previousScanId, summary, stats = null) {
      await client.execute({
        sql: `INSERT OR REPLACE INTO scan_changes (scan_id, previous_scan_id, summary, stats) VALUES (?, ?, ?, ?)`,
        args: [scanId, previousScanId, JSON.stringify(summary), stats && JSON.stringify(stats)],
      });
    },

    /** One party size's summarised rounds since `since`, oldest first: { id, startedAt, changes, stats }. */
    async roundStats(key, since) {
      const rows = await all(
        `SELECT scans.id, scans.started_at AS startedAt, scan_changes.summary, scan_changes.stats
        FROM scans JOIN scan_changes ON scan_changes.scan_id = scans.id
        WHERE scans.group_key = ? AND scans.started_at >= ? AND scan_changes.stats IS NOT NULL
        ORDER BY scans.id`,
        key,
        since,
      );
      return rows.map(({ summary, stats, ...round }) => ({ ...round, changes: JSON.parse(summary), stats: JSON.parse(stats) }));
    },

    /** How many rounds ran and prices were kept, over all party sizes. */
    async adminTotals() {
      return first(
        `SELECT COUNT(*) AS rounds, SUM(json_extract(scan_changes.summary, '$.prices')) AS prices,
          MIN(scans.started_at) AS since
        FROM scans LEFT JOIN scan_changes ON scan_changes.scan_id = scans.id`,
      );
    },

    /** Where the price watch stands: its last run, a run another process started, and the prices to compare with. */
    async watchState() {
      const [last, settingRows] = await client.batch(
        [
          `SELECT MAX(at) AS lastAt FROM watch_runs`,
          `SELECT key, value FROM settings WHERE key IN ('watchClaimedAt', 'watchSnapshot')`,
        ],
        'read',
      );
      const values = Object.fromEntries(settingRows.rows.map((row) => [row.key, row.value]));
      return {
        lastAt: last.rows[0].lastAt ?? null,
        claimedAt: values.watchClaimedAt || null,
        snapshot: parseJson(values.watchSnapshot, null),
      };
    },

    async claimWatch(at) {
      await writeSetting('watchClaimedAt', at);
    },

    /** A watch run with its price changes, and its prices for the next run to compare with. */
    async saveWatchRun({ at, summary, changes, snapshot }) {
      await client.batch(
        [
          { sql: `INSERT INTO watch_runs (at, summary) VALUES (?, ?)`, args: [at, JSON.stringify(summary)] },
          ...changes.map((change) => ({
            sql: `INSERT INTO watch_changes (run_id, provider, park, accommodation, arrival, old_cents, new_cents)
              VALUES ((SELECT id FROM watch_runs WHERE at = ?), ?, ?, ?, ?, ?, ?)`,
            args: [at, change.provider, change.park, change.accommodation, change.arrival, change.oldCents, change.newCents],
          })),
          ...(snapshot ? [settingStatement('watchSnapshot', JSON.stringify(snapshot))] : []),
          settingStatement('watchClaimedAt', ''),
        ],
        'write',
      );
    },

    async watchRuns(since) {
      const rows = await all(`SELECT at, summary FROM watch_runs WHERE at >= ? ORDER BY at`, since);
      return rows.map((row) => ({ at: row.at, summary: JSON.parse(row.summary) }));
    },

    watchChanges(since) {
      return all(
        `SELECT watch_runs.at, provider, park, accommodation, arrival, old_cents AS oldCents, new_cents AS newCents
        FROM watch_changes JOIN watch_runs ON watch_runs.id = watch_changes.run_id
        WHERE watch_runs.at >= ? ORDER BY watch_runs.at`,
        since,
      );
    },

    /** A visitor going to a provider through a tracked link. */
    async saveClick({ provider, parkCode = null, arrival = null, source = null, partyKey = null }, at = new Date().toISOString()) {
      await client.execute({
        sql: `INSERT INTO clicks (at, provider, park_code, arrival, source, party_key) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [at, provider, parkCode, arrival, source, partyKey],
      });
    },

    /** Clicks since `since` per day (UTC), provider, place on the page and park, and the total ever. */
    async clickStats(since) {
      const [days, providers, sources, parks, total] = await client.batch(
        [
          { sql: `SELECT substr(at, 1, 10) AS day, COUNT(*) AS clicks FROM clicks WHERE at >= ? GROUP BY day ORDER BY day`, args: [since] },
          { sql: `SELECT provider, COUNT(*) AS clicks FROM clicks WHERE at >= ? GROUP BY provider ORDER BY clicks DESC`, args: [since] },
          { sql: `SELECT source, COUNT(*) AS clicks FROM clicks WHERE at >= ? GROUP BY source ORDER BY clicks DESC`, args: [since] },
          {
            sql: `SELECT clicks.park_code AS parkCode, parks.name, parks.provider, COUNT(*) AS clicks
              FROM clicks LEFT JOIN parks ON parks.code = clicks.park_code
              WHERE clicks.at >= ? AND clicks.park_code IS NOT NULL
              GROUP BY clicks.park_code ORDER BY clicks DESC LIMIT 20`,
            args: [since],
          },
          `SELECT COUNT(*) AS clicks, MIN(at) AS since FROM clicks`,
        ],
        'read',
      );
      return { days: plain(days), providers: plain(providers), sources: plain(sources), parks: plain(parks), total: plain(total)[0] };
    },

    async saveAdminStats(key, { computedAt, data }) {
      await client.execute({
        sql: `INSERT OR REPLACE INTO admin_stats (group_key, computed_at, data) VALUES (?, ?, ?)`,
        args: [key, computedAt, data],
      });
    },

    /** @returns the gzipped admin charts of a party size as an ArrayBuffer, or null before they were computed */
    async adminStats(key) {
      return (await first(`SELECT data FROM admin_stats WHERE group_key = ?`, key))?.data ?? null;
    },

    async adminStatsComputedAt(key) {
      return (await first(`SELECT computed_at AS computedAt FROM admin_stats WHERE group_key = ?`, key))?.computedAt ?? null;
    },

    /**
     * One park's prices per round and weekend since `since`, for a party size. Turso puts the JSON together, so the
     * cloud app passes it on without unpacking: it has little CPU time per request.
     * @returns { park, accommodations, rows } as JSON texts; rows are [startedAt, arrival, priceCents, accommodationCode]
     */
    async parkHistory(code, key, since) {
      const [park, accommodations, rows] = await client.batch(
        [
          {
            sql: `SELECT json_object('code', parks.code, 'name', parks.name, 'provider', parks.provider, 'city', parks.city,
                'region', parks.region, 'country', parks.country, 'url', parks.url, 'pricesUrl', parks.prices_url,
                'imageUrl', parks.image_url, 'rating', google_ratings.rating, 'ratingCount', google_ratings.rating_count,
                'mapsUrl', google_ratings.maps_url) AS json
              FROM parks LEFT JOIN google_ratings ON google_ratings.park_code = parks.code WHERE parks.code = ?`,
            args: [code],
          },
          {
            sql: `SELECT json_group_object(code, json_object('name', name, 'url', url, 'photo', json_extract(photos, '$[0]')))
                AS json FROM accommodations WHERE park_code = ?`,
            args: [code],
          },
          {
            sql: `SELECT json_group_array(json_array(startedAt, arrival, priceCents, accommodationCode)) AS json FROM (
                SELECT scans.started_at AS startedAt, prices.arrival, prices.price_cents AS priceCents,
                  prices.accommodation_code AS accommodationCode
                FROM prices JOIN scans ON scans.id = prices.scan_id
                WHERE prices.park_code = ? AND scans.group_key = ? AND scans.started_at >= ?
                  AND scans.finished_at IS NOT NULL AND scans.error IS NULL
                ORDER BY scans.id, prices.arrival)`,
            args: [code, key, since],
          },
        ],
        'read',
      );
      return { park: park.rows[0]?.json ?? null, accommodations: accommodations.rows[0].json, rows: rows.rows[0].json };
    },

    /**
     * Per park, how one weekend's price went for a party size since `since`: the first and the latest price seen,
     * the lowest and highest, and how often it was seen. Put together as JSON by Turso, like parkHistory.
     * @returns { latestAt, parks } as JSON texts; parks are [parkCode, firstCents, firstAt, lastCents, lastAt,
     *   lowCents, highCents, observations]
     */
    async weekendHistory(arrival, key, since) {
      const [latest, parks] = await client.batch(
        [
          {
            sql: `SELECT json_quote(MAX(started_at)) AS json FROM scans
              WHERE group_key = ? AND finished_at IS NOT NULL AND error IS NULL`,
            args: [key],
          },
          {
            sql: `WITH seen AS (
                SELECT prices.park_code AS park, scans.id AS scan, scans.started_at AS at, prices.price_cents AS price
                FROM prices JOIN scans ON scans.id = prices.scan_id
                WHERE prices.arrival = ? AND scans.group_key = ? AND scans.started_at >= ?
                  AND scans.finished_at IS NOT NULL AND scans.error IS NULL
              ), ranked AS (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY park ORDER BY scan) AS fromFirst,
                  ROW_NUMBER() OVER (PARTITION BY park ORDER BY scan DESC) AS fromLast
                FROM seen
              )
              SELECT json_group_array(json_array(park, firstCents, firstAt, lastCents, lastAt, low, high, n)) AS json FROM (
                SELECT park,
                  MAX(CASE WHEN fromFirst = 1 THEN price END) AS firstCents, MAX(CASE WHEN fromFirst = 1 THEN at END) AS firstAt,
                  MAX(CASE WHEN fromLast = 1 THEN price END) AS lastCents, MAX(CASE WHEN fromLast = 1 THEN at END) AS lastAt,
                  MIN(price) AS low, MAX(price) AS high, COUNT(*) AS n
                FROM ranked GROUP BY park)`,
            args: [arrival, key, since],
          },
        ],
        'read',
      );
      return { latestAt: latest.rows[0].json, parks: parks.rows[0].json };
    },

    /** The latest rounds for the admin page, with what each changed when that is known. */
    async rounds(limit) {
      const rows = await all(
        `SELECT scans.id, scans.group_key AS groupKey, scans.started_at AS startedAt, scans.finished_at AS finishedAt,
          scans.error, scan_changes.previous_scan_id AS previousScanId, scan_changes.summary
        FROM scans LEFT JOIN scan_changes ON scan_changes.scan_id = scans.id
        ORDER BY scans.id DESC LIMIT ?`,
        limit,
      );
      return rows.map(({ summary, ...round }) => ({ ...round, changes: parseJson(summary, null) }));
    },

    lastScan(key) {
      return first(
        `
        SELECT started_at AS startedAt, finished_at AS finishedAt, error
        FROM scans WHERE group_key = ? AND finished_at IS NOT NULL
        ORDER BY id DESC LIMIT 1
      `,
        key,
      );
    },

    /** @returns group key → id of its last finished scan, whose prices the screen shows */
    async lastFinishedScans() {
      const rows = await all(
        `SELECT group_key AS key, MAX(id) AS scanId FROM scans WHERE finished_at IS NOT NULL GROUP BY group_key`,
      );
      return new Map(rows.map(({ key, scanId }) => [key, Number(scanId)]));
    },

    /** Includes scans that are still running, possibly in another process. */
    async lastStartedAt(key) {
      return (await first(`SELECT started_at AS startedAt FROM scans WHERE group_key = ? ORDER BY id DESC LIMIT 1`, key))
        ?.startedAt ?? null;
    },

    /**
     * @param alert { id, topic, partyKey, search, query, label, primed }; `seen` are the deals it matched when it was
     *   set, which are no news. Without them (`primed` false) the first check takes in what matches silently.
     */
    async saveAlert(alert, seen = [], createdAt = new Date().toISOString()) {
      await client.batch(
        [
          {
            sql: `INSERT INTO alerts (id, topic, party_key, search, query, label, primed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [alert.id, alert.topic, alert.partyKey, JSON.stringify(alert.search), alert.query, alert.label, alert.primed ? 1 : 0, createdAt],
          },
          ...deliveryStatements(alert.id, seen, createdAt),
        ],
        'write',
      );
    },

    /** @param topic only that phone's alerts; omitted, every alert */
    async alerts(topic = null) {
      const rows = await all(
        `SELECT ${ALERT_COLUMNS} FROM alerts LEFT JOIN parties ON parties.group_key = alerts.party_key
         WHERE ? IS NULL OR alerts.topic = ? ORDER BY alerts.created_at`,
        topic,
        topic,
      );
      return rows.map(alertOf);
    },

    /** Only with the topic it belongs to, so nobody removes another phone's alerts. */
    async deleteAlert(id, topic) {
      const [removed] = await client.batch(
        [
          { sql: `DELETE FROM alerts WHERE id = ? AND topic = ?`, args: [id, topic] },
          { sql: `DELETE FROM alert_deliveries WHERE alert_id NOT IN (SELECT id FROM alerts)`, args: [] },
        ],
        'write',
      );
      return removed.rowsAffected > 0;
    },

    /** @returns park|arrival → the price in cents the last message (or the setting up) had */
    async alertDeliveries(alertId) {
      const rows = await all(
        `SELECT park_code AS parkCode, arrival, price_cents AS priceCents FROM alert_deliveries WHERE alert_id = ?`,
        alertId,
      );
      return new Map(rows.map((row) => [`${row.parkCode}|${row.arrival}`, row.priceCents]));
    },

    async recordDeliveries(alertId, deals, toldAt = new Date().toISOString()) {
      await client.batch(
        [...deliveryStatements(alertId, deals, toldAt), { sql: `UPDATE alerts SET primed = 1 WHERE id = ?`, args: [alertId] }],
        'write',
      );
    },

    /** How many scans each party size started since `since`: { groupKey: count }. */
    async scanStartsSince(since) {
      const rows = await all(`SELECT group_key AS key, COUNT(*) AS count FROM scans WHERE started_at >= ? GROUP BY group_key`, since);
      return Object.fromEntries(rows.map((row) => [row.key, Number(row.count)]));
    },

    /** @returns [{ key, party, standard, lastStartedAt, lastSucceededAt, collected }] for every party size rounds collect */
    async followedParties() {
      return (await all(FOLLOWED_PARTIES)).map((row) => ({
        key: row.key,
        party: JSON.parse(row.party),
        standard: Boolean(row.standard),
        lastStartedAt: row.lastStartedAt ?? null,
        lastSucceededAt: row.lastSucceededAt ?? null,
        collected: Boolean(row.collected),
      }));
    },

    /** Offers may carry their accommodation's details (Molecaten lists them with the prices); those are kept too. */
    async savePrices(scanId, weekend, offers) {
      if (!offers.length) return;
      const fetchedAt = new Date().toISOString();
      const accommodations = offers
        .filter((offer) => offer.accommodation?.code)
        .map((offer) => accommodationRow(offer.park.code, offer.accommodation, fetchedAt));
      await client.batch(
        [
          ...offers.flatMap((offer) => [
            { sql: UPSERT_PARK, args: parkRow(offer.park) },
            {
              sql: INSERT_PRICE,
              args: [
                scanId,
                offer.park.code,
                weekend.arrival,
                weekend.departure,
                offer.priceCents,
                offer.accommodationCode,
                offer.bookingUrl ?? null,
              ],
            },
          ]),
          ...insertRows('INSERT OR REPLACE', 'accommodations', ACCOMMODATION_COLUMNS, accommodations),
        ],
        'write',
      );
    },

    async saveAccommodations(parkCode, accommodations, fetchedAt = new Date().toISOString()) {
      if (!accommodations.length) return;
      const rows = accommodations.map((accommodation) => accommodationRow(parkCode, accommodation, fetchedAt));
      await client.batch(insertRows('INSERT OR REPLACE', 'accommodations', ACCOMMODATION_COLUMNS, rows), 'write');
    },

    /** @returns [{ parkCode, code, arrival, departure }]: each weekend of the scan that points at an unknown one */
    missingAccommodations(scanId, provider) {
      return all(MISSING_ACCOMMODATIONS, scanId, provider);
    },

    /** @returns park code → accommodation code → { name, url, facts, photos } */
    /** The pages of these accommodations, where known: [{ parkCode, code, url }]. @param pairs [[parkCode, code]] */
    accommodationPages(pairs) {
      if (!pairs.length) return [];
      return all(
        `SELECT park_code AS parkCode, code, url FROM accommodations
        WHERE url IS NOT NULL AND (park_code, code) IN (VALUES ${pairs.map(() => '(?, ?)').join(', ')})`,
        ...pairs.flat(),
      );
    },

    async accommodations() {
      const byPark = new Map();
      for (const { parkCode, code, name, url, facts, photos } of await all(
        `SELECT park_code AS parkCode, code, name, url, facts, photos FROM accommodations`,
      )) {
        if (!byPark.has(parkCode)) byPark.set(parkCode, {});
        byPark.get(parkCode)[code] = { name, url, facts: JSON.parse(facts), photos: JSON.parse(photos) };
      }
      return byPark;
    },

    /** One park, as a live quote needs it: its provider and pages. */
    park(code) {
      return first(`SELECT code, provider, name, country, url, prices_url AS pricesUrl FROM parks WHERE code = ?`, code);
    },

    async parks() {
      const rows = await all(`
        SELECT code, provider, name, region, city, country, url, prices_url AS pricesUrl,
          review_score AS reviewScore, image_url AS imageUrl, lat, lng, brand_code AS brandCode
        FROM parks
      `);
      return new Map(rows.map((park) => [park.code, park]));
    },

    /** @param referenceBefore ISO timestamp: the trend reference is the latest observation at or before it */
    priceSummaries(key, fromArrival, referenceBefore = new Date().toISOString()) {
      return all(PRICE_SUMMARIES, key, fromArrival, referenceBefore);
    },

    priceHistory(key, parkCode, arrival) {
      return all(PRICE_HISTORY, key, parkCode, arrival);
    },

    availability(key, fromArrival) {
      return all(AVAILABILITY, key, fromArrival);
    },

    /**
     * The screen's data, computed once per round so that showing it costs one read (the cloud app's database is
     * billed per row read). `meta` is JSON; `parks` is gzipped JSON, served as is.
     */
    async saveOverview(key, { computedAt, meta, parks }) {
      await client.execute({
        sql: `
          INSERT INTO overviews (group_key, computed_at, meta, parks) VALUES (?, ?, ?, ?)
          ON CONFLICT (group_key) DO UPDATE SET
            computed_at = excluded.computed_at, meta = excluded.meta, parks = excluded.parks
        `,
        args: [key, computedAt, meta, parks],
      });
    },

    async overviewComputedAt(key) {
      return (await first(`SELECT computed_at AS computedAt FROM overviews WHERE group_key = ?`, key))?.computedAt ?? null;
    },

    /** @returns the gzipped park list as an ArrayBuffer, or null before the first round with these settings */
    async overviewParks(key) {
      return (await first(`SELECT parks FROM overviews WHERE group_key = ?`, key))?.parks ?? null;
    },

    /** The public pages (server/pages.mjs), all at once: a weekend gone by loses its page. One row per statement, as a page is large. */
    async replacePages(pages, computedAt) {
      const insert = `INSERT INTO pages (path, title, description, image, body, computed_at) VALUES (?, ?, ?, ?, ?, ?)`;
      await client.batch(
        [
          'DELETE FROM pages',
          ...pages.map((page) => ({ sql: insert, args: [page.path, page.title, page.description, page.image, page.body, computedAt] })),
        ],
        'write',
      );
    },

    page(path) {
      return first(`SELECT title, description, image, body FROM pages WHERE path = ?`, path);
    },

    pagePaths() {
      return all(`SELECT path, computed_at AS computedAt FROM pages ORDER BY path`);
    },

    /** Everything the status call needs, in one round trip. */
    async statusInputs() {
      const [settingRows, overviewRows] = await client.batch(
        [
          `SELECT key, value FROM settings WHERE key IN ('settings', 'collector', 'scanRequestedAt')`,
          `SELECT group_key AS groupKey, computed_at AS computedAt, meta FROM overviews ORDER BY computed_at DESC`,
        ],
        'read',
      );
      const values = Object.fromEntries(settingRows.rows.map((row) => [row.key, row.value]));
      return {
        settings: clampSettings(parseJson(values.settings, DEFAULT_SETTINGS)),
        collector: parseJson(values.collector, null),
        scanRequestedAt: values.scanRequestedAt || null,
        overviews: plain(overviewRows),
      };
    },

    /** Progress of the price round, for other processes: the cloud app, or the app while the background job runs. */
    async saveCollectorStatus(status) {
      await writeSetting('collector', JSON.stringify(status));
    },

    async collectorStatus() {
      return parseJson(await readSetting('collector'), null);
    },

    /** The cloud app cannot fetch prices itself; it leaves this request for the Mac. */
    /**
     * Leaves a round for the Mac: of the given party sizes, or of all of them when none are given. A request still
     * waiting is kept; one for all sizes covers any other.
     */
    async requestScan({ parties = [], requestedAt = new Date().toISOString() } = {}) {
      const pending = await this.scanRequest();
      const everything = !parties.length || (pending.requestedAt !== null && !pending.parties.length);
      await writeSetting('scanRequestedParties', JSON.stringify(everything ? [] : [...new Set([...pending.parties, ...parties])]));
      await writeSetting('scanRequestedAt', requestedAt);
    },

    async scanRequestedAt() {
      return (await readSetting('scanRequestedAt')) || null;
    },

    /** The waiting request, if any: { requestedAt, parties }, where no parties means all sizes. */
    async scanRequest() {
      return {
        requestedAt: await this.scanRequestedAt(),
        parties: parseJson(await readSetting('scanRequestedParties'), []),
      };
    },

    async clearScanRequest() {
      await writeSetting('scanRequestedAt', '');
      await writeSetting('scanRequestedParties', '');
    },

    close() {
      client.close();
    },
  };
}
