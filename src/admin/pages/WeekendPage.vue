<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { localToday, shiftDays } from '../../../shared/weekends.mjs';
import { formatEuros, formatTimestamp, formatWeekend } from '../../lib/format.js';
import { providerName } from '../../lib/providers.js';
import ChartCard from '../components/ChartCard.vue';
import EChart from '../components/EChart.vue';
import StatTile from '../components/StatTile.vue';
import { lastDays, percentChange } from '../lib/analysis.js';
import { bandChart, columns, countLabel, euros, lines } from '../lib/chart-options.js';
import { usePalette } from '../lib/palette.js';
import { useAdmin } from '../useAdmin.js';
import { count } from '../useRounds.js';

// Rounds collect weekends from Friday to Monday.
const WEEKEND_NIGHTS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
// The price histogram aims at about this many bars.
const HISTOGRAM_BARS = 12;

const route = useRoute();
const { size, sizeLabel, stats, statsState, range } = useAdmin();
const palette = usePalette();

const arrival = computed(() => String(route.params.arrival ?? ''));
const weekend = computed(() => ({ arrival: arrival.value, departure: shiftDays(arrival.value, WEEKEND_NIGHTS) }));
const title = computed(() => formatWeekend(weekend.value));
watch(title, (value) => (document.title = `${value} – Beheer – Weekendje weg`), { immediate: true });

const daysAway = computed(() => Math.round((Date.parse(`${arrival.value}T00:00:00`) - Date.parse(`${localToday()}T00:00:00`)) / DAY_MS));
const when = computed(() => {
  if (daysAway.value > 1) return `over ${daysAway.value} dagen`;
  if (daysAway.value === 1) return 'morgen';
  if (daysAway.value === 0) return 'vandaag';
  return 'voorbij';
});

const detail = ref(null);
// loading, failed or ready
const state = ref('loading');

async function load() {
  const key = size.value;
  const day = arrival.value;
  if (detail.value?.arrival !== day) state.value = 'loading';
  try {
    const response = await fetch(`/api/admin/weekend?${new URLSearchParams({ arrival: day, party: key })}`);
    if (key !== size.value || day !== arrival.value) return;
    if (!response.ok) throw new Error(`Weekend history failed with ${response.status}`);
    detail.value = await response.json();
    state.value = 'ready';
  } catch {
    if (!detail.value) state.value = 'failed';
  }
}
watch([arrival, size], load, { immediate: true });

const parkInfo = computed(() => new Map((stats.value?.parks ?? []).map((park) => [park.code, park])));
// [at, count, min, p25, median, p75] per round in the chosen period
const series = computed(() => {
  const found = stats.value?.weekends.find((item) => item.arrival === arrival.value);
  return found ? lastDays(found.series, range.value, ([at]) => at) : [];
});

// Per park: [code, firstCents, firstAt, lastCents, lastAt, low, high, observations]; free when seen in the latest round.
const parks = computed(() =>
  (detail.value?.parks ?? []).map(([code, firstCents, firstAt, lastCents, lastAt, low, high, seen]) => {
    const info = parkInfo.value.get(code);
    return {
      code,
      name: info?.name ?? code,
      provider: providerName(info?.provider),
      firstCents,
      firstAt,
      lastCents,
      lastAt,
      low,
      high,
      seen,
      free: lastAt === detail.value.latestAt,
    };
  }),
);
const freeParks = computed(() => parks.value.filter((park) => park.free));

const tiles = computed(() => {
  const first = series.value[0];
  const last = series.value.at(-1);
  if (!last) return [];
  const priceChange = series.value.length > 1 ? percentChange(first[4], last[4]) : null;
  const freeChange = series.value.length > 1 ? last[1] - first[1] : null;
  const cheapest = freeParks.value.reduce((best, park) => (!best || park.lastCents < best.lastCents ? park : best), null);
  const soldOut = parks.value.length - freeParks.value.length;
  return [
    {
      label: 'Mediaanprijs nu',
      value: formatEuros(last[4]),
      delta:
        priceChange == null
          ? null
          : { text: `${priceChange > 0 ? '+' : ''}${priceChange.toLocaleString('nl-NL')}%`, tone: priceChange < 0 ? 'good' : priceChange > 0 ? 'bad' : 'neutral' },
      hint: series.value.length > 1 ? `sinds ${formatTimestamp(first[0])}` : 'eerste meting',
      trend: series.value.map((point) => point[4]),
    },
    {
      label: 'Parken met plek',
      value: count(last[1]),
      delta: freeChange == null ? null : { text: `${freeChange > 0 ? '+' : ''}${freeChange}`, tone: freeChange < 0 ? 'bad' : 'neutral' },
      hint: series.value.length > 1 ? 'in deze periode' : '',
      trend: series.value.map((point) => point[1]),
    },
    { label: 'Goedkoopste nu', value: cheapest ? formatEuros(cheapest.lastCents) : '–', hint: cheapest?.name ?? '' },
    { label: 'Vol geraakt', value: count(soldOut), hint: soldOut === 1 ? 'park sinds de eerste meting' : 'parken sinds de eerste meting' },
  ];
});

const priceChart = computed(() => ({
  option: bandChart(palette.value, {
    points: series.value.map((point) => ({ at: point[0], value: euros(point[4]), low: euros(point[3]), high: euros(point[5]) })),
    name: 'Mediaanprijs',
    bandName: 'Middelste helft',
  }),
  table: {
    columns: [{ label: 'Ronde' }, { label: 'Laagste', align: 'right' }, { label: 'Mediaan', align: 'right' }, { label: 'Middelste helft', align: 'right' }],
    rows: series.value.map((point) => [formatTimestamp(point[0]), formatEuros(point[2]), formatEuros(point[4]), `${formatEuros(point[3])} – ${formatEuros(point[5])}`]),
  },
}));

const freeChart = computed(() => ({
  option: lines(palette.value, {
    series: [{ name: 'Parken met plek', points: series.value.map((point) => [Date.parse(point[0]), point[1]]), area: true }],
    valueFormatter: countLabel,
    step: true,
  }),
  table: {
    columns: [{ label: 'Ronde' }, { label: 'Parken met plek', align: 'right' }],
    rows: series.value.map((point) => [formatTimestamp(point[0]), count(point[1])]),
  },
}));

/** A round step for the histogram's bars: 25, 50, 100, 250 … euros. */
function binStep(spreadEuros) {
  const rough = spreadEuros / HISTOGRAM_BARS;
  return [25, 50, 100, 250, 500, 1000].find((step) => step >= rough) ?? 1000;
}

const histogram = computed(() => {
  const prices = freeParks.value.map((park) => park.lastCents / 100);
  if (!prices.length) return null;
  const step = binStep(Math.max(...prices) - Math.min(...prices));
  const start = Math.floor(Math.min(...prices) / step) * step;
  const bins = Array.from({ length: Math.floor((Math.max(...prices) - start) / step) + 1 }, (_, index) => ({ from: start + index * step, parks: 0 }));
  for (const price of prices) bins[Math.floor((price - start) / step)].parks += 1;
  const label = (bin) => `${formatEuros(bin.from * 100)} – ${formatEuros((bin.from + step) * 100)}`;
  return {
    option: columns(palette.value, {
      labels: bins.map((bin) => formatEuros(bin.from * 100)),
      titles: bins.map(label),
      values: bins.map((bin) => bin.parks),
      name: 'parken',
      valueFormatter: countLabel,
    }),
    table: { columns: [{ label: 'Prijs' }, { label: 'Parken', align: 'right' }], rows: bins.map((bin) => [label(bin), count(bin.parks)]) },
  };
});

const sortedParks = computed(() =>
  [...parks.value]
    .sort((a, b) => Number(b.free) - Number(a.free) || a.lastCents - b.lastCents)
    .map((park) => {
      const change = park.free ? percentChange(park.firstCents, park.lastCents) : null;
      return {
        ...park,
        to: `/beheer/parken/${encodeURIComponent(park.code)}`,
        now: park.free ? formatEuros(park.lastCents) : 'Vol',
        first: formatEuros(park.firstCents),
        changeText: change == null ? '–' : `${change > 0 ? '+' : ''}${change.toLocaleString('nl-NL')}%`,
        changeClass: change == null || change === 0 ? 'text-ink-secondary' : change < 0 ? 'text-good-ink' : 'text-warning-ink',
        range: `${formatEuros(park.low)} – ${formatEuros(park.high)}`,
        status: park.free ? 'Vrij' : `Vol sinds ${formatTimestamp(park.lastAt)}`,
      };
    }),
);
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">{{ title }}</h1>
      <p class="mt-1 text-ink-secondary">Aankomst {{ when }} · {{ sizeLabel }} · 3 nachten</p>
    </div>

    <p v-if="statsState === 'missing'" class="rounded-2xl bg-surface px-4 py-10 text-center text-ink-secondary ring-1 ring-line">
      De weekenden worden na de volgende ronde berekend.
    </p>
    <p v-else-if="stats && !series.length" class="rounded-2xl bg-surface px-4 py-10 text-center text-ink-secondary ring-1 ring-line">
      Geen metingen van dit weekend voor {{ sizeLabel }} in deze periode.
    </p>
    <template v-else-if="stats">
      <section aria-label="Kerncijfers" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile v-for="tile in tiles" :key="tile.label" v-bind="tile" />
      </section>

      <div class="grid gap-4 xl:grid-cols-2">
        <ChartCard
          class="xl:col-span-2"
          title="Prijs door de rondes heen"
          subtitle="De mediaanprijs van de parken met plek, met de middelste helft van de prijzen eromheen"
          :table="priceChart.table"
        >
          <EChart :option="priceChart.option" height="20rem" label="Mediaanprijs van dit weekend per ronde" />
        </ChartCard>
        <ChartCard title="Plekken door de rondes heen" subtitle="Parken met een vrij huisje per ronde" :table="freeChart.table">
          <EChart :option="freeChart.option" label="Parken met plek per ronde" />
        </ChartCard>
        <ChartCard
          title="Prijzen nu"
          subtitle="Hoeveel parken er per prijsklasse plek hebben, in de laatste ronde"
          :table="histogram?.table"
          :empty="histogram ? '' : state === 'loading' ? 'Laden…' : 'Geen parken met plek.'"
        >
          <EChart v-if="histogram" :option="histogram.option" label="Aantal parken per prijsklasse" />
        </ChartCard>
      </div>

      <section class="rounded-2xl bg-surface ring-1 ring-line" aria-labelledby="weekend-parks-title">
        <h2 id="weekend-parks-title" class="border-b border-line px-4 py-3 font-semibold sm:px-5">
          Parken <span class="font-normal text-ink-secondary">· {{ count(freeParks.length) }} met plek</span>
        </h2>
        <p v-if="state === 'failed'" class="px-4 py-3 text-sm text-warning-ink sm:px-5">De parken konden niet worden geladen.</p>
        <div v-else class="max-h-[36rem] overflow-auto">
          <table class="w-full min-w-[48rem] text-left text-sm">
            <thead class="sticky top-0 bg-surface text-ink-secondary">
              <tr class="border-b border-line">
                <th scope="col" class="px-4 py-2.5 font-medium sm:px-5">Park</th>
                <th scope="col" class="px-3 py-2.5 text-right font-medium">Nu</th>
                <th scope="col" class="px-3 py-2.5 text-right font-medium">Eerst gezien</th>
                <th scope="col" class="px-3 py-2.5 text-right font-medium">Verschil</th>
                <th scope="col" class="px-3 py-2.5 text-right font-medium">Laagste – hoogste</th>
                <th scope="col" class="px-4 py-2.5 font-medium sm:px-5">Status</th>
              </tr>
            </thead>
            <tbody class="tabular-nums">
              <tr v-for="park in sortedParks" :key="park.code" class="border-b border-line last:border-0 hover:bg-hover">
                <th scope="row" class="px-4 py-2 font-normal sm:px-5">
                  <RouterLink :to="park.to" class="font-medium text-accent hover:underline">{{ park.name }}</RouterLink>
                  <span class="block text-xs text-ink-secondary">{{ park.provider }}</span>
                </th>
                <td class="px-3 py-2 text-right font-semibold">{{ park.now }}</td>
                <td class="px-3 py-2 text-right">{{ park.first }}</td>
                <td class="px-3 py-2 text-right font-medium" :class="park.changeClass">{{ park.changeText }}</td>
                <td class="px-3 py-2 text-right whitespace-nowrap">{{ park.range }}</td>
                <td class="px-4 py-2 sm:px-5" :class="park.free ? 'text-good-ink' : 'text-ink-secondary'">{{ park.status }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
    <p v-else class="text-ink-secondary" role="status">Laden…</p>
  </div>
</template>
