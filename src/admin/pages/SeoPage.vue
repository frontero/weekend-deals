<script setup>
import { computed, onMounted, ref } from 'vue';
import { formatShortDate, formatTimestamp } from '../../lib/format.js';
import SeoAlerts from '../components/SeoAlerts.vue';
import SeoRecovery from '../components/SeoRecovery.vue';
import StatTile from '../components/StatTile.vue';
import { SEARCH_PERIODS, searchProgress } from '../../../shared/search-progress.mjs';
import { count } from '../useRounds.js';

// What the check after each price round found on the public pages (server/seo.mjs).
const audit = ref(null);
const kinds = ref({});
// From Google Search Console, read in each price round (server/search-console.mjs).
const search = ref({ queries: [], pages: [] });
const searchTotals = ref(null);
const alerts = ref(null);
const recovery = ref(null);
const searchPeriod = ref(28);
const index = ref([]);
const trackedIndex = ref([]);
const sitemaps = ref(null);
const pageCount = ref(0);
// Google's PageSpeed of a page of each kind, read once a day (server/pagespeed.mjs).
const speed = ref(null);
// Bing Webmaster's figures, read once a day (server/bing.mjs).
const bing = ref(null);
// loading, failed or ready
const state = ref('loading');

onMounted(async () => {
  try {
    const response = await fetch('/api/admin/seo');
    if (!response.ok) throw new Error(`SEO failed with ${response.status}`);
    ({ audit: audit.value, kinds: kinds.value, search: search.value, searchTotals: searchTotals.value, alerts: alerts.value = null,
      recovery: recovery.value = null, index: index.value, trackedIndex: trackedIndex.value = [], sitemaps: sitemaps.value,
      pageCount: pageCount.value, speed: speed.value, bing: bing.value } = await response.json());
    state.value = 'ready';
  } catch {
    state.value = 'failed';
  }
});

const total = computed(() => Object.values(audit.value?.counts ?? {}).reduce((sum, number) => sum + number, 0));
const affected = computed(() => new Set((audit.value?.issues ?? []).map((issue) => issue.path)).size);
const tiles = computed(() => [
  { label: "Pagina's gecontroleerd", value: count(audit.value?.pages ?? 0), hint: audit.value ? `Op ${formatTimestamp(audit.value.checkedAt)}` : '' },
  { label: 'Bevindingen', value: count(total.value), hint: total.value ? '' : 'Niets gevonden' },
  { label: "Pagina's met een bevinding", value: count(affected.value), hint: total.value > (audit.value?.issues.length ?? 0) ? 'Van de eerste 300 bevindingen' : '' },
]);
const place = (position) => position.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const indexed = computed(() => index.value.filter((row) => row.verdict === 'PASS').length);
const requestDate = new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeZone: 'Europe/Amsterdam' });
const inspectionTime = new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Amsterdam' });
const crawlTime = new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Europe/Amsterdam' });
const sourceComparison = {
  '-1': 'Laatste Cloudflare-bezoek nog niet gemeld',
  0: 'Crawltijden binnen 1 seconde',
  1: 'Nieuwere crawltijd dan Cloudflare',
};
const trackedRows = computed(() => trackedIndex.value.map((row) => ({
  ...row,
  updateLabel: typeof row.updatedAt === 'string' ? crawlTime.format(new Date(row.updatedAt)) : null,
  requestLabel: row.requestedOn === null ? 'Geen aanvraag vastgelegd' : requestDate.format(new Date(row.requestedOn)),
  crawlLabel: row.lastCrawl === null ? 'Geen crawldatum gemeld' : crawlTime.format(new Date(row.lastCrawl)),
  checkedLabel: row.checkedAt === null ? '' : inspectionTime.format(new Date(row.checkedAt)),
  status: indexStatus(row.verdict, row.checkedAt),
  googlebotLabel: row.googlebot?.visitedAt === undefined ? null : crawlTime.format(new Date(row.googlebot.visitedAt)),
  googlebotStatus: row.googlebot?.status === undefined ? null : `HTTP ${row.googlebot.status}`,
  googlebotStatusClass: row.googlebot?.status >= 400 ? 'text-serious' : '',
  hasCloudflareUpdateComparison: typeof row.cloudflareAfterUpdate === 'boolean',
  cloudflareUpdateLabel: row.cloudflareAfterUpdate === true ? 'Bezoek na update gezien' : 'Geen bezoek na update gezien',
  cloudflareUpdateClass: row.cloudflareAfterUpdate === true ? 'text-good-ink' : 'text-ink-secondary',
  hasSearchUpdateComparison: typeof row.searchAfterUpdate === 'boolean',
  searchUpdateLabel: row.searchAfterUpdate === true ? 'Crawl na update gemeld' : 'Nog geen crawl na update gemeld',
  searchUpdateClass: row.searchAfterUpdate === true ? 'text-good-ink' : 'text-ink-secondary',
  searchComparisonLabel: row.searchAfterUpdate === true ? sourceComparison[row.searchComparedToCloudflare] ?? null : null,
})));

function indexStatus(verdict, checkedAt) {
  if (checkedAt === null) {
    return 'Nog niet gecontroleerd';
  }
  if (verdict === 'PASS') {
    return 'Geïndexeerd';
  }
  if (verdict === 'NEUTRAL' || verdict === 'FAIL') {
    return 'Niet geïndexeerd';
  }
  return 'Onbekend';
}
const progress = computed(() => searchProgress(searchTotals.value?.days ?? [], searchPeriod.value));
const percent = new Intl.NumberFormat('nl-NL', { style: 'percent', maximumFractionDigits: 2 });
const signed = new Intl.NumberFormat('nl-NL', { signDisplay: 'exceptZero', maximumFractionDigits: 2 });
const formatCtr = (value) => value === null ? '–' : percent.format(value);
const searchDelta = (change, suffix = '') => ({
  text: `${signed.format(change)}${suffix}`,
  tone: change === 0 ? 'neutral' : change > 0 ? 'good' : 'bad',
});
const periodLabel = computed(() => {
  if (progress.value === null) {
    return 'De sitetotalen verschijnen zodra Google dagcijfers levert.';
  }
  const { start, end, previousStart, previousEnd, currentRows, previousAvailable, previous } = progress.value;
  const currentLabel = `${formatShortDate(start)} t/m ${formatShortDate(end)}`;
  if (previous === null) {
    return `${currentLabel} · ${currentRows.length} van ${searchPeriod.value} dagen beschikbaar, vorige periode ${previousAvailable} van ${searchPeriod.value}. Meer dagcijfers nodig voor vergelijking.`;
  }
  return `${currentLabel} tegenover ${formatShortDate(previousStart)} t/m ${formatShortDate(previousEnd)}`;
});
const searchTiles = computed(() => {
  if (progress.value === null) {
    return [];
  }
  const { current, currentRows, previous } = progress.value;
  const counts = [['impressions', 'Vertoningen in Google'], ['clicks', 'Klikken vanuit Google']];
  return [
    ...counts.map(([field, label]) => ({
      label,
      value: count(current[field]),
      trend: currentRows.map((row) => row[field]),
      delta: previous === null ? null : searchDelta(current[field] - previous[field]),
      hint: previous === null ? '' : `Vorige periode ${count(previous[field])}`,
    })),
    {
      label: 'Doorklikpercentage (CTR)', value: formatCtr(current.ctr),
      delta: previous === null || previous.ctr === null || current.ctr === null ? null : searchDelta((current.ctr - previous.ctr) * 100, ' pp'),
      hint: previous === null ? '' : `Vorige periode ${formatCtr(previous.ctr)}`,
    },
  ];
});
const notIndexed = computed(() => index.value.filter((row) => row.verdict !== 'PASS'));
const coverage = computed(() => [...Map.groupBy(notIndexed.value, (row) => row.coverage || 'Onbekend')].sort((a, b) => b[1].length - a[1].length));
const searchTables = computed(() => [
  { id: 'queries', title: 'Zoekwoorden', first: 'Zoekwoord', rows: search.value.queries.map((row) => [row.query, row]) },
  { id: 'search-pages', title: "Pagina's in Google", first: 'Pagina', rows: search.value.pages.map((row) => [row.path, row]) },
]);
const bingSum = (field) => (bing.value?.days ?? []).reduce((total, row) => total + row[field], 0);
const bingTiles = computed(() => [
  { label: `Getoond in Bing, laatste ${bing.value?.periodDays ?? 28} dagen`, value: count(bingSum('impressions')), trend: (bing.value?.days ?? []).map((row) => row.impressions) },
  { label: 'Klikken vanuit Bing', value: count(bingSum('clicks')), trend: (bing.value?.days ?? []).map((row) => row.clicks) },
  { label: 'Opgenomen door Bing', value: bing.value?.crawl ? count(bing.value.crawl.inIndex ?? 0) : '–', hint: bing.value?.crawl ? `${count(bing.value.crawl.crawled ?? 0)} pagina's bezocht op ${bing.value.crawl.day}` : '' },
  { label: 'Links van andere sites', value: bing.value?.crawl ? count(bing.value.crawl.inLinks ?? 0) : '–', hint: 'volgens Bing' },
]);
const bingTables = computed(() => [
  { id: 'bing-queries', title: 'Zoekwoorden in Bing', first: 'Zoekwoord', rows: (bing.value?.queries ?? []).map((row) => [row.label, row]) },
  { id: 'bing-pages', title: "Pagina's in Bing", first: 'Pagina', rows: (bing.value?.pages ?? []).map((row) => [row.label, row]) },
]);
const seconds = (milliseconds) => `${(milliseconds / 1000).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
// Google's own bands: 90 and up is good, under 50 is poor.
const scoreClass = (score) => (score >= 90 ? 'text-good-ink' : score >= 50 ? 'text-warning-ink' : 'text-serious');
const byKind = computed(() =>
  Object.entries(audit.value?.counts ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([kind, number]) => ({ kind, label: kinds.value[kind] ?? kind, number, examples: audit.value.issues.filter((issue) => issue.kind === kind).slice(0, 8) })),
);
</script>

<template>
  <p v-if="state === 'loading'" class="text-ink-secondary" role="status">Laden…</p>
  <p v-else-if="state === 'failed'" class="rounded-2xl bg-warning-wash px-4 py-3 text-sm text-warning-ink" role="status">
    De controle kon niet worden geladen.
  </p>
  <div v-else class="flex flex-col gap-6">
    <SeoAlerts
      v-if="alerts !== null"
      :report="alerts"
    />
    <section aria-labelledby="seo-google" class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 id="seo-google" class="text-lg font-semibold">Google Search Console</h2>
        <label class="flex items-center gap-2 text-sm">
          Vergelijkingsperiode
          <select v-model.number="searchPeriod" class="rounded-lg bg-surface px-3 py-2 font-medium ring-1 ring-field">
            <option v-for="period in SEARCH_PERIODS" :key="period" :value="period">{{ period }} dagen</option>
          </select>
        </label>
      </div>
      <p class="text-sm text-ink-secondary" aria-live="polite">{{ periodLabel }}</p>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          v-for="tile in searchTiles"
          :key="tile.label"
          v-bind="tile"
        />
        <StatTile
          :value="`${count(indexed)} van ${count(index.length)}`"
          :hint="`${count(pageCount - index.length)} pagina's nog niet nagevraagd`"
          label="Opgenomen door Google"
        />
      </div>
    </section>
    <SeoRecovery
      :report="recovery"
    />
    <section v-if="trackedRows.length > 0" class="min-w-0 rounded-2xl bg-surface ring-1 ring-line" aria-labelledby="seo-tracked-index">
      <h2 id="seo-tracked-index" class="border-b border-line px-4 py-3 font-semibold sm:px-5">Indexering van gevolgde pagina’s</h2>
      <p class="px-4 py-3 text-sm text-ink-secondary sm:px-5">
        De update is het vastgelegde publicatiemoment van de inhoud. Voor Cijfers geldt de laatste berekening.
        De tabel vergelijkt die tijd met het laatste Googlebot-bezoek uit Cloudflare en de laatste crawl die Search Console meldt, in Nederlandse tijd.
      </p>
      <div class="overflow-x-auto" tabindex="0" role="group" aria-label="Indexeringstabel">
        <table class="w-full text-left text-sm">
          <thead class="text-ink-secondary">
            <tr class="border-b border-line">
              <th scope="col" class="px-3 py-2.5 font-medium sm:px-5">Pagina</th>
              <th scope="col" class="px-3 py-2.5 font-medium sm:px-5">Laatste aanvraag</th>
              <th scope="col" class="px-3 py-2.5 font-medium sm:px-5">Laatste crawl (Search Console)</th>
              <th scope="col" class="px-3 py-2.5 font-medium sm:px-5">Indexstatus</th>
              <th scope="col" class="px-3 py-2.5 font-medium sm:px-5">Googlebot (Cloudflare)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in trackedRows" :key="row.path" class="border-b border-line align-top last:border-0">
              <th scope="row" class="px-3 py-3 font-semibold sm:px-5">
                <a :href="row.path" class="text-accent underline">{{ row.label }}</a>
                <p v-if="row.updateLabel !== null" class="mt-1 text-xs font-normal text-ink-secondary">
                  Update <time :datetime="row.updatedAt" class="whitespace-nowrap">{{ row.updateLabel }}</time>
                </p>
                <p v-else class="mt-1 text-xs font-normal text-ink-secondary">Update onbekend</p>
              </th>
              <td class="px-3 py-3 tabular-nums sm:px-5">
                <time v-if="row.requestedOn !== null" :datetime="row.requestedOn">{{ row.requestLabel }}</time>
                <span v-else class="text-ink-secondary">{{ row.requestLabel }}</span>
              </td>
              <td class="px-3 py-3 tabular-nums sm:px-5">
                <time v-if="row.lastCrawl !== null" :datetime="row.lastCrawl" class="whitespace-nowrap">{{ row.crawlLabel }}</time>
                <span v-else class="text-ink-secondary">{{ row.crawlLabel }}</span>
                <p
                  v-if="row.hasSearchUpdateComparison"
                  :class="row.searchUpdateClass"
                  class="mt-1 text-xs font-medium"
                >{{ row.searchUpdateLabel }}</p>
                <p v-if="row.searchComparisonLabel !== null" class="mt-1 text-xs text-ink-secondary">{{ row.searchComparisonLabel }}</p>
              </td>
              <td class="px-3 py-3 sm:px-5">
                <p class="font-semibold">{{ row.status }}</p>
                <p v-if="row.coverage" class="text-xs text-ink-secondary">{{ row.coverage }}</p>
                <p v-if="row.checkedAt !== null" class="mt-1 text-xs text-ink-secondary">Gecontroleerd op <time :datetime="row.checkedAt">{{ row.checkedLabel }}</time></p>
              </td>
              <td class="px-3 py-3 tabular-nums sm:px-5">
                <template v-if="row.googlebotLabel !== null">
                  <time
                    :datetime="row.googlebot.visitedAt"
                    class="block whitespace-nowrap"
                  >{{ row.googlebotLabel }}</time>
                  <span
                    :class="row.googlebotStatusClass"
                    class="font-semibold"
                  >{{ row.googlebotStatus }}</span>
                  <p
                    v-if="row.hasCloudflareUpdateComparison"
                    :class="row.cloudflareUpdateClass"
                    class="mt-1 text-xs font-medium"
                  >{{ row.cloudflareUpdateLabel }}</p>
                </template>
                <span v-else class="text-ink-secondary">Geen bezoek vastgelegd</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <p v-if="sitemaps" class="text-sm text-ink-secondary">
      <template v-for="map in sitemaps.sitemaps" :key="map.path">
        Sitemap {{ map.path }}: {{ map.pending ? 'wacht op Google' : map.lastDownloaded ? `gelezen op ${formatTimestamp(map.lastDownloaded)}` : 'nog niet gelezen' }},
        {{ count(map.errors) }} fouten, {{ count(map.warnings) }} waarschuwingen.
      </template>
      <template v-if="!sitemaps.sitemaps.length">Google kent nog geen sitemap van de site.</template>
    </p>
    <p v-else class="text-sm text-ink-secondary">Nog geen gegevens van Google: die komen met de eerstvolgende prijsronde.</p>
    <section v-if="notIndexed.length" class="rounded-2xl bg-surface ring-1 ring-line" aria-labelledby="seo-not-indexed">
      <h2 id="seo-not-indexed" class="border-b border-line px-4 py-3 font-semibold sm:px-5">Nog niet opgenomen door Google</h2>
      <div v-for="[reason, rows] in coverage" :key="reason" class="border-b border-line px-4 py-3 text-sm last:border-0 sm:px-5">
        <p class="font-medium">{{ reason }} <span class="font-normal text-ink-secondary">{{ count(rows.length) }} pagina's</span></p>
        <p class="mt-1 break-words text-ink-secondary">{{ rows.slice(0, 12).map((row) => row.path).join(' · ') }}<template v-if="rows.length > 12"> en nog {{ count(rows.length - 12) }}</template></p>
      </div>
    </section>
    <div class="grid gap-4 xl:grid-cols-2">
      <section v-for="table in searchTables" :key="table.id" class="min-w-0 rounded-2xl bg-surface ring-1 ring-line" :aria-labelledby="`seo-${table.id}`">
        <h2 :id="`seo-${table.id}`" class="border-b border-line px-4 py-3 font-semibold sm:px-5">{{ table.title }} <span class="text-sm font-normal text-ink-secondary">· laatste 28 dagen</span></h2>
        <p v-if="table.rows.length === 0" class="px-4 py-3 text-sm text-ink-secondary sm:px-5">Google heeft nog geen detailcijfers voor dit overzicht geleverd.</p>
        <div v-else class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-ink-secondary">
            <tr class="border-b border-line">
              <th scope="col" class="px-4 py-2.5 font-medium sm:px-5">{{ table.first }}</th>
              <th scope="col" class="px-4 py-2.5 text-right font-medium sm:px-5">Getoond</th>
              <th scope="col" class="px-4 py-2.5 text-right font-medium sm:px-5">Klikken</th>
              <th scope="col" class="px-4 py-2.5 text-right font-medium sm:px-5">Plek</th>
            </tr>
          </thead>
          <tbody class="tabular-nums">
            <tr v-for="[label, row] in table.rows" :key="label" class="border-b border-line last:border-0 hover:bg-hover">
              <th scope="row" class="px-4 py-2 font-normal break-words sm:px-5">{{ label }}</th>
              <td class="px-4 py-2 text-right font-semibold sm:px-5">{{ count(row.impressions) }}</td>
              <td class="px-4 py-2 text-right font-semibold sm:px-5">{{ count(row.clicks) }}</td>
              <td class="px-4 py-2 text-right font-semibold sm:px-5">{{ place(row.position) }}</td>
            </tr>
          </tbody>
        </table>
        </div>
      </section>
    </div>

    <h2 class="text-lg font-semibold">Bing</h2>
    <p v-if="!bing" class="text-sm text-ink-secondary">Nog niet gekoppeld. Dit heeft een eigen sleutel nodig (scripts/setup-bing.sh) en loopt daarna één keer per dag mee met een prijsronde. Bing levert ook de zoekresultaten van DuckDuckGo en Ecosia.</p>
    <template v-else>
      <p class="text-sm text-ink-secondary">Bijgewerkt op {{ formatTimestamp(bing.checkedAt) }}. Bing levert ook de zoekresultaten van DuckDuckGo en Ecosia.</p>
      <section aria-label="Kerncijfers van Bing" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile v-for="tile in bingTiles" :key="tile.label" v-bind="tile" />
      </section>
      <div class="grid gap-4 xl:grid-cols-2">
        <section v-for="table in bingTables" :key="table.id" class="min-w-0 rounded-2xl bg-surface ring-1 ring-line" :aria-labelledby="`seo-${table.id}`">
          <h2 :id="`seo-${table.id}`" class="border-b border-line px-4 py-3 font-semibold sm:px-5">{{ table.title }}</h2>
          <p v-if="!table.rows.length" class="px-4 py-3 text-sm text-ink-secondary sm:px-5">Bing heeft de site nog niet in zoekresultaten getoond.</p>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="text-ink-secondary">
                <tr class="border-b border-line">
                  <th scope="col" class="px-4 py-2.5 font-medium sm:px-5">{{ table.first }}</th>
                  <th scope="col" class="px-4 py-2.5 text-right font-medium sm:px-5">Getoond</th>
                  <th scope="col" class="px-4 py-2.5 text-right font-medium sm:px-5">Klikken</th>
                  <th scope="col" class="px-4 py-2.5 text-right font-medium sm:px-5">Plek</th>
                </tr>
              </thead>
              <tbody class="tabular-nums">
                <tr v-for="[label, row] in table.rows" :key="label" class="border-b border-line last:border-0 hover:bg-hover">
                  <th scope="row" class="px-4 py-2 font-normal break-words sm:px-5">{{ label }}</th>
                  <td class="px-4 py-2 text-right font-semibold sm:px-5">{{ count(row.impressions) }}</td>
                  <td class="px-4 py-2 text-right font-semibold sm:px-5">{{ count(row.clicks) }}</td>
                  <td class="px-4 py-2 text-right font-semibold sm:px-5">{{ row.position == null ? '–' : place(row.position) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <div class="grid gap-4 xl:grid-cols-2">
        <section class="min-w-0 rounded-2xl bg-surface ring-1 ring-line" aria-labelledby="seo-bing-sizes">
          <h2 id="seo-bing-sizes" class="border-b border-line px-4 py-3 font-semibold sm:px-5">Hoe vaak wordt er gezocht</h2>
          <p class="px-4 pt-3 text-sm text-ink-secondary sm:px-5">Hoe vaak Bing in Nederland resultaten toonde voor je meest getoonde zoekwoorden, in de laatste vier weken. Bij Google ligt dat vele malen hoger; gebruik het om zoekwoorden met elkaar te vergelijken.</p>
          <p v-if="!bing.sizes?.length" class="px-4 py-3 text-sm text-ink-secondary sm:px-5">Bing heeft hier nog geen cijfers voor.</p>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="text-ink-secondary">
                <tr class="border-b border-line">
                  <th scope="col" class="px-4 py-2.5 font-medium sm:px-5">Zoekwoord</th>
                  <th scope="col" class="px-4 py-2.5 text-right font-medium sm:px-5">Precies zo</th>
                  <th scope="col" class="px-4 py-2.5 text-right font-medium sm:px-5">Ook met extra woorden</th>
                </tr>
              </thead>
              <tbody class="tabular-nums">
                <tr v-for="size in bing.sizes" :key="size.query" class="border-b border-line last:border-0 hover:bg-hover">
                  <th scope="row" class="px-4 py-2 font-normal break-words sm:px-5">{{ size.query }}</th>
                  <td class="px-4 py-2 text-right font-semibold sm:px-5">{{ count(size.exact) }}</td>
                  <td class="px-4 py-2 text-right font-semibold sm:px-5">{{ count(size.broad) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section class="min-w-0 rounded-2xl bg-surface ring-1 ring-line" aria-labelledby="seo-bing-links">
          <h2 id="seo-bing-links" class="border-b border-line px-4 py-3 font-semibold sm:px-5">Pagina's waar andere sites naar linken</h2>
          <p v-if="!bing.links?.pages.length" class="px-4 py-3 text-sm text-ink-secondary sm:px-5">Bing kent nog geen links van andere sites naar parkjeweg.nl.</p>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="text-ink-secondary">
                <tr class="border-b border-line">
                  <th scope="col" class="px-4 py-2.5 font-medium sm:px-5">Pagina</th>
                  <th scope="col" class="px-4 py-2.5 text-right font-medium sm:px-5">Links</th>
                </tr>
              </thead>
              <tbody class="tabular-nums">
                <tr v-for="row in bing.links.pages" :key="row.path" class="border-b border-line last:border-0 hover:bg-hover">
                  <th scope="row" class="px-4 py-2 font-normal break-words sm:px-5">{{ row.path }}</th>
                  <td class="px-4 py-2 text-right font-semibold sm:px-5">{{ count(row.count) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </template>

    <h2 class="text-lg font-semibold">Snelheid volgens Google</h2>
    <p v-if="!speed" class="text-sm text-ink-secondary">Nog niet gemeten. Dit heeft een eigen sleutel nodig (scripts/setup-pagespeed.sh) en loopt daarna één keer per dag mee met een prijsronde.</p>
    <section v-else class="rounded-2xl bg-surface ring-1 ring-line" aria-labelledby="seo-speed">
      <h3 id="seo-speed" class="border-b border-line px-4 py-3 text-sm text-ink-secondary sm:px-5">
        Eén pagina van elke soort, geladen als op een telefoon, op {{ formatTimestamp(speed.checkedAt) }}. Scores van 0 tot 100.
      </h3>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-ink-secondary">
            <tr class="border-b border-line">
              <th scope="col" class="px-4 py-2.5 font-medium sm:px-5">Pagina</th>
              <th v-for="column in ['Snelheid', 'SEO', 'Toegankelijk', 'Techniek', 'Grootste beeld']" :key="column" scope="col" class="px-4 py-2.5 text-right font-medium sm:px-5">{{ column }}</th>
            </tr>
          </thead>
          <tbody class="tabular-nums">
            <template v-for="page in speed.pages" :key="page.path">
              <tr class="border-t border-line">
                <th scope="row" class="px-4 py-2 font-normal sm:px-5"><a :href="page.path" target="_blank" rel="noopener" class="font-medium text-accent hover:underline">{{ page.path }}</a></th>
                <td v-for="field in ['performance', 'seo', 'accessibility', 'bestPractices']" :key="field" class="px-4 py-2 text-right font-semibold sm:px-5" :class="scoreClass(page[field])">{{ page[field] }}</td>
                <td class="px-4 py-2 text-right font-semibold sm:px-5">{{ seconds(page.paintMs) }}</td>
              </tr>
              <tr v-if="page.markedDown.length">
                <td colspan="6" class="px-4 pb-2 text-xs text-ink-secondary sm:px-5">Aftrek voor: {{ page.markedDown.join(' · ') }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>

    <h2 class="text-lg font-semibold">Eigen controle van de pagina's</h2>
    <p class="max-w-3xl text-ink-secondary">
      Na elke prijsronde lopen we alle pagina's na die Google kan vinden: titels, omschrijvingen, koppen, links en de
      gegevens voor zoekmachines.
    </p>
    <p v-if="!audit" class="rounded-2xl bg-surface px-4 py-3 text-sm text-ink-secondary ring-1 ring-line" role="status">
      Nog geen controle gedaan. Die loopt mee met de eerstvolgende prijsronde.
    </p>
    <section v-if="audit" aria-label="Kerncijfers" class="grid gap-3 sm:grid-cols-3">
      <StatTile v-for="tile in tiles" :key="tile.label" v-bind="tile" />
    </section>
    <p v-if="audit && !byKind.length" class="rounded-2xl bg-good-wash px-4 py-3 text-sm text-good-ink" role="status">Alle pagina's zijn in orde.</p>
    <section v-for="group in byKind" :key="group.kind" class="rounded-2xl bg-surface ring-1 ring-line" :aria-labelledby="`seo-${group.kind}`">
      <h2 :id="`seo-${group.kind}`" class="flex items-baseline gap-2 border-b border-line px-4 py-3 font-semibold sm:px-5">
        {{ group.label }}
        <span class="text-sm font-normal text-ink-secondary">{{ count(group.number) }} keer</span>
      </h2>
      <ul class="divide-y divide-line text-sm">
        <li v-for="(issue, index) in group.examples" :key="index" class="flex flex-wrap gap-x-3 gap-y-1 px-4 py-2 sm:px-5">
          <a :href="issue.path" target="_blank" rel="noopener" class="font-medium text-accent hover:underline">{{ issue.path }}</a>
          <span class="min-w-0 break-words text-ink-secondary">{{ issue.detail }}</span>
        </li>
      </ul>
      <p v-if="group.number > group.examples.length" class="border-t border-line px-4 py-2 text-xs text-ink-secondary sm:px-5">
        En nog {{ count(group.number - group.examples.length) }} andere.
      </p>
    </section>
  </div>
</template>
