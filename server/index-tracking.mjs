export const TRACKED_INDEX_PAGES = [
  { path: '/feestdag/pasen', label: 'Pasen' },
  { path: '/vakantie/voorjaarsvakantie', label: 'Voorjaarsvakantie' },
  { path: '/feestdag/pinksteren', label: 'Pinksteren' },
  { path: '/feestdag/kerst', label: 'Kerst' },
  { path: '/vakantie/kerstvakantie', label: 'Kerstvakantie' },
  { path: '/cijfers', label: 'Cijfers' },
  { path: '/land/duitsland', label: 'Duitsland', trackGooglebot: true },
  { path: '/park/hof-van-saksen', label: 'Hof van Saksen', trackGooglebot: true },
  { path: '/park/vakantiepark-hoog-vaals', label: 'Hoog Vaals', trackGooglebot: true },
  { path: '/park/vakantiepark-de-lommerbergen', label: 'De Lommerbergen', trackGooglebot: true },
  { path: '/park/vakantiepark-het-vennenbos', label: 'Het Vennenbos', trackGooglebot: true },
];

export const GOOGLEBOT_PATHS = TRACKED_INDEX_PAGES.filter(({ trackGooglebot }) => trackGooglebot === true).map(({ path }) => path);

export function trackedIndexRows(index, requests, crawls = {}) {
  const inspected = new Map(index.map((row) => [row.path, row]));
  return TRACKED_INDEX_PAGES.map(({ path, label, trackGooglebot }) => {
    const { verdict = null, coverage = null, lastCrawl = null, checkedAt = null } = inspected.get(path) ?? {};
    const cloudflare = trackGooglebot === true ? { googlebot: crawls[path] ?? null } : {};
    return { path, label, requestedOn: requests[path] ?? null, verdict, coverage, lastCrawl, checkedAt, ...cloudflare };
  });
}
