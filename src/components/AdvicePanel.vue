<script setup>
import { computed, ref, watch } from 'vue';
import { reasonText, verdictLabel } from '../lib/advice.js';
import { formatEuros, formatShortDate } from '../lib/format.js';
import Icon from './Icon.vue';
import PriceHistory from './PriceHistory.vue';

const props = defineProps({
  parkCode: { type: String, required: true },
  // Group key of the party whose prices are shown; empty means the app's default party.
  partyKey: { type: String, default: '' },
  // The weekend with its `advice` (see shared/advice.mjs) and price history summary.
  weekend: { type: Object, required: true },
});

const TONES = {
  book: { icon: 'bolt', classes: 'bg-good-wash text-good-ink' },
  wait: { icon: 'clock', classes: 'bg-accent-wash text-ink' },
  neutral: { icon: 'info', classes: 'bg-plane text-ink-secondary' },
};

const points = ref([]);
const loading = ref(false);

watch(
  () => `${props.partyKey}|${props.parkCode}|${props.weekend.arrival}`,
  async () => {
    loading.value = true;
    try {
      const params = new URLSearchParams({ park: props.parkCode, arrival: props.weekend.arrival });
      if (props.partyKey) params.set('party', props.partyKey);
      const response = await fetch(`/api/history?${params}`);
      points.value = response.ok ? await response.json() : [];
    } catch {
      points.value = [];
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

const tone = computed(() => TONES[props.weekend.advice.verdict] ?? TONES.neutral);
const reasons = computed(() => props.weekend.advice.reasons.map(reasonText).filter(Boolean));
const summary = computed(() => {
  if (!points.value.length) return '';
  const prices = points.value.map((point) => point.priceCents);
  const since = formatShortDate(points.value[0].observedAt.slice(0, 10));
  const count = points.value.length;
  return `Gevolgd sinds ${since} · ${count} ${count === 1 ? 'meting' : 'metingen'} · laagste ${formatEuros(Math.min(...prices))} · hoogste ${formatEuros(Math.max(...prices))}`;
});
</script>

<template>
  <section aria-labelledby="advice-title">
    <h3 id="advice-title" class="font-semibold">Boeken of wachten?</h3>
    <div class="mt-2 rounded-xl p-3" :class="tone.classes">
      <p class="flex items-center gap-1.5 font-semibold">
        <Icon :name="tone.icon" class="size-4" />
        {{ verdictLabel(weekend.advice.verdict) }}
      </p>
      <ul class="mt-1 list-disc space-y-0.5 pl-5 text-sm">
        <li v-for="reason in reasons" :key="reason">{{ reason }}</li>
      </ul>
    </div>

    <h4 class="mt-4 text-sm font-medium">Prijsverloop van dit weekend</h4>
    <p class="mb-2 text-xs text-ink-secondary">{{ loading ? 'Laden…' : summary }}</p>
    <PriceHistory v-if="points.length > 1" :points="points" />
    <p v-else-if="!loading" class="text-sm text-ink-secondary">
      Nog maar één meting; het verloop verschijnt na de volgende ophaalronde.
    </p>
    <p class="mt-2 text-xs text-ink-muted">
      Op basis van de prijzen die deze app zelf zag; een verwachting, geen garantie.
    </p>
  </section>
</template>
