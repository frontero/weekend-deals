<script setup>
import { computed, ref } from 'vue';
import { bestWeekend } from '../lib/deals.js';
import { formatEuros, formatPercent, formatWeekend } from '../lib/format.js';
import { providerName, trackedBookingUrl } from '../lib/providers.js';
import GoogleRating from './GoogleRating.vue';
import Icon from './Icon.vue';

const props = defineProps({
  parks: { type: Array, required: true },
  minDiscount: { type: Number, required: true },
  // The travel party, for the booking links.
  settings: { type: Object, required: true },
});
defineEmits(['show-park']);

const INITIAL_ROWS = 20;
const showAll = ref(false);

// Every column sorts on its own value. The first click gives the order people usually want: A–Z, cheapest,
// earliest, biggest discount; the second click turns it around.
const COLUMNS = [
  { key: 'park', label: 'Park', value: (row) => row.park.name, first: 'ascending' },
  { key: 'normal', label: 'Normaal', value: (row) => row.park.baselineCents, first: 'ascending', right: true, cell: 'hidden sm:table-cell' },
  { key: 'weekend', label: 'Beste weekend', value: (row) => row.best.arrival, first: 'ascending', cell: 'hidden md:table-cell' },
  { key: 'price', label: 'Prijs', value: (row) => row.best.priceCents, first: 'ascending', right: true },
  { key: 'difference', label: 'Verschil', value: (row) => row.best.discount, first: 'descending', right: true },
];
const sort = ref({ key: 'difference', direction: 'descending' });

function sortBy(column) {
  const flip = sort.value.key === column.key && sort.value.direction === column.first;
  const opposite = column.first === 'ascending' ? 'descending' : 'ascending';
  sort.value = { key: column.key, direction: flip ? opposite : column.first };
}

const sortIcon = (column) => {
  if (sort.value.key !== column.key) return 'chevronUpDown';
  return sort.value.direction === 'ascending' ? 'chevronUp' : 'chevronDown';
};

const byName = (a, b) => a.park.name.localeCompare(b.park.name, 'nl', { sensitivity: 'base' });

function compareRows(column, direction) {
  const factor = direction === 'ascending' ? 1 : -1;
  return (a, b) => {
    const [x, y] = [column.value(a), column.value(b)];
    // A park without this value (no normal price yet) goes last, whichever way the column is sorted.
    if (x == null || y == null) return (x == null) - (y == null) || byName(a, b);
    const order = typeof x === 'string' ? x.localeCompare(y, 'nl', { sensitivity: 'base' }) : x - y;
    return factor * order || byName(a, b);
  };
}

function differenceLabel(discount) {
  if (discount === null) return '–';
  if (Math.round(discount * 100) === 0) return 'normaal';
  return discount >= 0 ? `${formatPercent(discount)} lager` : `${formatPercent(-discount)} hoger`;
}

const rows = computed(() => {
  const column = COLUMNS.find((candidate) => candidate.key === sort.value.key);
  return props.parks
    .map((park) => ({ park, best: bestWeekend(park) }))
    .sort(compareRows(column, sort.value.direction))
    .map(({ park, best }) => ({
      park,
      best,
      isDeal: best.discount !== null && best.discount >= props.minDiscount,
      normal: park.baselineCents ? formatEuros(park.baselineCents) : '–',
      bookUrl: trackedBookingUrl(park, best, props.settings, 'tabel'),
      provider: providerName(park.provider),
      difference: differenceLabel(best.discount),
    }));
});
const visibleRows = computed(() => (showAll.value ? rows.value : rows.value.slice(0, INITIAL_ROWS)));
</script>

<template>
  <div class="overflow-x-auto rounded-xl bg-surface ring-1 ring-line">
    <table class="w-full text-left text-sm">
      <thead class="border-b border-line text-xs text-ink-secondary">
        <tr>
          <th
            v-for="column in COLUMNS"
            :key="column.key"
            scope="col"
            class="px-4 py-2 font-medium"
            :class="[column.cell, column.right && 'text-right']"
            :aria-sort="sort.key === column.key ? sort.direction : undefined"
          >
            <button
              type="button"
              class="-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1 transition hover:bg-hover hover:text-ink"
              :class="sort.key === column.key && 'font-semibold text-ink'"
              @click="sortBy(column)"
            >
              {{ column.label }}
              <Icon :name="sortIcon(column)" class="size-3.5" :class="sort.key !== column.key && 'text-ink-muted'" />
            </button>
          </th>
          <th scope="col" class="px-4 py-2"><span class="sr-only">Boeken</span></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-line">
        <tr
          v-for="row in visibleRows"
          :key="row.park.code"
          class="cursor-pointer hover:bg-hover"
          @click="$emit('show-park', row.park)"
        >
          <td class="px-4 py-2.5">
            <button type="button" class="text-left font-medium hover:underline" @click.stop="$emit('show-park', row.park)">
              {{ row.park.name }}
            </button>
            <p class="text-xs text-ink-secondary">{{ row.park.region }}</p>
            <GoogleRating :rating="row.park.googleRating" as-button @select="$emit('show-park', row.park)" />
          </td>
          <td class="hidden px-4 py-2.5 text-right text-ink-secondary tabular-nums sm:table-cell">
            {{ row.normal }}
          </td>
          <td class="hidden px-4 py-2.5 md:table-cell">{{ formatWeekend(row.best) }}</td>
          <td class="px-4 py-2.5 text-right font-semibold tabular-nums">{{ formatEuros(row.best.priceCents) }}</td>
          <td class="px-4 py-2.5 text-right tabular-nums" :class="row.isDeal ? 'font-semibold text-good-ink' : 'text-ink-secondary'">
            {{ row.difference }}
          </td>
          <td class="px-4 py-2.5 text-right">
            <a
              :href="row.bookUrl"
              target="_blank"
              rel="sponsored noopener"
              class="inline-flex items-center gap-1 rounded-full bg-cta px-3 py-1.5 text-xs font-extrabold whitespace-nowrap text-on-cta hover:bg-cta-hover"
              @click.stop
            >
              Boek
              <span class="sr-only">{{ row.park.name }} bij {{ row.provider }} (opent in een nieuw tabblad)</span>
              <Icon name="external" class="size-3.5" />
            </a>
          </td>
        </tr>
      </tbody>
    </table>
    <button
      v-if="rows.length > INITIAL_ROWS"
      type="button"
      class="w-full border-t border-line px-4 py-3 text-sm font-medium text-accent hover:bg-hover"
      @click="showAll = !showAll"
    >
      {{ showAll ? 'Toon minder' : `Toon alle ${rows.length} parken` }}
    </button>
  </div>
</template>
