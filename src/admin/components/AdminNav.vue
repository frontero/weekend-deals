<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { nextScheduledRound } from '../../../shared/schedule.mjs';
import Icon from '../../components/Icon.vue';
import { formatTimestamp } from '../../lib/format.js';
import { useAdmin } from '../useAdmin.js';

const emit = defineEmits(['navigate']);
const route = useRoute();
const { admin } = useAdmin();

const ITEMS = [
  { name: 'dashboard', to: '/beheer', label: 'Dashboard', icon: 'dashboard' },
  { name: 'parks', to: '/beheer/parken', label: 'Parken', icon: 'pin' },
  { name: 'weekends', to: '/beheer/weekenden', label: 'Weekenden', icon: 'calendar' },
  { name: 'booking', to: '/beheer/boekmoment', label: 'Boekmoment', icon: 'target' },
  { name: 'changes', to: '/beheer/wijzigingen', label: 'Prijswijzigingen', icon: 'bolt' },
  { name: 'rounds', to: '/beheer/rondes', label: 'Prijsrondes', icon: 'refresh' },
];

const items = computed(() =>
  ITEMS.map((item) => ({ ...item, active: route.name === item.name || route.meta.parent === item.name })),
);

const status = computed(() => {
  if (!admin.value) return null;
  const { scan, rounds } = admin.value;
  if (scan.running) {
    return { tone: 'bg-accent', text: scan.phase === 'requested' ? 'Ronde aangevraagd' : 'Ronde bezig' };
  }
  const next = nextScheduledRound(rounds);
  return { tone: scan.error ? 'bg-serious' : 'bg-good', text: next ? `Volgende ronde ${formatTimestamp(next)}` : 'Rondes alleen met de knop' };
});
</script>

<template>
  <nav class="flex h-full flex-col gap-6 p-4" aria-label="Beheer">
    <a href="/" class="flex items-center gap-2.5 px-2 pt-1 font-semibold tracking-tight">
      <span class="grid size-8 place-items-center rounded-lg bg-accent text-on-accent">
        <Icon name="home" class="size-5" />
      </span>
      <span class="leading-tight">
        Weekendje weg
        <span class="block text-xs font-medium text-ink-secondary">Beheer</span>
      </span>
    </a>

    <ul class="flex flex-col gap-1">
      <li v-for="item in items" :key="item.name">
        <RouterLink
          :to="item.to"
          class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition"
          :class="item.active ? 'bg-accent-wash text-accent' : 'text-ink-secondary hover:bg-hover hover:text-ink'"
          :aria-current="item.active ? 'page' : undefined"
          @click="emit('navigate')"
        >
          <Icon :name="item.icon" class="size-5" />
          {{ item.label }}
        </RouterLink>
      </li>
    </ul>

    <div class="mt-auto flex flex-col gap-3 px-2 text-sm">
      <p v-if="status" class="flex items-center gap-2 text-ink-secondary">
        <span class="size-2 shrink-0 rounded-full" :class="status.tone" aria-hidden="true" />
        {{ status.text }}
      </p>
      <a href="/" class="flex items-center gap-2 font-medium text-accent hover:underline">
        <Icon name="arrowLeft" class="size-4" />
        Naar de buitenkansjes
      </a>
    </div>
  </nav>
</template>
