// A park needs this many weekends of data before its "normal" price means anything.
const MIN_WEEKENDS_FOR_BASELINE = 4;

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

const byArrival = (a, b) => a.arrival.localeCompare(b.arrival);

/**
 * @param rows one row per park and weekend: the latest price plus its history
 *   (typicalCents, highestCents) and the scan it was last seen in.
 * @param today ISO date; earlier weekends only feed the baseline.
 */
export function analysePrices(rows, today) {
  // A park missing from its provider's newest scan of a weekend is sold out for that weekend.
  // Per provider, so one provider failing in a scan does not hide the others' parks.
  const scanKey = (row) => `${row.provider ?? ''}|${row.arrival}`;
  const lastScanByArrival = new Map();
  for (const row of rows) {
    lastScanByArrival.set(scanKey(row), Math.max(lastScanByArrival.get(scanKey(row)) ?? 0, row.scanId));
  }

  const parks = [...groupBy(rows, (row) => row.parkCode)].map(([code, weekends]) => {
    const baselineCents =
      weekends.length >= MIN_WEEKENDS_FOR_BASELINE ? median(weekends.map((row) => row.typicalCents)) : null;

    return {
      code,
      baselineCents,
      weekends: weekends
        .filter((row) => row.arrival >= today && row.scanId === lastScanByArrival.get(scanKey(row)))
        .sort(byArrival)
        .map((row) => ({
          arrival: row.arrival,
          departure: row.departure,
          priceCents: row.priceCents,
          typicalCents: row.typicalCents,
          highestCents: row.highestCents,
          lowestCents: row.lowestCents ?? row.priceCents,
          observedAt: row.observedAt ?? null,
          firstObservedAt: row.firstObservedAt ?? null,
          referenceCents: row.referenceCents ?? null,
          referenceAt: row.referenceAt ?? null,
          accommodationCode: row.accommodationCode,
          bookingUrl: row.bookingUrl ?? null,
          observations: row.observations,
          discount: baselineCents ? Math.round((1 - row.priceCents / baselineCents) * 1000) / 1000 : null,
        })),
    };
  });

  return { parks, market: marketByWeekend(parks) };
}

export function marketByWeekend(parks) {
  return [...groupBy(parks.flatMap((park) => park.weekends), (weekend) => weekend.arrival).values()]
    .map((weekends) => ({
      arrival: weekends[0].arrival,
      departure: weekends[0].departure,
      medianCents: median(weekends.map((weekend) => weekend.priceCents)),
      parkCount: weekends.length,
    }))
    .sort(byArrival);
}
