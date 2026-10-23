// When did prices change in data/update-timing.db (see update-timing.mjs)? Between two consecutive successful runs of
// the same search, an accommodation with another price was repriced; one that appears or disappears is availability.

const ZONE = 'Europe/Amsterdam';
// Runs further apart (the Mac slept) cannot pin a change to an hour.
const MAX_STEP_MS = 40 * 60 * 1000;
const PROVIDERS = {
  landal: 'every available accommodation of 5 parks',
  topparken: "each park's cheapest stay, so a change can be repricing or availability",
  molecaten: 'the 12 cheapest Dutch accommodations, so "out" can also mean pushed out of those 12',
};

const hourOf = (time) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', hourCycle: 'h23' }).format(time));
const formatTime = (time) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(time);
const percent = (fraction) => `${fraction > 0 ? '+' : ''}${(fraction * 100).toFixed(1)}%`;
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function getOrCreate(map, key, create) {
  if (!map.has(key)) map.set(key, create());
  return map.get(key);
}

/** One step per search between two consecutive runs where it succeeded. */
function compareRuns(searches, samples) {
  const runsBySearch = new Map();
  for (const row of searches) {
    getOrCreate(runsBySearch, `${row.provider}|${row.search}|${row.arrival}`, () => []).push(Date.parse(row.sampled_at));
  }
  const prices = new Map();
  for (const row of samples) {
    const run = getOrCreate(prices, `${row.provider}|${row.search}|${row.arrival}`, () => new Map());
    getOrCreate(run, Date.parse(row.sampled_at), () => new Map()).set(`${row.park}|${row.accommodation}`, row.price_cents);
  }

  const steps = [];
  for (const [key, runs] of runsBySearch) {
    const provider = key.split('|')[0];
    for (let index = 1; index < runs.length; index += 1) {
      const [from, to] = [runs[index - 1], runs[index]];
      const before = prices.get(key)?.get(from) ?? new Map();
      const after = prices.get(key)?.get(to) ?? new Map();
      const step = { provider, from, to, compared: 0, changes: [], appeared: 0, disappeared: 0 };
      for (const [item, price] of before) {
        if (!after.has(item)) step.disappeared += 1;
        else {
          step.compared += 1;
          if (after.get(item) !== price) step.changes.push((after.get(item) - price) / price);
        }
      }
      for (const item of after.keys()) if (!before.has(item)) step.appeared += 1;
      steps.push(step);
    }
  }
  return steps;
}

function addStep(total, step) {
  total.compared += step.compared;
  total.changes.push(...step.changes);
  total.appeared += step.appeared;
  total.disappeared += step.disappeared;
  total.from = Math.min(total.from ?? step.from, step.from);
}

const emptyTotal = () => ({ compared: 0, changes: [], appeared: 0, disappeared: 0 });

export async function buildReport(db) {
  const searches = (await db.execute('SELECT * FROM searches ORDER BY sampled_at')).rows;
  const samples = (await db.execute('SELECT * FROM samples')).rows;
  if (!searches.length) return 'No samples yet.';

  const runs = [...new Set(searches.map((row) => Date.parse(row.sampled_at)))];
  const failed = searches.filter((row) => row.error);
  const steps = compareRuns(
    searches.filter((row) => !row.error),
    samples,
  );
  const lines = [
    `Measured ${formatTime(runs[0])} → ${formatTime(runs.at(-1))} (${ZONE}): ${runs.length} runs, ` +
      `${failed.length} of ${searches.length} searches failed.`,
  ];

  const gaps = runs.slice(1).flatMap((time, index) => (time - runs[index] > MAX_STEP_MS ? [[runs[index], time]] : []));
  lines.push(
    gaps.length
      ? `Gaps (no run for more than 40 minutes): ${gaps.map(([from, to]) => `${formatTime(from)}–${formatTime(to)}`).join(', ')}`
      : 'No gaps: every half hour was measured.',
  );

  lines.push('', 'Per provider: same accommodation and weekend in two consecutive runs.');
  for (const [provider, note] of Object.entries(PROVIDERS)) {
    const total = emptyTotal();
    for (const step of steps.filter((item) => item.provider === provider)) addStep(total, step);
    const ups = total.changes.filter((change) => change > 0).length;
    lines.push(
      `  ${provider} (${note}): ${total.changes.length} price changes in ${total.compared} comparisons ` +
        `(${ups} up, ${total.changes.length - ups} down); ${total.appeared} in, ${total.disappeared} out.`,
    );
  }

  // Each half-hour step belongs to the hour around its middle; steps across a gap are listed apart.
  const byHour = Array.from({ length: 24 }, () => ({ runs: 0, providers: {} }));
  for (const time of runs) byHour[hourOf(time)].runs += 1;
  for (const step of steps.filter((item) => item.to - item.from <= MAX_STEP_MS)) {
    const providers = byHour[hourOf((step.from + step.to) / 2)].providers;
    providers[step.provider] ??= emptyTotal();
    addStep(providers[step.provider], step);
  }
  lines.push('', 'Per hour of the day: price changes/comparisons, then accommodations in/out.');
  byHour.forEach(({ runs: count, providers }, hour) => {
    const cells = Object.keys(PROVIDERS).map((provider) => {
      const total = providers[provider];
      return total
        ? `${provider} ${total.changes.length}/${total.compared} in ${total.appeared} out ${total.disappeared}`
        : `${provider} -`;
    });
    lines.push(`  ${String(hour).padStart(2, '0')}:00  ${count} runs  ${cells.join('  |  ')}`);
  });

  // The moments prices changed: a batch shows up as many changes in one step.
  const byMoment = new Map();
  for (const step of steps) addStep(getOrCreate(byMoment, `${step.provider}|${step.to}`, emptyTotal), step);
  const moments = [...byMoment]
    .filter(([, total]) => total.changes.length)
    .map(([key, total]) => ({ provider: key.split('|')[0], to: Number(key.split('|')[1]), ...total }))
    .sort((a, b) => a.to - b.to);
  lines.push('', moments.length ? 'Moments with price changes:' : 'No price changed during the measurement.');
  for (const moment of moments) {
    const ups = moment.changes.filter((change) => change > 0).length;
    lines.push(
      `  ${formatTime(moment.from)}–${formatTime(moment.to)}  ${moment.provider}: ` +
        `${moment.changes.length} of ${moment.compared} changed (${ups} up), median ${percent(median(moment.changes))}`,
    );
  }

  return lines.join('\n');
}
