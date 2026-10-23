// What the admin pages derive from the precomputed charts data: time ranges, how prices and availability move as a
// weekend comes closer, and when in the week prices change. Pure functions, so they are tested without a browser.

const DAY_MS = 24 * 60 * 60 * 1000;
// Lead times are grouped per week before arrival.
const LEAD_BUCKET_DAYS = 7;

/** The value at quantile `q` of ascending numbers, interpolated, to one decimal. */
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * q;
  const below = Math.floor(position);
  const value = sorted[below] + (sorted[Math.ceil(position)] - sorted[below]) * (position - below);
  return Math.round(value * 10) / 10;
}

const median = (values) => quantile([...values].sort((a, b) => a - b), 0.5);
const daysBetween = (fromIso, toIso) => (Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS;

/** Calendar days from the day of `at` (local time) to the arrival date; rounding absorbs daylight saving. */
function calendarDaysBetween(at, arrival) {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  return Math.round((Date.parse(`${arrival}T00:00:00`) - day.getTime()) / DAY_MS);
}

/** Items whose `at` lies within `days` before the newest one; all of them when `days` is null. */
export function lastDays(items, days, at = (item) => item.at) {
  if (!items.length || days == null) return items;
  const end = Math.max(...items.map((item) => Date.parse(at(item))));
  return items.filter((item) => Date.parse(at(item)) >= end - days * DAY_MS);
}

/** Change from `before` to `after` in percent, rounded to one decimal; null without both. */
export function percentChange(before, after) {
  if (before == null || after == null || before === 0) return null;
  return Math.round(((after - before) / before) * 1000) / 10;
}

/**
 * Per weekend and round, how far before arrival the round was and how the weekend's median price then compared to
 * its usual level (100 = the average of its medians), so weekends in different seasons can be laid side by side.
 * @param weekends [{ arrival, series: [[at, count, min, p25, median, p75]] }]
 * @returns [{ arrival, at, days, index, share }] where share is the parks still free, in percent of its most
 */
export function leadPoints(weekends) {
  return weekends.flatMap(({ arrival, series }) => {
    const usual = series.reduce((sum, point) => sum + point[4], 0) / series.length;
    const most = Math.max(...series.map((point) => point[1]));
    // A weekend's own arrival day counts as day 0; rounds after it do not belong to its run-up.
    return series
      .map(([at, count, , , medianCents]) => ({
        arrival,
        at,
        days: Math.max(0, calendarDaysBetween(at, arrival)),
        index: Math.round((medianCents / usual) * 1000) / 10,
        share: Math.round((count / most) * 1000) / 10,
      }))
      .filter((point) => Date.parse(point.at) < Date.parse(`${point.arrival}T00:00:00`) + DAY_MS);
  });
}

/** The lead points grouped per week before arrival: the median and middle half of `field` per week. */
export function leadCurve(points, field = 'index') {
  const buckets = new Map();
  for (const point of points) {
    const week = Math.floor(point.days / LEAD_BUCKET_DAYS);
    if (!buckets.has(week)) buckets.set(week, []);
    buckets.get(week).push(point[field]);
  }
  return [...buckets]
    .sort(([a], [b]) => a - b)
    .map(([week, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return { week, from: week * LEAD_BUCKET_DAYS, value: median(sorted), low: quantile(sorted, 0.25), high: quantile(sorted, 0.75), count: values.length };
    });
}

/**
 * When in the week prices change: per weekday (0 = Monday) and hour of the rounds, how many rounds ran and the share
 * of compared prices that went up, down or moved to another accommodation.
 * @param rounds [{ at, compared, down, up, swapped }]
 */
export function momentGrid(rounds) {
  const cells = new Map();
  for (const round of rounds) {
    if (!round.compared) continue;
    const at = new Date(round.at);
    const key = `${(at.getDay() + 6) % 7}|${at.getHours()}`;
    if (!cells.has(key)) cells.set(key, { weekday: (at.getDay() + 6) % 7, hour: at.getHours(), rounds: 0, compared: 0, down: 0, up: 0, swapped: 0 });
    const cell = cells.get(key);
    cell.rounds += 1;
    cell.compared += round.compared;
    cell.down += round.down;
    cell.up += round.up;
    cell.swapped += round.swapped;
  }
  return [...cells.values()].map((cell) => ({
    ...cell,
    changed: Math.round(((cell.down + cell.up + cell.swapped) / cell.compared) * 1000) / 10,
    dropped: Math.round((cell.down / cell.compared) * 1000) / 10,
  }));
}

/**
 * One park's prices for a party size, laid out per round and weekend.
 * @param rows [[at, arrival, priceCents, accommodationCode]] in round order
 */
export function parkGrid(rows) {
  const rounds = [...new Set(rows.map(([at]) => at))];
  const weekends = [...new Set(rows.map(([, arrival]) => arrival))].sort();
  const byWeekend = new Map(weekends.map((arrival) => [arrival, []]));
  for (const [at, arrival, cents, code] of rows) byWeekend.get(arrival).push({ at, cents, code });
  const latestRound = rounds.at(-1);
  const perWeekend = weekends.map((arrival) => {
    const seen = byWeekend.get(arrival);
    let changes = 0;
    let swaps = 0;
    for (let index = 1; index < seen.length; index += 1) {
      if (seen[index].cents !== seen[index - 1].cents) changes += 1;
      if (seen[index].code !== seen[index - 1].code) swaps += 1;
    }
    const last = seen.at(-1);
    return {
      arrival,
      seen,
      usual: median(seen.map((item) => item.cents)),
      lowest: Math.min(...seen.map((item) => item.cents)),
      highest: Math.max(...seen.map((item) => item.cents)),
      current: last.at === latestRound ? last : null,
      first: seen[0],
      changes,
      swaps,
    };
  });
  return { rounds, weekends, perWeekend, latestRound };
}

/** "Nog weinig data" below this many days of measuring; patterns need a few weeks of rounds. */
export const ENOUGH_DAYS = 14;

/** How many days the rounds span. */
export const spanDays = (rounds) => (rounds.length < 2 ? 0 : daysBetween(rounds[0].at, rounds.at(-1).at));
