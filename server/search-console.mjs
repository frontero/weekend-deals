// Reads Google Search Console for the admin's SEO page: which searches show the site, how often, where, and how many
// click. Signed in as a service account that was added to the property as a restricted user
// (scripts/setup-search-console.sh). Node only: the rounds run it, not the Worker.
import { createSign } from 'node:crypto';
import { shiftDays } from '../shared/weekends.mjs';
import { TRACKED_INDEX_PAGES } from './index-tracking.mjs';
import { RECOVERY_BASELINE, RECOVERY_DIP, recoveryGroup, searchCalendarDate } from './seo-recovery.mjs';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const API = 'https://www.googleapis.com/webmasters/v3';
// The property as Search Console names a domain verified through DNS.
export const SITE_PROPERTY = 'sc-domain:parkjeweg.nl';

const base64url = (value) => Buffer.from(value).toString('base64url');

/** The service account from GSC_SERVICE_ACCOUNT: its key file's JSON, base64 on one line; null without one. */
export function serviceAccount(env = process.env) {
  if (!env.GSC_SERVICE_ACCOUNT) return null;
  const account = JSON.parse(Buffer.from(env.GSC_SERVICE_ACCOUNT, 'base64').toString('utf8'));
  if (!account.client_email || !account.private_key) throw new Error('GSC_SERVICE_ACCOUNT misses client_email or private_key');
  return account;
}

/** A read-only access token for the account, good for an hour. */
export async function accessToken(account, { fetcher = fetch, now = Date.now() } = {}) {
  const seconds = Math.floor(now / 1000);
  const claims = { iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: seconds, exp: seconds + 3600 };
  const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(JSON.stringify(claims))}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url');
  const response = await fetcher(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  if (!response.ok) throw new Error(`Google gave no token: ${response.status} ${(await response.text()).slice(0, 200)}`);
  return (await response.json()).access_token;
}

/**
 * Search figures per the dimensions asked for, e.g. ['query', 'page'].
 * @returns [{ keys, clicks, impressions, ctr, position }]
 */
export async function searchAnalytics(token, { startDate, endDate, dimensions, rowLimit = 1000, site = SITE_PROPERTY, dataState, type }, { fetcher = fetch } = {}) {
  const response = await fetcher(`${API}/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate, endDate, dimensions, rowLimit, dataState, type }),
  });
  if (!response.ok) throw new Error(`Search Console answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return (await response.json()).rows ?? [];
}

const authorised = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

/** The sitemaps Google knows of the property, with when it last read each and what it found wrong. */
export async function sitemaps(token, { fetcher = fetch, site = SITE_PROPERTY } = {}) {
  const response = await fetcher(`${API}/sites/${encodeURIComponent(site)}/sitemaps`, { headers: authorised(token) });
  if (!response.ok) throw new Error(`Search Console answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return ((await response.json()).sitemap ?? []).map(({ path, lastDownloaded, errors, warnings, isPending }) => ({
    path,
    lastDownloaded: lastDownloaded ?? null,
    errors: Number(errors) || 0,
    warnings: Number(warnings) || 0,
    pending: Boolean(isPending),
  }));
}

/** Whether Google has one page in its index, and when it last came by. */
export async function inspectUrl(token, url, { fetcher = fetch, site = SITE_PROPERTY } = {}) {
  const response = await fetcher('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: authorised(token),
    body: JSON.stringify({ inspectionUrl: url, siteUrl: site, languageCode: 'nl' }),
  });
  if (!response.ok) throw new Error(`Search Console answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const status = (await response.json()).inspectionResult?.indexStatusResult ?? {};
  return { verdict: status.verdict ?? 'UNKNOWN', coverage: status.coverageState ?? '', lastCrawl: status.lastCrawlTime ?? null };
}

const SITE_URL = 'https://parkjeweg.nl';
const DAY_MS = 24 * 60 * 60 * 1000;
// Google's figures of the last days still change, so those days are read again each time.
const DAYS_BACK = 7;
// Pages asked about per round: Google allows 2,000 a day, and a round should not take minutes longer for it.
const INSPECTIONS = 60;
const TOGETHER = 6;
// Two adjacent 28-day periods plus a week for final data to arrive, using Google's Pacific calendar.
const TOTAL_LOOKBACK = 63;

export async function updateSearchTotals(db, token, { fetcher = fetch, now = Date.now() } = {}) {
  const today = searchCalendarDate.format(now);
  const rows = await searchAnalytics(token, {
    startDate: shiftDays(today, -TOTAL_LOOKBACK),
    endDate: shiftDays(today, -1),
    dimensions: ['date'],
  }, { fetcher });
  const days = rows.map(({ keys: [day], clicks, impressions }) => ({ day, clicks, impressions }));
  const totals = { checkedAt: new Date(now).toISOString(), days };
  await db.saveSearchTotals(totals);
  return totals;
}

async function recoveryImpressions(token, range, fetcher) {
  const rowLimit = 25000;
  const rows = await searchAnalytics(token, {
    startDate: range.start, endDate: range.end, dimensions: ['page'], rowLimit, dataState: 'final', type: 'web',
  }, { fetcher });
  if (rows.length >= rowLimit) {
    throw new Error('Search Console page totals reached the row limit');
  }
  const pages = new Map();
  for (const { keys: [url], impressions } of rows) {
    const { pathname } = new URL(url);
    if (recoveryGroup(pathname) !== null) {
      pages.set(pathname, (pages.get(pathname) ?? 0) + impressions);
    }
  }
  return { ...range, pages: Object.fromEntries(pages) };
}

export async function updateSeoRecoverySearch(db, token, totals, { fetcher = fetch } = {}) {
  const end = totals.days.at(-1)?.day;
  if (end === undefined || end < RECOVERY_DIP.end) {
    return;
  }
  const current = await db.seoSearchRecovery();
  if (current !== null && current.recent.end >= end) {
    return;
  }
  const [baseline, dip, recent] = await Promise.all([
    current?.baseline ?? recoveryImpressions(token, RECOVERY_BASELINE, fetcher),
    current?.dip ?? recoveryImpressions(token, RECOVERY_DIP, fetcher),
    end === RECOVERY_DIP.end ? null : recoveryImpressions(token, { start: shiftDays(end, -2), end }, fetcher),
  ]);
  await db.saveSeoSearchRecovery({ checkedAt: totals.checkedAt, baseline, dip, recent: recent ?? dip });
}

/**
 * One round's reading of Search Console into the database: the search figures of the last days, the sitemap's state
 * and, for the pages longest unchecked, whether Google has them. A failing part leaves the others standing.
 * @returns what it read, for the round's log
 */
export async function updateSearchConsole(db, account, { fetcher = fetch, now = Date.now(), inspections = INSPECTIONS, log = () => {} } = {}) {
  const token = await accessToken(account, { fetcher, now });
  const day = (back) => new Date(now - back * DAY_MS).toISOString().slice(0, 10);
  const read = { rows: 0, inspected: 0 };
  const totals = await updateSearchTotals(db, token, { fetcher, now }).catch((error) => {
    log(`search totals failed: ${error.message}`);
    return null;
  });
  if (totals !== null) {
    await updateSeoRecoverySearch(db, token, totals, { fetcher }).catch((error) => {
      log(`search recovery failed: ${error.message}`);
    });
  }
  try {
    const rows = await searchAnalytics(token, { startDate: day(DAYS_BACK), endDate: day(0), dimensions: ['date', 'page', 'query'], rowLimit: 5000 }, { fetcher });
    await db.saveSearchStats(
      rows.map(({ keys: [date, page, query], clicks, impressions, position }) => ({ day: date, path: page.replace(SITE_URL, '') || '/', query, clicks, impressions, position })),
    );
    read.rows = rows.length;
  } catch (error) {
    log(`search figures failed: ${error.message}`);
  }
  try {
    await db.saveSearchSitemaps({ checkedAt: new Date(now).toISOString(), sitemaps: await sitemaps(token, { fetcher }) });
  } catch (error) {
    log(`sitemap state failed: ${error.message}`);
  }
  const paths = await db.pagesToInspect(inspections, TRACKED_INDEX_PAGES.map(({ path }) => path));
  read.inspected = await updatePageIndex(db, token, paths, { fetcher, now, log });
  return read;
}

/** Inspect and store these URLs. A failing batch still saves its successful answers before stopping. */
export async function updatePageIndex(db, token, paths, { fetcher = fetch, now = Date.now(), log = () => {} } = {}) {
  const checkedAt = new Date(now).toISOString();
  let inspected = 0;
  for (let start = 0; start < paths.length; start += TOGETHER) {
    const answers = await Promise.allSettled(
      paths.slice(start, start + TOGETHER).map(async (path) => ({ path, ...(await inspectUrl(token, `${SITE_URL}${path}`, { fetcher })) })),
    );
    const failed = answers.find((answer) => answer.status === 'rejected');
    for (const answer of answers) {
      if (answer.status !== 'fulfilled') continue;
      await db.savePageIndex({ ...answer.value, checkedAt });
      inspected += 1;
    }
    if (failed) {
      log(`inspection failed: ${failed.reason.message}`);
      // Out of quota or out of reach: the rest waits for the next round.
      break;
    }
  }
  return inspected;
}
