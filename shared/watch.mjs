// The price watch: the same few searches every half hour, to learn when providers change their prices and whether
// that follows a pattern or happens at random. These pure functions compare two runs and analyse the changes.

const ZONE = 'Europe/Amsterdam';
// Runs further apart (no run for a while) cannot pin a change to an hour.
const MAX_STEP_MS = 40 * 60 * 1000;
// A run in which at least this share of a provider's prices changed is a batch update.
const BATCH_SHARE = 0.05;
// Below this many changes, or days measured, nothing can be said about a pattern yet.
const MIN_CHANGES = 10;
const MIN_DAYS = 2;
const RECENT_CHANGES = 100;
// Where the analysis is stored, next to the admin charts of each party size.
export const WATCH_STATS_KEY = 'watch';

const blank = () => ({ searches: 0, failed: 0, compared: 0, up: 0, down: 0, in: 0, out: 0 });

/** "provider|search|arrival|park|accommodation" → its parts; park codes and accommodations never hold a "|". */
export function parseWatchKey(key) {
  const [provider, search, arrival, park, accommodation] = key.split('|');
  return { provider, search, arrival, park, accommodation, searchKey: `${provider}|${search}|${arrival}` };
}

/**
 * What changed between two runs, counted only for searches that succeeded in both: another price for the same
 * accommodation is a price change; one that appears or disappears is availability.
 * @param previous { searches: [{ key, provider, ok }], prices: { key: cents } } or null for the first run
 * @param current the same shape
 * @returns { summary: { provider: counts }, changes: [{ provider, park, accommodation, arrival, oldCents, newCents }] }
 */
export function compareWatch(previous, current) {
  const summary = {};
  const counts = (provider) => (summary[provider] ??= blank());
  for (const search of current.searches) {
    counts(search.provider).searches += 1;
    if (!search.ok) counts(search.provider).failed += 1;
  }
  const succeededBefore = new Set((previous?.searches ?? []).filter((search) => search.ok).map((search) => search.key));
  const both = new Set(current.searches.filter((search) => search.ok && succeededBefore.has(search.key)).map((search) => search.key));
  const before = previous?.prices ?? {};
  const changes = [];

  for (const [key, cents] of Object.entries(current.prices)) {
    const { provider, park, accommodation, arrival, searchKey } = parseWatchKey(key);
    if (!both.has(searchKey)) continue;
    if (!(key in before)) {
      counts(provider).in += 1;
      continue;
    }
    counts(provider).compared += 1;
    if (before[key] !== cents) {
      counts(provider)[cents > before[key] ? 'up' : 'down'] += 1;
      changes.push({ provider, park, accommodation, arrival, oldCents: before[key], newCents: cents });
    }
  }
  for (const key of Object.keys(before)) {
    const { provider, searchKey } = parseWatchKey(key);
    if (both.has(searchKey) && !(key in current.prices)) counts(provider).out += 1;
  }
  return { summary, changes };
}

/**
 * The prices the next run compares with: this run's, plus the last known prices of searches that failed this time,
 * so a change during a failed run is still seen (one run later).
 */
export function nextSnapshot(previous, current) {
  const failed = new Set(current.searches.filter((search) => !search.ok).map((search) => search.key));
  const carried = (previous?.searches ?? []).filter((search) => search.ok && failed.has(search.key));
  if (!carried.length) return current;
  const keys = new Set(carried.map((search) => search.key));
  const prices = { ...current.prices };
  for (const [key, cents] of Object.entries(previous.prices)) {
    if (keys.has(parseWatchKey(key).searchKey)) prices[key] = cents;
  }
  return { searches: [...current.searches.filter((search) => !keys.has(search.key)), ...carried], prices };
}

const localParts = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, weekday: 'short', hour: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', minute: '2-digit' });
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Weekday (0 = Monday), hour, minute and date of a moment, in Dutch time. */
export function dutchTime(iso) {
  const parts = Object.fromEntries(localParts.formatToParts(new Date(iso)).map(({ type, value }) => [type, value]));
  return {
    weekday: WEEKDAYS.indexOf(parts.weekday),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** The regularised upper incomplete gamma function Q(a, x), for chi-square p-values. */
function gammaQ(a, x) {
  if (x <= 0) return 1;
  const logGammaA = logGamma(a);
  if (x < a + 1) {
    // Series for P(a, x).
    let term = 1 / a;
    let sum = term;
    for (let n = 1; n < 500; n += 1) {
      term *= x / (a + n);
      sum += term;
      if (term < sum * 1e-12) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - logGammaA);
  }
  // Continued fraction for Q(a, x).
  let b = x + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let n = 1; n < 500; n += 1) {
    const an = -n * (n - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const step = d * c;
    h *= step;
    if (Math.abs(step - 1) < 1e-12) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGammaA) * h;
}

function logGamma(z) {
  // Lanczos approximation.
  const g = 7;
  const coefficients = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  const shifted = z - 1;
  let sum = coefficients[0];
  for (let index = 1; index < g + 2; index += 1) sum += coefficients[index] / (shifted + index);
  const t = shifted + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(sum);
}

/**
 * Would changes spread over the bins like this by chance? Each bin's expected share follows how many prices were
 * compared in it, so hours that were measured more count more.
 * @param bins [{ compared, changed }]
 * @returns the chance of a spread at least this uneven if changes fell at random, or null without enough data
 */
export function chanceOfRandom(bins) {
  const measured = bins.filter((bin) => bin.compared > 0);
  const changed = measured.reduce((sum, bin) => sum + bin.changed, 0);
  const compared = measured.reduce((sum, bin) => sum + bin.compared, 0);
  if (measured.length < 2 || changed === 0) return null;
  const chiSquare = measured.reduce((sum, bin) => {
    const expected = (changed * bin.compared) / compared;
    return sum + (bin.changed - expected) ** 2 / expected;
  }, 0);
  return gammaQ((measured.length - 1) / 2, chiSquare / 2);
}

/** The fewest hours that together hold `share` of the changes, busiest first. */
function busiestHours(hours, share = 0.8) {
  const total = hours.reduce((sum, hour) => sum + hour.changed, 0);
  const picked = [];
  let covered = 0;
  for (const hour of [...hours].sort((a, b) => b.changed - a.changed)) {
    if (covered >= total * share || hour.changed === 0) break;
    picked.push(hour.hour);
    covered += hour.changed;
  }
  return { hours: picked.sort((a, b) => a - b), share: total ? covered / total : 0 };
}

/**
 * Per provider: when its prices changed, by hour of the day and weekday, whether that is a pattern, and the timeline.
 * @param runs [{ at, summary }] oldest first; changes [{ at, provider, park, accommodation, arrival, oldCents, newCents }]
 * @param parks Map of park code to name, for the list of recent changes
 */
export function buildWatchStats({ runs, changes, parks = new Map(), now = new Date() }) {
  const providers = [...new Set(runs.flatMap((run) => Object.keys(run.summary)))];
  const steps = runs.map((run, index) => {
    const from = index > 0 ? runs[index - 1].at : null;
    // The changes of a run happened since the run before it, so they count at the middle of that half hour; after a
    // gap the moment is unknown.
    const timed = from !== null && Date.parse(run.at) - Date.parse(from) <= MAX_STEP_MS;
    const middle = timed ? new Date((Date.parse(from) + Date.parse(run.at)) / 2).toISOString() : run.at;
    return { ...run, from, timed, time: dutchTime(middle) };
  });
  const days = new Set(steps.map((step) => step.time.date)).size;
  const coverage = Array.from({ length: 24 }, (_, hour) => steps.filter((step) => step.timed && step.time.hour === hour).length);

  const perProvider = Object.fromEntries(
    providers.map((provider) => {
      const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, runs: 0, compared: 0, changed: 0, up: 0, down: 0 }));
      const weekdays = Array.from({ length: 7 }, (_, weekday) => ({ weekday, compared: 0, changed: 0 }));
      const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ compared: 0, changed: 0 })));
      const timeline = [];
      const totals = { ...blank(), changed: 0, batchChanged: 0, untimed: 0 };
      for (const step of steps) {
        const counts = step.summary[provider];
        if (!counts) continue;
        const changed = counts.up + counts.down;
        for (const field of Object.keys(blank())) totals[field] += counts[field];
        totals.changed += changed;
        if (counts.compared && changed / counts.compared >= BATCH_SHARE) totals.batchChanged += changed;
        if (changed) timeline.push({ from: step.from, at: step.at, changed, compared: counts.compared, timed: step.timed, hour: step.time.hour, minute: step.time.minute, date: step.time.date });
        if (!step.timed) {
          totals.untimed += changed;
          continue;
        }
        const { hour, weekday } = step.time;
        Object.assign(hours[hour], {
          runs: hours[hour].runs + 1,
          compared: hours[hour].compared + counts.compared,
          changed: hours[hour].changed + changed,
          up: hours[hour].up + counts.up,
          down: hours[hour].down + counts.down,
        });
        weekdays[weekday].compared += counts.compared;
        weekdays[weekday].changed += changed;
        grid[weekday][hour].compared += counts.compared;
        grid[weekday][hour].changed += changed;
      }
      const timedChanges = totals.changed - totals.untimed;
      const enough = timedChanges >= MIN_CHANGES && days >= MIN_DAYS;
      // On how many days the biggest update came in the same hour.
      const byDay = new Map();
      for (const { date, hour, changed, timed } of timeline) {
        if (timed && (!byDay.has(date) || byDay.get(date).changed < changed)) byDay.set(date, { hour, changed });
      }
      const hourCounts = new Map();
      for (const { hour } of byDay.values()) hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
      const [usualHour, usualDays] = [...hourCounts].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
      return [
        provider,
        {
          totals,
          hours,
          weekdays,
          grid,
          timeline,
          enough,
          chanceByHour: enough ? chanceOfRandom(hours) : null,
          chanceByWeekday: enough ? chanceOfRandom(weekdays) : null,
          busiest: busiestHours(hours),
          batchShare: totals.changed ? totals.batchChanged / totals.changed : 0,
          usual: { hour: usualHour, days: usualDays, of: byDay.size },
        },
      ];
    }),
  );

  return {
    computedAt: now.toISOString(),
    since: runs[0]?.at ?? null,
    last: runs.at(-1)?.at ?? null,
    runs: runs.length,
    days,
    coverage,
    gaps: steps.flatMap((step, index) => (index > 0 && !step.timed ? [{ from: runs[index - 1].at, to: step.at }] : [])),
    providers: perProvider,
    recent: changes
      .slice(-RECENT_CHANGES)
      .reverse()
      .map((change) => ({ ...change, parkName: parks.get(change.park) ?? change.park })),
  };
}
