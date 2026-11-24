// Bing Webmaster Tools for the admin's SEO page: how the site does in Bing, who links to it, and how often people
// search a word. With the account's API key (BING_WEBMASTER_API_KEY, scripts/setup-bing.sh). Node only: the rounds
// run it, once a day.

const API = 'https://ssl.bing.com/webmaster/api.svc/json';
const SITE_HOST = 'parkjeweg.nl';
const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS = 28;
const LISTED = 25;
// The searches whose size is asked: each is a call of its own.
const SIZED = 12;

/** One read of the API. The key goes in the address, as Bing asks; an error never repeats it. */
async function read(method, key, params = {}, { fetcher = fetch } = {}) {
  const response = await fetcher(`${API}/${method}?${new URLSearchParams({ ...params, apikey: key })}`);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || !('d' in body)) throw new Error(`Bing ${method} answered ${response.status}${body?.Message ? `: ${String(body.Message).slice(0, 120)}` : ''}`);
  return body.d;
}

/** Bing's "/Date(1316156400000-0700)/" as a day. */
const dayOf = (date) => new Date(Number(/\d+/.exec(date ?? '')?.[0] ?? 0)).toISOString().slice(0, 10);

/** Rows per search or page since a day, added up, the most shown first. Bing's positions are per week; shown-weighted. */
function summed(rows, since, labelOf) {
  const totals = new Map();
  for (const row of rows.filter((entry) => dayOf(entry.Date) >= since)) {
    const label = labelOf(row);
    const sum = totals.get(label) ?? { clicks: 0, impressions: 0, weighted: 0 };
    totals.set(label, { clicks: sum.clicks + row.Clicks, impressions: sum.impressions + row.Impressions, weighted: sum.weighted + row.AvgImpressionPosition * row.Impressions });
  }
  return [...totals]
    .map(([label, { clicks, impressions, weighted }]) => ({ label, clicks, impressions, position: impressions ? weighted / impressions : null }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, LISTED);
}

const pathOf = (url) => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

/**
 * Reads Bing's figures and stores them, once a day. `searches` are the words to ask the size of: how often Bing showed
 * results for them in the Netherlands in the last weeks. Returns null when it is not due, else how many reads worked.
 */
export async function updateBing(db, key, { fetcher = fetch, now = Date.now(), searches = [], log = () => {} } = {}) {
  const before = await db.bing();
  if (before && now - Date.parse(before.checkedAt) < 20 * 60 * 60 * 1000) return null;
  const sites = await read('GetUserSites', key, {}, { fetcher });
  const siteUrl = sites.find((site) => site.Url?.includes(SITE_HOST) && site.IsVerified !== false)?.Url;
  if (!siteUrl) throw new Error(`Bing has no verified site for ${SITE_HOST}`);
  const since = new Date(now - PERIOD_DAYS * DAY_MS).toISOString().slice(0, 10);
  let worked = 0;
  const attempt = async (name, reader, fallback) => {
    try {
      const value = await reader();
      worked += 1;
      return value;
    } catch (error) {
      log(`bing ${name} failed: ${error.message}`);
      return fallback;
    }
  };
  const site = { siteUrl };
  const days = await attempt('traffic', async () => (await read('GetRankAndTrafficStats', key, site, { fetcher })).map((row) => ({ day: dayOf(row.Date), clicks: row.Clicks, impressions: row.Impressions })).filter((row) => row.day >= since).sort((a, b) => a.day.localeCompare(b.day)), before?.days ?? []);
  const queries = await attempt('queries', async () => summed(await read('GetQueryStats', key, site, { fetcher }), since, (row) => row.Query), before?.queries ?? []);
  const pages = await attempt('pages', async () => summed(await read('GetPageStats', key, site, { fetcher }), since, (row) => pathOf(row.Query)), before?.pages ?? []);
  const links = await attempt('links', async () => {
    const first = await read('GetLinkCounts', key, { ...site, page: 0 }, { fetcher });
    const rows = (first.Links ?? []).map((row) => ({ path: pathOf(row.Url), count: row.Count })).sort((a, b) => b.count - a.count);
    return { total: rows.reduce((sum, row) => sum + row.count, 0), more: (first.TotalPages ?? 1) > 1, pages: rows.slice(0, LISTED) };
  }, before?.links ?? null);
  const crawl = await attempt('crawl', async () => {
    const latest = (await read('GetCrawlStats', key, site, { fetcher })).sort((a, b) => dayOf(b.Date).localeCompare(dayOf(a.Date)))[0];
    return latest ? { day: dayOf(latest.Date), crawled: latest.CrawledPages, inIndex: latest.InIndex, inLinks: latest.InLinks, errors: latest.CrawlErrors, notFound: latest.Code4xx, failed: latest.Code5xx } : null;
  }, before?.crawl ?? null);
  const sizes = [];
  for (const query of searches.slice(0, SIZED)) {
    const size = await attempt(`size of "${query}"`, async () => {
      const weeks = (await read('GetKeywordStats', key, { q: query, country: 'nl', language: 'nl-NL' }, { fetcher })).sort((a, b) => dayOf(b.Date).localeCompare(dayOf(a.Date))).slice(0, 4);
      return weeks.length ? { query, exact: weeks.reduce((sum, week) => sum + week.Impressions, 0), broad: weeks.reduce((sum, week) => sum + week.BroadImpressions, 0), weeks: weeks.length } : null;
    }, null);
    if (size) sizes.push(size);
  }
  // Nothing read: the last state stays.
  if (!worked) return 0;
  await db.saveBing({ checkedAt: new Date(now).toISOString(), periodDays: PERIOD_DAYS, days, queries, pages, links, crawl, sizes: searches.length ? sizes : (before?.sizes ?? []) });
  return worked;
}
