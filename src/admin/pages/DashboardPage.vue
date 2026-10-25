<script setup>
import { computed } from 'vue';
import Icon from '../../components/Icon.vue';
import { formatEuros, formatShortDate, formatTimestamp, formatWeekend } from '../../lib/format.js';
import { shiftDays } from '../../../shared/weekends.mjs';
import ChartCard from '../components/ChartCard.vue';
import EChart from '../components/EChart.vue';
import StatTile from '../components/StatTile.vue';
import { lastDays, percentChange } from '../lib/analysis.js';
import { bandChart, columns, countLabel, divergingBars, euros, rangeColumns } from '../lib/chart-options.js';
import { usePalette } from '../lib/palette.js';
import { useAdmin } from '../useAdmin.js';
import { count, useRounds } from '../useRounds.js';

const { admin, stats, statsState, range, sizeLabel } = useAdmin();
const { cards, warnings, rounds: roundViews } = useRounds();
const palette = usePalette();

// Rounds collect weekends from Friday to Monday.
const WEEKEND_NIGHTS = 3;
const MOVES_SHOWN = 8;
const WARNING_TONES = {
  warning: { icon: 'warning', classes: 'bg-warning-wash text-warning-ink' },
  note: { icon: 'info', classes: 'bg-surface text-ink-secondary ring-1 ring-line' },
};

const rounds = computed(() => lastDays(stats.value?.rounds ?? [], range.value));
const latest = computed(() => rounds.value.at(-1) ?? null);
const first = computed(() => rounds.value[0] ?? null);
const median = (round) => round.all[3];
const roundTitle = (round) => formatTimestamp(round.at);
const weekendOf = (arrival) => ({ arrival, departure: shiftDays(arrival, WEEKEND_NIGHTS) });

const emptyText = computed(() => {
  if (statsState.value === 'missing') return 'De grafieken worden na de volgende ronde berekend.';
  if (statsState.value === 'failed') return 'De grafieken konden niet worden geladen.';
  if (!rounds.value.length) return 'Nog geen rondes in deze periode.';
  return '';
});

const tiles = computed(() => {
  if (!latest.value) return [];
  const priceChange = rounds.value.length > 1 ? percentChange(median(first.value), median(latest.value)) : null;
  const parksChange = rounds.value.length > 1 ? latest.value.parks - first.value.parks : null;
  const down = rounds.value.reduce((sum, round) => sum + round.down, 0);
  const up = rounds.value.reduce((sum, round) => sum + round.up, 0);
  const since = rounds.value.length > 1 ? `sinds ${formatShortDate(first.value.at.slice(0, 10))}` : 'eerste ronde';
  const totals = admin.value.totals;
  return [
    {
      label: `Mediaanprijs, ${sizeLabel.value}`,
      value: formatEuros(median(latest.value)),
      delta:
        priceChange == null
          ? null
          : { text: `${priceChange > 0 ? '+' : ''}${priceChange.toLocaleString('nl-NL')}%`, tone: priceChange < 0 ? 'good' : priceChange > 0 ? 'bad' : 'neutral' },
      hint: since,
      trend: rounds.value.map(median),
    },
    {
      label: 'Parken met plek',
      value: count(latest.value.parks),
      delta: parksChange == null ? null : { text: `${parksChange > 0 ? '+' : ''}${parksChange}`, tone: parksChange < 0 ? 'bad' : 'neutral' },
      hint: since,
      trend: rounds.value.map((round) => round.parks),
    },
    {
      label: 'Prijsdalingen',
      value: count(down),
      delta: { text: `${count(up)} stijgingen`, tone: 'neutral' },
      hint: `in ${rounds.value.length} ${rounds.value.length === 1 ? 'ronde' : 'rondes'}`,
      trend: rounds.value.map((round) => round.down),
    },
    {
      label: 'Prijzen bewaard',
      value: count(totals.prices ?? 0),
      hint: `${count(totals.rounds)} rondes, alle groottes`,
    },
  ];
});

const levelChart = computed(() => {
  const points = rounds.value.map((round) => ({
    at: round.at,
    value: euros(round.all[3]),
    low: euros(round.all[2]),
    high: euros(round.all[4]),
    count: round.all[0],
  }));
  return {
    option: bandChart(palette.value, { points, name: 'Mediaanprijs', bandName: 'Middelste helft', note: (point) => `${count(point.count)} prijzen` }),
    table: {
      columns: [{ label: 'Ronde' }, { label: 'Mediaan', align: 'right' }, { label: 'Middelste helft', align: 'right' }, { label: 'Prijzen', align: 'right' }],
      rows: rounds.value.map((round) => [
        roundTitle(round),
        formatEuros(round.all[3]),
        `${formatEuros(round.all[2])} – ${formatEuros(round.all[4])}`,
        count(round.all[0]),
      ]),
    },
  };
});

const changesChart = computed(() => {
  const compared = rounds.value.filter((round) => round.compared > 0);
  return {
    empty: compared.length ? '' : 'Nog geen ronde om mee te vergelijken in deze periode.',
    option: divergingBars(palette.value, {
      labels: compared.map((round) => formatShortDate(round.at.slice(0, 10))),
      titles: compared.map(roundTitle),
      lower: compared.map((round) => round.down),
      higher: compared.map((round) => round.up),
      lowerName: 'Lager',
      higherName: 'Hoger',
    }),
    table: {
      columns: [{ label: 'Ronde' }, { label: 'Lager', align: 'right' }, { label: 'Hoger', align: 'right' }, { label: 'Ander huisje', align: 'right' }],
      rows: compared.map((round) => [roundTitle(round), count(round.down), count(round.up), count(round.swapped)]),
    },
  };
});

// The weekends the latest round saw, with their spread in that round.
const latestWeekends = computed(() => {
  if (!stats.value || !latest.value) return [];
  return stats.value.weekends
    .map(({ arrival, series }) => ({ arrival, point: series.find(([at]) => at === latest.value.at) }))
    .filter((weekend) => weekend.point);
});

const availabilityChart = computed(() => ({
  option: columns(palette.value, {
    labels: latestWeekends.value.map((weekend) => formatShortDate(weekend.arrival)),
    titles: latestWeekends.value.map((weekend) => formatWeekend(weekendOf(weekend.arrival))),
    values: latestWeekends.value.map((weekend) => weekend.point[1]),
    name: 'parken met plek',
    valueFormatter: countLabel,
  }),
  table: {
    columns: [{ label: 'Weekend' }, { label: 'Parken met plek', align: 'right' }],
    rows: latestWeekends.value.map((weekend) => [formatWeekend(weekendOf(weekend.arrival)), count(weekend.point[1])]),
  },
}));

const weekendPriceChart = computed(() => ({
  option: rangeColumns(palette.value, {
    labels: latestWeekends.value.map((weekend) => formatShortDate(weekend.arrival)),
    titles: latestWeekends.value.map((weekend) => formatWeekend(weekendOf(weekend.arrival))),
    low: latestWeekends.value.map((weekend) => euros(weekend.point[3])),
    median: latestWeekends.value.map((weekend) => euros(weekend.point[4])),
    high: latestWeekends.value.map((weekend) => euros(weekend.point[5])),
  }),
  table: {
    columns: [{ label: 'Weekend' }, { label: 'Laagste', align: 'right' }, { label: 'Mediaan', align: 'right' }, { label: 'Middelste helft', align: 'right' }],
    rows: latestWeekends.value.map(({ arrival, point }) => [
      formatWeekend(weekendOf(arrival)),
      formatEuros(point[2]),
      formatEuros(point[4]),
      `${formatEuros(point[3])} – ${formatEuros(point[5])}`,
    ]),
  },
}));

// The largest price moves of the newest finished round, for the chosen size.
const moves = computed(() => {
  const round = roundViews.value.find((item) => item.moves.length);
  if (!round) return { title: '', items: [] };
  const items = round.moves.filter((move) => move.size === sizeLabel.value).slice(0, MOVES_SHOWN);
  return { title: round.title, items };
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <section aria-label="Stand van zaken" class="flex flex-col gap-3">
      <dl class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div v-for="card in cards" :key="card.label" class="flex min-w-0 flex-col rounded-2xl bg-surface px-4 py-3 ring-1 ring-line">
          <dt class="text-xs font-medium tracking-wide text-ink-secondary uppercase">{{ card.label }}</dt>
          <dd class="mt-1 truncate font-semibold">{{ card.value }}</dd>
          <dd class="mt-0.5 truncate text-sm text-ink-secondary" :title="card.detail">{{ card.detail }}</dd>
        </div>
      </dl>
      <p
        v-for="warning in warnings"
        :key="warning.text"
        class="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
        :class="WARNING_TONES[warning.tone].classes"
        role="status"
      >
        <Icon :name="WARNING_TONES[warning.tone].icon" class="mt-px size-4" />
        {{ warning.text }}
      </p>
    </section>

    <p v-if="emptyText" class="rounded-2xl bg-surface px-4 py-10 text-center text-ink-secondary ring-1 ring-line">{{ emptyText }}</p>

    <template v-else>
      <section aria-label="Kerncijfers" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile v-for="tile in tiles" :key="tile.label" v-bind="tile" />
      </section>

      <div class="grid gap-4 xl:grid-cols-2">
        <ChartCard
          class="xl:col-span-2"
          title="Prijsniveau per ronde"
          :subtitle="`Mediaanprijs van alle parken en weekenden voor ${sizeLabel}, met de middelste helft van de prijzen eromheen`"
          :table="levelChart.table"
        >
          <EChart :option="levelChart.option" height="20rem" label="Mediaanprijs per ronde met de middelste helft van de prijzen" />
        </ChartCard>

        <ChartCard
          title="Wat er veranderde per ronde"
          subtitle="Hetzelfde huisje werd goedkoper (onder de lijn) of duurder (boven de lijn)"
          :table="changesChart.table"
          :empty="changesChart.empty"
        >
          <EChart :option="changesChart.option" label="Prijsdalingen en -stijgingen per ronde" />
        </ChartCard>

        <ChartCard title="Plekken per weekend" subtitle="Parken met een vrij huisje, in de laatste ronde" :table="availabilityChart.table">
          <EChart :option="availabilityChart.option" label="Aantal parken met plek per weekend" />
        </ChartCard>

        <ChartCard
          class="xl:col-span-2"
          title="Prijs per weekend"
          subtitle="De middelste helft van de prijzen per weekend, met de mediaan als stip, in de laatste ronde"
          :table="weekendPriceChart.table"
        >
          <EChart :option="weekendPriceChart.option" label="Prijsspreiding per weekend" />
        </ChartCard>
      </div>

      <section v-if="moves.items.length" class="rounded-2xl bg-surface p-4 ring-1 ring-line sm:p-5" aria-labelledby="moves-title">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="moves-title" class="font-semibold">Grootste prijswijzigingen</h2>
          <RouterLink to="/beheer/rondes" class="text-sm font-medium text-accent hover:underline">Alle rondes</RouterLink>
        </div>
        <p class="mt-0.5 text-sm text-ink-secondary">Ronde van {{ moves.title }}, {{ sizeLabel }}</p>
        <ul class="mt-3 grid grid-cols-1 gap-x-8 divide-y divide-line text-sm md:grid-cols-2 md:divide-y-0">
          <li v-for="move in moves.items" :key="move.key" class="flex items-baseline gap-3 py-2 md:border-b md:border-line">
            <span class="min-w-0 flex-1">
              <RouterLink :to="`/beheer/parken/${encodeURIComponent(move.parkCode)}`" class="font-medium text-accent hover:underline">
                {{ move.park }}
              </RouterLink>
              <span class="block truncate text-ink-secondary">{{ move.detail }}</span>
            </span>
            <span class="text-right tabular-nums whitespace-nowrap">
              <span class="text-ink-secondary">{{ move.before }} →</span> {{ move.after }}
              <span class="block font-semibold" :class="move.classes">{{ move.difference }}</span>
            </span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
