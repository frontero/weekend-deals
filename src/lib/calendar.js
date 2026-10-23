import { shiftDays } from '../../shared/weekends.mjs';

// A Landal weekend runs Friday to Monday.
const WEEKEND_NIGHTS = 3;

/** Weeks (Monday first) that cover `month` ("YYYY-MM"); each day is { date, day, inMonth }. */
export function monthGrid(month) {
  const firstDay = new Date(`${month}-01T00:00:00Z`).getUTCDay();
  let date = shiftDays(`${month}-01`, -((firstDay + 6) % 7));
  const weeks = [];
  do {
    const week = [];
    for (let index = 0; index < 7; index += 1) {
      week.push({ date, day: Number(date.slice(8)), inMonth: date.startsWith(month) });
      date = shiftDays(date, 1);
    }
    weeks.push(week);
  } while (date.startsWith(month));
  return weeks;
}

export function addMonths(month, count) {
  const [year, monthIndex] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthIndex - 1 + count, 1));
  return date.toISOString().slice(0, 7);
}

/** Two clicks pick a period of arrival dates; a click before the start, or after a finished period, starts over. */
export function pickRange({ from, complete }, date) {
  if (complete || !from || date < from) return { from: date, to: date, complete: false };
  return { from, to: date, complete: true };
}

/** Every day of the stays in a period, from its first Friday up to the Monday after its last one. */
export function rangeDays(from, to) {
  const days = new Set();
  if (!from) return days;
  const last = shiftDays(to || from, WEEKEND_NIGHTS);
  for (let date = from; date <= last; date = shiftDays(date, 1)) days.add(date);
  return days;
}
