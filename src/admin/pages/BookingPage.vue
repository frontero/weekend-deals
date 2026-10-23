<script setup>
import { computed } from 'vue';
import { formatShortDate, formatWeekend } from '../../lib/format.js';
import { shiftDays } from '../../../shared/weekends.mjs';
import Icon from '../../components/Icon.vue';
import ChartCard from '../components/ChartCard.vue';
import EChart from '../components/EChart.vue';
import StatTile from '../components/StatTile.vue';
import { ENOUGH_DAYS, lastDays, leadCurve, leadPoints, momentGrid, spanDays } from '../lib/analysis.js';
import { heatmap, leadChart, percentLabel, tooltipRow, tooltipTitle } from '../lib/chart-options.js';
import { usePalette } from '../lib/palette.js';
import { useAdmin } from '../useAdmin.js';
import { count } from '../useRounds.js';

// Rounds collect weekends from Friday to Monday.
const WEEKEND_NIGHTS = 3;
const WEEKDAYS = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const WEEKDAY_LABELS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

const { stats, statsState, range, sizeLabel } = useAdmin();
const palette = usePalette();

const rounds = computed(() => lastDays(stats.value?.rounds ?? [], range.value));
const days = computed(() => spanDays(rounds.value));
const enough = computed(() => days.value >= ENOUGH_DAYS);

const points = computed(() => {
  const ats = new Set(rounds.value.map((round) => round.at));
  const weekends = (stats.value?.weekends ?? [])
    .map(({ arrival, series }) => ({ arrival, series: series.filter(([at]) => ats.has(at)) }))
    .filter((weekend) => weekend.series.length);
  return leadPoints(weekends);
});
const priceCurve = computed(() => leadCurve(points.value, 'index'));
const shareCurve = computed(() => leadCurve(points.value, 'share'));
const grid = computed(() => momentGrid(rounds.value));

const pointTitle = (point) => `${formatWeekend({ arrival: point.arrival, departure: shiftDays(point.arrival, WEEKEND_NIGHTS) })}, gemeten ${formatShortDate(point.at.slice(0, 10))}`;
const indexLabel = (value) => `${Math.round(value)}`;
const weekLabel = (week) => (week.from === 0 ? 'Laatste week' : `${week.from}–${week.from + 6} dagen`);

const tiles = computed(() => {
  const lastWeek = priceCurve.value.find((week) => week.from === 0);
  const farOut = priceCurve.value.at(-1);
  const lastWeekShare = shareCurve.value.find((week) => week.from === 0);
  const busiest = [...grid.value].sort((a, b) => b.changed - a.changed)[0];
  const mostDrops = [...grid.value].sort((a, b) => b.dropped - a.dropped)[0];
  const moment = (cell) => `${WEEKDAYS[cell.weekday]} rond ${String(cell.hour).padStart(2, '0')}:00`;
  const versus = (value) => {
    const difference = Math.round(value - 100);
    if (difference === 0) return 'even duur als normaal';
    return `${Math.abs(difference)}% ${difference < 0 ? 'goedkoper' : 'duurder'} dan normaal`;
  };
  return [
    {
      label: 'Laatste week voor aankomst',
      value: lastWeek ? `${indexLabel(lastWeek.value)}` : '–',
      delta: lastWeek ? { text: versus(lastWeek.value), tone: lastWeek.value < 100 ? 'good' : lastWeek.value > 100 ? 'bad' : 'neutral' } : null,
      hint: lastWeek ? `${count(lastWeek.count)} metingen` : 'nog geen metingen',
    },
    {
      label: 'Ver vooruit',
      value: farOut && farOut !== lastWeek ? `${indexLabel(farOut.value)}` : '–',
      delta: farOut && farOut !== lastWeek ? { text: versus(farOut.value), tone: farOut.value < 100 ? 'good' : farOut.value > 100 ? 'bad' : 'neutral' } : null,
      hint: farOut && farOut !== lastWeek ? `${farOut.from}–${farOut.from + 6} dagen voor aankomst` : '',
    },
    {
      label: 'Plek in de laatste week',
      value: lastWeekShare ? `${Math.round(lastWeekShare.value)}%` : '–',
      hint: 'van de parken die dat weekend ooit plek hadden',
    },
    {
      label: 'Meeste prijswijzigingen',
      value: busiest ? moment(busiest) : '–',
      hint: busiest ? `${busiest.changed.toLocaleString('nl-NL')}% van de prijzen veranderde · meeste dalingen ${moment(mostDrops)}` : 'nog geen vergelijking',
    },
  ];
});

const priceChart = computed(() => ({
  option: leadChart(palette.value, {
    points: points.value.map((point) => ({ days: point.days, value: point.index, title: pointTitle(point) })),
    curve: priceCurve.value,
    name: 'Prijsniveau',
    valueFormatter: indexLabel,
    reference: 100,
  }),
  table: {
    columns: [{ label: 'Voor aankomst' }, { label: 'Prijsniveau', align: 'right' }, { label: 'Middelste helft', align: 'right' }, { label: 'Metingen', align: 'right' }],
    rows: priceCurve.value.map((week) => [weekLabel(week), indexLabel(week.value), `${indexLabel(week.low)} – ${indexLabel(week.high)}`, count(week.count)]),
  },
}));

const shareChart = computed(() => ({
  option: leadChart(palette.value, {
    points: points.value.map((point) => ({ days: point.days, value: point.share, title: pointTitle(point) })),
    curve: shareCurve.value,
    name: 'Parken met plek',
    valueFormatter: percentLabel,
  }),
  table: {
    columns: [{ label: 'Voor aankomst' }, { label: 'Parken met plek', align: 'right' }, { label: 'Metingen', align: 'right' }],
    rows: shareCurve.value.map((week) => [weekLabel(week), percentLabel(week.value), count(week.count)]),
  },
}));

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

// Per weekday and hour of the day: the share of compared prices that changed in the rounds at that moment. Every hour
// has a column, so it shows when rounds ran at all.
const momentChart = computed(() => {
  const cells = grid.value.map((cell) => [cell.hour, cell.weekday, cell.changed, cell]);
  const values = grid.value.map((cell) => cell.changed);
  return {
    empty: grid.value.length ? '' : 'Nog geen rondes om te vergelijken in deze periode.',
    option: heatmap(palette.value, {
      xLabels: HOURS.map((hour) => `${String(hour).padStart(2, '0')}:00`),
      yLabels: WEEKDAY_LABELS,
      topDown: true,
      cells,
      min: 0,
      max: Math.max(1, ...values),
      legendFormatter: percentLabel,
      tooltip: ([, , , cell]) =>
        tooltipTitle(`${WEEKDAYS[cell.weekday]} rond ${String(cell.hour).padStart(2, '0')}:00 · ${cell.rounds} ${cell.rounds === 1 ? 'ronde' : 'rondes'}`) +
        tooltipRow(palette.value.series[0], 'van de prijzen veranderde', `${cell.changed.toLocaleString('nl-NL')}%`) +
        tooltipRow(palette.value.lower, 'werd goedkoper', `${cell.dropped.toLocaleString('nl-NL')}%`),
    }),
    table: {
      columns: [{ label: 'Moment' }, { label: 'Rondes', align: 'right' }, { label: 'Veranderd', align: 'right' }, { label: 'Goedkoper', align: 'right' }],
      rows: [...grid.value]
        .sort((a, b) => a.weekday - b.weekday || a.hour - b.hour)
        .map((cell) => [`${WEEKDAYS[cell.weekday]} ${String(cell.hour).padStart(2, '0')}:00`, count(cell.rounds), `${cell.changed}%`, `${cell.dropped}%`]),
    },
  };
});
</script>

<template>
  <p v-if="statsState === 'missing'" class="rounded-2xl bg-surface px-4 py-10 text-center text-ink-secondary ring-1 ring-line">
    Het boekmoment wordt na de volgende ronde berekend.
  </p>
  <div v-else-if="stats" class="flex flex-col gap-6">
    <div class="flex max-w-4xl flex-col gap-2">
      <p class="text-ink-secondary">
        Wanneer kun je het beste boeken? Elk weekend wordt per ronde vergeleken met wat het meestal kost (100 = normaal),
        zodat weekenden in verschillende seizoenen naast elkaar passen. Voor {{ sizeLabel }}.
      </p>
      <p
        v-if="!enough"
        class="flex items-start gap-2 rounded-xl bg-warning-wash px-4 py-3 text-sm text-warning-ink"
        role="status"
      >
        <Icon name="info" class="mt-px size-4" />
        Nog weinig data: {{ count(rounds.length) }} rondes over {{ Math.max(1, Math.round(days)) }}
        {{ Math.round(days) === 1 ? 'dag' : 'dagen' }}. Patronen worden betrouwbaar na een paar weken meten.
      </p>
    </div>

    <section aria-label="Bevindingen" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile v-for="tile in tiles" :key="tile.label" v-bind="tile" />
    </section>

    <div class="grid gap-4 xl:grid-cols-2">
      <ChartCard
        class="xl:col-span-2"
        title="Prijs naarmate het weekend nadert"
        subtitle="Prijsniveau per week voor aankomst (100 = wat dat weekend meestal kost); de grijze stippen zijn losse metingen"
        :table="priceChart.table"
        :empty="points.length ? '' : 'Nog geen metingen in deze periode.'"
      >
        <EChart :option="priceChart.option" height="22rem" label="Prijsniveau naar dagen voor aankomst" />
      </ChartCard>
      <ChartCard
        title="Plek naarmate het weekend nadert"
        subtitle="Parken met plek, in procenten van het hoogste aantal dat dat weekend had"
        :table="shareChart.table"
        :empty="points.length ? '' : 'Nog geen metingen in deze periode.'"
      >
        <EChart :option="shareChart.option" label="Beschikbaarheid naar dagen voor aankomst" />
      </ChartCard>
      <ChartCard
        title="Wanneer veranderen prijzen"
        subtitle="Per dag en tijdstip van de rondes: welk deel van de prijzen veranderde sinds de ronde ervoor"
        :table="momentChart.table"
        :empty="momentChart.empty"
      >
        <EChart :option="momentChart.option" label="Prijswijzigingen per weekdag en tijdstip" />
      </ChartCard>
    </div>
  </div>
  <p v-else class="text-ink-secondary" role="status">Laden…</p>
</template>
