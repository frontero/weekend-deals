<script setup>
import { computed } from 'vue';
import { useTheme } from '../composables/useTheme.js';
import { formatTimestamp } from '../lib/format.js';
import Icon from './Icon.vue';

const props = defineProps({
  scan: { type: Object, required: true },
  // Admins get a link to the admin page, and can start a round.
  admin: { type: Boolean, default: false },
});
const emit = defineEmits(['refresh']);
const { isDark, toggle: toggleTheme } = useTheme();

const progressPercent = computed(() => (props.scan.total ? Math.round((props.scan.done / props.scan.total) * 100) : 0));
const updated = computed(() => (props.scan.lastScan ? formatTimestamp(props.scan.lastScan.finishedAt) : null));
const progressLabel = computed(() =>
  ({
    facilities: 'Faciliteiten ophalen',
    accommodations: 'Huisjes ophalen',
    ratings: 'Google-scores ophalen',
    surroundings: 'Omgeving ophalen',
    weather: 'Weerbericht ophalen',
  })[
    props.scan.phase
  ] ?? 'Prijzen ophalen',
);
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
    <div class="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:gap-x-6 sm:px-6">
      <a href="/" class="flex items-center gap-2 text-lg font-black tracking-tight">
        <span class="grid size-9 -rotate-6 place-items-center rounded-full bg-sun text-on-sun shadow-sm">
          <Icon name="home" class="size-5" />
        </span>
        Parkje weg
      </a>
      <nav aria-label="Hoofdmenu" class="hidden gap-4 text-sm sm:flex">
        <a href="/weekenden" class="inline-flex min-h-6 items-center font-bold text-accent hover:underline">Weekenden</a>
        <a href="/parken" class="inline-flex min-h-6 items-center font-bold text-accent hover:underline">Parken</a>
        <a href="/last-minute" class="inline-flex min-h-6 items-center font-bold text-accent hover:underline">Last minute</a>
      </nav>

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
