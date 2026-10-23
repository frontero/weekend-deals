// What a price round changed compared with the round before it, for the admin page. Only weekends both rounds
// measured at a provider are compared: a round stopped halfway did not see the rest, which is no change.

// The admin page shows this many rounds; only these get a summary of what they changed.
export const SHOWN_ROUNDS = 40;
// The largest moves are kept per round; the counts cover everything.
const KEPT_CHANGES = 12;

const key = (row) => `${row.parkCode}|${row.arrival}`;
const measured = (row) => `${row.provider}|${row.arrival}`;

/**
 * @param current rows of the round: { parkCode, parkName, provider, arrival, priceCents, accommodationCode, bookingUrl }
 * @param previous rows of the round before it, in the same shape
 * @returns counts per kind of change and the largest price moves:
 *   repriced = the same accommodation got another price; swapped = another accommodation is now the cheapest;
 *   appeared = newly available; gone = no longer available
 */
export function scanChanges(current, previous) {
  const before = new Map(previous.map((row) => [key(row), row]));
  const after = new Map(current.map((row) => [key(row), row]));
  const measuredBefore = new Set(previous.map(measured));
  const both = new Set(current.map(measured).filter((weekend) => measuredBefore.has(weekend)));
  const summary = { prices: current.length, compared: 0, unchanged: 0, up: 0, down: 0, swapped: 0, appeared: 0, gone: 0 };
  const moves = [];

  for (const row of after.values()) {
    if (!both.has(measured(row))) continue;
    const old = before.get(key(row));
    if (!old) {
      summary.appeared += 1;
      continue;
    }
    summary.compared += 1;
    if (old.priceCents === row.priceCents && old.accommodationCode === row.accommodationCode) {
      summary.unchanged += 1;
      continue;
    }
    const kind = old.accommodationCode === row.accommodationCode ? 'repriced' : 'swapped';
    if (kind === 'swapped') summary.swapped += 1;
    else if (row.priceCents > old.priceCents) summary.up += 1;
    else summary.down += 1;
    if (row.priceCents !== old.priceCents) {
      // The accommodation and link of the new price: what can be booked now.
      const { parkCode, parkName, arrival, accommodationCode, bookingUrl = null } = row;
      moves.push({ parkCode, parkName, arrival, oldCents: old.priceCents, newCents: row.priceCents, kind, accommodationCode, bookingUrl });
    }
  }
  for (const row of before.values()) {
    if (both.has(measured(row)) && !after.has(key(row))) summary.gone += 1;
  }

  summary.biggest = moves
    .sort((a, b) => Math.abs(b.newCents - b.oldCents) - Math.abs(a.newCents - a.oldCents))
    .slice(0, KEPT_CHANGES);
  return summary;
}
