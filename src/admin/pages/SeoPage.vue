<script setup>
import { computed, onMounted, ref } from 'vue';
import { formatTimestamp } from '../../lib/format.js';
import StatTile from '../components/StatTile.vue';
import { count } from '../useRounds.js';

// What the check after each price round found on the public pages (server/seo.mjs).
const audit = ref(null);
const kinds = ref({});
// loading, failed or ready
const state = ref('loading');

onMounted(async () => {
  try {
    const response = await fetch('/api/admin/seo');
    if (!response.ok) throw new Error(`SEO failed with ${response.status}`);
    ({ audit: audit.value, kinds: kinds.value } = await response.json());
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
  <p v-else-if="!audit" class="rounded-2xl bg-surface px-4 py-3 text-sm text-ink-secondary ring-1 ring-line" role="status">
    Nog geen controle gedaan. Die loopt mee met de eerstvolgende prijsronde.
  </p>
  <div v-else class="flex flex-col gap-6">
    <p class="max-w-3xl text-ink-secondary">
      Na elke prijsronde lopen we alle pagina's na die Google kan vinden: titels, omschrijvingen, koppen, links en de
      gegevens voor zoekmachines.
    </p>
    <section aria-label="Kerncijfers" class="grid gap-3 sm:grid-cols-3">
      <StatTile v-for="tile in tiles" :key="tile.label" v-bind="tile" />
    </section>
    <p v-if="!byKind.length" class="rounded-2xl bg-good-wash px-4 py-3 text-sm text-good-ink" role="status">Alle pagina's zijn in orde.</p>
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
