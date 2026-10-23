<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../../components/Icon.vue';
import { countryName, formatEuros, formatShortDate } from '../../lib/format.js';
import { providerName } from '../../lib/providers.js';
import ChartCard from '../components/ChartCard.vue';
import EChart from '../components/EChart.vue';
import Sparkline from '../components/Sparkline.vue';
import { percentChange } from '../lib/analysis.js';
import { euroLabel, euros, scatter } from '../lib/chart-options.js';
import { PROVIDER_ORDER, providerColor, usePalette } from '../lib/palette.js';
import { useAdmin } from '../useAdmin.js';
import { count } from '../useRounds.js';

const PAGE_SIZE = 50;
const SORTS = [
  { value: 'drop', label: 'Grootste daling', compare: (a, b) => (a.change ?? Infinity) - (b.change ?? Infinity) },
  { value: 'rise', label: 'Grootste stijging', compare: (a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity) },
  { value: 'price', label: 'Laagste prijs', compare: (a, b) => (a.min ?? Infinity) - (b.min ?? Infinity) },
  { value: 'changes', label: 'Meeste wijzigingen', compare: (a, b) => b.changes - a.changes },
  { value: 'free', label: 'Minste plek', compare: (a, b) => a.weekends - b.weekends },
  { value: 'name', label: 'Naam', compare: (a, b) => a.name.localeCompare(b.name, 'nl') },
];

const router = useRouter();
const { stats, statsState, sizeLabel } = useAdmin();
const palette = usePalette();

const search = ref('');
const provider = ref('');
const sort = ref('drop');
const onlyFree = ref(true);
const shown = ref(PAGE_SIZE);

const since = computed(() => (stats.value?.beforeAt ? formatShortDate(stats.value.beforeAt.slice(0, 10)) : ''));

const parks = computed(() =>
  (stats.value?.parks ?? []).map((park) => ({
    ...park,
    change: percentChange(park.beforeMin, park.min),
    place: [park.city, countryName(park.country)].filter(Boolean).join(', '),
    providerLabel: providerName(park.provider),
  })),
);

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase();
  const compare = SORTS.find((item) => item.value === sort.value).compare;
  return parks.value
    .filter((park) => !query || `${park.name} ${park.place}`.toLowerCase().includes(query))
    .filter((park) => !provider.value || park.provider === provider.value)
    .filter((park) => !onlyFree.value || park.min != null)
    .sort(compare);
});

const rows = computed(() =>
  filtered.value.slice(0, shown.value).map((park) => ({
    ...park,
    to: `/beheer/parken/${encodeURIComponent(park.code)}`,
    price: park.min == null ? 'Vol' : formatEuros(park.min),
    lowest: Number.isFinite(park.lowest) ? formatEuros(park.lowest) : '–',
    changeText: park.change == null ? '–' : `${park.change > 0 ? '+' : ''}${park.change.toLocaleString('nl-NL')}%`,
    changeClass: park.change == null || park.change === 0 ? 'text-ink-secondary' : park.change < 0 ? 'text-good-ink' : 'text-warning-ink',
  })),
);

const providers = computed(() => PROVIDER_ORDER.filter((id) => parks.value.some((park) => park.provider === id)));

// Every park with a price now: where its price is, and how far it moved in about a week.
const moversChart = computed(() => {
  const withChange = filtered.value.filter((park) => park.min != null && park.change != null);
  const groups = providers.value.map((id) => ({
    name: providerName(id),
    color: providerColor(palette.value, id),
    points: withChange
      .filter((park) => park.provider === id)
      .map((park) => ({
        x: euros(park.min),
        y: park.change,
        code: park.code,
        title: park.name,
        rows: [
          ['laagste prijs nu', euroLabel(euros(park.min))],
          [`sinds ${since.value}`, `${park.change > 0 ? '+' : ''}${park.change.toLocaleString('nl-NL')}%`],
          ['weekenden vrij', String(park.weekends)],
        ],
      })),
  }));
  return {
    empty: withChange.length ? '' : 'Nog geen parken om te vergelijken.',
    option: scatter(palette.value, { groups, xName: 'laagste prijs nu', yName: `verandering sinds ${since.value}`, markY: 0 }),
    table: {
      columns: [{ label: 'Park' }, { label: 'Laagste prijs nu', align: 'right' }, { label: 'Verandering', align: 'right' }],
      rows: withChange.map((park) => [park.name, formatEuros(park.min), `${park.change.toLocaleString('nl-NL')}%`]),
    },
  };
});

const openPark = (event) => {
  if (event.data?.code) router.push(`/beheer/parken/${encodeURIComponent(event.data.code)}`);
};
</script>

<template>
  <p v-if="statsState === 'missing'" class="rounded-2xl bg-surface px-4 py-10 text-center text-ink-secondary ring-1 ring-line">
    De parken worden na de volgende ronde berekend.
  </p>
  <div v-else-if="stats" class="flex flex-col gap-6">
    <ChartCard
      title="Prijs en verandering per park"
      :subtitle="`Elke stip is een park: de laagste prijs nu voor ${sizeLabel}, en hoeveel die veranderde sinds ${since}. Klik op een stip voor het park.`"
      :table="moversChart.table"
      :empty="moversChart.empty"
    >
      <EChart :option="moversChart.option" height="22rem" label="Parken naar prijs en prijsverandering" @select="openPark" />
    </ChartCard>

    <section class="rounded-2xl bg-surface ring-1 ring-line" aria-labelledby="parks-title">
      <div class="flex flex-wrap items-center gap-3 border-b border-line p-4 sm:px-5">
        <h2 id="parks-title" class="mr-auto font-semibold">
          {{ count(filtered.length) }} parken
          <span class="font-normal text-ink-secondary">· {{ sizeLabel }}</span>
        </h2>
        <label class="relative">
          <span class="sr-only">Zoek een park</span>
          <Icon name="search" class="pointer-events-none absolute top-2.5 left-3 size-4 text-ink-secondary" />
          <input
            v-model="search"
            type="search"
            placeholder="Zoek een park of plaats"
            class="h-9 w-56 rounded-xl bg-plane pr-3 pl-9 text-sm ring-1 ring-field placeholder:text-ink-muted"
          />
        </label>
        <label class="flex items-center gap-2 text-sm">
          <span class="sr-only">Aanbieder</span>
          <select v-model="provider" class="h-9 rounded-xl bg-surface px-3 ring-1 ring-field">
            <option value="">Alle aanbieders</option>
            <option v-for="id in providers" :key="id" :value="id">{{ providerName(id) }}</option>
          </select>
        </label>
        <label class="flex items-center gap-2 text-sm">
          <span class="text-ink-secondary">Sorteer</span>
          <select v-model="sort" class="h-9 rounded-xl bg-surface px-3 ring-1 ring-field">
            <option v-for="item in SORTS" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <label class="flex cursor-pointer items-center gap-2 text-sm select-none">
          <input v-model="onlyFree" type="checkbox" class="size-4 accent-accent" />
          Alleen met plek
        </label>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[52rem] text-left text-sm">
          <thead class="text-ink-secondary">
            <tr class="border-b border-line">
              <th scope="col" class="px-4 py-2.5 font-medium sm:px-5">Park</th>
              <th scope="col" class="px-3 py-2.5 text-right font-medium">Weekenden vrij</th>
              <th scope="col" class="px-3 py-2.5 text-right font-medium">Laagste nu</th>
              <th scope="col" class="px-3 py-2.5 text-right font-medium">Sinds {{ since }}</th>
              <th scope="col" class="px-3 py-2.5 font-medium">Verloop</th>
              <th scope="col" class="px-3 py-2.5 text-right font-medium">Laagst gemeten</th>
              <th scope="col" class="px-4 py-2.5 text-right font-medium sm:px-5">Wijzigingen</th>
            </tr>
          </thead>
          <tbody class="tabular-nums">
            <tr v-for="park in rows" :key="park.code" class="border-b border-line transition last:border-0 hover:bg-hover">
              <th scope="row" class="px-4 py-2 font-normal sm:px-5">
                <RouterLink :to="park.to" class="font-medium text-accent hover:underline">{{ park.name }}</RouterLink>
                <span class="block text-xs text-ink-secondary">{{ park.providerLabel }}<template v-if="park.place"> · {{ park.place }}</template></span>
              </th>
              <td class="px-3 py-2 text-right">{{ park.weekends }}</td>
              <td class="px-3 py-2 text-right font-semibold">{{ park.price }}</td>
              <td class="px-3 py-2 text-right font-medium" :class="park.changeClass">{{ park.changeText }}</td>
              <td class="px-3 py-2"><Sparkline :values="park.spark" /></td>
              <td class="px-3 py-2 text-right">{{ park.lowest }}</td>
              <td class="px-4 py-2 text-right sm:px-5">{{ park.changes }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="filtered.length > shown" class="border-t border-line p-3 text-center">
        <button type="button" class="rounded-lg px-4 py-2 text-sm font-medium text-accent hover:bg-hover" @click="shown += PAGE_SIZE">
          Toon meer ({{ count(filtered.length - shown) }} over)
        </button>
      </div>
    </section>
  </div>
  <p v-else class="text-ink-secondary" role="status">Laden…</p>
</template>
