<script setup>
import Sparkline from './Sparkline.vue';

// A headline number: what it is, the value, how it moved (signed, against a named moment) and an optional trend.
defineProps({
  label: { type: String, required: true },
  value: { type: String, required: true },
  // { text, tone: 'good' | 'bad' | 'neutral' }
  delta: { type: Object, default: null },
  hint: { type: String, default: '' },
  trend: { type: Array, default: null },
});

const TONES = { good: 'text-good-ink', bad: 'text-warning-ink', neutral: 'text-ink-secondary' };
</script>

<template>
  <div class="flex min-w-0 flex-col rounded-2xl bg-surface p-4 ring-1 ring-line">
    <p class="text-sm text-ink-secondary">{{ label }}</p>
    <div class="mt-1 flex items-end justify-between gap-3">
      <p class="truncate text-2xl font-semibold tracking-tight">{{ value }}</p>
      <Sparkline v-if="trend" :values="trend" class="mb-1 shrink-0" />
    </div>
    <p class="mt-1 text-sm">
      <span v-if="delta" class="font-medium" :class="TONES[delta.tone ?? 'neutral']">{{ delta.text }}</span>
      <span v-if="hint" class="text-ink-secondary"><template v-if="delta"> · </template>{{ hint }}</span>
    </p>
  </div>
</template>
