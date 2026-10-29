<script setup>
import { computed } from 'vue';
import { useTheme } from '../composables/useTheme.js';
import { formatTimestamp } from '../lib/format.js';
import { describeAccommodation } from '../lib/stay.js';
import Icon from './Icon.vue';

const props = defineProps({
  settings: { type: Object, required: true },
  scan: { type: Object, required: true },
  accommodationGroups: { type: Array, required: true },
  // Admins get a link to the admin page, and can start a round.
  admin: { type: Boolean, default: false },
});
const emit = defineEmits(['open-settings', 'refresh']);
const { isDark, toggle: toggleTheme } = useTheme();

const party = computed(() => {
  const { adults, children, pets } = props.settings;
  return [
    `${adults} volw.`,
    children ? `${children} ${children === 1 ? 'kind' : 'kind.'}` : null,
    pets ? `${pets} ${pets === 1 ? 'huisdier' : 'huisdieren'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
});
const accommodation = computed(
  () => describeAccommodation(props.settings.accommodationFeatures, props.accommodationGroups).join(', ') || 'Elk huisje',
);
const progressPercent = computed(() => (props.scan.total ? Math.round((props.scan.done / props.scan.total) * 100) : 0));
const updated = computed(() => (props.scan.lastScan ? formatTimestamp(props.scan.lastScan.finishedAt) : null));
const progressLabel = computed(() =>
  ({
    facilities: 'Faciliteiten ophalen',
    accommodations: 'Huisjes ophalen',
    ratings: 'Google-scores ophalen',
    surroundings: 'Omgeving ophalen',
  })[
    props.scan.phase
  ] ?? 'Prijzen ophalen',
);
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
    <div class="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
      <a href="/" class="flex items-center gap-2 font-semibold tracking-tight">
        <span class="grid size-8 place-items-center rounded-lg bg-accent text-on-accent">
          <Icon name="home" class="size-5" />
        </span>
        Weekendje weg
      </a>

      <button
        type="button"
        class="order-last flex w-full min-w-0 items-center gap-3 rounded-full bg-surface px-4 py-2 text-left text-sm shadow-sm ring-1 ring-line transition hover:shadow-md hover:ring-field sm:order-none sm:w-auto sm:max-w-xl sm:flex-1"
        aria-label="Gezelschap en huisje wijzigen"
        @click="emit('open-settings')"
      >
        <Icon name="users" class="size-4 text-ink-secondary" />
        <span class="font-medium whitespace-nowrap">{{ party }}</span>
        <span class="h-4 w-px bg-line" />
        <Icon name="home" class="size-4 text-ink-secondary" />
        <span class="min-w-0 flex-1 truncate">{{ accommodation }}</span>
        <span class="hidden font-medium text-accent sm:inline">Wijzig</span>
      </button>

      <div class="ml-auto flex items-center gap-2 text-sm">
        <span v-if="scan.running" class="text-ink-secondary" aria-live="polite">
          {{ progressLabel }}… {{ progressPercent }}%
        </span>
        <span v-else-if="updated" class="hidden text-ink-secondary md:inline">Bijgewerkt {{ updated }}</span>
        <a
          v-if="admin"
          href="/beheer"
          class="grid size-9 place-items-center rounded-full ring-1 ring-line transition hover:bg-hover"
          title="Beheer"
          aria-label="Beheer"
        >
          <Icon name="clock" class="size-4" />
        </a>
        <button
          v-if="admin"
          type="button"
          class="grid size-9 place-items-center rounded-full ring-1 ring-line transition hover:bg-hover disabled:opacity-60"
          :disabled="scan.running"
          :title="scan.running ? 'Bezig met ophalen' : 'Prijzen nu ophalen'"
          :aria-label="scan.running ? 'Bezig met ophalen' : 'Prijzen nu ophalen'"
          @click="emit('refresh')"
        >
          <Icon name="refresh" class="size-4" :class="scan.running ? 'animate-spin [animation-direction:reverse]' : ''" />
        </button>
        <button
          type="button"
          class="grid size-9 place-items-center rounded-full ring-1 ring-line transition hover:bg-hover"
          title="Donkere weergave"
          aria-label="Donkere weergave"
          :aria-pressed="isDark"
          @click="toggleTheme"
        >
          <Icon :name="isDark ? 'sun' : 'moon'" class="size-4" />
        </button>
      </div>
    </div>
    <div v-if="scan.running" class="h-0.5 bg-line">
      <div class="h-full bg-accent transition-all duration-500" :style="{ width: `${progressPercent}%` }" />
    </div>
  </header>
</template>
