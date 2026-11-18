<script setup>
import { computed, ref, watch } from 'vue';
import { brandName } from '../../lib/brands.js';
import { countryName, formatShortDate } from '../../lib/format.js';
import { providerName } from '../../lib/providers.js';
import ChartCard from '../components/ChartCard.vue';
import EChart from '../components/EChart.vue';
import StatTile from '../components/StatTile.vue';
import { columns, countLabel } from '../lib/chart-options.js';
import { usePalette } from '../lib/palette.js';
import { count } from '../useRounds.js';

// Visitors, where they came from and what they used: anonymous counts from server/events.mjs, read back from
// Cloudflare Analytics Engine by GET /api/admin/traffic.
const PERIODS = [7, 30, 90];
const DAY_MS = 24 * 60 * 60 * 1000;
const SOURCES = {
  direct: 'Direct of onbekend',
  google: 'Google',
  bing: 'Bing',
  duckduckgo: 'DuckDuckGo',
  ecosia: 'Ecosia',
  yahoo: 'Yahoo',
  facebook: 'Facebook',
  instagram: 'Instagram',
  pinterest: 'Pinterest',
  reddit: 'Reddit',
  x: 'X',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
};
const DEVICES = { mobiel: 'Mobiel', tablet: 'Tablet', desktop: 'Computer' };
const SORTS = { deal: 'beste deal', price: 'laagste prijs', rating: 'Google-score', date: 'eerste weekend', distance: 'afstand' };
const ACTIONS = {
  'filter:search': 'Zoeken op park of regio',
  'filter:minDiscountPercent': 'Filter korting',
  'filter:maxPriceEuros': 'Filter maximumprijs',
  'filter:minRating': 'Filter Google-score',
  'filter:country': 'Filter land',
  'filter:facilities': 'Filter faciliteiten',
  'filter:brands': 'Filter soort park',
  'filter:distance': 'Filter afstand vanaf huis',
  'filter:clear': 'Wis alle filters',
  'weekend:strip': 'Weekend gekozen in de strook',
  'weekend:calendar': 'Datums gekozen in de kalender',
  'mode:map': 'Kaart bekeken',
  'mode:cards': 'Terug naar de lijst',
  'park:cards': 'Park geopend vanuit de lijst',
  'park:map': 'Park geopend vanaf de kaart',
  'alert:search': 'Prijsalarm geopend voor de zoekopdracht',
  'alert:park': 'Prijsalarm geopend voor één park',
  'alert:create': 'Prijsalarm aangezet',
  'party:save': 'Gezelschap gewijzigd',
  'more:cards': 'Meer parken geladen',
};
const actionLabel = ({ name, key }) =>
  ACTIONS[`${name}:${key}`] ??
  (name === 'sort' ? `Sorteren op ${SORTS[key] ?? key}` : name === 'click' ? `Doorgeklikt naar ${providerName(key)}` : `${name} ${key}`);
const party = (value) => {
  const [adults, children, pets] = value.split('-').map(Number);
  return [`${adults} volw.`, children && `${children} kind.`, pets && `${pets} huisdier${pets === 1 ? '' : 'en'}`].filter(Boolean).join(', ');
};
// How a chosen option reads, per control.
const CHOICES = {
  'filter:brands': (value) => value.split(',').map(brandName).join(', '),
  'filter:country': (value) => value.split(',').map(countryName).join(', '),
  'filter:facilities': (value) => value.replaceAll('-', ' ').replaceAll(',', ', '),
  'filter:minDiscountPercent': (value) => `${value}% onder normaal`,
  'filter:maxPriceEuros': (value) => `tot € ${value}`,
  'filter:minRating': (value) => `${value.replace('.', ',')} of hoger`,
  'filter:distance': (value) => `binnen ${value} km`,
  'weekend:strip': formatShortDate,
  'weekend:calendar': formatShortDate,
  'party:save': party,
};
const CHOICES_PER_CONTROL = 5;

const palette = usePalette();
const days = ref(30);
const report = ref(null);
// What went wrong, as the server tells it.
const failure = ref('');
// loading, failed or ready
const state = ref('loading');

async function load() {
  try {
    const response = await fetch(`/api/admin/traffic?days=${days.value}`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? `Traffic failed with ${response.status}`);
    report.value = body;
    state.value = 'ready';
  } catch (error) {
    failure.value = error.message;
    state.value = 'failed';
  }
}
watch(days, load, { immediate: true });

const configured = computed(() => report.value?.configured !== false);
const perDay = computed(() => {
  const byDay = new Map((report.value?.days ?? []).map((row) => [row.day, row]));
  return Array.from({ length: days.value }, (_, index) => {
    const day = new Date(Date.now() - (days.value - 1 - index) * DAY_MS).toISOString().slice(0, 10);
    return { visitors: 0, views: 0, clicks: 0, parkVisitors: 0, clickers: 0, ...byDay.get(day), day };
  });
});
const total = (field) => perDay.value.reduce((sum, row) => sum + row[field], 0);
const totals = computed(() => ({
  visitors: total('visitors'),
  views: total('views'),
  parkVisitors: total('parkVisitors'),
  clickers: total('clickers'),
}));
const share = (part) => (totals.value.visitors ? `${Math.round((part / totals.value.visitors) * 100)}% van de bezoekers` : '');

const tiles = computed(() => [
  {
    label: `Bezoekers, laatste ${days.value} dagen`,
    value: count(totals.value.visitors),
    hint: 'Per dag geteld',
    trend: perDay.value.map((row) => row.visitors),
  },
  { label: "Pagina's bekeken", value: count(totals.value.views), trend: perDay.value.map((row) => row.views) },
  { label: 'Bekeek een park', value: count(totals.value.parkVisitors), hint: share(totals.value.parkVisitors) },
  { label: 'Klikte door naar een aanbieder', value: count(totals.value.clickers), hint: share(totals.value.clickers) },
]);

const chart = (rows, label, valueOf, name, heading) => ({
  option: columns(palette.value, { labels: rows.map(label), values: rows.map(valueOf), name, valueFormatter: countLabel }),
  table: { columns: [{ label: heading }, { label: 'Bezoekers', align: 'right' }], rows: rows.map((row) => [label(row), count(valueOf(row))]) },
});
const dayChart = computed(() => chart(perDay.value, (row) => formatShortDate(row.day), (row) => row.visitors, 'bezoekers', 'Dag'));
const funnelChart = computed(() =>
  chart(
    [
      { label: 'Kwam op de site', visitors: totals.value.visitors },
      { label: 'Bekeek een park', visitors: totals.value.parkVisitors },
      { label: 'Klikte door', visitors: totals.value.clickers },
    ],
    (row) => row.label,
    (row) => row.visitors,
    'bezoekers',
    'Stap',
  ),
);
const visitorsOf = (row) => row.visitors;
const sourceChart = computed(() => chart(report.value?.sources ?? [], (row) => SOURCES[row.source] ?? row.source, visitorsOf, 'bezoekers', 'Bron'));
const deviceChart = computed(() => chart(report.value?.devices ?? [], (row) => DEVICES[row.device] ?? row.device, visitorsOf, 'bezoekers', 'Apparaat'));
const countryChart = computed(() =>
  chart(report.value?.countries ?? [], (row) => (row.country ? countryName(row.country) : 'Onbekend'), visitorsOf, 'bezoekers', 'Land'),
);

// Per park how many visitors opened it and how many clicked through to book.
const parks = computed(() => {
  const names = report.value?.parkNames ?? {};
  const byCode = new Map();
  for (const row of report.value?.choices ?? []) {
    if (row.name !== 'park' && row.name !== 'click') continue;
    const park = byCode.get(row.value) ?? { code: row.value, opened: 0, clicked: 0 };
    park[row.name === 'park' ? 'opened' : 'clicked'] += row.visitors;
    byCode.set(row.value, park);
  }
  return [...byCode.values()]
    .sort((a, b) => b.opened - a.opened || b.clicked - a.clicked)
    .slice(0, 20)
    .map((park) => ({ ...park, name: names[park.code] ?? park.code, to: `/beheer/parken/${encodeURIComponent(park.code)}` }));
});

const tables = computed(() => [
  {
    id: 'actions',
    title: 'Wat bezoekers gebruiken',
    columns: ['Onderdeel', 'Bezoekers', 'Keer'],
    rows: (report.value?.actions ?? []).map((row) => ({ cells: [actionLabel(row), count(row.visitors), count(row.uses)] })),
  },
  {
    id: 'choices',
    title: 'Wat ze kiezen',
    columns: ['Onderdeel', 'Keuze', 'Bezoekers'],
    rows: Object.entries(CHOICES).flatMap(([control, format]) =>
      (report.value?.choices ?? [])
        .filter((row) => `${row.name}:${row.key}` === control)
        .slice(0, CHOICES_PER_CONTROL)
        .map((row) => ({ cells: [actionLabel(row), format(row.value), count(row.visitors)] })),
    ),
  },
  {
    id: 'parks',
    title: 'Parken: bekeken en doorgeklikt',
    columns: ['Park', 'Bekeken', 'Doorgeklikt'],
    rows: parks.value.map((park) => ({ cells: [park.name, count(park.opened), count(park.clicked)], to: park.to })),
  },
  {
    id: 'pages',
    title: "Meest bekeken pagina's",
    columns: ['Pagina', 'Weergaven', 'Bezoekers'],
    rows: (report.value?.pages ?? []).map((row) => ({ cells: [row.path, count(row.views), count(row.visitors)] })),
  },
]);
</script>

<template>
  <p v-if="state === 'loading'" class="text-ink-secondary" role="status">Laden…</p>
  <p v-else-if="state === 'failed'" class="rounded-2xl bg-warning-wash px-4 py-3 text-sm text-warning-ink" role="status">
    De bezoekers konden niet worden geladen.
    <code class="mt-1 block text-xs break-words">{{ failure }}</code>
  </p>
  <div v-else-if="!configured" class="max-w-3xl rounded-2xl bg-surface p-5 ring-1 ring-line">
    <h2 class="font-semibold">Nog geen leessleutel</h2>
    <p class="mt-2 text-ink-secondary">
      De site telt bezoeken al, maar deze pagina kan ze pas lezen met een Cloudflare API-token met alleen
      <em>Account Analytics: Read</em>, als geheim <code>ANALYTICS_READ_TOKEN</code> van de Worker.
    </p>
  </div>
  <div v-else class="flex flex-col gap-6">
    <div class="flex flex-wrap items-center gap-3">
      <p class="max-w-3xl flex-1 text-ink-secondary">
        Anoniem geteld, zonder cookies: een bezoeker is een code die één dag geldt. Zoekmachines en je eigen bezoeken
        als beheerder tellen niet mee.
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

    <ChartCard title="Bezoekers per dag" subtitle="Dagen volgens UTC" :table="dayChart.table" :empty="totals.visitors ? '' : 'Nog geen bezoekers in deze periode.'">
      <EChart :option="dayChart.option" label="Bezoekers per dag" />
    </ChartCard>

    <div class="grid gap-4 xl:grid-cols-2">
      <ChartCard title="Van bezoek naar boeking" subtitle="Hoeveel bezoekers elke stap haalden" :table="funnelChart.table" :empty="totals.visitors ? '' : 'Nog geen bezoekers.'">
        <EChart :option="funnelChart.option" label="Bezoekers per stap" />
      </ChartCard>
      <ChartCard title="Waar ze vandaan komen" subtitle="De site of campagne die ze stuurde" :table="sourceChart.table" :empty="report.sources.length ? '' : 'Nog geen bezoekers.'">
        <EChart :option="sourceChart.option" label="Bezoekers per bron" />
      </ChartCard>
      <ChartCard title="Apparaat" :table="deviceChart.table" :empty="report.devices.length ? '' : 'Nog geen bezoekers.'">
        <EChart :option="deviceChart.option" label="Bezoekers per apparaat" />
      </ChartCard>
      <ChartCard title="Land" :table="countryChart.table" :empty="report.countries.length ? '' : 'Nog geen bezoekers.'">
        <EChart :option="countryChart.option" label="Bezoekers per land" />
      </ChartCard>
    </div>

    <div class="grid gap-4 xl:grid-cols-2">
      <section v-for="table in tables" :key="table.id" class="rounded-2xl bg-surface ring-1 ring-line" :aria-labelledby="`${table.id}-title`">
        <h2 :id="`${table.id}-title`" class="border-b border-line px-4 py-3 font-semibold sm:px-5">{{ table.title }}</h2>
        <p v-if="!table.rows.length" class="px-4 py-3 text-sm text-ink-secondary sm:px-5">Nog niets geteld.</p>
        <table v-else class="w-full text-left text-sm">
          <thead class="text-ink-secondary">
            <tr class="border-b border-line">
              <th
                v-for="(column, index) in table.columns"
                :key="column"
                scope="col"
                class="px-4 py-2.5 font-medium sm:px-5"
                :class="index && column !== 'Keuze' ? 'text-right' : ''"
              >
                {{ column }}
              </th>
            </tr>
          </thead>
          <tbody class="tabular-nums">
            <tr v-for="(row, rowIndex) in table.rows" :key="rowIndex" class="border-b border-line last:border-0 hover:bg-hover">
              <th scope="row" class="px-4 py-2 font-normal sm:px-5">
                <RouterLink v-if="row.to" :to="row.to" class="font-medium text-accent hover:underline">{{ row.cells[0] }}</RouterLink>
                <template v-else>{{ row.cells[0] }}</template>
              </th>
              <td
                v-for="(cell, index) in row.cells.slice(1)"
                :key="index"
                class="px-4 py-2 sm:px-5"
                :class="table.columns[index + 1] === 'Keuze' ? '' : 'text-right font-semibold'"
              >
                {{ cell }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </div>
</template>
