<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { formatEuros, formatShortDate } from '../lib/format.js';

/** How one weekend's price moved over the scans: a line over time, one dot per measurement. */
const props = defineProps({
  // [{ observedAt, priceCents }], oldest first
  points: { type: Array, required: true },
  height: { type: Number, default: 140 },
});

const MARGIN = { top: 14, right: 12, bottom: 22, left: 48 };

const container = ref(null);
const width = ref(0);
const hovered = ref(null);
let observer = null;

// Escape hides the tooltip first, without also closing the panel around the chart.
function hideOnEscape(event) {
  if (event.key !== 'Escape' || !hovered.value) return;
  hovered.value = null;
  event.preventDefault();
}

onMounted(() => {
  // Deferred to the next frame so re-rendering the chart cannot trigger a resize loop.
  observer = new ResizeObserver(([entry]) => {
    requestAnimationFrame(() => {
      width.value = entry.contentRect.width;
    });
  });
  observer.observe(container.value);
  window.addEventListener('keydown', hideOnEscape, true);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  window.removeEventListener('keydown', hideOnEscape, true);
});

const day = (timestamp) => formatShortDate(timestamp.slice(0, 10));
const time = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' });
// Measurements from a single day are told apart by their time.
const sameDay = computed(
  () => props.points.length > 1 && props.points[0].observedAt.slice(0, 10) === props.points.at(-1).observedAt.slice(0, 10),
);
const pointLabel = (timestamp) =>
  sameDay.value ? `${day(timestamp)} ${time.format(new Date(timestamp))}` : day(timestamp);

const plot = computed(() => {
  const times = props.points.map((point) => Date.parse(point.observedAt));
  const prices = props.points.map((point) => point.priceCents);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  // A flat line sits in the middle rather than on an edge.
  const pad = Math.max((high - low) * 0.15, high * 0.05);
  const yMin = low - pad;
  const yMax = high + pad;
  const tMin = Math.min(...times);
  const tSpan = Math.max(...times) - tMin || 1;
  const innerWidth = Math.max(0, width.value - MARGIN.left - MARGIN.right);
  const innerHeight = props.height - MARGIN.top - MARGIN.bottom;

  const dots = props.points.map((point, index) => ({
    ...point,
    x: MARGIN.left + (props.points.length > 1 ? ((times[index] - tMin) / tSpan) * innerWidth : innerWidth / 2),
    y: MARGIN.top + (1 - (point.priceCents - yMin) / (yMax - yMin)) * innerHeight,
  }));
  return {
    dots,
    path: dots.map((dot, index) => `${index ? 'L' : 'M'}${dot.x},${dot.y}`).join(' '),
    ticks: [...new Set([high, low])].map((cents) => ({
      cents,
      y: MARGIN.top + (1 - (cents - yMin) / (yMax - yMin)) * innerHeight,
    })),
    baselineY: MARGIN.top + innerHeight,
  };
});

const firstDay = computed(() => (props.points.length ? pointLabel(props.points[0].observedAt) : ''));
const lastDay = computed(() => (props.points.length ? pointLabel(props.points.at(-1).observedAt) : ''));
const tooltipStyle = computed(() => {
  const dot = hovered.value;
  if (!dot) return {};
  return { left: `${Math.min(Math.max(dot.x, 70), width.value - 70)}px`, top: `${dot.y - 10}px` };
});
</script>

<template>
  <!-- The tooltip stays while the pointer is anywhere on the chart, so it can be moved onto. -->
  <div ref="container" class="relative w-full" @mouseleave="hovered = null">
    <svg v-if="width && points.length" :width="width" :height="height" class="block overflow-visible" aria-hidden="true">
      <line
        v-for="tick in plot.ticks"
        :key="tick.cents"
        :x1="MARGIN.left"
        :x2="width - MARGIN.right"
        :y1="tick.y"
        :y2="tick.y"
        class="stroke-line"
        stroke-width="1"
        shape-rendering="crispEdges"
      />
      <text
        v-for="tick in plot.ticks"
        :key="`label-${tick.cents}`"
        :x="MARGIN.left - 8"
        :y="tick.y"
        text-anchor="end"
        dominant-baseline="middle"
        class="fill-ink-muted text-[11px] tabular-nums"
      >
        {{ formatEuros(tick.cents) }}
      </text>
      <path :d="plot.path" fill="none" class="stroke-series" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <circle
        v-for="dot in plot.dots"
        :key="dot.observedAt"
        :cx="dot.x"
        :cy="dot.y"
        r="4"
        class="fill-series stroke-surface"
        stroke-width="2"
      />
      <text :x="MARGIN.left" :y="plot.baselineY + 16" class="fill-ink-muted text-[11px]">{{ firstDay }}</text>
      <text :x="width - MARGIN.right" :y="plot.baselineY + 16" text-anchor="end" class="fill-ink-muted text-[11px]">
        {{ lastDay }}
      </text>
    </svg>

    <!-- Hit targets larger than the dots, so each measurement is easy to hover or focus. -->
    <button
      v-for="dot in plot.dots"
      :key="`hit-${dot.observedAt}`"
      type="button"
      class="absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-2 focus-visible:outline-accent"
      :style="{ left: `${dot.x}px`, top: `${dot.y}px` }"
      :aria-label="`${pointLabel(dot.observedAt)}: ${formatEuros(dot.priceCents)}`"
      @mouseenter="hovered = dot"
      @focus="hovered = dot"
      @blur="hovered = null"
    />
    <div
      v-if="hovered"
      class="absolute z-10 w-max -translate-x-1/2 -translate-y-full rounded-lg bg-surface px-3 py-1.5 text-xs shadow-lg ring-1 ring-line"
      :style="tooltipStyle"
    >
      <p class="text-ink-secondary">{{ pointLabel(hovered.observedAt) }}</p>
      <p class="font-semibold tabular-nums">{{ formatEuros(hovered.priceCents) }}</p>
    </div>
  </div>
</template>
