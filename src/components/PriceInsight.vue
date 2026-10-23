<script setup>
import { computed } from 'vue';
import { formatEuros } from '../lib/format.js';

const props = defineProps({
  // See priceInsight(): level, typical band, min/max and the price's position.
  insight: { type: Object, required: true },
  priceCents: { type: Number, required: true },
});

const LEVELS = {
  low: { label: 'Laag voor dit park', marker: 'bg-good', text: 'text-good-ink' },
  typical: { label: 'Gangbaar voor dit park', marker: 'bg-ink-secondary', text: 'text-ink' },
  high: { label: 'Hoog voor dit park', marker: 'bg-serious', text: 'text-ink' },
};

const level = computed(() => LEVELS[props.insight.level]);
const span = computed(() => props.insight.maxCents - props.insight.minCents || 1);
const bandStyle = computed(() => {
  const { typicalLowCents, typicalHighCents, minCents } = props.insight;
  return {
    left: `${((typicalLowCents - minCents) / span.value) * 100}%`,
    width: `${Math.max(2, ((typicalHighCents - typicalLowCents) / span.value) * 100)}%`,
  };
});
</script>

<template>
  <div>
    <p class="font-semibold" :class="level.text">{{ level.label }}</p>
    <div class="relative mt-3 h-2 rounded-full bg-line" role="img" :aria-label="`${formatEuros(priceCents)}; gangbaar ${formatEuros(insight.typicalLowCents)} tot ${formatEuros(insight.typicalHighCents)}`">
      <div class="absolute inset-y-0 rounded-full bg-axis" :style="bandStyle" />
      <div
        class="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
        :class="level.marker"
        :style="{ left: `${insight.position * 100}%` }"
      />
    </div>
    <div class="mt-1.5 flex justify-between text-xs text-ink-muted tabular-nums">
      <span>{{ formatEuros(insight.minCents) }}</span>
      <span>gangbaar {{ formatEuros(insight.typicalLowCents) }}–{{ formatEuros(insight.typicalHighCents) }}</span>
      <span>{{ formatEuros(insight.maxCents) }}</span>
    </div>
  </div>
</template>
