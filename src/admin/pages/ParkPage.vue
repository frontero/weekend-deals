<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { shiftDays } from '../../../shared/weekends.mjs';
import GoogleRating from '../../components/GoogleRating.vue';
import Icon from '../../components/Icon.vue';
import { countryName, formatEuros, formatShortDate, formatTimestamp, formatWeekend } from '../../lib/format.js';
import { providerName } from '../../lib/providers.js';
import ChartCard from '../components/ChartCard.vue';
import EChart from '../components/EChart.vue';
import StatTile from '../components/StatTile.vue';
import { lastDays, parkGrid, percentChange } from '../lib/analysis.js';
import { escapeHtml, euroLabel, euros, heatmap, lines, tooltipRow, tooltipTitle } from '../lib/chart-options.js';
import { usePalette } from '../lib/palette.js';
import { useAdmin } from '../useAdmin.js';
import { count } from '../useRounds.js';

// Rounds collect weekends from Friday to Monday.
const WEEKEND_NIGHTS = 3;
// The heatmap's colours stop at this far below or above a weekend's usual price.
const HEAT_LIMIT_PERCENT = 20;

const route = useRoute();
const { size, sizeLabel, range } = useAdmin();
const palette = usePalette();

const history = ref(null);
// loading, missing or failed while there is no history to show
const state = ref('loading');
const chosenWeekend = ref('');

async function load() {
  const code = String(route.params.code ?? '');
  const key = size.value;
  if (history.value?.park.code !== code) state.value = 'loading';
  try {
    const response = await fetch(`/api/admin/park?${new URLSearchParams({ code, party: key })}`);
    if (code !== route.params.code || key !== size.value) return;
    if (response.status === 404) {
      history.value = null;
      state.value = 'missing';
      return;
    }
    if (!response.ok) throw new Error(`Park history failed with ${response.status}`);
    history.value = await response.json();
    state.value = 'ready';
  } catch {
    if (!history.value) state.value = 'failed';
  }
}
watch([() => route.params.code, size], load, { immediate: true });

const park = computed(() => history.value?.park ?? null);
watch(park, (value) => {
  if (value) document.title = `${value.name} – Beheer – Weekendje weg`;
});

const weekendOf = (arrival) => ({ arrival, departure: shiftDays(arrival, WEEKEND_NIGHTS) });
const accommodationName = (code) => history.value?.accommodations?.[code]?.name ?? code ?? 'onbekend huisje';

const grid = computed(() => {
  if (!history.value) return null;
  const rows = lastDays(history.value.rows, range.value, ([at]) => at);
  return rows.length ? parkGrid(rows) : null;
});

const place = computed(() => (park.value ? [park.value.city, park.value.region, countryName(park.value.country)].filter(Boolean).join(', ') : ''));
const rating = computed(() => (park.value?.rating ? { rating: park.value.rating, ratingCount: park.value.ratingCount, mapsUrl: park.value.mapsUrl } : null));

const tiles = computed(() => {
  if (!grid.value) return [];
  const free = grid.value.perWeekend.filter((weekend) => weekend.current);
  const cheapest = free.reduce((best, weekend) => (!best || weekend.current.cents < best.current.cents ? weekend : best), null);
  const allPrices = grid.value.perWeekend.flatMap((weekend) => weekend.seen.map((item) => item.cents));
  const lowest = Math.min(...allPrices);
  const changes = grid.value.perWeekend.reduce((sum, weekend) => sum + weekend.changes, 0);
  const swaps = grid.value.perWeekend.reduce((sum, weekend) => sum + weekend.swaps, 0);
  const cheapestChange = cheapest ? percentChange(cheapest.usual, cheapest.current.cents) : null;
  return [
    {
      label: 'Laagste prijs nu',
      value: cheapest ? formatEuros(cheapest.current.cents) : 'Vol',
      delta:
        cheapestChange == null
          ? null
          : { text: `${cheapestChange > 0 ? '+' : ''}${cheapestChange.toLocaleString('nl-NL')}% t.o.v. normaal`, tone: cheapestChange < 0 ? 'good' : cheapestChange > 0 ? 'bad' : 'neutral' },
      hint: cheapest ? `weekend ${formatShortDate(cheapest.arrival)}` : '',
    },
    { label: 'Weekenden met plek', value: `${free.length} van ${grid.value.weekends.length}`, hint: 'in de laatste ronde' },
    { label: 'Laagst gemeten', value: formatEuros(lowest), hint: `in ${count(allPrices.length)} metingen` },
    { label: 'Prijswijzigingen', value: count(changes), hint: `${count(swaps)}× een ander huisje goedkoopst` },
  ];
});

const roundLabel = (at) => {
  const date = new Date(at);
  return `${formatShortDate(at.slice(0, 10))} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

// Per weekend (row) and round (column): the price against the weekend's usual price here, blue below and red above.
const heatChart = computed(() => {
  if (!grid.value) return null;
  const { rounds, perWeekend } = grid.value;
  const roundIndex = new Map(rounds.map((at, index) => [at, index]));
  const cells = perWeekend.flatMap((weekend, row) =>
    weekend.seen.map((item) => {
      const percent = percentChange(weekend.usual, item.cents) ?? 0;
      return [roundIndex.get(item.at), row, Math.max(-HEAT_LIMIT_PERCENT, Math.min(HEAT_LIMIT_PERCENT, percent)), item.cents, percent, item.code, item.at, weekend.arrival];
    }),
  );
  return {
    option: heatmap(palette.value, {
      xLabels: rounds.map(roundLabel),
      yLabels: perWeekend.map((weekend) => formatShortDate(weekend.arrival)),
      cells,
      scale: 'diverging',
      min: -HEAT_LIMIT_PERCENT,
      max: HEAT_LIMIT_PERCENT,
      legendFormatter: (value) => `${value > 0 ? '+' : ''}${Math.round(value)}%`,
      tooltip: ([, , , cents, percent, code, at, arrival]) =>
        tooltipTitle(`${formatWeekend(weekendOf(arrival))} · ronde ${formatTimestamp(at)}`) +
        tooltipRow(palette.value.series[0], 'prijs', formatEuros(cents)) +
        tooltipRow(palette.value.deemphasis, 't.o.v. normaal hier', `${percent > 0 ? '+' : ''}${percent.toLocaleString('nl-NL')}%`) +
        `<div style="font-size:12px;opacity:.7;margin-top:4px">${escapeHtml(accommodationName(code))}</div>`,
    }),
    height: `${Math.max(14, perWeekend.length * 1.75 + 6)}rem`,
    table: {
      columns: [{ label: 'Weekend' }, { label: 'Ronde' }, { label: 'Prijs', align: 'right' }, { label: 'Huisje' }],
      rows: perWeekend.flatMap((weekend) =>
        weekend.seen.map((item) => [formatShortDate(weekend.arrival), formatTimestamp(item.at), formatEuros(item.cents), accommodationName(item.code)]),
      ),
    },
  };
});

const weekendOptions = computed(() => grid.value?.perWeekend.map((weekend) => weekend.arrival) ?? []);
watch(weekendOptions, (options) => {
  if (!options.includes(chosenWeekend.value)) chosenWeekend.value = options.find((arrival) => grid.value.perWeekend.find((weekend) => weekend.arrival === arrival)?.changes) ?? options[0] ?? '';
});

// The chosen weekend's price over time, with the other weekends in gray behind it.
const lineChart = computed(() => {
  if (!grid.value) return null;
  const series = grid.value.perWeekend
    .map((weekend) => ({
      name: formatWeekend(weekendOf(weekend.arrival)),
      points: weekend.seen.map((item) => [Date.parse(item.at), euros(item.cents)]),
      emphasis: weekend.arrival === chosenWeekend.value,
    }))
    .sort((a, b) => Number(a.emphasis) - Number(b.emphasis));
  const chosen = grid.value.perWeekend.find((weekend) => weekend.arrival === chosenWeekend.value);
  return {
    option: lines(palette.value, { series, step: true }),
    table: chosen && {
      columns: [{ label: 'Ronde' }, { label: 'Prijs', align: 'right' }, { label: 'Huisje' }],
      rows: chosen.seen.map((item) => [formatTimestamp(item.at), formatEuros(item.cents), accommodationName(item.code)]),
    },
  };
});

const weekendRows = computed(() =>
  (grid.value?.perWeekend ?? []).map((weekend) => {
    const change = weekend.current ? percentChange(weekend.first.cents, weekend.current.cents) : null;
    return {
      arrival: weekend.arrival,
      to: `/beheer/weekenden/${weekend.arrival}`,
      title: formatWeekend(weekendOf(weekend.arrival)),
      now: weekend.current ? formatEuros(weekend.current.cents) : 'Vol',
      first: formatEuros(weekend.first.cents),
      changeText: change == null ? '–' : `${change > 0 ? '+' : ''}${change.toLocaleString('nl-NL')}%`,
      changeClass: change == null || change === 0 ? 'text-ink-secondary' : change < 0 ? 'text-good-ink' : 'text-warning-ink',
      range: `${formatEuros(weekend.lowest)} – ${formatEuros(weekend.highest)}`,
      accommodation: weekend.current ? accommodationName(weekend.current.code) : '–',
      changes: weekend.changes,
    };
  }),
);
</script>

<template>
  <p v-if="state === 'loading'" class="text-ink-secondary" role="status">Laden…</p>
  <p v-else-if="state === 'missing'" class="rounded-2xl bg-surface px-4 py-10 text-center text-ink-secondary ring-1 ring-line">
    Dit park is niet gevonden.
  </p>
  <p v-else-if="state === 'failed'" class="rounded-2xl bg-warning-wash px-4 py-3 text-sm text-warning-ink" role="status">
    De gegevens van dit park konden niet worden geladen.
  </p>
  <div v-else class="flex flex-col gap-6">
    <section class="flex flex-col gap-4 overflow-hidden rounded-2xl bg-surface ring-1 ring-line sm:flex-row">
      <img
        v-if="park.imageUrl"
        :src="park.imageUrl"
        alt=""
        class="h-44 w-full object-cover sm:h-auto sm:w-64"
        loading="lazy"
      />
      <div class="flex min-w-0 flex-1 flex-col gap-2 p-4 sm:p-5">
        <p class="text-sm font-medium text-ink-secondary">{{ providerName(park.provider) }}<template v-if="place"> · {{ place }}</template></p>
        <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">{{ park.name }}</h1>
        <GoogleRating v-if="rating" :rating="rating" />
        <div class="mt-auto flex flex-wrap gap-2 pt-2 text-sm">
          <a
            v-if="park.url"
            :href="park.url"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 font-medium text-on-accent hover:bg-accent-hover"
          >
            Bekijk op {{ providerName(park.provider) }}
            <Icon name="external" class="size-4" />
            <span class="sr-only">(opent in een nieuw tabblad)</span>
          </a>
          <a
            v-if="park.mapsUrl"
            :href="park.mapsUrl"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-medium ring-1 ring-line hover:bg-hover"
          >
            <Icon name="pin" class="size-4" />
            Google Maps
            <span class="sr-only">(opent in een nieuw tabblad)</span>
          </a>
        </div>
      </div>
    </section>

    <p v-if="!grid" class="rounded-2xl bg-surface px-4 py-10 text-center text-ink-secondary ring-1 ring-line">
      Geen prijzen voor {{ sizeLabel }} in deze periode.
    </p>
    <template v-else>
      <section aria-label="Kerncijfers" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile v-for="tile in tiles" :key="tile.label" v-bind="tile" />
      </section>

      <ChartCard
        title="Prijs per weekend en ronde"
        :subtitle="`Elk vakje is de prijs voor ${sizeLabel} in één ronde, vergeleken met wat dat weekend hier meestal kost: blauw is goedkoper, rood duurder. Leeg is geen plek.`"
        :table="heatChart.table"
      >
        <EChart :option="heatChart.option" :height="heatChart.height" label="Prijs per weekend en ronde, vergeleken met normaal" />
      </ChartCard>

      <ChartCard title="Prijsverloop" subtitle="De prijs van één weekend door de rondes heen; de andere weekenden staan in grijs" :table="lineChart.table">
        <template #actions>
          <label class="flex items-center gap-2 text-sm">
            <span class="sr-only">Weekend</span>
            <select v-model="chosenWeekend" class="h-8 rounded-lg bg-surface px-2 ring-1 ring-field">
              <option v-for="arrival in weekendOptions" :key="arrival" :value="arrival">{{ formatWeekend(weekendOf(arrival)) }}</option>
            </select>
          </label>
        </template>
        <EChart :option="lineChart.option" label="Prijsverloop van het gekozen weekend" />
      </ChartCard>

      <section class="rounded-2xl bg-surface ring-1 ring-line" aria-labelledby="weekends-title">
        <h2 id="weekends-title" class="border-b border-line px-4 py-3 font-semibold sm:px-5">Per weekend</h2>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[48rem] text-left text-sm">
            <thead class="text-ink-secondary">
              <tr class="border-b border-line">
                <th scope="col" class="px-4 py-2.5 font-medium sm:px-5">Weekend</th>
                <th scope="col" class="px-3 py-2.5 text-right font-medium">Nu</th>
                <th scope="col" class="px-3 py-2.5 text-right font-medium">Eerst gezien</th>
                <th scope="col" class="px-3 py-2.5 text-right font-medium">Verschil</th>
                <th scope="col" class="px-3 py-2.5 text-right font-medium">Laagste – hoogste</th>
                <th scope="col" class="px-3 py-2.5 font-medium">Huisje nu</th>
                <th scope="col" class="px-4 py-2.5 text-right font-medium sm:px-5">Wijzigingen</th>
              </tr>
            </thead>
            <tbody class="tabular-nums">
              <tr v-for="row in weekendRows" :key="row.arrival" class="border-b border-line last:border-0 hover:bg-hover">
                <th scope="row" class="px-4 py-2 font-normal sm:px-5">
                  <RouterLink :to="row.to" class="font-medium whitespace-nowrap text-accent hover:underline">{{ row.title }}</RouterLink>
                </th>
                <td class="px-3 py-2 text-right font-semibold whitespace-nowrap">{{ row.now }}</td>
                <td class="px-3 py-2 text-right whitespace-nowrap">{{ row.first }}</td>
                <td class="px-3 py-2 text-right font-medium whitespace-nowrap" :class="row.changeClass">{{ row.changeText }}</td>
                <td class="px-3 py-2 text-right whitespace-nowrap">{{ row.range }}</td>
                <td class="max-w-56 truncate px-3 py-2" :title="row.accommodation">{{ row.accommodation }}</td>
                <td class="px-4 py-2 text-right sm:px-5">{{ row.changes }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
