<script setup>
import { computed } from 'vue';
import { reasonText, verdictLabel } from '../lib/advice.js';
import Icon from './Icon.vue';

// See shared/advice.mjs: { verdict, trend, reasons }.
const props = defineProps({ advice: { type: Object, required: true } });

const TONES = {
  book: { icon: 'bolt', classes: 'bg-good-wash text-good-ink' },
  wait: { icon: 'clock', classes: 'bg-accent-wash text-ink' },
};

const tone = computed(() => TONES[props.advice.verdict]);
const reasons = computed(() => props.advice.reasons.map(reasonText).join(' '));
</script>

<template>
  <span
    v-if="tone"
    class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm"
    :class="tone.classes"
    :title="reasons"
  >
    <Icon :name="tone.icon" class="size-3.5" />
    {{ verdictLabel(advice.verdict) }}
  </span>
</template>
