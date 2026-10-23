<script setup>
import { computed } from 'vue';
import { formatDay, formatEuros, formatShortDate } from '../lib/format.js';
import Icon from './Icon.vue';

// The chosen period as arrival dates; empty means all weekends.
const from = defineModel('from', { type: String, required: true });
const to = defineModel('to', { type: String, required: true });
const props = defineProps({
  // Market weekends with a low/typical/high `level`, see weekendLevels().
  weekends: { type: Array, required: true },
  parkCount: { type: Number, required: true },
});
const emit = defineEmits(['open-calendar']);

const LEVELS = {
  low: { label: 'Goedkoop', dot: 'bg-good', text: 'text-good-ink font-medium' },
  typical: { label: 'Gemiddeld', dot: 'bg-axis', text: 'text-ink-secondary' },
  high: { label: 'Duur', dot: 'bg-serious', text: 'text-ink-secondary' },
};

const inPeriod = (arrival) => Boolean(from.value) && arrival >= from.value && arrival <= (to.value || from.value);

const items = computed(() =>
  props.weekends.map((weekend) => ({
    ...weekend,
    day: formatDay(weekend.arrival),
    price: formatEuros(weekend.medianCents),
    active: inPeriod(weekend.arrival),
    ...LEVELS[weekend.level],
  })),
);

const calendarLabel = computed(() => {
  if (!from.value) return 'Kies datums';
  if (!to.value || to.value === from.value) return `Weekend ${formatShortDate(from.value)}`;
  return `${formatShortDate(from.value)} – ${formatShortDate(to.value)}`;
});

function choose(arrival) {
  const onlyThis = from.value === arrival && (to.value || from.value) === arrival;
  from.value = onlyThis ? '' : arrival;
  to.value = onlyThis ? '' : arrival;
}
function showAll() {
  from.value = '';
  to.value = '';
}
const chipClass = (active) =>
  active ? 'bg-accent-wash ring-2 ring-accent' : 'bg-surface ring-1 ring-line hover:ring-field';
</script>

<template>
  <section aria-labelledby="weekends-title">
    <div class="mb-2 flex items-end justify-between gap-3">
      <div>
        <h2 id="weekends-title" class="font-semibold">Wanneer is het goedkoop?</h2>
        <p class="hidden text-xs text-ink-secondary sm:block">Middelste prijs over {{ parkCount }} parken, vr–ma</p>
      </div>
      <button
        type="button"
        class="inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition"
        :class="from ? 'bg-accent-wash ring-2 ring-accent' : 'bg-surface ring-1 ring-line hover:ring-field'"
        @click="emit('open-calendar')"
      >
        <Icon name="calendar" class="size-4" />
        {{ calendarLabel }}
      </button>
    </div>
    <!-- The padding leaves room for the selected ring and the focus outline; the scroll padding makes snapping
         keep that room, instead of pulling a chip against the edge where its ring gets cut off. -->
    <div
      class="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pt-1 pb-2 [scrollbar-width:thin] sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:-mx-1 lg:scroll-px-1 lg:px-1"
    >
      <button
        type="button"
        class="w-28 shrink-0 snap-start rounded-xl px-3 py-2 text-left transition"
        :class="chipClass(!from)"
        :aria-pressed="!from"
        @click="showAll"
      >
        <span class="block text-xs text-ink-secondary">Alle</span>
        <span class="block text-base font-semibold">weekenden</span>
        <span class="block text-xs text-ink-secondary">{{ weekends.length }} weken</span>
      </button>
      <button
        v-for="item in items"
        :key="item.arrival"
        type="button"
        class="w-28 shrink-0 snap-start rounded-xl px-3 py-2 text-left transition"
        :class="chipClass(item.active)"
        :aria-pressed="item.active"
        :aria-label="`Weekend ${item.day}: ${item.price}, ${item.label.toLowerCase()}`"
        @click="choose(item.arrival)"
      >
        <span class="block text-xs text-ink-secondary">{{ item.day }}</span>
        <span class="block text-base font-semibold tabular-nums">{{ item.price }}</span>
        <span class="flex items-center gap-1.5 text-xs" :class="item.text">
          <span class="size-2 rounded-full" :class="item.dot" />
          {{ item.label }}
        </span>
      </button>
    </div>
  </section>
</template>
