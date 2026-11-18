// The admin's Bezoekers page: the counts from server/events.mjs, read back from Analytics Engine's SQL API.
// A visitor is a code that holds for one day, so "visitors" over a period are visitor-days added up.
// shortcut: counts read rows as written; on days busy enough for Analytics Engine to sample, weigh visitors by
// _sample_interval as the event counts already are.
import { EVENTS_DATASET } from './events.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

const numbers = (rows, fields) => rows.map((row) => ({ ...row, ...Object.fromEntries(fields.map((field) => [field, Number(row[field]) || 0])) }));

/**
 * @param query runs one SQL statement on Analytics Engine and gives its rows
 * @param days how many days back, today included (UTC)
 */
export async function trafficReport(query, { days, now = Date.now() }) {
  const since = new Date(now - (days - 1) * DAY_MS).toISOString().slice(0, 10);
  const from = `FROM ${EVENTS_DATASET} WHERE timestamp >= toDateTime('${since} 00:00:00')`;
  const [daily, sources, pages, devices, countries, actions, choices] = await Promise.all([
    // Per visitor and day first: did they open a park, did they click through.
    query(`SELECT day, count() AS visitors, sum(v) AS views, sum(c) AS clicks, countIf(p > 0) AS parkVisitors, countIf(c > 0) AS clickers
      FROM (SELECT formatDateTime(timestamp, '%Y-%m-%d') AS day, index1,
          sumIf(_sample_interval, blob1 = 'view') AS v,
          sumIf(_sample_interval, blob1 = 'click') AS c,
          countIf(blob1 = 'park' OR (blob1 = 'view' AND blob2 = 'park')) AS p
        ${from} GROUP BY day, index1)
      GROUP BY day ORDER BY day`),
    query(`SELECT blob5 AS source, count(DISTINCT index1) AS visitors ${from} AND blob1 = 'view' AND blob5 != 'intern'
      GROUP BY source ORDER BY visitors DESC LIMIT 12`),
    query(`SELECT blob4 AS path, sum(_sample_interval) AS views, count(DISTINCT index1) AS visitors ${from} AND blob1 = 'view'
      GROUP BY path ORDER BY views DESC LIMIT 20`),
    query(`SELECT blob6 AS device, count(DISTINCT index1) AS visitors ${from} AND blob1 = 'view' GROUP BY device ORDER BY visitors DESC`),
    query(`SELECT blob7 AS country, count(DISTINCT index1) AS visitors ${from} AND blob1 = 'view'
      GROUP BY country ORDER BY visitors DESC LIMIT 10`),
    query(`SELECT blob1 AS name, blob2 AS key, sum(_sample_interval) AS uses, count(DISTINCT index1) AS visitors ${from} AND blob1 != 'view'
      GROUP BY name, key ORDER BY visitors DESC LIMIT 60`),
    // Which parks, brands, weekends and so on: what visitors chose.
    query(`SELECT blob1 AS name, blob2 AS key, blob3 AS value, count(DISTINCT index1) AS visitors ${from} AND blob3 != ''
      GROUP BY name, key, value ORDER BY visitors DESC LIMIT 150`),
  ]);
  return {
    since,
    days: numbers(daily, ['visitors', 'views', 'clicks', 'parkVisitors', 'clickers']),
    sources: numbers(sources, ['visitors']),
    pages: numbers(pages, ['views', 'visitors']),
    devices: numbers(devices, ['visitors']),
    countries: numbers(countries, ['visitors']),
    actions: numbers(actions, ['uses', 'visitors']),
    choices: numbers(choices, ['visitors']),
  };
}

/** Runs SQL on the account's Analytics Engine, with a token that may only read analytics. */
export function analyticsQuery({ accountId, token, fetcher = fetch }) {
  return async (sql) => {
    const response = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: `${sql} FORMAT JSON`,
    });
    if (!response.ok) throw new Error(`Analytics Engine answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return (await response.json()).data ?? [];
  };
}
