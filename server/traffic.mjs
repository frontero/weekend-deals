// The admin's Bezoekers page: the counts from server/events.mjs, read back from Analytics Engine's SQL API.
// A visitor is a code that holds for one day, so "visitors" over a period are visitor-days added up.
// shortcut: counts read rows as written; on days busy enough for Analytics Engine to sample, weigh visitors by
// _sample_interval as the event counts already are.
import { EVENTS_DATASET } from './events.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

const MAX_ROWS = 10000;
const MIN_SCAN_VIEWS = 30;
const MIN_SCAN_COUNTRIES = 5;
const MIN_DISTINCT_PATH_SHARE = 0.9;
const VISITOR_CODE = /^[a-f0-9]{8}$/;
const UTC_MINUTE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
const dayOf = (timestamp) => String(timestamp).slice(0, 10);
const minuteOf = (timestamp) => String(timestamp).slice(0, 16).replace('T', ' ');
const visitKey = (day, visitor) => `${day}|${visitor}`;

/** A burst of internal navigations across many URLs and countries, each the visit's only recorded action. */
function scanViews(views, singleStepVisits) {
  const candidates = views.filter(({ timestamp, source, visitor, path }) =>
    source === 'intern' && VISITOR_CODE.test(visitor) && typeof path === 'string' && path.startsWith('/') &&
    singleStepVisits.has(visitKey(dayOf(timestamp), visitor)),
  );
  const byMinute = Map.groupBy(candidates, ({ timestamp }) => minuteOf(timestamp));
  return [...byMinute].flatMap(([minute, rows]) => {
    if (UTC_MINUTE.test(minute) === false || rows.length < MIN_SCAN_VIEWS) {
      return [];
    }
    const paths = new Set(rows.map(({ path }) => path));
    const countries = new Set(rows.map(({ country }) => country).filter(Boolean));
    if (paths.size < rows.length * MIN_DISTINCT_PATH_SHARE || countries.size < MIN_SCAN_COUNTRIES) {
      return [];
    }
    return rows;
  });
}

// Exclude only the matching page views. Other actions, including late-arriving clicks, always stay in the report.
function excludeScanViews(scans) {
  if (scans.length === 0) {
    return '';
  }
  const scanByMinute = Map.groupBy(scans, ({ timestamp }) => minuteOf(timestamp));
  const matches = [...scanByMinute].map(([minute, views]) =>
    `(timestamp >= toDateTime('${minute}:00') AND timestamp < toDateTime('${minute}:00') + INTERVAL '1' MINUTE AND index1 IN (${views.map(({ visitor }) => `'${visitor}'`).join(',')}))`,
  );
  return ` AND (blob1 != 'view' OR blob5 != 'intern' OR NOT (${matches.join(' OR ')}))`;
}

function addScanCounts(daily, scanByDay) {
  const days = new Map(daily.map((row) => [row.day, { ...row, suspectedBots: 0 }]));
  for (const [day, views] of scanByDay) {
    const row = days.get(day) ?? { day, visitors: 0, views: 0, clicks: 0, parkVisitors: 0, clickers: 0 };
    days.set(day, { ...row, suspectedBots: views.length });
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Per visitor and day (`day|visitor`) the first page they opened: its kind, and the source it was reached from. */
function arrivalsOf(views) {
  const arrivals = new Map();
  for (const { timestamp, visitor, kind, source } of views) {
    const key = visitKey(dayOf(timestamp), visitor);
    if (!arrivals.has(key)) arrivals.set(key, { kind: kind || 'other', source: source && source !== 'intern' ? source : 'direct' });
  }
  return arrivals;
}

/** Per value of a field (a source, a kind of landing page): how many visitors, how many opened a park, how many clicked through. */
function conversion(days, field) {
  return [...Map.groupBy(days, (row) => row[field])]
    .map(([value, rows]) => ({ [field]: value, visitors: rows.length, parkVisitors: rows.filter((row) => row.parks > 0).length, clickers: rows.filter((row) => row.clicks > 0).length }))
    .sort((a, b) => b.visitors - a.visitors);
}

const numbers = (rows, fields) => rows.map((row) => ({ ...row, ...Object.fromEntries(fields.map((field) => [field, Number(row[field]) || 0])) }));

/**
 * @param query runs one SQL statement on Analytics Engine and gives its rows
 * @param days how many days back, today included (UTC)
 */
export async function trafficReport(query, { days, now = Date.now() }) {
  const since = new Date(now - (days - 1) * DAY_MS).toISOString().slice(0, 10);
  const raw = `FROM ${EVENTS_DATASET} WHERE timestamp >= toDateTime('${since} 00:00:00')`;
  const details = (sql) => query(sql).catch(() => null);
  const [views, visitorDays] = await Promise.all([
    details(`SELECT timestamp, index1 AS visitor, blob2 AS kind, blob5 AS source, blob4 AS path, blob7 AS country ${raw} AND blob1 = 'view' ORDER BY timestamp LIMIT ${MAX_ROWS}`),
    details(`SELECT formatDateTime(timestamp, '%Y-%m-%d') AS day, index1 AS visitor,
        countIf(blob1 = 'park' OR (blob1 = 'view' AND blob2 = 'park')) AS parks,
        countIf(blob1 = 'click') AS clicks,
        countIf(blob1 = 'click' AND double1 > 0) AS priced,
        sumIf(double1, blob1 = 'click') AS euros,
        sum(_sample_interval) AS steps
      ${raw} GROUP BY day, visitor LIMIT ${MAX_ROWS}`),
  ]);
  const canClassify = views !== null && visitorDays !== null && views.length < MAX_ROWS && visitorDays.length < MAX_ROWS;
  const singleStepVisits = new Set((visitorDays ?? []).filter((row) => Number(row.steps) === 1).map(({ day, visitor }) => visitKey(day, visitor)));
  const scans = canClassify ? scanViews(views, singleStepVisits) : [];
  const scanByDay = Map.groupBy(scans, ({ timestamp }) => dayOf(timestamp));
  const from = raw + excludeScanViews(scans);
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
    query(`SELECT blob1 AS name, blob2 AS key, sum(_sample_interval) AS uses, count(DISTINCT index1) AS visitors ${raw} AND blob1 != 'view'
      GROUP BY name, key ORDER BY visitors DESC LIMIT 60`),
    // Which parks, brands, weekends and so on: what visitors chose.
    query(`SELECT blob1 AS name, blob2 AS key, blob3 AS value, count(DISTINCT index1) AS visitors ${from} AND blob3 != ''
      GROUP BY name, key, value ORDER BY visitors DESC LIMIT 150`),
  ]);
  // Later additions, each on its own: one that Analytics Engine refuses leaves the rest of the page standing.
  const optional = (sql) => query(sql).catch(() => []);
  const [speed, clickDiscounts, clickWeeks, regions, browsers, screens] = await Promise.all([
    optional(`SELECT blob2 AS key, blob6 AS device, sum(_sample_interval) AS times, sum(double1 * _sample_interval) AS total ${raw} AND blob1 = 'speed'
      GROUP BY key, device ORDER BY key, device`),
    optional(`SELECT floor(double2 / 10) * 10 AS discount, sum(_sample_interval) AS clicks, sum(double1 * _sample_interval) AS euros ${raw} AND blob1 = 'click' AND double1 > 0
      GROUP BY discount ORDER BY discount`),
    optional(`SELECT double3 AS weeks, sum(_sample_interval) AS clicks ${raw} AND blob1 = 'click' AND double1 > 0 GROUP BY weeks ORDER BY weeks`),
    optional(`SELECT blob7 AS country, blob8 AS region, count(DISTINCT index1) AS visitors ${from} AND blob8 != '' GROUP BY country, region ORDER BY visitors DESC LIMIT 25`),
    optional(`SELECT blob9 AS browser, count(DISTINCT index1) AS visitors ${from} AND blob9 != '' GROUP BY browser ORDER BY visitors DESC LIMIT 15`),
    optional(`SELECT blob10 AS screen, count(DISTINCT index1) AS visitors ${from} AND blob10 != '' GROUP BY screen ORDER BY visitors DESC`),
  ]);
  const arrivals = arrivalsOf(views ?? []);
  const scanKeys = new Set(scans.map(({ timestamp, visitor }) => visitKey(dayOf(timestamp), visitor)));
  const recordedVisits = numbers(visitorDays ?? [], ['parks', 'clicks', 'priced', 'euros']);
  const visits = recordedVisits.filter(({ day, visitor }) => scanKeys.has(visitKey(day, visitor)) === false)
    .map((row) => ({ ...row, ...(arrivals.get(visitKey(row.day, row.visitor)) ?? { source: 'onbekend', kind: 'onbekend' }) }));
  return {
    since,
    botClassificationAvailable: canClassify,
    speed: numbers(speed, ['times', 'total']),
    clickDiscounts: numbers(clickDiscounts, ['discount', 'clicks', 'euros']),
    clickWeeks: numbers(clickWeeks, ['weeks', 'clicks']),
    regions: numbers(regions, ['visitors']),
    browsers: numbers(browsers, ['visitors']),
    screens: numbers(screens, ['visitors']),
    bySource: conversion(visits, 'source'),
    byLanding: conversion(visits, 'kind'),
    // Per day the clicks that carried a price, and those prices added up: what visitors were about to spend.
    clickValue: [...Map.groupBy(recordedVisits.filter((row) => row.priced), (row) => row.day)]
      .map(([day, rows]) => ({ day, clicks: rows.reduce((sum, row) => sum + row.priced, 0), euros: rows.reduce((sum, row) => sum + row.euros, 0) }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    days: addScanCounts(numbers(daily, ['visitors', 'views', 'clicks', 'parkVisitors', 'clickers']), scanByDay),
    sources: numbers(sources, ['visitors']),
    pages: numbers(pages, ['views', 'visitors']),
    devices: numbers(devices, ['visitors']),
    countries: numbers(countries, ['visitors']),
    actions: numbers(actions, ['uses', 'visitors']),
    choices: numbers(choices, ['visitors']),
  };
}

const MAX_STEPS = 3000;

/**
 * One day as its visitors lived it: per visitor (the code of that day) what they did, in order. The busiest first.
 * @param day an ISO date (UTC)
 * @returns [{ visitor, device, country, source, steps: [{ at, name, key, value, path, number }] }]
 */
export async function dayReport(query, day) {
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
  const rows = await query(`SELECT timestamp, index1 AS visitor, blob1 AS name, blob2 AS key, blob3 AS value, blob4 AS path, blob5 AS source, blob6 AS device, blob7 AS country, blob8 AS region, blob9 AS browser, double1 AS number, _sample_interval AS weight
    FROM ${EVENTS_DATASET} WHERE timestamp >= toDateTime('${day} 00:00:00') AND timestamp < toDateTime('${next} 00:00:00')
    ORDER BY timestamp LIMIT ${MAX_STEPS}`);
  const byVisitor = Map.groupBy(rows, (row) => row.visitor);
  const singleStepVisits = new Set([...byVisitor].filter(([, list]) => list.length === 1 && Number(list[0].weight) === 1).map(([visitor]) => visitKey(day, visitor)));
  const scans = rows.length < MAX_STEPS ? scanViews(rows.filter(({ name }) => name === 'view'), singleStepVisits) : [];
  const scanVisitors = new Set(scans.map(({ visitor }) => visitor));
  const visitors = [...byVisitor].map(([visitor, list]) => ({
    visitor,
    suspectedBot: scanVisitors.has(visitor),
    device: list[0].device,
    country: list[0].country,
    region: list[0].region ?? '',
    browser: list[0].browser ?? '',
    // Where the first page they opened was reached from.
    source: list.find((row) => row.name === 'view' && row.source)?.source ?? '',
    steps: list.map(({ timestamp, name, key, value, path, number }) => ({ at: `${String(timestamp).replace(' ', 'T')}Z`, name, key, value, path, number: Number(number) || 0 })),
  }));
  return visitors.sort((a, b) => b.steps.length - a.steps.length);
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
