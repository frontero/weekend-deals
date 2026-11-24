import { shiftDays } from '../../shared/weekends.mjs';

export const SEARCH_PERIODS = [7, 28];

function summarise(rows) {
  const impressions = rows.reduce((total, row) => total + row.impressions, 0);
  const clicks = rows.reduce((total, row) => total + row.clicks, 0);
  const ctr = impressions === 0 ? null : clicks / impressions;
  return { impressions, clicks, ctr };
}

/** Missing calendar days are unknown, even though an explicit zero is valid data. */
export function searchProgress(days, period) {
  const rows = days.toSorted((a, b) => a.day.localeCompare(b.day));
  const end = rows.at(-1)?.day ?? null;
  if (end === null) {
    return null;
  }

  const start = shiftDays(end, 1 - period);
  const previousStart = shiftDays(start, -period);
  const currentRows = rows.filter((row) => row.day >= start);
  const previousRows = rows.filter((row) => row.day >= previousStart && row.day < start);
  const complete = currentRows.length === period && previousRows.length === period;
  return {
    start, end, previousStart, previousEnd: shiftDays(start, -1), currentRows,
    previousAvailable: previousRows.length,
    current: summarise(currentRows),
    previous: complete ? summarise(previousRows) : null,
  };
}
