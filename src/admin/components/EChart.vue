<script setup>
import { BarChart, HeatmapChart, LineChart, ScatterChart } from 'echarts/charts';
import {
  DataZoomInsideComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapContinuousComponent,
} from 'echarts/components';
import { registerLocale, use } from 'echarts/core';
import langNL from 'echarts/i18n/langNL-obj.js';
import { CanvasRenderer } from 'echarts/renderers';
import VChart from 'vue-echarts';

// Only the chart kinds the admin pages use, so the bundle stays small; Dutch month and day names on time axes.
use([
  CanvasRenderer,
  BarChart,
  HeatmapChart,
  LineChart,
  ScatterChart,
  DataZoomInsideComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapContinuousComponent,
]);
registerLocale('NL', langNL);

const INIT_OPTIONS = { locale: 'NL' };

defineProps({
  option: { type: Object, required: true },
  // Includes the axis labels, so the card never scrolls inside.
  height: { type: String, default: '18rem' },
  // What the chart shows, for screen readers; the card's table has the values.
  label: { type: String, required: true },
});
const emit = defineEmits(['select']);
</script>

<template>
  <div role="img" :aria-label="label">
    <VChart
      :option="option"
      :init-options="INIT_OPTIONS"
      :style="{ height }"
      autoresize
      @click="(event) => emit('select', event)"
    />
  </div>
</template>
