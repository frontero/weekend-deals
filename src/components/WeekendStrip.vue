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
  if (from.value === '') {
    return 'Kies datums';
  }
  if (to.value === '' || to.value === from.value) {
    return `Weekend ${formatShortDate(from.value)}`;
  }
  return `${formatShortDate(from.value)} – ${formatShortDate(to.value)}`;
});
const calendarClass = computed(() => chipClass(from.value !== ''));

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
  <section aria-label="Datum en gezelschap">
    <div class="flex flex-wrap items-stretch gap-2 sm:justify-end">
      <button
        :class="calendarClass"
        type="button"
        class="inline-flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition"
        @click="emit('open-calendar')"
      >
        <Icon
          name="calendar"
          class="size-4 shrink-0"
        />
        {{ calendarLabel }}
      </button>
      <slot />
    </div>
    <div v-if="items.length > 0" class="mt-3 sm:mt-2">
      <h2 id="weekends-title" class="text-sm font-semibold sm:text-base">Richtprijs per weekend</h2>
      <p id="weekends-explanation" class="text-xs text-ink-secondary">Middelste prijs van de parken met plek, vr–ma.</p>
      <!-- Scroll padding keeps focus outlines visible when a chip snaps to the edge. -->
      <div
        aria-labelledby="weekends-title"
        aria-describedby="weekends-explanation"
        role="group"
        class="-mx-4 mt-1 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pt-1 pb-2 [scrollbar-width:thin] sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:-mx-1 lg:scroll-px-1 lg:px-1"
      >
        <button
          :class="chipClass(from === '')"
          :aria-pressed="from === ''"
          type="button"
          class="w-26 shrink-0 snap-start rounded-xl px-2.5 py-1 text-left transition sm:w-28 sm:px-3 sm:py-2"
          @click="showAll"
        >
          <span class="block text-sm leading-tight font-semibold">Alle weekenden</span>
          <span class="block text-xs text-ink-secondary">{{ weekends.length }} weken</span>
        </button>
        <button
          v-for="item in items"
          :key="item.arrival"
          :class="chipClass(item.active)"
          :aria-pressed="item.active"
          :aria-label="`Weekend ${item.day}: ${item.price}, ${item.label.toLowerCase()}`"
          type="button"
          class="w-26 shrink-0 snap-start rounded-xl px-2.5 py-1 text-left transition sm:w-28 sm:px-3 sm:py-2"
          @click="choose(item.arrival)"
        >
          <span class="block text-xs text-ink-secondary">{{ item.day }}</span>
          <span class="block text-sm font-semibold tabular-nums sm:text-base">{{ item.price }}</span>
          <span :class="item.text" class="flex items-center gap-1.5 text-xs">
            <span :class="item.dot" class="size-2 rounded-full" />
            {{ item.label }}
          </span>
        </button>
      </div>
    </div>
  </section>
</template>
