<script setup>
import { computed } from 'vue';
import { brandDot, brandName } from '../lib/brands.js';

const props = defineProps({ brand: { type: String, default: 'landal' } });

const name = computed(() => brandName(props.brand));
const dot = computed(() => brandDot(props.brand));
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-md bg-plane px-2 py-0.5 text-xs font-semibold tracking-wide uppercase ring-1 ring-line"
    :title="`Soort park: ${name}`"
  >
    <span class="size-2 rounded-full" :style="{ backgroundColor: dot }" aria-hidden="true" />
    {{ name }}
  </span>
</template>
