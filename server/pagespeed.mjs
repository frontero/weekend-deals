// Google's PageSpeed Insights for the admin's SEO page: how fast a page is on a phone and what Lighthouse marks down.
// With a key of its own (PAGESPEED_API_KEY, scripts/setup-pagespeed.sh): without one Google shares a daily limit
// among everyone and refuses. Node only: the rounds run it, once a day.

const API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const CATEGORIES = { performance: 'performance', seo: 'seo', accessibility: 'accessibility', 'best-practices': 'bestPractices' };
const SITE_URL = 'https://parkjeweg.nl';
const DAY_MS = 24 * 60 * 60 * 1000;
// One answer takes Google up to half a minute.
const TOGETHER = 3;
const HISTORY_DAYS = 120;
const MARKED_DOWN = 6;

/** One page as a phone loads it: scores out of 100, the main timings, and what Lighthouse marks down most. */
export async function pageSpeed(url, key, { fetcher = fetch } = {}) {
  const params = new URLSearchParams([['url', url], ['strategy', 'mobile'], ['locale', 'nl'], ['key', key], ...Object.keys(CATEGORIES).map((category) => ['category', category])]);
  const response = await fetcher(`${API}?${params}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.lighthouseResult) throw new Error(`PageSpeed answered ${response.status}: ${body.error?.message?.slice(0, 200) ?? 'no result'}`);
  const { categories, audits } = body.lighthouseResult;
  const scores = Object.fromEntries(Object.entries(CATEGORIES).map(([id, name]) => [name, Math.round((categories[id]?.score ?? 0) * 100)]));
  const markedDown = Object.values(categories)
    .flatMap((category) => category.auditRefs.filter((ref) => ref.weight > 0).map((ref) => audits[ref.id]))
    .filter((audit) => audit && audit.score !== null && audit.score < 0.9)
    .sort((a, b) => a.score - b.score)
    .map((audit) => audit.title);
  return {
    ...scores,
    paintMs: Math.round(audits['largest-contentful-paint']?.numericValue ?? 0),
    blockedMs: Math.round(audits['total-blocking-time']?.numericValue ?? 0),
    shift: Math.round((audits['cumulative-layout-shift']?.numericValue ?? 0) * 1000) / 1000,
    markedDown: [...new Set(markedDown)].slice(0, MARKED_DOWN),
  };
}

/** One page of each kind (a park, a weekend, a region, …) and the app itself: what a daily check looks at. */
export function samplePaths(paths) {
  const byKind = Map.groupBy(paths, (path) => path.split('/')[1]);
  return ['/', ...[...byKind.values()].map((list) => list[0])];
}

/**
 * The day's check: the sample's scores, kept with a short history of the average speed score. Skipped while the last
 * one is less than 20 hours old.
 * @returns how many pages it read, or null when it was not due
 */
export async function updatePageSpeed(db, key, { fetcher = fetch, now = Date.now(), log = () => {} } = {}) {
  const before = await db.pageSpeed();
  if (before && now - Date.parse(before.checkedAt) < 20 * 60 * 60 * 1000) return null;
  const paths = samplePaths((await db.pagePaths()).map((page) => page.path));
  const pages = [];
  for (let start = 0; start < paths.length; start += TOGETHER) {
    const answers = await Promise.allSettled(paths.slice(start, start + TOGETHER).map(async (path) => ({ path, ...(await pageSpeed(`${SITE_URL}${path}`, key, { fetcher })) })));
    for (const answer of answers) {
      if (answer.status === 'fulfilled') pages.push(answer.value);
      else log(`pagespeed failed: ${answer.reason.message}`);
    }
  }
  // Nothing read (a wrong key, Google out of reach): the last check stays.
  if (!pages.length) return 0;
  const day = new Date(now).toISOString().slice(0, 10);
  const average = Math.round(pages.reduce((sum, page) => sum + page.performance, 0) / pages.length);
  const history = [...(before?.history ?? []).filter((entry) => entry.day !== day && entry.day >= new Date(now - HISTORY_DAYS * DAY_MS).toISOString().slice(0, 10)), { day, performance: average }];
  await db.savePageSpeed({ checkedAt: new Date(now).toISOString(), pages, history });
  return pages.length;
}
