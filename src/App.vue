<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { marketByWeekend } from '../shared/analysis.mjs';
import { toFacilityId } from '../shared/facilities.mjs';
import { distanceKm } from '../shared/geo.mjs';
import { partyOf } from '../shared/party.mjs';
import ActiveFilters from './components/ActiveFilters.vue';
import AlertsDialog from './components/AlertsDialog.vue';
import AppBar from './components/AppBar.vue';
import DatePicker from './components/DatePicker.vue';
import DealCard from './components/DealCard.vue';
// The map and its library load only when the map is shown.
const ParkMap = defineAsyncComponent(() => import('./components/ParkMap.vue'));
import FilterPanel from './components/FilterPanel.vue';
import FilterSheet from './components/FilterSheet.vue';
import Icon from './components/Icon.vue';
import ParkDrawer from './components/ParkDrawer.vue';
import ParkTable from './components/ParkTable.vue';
import SettingsDialog from './components/SettingsDialog.vue';
import StatusNotices from './components/StatusNotices.vue';
import WeekendStrip from './components/WeekendStrip.vue';
import { useHomeLocation } from './composables/useHomeLocation.js';
import { useOverview } from './composables/useOverview.js';
import { useQueryState } from './composables/useQueryState.js';
import { countFacilities, filterParks, onePerPark, searchDeals, sortDeals, withinDates } from './lib/deals.js';
import { countryName, formatRating, formatShortDate, formatWeekend } from './lib/format.js';
import { weekendLevels } from './lib/insights.js';
import { writeQuery } from './lib/urlState.js';
import { brandDot, brandName } from './lib/brands.js';

const PAGE_SIZE = 12;
const DEFAULTS = {
  from: '',
  to: '',
  minDiscountPercent: 20,
  maxPriceEuros: null,
  minRating: 0,
  country: '',
  search: '',
  facilities: [],
  brands: [],
  sort: 'deal',
};
const FILTER_KEYS = Object.keys(DEFAULTS).filter((key) => key !== 'sort');
const RATING_STEPS = [4.5, 4.3, 4, 3.5];
const SORT_OPTIONS = [
  { value: 'deal', label: 'Beste deal' },
  { value: 'price', label: 'Laagste prijs' },
  { value: 'rating', label: 'Hoogste Google-score' },
  { value: 'date', label: 'Eerste weekend' },
];
const DISTANCE_SORT = { value: 'distance', label: 'Dichtstbij' };

const { overview, failed, startScan, saveSettings } = useOverview();
const { state: filters, reset } = useQueryState(DEFAULTS);
// Links from before the app's own filter list name Landal's ids; the checkboxes and chips use the app's own.
const ownFacilityIds = [...new Set(filters.facilities.map(toFacilityId).filter(Boolean))];
if (ownFacilityIds.join() !== filters.facilities.join()) filters.facilities = ownFacilityIds;
// The home address stays out of the URL, so it lives apart from the other filters.
const home = useHomeLocation();
const parkFilters = computed(() => ({ ...filters, maxDistanceKm: home.maxDistanceKm }));
const sortOptions = computed(() => (home.origin ? [...SORT_OPTIONS, DISTANCE_SORT] : SORT_OPTIONS));

const settingsOpen = ref(false);
const alertsOpen = ref(false);
// The results as cards or on a map.
const view = ref('cards');
// An alert on one park's weekend, from the park panel; otherwise the dialog offers one on the whole search.
const parkAlert = ref(null);
watch(alertsOpen, (isOpen) => {
  if (!isOpen) parkAlert.value = null;
});
const filtersOpen = ref(false);
const calendarOpen = ref(false);
const opened = ref(null);
const visibleCount = ref(PAGE_SIZE);
watch(
  () => JSON.stringify(parkFilters.value),
  () => {
    visibleCount.value = PAGE_SIZE;
  },
);

const parks = computed(() =>
  (overview.value?.parks ?? []).map((park) => ({
    ...park,
    distanceKm: home.origin && park.lat != null ? distanceKm(home.origin, park) : null,
  })),
);
// What the table and the park panel mark as a deal; with the discount filter off, anything below normal.
const minDiscount = computed(() => Math.max(filters.minDiscountPercent, 1) / 100);
const discountLabel = computed(() =>
  filters.minDiscountPercent ? `${filters.minDiscountPercent}%+ onder normaal` : 'Alle prijzen',
);
const weekendParks = computed(() => withinDates(parks.value, filters.from, filters.to));
const visibleParks = computed(() => filterParks(weekendParks.value, parkFilters.value));
// Also what a price alert on this search watches for.
const search = computed(() => ({ ...parkFilters.value, origin: home.origin }));
const deals = computed(() => sortDeals(searchDeals(overview.value?.parks ?? [], search.value), filters.sort));
// The screen lists each park once; a price alert still watches every weekend.
const cards = computed(() => onePerPark(deals.value));
const shownDeals = computed(() => cards.value.slice(0, visibleCount.value));

// The weekend strip and calendar follow every filter except the chosen dates themselves.
const stripParks = computed(() => filterParks(parks.value, parkFilters.value));
const strip = computed(() => weekendLevels(marketByWeekend(stripParks.value)));
const periodLabel = computed(() => {
  if (!filters.from) return '';
  const last = filters.to || filters.from;
  if (last !== filters.from) return `${formatShortDate(filters.from)} – ${formatShortDate(last)}`;
  const weekend = strip.value.find((item) => item.arrival === filters.from);
  return weekend ? formatWeekend(weekend) : formatShortDate(filters.from);
});

const facilityGroups = computed(() => overview.value?.facilityGroups ?? []);
const facilityCounts = computed(() => countFacilities(facilityGroups.value, visibleParks.value));
const facilityNames = computed(
  () => new Map(facilityGroups.value.flatMap((group) => group.options.map((option) => [option.id, option.name]))),
);
const ratingsAvailable = computed(() => parks.value.some((park) => park.googleRating));

// Each option counts the parks it would leave, with all other filters applied.
const countryOptions = computed(() => {
  const pool = filterParks(weekendParks.value, { ...parkFilters.value, country: '' });
  const counts = new Map();
  for (const park of pool) if (park.country) counts.set(park.country, (counts.get(park.country) ?? 0) + 1);
  return [
    { value: '', label: 'Alle landen', count: pool.length },
    ...[...counts]
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ value: code, label: countryName(code), count })),
  ];
});
const brandOptions = computed(() => {
  const pool = filterParks(weekendParks.value, { ...parkFilters.value, brands: [] });
  const counts = new Map();
  for (const park of pool) counts.set(park.brand, (counts.get(park.brand) ?? 0) + 1);
  return [...new Set([...counts.keys(), ...filters.brands])]
    .map((id) => ({ value: id, label: brandName(id), dot: brandDot(id), count: counts.get(id) ?? 0 }))
    .sort((a, b) => b.count - a.count);
});
const ratingOptions = computed(() => {
  const pool = filterParks(weekendParks.value, { ...parkFilters.value, minRating: 0 });
  return [
    { value: 0, label: 'Alle parken', count: pool.length },
    ...RATING_STEPS.map((step) => ({
      value: step,
      label: `★ ${formatRating(step)} of hoger`,
      count: pool.filter((park) => (park.googleRating?.rating ?? 0) >= step).length,
    })),
  ];
});

const chips = computed(() =>
  [
    filters.from && { key: 'dates', label: periodLabel.value },
    home.origin && home.maxDistanceKm && {
      key: 'distance',
      label: `≤ ${home.maxDistanceKm} km van ${home.origin.label.split(',')[0]}`,
    },
    filters.minDiscountPercent !== DEFAULTS.minDiscountPercent && {
      key: 'minDiscountPercent',
      label: discountLabel.value,
    },
    filters.maxPriceEuros && { key: 'maxPriceEuros', label: `Max € ${filters.maxPriceEuros}` },
    filters.minRating && { key: 'minRating', label: `Google ${formatRating(filters.minRating)}+` },
    filters.country && { key: 'country', label: countryName(filters.country) },
    filters.search.trim() && { key: 'search', label: `“${filters.search.trim()}”` },
    ...filters.brands.map((id) => ({ key: `brand:${id}`, label: brandName(id) })),
    ...filters.facilities.map((id) => ({ key: `facility:${id}`, label: facilityNames.value.get(id) ?? id })),
  ].filter(Boolean),
);

// A price alert on what is on screen now: these filters, this party, and the deals already shown.
const alertDraft = computed(() => {
  const discount = discountLabel.value;
  const labels = chips.value.filter((chip) => chip.key !== 'minDiscountPercent').map((chip) => chip.label);
  return {
    party: partyOf(overview.value.settings),
    search: search.value,
    query: writeQuery(filters, DEFAULTS),
    label: [discount, ...labels].join(' · '),
    seen: deals.value.map(({ park, weekend }) => ({ parkCode: park.code, arrival: weekend.arrival, priceCents: weekend.priceCents })),
    primed: overview.value.partyPending === false,
  };
});

function openParkAlert({ park, weekend }) {
  parkAlert.value = {
    party: partyOf(overview.value.settings),
    search: { parks: [park.code], from: weekend.arrival, to: weekend.arrival, minDiscountPercent: 0 },
    query: writeQuery({ ...DEFAULTS, from: weekend.arrival, to: weekend.arrival, search: park.name, minDiscountPercent: 0 }, DEFAULTS),
    label: `${park.name} · ${formatWeekend(weekend)}`,
    // The dialog asks below which price to send a message.
    watch: { parkCode: park.code, arrival: weekend.arrival, priceCents: weekend.priceCents },
    seen: [],
    primed: overview.value.partyPending === false,
  };
  alertsOpen.value = true;
}

function removeChip(key) {
  if (key.startsWith('facility:')) {
    filters.facilities = filters.facilities.filter((id) => `facility:${id}` !== key);
  } else if (key.startsWith('brand:')) {
    filters.brands = filters.brands.filter((id) => `brand:${id}` !== key);
  } else if (key === 'dates') {
    reset(['from', 'to']);
  } else if (key === 'distance') {
    home.maxDistanceKm = null;
  } else {
    reset([key]);
  }
}
function clearFilters() {
  reset(FILTER_KEYS);
  home.maxDistanceKm = null;
}

const openedPark = computed(() => parks.value.find((park) => park.code === opened.value?.code) ?? null);
/** @param reviews open the park panel at its Google reviews, as the rating on a card does */
const openPark = (park, arrival = '', reviews = false) => {
  opened.value = { code: park.code, arrival, reviews };
};

const isLoading = computed(() => !overview.value && !failed.value);
const hasPrices = computed(() => parks.value.length > 0);
const isScanning = computed(() => overview.value?.scan.running ?? false);
</script>

<template>
  <AppBar
    v-if="overview"
    :settings="overview.settings"
    :scan="overview.scan"
    :accommodation-groups="overview.accommodationGroups"
    :admin="overview.admin"
    @open-settings="settingsOpen = true"
    @refresh="startScan"
  />
  <div v-else class="h-[61px] border-b border-line bg-surface" />

  <!-- What and when, on a band of its own above the results, like the search area of the big booking sites.
       Tighter on phones, so the first deals show without scrolling far. -->
  <section class="rounded-b-[2.5rem] bg-accent-wash" aria-labelledby="page-title">
    <div class="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:gap-6 sm:px-6 sm:py-8">
      <div>
        <h1 id="page-title" class="text-2xl font-black tracking-tight sm:text-4xl">
          Buitenkansjes voor een
          <span class="inline-block -rotate-1 rounded-3xl bg-sun px-2 text-on-sun">weekendje weg</span>
        </h1>
        <p class="mt-2 max-w-2xl text-sm font-semibold text-ink-secondary sm:text-base">
          Weekenden (vrijdag tot maandag) bij Landal, Topparken en Molecaten die duidelijk onder de normale prijs van
          het park zitten.
        </p>
      </div>
      <WeekendStrip
        v-if="strip.length"
        v-model:from="filters.from"
        v-model:to="filters.to"
        :weekends="strip"
        :park-count="stripParks.length"
        @open-calendar="calendarOpen = true"
      />
    </div>
  </section>

  <main class="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:gap-6 sm:px-6 sm:py-8">
    <StatusNotices
      :failed="failed"
      :scan="overview?.scan ?? null"
      :google="overview?.google ?? null"
      :providers="overview?.providers ?? []"
      :party-pending="overview?.partyPending ?? false"
      :admin="overview?.admin ?? false"
    />

    <div class="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8">
      <aside class="hidden lg:block" aria-labelledby="filters-title">
        <!-- Scrolling clips at the edges, so a little room around the card keeps its ring and focus outlines whole. -->
        <div class="sticky top-24 -mx-1 max-h-[calc(100dvh-7rem)] overflow-y-auto px-1 pt-1 pb-6 [scrollbar-width:thin]">
          <div class="rounded-3xl bg-surface ring-1 ring-line">
            <div class="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <h2 id="filters-title" class="font-semibold">Filters</h2>
              <button
                v-if="chips.length"
                type="button"
                class="rounded text-sm font-medium text-accent hover:underline"
                @click="clearFilters"
              >
                Wis alles
              </button>
            </div>
            <div class="px-4 pt-4 pb-2">
              <FilterPanel
                v-model:search="filters.search"
                v-model:min-discount-percent="filters.minDiscountPercent"
                v-model:max-price-euros="filters.maxPriceEuros"
                v-model:min-rating="filters.minRating"
                v-model:country="filters.country"
                v-model:facilities="filters.facilities"
                v-model:origin="home.origin"
                v-model:max-distance-km="home.maxDistanceKm"
                v-model:brands="filters.brands"
                :brand-options="brandOptions"
                :country-options="countryOptions"
                :rating-options="ratingOptions"
                :facility-groups="facilityCounts"
                :ratings-available="ratingsAvailable"
              />
            </div>
          </div>
        </div>
      </aside>

      <div class="flex min-w-0 flex-col gap-4">
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="text-2xl font-black" aria-live="polite">
            {{ cards.length }} {{ cards.length === 1 ? 'park' : 'parken' }}
            <template v-if="filters.minDiscountPercent">met een buitenkansje</template>
            <span v-if="periodLabel" class="font-normal text-ink-secondary">· {{ periodLabel }}</span>
          </h2>
          <div class="ml-auto flex flex-wrap items-center justify-end gap-2">
            <div class="flex rounded-lg bg-surface p-0.5 text-sm font-medium ring-1 ring-line" role="group" aria-label="Weergave">
              <button
                v-for="option in [{ value: 'cards', label: 'Lijst', icon: 'dashboard' }, { value: 'map', label: 'Kaart', icon: 'pin' }]"
                :key="option.value"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5"
                :class="view === option.value ? 'bg-accent-wash text-accent' : 'text-ink-secondary hover:text-ink'"
                :aria-pressed="view === option.value"
                @click="view = option.value"
              >
                <Icon :name="option.icon" class="size-4" />
                <span class="sr-only sm:not-sr-only">{{ option.label }}</span>
              </button>
            </div>
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm font-medium ring-1 ring-line hover:ring-field"
              @click="alertsOpen = true"
            >
              <Icon name="bell" class="size-4" />
              <span class="sr-only sm:not-sr-only">Prijsalarm</span>
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm font-medium ring-1 ring-line hover:ring-field lg:hidden"
              @click="filtersOpen = true"
            >
              <Icon name="filters" class="size-4" />
              Filters
              <span v-if="chips.length" class="rounded-full bg-accent px-1.5 text-xs leading-5 text-on-accent">
                {{ chips.length }}
              </span>
            </button>
            <label class="flex items-center gap-2 text-sm">
              <span class="sr-only text-ink-secondary sm:not-sr-only">Sorteer op</span>
              <select v-model="filters.sort" class="rounded-lg bg-surface px-3 py-2 font-medium ring-1 ring-field hover:ring-ink-secondary">
                <option v-for="option in sortOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
          </div>
        </div>

        <ActiveFilters :chips="chips" @remove="removeChip" @clear="clearFilters" />

        <div v-if="isLoading" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Laden">
          <div v-for="index in 6" :key="index" class="animate-pulse overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
            <div class="aspect-[3/2] bg-line" />
            <div class="flex flex-col gap-2 p-4">
              <div class="h-4 w-2/3 rounded bg-line" />
              <div class="h-3 w-1/2 rounded bg-line" />
              <div class="mt-4 h-7 w-1/3 rounded bg-line" />
            </div>
          </div>
        </div>

        <template v-else-if="hasPrices">
          <ParkMap
            v-if="cards.length && view === 'map'"
            :deals="cards"
            :origin="home.origin"
            @open="openPark($event.park, $event.weekend.arrival)"
          />
          <div v-else-if="cards.length" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <DealCard
              v-for="deal in shownDeals"
              :key="`${deal.park.code}-${deal.weekend.arrival}`"
              :deal="deal"
              :settings="overview.settings"
              :priced-for="overview.pricedFor"
              :occasions="overview.occasions?.[deal.weekend.arrival] ?? []"
              :popular="overview.popular?.includes(deal.park.code) ?? false"
              @open="openPark(deal.park, deal.weekend.arrival, $event?.reviews)"
            />
          </div>
          <div v-else class="flex flex-col items-center gap-3 rounded-3xl bg-surface px-6 py-12 text-center ring-1 ring-line">
            <span class="grid size-12 place-items-center rounded-full bg-plane">
              <Icon name="search" class="size-6 text-ink-secondary" />
            </span>
            <p class="font-semibold">Geen buitenkansjes met deze filters</p>
            <p class="max-w-md text-sm text-ink-secondary">
              <template v-if="filters.minDiscountPercent">
                Geen weekend zit minstens {{ filters.minDiscountPercent }}% onder de normale prijs van het park.
              </template>
              <template v-else>Geen enkel park past bij deze filters.</template>
            </p>
            <div class="flex flex-wrap justify-center gap-2 text-sm">
              <button
                v-if="filters.minDiscountPercent > 10"
                type="button"
                class="rounded-full bg-accent px-3 py-2 font-medium text-on-accent hover:bg-accent-hover"
                @click="filters.minDiscountPercent = 10"
              >
                Toon vanaf 10%
              </button>
              <button
                v-if="chips.length"
                type="button"
                class="rounded-lg px-3 py-2 font-medium ring-1 ring-line hover:bg-hover"
                @click="clearFilters"
              >
                Wis alle filters
              </button>
            </div>
          </div>

          <button
            v-if="view === 'cards' && cards.length > shownDeals.length"
            type="button"
            class="self-center rounded-lg bg-surface px-5 py-2.5 text-sm font-medium ring-1 ring-line hover:ring-field"
            @click="visibleCount += PAGE_SIZE"
          >
            Toon meer ({{ cards.length - shownDeals.length }} over)
          </button>

          <!-- A section of its own: the full list to compare, after the highlights above. -->
          <section class="mt-8 flex flex-col gap-4 border-t border-line pt-8 sm:mt-10 sm:pt-10" aria-labelledby="all-parks-title">
            <div>
              <h2 id="all-parks-title" class="text-2xl font-black">Alle parken vergelijken ({{ visibleParks.length }})</h2>
              <p class="text-sm text-ink-secondary">
                Per park het weekend dat het verst onder de normale prijs zit. Klik op een kolomkop om te sorteren.
              </p>
            </div>
            <ParkTable :parks="visibleParks" :min-discount="minDiscount" :settings="overview.settings" @show-park="openPark($event)" />
          </section>
        </template>

        <div v-else-if="overview" class="flex flex-col items-center gap-3 rounded-3xl bg-surface px-6 py-12 text-center ring-1 ring-line">
          <template v-if="isScanning || overview.partyPending">
            <Icon name="refresh" class="size-8 animate-spin text-accent [animation-direction:reverse]" />
            <p class="font-semibold">De eerste prijzen voor dit gezelschap komen binnen</p>
            <p class="max-w-md text-sm text-ink-secondary">Na een paar weekenden verschijnen hier de eerste buitenkansjes.</p>
          </template>
          <template v-else>
            <p class="font-semibold">Nog geen prijzen voor dit gezelschap</p>
            <button
              v-if="overview.admin"
              type="button"
              class="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
              @click="startScan"
            >
              Prijzen ophalen
            </button>
          </template>
        </div>
      </div>
    </div>
  </main>

  <footer class="border-t border-line bg-surface">
    <p class="mx-auto max-w-7xl px-4 py-6 text-sm text-ink-secondary sm:px-6">
      Weekendje weg vergelijkt prijzen van Landal, Topparken en Molecaten. Links naar een aanbieder zijn
      affiliate-links: boek je via zo'n link, dan krijgen wij een vergoeding van de aanbieder. Jij betaalt niets extra,
      en het bepaalt niet welke parken je hier ziet.
    </p>
    <nav aria-label="Meer op de site" class="mx-auto flex max-w-7xl gap-4 px-4 pb-6 text-sm sm:px-6">
      <a href="/weekenden" class="font-medium text-accent hover:underline">Alle weekenden</a>
      <a href="/parken" class="font-medium text-accent hover:underline">Alle parken</a>
      <a href="/privacy" class="font-medium text-accent hover:underline">Privacy</a>
    </nav>
  </footer>

  <FilterSheet v-model:open="filtersOpen" :result-count="cards.length" :can-clear="chips.length > 0" @clear="clearFilters">
    <FilterPanel
      v-model:search="filters.search"
      v-model:min-discount-percent="filters.minDiscountPercent"
      v-model:max-price-euros="filters.maxPriceEuros"
      v-model:min-rating="filters.minRating"
      v-model:country="filters.country"
      v-model:facilities="filters.facilities"
      v-model:origin="home.origin"
      v-model:max-distance-km="home.maxDistanceKm"
      v-model:brands="filters.brands"
      :brand-options="brandOptions"
      :country-options="countryOptions"
      :rating-options="ratingOptions"
      :facility-groups="facilityCounts"
      :ratings-available="ratingsAvailable"
    />
  </FilterSheet>

  <DatePicker v-model:open="calendarOpen" v-model:from="filters.from" v-model:to="filters.to" :weekends="strip" />

  <SettingsDialog
    v-if="overview"
    v-model:open="settingsOpen"
    :settings="overview.settings"
    :accommodation-groups="overview.accommodationGroups"
    :admin="overview.admin"
    @save="saveSettings"
  />

  <ParkDrawer
    v-if="overview"
    :park="openedPark"
    :arrival="opened?.arrival ?? ''"
    :reviews="opened?.reviews ?? false"
    :min-discount="minDiscount"
    :facility-groups="facilityGroups"
    :settings="overview.settings"
    :priced-for="overview.pricedFor"
    :party-key="overview.shownParty ?? ''"
    :occasions="overview.occasions ?? {}"
    :popular="overview.popular ?? []"
    @close="opened = null"
    @alert="openParkAlert"
  />

  <AlertsDialog v-if="overview" v-model:open="alertsOpen" :draft="parkAlert ?? alertDraft" />
</template>
