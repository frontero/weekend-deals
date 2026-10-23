// The admin page's charts for one party size, computed after each round from the rounds' kept summaries and stored
// ready to send, like the park list: the cloud app has little CPU time per request.

// The admin page looks this far back; older rounds are not summarised or charted.
export const ADMIN_WINDOW_DAYS = 90;
// A park's trend line in the park list.
const SPARK_POINTS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
// A park's price "a week ago" is its price in the round closest to this long before the latest one.
const TREND_DAYS = 7;

export const adminWindowStart = (now = Date.now()) => new Date(now - ADMIN_WINDOW_DAYS * DAY_MS).toISOString();

const roundSeries = ({ id, startedAt, changes, stats }) => ({
  id,
  at: startedAt,
  // [count, min, p25, median, p75] over all parks and weekends
  all: stats.all,
  parks: Object.keys(stats.parks).length,
  providers: stats.providers,
  compared: changes.compared ?? 0,
  down: changes.down ?? 0,
  up: changes.up ?? 0,
  swapped: changes.swapped ?? 0,
  appeared: changes.appeared ?? 0,
  gone: changes.gone ?? 0,
});

/** Per weekend, its price spread in every round that saw it: [at, count, min, p25, median, p75]. */
function weekendSeries(rounds) {
  const byArrival = new Map();
  for (const { startedAt, stats } of rounds) {
    for (const [arrival, spread] of Object.entries(stats.weekends)) {
      if (!byArrival.has(arrival)) byArrival.set(arrival, []);
      byArrival.get(arrival).push([startedAt, ...spread]);
    }
  }
  return [...byArrival].sort(([a], [b]) => a.localeCompare(b)).map(([arrival, series]) => ({ arrival, series }));
}

/** The round closest to `days` before the latest one, for "a week ago"; the first round when there is no such. */
function roundBefore(rounds, days) {
  const target = Date.parse(rounds.at(-1).startedAt) - days * DAY_MS;
  const earlier = rounds.filter((round) => Date.parse(round.startedAt) <= target);
  return earlier.at(-1) ?? rounds[0];
}

/** Per park seen in the window: where it stands now, a week ago, its extremes and how often its price moved. */
function parkList(rounds, parks) {
  const latest = rounds.at(-1);
  const before = roundBefore(rounds, TREND_DAYS);
  const recent = rounds.slice(-SPARK_POINTS);
  const codes = new Set(rounds.flatMap((round) => Object.keys(round.stats.parks)));
  return [...codes].map((code) => {
    const park = parks.get(code) ?? {};
    // [weekends, min, median] per round, null where the park had nothing free
    const seen = rounds.map((round) => round.stats.parks[code] ?? null);
    const mins = seen.filter(Boolean).map(([, min]) => min);
    let changes = 0;
    for (let index = 1; index < seen.length; index += 1) {
      if (seen[index] && seen[index - 1] && seen[index][1] !== seen[index - 1][1]) changes += 1;
    }
    const [weekends = 0, min = null, median = null] = latest.stats.parks[code] ?? [];
    return {
      code,
      name: park.name ?? code,
      provider: park.provider ?? 'landal',
      city: park.city ?? null,
      country: park.country ?? null,
      weekends,
      min,
      median,
      beforeMin: before.stats.parks[code]?.[1] ?? null,
      lowest: Math.min(...mins),
      highest: Math.max(...mins),
      changes,
      seen: mins.length,
      spark: recent.map((round) => round.stats.parks[code]?.[1] ?? null),
    };
  });
}

/**
 * @param rounds one party size's summarised rounds in the window, oldest first: { id, startedAt, changes, stats }
 * @param parks Map of park code to { name, provider, city, country }
 */
export function buildAdminStats({ groupKey, rounds, parks, now = new Date() }) {
  return {
    groupKey,
    computedAt: now.toISOString(),
    since: rounds[0]?.startedAt ?? null,
    beforeAt: rounds.length ? roundBefore(rounds, TREND_DAYS).startedAt : null,
    rounds: rounds.map(roundSeries),
    weekends: weekendSeries(rounds),
    parks: rounds.length ? parkList(rounds, parks) : [],
  };
}
