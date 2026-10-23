<script setup>
import { computed, ref, watch } from 'vue';
import { addMonths, monthGrid, pickRange, rangeDays } from '../lib/calendar.js';
import { formatShortDate } from '../lib/format.js';
import Icon from './Icon.vue';

const open = defineModel('open', { type: Boolean, required: true });
const from = defineModel('from', { type: String, required: true });
const to = defineModel('to', { type: String, required: true });
const props = defineProps({
  // Market weekends with a low/typical/high `level`, see weekendLevels().
  weekends: { type: Array, required: true },
});

const WEEKDAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const FRIDAY_COLUMN = 4;
const LEVELS = {
  low: { label: 'Goedkoop', dot: 'bg-good' },
  typical: { label: 'Gemiddeld', dot: 'bg-axis' },
  high: { label: 'Duur', dot: 'bg-serious' },
};
const monthName = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const compactEuros = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const dialog = ref(null);
const draft = ref({ from: '', to: '', complete: true });
const month = ref('');

const byArrival = computed(() => new Map(props.weekends.map((weekend) => [weekend.arrival, weekend])));
const firstMonth = computed(() => props.weekends[0]?.arrival.slice(0, 7) ?? '');
const lastMonth = computed(() => props.weekends.at(-1)?.arrival.slice(0, 7) ?? '');

watch(open, (isOpen) => {
  if (isOpen) {
    draft.value = { from: from.value, to: to.value, complete: true };
    month.value = (from.value || props.weekends[0]?.arrival || '').slice(0, 7);
    dialog.value.showModal();
  } else if (dialog.value?.open) {
    dialog.value.close();
  }
});

const selectedDays = computed(() => rangeDays(draft.value.from, draft.value.to));

function cell(day) {
  const weekend = byArrival.value.get(day.date);
  const isEnd = day.date === draft.value.from || day.date === draft.value.to;
  return {
    ...day,
    weekend,
    level: weekend ? LEVELS[weekend.level] : null,
    price: weekend ? compactEuros.format(Math.round(weekend.medianCents / 100)) : '',
    isEnd: Boolean(weekend) && isEnd,
    inRange: selectedDays.value.has(day.date),
  };
}

const months = computed(() =>
  month.value
    ? [month.value, addMonths(month.value, 1)].map((key) => ({
        key,
        title: monthName.format(new Date(`${key}-01T00:00:00Z`)),
        weeks: monthGrid(key).map((week) => week.map(cell)),
      }))
    : [],
);

const chosenWeekends = computed(() =>
  props.weekends.filter(
    (weekend) => draft.value.from && weekend.arrival >= draft.value.from && weekend.arrival <= draft.value.to,
  ),
);
const summary = computed(() => {
  if (!draft.value.from) return 'Kies een vrijdag om te beginnen.';
  if (!draft.value.complete) return `Vanaf ${formatShortDate(draft.value.from)}: kies nog een vrijdag, of toon dit weekend.`;
  const count = chosenWeekends.value.length;
  return draft.value.from === draft.value.to
    ? `Weekend van ${formatShortDate(draft.value.from)}`
    : `${formatShortDate(draft.value.from)} – ${formatShortDate(draft.value.to)} · ${count} ${count === 1 ? 'weekend' : 'weekenden'}`;
});

const pick = (date) => {
  draft.value = pickRange(draft.value, date);
};
function apply() {
  from.value = draft.value.from;
  to.value = draft.value.from ? draft.value.to : '';
  open.value = false;
}
function clear() {
  draft.value = { from: '', to: '', complete: true };
}

const dayClass = (day) => {
  if (day.isEnd) return 'bg-accent text-on-accent';
  if (day.inRange) return 'bg-accent-wash';
  return '';
};
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto max-h-[92dvh] w-[min(46rem,calc(100vw-1rem))] overflow-hidden rounded-2xl bg-surface p-0 text-ink shadow-2xl"
    aria-labelledby="dates-title"
    @close="open = false"
  >
    <div class="flex max-h-[92dvh] flex-col">
      <header class="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <h2 id="dates-title" class="text-lg font-semibold">Wanneer wil je weg?</h2>
          <p class="text-sm text-ink-secondary">
            Klik een vrijdag voor één weekend, of twee vrijdagen voor een periode. Onder elke vrijdag: de middelste prijs.
          </p>
        </div>
        <button type="button" class="rounded-full p-2 hover:bg-hover" aria-label="Sluiten" @click="open = false">
          <Icon name="x" class="size-5" />
        </button>
      </header>

      <div class="flex-1 overflow-y-auto px-3 py-4 sm:px-5">
        <div class="mb-3 flex items-center justify-between">
          <button
            type="button"
            class="grid size-9 place-items-center rounded-full ring-1 ring-line hover:bg-hover disabled:opacity-30"
            :disabled="month <= firstMonth"
            aria-label="Vorige maand"
            @click="month = addMonths(month, -1)"
          >
            <Icon name="chevronDown" class="size-4 rotate-90" />
          </button>
          <div class="flex gap-4 text-xs text-ink-secondary">
            <span v-for="level in LEVELS" :key="level.label" class="flex items-center gap-1.5">
              <span class="size-2 rounded-full" :class="level.dot" />
              {{ level.label }}
            </span>
          </div>
          <button
            type="button"
            class="grid size-9 place-items-center rounded-full ring-1 ring-line hover:bg-hover disabled:opacity-30"
            :disabled="month >= lastMonth"
            aria-label="Volgende maand"
            @click="month = addMonths(month, 1)"
          >
            <Icon name="chevronDown" class="size-4 -rotate-90" />
          </button>
        </div>

        <div class="grid gap-6 sm:grid-cols-2">
          <section v-for="(item, index) in months" :key="item.key" :class="index ? 'hidden sm:block' : ''">
            <h3 class="mb-2 text-center font-semibold capitalize">{{ item.title }}</h3>
            <div class="grid grid-cols-7 text-center text-xs text-ink-muted">
              <span v-for="(weekday, column) in WEEKDAYS" :key="weekday" class="py-1" :class="column === FRIDAY_COLUMN ? 'font-semibold text-ink' : ''">
                {{ weekday }}
              </span>
            </div>
            <div v-for="week in item.weeks" :key="week[0].date" class="grid grid-cols-7">
              <template v-for="day in week" :key="day.date">
                <span v-if="!day.inMonth" />
                <button
                  v-else-if="day.weekend"
                  type="button"
                  class="m-0.5 flex h-14 flex-col items-center justify-center rounded-lg ring-1 ring-line transition hover:ring-accent"
                  :class="dayClass(day)"
                  :aria-pressed="day.isEnd"
                  :aria-label="`Weekend vanaf ${formatShortDate(day.date)}, ${day.price}, ${day.level.label.toLowerCase()}`"
                  @click="pick(day.date)"
                >
                  <span class="text-sm font-semibold">{{ day.day }}</span>
                  <span class="text-[10px] leading-tight tabular-nums" :class="day.isEnd ? '' : 'text-ink-secondary'">
                    {{ day.price }}
                  </span>
                  <span class="mt-0.5 size-1.5 rounded-full" :class="day.level.dot" />
                </button>
                <span
                  v-else
                  class="m-0.5 grid h-14 place-items-center rounded-lg text-sm text-ink-muted"
                  :class="day.inRange ? 'bg-accent-wash text-ink' : ''"
                >
                  {{ day.day }}
                </span>
              </template>
            </div>
          </section>
        </div>
      </div>

      <footer class="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
        <p class="min-w-0 basis-full text-sm font-medium sm:basis-0 sm:flex-1" aria-live="polite">{{ summary }}</p>
        <button type="button" class="ml-auto rounded-lg px-4 py-2 font-medium hover:bg-hover sm:ml-0" @click="clear">
          Wis datums
        </button>
        <button
          type="button"
          class="rounded-lg bg-accent px-4 py-2 font-semibold text-on-accent hover:bg-accent-hover"
          @click="apply"
        >
          {{ draft.from ? 'Toon weekenden' : 'Alle weekenden' }}
        </button>
      </footer>
    </div>
  </dialog>
</template>
