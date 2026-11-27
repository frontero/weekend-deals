// Record the production publication time when one of these pages gets an editorial update.
const SEASONAL_PUBLISHED_AT = '2026-11-26T15:32:57.000Z';
const PARK_INTROS_PUBLISHED_AT = '2026-11-27T14:20:20.781Z';
const OVERIJSSEL_AND_WEERTERBERGEN_PUBLISHED_AT = '2026-11-27T16:57:52.000Z';

export const TRACKED_INDEX_PAGES = [
  { path: '/feestdag/pasen', label: 'Pasen', publishedAt: SEASONAL_PUBLISHED_AT },
  { path: '/vakantie/voorjaarsvakantie', label: 'Voorjaarsvakantie', publishedAt: SEASONAL_PUBLISHED_AT },
  { path: '/feestdag/pinksteren', label: 'Pinksteren', publishedAt: SEASONAL_PUBLISHED_AT },
  { path: '/feestdag/kerst', label: 'Kerst', publishedAt: SEASONAL_PUBLISHED_AT },
  { path: '/vakantie/kerstvakantie', label: 'Kerstvakantie', publishedAt: SEASONAL_PUBLISHED_AT },
  { path: '/cijfers', label: 'Cijfers' },
  { path: '/land/duitsland', label: 'Duitsland', publishedAt: '2026-11-27T18:48:35.643Z' },
  { path: '/park/hof-van-saksen', label: 'Hof van Saksen', publishedAt: '2026-11-27T12:27:15.531Z' },
  { path: '/park/vakantiepark-hoog-vaals', label: 'Hoog Vaals', publishedAt: PARK_INTROS_PUBLISHED_AT },
  { path: '/park/vakantiepark-de-lommerbergen', label: 'De Lommerbergen', publishedAt: PARK_INTROS_PUBLISHED_AT },
  { path: '/park/vakantiepark-het-vennenbos', label: 'Het Vennenbos', publishedAt: PARK_INTROS_PUBLISHED_AT },
  { path: '/regio/overijssel', label: 'Overijssel', publishedAt: OVERIJSSEL_AND_WEERTERBERGEN_PUBLISHED_AT },
  { path: '/park/weerterbergen', label: 'Weerterbergen', publishedAt: OVERIJSSEL_AND_WEERTERBERGEN_PUBLISHED_AT },
];

export const INDEX_ALERT_PAGES = [
  ...TRACKED_INDEX_PAGES,
  { path: '/weekenden', label: 'Alle weekenden' },
  { path: '/parken', label: 'Alle parken' },
  { path: '/last-minute', label: 'Last minute' },
  { path: '/regio/ardennen', label: 'Ardennen' },
  { path: '/regio/zeeland', label: 'Zeeland' },
  { path: '/park/beach-resort-kamperland', label: 'Beach Resort Kamperland' },
];

export const GOOGLEBOT_PATHS = INDEX_ALERT_PAGES.map(({ path }) => path);

function crawlTiming(observedAt, updatedAt) {
  const observed = Date.parse(observedAt);
  const updated = Date.parse(updatedAt);
  if (Number.isFinite(observed) === false || Number.isFinite(updated) === false) {
    return null;
  }
  return observed > updated;
}

function compareCrawlTimes(lastCrawl, visitedAt) {
  const searchSecond = Math.floor(Date.parse(lastCrawl) / 1000);
  const cloudflareSecond = Math.floor(Date.parse(visitedAt) / 1000);
  if (Number.isFinite(searchSecond) === false || Number.isFinite(cloudflareSecond) === false) {
    return null;
  }
  const difference = searchSecond - cloudflareSecond;
  return Math.abs(difference) <= 1 ? 0 : Math.sign(difference);
}

export function trackedIndexRows(index, requests, crawls = {}, pages = []) {
  const inspected = new Map(index.map((row) => [row.path, row]));
  const figuresUpdatedAt = pages.find(({ path }) => path === '/cijfers')?.computedAt ?? null;
  return TRACKED_INDEX_PAGES.map(({ path, label, publishedAt }) => {
    const { verdict = null, coverage = null, lastCrawl = null, checkedAt = null } = inspected.get(path) ?? {};
    const updatedAt = path === '/cijfers' ? figuresUpdatedAt : publishedAt ?? null;
    const googlebot = crawls[path] ?? null;
    const cloudflareAfterUpdate = crawlTiming(googlebot?.visitedAt, updatedAt);
    const searchAfterUpdate = crawlTiming(lastCrawl, updatedAt);
    const searchComparedToCloudflare = cloudflareAfterUpdate === true ? compareCrawlTimes(lastCrawl, googlebot.visitedAt) : null;
    return {
      path, label, requestedOn: requests[path] ?? null, verdict, coverage, lastCrawl, checkedAt,
      updatedAt, googlebot, cloudflareAfterUpdate, searchAfterUpdate, searchComparedToCloudflare,
    };
  });
}
