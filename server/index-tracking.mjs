export const TRACKED_INDEX_PAGES = [
  { path: '/feestdag/pasen', label: 'Pasen' },
  { path: '/vakantie/voorjaarsvakantie', label: 'Voorjaarsvakantie' },
  { path: '/feestdag/pinksteren', label: 'Pinksteren' },
  { path: '/feestdag/kerst', label: 'Kerst' },
  { path: '/vakantie/kerstvakantie', label: 'Kerstvakantie' },
  { path: '/cijfers', label: 'Cijfers' },
  { path: '/land/duitsland', label: 'Duitsland' },
  { path: '/park/hof-van-saksen', label: 'Hof van Saksen' },
];

export function trackedIndexRows(index, requests) {
  const inspected = new Map(index.map((row) => [row.path, row]));
  return TRACKED_INDEX_PAGES.map((page) => {
    const { verdict = null, coverage = null, lastCrawl = null, checkedAt = null } = inspected.get(page.path) ?? {};
    return { ...page, requestedOn: requests[page.path] ?? null, verdict, coverage, lastCrawl, checkedAt };
  });
}
