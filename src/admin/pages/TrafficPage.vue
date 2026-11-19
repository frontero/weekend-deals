<script setup>
import { computed, ref, watch } from 'vue';
import { brandName } from '../../lib/brands.js';
import { countryName, formatEuros, formatShortDate, formatTime, formatTimestamp } from '../../lib/format.js';
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
  'empty:filters': 'Zoeken zonder resultaat',
  'read:half': 'Pagina tot de helft gelezen',
  'read:end': 'Pagina tot het eind gelezen',
  'found:ja': 'Gevonden wat ze zochten: ja',
  'found:nee': 'Gevonden wat ze zochten: nee',
  'speed:load': 'Laadtijd gemeten',
  'speed:paint': 'Grootste beeld gemeten',
  'error:js1': 'Fout in de browser',
  'error:js2': 'Tweede fout in de browser',
  'error:js3': 'Derde fout in de browser',
};
const LANDINGS = {
  home: 'Zoekpagina',
  park: 'Parkpagina',
  parken: 'Alle parken',
  weekend: 'Weekendpagina',
  weekenden: 'Alle weekenden',
  regio: 'Regiopagina',
  thema: 'Themapagina',
  land: 'Landpagina',
  feestdag: 'Feestdagpagina',
  vakantie: 'Vakantiepagina',
  'last-minute': 'Last minute',
  'zo-werkt-het': 'Zo werkt het',
  privacy: 'Privacy',
  other: 'Andere pagina',
  onbekend: 'Onbekend',
};
const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '–');
const conversionRows = (rows, label) => rows.map((row) => ({ cells: [label(row), count(row.visitors), count(row.parkVisitors), count(row.clickers), percent(row.clickers, row.visitors)] }));
// What the clicks could bring in: both shares are guesses the admin can change, never figures of the site's own.
const bookingPercent = ref(5);
const feePercent = ref(5);
const SPEEDS = { load: 'Pagina geladen', paint: 'Grootste beeld in beeld' };
const seconds = (milliseconds) => `${(milliseconds / 1000).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
const filterNames = (value) => value.split(',').map((key) => (ACTIONS[`filter:${key}`] ?? key).replace(/^Filter /, '')).join(', ');
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

// One day opened from the list of days: what each visitor did, in order (GET /api/admin/traffic/day).
const opened = ref(null);
// closed, loading, failed or ready
const dayState = ref('closed');
const dayFailure = ref('');
const daySection = ref(null);
// time: who came first; steps: who did most.
const dayOrder = ref('time');
const dayVisitors = computed(() => {
  const visitors = [...(opened.value?.visitors ?? [])];
  return dayOrder.value === 'time'
    ? visitors.sort((a, b) => a.steps[0].at.localeCompare(b.steps[0].at))
    : visitors.sort((a, b) => b.steps.length - a.steps.length);
});
async function openDay(day) {
  opened.value = { day, visitors: [], parkNames: {} };
  dayState.value = 'loading';
  try {
    const response = await fetch(`/api/admin/traffic/day?day=${day}`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? `Day failed with ${response.status}`);
    opened.value = body;
    dayState.value = 'ready';
  } catch (error) {
    dayFailure.value = error.message;
    dayState.value = 'failed';
  }
  daySection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
/** One step in a visitor's day, in words. */
function stepText(step, parkNames) {
  const park = parkNames[step.value] ?? step.value;
  if (step.name === 'view') return `Opende ${step.path}`;
  if (step.name === 'click') return `Klikte door naar ${providerName(step.key)}${park ? ` voor ${park}` : ''}${step.number ? ` (${formatEuros(step.number * 100)})` : ''}`;
  if (step.name === 'park') return `${actionLabel(step)}: ${park}`;
  if (step.name === 'speed') return `${SPEEDS[step.key] ?? step.key} na ${seconds(step.number)}`;
  if (step.name === 'empty') return `Zocht zonder resultaat met: ${filterNames(step.value)}`;
  const choice = CHOICES[`${step.name}:${step.key}`];
  return `${actionLabel(step)}${step.value ? `: ${choice ? choice(step.value) : step.value}` : ''}`;
}
const visitorLine = (visitor) =>
  [DEVICES[visitor.device] ?? visitor.device, visitor.country && countryName(visitor.country), visitor.source && (visitor.source === 'direct' ? 'kwam rechtstreeks' : `via ${SOURCES[visitor.source] ?? visitor.source}`)]
    .filter(Boolean)
    .join(' · ');

const clickValue = computed(() => {
  const rows = report.value?.clickValue ?? [];
  const euros = rows.reduce((sum, row) => sum + row.euros, 0);
  return { rows, euros, clicks: rows.reduce((sum, row) => sum + row.clicks, 0), estimate: euros * (bookingPercent.value / 100) * (feePercent.value / 100) };
});
const tables = computed(() => [
  {
    id: 'days',
    title: 'Per dag: klik op een dag voor wat bezoekers deden',
    columns: ['Dag', 'Bezoekers', "Pagina's", 'Doorgeklikt'],
    rows: [...perDay.value]
      .reverse()
      .filter((row) => row.visitors)
      .map((row) => ({ cells: [formatShortDate(row.day), count(row.visitors), count(row.views), count(row.clicks)], day: row.day })),
  },
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
    id: 'by-source',
    title: 'Welke bron klikt door',
    columns: ['Bron van het eerste bezoek', 'Bezoekers', 'Bekeek een park', 'Klikte door', 'Aandeel'],
    rows: conversionRows(report.value?.bySource ?? [], (row) => SOURCES[row.source] ?? row.source),
  },
  {
    id: 'by-landing',
    title: 'Welke pagina werkt als binnenkomer',
    columns: ['Eerste pagina van het bezoek', 'Bezoekers', 'Bekeek een park', 'Klikte door', 'Aandeel'],
    rows: conversionRows(report.value?.byLanding ?? [], (row) => LANDINGS[row.kind] ?? row.kind),
  },
  {
    id: 'empty',
    title: 'Zoeken zonder resultaat',
    columns: ['Ingestelde filters', 'Bezoekers'],
    rows: (report.value?.choices ?? []).filter((row) => row.name === 'empty').map((row) => ({ cells: [filterNames(row.value), count(row.visitors)] })),
  },
  {
    id: 'click-discounts',
    title: 'Kliks naar korting',
    columns: ['Korting op de normale prijs', 'Kliks', 'Gemiddelde prijs'],
    rows: (report.value?.clickDiscounts ?? []).map((row) => ({
      cells: [row.discount < 0 ? 'Boven normaal' : `${row.discount} tot ${row.discount + 10}%`, count(row.clicks), formatEuros((row.euros / row.clicks) * 100)],
    })),
  },
  {
    id: 'click-weeks',
    title: 'Kliks: hoeveel weken vooruit',
    columns: ['Weken tot het weekend', 'Kliks'],
    rows: (report.value?.clickWeeks ?? []).map((row) => ({ cells: [count(row.weeks), count(row.clicks)] })),
  },
  {
    id: 'speed',
    title: 'Snelheid',
    columns: ['Meting', 'Apparaat', 'Gemiddeld', 'Metingen'],
    left: 2,
    rows: (report.value?.speed ?? []).map((row) => ({ cells: [SPEEDS[row.key] ?? row.key, DEVICES[row.device] ?? row.device, seconds(row.total / row.times), count(row.times)] })),
  },
  {
    id: 'errors',
    title: 'Fouten in de browser',
    columns: ['Melding', 'Bezoekers'],
    rows: (report.value?.choices ?? []).filter((row) => row.name === 'error').map((row) => ({ cells: [row.value, count(row.visitors)] })),
  },
  {
    id: 'feedback',
    title: 'Opmerkingen van bezoekers',
    columns: ['Opmerking', 'Gevonden', 'Pagina', 'Wanneer'],
    left: 4,
    rows: (report.value?.feedback ?? []).map((row) => ({ cells: [row.comment, row.found, row.path, formatTimestamp(row.at)] })),
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
                :class="index >= (table.left ?? (column === 'Keuze' ? 2 : 1)) ? 'text-right' : ''"
              >
                {{ column }}
              </th>
            </tr>
          </thead>
          <tbody class="tabular-nums">
            <tr v-for="(row, rowIndex) in table.rows" :key="rowIndex" class="border-b border-line last:border-0 hover:bg-hover">
              <th scope="row" class="px-4 py-2 font-normal sm:px-5">
                <RouterLink v-if="row.to" :to="row.to" class="font-medium text-accent hover:underline">{{ row.cells[0] }}</RouterLink>
                <button v-else-if="row.day" type="button" class="min-h-6 font-medium text-accent hover:underline" @click="openDay(row.day)">
                  {{ row.cells[0] }}
                </button>
                <template v-else>{{ row.cells[0] }}</template>
              </th>
              <td
                v-for="(cell, index) in row.cells.slice(1)"
                :key="index"
                class="px-4 py-2 sm:px-5"
                :class="index + 1 < (table.left ?? (table.columns[index + 1] === 'Keuze' ? 2 : 1)) ? '' : 'text-right font-semibold'"
              >
                {{ cell }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <section class="rounded-2xl bg-surface ring-1 ring-line" aria-labelledby="click-value-title">
      <h2 id="click-value-title" class="border-b border-line px-4 py-3 font-semibold sm:px-5">Waarop geklikt is, in euro's</h2>
      <p v-if="!clickValue.clicks" class="px-4 py-3 text-sm text-ink-secondary sm:px-5">
        Nog geen doorklik met een prijs geteld. De prijs wordt sinds 19 november bij elke doorklik bewaard.
      </p>
      <div v-else class="flex flex-col gap-3 px-4 py-3 text-sm sm:px-5">
        <p>
          <span class="text-2xl font-black tabular-nums">{{ formatEuros(clickValue.euros * 100) }}</span>
          <span class="text-ink-secondary"> aan weekenden waar bezoekers voor doorklikten, in {{ count(clickValue.clicks) }} {{ clickValue.clicks === 1 ? 'klik' : 'klikken' }}.</span>
        </p>
        <p class="flex flex-wrap items-center gap-2">
          Als
          <input v-model.number="bookingPercent" type="number" min="0" max="100" step="1" aria-label="Aandeel klikken dat boekt, in procenten" class="h-8 w-16 rounded-lg bg-plane px-2 ring-1 ring-field" />
          % van de klikken een boeking wordt en de aanbieder
          <input v-model.number="feePercent" type="number" min="0" max="100" step="0.5" aria-label="Vergoeding van de aanbieder, in procenten" class="h-8 w-16 rounded-lg bg-plane px-2 ring-1 ring-field" />
          % betaalt, is dat ongeveer <strong class="tabular-nums">{{ formatEuros(clickValue.estimate * 100) }}</strong>.
        </p>
        <p class="text-xs text-ink-secondary">Een schatting: beide percentages zijn aannames die je zelf invult. Wat een klik echt opleverde, staat straks bij het affiliate-netwerk.</p>
        <ul class="divide-y divide-line tabular-nums">
          <li v-for="row in [...clickValue.rows].reverse()" :key="row.day" class="flex justify-between gap-4 py-1.5">
            <span>{{ formatShortDate(row.day) }}</span>
            <span class="text-ink-secondary">{{ count(row.clicks) }} {{ row.clicks === 1 ? 'klik' : 'klikken' }}</span>
            <span class="font-semibold">{{ formatEuros(row.euros * 100) }}</span>
          </li>
        </ul>
      </div>
    </section>

    <section v-if="opened" ref="daySection" class="scroll-mt-4 rounded-2xl bg-surface ring-1 ring-line" aria-labelledby="day-title">
      <header class="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h2 id="day-title" class="flex-1 font-semibold">Wat bezoekers deden op {{ formatShortDate(opened.day) }}</h2>
        <button type="button" class="rounded-full px-3 py-1 text-sm font-medium ring-1 ring-line hover:ring-field" @click="opened = null">Sluiten</button>
      </header>
      <p v-if="dayState === 'loading'" class="px-4 py-3 text-sm text-ink-secondary sm:px-5" role="status">Laden…</p>
      <p v-else-if="dayState === 'failed'" class="px-4 py-3 text-sm text-warning-ink sm:px-5" role="status">
        Deze dag kon niet worden geladen. <code class="break-words">{{ dayFailure }}</code>
      </p>
      <p v-else-if="!opened.visitors.length" class="px-4 py-3 text-sm text-ink-secondary sm:px-5">Niets geteld op deze dag.</p>
      <template v-else>
        <div class="flex flex-wrap items-center gap-3 px-4 pt-3 text-sm sm:px-5">
          <p class="flex-1 text-ink-secondary">
            {{ count(opened.visitors.length) }} bezoekers. Een bezoeker is een code die alleen deze dag geldt; tijden zijn die van jouw computer.
          </p>
          <label class="flex items-center gap-2">
            <span class="text-ink-secondary">Sorteer op</span>
            <select v-model="dayOrder" class="h-9 rounded-xl bg-surface px-3 font-medium ring-1 ring-field">
              <option value="time">Tijd van bezoek</option>
              <option value="steps">Meeste stappen</option>
            </select>
          </label>
        </div>
        <ol class="grid gap-3 p-4 sm:p-5 xl:grid-cols-2">
          <li v-for="(visitor, index) in dayVisitors" :key="visitor.visitor" class="rounded-xl bg-plane p-3 ring-1 ring-line">
            <p class="text-sm font-semibold">
              Bezoeker {{ index + 1 }}
              <span class="font-normal text-ink-secondary">· {{ formatTime(visitor.steps[0].at) }} · {{ visitorLine(visitor) }} · {{ count(visitor.steps.length) }} {{ visitor.steps.length === 1 ? 'stap' : 'stappen' }}</span>
            </p>
            <ol class="mt-2 space-y-1 text-sm">
              <li v-for="(step, stepIndex) in visitor.steps" :key="stepIndex" class="flex gap-3">
                <time class="w-12 shrink-0 text-ink-secondary tabular-nums" :datetime="step.at">{{ formatTime(step.at) }}</time>
                <span class="min-w-0 break-words" :class="step.name === 'click' ? 'font-semibold text-good-ink' : ''">{{ stepText(step, opened.parkNames) }}</span>
              </li>
            </ol>
          </li>
        </ol>
      </template>
    </section>
  </div>
</template>