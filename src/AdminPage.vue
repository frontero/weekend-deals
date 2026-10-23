<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { nextScheduledRound, ROUND_SCHEDULES } from '../shared/schedule.mjs';
import { shiftDays } from '../shared/weekends.mjs';
import Icon from './components/Icon.vue';
import { useTheme } from './composables/useTheme.js';
import { request } from './lib/api.js';
import { formatEuros, formatShortDate, formatTime, formatTimestamp, wholeEuros } from './lib/format.js';
import { bookingUrl, providerName } from './lib/providers.js';
import { formatDuration, groupRounds } from './lib/rounds.js';

const POLL_WHILE_SCANNING_MS = 5000;
const POLL_IDLE_MS = 60_000;
// Rounds collect weekends from Friday to Monday.
const WEEKEND_NIGHTS = 3;
const PHASES = {
  requested: 'Aangevraagd',
  facilities: 'Faciliteiten ophalen',
  prices: 'Prijzen ophalen',
  accommodations: 'Huisjes ophalen',
  ratings: 'Google-scores ophalen',
};
const STATES = {
  done: { label: 'Klaar', classes: 'bg-good-wash text-good-ink' },
  running: { label: 'Bezig', classes: 'bg-accent-wash text-accent' },
  interrupted: { label: 'Onderbroken', classes: 'bg-warning-wash text-warning-ink' },
  failed: { label: 'Mislukt', classes: 'bg-warning-wash text-warning-ink' },
};
const TOTALS = [
  { count: 'prices', label: 'prijzen opgehaald', heading: 'Prijzen', classes: '' },
  { count: 'down', label: 'lager', heading: 'Lager', classes: 'text-good-ink' },
  { count: 'up', label: 'hoger', heading: 'Hoger', classes: 'text-warning-ink' },
  { count: 'swapped', label: 'ander huisje goedkoopst', heading: 'Ander huisje', classes: '' },
  { count: 'appeared', label: 'weer vrij', heading: 'Weer vrij', classes: '' },
  { count: 'gone', label: 'niet meer vrij', heading: 'Niet meer vrij', classes: '' },
];

const { isDark, toggle: toggleTheme } = useTheme();
const admin = ref(null);
// loading, forbidden, failed or ready
const state = ref('loading');
// idle, sending or failed: asking the Mac to collect the sizes a round did not finish
const retryState = ref('idle');
let timer = null;

async function load() {
  clearTimeout(timer);
  try {
    const response = await fetch('/api/admin');
    if (response.status === 403) {
      state.value = 'forbidden';
      return;
    }
    if (!response.ok) throw new Error(`Admin data failed with ${response.status}`);
    admin.value = await response.json();
    state.value = 'ready';
  } catch {
    // Data loaded before stays on screen; the next poll tries again.
    if (!admin.value) state.value = 'failed';
  }
  timer = setTimeout(load, admin.value?.scan.running ? POLL_WHILE_SCANNING_MS : POLL_IDLE_MS);
}

async function retry(parties) {
  retryState.value = 'sending';
  try {
    await request('/scan', { method: 'POST', body: JSON.stringify({ parties }) });
    retryState.value = 'idle';
    await load();
  } catch {
    retryState.value = 'failed';
  }
}

onMounted(() => {
  document.title = 'Beheer – Weekendje weg';
  load();
});
onUnmounted(() => clearTimeout(timer));

const count = (value) => value.toLocaleString('nl-NL');
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

/**
 * The sizes the newest round did not finish, to collect again. While a request waits for the Mac, the round says so
 * instead; while a round runs, it shows as a round of its own.
 */
function retryOf(round, index) {
  const { scan } = admin.value;
  if (index > 0 || !['interrupted', 'failed'].includes(round.state)) return null;
  if (scan.phase === 'requested') {
    return { waiting: `Opnieuw opgevraagd om ${formatTime(scan.startedAt)}. Je Mac begint bij zijn volgende controle.` };
  }
  if (scan.running) return null;
  const unfinished = round.scans.filter((item) => item.state === 'interrupted' || item.state === 'failed');
  const sizes = [...new Set(unfinished.map((item) => item.size))];
  return { parties: [...new Set(unfinished.map((item) => item.groupKey))], label: `${sizes.join(', ')} opnieuw ophalen` };
}

const rounds = computed(() => {
  if (!admin.value) return [];
  const { scan, history, parks } = admin.value;
  // Where to book the new price for that weekend and party size, as the list's cards link to it.
  const parkUrl = ({ parkCode, arrival, accommodationCode, bookingUrl: directUrl, party }) => {
    if (!parks[parkCode]) return null;
    const weekend = { arrival, departure: shiftDays(arrival, WEEKEND_NIGHTS), accommodationCode, bookingUrl: directUrl };
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
        value: scan.phase === 'prices' ? `${PHASES.prices} · ${percent}%` : PHASES[scan.phase] ?? 'Bezig',
        detail: scan.phase === 'requested' ? 'Wacht tot je Mac het oppakt' : `Gestart ${formatTimestamp(scan.startedAt)}`,
      }
    : { value: 'Geen ronde bezig', detail: scan.error ? `Laatste ronde: ${scan.error}` : 'Alles is opgehaald' };
  const next = nextScheduledRound(schedule);
  const last = rounds.value.find((round) => round.state !== 'running');
  return [
    { label: 'Nu', ...now },
    {
      label: 'Volgende ronde',
      value: next ? formatTimestamp(next) : 'Alleen met de knop',
      detail: next ? `Als je Mac aanstaat · ${ROUND_SCHEDULES[schedule]?.label}` : 'Rondes draaien niet vanzelf',
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
</script>

<template>
  <header class="border-b border-line bg-surface">
    <div class="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
      <a href="/" class="flex items-center gap-2 font-semibold tracking-tight whitespace-nowrap">
        <span class="grid size-8 place-items-center rounded-lg bg-accent text-on-accent">
          <Icon name="home" class="size-5" />
        </span>
        Weekendje weg
      </a>
      <div class="ml-auto flex items-center gap-2 text-sm">
        <a href="/" class="rounded-lg px-3 py-2 font-medium whitespace-nowrap text-accent hover:bg-hover">
          Terug<span class="max-sm:sr-only"> naar de buitenkansjes</span>
        </a>
        <button
          type="button"
          class="grid size-9 place-items-center rounded-full ring-1 ring-line transition hover:bg-hover"
          title="Donkere weergave"
          aria-label="Donkere weergave"
          :aria-pressed="isDark"
          @click="toggleTheme"
        >
          <Icon :name="isDark ? 'sun' : 'moon'" class="size-4" />
        </button>
      </div>
    </div>
  </header>

  <main class="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">Beheer</h1>
      <p class="mt-1 text-sm text-ink-secondary sm:text-base">
        Wanneer de prijzen zijn opgehaald, en wat er veranderde sinds de ronde ervoor.
      </p>
    </div>

    <p v-if="state === 'loading'" class="text-ink-secondary" role="status">Laden…</p>
    <p
      v-else-if="state === 'forbidden'"
      class="flex items-start gap-2 rounded-xl bg-warning-wash px-4 py-3 text-sm text-warning-ink"
      role="status"
    >
      <Icon name="warning" class="mt-px size-4" />
      Deze pagina is alleen voor beheerders.
    </p>
    <p
      v-else-if="state === 'failed'"
      class="flex items-start gap-2 rounded-xl bg-warning-wash px-4 py-3 text-sm text-warning-ink"
      role="status"
    >
      <Icon name="warning" class="mt-px size-4" />
      De gegevens konden niet worden geladen. De pagina probeert het over een minuut opnieuw.
    </p>

    <template v-else>
      <section aria-labelledby="now-title" class="flex flex-col gap-3">
        <h2 id="now-title" class="sr-only">Stand van zaken</h2>
        <dl class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div v-for="card in cards" :key="card.label" class="flex flex-col rounded-2xl bg-surface p-4 ring-1 ring-line">
            <dt class="text-sm text-ink-secondary">{{ card.label }}</dt>
            <dd class="mt-1 text-lg font-semibold">{{ card.value }}</dd>
            <dd class="mt-0.5 text-sm text-ink-secondary">{{ card.detail }}</dd>
          </div>
        </dl>
        <p
          v-for="warning in warnings"
          :key="warning"
          class="flex items-start gap-2 rounded-xl bg-warning-wash px-4 py-3 text-sm text-warning-ink"
          role="status"
        >
          <Icon name="warning" class="mt-px size-4" />
          {{ warning }}
        </p>
      </section>

      <section aria-labelledby="rounds-title" class="flex flex-col gap-3">
        <div>
          <h2 id="rounds-title" class="text-xl font-semibold">Prijsrondes</h2>
          <p class="mt-1 max-w-3xl text-sm text-ink-secondary">
            Een ronde haalt de prijzen voor alle groepsgroottes na elkaar op. Lager en hoger: hetzelfde huisje kreeg een
            andere prijs. Ander huisje: een ander huisje is nu het goedkoopst van het park. De aantallen tellen alle
            groepsgroottes bij elkaar op.
          </p>
        </div>
        <p v-if="!rounds.length" class="text-ink-secondary">Er is nog geen ronde gedraaid.</p>
        <ol v-else class="flex flex-col gap-3">
          <li v-for="round in rounds" :key="round.id">
            <article class="rounded-2xl bg-surface ring-1 ring-line" :aria-labelledby="`round-${round.id}`">
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-4">
                <h3 :id="`round-${round.id}`" class="font-semibold">{{ round.title }}</h3>
                <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="round.badge.classes">
                  {{ round.badge.label }}
                </span>
                <span class="text-sm text-ink-secondary">{{ round.meta }}</span>
                <button
                  v-if="round.retry?.parties"
                  type="button"
                  class="inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-sm font-medium ring-1 ring-line hover:ring-field disabled:opacity-60 sm:ml-auto"
                  :disabled="retryState === 'sending'"
                  @click="retry(round.retry.parties)"
                >
                  <Icon name="refresh" class="size-4" :class="retryState === 'sending' ? 'animate-spin' : ''" />
                  {{ round.retry.label }}
                </button>
              </div>
              <p v-if="round.retry?.parties && retryState === 'failed'" class="px-4 pt-2 text-sm text-warning-ink" role="status">
                Het verzoek lukte niet. Probeer het nog eens.
              </p>
              <p v-if="round.retry?.waiting" class="flex items-start gap-2 px-4 pt-2 text-sm text-accent" role="status">
                <Icon name="clock" class="mt-px size-4" />
                {{ round.retry.waiting }}
              </p>
              <ul v-if="round.totals" class="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-2 text-sm">
                <li v-for="total in round.totals" :key="total.count" :class="total.classes">
                  <span class="font-semibold">{{ total.value }}</span> {{ total.label }}
                </li>
              </ul>
              <p v-if="round.note" class="px-4 pt-2 text-sm text-ink-secondary">{{ round.note }}</p>

              <details class="group mt-3 border-t border-line">
                <summary
                  class="flex items-center gap-2 rounded-b-2xl px-4 py-3 text-sm font-medium text-accent hover:bg-hover group-open:rounded-none"
                >
                  <Icon name="plus" class="size-4 group-open:hidden" />
                  <Icon name="minus" class="hidden size-4 group-open:block" />
                  Per groepsgrootte{{ round.moves.length ? ' en grootste wijzigingen' : '' }}
                </summary>
                <div class="flex flex-col gap-4 px-4 pb-4">
                  <div class="overflow-x-auto">
                    <table class="w-full min-w-[36rem] text-left text-sm">
                      <caption class="sr-only">
                        Per groepsgrootte
                      </caption>
                      <thead class="text-ink-secondary">
                        <tr class="border-b border-line">
                          <th scope="col" class="py-2 pr-3 font-medium">Grootte</th>
                          <th scope="col" class="py-2 pr-3 font-medium">Status</th>
                          <th v-for="total in TOTALS" :key="total.count" scope="col" class="py-2 pr-3 text-right font-medium">
                            {{ total.heading }}
                          </th>
                        </tr>
                      </thead>
                      <tbody class="tabular-nums">
                        <tr v-for="size in round.sizes" :key="size.id" class="border-b border-line last:border-0">
                          <th scope="row" class="py-2 pr-3 font-medium whitespace-nowrap">{{ size.size }}</th>
                          <td class="py-2 pr-3 whitespace-nowrap" :title="size.error ?? undefined">{{ size.state }}</td>
                          <td v-for="(cell, index) in size.cells" :key="index" class="py-2 pr-3 text-right">{{ cell }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div v-if="round.moves.length">
                    <h4 class="text-sm font-semibold">Grootste prijswijzigingen</h4>
                    <ul class="mt-2 divide-y divide-line text-sm">
                      <li
                        v-for="move in round.moves"
                        :key="move.key"
                        class="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:gap-3"
                      >
                        <span class="min-w-0 flex-1">
                          <a
                            v-if="move.url"
                            :href="move.url"
                            target="_blank"
                            rel="noopener"
                            class="inline-flex items-center gap-1 rounded font-medium text-accent hover:underline"
                            :title="`Bekijk op ${move.provider}`"
                          >
                            {{ move.park }}
                            <Icon name="external" class="size-3.5" />
                            <span class="sr-only">(op {{ move.provider }}, opent in een nieuw tabblad)</span>
                          </a>
                          <span v-else class="font-medium">{{ move.park }}</span>
                          <span class="block text-ink-secondary">{{ move.detail }}</span>
                        </span>
                        <span class="tabular-nums whitespace-nowrap">
                          <span class="text-ink-secondary">{{ move.before }} →</span> {{ move.after }}
                          <span class="ml-1 font-semibold" :class="move.classes">{{ move.difference }}</span>
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </details>
            </article>
          </li>
        </ol>
      </section>
    </template>
  </main>
</template>
