<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { formatEuros } from '../lib/format.js';

/**
 * Column chart of prices in cents. Each column: { key, tick, title, valueCents, highlight, label, note }.
 * Highlighted columns are drawn in the "good" status color and carry their label above the bar.
 */
const props = defineProps({
  columns: { type: Array, required: true },
  caption: { type: String, required: true },
  referenceCents: { type: Number, default: null },
  referenceLabel: { type: String, default: '' },
  height: { type: Number, default: 220 },
  // Key of a column to mark with a band behind it.
  selectedKey: { type: String, default: '' },
});
const emit = defineEmits(['select']);

// The right margin holds the reference line's end label.
const MARGIN = { top: 26, right: 96, bottom: 26, left: 48 };
const MAX_BAR_WIDTH = 24;
const MIN_TICK_SPACING = 46;
const TARGET_TICKS = 4;

const container = ref(null);
const width = ref(0);
const hoveredIndex = ref(null);
let observer = null;

// Escape hides the tooltip first, without also closing the panel around the chart.
function hideOnEscape(event) {
  if (event.key !== 'Escape' || hoveredIndex.value === null) return;
  hoveredIndex.value = null;
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

function niceStep(max) {
  const raw = max / TARGET_TICKS;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const residual = raw / magnitude;
  return (residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1) * magnitude;
}

const plotWidth = computed(() => Math.max(0, width.value - MARGIN.left - MARGIN.right));
const plotHeight = computed(() => props.height - MARGIN.top - MARGIN.bottom);
const baselineY = computed(() => MARGIN.top + plotHeight.value);
const slotWidth = computed(() => (props.columns.length ? plotWidth.value / props.columns.length : 0));
const barWidth = computed(() => Math.min(MAX_BAR_WIDTH, slotWidth.value * 0.6));
const tickEvery = computed(() => Math.max(1, Math.ceil(MIN_TICK_SPACING / (slotWidth.value || 1))));

const scale = computed(() => {
  const maxEuros = Math.max(1, ...props.columns.map((column) => column.valueCents / 100), (props.referenceCents ?? 0) / 100);
  const step = niceStep(maxEuros);
  const top = Math.ceil(maxEuros / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step);
  return { top, ticks };
});

const yFor = (cents) => MARGIN.top + plotHeight.value * (1 - cents / 100 / scale.value.top);

function barPath(x, y, barW, barH) {
  const radius = Math.min(4, barW / 2, barH);
  return `M${x},${y + barH} V${y + radius} Q${x},${y} ${x + radius},${y} H${x + barW - radius} Q${x + barW},${y} ${x + barW},${y + radius} V${y + barH} Z`;
}

const bars = computed(() =>
  props.columns.map((column, index) => {
    const center = MARGIN.left + slotWidth.value * (index + 0.5);
    const top = yFor(column.valueCents);
    return {
      ...column,
      center,
      top,
      slotX: MARGIN.left + slotWidth.value * index,
      path: barPath(center - barWidth.value / 2, top, barWidth.value, baselineY.value - top),
      showTick: index % tickEvery.value === 0,
    };
  }),
);

const selectedBar = computed(() => bars.value.find((bar) => bar.key === props.selectedKey) ?? null);
const labelledBars = computed(() => bars.value.filter((bar) => bar.highlight && bar.label));
const tickedBars = computed(() => bars.value.filter((bar) => bar.showTick));
const gridLines = computed(() => scale.value.ticks.map((euros) => ({ euros, y: yFor(euros * 100) })));
const referenceY = computed(() => (props.referenceCents ? yFor(props.referenceCents) : null));
const hovered = computed(() => (hoveredIndex.value === null ? null : bars.value[hoveredIndex.value]));
const tooltipStyle = computed(() => {
  const bar = hovered.value;
  if (!bar) return {};
  const left = Math.min(Math.max(bar.center, 90), width.value - 90);
  return { left: `${left}px`, top: `${bar.top - 10}px` };
});
</script>

<template>
  <!-- The tooltip stays while the pointer is anywhere on the chart, so it can be moved onto. -->
  <div ref="container" class="relative w-full select-none" @mouseleave="hoveredIndex = null">
    <svg v-if="width" :width="width" :height="height" class="block overflow-visible" aria-hidden="true">
      <g>
        <line
          v-for="line in gridLines"
          :key="line.euros"
          :x1="MARGIN.left"
          :x2="width - MARGIN.right"
          :y1="line.y"
          :y2="line.y"
          :class="line.euros === 0 ? 'stroke-axis' : 'stroke-line'"
          stroke-width="1"
          shape-rendering="crispEdges"
        />
        <text
          v-for="line in gridLines"
          :key="`tick-${line.euros}`"
          :x="MARGIN.left - 8"
          :y="line.y"
          text-anchor="end"
          dominant-baseline="middle"
          class="fill-ink-muted text-[11px] tabular-nums"
        >
          €{{ line.euros }}
        </text>
      </g>

      <rect
        v-if="selectedBar"
        :x="selectedBar.slotX + 1"
        :y="MARGIN.top - 20"
        :width="Math.max(0, slotWidth - 2)"
        :height="plotHeight + 20"
        rx="6"
        class="fill-accent-wash"
      />

      <g>
        <path
          v-for="(bar, index) in bars"
          :key="bar.key"
          :d="bar.path"
          :class="[bar.highlight ? 'fill-good' : 'fill-series', hoveredIndex === index ? 'opacity-80' : '']"
        />
        <text
          v-for="bar in labelledBars"
          :key="`label-${bar.key}`"
          :x="bar.center"
          :y="bar.top - 6"
          text-anchor="middle"
          class="fill-ink-secondary text-[11px] font-semibold"
        >
          {{ bar.label }}
        </text>
        <text
          v-for="bar in tickedBars"
          :key="`x-${bar.key}`"
          :x="bar.center"
          :y="baselineY + 17"
          text-anchor="middle"
          class="fill-ink-muted text-[11px]"
        >
          {{ bar.tick }}
        </text>
      </g>

      <g v-if="referenceY !== null">
        <line
          :x1="MARGIN.left"
          :x2="width - MARGIN.right"
          :y1="referenceY"
          :y2="referenceY"
          class="stroke-ink-secondary"
          stroke-width="1"
          shape-rendering="crispEdges"
        />
        <text
          :x="width - MARGIN.right + 6"
          :y="referenceY"
          dominant-baseline="middle"
          class="fill-ink-secondary text-[11px] font-medium"
        >
          {{ referenceLabel }}
        </text>
      </g>
    </svg>

    <!-- Hit targets span the full column slot so thin bars stay easy to hover. -->
    <button
      v-for="(bar, index) in bars"
      :key="`hit-${bar.key}`"
      type="button"
      class="absolute cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-accent"
      :style="{ left: `${bar.slotX}px`, top: `${MARGIN.top}px`, width: `${slotWidth}px`, height: `${plotHeight}px` }"
      :aria-label="`${bar.title}: ${formatEuros(bar.valueCents)}${bar.note ? `, ${bar.note}` : ''}`"
      @mouseenter="hoveredIndex = index"
      @focus="hoveredIndex = index"
      @blur="hoveredIndex = null"
      @click="emit('select', bar)"
    />

    <div
      v-if="hovered"
      class="absolute z-10 w-max max-w-44 -translate-x-1/2 -translate-y-full rounded-lg bg-surface px-3 py-2 text-xs shadow-lg ring-1 ring-line"
      :style="tooltipStyle"
    >
      <p class="font-medium text-ink-secondary">{{ hovered.title }}</p>
      <p class="text-base font-semibold text-ink">{{ formatEuros(hovered.valueCents) }}</p>
      <p v-if="hovered.note" class="text-ink-secondary">{{ hovered.note }}</p>
    </div>

    <table class="sr-only">
      <caption>{{ caption }}</caption>
      <tbody>
        <tr v-for="column in columns" :key="`row-${column.key}`">
          <th scope="row">{{ column.title }}</th>
          <td>{{ formatEuros(column.valueCents) }}</td>
          <td>{{ column.note }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
