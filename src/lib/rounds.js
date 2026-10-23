import { parseGroupKey } from '../../shared/party.mjs';

// The scans of one round follow each other directly; a longer pause means a new round.
const ROUND_GAP_MS = 15 * 60 * 1000;
const KEPT_CHANGES = 10;
const COUNTS = ['prices', 'up', 'down', 'swapped', 'appeared', 'gone'];

/** "2 personen", or "4 volw. + 2 kind." for the parties with children that were collected before. */
export function sizeLabel(groupKey) {
  const { adults, children } = parseGroupKey(groupKey);
  return children ? `${adults} volw. + ${children} kind.` : `${adults} personen`;
}

/**
 * A scan is done, failed, still running (the newest one, while a round runs), or interrupted: never finished,
 * because its process stopped.
 */
function scanState(scan, { newest, running }) {
  if (scan.error) return 'failed';
  if (scan.finishedAt) return 'done';
  return newest && running ? 'running' : 'interrupted';
}

const roundState = (states) =>
  ['running', 'failed', 'interrupted'].find((state) => states.includes(state)) ?? 'done';

/**
 * The admin page's rounds, newest first: the scans of all party sizes that ran one after another, with what they
 * changed together. Totals add up the sizes, so a park that got cheaper for two sizes counts twice.
 * @param history scans, newest first: { id, groupKey, startedAt, finishedAt, error, changes }
 * @param running whether a round is running right now
 */
export function groupRounds(history, { running = false } = {}) {
  const rounds = [];
  for (const scan of [...history].reverse()) {
    const previous = rounds.at(-1)?.scans.at(-1);
    const previousEnd = previous && Date.parse(previous.finishedAt ?? previous.startedAt);
    if (!previous || Date.parse(scan.startedAt) - previousEnd > ROUND_GAP_MS) rounds.push({ scans: [] });
    rounds.at(-1).scans.push({
      ...scan,
      size: sizeLabel(scan.groupKey),
      state: scanState(scan, { newest: scan.id === history[0]?.id, running }),
    });
  }

  return rounds.reverse().map(({ scans }) => {
    const states = scans.map((scan) => scan.state);
    const measured = scans.filter((scan) => scan.changes);
    const totals = Object.fromEntries(
      COUNTS.map((count) => [count, measured.reduce((sum, scan) => sum + (scan.changes[count] ?? 0), 0)]),
    );
    const biggest = measured
      .flatMap((scan) =>
        (scan.changes.biggest ?? []).map((move) => ({ ...move, size: scan.size, party: parseGroupKey(scan.groupKey) })),
      )
      .sort((a, b) => Math.abs(b.newCents - b.oldCents) - Math.abs(a.newCents - a.oldCents))
      .slice(0, KEPT_CHANGES);
    const last = scans.at(-1);
    return {
      id: scans[0].id,
      startedAt: scans[0].startedAt,
      finishedAt: states.every((state) => state === 'done') ? last.finishedAt : null,
      state: roundState(states),
      scans,
      totals: measured.length ? totals : null,
      compared: measured.some((scan) => scan.changes.compared > 0),
      biggest,
    };
  });
}

/** "42 min", "1 u 5 min" */
export function formatDuration(fromIso, toIso) {
  const minutes = Math.max(1, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} u ${minutes % 60} min`;
}
