import { searchProgress } from '../shared/search-progress.mjs';
import { INDEX_ALERT_PAGES } from './index-tracking.mjs';
import { recoveryGroup } from './seo-recovery.mjs';

const WEEK_DAYS = 7;
const DROP_PERCENT = 30;
const SITE_LOSS = 100;
const GROUP_LOSS = 50;
const PAGE_LOSS = 20;
const GROUP_LABELS = { parks: 'Parkpagina’s', regions: 'Regio- en landenpagina’s' };

export function completeSearchWeeks(totals) {
  const progress = searchProgress(totals?.days ?? [], WEEK_DAYS);
  if (progress === null || progress.previous === null) {
    return null;
  }
  return progress;
}

function impressionDrop({ label, path = null, previous, current, minimum }) {
  const decline = previous - current;
  if (decline < minimum || decline * 100 < previous * DROP_PERCENT) {
    return null;
  }
  return { label, path, previous, current, percent: Math.round(decline * 100 / previous) };
}

function groupImpressions(pages, group) {
  return Object.entries(pages).reduce((total, [path, impressions]) => (
    recoveryGroup(path) === group ? total + impressions : total
  ), 0);
}

function pageAndGroupDrops({ previous, current }) {
  const groups = Object.entries(GROUP_LABELS).map(([group, label]) => impressionDrop({
    label, previous: groupImpressions(previous, group), current: groupImpressions(current, group), minimum: GROUP_LOSS,
  }));
  const pages = INDEX_ALERT_PAGES.map(({ path, label }) => impressionDrop({
    label, path, previous: previous[path] ?? 0, current: current[path] ?? 0, minimum: PAGE_LOSS,
  }));
  return [...groups, ...pages].filter((drop) => drop !== null).sort((a, b) => (b.previous - b.current) - (a.previous - a.current));
}

function impressionReport(totals, pageWeeks) {
  const weeks = completeSearchWeeks(totals);
  if (weeks === null) {
    return null;
  }
  const { start, end, previousStart, previousEnd } = weeks;
  const site = impressionDrop({
    label: 'Hele website', previous: weeks.previous.impressions, current: weeks.current.impressions, minimum: SITE_LOSS,
  });
  const hasPageData = pageWeeks?.end === end;
  return {
    start, end, previousStart, previousEnd, hasPageData,
    drops: [...(site === null ? [] : [site]), ...(hasPageData ? pageAndGroupDrops(pageWeeks) : [])],
  };
}

function indexLosses(index, crawls) {
  const labels = new Map(INDEX_ALERT_PAGES.map(({ path, label }) => [path, label]));
  return index
    .filter(({ path, verdict, indexLostAt }) => labels.has(path) && verdict !== 'PASS' && typeof indexLostAt === 'string')
    .map(({ path, coverage, indexLostAt, lastIndexedAt, checkedAt }) => ({
      path, label: labels.get(path), coverage, indexLostAt, lastIndexedAt, checkedAt, googlebot: crawls[path] ?? null,
    }))
    .sort((a, b) => b.indexLostAt.localeCompare(a.indexLostAt));
}

export function seoAlertReport({ index, totals, sitemaps, pageWeeks, crawls }) {
  const indexCheckedAt = index.map((row) => row.checkedAt).sort().at(-1) ?? null;
  const impressionCheckedAt = totals?.checkedAt ?? null;
  return {
    checkedAt: [indexCheckedAt, impressionCheckedAt, sitemaps?.checkedAt].filter(Boolean).sort().at(-1) ?? null,
    indexCheckedAt,
    impressionCheckedAt,
    indexLosses: indexLosses(index, crawls),
    impressions: impressionReport(totals, pageWeeks),
  };
}
