<script setup>
import { computed } from 'vue';

// A small trend line for table rows; gaps where there was no value. Drawn in the de-emphasis gray, with the last
// point in the accent, as a stat tile's trend.
const props = defineProps({
  values: { type: Array, required: true },
  width: { type: Number, default: 96 },
  height: { type: Number, default: 28 },
});

const PAD = 3;

const shape = computed(() => {
  const known = props.values.filter((value) => value != null);
  if (known.length < 2) return null;
  const low = Math.min(...known);
  const high = Math.max(...known);
  const x = (index) => PAD + (index / Math.max(1, props.values.length - 1)) * (props.width - PAD * 2);
  const y = (value) => (high === low ? props.height / 2 : PAD + (1 - (value - low) / (high - low)) * (props.height - PAD * 2));
  const segments = [];
  let current = [];
  props.values.forEach((value, index) => {
    if (value == null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push(`${x(index).toFixed(1)},${y(value).toFixed(1)}`);
    }
  });
  if (current.length) segments.push(current);
  const lastIndex = props.values.findLastIndex((value) => value != null);
  return { paths: segments.map((points) => `M${points.join('L')}`), end: { x: x(lastIndex), y: y(props.values[lastIndex]) } };
});
</script>

<template>
  <svg v-if="shape" :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" aria-hidden="true" class="overflow-visible">
    <path v-for="(path, index) in shape.paths" :key="index" :d="path" fill="none" class="stroke-axis" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    <circle :cx="shape.end.x" :cy="shape.end.y" r="3" class="fill-series stroke-surface" stroke-width="1.5" />
  </svg>
  <span v-else class="text-xs text-ink-muted">–</span>
</template>
