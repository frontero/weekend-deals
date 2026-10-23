<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { localToday, shiftDays } from '../../../shared/weekends.mjs';
import { formatEuros, formatShortDate, formatTimestamp, formatWeekend } from '../../lib/format.js';
import ChartCard from '../components/ChartCard.vue';
import EChart from '../components/EChart.vue';
import Sparkline from '../components/Sparkline.vue';
import { lastDays, percentChange } from '../lib/analysis.js';
import { countLabel, euroLabel, euros, heatmap, tooltipRow, tooltipTitle } from '../lib/chart-options.js';
import { usePalette } from '../lib/palette.js';
import { useAdmin } from '../useAdmin.js';
import { count } from '../useRounds.js';

// Rounds collect weekends from Friday to Monday.
const WEEKEND_NIGHTS = 3;
const METRICS = [
  { value: 'price', label: 'Mediaanprijs' },
  { value: 'free', label: 'Parken met plek' },
];

const router = useRouter();
const { stats, statsState, range, sizeLabel } = useAdmin();
const palette = usePalette();
const metric = ref('price');

const weekendOf = (arrival) => ({ arrival, departure: shiftDays(arrival, WEEKEND_NIGHTS) });
const roundLabel = (at) => {
  const date = new Date(at);
  return `${formatShortDate(at.slice(0, 10))} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const rounds = computed(() => lastDays(stats.value?.rounds ?? [], range.value));
// Each weekend with its points in the chosen period: [at, count, min, p25, median, p75].
const weekends = computed(() => {
  const ats = new Set(rounds.value.map((round) => round.at));
  return (stats.value?.weekends ?? [])
    .map(({ arrival, series }) => ({ arrival, series: series.filter(([at]) => ats.has(at)) }))
    .filter((weekend) => weekend.series.length);
});

const heatChart = computed(() => {
  const isPrice = metric.value === 'price';
  const roundIndex = new Map(rounds.value.map((round, index) => [round.at, index]));
  const value = (point) => (isPrice ? euros(point[4]) : point[1]);
  const cells = weekends.value.flatMap((weekend, row) =>
    weekend.series.map((point) => [roundIndex.get(point[0]), row, value(point), point, weekend.arrival]),
  );
  const values = cells.map((cell) => cell[2]);
  const format = isPrice ? euroLabel : countLabel;
  return {
    option: heatmap(palette.value, {
      xLabels: rounds.value.map((round) => roundLabel(round.at)),
      yLabels: weekends.value.map((weekend) => formatShortDate(weekend.arrival)),
      cells,
      min: Math.min(...values),
      max: Math.max(...values),
      legendFormatter: format,
      tooltip: ([, , , point, arrival]) =>
        tooltipTitle(`${formatWeekend(weekendOf(arrival))} · ronde ${formatTimestamp(point[0])}`) +
        tooltipRow(palette.value.series[0], 'mediaanprijs', formatEuros(point[4])) +
        tooltipRow(palette.value.deemphasis, 'parken met plek', count(point[1])) +
        tooltipRow(palette.value.deemphasis, 'laagste prijs', formatEuros(point[2])),
    }),
    height: `${Math.max(14, weekends.value.length * 1.75 + 6)}rem`,
    table: {
      columns: [{ label: 'Weekend' }, { label: 'Ronde' }, { label: 'Mediaan', align: 'right' }, { label: 'Parken met plek', align: 'right' }],
      rows: weekends.value.flatMap((weekend) =>
        weekend.series.map((point) => [formatShortDate(weekend.arrival), formatTimestamp(point[0]), formatEuros(point[4]), count(point[1])]),
      ),
    },
  };
});

const today = localToday();
const signed = (value, suffix = '') => `${value > 0 ? '+' : ''}${value.toLocaleString('nl-NL')}${suffix}`;
const tone = (value, lowerIsGood = true) =>
  value == null || value === 0 ? 'text-ink-secondary' : value < 0 === lowerIsGood ? 'text-good-ink' : 'text-warning-ink';

const cards = computed(() => {
  const latestAt = rounds.value.at(-1)?.at;
  return weekends.value
    .filter((weekend) => weekend.arrival >= today)
    .map(({ arrival, series }) => {
      const first = series[0];
      const last = series.at(-1);
      const current = last[0] === latestAt ? last : null;
      const priceChange = current && series.length > 1 ? percentChange(first[4], current[4]) : null;
      const freeChange = current && series.length > 1 ? current[1] - first[1] : null;
      return {
        arrival,
        to: `/beheer/weekenden/${arrival}`,
        title: formatWeekend(weekendOf(arrival)),
        median: current ? formatEuros(current[4]) : 'Vol',
        free: current ? count(current[1]) : '0',
        priceChange: priceChange == null ? '' : signed(priceChange, '%'),
        priceClass: tone(priceChange),
        freeChange: freeChange == null ? '' : signed(freeChange),
        freeClass: tone(freeChange, false),
        trend: series.map((point) => point[4]),
      };
    });
});

const openWeekend = (event) => {
  const arrival = event.data?.[4];
  if (arrival) router.push(`/beheer/weekenden/${arrival}`);
};
</script>

<template>
  <p v-if="statsState === 'missing'" class="rounded-2xl bg-surface px-4 py-10 text-center text-ink-secondary ring-1 ring-line">
    De weekenden worden na de volgende ronde berekend.
  </p>
  <div v-else-if="stats" class="flex flex-col gap-6">
    <p v-if="!weekends.length" class="rounded-2xl bg-surface px-4 py-10 text-center text-ink-secondary ring-1 ring-line">
      Nog geen rondes in deze periode.
    </p>
    <template v-else>
      <ChartCard
        title="Weekenden door de rondes heen"
        :subtitle="`Per weekend (rij) en ronde (kolom) voor ${sizeLabel}. Klik op een vakje voor dat weekend.`"
        :table="heatChart.table"
      >
        <template #actions>
          <div class="flex rounded-lg bg-plane p-0.5 text-xs font-medium ring-1 ring-line" role="group" aria-label="Wat de kleur toont">
            <button
              v-for="item in METRICS"
              :key="item.value"
              type="button"
              class="rounded-md px-2.5 py-1"
              :class="metric === item.value ? 'bg-surface shadow-sm' : 'text-ink-secondary hover:text-ink'"
              :aria-pressed="metric === item.value"
              @click="metric = item.value"
            >
              {{ item.label }}
            </button>
          </div>
        </template>
        <EChart
          :option="heatChart.option"
          :height="heatChart.height"
          :label="`${metric === 'price' ? 'Mediaanprijs' : 'Parken met plek'} per weekend en ronde`"
          @select="openWeekend"
        />
      </ChartCard>

      <section aria-labelledby="upcoming-title" class="flex flex-col gap-3">
        <h2 id="upcoming-title" class="font-semibold">Komende weekenden</h2>
        <ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <li v-for="card in cards" :key="card.arrival">
            <RouterLink
              :to="card.to"
              class="flex flex-col gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line transition hover:shadow-md hover:ring-field"
            >
              <span class="font-semibold">{{ card.title }}</span>
              <span class="flex items-end justify-between gap-3">
                <span class="grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm">
                  <span class="text-ink-secondary">Mediaan</span>
                  <span class="text-ink-secondary">Met plek</span>
                  <span class="text-lg font-semibold">{{ card.median }}</span>
                  <span class="text-lg font-semibold">{{ card.free }}</span>
                  <span class="font-medium" :class="card.priceClass">{{ card.priceChange }}</span>
                  <span class="font-medium" :class="card.freeClass">{{ card.freeChange }}</span>
                </span>
                <Sparkline :values="card.trend" class="mb-1 shrink-0" />
              </span>
            </RouterLink>
          </li>
        </ul>
      </section>
    </template>
  </div>
  <p v-else class="text-ink-secondary" role="status">Laden…</p>
</template>
