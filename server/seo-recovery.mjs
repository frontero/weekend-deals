import { shiftDays } from '../shared/weekends.mjs';

export const RECOVERY_BASELINE = { start: '2026-11-20', end: '2026-11-22' };
export const RECOVERY_DIP = { start: '2026-11-23', end: '2026-11-25' };
const HOUR = 60 * 60 * 1000;
const calendar = { timeZone: 'America/Los_Angeles' };
export const searchCalendarDate = new Intl.DateTimeFormat('sv-SE', { ...calendar, dateStyle: 'short' });
const pacificHour = new Intl.DateTimeFormat('en-GB', { ...calendar, hour: '2-digit', hourCycle: 'h23' });

export function searchCalendarStart(day) {
  // At 08:00 UTC, California is either at midnight or 01:00, including the two DST change days.
  const anchor = Date.parse(`${day}T08:00:00Z`);
  return new Date(anchor - Number(pacificHour.format(anchor)) * HOUR).toISOString();
}

export function recoveryGroup(path) {
  if (path.startsWith('/park/')) {
    return 'parks';
  }
  if (path.startsWith('/regio/') || path.startsWith('/land/')) {
    return 'regions';
  }
  return null;
}

export function recoveryDays({ end }) {
  return [-2, -1, 0].map((offset) => shiftDays(end, offset));
}

function impressionTotals(pages) {
  const totals = { parks: 0, regions: 0 };
  for (const [path, impressions] of Object.entries(pages)) {
    const group = recoveryGroup(path);
    if (group !== null) {
      totals[group] += impressions;
    }
  }
  return totals;
}

function periodReport({ start, end, pages }, crawls) {
  const days = recoveryDays({ end }).map((day) => crawls[day]);
  const coverage = days.filter((day) => day !== undefined).length;
  const visits = coverage === days.length ? {
    parks: days.reduce((total, day) => total + day.visits.parks, 0),
    regions: days.reduce((total, day) => total + day.visits.regions, 0),
  } : null;
  return { start, end, impressions: impressionTotals(pages), visits, sampled: days.some((day) => day?.sampled === true) };
}

function biggestLosses({ baseline, dip, recent }) {
  return Object.entries(baseline.pages)
    .map(([path, before]) => ({ path, before, dip: dip.pages[path] ?? 0, recent: recent.pages[path] ?? 0 }))
    .filter((page) => page.recent < page.before)
    .sort((a, b) => (b.before - b.recent) - (a.before - a.recent) || a.path.localeCompare(b.path))
    .slice(0, 5);
}

export async function seoRecoveryReport(db) {
  const search = await db.seoSearchRecovery();
  if (search === null) {
    return null;
  }
  const { baseline, dip, recent } = search;
  const periods = [baseline, dip, recent];
  const days = [...new Set(periods.flatMap(recoveryDays))];
  const crawls = await db.seoCrawlDays(days);
  return {
    periods: periods.map((period) => periodReport(period, crawls)),
    biggestLosses: biggestLosses(search),
    afterDip: recent.start > dip.end,
  };
}
