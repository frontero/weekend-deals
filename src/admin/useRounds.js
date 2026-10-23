import { computed, ref } from 'vue';
import { nextScheduledRound, ROUND_SCHEDULES } from '../../shared/schedule.mjs';
import { shiftDays } from '../../shared/weekends.mjs';
import { request } from '../lib/api.js';
import { formatEuros, formatShortDate, formatTime, formatTimestamp, wholeEuros } from '../lib/format.js';
import { bookingUrl, providerName } from '../lib/providers.js';
import { formatDuration, groupRounds } from '../lib/rounds.js';
import { useAdmin } from './useAdmin.js';

// The price rounds as the admin pages show them: grouped into rounds over all sizes, with what they changed, the
// status cards and a way to collect again what a stopped round did not finish.

// Rounds collect weekends from Friday to Monday.
const WEEKEND_NIGHTS = 3;
const PHASES = {
  requested: 'Aangevraagd',
  facilities: 'Faciliteiten ophalen',
  prices: 'Prijzen ophalen',
  accommodations: 'Huisjes ophalen',
  ratings: 'Google-scores ophalen',
};
export const STATES = {
  done: { label: 'Klaar', classes: 'bg-good-wash text-good-ink' },
  running: { label: 'Bezig', classes: 'bg-accent-wash text-accent' },
  interrupted: { label: 'Onderbroken', classes: 'bg-warning-wash text-warning-ink' },
  failed: { label: 'Mislukt', classes: 'bg-warning-wash text-warning-ink' },
};
export const TOTALS = [
  { count: 'prices', label: 'prijzen opgehaald', heading: 'Prijzen', classes: '' },
  { count: 'down', label: 'lager', heading: 'Lager', classes: 'text-good-ink' },
  { count: 'up', label: 'hoger', heading: 'Hoger', classes: 'text-warning-ink' },
  { count: 'swapped', label: 'ander huisje goedkoopst', heading: 'Ander huisje', classes: '' },
  { count: 'appeared', label: 'weer vrij', heading: 'Weer vrij', classes: '' },
  { count: 'gone', label: 'niet meer vrij', heading: 'Niet meer vrij', classes: '' },
];

// idle, sending or failed: asking the Mac to collect the sizes a round did not finish
const retryState = ref('idle');

export const count = (value) => value.toLocaleString('nl-NL');
// The difference between the two amounts as shown, so the sum on screen adds up.
function formatChange(oldCents, newCents) {
  const euros = wholeEuros(newCents) - wholeEuros(oldCents);
  return `${euros > 0 ? '+' : '−'}${formatEuros(Math.abs(euros) * 100)}`;
}

function roundNote(round) {
  if (!round.totals) return 'Wat deze ronde veranderde, is pas bekend als ze klaar is.';
  // The first round of a size has nothing to compare with.
  return round.compared ? null : 'Eerste ronde voor deze groepsgrootte: nog niets om mee te vergelijken.';
}

export function useRounds() {
  const { admin, reload } = useAdmin();

  async function retry(parties) {
    retryState.value = 'sending';
    try {
      await request('/scan', { method: 'POST', body: JSON.stringify({ parties }) });
      retryState.value = 'idle';
      await reload();
    } catch {
      retryState.value = 'failed';
    }
  }

  /**
   * The sizes the newest round did not finish, to collect again. While a request waits for the Mac, the round says so
   * instead; while a round runs, it shows as a round of its own.
   */
  function retryOf(round, index) {
    const { scan } = admin.value;
    if (index > 0 || !['interrupted', 'failed'].includes(round.state)) return null;
    if (scan.phase === 'requested') {
      return {
        waiting: `Opnieuw opgevraagd om ${formatTime(scan.startedAt)}. De volgende controle begint ermee.`,
      };
    }
    if (scan.running) return null;
    const unfinished = round.scans.filter((item) => item.state === 'interrupted' || item.state === 'failed');
    const sizes = [...new Set(unfinished.map((item) => item.size))];
    return {
      parties: [...new Set(unfinished.map((item) => item.groupKey))],
      label: `${sizes.join(', ')} nu opnieuw ophalen`,
      // The collector tries failed sizes again on its own (server/collector.mjs).
      note: 'Gaat binnen een half uur vanzelf opnieuw, hooguit drie keer per geplande ronde.',
    };
  }

  const rounds = computed(() => {
    if (!admin.value) return [];
    const { scan, history, parks } = admin.value;
    // Where to book the new price for that weekend and party size, as the list's cards link to it.
    const parkUrl = ({ parkCode, arrival, accommodationCode, bookingUrl: directUrl, party }) => {
      if (!parks[parkCode]) return null;
      const weekend = {
        arrival,
        departure: shiftDays(arrival, WEEKEND_NIGHTS),
        accommodationCode,
        bookingUrl: directUrl,
      };
      return bookingUrl(parks[parkCode], weekend, party);
    };
    // Asked for but not picked up yet: an unfinished scan is then left over from a stopped process.
    const running = scan.running && scan.phase !== 'requested';
    return groupRounds(history, { running }).map((round, index) => ({
      ...round,
      retry: retryOf(round, index),
      title: formatTimestamp(round.startedAt),
      badge: STATES[round.state],
      meta: [
        round.finishedAt ? `duurde ${formatDuration(round.startedAt, round.finishedAt)}` : null,
        round.scans.length === 1 ? round.scans[0].size : `${round.scans.length} groepsgroottes`,
      ]
        .filter(Boolean)
        .join(' · '),
      totals: round.totals && TOTALS.map((total) => ({ ...total, value: count(round.totals[total.count]) })),
      note: roundNote(round),
      sizes: round.scans.map((scan) => ({
        id: scan.id,
        size: scan.size,
        state: STATES[scan.state].label,
        error: scan.error,
        cells: TOTALS.map((total) => (scan.changes ? count(scan.changes[total.count] ?? 0) : '–')),
      })),
      moves: round.biggest.map((move) => ({
        key: `${move.parkCode}|${move.arrival}|${move.size}`,
        parkCode: move.parkCode,
        size: move.size,
        park: move.parkName,
        url: parkUrl(move),
        provider: providerName(parks[move.parkCode]?.provider),
        detail: [`weekend ${formatShortDate(move.arrival)}`, move.size, move.kind === 'swapped' ? 'ander huisje' : null]
          .filter(Boolean)
          .join(' · '),
        before: formatEuros(move.oldCents),
        after: formatEuros(move.newCents),
        difference: formatChange(move.oldCents, move.newCents),
        classes: move.newCents < move.oldCents ? 'text-good-ink' : 'text-warning-ink',
      })),
    }));
  });

  const cards = computed(() => {
    if (!admin.value) return [];
    const { scan, google, rounds: schedule } = admin.value;
    const percent = scan.total ? Math.round((scan.done / scan.total) * 100) : 0;
    const now = scan.running
      ? {
          value: scan.phase === 'prices' ? `${PHASES.prices} · ${percent}%` : (PHASES[scan.phase] ?? 'Bezig'),
          detail:
            scan.phase === 'requested' ? 'Wacht tot je Mac het oppakt' : `Gestart ${formatTimestamp(scan.startedAt)}`,
        }
      : { value: 'Geen ronde bezig', detail: scan.error ? `Laatste ronde: ${scan.error}` : 'Alles is opgehaald' };
    const next = nextScheduledRound(schedule);
    const last = rounds.value.find((round) => round.state !== 'running');
    return [
      { label: 'Nu', ...now },
      {
        label: 'Volgende ronde',
        value: next ? formatTimestamp(next) : 'Alleen met de knop',
        detail: next ? ROUND_SCHEDULES[schedule]?.label : 'Rondes draaien niet vanzelf',
      },
      {
        label: 'Laatste ronde',
        value: last ? last.title : 'Nog geen',
        detail: last ? [last.badge.label, last.meta].join(' · ') : '',
      },
      {
        label: 'Google-scores deze maand',
        value: `${count(google.used)} van ${count(google.budget)}`,
        detail: google.error ? `Mislukt: ${google.error}` : 'opzoekingen, binnen het gratis aantal',
      },
    ];
  });

  const warnings = computed(() =>
    Object.entries(admin.value?.providerErrors ?? {}).map(
      ([provider, error]) => `${providerName(provider)} lukte niet in de laatste ronde: ${error}`,
    ),
  );

  return { rounds, cards, warnings, retry, retryState };
}
