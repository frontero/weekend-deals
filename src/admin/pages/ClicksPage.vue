<script setup>
import { computed, ref, watch } from 'vue';
import { formatShortDate } from '../../lib/format.js';
import { providerName } from '../../lib/providers.js';
import ChartCard from '../components/ChartCard.vue';
import EChart from '../components/EChart.vue';
import StatTile from '../components/StatTile.vue';
import { columns, countLabel } from '../lib/chart-options.js';
import { usePalette } from '../lib/palette.js';
import { count } from '../useRounds.js';

// The clicks through to providers: what earns the site its fees. Counted by /api/go.
const PERIODS = [7, 30, 90];
// Where on the page a click came from, as trackedBookingUrl names it.
const SOURCES = { kaartje: 'Knop op een kaartje', parkvenster: 'Knop in het parkvenster' };
const DAY_MS = 24 * 60 * 60 * 1000;

const palette = usePalette();
const days = ref(30);
const stats = ref(null);
// loading, failed or ready
const state = ref('loading');

async function load() {
  try {
    const response = await fetch(`/api/admin/clicks?days=${days.value}`);
    if (!response.ok) throw new Error(`Clicks failed with ${response.status}`);
    stats.value = await response.json();
    state.value = 'ready';
  } catch {
    if (!stats.value) state.value = 'failed';
  }
}
watch(days, load, { immediate: true });

// Every day of the period, also those without clicks.
const perDay = computed(() => {
  const byDay = new Map((stats.value?.days ?? []).map((row) => [row.day, row.clicks]));
  return Array.from({ length: days.value }, (_, index) => {
    const day = new Date(Date.now() - (days.value - 1 - index) * DAY_MS).toISOString().slice(0, 10);
    return { day, clicks: byDay.get(day) ?? 0 };
  });
});
const periodTotal = computed(() => perDay.value.reduce((sum, row) => sum + row.clicks, 0));

const tiles = computed(() => {
  const today = perDay.value.at(-1)?.clicks ?? 0;
  const top = stats.value?.providers[0];
  const total = stats.value?.total;
  return [
    { label: `Klikken, laatste ${days.value} dagen`, value: count(periodTotal.value), trend: perDay.value.map((row) => row.clicks) },
    { label: 'Vandaag', value: count(today) },
    { label: 'Meeste klikken naar', value: top ? providerName(top.provider) : '–', hint: top ? `${count(top.clicks)} klikken` : '' },
    { label: 'Sinds de eerste klik', value: count(total?.clicks ?? 0), hint: total?.since ? `sinds ${formatShortDate(total.since.slice(0, 10))}` : '' },
  ];
});

const dayChart = computed(() => ({
  option: columns(palette.value, {
    labels: perDay.value.map((row) => formatShortDate(row.day)),
    values: perDay.value.map((row) => row.clicks),
    name: 'klikken',
    valueFormatter: countLabel,
  }),
  table: { columns: [{ label: 'Dag' }, { label: 'Klikken', align: 'right' }], rows: perDay.value.map((row) => [formatShortDate(row.day), count(row.clicks)]) },
}));

const splitChart = (rows, label, name) => ({
  option: columns(palette.value, { labels: rows.map(label), values: rows.map((row) => row.clicks), name: 'klikken', valueFormatter: countLabel }),
  table: { columns: [{ label: name }, { label: 'Klikken', align: 'right' }], rows: rows.map((row) => [label(row), count(row.clicks)]) },
});
const providerChart = computed(() => splitChart(stats.value?.providers ?? [], (row) => providerName(row.provider), 'Aanbieder'));
const sourceChart = computed(() => splitChart(stats.value?.sources ?? [], (row) => SOURCES[row.source] ?? row.source ?? 'Onbekend', 'Plek'));
const parks = computed(() =>
  (stats.value?.parks ?? []).map((row) => ({ ...row, to: `/beheer/parken/${encodeURIComponent(row.parkCode)}`, provider: providerName(row.provider) })),
);
</script>

<template>
  <p v-if="state === 'loading'" class="text-ink-secondary" role="status">Laden…</p>
  <p v-else-if="state === 'failed'" class="rounded-2xl bg-warning-wash px-4 py-3 text-sm text-warning-ink" role="status">
    De klikken konden niet worden geladen.
  </p>
  <div v-else class="flex flex-col gap-6">
    <div class="flex flex-wrap items-center gap-3">
      <p class="max-w-3xl flex-1 text-ink-secondary">
        Elke klik van een bezoeker naar een aanbieder, via de gevolgde links op de site. Je eigen klikken vanuit het
        beheer tellen niet mee.
      </p>
      <label class="flex items-center gap-2 text-sm">
        <span class="text-ink-secondary">Periode</span>
        <select v-model.number="days" class="h-9 rounded-xl bg-surface px-3 font-medium ring-1 ring-field">
          <option v-for="period in PERIODS" :key="period" :value="period">Laatste {{ period }} dagen</option>
        </select>
      </label>
    </div>

    <section aria-label="Kerncijfers" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile v-for="tile in tiles" :key="tile.label" v-bind="tile" />
    </section>

    <ChartCard title="Klikken per dag" subtitle="Dagen volgens UTC" :table="dayChart.table" :empty="periodTotal ? '' : 'Nog geen klikken in deze periode.'">
      <EChart :option="dayChart.option" label="Klikken per dag" />
    </ChartCard>

    <div class="grid gap-4 xl:grid-cols-2">
      <ChartCard title="Per aanbieder" :table="providerChart.table" :empty="periodTotal ? '' : 'Nog geen klikken.'">
        <EChart :option="providerChart.option" label="Klikken per aanbieder" />
      </ChartCard>
      <ChartCard title="Per plek op de site" subtitle="Welke knop het meest wordt gebruikt" :table="sourceChart.table" :empty="periodTotal ? '' : 'Nog geen klikken.'">
        <EChart :option="sourceChart.option" label="Klikken per plek op de site" />
      </ChartCard>
    </div>

    <section v-if="parks.length" class="rounded-2xl bg-surface ring-1 ring-line" aria-labelledby="clicked-parks-title">
      <h2 id="clicked-parks-title" class="border-b border-line px-4 py-3 font-semibold sm:px-5">Meest aangeklikte parken</h2>
      <table class="w-full text-left text-sm">
        <thead class="text-ink-secondary">
          <tr class="border-b border-line">
            <th scope="col" class="px-4 py-2.5 font-medium sm:px-5">Park</th>
            <th scope="col" class="px-4 py-2.5 text-right font-medium sm:px-5">Klikken</th>
          </tr>
        </thead>
        <tbody class="tabular-nums">
          <tr v-for="park in parks" :key="park.parkCode" class="border-b border-line last:border-0 hover:bg-hover">
            <th scope="row" class="px-4 py-2 font-normal sm:px-5">
              <RouterLink :to="park.to" class="font-medium text-accent hover:underline">{{ park.name ?? park.parkCode }}</RouterLink>
              <span class="block text-xs text-ink-secondary">{{ park.provider }}</span>
            </th>
            <td class="px-4 py-2 text-right font-semibold sm:px-5">{{ count(park.clicks) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
