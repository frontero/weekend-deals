// Price levels of one round, for the admin page's charts: overall, per weekend and per park. Computed once per
// round and kept, so the charts never read the prices themselves. Amounts are in cents.

/** The value at quantile `q` (0..1) of ascending numbers, interpolated between neighbours. */
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * q;
  const below = Math.floor(position);
  const above = Math.ceil(position);
  return Math.round(sorted[below] + (sorted[above] - sorted[below]) * (position - below));
}

const ascending = (values) => [...values].sort((a, b) => a - b);

/** [count, min, p25, median, p75] of a set of prices. */
export function spread(prices) {
  const sorted = ascending(prices);
  return [sorted.length, sorted[0] ?? null, quantile(sorted, 0.25), quantile(sorted, 0.5), quantile(sorted, 0.75)];
}

const pricesBy = (rows, key) => {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row[key])) groups.set(row[key], []);
    groups.get(row[key]).push(row.priceCents);
  }
  return groups;
};

/**
 * @param rows the round's prices: { parkCode, provider, arrival, priceCents }
 * @returns { all: spread, weekends: { arrival: spread }, parks: { parkCode: [weekends, min, median] },
 *   providers: { provider: count } }
 */
export function scanStats(rows) {
  const weekends = Object.fromEntries([...pricesBy(rows, 'arrival')].map(([arrival, prices]) => [arrival, spread(prices)]));
  const parks = Object.fromEntries(
    [...pricesBy(rows, 'parkCode')].map(([code, prices]) => {
      const [count, min, , median] = spread(prices);
      return [code, [count, min, median]];
    }),
  );
  const providers = {};
  for (const row of rows) providers[row.provider] = (providers[row.provider] ?? 0) + 1;
  return { all: spread(rows.map((row) => row.priceCents)), weekends, parks, providers };
}
